#!/bin/bash

# Demo script for testing the Multibanking API
# Usage: ./demo.sh
# Note: Run this after docker-compose up --build and services are healthy

# Colors for better output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting API demo...${NC}\n"

# Base URL for the API
API_URL="http://localhost:8000"

# Step 1: Get bank token
echo -e "${GREEN}1. Getting bank token...${NC}"
curl -X POST "https://sbank.open.bankingapi.ru/auth/bank-token" \
  -d "client_id=team286&client_secret=your_secret" \
  -H "Content-Type: application/x-www-form-urlencoded"

: '
Expected response:
{
    "access_token": "eyJhbGci...",
    "expires_in": 86400
}
'

echo -e "\n\n${GREEN}2. Getting accounts list...${NC}"
curl -X GET "${API_URL}/v1/accounts"

: '
Expected response:
[
    {
        "id": "acc_123",
        "name": "Main Account",
        "balance": "1500.00",
        "currency": "RUB"
    },
    {
        "id": "acc_456",
        "name": "Savings",
        "balance": "3000.00",
        "currency": "RUB"
    }
]
'

# Store first account ID for next requests
echo -e "\n\n${GREEN}3. Getting transactions for first account...${NC}"
ACCOUNT_ID="acc_123" # This would normally be extracted from previous response
curl -X GET "${API_URL}/v1/accounts/${ACCOUNT_ID}/transactions?min_amount=100"

: '
Expected response:
{
    "transactions": [
        {
            "id": "tx_789",
            "date": "2025-11-07T10:30:00Z",
            "amount": 150.75,
            "description": "Coffee Shop Payment",
            "status": "completed"
        }
    ],
    "from_cache": false
}
'

# Create a receipt for the first transaction
echo -e "\n\n${GREEN}4. Creating a receipt...${NC}"
curl -X POST "${API_URL}/v1/receipts" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "tx_789",
    "account_id": "acc_123",
    "date": "2025-11-07T10:30:00Z",
    "amount": 150.75,
    "service": "Coffee Shop",
    "client_name": "John Doe"
  }'

: '
Expected response:
{
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "transaction_id": "tx_789",
    "account_id": "acc_123",
    "date": "2025-11-07T10:30:00Z",
    "amount": "150.75",
    "service": "Coffee Shop",
    "client_name": "John Doe",
    "status": "draft",
    "created_at": "2025-11-07T10:35:00Z"
}
'

# Send the receipt
echo -e "\n\n${GREEN}5. Sending receipt to tax service (mock)...${NC}"
RECEIPT_ID="123e4567-e89b-12d3-a456-426614174000" # This would be from previous response
curl -X POST "${API_URL}/v1/receipts/${RECEIPT_ID}/send"

: '
Expected response:
{
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "status": "sent",
    "external_id": "REC123ABC",
    "sent_at": "2025-11-07T10:36:00Z"
}
'

echo -e "\n\n${BLUE}Demo completed!${NC}"

# Usage instructions in comments:
: '
How to use this demo script:

1. Start the services:
   docker-compose up --build

2. Wait for services to be healthy (check http://localhost:8000/health)

3. Make the script executable and run it:
   chmod +x demo.sh
   ./demo.sh

4. Check the responses against the expected samples in comments

Note: This script uses placeholder values for IDs. In a real scenario,
you would parse the JSON responses to extract IDs for subsequent requests.
'