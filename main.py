"""End-to-end document processing pipeline.

Usage
-----
    python main.py <path/to/document.pdf|.docx> [category]

Arguments
---------
    doc_path   Local path to a PDF or DOCX file to process.
    category   Optional document category (default: "financial").
               Must match a key in document_schema.DOCUMENT_SCHEMAS.

Extraction routing
------------------
    .pdf   → AWS Textract OCR (sync, page-by-page)
    .docx  → python-docx direct text extraction (no Textract / no S3 needed)

Language routing (post-extraction)
-----------------------------------
    English          → llama-3.3-70b-versatile  (default Groq model)
    Any other lang   → allam-2-7b-instruct       (multilingual Groq model)

Exit codes
----------
    0  — document passed all validation rules
    1  — document was escalated (violations found, OCR empty, or any error)
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Ensure standard output and error use UTF-8 on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from dotenv import load_dotenv

# Load .env early so AWS and Groq credentials are available.
load_dotenv()

# Model used for non-English documents (accessible via GROQ_API_KEY)
_MULTILINGUAL_MODEL = "openai/gpt-oss-120b"

# Supported file extensions
_SUPPORTED_EXTENSIONS = {".pdf", ".docx"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _print_result(result: dict) -> None:
    """Print the pipeline result in a consistent human-readable format."""
    print(f"Status    : {result['status'].upper()}")
    print(f"Score     : {result['score']:.2f}")
    if model := result.get("model_used"):
        print(f"Model     : {model}")
    print("Data      :")
    if result["data"]:
        for field, value in result["data"].items():
            print(f"  {field}: {value}")
    else:
        print("  (none)")
    print("Violations:")
    if result["violations"]:
        for v in result["violations"]:
            print(f"  - {v}")
    else:
        print("  (none)")


def _empty_escalation(message: str) -> dict:
    """Build a synthetic escalated result without calling the LLM."""
    return {
        "status": "escalated",
        "score": 0.0,
        "data": {},
        "violations": [message],
        "model_used": "none",
    }


def _write_json_output(result: dict, doc_path: Path, category: str) -> Path:
    """Write the pipeline result to a JSON file next to the input document.

    Output filename: ``<stem>_result.json`` in the same directory.
    Also records ``source_file``, ``category``, and ``processed_at``.
    """
    output: dict = {
        "source_file": doc_path.name,
        "category": category,
        "processed_at": datetime.now(timezone.utc).isoformat(),
        **result,
    }
    out_path = doc_path.with_name(doc_path.stem + "_result.json")
    out_path.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    return out_path


# ---------------------------------------------------------------------------
# Stage 1 — Text extraction (PDF via Textract, DOCX via python-docx)
# ---------------------------------------------------------------------------

def _extract_text(doc_path: Path) -> str:
    """Extract text from a PDF or DOCX file.

    Raises
    ------
    RuntimeError
        With a clear stage label so the caller can distinguish extraction
        failures from pipeline failures.
    """
    suffix = doc_path.suffix.lower()

    if suffix == ".pdf":
        try:
            from textract_extract import extract_text_from_pdf  # noqa: PLC0415
            return extract_text_from_pdf(doc_path.read_bytes())
        except Exception as exc:
            raise RuntimeError(f"Textract OCR failed: {exc}") from exc

    if suffix == ".docx":
        try:
            from docx_extract import extract_text_from_docx  # noqa: PLC0415
            return extract_text_from_docx(doc_path.read_bytes())
        except Exception as exc:
            raise RuntimeError(f"DOCX extraction failed: {exc}") from exc

    raise RuntimeError(
        f"Unsupported file type '{suffix}'. "
        f"Supported types: {', '.join(sorted(_SUPPORTED_EXTENSIONS))}"
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    """Entry point.  Returns an exit code (0 = passed, 1 = escalated/error)."""
    # -----------------------------------------------------------------------
    # Parse CLI arguments
    # -----------------------------------------------------------------------
    if len(sys.argv) < 2:
        print(
            "Usage: python main.py <doc_path> [category]\n"
            "  doc_path  — path to a local PDF or DOCX file\n"
            "  category  — document category (default: financial)",
            file=sys.stderr,
        )
        return 1

    doc_path = Path(sys.argv[1])
    category = sys.argv[2] if len(sys.argv) >= 3 else "financial"

    if not doc_path.is_file():
        print(f"[ERROR] File not found: {doc_path}", file=sys.stderr)
        return 1

    if doc_path.suffix.lower() not in _SUPPORTED_EXTENSIONS:
        print(
            f"[ERROR] Unsupported file type '{doc_path.suffix}'. "
            f"Supported: {', '.join(sorted(_SUPPORTED_EXTENSIONS))}",
            file=sys.stderr,
        )
        return 1

    file_type = "PDF" if doc_path.suffix.lower() == ".pdf" else "DOCX"
    print(f"[INFO] Processing {file_type}: {doc_path.name}  (category: {category})")

    # -----------------------------------------------------------------------
    # Stage 1 — Text extraction
    # -----------------------------------------------------------------------
    try:
        text = _extract_text(doc_path)
    except RuntimeError as exc:
        print(f"[ERROR] Extraction stage failed: {exc}", file=sys.stderr)
        result = _empty_escalation(str(exc))
        _print_result(result)
        out_path = _write_json_output(result, doc_path, category)
        print(f"\n[INFO] Result saved to: {out_path}")
        return 1

    if not text or not text.strip():
        print("[WARN] Extraction returned empty text — skipping LLM call.")
        result = _empty_escalation(
            "Extraction succeeded but returned empty or whitespace-only output."
        )
        _print_result(result)
        out_path = _write_json_output(result, doc_path, category)
        print(f"\n[INFO] Result saved to: {out_path}")
        return 1

    print(f"[INFO] Extraction complete ({len(text)} characters).")

    # -----------------------------------------------------------------------
    # Stage 2 — Language detection → model routing
    # -----------------------------------------------------------------------
    try:
        from language_detect import detect_language  # noqa: PLC0415
        lang = detect_language(text)
    except Exception as exc:  # noqa: BLE001
        print(f"[WARN] Language detection failed ({exc}); defaulting to English routing.")
        lang = "en"

    if lang == "en":
        print("[INFO] Language: English -> using default model.")
        llm_model = None  # pipeline.py uses DEFAULT_MODEL from client.py
    else:
        print(f"[INFO] Language: {lang.upper()} (non-English) -> routing to {_MULTILINGUAL_MODEL}.")
        llm_model = _MULTILINGUAL_MODEL

    # -----------------------------------------------------------------------
    # Stage 3 — LLM validation / scoring pipeline
    # -----------------------------------------------------------------------
    print("[INFO] Running LLM validation pipeline...")

    try:
        from pipeline import run_pipeline  # noqa: PLC0415
        result = run_pipeline(text, category=category, model=llm_model)
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] LLM pipeline stage failed: {exc}", file=sys.stderr)
        result = _empty_escalation(f"LLM pipeline failed: {exc}")
        _print_result(result)
        out_path = _write_json_output(result, doc_path, category)
        print(f"\n[INFO] Result saved to: {out_path}")
        return 1

    # -----------------------------------------------------------------------
    # Output — console + JSON file
    # -----------------------------------------------------------------------
    print()
    _print_result(result)

    out_path = _write_json_output(result, doc_path, category)
    print(f"\n[INFO] Result saved to: {out_path}")

    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
