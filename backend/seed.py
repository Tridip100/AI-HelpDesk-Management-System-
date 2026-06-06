"""
Run this once to populate the DB with test users.

Usage:
    cd helpdesk
    python seed.py
"""
import sys
sys.path.append(".")

from backend.database import SessionLocal, engine, Base
from backend.models import user, ticket, ticket_event  # noqa — register models
from backend.models.user import User, UserRole
from backend.services.auth_service import hash_password

Base.metadata.create_all(bind=engine)

SEED_USERS = [
    {"email": "user@helpdesk.com",      "username": "alice",    "full_name": "Alice Normal",    "password": "pass123", "role": UserRole.user},
    {"email": "helpdesk@helpdesk.com",  "username": "bob",      "full_name": "Bob Helpdesk",    "password": "pass123", "role": UserRole.helpdesk},
    {"email": "engineer@helpdesk.com",  "username": "charlie",  "full_name": "Charlie Engineer","password": "pass123", "role": UserRole.engineer},
    {"email": "admin@helpdesk.com",     "username": "admin",    "full_name": "Admin Sara",       "password": "admin123","role": UserRole.admin},
]

db = SessionLocal()

for u in SEED_USERS:
    exists = db.query(User).filter(User.username == u["username"]).first()
    if not exists:
        new_user = User(
            email=u["email"],
            username=u["username"],
            full_name=u["full_name"],
            hashed_password=hash_password(u["password"]),
            role=u["role"],
        )
        db.add(new_user)
        print(f"  ✅ Created: {u['username']} [{u['role'].value}]")
    else:
        print(f"  ⚠️  Already exists: {u['username']}")

db.commit()
db.close()
print("\n✅ Seed complete.")
print("\nTest credentials:")
print("  alice    / pass123   → role: user")
print("  bob      / pass123   → role: helpdesk")
print("  charlie  / pass123   → role: engineer")
print("  admin    / admin123  → role: admin")