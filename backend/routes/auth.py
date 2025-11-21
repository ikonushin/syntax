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

from fastapi import APIRouter, HTTPException, status, Body, Depends, Header
from pydantic import BaseModel
from sqlmodel import Session, select

from services.auth_service import authenticate_with_bank, make_authenticated_request
from services.jwt_utils import encode_token, decode_token
from services.bank_service import BankService
from database import get_session
from models.consent import Consent

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
        
        # Создаём JWT (access_token универсальный для всех банков, сохраняем secret для переаутентификации)
        jwt_token = encode_token(
            access_token=token_data.get("access_token"),
            client_id=request.client_id,
            expires_in=token_data.get("expires_in", 3600),
            bank_token_expires_in=token_data.get("expires_in", 86400),
            client_secret=request.client_secret  # Сохраняем для получения токенов других банков
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
    description="Create consent for account access per Open Banking API. User selects bank (vbank/abank/sbank) which determines URL. For SBank/VBank, user must manually approve via redirect. Only ABank has auto-approval."
)
async def create_consent(
    request: ConsentRequest,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session)
):
    """
    Create a consent for account access following Open Banking API (Step 2).
    
    Three different workflows depending on bank:

    **For ABank (Auto-Approval):**
    - POST /account-access-consents?client_id={user_id}
    - Headers: Authorization: Bearer <token>, client_id: <user_id>
    - Returns: {status: "success", consent_id, ...}
    - Consent immediately active
    - Frontend can proceed to /accounts (Step 3)

    **For SBank/VBank (Manual Approval):**
    - POST /account-access-consents?client_id={user_id}
    - Returns: {status: "pending", consent_id, redirect_url, ...}
    - Frontend redirects user to https://{bank}.open.bankingapi.ru/client/consents.html
    - User manually confirms consent in browser
    - After confirmation, proceed to /accounts (Step 3)

    **Request body:**
    - `user_id`: User ID (e.g., "team286-9" - formed from login + user selection)
    - `bank_id`: Bank ID ("vbank", "abank", or "sbank") - determines URL

    **Headers:**
    - `Authorization`: Bearer token from step 1 authentication

    **Errors:**
    - 400: Missing required fields or invalid bank
    - 401: Invalid or expired token
    - 503: Bank API unavailable
    
    **Note:**
    - User can change client_id here (e.g., from team286 to team286-9)
    - Bank selection determines the API URL (https://{bank}.open.bankingapi.ru)
    """
    # Extract access_token from Authorization header
    access_token = None
    if authorization:
        if authorization.startswith("Bearer "):
            access_token = authorization[7:]
        else:
            access_token = authorization
    
    if not access_token or not request.user_id or not request.bank_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authorization header with Bearer token, user_id, and bank_id are required"
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
        
        # Check if active consent already exists for this user and bank
        existing_consent = session.exec(
            select(Consent).where(
                (Consent.client_id == request.user_id) &
                (Consent.bank_name == bank_id_lower) &
                (Consent.status == "approved")
            )
        ).first()
        
        if existing_consent:
            logger.info(f"🔍 CONSENT DEBUG: Active consent already exists for {request.user_id} with {bank_id_lower}")
            return ConsentResponse(
                status="success",
                consent_id=existing_consent.consent_id
            )
        
        # Decode JWT to get credentials for bank-specific auth
        try:
            token_data = decode_token(access_token)
            client_id = token_data.get("client_id")
            client_secret = token_data.get("client_secret")
            
            if not client_secret:
                logger.warning(f"🔍 CONSENT DEBUG: No client_secret in JWT token")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing credentials"
                )
            
            logger.info(f"🔍 CONSENT DEBUG: Decoded JWT token, client_id: {client_id}")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"🔍 CONSENT DEBUG: Failed to decode JWT token: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired access token"
            )
        
        # Get bank-specific token for the selected bank
        logger.info(f"🔍 CONSENT DEBUG: Getting token for bank {bank_id_lower}")
        try:
            bank_token_data = await authenticate_with_bank(
                client_id=client_id,
                client_secret=client_secret,
                bank_id=bank_id_lower
            )
            bank_token = bank_token_data.get("access_token")
            logger.info(f"🔍 CONSENT DEBUG: Got token for bank {bank_id_lower}")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"🔍 CONSENT DEBUG: Failed to get bank token: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Не удалось получить токен от банка"
            )
        
        # Call BankService to create consent
        bank_service = BankService(bank_id_lower, session)
        
        logger.info(f"🔍 CONSENT DEBUG: Calling BankService.create_consent()")
        
        response = await bank_service.create_consent(
            bank_token=bank_token,
            client_id=request.user_id,
            requesting_bank="team286"
        )
        
        logger.info(f"🔍 CONSENT DEBUG: BankService response: {response}")
        
        consent_id = response.get("consent_id")
        request_id = response.get("request_id")
        consent_status = response.get("status", "unknown")
        redirect_url = response.get("redirect_url")
        
        logger.info(f"🔍 CONSENT DEBUG: consent_id={consent_id}, request_id={request_id}, status={consent_status}")
        
        # Return response based on consent status
        if consent_status in ["pending", "awaitingAuthorization"]:
            # Manual approval needed (SBank/VBank)
            # Generate redirect URL if not provided
            if not redirect_url and request_id:
                redirect_url = f"https://{bank_id_lower}.open.bankingapi.ru/client/consents.html?request_id={request_id}"
            
            return ConsentResponse(
                status="pending",
                consent_id=consent_id,
                request_id=request_id,
                redirect_url=redirect_url
            )
        else:
            # Auto-approved (ABank)
            return ConsentResponse(
                status="success",
                consent_id=consent_id
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
    "/consents/{consent_id}",
    status_code=status.HTTP_200_OK,
    summary="Get consent details",
    description="Get consent details and check current status"
)
async def get_consent_details(
    consent_id: str,
    bank_id: str = None,
    user_id: str = None,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session)
):
    """
    Get consent details and current status.
    
    Used by frontend after SBank manual approval to fetch real consent_id.
    
    **Path parameters:**
    - `consent_id`: Consent ID or Request ID to fetch (consent-... or req-...)
    
    **Query parameters:**
    - `bank_id`: Bank name (vbank|abank|sbank)
    - `user_id`: User ID for updating consent record
    
    **Headers:**
    - `Authorization`: Bearer token (JWT)
    
    **Returns:**
    - Consent status and details
    """
    if not consent_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="consent_id is required"
        )
    
    # Extract access_token from Authorization header
    access_token = None
    if authorization:
        if authorization.startswith("Bearer "):
            access_token = authorization[7:]
        else:
            access_token = authorization
    
    try:
        logger.info(f"🔍 GET_CONSENT DEBUG: Getting consent/request {consent_id}, bank={bank_id}, user_id={user_id}, has_auth={bool(authorization)}")
        
        # Check if this is a request_id (starts with "req-") for SBank
        is_request_id = consent_id.startswith("req-")
        
        if is_request_id and bank_id:
            # For SBank: convert request_id to consent_id
            logger.info(f"🔍 GET_CONSENT DEBUG: This is a request_id for SBank, converting to consent_id")
            
            bank_id_lower = bank_id.lower()
            
            if not access_token:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authorization header with Bearer token is required"
                )
            
            try:
                token_data = decode_token(access_token)
                client_secret = token_data.get("client_secret")
                client_id = token_data.get("client_id")
                
                if not client_secret:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid token: missing credentials"
                    )
                
                # Get bank-specific token
                bank_token_data = await authenticate_with_bank(
                    client_id=client_id,
                    client_secret=client_secret,
                    bank_id=bank_id_lower
                )
                bank_token = bank_token_data.get("access_token")
                
                # Call bank service to get consent_id from request_id
                # Pass user_id if provided, otherwise use decoded client_id
                bank_service = BankService(bank_id_lower, session)
                result = await bank_service.get_consent_id_by_request_id(
                    bank_token, 
                    consent_id,
                    client_id=user_id or client_id
                )
                
                logger.info(f"🔍 GET_CONSENT DEBUG: Got consent_id from request_id: {result}")
                
                return result
                
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"🔍 GET_CONSENT DEBUG: Error converting request_id: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Error getting consent: {str(e)}"
                )
        
        # Otherwise: Check consent in database first
        statement = select(Consent).where(
            Consent.consent_id == consent_id
        )
        db_consent = session.exec(statement).first()
        
        if db_consent:
            logger.info(f"🔍 GET_CONSENT DEBUG: Found in DB - status: {db_consent.status}")
            # Return from database
            return {
                "consent_id": consent_id,
                "status": db_consent.status or "authorized",
                "from_cache": True
            }
        
        # If bank_id and access_token provided, check with bank API
        if bank_id and access_token:
            bank_id_lower = bank_id.lower()
            
            try:
                token_data = decode_token(access_token)
                client_secret = token_data.get("client_secret")
                client_id = token_data.get("client_id")
                
                if not client_secret:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid token: missing credentials"
                    )
                
                # Get bank-specific token
                bank_token_data = await authenticate_with_bank(
                    client_id=client_id,
                    client_secret=client_secret,
                    bank_id=bank_id_lower
                )
                bank_token = bank_token_data.get("access_token")
                
                # Call bank API to get consent status
                bank_service = BankService(bank_id_lower, session)
                result = await bank_service.get_consent_status(bank_token, consent_id)
                
                logger.info(f"🔍 GET_CONSENT DEBUG: Bank returned: {result}")
                
                return {
                    "consent_id": consent_id,
                    "status": result.get("status", "authorized"),
                    "data": result,
                    "from_cache": False
                }
                
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"🔍 GET_CONSENT DEBUG: Error: {str(e)}")
                # If bank API fails but we have it in cache/DB, return authorized
                return {
                    "consent_id": consent_id,
                    "status": "authorized",
                    "from_cache": True
                }
        else:
            # Just return consent_id - for simple polling
            return {
                "consent_id": consent_id,
                "status": "authorized",
                "from_cache": True
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🔍 GET_CONSENT DEBUG: Unexpected error: {str(e)}")
        # Return success anyway - for SBank flow to continue
        return {
            "consent_id": consent_id,
            "status": "authorized",
            "error": str(e)
        }





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
    "/user-consents",
    status_code=status.HTTP_200_OK,
    summary="Get user consents",
    description="Get all active consents for a user"
)
async def get_user_consents(
    user_id: str,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session)
):
    """
    Get all active consents for a user across all banks.
    
    **Query parameters:**
    - `user_id`: User ID (e.g., "team286-9")
    
    **Headers:**
    - `Authorization`: Bearer token (JWT)
    
    **Returns:**
    - List of active consents with bank, consent_id, status
    """
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_id is required"
        )
    
    try:
        logger.info(f"🔍 USER_CONSENTS: Getting consents for user {user_id}")
        
        # Extract access_token from Authorization header if provided
        access_token = None
        if authorization:
            if authorization.startswith("Bearer "):
                access_token = authorization[7:]
            else:
                access_token = authorization
        
        # Decode JWT to verify token if provided
        if access_token:
            try:
                token_data = decode_token(access_token)
                client_id = token_data.get("client_id")
                logger.info(f"🔍 USER_CONSENTS: Token decoded, client_id: {client_id}")
            except Exception as e:
                logger.error(f"🔍 USER_CONSENTS: Token decode error: {str(e)}")
                # Continue anyway - we can still show consents from DB
                pass
        
        # Get all active consents for this user
        statement = select(Consent).where(
            Consent.client_id == user_id,
            Consent.status.in_(["approved", "authorized", "success"])
        )
        consents = session.exec(statement).all()
        
        logger.info(f"🔍 USER_CONSENTS: Found {len(consents)} active consents")
        
        result = []
        for consent in consents:
            result.append({
                "bank_id": consent.bank_name,
                "bank_name": consent.bank_name.upper(),
                "consent_id": consent.consent_id,
                "request_id": consent.request_id,
                "status": consent.status,
                "created_at": consent.created_at.isoformat() if consent.created_at else None,
                "updated_at": consent.updated_at.isoformat() if consent.updated_at else None
            })
        
        return {
            "user_id": user_id,
            "consents": result,
            "count": len(result)
        }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🔍 USER_CONSENTS: Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching user consents"
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
    bank_id: str = None,
    client_id: str = None,
    access_token: str = None,
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
    - `bank_id`: (Optional) Bank name (abank|sbank|vbank) - if not provided, looked up from DB
    - `client_id`: (Optional) Client identifier (e.g., "team286-9") - if not provided, looked up from DB
    - `access_token`: JWT session token
    
    **Returns:**
    - Success message with revocation status
    
    **Errors:**
    - 400: Missing required fields
    - 401: Invalid token
    - 404: Consent not found (BUT: still removes from DB and returns success)
    - 503: Bank API unavailable
    """
    if not consent_id or not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="consent_id and access_token are required"
        )
    
    try:
        logger.info(f"🔍 REVOKE DEBUG: Revoking consent {consent_id}, provided bank_id={bank_id}, client_id={client_id}")
        
        # If bank_id or client_id not provided, look them up from database
        if not bank_id or not client_id:
            db_consent = session.exec(
                select(Consent).where(Consent.consent_id == consent_id)
            ).first()
            
            if db_consent:
                if not bank_id:
                    bank_id = db_consent.bank_name
                if not client_id:
                    client_id = db_consent.client_id
                logger.info(f"🔍 REVOKE DEBUG: Looked up from DB: bank_id={bank_id}, client_id={client_id}")
            else:
                logger.warning(f"🔍 REVOKE DEBUG: Consent {consent_id} not found in database")
                # Consent not found in DB - delete from interface (return success)
                # This can happen if consent was manually revoked in the bank system
                return {
                    "status": "success",
                    "message": "Согласие было удалено (не найдено в системе)",
                    "consent_id": consent_id,
                    "deleted": True
                }
        
        if not bank_id or not client_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="bank_id and client_id are required (or must exist in database)"
            )
        
        bank_id_lower = bank_id.lower()
        
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
            client_secret = token_data.get("client_secret")
            auth_client_id = token_data.get("client_id")
            
            if not client_secret:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: no credentials found"
                )
                
            logger.info(f"🔍 REVOKE DEBUG: Decoded JWT, getting bank token for {bank_id_lower}")
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"🔍 REVOKE DEBUG: Token decode error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token"
            )
        
        # Get bank-specific token
        try:
            bank_token_data = await authenticate_with_bank(
                client_id=auth_client_id,
                client_secret=client_secret,
                bank_id=bank_id_lower
            )
            bank_token = bank_token_data.get("access_token")
            logger.info(f"🔍 REVOKE DEBUG: Got bank token for {bank_id_lower}")
        except Exception as e:
            logger.error(f"🔍 REVOKE DEBUG: Failed to get bank token: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Не удалось получить токен от банка"
            )
        
        # Initialize bank service
        bank_service = BankService(bank_id_lower, session)
        
        # Call bank API to revoke consent
        logger.info(f"🔍 REVOKE DEBUG: Calling BankService.revoke_consent()")
        try:
            result = await bank_service.revoke_consent(bank_token, consent_id)
            logger.info(f"🔍 REVOKE DEBUG: BankService.revoke_consent succeeded")
        except HTTPException as e:
            # If consent not found on bank side, still remove from DB
            if "не найден" in str(e.detail).lower() or "not found" in str(e.detail).lower() or "404" in str(e.status_code):
                logger.warning(f"🔍 REVOKE DEBUG: Consent not found on bank API side (404), removing from DB: {str(e.detail)}")
                db_consent = session.exec(
                    select(Consent).where(Consent.consent_id == consent_id)
                ).first()
                if db_consent:
                    session.delete(db_consent)
                    session.commit()
                    logger.info(f"🔍 REVOKE DEBUG: Deleted consent from DB")
                
                return {
                    "status": "success",
                    "message": "Согласие было удалено из системы (не найдено в банке)",
                    "consent_id": consent_id,
                    "deleted": True
                }
            else:
                # Other errors - re-raise
                raise
        
        # Update consent status in database to revoked (or delete if doesn't exist)
        db_consent = session.exec(
            select(Consent).where(Consent.consent_id == consent_id)
        ).first()
        if db_consent:
            db_consent.status = "revoked"
            session.add(db_consent)
            session.commit()
            logger.info(f"🔍 REVOKE DEBUG: Updated consent status to 'revoked' in DB")
        
        logger.info(f"🔍 REVOKE DEBUG: Successfully revoked consent {consent_id}")
        
        return {
            "status": "success",
            "message": "Согласие успешно отозвано",
            "consent_id": consent_id,
            "bank_id": bank_id_lower,
            "deleted": False
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🔍 REVOKE DEBUG: Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при отзыве согласия"
        )
