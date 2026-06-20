# backend/services/chat_service.py
#
# WHAT THIS FILE DOES:
# Manages conversation state for the chatbot.
#
# Problems it solves:
#   Problem 1 — LLM has no memory between requests
#               Every POST /chat/message is a fresh HTTP call
#               We must manually send history each time
#
#   Problem 2 — Long history = slow + hallucinates
#               We summarize turns older than 4
#               LLM only sees: summary + last 2 turns
#
#   Problem 3 — Infinite conversations
#               Hard limit of 8 turns then force resolution
#               Prevents LLM from going in circles forever

import logging
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────
MAX_TURNS          = 8     # hard limit — force escalation after this
SUMMARIZE_AFTER    = 4     # summarize turns older than this
MAX_HISTORY_CHARS  = 4000  # cap total history size


# ─────────────────────────────────────────
# DATA STRUCTURES
# ─────────────────────────────────────────
@dataclass
class Turn:
    """One exchange — one user message + one AI reply."""
    role:       str        # "user" or "assistant"
    content:    str
    timestamp:  datetime = field(default_factory=datetime.utcnow)
    confidence: float = 0.0    # AI confidence for assistant turns


@dataclass
class ChatSession:
    """
    Full conversation state for one user session.
    Stored in memory — one session per user per conversation.
    
    Why in memory and not DB?
    Active conversations are temporary — only the final
    resolved/escalated state gets saved to PostgreSQL.
    During the conversation we need fast read/write
    without DB overhead on every turn.
    """
    session_id:   str
    user_id:      int
    channel:      str          # "chat" | "voice"
    turns:        list = field(default_factory=list)
    summary:      str  = ""    # compressed summary of old turns
    turn_count:   int  = 0
    created_at:   datetime = field(default_factory=datetime.utcnow)
    updated_at:   datetime = field(default_factory=datetime.utcnow)
    resolved:     bool = False
    escalated:    bool = False
    awaiting_confirmation: bool = False  
    
    def add_turn(self, role: str, content: str, confidence: float = 0.0):
        self.turns.append(Turn(
            role=role,
            content=content,
            confidence=confidence
        ))
        if role == "user":
            self.turn_count += 1
        self.updated_at = datetime.utcnow()

    def get_recent_turns(self, n: int = 4) -> list[dict]:
        """Get last n turns as list of dicts for LLM prompt."""
        recent = self.turns[-n:] if len(self.turns) > n else self.turns
        return [{"role": t.role, "content": t.content} for t in recent]

    def get_full_history(self) -> list[dict]:
        """Get all turns as list of dicts."""
        return [{"role": t.role, "content": t.content} for t in self.turns]

    def is_at_limit(self) -> bool:
        return self.turn_count >= MAX_TURNS

    def last_ai_confidence(self) -> float:
        """Get confidence of the most recent AI response."""
        for turn in reversed(self.turns):
            if turn.role == "assistant":
                return turn.confidence
        return 0.0

    def to_ticket_content(self) -> str:
        """
        Convert full conversation to ticket raw_content.
        Called when escalating — chat becomes ticket description.
        """
        lines = []
        for t in self.turns:
            prefix = "USER" if t.role == "user" else "AI"
            lines.append(f"{prefix}: {t.content}")
        return "\n".join(lines)


# ─────────────────────────────────────────
# SESSION STORE
# In-memory dict: session_id → ChatSession
# ─────────────────────────────────────────
_sessions: dict[str, ChatSession] = {}


def create_session(
    session_id: str,
    user_id:    int,
    channel:    str = "chat"
) -> ChatSession:
    """
    Create a new chat session.
    Called when user starts a new conversation.
    """
    session = ChatSession(
        session_id = session_id,
        user_id    = user_id,
        channel    = channel,
    )
    _sessions[session_id] = session
    logger.info(f"[CHAT] Session created — {session_id} for user {user_id}")
    return session


def get_session(session_id: str) -> Optional[ChatSession]:
    """Get existing session. Returns None if not found."""
    return _sessions.get(session_id)


def get_or_create_session(
    session_id: str,
    user_id:    int,
    channel:    str = "chat"
) -> ChatSession:
    """
    Get existing session or create new one.
    Used by chat router on every message.
    """
    session = get_session(session_id)
    if not session:
        session = create_session(session_id, user_id, channel)
    return session


