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
    token: str = Depends(get_token_dependency),
    consent_id: Optional[str] = Header(None, alias="X-Consent-ID"),
    bank_name: Optional[str] = Header(None, alias="X-Bank-Name"),
    session: Session = Depends(get_session)
):
    """
    List all accounts available to the authenticated client.
    
    Args:
        token: Bank API token (injected by dependency)
        consent_id: Optional consent ID from header (X-Consent-ID)
        bank_name: Optional bank name from header (X-Bank-Name)
        session: Database session for consent lookup
    
    Returns:
        JSON response from bank API containing accounts list
    """
    try:
        # If bank_name provided, try to get per-bank token from ConsentService
        if bank_name and consent_id:
            consent_service = ConsentService(session)
            try:
                bank_token = await consent_service.get_bank_token(bank_name)
                token = bank_token
                logger.info(f"Using per-bank token for {bank_name}")
            except Exception as e:
                logger.warning(f"Failed to get per-bank token: {str(e)}, using default token")
        
        # Build request headers
        headers = {"Authorization": f"Bearer {token}"}
        if consent_id:
            headers["X-Consent-ID"] = consent_id
        
        # Determine base URL based on bank
        base_url = BASE_URL
        if bank_name == "vbank":
            base_url = "https://vbank.open.bankingapi.ru"
        elif bank_name == "abank":
            base_url = "https://abank.open.bankingapi.ru"
        elif bank_name == "sbank":
            base_url = "https://sbank.open.bankingapi.ru"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{base_url}/accounts",
                headers=headers
            )
            response.raise_for_status()
            return response.json()
            
    except httpx.HTTPStatusError as e:
        logger.error(f"Bank API error: {str(e)}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Bank API error: {e.response.text}"
        )
    except httpx.RequestError as e:
        logger.error(f"Request failed: {str(e)}")
        raise HTTPException(status_code=503, detail="Bank API unavailable")

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
    token: str = Depends(get_token_dependency),
    date_from: Optional[str] = Query(None, description="Start date (ISO format)"),
    date_to: Optional[str] = Query(None, description="End date (ISO format)"),
    min_amount: Optional[float] = Query(None, description="Minimum transaction amount"),
    max_amount: Optional[float] = Query(None, description="Maximum transaction amount")
):
    """
    List transactions for a specific account with optional filtering.
    
    Args:
        account_id: Account identifier
        token: Bank API token (injected by dependency)
        date_from: Filter transactions from this date (ISO format)
        date_to: Filter transactions until this date (ISO format)
        min_amount: Minimum transaction amount
        max_amount: Maximum transaction amount
    
    Returns:
        Filtered list of transactions
    """
    current_time = time.time()
    
    # Check cache first
    cache_entry = _tx_cache.get(account_id)
    if cache_entry:
        cache_age = current_time - cache_entry["timestamp"]
        if cache_age < TX_CACHE_TTL_MINUTES * 60:
            logger.debug(f"Returning cached transactions for account {account_id}")
            transactions = cache_entry["data"]
            return {
                "transactions": _filter_transactions(
                    transactions,
                    min_amount=min_amount,
                    max_amount=max_amount,
                    date_from=date_from,
                    date_to=date_to
                ),
                "from_cache": True,
                "cache_age_seconds": int(cache_age)
            }
    
    # Fetch fresh data from bank API
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/accounts/{account_id}/transactions",
                headers={"Authorization": f"Bearer {token}"}
            )
            response.raise_for_status()
            transactions = response.json()
            
            # Update cache
            # TODO: Replace with Redis/DB cache
            # Example Redis implementation:
            # await redis.setex(
            #     f"tx:{account_id}",
            #     TX_CACHE_TTL_MINUTES * 60,
            #     json.dumps({"data": transactions})
            # )
            _tx_cache[account_id] = {
                "data": transactions,
                "timestamp": current_time
            }
            
            return {
                "transactions": _filter_transactions(
                    transactions,
                    min_amount=min_amount,
                    max_amount=max_amount,
                    date_from=date_from,
                    date_to=date_to
                ),
                "from_cache": False
            }
            
    except httpx.HTTPStatusError as e:
        logger.error(f"Bank API error for account {account_id}: {str(e)}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Bank API error: {e.response.text}"
        )
    except httpx.RequestError as e:
        logger.error(f"Request failed for account {account_id}: {str(e)}")
        raise HTTPException(status_code=503, detail="Bank API unavailable")