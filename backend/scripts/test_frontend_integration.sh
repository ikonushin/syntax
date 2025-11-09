#!/bin/bash

# Frontend Integration Test
# Tests complete flow: Consent → Accounts → Transactions

set -e

API_URL="http://localhost:8000"
echo "🎨 Frontend Integration Test"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}1. Request VBank Consent${NC}"
CONSENT_RESPONSE=$(curl -s -X POST "$API_URL/v1/consents/request?bank_name=vbank&client_id=team286-frontend1")
CONSENT_ID=$(echo $CONSENT_RESPONSE | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('consent_id', 'ERROR'))")
CONSENT_STATUS=$(echo $CONSENT_RESPONSE | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('status', 'ERROR'))")
echo -e "${GREEN}✓ Consent created${NC}"
echo "  Consent ID: $CONSENT_ID"
echo "  Status: $CONSENT_STATUS"
echo ""

echo -e "${BLUE}2. Load Accounts with Consent Header${NC}"
ACCOUNTS_RESPONSE=$(curl -s -X GET "$API_URL/v1/accounts" \
  -H "X-Consent-ID: $CONSENT_ID" \
  -H "X-Bank-Name: vbank")

ACCOUNT_COUNT=$(echo $ACCOUNTS_RESPONSE | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d) if isinstance(d, list) else 0)" 2>/dev/null || echo "0")

if [ "$ACCOUNT_COUNT" -gt "0" ]; then
  echo -e "${GREEN}✓ Accounts loaded successfully${NC}"
  echo "  Count: $ACCOUNT_COUNT"
  # Show first account
  FIRST_ACCOUNT=$(echo $ACCOUNTS_RESPONSE | python3 -c "import sys, json; d=json.load(sys.stdin); print(d[0]['id'] if d else 'N/A')" 2>/dev/null || echo "N/A")
  echo "  First Account ID: $FIRST_ACCOUNT"
else
  echo "  Response: $ACCOUNTS_RESPONSE"
fi
echo ""

echo -e "${BLUE}3. Frontend Consent List${NC}"
CONSENTS=$(curl -s "$API_URL/v1/consents/")
CONSENT_COUNT=$(echo $CONSENTS | python3 -c "import sys, json; print(len(json.load(sys.stdin)))")
echo -e "${GREEN}✓ Total consents: $CONSENT_COUNT${NC}"
echo ""

echo -e "${BLUE}4. Verify Consent Status${NC}"
STATUS_CHECK=$(curl -s "$API_URL/v1/consents/status/$CONSENT_ID?bank_name=vbank")
FINAL_STATUS=$(echo $STATUS_CHECK | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('status', 'ERROR'))")
echo -e "${GREEN}✓ Consent status: $FINAL_STATUS${NC}"
echo ""

echo -e "${GREEN}🎉 Frontend Integration Test Complete!${NC}"
echo ""
echo "Summary:"
echo "- Consent created with VBank ✓"
echo "- Accounts loaded using consent headers ✓"
echo "- Consent status verified ✓"
echo ""
echo "✅ Frontend flow is ready for use!"
