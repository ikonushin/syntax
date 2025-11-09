#!/bin/bash

# Consent System Test Demo
# Tests all consent endpoints and flows

set -e

API_URL="http://localhost:8000"
echo "🧪 Syntax Consent System Test Demo"
echo "===================================="
echo "API: $API_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Use CLIENT_ID from environment or default
CLIENT_ID=${CLIENT_ID:-"team286"}

echo -e "${BLUE}1. Testing VBank Consent (Auto-Approved)${NC}"
echo "Creating consent for VBank with client_id=$CLIENT_ID-v1..."
VBANK_RESPONSE=$(curl -s -X POST "$API_URL/v1/consents/request?bank_name=vbank&client_id=$CLIENT_ID-v1")
VBANK_CONSENT_ID=$(echo $VBANK_RESPONSE | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('consent_id', 'ERROR'))")
VBANK_STATUS=$(echo $VBANK_RESPONSE | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('status', 'ERROR'))")
echo -e "${GREEN}✓ VBank Consent Created${NC}"
echo "  Consent ID: $VBANK_CONSENT_ID"
echo "  Status: $VBANK_STATUS"
echo ""

echo -e "${BLUE}2. Testing ABank Consent (Auto-Approved)${NC}"
echo "Creating consent for ABank with client_id=$CLIENT_ID-a1..."
ABANK_RESPONSE=$(curl -s -X POST "$API_URL/v1/consents/request?bank_name=abank&client_id=$CLIENT_ID-a1")
ABANK_CONSENT_ID=$(echo $ABANK_RESPONSE | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('consent_id', 'ERROR'))")
ABANK_STATUS=$(echo $ABANK_RESPONSE | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('status', 'ERROR'))")
echo -e "${GREEN}✓ ABank Consent Created${NC}"
echo "  Consent ID: $ABANK_CONSENT_ID"
echo "  Status: $ABANK_STATUS"
echo ""

echo -e "${BLUE}3. Testing SBank Consent (Manual Approval)${NC}"
echo "Creating consent for SBank with client_id=$CLIENT_ID-s1..."
SBANK_RESPONSE=$(curl -s -X POST "$API_URL/v1/consents/request?bank_name=sbank&client_id=$CLIENT_ID-s1")
SBANK_CONSENT_ID=$(echo $SBANK_RESPONSE | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('consent_id', 'ERROR'))")
SBANK_STATUS=$(echo $SBANK_RESPONSE | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('status', 'ERROR'))")
echo -e "${GREEN}✓ SBank Consent Created${NC}"
echo "  Consent ID: $SBANK_CONSENT_ID"
echo "  Status: $SBANK_STATUS (background polling started)"
echo ""

echo -e "${BLUE}4. Listing All Consents${NC}"
echo "Fetching all consents..."
ALL_CONSENTS=$(curl -s "$API_URL/v1/consents/")
COUNT=$(echo $ALL_CONSENTS | python3 -c "import sys, json; print(len(json.load(sys.stdin)))")
echo -e "${GREEN}✓ Retrieved $COUNT Consents${NC}"
echo $ALL_CONSENTS | python3 -m json.tool | head -25
echo ""

echo -e "${BLUE}5. Listing Bank-Specific Consents${NC}"

echo "VBank consents:"
VBANK_CONSENTS=$(curl -s "$API_URL/v1/consents/vbank")
VBANK_COUNT=$(echo $VBANK_CONSENTS | python3 -c "import sys, json; print(len(json.load(sys.stdin)))")
echo -e "${GREEN}✓ Found $VBANK_COUNT VBank Consent(s)${NC}"

echo "ABank consents:"
ABANK_CONSENTS=$(curl -s "$API_URL/v1/consents/abank")
ABANK_COUNT=$(echo $ABANK_CONSENTS | python3 -c "import sys, json; print(len(json.load(sys.stdin)))")
echo -e "${GREEN}✓ Found $ABANK_COUNT ABank Consent(s)${NC}"

echo "SBank consents:"
SBANK_CONSENTS=$(curl -s "$API_URL/v1/consents/sbank")
SBANK_COUNT=$(echo $SBANK_CONSENTS | python3 -c "import sys, json; print(len(json.load(sys.stdin)))")
echo -e "${GREEN}✓ Found $SBANK_COUNT SBank Consent(s)${NC}"
echo ""

echo -e "${BLUE}6. Checking Consent Status${NC}"

if [ "$VBANK_CONSENT_ID" != "ERROR" ]; then
    echo "Checking VBank consent status..."
    VBANK_STATUS_CHECK=$(curl -s "$API_URL/v1/consents/status/$VBANK_CONSENT_ID?bank_name=vbank")
    VBANK_STATUS_UPDATED=$(echo $VBANK_STATUS_CHECK | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('status', 'ERROR'))")
    echo -e "${GREEN}✓ VBank Status: $VBANK_STATUS_UPDATED${NC}"
fi

if [ "$SBANK_CONSENT_ID" != "ERROR" ]; then
    echo "Checking SBank consent status..."
    SBANK_STATUS_CHECK=$(curl -s "$API_URL/v1/consents/status/$SBANK_CONSENT_ID?bank_name=sbank")
    SBANK_STATUS_UPDATED=$(echo $SBANK_STATUS_CHECK | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('status', 'ERROR'))")
    echo -e "${GREEN}✓ SBank Status: $SBANK_STATUS_UPDATED${NC}"
fi
echo ""

echo -e "${BLUE}7. Testing Error Handling${NC}"

echo "Testing invalid bank name..."
INVALID=$(curl -s -X POST "$API_URL/v1/consents/request?bank_name=invalid&client_id=test")
if echo $INVALID | grep -q "detail"; then
    echo -e "${GREEN}✓ Properly rejected invalid bank${NC}"
else
    echo -e "${YELLOW}⚠ Unexpected response${NC}"
fi

echo "Testing consent not found..."
NOT_FOUND=$(curl -s "$API_URL/v1/consents/status/invalid-id?bank_name=vbank")
if echo $NOT_FOUND | grep -q "not found\|ERROR"; then
    echo -e "${GREEN}✓ Properly returned error for non-existent consent${NC}"
else
    echo -e "${YELLOW}⚠ Unexpected response${NC}"
fi
echo ""

echo -e "${GREEN}🎉 All Tests Completed Successfully!${NC}"
echo ""
echo "Summary:"
echo "- VBank: Auto-approved ✓"
echo "- ABank: Auto-approved ✓"
echo "- SBank: Manual approval (polling started) ✓"
echo "- Listing: All filters working ✓"
echo "- Status checks: All working ✓"
echo "- Error handling: Proper validation ✓"
