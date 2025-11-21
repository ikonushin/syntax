# AI Copilot Instructions for Syntax (Multi-Banking MVP)
Do not create reports on work performed. 
All test files (if they need to be carried out) - save to the tests folder

## Project Overview

**Syntax** is a multi-banking aggregation platform for self-employed users in Russia. It integrates with bank APIs to collect transaction data, generate tax receipts, and provide analytics.

- **Backend:** FastAPI + SQLModel (async)
- **Frontend:** React 18 + Vite + TailwindCSS
- **Database:** PostgreSQL (SQLModel ORM)
- **Orchestration:** Docker Compose
- **Auth:** Bank API token-based (JWT prepared for future)

## Architecture Patterns

### Backend Structure

**File layout:** `/backend/main.py` → `/backend/routes/*.py` → `/backend/services/*.py` → `/backend/models/*.py` + `/backend/database.py`

**Key patterns:**
1. **Async throughout:** All routes and services use `async def`. Use `httpx.AsyncClient` for HTTP calls, not `requests`.
2. **Dependency injection:** FastAPI `Depends()` for session (`get_session`) and auth token (`get_token_dependency`). See `/backend/services/bank_auth.py` for token caching with asyncio lock.
3. **SQLModel models:** Located in `/backend/models/`, inherit from `SQLModel` with `table=True`. Use `UUID` for primary keys, `Decimal` for amounts. Example: `/backend/models/receipt.py`.
4. **In-memory caching:** `/backend/routes/accounts.py` uses dict-based `_tx_cache` for transactions (15-min TTL). **TODO:** Replace with Redis for production.

### Frontend Integration

**API base URL:** Environment variable `VITE_API_URL` (defaults to `http://localhost:8000` in dev). Set in `docker-compose.yml` and accessed via `axios` instance.

**Pattern:** React components fetch from `/v1/` routes using axios. State management via `useState`. No Redux/Context yet. See `/frontend/src/App.jsx` for accounts + transactions flow.

### Bank API Integration

**Flow:** Client credentials (CLIENT_ID, CLIENT_SECRET) → `/auth/bank-token` → token caching → Bearer auth headers

**Token management:** `/backend/services/bank_auth.py` implements:
- Global module-level cache with expiry tracking
- Asyncio lock to prevent concurrent token fetches (double-check pattern)
- 5-min safety margin before token expiry
- Fallback to expired token if fetch fails

**Routes affected:** `/v1/accounts`, `/v1/accounts/{id}/transactions`

## Critical Developer Workflows

### Local Development

```bash
# One-time setup
cp .env.example .env  # Edit with CLIENT_ID, CLIENT_SECRET

# Start all services
docker-compose up --build

# Run health checks
./health-check.sh                         # Automated check (DB + Backend + Frontend)
curl http://localhost:8000/health         # Quick health check
curl http://localhost:8000/health/detailed # Detailed status with database info

# Access endpoints
curl http://localhost:8000/health              # Backend health
curl http://localhost:5173                     # Frontend
curl http://localhost:8000/docs               # FastAPI interactive docs
```

### Database Initialization

- Migrations: **None yet.** Database schema created on app startup in `/backend/main.py` via `SQLModel.metadata.create_all(engine)`.
- Seed data: `init-db.sql` (mounted as docker entrypoint). Modify this for test data.
- Local DB: `psycopg2-binary` handles PostgreSQL connections; engine initialized if `DATABASE_URL` env var is set.

### Testing (Not Yet Implemented)

- **No test files present.** When adding tests: use `pytest` + `pytest-asyncio` for async route testing.
- Mock bank API responses using `httpx` mock or `pytest-httpx`.
- Session fixtures: leverage `get_session` dependency override in tests.

## Project-Specific Conventions

### Naming & Organization

- **Routes:** Organized by resource (`accounts.py`, `receipts.py`) under `/backend/routes/`, all using `/v1/` prefix.
- **Services:** Business logic and external integrations in `/backend/services/`. Example: `bank_auth.py` handles bank API authentication.
- **Models:** One SQLModel per file in `/backend/models/`. Foreign keys reference user table (prepared but optional).

### HTTP Response Patterns

- **Success:** Return JSON response directly (FastAPI auto-serializes SQLModel objects).
- **Errors:** Raise `HTTPException(status_code=..., detail="...")`. Common codes: 503 (DB unavailable), 404 (not found), 400 (bad input).
- **Logging:** Use module-level `logger = logging.getLogger(__name__)` defined after imports. Log at INFO for successes, ERROR for failures.

### Data Types

- **IDs:** Use `UUID` (from `uuid` module) for database primary keys, strings for bank entity IDs (account_id, transaction_id).
- **Money:** Use `Decimal` (not float) for financial amounts to avoid rounding errors.
- **Dates:** `datetime` objects in models; request params as ISO-format strings (parsed with `datetime.fromisoformat()`).

