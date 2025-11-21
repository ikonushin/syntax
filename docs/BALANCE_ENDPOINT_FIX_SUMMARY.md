# Исправление проблемы с отображением баланса счётов (0 ₽)

## 📋 Резюме

При загрузке страницы Tax Payments баланс всех счетов отображался как **0 ₽**, хотя должны были быть реальные балансы из банков.

**Корневая причина:** 
- Backend endpoint для получения баланса не существовал
- При попытке получить токен банка использовался неправильный `client_id` (team286-9 вместо team286)

**Решение:**
- ✅ Добавлен новый backend endpoint `/v1/accounts/{account_id}/balances`
- ✅ Исправлена логика получения токена (использование базового client_id)
- ✅ Улучшена frontend логика извлечения баланса

---

## 🔧 Технические изменения

### 1. Backend: Добавлен endpoint баланса

**Файл:** `/backend/routes/accounts.py`

```python
@router.get("/accounts/{account_id}/balances")
async def get_account_balance(
    account_id: str,
    access_token: str = Header(..., alias="Authorization"),
    consent_id: Optional[str] = Header(None, alias="consent_id"),
    bank_name: Optional[str] = Header(None, alias="X-Bank-Name"),
    client_id: Optional[str] = Header(None, alias="client_id"),
    session: Session = Depends(get_session)
):
    """
    Get balance for a specific account per Open Banking API.
    """
```

**Особенности:**
- Получает баланс счёта от банка через Open Banking API
- Поддерживает все три банка (ABank, SBank, VBank)
- Нормализует разные форматы ответа от банков
- Полное логирование для отладки

### 2. Backend: Исправлена логика client_id

**Файл:** `/backend/routes/accounts.py` (строка ~382)

```python
# Извлекаем базовый client_id (team286) из расширенного (team286-9)
base_client_id = token_data.get("client_id", "team286")
if "-" in str(base_client_id):
    base_client_id = base_client_id.split("-")[0]

# Используем базовый client_id для получения токена банка
bank_token_data = await authenticate_with_bank(
    client_id=base_client_id,  # team286 вместо team286-9
    client_secret=client_secret,
    bank_id=bank_name
)
```

**Почему это работает:**
- Банки регистрируют только `client_id=team286`
- Суффикс `-9` используется только для идентификации пользователей в нашей системе
- При запросе токена нужно использовать оригинальный `client_id`

### 3. Frontend: Улучшена обработка баланса

**Файл:** `/frontend/src/pages/TaxPaymentsPage.jsx`

**Правильное извлечение баланса:**
```javascript
// Раньше (неправильно):
const balances = balanceResponse.data.balance || balanceResponse.data.balances || []
if (balances.length > 0) {  // ❌ Cannot read .length of object!
  account.balance = balances[0]
}

// Теперь (правильно):
let balanceData = null
if (balanceResponse.data.balance) {
  balanceData = balanceResponse.data.balance  // Object
} else if (balanceResponse.data.balances && Array.isArray(balanceResponse.data.balances)) {
  balanceData = balanceResponse.data.balances[0]  // Array
}
```

**Улучшена функция форматирования:**
```javascript
const formatAmount = (amount) => {
  let numAmount = amount
  if (typeof amount === 'object' && amount !== null) {
    numAmount = amount.amount || amount.balanceAmount || 0
  }
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB'
  }).format(parseFloat(numAmount) || 0)
}
```

### 4. Frontend: Улучшено логирование

**Детальные логи ошибок:**
```javascript
console.error(`❌ TaxPayments: Failed to load balance for account ${accountId}:`, {
  message: balanceErr.message,
  response: balanceErr.response?.data,
  status: balanceErr.response?.status
})
```

---

## 🚀 Как проверить

### Вариант 1: Через интерфейс

1. Откройте http://localhost:5173/tax-payments
2. Откройте DevTools (F12) → Console
3. Должны увидеть логи:
   ```
   ✅ TaxPayments: Balance loaded: 4447.00 RUB
   ```
