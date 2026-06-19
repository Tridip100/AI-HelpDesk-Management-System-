# backend/services/ai_pipeline.py
#
# AI Pipeline — updated
# Changes:
#   1. Intent detection — greeting/escalate/followup/new_problem
#   2. Solution cache check before LLM call
#   3. Single model (qwen2.5) — no more phi3 draft step
#   4. Follow-up context enrichment — re-routes with full history

import logging
import re
from typing import AsyncGenerator, Optional

from backend.services import nlp_services as nlp_service
from backend.services import rag_service
from backend.services import llm_services as llm_service
from backend.services.solution_cache_service import get_cached_solution, store_solution

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.5

# ─────────────────────────────────────────
# INTENT DETECTION
# ─────────────────────────────────────────
GREETING_PATTERNS = [
    r"^(hi|hello|hey|howdy|good morning|good afternoon|good evening|sup|what'?s up)[\s.,!?]*$",
]

ESCALATION_PATTERNS = [
    r"(raise|create|open|make|submit).{0,20}(ticket|issue|request|case)",
    r"(escalate|transfer).{0,20}(human|agent|helpdesk|team|support)",
    r"(talk|speak|connect).{0,20}(human|real person|agent|someone)",
    r"(need|want).{0,20}(human|real person|agent|helpdesk)",
    r"please.{0,10}(escalate|raise|create|open|transfer)",
    r"(can't|cannot|couldn't).{0,30}(fix|resolve|solve)",
]

FOLLOWUP_PATTERNS = [
    r"^(ok|okay|i see|thanks|thank you|got it|alright|sure|yes|no|nope|yep|done)[\s.,!?]*$",
    r"(what next|next step|what should i do|what do i do now|what else)",
    r"(i tried|already tried|done that|still not|didn't work|not working|same error|same issue)",
    r"(can you|could you|please).{0,30}(explain|clarify|elaborate|more detail|step by step)",
    r"(summarize|summary|recap|explain again|what was the)",
    r"(still|again|another).{0,20}(error|issue|problem|not working)",
    r"^(why|how|when|what|where).{0,50}\?$",
]


def detect_intent(message: str, has_history: bool) -> str:
    """
    Classify message before running NLP pipeline.
    Returns: greeting | escalate | followup | new_problem
    """
    msg = message.strip().lower()

    for p in GREETING_PATTERNS:
        if re.search(p, msg):
            return "greeting"

    for p in ESCALATION_PATTERNS:
        if re.search(p, msg):
            return "escalate"

    if has_history:
        for p in FOLLOWUP_PATTERNS:
            if re.search(p, msg):
                return "followup"

    return "new_problem"


