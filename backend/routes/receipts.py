from datetime import datetime
from decimal import Decimal
import logging
import random
import string
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from pydantic import BaseModel

from models.receipt import Receipt
from database import get_session

# Configure logging
logger = logging.getLogger(__name__)

# Initialize router with prefix
router = APIRouter(prefix="/v1", tags=["receipts"])

class ReceiptCreate(BaseModel):
    """Schema for receipt creation request"""
    transaction_id: str
    account_id: str
    date: datetime
    amount: Decimal
    service: str
    client_name: str

def generate_external_id(length: int = 12) -> str:
    """Generate a random external receipt ID"""
    return ''.join(random.choices(
        string.ascii_uppercase + string.digits, 
        k=length
    ))

@router.post("/receipts", response_model=Receipt)
async def create_receipt(
    data: ReceiptCreate,
    session: Session = Depends(get_session)
):
    """
    Create a new receipt
    
    Example curl:
    ```bash
    curl -X POST http://localhost:8000/v1/receipts \\
        -H "Content-Type: application/json" \\
        -d '{
            "transaction_id": "tx_123",
            "account_id": "acc_456",
            "date": "2025-11-06T10:00:00Z",
            "amount": "150.75",
            "service": "Coffee Shop",
            "client_name": "John Doe"
        }'
    ```
    """
    receipt = Receipt(
        transaction_id=data.transaction_id,
        account_id=data.account_id,
        date=data.date,
        amount=data.amount,
        service=data.service,
        client_name=data.client_name
    )
    
    session.add(receipt)
    session.commit()
    session.refresh(receipt)
    return receipt

@router.get("/receipts", response_model=List[Receipt])
async def list_receipts(
    date_from: Optional[datetime] = Query(None, description="Filter from date"),
    date_to: Optional[datetime] = Query(None, description="Filter to date"),
    status: Optional[str] = Query(None, description="Filter by status"),
    session: Session = Depends(get_session)
):
    """
    List receipts with optional filters
    
    Example curl:
    ```bash
    curl "http://localhost:8000/v1/receipts?date_from=2025-11-01T00:00:00Z&status=draft"
    ```
    """
    query = select(Receipt)
    
    if date_from:
        query = query.where(Receipt.date >= date_from)
    if date_to:
        query = query.where(Receipt.date <= date_to)
    if status:
        query = query.where(Receipt.status == status)
        
    receipts = session.exec(query).all()
    return receipts

@router.get("/receipts/{receipt_id}", response_model=Receipt)
async def get_receipt(
    receipt_id: UUID,
    session: Session = Depends(get_session)
):
    """
    Get receipt by ID
    
    Example curl:
    ```bash
    curl http://localhost:8000/v1/receipts/123e4567-e89b-12d3-a456-426614174000
    ```
    """
    receipt = session.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return receipt

@router.post("/receipts/{receipt_id}/send", response_model=Receipt)
async def send_receipt(
    receipt_id: UUID,
    session: Session = Depends(get_session)
):
    """
    Mock sending a receipt - updates status and sets external ID
    
    Example curl:
    ```bash
    curl -X POST http://localhost:8000/v1/receipts/123e4567-e89b-12d3-a456-426614174000/send
    ```
    """
    receipt = session.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
        
    if receipt.status == "sent":
        raise HTTPException(status_code=400, detail="Receipt already sent")
        
    # Mock sending receipt
    receipt.status = "sent"
    receipt.external_id = generate_external_id()
    receipt.sent_at = datetime.utcnow()
    
    session.add(receipt)
    session.commit()
    session.refresh(receipt)
    return receipt