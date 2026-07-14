"""AWS Textract sync OCR for multi-page PDFs (Vercel serverless compatible)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import boto3
import fitz
from botocore.exceptions import BotoCoreError, ClientError

MAX_IMAGE_BYTES = 5 * 1024 * 1024
DEFAULT_DPI = 200
RETRY_DPI = 150


def _get_textract_client():
    """Return a Textract client using credentials from environment variables."""
    required = ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_DEFAULT_REGION")
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise RuntimeError(
            f"Missing required AWS environment variables: {', '.join(missing)}"
        )
    return boto3.client("textract", region_name=os.environ["AWS_DEFAULT_REGION"])


def _render_page_png(doc: fitz.Document, page_index: int, dpi: int) -> bytes:
    """Render a single PDF page to PNG bytes at the given DPI."""
    page = doc[page_index]
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
    return pixmap.tobytes("png")


def split_pdf_to_images(pdf_bytes: bytes) -> list[bytes]:
    """Convert each PDF page to PNG bytes suitable for Textract sync OCR."""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise RuntimeError(f"Failed to open PDF: {exc}") from exc

    if doc.page_count == 0:
        doc.close()
        raise RuntimeError("PDF contains no pages")

    images: list[bytes] = []
    try:
        for page_index in range(doc.page_count):
            page_number = page_index + 1
            image_bytes = _render_page_png(doc, page_index, DEFAULT_DPI)

            if len(image_bytes) > MAX_IMAGE_BYTES:
                image_bytes = _render_page_png(doc, page_index, RETRY_DPI)

            if len(image_bytes) > MAX_IMAGE_BYTES:
                size_mb = len(image_bytes) / (1024 * 1024)
                raise RuntimeError(
                    f"Page {page_number} image exceeds Textract 5MB limit "
                    f"({size_mb:.1f}MB) even at {RETRY_DPI} DPI"
                )

            images.append(image_bytes)
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(
            f"Failed to render page {page_index + 1} to image: {exc}"
        ) from exc
    finally:
        doc.close()

    return images


def ocr_page(image_bytes: bytes) -> dict:
    """Run synchronous Textract form/table analysis on a single page image."""
    textract = _get_textract_client()
    try:
        response = textract.analyze_document(
            Document={"Bytes": image_bytes},
            FeatureTypes=["FORMS", "TABLES"],
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        message = exc.response.get("Error", {}).get("Message", str(exc))
        if code in ("AccessDeniedException", "UnauthorizedOperation"):
            raise RuntimeError(f"Textract access denied: {message}") from exc
        if code == "InvalidParameterException":
            raise RuntimeError(f"Textract rejected image: {message}") from exc
        raise RuntimeError(f"Textract call failed: {message}") from exc
    except BotoCoreError as exc:
        raise RuntimeError(f"AWS error calling Textract: {exc}") from exc

    return response


def _build_block_map(blocks: list[dict]) -> dict[str, dict]:
    """Build an Id -> Block lookup map for relationship resolution."""
    return {block["Id"]: block for block in blocks if block.get("Id")}


def _get_related_ids(block: dict, relationship_type: str) -> list[str]:
    """Return block Ids linked via a Relationship of the given type."""
    for relationship in block.get("Relationships", []) or []:
        if relationship.get("Type") == relationship_type:
            return relationship.get("Ids", [])
    return []


def _get_text_from_block(block: dict, block_map: dict[str, dict]) -> str:
    """Resolve text by following CHILD links to WORD blocks."""
    parts: list[str] = []
    for child_id in _get_related_ids(block, "CHILD"):
        child = block_map.get(child_id)
        if not child:
            continue
        block_type = child.get("BlockType")
        if block_type == "WORD" and child.get("Text"):
            parts.append(child["Text"])
        elif block_type == "SELECTION_ELEMENT":
            if child.get("SelectionStatus") == "SELECTED":
                parts.append("[X]")
            else:
                parts.append("[ ]")
    return " ".join(parts).strip()


def boxes_overlap(box_a: dict, box_b: dict, threshold: float = 0.3) -> bool:
    """Return True if two BoundingBoxes overlap by at least `threshold` of the smaller area."""
    left_a, top_a = box_a["Left"], box_a["Top"]
    right_a, bottom_a = left_a + box_a["Width"], top_a + box_a["Height"]
    left_b, top_b = box_b["Left"], box_b["Top"]
    right_b, bottom_b = left_b + box_b["Width"], top_b + box_b["Height"]

    intersect_left = max(left_a, left_b)
    intersect_top = max(top_a, top_b)
    intersect_right = min(right_a, right_b)
    intersect_bottom = min(bottom_a, bottom_b)

    if intersect_right <= intersect_left or intersect_bottom <= intersect_top:
        return False

    intersection_area = (intersect_right - intersect_left) * (intersect_bottom - intersect_top)
    area_a = box_a["Width"] * box_a["Height"]
    area_b = box_b["Width"] * box_b["Height"]
    smaller_area = min(area_a, area_b)

    if smaller_area <= 0:
        return False

    return (intersection_area / smaller_area) >= threshold


def parse_form_fields(response: dict) -> dict[str, str]:
    """Extract key-value pairs from Textract FORMS analysis.

    Textract KEY_VALUE_SET relationship structure:
    - KEY blocks (EntityTypes contains "KEY"):
        CHILD -> WORD block ids that form the label text
        VALUE -> id of the paired VALUE block (not the text itself)
    - VALUE blocks (EntityTypes contains "VALUE"):
        CHILD -> WORD block ids that form the field value text
    Keys and values are separate blocks linked by Id; text lives in WORD children.

    FORMS and TABLES detectors can both fire on the same tabular region. TABLES
    output is more reliable for grid data, so key-value pairs whose KEY box
    overlaps a TABLE region are discarded to avoid duplicates and corrupted merges.
    """
    blocks = response.get("Blocks", [])
    block_map = _build_block_map(blocks)
    fields: dict[str, str] = {}

    table_boxes = [
        block["Geometry"]["BoundingBox"]
        for block in blocks
        if block.get("BlockType") == "TABLE"
        and block.get("Geometry", {}).get("BoundingBox")
    ]

    for block in blocks:
        if block.get("BlockType") != "KEY_VALUE_SET":
            continue
        if "KEY" not in block.get("EntityTypes", []):
            continue

        key_box = block.get("Geometry", {}).get("BoundingBox")
        if key_box and any(boxes_overlap(key_box, table_box) for table_box in table_boxes):
            continue

        key_text = _get_text_from_block(block, block_map)
        if not key_text:
            continue

        value_text = ""
        value_ids = _get_related_ids(block, "VALUE")
        if value_ids:
            value_block = block_map.get(value_ids[0])
            if value_block:
                value_text = _get_text_from_block(value_block, block_map)

        fields[key_text] = value_text

    return fields


def parse_tables(response: dict) -> list[list[list[str]]]:
    """Extract tables as 2D grids from Textract TABLES analysis.

    Textract TABLE relationship structure:
    - TABLE blocks: CHILD -> CELL block ids
    - CELL blocks: RowIndex/ColumnIndex place the cell in the grid;
      CHILD -> WORD block ids that form the cell text
    """
    blocks = response.get("Blocks", [])
    block_map = _build_block_map(blocks)
    tables: list[list[list[str]]] = []

    for block in blocks:
        if block.get("BlockType") != "TABLE":
            continue

        cells = [
            block_map[cell_id]
            for cell_id in _get_related_ids(block, "CHILD")
            if cell_id in block_map and block_map[cell_id].get("BlockType") == "CELL"
        ]

        if not cells:
            tables.append([])
            continue

        max_row = max(cell.get("RowIndex", 1) for cell in cells)
        max_col = max(cell.get("ColumnIndex", 1) for cell in cells)
        grid = [["" for _ in range(max_col)] for _ in range(max_row)]

        for cell in cells:
            row_idx = cell.get("RowIndex", 1) - 1
            col_idx = cell.get("ColumnIndex", 1) - 1
            grid[row_idx][col_idx] = _get_text_from_block(cell, block_map)

        tables.append(grid)

    return tables


def _lines_from_blocks(blocks: list[dict]) -> str:
    """Extract LINE blocks from Textract output in reading order."""
    lines = [
        block
        for block in blocks
        if block.get("BlockType") == "LINE" and block.get("Text")
    ]
    lines.sort(
        key=lambda block: (
            block.get("Page", 1),
            block["Geometry"]["BoundingBox"]["Top"],
            block["Geometry"]["BoundingBox"]["Left"],
        )
    )
    return "\n".join(block["Text"] for block in lines)


def _format_page_text(page_number: int, response: dict) -> str:
    """Build readable text for one page using forms, tables, or LINE fallback."""
    blocks = response.get("Blocks", [])
    has_forms = any(block.get("BlockType") == "KEY_VALUE_SET" for block in blocks)
    has_tables = any(block.get("BlockType") == "TABLE" for block in blocks)

    if not has_forms and not has_tables:
        return f"--- Page {page_number} ---\n{_lines_from_blocks(blocks)}"

    parts = [f"--- Page {page_number} ---"]

    fields = parse_form_fields(response)
    if fields:
        parts.append("Fields:")
        for key, value in fields.items():
            parts.append(f"{key}: {value}")

    tables = parse_tables(response)
    for table in tables:
        parts.append("Table:")
        for row in table:
            parts.append(" | ".join(row))

    return "\n".join(parts)


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """OCR every page of a PDF and return structured text with page separators."""
    try:
        page_images = split_pdf_to_images(pdf_bytes)
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"Failed to split PDF into images: {exc}") from exc

    page_texts: list[str] = []
    for page_number, image_bytes in enumerate(page_images, start=1):
        try:
            response = ocr_page(image_bytes)
        except RuntimeError as exc:
            raise RuntimeError(f"Textract call failed on page {page_number}: {exc}") from exc
        except Exception as exc:
            raise RuntimeError(
                f"Unexpected error during OCR on page {page_number}: {exc}"
            ) from exc

        page_texts.append(_format_page_text(page_number, response))

    return "\n\n".join(page_texts)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(
            "Usage: python textract_extract.py <local_pdf_path>",
            file=sys.stderr,
        )
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    if not pdf_path.is_file():
        print(f"Error: file not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    try:
        text = extract_text_from_pdf(pdf_path.read_bytes())
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)

    print(text)
