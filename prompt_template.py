"""Prompt template builder for the document validation pipeline."""

from __future__ import annotations

from document_schema import DOCUMENT_SCHEMAS


def _format_required_hints(hints: dict[str, str]) -> str:
    """Render required field hints as a readable list."""
    return "\n".join(f"  - {field}: {desc}" for field, desc in hints.items())


_SYSTEM_TEMPLATE = """\
You are a document extraction assistant.

Extract ALL information present in the OCR text of a {category} document.

Priority fields (these will be validated — you MUST include them in "data" \
using exactly these key names if found in the document):
{required_hints}

Extraction instructions
-----------------------
- Extract every piece of information in the document — do not skip anything.
- You decide how to name and organise the remaining fields. Use clear, \
descriptive key names that match the document's own language and structure.
- For tables, represent each row as an object in an array.
- For currency, include the ISO 4217 code or symbol alongside amounts.
- For free text (notes, disclaimers, instructions), include it under a \
descriptive key.
- Do NOT invent or compute values that are not present in the text.
- Do NOT omit content just because it doesn't match a known field name.

Response format (strict envelope — data content is your decision)
-----------------------------------------------------------------
Respond with ONLY a single JSON object — no markdown, no code fences, \
no commentary before or after.

{{
  "data": {{
    <all extracted fields — you decide the keys, types, and nesting>
  }},
  "confidence": <float 0.0–1.0, your overall confidence in the extraction>,
  "field_confidence": {{
    <one entry per priority field listed above, float 0.0–1.0>
  }},
  "issues": [
    "<describe any missing required fields, ambiguous values, or OCR errors>"
  ]
}}

OCR text to process:
---
{ocr_text}
---
"""


def build_prompt(ocr_text: str, category: str) -> str:
    """Build the extraction prompt for a given OCR text and document category.

    Raises
    ------
    KeyError
        If ``category`` is not present in ``DOCUMENT_SCHEMAS``.
    """
    schema = DOCUMENT_SCHEMAS[category]
    hints = _format_required_hints(schema["required_field_hints"])
    return _SYSTEM_TEMPLATE.format(
        category=category,
        required_hints=hints,
        ocr_text=ocr_text,
    )
