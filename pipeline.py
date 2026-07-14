"""LLM validation and scoring pipeline for OCR-extracted document text.

Public interface
----------------
``run_pipeline(ocr_text, category, model)`` -> dict with keys:
    status     : "passed" | "escalated"
    score      : float 0-1  (overall confidence from the LLM, or 0 on error)
    data       : dict of extracted field values  (or {} on error)
    violations : list of violation strings       (or [error message] on error)
    model_used : str  name of the LLM model that processed the document
"""

from __future__ import annotations

import sys

from client import chat_completion
from parse_response import parse_ocr_response
from prompt_template import build_prompt
from rules import apply_rules


def run_pipeline(
    ocr_text: str,
    category: str = "financial",
    model: str | None = None,
) -> dict:
    """Run the full LLM extraction + rules validation pipeline.

    Parameters
    ----------
    ocr_text:
        Raw OCR text from Textract or docx_extract.
    category:
        Document category key from ``DOCUMENT_SCHEMAS`` (default: "financial").
    model:
        Optional Groq model name override.  When ``None``, ``chat_completion``
        uses its own default (``DEFAULT_MODEL`` from client.py).

    Returns
    -------
    dict
        {
          "status":     "passed" | "escalated",
          "score":      float,
          "data":       dict,
          "violations": list[str],
          "model_used": str,
        }
    """
    # ------------------------------------------------------------------
    # 1. Build the prompt
    # ------------------------------------------------------------------
    try:
        prompt = build_prompt(ocr_text, category)
    except KeyError:
        return {
            "status": "escalated",
            "score": 0.0,
            "data": {},
            "violations": [f"Unknown document category: '{category}'"],
        }

    # ------------------------------------------------------------------
    # 2. Call the LLM
    # ------------------------------------------------------------------
    call_kwargs: dict = {}
    if model:
        call_kwargs["model"] = model
    try:
        raw_output = chat_completion(prompt, **call_kwargs)
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "escalated",
            "score": 0.0,
            "data": {},
            "violations": [f"LLM call failed: {exc}"],
            "model_used": model or "default",
        }

    # ------------------------------------------------------------------
    # 3. Parse the LLM response
    # ------------------------------------------------------------------
    try:
        parsed = parse_ocr_response(raw_output)
    except ValueError as exc:
        return {
            "status": "escalated",
            "score": 0.0,
            "data": {},
            "violations": [f"Failed to parse LLM response: {exc}"],
        }

    # ------------------------------------------------------------------
    # 4. Apply business rules
    # ------------------------------------------------------------------
    violations = apply_rules(parsed, category)
    status = "passed" if not violations else "escalated"
    score = float(parsed.get("confidence", 0.0))
    data = parsed.get("data") or {}

    from client import DEFAULT_MODEL  # noqa: PLC0415
    return {
        "status": status,
        "score": score,
        "data": data,
        "violations": violations,
        "model_used": model or DEFAULT_MODEL,
    }


def _print_result(result: dict) -> None:
    """Print a pipeline result in human-readable format."""
    print(f"Status    : {result['status'].upper()}")
    print(f"Score     : {result['score']:.2f}")
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


if __name__ == "__main__":
    # Quick smoke-test with hard-coded sample text.
    _SAMPLE = """\
--- Page 1 ---
Fields:
Invoice Number: INV-2024-0042
Invoice Date: 2024-03-15
Bill To: Acme Corp, 123 Main St, Springfield
Vendor: Widget Supplies Ltd, 456 Oak Ave, Shelbyville
Payment Terms: Net 30
Table:
Description | Qty | Unit Price | Amount
Widget A    | 10  | $25.00     | $250.00
Widget B    | 5   | $40.00     | $200.00
Fields:
Total Amount: $450.00
"""
    result = run_pipeline(_SAMPLE, category="financial")
    _print_result(result)
    sys.exit(0 if result["status"] == "passed" else 1)
