# Open Banking API Integration - Полная спецификация

## Обзор процесса (7 шагов)

Система SYNTAX интегрируется с Open Banking API для агрегации банковских счетов и оплаты налогов. Процесс состоит из 7 последовательных шагов:

| Шаг | Операция | Метод | URL | Результат |
|-----|----------|-------|-----|-----------|
| 1 | Авторизация клиента | POST | `/auth/bank-token` | `access_token` (1 час) |
| 2 | Создание согласия на просмотр счетов | POST | `/account-access-consents` | `consent_id` |
| 3 | Просмотр списка счетов | GET | `/accounts` | Список счетов с балансами |
| 4 | Просмотр транзакций | GET | `/transactions` | История транзакций |
| 5 | Отзыв согласия (опционально) | DELETE | `/account-access-consents/{consent_id}` | Отключение банка |
| 6 | Создание согласия на перевод средств | POST | `/payment-consents` | `payment_consent_id` |
| 7 | Оплата счета | POST | `/payments` | `payment_id` и статус платежа |

---

## Шаг 1: Авторизация клиента

**Операция**: Создание токена авторизации при входе

### Запрос

```bash
curl -X POST http://localhost:8000/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "team286",
    "client_secret": "DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"
  }'
```

### Ответ (200 OK)

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "bank_token_expires_in": 86400
}
```

### Описание

- **Метод**: POST
- **URL**: `https://sbank.open.bankingapi.ru/auth/bank-token`
- **Параметры запроса**: `client_id=team286&client_secret=...`
- **Результат**: `access_token` сохраняется как `{{access_token}}` для всех последующих запросов
- **Валидность**: 1 час
- **Банки**: Один общий токен для всех трех банков (vbank, sbank, abank)

---

## Шаг 2: Создание согласия на просмотр счетов и транзакций

**Операция**: Подключение выбранного банка (пользователь выбирает bank_id и формирует client_id)

### Запрос

```bash
curl -X POST http://localhost:8000/api/consents \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user_id": "team286-9",
    "bank_id": "sbank"
  }'
```

### Ответ для SBank (200 OK)

```json
{
  "status": "pending",
  "consent_id": "consent-abc12345",
  "redirect_url": "https://sbank.open.bankingapi.ru/client/consents.html",
  "request_id": "req-xyz98765"
}
```

### Ответ для VBank/ABank (200 OK)

```json
{
  "status": "success",
  "consent_id": "consent-def67890",
  "redirect_url": null
}
```

### Описание

- **Метод**: POST
- **URL**: `https://{bank}.open.bankingapi.ru/account-access-consents?client_id={user_id}`
  - Для SBank: `https://sbank.open.bankingapi.ru/account-access-consents?client_id=team286-9`
  - Для VBank: `https://vbank.open.bankingapi.ru/account-access-consents?client_id=team286-9`
  - Для ABank: `https://abank.open.bankingapi.ru/account-access-consents?client_id=team286-9`

- **Заголовки**:
  - `Authorization: Bearer {{access_token}}`
  - `client_id: team286-9`

- **Тело запроса**:
  ```json
  {
    "data": {
      "permissions": [
        "ReadAccountsBasic",
        "ReadAccountsDetail",
        "ReadBalances",
        "ReadTransactionsBasic",
        "ReadTransactionsDetail"
      ]
    }
  }
  ```

- **Результат**: 
  - `consent_id` сохраняется для использования в шагах 3-4
  - Для SBank: пользователь должен открыть `redirect_url` в новой вкладке для подтверждения
  - Для VBank/ABank: согласие автоматически активируется

- **Примечание**: 
  - На этом шаге `client_id` может быть изменен (например, с `team286` на `team286-9`)
  - `-9` представляет выбор пользователя (от 1 до 9)

---

## Шаг 3: Просмотр списка счетов

**Операция**: Получение списка банковских счетов клиента (для выбора счета)

### Запрос

