# Troubleshooting Guide for Syntax MVP

## Quick Start

```bash
# One-time setup
cp .env.example .env  # Edit with CLIENT_ID, CLIENT_SECRET

# Start all services
docker-compose up -d --build

# Run health check
./health-check.sh

# View all services status
docker-compose ps

# View API docs
open http://localhost:8000/docs

# View frontend
open http://localhost:5173
```

## Common Issues

### 1. Backend Container Won't Start

**Symptom:** `docker-compose logs backend` shows import errors

**Fix:**
```bash
# Rebuild the image
docker-compose down
docker-compose up -d --build

# Or check for import issues
docker-compose exec -T backend python -c "import fastapi; import sqlmodel"
```

**Known Issues:**
- ❌ `from sqlmodel import Engine` — Don't do this, use `create_engine()` directly
- ✅ Correct: `from sqlmodel import Session, create_engine, SQLModel`

### 2. Database Connection Issues

**Symptom:** `HTTPException(status_code=503, detail="Database connection not configured")`

**Fix:**
```bash
# Check DATABASE_URL in .env
echo $DATABASE_URL

# Check database is running
docker-compose logs db

# Test database connection
docker-compose exec -T db psql -U postgres -d multibanking -c "SELECT 1;"

# Verify tables exist
docker-compose exec -T db psql -U postgres -d multibanking -c "\dt"
```

### 3. Foreign Key Errors on Startup

**Symptom:** `sqlalchemy.exc.NoReferencedTableError: Foreign key associated with column 'receipt.user_id'`

**Fix:** Remove references to non-existent tables:
```python
# ❌ Wrong
user_id: Optional[UUID] = Field(default=None, foreign_key="users.id")

# ✅ Correct
user_id: Optional[UUID] = Field(default=None)  # Can be used for future user auth
```

### 4. Frontend Not Responding

**Symptom:** `curl http://localhost:5173` times out

**Solution:** Frontend runs inside Docker, use:
```bash
# Via docker-compose exec
docker-compose exec -T frontend curl -s http://localhost:5173

# Or just open in browser
open http://localhost:5173

# Check logs
docker-compose logs frontend
```

### 5. Bank API Authentication Fails

**Symptom:** `curl http://localhost:8000/v1/accounts` returns 401

**Why:** Expected! Without bank credentials in `.env`, the endpoint requires token.

**Fix:**
```bash
# Set real credentials
export CLIENT_ID=team286
export CLIENT_SECRET=<your_actual_secret>

# Update .env file
echo "CLIENT_ID=team286" >> .env
echo "CLIENT_SECRET=<secret>" >> .env

# Restart backend
docker-compose restart backend

# Try again
curl http://localhost:8000/v1/accounts -H "Authorization: Bearer YOUR_TOKEN"
```

## Health Check Endpoints

### Basic Health Check
```bash
curl http://localhost:8000/health
# Response: {"status": "ok"}
```

### Detailed Health Check
```bash
curl http://localhost:8000/health/detailed
# Response: 
# {
#   "backend": "ok",
#   "database": "ok",
#   "receipts_count": 0,
#   "timestamp": "2025-11-08T06:03:42.508877",
#   "services": {
#     "accounts": "available",
#     "receipts": "available"
#   }
# }
```

### Automated Health Check Script
```bash
./health-check.sh
# Checks: DB, Backend API, Frontend
# Exit code 0 if all healthy, 1 if any fails
```

## Debugging

### View Container Logs

```bash
# All services
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs frontend
docker-compose logs db

# Follow logs in real-time
docker-compose logs -f backend

# Last N lines
docker-compose logs backend --tail=50
```

### Access Database Directly

```bash
# Connect to PostgreSQL
docker-compose exec -T db psql -U postgres -d multibanking

# Useful queries
\dt                           # List tables
\d receipt                    # Show receipt table structure
SELECT COUNT(*) FROM receipt; # Count receipts
SELECT * FROM receipt LIMIT 5; # View first 5 receipts
```

### Execute Commands in Containers

```bash
# Run Python command in backend
docker-compose exec -T backend python -c "print('test')"

# Install additional package in backend
docker-compose exec -T backend pip install requests

# Check environment variables
docker-compose exec -T backend env | grep -i client
```

### Rebuild and Restart

```bash
# Full restart
docker-compose down && docker-compose up -d --build

# Restart specific service
docker-compose restart backend

# Rebuild without cache
docker-compose build --no-cache && docker-compose up -d
```

## Performance Tips

### Monitor Container Resources

```bash
# Watch live CPU/memory usage
docker stats syntax-main-backend-1 syntax-main-db-1 syntax-main-frontend-1

# One-time snapshot
docker ps -q | xargs docker inspect --format='{{.Name}}: CPU={{.State.Pid}}'
```

### Clear Caches and Data

```bash
# Clear transaction cache (in-memory)
# Just restart backend
docker-compose restart backend

# Clear Docker system (careful!)
docker system prune

# Remove database volume (resets DB)
docker-compose down -v
docker-compose up -d
```

## API Testing

### Using curl

```bash
# Health check
curl http://localhost:8000/health

# List accounts (requires bank credentials)
curl -X GET "http://localhost:8000/v1/accounts" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create receipt
curl -X POST "http://localhost:8000/v1/receipts" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "tx_123",
    "account_id": "acc_456",
    "date": "2025-11-08T10:00:00Z",
    "amount": "150.75",
    "service": "Coffee Shop",
    "client_name": "John Doe"
  }'

# List receipts
curl http://localhost:8000/v1/receipts

# Get specific receipt
curl http://localhost:8000/v1/receipts/123e4567-e89b-12d3-a456-426614174000
```

### Using OpenAPI/Swagger UI

Open browser: `http://localhost:8000/docs`

This provides interactive API documentation and testing interface.

## Known Limitations

| Issue | Status | Workaround |
|-------|--------|-----------|
| Transaction cache is in-memory | ❌ | Restarts lose data; use Redis for production |
| No user authentication | ❌ | JWT infrastructure prepared; needs implementation |
| No test suite | ❌ | Add pytest + pytest-asyncio tests |
| No monitoring/alerts | ❌ | Consider Prometheus + Grafana for production |
| Mock tax service | ⚠️ | Receipt sending is mocked; integrate "Мой налог" API |

## Contact & Support

- **Backend Issues:** Check `/backend/main.py` and `/backend/routes/`
- **Frontend Issues:** Check `/frontend/src/App.jsx`
- **Database Issues:** Check `/backend/database.py` and schema in models

## Checklists

### Before Committing

- [ ] `./health-check.sh` passes
- [ ] `docker-compose logs` has no errors
- [ ] All environment variables set in `.env`
- [ ] No `TODO` items blocking critical flow

### Before Production

- [ ] Replace in-memory transaction cache with Redis
- [ ] Implement JWT user authentication
- [ ] Add comprehensive test suite
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Integrate real tax service API
- [ ] Enable database backups
- [ ] Set up SSL/TLS for API endpoints
