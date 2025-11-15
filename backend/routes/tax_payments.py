"""
Tax Payments API routes.

Handles tax payment synchronization from "Мой налог" and payment execution via OpenBanking API.

Endpoints:
- GET /v1/tax-payments: Get list of tax payments
- POST /v1/tax-payments/sync: Sync tax payments from "Мой налог" (mock for MVP)
- POST /v1/tax-payments/{id}/pay: Initiate payment for specific tax
- GET /v1/tax-payments/{id}/status: Check payment status
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional
from uuid import UUID
import random

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models.tax_payment import TaxPayment
from services.bank_service import BankService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/tax-payments", tags=["tax-payments"])


class TaxPaymentResponse(BaseModel):
    """Response model for tax payment."""
    id: str
    tax_period: str
    tax_amount: str
    status: str
    payment_purpose: str
    account_id: Optional[str] = None
    bank_name: Optional[str] = None
    payment_date: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str


class SyncTaxPaymentsRequest(BaseModel):
    """Request to sync tax payments."""
    user_id: str
    tax_inn: str


class PayTaxRequest(BaseModel):
    """Request to pay specific tax."""
    account_id: str
    bank_name: str
    bank_token: str


@router.get("", response_model=List[TaxPaymentResponse])
async def get_tax_payments(
    user_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    session: Session = Depends(get_session)
):
    """
    Get list of tax payments.
    
    Args:
        user_id: Optional filter by user_id
        status_filter: Optional filter by status (pending, processing, paid, failed)
        session: Database session
    
    Returns:
        List of tax payments
    """
    try:
        statement = select(TaxPayment)
        
        if user_id:
            statement = statement.where(TaxPayment.user_id == user_id)
        
        if status_filter:
            statement = statement.where(TaxPayment.status == status_filter)
        
        statement = statement.order_by(TaxPayment.tax_period.desc())
        
        tax_payments = session.exec(statement).all()
        
        logger.info(f"Retrieved {len(tax_payments)} tax payments")
        
        return [
            TaxPaymentResponse(
                id=str(tp.id),
                tax_period=tp.tax_period,
                tax_amount=str(tp.tax_amount),
                status=tp.status,
                payment_purpose=tp.payment_purpose,
                account_id=tp.account_id,
                bank_name=tp.bank_name,
                payment_date=tp.payment_date.isoformat() if tp.payment_date else None,
                error_message=tp.error_message,
                created_at=tp.created_at.isoformat()
            )
            for tp in tax_payments
        ]
        
    except Exception as e:
        logger.error(f"Error fetching tax payments: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при получении налоговых платежей"
        )


@router.post("/sync")
async def sync_tax_payments(
    request: SyncTaxPaymentsRequest,
    session: Session = Depends(get_session)
):
    """
    Sync tax payments from "Мой налог".
    
    For MVP: generates mock tax payment for previous month with random amount.
    In production: would integrate with real "Мой налог" API.
    
    Args:
        request: Sync request with user_id and tax_inn
        session: Database session
    
    Returns:
        Dict with sync status and created payments
    """
    try:
        # Calculate previous month
        today = datetime.now()
        if today.month == 1:
            tax_period = f"{today.year - 1}-12"
        else:
            tax_period = f"{today.year}-{today.month - 1:02d}"
        
        # Check if payment for this period already exists
        statement = select(TaxPayment).where(
            TaxPayment.user_id == request.user_id,
            TaxPayment.tax_period == tax_period
        )
        existing = session.exec(statement).first()
        
        if existing:
            logger.info(f"Tax payment for period {tax_period} already exists")
            return {
                "status": "already_exists",
                "message": f"Налог за период {tax_period} уже загружен",
                "payment_id": str(existing.id)
            }
        
        # Generate mock tax amount (random between 1000 and 50000 rubles)
        tax_amount = Decimal(str(random.uniform(1000, 50000))).quantize(Decimal("0.01"))
        
        # Extract period for payment purpose
        year, month = tax_period.split("-")
        month_names = {
            "01": "январь", "02": "февраль", "03": "март", "04": "апрель",
            "05": "май", "06": "июнь", "07": "июль", "08": "август",
            "09": "сентябрь", "10": "октябрь", "11": "ноябрь", "12": "декабрь"
        }
        month_name = month_names.get(month, month)
        
        # Create tax payment
        tax_payment = TaxPayment(
            user_id=request.user_id,
            tax_period=tax_period,
            tax_amount=tax_amount,
            tax_inn=request.tax_inn,
            payment_purpose=f"Налог на профессиональный доход за {month_name} {year} г. ИНН {request.tax_inn}",
            status="pending"
        )
        
        session.add(tax_payment)
        session.commit()
        session.refresh(tax_payment)
        
        logger.info(f"Created mock tax payment: {tax_payment.id} for period {tax_period}, amount {tax_amount}")
        
        return {
            "status": "success",
            "message": f"Загружен налог за {month_name} {year}",
            "payment_id": str(tax_payment.id),
            "tax_amount": str(tax_amount),
            "tax_period": tax_period
        }
        
    except Exception as e:
        logger.error(f"Error syncing tax payments: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при синхронизации налогов"
        )


@router.post("/{payment_id}/pay")
async def pay_tax(
    payment_id: UUID,
    request: PayTaxRequest,
    session: Session = Depends(get_session)
):
    """
    Initiate payment for specific tax.
    
    Flow:
    1. Get tax payment from DB
    2. Create payment consent via OpenBanking API
    3. Submit payment via OpenBanking API
    4. Update tax payment status
    
    Args:
        payment_id: Tax payment UUID
        request: Payment request with account_id, bank_name, bank_token
        session: Database session
    
    Returns:
        Dict with payment status
    """
    try:
        # Get tax payment
        tax_payment = session.get(TaxPayment, payment_id)
        if not tax_payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Налоговый платёж не найден"
            )
        
        if tax_payment.status == "paid":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Налог уже оплачен"
            )
        
        # Initialize bank service
        bank_service = BankService(request.bank_name, session)
        
        # Step 1: Create payment consent
        logger.info(f"Creating payment consent for tax {payment_id}")
        
        consent_response = await bank_service.create_payment_consent(
            bank_token=request.bank_token,
            client_id=tax_payment.user_id or "team286-1",
            amount=float(tax_payment.tax_amount),
            recipient_account=tax_payment.tax_recipient_account,
            recipient_name=tax_payment.tax_recipient,
            recipient_inn=tax_payment.tax_recipient_inn,
            recipient_kpp=tax_payment.tax_recipient_kpp,
            recipient_bik=tax_payment.tax_recipient_bik,
            payment_purpose=tax_payment.payment_purpose
        )
        
        consent_id = consent_response.get("consent_id") or consent_response.get("id")
        
        if not consent_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Не удалось получить consent_id от банка"
            )
        
        logger.info(f"Payment consent created: {consent_id}")
        
        # Update tax payment with consent info
        tax_payment.consent_id = consent_id
        tax_payment.account_id = request.account_id
        tax_payment.bank_name = request.bank_name
        tax_payment.status = "processing"
        tax_payment.updated_at = datetime.utcnow()
        session.commit()
        
        # Step 2: Submit payment
        logger.info(f"Submitting payment for tax {payment_id}")
        
        payment_response = await bank_service.submit_payment(
            bank_token=request.bank_token,
            consent_id=consent_id,
            account_id=request.account_id
        )
        
        payment_id_str = payment_response.get("payment_id") or payment_response.get("id")
        payment_status = payment_response.get("status", "pending")
        
        # Update tax payment with submission info
        tax_payment.payment_id = payment_id_str
        
        # Update status based on payment response
        if payment_status in ["accepted", "completed", "success"]:
            tax_payment.status = "paid"
            tax_payment.payment_date = datetime.utcnow()
        elif payment_status in ["rejected", "failed"]:
            tax_payment.status = "failed"
            tax_payment.error_message = payment_response.get("error", "Платёж отклонён банком")
        else:
            tax_payment.status = "processing"
        
        tax_payment.updated_at = datetime.utcnow()
        session.commit()
        
        logger.info(f"Payment submitted: {payment_id_str}, status: {payment_status}")
        
        return {
            "status": "success",
            "payment_id": payment_id_str,
            "consent_id": consent_id,
            "payment_status": tax_payment.status,
            "message": "Платёж успешно отправлен" if tax_payment.status == "paid" else "Платёж обрабатывается"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error paying tax: {str(e)}")
        
        # Update tax payment status to failed
        try:
            tax_payment = session.get(TaxPayment, payment_id)
            if tax_payment:
                tax_payment.status = "failed"
                tax_payment.error_message = str(e)
                tax_payment.updated_at = datetime.utcnow()
                session.commit()
        except:
            pass
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при оплате налога: {str(e)}"
        )


@router.get("/{payment_id}/status")
async def get_payment_status(
    payment_id: UUID,
    session: Session = Depends(get_session)
):
    """
    Get status of tax payment.
    
    Args:
        payment_id: Tax payment UUID
        session: Database session
    
    Returns:
        Dict with payment status
    """
    try:
        tax_payment = session.get(TaxPayment, payment_id)
        if not tax_payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Налоговый платёж не найден"
            )
        
        return {
            "payment_id": str(tax_payment.id),
            "status": tax_payment.status,
            "tax_period": tax_payment.tax_period,
            "tax_amount": str(tax_payment.tax_amount),
            "payment_date": tax_payment.payment_date.isoformat() if tax_payment.payment_date else None,
            "error_message": tax_payment.error_message
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting payment status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при получении статуса платежа"
        )
