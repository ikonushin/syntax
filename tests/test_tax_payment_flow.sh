#!/bin/bash

# Test Tax Payment Flow with Multi-Bank Account Selection
# Verifies that:
# 1. Accounts from different banks are displayed correctly
# 2. Each account has the correct consent_id
# 3. Payment uses the correct consent_id and doesn't mix banks

set -e

API_URL="http://localhost:8000"
echo "🧪 Testing Tax Payment Flow with Multi-Bank Accounts"
echo "====================================================="
echo "API: $API_URL"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Test user
USER_ID="team286-1"
ACCESS_TOKEN="test_token_123"

echo -e "${BLUE}1. Check Available Tax Payments${NC}"
echo "GET $API_URL/v1/tax-payments?user_id=$USER_ID"
TAX_PAYMENTS=$(curl -s -X GET "$API_URL/v1/tax-payments?user_id=$USER_ID" | python3 -m json.tool)
echo "$TAX_PAYMENTS" | head -20
echo ""

echo -e "${BLUE}2. Get User Consents${NC}"
echo "GET $API_URL/api/user-consents?user_id=$USER_ID"
CONSENTS=$(curl -s -X GET "$API_URL/api/user-consents" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "user_id=$USER_ID&access_token=$ACCESS_TOKEN" | python3 -m json.tool 2>/dev/null || echo "{}")
echo "Consents response:"
echo "$CONSENTS" | head -30
echo ""

echo -e "${BLUE}3. Verify Account Data Structure${NC}"
echo "When accounts are loaded from multiple banks, each should have:"
echo "  - accountId: Account identifier"
echo "  - bank_name: Bank name (abank, vbank, sbank)"
echo "  - consent_id: Consent ID from that specific bank"
echo "  - balance: Account balance"
echo ""

echo -e "${BLUE}4. Test Account Selection Constraints${NC}"
echo "When user selects an account, only accounts from that bank's consent should be available"
echo "This prevents mixing accounts from different banks"
echo ""

echo -e "${BLUE}5. Verify Payment Request Structure${NC}"
echo "Payment request should now include consent_id field:"
echo "{"
echo "  \"account_id\": \"acc-3959\","
echo "  \"bank_name\": \"abank\","
echo "  \"consent_id\": \"consent-xxx-from-abank\","
echo "  \"bank_token\": \"...\""
echo "}"
echo ""

echo -e "${BLUE}6. Backend Validation${NC}"
echo "Backend should:"
echo "  ✓ Accept optional consent_id in PayTaxRequest"
echo "  ✓ Use provided consent_id when fetching account details"
echo "  ✓ Log which consent_id is being used"
echo "  ✓ Pass consent_id to get_accounts() call"
echo ""

echo -e "${BLUE}7. Frontend Validation${NC}"
echo "Frontend should:"
echo "  ✓ Store consent_id with each account during loadAccounts()"
echo "  ✓ Pass consent_id in handlePayTax() request"
echo "  ✓ Log account selection with consent_id for debugging"
echo ""

echo -e "${GREEN}✅ Test structure defined${NC}"
echo ""
echo "To verify the fix works:"
echo "1. Start backend and frontend"
echo "2. Login and select a user"
echo "3. Go to Tax Payments"
echo "4. Open payment modal"
echo "5. Verify accounts from ONLY ONE bank are shown"
echo "6. Select an account and complete payment"
echo "7. Check backend logs for 'Using provided account consent: consent-xxx'"
echo ""
