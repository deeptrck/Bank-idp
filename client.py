"""Groq API client wrapper for the document validation pipeline.

Groq exposes an OpenAI-compatible endpoint, so we use the ``openai`` package
pointed at Groq's base URL.  Set the ``GROQ_API_KEY`` environment variable
(or put it in a ``.env`` file) before running.
"""

from __future__ import annotations

import os

from openai import OpenAI

# Groq's OpenAI-compatible base URL
_GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Default model — fast and capable; change here to switch globally.
DEFAULT_MODEL = "llama-3.3-70b-versatile"

_client: OpenAI | None = None


def get_client() -> OpenAI:
    """Return a cached Groq client, initialised from GROQ_API_KEY env var."""
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(
                "Missing required environment variable: GROQ_API_KEY"
            )
        _client = OpenAI(api_key=api_key, base_url=_GROQ_BASE_URL)
    return _client


def chat_completion(
    prompt: str,
    model: str = DEFAULT_MODEL,
    temperature: float = 0.0,
) -> str:
    """Send a single-turn chat prompt to Groq and return the reply text."""
    client = get_client()
    response = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content or ""
