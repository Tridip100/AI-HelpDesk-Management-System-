from pydantic import BaseModel, EmailStr
from typing import Optional
from backend.models.user import UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    full_name: str
    password: str
    role: UserRole = UserRole.user  # default: normal user


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    user_id: str
    username: str
    full_name: str


class TokenData(BaseModel):
    user_id: Optional[str] = None
    role: Optional[UserRole] = None