# Bank API Implementation Guide

## Обзор

Полная реализация работы с API банков (ABank, SBank, VBank) согласно документации OpenBanking API.

## Архитектура

### Backend

#### BankService (`/backend/services/bank_service.py`)

Унифицированный сервис для работы с API всех банков:

```python
from services.bank_service import BankService

# Инициализация
bank_service = BankService("abank", db_session)

# Создание согласия
consent = await bank_service.create_consent(bank_token, client_id)

# Получение счетов
accounts = await bank_service.get_accounts(bank_token, consent_id)

# Получение транзакций
transactions = await bank_service.get_transactions(
    bank_token, consent_id, account_id, page=1, limit=50
)

# Отзыв согласия
await bank_service.revoke_consent(bank_token, consent_id)
```

**Методы:**
- `create_consent()` - создание согласия (POST /account-consents/request)
- `get_consent_status()` - проверка статуса (GET /account-consents/{consent_id})
- `get_accounts()` - получение счетов (GET /accounts)
- `get_transactions()` - получение транзакций (GET /accounts/{id}/transactions)
- `revoke_consent()` - отзыв согласия (DELETE /account-consents/{consent_id})

### API Endpoints

#### 1. Создание согласия
```http
POST /api/consents
Content-Type: application/json

{
  "access_token": "jwt_token_here",
  "user_id": "team-286-1",
  "bank_id": "abank"
}
```

**Ответ (ABank/VBank - автоодобрение):**
```json
{
  "status": "success",
  "consent_id": "consent-abc123"
}
```

**Ответ (SBank - ручное одобрение):**
```json
{
  "status": "pending",
  "consent_id": "consent-def456",
  "request_id": "req-xyz789",
  "redirect_url": "https://sbank.open.bankingapi.ru/client/consents.html?request_id=req-xyz789"
}
```

#### 2. Получение счетов
```http
GET /v1/accounts
Headers:
  Authorization: Bearer <jwt_token>
  X-Consent-Id: <consent_id>
  X-Bank-Name: abank
Query Parameters:
  client_id: team-286-1 (optional)
```

**Ответ:**
```json
{
  "accounts": [
    {
      "account_id": "acc-123",
      "currency": "RUB",
      "account_type": "Business",
      "nickname": "Основной счёт",
      "servicer": {...}
    }
  ]
}
```

#### 3. Получение транзакций
```http
GET /v1/accounts/{account_id}/transactions?page=1&limit=50
Headers:
  Authorization: Bearer <jwt_token>
  X-Consent-Id: <consent_id>
  X-Bank-Name: abank
```

**Ответ:**
```json
{
  "transactions": [...],
  "from_cache": false,
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150
  }
}
```

#### 4. Отзыв согласия
```http
DELETE /api/consents/{consent_id}?bank_id=abank&access_token=<jwt_token>
```

**Ответ:**
```json
{
  "status": "success",
  "message": "Согласие успешно отозвано",
  "consent_id": "consent-abc123",
  "bank_id": "abank"
}
```

### Frontend Integration

#### Подключение банка

```javascript
const handleConnectBank = async (bankId) => {
  const accessToken = localStorage.getItem('accessToken')
  
  const response = await axios.post(`${API_URL}/api/consents`, {
    access_token: accessToken,
    user_id: 'team-286-1',
    bank_id: bankId
  })
  
  const consentId = response.data.consent_id
  const status = response.data.status
  
  // Сохраняем consent_id для последующего отзыва
  const newBank = {
    id: bankId,
    name: 'ABank',
    consentId: consentId,
    status: status
  }
  
  setConnectedBanks(prev => [...prev, newBank])
}
```

#### Отключение банка

```javascript
const handleDisconnectBank = async (bankId) => {
  const bank = connectedBanks.find(b => b.id === bankId)
  const accessToken = localStorage.getItem('accessToken')
  
  await axios.delete(
    `${API_URL}/api/consents/${bank.consentId}`,
    {
      params: {
        bank_id: bankId,
        access_token: accessToken
      }
    }
  )
  
  setConnectedBanks(prev => prev.filter(b => b.id !== bankId))
}
```

