from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import auth, tickets, admin

# import models so SQLAlchemy registers them before create_all
from .models import user, ticket, ticket_event  # noqa

# create all tables on startup (use Alembic for production migrations)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AI Helpdesk Copilot",
    description="Multi-role IT helpdesk system with AI-assisted ticket resolution",
    version="0.1.0"
)

# CORS — allow React frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite + CRA defaults
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# register routers
app.include_router(auth.router)
app.include_router(tickets.router)
app.include_router(admin.router)


@app.get("/")
def root():
    return {
        "project": "AI Helpdesk Copilot",
        "status": "running",
        "docs": "/docs",
        "roles": ["user", "helpdesk", "engineer", "admin"]
    }


@app.get("/health")
def health():
    return {"status": "ok"}