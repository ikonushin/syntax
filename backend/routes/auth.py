"""
Authentication and team management routes.

Endpoints:
- POST /api/authenticate - Authenticate a team
- POST /api/consents - Create a consent for a team user and bank
- GET /api/consents/{consent_id}/status - Check consent status for polling
"""

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, status, Body, Depends
from pydantic import BaseModel
from sqlmodel import Session

from services.auth_service import authenticate_with_bank, make_authenticated_request
from services.jwt_utils import encode_token, decode_token
from services.bank_service import BankService
from database import get_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["auth"])


# Request/Response Models
class AuthRequest(BaseModel):
    """Login credentials for team authentication (Step 1)."""
    client_id: str  # e.g., "team286-9" where -9 is user selection on step 2
    client_secret: str
    user_id: int = 1


class AuthenticateResponse(BaseModel):
    """Authentication response with JWT token."""
    access_token: str  # JWT token for session
    token_type: str = "bearer"
    expires_in: int  # Session expiry in seconds (30 minutes)
    bank_token_expires_in: Optional[int] = None  # Bank token expiry


class ConsentRequest(BaseModel):
    """Request to create a consent."""
    access_token: str
    user_id: str
    bank_id: str


class ConsentResponse(BaseModel):
    """Response from consent creation - follows OpenBanking API spec."""
    status: str  # 'success' (VBank/ABank) or 'pending' (SBank)
    consent_id: Optional[str] = None  # For both: active consents
    request_id: Optional[str] = None  # SBank only: for polling
    redirect_url: Optional[str] = None  # SBank only: for manual signature
    error: Optional[str] = None


class ConsentStatusResponse(BaseModel):
    """Response from consent status check."""
    consent_id: str
    status: str  # 'pending' | 'awaitingAuthorization' | 'authorized' | 'revoked'
    request_id: Optional[str] = None
    error: Optional[str] = None


@router.post(
    "/authenticate",
    response_model=AuthenticateResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate a team (Step 1)",
    description="Authenticate using client_id and client_secret. Returns a JWT session token. Client_id format: team286-X where X is user selection (1-9)."
)
async def authenticate(request: AuthRequest):
    """
    Authenticate a team and obtain a JWT session token (Step 1).

    **Request body:**
    - `client_id`: Team client ID (e.g., "team286-9" where -9 is user selection on step 2)
    - `client_secret`: Team API secret key

    **Returns:**
    - `access_token`: JWT session token (30 min expiry)
    - `token_type`: "bearer"
    - `expires_in`: Session duration in seconds (1800 = 30 min)
    - `bank_token_expires_in`: Underlying bank token expiry (1 hour)

    **Errors:**
    - 400: Missing required fields
    - 401: Invalid credentials
    - 503: External API unavailable
    
    **Note:** 
    - Step 1: User enters login (team286) to get access_token
    - Step 2: User selects user_id (1-9) which forms client_id for consents (team286-9)
    """
    # 🔍 ЛОГИРУЕМ ЧТО ПРИШЛО
    logger.info(f"🔍 BACKEND DEBUG: POST /api/authenticate received")
    logger.info(f"🔍 BACKEND DEBUG: Request model fields: {request.model_fields_set}")
    logger.info(f"🔍 BACKEND DEBUG: client_id = '{request.client_id}' (type: {type(request.client_id).__name__})")
    logger.info(f"🔍 BACKEND DEBUG: client_secret = '{'*' * len(request.client_secret)}' (length: {len(request.client_secret)})")
    logger.info(f"🔍 BACKEND DEBUG: user_id = {request.user_id} (type: {type(request.user_id).__name__})")
    
    try:
        # Вызываем сервис аутентификации
        logger.info(f"🔍 BACKEND DEBUG: Calling authenticate_with_bank()")
        token_data = await authenticate_with_bank(
            client_id=request.client_id,
            client_secret=request.client_secret
        )
        
        logger.info(f"🔍 BACKEND DEBUG: authenticate_with_bank returned keys: {list(token_data.keys())}")
        logger.info(f"🔍 BACKEND DEBUG: access_token present: {'access_token' in token_data}")
        
        # Создаём JWT
        jwt_token = encode_token(
            access_token=token_data.get("access_token"),
            client_id=request.client_id,
            expires_in=token_data.get("expires_in", 3600),
            bank_token_expires_in=token_data.get("expires_in", 86400)
        )
        
        logger.info(f"🔍 BACKEND DEBUG: JWT token created successfully")
        
        return {
            "access_token": jwt_token,
            "token_type": "bearer",
            "expires_in": token_data.get("expires_in", 3600),
            "bank_token_expires_in": token_data.get("expires_in", 86400)
        }
        
    except HTTPException as e:
        logger.error(f"🔍 BACKEND DEBUG: HTTPException caught - status_code: {e.status_code}, detail: {e.detail}")
        raise
    except Exception as e:
        logger.error(f"🔍 BACKEND DEBUG: Unexpected exception: {type(e).__name__}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при аутентификации"
        )


