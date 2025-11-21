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

from fastapi import APIRouter, Depends, HTTPException, status, Header
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
    consent_id: Optional[str] = None  # Consent ID for the bank where account is located
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
        
        # Generate mock tax amount (random between 3000 and 6000 rubles)
        tax_amount = Decimal(str(random.uniform(3000, 6000))).quantize(Decimal("0.01"))
        
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
    Initiate payment for specific tax following Open Banking API flow (Steps 6-7).
    
    Flow:
    1. Get tax payment from DB
    2. Create payment consent via OpenBanking API (Step 6)
    3. Submit payment via OpenBanking API (Step 7)
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
        
        # Decode JWT token to get client_secret
        from services.jwt_utils import decode_token
        
        logger.info(f"💳 PAYMENT: Decoding JWT token from frontend")
        logger.info(f"💳 PAYMENT: Token preview: {request.bank_token[:50]}...")
        
        try:
            token_data = decode_token(request.bank_token)
            client_secret = token_data.get("client_secret")
            
            if not client_secret:
                logger.error(f"💳 PAYMENT: No client_secret in JWT token")
                logger.error(f"💳 PAYMENT: Available keys in token: {list(token_data.keys())}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Отсутствует client_secret в токене авторизации"
                )
            
            logger.info(f"💳 PAYMENT: Decoded token successfully")
            logger.info(f"💳 PAYMENT: - client_id: {token_data.get('client_id')}")
            logger.info(f"💳 PAYMENT: - client_secret length: {len(client_secret)}")
            logger.info(f"💳 PAYMENT: - client_secret preview: {client_secret[:4]}...{client_secret[-4:]}")
        except Exception as e:
            logger.error(f"💳 PAYMENT: Failed to decode token: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Недействительный токен авторизации"
            )
        
        # Get bank-specific token (not user JWT token)
        from services.auth_service import authenticate_with_bank
        
        # Extract base client_id (team286 part only) for bank token
        base_client_id = tax_payment.user_id or "team286"
        if "-" in str(base_client_id):
            base_client_id = base_client_id.split("-")[0]
        
        # Full client_id with user suffix (team286-9)
        full_client_id = tax_payment.user_id or "team286-1"
        
        logger.info(f"💳 PAYMENT: Getting bank token for {request.bank_name} with base_client_id={base_client_id}, full_client_id={full_client_id}")
        
        # Get bank token using client_secret from JWT
        bank_token_data = await authenticate_with_bank(
            client_id=base_client_id,
            client_secret=client_secret,
            bank_id=request.bank_name
        )
        bank_token = bank_token_data.get("access_token")
        
        logger.info(f"💳 PAYMENT: Got bank token: {bank_token[:20]}...")
        
        # Check if consent_id was provided (from existing account consent)
        account_consent_id = request.consent_id
        if account_consent_id:
            logger.info(f"💳 PAYMENT: Using provided account consent: {account_consent_id}")
        else:
            logger.warning(f"💳 PAYMENT: No consent_id provided, will try to fetch accounts without consent")
        
        # Get account details to extract real account number (identification)
        # NOTE: This step is OPTIONAL - if it fails, we'll use accountId as fallback
        logger.info(f"💳 PAYMENT: Fetching account details for {request.account_id}")
        account_identification = request.account_id  # Default fallback
        
        try:
            accounts_data = await bank_service.get_accounts(
                bank_token=bank_token,
                consent_id=account_consent_id,  # Pass the consent_id for accounts if available
                client_id=full_client_id,  # Pass full client_id (team286-9)
                requesting_bank=base_client_id
            )
            logger.info(f"💳 PAYMENT: Full accounts response: {accounts_data}")
            
            accounts = accounts_data.get("accounts", accounts_data) if isinstance(accounts_data, dict) else accounts_data
            if not isinstance(accounts, list):
                accounts = [accounts] if accounts else []
            
            logger.info(f"💳 PAYMENT: Found {len(accounts)} accounts")
            
            # Find the account by accountId
            account = next((acc for acc in accounts if acc.get("accountId") == request.account_id), None)
            
            if account:
                logger.info(f"💳 PAYMENT: Found account: {account}")
                
                # Get real account number (identification) from nested 'account' array
                # Structure: account['account'][0]['identification']
                account_identification = request.account_id  # Default fallback
                
                account_array = account.get("account", [])
                if isinstance(account_array, list) and len(account_array) > 0:
                    # Get identification from first account in the array
                    account_identification = account_array[0].get("identification", request.account_id)
                    logger.info(f"💳 PAYMENT: Extracted identification from nested account array: {account_identification}")
                else:
                    # Try direct fields as fallback
                    account_identification = (
                        account.get("identification") or 
                        account.get("number") or 
                        account.get("accountNumber") or 
                        request.account_id
                    )
                    logger.info(f"💳 PAYMENT: Using direct field identification: {account_identification}")
                
                logger.info(f"💳 PAYMENT: Using account identification: {account_identification}")
            else:
                logger.warning(f"💳 PAYMENT: Account {request.account_id} not found in response, using accountId")
                logger.warning(f"💳 PAYMENT: Available accounts: {[acc.get('accountId') for acc in accounts]}")
                # Continue with accountId fallback
                
        except Exception as e:
            logger.warning(f"💳 PAYMENT: Failed to get account details (will continue with fallback): {str(e)}")
            logger.warning(f"💳 PAYMENT: Using accountId as fallback: {account_identification}")
        
        # Step 6: Create payment consent
        logger.info(f"Step 6: Creating payment consent for tax {payment_id}")
        
        consent_response = await bank_service.create_payment_consent(
            bank_token=bank_token,
            client_id=full_client_id,  # Use full client_id (team286-9)
            amount=float(tax_payment.tax_amount),
            debtor_account=account_identification,  # Use real account number (identification field), not accountId
            recipient_account="4081781028601060774",  # Fixed ФНС account
            payment_purpose=tax_payment.payment_purpose
        )
        
        consent_id = consent_response.get("consent_id")
        request_id = consent_response.get("request_id")
        status_from_response = consent_response.get("status", "approved")
        redirect_url = consent_response.get("redirect_url")
        
        # Save bank_name, account_id, and account_identification now (before pending check) so they're available for confirm-payment-approval
        tax_payment.bank_name = request.bank_name
        tax_payment.account_id = request.account_id
        tax_payment.account_identification = account_identification  # Save the extracted identification
        tax_payment.updated_at = datetime.utcnow()
        
        # Check if manual approval is needed (VBank/SBank for payment consents)
        if status_from_response.lower() == "pending" and redirect_url:
            logger.info(f"Payment consent requires manual approval - returning redirect_url for {request.bank_name}")
            
            # Save request_id for later retrieval of consent_id
            tax_payment.payment_request_id = request_id  # Store for later polling
            tax_payment.status = "awaiting_payment_approval"
            tax_payment.updated_at = datetime.utcnow()
            session.commit()
            
            return {
                "status": "pending_approval",
                "redirect_url": redirect_url,
                "request_id": request_id,
                "message": f"Требуется подтверждение в {request.bank_name}. Перейдите по ссылке и подтвердите платёж.",
                "payment_id": payment_id
            }
        
        # If consent_id is still null, raise error
        if not consent_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Не удалось получить consent_id от банка"
            )
        
        logger.info(f"Payment consent created: {consent_id}")
        
        # Update tax payment with consent info (bank_name and account_id already saved above)
        tax_payment.consent_id = consent_id
        tax_payment.status = "processing"
        tax_payment.updated_at = datetime.utcnow()
        session.commit()
        
        # Step 7: Submit payment
        logger.info(f"Step 7: Submitting payment for tax {payment_id}")
        
        payment_response = await bank_service.submit_payment(
            bank_token=bank_token,
            consent_id=consent_id,
            client_id=full_client_id,  # Use full client_id (team286-9)
            amount=float(tax_payment.tax_amount),
            debtor_account=account_identification,  # Use real account number (identification field), not accountId
            recipient_account="4081781028601060774",  # Fixed ФНС account
            payment_comment="Оплата налога"
        )
        
        payment_id_str = payment_response.get("payment_id")
        payment_status = payment_response.get("status", "pending")
        
        # Update tax payment with submission info
        tax_payment.payment_id = payment_id_str
        
        # Update status based on payment response (Step 7 result)
        if payment_status in ["AcceptedSettlementCompleted", "accepted", "completed", "success"]:
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