4. На странице баланс должен отображаться вместо 0 ₽

### Вариант 2: Через curl

```bash
# Получить JWT токен (из консоли браузера или localStorage)
export JWT_TOKEN="eyJ..."

# Получить баланс
curl http://localhost:8000/v1/accounts/acc-3959/balances \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "consent_id: YOUR_CONSENT_ID" \
  -H "X-Bank-Name: abank" \
  -H "client_id: team286-9"

# Ожидаемый ответ:
# {
#   "balance": {
#     "amount": 4447.00,
#     "currency": "RUB"
#   },
#   "balances": [...]
# }
```

### Вариант 3: Использовать тестовый скрипт

```bash
./test_balance.sh acc-3959 consent_id abank team286-9
```

---

## 📊 Результаты до и после

| Аспект | До | После |
|--------|-----|-------|
| Баланс на странице | 0,00 ₽ | 4 447,00 ₽ ✅ |
| Backend логи при 401 | ❌ 401 Unauthorized | ✅ 200 OK |
| Консоль браузера | Ошибка в логах | ✅ Успешно загружено |
| Endpoint существует | ❌ 404 | ✅ 200 |

---

## 🔍 Логирование для отладки

### Frontend Console
```
📊 TaxPayments: Loading accounts...
💰 TaxPayments: Fetching balance for account acc-3959...
✅ TaxPayments: Balance loaded: 4447.00 RUB
```

### Backend Logs
```
🔍 BALANCES: Getting bank-specific token for abank
🔍 BALANCES: Using base_client_id=team286 for bank token
💰 BALANCES: GET https://abank.open.bankingapi.ru/accounts/acc-3959/balances
💰 BALANCES: Response status: 200
✅ BALANCES: Got 1 balance(s) for account acc-3959
```

---

## 📝 Файлы, которые были изменены

1. **`/backend/routes/accounts.py`**
   - Добавлен новый endpoint `/v1/accounts/{account_id}/balances` (164 строки кода)
   - Исправлена логика извлечения базового `client_id`

2. **`/frontend/src/pages/TaxPaymentsPage.jsx`**
   - Улучшена логика извлечения баланса из ответа (15 строк)
   - Улучшена функция `formatAmount()` (8 строк)
   - Добавлено детальное логирование ошибок (4 строки)

3. **Документация (новые файлы)**
   - `/docs/BALANCE_ENDPOINT_DEBUG.md` - Подробная отладочная информация
   - `/BALANCE_FIX_INSTRUCTIONS.md` - Инструкции для проверки
   - `/test_balance.sh` - Тестовый скрипт

---

## ✅ Проверка исправления

### Автоматическая проверка

При загрузке Tax Payments page должны выполниться в порядке:

1. ✅ GET `/api/user-consents` → список согласий
2. ✅ GET `/v1/accounts` → список счетов
3. ✅ GET `/v1/accounts/{id}/balances` × N → балансы для каждого счёта (НОВОЕ)

### Ручная проверка в DevTools

```javascript
// В консоли браузера:
// 1. Посмотрите Network tab → должны быть запросы на /balances
// 2. Посмотрите Console tab → должны быть логи ✅ Balance loaded
// 3. Проверьте страницу → баланс должен быть != 0
```

---

## 🚨 Возможные проблемы и решения

| Проблема | Причина | Решение |
|----------|--------|--------|
| Баланс всё ещё 0 | Ошибка 401 при получении токена | Проверьте .env с правильным CLIENT_SECRET |
| 404 Not Found | Endpoint не загрузился | `docker-compose restart backend` |
| 403 Forbidden | Consent отозван | Переподключите банк на странице Banks |
| Request timeout | Долгое соединение | Проверьте интернет и сервис банка |

---

## 📞 Контакт для вопросов

Все логи выводятся с префиксами для отслеживания:
- 💰 BALANCES - операции с балансом
- ✅ TRANSACTIONS - транзакции (как было)
- ❌ Ошибки
- 📊 Информационные сообщения
