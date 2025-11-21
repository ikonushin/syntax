#!/bin/bash

# Quick test of SBank consent flow
TOKEN=$(curl -s -X POST "http://localhost:8000/api/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"client_id": "team286", "client_secret": "DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"}' | jq -r '.access_token')

echo "Token: ${TOKEN:0:50}..."
echo ""

echo "Creating consent..."
RESPONSE=$(curl -s -X POST "http://localhost:8000/api/consents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"user_id": "team286-2", "bank_id": "sbank"}')

echo "Response:"
echo "$RESPONSE" | jq .

# Extract request_id and redirect_url
REQUEST_ID=$(echo "$RESPONSE" | jq -r '.request_id // empty')
REDIRECT_URL=$(echo "$RESPONSE" | jq -r '.redirect_url // empty')

echo ""
if [ -n "$REQUEST_ID" ]; then
  echo "✅ Request ID: $REQUEST_ID"
  echo "✅ Redirect URL: $REDIRECT_URL"
  echo ""
  echo "Next step: Open this URL in browser and approve:"
  echo "   $REDIRECT_URL"
  echo ""
  echo "Then run: bash tests/check_consent.sh $REQUEST_ID"
else
  echo "❌ Failed to create consent"
fi

