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
        Create consent for account access per Open Banking API specification.
        
        Flow per Open Banking API documentation:
        - POST /account-access-consents?client_id={client_id}
        - Headers: Authorization: Bearer <bank_token>, client_id: <client_id>
        - Body: {"data": {"permissions": [...]}}
        - SBank: requires manual approval → redirect to https://sbank.open.bankingapi.ru/client/consents.html
        - ABank/VBank: auto-approved
        
        Args:
            bank_token: Bank access token from /auth/bank-token
            client_id: Client identifier (e.g., "team286-9")
            requesting_bank: Requesting bank name (default: "team286")
        
        Returns:
            Dict with consent details:
            - For auto-approval (ABank/VBank): {status: "approved", consent_id: "...", ...}
            - For manual approval (SBank): {status: "awaitingAuthorization", consent_id: "...", redirect_url: "..."}
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = f"/account-access-consents"
        url = f"{self.base_url}{endpoint}"
        
        # Determine if manual approval required (SBank only)
        requires_manual_approval = self.bank_name == "sbank"
        
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "client_id": client_id,
            "Content-Type": "application/json"
        }
        
        # Query parameters
        params = {
            "client_id": client_id
        }
        
        # Body structure per Open Banking API spec
        payload = {
            "data": {
                "permissions": [
                    "ReadAccountsBasic",
                    "ReadAccountsDetail",
                    "ReadBalances",
                    "ReadTransactionsBasic",
                    "ReadTransactionsDetail"
                ]
            }
        }
        
        logger.info(f"Creating consent for {self.bank_name}, client_id={client_id}, manual_approval={requires_manual_approval}")
        
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
                
                logger.info(f"Consent API response: {data}")
                
                # Extract consent_id from response
                # Per Open Banking API: response contains {"Data": {"ConsentId": "...", "Status": "..."}}
                consent_data = data.get("Data", data)
                consent_id = consent_data.get("ConsentId") or consent_data.get("consent_id") or data.get("id")
                consent_status = consent_data.get("Status", "AwaitingAuthorisation" if requires_manual_approval else "Authorised")
                
                # For SBank, generate redirect URL for manual approval
                redirect_uri = None
                if requires_manual_approval:
                    redirect_uri = f"https://sbank.open.bankingapi.ru/client/consents.html"
                
                # Save consent to database
                consent = Consent(
                    bank_name=self.bank_name,
                    client_id=client_id,
                    consent_id=consent_id or f"pending-{client_id}",
                    status=consent_status.lower() if consent_status else "pending",
                    redirect_uri=redirect_uri
                )
                
                self.db_session.add(consent)
                self.db_session.commit()
                self.db_session.refresh(consent)
                
                logger.info(f"Saved consent to DB: {consent.id}, consent_id={consent_id}, status={consent_status}")
                
                # Return normalized response
                return {
                    "consent_id": consent_id,
                    "status": consent_status,
                    "redirect_url": redirect_uri,
                    "requires_manual_approval": requires_manual_approval
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
    
    async def get_accounts(self, bank_token: str, consent_id: str, client_id: Optional[str] = None) -> List[Dict]:
        """
        Get list of accounts for authorized client per Open Banking API.
        
        Flow per Open Banking API documentation:
        - GET /accounts?client_id={client_id}
        - Headers: Authorization: Bearer <bank_token>, consent_id: <consent_id>, client_id: <client_id>
        
        Args:
            bank_token: Bank access token
            consent_id: Consent ID for account access
            client_id: Client identifier (required)
        
        Returns:
            List of account dictionaries
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = "/accounts"
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "consent_id": consent_id,
            "client_id": client_id or "team286"
        }
        
        params = {}
        if client_id:
            params["client_id"] = client_id
        
        logger.info(f"Fetching accounts from {self.bank_name} with consent_id={consent_id}, client_id={client_id}")
        
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
        client_id: Optional[str] = None,
        page: int = 1,
        limit: int = 50
    ) -> Dict:
        """
        Get transaction history for account per Open Banking API.
        
        Flow per Open Banking API documentation:
        - GET /transactions?client_id={client_id}
        - Headers: Authorization: Bearer <bank_token>, consent_id: <consent_id>, client_id: <client_id>
        
        Args:
            bank_token: Bank access token
            consent_id: Consent ID for transaction access
            account_id: Account identifier (used for filtering if needed)
            client_id: Client identifier
            page: Page number (default: 1)
            limit: Transactions per page (default: 50, max: 500)
        
        Returns:
            Dict with transactions: {transactions: [...], pagination: {...}}
        
        Raises:
            HTTPException: On API errors
        """
        endpoint = f"/transactions"
        url = f"{self.base_url}{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {bank_token}",
            "consent_id": consent_id,
            "client_id": client_id or "team286"
        }
        
        params = {
            "client_id": client_id or "team286"
        }
        
        logger.info(f"Fetching transactions from {self.bank_name} with consent_id={consent_id}, client_id={client_id}")
        
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