## Особенности реализации

### Автоодобрение vs Ручное одобрение

**ABank / VBank:**
- `auto_approved: true` в запросе
- Согласие создается мгновенно со статусом `approved`
- Можно сразу запрашивать счета и транзакции

**SBank:**
- `auto_approved: false` в запросе
- Возвращается `request_id` и `redirect_url`
- Пользователь должен подтвердить согласие в UI банка
- Frontend должен поллить GET /api/consents/{consent_id}/status до статуса `authorized`

### Кеширование транзакций

Транзакции кешируются на 15 минут (configurable via `TX_CACHE_TTL_MINUTES`):

```python
# Ключ кеша: {bank_name}:{account_id}:{page}:{limit}
cache_key = f"abank:acc-123:1:50"
```

**TODO:** Заменить in-memory кеш на Redis для продакшена.

### Требуемые заголовки

**Согласно документации OpenBanking API:**

1. **Создание согласия:**
   - `Authorization: Bearer <bank_token>`
   - `X-Requesting-Bank: team286`

2. **Получение счетов:**
   - `Authorization: Bearer <bank_token>`
   - `X-Consent-Id: <consent_id>`

3. **Получение транзакций:**
   - `Authorization: Bearer <bank_token>`
   - `X-Consent-Id: <consent_id>`

4. **Отзыв согласия:**
   - `Authorization: Bearer <bank_token>`

## База данных

### Модель Consent

```python
class Consent(SQLModel, table=True):
    id: UUID  # Primary key
    bank_name: str  # abank|sbank|vbank
    client_id: str  # team286-1
    consent_id: str  # consent-abc123
    request_id: Optional[str]  # For SBank manual approval
    status: str  # pending|awaitingAuthorization|approved|revoked
    redirect_uri: Optional[str]  # For SBank redirect
    expires_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
```

## Тестирование

### Curl примеры

**1. Создать согласие (ABank):**
```bash
curl -X POST http://localhost:8000/api/consents \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "your_jwt_token",
    "user_id": "team-286-1",
    "bank_id": "abank"
  }'
```

**2. Получить счета:**
```bash
curl -X GET "http://localhost:8000/v1/accounts" \
  -H "Authorization: Bearer your_jwt_token" \
  -H "X-Consent-Id: consent-abc123" \
  -H "X-Bank-Name: abank"
```

**3. Получить транзакции:**
```bash
curl -X GET "http://localhost:8000/v1/accounts/acc-123/transactions?page=1&limit=50" \
  -H "Authorization: Bearer your_jwt_token" \
  -H "X-Consent-Id: consent-abc123" \
  -H "X-Bank-Name: abank"
```

**4. Отозвать согласие:**
```bash
curl -X DELETE "http://localhost:8000/api/consents/consent-abc123?bank_id=abank&access_token=your_jwt_token"
```

## Roadmap

### Ближайшие улучшения
- [ ] Заменить in-memory кеш на Redis
- [ ] Добавить поллинг для SBank manual approval на фронтенде
- [ ] Добавить поддержку пагинации для больших списков транзакций
- [ ] Реализовать автоматическое обновление токенов

### Будущие фичи
- [ ] Webhooks для уведомлений о новых транзакциях
- [ ] Экспорт транзакций в Excel/CSV
- [ ] Аналитика по категориям расходов
- [ ] Прогнозирование денежных потоков

## Ссылки

- [ABank API Docs](https://abank.open.bankingapi.ru/docs)
- [SBank API Docs](https://sbank.open.bankingapi.ru/docs)
- [VBank API Docs](https://vbank.open.bankingapi.ru/docs)
- [OpenBanking Standard](https://openbanking.atlassian.net/)
