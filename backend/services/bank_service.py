"""
Bank Service for unified interaction with multiple banks (ABank, SBank, VBank).

This service implements the OpenBanking API flow:
1. Authenticate and get bank token
2. Create consent (POST /account-consents/request)
3. Get list of accounts (GET /accounts with X-Consent-Id header)
4. Get transactions for account (GET /accounts/{account_id}/transactions)
5. Revoke consent when disconnecting bank (DELETE /account-consents/{consent_id})

API Documentation references:
- ABank: https://abank.open.bankingapi.ru/docs
- SBank: https://sbank.open.bankingapi.ru/docs  
- VBank: https://vbank.open.bankingapi.ru/docs
"""

import logging
import uuid
from typing import Dict, List, Optional
from datetime import datetime

import httpx
from fastapi import HTTPException, status
from sqlmodel import Session, select

from models.consent import Consent

logger = logging.getLogger(__name__)


class BankService:
    """Service for interacting with bank APIs."""
    
    # Bank base URLs
    BANK_URLS = {
        "abank": "https://abank.open.bankingapi.ru",
        "sbank": "https://sbank.open.bankingapi.ru",
        "vbank": "https://vbank.open.bankingapi.ru"
    }
    
    def __init__(self, bank_name: str, db_session: Session):
        """
        Initialize bank service.
        
        Args:
            bank_name: Bank identifier (abank, sbank, vbank)
            db_session: Database session for consent management
        """
        self.bank_name = bank_name.lower()
        if self.bank_name not in self.BANK_URLS:
            raise ValueError(f"Invalid bank name: {bank_name}. Must be one of: {list(self.BANK_URLS.keys())}")
        
        self.base_url = self.BANK_URLS[self.bank_name]
        self.db_session = db_session
        logger.info(f"Initialized BankService for {self.bank_name} at {self.base_url}")
    
    async def create_consent(
        self, 
        bank_token: str, 
        client_id: str,
        requesting_bank: str = "team286"
    ) -> Dict:
        """
        Create consent for account access per Open Banking API specification.
        
        Flow per Open Banking API documentation:
        - POST /account-consents/request
        - Headers: Authorization: Bearer <bank_token>, X-Requesting-Bank: <requesting_bank>
        - Body: {client_id, permissions, reason, requesting_bank, requesting_bank_name, auto_approved}
        - SBank: auto_approved=false → requires manual approval via UI
        - ABank/VBank: auto_approved=true → auto-approved
        
        Args:
            bank_token: Bank access token from /auth/bank-token
            client_id: Client identifier (e.g., "team286-9")
            requesting_bank: Requesting bank name (default: "team286")
        
        Returns:
            Dict with consent details:
            - For auto-approval (ABank/VBank): {consent_id: "...", status: "success"}
            - For manual approval (SBank): {consent_id: "...", request_id: "...", status: "pending"}
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = "/account-consents/request"
        url = f"{self.base_url}{endpoint}"
        
        # Determine if manual approval required (SBank only)
        auto_approved = self.bank_name in ["abank", "vbank"]
        
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "X-Requesting-Bank": requesting_bank,
            "Content-Type": "application/json"
        }
        
        # Body structure per Open Banking API spec
        payload = {
            "client_id": client_id,
            "permissions": [
                "ReadAccountsDetail",
                "ReadBalances",
                "ReadTransactionsDetail"
            ],
            "reason": "Агрегация счетов для SYNTAX",
            "requesting_bank": requesting_bank,
            "requesting_bank_name": "SYNTAX App",
            "auto_approved": auto_approved
        }
        
        logger.info(f"Creating consent for {self.bank_name}, client_id={client_id}, auto_approved={auto_approved}")
        logger.info(f"POST {url}")
        logger.info(f"Headers: {headers}")
        logger.info(f"Body: {payload}")
        
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(url, headers=headers, json=payload)
                
                logger.info(f"Response status: {response.status_code}")
                logger.info(f"Response body: {response.text[:500]}")
                
                if response.status_code == 401:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Токен авторизации истёк или неверный"
                    )
                
                response.raise_for_status()
                data = response.json()
                
                logger.info(f"Consent API response: {data}")
                
                # Extract consent_id and request_id from response
                consent_id = data.get("consent_id") or data.get("id")
                request_id = data.get("request_id")
                consent_status = data.get("status", "approved" if auto_approved else "pending")
                
                # For SBank pending: use request_id as consent_id if consent_id is None
                if not consent_id and request_id and consent_status == "pending":
                    consent_id = request_id
                    logger.info(f"Using request_id as consent_id for pending SBank: {consent_id}")
                
                # Check if consent already exists for this user and bank
                existing_consent = self.db_session.exec(
                    select(Consent).where(
                        (Consent.client_id == client_id) &
                        (Consent.bank_name == self.bank_name) &
                        (Consent.status == "approved")
                    )
                ).first()
                
                if existing_consent:
                    logger.info(f"Active consent already exists for {client_id} with {self.bank_name}, updating consent_id")
                    # Update existing consent instead of creating new one
                    existing_consent.consent_id = consent_id or existing_consent.consent_id
                    existing_consent.request_id = request_id or existing_consent.request_id
                    existing_consent.status = consent_status
                    existing_consent.redirect_uri = data.get("redirect_uri")
                    self.db_session.add(existing_consent)
                    self.db_session.commit()
                    self.db_session.refresh(existing_consent)
                    consent = existing_consent
                    logger.info(f"Updated existing consent in DB: {consent.id}, consent_id={consent_id}")
                else:
                    # Save new consent to database
                    consent = Consent(
                        bank_name=self.bank_name,
                        client_id=client_id,
                        consent_id=consent_id or f"pending-{request_id}",
                        request_id=request_id,
                        status=consent_status,
                        redirect_uri=data.get("redirect_uri")
                    )
                    
                    self.db_session.add(consent)
                    self.db_session.commit()
                    self.db_session.refresh(consent)
                    logger.info(f"Saved new consent to DB: {consent.id}, consent_id={consent_id}, request_id={request_id}, status={consent_status}")
                
                logger.info(f"Saved consent to DB: {consent.id}, consent_id={consent_id}, request_id={request_id}, status={consent_status}")
                
                # Return normalized response - use consent_id for both auto-approved and pending
                return {
                    "consent_id": consent_id,
                    "request_id": request_id,
                    "status": consent_status,
                    "redirect_url": data.get("redirect_uri"),
                    "data": data
                }
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Bank API error creating consent: {e.response.status_code} - {e.response.text}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Ошибка банка: {e.response.text}"
            )
        except httpx.RequestError as e:
            logger.error(f"Request error creating consent: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ошибка соединения с банком"
            )
    
    async def get_consent_status(self, bank_token: str, consent_id: str) -> Dict:
        """
        Check consent status (used for polling SBank manual approval).
        
        Flow per documentation:
        - GET /account-consents/{consent_id}
        - Headers: Authorization: Bearer <bank_token>
        
        Args:
            bank_token: Bank access token
            consent_id: Consent identifier
        
        Returns:
            Dict with consent status: {consent_id, status, ...}
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = f"/account-consents/{consent_id}"
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {bank_token}"
        }
        
        logger.info(f"Checking consent status for {consent_id} at {self.bank_name}")
        
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, headers=headers)
                
                if response.status_code == 404:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Согласие не найдено"
                    )
                
                response.raise_for_status()
                data = response.json()
                
                # Update consent status in DB if changed
                statement = select(Consent).where(
                    Consent.consent_id == consent_id,
                    Consent.bank_name == self.bank_name
                )
                consent = self.db_session.exec(statement).first()
                
                if consent and consent.status != data.get("status"):
                    consent.status = data.get("status")
                    consent.updated_at = datetime.utcnow()
                    self.db_session.commit()
                    logger.info(f"Updated consent {consent_id} status to {consent.status}")
                
                return data
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Bank API error checking consent: {e.response.status_code} - {e.response.text}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Ошибка банка: {e.response.text}"
            )
        except httpx.RequestError as e:
            logger.error(f"Request error checking consent: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ошибка соединения с банком"
            )
    
    async def get_consent_id_by_request_id(self, bank_token: str, request_id: str) -> Dict:
        """
        For SBank: Get actual consent_id from request_id after user approval.
        
        Flow:
        - GET /account-consents/request/{request_id}
        - Headers: Authorization: Bearer <bank_token>
        
        Args:
            bank_token: Bank access token
            request_id: Request ID from consent creation (req-...)
        
        Returns:
            Dict with consent_id and status: {consent_id, status, ...}
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = f"/account-consents/request/{request_id}"
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {bank_token}"
        }
        
        logger.info(f"Getting consent_id for request {request_id} at {self.bank_name}")
        
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, headers=headers)
                
                if response.status_code == 404:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Запрос не найден"
                    )
                
                response.raise_for_status()
                data = response.json()
                
                consent_id = data.get("consentId") or data.get("consent_id")
                status_val = data.get("status", "authorized")
                
                logger.info(f"Got consent_id: {consent_id}, status: {status_val}")
                
                # Save/update consent in DB
                statement = select(Consent).where(
                    Consent.consent_id == consent_id,
                    Consent.bank_name == self.bank_name
                )
                db_consent = self.db_session.exec(statement).first()
                
                if not db_consent:
                    # Create new consent entry
                    db_consent = Consent(
                        id=uuid.uuid4(),
                        consent_id=consent_id,
                        request_id=request_id,
                        bank_name=self.bank_name,
                        status=status_val,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow()
                    )
                    self.db_session.add(db_consent)
                else:
                    # Update existing
                    db_consent.status = status_val
                    db_consent.updated_at = datetime.utcnow()
                    self.db_session.add(db_consent)
                
                self.db_session.commit()
                logger.info(f"Saved/updated consent {consent_id} in DB with status {status_val}")
                
                return {
                    "consent_id": consent_id,
                    "status": status_val,
                    "data": data
                }
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Bank API error getting consent: {e.response.status_code} - {e.response.text}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Ошибка банка: {e.response.text}"
            )
        except httpx.RequestError as e:
            logger.error(f"Request error getting consent: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ошибка соединения с банком"
            )
    
    async def get_accounts(self, bank_token: str, consent_id: str, client_id: Optional[str] = None, requesting_bank: str = "team286") -> List[Dict]:
        """
        Get list of accounts for authorized client per Open Banking API.
        
        Flow per Open Banking API documentation:
        - GET /accounts?client_id={client_id}
        - Headers: Authorization: Bearer <bank_token>, X-Requesting-Bank: <requesting_bank>, X-Consent-Id: <consent_id>
        
        Args:
            bank_token: Bank access token
            consent_id: Consent ID for account access
            client_id: Client identifier (e.g., "team286-9")
            requesting_bank: Requesting bank name (must match consent creation)
        
        Returns:
            List of account dictionaries
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = "/accounts"
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "X-Requesting-Bank": requesting_bank,
            "X-Consent-Id": consent_id
        }
        
        params = {
            "client_id": client_id or "team286"
        }
        
        logger.info(f"Fetching accounts from {self.bank_name}")
        logger.info(f"GET {url}")
        logger.info(f"Headers: {headers}")
        logger.info(f"Params: {params}")
        
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, headers=headers, params=params)
                
                if response.status_code == 401:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Токен авторизации истёк или неверный"
                    )
                
                if response.status_code == 403:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Согласие не действительно или отозвано"
                    )
                
                response.raise_for_status()
                data = response.json()
                
                # Normalize response - different banks return different structures
                # VBank: {accounts: {data: {account: [...]}, links: {...}}}
                # ABank/SBank: {accounts: [...]} or just [...]
                accounts = data.get("accounts", data) if isinstance(data, dict) else data
                
                # Handle VBank structure
                if isinstance(accounts, dict) and "data" in accounts:
                    accounts = accounts.get("data", {}).get("account", [])
                
                # Ensure we have a list
                if not isinstance(accounts, list):
                    accounts = [accounts] if accounts else []
                
                logger.info(f"Fetched {len(accounts)} accounts from {self.bank_name}")
                return accounts
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Bank API error fetching accounts: {e.response.status_code} - {e.response.text}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Ошибка банка: {e.response.text}"
            )
        except httpx.RequestError as e:
            logger.error(f"Request error fetching accounts: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ошибка соединения с банком"
            )
    
    async def get_transactions(
        self,
        bank_token: str,
        consent_id: str,
        account_id: str,
        client_id: Optional[str] = None,
        requesting_bank: str = "team286",
        page: int = 1,
        limit: int = 50,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        from_booking_date_time: Optional[str] = None,
        to_booking_date_time: Optional[str] = None,
        offset: int = 0
    ) -> Dict:
        """
        Get transaction history for account per Open Banking API.
        
        Flow per Open Banking API documentation:
        - GET /accounts/{account_id}/transactions?page={page}&limit={limit}&from={from}&to={to}&...
        - Headers: Authorization: Bearer <bank_token>, X-Requesting-Bank: <requesting_bank>, X-Consent-Id: <consent_id>, accountId: <account_id>
        
        Args:
            bank_token: Bank access token
            consent_id: Consent ID for transaction access
            account_id: Account identifier
            client_id: Client identifier
            requesting_bank: Requesting bank name (must match consent creation)
            page: Page number (default: 1)
            limit: Transactions per page (default: 50, max: 500)
            from_date: Filter from date (YYYY-MM-DD format)
            to_date: Filter to date (YYYY-MM-DD format)
            from_booking_date_time: Filter from booking date time (ISO format)
            to_booking_date_time: Filter to booking date time (ISO format)
            offset: Offset for pagination (default: 0)
        
        Returns:
            Dict with transactions: {transactions: [...], pagination: {...}}
        
        Raises:
            HTTPException: On API errors
        """
        # Build endpoint - if account_id is provided, use it; otherwise get all transactions
        if account_id and account_id != "None":
            endpoint = f"/accounts/{account_id}/transactions"
        else:
            endpoint = "/transactions"
        
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "X-Requesting-Bank": requesting_bank,
            "X-Consent-Id": consent_id
        }
        
        # Add accountId header if account_id is provided
        if account_id and account_id != "None":
            headers["accountId"] = account_id
        
        params = {
            "page": page,
            "limit": min(limit, 500),  # Cap at 500 per documentation
            "offset": offset
        }
        
        # Add optional date filters
        if from_date:
            params["from"] = from_date
        if to_date:
            params["to"] = to_date
        if from_booking_date_time:
            params["from_booking_date_time"] = from_booking_date_time
        if to_booking_date_time:
            params["to_booking_date_time"] = to_booking_date_time
        
        logger.info(f"Fetching transactions from {self.bank_name}")
        logger.info(f"GET {url}")
        logger.info(f"Headers: {headers}")
        logger.info(f"Params: {params}")
        
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get(url, headers=headers, params=params)
                
                if response.status_code == 401:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Токен авторизации истёк или неверный"
                    )
                
                if response.status_code == 403:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Согласие не действительно или отозвано"
                    )
                
                if response.status_code == 404:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Счёт не найден"
                    )
                
                response.raise_for_status()
                data = response.json()
                
                logger.info(f"Raw response from bank: {str(data)[:500]}")
                
                # Normalize response - VBank returns data.transaction
                if isinstance(data, dict):
                    if "data" in data and isinstance(data["data"], dict):
                        # VBank format: {data: {transaction: [...]}}
                        if "transaction" in data["data"]:
                            transactions = data["data"]["transaction"] if isinstance(data["data"]["transaction"], list) else []
                        else:
                            transactions = []
                    elif "transactions" in data:
                        # Alternative format: {transactions: [...]}
                        transactions = data["transactions"]
                    else:
                        transactions = []
                elif isinstance(data, list):
                    # Direct list format
                    transactions = data
                    data = {"transactions": transactions}
                else:
                    transactions = []
                
                logger.info(f"Fetched {len(transactions)} transactions for account {account_id}")
                
                # Return normalized format
                return {
                    "transactions": transactions,
                    "data": data
                }
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Bank API error fetching transactions: {e.response.status_code} - {e.response.text}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Ошибка банка: {e.response.text}"
            )
        except httpx.RequestError as e:
            logger.error(f"Request error fetching transactions: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ошибка соединения с банком"
            )
    
    async def revoke_consent(self, bank_token: str, consent_id: str) -> Dict:
        """
        Revoke consent (disconnect bank).
        
        Flow per documentation:
        - DELETE /account-consents/{consent_id}
        - Headers: Authorization: Bearer <bank_token>
        
        Args:
            bank_token: Bank access token
            consent_id: Consent identifier to revoke
        
        Returns:
            Dict with revocation status
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = f"/account-consents/{consent_id}"
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {bank_token}"
        }
        
        logger.info(f"Revoking consent {consent_id} at {self.bank_name}")
        
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.delete(url, headers=headers)
                
                if response.status_code == 404:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Согласие не найдено"
                    )
                
                response.raise_for_status()
                
                # Update consent status in DB
                statement = select(Consent).where(
                    Consent.consent_id == consent_id,
                    Consent.bank_name == self.bank_name
                )
                consent = self.db_session.exec(statement).first()
                
                if consent:
                    consent.status = "revoked"
                    consent.updated_at = datetime.utcnow()
                    self.db_session.commit()
                    logger.info(f"Marked consent {consent_id} as revoked in DB")
                
                # Parse response if JSON, otherwise return success message
                try:
                    data = response.json()
                except:
                    data = {"status": "revoked", "message": "Согласие успешно отозвано"}
                
                return data
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Bank API error revoking consent: {e.response.status_code} - {e.response.text}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Ошибка банка: {e.response.text}"
            )
        except httpx.RequestError as e:
            logger.error(f"Request error revoking consent: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ошибка соединения с банком"
            )
    
    def get_consent_from_db(self, client_id: str) -> Optional[Consent]:
        """
        Get active consent from database.
        
        Args:
            client_id: Client identifier
        
        Returns:
            Consent object if found and active, None otherwise
        """
        statement = select(Consent).where(
            Consent.bank_name == self.bank_name,
            Consent.client_id == client_id,
            Consent.status.in_(["approved", "authorized", "awaitingAuthorization"])
        )
        consent = self.db_session.exec(statement).first()
        
        if consent:
            logger.info(f"Found active consent {consent.consent_id} for {client_id} at {self.bank_name}")
        else:
            logger.warning(f"No active consent found for {client_id} at {self.bank_name}")
        
        return consent
    
    async def create_payment_consent(
        self,
        bank_token: str,
        client_id: str,
        amount: float,
        debtor_account: str,
        recipient_account: str = "4081781028601060774",
        recipient_name: str = "ФНС России",
        recipient_inn: str = "7707329152",
        recipient_kpp: str = "770701001",
        recipient_bik: str = "044525000",
        payment_purpose: str = "Оплата налога",
        requesting_bank: str = "team286"
    ) -> Dict:
        """
        Create payment consent per Open Banking API specification (Step 6).
        
        Flow per Open Banking API documentation:
        - POST /payment-consents?client_id={client_id}
        - Headers: Authorization: Bearer <bank_token>, client_id: <client_id>
        - Body: {"data": {"permissions": ["CreatePayment"], "initiation": {...}}}
        
        Args:
            bank_token: Bank access token
            client_id: Client identifier (e.g., "team286-9")
            amount: Payment amount in rubles (random from tax calculation 2000-5000)
            debtor_account: Source account from step 3 (user's account)
            recipient_account: Fixed ФНС account (4081781028601060774)
            recipient_name: Fixed recipient name (ФНС России)
            recipient_inn: Fixed ФНС INN
            recipient_kpp: Fixed ФНС KPP
            recipient_bik: Fixed bank BIK
            payment_purpose: Payment purpose (назначение платежа)
            requesting_bank: Requesting bank name (default: "team286")
        
        Returns:
            Dict with payment consent details: {consent_id, status, ...}
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = "/payment-consents"
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "client_id": client_id,
            "Content-Type": "application/json"
        }
        
        params = {
            "client_id": client_id
        }
        
        # Body structure per Open Banking API spec (Step 6)
        payload = {
            "data": {
                "permissions": [
                    "CreatePayment"
                ],
                "initiation": {
                    "instructedAmount": {
                        "amount": f"{amount:.2f}",
                        "currency": "RUB"
                    },
                    "debtorAccount": {
                        "schemeName": "RU.CBR.PAN",
                        "identification": debtor_account
                    },
                    "creditorAccount": {
                        "schemeName": "RU.CBR.PAN",
                        "identification": recipient_account,
                        "bank_code": self.bank_name
                    }
                }
            }
        }
        
        logger.info(f"Creating payment consent for {self.bank_name}, client_id={client_id}, amount={amount}, debtor={debtor_account}")
        
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(url, headers=headers, params=params, json=payload)
                
                if response.status_code == 401:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Токен авторизации истёк или неверный"
                    )
                
                response.raise_for_status()
                data = response.json()
                
                logger.info(f"Payment consent API response: {data}")
                
                # Extract consent_id from response
                consent_data = data.get("Data", data)
                consent_id = consent_data.get("ConsentId") or consent_data.get("consent_id") or data.get("id")
                
                return {
                    "consent_id": consent_id,
                    "status": consent_data.get("Status", "Authorised"),
                    "amount": amount,
                    "currency": "RUB"
                }
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Bank API error creating payment consent: {e.response.status_code} - {e.response.text}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Ошибка банка при создании согласия на платёж: {e.response.text}"
            )
        except httpx.RequestError as e:
            logger.error(f"Request error creating payment consent: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ошибка соединения с банком"
            )
    
    async def submit_payment(
        self,
        bank_token: str,
        consent_id: str,
        client_id: str,
        amount: float,
        debtor_account: str,
        recipient_account: str = "4081781028601060774",
        payment_comment: str = "Оплата налога",
        requesting_bank: str = "team286"
    ) -> Dict:
        """
        Submit payment for execution using payment consent (Step 7).
        
        Flow per Open Banking API documentation:
        - POST /payments?client_id={client_id}
        - Headers: Authorization: Bearer <bank_token>, consent_id: <consent_id>, client_id: <client_id>
        - Body: {"data": {"initiation": {...}}}
        
        Args:
            bank_token: Bank access token
            consent_id: Payment consent ID from step 6
            client_id: Client identifier (e.g., "team286-9")
            amount: Payment amount (same as in step 6)
            debtor_account: Source account from step 3
            recipient_account: Fixed ФНС account (4081781028601060774)
            payment_comment: Payment comment (default: "Оплата налога")
            requesting_bank: Requesting bank name (default: "team286")
        
        Returns:
            Dict with payment submission details: {payment_id, status, ...}
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = "/payments"
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "consent_id": consent_id,
            "client_id": client_id,
            "Content-Type": "application/json"
        }
        
        params = {
            "client_id": client_id
        }
        
        # Body structure per Open Banking API spec (Step 7)
        payload = {
            "data": {
                "initiation": {
                    "instructedAmount": {
                        "amount": f"{amount:.2f}",
                        "currency": "RUB"
                    },
                    "debtorAccount": {
                        "schemeName": "RU.CBR.PAN",
                        "identification": debtor_account
                    },
                    "creditorAccount": {
                        "schemeName": "RU.CBR.PAN",
                        "identification": recipient_account,
                        "bank_code": self.bank_name
                    },
                    "comment": payment_comment
                }
            }
        }
        
        logger.info(f"Submitting payment for {self.bank_name}, consent_id={consent_id}, client_id={client_id}, amount={amount}")
        
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(url, headers=headers, params=params, json=payload)
                
                if response.status_code == 401:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Токен авторизации истёк или неверный"
                    )
                
                if response.status_code == 403:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Согласие на платёж не действительно или истекло"
                    )
                
                response.raise_for_status()
                data = response.json()
                
                logger.info(f"Payment API response: {data}")
                
                # Extract payment details from response
                payment_data = data.get("Data", data)
                payment_id = payment_data.get("PaymentId") or payment_data.get("payment_id") or data.get("id")
                payment_status = payment_data.get("Status", "AcceptedSettlementCompleted")
                
                return {
                    "payment_id": payment_id,
                    "status": payment_status,
                    "amount": amount,
                    "currency": "RUB",
                    "creationDateTime": payment_data.get("CreationDateTime", datetime.utcnow().isoformat()),
                    "statusUpdateDateTime": payment_data.get("StatusUpdateDateTime", datetime.utcnow().isoformat())
                }
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Bank API error submitting payment: {e.response.status_code} - {e.response.text}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Ошибка банка при исполнении платежа: {e.response.text}"
            )
        except httpx.RequestError as e:
            logger.error(f"Request error submitting payment: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ошибка соединения с банком"
            )
    
    async def get_payment_status(self, bank_token: str, payment_id: str) -> Dict:
        """
        Check payment status.
        
        Flow per OpenBanking documentation:
        - GET /domestic-payments/{payment_id}
        - Headers: Authorization: Bearer <bank_token>
        
        Args:
            bank_token: Bank access token
            payment_id: Payment identifier
        
        Returns:
            Dict with payment status: {payment_id, status, ...}
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = f"/domestic-payments/{payment_id}"
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {bank_token}"
        }
        
        logger.info(f"Checking payment status for {payment_id} at {self.bank_name}")
        
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, headers=headers)
                
                if response.status_code == 404:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Платёж не найден"
                    )
                
                response.raise_for_status()
                data = response.json()
                
                logger.info(f"Payment status: {data}")
                return data
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Bank API error checking payment: {e.response.status_code} - {e.response.text}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Ошибка банка: {e.response.text}"
            )
        except httpx.RequestError as e:
            logger.error(f"Request error checking payment: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ошибка соединения с банком"
            )