@router.post("/{payment_id}/confirm-payment-approval")
async def confirm_payment_approval(
    payment_id: UUID,
    authorization: str = Header(None),
    session: Session = Depends(get_session)
):
    """
    After user manually approves payment consent in bank UI, fetch consent_id and submit payment (Steps 6-7 continued).
    
    Flow:
    1. User clicks redirect_url and approves in bank
    2. Frontend calls this endpoint with Bearer token in Authorization header
    3. We fetch consent_id from /payment-consents/{request_id}
    4. Submit payment with the fetched consent_id
    5. Update tax payment status
    
    Args:
        payment_id: Tax payment UUID
        authorization: Authorization header with Bearer token
        session: Database session
    
    Returns:
        Dict with payment status
    """
    try:
        if not authorization:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Отсутствует Authorization header"
            )
        
        # Extract token from "Bearer <token>"
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверный формат Authorization header"
            )
        
        bank_token = authorization[7:]  # Remove "Bearer " prefix
        
        # Get tax payment
        tax_payment = session.get(TaxPayment, payment_id)
        if not tax_payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Налоговый платёж не найден"
            )
        
        if not tax_payment.payment_request_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Отсутствует request_id для получения согласия"
            )
        
        if not tax_payment.bank_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Отсутствует bank_name в платёже"
            )
        
        # Initialize bank service
        bank_service = BankService(tax_payment.bank_name, session)
        
        # Decode JWT token to get client_secret
        from services.jwt_utils import decode_token
        
        logger.info(f"💳 PAYMENT APPROVAL: Confirming payment approval for tax {payment_id}")
        
        try:
            token_data = decode_token(bank_token)
            client_secret = token_data.get("client_secret")
            
            if not client_secret:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Отсутствует client_secret в токене авторизации"
                )
        except Exception as e:
            logger.error(f"💳 PAYMENT APPROVAL: Failed to decode token: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Недействительный токен авторизации"
            )
        
        # Get bank token using client_secret from JWT
        from services.auth_service import authenticate_with_bank
        
        base_client_id = tax_payment.user_id or "team286"
        if "-" in str(base_client_id):
            base_client_id = base_client_id.split("-")[0]
        
        full_client_id = tax_payment.user_id or "team286-1"
        
        bank_token_data = await authenticate_with_bank(
            client_id=base_client_id,
            client_secret=client_secret,
            bank_id=tax_payment.bank_name
        )
        bank_token_for_api = bank_token_data.get("access_token")
        
        # Step 6 continued: Get payment consent_id after user approval
        logger.info(f"Step 6 (continued): Fetching payment consent_id after approval")
        
        consent_response = await bank_service.get_payment_consent_after_approval(
            bank_token=bank_token_for_api,
            request_id=tax_payment.payment_request_id,
            client_id=full_client_id
        )
        
        consent_id = consent_response.get("consent_id")
        status_from_response = consent_response.get("status", "pending")
        
        if not consent_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Не удалось получить consent_id после подтверждения"
            )
        
        logger.info(f"Payment consent confirmed: {consent_id}, status: {status_from_response}")
        
        # Update tax payment with consent info
        tax_payment.consent_id = consent_id
        tax_payment.status = "processing"
        tax_payment.updated_at = datetime.utcnow()
        session.commit()
        
        # Get account identification for payment submission
        # Use the saved identification from the initial payment request if available
        account_identification = tax_payment.account_identification or tax_payment.account_id
        
        logger.info(f"💳 PAYMENT APPROVAL: Using saved account identification: {account_identification}")
        
        # If we don't have saved identification, try to fetch it again
        if not tax_payment.account_identification:
            logger.info(f"💳 PAYMENT APPROVAL: No saved identification, fetching from accounts list")
            try:
                accounts_data = await bank_service.get_accounts(
                    bank_token=bank_token_for_api,
                    consent_id=None,
                    client_id=full_client_id,
                    requesting_bank=base_client_id
                )
                
                logger.info(f"💳 PAYMENT APPROVAL: Got accounts data: {accounts_data}")
                
                accounts = accounts_data if isinstance(accounts_data, list) else (accounts_data.get("accounts", []) if isinstance(accounts_data, dict) else [])
                if not isinstance(accounts, list):
                    accounts = [accounts] if accounts else []
                
                logger.info(f"💳 PAYMENT APPROVAL: Accounts list: {accounts}")
                
                account = next((acc for acc in accounts if acc.get("accountId") == tax_payment.account_id), None)
                
                logger.info(f"💳 PAYMENT APPROVAL: Found account: {account}")
                
                if account:
                    account_array = account.get("account", [])
                    logger.info(f"💳 PAYMENT APPROVAL: Account array: {account_array}")
                    if isinstance(account_array, list) and len(account_array) > 0:
                        account_identification = account_array[0].get("identification", tax_payment.account_id)
                        logger.info(f"💳 PAYMENT APPROVAL: Extracted identification: {account_identification}")
            except Exception as e:
                logger.error(f"💳 PAYMENT APPROVAL: Error getting account identification: {str(e)}")
                pass  # Use account_id fallback
        
        logger.info(f"💳 PAYMENT APPROVAL: Using account identification: {account_identification}")
        
        # Step 7: Submit payment
        logger.info(f"Step 7: Submitting payment after consent approval")
        
        payment_response = await bank_service.submit_payment(
            bank_token=bank_token_for_api,
            consent_id=consent_id,
            client_id=full_client_id,
            amount=float(tax_payment.tax_amount),
            debtor_account=account_identification,
            recipient_account="4081781028601060774",
            payment_comment="Оплата налога"
        )
        
        payment_id_str = payment_response.get("payment_id")
        payment_status = payment_response.get("status", "pending")
        
        # Update tax payment with submission info
        tax_payment.payment_id = payment_id_str
        
        # Update status based on payment response
        if payment_status in ["AcceptedSettlementCompleted", "accepted", "completed", "success"]:
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
        logger.error(f"Error confirming payment approval: {str(e)}")
        
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
            detail=f"Ошибка при подтверждении платежа: {str(e)}"
        )
