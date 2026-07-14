"""Business rules applied to parsed LLM responses.

Rules produce "violations" — plain-English strings describing problems found.
An empty violations list means the document passes all rules.
"""

from __future__ import annotations

from document_schema import DOCUMENT_SCHEMAS

# Documents with overall confidence below this threshold are escalated.
CONFIDENCE_THRESHOLD = 0.75

# Individual field confidence below this threshold is flagged as a violation.
FIELD_CONFIDENCE_THRESHOLD = 0.60


def check_required_fields(parsed: dict, category: str) -> list[str]:
    """Return violations for any required field that is absent or null."""
    schema = DOCUMENT_SCHEMAS.get(category, {})
    required = schema.get("required_fields", [])
    data: dict = parsed.get("data") or {}

    violations: list[str] = []
    for field in required:
        value = data.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            violations.append(f"Required field missing or empty: '{field}'")
    return violations


def check_confidence(parsed: dict) -> list[str]:
    """Return a violation if overall confidence is below the threshold."""
    confidence = parsed.get("confidence", 0.0)
    if not isinstance(confidence, (int, float)):
        return [f"Invalid confidence value: {confidence!r}"]
    if confidence < CONFIDENCE_THRESHOLD:
        return [
            f"Overall confidence {confidence:.2f} is below threshold "
            f"{CONFIDENCE_THRESHOLD:.2f}"
        ]
    return []


def check_field_confidence(parsed: dict) -> list[str]:
    """Return violations for individual fields with confidence below threshold."""
    field_confidence: dict = parsed.get("field_confidence") or {}
    violations: list[str] = []
    for field, score in field_confidence.items():
        if not isinstance(score, (int, float)):
            violations.append(f"Invalid field_confidence value for '{field}': {score!r}")
            continue
        if score < FIELD_CONFIDENCE_THRESHOLD:
            violations.append(
                f"Low confidence for field '{field}': {score:.2f} "
                f"(threshold {FIELD_CONFIDENCE_THRESHOLD:.2f})"
            )
    return violations


def apply_rules(parsed: dict, category: str) -> list[str]:
    """Run all rules and return a combined list of violations."""
    violations: list[str] = []
    violations.extend(check_required_fields(parsed, category))
    violations.extend(check_confidence(parsed))
    violations.extend(check_field_confidence(parsed))
    return violations
