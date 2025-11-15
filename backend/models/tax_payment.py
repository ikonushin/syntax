"""
Tax Payment model for storing tax obligations from "Мой налог" app.

This model tracks tax payments that need to be paid, including:
- Tax amount and period
- Payment status (pending, paid, failed)
- Associated bank account used for payment
- Payment consent and submission IDs from OpenBanking API
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import SQLModel, Field


class TaxPayment(SQLModel, table=True):
    """
    Tax payment model for tracking налог obligations.
    
    Flow:
    1. Mock tax data synced from "Мой налог" (for MVP, generated with random amount)
    2. User selects account to pay from
    3. Create payment consent via OpenBanking API
    4. Submit payment via OpenBanking API
    5. Update status to 'paid' or 'failed'
    
    Status values:
    - pending: Tax is due, not yet paid
    - processing: Payment consent created, awaiting submission
    - paid: Successfully paid
    - failed: Payment failed, can retry
    """
    
    id: UUID = Field(
        default_factory=uuid4,
        primary_key=True,
        description="Unique identifier for tax payment"
    )
    
    user_id: Optional[str] = Field(
        default=None,
        index=True,
        description="Client identifier (e.g., team286-1) - for future user table"
    )
    
    tax_period: str = Field(
        index=True,
        description="Tax period in format YYYY-MM (e.g., 2025-10 for October 2025)"
    )
    
    tax_amount: Decimal = Field(
        description="Tax amount to pay (in rubles)",
        max_digits=12,
        decimal_places=2
    )
    
    tax_inn: str = Field(
        default="",
        description="ИНН (tax identification number) of taxpayer"
    )
    
    tax_recipient: str = Field(
        default="ФНС России",
        description="Tax recipient name (default: ФНС России)"
    )
    
    tax_recipient_inn: str = Field(
        default="7707329152",
        description="ФНС INN (default: 7707329152)"
    )
    
    tax_recipient_kpp: str = Field(
        default="770701001",
        description="ФНС KPP (default: 770701001)"
    )
    
    tax_recipient_account: str = Field(
        default="40101810800000010041",
        description="ФНС bank account number"
    )
    
    tax_recipient_bank: str = Field(
        default="ГУ Банка России по ЦФО",
        description="ФНС bank name"
    )
    
    tax_recipient_bik: str = Field(
        default="044525000",
        description="ФНС bank BIK"
    )
    
    payment_purpose: str = Field(
        description="Payment purpose (назначение платежа)"
    )
    
    status: str = Field(
        default="pending",
        index=True,
        description="Payment status: pending | processing | paid | failed"
    )
    
    account_id: Optional[str] = Field(
        default=None,
        description="Bank account ID used for payment"
    )
    
    bank_name: Optional[str] = Field(
        default=None,
        index=True,
        description="Bank name: vbank, abank, or sbank"
    )
    
    consent_id: Optional[str] = Field(
        default=None,
        description="Payment consent ID from OpenBanking API"
    )
    
    payment_id: Optional[str] = Field(
        default=None,
        description="Payment submission ID from OpenBanking API"
    )
    
    payment_date: Optional[datetime] = Field(
        default=None,
        description="Date when payment was completed"
    )
    
    error_message: Optional[str] = Field(
        default=None,
        description="Error message if payment failed"
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
            Decimal: str,
        }
