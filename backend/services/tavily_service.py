# backend/services/tavily_service.py
#
# WHAT THIS FILE DOES:
# Web search fallback — called by ai_pipeline.py ONLY when
# rag_service confidence is below threshold (0.6).
#
# Receives only the sanitized query from sanitizer_service —
# never raw text, never PII.
#
# Returns top results formatted for LLM context.

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

from config import Settings
settings = Settings()
TAVILY_API_KEY = settings.TAVILY_API_KEY
MAX_RESULTS    = 5


def _get_client():
    """
    Lazy load TavilyClient — only imported if API key exists.
    Avoids import error if tavily-python not installed
    and TAVILY_API_KEY not configured (graceful degradation).
    """
    if not TAVILY_API_KEY:
        return None
    from tavily import TavilyClient
    return TavilyClient(api_key=TAVILY_API_KEY)


def search(sanitized_query: str) -> dict:
    """
    Search the web using a sanitized query.

    Args:
        sanitized_query: output of sanitizer_service.build_safe_query()
                         e.g. "VPN 0x800704C9 Windows 11 disconnecting fix"

    Returns:
    {
        "context":     "formatted text for LLM prompt",
        "sources":     ["https://...", ...],
        "found_results": True/False
    }

    If TAVILY_API_KEY not configured — returns empty result
    gracefully (ai_pipeline continues without web context).
    """
    client = _get_client()

    if client is None:
        logger.warning("[TAVILY] No API key configured — skipping web search")
        return {"context": "", "sources": [], "found_results": False}

    logger.info(f"[TAVILY] Searching: '{sanitized_query}'")

    try:
        response = client.search(
            query=sanitized_query,
            search_depth="basic",
            max_results=MAX_RESULTS,
        )
    except Exception as e:
        logger.error(f"[TAVILY] Search failed: {e}")
        return {"context": "", "sources": [], "found_results": False}

    results = response.get("results", [])

    if not results:
        logger.warning("[TAVILY] No results found")
        return {"context": "", "sources": [], "found_results": False}

    # Build context for LLM
    context_parts = ["WEB SEARCH RESULTS:"]
    sources = []

    for r in results:
        title   = r.get("title", "")
        content = r.get("content", "")[:300]
        url     = r.get("url", "")

        context_parts.append(f"- {title}: {content}")
        sources.append(url)

    context = "\n".join(context_parts)

    logger.info(f"[TAVILY] Found {len(results)} results")

    return {
        "context":       context,
        "sources":       sources,
        "found_results": True,
    }