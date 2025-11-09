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
        Create consent for account access.
        
        Flow per documentation:
        - POST /account-consents/request
        - Headers: Authorization: Bearer <bank_token>, X-Requesting-Bank: <requesting_bank>
        - Body: {client_id, permissions, reason, requesting_bank, requesting_bank_name}
        - SBank: returns request_id for manual approval
        - ABank/VBank: auto-approved, returns consent_id
        
        Args:
            bank_token: Bank access token
            client_id: Client identifier (e.g., "team286-1")
            requesting_bank: Requesting bank name (default: "team286")
        
        Returns:
            Dict with consent details:
            - For auto-approval (ABank/VBank): {status: "approved", consent_id: "..."}
            - For manual approval (SBank): {status: "awaitingAuthorization", request_id: "...", consent_id: "..."}
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = "/account-consents/request"
        url = f"{self.base_url}{endpoint}"
        
        # Determine if manual approval required
        auto_approved = self.bank_name in ["abank", "vbank"]
        
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "X-Requesting-Bank": requesting_bank
        }
        
        payload = {
            "client_id": client_id,
            "permissions": [
                "ReadAccountsDetail",
                "ReadBalances",
                "ReadTransactionsDetail"
            ],
            "reason": "Агрегация счетов для Hackathon MVP",
            "requesting_bank": requesting_bank,
            "requesting_bank_name": "SYNTAX App",
            "auto_approved": auto_approved
        }
        
        logger.info(f"Creating consent for {self.bank_name}, client_id={client_id}, auto_approved={auto_approved}")
        
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(url, headers=headers, json=payload)
                
                if response.status_code == 401:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Токен авторизации истёк или неверный"
                    )
                
                response.raise_for_status()
                data = response.json()
                
                logger.info(f"Consent created: {data}")
                
                # Save consent to database
                consent_id = data.get("consent_id") or data.get("id")
                request_id = data.get("request_id")
                consent_status = data.get("status", "approved" if auto_approved else "awaitingAuthorization")
                
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
                
                logger.info(f"Saved consent to DB: {consent.id}")
                
                return data
                
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
    
    async def get_accounts(self, bank_token: str, consent_id: str, client_id: Optional[str] = None) -> List[Dict]:
        """
        Get list of accounts for authorized client.
        
        Flow per documentation:
        - GET /accounts?client_id={client_id} (optional)
        - Headers: Authorization: Bearer <bank_token>, X-Consent-Id: <consent_id>
        
        Args:
            bank_token: Bank access token
            consent_id: Consent ID for account access
            client_id: Optional client filter
        
        Returns:
            List of account dictionaries
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = "/accounts"
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "X-Consent-Id": consent_id
        }
        
        params = {}
        if client_id:
            params["client_id"] = client_id
        
        logger.info(f"Fetching accounts from {self.bank_name} with consent {consent_id}")
        
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
                
                # Normalize response (some banks return {accounts: [...]}, others return [...])
                accounts = data.get("accounts", data) if isinstance(data, dict) else data
                
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
        page: int = 1,
        limit: int = 50
    ) -> Dict:
        """
        Get transaction history for account.
        
        Flow per documentation:
        - GET /accounts/{account_id}/transactions?page={page}&limit={limit}
        - Headers: Authorization: Bearer <bank_token>, X-Consent-Id: <consent_id>
        
        Args:
            bank_token: Bank access token
            consent_id: Consent ID for transaction access
            account_id: Account identifier
            page: Page number (default: 1)
            limit: Transactions per page (default: 50, max: 500)
        
        Returns:
            Dict with transactions: {transactions: [...], pagination: {...}}
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = f"/accounts/{account_id}/transactions"
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "X-Consent-Id": consent_id
        }
        
        params = {
            "page": page,
            "limit": min(limit, 500)  # Cap at 500 per documentation
        }
        
        logger.info(f"Fetching transactions for account {account_id} from {self.bank_name} (page={page}, limit={limit})")
        
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
                
                # Normalize response
                if isinstance(data, dict) and "transactions" in data:
                    transactions = data["transactions"]
                elif isinstance(data, list):
                    transactions = data
                    data = {"transactions": transactions}
                else:
                    transactions = []
                
                logger.info(f"Fetched {len(transactions)} transactions for account {account_id}")
                return data
                
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
