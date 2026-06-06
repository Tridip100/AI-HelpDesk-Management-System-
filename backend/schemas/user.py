from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from backend.models.user import UserRole


# ════════════════════════════════════════════════
# REQUEST SHAPES  (what comes IN from React)
# ════════════════════════════════════════════════

class UserUpdateRequest(BaseModel):
    """
    Admin sends this to update a user.
    Every field is Optional — only include what you want to change.
    e.g. just change role:  { "role": "engineer" }
    e.g. deactivate:        { "is_active": false }
    """
    full_name: Optional[str]      = None
    role:      Optional[UserRole] = None
    is_active: Optional[bool]     = None


class PasswordResetRequest(BaseModel):
    """
    Admin resets ANY user's password.
    No old password needed — admin has full authority.
    """
    new_password: str


class ChangePasswordRequest(BaseModel):
    """
    A user changes their OWN password.
    Must provide old password to prove it's really them.
    """
    old_password: str
    new_password: str


# ════════════════════════════════════════════════
# RESPONSE SHAPES  (what goes OUT to React)
# ════════════════════════════════════════════════

class UserBrief(BaseModel):
    """
    Minimal user info — embedded inside other responses.
    Used when a ticket response needs to show who created or is assigned to it.

    Example inside a ticket response:
    {
        "assigned_to_user": {
            "id": "abc-123",
            "username": "charlie",
            "full_name": "Charlie Engineer",
            "role": "engineer"
        }
    }
    """
    id:        str
    username:  str
    full_name: str
    role:      UserRole

    class Config:
        from_attributes = True  # lets Pydantic read from SQLAlchemy model directly


class UserOut(BaseModel):
    """
    Full user object — sent to admin when managing users.
    Includes is_active and created_at.
    NEVER includes hashed_password — that field never leaves the server.
    """
    id:         str
    email:      str
    username:   str
    full_name:  str
    role:       UserRole
    is_active:  bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserProfileOut(BaseModel):
    """
    What a logged-in user sees about their own account.
    No is_active field — a user doesn't need to know that.
    """
    id:         str
    email:      str
    username:   str
    full_name:  str
    role:       UserRole
    created_at: datetime

    class Config:
        from_attributes = True