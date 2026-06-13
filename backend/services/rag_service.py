# backend/services/rag_service.py
#
# WHAT THIS FILE DOES:
# The RAG interface used by ai_pipeline.py
# Searches both ChromaDB collections (sop_documents + resolved_tickets)
# Combines results into context for the LLM prompt
# Calculates overall RAG confidence — used for tier2 decision making
#
# HOW IT CONNECTS:
# ai_pipeline.py calls rag_service.search(nlp_result.summary)
# Returns combined context string for llm_service.build_prompt()
# Also returns confidence — if low, ai_pipeline calls tavily_service

import os
import logging

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_VERBOSITY"] = "error"

from backend.ingestion.base_ingestor import search_collection

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────
SOP_RESULTS    = 3      # top N SOP chunks
TICKET_RESULTS = 2      # top N past tickets
MIN_SCORE      = 0.5    # below this — not relevant enough to include
RAG_CONFIDENCE_THRESHOLD = 0.6   # below this — trigger Tavily


def search(query: str) -> dict:
    """
    Search both ChromaDB collections for relevant context.

    Args:
        query: NLP summary (crisp, not raw text)
               e.g. "[P3][MEDIUM] network issue. Error: 0x800704C9. VPN disconnecting"

    Returns:
    {
        "context":      "formatted text for LLM prompt",
        "confidence":   0.83,        # highest score found
        "sources":      ["troubleshoot-windows-server", ...],
        "found_results": True
    }
    """
    logger.info(f"[RAG] Searching for: {query[:60]}...")

    # Search SOP documents
    sop_results = search_collection("sop_documents", query, n_results=SOP_RESULTS)

    # Search resolved tickets
    ticket_results = search_collection("resolved_tickets", query, n_results=TICKET_RESULTS)

    # Filter by minimum score
    sop_results    = [r for r in sop_results if r["score"] >= MIN_SCORE]
    ticket_results = [r for r in ticket_results if r["score"] >= MIN_SCORE]

    if not sop_results and not ticket_results:
        logger.warning("[RAG] No relevant results found")
        return {
            "context":       "",
            "confidence":    0.0,
            "sources":       [],
            "found_results": False,
        }

    # Build context string for LLM
    context_parts = []
    sources       = []
    all_scores    = []

    if sop_results:
        context_parts.append("KNOWLEDGE BASE ARTICLES:")
        for r in sop_results:
            context_parts.append(f"- {r['text'][:400]}")
            sources.append(r["metadata"]["source"])
            all_scores.append(r["score"])

    if ticket_results:
        context_parts.append("\nSIMILAR PAST RESOLVED TICKETS:")
        for r in ticket_results:
            context_parts.append(f"- {r['text'][:300]}")
            all_scores.append(r["score"])

    context    = "\n".join(context_parts)
    confidence = round(max(all_scores), 3) if all_scores else 0.0

    logger.info(
        f"[RAG] Found {len(sop_results)} SOP + {len(ticket_results)} ticket results, "
        f"confidence={confidence}"
    )

    return {
        "context":       context,
        "confidence":    confidence,
        "sources":       list(set(sources)),
        "found_results": True,
    }


def needs_web_search(rag_confidence: float) -> bool:
    """
    Decide if Tavily web search is needed.
    Called by ai_pipeline.py after RAG search.

    Returns True if RAG confidence too low — search web as fallback.
    """
    return rag_confidence < RAG_CONFIDENCE_THRESHOLD


def store_resolved_conversation(session_summary: str, category: str, priority: str):
    """
    Store a newly resolved chat conversation back into ChromaDB.
    Called by routers/chat.py when user confirms "resolved".

    This is the CONTINUOUS LEARNING loop:
    Every successfully resolved conversation becomes future RAG context.

    Args:
        session_summary: AI-generated summary of the conversation
        category: nlp_result.category
        priority: nlp_result.priority
    """
    from backend.ingestion.base_ingestor import add_to_collection
    import uuid

    doc_id = f"chat_resolved_{uuid.uuid4().hex[:8]}"

    add_to_collection(
        collection_name = "resolved_tickets",
        ids             = [doc_id],
        texts           = [session_summary],
        metadatas       = [{
            "ticket_id":   doc_id,
            "subject":     session_summary[:100],
            "type":        category,
            "priority":    priority,
            "channel":     "chat",
            "type_source": "chat_resolved"
        }]
    )

    logger.info(f"[RAG] Stored resolved chat conversation — {doc_id}")