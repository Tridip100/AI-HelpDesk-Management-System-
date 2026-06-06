from pydantic import BaseModel, EmailStr
from typing import Optional
from backend.models.user import UserRole


class RegisterRequest(BaseModel):
    """
    What React sends when a new user signs up.
    EmailStr automatically validates the email format.
    """
    email:     EmailStr
    username:  str
    full_name: str
    password:  str
    role:      UserRole = UserRole.user  # default: normal user unless specified


class LoginRequest(BaseModel):
    """What React sends on the login form."""
    username: str
    password: str


class TokenResponse(BaseModel):
    """
    What the server sends back after successful login/register.
    React stores this token and sends it in every future request header.
    """
    access_token: str
    token_type:   str      = "bearer"
    role:         UserRole
    user_id:      str
    username:     str
    full_name:    str


class TokenData(BaseModel):
    """
    Internal only — what we extract from decoding a JWT token.
    Not sent to React, used only inside the backend.
    """
    user_id: Optional[str]      = None
    role:    Optional[UserRole] = None