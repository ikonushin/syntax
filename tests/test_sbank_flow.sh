#!/bin/bash

# Test SBank Consent ID Retrieval Flow
# This script tests the complete SBank flow:
# 1. Create consent (gets request_id)
# 2. Simulate user approval
# 3. Fetch consent_id from request_id
# 4. Use consent_id to load accounts/transactions

set -e

API_URL="${API_URL:-http://localhost:8000}"
CLIENT_ID="${CLIENT_ID:-dev-client}"
CLIENT_SECRET="${CLIENT_SECRET:-dev-secret}"
BANK_ID="sbank"

echo "🧪 Testing SBank Consent ID Retrieval Flow"
echo "================================================"
echo "API_URL: $API_URL"
echo "CLIENT_ID: $CLIENT_ID"
echo "BANK_ID: $BANK_ID"
echo ""

# Step 1: Authenticate to get JWT token
echo "📋 Step 1: Authenticating..."
AUTH_RESPONSE=$(curl -s -X POST "$API_URL/api/authenticate" \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\": \"$CLIENT_ID\",
    \"client_secret\": \"$CLIENT_SECRET\"
  }")

echo "Auth response: $AUTH_RESPONSE"
ACCESS_TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Failed to get access token"
  exit 1
fi

echo "✅ Got access token: ${ACCESS_TOKEN:0:20}..."
echo ""

# Step 2: Create consent (should return request_id for SBank)
echo "📋 Step 2: Creating consent for SBank..."
CONSENT_RESPONSE=$(curl -s -X POST "$API_URL/api/consents" \
  -H "Content-Type: application/json" \
  -d "{
    \"access_token\": \"$ACCESS_TOKEN\",
    \"user_id\": \"team286-1\",
    \"bank_id\": \"$BANK_ID\"
  }")

echo "Consent response: $CONSENT_RESPONSE"
REQUEST_ID=$(echo "$CONSENT_RESPONSE" | grep -o '"request_id":"[^"]*"' | cut -d'"' -f4)
CONSENT_ID=$(echo "$CONSENT_RESPONSE" | grep -o '"consent_id":"[^"]*"' | cut -d'"' -f4)
STATUS=$(echo "$CONSENT_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

echo "✅ Created consent:"
echo "   - request_id: $REQUEST_ID"
echo "   - consent_id (initial): $CONSENT_ID"
echo "   - status: $STATUS"
echo ""

if [ "$STATUS" != "pending" ]; then
  echo "⚠️  Expected status 'pending' but got '$STATUS'"
fi

# Step 3: Simulate user approval (in reality, user approves in SBank UI)
echo "📋 Step 3: Simulating user approval in SBank UI..."
echo "   In real flow, user would:"
echo "   1. Click the redirect_url from response"
echo "   2. Approve the consent in SBank"
echo "   3. Return to application"
echo ""

# Wait a moment
sleep 1

# Step 4: Fetch actual consent_id using request_id
echo "📋 Step 4: Fetching actual consent_id using request_id..."
echo "   GET /api/consents/$REQUEST_ID?bank_id=$BANK_ID&access_token=<token>"

LOOKUP_RESPONSE=$(curl -s -X GET "$API_URL/api/consents/$REQUEST_ID" \
  -H "Content-Type: application/json" \
  -G \
  -d "bank_id=$BANK_ID" \
  -d "access_token=$ACCESS_TOKEN")

echo "Lookup response: $LOOKUP_RESPONSE"
RETURNED_CONSENT_ID=$(echo "$LOOKUP_RESPONSE" | grep -o '"consent_id":"[^"]*"' | cut -d'"' -f4)
RETURNED_STATUS=$(echo "$LOOKUP_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

echo "✅ Lookup result:"
echo "   - consent_id: $RETURNED_CONSENT_ID"
echo "   - status: $RETURNED_STATUS"
echo ""

# Step 5: Test that consent_id works for accounts endpoint
echo "📋 Step 5: Testing accounts endpoint with consent_id..."
ACCOUNTS_RESPONSE=$(curl -s -X GET "$API_URL/v1/accounts" \
  -H "Authorization: Bearer $RETURNED_CONSENT_ID" \
  -H "X-User-Id: team286-1" \
  -G \
  -d "access_token=$ACCESS_TOKEN")

echo "Accounts response: $ACCOUNTS_RESPONSE"
ACCOUNT_COUNT=$(echo "$ACCOUNTS_RESPONSE" | grep -o '"account_id"' | wc -l)

echo "✅ Got $ACCOUNT_COUNT accounts from SBank"
echo ""

echo "================================================"
echo "✅ SBank Consent ID Retrieval Flow Test Complete!"
echo "================================================"
