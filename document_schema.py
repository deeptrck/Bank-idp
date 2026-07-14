"""Document schema definitions keyed by category name.

Each entry provides:
  - required_fields : field names rules.py checks for pass/fail validation.
                      These are also shown to the LLM as priority hints.
  - required_field_hints : short descriptions of each required field, used
                           in the prompt so the LLM knows what to look for.

Note: there is no longer a hardcoded full_schema_text prescribing the shape
of extracted data — the LLM decides how to organise everything it finds.
"""

from __future__ import annotations

DOCUMENT_SCHEMAS: dict[str, dict] = {
    "financial": {
        # Fields rules.py validates — do not remove or rename these keys.
        "required_fields": [
            "invoice_number",
            "invoice_date",
            "bill_to",
            "vendor",
            "payment_terms",
            "total_amount",
        ],

        # Human-readable hints shown to the LLM so it knows what to prioritise.
        # The LLM is still free to add any other fields it finds.
        "required_field_hints": {
            "invoice_number":  "Unique invoice identifier / reference number",
            "invoice_date":    "Date the invoice was issued — output as YYYY-MM-DD",
            "bill_to":         "Name and/or address of the entity being billed",
            "vendor":          "Name and/or address of the issuing vendor / seller",
            "payment_terms":   "Payment terms (e.g. Net 30, Due on receipt, 14 days)",
            "total_amount":    "Total amount due — numeric only, no currency symbol",
        },
    },
}
