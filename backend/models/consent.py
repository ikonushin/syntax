from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import SQLModel, Field


class Consent(SQLModel, table=True):
    """
    Consent model for storing OpenBanking API consent data.
    
    Tracks authorization status for each bank and client.
    Status values: 
    - pending: Initial state, awaiting bank response
    - awaitingAuthorization: Pending user signature (SBank/VBank manual approval)
    - authorized: Approved and active
    - revoked: Revoked by user
    
    Flow:
    - ABank: pending → authorized (auto-approved)
    - SBank/VBank: pending → awaitingAuthorization → authorized (manual approval)
    """
    id: UUID = Field(
        default_factory=uuid4,
        primary_key=True,
        description="Unique identifier for the consent"
    )
    bank_name: str = Field(
        index=True,
        description="Bank name: vbank, abank, or sbank"
    )
    client_id: str = Field(
        index=True,
        description="Client identifier for the bank (e.g., team286-1)"
    )
    consent_id: str = Field(
        index=True,
        description="Consent ID returned by bank API for authorized consents"
    )
    request_id: Optional[str] = Field(
        default=None,
        index=True,
        description="Request ID for SBank/VBank manual approval flow (before signing)"
    )
    status: str = Field(
        default="pending",
        description="Consent status: pending | awaitingAuthorization | authorized | revoked"
    )
    redirect_uri: Optional[str] = Field(
        default=None,
        description="Redirect URL for SBank/VBank manual approval in bank UI"
    )
    expires_at: Optional[datetime] = Field(
        default=None,
        description="Consent expiration timestamp"
    )
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Record creation timestamp"
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Record update timestamp"
    )
    
    class Config:
        json_encoders = {
            UUID: str,
            datetime: lambda dt: dt.isoformat(),
        }
