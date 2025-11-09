import asyncio
import httpx
import os
import json

async def test_consent():
    # Get token first
    async with httpx.AsyncClient() as client:
        # Get bank token
        token_resp = await client.post(
            "https://sbank.open.bankingapi.ru/auth/bank-token",
            params={
                "client_id": os.getenv("CLIENT_ID"),
                "client_secret": os.getenv("CLIENT_SECRET"),
            }
        )
        token_data = token_resp.json()
        token = token_data["access_token"]
        print(f"✅ Got token: {token[:20]}...")
        
        # Request consent
        consent_resp = await client.post(
            "https://sbank.open.bankingapi.ru/account-consents/request",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "client_id": "team286-2",
                "redirect_uri": "http://localhost:8000/auth/callback",
                "permissions": ["ReadAccountsBasic", "ReadTransactions"],
            }
        )
        consent_data = consent_resp.json()
        print(f"✅ Consent response: {json.dumps(consent_data, indent=2)}")

asyncio.run(test_consent())
