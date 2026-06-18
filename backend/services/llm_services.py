# backend/services/llm_services.py
#
# LLM service — now using qwen2.5:7b only
# Removed phi3 (draft model) — qwen2.5 handles everything
# qwen2.5 advantages over mistral 7B:
#   - 32K context window (vs 4K)
#   - Better instruction following
#   - Better at structured output (numbered steps, CONFIDENCE line)

import httpx
import json
import logging
import os
from typing import AsyncGenerator, Optional

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL   = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL      = "qwen2.5:7b"   # single model — no more phi3/mistral split
OLLAMA_MODEL_FAST = "qwen2.5:7b"   # kept for compatibility — same model
OLLAMA_MODEL_FULL = "qwen2.5:7b"   # kept for compatibility — same model
TIMEOUT           = 120
MAX_TOKENS        = 1024
CONTEXT_TOKENS    = 6000            # qwen2.5 supports 32K, we use 6K for speed


SYSTEM_PROMPT = """You are an expert IT helpdesk assistant.

STRICT RULES — follow these exactly:
1. Only answer IT-related problems. If asked anything else say: "I can only help with IT issues."
2. NEVER make up facts, error codes, or steps you are not sure about.
3. If you are not confident say: "I'm not sure about this — let me escalate to a human agent."
4. Keep answers SHORT and ACTIONABLE — numbered steps only, no long paragraphs.
5. Ask ONE clarifying question at a time if you need more info.
6. After giving steps always ask: "Did this resolve your issue? (yes/no)"
7. If user says no after 2 attempts → say: "I'll escalate this to our helpdesk team."

CONVERSATION CONTINUITY RULE — CRITICAL:
- If conversation history shows an IT problem was already discussed,
  treat ALL follow-up messages as part of that same conversation.
- "I tried that", "still not working", "what next", "can you explain more",
  "please raise a ticket", "escalate this" — ALL valid follow-ups to an IT issue.
- NEVER say "I can only help with IT issues" when there is conversation history.
- Read the previous messages carefully and respond in context.

SCREENSHOT RULE:
When the message starts with "User uploaded a screenshot showing the following text/content:"
- The extracted text IS the IT problem — always respond with troubleshooting steps
- Never say "I can only help with IT issues" for screenshot messages
- Quote the exact error text back in your response

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
1. The person is a skilled IT engineer — answer ALL questions fully and technically
2. Discuss anything relevant: CLI commands, config changes, log analysis, network diagnostics,
   registry edits, server configs, code fixes, database queries, scripting — nothing is off limits
3. NEVER say "I can only help with IT issues"
4. If asked to summarize — give a clear concise summary of the problem and context
5. If asked "what's next" — suggest the most logical diagnostic or resolution step
6. Give specific commands with exact syntax where possible
7. Be direct and technical

RESPONSE FORMAT:
- Summaries: 2-3 clear sentences
- Next steps: numbered list of specific actions
- Commands: exact syntax

CONFIDENCE SCORE:
At the END of every response add exactly:
CONFIDENCE: 0.XX"""


def build_prompt(
    nlp_summary:    str,
    rag_context:    Optional[str] = None,
    tavily_context: Optional[str] = None,
    conversation:   Optional[list] = None,
    raw_message:    Optional[str] = None,
    system_prompt:  Optional[str] = None,
) -> list[dict]:
    messages = []

    messages.append({
        "role":    "system",
        "content": system_prompt or SYSTEM_PROMPT,
    })

    context_parts = []
    if rag_context:
        context_parts.append(f"RELEVANT PAST FIXES FROM KNOWLEDGE BASE:\n{rag_context}")
    if tavily_context:
        context_parts.append(f"WEB SEARCH RESULTS (sanitized):\n{tavily_context}")

    if context_parts:
        context_block = "\n\n".join(context_parts)
        messages.append({"role": "user",      "content": f"Context for this issue:\n{context_block}"})
        messages.append({"role": "assistant", "content": "I have reviewed the context. Please describe the issue."})

    if conversation:
        recent = conversation[-6:] if len(conversation) > 6 else conversation
        for msg in recent:
            messages.append({"role": msg["role"], "content": msg["content"]})

    current_content = nlp_summary if nlp_summary else (raw_message or "")[:500]
    messages.append({"role": "user", "content": current_content})

    return messages


def estimate_tokens(messages: list[dict]) -> int:
    return sum(len(m["content"]) for m in messages) // 4


def trim_messages(messages: list[dict], max_tokens: int = CONTEXT_TOKENS) -> list[dict]:
    while estimate_tokens(messages) > max_tokens and len(messages) > 2:
        messages.pop(1)
    return messages


