# backend/services/sanitizer_service.py
#
# WHAT THIS FILE DOES:
# Builds a SAFE, PII-free search query for Tavily.
#
# DESIGN PRINCIPLE:
# Never pass raw user text to this — build the query ONLY from
# nlp_result.entities + nlp_result.category + nlp_result.keywords.
# These are already structured/extracted — raw text (which may
# contain names, IPs, employee IDs) never enters this file.
#
# Regex strip is kept as a SAFETY NET in case raw text is ever
# passed by mistake.

import re
import logging

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────
# SAFETY NET — regex patterns for PII
# ─────────────────────────────────────────
PII_PATTERNS = [
    (r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', ''),       # IP addresses
    (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', ''),  # emails
    (r'\b(EMP|SN|ID)[-_]?\d{3,}\b', '', ),                  # employee/serial IDs
    (r'\b[A-Z]{2,}-\d{2,}-[A-Z0-9]+\b', ''),                # hostnames like MUMBAI-SRV-03
]


def strip_pii(text: str) -> str:
    """
    Safety net — remove obvious PII patterns from text.
    Used only as a fallback if raw text is passed.
    """
    cleaned = text
    for pattern, repl in PII_PATTERNS:
        cleaned = re.sub(pattern, repl, cleaned, flags=re.IGNORECASE)
    # collapse extra whitespace left behind
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


def build_safe_query(nlp_result) -> str:
    """
    Build a clean, generic Tavily search query from
    STRUCTURED NLP entities only — never raw text.

    Example:
      nlp_result.entities = {"error_code": ["0x800704C9"], "version": ["Windows 11"]}
      nlp_result.category = "network"
      nlp_result.keywords = ["vpn", "disconnecting"]

      → "VPN 0x800704C9 Windows 11 disconnecting fix"

    This query contains:
      - error codes (generic, not tied to any user)
      - OS/version
      - category-relevant keywords
      - the word "fix" to bias results toward solutions

    It NEVER contains:
      - names, emails, IPs, employee IDs, hostnames
      (these were never extracted into entities/keywords anyway)
    """
    parts = []

    entities = nlp_result.entities or {}

    # error codes — most specific signal
    if "error_code" in entities:
        parts.extend(entities["error_code"][:2])

    # OS/version
    if "version" in entities:
        parts.extend(entities["version"][:1])

    # category-relevant keywords (top 3, skip generic words)
    GENERIC_SKIP = {"issue", "problem", "error", "not working", "help"}
    relevant_keywords = [
        kw for kw in (nlp_result.keywords or [])
        if kw not in GENERIC_SKIP
    ][:3]
    parts.extend(relevant_keywords)

    # category as fallback context
    if not parts:
        parts.append(nlp_result.category)

    parts.append("fix")

    query = " ".join(str(p) for p in parts)

    # safety net — strip any PII that could have slipped through
    query = strip_pii(query)

    logger.info(f"[SANITIZER] Built safe query: '{query}'")
    return query