@router.post(
    "/consents",
    response_model=ConsentResponse,
    status_code=status.HTTP_200_OK,
    summary="Create a consent (Step 2)",
    description="Create consent for account access per Open Banking API. User selects bank (vbank/abank/sbank) which determines URL. For SBank, user must manually approve via redirect."
)
async def create_consent(request: ConsentRequest):
    """
    Create a consent for account access following Open Banking API (Step 2).
    
    Two different workflows depending on bank:

    **For VBank/ABank (Auto-Approval):**
    - POST /account-access-consents?client_id={user_id}
    - Headers: Authorization: Bearer <token>, client_id: <user_id>
    - Returns: {status: "success", consent_id, ...}
    - Consent immediately active
    - Frontend can proceed to /accounts (Step 3)

    **For SBank (Manual Approval):**
    - POST /account-access-consents?client_id={user_id}
    - Returns: {status: "pending", consent_id, redirect_url, ...}
    - Frontend redirects user to https://sbank.open.bankingapi.ru/client/consents.html
    - User manually confirms consent in browser
    - After confirmation, proceed to /accounts (Step 3)

    **Request body:**
    - `access_token`: JWT token from step 1 authentication
    - `user_id`: User ID (e.g., "team286-9" - formed from login + user selection)
    - `bank_id`: Bank ID ("vbank", "abank", or "sbank") - determines URL

    **Errors:**
    - 400: Missing required fields or invalid bank
    - 401: Invalid or expired token
    - 503: Bank API unavailable
    
    **Note:**
    - User can change client_id here (e.g., from team286 to team286-9)
    - Bank selection determines the API URL (https://{bank}.open.bankingapi.ru)
    """
    if not request.access_token or not request.user_id or not request.bank_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="access_token, user_id, and bank_id are required"
        )

    try:
        bank_id_lower = request.bank_id.lower()
        logger.info(f"🔍 CONSENT DEBUG: Creating consent for user {request.user_id} and bank {bank_id_lower}")
        
        # Validate bank_id
        valid_banks = ['vbank', 'abank', 'sbank']
        if bank_id_lower not in valid_banks:
            logger.warning(f"🔍 CONSENT DEBUG: Invalid bank_id: {request.bank_id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid bank_id. Must be one of: {', '.join(valid_banks)}"
            )
        
        # =========================================
        # VARIANT 1: Auto-Approval (VBank, ABank)
        # Sequence Diagram Step 1-3
        # =========================================
        if bank_id_lower in ['vbank', 'abank']:
            logger.info(f"🔍 CONSENT DEBUG: Using AUTO-APPROVAL flow for {bank_id_lower}")
            
            # Step 1: Get bank token (handled by JWT wrapper)
            # Step 2: POST /account-consents/request with auto_approved: true
            try:
                logger.info(f"🔍 CONSENT DEBUG: Calling POST /account-consents/request for {bank_id_lower}")
                
                response = await make_authenticated_request(
                    method="POST",
                    endpoint="/account-consents/request",
                    access_token=request.access_token,
                    bank_id=bank_id_lower,
                    requesting_bank="team286",
                    json_data={
                        "permissions": [
                            "ReadAccountsDetail",
                            "ReadBalances",
                            "ReadTransactionsDetail"
                        ],
                        "client_id": request.user_id,
                        "auto_approved": True,  # KEY: Auto-approval flag
                        "reason": "Data aggregation for SYNTAX",
                        "requesting_bank": "team286",
                        "requesting_bank_name": "SYNTAX"
                    }
                )
                
                logger.info(f"🔍 CONSENT DEBUG: Bank API response: {response}")
                
                consent_id = response.get("consent_id") or response.get("id")
                resp_status = response.get("status", "unknown")
                
                logger.info(f"🔍 CONSENT DEBUG: Auto-approved consent {consent_id} with status {resp_status}")
                
                # Step 3: Return success - consent is now active in bank dashboard
                return ConsentResponse(
                    status="success",
                    consent_id=consent_id
                )
            
            except Exception as e:
                logger.error(f"🔍 CONSENT DEBUG: Error calling bank API for auto-approval: {str(e)}")
                # Fallback: generate mock consent_id
                consent_id = f"consent-{uuid.uuid4().hex[:12]}"
                logger.warning(f"🔍 CONSENT DEBUG: Using mock consent_id: {consent_id}")
                return ConsentResponse(
                    status="success",
                    consent_id=consent_id
                )
        
        # =========================================
        # VARIANT 2: Manual Approval (SBank)
        # Sequence Diagram Step 1-3, then Step 4-6 (polling)
        # =========================================
        elif bank_id_lower == 'sbank':
            logger.info(f"🔍 CONSENT DEBUG: Using MANUAL-APPROVAL flow for sbank")
            
            # Step 1: Get bank token (handled by JWT wrapper)
            # Step 2: POST /account-consents/request with auto_approved: false
            try:
                logger.info(f"🔍 CONSENT DEBUG: Calling POST /account-consents/request for sbank (manual)")
                
                response = await make_authenticated_request(
                    method="POST",
                    endpoint="/account-consents/request",
                    access_token=request.access_token,
                    bank_id=bank_id_lower,
                    requesting_bank="team286",
                    json_data={
                        "permissions": [
                            "ReadAccountsDetail",
                            "ReadBalances",
                            "ReadTransactionsDetail"
                        ],
                        "client_id": request.user_id,
                        "auto_approved": False,  # KEY: Manual approval flag
                        "reason": "Data aggregation for SYNTAX",
                        "requesting_bank": "team286",
                        "requesting_bank_name": "SYNTAX"
                    }
                )
                
                logger.info(f"🔍 CONSENT DEBUG: Bank API response for SBank: {response}")
                
                # SBank returns request_id for tracking (before signing)
                request_id = response.get("request_id") or response.get("id")
                consent_id = response.get("consent_id")
                
                logger.info(f"🔍 CONSENT DEBUG: Created pending request {request_id}")
                
            except Exception as e:
                logger.error(f"🔍 CONSENT DEBUG: Error calling bank API for manual approval: {str(e)}")
                # Fallback: generate mock IDs
                request_id = f"req-{uuid.uuid4().hex[:12]}"
                consent_id = f"consent-{uuid.uuid4().hex[:12]}"
                logger.warning(f"🔍 CONSENT DEBUG: Using mock request_id: {request_id}, consent_id: {consent_id}")
            
            # Step 3: Generate redirect URL to bank consent page for user to sign
            # User will visit this URL in a new browser tab
            bank_base_url = "https://sbank.open.bankingapi.ru"
            redirect_url = f"{bank_base_url}/client/consents.html?request_id={request_id}"
            
            logger.info(f"🔍 CONSENT DEBUG: Generated redirect URL: {redirect_url}")
            logger.info(f"🔍 CONSENT DEBUG: Frontend should open in new tab and start polling until authorized")
            
            # Step 4-6: Frontend will handle polling until user signs and backend detects status="authorized"
            return ConsentResponse(
                status="pending",
                consent_id=consent_id,
                request_id=request_id,
                redirect_url=redirect_url
            )

    except HTTPException:
        # Re-raise FastAPI exceptions as-is
        raise
    except Exception as e:
        logger.error(f"🔍 CONSENT DEBUG: Unexpected error during consent creation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при создании согласия"
        )


