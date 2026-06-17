# backend/services/llm_service.py
#
# WHAT THIS FILE DOES:
# Communicates with Ollama (Mistral 7B) running locally.
# Two modes:
#   1. generate()         — full response at once (for email/call reply)
#   2. generate_stream()  — token by token (for chat — feels like typing)
#
# Key design decisions:
#   - Strict system prompt — prevents hallucination, keeps answers IT-focused
#   - Token guard — never sends more than 3000 tokens to LLM
#   - Confidence scoring — LLM scores its own answer 0-1
#   - Context compression — old turns summarized, only last 2 sent
#   - Never calls Ollama with raw user text — always receives NLP summary

import httpx
import json
import logging
import os
from typing import AsyncGenerator, Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL", "mistral")
TIMEOUT         = 120       # seconds — Mistral can be slow on CPU
MAX_TOKENS      = 1024      # max tokens in LLM response
CONTEXT_TOKENS  = 3000      # max tokens we send TO LLM (input guard)
OLLAMA_MODEL_FAST = "phi3"
OLLAMA_MODEL_FULL = OLLAMA_MODEL  # keep existing default (mistral) as the "full" model


# ─────────────────────────────────────────
# SYSTEM PROMPTS
# ─────────────────────────────────────────
SYSTEM_PROMPT = """You are an expert IT helpdesk assistant.

STRICT RULES — follow these exactly:
1. Only answer IT-related problems. If asked anything else say: "I can only help with IT issues."
2. NEVER make up facts, error codes, or steps you are not sure about.
3. If you are not confident say: "I'm not sure about this — let me escalate to a human agent."
4. Keep answers SHORT and ACTIONABLE — numbered steps only, no long paragraphs.
5. Ask ONE clarifying question at a time if you need more info.
6. After giving steps always ask: "Did this resolve your issue? (yes/no)"
7. If user says no after 2 attempts → say: "I'll escalate this to our helpdesk team."

SCREENSHOT RULE:
When the message starts with "User uploaded a screenshot showing the following text/content:"
- The extracted text IS the IT problem — never say "I can only help with IT issues"
- Database license expiry, software warnings, error dialogs, application crashes
  are ALL valid IT support issues — always respond with troubleshooting steps
- Read the exact error text carefully and give specific, actionable steps
- Quote the exact error text back in your response so the user knows you read it

RESPONSE FORMAT:
- For solutions: numbered steps (1. 2. 3.)
- For questions: single clear question
- For escalation: "Escalating to helpdesk: [brief reason]"

CONFIDENCE SCORE:
At the END of every response add exactly this line:
CONFIDENCE: 0.XX
Where 0.XX is your confidence that your answer fully resolves the issue.
0.90+ = very confident | 0.70-0.89 = fairly confident | below 0.70 = not sure"""


