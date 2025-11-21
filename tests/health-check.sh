#!/bin/bash
# filepath: ./health-check.sh
# Health check script for Syntax multi-banking MVP
# Checks database, backend, and frontend services

set -e

RESET='\033[0m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'

echo -e "${BLUE}=== Syntax Health Check ===${RESET}"
echo ""

# Track failures
FAILURES=0

# DB Check
echo -e "${BLUE}1. Database (PostgreSQL)...${RESET}"
if docker-compose exec -T db psql -U postgres -d multibanking -c "SELECT 1;" &>/dev/null; then
  echo -e "${GREEN}✓ PostgreSQL OK${RESET}"
  # Additional DB checks
  if docker-compose exec -T db psql -U postgres -d multibanking -c "\dt" | grep -q receipt; then
    echo -e "${GREEN}  ✓ Receipt table exists${RESET}"
  else
    echo -e "${YELLOW}  ⚠ Receipt table not found${RESET}"
  fi
else
  echo -e "${RED}✗ PostgreSQL FAILED${RESET}"
  ((FAILURES++))
fi

echo ""

# Backend Check
echo -e "${BLUE}2. Backend (FastAPI)...${RESET}"

# Health endpoint
BACKEND_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:8000/health)
BACKEND_STATUS=$(echo "$BACKEND_RESPONSE" | tail -1)
BACKEND_BODY=$(echo "$BACKEND_RESPONSE" | head -1)

if [ "$BACKEND_STATUS" -eq 200 ] && echo "$BACKEND_BODY" | grep -q "ok"; then
  echo -e "${GREEN}✓ Backend API OK${RESET}"
else
  echo -e "${RED}✗ Backend API FAILED (HTTP $BACKEND_STATUS)${RESET}"
  ((FAILURES++))
fi

# Accounts endpoint
ACCOUNTS_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:8000/v1/accounts 2>&1)
ACCOUNTS_STATUS=$(echo "$ACCOUNTS_RESPONSE" | tail -1)

if [ "$ACCOUNTS_STATUS" -eq 200 ]; then
  echo -e "${GREEN}✓ Accounts endpoint accessible${RESET}"
elif [ "$ACCOUNTS_STATUS" -eq 401 ] || [ "$ACCOUNTS_STATUS" -eq 503 ]; then
  echo -e "${YELLOW}⚠ Accounts endpoint returned HTTP $ACCOUNTS_STATUS (expected without bank credentials)${RESET}"
else
  echo -e "${RED}✗ Accounts endpoint FAILED (HTTP $ACCOUNTS_STATUS)${RESET}"
  ((FAILURES++))
fi

# API Documentation
if curl -s http://localhost:8000/docs > /dev/null 2>&1; then
  echo -e "${GREEN}✓ API docs available at http://localhost:8000/docs${RESET}"
fi

echo ""

# Frontend Check
echo -e "${BLUE}3. Frontend (React + Vite)...${RESET}"

FRONTEND_RESPONSE=$(docker-compose exec -T frontend curl -s -w "\n%{http_code}" http://localhost:5173 2>&1)
FRONTEND_STATUS=$(echo "$FRONTEND_RESPONSE" | tail -1)

if [ "$FRONTEND_STATUS" -eq 200 ]; then
  echo -e "${GREEN}✓ Frontend OK${RESET}"
else
  echo -e "${RED}✗ Frontend FAILED (HTTP $FRONTEND_STATUS)${RESET}"
  ((FAILURES++))
fi

echo ""
echo -e "${BLUE}=== Docker Compose Status ===${RESET}"
docker-compose ps

echo ""

if [ $FAILURES -eq 0 ]; then
  echo -e "${GREEN}=== All Services Healthy ✓ ===${RESET}"
  exit 0
else
  echo -e "${RED}=== $FAILURES Service(s) Failed ✗ ===${RESET}"
  echo ""
  echo -e "${YELLOW}Troubleshooting tips:${RESET}"
  echo "  1. Check Docker containers: docker-compose logs"
  echo "  2. Backend logs: docker-compose logs backend"
  echo "  3. Frontend logs: docker-compose logs frontend"
  echo "  4. Database logs: docker-compose logs db"
  exit 1
fi