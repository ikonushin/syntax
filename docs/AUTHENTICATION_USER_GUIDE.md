# Authentication Flow - User Guide

## Getting Started

### Prerequisites
- Docker and Docker Compose installed
- Access to external banking API credentials
- Modern web browser

### Starting the Application

```bash
cd /Users/mac/Desktop/projects/Syntax/Syntax-main
docker-compose up --build
```

Services will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## Login Screen

### Step 1: Enter Credentials

1. Open http://localhost:5173 in your browser
2. You'll see the login screen with two fields:
   - **"Введите client_id"** - Your team's client ID (e.g., "team286")
   - **"Введите client_secret"** - Your team's API key

3. Enter your credentials
4. Click **"Войти"** (Login)

### What Happens Behind the Scenes

1. Frontend sends credentials to `/api/authenticate`
2. Backend validates credentials with external banking API
3. If valid: Backend receives access token and caches it
4. Backend returns token to frontend
5. Frontend stores token in memory
6. User is redirected to user & bank selection screen

### Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Неверные данные авторизации" | Invalid credentials | Check client_id and client_secret |
| "Ошибка соединения" | Can't reach external API | Check internet connection |
| "Пожалуйста, заполните оба поля" | Missing field | Fill in both fields |

---

## User & Bank Selection Screen

### Step 2: Select User

1. Click one of the user buttons (1-9)
   - Each represents a different user in your team
   - Example: User 4 = "team-286-4"
2. Button will highlight in blue when selected

### Step 3: Select Bank

1. Click one of the bank buttons:
   - **VBANK** - ВБанк (Blue icon)
   - **ABANK** - АБанк (Green icon)
   - **SBANK** - СБанк (Purple icon)
2. Button will highlight in blue when selected

### Step 4: Create Consent

1. Ensure both user and bank are selected
2. Click **"Создать согласие"** (Create Consent)
3. Wait for the consent to be created (1-2 seconds)
4. You'll see: "Согласие успешно создано (ID: abc123)"

### What Happens Behind the Scenes

1. Frontend sends POST to `/api/consents` with:
   - `access_token` (from login)
   - `user_id` (selected user)
   - `bank_id` (selected bank)
2. Backend calls external API to create consent
3. Backend returns consent ID
4. Frontend auto-navigates to transactions screen

### Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Выберите пользователя и банк" | Missing selection | Click user and bank buttons |
| "Ошибка при создании согласия" | API error | Check logs, try different user/bank |
| "Токен авторизации истёк" | Token expired | Go back and login again |

---

## Transactions Screen

### Step 5: Select Transactions

1. You'll see a list of 3 sample transactions:
   - Date, description, and amount
   - Each has a checkbox

2. Click checkboxes to select transactions
3. When at least 1 is selected, a button appears:
   - **"Создать чек (X)"** where X = number selected

### Step 6: Create Receipt

1. Click **"Создать чек"** button
2. Receipt editing modal appears with:
   - Auto-filled date, amount, description
   - Editable line items
   - Total sum validation

3. The sum must match the transaction amount (within ₽0.01)
4. Click **"Далее"** (Next) to proceed

### Step 7: Confirm Receipt

1. Review all details:
   - Date
   - Amount
   - Service description
   - Client name

2. Click **"Отправить в Мой налог"** to submit
3. Loading indicator shows (1.5 seconds simulated)
4. Success message: "✓ Чек успешно отправлен"
5. Receipt is added to history

### Step 8: View Receipt History

- Scroll down to see created receipts
- Each receipt shows: date, description, amount

---

## Tips & Tricks

### Changing Users/Banks
- To select a different user/bank without logging out again:
  - Login → Select new user/bank → Create new consent
  - Each consent is independent

### Multiple Receipts
- Create as many receipts as needed
- Each transaction can have multiple receipts
- Use different amounts if splitting transactions

### Error Recovery
- If consent creation fails: Try selecting different user/bank
- If login fails: Check credentials and try again
- If stuck: Refresh page (F5) and login again

### Debugging
- Open browser console (F12) to see network requests
- Check network tab to see API calls
- Transactions use `/api/consents` endpoint

---

## Advanced: Testing with Real Credentials

### Obtaining Real Credentials

1. Contact your banking API provider
2. Receive `client_id` and `client_secret`
3. Enter them in the login screen

### Expected Workflow with Real Credentials

1. Login succeeds with valid access token
2. User & bank selection shows real banks from API
3. Consent creation succeeds with real consent ID
4. Transactions are fetched from real bank data
5. Receipts can be sent to "Мой налог" (My Tax service)

---

## API Endpoints Reference

### POST /api/authenticate
```bash
curl -X POST http://localhost:8000/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "team286", "client_secret": "secret"}'
```

### POST /api/consents
```bash
curl -X POST http://localhost:8000/api/consents \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "token_value",
    "user_id": "team-286-4",
    "bank_id": "vbank"
  }'
```

### GET /api/banks
```bash
curl "http://localhost:8000/api/banks?access_token=token_value"
```

---

## Troubleshooting

### "Ошибка при авторизации" on Login

1. Check credentials are correct
2. Verify external API is accessible
3. Try with test credentials first
4. Check backend logs: `docker-compose logs backend`

### Consent Creation Stuck

1. Check network tab in browser (F12)
2. Wait up to 5 seconds
3. If still stuck, click back button and try again
4. Check backend logs for errors

### No Transactions Showing

1. Consent might not have been created successfully
2. Try creating consent again
3. Verify bank_id is correct

### Frontend Won't Load

1. Check if port 5173 is in use
2. Restart docker: `docker-compose restart frontend`
3. Clear browser cache (Ctrl+Shift+Delete)
4. Try incognito/private mode

---

## FAQ

**Q: Can I use the same credentials for multiple teams?**  
A: No, each client_id/client_secret pair is for one team. Multiple teams need multiple logins.

**Q: How long does the access token last?**  
A: Typically 1 hour from external API. System automatically refreshes before expiry.

**Q: Can I select multiple banks at once?**  
A: No, you must select one user + one bank, create consent, then repeat for others.

**Q: What's a "consent"?**  
A: Permission from the bank to access this user's data. Required before viewing transactions or sending receipts.

**Q: Can I logout?**  
A: Refresh the page (F5) to return to login screen. Token is cleared when page reloads.

**Q: Is data saved between sessions?**  
A: Receipts are saved in session memory. Use export to save before closing.

---

## Getting Help

### Check Logs
```bash
# Backend logs
docker-compose logs backend -f

# Frontend logs (in browser console)
# Press F12 → Console tab

# All logs
docker-compose logs -f
```

### Restart Services
```bash
docker-compose restart
```

### Full Reset
```bash
docker-compose down
docker-compose up --build
```

---

**Version**: 1.0.0  
**Last Updated**: November 9, 2025  
**Status**: ✅ Production Ready
