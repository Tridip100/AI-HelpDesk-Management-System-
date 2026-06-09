# backend/main.py

from contextlib import asynccontextmanager
import asyncio
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import engine, Base
from backend.routers import auth, tickets, admin
from backend.routers.intake import router as intake_router
from backend.channels.imap_poller import start_poller
from backend.models import user, ticket, ticket_event

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# create all tables on startup
Base.metadata.create_all(bind=engine)


# ─────────────────────────────────────────
# LIFESPAN — startup and shutdown
# ─────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP
    logger.info("[MAIN] Starting AI Helpdesk backend...")
    poller_task = asyncio.create_task(start_poller())
    logger.info("[MAIN] IMAP poller started")

    yield  # app runs here

    # SHUTDOWN
    logger.info("[MAIN] Shutting down...")
    poller_task.cancel()
    try:
        await poller_task
    except asyncio.CancelledError:
        logger.info("[MAIN] IMAP poller stopped cleanly")


# ─────────────────────────────────────────
# APP INIT
# ─────────────────────────────────────────
app = FastAPI(
    title="AI Helpdesk Copilot",
    description="Multi-role IT helpdesk system with AI-assisted ticket resolution",
    version="0.1.0",          # ← comma was missing here
    lifespan=lifespan          # ← now defined above
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# routers
app.include_router(auth.router)
app.include_router(tickets.router)
app.include_router(admin.router)
app.include_router(intake_router)


@app.get("/")
def root():
    return {
        "project": "AI Helpdesk Copilot",
        "status":  "running",
        "docs":    "/docs",
        "roles":   ["user", "helpdesk", "engineer", "admin"]
    }


@app.get("/health")
def health():
    return {"status": "ok"}