# backend/models/knowledge_gap.py
#
# Logs low-confidence AI responses for admin review.
# Helps identify categories/topics where the knowledge base
# is missing information (Phase 7 — Knowledge gap detector).

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, Text
from backend.database import Base


class KnowledgeGap(Base):
    __tablename__ = "knowledge_gaps"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    category    = Column(String, nullable=False)
    priority    = Column(String, nullable=True)
    tier        = Column(String, nullable=False)
    summary     = Column(Text, nullable=False)       # NLP summary of the query
    confidence  = Column(Float, nullable=False)
    rag_sources = Column(Text, nullable=True)        # comma-joined sources, if any
    tavily_used = Column(String, nullable=True)      # "true"/"false"
    source      = Column(String, nullable=False)     # "chat" | "email" | "call"
    created_at  = Column(DateTime, default=datetime.utcnow)