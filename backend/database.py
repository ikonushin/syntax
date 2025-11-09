import logging
from typing import Generator, Optional
import os

from fastapi import HTTPException
from sqlmodel import Session, create_engine

logger = logging.getLogger(__name__)

# Get database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")
engine = None

if DATABASE_URL:
    # Create SQLModel engine if DATABASE_URL is provided
    engine = create_engine(
        DATABASE_URL,
        echo=False  # Set to True for SQL query logging
    )
    logger.info("Database engine initialized")
else:
    logger.warning("DATABASE_URL not set. Database features will be disabled")

def get_session() -> Generator[Session, None, None]:
    """
    FastAPI dependency that provides a SQLModel database session.
    If DATABASE_URL is not set, raises HTTPException.
    
    Usage:
        ```python
        @app.get("/items")
        def list_items(session: Session = Depends(get_session)):
            items = session.exec(select(Item)).all()
            return items
        ```
    """
    if not engine:
        # Let FastAPI convert this to a proper 503 Service Unavailable response
        raise HTTPException(
            status_code=503,
            detail="Database connection not configured"
        )
        
    with Session(engine) as session:
        yield session