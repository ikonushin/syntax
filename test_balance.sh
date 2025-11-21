#!/bin/bash

# Test script for balance endpoint
# Usage: ./test_balance.sh <account_id> <consent_id> <bank_name> <user_id>

echo "🧪 Testing Balance Endpoint"
echo "================================"

# Configuration
API_URL="http://localhost:8000"
JWT_TOKEN="${JWT_TOKEN:-$(curl -s http://localhost:8000/health | grep -o 'Bearer [^"]*' | sed 's/Bearer //')}"

# Check if we have a token
if [ -z "$JWT_TOKEN" ]; then
    echo "❌ No JWT token found. Please set JWT_TOKEN environment variable"
    exit 1
fi

ACCOUNT_ID="${1:-acc-3959}"
CONSENT_ID="${2:-consent_test}"
BANK_NAME="${3:-abank}"
USER_ID="${4:-team286-9}"

echo "📋 Test Parameters:"
echo "   API URL: $API_URL"
echo "   Account ID: $ACCOUNT_ID"
echo "   Consent ID: $CONSENT_ID"
echo "   Bank Name: $BANK_NAME"
echo "   User ID: $USER_ID"
echo ""

# Test endpoint
echo "🔍 Calling: GET /v1/accounts/$ACCOUNT_ID/balances"
echo ""

curl -X GET \
  "$API_URL/v1/accounts/$ACCOUNT_ID/balances" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "consent_id: $CONSENT_ID" \
  -H "X-Bank-Name: $BANK_NAME" \
  -H "client_id: $USER_ID" \
  -v 2>&1 | head -50

echo ""
echo ""
echo "✅ Test completed"
