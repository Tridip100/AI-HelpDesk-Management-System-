# backend/services/ai_pipeline.py
#
# Orchestrates: NLP → triage → (RAG → Tavily if needed) → LLM → confidence → result
# Single entry point called by routers/chat.py, intake.py, imap_poller.py

import logging
from backend.services import nlp_services as nlp_service
from backend.services import llm_services as llm_service
from backend.services import rag_service, tavily_service
from backend.services.sanitizer_service import build_safe_query

logger = logging.getLogger(__name__)

# Threshold — confidence <= this means escalate to a ticket.
# Using <= (not <) so the "uncertain default" values (0.5/0.55) also escalate.
CONFIDENCE_THRESHOLD = 0.5


async def _safe_generate(**kwargs) -> dict:
    """
    Wraps llm_service.generate() — never lets a timeout/error
    crash the pipeline. Returns a safe fallback on failure.
    """
    try:
        return await llm_service.generate(**kwargs)
    except RuntimeError as e:
        logger.error(f"[PIPELINE] LLM call failed: {e}")
        return {
            "response":   "I'm having trouble processing this right now. Escalating to helpdesk.",
            "confidence": 0.0,
            "model":      "error",
            "tokens":     0,
        }


async def run(raw_text: str, conversation: list = None) -> dict:
    """
    Full AI pipeline for one input (chat turn, email, or call transcript).

    Returns:
    {
        "nlp":        NLPResult object,
        "tier":       "tier1"|"tier2"|"tier3a"|"tier3b"|"tier3c",
        "response":   "AI reply text" or None (tier3b/3c skip LLM),
        "confidence": 0.0-1.0,
        "rag_sources": [...],
        "tavily_used": bool,
        "should_create_ticket": bool
    }
    """
    # Step 1 — NLP (always runs)
    nlp_result = nlp_service.analyze(raw_text)
    tier = nlp_result.tier

    logger.info(
        f"[PIPELINE] tier={tier} category={nlp_result.category} "
        f"priority={nlp_result.priority} severity={nlp_result.severity}"
    )

    result = {
        "nlp":          nlp_result,
        "tier":         tier,
        "response":     None,
        "confidence":   0.0,
        "rag_sources":  [],
        "tavily_used":  False,
        "should_create_ticket": False,
    }

    # ─────────────────────────────────────
    # TIER 3B / 3C — skip AI entirely, direct to helpdesk
    # ─────────────────────────────────────
    if tier in ("tier3b", "tier3c"):
        result["should_create_ticket"] = True
        result["response"] = _direct_escalation_message(nlp_result)
        return result

    # ─────────────────────────────────────
    # TIER 1 — LLM only, no RAG
    # ─────────────────────────────────────
    if tier == "tier1":
        llm_result = await _safe_generate(
            nlp_summary  = nlp_result.summary,
            conversation = conversation,
            raw_message  = raw_text,
        )
        result["response"]   = llm_result["response"]
        result["confidence"] = llm_result["confidence"]
        result["should_create_ticket"] = llm_result["confidence"] <= CONFIDENCE_THRESHOLD
        return result

    # ─────────────────────────────────────
    # TIER 3A — LLM tries basic hardware fix
    # ─────────────────────────────────────
    if tier == "tier3a":
        llm_result = await _safe_generate(
            nlp_summary  = nlp_result.summary,
            conversation = conversation,
            raw_message  = raw_text,
        )
        result["response"]   = llm_result["response"]
        result["confidence"] = llm_result["confidence"]
        result["should_create_ticket"] = llm_result["confidence"] <= CONFIDENCE_THRESHOLD
        return result

    # ─────────────────────────────────────
    # TIER 2 — full pipeline: RAG → (Tavily if needed) → LLM
    # ─────────────────────────────────────
    rag_result = rag_service.search(nlp_result.summary)
    result["rag_sources"] = rag_result.get("sources", [])

    tavily_context = None
    if rag_service.needs_web_search(rag_result["confidence"]):
        safe_query    = build_safe_query(nlp_result)
        tavily_result = tavily_service.search(safe_query)
        if tavily_result["found_results"]:
            tavily_context = tavily_result["context"]
            result["tavily_used"] = True

    llm_result = await _safe_generate(
        nlp_summary    = nlp_result.summary,
        rag_context    = rag_result.get("context") or None,
        tavily_context = tavily_context,
        conversation   = conversation,
        raw_message    = raw_text,
    )

    result["response"]   = llm_result["response"]
    result["confidence"] = llm_result["confidence"]
    result["should_create_ticket"] = llm_result["confidence"] <= CONFIDENCE_THRESHOLD

    return result


def _direct_escalation_message(nlp_result) -> str:
    if nlp_result.tier == "tier3c":
        return (
            f"I've detected a {nlp_result.severity.upper()} {nlp_result.category} "
            f"issue that needs immediate helpdesk attention. Creating an urgent ticket now."
        )
    return (
        "This appears to be a hardware issue that requires physical inspection. "
        "I'm connecting you with our helpdesk team."
    )