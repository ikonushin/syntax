from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import SQLModel, Field

class Receipt(SQLModel, table=True):
    """
    Receipt model for storing transaction receipt data
    
    Note: The users table and foreign key is optional - if you don't have user 
    authentication yet, the user_id field will remain null.
    """
    id: UUID = Field(
        default_factory=uuid4,
        primary_key=True,
        description="Unique identifier for the receipt"
    )
    user_id: Optional[UUID] = Field(
        default=None,
        description="Optional reference to user who created the receipt"
    )
    transaction_id: str = Field(
        index=True,
        description="Bank transaction identifier"
    )
    account_id: str = Field(
        index=True,
        description="Bank account identifier"
    )
    date: datetime = Field(
        description="Transaction date"
    )
    amount: Decimal = Field(
        description="Transaction amount"
    )
    service: str = Field(
        description="Service or merchant name"
    )
    client_name: str = Field(
        description="Client/customer name"
    )
    status: str = Field(
        default="draft",
        description="Receipt status: draft|sent|failed"
    )
    external_id: Optional[str] = Field(
        default=None,
        description="External receipt ID after sending"
    )
    sent_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when receipt was sent"
    )
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Record creation timestamp"
    )
    
    class Config:
        json_encoders = {
            UUID: str,
            datetime: lambda dt: dt.isoformat(),
            Decimal: str
        }