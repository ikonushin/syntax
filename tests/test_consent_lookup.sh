#!/bin/bash

# Quick test for SBank consent lookup endpoint
API_URL="${API_URL:-http://localhost:8000}"
CLIENT_ID="${CLIENT_ID:-dev-client}"
CLIENT_SECRET="${CLIENT_SECRET:-dev-secret}"

echo "🧪 Testing SBank Consent Lookup Endpoint"
echo "========================================"

# Step 1: Authenticate
echo "📋 Step 1: Authenticating..."
AUTH_RESPONSE=$(curl -s -X POST "$API_URL/api/authenticate" \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\": \"$CLIENT_ID\",
    \"client_secret\": \"$CLIENT_SECRET\"
  }")

ACCESS_TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"access_token":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Failed to get access token"
  echo "Response: $AUTH_RESPONSE"
  exit 1
fi

echo "✅ Got token: ${ACCESS_TOKEN:0:30}..."

# Step 2: Create SBank consent (get request_id)
echo ""
echo "📋 Step 2: Creating SBank consent..."
CONSENT_RESPONSE=$(curl -s -X POST "$API_URL/api/consents" \
  -H "Content-Type: application/json" \
  -d "{
    \"access_token\": \"$ACCESS_TOKEN\",
    \"user_id\": \"team286-1\",
    \"bank_id\": \"sbank\"
  }")

REQUEST_ID=$(echo "$CONSENT_RESPONSE" | grep -o '"request_id":"[^"]*"' | cut -d'"' -f4)
CONSENT_ID=$(echo "$CONSENT_RESPONSE" | grep -o '"consent_id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "✅ Got IDs:"
echo "   request_id: $REQUEST_ID"
echo "   consent_id: $CONSENT_ID"

if [ -z "$REQUEST_ID" ]; then
  echo "❌ Failed to get request_id from consent"
  echo "Response: $CONSENT_RESPONSE"
  exit 1
fi

# Step 3: Test lookup endpoint (simulating frontend call)
echo ""
echo "📋 Step 3: Testing lookup endpoint with Authorization header..."
echo "   GET /api/consents/$REQUEST_ID"
echo "   Header: Authorization: Bearer $ACCESS_TOKEN"
echo "   Param: bank_id=sbank"

LOOKUP_RESPONSE=$(curl -s -X GET "$API_URL/api/consents/$REQUEST_ID?bank_id=sbank" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")

echo ""
echo "Response:"
echo "$LOOKUP_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$LOOKUP_RESPONSE"

# Extract fields
RETURNED_CONSENT_ID=$(echo "$LOOKUP_RESPONSE" | grep -o '"consent_id":"[^"]*"' | head -1 | cut -d'"' -f4)
RETURNED_STATUS=$(echo "$LOOKUP_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

echo ""
if [ -z "$RETURNED_CONSENT_ID" ]; then
  echo "❌ Failed to get consent_id from lookup"
  exit 1
else
  echo "✅ Lookup successful!"
  echo "   Returned consent_id: $RETURNED_CONSENT_ID"
  echo "   Returned status: $RETURNED_STATUS"
fi

echo ""
echo "========================================"
echo "✅ All tests passed!"
