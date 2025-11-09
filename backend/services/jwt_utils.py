"""
JWT utility functions for token encoding and decoding.

Wraps bank access tokens with additional metadata and expiry.
"""

import jwt
import os
from datetime import datetime, timedelta
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

JWT_SECRET = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_MINUTES = 30  # Short-lived session tokens


def encode_token(
    access_token: str,
    client_id: str,
    expires_in: int,
    bank_token_expires_in: Optional[int] = None
) -> str:
    """
    Encode a JWT token wrapping the bank access token.

    Args:
        access_token: Bank's access token from /auth/bank-token
        client_id: Team/client ID
        expires_in: Original bank token expiry in seconds
        bank_token_expires_in: Optional bank token expiry override

    Returns:
        str: Encoded JWT token

    Payload structure:
    {
        "access_token": "bank_token_here",
        "client_id": "team286",
        "token_type": "bearer",
        "expires_in": 3600,
        "iat": timestamp,
        "exp": timestamp (30 min from now)
    }
    """
    now = datetime.utcnow()
    payload = {
        "access_token": access_token,
        "client_id": client_id,
        "token_type": "bearer",
        "expires_in": bank_token_expires_in or expires_in,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=JWT_EXPIRY_MINUTES)).timestamp())
    }

    try:
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        logger.info(f"Encoded JWT token for client {client_id}")
        return token
    except Exception as e:
        logger.error(f"Failed to encode JWT: {str(e)}")
        raise


def decode_token(token: str) -> Optional[Dict]:
    """
    Decode and validate a JWT token.

    Args:
        token: JWT token to decode

    Returns:
        Dict: Decoded payload if valid, None if invalid/expired

    Raises:
        jwt.ExpiredSignatureError: Token has expired
        jwt.InvalidTokenError: Token is invalid
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        logger.info(f"Successfully decoded JWT token for client {payload.get('client_id')}")
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("JWT token has expired")
        raise
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {str(e)}")
        raise


def extract_access_token(jwt_token: str) -> Optional[str]:
    """
    Extract the bank access token from a JWT.

    Args:
        jwt_token: JWT token

    Returns:
        str: Bank access token if valid, None if invalid

    Used by protected routes to get the underlying bank token.
    """
    try:
        payload = decode_token(jwt_token)
        return payload.get("access_token")
    except Exception:
        return None


def is_token_valid(token: str) -> bool:
    """
    Quick check if a token is valid (not expired).

    Args:
        token: JWT token to check

    Returns:
        bool: True if valid and not expired, False otherwise
    """
    try:
        decode_token(token)
        return True
    except jwt.ExpiredSignatureError:
        return False
    except jwt.InvalidTokenError:
        return False
