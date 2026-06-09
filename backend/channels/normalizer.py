# backend/channels/normalizer.py

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Literal
from uuid import uuid4

ChannelSource = Literal["email", "chat", "call"]

@dataclass
class TicketInput:
    """
    Unified input contract for all channels.
    Every handler (email, chat, call) must produce this exact shape.
    The AI pipeline only ever sees TicketInput — never raw channel data.
    """
    source: ChannelSource                        
    user_id: int                                 
    raw_content: str                             
    subject: str                                 
    timestamp: datetime = field(default_factory=datetime.utcnow)
    intake_id: str = field(default_factory=lambda: str(uuid4()))
    attachments: list[str] = field(default_factory=list)   
    metadata: dict = field(default_factory=dict)           

    def to_dict(self) -> dict:
        return {
            "intake_id":   self.intake_id,
            "source":      self.source,
            "user_id":     self.user_id,
            "subject":     self.subject,
            "raw_content": self.raw_content,
            "timestamp":   self.timestamp.isoformat(),
            "attachments": self.attachments,
            "metadata":    self.metadata,
        }