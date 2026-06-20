# backend/services/ai_pipeline.py
#
# AI Pipeline — redesigned
#
# Key fix: when a user says "that didn't work" / "no" on a follow-up,
# we now explicitly tell the LLM what was already suggested and instruct
# it to provide DIFFERENT troubleshooting steps — not just re-describe
# the same problem and let the LLM repeat itself.

import logging
import re
import json
from typing import AsyncGenerator, Optional

from backend.services import nlp_services as nlp_service
from backend.services import rag_service
from backend.services import llm_services as llm_service
from backend.services.solution_cache_service import get_cached_solution, store_solution
from backend.services.llm_services import extract_confidence

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

# "Negative follow-up" — user tried the suggestion and it FAILED.
# This is the most important category — it must trigger a DIFFERENT
# answer, not a repeat.
NEGATIVE_FOLLOWUP_PATTERNS = [
    r"^no\b",
    r"^nope\b",
    r"^nah\b",
    r"(i\s*(have\s*)?(already\s*)?tried)",
    r"(already tried|done that|did that)",
    r"(still not|still doesn'?t|still isn'?t|still won'?t)",
    r"(didn'?t work|doesn'?t work|does not work|did not work)",
    r"(same error|same issue|same problem)",
    r"(not (helping|working|fixed|resolved))",
]

# Neutral follow-up — clarifying question, not a failure report
NEUTRAL_FOLLOWUP_PATTERNS = [
    r"^(ok|okay|i see|got it|alright|sure)[\s.,!?]*$",
    r"(what next|next step|what should i do|what do i do now|what else)",
    r"(can you|could you|please).{0,30}(explain|clarify|elaborate|more detail|step by step)",
    r"(summarize|summary|recap|explain again|what was the)",
    r"^(why|how|when|what|where).{0,50}\?$",
]

POSITIVE_FOLLOWUP_PATTERNS = [
    r"^yes\b", r"^yep\b", r"^yup\b", r"^yeah\b",
    r"(that worked|it worked|fixed it|solved it|resolved it)",
    r"(thank you|thanks)",
]


def detect_intent(message: str, has_history: bool) -> str:
    """
    Classify message before running NLP pipeline.
    Returns: greeting | escalate | negative_followup | neutral_followup |
             positive_followup | new_problem
    """
    msg = message.strip().lower()

    for p in GREETING_PATTERNS:
        if re.search(p, msg):
            return "greeting"

    for p in ESCALATION_PATTERNS:
        if re.search(p, msg):
            return "escalate"

    if has_history:
        for p in NEGATIVE_FOLLOWUP_PATTERNS:
            if re.search(p, msg):
                return "negative_followup"
        for p in POSITIVE_FOLLOWUP_PATTERNS:
            if re.search(p, msg):
                return "positive_followup"
        for p in NEUTRAL_FOLLOWUP_PATTERNS:
            if re.search(p, msg):
                return "neutral_followup"

    return "new_problem"


def _extract_last_ai_suggestion(conversation: list) -> str:
    """Pull the most recent assistant message from conversation history."""
    if not conversation:
        return ""
    for msg in reversed(conversation):
        if msg.get("role") == "assistant":
            return msg.get("content", "")
    return ""


def _extract_original_problem(conversation: list, fallback: str) -> str:
    """Pull the first user message — the original problem statement."""
    if not conversation:
        return fallback
    for msg in conversation:
        if msg.get("role") == "user":
            return msg.get("content", fallback)
    return fallback