```bash
curl -X GET "http://localhost:8000/v1/accounts" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "consent_id: consent-abc12345" \
  -H "client_id: team286-9" \
  -H "X-Bank-Name: sbank"
```

### Ответ (200 OK)

```json
{
  "accounts": [
    {
      "id": "account-001",
      "number": "40817810286090210601",
      "type": "checking",
      "currency": "RUB",
      "balance": 50000.00,
      "status": "active"
    },
    {
      "id": "account-002",
      "number": "40817810286090210602",
      "type": "savings",
      "currency": "RUB",
      "balance": 150000.00,
      "status": "active"
    }
  ]
}
```

### Описание

- **Метод**: GET
- **URL**: `https://{bank}.open.bankingapi.ru/accounts?client_id={client_id}`
  - Пример: `https://sbank.open.bankingapi.ru/accounts?client_id=team286-9`

- **Заголовки**:
  - `Authorization: Bearer {{access_token}}`
  - `consent_id: {{consent_id}}` (из шага 2)
  - `client_id: team286-9`
  - `X-Bank-Name: sbank`

- **Результат**: Список счетов с балансами для выбора
- **Примечание**: URL зависит от выбранного банка (vbank, sbank, abank)

---

## Шаг 4: Просмотр транзакций

**Операция**: Загрузка истории транзакций

### Запрос

```bash
curl -X GET "http://localhost:8000/v1/transactions" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "consent_id: consent-abc12345" \
  -H "client_id: team286-9" \
  -H "X-Bank-Name: sbank"
```

### Ответ (200 OK)

```json
{
  "transactions": [
    {
      "id": "tx-001",
      "date": "2025-11-15T10:30:00Z",
      "amount": 5000.00,
      "currency": "RUB",
      "description": "Доход от фриланса",
      "type": "credit",
      "status": "completed"
    },
    {
      "id": "tx-002",
      "date": "2025-11-15T11:15:00Z",
      "amount": 1500.00,
      "currency": "RUB",
      "description": "Комиссия банка",
      "type": "debit",
      "status": "completed"
    }
  ],
  "from_cache": false
}
```

### Описание

- **Метод**: GET
- **URL**: `https://{bank}.open.bankingapi.ru/transactions?client_id={client_id}`

- **Заголовки**:
  - `Authorization: Bearer {{access_token}}`
  - `consent_id: {{consent_id}}` (из шага 2)
  - `client_id: team286-9`
  - `X-Bank-Name: sbank`

- **Query параметры** (опциональные):
  - `date_from`: Начальная дата (ISO format)
  - `date_to`: Конечная дата (ISO format)
  - `min_amount`: Минимальная сумма
  - `max_amount`: Максимальная сумма

- **Результат**: История транзакций за период
- **Кэширование**: Результаты кэшируются на 15 минут
- **Примечание**: URL зависит от выбранного банка (vbank, sbank, abank)

---

## Шаг 5: Отзыв согласия (опционально)

**Операция**: Отключение банка через настройки

### Запрос

```bash
curl -X DELETE "http://localhost:8000/api/consents/consent-abc12345?bank_id=sbank&client_id=team286-9&access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Ответ (200 OK)

```json
{
  "status": "success",
  "message": "Согласие успешно отозвано",
  "consent_id": "consent-abc12345",
  "bank_id": "sbank"
}
```

### Описание

- **Метод**: DELETE
- **URL**: `https://{bank}.open.bankingapi.ru/account-access-consents/{consent_id}?client_id={client_id}`

- **Query параметры**:
  - `bank_id`: Банк (vbank, sbank, abank)
  - `client_id`: Идентификатор клиента (team286-9)
  - `access_token`: JWT токен

- **Результат**: Согласие отозвано, доступ к данным больше не возможен
- **Примечание**: URL зависит от выбранного банка

---

## Шаг 6: Создание согласия на перевод средств

**Операция**: Создание согласия на перевод при оплате налога

### Запрос

