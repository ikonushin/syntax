#!/bin/bash

# Full authentication test script

echo "🧪 TESTING FULL AUTHENTICATION FLOW"
echo "===================================="
echo ""

# Configuration
CLIENT_ID="team286"
CLIENT_SECRET="DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"
BACKEND_URL="http://localhost:8000"
USER_ID="1"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check backend health
echo "${YELLOW}[1/4] Checking backend health...${NC}"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/health")
if [ "$HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ Backend is healthy${NC}"
else
    echo -e "${RED}❌ Backend is not responding (HTTP $HEALTH)${NC}"
    exit 1
fi
echo ""

# Step 2: Test authentication with valid credentials
echo "${YELLOW}[2/4] Testing authentication with valid credentials...${NC}"
AUTH_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/authenticate" \
    -H "Content-Type: application/json" \
    -d "{\"client_id\":\"${CLIENT_ID}\",\"client_secret\":\"${CLIENT_SECRET}\",\"user_id\":${USER_ID}}")

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BACKEND_URL}/api/authenticate" \
    -H "Content-Type: application/json" \
    -d "{\"client_id\":\"${CLIENT_ID}\",\"client_secret\":\"${CLIENT_SECRET}\",\"user_id\":${USER_ID}}")

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Authentication successful (HTTP 200)${NC}"
    JWT_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.access_token' 2>/dev/null)
    if [ ! -z "$JWT_TOKEN" ] && [ "$JWT_TOKEN" != "null" ]; then
        echo -e "${GREEN}✅ JWT token received${NC}"
        echo "   Token preview: ${JWT_TOKEN:0:50}..."
    else
        echo -e "${RED}❌ No JWT token in response${NC}"
    fi
else
    echo -e "${RED}❌ Authentication failed (HTTP $HTTP_CODE)${NC}"
    echo "   Response: $AUTH_RESPONSE"
fi
echo ""

# Step 3: Test authentication with invalid credentials
echo "${YELLOW}[3/4] Testing authentication with INVALID credentials...${NC}"
INVALID_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/authenticate" \
    -H "Content-Type: application/json" \
    -d "{\"client_id\":\"${CLIENT_ID}\",\"client_secret\":\"WRONG_SECRET\",\"user_id\":${USER_ID}}")

INVALID_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BACKEND_URL}/api/authenticate" \
    -H "Content-Type: application/json" \
    -d "{\"client_id\":\"${CLIENT_ID}\",\"client_secret\":\"WRONG_SECRET\",\"user_id\":${USER_ID}}")

if [ "$INVALID_HTTP" = "401" ]; then
    echo -e "${GREEN}✅ Authentication correctly rejected (HTTP 401)${NC}"
else
    echo -e "${RED}❌ Should return 401 for invalid credentials (got HTTP $INVALID_HTTP)${NC}"
fi
echo ""

# Step 4: Check CORS headers
echo "${YELLOW}[4/4] Checking CORS headers...${NC}"
CORS_RESPONSE=$(curl -s -X OPTIONS "${BACKEND_URL}/api/authenticate" \
    -H "Origin: http://localhost:5173" \
    -H "Access-Control-Request-Method: POST" \
    -v 2>&1 | grep -i "access-control")

if [ ! -z "$CORS_RESPONSE" ]; then
    echo -e "${GREEN}✅ CORS headers present${NC}"
    echo "$CORS_RESPONSE"
else
    echo -e "${YELLOW}⚠️  No CORS headers detected${NC}"
fi
echo ""

echo "===================================="
echo -e "${GREEN}✅ ALL TESTS COMPLETED${NC}"
