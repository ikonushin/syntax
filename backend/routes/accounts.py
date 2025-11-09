import os
import time
import logging
from typing import Dict, List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlmodel import Session
import httpx

from database import get_session
from services.auth_service import make_authenticated_request
from services.bank_service import BankService
from services.jwt_utils import decode_token

# Configure logging
logger = logging.getLogger(__name__)

# Environment variables
BASE_URL = os.getenv("BASE_URL", "https://sbank.open.bankingapi.ru")
TX_CACHE_TTL_MINUTES = int(os.getenv("TX_CACHE_TTL_MINUTES", "15"))

# Initialize router with prefix
router = APIRouter(prefix="/v1", tags=["accounts"])

# In-memory cache for transactions
# TODO: Replace with Redis or database cache for production
# Structure: {account_id: {"data": [...], "timestamp": float}}
_tx_cache: Dict[str, Dict] = {}

@router.get("/accounts")
async def list_accounts(
    access_token: str = Header(..., alias="Authorization"),
    consent_id: str = Header(..., alias="X-Consent-Id"),
    bank_name: str = Header(..., alias="X-Bank-Name"),
    client_id: Optional[str] = Query(None, description="Optional client ID filter"),
    session: Session = Depends(get_session)
):
    """
    List all accounts available for the authenticated client.
    
    Per OpenBanking API documentation:
    - GET /accounts?client_id={client_id}
    - Headers: Authorization: Bearer <bank_token>, X-Consent-Id: <consent_id>
    
    Args:
        access_token: JWT session token in Authorization header (Bearer <token>)
        consent_id: Consent ID for account access (X-Consent-Id header)
        bank_name: Bank identifier (X-Bank-Name header): abank|sbank|vbank
        client_id: Optional client ID filter
        session: Database session
    
    Returns:
        List of accounts from bank API
    
    Raises:
        HTTPException: On authentication or API errors
    """
    try:
        # Extract Bearer token
        if access_token.startswith("Bearer "):
            jwt_token = access_token[7:]
        else:
            jwt_token = access_token
        
        # Decode JWT to get bank token
        try:
            token_data = decode_token(jwt_token)
            bank_token = token_data.get("bank_token")
            if not bank_token:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid token: no bank token found"
                )
        except Exception as e:
            logger.error(f"Token decode error: {str(e)}")
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired token"
            )
        
        # Initialize bank service
        bank_service = BankService(bank_name, session)
        
        # Get accounts from bank API
        accounts = await bank_service.get_accounts(
            bank_token=bank_token,
            consent_id=consent_id,
            client_id=client_id
        )
        
        logger.info(f"Successfully fetched {len(accounts)} accounts from {bank_name}")
        
        return {"accounts": accounts}
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error fetching accounts: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Ошибка при получении списка счетов"
        )

def _filter_transactions(transactions: List[dict], 
                        min_amount: Optional[float] = None,
                        max_amount: Optional[float] = None,
                        date_from: Optional[str] = None,
                        date_to: Optional[str] = None) -> List[dict]:
    """Filter transactions based on amount and date criteria"""
    filtered = transactions.copy()
    
    if min_amount is not None or max_amount is not None:
        filtered = [
            tx for tx in filtered
            if (min_amount is None or tx.get("amount", 0) >= min_amount) and
               (max_amount is None or tx.get("amount", 0) <= max_amount)
        ]
    
    if date_from or date_to:
        try:
            date_from_dt = datetime.fromisoformat(date_from) if date_from else None
            date_to_dt = datetime.fromisoformat(date_to) if date_to else None
            
            filtered = [
                tx for tx in filtered
                if ((not date_from_dt or datetime.fromisoformat(tx.get("date", "")) >= date_from_dt) and
                    (not date_to_dt or datetime.fromisoformat(tx.get("date", "")) <= date_to_dt))
            ]
        except ValueError as e:
            logger.warning(f"Date parsing error: {str(e)}")
            # Continue with date filtering skipped
            pass
    
    return filtered

