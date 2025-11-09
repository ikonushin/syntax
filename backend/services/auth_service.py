"""
Authentication and token management service for dynamic team/user authentication.

This service handles:
1. Team authentication (client_id + client_secret)
2. Token caching with expiry management
3. Token validation and refresh
"""

import logging
import time
import asyncio
from typing import Optional, Dict, Tuple
from datetime import datetime, timedelta
import os

import httpx
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

# Base URL for external banking API
BASE_URL = os.getenv("BASE_URL", "https://sbank.open.bankingapi.ru")

# In-memory token cache: {team_id: {"token": str, "expires_at": float}}
_token_cache: Dict[str, Dict] = {}
_token_locks: Dict[str, asyncio.Lock] = {}


def _get_lock(team_id: str) -> asyncio.Lock:
    """Get or create an asyncio lock for a team."""
    if team_id not in _token_locks:
        _token_locks[team_id] = asyncio.Lock()
    return _token_locks[team_id]


async def authenticate_team(client_id: str, client_secret: str) -> Tuple[str, int]:
    """
    Authenticate a team and obtain an access token.

    Args:
        client_id: Team client ID (e.g., "team286")
        client_secret: Team API secret key

    Returns:
        Tuple[str, int]: (access_token, expires_in_seconds)

    Raises:
        HTTPException: 401 if credentials invalid, 500 if API unavailable
    """
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_id and client_secret are required"
        )

    # Check if we have a valid cached token for this team
    current_time = time.time()
    if client_id in _token_cache:
        cached = _token_cache[client_id]
        if current_time < cached["expires_at"]:
            logger.info(f"Using cached token for team {client_id}")
            remaining = cached["expires_at"] - current_time
            return cached["token"], int(remaining)

    # Acquire lock to prevent concurrent authentication attempts
    lock = _get_lock(client_id)
    async with lock:
        # Double-check pattern: verify again after acquiring lock
        if client_id in _token_cache:
            cached = _token_cache[client_id]
            if current_time < cached["expires_at"]:
                logger.info(f"Using cached token for team {client_id} (post-lock)")
                remaining = cached["expires_at"] - current_time
                return cached["token"], int(remaining)

        # Call external API to authenticate
        try:
            logger.info(f"Authenticating team {client_id}")
            async with httpx.AsyncClient(timeout=10) as client:
                url = f"{BASE_URL}/auth/bank-token"
                logger.info(f"Calling {url} with client_id={client_id}")
                
                response = await client.post(
                    url,
                    params={
                        "client_id": client_id,
                        "client_secret": client_secret
                    }
                )
                
                logger.info(f"Response status: {response.status_code}")
                logger.info(f"Response body: {response.text[:200]}")

                # Handle authentication errors
                if response.status_code == 401:
                    logger.warning(f"Invalid credentials for team {client_id}: {response.text}")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Неверные данные авторизации"
                    )
                elif response.status_code == 400:
                    logger.warning(f"Bad request for team {client_id}: {response.text}")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Неверные параметры запроса"
                    )
                elif response.status_code >= 500:
                    logger.error(f"External API error: {response.status_code} - {response.text}")
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Ошибка соединения с сервером авторизации"
                    )

                response.raise_for_status()
                data = response.json()
                logger.info(f"Authentication response keys: {list(data.keys())}")

                # Check if response contains error details (some APIs return 200 with error in body)
                if "detail" in data and data.get("access_token") is None:
                    logger.warning(f"API returned error in body: {data.get('detail')}")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Неверные данные авторизации"
                    )

                # Extract token and expiry
                access_token = data.get("access_token")
                expires_in = data.get("expires_in", 3600)

                if not access_token:
                    logger.error(f"No access_token in response: {data}")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Неверные данные авторизации"
                    )

                # Cache the token with 5-minute safety margin
                expires_at = current_time + expires_in - 300
                _token_cache[client_id] = {
                    "token": access_token,
                    "expires_at": expires_at
                }

                logger.info(f"Successfully authenticated team {client_id}, token expires in {expires_in}s")
                return access_token, expires_in

        except httpx.TimeoutException:
            logger.error(f"Timeout authenticating team {client_id}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ошибка соединения: истекло время ожидания"
            )
        except httpx.RequestError as e:
            logger.error(f"Request error authenticating team {client_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ошибка соединения с сервером"
            )
        except KeyError as e:
            logger.error(f"Invalid response format from API: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Неверный формат ответа от сервера"
            )


