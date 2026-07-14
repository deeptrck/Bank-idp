"""Parse and validate raw LLM output for the document processing pipeline.

Contract with pipeline.py
--------------------------
``parse_ocr_response`` raises ``ValueError`` on any parse or validation
failure.  ``pipeline.py`` already catches ``ValueError`` and converts it into
an "escalated" result, so this contract MUST be preserved — never swallow
errors silently.
"""

from __future__ import annotations

import json
import re

# Top-level keys that every valid LLM response must contain.
_REQUIRED_KEYS: frozenset[str] = frozenset({"data", "confidence", "field_confidence", "issues"})

# Pattern that matches optional markdown code fences (``` or ```json … ```).
_FENCE_RE = re.compile(
    r"^\s*```(?:json)?\s*\n?(.*?)\n?\s*```\s*$",
    re.DOTALL,
)


def _strip_fences(text: str) -> str:
    """Remove markdown code fences if present; return the inner content."""
    match = _FENCE_RE.match(text.strip())
    if match:
        return match.group(1).strip()
    return text.strip()


def parse_ocr_response(raw_output: str) -> dict:
    """Parse a raw LLM response string into a validated result dict.

    Steps
    -----
    1. Strip markdown code fences (safety net — the prompt already asks the
       model not to include them).
    2. Parse the result as JSON.
    3. Confirm the top-level keys ``data``, ``confidence``,
       ``field_confidence``, and ``issues`` are all present.

    Returns
    -------
    dict
        The parsed response dict with at least the four required keys.

    Raises
    ------
    ValueError
        If the string cannot be parsed as JSON, or if any required key is
        missing.  ``pipeline.py`` catches ``ValueError`` and treats it as an
        "escalated" result.
    """
    if not isinstance(raw_output, str):
        raise ValueError(
            f"Expected a string from the LLM, got {type(raw_output).__name__!r}"
        )

    cleaned = _strip_fences(raw_output)

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"LLM response is not valid JSON: {exc}\n"
            f"--- raw output (first 500 chars) ---\n{raw_output[:500]}"
        ) from exc

    if not isinstance(parsed, dict):
        raise ValueError(
            f"LLM response parsed to {type(parsed).__name__!r}, expected a JSON object (dict)."
        )

    missing = _REQUIRED_KEYS - parsed.keys()
    if missing:
        raise ValueError(
            f"LLM response is missing required keys: {sorted(missing)}\n"
            f"Keys present: {sorted(parsed.keys())}"
        )

    return parsed
