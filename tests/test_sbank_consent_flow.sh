#!/bin/bash

# Test SBank Consent Flow
# This script tests the complete SBank consent flow:
# 1. Authenticate and get JWT token
# 2. Create consent (POST) - get request_id
# 3. User manually approves via URL
# 4. Get consent details (GET) - get consentId

set -e

API_URL="${1:-http://localhost:8000}"
CLIENT_ID="team286"
CLIENT_SECRET="DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"
USER_ID="team286-2"
BANK_ID="sbank"

echo "=========================================="
echo "SBank Consent Flow Test"
echo "=========================================="
echo "API URL: ${API_URL}"
echo ""

# Step 1: Authenticate
echo "Step 1: Authenticating..."
AUTH_RESPONSE=$(curl -s -X POST "${API_URL}/api/authenticate" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\": \"${CLIENT_ID}\", \"client_secret\": \"${CLIENT_SECRET}\"}")

echo "Auth response: ${AUTH_RESPONSE}"
echo ""

ACCESS_TOKEN=$(echo "${AUTH_RESPONSE}" | jq -r '.access_token' 2>/dev/null || echo "")

if [ -z "${ACCESS_TOKEN}" ] || [ "${ACCESS_TOKEN}" = "null" ]; then
  echo "❌ Failed to get access token"
  exit 1
fi

echo "✅ Got access token: ${ACCESS_TOKEN:0:50}..."
echo ""

# Step 2: Create consent
echo "Step 2: Creating consent..."
CONSENT_RESPONSE=$(curl -s -X POST "${API_URL}/api/consents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d "{\"user_id\": \"${USER_ID}\", \"bank_id\": \"${BANK_ID}\"}")

echo "Consent response:"
echo "${CONSENT_RESPONSE}" | jq . 2>/dev/null || echo "${CONSENT_RESPONSE}"
echo ""

REQUEST_ID=$(echo "${CONSENT_RESPONSE}" | jq -r '.request_id' 2>/dev/null || echo "")
CONSENT_ID=$(echo "${CONSENT_RESPONSE}" | jq -r '.consent_id' 2>/dev/null || echo "")
REDIRECT_URL=$(echo "${CONSENT_RESPONSE}" | jq -r '.redirect_url' 2>/dev/null || echo "")
STATUS=$(echo "${CONSENT_RESPONSE}" | jq -r '.status' 2>/dev/null || echo "")

if [ -z "${REQUEST_ID}" ] || [ "${REQUEST_ID}" = "null" ]; then
  echo "❌ Failed to get request_id"
  exit 1
fi

echo "✅ Got request_id: ${REQUEST_ID}"
echo "✅ Consent ID: ${CONSENT_ID}"
echo "✅ Status: ${STATUS}"
echo "✅ Redirect URL: ${REDIRECT_URL}"
echo ""

# Step 3: Show URL for manual approval
echo "=========================================="
echo "Step 3: MANUAL APPROVAL REQUIRED"
echo "=========================================="
echo ""
echo "Please open this URL in your browser and approve the consent:"
echo ""
echo "   ${REDIRECT_URL}"
echo ""
echo "After approval, press ENTER to continue..."
read -r

# Step 4: Get consent details
echo ""
echo "Step 4: Getting consent details after approval..."
CONSENT_DETAILS=$(curl -s -X GET "${API_URL}/api/consents/${REQUEST_ID}?bank_id=${BANK_ID}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

echo "Consent details:"
echo "${CONSENT_DETAILS}" | jq . 2>/dev/null || echo "${CONSENT_DETAILS}"
echo ""

FINAL_CONSENT_ID=$(echo "${CONSENT_DETAILS}" | jq -r '.consent_id' 2>/dev/null || echo "")
FINAL_STATUS=$(echo "${CONSENT_DETAILS}" | jq -r '.status' 2>/dev/null || echo "")

echo "=========================================="
echo "Results:"
echo "=========================================="
echo "Request ID: ${REQUEST_ID}"
echo "Consent ID: ${FINAL_CONSENT_ID}"
echo "Status: ${FINAL_STATUS}"
echo ""

if [ "${FINAL_STATUS}" = "authorized" ] || [ "${FINAL_STATUS}" = "approved" ]; then
  echo "✅ SUCCESS: Consent is approved!"
  echo ""
  echo "You can now use this consent_id to access accounts:"
  echo "  curl -X GET '${API_URL}/api/accounts?bank_id=${BANK_ID}' \\"
  echo "    -H 'Authorization: Bearer ${ACCESS_TOKEN}' \\"
  echo "    -H 'X-Consent-Id: ${FINAL_CONSENT_ID}'"
else
  echo "⚠️  WARNING: Consent status is '${FINAL_STATUS}'"
  echo "Expected 'authorized' or 'approved'"
fi

echo ""

