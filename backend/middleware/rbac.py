from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List

from backend.database import get_db
from backend.models.user import User, UserRole
from backend.services.auth_service import decode_token

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Extract and validate the JWT token, return the current user."""
    token_data = decode_token(credentials.credentials)
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated"
        )
    return user


def require_roles(*roles: UserRole):
    """
    Factory that returns a dependency checking the user has one of the allowed roles.

    Usage in a route:
        @router.get("/admin/users")
        def list_users(current_user: User = Depends(require_roles(UserRole.admin))):
            ...
    """
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[r.value for r in roles]}"
            )
        return current_user
    return dependency


# ── Convenience shorthand dependencies ───────────────

def current_user_any(user: User = Depends(get_current_user)) -> User:
    """Any authenticated user."""
    return user

def current_user_helpdesk_or_above(
    user: User = Depends(require_roles(UserRole.helpdesk, UserRole.engineer, UserRole.admin))
) -> User:
    return user

def current_user_engineer_or_above(
    user: User = Depends(require_roles(UserRole.engineer, UserRole.admin))
) -> User:
    return user

def current_user_admin(
    user: User = Depends(require_roles(UserRole.admin))
) -> User:
    return user