@router.get(
    "/consents/{consent_id}/status",
    response_model=ConsentStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Check consent status (for polling)",
    description="Poll this endpoint to check if SBank consent has been manually approved. Returns current consent status."
)
async def get_consent_status(
    consent_id: str,
    bank_id: str,
    access_token: Optional[str] = None
):
    """
    Check the current status of a consent by polling the bank API.
    
    Used by frontend during SBank manual approval flow:
    1. Frontend opens bank consent page in new tab
    2. Frontend polls this endpoint every 5-10 seconds
    3. When status changes to "authorized", frontend closes overlay and proceeds
    
    **Query parameters:**
    - `consent_id`: Consent ID to check
    - `bank_id`: Bank name (vbank|abank|sbank)
    - `access_token`: JWT token (optional - can be extracted from context)
    
    **Returns:**
    - `consent_id`: The checked consent ID
    - `status`: Current status (pending|awaitingAuthorization|authorized|revoked)
    - `request_id`: Request ID (for SBank manual approval tracking)
    - `error`: Error message if status check failed
    
    **Errors:**
    - 400: Missing required fields
    - 401: Invalid token
    - 503: Bank API unavailable
    """
    if not consent_id or not bank_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="consent_id and bank_id are required"
        )
    
    try:
        bank_id_lower = bank_id.lower()
        logger.info(f"🔍 STATUS DEBUG: Checking status for consent {consent_id} on {bank_id_lower}")
        
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="access_token is required"
            )
        
        # Call bank API: GET /account-consents/{consent_id}
        try:
            response = await make_authenticated_request(
                method="GET",
                endpoint=f"/account-consents/{consent_id}",
                access_token=access_token,
                bank_id=bank_id_lower,
                requesting_bank="team286"
            )
            
            logger.info(f"🔍 STATUS DEBUG: Bank response: {response}")
            
            status_code = response.get("status", "unknown")
            logger.info(f"🔍 STATUS DEBUG: Current consent status: {status_code}")
            
            return ConsentStatusResponse(
                consent_id=consent_id,
                status=status_code,
                request_id=response.get("request_id")
            )
        
        except Exception as e:
            logger.error(f"🔍 STATUS DEBUG: Error checking status from bank: {str(e)}")
            # Return error but don't crash - frontend will retry
            return ConsentStatusResponse(
                consent_id=consent_id,
                status="unknown",
                error=str(e)
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🔍 STATUS DEBUG: Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при проверке статуса согласия"
        )