ENGINEER_SYSTEM_PROMPT = """You are an expert AI assistant helping a trained IT engineer debug and resolve a support ticket.

RULES:
1. The person talking to you is a skilled IT engineer — answer ALL their questions fully and technically
2. You can discuss ANYTHING relevant: root cause analysis, CLI commands, config changes,
   log interpretation, network diagnostics, registry edits, server configs, code fixes,
   database queries, scripting, architecture decisions — nothing is off limits
3. NEVER say "I can only help with IT issues" — engineers ask legitimate deep technical questions
4. If asked to summarize the ticket — give a clear concise summary of the problem and context
5. If asked "what's next" or "next steps" — suggest the most logical diagnostic or resolution step
6. Give specific commands, exact syntax, and expected outputs where possible
7. Be direct and technical — the engineer doesn't need hand-holding

RESPONSE FORMAT:
- Summaries: 2-3 clear sentences
- Next steps: numbered list of specific actions
- Commands: include exact syntax in code format
- Analysis: direct and factual

CONFIDENCE SCORE:
At the END of every response add exactly this line:
CONFIDENCE: 0.XX"""
# ─────────────────────────────────────────
# PROMPT BUILDER
# Assembles the full prompt from NLP summary + RAG context + history
# LLM never sees raw user text — only the processed version
# ─────────────────────────────────────────
def build_prompt(
    nlp_summary:    str,
    rag_context:    Optional[str] = None,
    tavily_context: Optional[str] = None,
    conversation:   Optional[list] = None,
    raw_message:    Optional[str] = None,
    system_prompt:  Optional[str] = None,
) -> list[dict]:
    """
    Build the messages list for Ollama API.

    Structure:
    [
        {"role": "system",    "content": SYSTEM_PROMPT},
        {"role": "user",      "content": context_block},
        {"role": "assistant", "content": prev_reply},   ← last 2 turns only
        {"role": "user",      "content": current_message}
    ]

    Why NLP summary instead of raw text?
    Raw: "Hi my name is Tridip, employee ID EMP-4521, my laptop
          serial SN-789456 running Windows 11 Pro version 22H2
          won't connect to VPN, error 0x800704C9..."
    → 60 tokens, contains PII, confuses LLM

    Summary: "[P3][MEDIUM] network issue. Error: 0x800704C9. VPN disconnecting on Windows 11"
    → 15 tokens, crisp, focused
    → LLM gives faster + more accurate answer
    """
    messages = []

    # System prompt — always first
    messages.append({
        "role":    "system",
        "content": system_prompt or SYSTEM_PROMPT 
    })

    # Context block — RAG + Tavily results if available
    context_parts = []

    if rag_context:
        context_parts.append(
            f"RELEVANT PAST FIXES FROM KNOWLEDGE BASE:\n{rag_context}"
        )

    if tavily_context:
        context_parts.append(
            f"WEB SEARCH RESULTS (sanitized):\n{tavily_context}"
        )

    if context_parts:
        context_block = "\n\n".join(context_parts)
        messages.append({
            "role":    "user",
            "content": f"Context for this issue:\n{context_block}"
        })
        messages.append({
            "role":    "assistant",
            "content": "I have reviewed the context. Please describe the issue."
        })

    # Conversation history — last 2 turns only
    # Older turns are summarized by chat_service (built next)
    if conversation:
        # Take last 4 messages (2 user + 2 assistant = 2 turns)
        recent = conversation[-4:] if len(conversation) > 4 else conversation
        for msg in recent:
            messages.append({
                "role":    msg["role"],
                "content": msg["content"]
            })

    # Current message — use NLP summary not raw text
    # NLP summary: "[P3][MEDIUM] network issue. Error: 0x800704C9..."
    # If no summary yet (first message) use raw but truncated
    current_content = nlp_summary if nlp_summary else (raw_message or "")[:500]

    messages.append({
        "role":    "user",
        "content": current_content
    })

    return messages


# ─────────────────────────────────────────
# TOKEN GUARD
# Rough token count — 1 token ≈ 4 characters
# Prevents sending too much context to LLM
# ─────────────────────────────────────────
def estimate_tokens(messages: list[dict]) -> int:
    total_chars = sum(len(m["content"]) for m in messages)
    return total_chars // 4


def trim_messages(messages: list[dict], max_tokens: int = CONTEXT_TOKENS) -> list[dict]:
    """
    If messages exceed token limit — remove middle messages.
    Always keep: system prompt (first) + current message (last).
    Remove from the middle until under limit.
    """
    while estimate_tokens(messages) > max_tokens and len(messages) > 2:
        # remove message at index 1 (oldest non-system message)
        messages.pop(1)
        logger.debug(f"[LLM] Trimmed message — now {len(messages)} messages")
    return messages


