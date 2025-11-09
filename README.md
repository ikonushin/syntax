ао# Умное мультибанковское приложение для самозанятых (MVP)

## Описание проекта

Прототип умного мультибанковского приложения для самозанятых, который автоматически собирает данные о поступлениях с банковских карт, позволяет фильтровать транзакции, создавать чеки и отправлять их в «Мой налог». Также предоставляет базовую аналитику и возможность экспорта данных.

## Стек технологий

* **Backend:** Python + FastAPI
* **Frontend:** React + Vite + TailwindCSS
* **Database:** PostgreSQL
* **Auth:** JWT (для MVP)
* **Контейнеризация:** Docker + docker-compose

## Environment Variables (.env)

Create a `.env` file in the root directory with the following variables:

```env
# Bank API Credentials
CLIENT_ID=team286
CLIENT_SECRET=<your_secret>
BASE_URL=https://sbank.open.bankingapi.ru

# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@db:5432/multibanking

# Cache Settings
TX_CACHE_TTL_MINUTES=15

# Optional Settings
JWT_SECRET=supersecretkey  # For future auth implementation
```

## Quick Start

1. Clone the repository and setup environment:
```bash
git clone <repository URL>
cd <repository directory>
cp .env.example .env  # Then edit with your credentials
```

2. Start the services:
```bash
docker-compose up --build
```

3. Access the applications:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## API Examples

### OpenBanking Consent Flow

1. **Request VBank consent (auto-approved):**
```bash
curl -X POST "http://localhost:8000/v1/consents/request?bank_name=vbank&client_id=team286-1"
# Response: { "status": "authorized", "consent_id": "...", ... }
```

2. **Request SBank consent (manual approval):**
```bash
curl -X POST "http://localhost:8000/v1/consents/request?bank_name=sbank&client_id=team286-1"
# Response: { "status": "awaitingAuthorization", "consent_id": "...", ... }
# Note: Background polling will check for approval periodically
```

3. **List all consents:**
```bash
curl "http://localhost:8000/v1/consents/"
```

4. **List VBank consents:**
```bash
curl "http://localhost:8000/v1/consents/vbank"
```

5. **Check consent status:**
```bash
curl "http://localhost:8000/v1/consents/status/{consent_id}?bank_name=vbank"
```

### Testing

Run comprehensive Consent system tests:
```bash
bash backend/scripts/test_consents_demo.sh
```

### Authentication

Get a bank API token:
```bash
curl -X POST "https://sbank.open.bankingapi.ru/auth/bank-token" \
  -d "client_id=team286&client_secret=your_secret"
```

### Account Operations

List accounts:
```bash
curl -X GET "http://localhost:8000/v1/accounts"
```

Get transactions for an account:
```bash
curl -X GET "http://localhost:8000/v1/accounts/123456/transactions?date_from=2025-01-01&min_amount=100"
```

## Project Structure

```
/backend      - FastAPI application
  /routes     - API endpoints
  /models     - SQLModel database models
  /services   - Business logic and external services
/frontend     - React + Vite + Tailwind application
/docker-compose.yml
/.env.example
```

## Backend API (MVP)

* `GET /health` — Health check endpoint
* `GET /health/detailed` — Detailed health check with database status

### Consent Management (OpenBanking)
* `POST /v1/consents/request?bank_name={vbank|abank|sbank}&client_id={id}` — Request bank consent
  - VBank, ABank: Immediately approved
  - SBank: Manual approval required with background polling
* `GET /v1/consents/` — List all consents
* `GET /v1/consents/{bank_name}` — List consents for specific bank
* `GET /v1/consents/status/{consent_id}?bank_name={bank}` — Check consent status

### Account Operations (requires valid consent)
* `GET /v1/accounts` — List all accounts
* `GET /v1/accounts/{id}/transactions` — Get account transactions

### Receipt Management
* `POST /v1/receipts` — Create receipt from transaction
* `GET /v1/receipts` — List receipts
* `POST /v1/receipts/{id}/send` — Send receipt to tax service (mock)

## Frontend Features

* Account listing and selection
* Transaction history with filtering
* Receipt creation and management
* Simple, responsive UI with Tailwind CSS

## Development

1. Backend development:
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

2. Frontend development:
```bash
cd frontend
npm install
npm run dev
```

## Roadmap MVP

* Account integration
* Transaction history and filtering
* Receipt generation
* Basic analytics
* CSV export functionality

## Contact

Development: [Your Name / Team]
Email: [example@example.com](mailto:example@example.com)