## Integration Points & External Dependencies

### Bank API (Open Banking)

- **Base URL:** `https://sbank.open.bankingapi.ru` (configurable via `BASE_URL` env var).
- **Endpoints used:** `/auth/bank-token`, `/accounts`, `/accounts/{id}/transactions`.
- **Auth:** Bearer token in `Authorization` header.
- **Error handling:** Catch `httpx.HTTPStatusError` and `httpx.RequestError` separately; log errors; raise appropriate HTTPExceptions.

### Environment Variables (from `.env`)

```
CLIENT_ID, CLIENT_SECRET      # Bank API credentials (required for /auth/bank-token)
BASE_URL                      # Bank API base URL (default: https://sbank.open.bankingapi.ru)
DATABASE_URL                  # PostgreSQL connection string (required for persistence)
JWT_SECRET                    # For future JWT auth (unused in MVP)
TX_CACHE_TTL_MINUTES          # Transaction cache TTL (default: 15)
VITE_API_URL                  # Frontend API base (default: http://localhost:8000)
```

### Current Limitations & TODOs

- **Caching:** In-memory dict; needs Redis for multi-instance deployments.
- **Auth:** Bank token only; user authentication (JWT) not yet implemented.
- **Testing:** No test suite; mock bank API responses when testing.
- **Receipts:** Status transitions (draft → sent → failed) are mocked; external tax service integration pending.

## When Modifying Core Systems

### Common Pitfalls & Fixes

**✅ Correct SQLModel imports:**
```python
from sqlmodel import Session, create_engine, SQLModel, select, Field
```

**❌ Broken imports (don't use):**
```python
from sqlmodel import Engine  # Doesn't exist in SQLModel v0.0.27
```

**✅ Optional fields for future functionality:**
```python
user_id: Optional[UUID] = Field(default=None)  # Prepare for user table, no FK yet
```

**❌ Foreign keys that crash on startup:**
```python
user_id: Optional[UUID] = Field(default=None, foreign_key="users.id")  # CRASHES - table doesn't exist
```

### Adding a new API endpoint

1. Create route in `/backend/routes/` under `/v1/` prefix.
2. Use `async def`, inject `token: str = Depends(get_token_dependency)` if bank API access needed.
3. Raise `HTTPException` for errors; log at ERROR level.
4. Inject `session: Session = Depends(get_session)` for database access.
5. Return SQLModel objects or Pydantic models directly (FastAPI handles serialization).

### Adding a database model

1. Create class in `/backend/models/`, inherit `SQLModel` with `table=True`.
2. Use `UUID` for primary keys (`Field(default_factory=uuid4, primary_key=True)`).
3. Add indexes on frequently queried columns (`Field(index=True)`).
4. **IMPORTANT:** Do NOT use `foreign_key="table.column"` unless the referenced table exists. Use optional fields for future foreign keys: `user_id: Optional[UUID] = Field(default=None)` (no foreign key constraint).
5. Update `/backend/main.py` imports so model is registered with SQLModel metadata.

### Handling external API failures

Use pattern from `/backend/routes/accounts.py` transactions endpoint:
- Catch `httpx.HTTPStatusError` (4xx/5xx responses) → log + raise HTTPException with same status code.
- Catch `httpx.RequestError` (connection issues) → log + raise HTTPException(status_code=503).
- For non-critical failures (caching), log warning and continue gracefully.

## Frontend-Specific Notes

- **API calls:** Use `axios` configured with `VITE_API_URL` env var. Path examples: `/v1/accounts`, `/v1/receipts`.
- **State:** React hooks only (`useState`); no Redux yet. Expand to Context API if state complexity grows.
- **Styling:** TailwindCSS utility classes. No component library; raw HTML + Tailwind for MVP simplicity.
- **Error handling:** Use `axios` error catching in try-catch; display alerts for user feedback.

## File Reference Guide

| File | Purpose |
|------|---------|
| `/backend/main.py` | FastAPI app entry, lifespan, router mounting, health endpoints |
| `/backend/database.py` | SQLModel engine + session dependency |
| `/backend/routes/accounts.py` | Account listing, transaction fetching + caching |
| `/backend/routes/receipts.py` | Receipt CRUD + send mock |
| `/backend/models/receipt.py` | Receipt SQLModel definition |
| `/backend/services/bank_auth.py` | Token fetch, cache, dependency |
| `/frontend/src/App.jsx` | Main React component (accounts + transactions UI) |
| `/docker-compose.yml` | Service orchestration; env var injection |
| `/.env` | Environment secrets (CLIENT_ID, CLIENT_SECRET, DATABASE_URL) |
| `/health-check.sh` | Automated health check script (Database + Backend + Frontend) |
| `/TROUBLESHOOTING.md` | Comprehensive debugging and troubleshooting guide |