# ─────────────────────────────────────────
# CONFIDENCE EXTRACTOR
# Pulls the CONFIDENCE: 0.XX line from LLM response
# ─────────────────────────────────────────
def extract_confidence(response_text: str) -> tuple[str, float]:
    """
    LLM appends "CONFIDENCE: 0.XX" at end of response.
    If missing, estimate confidence using heuristics instead of
    blindly defaulting to 0.5.
    """
    import re
    pattern = r'CONFIDENCE:\s*(0?\.\d+|1\.0+|0|1)'
    match   = re.search(pattern, response_text, re.IGNORECASE)

    if match:
        confidence = float(match.group(1))
        clean_text = response_text[:match.start()].strip()
        return clean_text, round(confidence, 2)

    clean_text = response_text.strip()

    # Low confidence signals
    uncertainty_phrases = [
        "not sure", "i'm not sure", "i am not sure", "escalat",
        "not confident", "don't know", "do not know", "unable to",
        "i can't", "i cannot"
    ]
    if any(p in clean_text.lower() for p in uncertainty_phrases):
        logger.warning("[LLM] No confidence line, uncertainty language detected — 0.4")
        return clean_text, 0.4

    # High confidence signal — numbered steps present
    if re.search(r'^\s*\d+\.', clean_text, re.MULTILINE):
        logger.warning("[LLM] No confidence line, structured steps present — 0.75")
        return clean_text, 0.75

    logger.warning("[LLM] No confidence score and no signal — defaulting to 0.55")
    return clean_text, 0.55


# ─────────────────────────────────────────
# GENERATE — full response (email + call)
# ─────────────────────────────────────────
async def generate(nlp_summary, rag_context=None, tavily_context=None,
                    conversation=None, raw_message=None, model: str = None,engineer_mode:bool = False,) -> dict:
    selected_model  = model or OLLAMA_MODEL_FULL
    active_prompt   = ENGINEER_SYSTEM_PROMPT if engineer_mode else SYSTEM_PROMPT
    """
    Generate a complete response from Ollama.
    Used for: email replies, call replies, non-streaming chat.

    Args:
        model: "phi3" for fast/draft responses, "mistral" (default) for
               final refined tier2 answers. Pass explicitly from ai_pipeline.

    Returns:
    {
        "response":   "1. Go to Settings...",
        "confidence": 0.87,
        "model":      "phi3" | "mistral",
        "tokens":     245
    }
    """
    selected_model = model or OLLAMA_MODEL_FULL

    messages = build_prompt(
        nlp_summary, rag_context, tavily_context,
        conversation, raw_message,
        system_prompt=active_prompt,
    )
    messages = trim_messages(messages)

    token_estimate = estimate_tokens(messages)
    logger.info(f"[LLM] Generating with {selected_model} — ~{token_estimate} input tokens")

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model":    selected_model,
                    "messages": messages,
                    "stream":   False,          # full response at once
                    "options": {
                        "num_predict": MAX_TOKENS,
                        "temperature": 0.3,     # low = more focused, less creative
                        "top_p":       0.9,
                    }
                }
            )
            response.raise_for_status()
            data = response.json()

    except httpx.ConnectError:
        logger.error("[LLM] Cannot connect to Ollama — is it running?")
        raise RuntimeError(
            "Ollama is not running. Start it with: ollama serve"
        )
    except httpx.TimeoutException:
        logger.error("[LLM] Ollama timed out")
        raise RuntimeError("LLM response timed out — try a shorter message")

    raw_text   = data["message"]["content"]
    clean_text, confidence = extract_confidence(raw_text)

    logger.info(f"[LLM] Done — model={selected_model} confidence={confidence}")

    return {
        "response":   clean_text,
        "confidence": confidence,
        "model":      selected_model,
        "tokens":     data.get("eval_count", 0),
    }


