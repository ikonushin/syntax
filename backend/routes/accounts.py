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
    consent_id: Optional[str] = Header(None, alias="consent_id"),
    bank_name: Optional[str] = Header(None, alias="X-Bank-Name"),
    client_id: Optional[str] = Header(None, alias="client_id"),
    session: Session = Depends(get_session)
):
    """
    List all accounts available for the authenticated client per Open Banking API (Step 3).
    
    Per Open Banking API documentation:
    - GET /accounts?client_id={client_id}
    - Headers: Authorization: Bearer <bank_token>, consent_id: <consent_id>, client_id: <client_id>
    
    Args:
        access_token: JWT session token in Authorization header (Bearer <token>)
        consent_id: Consent ID for account access (consent_id header)
        bank_name: Bank identifier (X-Bank-Name header): abank|sbank|vbank
        client_id: Client identifier (client_id header, e.g., "team286-9")
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
        
        # Decode JWT to get credentials for bank-specific auth
        try:
            token_data = decode_token(jwt_token)
            client_id_stored = token_data.get("client_id")
            client_secret = token_data.get("client_secret")
            
            # Use values from JWT if not provided in headers
            if not client_id:
                client_id = client_id_stored
            if not bank_name:
                bank_name = token_data.get("bank_name", "vbank")
            if not consent_id:
                consent_id = token_data.get("consent_id")
            
            if not client_secret:
                logger.warning(f"🔍 ACCOUNTS DEBUG: No client_secret in JWT, trying fallback token")
                # Fallback to universal token if available
                fallback_token = token_data.get("access_token")
                if not fallback_token:
                    raise HTTPException(
                        status_code=401,
                        detail="Invalid token: missing credentials"
                    )
                bank_token = fallback_token
                logger.info(f"🔍 ACCOUNTS DEBUG: Using fallback universal token")
            else:
                # Get bank-specific token
                from services.auth_service import authenticate_with_bank
                logger.info(f"🔍 ACCOUNTS DEBUG: Getting bank-specific token for {bank_name}")
                bank_token_data = await authenticate_with_bank(
                    client_id=client_id_stored,
                    client_secret=client_secret,
                    bank_id=bank_name
                )
                bank_token = bank_token_data.get("access_token")
                logger.info(f"🔍 ACCOUNTS DEBUG: Got bank-specific token for {bank_name}")
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Token decode error: {str(e)}")
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired token"
            )
        
        # Initialize bank service
        bank_service = BankService(bank_name, session)
        
        # Get accounts from bank API (Step 3)
        accounts = await bank_service.get_accounts(
            bank_token=bank_token,
            consent_id=consent_id,
            client_id=client_id,
            requesting_bank="team286"
        )
        
        logger.info(f"Successfully fetched {len(accounts)} accounts from {bank_name} for client {client_id}")
        
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

@router.get("/transactions")
async def list_transactions(
    access_token: str = Header(..., alias="Authorization"),
    consent_id: str = Header(..., alias="consent_id"),
    bank_name: str = Header(..., alias="X-Bank-Name"),
    client_id: str = Header(..., alias="client_id"),
    account_id: Optional[str] = Header(None, alias="accountId"),
    from_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD format)"),
    to_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD format)"),
    from_booking_date_time: Optional[str] = Query(None, description="From booking date time (ISO format)"),
    to_booking_date_time: Optional[str] = Query(None, description="To booking date time (ISO format)"),
    page: int = Query(1, description="Page number"),
    limit: int = Query(50, description="Results per page (max 500)"),
    offset: int = Query(0, description="Offset for pagination"),
    min_amount: Optional[float] = Query(None, description="Minimum transaction amount"),
    max_amount: Optional[float] = Query(None, description="Maximum transaction amount"),
    session: Session = Depends(get_session)
):
    """
    List transactions for authenticated client per Open Banking API (Step 4).
    
    Per Open Banking API documentation:
    - GET /transactions?client_id={client_id}
    - Headers: Authorization: Bearer <bank_token>, consent_id: <consent_id>, client_id: <client_id>
    
    Args:
        access_token: JWT session token in Authorization header (Bearer <token>)
        consent_id: Consent ID for transaction access (consent_id header)
        bank_name: Bank identifier (X-Bank-Name header): abank|sbank|vbank
        client_id: Client identifier (client_id header, e.g., "team286-9")
        date_from: Filter transactions from this date (ISO format)
        date_to: Filter transactions until this date (ISO format)
        min_amount: Minimum transaction amount
        max_amount: Maximum transaction amount
        session: Database session
    
    Returns:
        Dict with transactions list
    """
    logger.info(f"📱 TX REQUEST: bank_name={bank_name}, account_id={account_id}, from_date={from_date}, to_date={to_date}, limit={limit}")
    
    try:
        # Extract Bearer token
        if access_token.startswith("Bearer "):
            jwt_token = access_token[7:]
        else:
            jwt_token = access_token
        
        # Decode JWT to get credentials for bank-specific auth
        try:
            token_data = decode_token(jwt_token)
            client_id_stored = token_data.get("client_id")
            client_secret = token_data.get("client_secret")
            
            if not client_secret:
                logger.warning(f"🔍 TRANSACTIONS DEBUG: No client_secret in JWT, trying fallback token")
                # Fallback to universal token if available
                fallback_token = token_data.get("access_token")
                if not fallback_token:
                    raise HTTPException(
                        status_code=401,
                        detail="Invalid token: missing credentials"
                    )
                bank_token = fallback_token
                logger.info(f"🔍 TRANSACTIONS DEBUG: Using fallback universal token")
            else:
                # Get bank-specific token
                from services.auth_service import authenticate_with_bank
                logger.info(f"🔍 TRANSACTIONS DEBUG: Getting bank-specific token for {bank_name}")
                bank_token_data = await authenticate_with_bank(
                    client_id=client_id_stored,
                    client_secret=client_secret,
                    bank_id=bank_name
                )
                bank_token = bank_token_data.get("access_token")
                logger.info(f"🔍 TRANSACTIONS DEBUG: Got bank-specific token for {bank_name}")
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Token decode error: {str(e)}")
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired token"
            )
        
        # Check cache first
        cache_key = f"{bank_name}:{client_id}"
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
                        date_from=from_date,
                        date_to=to_date
                    ),
                    "from_cache": True,
                    "cache_age_seconds": int(cache_age)
                }
        
        # Fetch fresh data from bank API (Step 4)
        bank_service = BankService(bank_name, session)
        
        logger.info(f"📱 FETCHING: Calling BankService.get_transactions for {bank_name}, account_id={account_id}")
        
        data = await bank_service.get_transactions(
            bank_token=bank_token,
            consent_id=consent_id,
            account_id=account_id,  # Use accountId from header
            client_id=client_id,
            requesting_bank="team286",
            page=page,
            limit=limit,
            from_date=from_date,
            to_date=to_date,
            from_booking_date_time=from_booking_date_time,
            to_booking_date_time=to_booking_date_time,
            offset=offset
        )
        
        logger.info(f"📱 RESPONSE: Got data from BankService: {len(data.get('transactions', []))} transactions")
        
        # Update cache
        _tx_cache[cache_key] = {
            "data": data,
            "timestamp": current_time
        }
        
        transactions = data.get("transactions", [])
        
        logger.info(f"Fetched {len(transactions)} transactions for client {client_id} from {bank_name}")
        
        return {
            "transactions": _filter_transactions(
                transactions,
                min_amount=min_amount,
                max_amount=max_amount,
                date_from=from_date,
                date_to=to_date
            ),
            "from_cache": False
        }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error fetching transactions: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Ошибка при получении транзакций"
        )


@router.get("/accounts/{account_id}/balances")
async def get_account_balance(
    account_id: str,
    access_token: str = Header(..., alias="Authorization"),
    consent_id: Optional[str] = Header(None, alias="consent_id"),
    bank_name: Optional[str] = Header(None, alias="X-Bank-Name"),
    client_id: Optional[str] = Header(None, alias="client_id"),
    session: Session = Depends(get_session)
):
    """
    Get balance for a specific account per Open Banking API.
    
    Flow:
    - GET /accounts/{account_id}/balances
    - Headers: Authorization: Bearer <bank_token>, consent_id: <consent_id>, X-Bank-Name: <bank_name>, client_id: <client_id>
    
    Args:
        account_id: Account identifier from account list
        access_token: JWT session token in Authorization header
        consent_id: Consent ID for account access
        bank_name: Bank identifier (abank|sbank|vbank)
        client_id: Client identifier
        session: Database session
    
    Returns:
        Balance information with amount and currency
    """
    try:
        # Extract Bearer token
        if access_token.startswith("Bearer "):
            jwt_token = access_token[7:]
        else:
            jwt_token = access_token
        
        # Decode JWT to get credentials
        try:
            token_data = decode_token(jwt_token)
            client_secret = token_data.get("client_secret")
            
            if not client_secret:
                logger.warning(f"🔍 BALANCES: No client_secret in JWT, trying fallback token")
                bank_token = token_data.get("access_token")
                if not bank_token:
                    raise HTTPException(
                        status_code=401,
                        detail="Invalid token: missing credentials"
                    )
            else:
                # Get bank-specific token
                from services.auth_service import authenticate_with_bank
                logger.info(f"🔍 BALANCES: Getting bank-specific token for {bank_name}")
                
                # Extract base client_id (team286 part only, without -9 suffix)
                base_client_id = token_data.get("client_id", "team286")
                if "-" in str(base_client_id):
                    base_client_id = base_client_id.split("-")[0]
                
                logger.info(f"🔍 BALANCES: Using base_client_id={base_client_id} for bank token")
                
                bank_token_data = await authenticate_with_bank(
                    client_id=base_client_id,
                    client_secret=client_secret,
                    bank_id=bank_name
                )
                bank_token = bank_token_data.get("access_token")
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Token decode error: {str(e)}")
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired token"
            )
        
        # Initialize bank service
        bank_service = BankService(bank_name, session)
        
        logger.info(f"💰 BALANCES: Fetching balance for account {account_id} from {bank_name}")
        logger.info(f"   Headers: Authorization: Bearer {bank_token[:20]}..., X-Consent-Id: {consent_id}, client_id: {client_id}")
        
        # Get balance from bank API
        url = f"{bank_service.base_url}/accounts/{account_id}/balances"
        
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "X-Requesting-Bank": "team286",
            "X-Consent-Id": consent_id or ""
        }
        
        params = {
            "client_id": client_id or "team286"
        }
        
        logger.info(f"💰 BALANCES: GET {url}")
        logger.info(f"💰 BALANCES: Headers: {headers}")
        logger.info(f"💰 BALANCES: Params: {params}")
        
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, headers=headers, params=params)
                
                logger.info(f"💰 BALANCES: Response status: {response.status_code}")
                logger.info(f"💰 BALANCES: Response body: {response.text}")
                
                if response.status_code == 401:
                    raise HTTPException(
                        status_code=401,
                        detail="Ошибка аутентификации"
                    )
                
                if response.status_code == 403:
                    raise HTTPException(
                        status_code=403,
                        detail="Согласие не действительно или отозвано"
                    )
                
                response.raise_for_status()
                data = response.json()
                
                # Normalize response - different banks return different structures
                # ABank returns: {data: {balance: [...]}}
                # Other banks may return: {balance: {...}} or {balances: [...]}
                balances = []
                if isinstance(data, dict):
                    # Check for wrapped response: {data: {balance: [...]}}
                    if "data" in data and isinstance(data["data"], dict):
                        inner_data = data["data"]
                        if "balance" in inner_data:
                            balances = inner_data["balance"] if isinstance(inner_data["balance"], list) else [inner_data["balance"]]
                        elif "balances" in inner_data:
                            balances = inner_data["balances"] if isinstance(inner_data["balances"], list) else [inner_data["balances"]]
                    # Check for direct balance fields
                    elif "balance" in data:
                        balances = [data["balance"]] if not isinstance(data["balance"], list) else data["balance"]
                    elif "balances" in data:
                        balances = data["balances"] if isinstance(data["balances"], list) else [data["balances"]]
                    else:
                        # Unknown structure - log and use default
                        logger.warning(f"⚠️ BALANCES: Unknown response structure: {data}")
                        balances = []
                elif isinstance(data, list):
                    balances = data
                
                logger.info(f"✅ BALANCES: Got {len(balances)} balance(s) for account {account_id}")
                
                if balances:
                    logger.info(f"✅ BALANCES: Balance details: {balances[0]}")
                
                return {
                    "balance": balances[0] if balances else {"amount": 0, "currency": "RUB"},
                    "balances": balances
                }
                
        except httpx.HTTPStatusError as e:
            logger.error(f"❌ BALANCES: Bank API error: {e.response.status_code} - {e.response.text}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Ошибка получения баланса: {e.response.text}"
            )
        except httpx.RequestError as e:
            logger.error(f"❌ BALANCES: Request error: {str(e)}")
            raise HTTPException(
                status_code=503,
                detail="Ошибка соединения с банком"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ BALANCES: Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Ошибка при получении баланса"
        )