# ─────────────────────────────────────────
# MAIN STREAMING PIPELINE
# ─────────────────────────────────────────
async def run_streaming(
    message:      str,
    conversation: list = None,
) -> AsyncGenerator[dict, None]:
    """
    Main AI pipeline.

    Flow:
      greeting           → immediate reply, no pipeline
      escalate           → triggers ticket creation directly
      negative_followup  → "that didn't work" → re-run pipeline with
                            explicit instruction to give a DIFFERENT
                            answer than the last suggestion
      neutral_followup    → clarifying question → re-run with context
      positive_followup   → "thanks, that worked" → handled by chat.py's
                            confirmation flow, shouldn't normally reach here
      new_problem         → check cache → NLP → RAG → qwen2.5
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

    # ── Build effective message based on intent ──────────────
    original_problem = _extract_original_problem(conversation, message)
    last_suggestion   = _extract_last_ai_suggestion(conversation)

    if intent == "negative_followup":
        # CRITICAL: explicitly tell the LLM the previous suggestion FAILED
        # and demand a different approach. This is what prevents the loop.
        effective_message = (
            f"ORIGINAL PROBLEM: {original_problem[:400]}\n\n"
            f"PREVIOUSLY SUGGESTED (DID NOT WORK): {last_suggestion[:400]}\n\n"
            f"The user says this did NOT fix the issue. "
            f"Do NOT repeat the same suggestion. Provide a DIFFERENT, "
            f"more advanced troubleshooting step or a deeper diagnostic. "
            f"If you have already given 2+ failed suggestions, recommend "
            f"escalating to a human engineer instead of trying more steps."
        )
        logger.info("[PIPELINE] Negative followup — instructing LLM to avoid repetition")

    elif intent == "neutral_followup":
        effective_message = (
            f"ORIGINAL PROBLEM: {original_problem[:400]}\n\n"
            f"PREVIOUS ANSWER: {last_suggestion[:400]}\n\n"
            f"User's follow-up question: {message}"
        )

    else:
        effective_message = message

    # ── Solution cache check (only for genuinely new problems) ──
    if intent == "new_problem":
        yield {"type": "status", "stage": "cache_check", "label": "Checking previous solutions..."}

        cache_hit = get_cached_solution(effective_message)
        if cache_hit:
            logger.info("[PIPELINE] Cache hit — skipping NLP/RAG/LLM")
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

    # For follow-ups, classify based on the ORIGINAL problem (more stable
    # category/tier) but keep the enriched effective_message for the LLM
    classify_text = original_problem if intent != "new_problem" else effective_message
    nlp_result = nlp_service.analyze(classify_text[:500])

    logger.info(
        f"[PIPELINE] tier={nlp_result.tier} category={nlp_result.category} "
        f"priority={nlp_result.priority}"
    )

    yield {"type": "status", "stage": "knowledge_base", "label": "Searching IT knowledge base..."}

    nlp_summary = (
        f"[{nlp_result.priority}][{nlp_result.severity.upper()}] "
        f"{nlp_result.category} issue. {effective_message[:600]}"
    )

    # Force tier2 (full RAG+LLM) for negative follow-ups — these need
    # real reasoning, not a quick canned tier1 answer
    effective_tier = "tier2" if intent == "negative_followup" else nlp_result.tier

    # ── Tier 1 / Tier 3a — simple, answer directly ────────────
    if effective_tier in ("tier1", "tier3a"):
        yield {"type": "status", "stage": "thinking", "label": "Generating your answer..."}

        result = await llm_service.generate(
            nlp_summary  = nlp_summary,
            conversation = conversation,
            raw_message  = effective_message,
        )

        response   = result["response"]
        confidence = result["confidence"]

        if confidence >= 0.75 and intent == "new_problem":
            store_solution(effective_message, response, confidence,
                           nlp_result.category, nlp_result.priority)

        yield {
            "type":                "result",
            "tier":                effective_tier,
            "response":            response,
            "confidence":          confidence,
            "nlp":                 nlp_result,
            "should_create_ticket": confidence <= CONFIDENCE_THRESHOLD,
        }
        return

    # ── Tier 2 — RAG + optional web search + qwen2.5 ──────────
    rag_result     = rag_service.search(nlp_summary)
    rag_context    = rag_result.get("context")
    rag_confidence = rag_result.get("confidence", 0)

    tavily_context = None
    if rag_confidence < 0.6:
        try:
            from backend.services.sanitizer_service import build_safe_query
            from backend.services.tavily_service import search as tavily_search
            safe_query    = build_safe_query(nlp_result)
            tavily_result = await tavily_search(safe_query)
            tavily_context = tavily_result.get("context")
            if tavily_context:
                yield {"type": "status", "stage": "web_search", "label": "Searching the web..."}
        except Exception as e:
            logger.warning(f"[PIPELINE] Tavily failed: {e}")

    yield {"type": "status", "stage": "thinking", "label": "Generating your answer..."}

    full_response = ""
    last_chunk    = ""

    async for token in llm_service.generate_stream(
        nlp_summary    = nlp_summary,
        rag_context    = rag_context,
        tavily_context = tavily_context,
        conversation   = conversation,
        raw_message    = effective_message,
    ):
        last_chunk = token
        if token.startswith('{"type"'):
            break
        full_response += token

    confidence = 0.55
    if last_chunk.startswith('{"type"'):
        try:
            confidence = json.loads(last_chunk).get("value", 0.55)
        except Exception:
            pass

    clean_response, extracted_confidence = extract_confidence(full_response)
    confidence = extracted_confidence

    if confidence >= 0.75 and intent == "new_problem":
        store_solution(effective_message, clean_response, confidence,
                       nlp_result.category, nlp_result.priority)

        if tavily_context:
            try:
                rag_service.store_web_result(
                    query          = effective_message[:200],
                    tavily_context = tavily_context,
                    category       = nlp_result.category,
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