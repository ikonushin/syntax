# 🧪 Quick Testing Guide - OpenBanking Consents

## Get Started (Copy & Paste Commands)

### 1. Start Fresh Services
```bash
cd /Users/mac/Desktop/projects/Syntax/Syntax-main
docker compose restart backend frontend
sleep 3
```

### 2. Check Services Running
```bash
curl http://localhost:8000/health
curl -I http://localhost:5173
```

### 3. Test Backend Consent Flows

#### Authenticate
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"client_id":"team286","client_secret":"DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"}' | jq -r '.access_token')

echo "Token: $TOKEN"
```

#### Test VBank (Auto-Approval)
```bash
curl -s -X POST http://localhost:8000/api/consents \
  -H "Content-Type: application/json" \
  -d "{\"access_token\":\"$TOKEN\",\"user_id\":\"team-286-4\",\"bank_id\":\"vbank\"}" | jq .
```

**Expected Response:**
```json
{
  "status": "success",
  "consent_id": "consent-xxx",
  "request_id": null,
  "redirect_url": null,
  "error": null
}
```

#### Test SBank (Manual-Approval)
```bash
curl -s -X POST http://localhost:8000/api/consents \
  -H "Content-Type: application/json" \
  -d "{\"access_token\":\"$TOKEN\",\"user_id\":\"team-286-4\",\"bank_id\":\"sbank\"}" | jq .
```

**Expected Response:**
```json
{
  "status": "pending",
  "consent_id": "consent-xxx",
  "request_id": "req-xxx",
  "redirect_url": "https://sbank.open.bankingapi.ru/client/consents.html?request_id=req-xxx",
  "error": null
}
```

#### Test Polling Endpoint
```bash
CONSENT_ID="consent-xxx"  # From SBank response above
curl -s -X GET "http://localhost:8000/api/consents/$CONSENT_ID/status?bank_id=sbank&access_token=$TOKEN" | jq .
```

**Expected Response:**
```json
{
  "consent_id": "consent-xxx",
  "status": "pending",
  "request_id": "req-xxx",
  "error": null
}
```

---

## Frontend Testing (Manual)

### 1. Open App
```
http://localhost:5173
```

### 2. Test VBank Flow
- Click on VBank
- Click "Подключить"
- ✅ Should see success message immediately
- ✅ Should transition to Transactions screen

### 3. Test SBank Flow
- Click on SBank
- Click "Подключить"
- ✅ Should see "Ожидание подписания согласия..." (Waiting for signature)
- ✅ SBank page should open in NEW TAB
- (In real scenario: User would sign and approve)
- ✅ Should auto-transition after ~5 seconds (or when polling completes)

---

## Debug Logging

### View All Consent Debug Logs
```bash
docker compose logs backend -f | grep "CONSENT DEBUG"
```

### View All Request Debug Logs
```bash
docker compose logs backend -f | grep "REQUEST DEBUG"
```

### View All Status Debug Logs
```bash
docker compose logs backend -f | grep "STATUS DEBUG"
```

### View All Logs with 🔍 Prefix
```bash
docker compose logs backend -f | grep "🔍"
```

---

## Common Test Scenarios

### Scenario 1: Quick VBank Test
```bash
# Step 1: Start services
docker compose restart backend frontend && sleep 2

# Step 2: Get token
TOKEN=$(curl -s -X POST http://localhost:8000/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"client_id":"team286","client_secret":"DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"}' | jq -r '.access_token')

# Step 3: Create VBank consent
curl -s -X POST http://localhost:8000/api/consents \
  -H "Content-Type: application/json" \
  -d "{\"access_token\":\"$TOKEN\",\"user_id\":\"team-286-4\",\"bank_id\":\"vbank\"}" | jq .

# Expected: {"status":"success","consent_id":"..."}
```

### Scenario 2: Quick SBank Test
```bash
# Step 1: Start services
docker compose restart backend frontend && sleep 2

# Step 2: Get token
TOKEN=$(curl -s -X POST http://localhost:8000/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"client_id":"team286","client_secret":"DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"}' | jq -r '.access_token')

# Step 3: Create SBank consent
RESPONSE=$(curl -s -X POST http://localhost:8000/api/consents \
  -H "Content-Type: application/json" \
  -d "{\"access_token\":\"$TOKEN\",\"user_id\":\"team-286-4\",\"bank_id\":\"sbank\"}")

echo "$RESPONSE" | jq .

# Expected: {"status":"pending","request_id":"...","redirect_url":"..."}
```

### Scenario 3: Frontend E2E Test
```bash
# Step 1: Open http://localhost:5173 in browser
# Step 2: Select VBank → Click "Подключить"
# Expected: See success message and transition to transactions
# Step 3: Select SBank → Click "Подключить"
# Expected: See redirect URL open in new tab, main app shows waiting message
```

---

## Troubleshooting

### Error: "Token expired"
**Cause:** JWT token issued during auth has expired (24 hour expiry)  
**Solution:** Get a fresh token with the authenticate endpoint

### Error: "401 Unauthorized"
**Cause:** Invalid credentials or expired bank API token  
**Solution:** 
- Verify CLIENT_ID and CLIENT_SECRET in .env
- Check if backend has valid bank API token

### Error: "Consent not found"
**Cause:** Using wrong consent_id or bank_id  
**Solution:** Use exact IDs from create consent response

### SBank page doesn't open
**Cause:** Browser popup blocker is active  
**Solution:** Disable popup blocker or allow localhost popups

### Polling never completes
**Cause:** Backend can't reach bank API  
**Solution:** Check network connectivity, bank API status, credentials

---

## Quick Reference: Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | ✅ Normal |
| 400 | Bad Request | Check request format |
| 401 | Unauthorized | Refresh token |
| 422 | Validation Error | Check required fields |
| 500 | Server Error | Check logs |
| 503 | Service Unavailable | Bank API down |

---

## Database Queries

### Check Consents Table
```bash
docker compose exec db psql -U postgres -d syntax -c "SELECT * FROM consent ORDER BY created_at DESC LIMIT 5;"
```

### Check Recent Consents for SBank
```bash
docker compose exec db psql -U postgres -d syntax -c "SELECT consent_id, request_id, status FROM consent WHERE bank_id='sbank' ORDER BY created_at DESC LIMIT 5;"
```

### Count Consents by Bank
```bash
docker compose exec db psql -U postgres -d syntax -c "SELECT bank_id, COUNT(*) FROM consent GROUP BY bank_id;"
```

---

## Performance Notes

- **Consent creation:** ~1-2 seconds
- **Polling interval:** 5 seconds
- **Max polling time:** 2 minutes (24 attempts)
- **Token expiry:** 24 hours
- **Database query time:** < 100ms

---

## When to Ask for Help

If you see these issues:
- ❌ 404 Not Found (wrong endpoint)
- ❌ 401 Unauthorized (credentials issue)
- ❌ 500 Internal Server Error (code bug)
- ❌ Polling timeout after 2 minutes (bank approval took too long)
- ❌ SBank page won't open (browser issue)

**Check the logs first:**
```bash
docker compose logs backend -f | grep "🔍"
```

---

*Quick Reference: November 9, 2025*