def extract_confidence(response_text: str) -> tuple[str, float]:
    import re
    pattern = r'CONFIDENCE:\s*(0?\.\d+|1\.0+|0|1)'
    match   = re.search(pattern, response_text, re.IGNORECASE)

    if match:
        confidence = float(match.group(1))
        clean_text = response_text[:match.start()].strip()
        return clean_text, round(confidence, 2)

    clean_text = response_text.strip()

    uncertainty_phrases = [
        "not sure", "i'm not sure", "escalat", "not confident",
        "don't know", "do not know", "unable to", "i can't", "i cannot"
    ]
    if any(p in clean_text.lower() for p in uncertainty_phrases):
        logger.warning("[LLM] No confidence line, uncertainty detected — 0.4")
        return clean_text, 0.4

    import re as _re
    if _re.search(r'^\s*\d+\.', clean_text, _re.MULTILINE):
        logger.warning("[LLM] No confidence line, structured steps — 0.75")
        return clean_text, 0.75

    logger.warning("[LLM] No confidence line — defaulting 0.55")
    return clean_text, 0.55


async def generate(
    nlp_summary,
    rag_context    = None,
    tavily_context = None,
    conversation   = None,
    raw_message    = None,
    model:          str  = None,
    engineer_mode:  bool = False,
) -> dict:
    selected_model = model or OLLAMA_MODEL
    active_prompt  = ENGINEER_SYSTEM_PROMPT if engineer_mode else SYSTEM_PROMPT

    messages = build_prompt(
        nlp_summary, rag_context, tavily_context,
        conversation, raw_message,
        system_prompt=active_prompt,
    )
    messages = trim_messages(messages)

    logger.info(f"[LLM] Generating with {selected_model} — ~{estimate_tokens(messages)} tokens")

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model":    selected_model,
                    "messages": messages,
                    "stream":   False,
                    "options": {
                        "num_predict": MAX_TOKENS,
                        "temperature": 0.3,
                        "top_p":       0.9,
                    }
                }
            )
            response.raise_for_status()
            data = response.json()

    except httpx.ConnectError:
        raise RuntimeError("Ollama is not running. Start it with: ollama serve")
    except httpx.TimeoutException:
        raise RuntimeError("LLM response timed out")

    raw_text           = data["message"]["content"]
    clean_text, confidence = extract_confidence(raw_text)

    logger.info(f"[LLM] Done — model={selected_model} confidence={confidence}")

    return {
        "response":   clean_text,
        "confidence": confidence,
        "model":      selected_model,
        "tokens":     data.get("eval_count", 0),
    }


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
    Used for chat endpoint — user sees words appear as LLM generates.
    Yields individual tokens, then final confidence JSON.
    """
    active_prompt = ENGINEER_SYSTEM_PROMPT if engineer_mode else SYSTEM_PROMPT

    messages = build_prompt(
        nlp_summary, rag_context, tavily_context,
        conversation, raw_message,
        system_prompt=active_prompt,
    )
    messages = trim_messages(messages)

    logger.info(f"[LLM] Streaming — ~{estimate_tokens(messages)} tokens")

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
        yield "[ERROR] AI service unavailable."
        return

    _, confidence = extract_confidence(full_response)
    logger.info(f"[LLM] Stream done — confidence={confidence}")
    yield json.dumps({"type": "confidence", "value": confidence})


async def summarize_conversation(turns: list[dict]) -> str:
    if not turns:
        return ""

    conv_text = "\n".join(f"{t['role'].upper()}: {t['content']}" for t in turns)

    summary_prompt = [
        {"role": "system", "content": (
            "Summarize this IT helpdesk conversation in 2-3 sentences. "
            "Include: the problem reported, steps already tried, and current status."
        )},
        {"role": "user", "content": conv_text[:2000]}
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
            return response.json()["message"]["content"].strip()
    except Exception as e:
        logger.error(f"[LLM] Summarization failed: {e}")
        last_user = next((t["content"] for t in reversed(turns) if t["role"] == "user"), "")
        return f"Previous conversation. Last issue: {last_user[:200]}"


async def check_ollama_health() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            response.raise_for_status()
            models    = response.json().get("models", [])
            available = [m["name"] for m in models]
            if any("qwen2.5" in m for m in available):
                logger.info("[LLM] Ollama healthy — qwen2.5 available")
                return True
            else:
                logger.warning("[LLM] qwen2.5 not found — run: ollama pull qwen2.5:7b")
                return False
    except Exception:
        logger.error("[LLM] Ollama not reachable at localhost:11434")
        return False