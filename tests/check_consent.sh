#!/bin/bash

# Check consent status after approval
REQUEST_ID="${1}"
USER_ID="${2:-team286-2}"
BANK_ID="sbank"

if [ -z "$REQUEST_ID" ]; then
  echo "Usage: bash check_consent.sh <request_id> [user_id]"
  echo "Example: bash check_consent.sh req-108c00383e51 team286-2"
  exit 1
fi

TOKEN=$(curl -s -X POST "http://localhost:8000/api/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"client_id": "team286", "client_secret": "DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"}' | jq -r '.access_token')

echo "Token: ${TOKEN:0:50}..."
echo "User ID: $USER_ID"
echo ""

echo "Checking consent status..."
RESPONSE=$(curl -s -X GET "http://localhost:8000/api/consents/$REQUEST_ID?bank_id=$BANK_ID&user_id=$USER_ID" \
  -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo "$RESPONSE" | jq .

CONSENT_ID=$(echo "$RESPONSE" | jq -r '.consent_id // empty')
STATUS=$(echo "$RESPONSE" | jq -r '.status // empty')

echo ""
if [ -n "$CONSENT_ID" ]; then
  echo "✅ Consent ID: $CONSENT_ID"
  echo "✅ Status: $STATUS"
  
  if [ "$STATUS" = "authorized" ] || [ "$STATUS" = "approved" ]; then
    echo ""
    echo "✅ SUCCESS! You can now use this consent_id to access accounts:"
    echo ""
    echo "   curl -X GET 'http://localhost:8000/api/accounts?bank_id=$BANK_ID' \\"
    echo "     -H 'Authorization: Bearer $TOKEN' \\"
    echo "     -H 'X-Consent-Id: $CONSENT_ID'"
  else
    echo ""
    echo "⚠️ Status is still: $STATUS"
  fi
else
  echo "❌ Failed to get consent"
fi
