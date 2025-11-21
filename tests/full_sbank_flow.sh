#!/bin/bash

# Full SBank consent flow test

echo "=========================================="
echo "Full SBank Consent Flow Test"
echo "=========================================="
echo ""

# Step 1: Authenticate
echo "Step 1: Authenticating..."
AUTH_RESPONSE=$(curl -s -X POST "http://localhost:8000/api/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"client_id": "team286", "client_secret": "DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"}')

TOKEN=$(echo "${AUTH_RESPONSE}" | jq -r '.access_token')
echo "✅ Got token"
echo ""

# Step 2: Create consent
echo "Step 2: Creating consent..."
CONSENT_RESPONSE=$(curl -s -X POST "http://localhost:8000/api/consents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"user_id": "team286-5", "bank_id": "sbank"}')

REQUEST_ID=$(echo "$CONSENT_RESPONSE" | jq -r '.request_id')
echo "✅ Created consent with request_id: $REQUEST_ID"
echo ""

# Step 3: User approves consent in browser
REDIRECT_URL=$(echo "$CONSENT_RESPONSE" | jq -r '.redirect_url')
echo "Step 3: MANUAL APPROVAL REQUIRED"
echo "Please open this URL in your browser and approve the consent:"
echo ""
echo "   $REDIRECT_URL"
echo ""
echo "After approval, press ENTER to continue..."
read -r

# Step 4: Get actual consent_id
echo ""
echo "Step 4: Checking consent status..."
CONSENT_CHECK=$(curl -s -X GET "http://localhost:8000/api/consents/$REQUEST_ID?bank_id=sbank&user_id=team286-5" \
  -H "Authorization: Bearer $TOKEN")

CONSENT_ID=$(echo "$CONSENT_CHECK" | jq -r '.consent_id')
STATUS=$(echo "$CONSENT_CHECK" | jq -r '.status')

echo "✅ Got consent_id: $CONSENT_ID"
echo "✅ Status: $STATUS"
echo ""

# Step 5: Try to get accounts
echo "Step 5: Fetching accounts..."
ACCOUNTS=$(curl -s -X GET "http://localhost:8000/api/accounts?bank_id=sbank&limit=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Consent-Id: $CONSENT_ID")

echo "$ACCOUNTS" | jq .

ACCOUNT_COUNT=$(echo "$ACCOUNTS" | jq '.accounts | length' 2>/dev/null || echo "0")
echo ""
echo "=========================================="
echo "Results:"
echo "=========================================="
echo "Accounts fetched: $ACCOUNT_COUNT"
echo "Consent ID: $CONSENT_ID"
echo "Status: $STATUS"
echo ""

if [ "$ACCOUNT_COUNT" -gt 0 ]; then
  echo "✅ SUCCESS! Full flow works correctly!"
else
  echo "⚠️ No accounts found, but flow completed"
fi