async def authenticate_with_bank(client_id: str, client_secret: str) -> dict:
    """Authenticate with bank API and return token."""
    logger = logging.getLogger(__name__)
    
    logger.info(f"🔍 SERVICE DEBUG: authenticate_with_bank called")
    logger.info(f"🔍 SERVICE DEBUG: client_id = '{client_id}'")
    logger.info(f"🔍 SERVICE DEBUG: client_secret length = {len(client_secret)}")
    logger.info(f"🔍 SERVICE DEBUG: BASE_URL = {BASE_URL}")
    
    try:
        async with httpx.AsyncClient() as client:
            url = f"{BASE_URL}/auth/bank-token"
            params = {
                "client_id": client_id,
                "client_secret": client_secret
            }
            
            logger.info(f"🔍 SERVICE DEBUG: Making POST to {url}")
            logger.info(f"🔍 SERVICE DEBUG: Query params: client_id={client_id}, client_secret={'*' * 10}...")
            
            response = await client.post(url, params=params)
            
            logger.info(f"🔍 SERVICE DEBUG: Bank API response status: {response.status_code}")
            logger.info(f"🔍 SERVICE DEBUG: Bank API response body: {response.text[:300]}")
            
            # Проверяем ошибки
            if response.status_code == 401:
                logger.warning(f"🔍 SERVICE DEBUG: Got 401 from bank API")
                data = response.json()
                logger.warning(f"🔍 SERVICE DEBUG: Error detail: {data.get('detail', 'unknown')}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Неверные данные авторизации"
                )
            
            if response.status_code == 400:
                logger.warning(f"🔍 SERVICE DEBUG: Got 400 from bank API")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Неверные параметры запроса"
                )
            
            response.raise_for_status()
            data = response.json()
            
            logger.info(f"🔍 SERVICE DEBUG: Successfully got response from bank API")
            logger.info(f"🔍 SERVICE DEBUG: Response keys: {list(data.keys())}")
            logger.info(f"🔍 SERVICE DEBUG: access_token in response: {'access_token' in data}")
            
            if not data.get("access_token"):
                logger.error(f"🔍 SERVICE DEBUG: No access_token in response!")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Ошибка при получении токена"
                )
            
            logger.info(f"🔍 SERVICE DEBUG: Returning token data successfully")
            return data
            
    except httpx.HTTPStatusError as e:
        logger.error(f"🔍 SERVICE DEBUG: HTTP error from bank: {e.response.status_code}")
        logger.error(f"🔍 SERVICE DEBUG: Error body: {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        logger.error(f"🔍 SERVICE DEBUG: Unexpected error: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка: {str(e)}")


async def validate_token(access_token: str) -> bool:
    """
    Validate a token by attempting a simple API call.

    Args:
        access_token: Token to validate

    Returns:
        bool: True if valid, False if invalid

    This is a lightweight check - doesn't guarantee full validity,
    just confirms basic connectivity.
    """
    if not access_token:
        return False

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                f"{BASE_URL}/accounts",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            return response.status_code != 401
    except Exception as e:
        logger.warning(f"Token validation failed: {str(e)}")
        return False


def get_cached_token(team_id: str) -> Optional[str]:
    """
    Get a cached token for a team if it exists and is valid.

    Args:
        team_id: Team ID

    Returns:
        Optional[str]: Token if valid, None if expired or not found
    """
    if team_id not in _token_cache:
        return None

    cached = _token_cache[team_id]
    if time.time() < cached["expires_at"]:
        return cached["token"]

    # Token expired, remove it
    del _token_cache[team_id]
    return None


def clear_token_cache(team_id: Optional[str] = None):
    """
    Clear token cache for a team or all teams.

    Args:
        team_id: If provided, clear only this team's cache. Otherwise clear all.
    """
    if team_id:
        _token_cache.pop(team_id, None)
        logger.info(f"Cleared token cache for team {team_id}")
    else:
        _token_cache.clear()
        logger.info("Cleared all token caches")


async def make_authenticated_request(
    method: str,
    endpoint: str,
    access_token: str,
    params: Optional[Dict] = None,
    json_data: Optional[Dict] = None,
    bank_id: Optional[str] = None,
    requesting_bank: Optional[str] = None,
    consent_id: Optional[str] = None
) -> Dict:
    """
    Make an authenticated request to the external API with proper OpenBanking headers.

    Args:
        method: HTTP method (GET, POST, etc.)
        endpoint: API endpoint path (e.g., "/accounts")
        access_token: Bearer token for authentication
        params: Query parameters
        json_data: JSON body data
        bank_id: Bank identifier for X-Requesting-Bank header (e.g., "team286")
        requesting_bank: Requesting bank name (e.g., "team286") for header
        consent_id: Consent ID for X-Consent-Id header (if consent-based request)

    Returns:
        Dict: JSON response from API

    Raises:
        HTTPException: On API errors
    
    Headers added per OpenBanking API spec:
    - Authorization: Bearer {access_token}
    - X-Requesting-Bank: {requesting_bank} (if provided)
    - X-Consent-Id: {consent_id} (if provided for account/transaction requests)
    """
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authentication token provided"
        )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url = f"{BASE_URL}{endpoint}"
            
            # Build headers per OpenBanking API specification
            headers = {"Authorization": f"Bearer {access_token}"}
            
            # Add X-Requesting-Bank header if provided (recommended for consent/account requests)
            if requesting_bank:
                headers["X-Requesting-Bank"] = requesting_bank
                logger.debug(f"Added X-Requesting-Bank: {requesting_bank}")
            
            # Add X-Consent-Id header if provided (required for account/transaction requests)
            if consent_id:
                headers["X-Consent-Id"] = consent_id
                logger.debug(f"Added X-Consent-Id: {consent_id}")
            
            logger.info(f"🔍 REQUEST DEBUG: {method} {endpoint}")
            logger.info(f"🔍 REQUEST DEBUG: Headers: {', '.join(headers.keys())}")

            response = await client.request(
                method,
                url,
                params=params,
                json=json_data,
                headers=headers
            )

            logger.info(f"🔍 RESPONSE DEBUG: Status {response.status_code}")

            # Handle authentication errors
            if response.status_code == 401:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Токен авторизации истёк или неверный"
                )

            # Handle not found errors
            if response.status_code == 404:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Ресурс не найден"
                )

            # Handle other errors
            response.raise_for_status()

            return response.json()

    except httpx.HTTPStatusError as e:
        logger.error(f"API error: {e.response.status_code} {e.response.text}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"API error: {e.response.status_code}"
        )
    except httpx.TimeoutException:
        logger.error("API request timeout")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ошибка соединения: истекло время ожидания"
        )
    except httpx.RequestError as e:
        logger.error(f"Request error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ошибка соединения"
        )