@router.get("/accounts/{account_id}/transactions")
async def list_transactions(
    account_id: str,
    access_token: str = Header(..., alias="Authorization"),
    consent_id: str = Header(..., alias="X-Consent-Id"),
    bank_name: str = Header(..., alias="X-Bank-Name"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=500, description="Transactions per page (max 500)"),
    date_from: Optional[str] = Query(None, description="Start date (ISO format)"),
    date_to: Optional[str] = Query(None, description="End date (ISO format)"),
    min_amount: Optional[float] = Query(None, description="Minimum transaction amount"),
    max_amount: Optional[float] = Query(None, description="Maximum transaction amount"),
    session: Session = Depends(get_session)
):
    """
    List transactions for a specific account with pagination and filtering.
    
    Per OpenBanking API documentation:
    - GET /accounts/{account_id}/transactions?page={page}&limit={limit}
    - Headers: Authorization: Bearer <bank_token>, X-Consent-Id: <consent_id>
    
    Args:
        account_id: Account identifier
        access_token: JWT session token in Authorization header (Bearer <token>)
        consent_id: Consent ID for transaction access (X-Consent-Id header)
        bank_name: Bank identifier (X-Bank-Name header): abank|sbank|vbank
        page: Page number for pagination (default: 1)
        limit: Transactions per page, max 500 (default: 50)
        date_from: Filter transactions from this date (ISO format)
        date_to: Filter transactions until this date (ISO format)
        min_amount: Minimum transaction amount
        max_amount: Maximum transaction amount
        session: Database session
    
    Returns:
        Dict with transactions list and pagination info
    """
    try:
        # Extract Bearer token
        if access_token.startswith("Bearer "):
            jwt_token = access_token[7:]
        else:
            jwt_token = access_token
        
        # Decode JWT to get bank token
        try:
            token_data = decode_token(jwt_token)
            bank_token = token_data.get("bank_token")
            if not bank_token:
                raise HTTPException(
                    status_code=401,
                    detail="Invalid token: no bank token found"
                )
        except Exception as e:
            logger.error(f"Token decode error: {str(e)}")
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired token"
            )
        
        # Check cache first
        cache_key = f"{bank_name}:{account_id}:{page}:{limit}"
        current_time = time.time()
        cache_entry = _tx_cache.get(cache_key)
        
        if cache_entry:
            cache_age = current_time - cache_entry["timestamp"]
            if cache_age < TX_CACHE_TTL_MINUTES * 60:
                logger.debug(f"Returning cached transactions for {cache_key}")
                transactions = cache_entry["data"].get("transactions", [])
                return {
                    "transactions": _filter_transactions(
                        transactions,
                        min_amount=min_amount,
                        max_amount=max_amount,
                        date_from=date_from,
                        date_to=date_to
                    ),
                    "from_cache": True,
                    "cache_age_seconds": int(cache_age),
                    "pagination": cache_entry["data"].get("pagination", {})
                }
        
        # Fetch fresh data from bank API
        bank_service = BankService(bank_name, session)
        
        data = await bank_service.get_transactions(
            bank_token=bank_token,
            consent_id=consent_id,
            account_id=account_id,
            page=page,
            limit=limit
        )
        
        # Update cache
        _tx_cache[cache_key] = {
            "data": data,
            "timestamp": current_time
        }
        
        transactions = data.get("transactions", [])
        
        logger.info(f"Fetched {len(transactions)} transactions for account {account_id} from {bank_name}")
        
        return {
            "transactions": _filter_transactions(
                transactions,
                min_amount=min_amount,
                max_amount=max_amount,
                date_from=date_from,
                date_to=date_to
            ),
            "from_cache": False,
            "pagination": data.get("pagination", {})
        }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error fetching transactions: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Ошибка при получении транзакций"
        )