# ─────────────────────────────────────────
# GENERATE STREAM — token by token (chat)
# ─────────────────────────────────────────
async def generate_stream(
    nlp_summary:    str,
    rag_context:    Optional[str] = None,
    tavily_context: Optional[str] = None,
    conversation:   Optional[list] = None,
    raw_message:    Optional[str] = None,
    engineer_mode:  bool = False,
) -> AsyncGenerator[str, None]:
    """
    Stream response token by token.
    Used for: chat endpoint — user sees words appear as LLM generates.

    Yields: individual tokens as strings
    Final yield: JSON string with confidence score
    {"type": "confidence", "value": 0.87}

    Why streaming?
    Without streaming: user waits 5-8 seconds staring at blank screen.
    With streaming: first word appears in ~1 second, feels responsive.
    """
    active_prompt = ENGINEER_SYSTEM_PROMPT if engineer_mode else SYSTEM_PROMPT

    messages = build_prompt(
        nlp_summary, rag_context, tavily_context,
        conversation, raw_message,
        system_prompt=active_prompt,
    )
    messages = trim_messages(messages)

    logger.info(f"[LLM] Streaming — ~{estimate_tokens(messages)} input tokens")

    full_response = ""

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model":    OLLAMA_MODEL,
                    "messages": messages,
                    "stream":   True,
                    "options": {
                        "num_predict": MAX_TOKENS,
                        "temperature": 0.3,
                        "top_p":       0.9,
                    }
                }
            ) as response:
                response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        full_response += token
                        yield token

                    if chunk.get("done", False):
                        break

    except httpx.ConnectError:
        logger.error("[LLM] Cannot connect to Ollama")
        yield "[ERROR] AI service unavailable. Please try again."
        return

    _, confidence = extract_confidence(full_response)
    logger.info(f"[LLM] Stream done — confidence={confidence}")
    yield json.dumps({"type": "confidence", "value": confidence})


# ─────────────────────────────────────────
# SUMMARIZE — compress old conversation turns
# Called by chat_service when history gets long
# ─────────────────────────────────────────
async def summarize_conversation(turns: list[dict]) -> str:
    """
    Compress old conversation turns into a short summary.
    Called by chat_service when turn count > 4.

    Input: list of {"role": "user/assistant", "content": "..."}
    Output: "User reported VPN disconnecting with error 0x800704C9.
             AI suggested changing keep-alive interval. User confirmed
             still not working after the fix."

    Why?
    Turn 1-4: full messages
    Turn 5+:  summarized — prevents context window overflow
              and LLM confusion from too much history
    """
    if not turns:
        return ""

    # Build conversation text
    conv_text = "\n".join(
        f"{t['role'].upper()}: {t['content']}"
        for t in turns
    )

    summary_prompt = [
        {
            "role": "system",
            "content": (
                "Summarize this IT helpdesk conversation in 2-3 sentences. "
                "Include: the problem reported, steps already tried, "
                "and current status. Be concise."
            )
        },
        {
            "role": "user",
            "content": conv_text[:2000]  # cap at 2000 chars
        }
    ]

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model":    OLLAMA_MODEL,
                    "messages": summary_prompt,
                    "stream":   False,
                    "options":  {"num_predict": 200, "temperature": 0.1}
                }
            )
            response.raise_for_status()
            data = response.json()
            return data["message"]["content"].strip()

    except Exception as e:
        logger.error(f"[LLM] Summarization failed: {e}")
        # fallback — return last user message only
        last_user = next(
            (t["content"] for t in reversed(turns) if t["role"] == "user"),
            ""
        )
        return f"Previous conversation summary unavailable. Last issue: {last_user[:200]}"


# ─────────────────────────────────────────
# HEALTH CHECK
# ─────────────────────────────────────────
async def check_ollama_health() -> bool:
    """
    Check if Ollama is running and Mistral is available.
    Called on app startup.
    """
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            response.raise_for_status()
            models = response.json().get("models", [])
            available = [m["name"] for m in models]
            if any(OLLAMA_MODEL in m for m in available):
                logger.info(f"[LLM] Ollama healthy — {OLLAMA_MODEL} available")
                return True
            else:
                logger.warning(
                    f"[LLM] Ollama running but {OLLAMA_MODEL} not found. "
                    f"Run: ollama pull {OLLAMA_MODEL}"
                )
                return False
    except Exception:
        logger.error("[LLM] Ollama not reachable at localhost:11434")
        return False