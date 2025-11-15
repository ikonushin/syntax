import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Depends
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Session, select
from dotenv import load_dotenv
import os

from database import engine, get_session
from routes import receipts, auth, tax_payments
from models.receipt import Receipt
from models.consent import Consent
from models.tax_payment import TaxPayment

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Environment variables
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
BASE_URL = os.getenv("BASE_URL", "https://sbank.open.bankingapi.ru")
JWT_SECRET = os.getenv("JWT_SECRET")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events for the FastAPI application"""
    if engine:
        SQLModel.metadata.create_all(engine)
        logger.info("Database tables created")
    
    yield
    
    if engine:
        pass

app = FastAPI(
    title="Syntax Multi-Banking API",
    description="Multi-bank transaction aggregation for self-employed",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root redirect
@app.get("/", include_in_schema=False)
async def root():
    """Redirect to API docs"""
    return RedirectResponse(url="/docs")

# Include routers
app.include_router(auth.router)
app.include_router(receipts.router)
app.include_router(tax_payments.router)

# Health check endpoints
@app.get("/health")
async def health_check():
    """Simple health check"""
    return {"status": "ok"}

@app.get("/health/detailed")
async def detailed_health_check(session: Session = Depends(get_session)):
    """Detailed health check with database status"""
    db_status = "ok"
    receipts_count = 0
    error_message = None
    
    try:
        result = session.exec(select(Receipt)).all()
        receipts_count = len(result)
    except Exception as e:
        db_status = "error"
        error_message = str(e)
        logger.error(f"Database health check failed: {error_message}")
    
    return {
        "backend": "ok",
        "database": db_status,
        "database_error": error_message,
        "receipts_count": receipts_count,
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "accounts": "available",
            "receipts": "available"
        }
    }

# Error handler
@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return {"detail": "Internal server error"}, 500