```bash
curl -X POST "http://localhost:8000/v1/tax-payments/{payment_id}/pay" \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "40817810286090210601",
    "bank_name": "sbank",
    "bank_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

### Backend запрос к банку

```bash
curl -X POST "https://sbank.open.bankingapi.ru/payment-consents?client_id=team286-9" \
  -H "Authorization: Bearer {{access_token}}" \
  -H "client_id: team286-9" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "permissions": ["CreatePayment"],
      "initiation": {
        "instructedAmount": {
          "amount": "3500.00",
          "currency": "RUB"
        },
        "debtorAccount": {
          "schemeName": "RU.CBR.PAN",
          "identification": "40817810286090210601"
        },
        "creditorAccount": {
          "schemeName": "RU.CBR.PAN",
          "identification": "4081781028601060774",
          "bank_code": "sbank"
        }
      }
    }
  }'
```

### Ответ (200 OK)

```json
{
  "status": "success",
  "payment_id": "payment-123456",
  "consent_id": "payment-consent-abc123",
  "payment_status": "processing",
  "message": "Платёж обрабатывается"
}
```

### Описание

- **Метод**: POST
- **URL**: `https://{bank}.open.bankingapi.ru/payment-consents?client_id={user_id}`

- **Заголовки**:
  - `Authorization: Bearer {{access_token}}`
  - `client_id: team286-9`

- **Тело запроса**: Согласие на платеж с деталями:
  - `amount`: Сумма налога (random от 2000 до 5000 рублей)
  - `debtorAccount`: Счет плательщика (от шага 3)
  - `creditorAccount`: Фиксированный счет ФНС (4081781028601060774)

- **Фиксированные данные ФНС** (не изменяются):
  ```json
  {
    "schemeName": "RU.CBR.PAN",
    "identification": "4081781028601060774",
    "bank_code": "sbank"
  }
  ```

- **Результат**: `payment_consent_id` для использования в шаге 7

---

## Шаг 7: Оплата счета

**Операция**: Оплата налога

### Backend запрос к банку

```bash
curl -X POST "https://sbank.open.bankingapi.ru/payments?client_id=team286-9" \
  -H "Authorization: Bearer {{access_token}}" \
  -H "consent_id: {{payment_consent_id}}" \
  -H "client_id: team286-9" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "initiation": {
        "instructedAmount": {
          "amount": "3500.00",
          "currency": "RUB"
        },
        "debtorAccount": {
          "schemeName": "RU.CBR.PAN",
          "identification": "40817810286090210601"
        },
        "creditorAccount": {
          "schemeName": "RU.CBR.PAN",
          "identification": "4081781028601060774",
          "bank_code": "sbank"
        },
        "comment": "Оплата налога"
      }
    }
  }'
```

### Ответ (200 OK)

```json
{
  "status": "success",
  "payment_id": "payment-123456",
  "payment_status": "paid",
  "message": "Платёж успешно отправлен"
}
```

### Описание

- **Метод**: POST
- **URL**: `https://{bank}.open.bankingapi.ru/payments?client_id={user_id}`

- **Заголовки**:
  - `Authorization: Bearer {{access_token}}`
  - `consent_id: {{payment_consent_id}}` (из шага 6)
  - `client_id: team286-9`

- **Тело запроса**: Совпадает с согласием из шага 6
  - Сумма ДОЛЖНА быть одинакова на шагах 6 и 7

- **Результат**:
  - `paymentId`: Идентификатор платежа
  - `status`: Статус платежа ("AcceptedSettlementCompleted" = успех)
  - `amount` и `currency`: Сумма и валюта
  - `creationDateTime` и `statusUpdateDateTime`: Временные метки

---

## Важные замечания для интеграции

### 1. Порядок выполнения
Шаги ДОЛЖНЫ выполняться в строгом порядке:
1. Авторизация → получение `access_token`
2. Создание согласия → получение `consent_id`
3. Просмотр счетов
4. Просмотр транзакций
5. (опционально) Отзыв согласия
6. Создание платежного согласия → `payment_consent_id`
7. Оплата налога

