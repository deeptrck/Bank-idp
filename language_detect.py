"""Language detection for the document processing pipeline.

Detects the primary language of extracted document text and returns an
ISO 639-1 code (e.g. 'en', 'ar', 'fr').  Used by main.py to route
non-English documents to the appropriate multilingual LLM.
"""

from __future__ import annotations

# Sample size — enough for reliable detection without processing the full doc.
_SAMPLE_CHARS = 800


def detect_language(text: str) -> str:
    """Return the ISO 639-1 language code of ``text``.

    Samples up to the first ``_SAMPLE_CHARS`` characters for speed.

    Returns ``"unknown"`` if detection fails (too little text, mixed script,
    library error, etc.).

    Parameters
    ----------
    text:
        The extracted document text to analyse.

    Returns
    -------
    str
        ISO 639-1 code e.g. ``"en"``, ``"ar"``, ``"fr"``, or ``"unknown"``.
    """
    sample = text.strip()[:_SAMPLE_CHARS]
    if not sample:
        return "unknown"

    try:
        from langdetect import detect, DetectorFactory  # noqa: PLC0415
        DetectorFactory.seed = 0  # deterministic results
        return detect(sample)
    except Exception:  # noqa: BLE001
        # Fallback: check for Arabic Unicode block (U+0600–U+06FF)
        arabic_chars = sum(1 for c in sample if "\u0600" <= c <= "\u06ff")
        if arabic_chars / max(len(sample), 1) > 0.15:
            return "ar"
        return "unknown"


def is_english(text: str) -> bool:
    """Return ``True`` if the detected language is English."""
    return detect_language(text) == "en"
