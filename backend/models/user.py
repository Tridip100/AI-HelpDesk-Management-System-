from sqlalchemy import Column, String, Boolean, DateTime, Enum
from sqlalchemy.dialects.sqlite import TEXT
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from backend.database import Base


class UserRole(str, enum.Enum):
    user = "user"           # normal employee
    helpdesk = "helpdesk"   # IT helpdesk member
    engineer = "engineer"   # IT engineer
    admin = "admin"         # full access


class User(Base):
    __tablename__ = "users"

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email        = Column(String, unique=True, nullable=False, index=True)
    username     = Column(String, unique=True, nullable=False, index=True)
    full_name    = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role         = Column(Enum(UserRole), default=UserRole.user, nullable=False)
    is_active    = Column(Boolean, default=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # relationships
    tickets_raised    = relationship("Ticket", back_populates="created_by_user",
                                     foreign_keys="Ticket.created_by")
    tickets_assigned  = relationship("Ticket", back_populates="assigned_to_user",
                                     foreign_keys="Ticket.assigned_to")
    events            = relationship("TicketEvent", back_populates="actor_user")

    def __repr__(self):
        return f"<User {self.username} [{self.role}]>"