# ─────────────────────────────────────────
# MAIN STREAMING PIPELINE
# ─────────────────────────────────────────
async def run_streaming(
    message:      str,
    conversation: list = None,
) -> AsyncGenerator[dict, None]:
    """
    Main AI pipeline with intent detection and solution cache.

    Flow:
      greeting   → immediate reply, no pipeline
      escalate   → low confidence → triggers ticket creation
      followup   → enrich with history context → pipeline
      new_problem → check cache → NLP → RAG → qwen2.5
    """
    has_history = bool(conversation and len(conversation) > 0)
    intent      = detect_intent(message, has_history)

    logger.info(f"[PIPELINE] intent={intent} has_history={has_history}")

    # ── Greeting ─────────────────────────────────────────────
    if intent == "greeting":
        yield {"type": "status", "stage": "analyzing", "label": "Reading your message..."}
        yield {
            "type":                "result",
            "tier":                "tier1",
            "response":            "Hello! How can I help you with your IT issue today?",
            "confidence":          0.99,
            "nlp":                 None,
            "should_create_ticket": False,
        }
        return

    # ── Escalation intent ────────────────────────────────────
    if intent == "escalate":
        yield {"type": "status", "stage": "creating_ticket", "label": "Creating support ticket..."}
        yield {
            "type":                "result",
            "tier":                "tier1",
            "response":            "I'll escalate this to our helpdesk team right away. A support agent will review your issue shortly.",
            "confidence":          0.1,
            "nlp":                 None,
            "should_create_ticket": True,
        }
        return

    # ── Follow-up — enrich message with conversation context ─
    effective_message = message
    if intent == "followup" and conversation:
        first_user = next(
            (m["content"] for m in conversation if m["role"] == "user"), ""
        )
        if first_user and first_user != message:
            effective_message = (
                f"Original problem: {first_user[:300]}\n"
                f"Follow-up question: {message}"
            )
            logger.info(f"[PIPELINE] Follow-up enriched with original context")

    # ── Solution cache check ──────────────────────────────────
    yield {"type": "status", "stage": "cache_check", "label": "Checking previous solutions..."}

    cache_hit = get_cached_solution(effective_message)
    if cache_hit:
        logger.info(f"[PIPELINE] Cache hit — skipping NLP/RAG/LLM")
        yield {"type": "status", "stage": "thinking", "label": "Generating your answer..."}

        nlp_result = nlp_service.analyze(effective_message[:300])

        yield {
            "type":                "result",
            "tier":                "cache",
            "response":            cache_hit["solution"],
            "confidence":          cache_hit["confidence"],
            "nlp":                 nlp_result,
            "should_create_ticket": False,
            "from_cache":          True,
        }
        return

    # ── Full pipeline ─────────────────────────────────────────
    yield {"type": "status", "stage": "analyzing", "label": "Reading your message..."}

    nlp_result = nlp_service.analyze(effective_message[:500])

    logger.info(
        f"[PIPELINE] tier={nlp_result.tier} category={nlp_result.category} "
        f"priority={nlp_result.priority}"
    )

    yield {
        "type":  "status",
        "stage": "knowledge_base",
        "label": "Searching IT knowledge base...",
    }

    nlp_summary = (
        f"[{nlp_result.priority}][{nlp_result.severity.upper()}] "
        f"{nlp_result.category} issue. {effective_message[:300]}"
    )

    # Tier 1 / Tier 3a — simple, answer directly
    if nlp_result.tier in ("tier1", "tier3a"):
        yield {"type": "status", "stage": "thinking", "label": "Generating your answer..."}

        result = await llm_service.generate(
            nlp_summary  = nlp_summary,
            conversation = conversation,
            raw_message  = effective_message,
        )

        response   = result["response"]
        confidence = result["confidence"]

        if confidence >= 0.75:
            store_solution(effective_message, response, confidence,
                           nlp_result.category, nlp_result.priority)

        yield {
            "type":                "result",
            "tier":                nlp_result.tier,
            "response":            response,
            "confidence":          confidence,
            "nlp":                 nlp_result,
            "should_create_ticket": confidence <= CONFIDENCE_THRESHOLD,
        }
        return

    # Tier 2 — RAG + optional web search + qwen2.5
    rag_result     = await rag_service.search(nlp_summary)
    rag_context    = rag_result.get("context")
    rag_confidence = rag_result.get("confidence", 0)

    tavily_context = None
    if rag_confidence < 0.6:
        try:
            from backend.services.sanitizer_service import build_safe_query
            from backend.services.tavily_service import search as tavily_search
            safe_query     = build_safe_query(nlp_result)
            tavily_result  = await tavily_search(safe_query)
            tavily_context = tavily_result.get("context")
            if tavily_context:
                yield {"type": "status", "stage": "web_search", "label": "Searching the web..."}
        except Exception as e:
            logger.warning(f"[PIPELINE] Tavily failed: {e}")

    yield {"type": "status", "stage": "thinking", "label": "Generating your answer..."}

    # Single LLM call — qwen2.5 handles everything
    full_response = ""
    async for token in llm_service.generate_stream(
        nlp_summary    = nlp_summary,
        rag_context    = rag_context,
        tavily_context = tavily_context,
        conversation   = conversation,
        raw_message    = effective_message,
    ):
        if token.startswith('{"type"'):
            try:
                parsed     = json_parse(token)
                confidence = parsed.get("value", 0.55)
            except Exception:
                confidence = 0.55
            break
        full_response += token

    import json as _json
    try:
        confidence = _json.loads(token).get("value", 0.55) if token.startswith('{"type"') else 0.55
    except Exception:
        confidence = 0.55

    from backend.services.llm_services import extract_confidence
    clean_response, confidence = extract_confidence(full_response)

    if confidence >= 0.75:
        store_solution(effective_message, clean_response, confidence,
                       nlp_result.category, nlp_result.priority)

        if tavily_context:
            try:
                rag_service.store_web_result(
                    query    = effective_message[:200],
                    content  = tavily_context,
                    category = nlp_result.category,
                )
            except Exception as e:
                logger.warning(f"[PIPELINE] Failed to store web result: {e}")

    yield {
        "type":                "result",
        "tier":                "tier2",
        "response":            clean_response,
        "confidence":          confidence,
        "nlp":                 nlp_result,
        "should_create_ticket": confidence <= CONFIDENCE_THRESHOLD,
    }


def json_parse(s: str) -> dict:
    import json
    return json.loads(s)


# ─────────────────────────────────────────
# NON-STREAMING WRAPPER
# ─────────────────────────────────────────
async def run(message: str, conversation: list = None) -> dict:
    """Non-streaming wrapper for intake/call endpoints."""
    result = None
    async for event in run_streaming(message, conversation):
        if event.get("type") == "result":
            result = event
    return result or {
        "tier": "tier1", "response": "", "confidence": 0.5,
        "nlp": None, "should_create_ticket": False,
    }
