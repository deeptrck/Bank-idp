"""Direct text extraction from Word (.docx) documents.

Bypasses Textract entirely — DOCX is already structured digital text so OCR
is unnecessary.  Produces output formatted consistently with textract_extract.py
so the LLM receives the same style of input regardless of file type.
"""

from __future__ import annotations

import io

try:
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "python-docx is required for DOCX extraction. "
        "Install it with: pip install python-docx"
    ) from exc


def _table_to_text(table: Table) -> str:
    """Render a docx Table as pipe-delimited rows."""
    rows: list[str] = []
    for row in table.rows:
        cells = [cell.text.strip() for cell in row.cells]
        # De-duplicate merged cells (python-docx repeats merged cell text)
        deduped: list[str] = []
        prev = object()
        for cell in cells:
            if cell != prev:
                deduped.append(cell)
                prev = cell
        rows.append(" | ".join(deduped))
    return "\n".join(rows)


def extract_text_from_docx(docx_bytes: bytes) -> str:
    """Extract all text from a DOCX file and return it as a structured string.

    Iterates the document body in order, rendering paragraphs as plain text
    and tables as pipe-delimited grids — matching the textract_extract.py
    output style so the LLM prompt stays consistent.

    Parameters
    ----------
    docx_bytes:
        Raw bytes of a .docx file.

    Returns
    -------
    str
        Structured text with a ``--- Page 1 ---`` header (DOCX files have no
        page boundaries, so a single section header is used for consistency).

    Raises
    ------
    RuntimeError
        If the bytes cannot be opened as a valid DOCX document.
    """
    try:
        doc = Document(io.BytesIO(docx_bytes))
    except Exception as exc:
        raise RuntimeError(f"Failed to open DOCX document: {exc}") from exc

    parts: list[str] = ["--- Page 1 ---"]

    # Walk body elements in document order (preserves paragraph / table interleaving)
    for block in doc.element.body:
        tag = block.tag.split("}")[-1] if "}" in block.tag else block.tag

        if tag == "p":
            para = Paragraph(block, doc)
            text = para.text.strip()
            if text:
                parts.append(text)

        elif tag == "tbl":
            table = Table(block, doc)
            table_text = _table_to_text(table)
            if table_text.strip():
                parts.append("Table:")
                parts.append(table_text)

    return "\n".join(parts)