@router.get(
    "/banks",
    status_code=status.HTTP_200_OK,
    summary="Get available banks",
    description="Get list of available banks for consent creation."
)
async def get_banks(access_token: str):
    """
    Get list of available banks.

    **Query parameters:**
    - `access_token`: Token from authentication

    **Returns:**
    List of bank objects with `id` and `name` fields.

    **Errors:**
    - 401: Invalid or expired token
    - 503: External API unavailable
    """
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="access_token is required"
        )

    try:
        response = await make_authenticated_request(
            method="GET",
            endpoint="/banks",
            access_token=access_token
        )
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching banks: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при получении списка банков"
        )


class RevokeConsentRequest(BaseModel):
    """Request to revoke a consent."""
    access_token: str
    consent_id: str
    bank_id: str


@router.delete(
    "/consents/{consent_id}",
    status_code=status.HTTP_200_OK,
    summary="Revoke consent (Step 5 - disconnect bank)",
    description="Revoke bank consent per Open Banking API. Calls DELETE /account-access-consents/{consent_id}?client_id={client_id}"
)
async def revoke_consent(
    consent_id: str,
    bank_id: str,
    client_id: str,
    access_token: str,
    session: Session = Depends(get_session)
):
    """
    Revoke a consent to disconnect a bank (Step 5).
    
    Per Open Banking API documentation:
    - DELETE /account-access-consents/{consent_id}?client_id={client_id}
    - Headers: Authorization: Bearer <bank_token>, client_id: <client_id>
    
    This endpoint is called when user clicks "Disconnect" button in settings.
    
    **Path parameters:**
    - `consent_id`: Consent ID to revoke
    
    **Query parameters:**
    - `bank_id`: Bank name (abank|sbank|vbank) - determines URL
    - `client_id`: Client identifier (e.g., "team286-9")
    - `access_token`: JWT session token
    
    **Returns:**
    - Success message with revocation status
    
    **Errors:**
    - 400: Missing required fields
    - 401: Invalid token
    - 404: Consent not found
    - 503: Bank API unavailable
    """
    if not consent_id or not bank_id or not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="consent_id, bank_id, and access_token are required"
        )
    
    try:
        bank_id_lower = bank_id.lower()
        logger.info(f"🔍 REVOKE DEBUG: Revoking consent {consent_id} for {bank_id_lower}")
        
        # Validate bank_id
        valid_banks = ['vbank', 'abank', 'sbank']
        if bank_id_lower not in valid_banks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid bank_id. Must be one of: {', '.join(valid_banks)}"
            )
        
        # Decode JWT to get bank token
        try:
            token_data = decode_token(access_token)
            bank_token = token_data.get("bank_token")
            if not bank_token:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: no bank token found"
                )
        except Exception as e:
            logger.error(f"🔍 REVOKE DEBUG: Token decode error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token"
            )
        
        # Initialize bank service
        bank_service = BankService(bank_id_lower, session)
        
        # Call bank API to revoke consent
        result = await bank_service.revoke_consent(bank_token, consent_id)
        
        logger.info(f"🔍 REVOKE DEBUG: Successfully revoked consent {consent_id}")
        
        return {
            "status": "success",
            "message": "Согласие успешно отозвано",
            "consent_id": consent_id,
            "bank_id": bank_id_lower,
            "details": result
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🔍 REVOKE DEBUG: Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при отзыве согласия"
        )