def delete_session(session_id: str):
    """
    Remove session from memory.
    Called after ticket is created or conversation resolved.
    """
    if session_id in _sessions:
        del _sessions[session_id]
        logger.info(f"[CHAT] Session deleted — {session_id}")


def add_user_message(session_id: str, message: str):
    """Add user message to session history."""
    session = _sessions.get(session_id)
    if session:
        session.add_turn("user", message)


def add_ai_response(session_id: str, response: str, confidence: float = 0.0):
    """Add AI response to session history."""
    session = _sessions.get(session_id)
    if session:
        session.add_turn("assistant", response, confidence)


# ─────────────────────────────────────────
# CONTEXT BUILDER
# Prepares history for LLM — summarizes if needed
# ─────────────────────────────────────────
async def build_context_for_llm(session: ChatSession) -> tuple[list, str]:
    """
    Prepare conversation context for LLM prompt.

    Strategy:
      Turns 1 to N-4:  summarized into one paragraph
      Last 4 turns:    sent in full

    Why?
      Full history of 8 turns = ~2000 tokens (slow + confusion)
      Summary + last 2 turns = ~400 tokens (fast + focused)

    Returns:
      (recent_turns, summary_text)
      Both are passed to llm_service.build_prompt()
    """
    total_turns = len(session.turns)

    # Short conversation — send everything
    if total_turns <= SUMMARIZE_AFTER * 2:
        return session.get_recent_turns(SUMMARIZE_AFTER * 2), session.summary

    # Long conversation — summarize old turns
    old_turns  = session.turns[:-4]      # everything except last 4
    recent     = session.get_recent_turns(4)

    # Only re-summarize if we have new old turns to add
    if not session.summary or len(old_turns) > len(session.turns) - 6:
        logger.info(f"[CHAT] Summarizing {len(old_turns)} old turns")
        from .llm_services import summarize_conversation
        old_as_dicts = [{"role": t.role, "content": t.content} for t in old_turns]
        session.summary = await summarize_conversation(old_as_dicts)
        logger.info(f"[CHAT] Summary: {session.summary[:80]}...")

    return recent, session.summary


# ─────────────────────────────────────────
# ESCALATION DECISION
# Should this conversation become a ticket?
# ─────────────────────────────────────────
def should_escalate(session: ChatSession, confidence: float) -> tuple[bool, str]:
    if session.is_at_limit():
        return True, f"Turn limit reached ({MAX_TURNS} turns)"

    if confidence < 0.5:
        return True, f"AI confidence too low ({confidence})"

    # Safety net — if AI still repeated itself despite the new prompting,
    # escalate immediately rather than looping further
    ai_turns = [t.content for t in session.turns if t.role == "assistant"]
    if len(ai_turns) >= 2:
        last_two = ai_turns[-2:]
        if last_two[0][:100] == last_two[1][:100]:
            return True, "AI gave a repeated response — escalating"

    if session.turns:
        last_user_msg = next(
            (t.content.lower() for t in reversed(session.turns) if t.role == "user"), ""
        )
        escalation_phrases = [
            "talk to human", "talk to agent", "human agent",
            "raise ticket", "raise a ticket", "raise the ticket",
            "create ticket", "create a ticket",
            "helpdesk", "speak to someone", "real person", "not helpful",
        ]
        if any(phrase in last_user_msg for phrase in escalation_phrases):
            return True, "User requested escalation"

        recent_user_msgs = [
            t.content.lower().strip() for t in session.turns[-6:] if t.role == "user"
        ]
        no_count = sum(
            1 for m in recent_user_msgs
            if m in ("no", "nope", "nah") or m.startswith("no ")
        )
        if no_count >= 3:  # raised threshold — give the new prompting a chance first
            return True, "Multiple unsuccessful attempts — escalating"

    return False, ""

# ─────────────────────────────────────────
# SESSION STATS — for debugging
# ─────────────────────────────────────────
def get_session_stats() -> dict:
    """Return stats about active sessions."""
    return {
        "active_sessions": len(_sessions),
        "session_ids":     list(_sessions.keys()),
        "total_turns":     sum(s.turn_count for s in _sessions.values()),
    }