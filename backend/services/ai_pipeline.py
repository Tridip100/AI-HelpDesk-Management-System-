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


# backend/services/ai_pipeline.py — replace run() with run_streaming()

async def run_streaming(raw_text: str, conversation: list = None):
    yield {"type": "status", "stage": "analyzing", "label": "Analyzing your message..."}

    nlp_input = raw_text
    if conversation:
        last_user = next((m["content"] for m in reversed(conversation) if m["role"] == "user"), "")
        nlp_input = f"{last_user}. Follow-up: {raw_text}"

    nlp_result = nlp_service.analyze(nlp_input)
    tier = nlp_result.tier

    logger.info(f"[PIPELINE] tier={tier} category={nlp_result.category} priority={nlp_result.priority}")

    result = {
        "nlp": nlp_result, "tier": tier, "response": None, "confidence": 0.0,
        "rag_sources": [], "tavily_used": False, "should_create_ticket": False,
    }

    if tier in ("tier3b", "tier3c"):
        yield {"type": "status", "stage": "escalating", "label": "Routing to helpdesk team..."}
        result["should_create_ticket"] = True
        result["response"] = _direct_escalation_message(nlp_result)
        yield {"type": "result", **result}
        return

    # Tier 1 / 3A — phi3 only, fast
    if tier in ("tier1", "tier3a"):
        yield {"type": "status", "stage": "thinking", "label": "Generating your answer..."}
        llm_result = await _safe_generate(
            nlp_summary=nlp_result.summary, conversation=conversation,
            raw_message=raw_text, model="phi3",
        )
        result["response"] = llm_result["response"]
        result["confidence"] = llm_result["confidence"]
        result["should_create_ticket"] = llm_result["confidence"] <= CONFIDENCE_THRESHOLD
        yield {"type": "result", **result}
        return

    # Tier 2 — RAG → (Tavily) → phi3 draft → mistral refined
    yield {"type": "status", "stage": "knowledge_base", "label": "Searching knowledge base..."}
    rag_result = rag_service.search(nlp_result.summary)
    result["rag_sources"] = rag_result.get("sources", [])

    tavily_context = None
    if rag_service.needs_web_search(rag_result["confidence"]):
        yield {"type": "status", "stage": "web_search", "label": "Searching the web for more info..."}
        safe_query = build_safe_query(nlp_result)
        tavily_result = tavily_service.search(safe_query)
        if tavily_result["found_results"]:
            tavily_context = tavily_result["context"]
            result["tavily_used"] = True

    # Quick draft with phi3 — shown immediately
    yield {"type": "status", "stage": "thinking", "label": "Drafting a quick answer..."}
    draft = await _safe_generate(
        nlp_summary=nlp_result.summary, rag_context=rag_result.get("context") or None,
        tavily_context=tavily_context, conversation=conversation,
        raw_message=raw_text, model="phi3",
    )
    yield {"type": "draft", "response": draft["response"], "confidence": draft["confidence"]}

    # Refined answer with mistral
    yield {"type": "status", "stage": "thinking", "label": "Refining with full analysis..."}
    llm_result = await _safe_generate(
        nlp_summary=nlp_result.summary, rag_context=rag_result.get("context") or None,
        tavily_context=tavily_context, conversation=conversation,
        raw_message=raw_text, model="mistral",
    )

    result["response"] = llm_result["response"]
    result["confidence"] = llm_result["confidence"]
    result["should_create_ticket"] = llm_result["confidence"] <= CONFIDENCE_THRESHOLD

    # Continuous learning — if Tavily was used and the final answer is confident,
    # store the web result into the knowledge base for future queries
    if result["tavily_used"] and not result["should_create_ticket"] and tavily_context:
        try:
            rag_service.store_web_result(
                query=nlp_result.summary,
                tavily_context=tavily_context,
                category=nlp_result.category,
            )
        except Exception as e:
            logger.error(f"[PIPELINE] Failed to store web result: {e}")

    if result["should_create_ticket"]:
        yield {"type": "status", "stage": "escalating", "label": "Creating support ticket..."}

    yield {"type": "result", **result}


async def run(raw_text: str, conversation: list = None) -> dict:
    async for event in run_streaming(raw_text, conversation):
        if event["type"] == "result":
            return {k: v for k, v in event.items() if k != "type"}

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