### 2. Разные согласия для разных операций
- **Для просмотра счетов/транзакций**: одно согласие (шаг 2)
- **Для платежей**: отдельное согласие (шаг 6)
- Они независимы друг от друга

### 3. Client ID формат
- **Шаг 1**: Обычно "team286" (логин)
- **Шаги 2-7**: "team286-X" где X это выбор пользователя (1-9)
- Пользователь может изменить X на шаге 2

### 4. Динамические URL по банкам
Все запросы (кроме шага 1) зависят от выбранного банка:
- **VBank**: `https://vbank.open.bankingapi.ru`
- **SBank**: `https://sbank.open.bankingapi.ru`
- **ABank**: `https://abank.open.bankingapi.ru`

### 5. SBank требует ручного подтверждения
- Для SBank пользователь должен открыть URL из шага 2 в браузере
- Подтвердить согласие вручную на странице банка
- После этого можно переходить к шаг 3

### 6. Фиксированные данные налогового аккаунта
```json
{
  "identification": "4081781028601060774",
  "bank_code": "sbank",
  "inn": "7707329152",
  "kpp": "770701001",
  "bik": "044525000"
}
```
**Эти данные одинаковы для всех пользователей и банков**

### 7. Обработка ошибок
- **200/201**: Успех
- **400**: Ошибка в данных запроса
- **401/403**: Проблемы с авторизацией
- **404**: Ресурс не найден
- **503**: API банка недоступен

### 8. Тестирование
Все запросы уже протестированы в Postman и готовы к использованию на бэкенде.

---

## Пример полного flow (curl)

```bash
#!/bin/bash

# Шаг 1: Авторизация
TOKEN=$(curl -s -X POST http://localhost:8000/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "team286",
    "client_secret": "DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"
  }' | jq -r '.access_token')

echo "Token: $TOKEN"

# Шаг 2: Создание согласия
CONSENT=$(curl -s -X POST http://localhost:8000/api/consents \
  -H "Content-Type: application/json" \
  -d "{
    \"access_token\": \"$TOKEN\",
    \"user_id\": \"team286-9\",
    \"bank_id\": \"vbank\"
  }" | jq -r '.consent_id')

echo "Consent: $CONSENT"

# Шаг 3: Просмотр счетов
curl -s -X GET "http://localhost:8000/v1/accounts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "consent_id: $CONSENT" \
  -H "client_id: team286-9" \
  -H "X-Bank-Name: vbank" | jq .

# Шаг 4: Просмотр транзакций
curl -s -X GET "http://localhost:8000/v1/transactions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "consent_id: $CONSENT" \
  -H "client_id: team286-9" \
  -H "X-Bank-Name: vbank" | jq .
```

---

## Коды ошибок

| Код | Значение | Решение |
|-----|----------|--------|
| 400 | Bad Request | Проверьте параметры запроса |
| 401 | Unauthorized | Проверьте access_token или client_id |
| 403 | Forbidden | Согласие отозвано или истекло |
| 404 | Not Found | Ресурс не существует |
| 503 | Service Unavailable | API банка недоступен |
| 504 | Gateway Timeout | Истекло время ожидания |

---

## Переменные окружения

```bash
BASE_URL=https://sbank.open.bankingapi.ru          # Base URL банка
CLIENT_ID=team286                                    # Логин командный
CLIENT_SECRET=DQXtm3ql5qZP89C7EX21QpPeHc4YSvey    # Секретный ключ
DATABASE_URL=postgresql://user:pass@db:5432/syntax # БД PostgreSQL
JWT_SECRET=your-secret-key-here                    # Секрет для JWT
TX_CACHE_TTL_MINUTES=15                            # Кэш транзакций (минуты)
```

---

## Структура ответов API

### Успешный ответ (2xx)
```json
{
  "status": "success",
  "data": { ... },
  "message": "Операция выполнена успешно"
}
```

### Ошибка (4xx/5xx)
```json
{
  "status": "error",
  "detail": "Описание ошибки",
  "error_code": "ERROR_CODE"
}
```

---

Документация обновлена: 16 ноября 2025
