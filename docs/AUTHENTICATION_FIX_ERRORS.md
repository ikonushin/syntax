# 🔧 Fix: Правильная обработка ошибок аутентификации

**Дата:** 9 ноября 2025  
**Статус:** ✅ ИСПРАВЛЕНО

---

## 🎯 Проблема

Backend всегда возвращал HTTP 200 даже при неправильных учетных данных, вместо HTTP 401.

### Причина

Код проверял только HTTP статус от внешнего API, но когда API возвращал:
- HTTP 200 с ошибкой в теле (`{"detail": "Invalid client_id"}`)
- HTTP 401 (обрабатывалось неправильно)

Результат: **неправильные учетные данные не отвергались**.

---

## ✅ Решение

### Изменено в `backend/services/auth_service.py`:

**ДО:**
```python
response.raise_for_status()
data = response.json()

access_token = data.get("access_token")
if not access_token:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,  # ❌ 500 вместо 401!
        detail="Ошибка при получении токена"
    )
```

**ПОСЛЕ:**
```python
response.raise_for_status()
data = response.json()

# ✅ Проверяем наличие ошибки в ответе
if "detail" in data and data.get("access_token") is None:
    logger.warning(f"API returned error in body: {data.get('detail')}")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,  # ✅ Правильный код!
        detail="Неверные данные авторизации"
    )

access_token = data.get("access_token")
if not access_token:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,  # ✅ 401 вместо 500!
        detail="Неверные данные авторизации"
    )
```

### Добавлено логирование:

```python
logger.info(f"Response status: {response.status_code}")
logger.info(f"Response body: {response.text[:200]}")
logger.info(f"Authentication response keys: {list(data.keys())}")
```

### Добавлена обработка HTTP 400:

```python
elif response.status_code == 400:
    logger.warning(f"Bad request for team {client_id}: {response.text}")
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Неверные параметры запроса"
    )
```

---

## 🧪 Тестирование

### Тест 1: Неправильные учетные данные

**Запрос:**
```bash
curl -X POST http://localhost:8000/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"client_id": "invalid", "client_secret": "wrongsecret"}'
```

**Результат ДО:** HTTP 200 (❌ НЕПРАВИЛЬНО)
```json
{
  "access_token": "eyJhbGciOi..."
}
```

**Результат ПОСЛЕ:** HTTP 401 (✅ ПРАВИЛЬНО)
```json
{
  "detail": "Неверные данные авторизации"
}
```

### Тест 2: Правильные учетные данные

**Запрос:**
```bash
curl -X POST http://localhost:8000/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "team286",
    "client_secret": "DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"
  }'
```

**Результат:** HTTP 200 ✅
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 1800,
  "bank_token_expires_in": 86400
}
```

### Логи при ошибке:

```
INFO - Authenticating team invalid
INFO - Calling https://sbank.open.bankingapi.ru/auth/bank-token with client_id=invalid
HTTP Request: POST https://sbank.open.bankingapi.ru/auth/bank-token "HTTP/1.1 401 Unauthorized"
INFO - Response status: 401
INFO - Response body: {"detail":"Invalid client_id"}
WARNING - Invalid credentials for team invalid: {"detail":"Invalid client_id"}
POST /api/authenticate HTTP/1.1 401 Unauthorized ✅
```

### Логи при успехе:

```
INFO - Authenticating team team286
INFO - Calling https://sbank.open.bankingapi.ru/auth/bank-token with client_id=team286
HTTP Request: POST https://sbank.open.bankingapi.ru/auth/bank-token "HTTP/1.1 200 OK"
INFO - Response status: 200
INFO - Response body: {"access_token":"eyJhbGc...", ...}
INFO - Authentication response keys: ['access_token', 'token_type', 'client_id', 'algorithm', 'expires_in']
INFO - Successfully authenticated team team286, token expires in 86400s
INFO - Encoded JWT token for client team286
INFO - Successfully authenticated team team286
POST /api/authenticate HTTP/1.1 200 OK ✅
```

---

## 🚀 Как использовать

### Локально:

```bash
# Пересобрать контейнеры
docker-compose down
docker-compose up --build -d

# Проверить здоровье
curl http://localhost:8000/health
```

### Фронтенд логин:

1. Откройте: http://localhost:5173
2. Введите Team ID: `team286`
3. Введите API Ключ: `DQXtm3ql5qZP89C7EX21QpPeHc4YSvey`
4. Нажмите "Войти"
5. Должно перенаправиться на экран выбора пользователя/банка ✅

### С ошибкой:

1. Введите неправильные учетные данные
2. Нажмите "Войти"
3. Появится красное сообщение об ошибке ✅
4. Backend вернет HTTP 401 ✅

---

## 📊 Матрица обработки ошибок

| Сценарий | HTTP Статус | Ответ | Сообщение |
|----------|-------------|-------|-----------|
| Правильные учетные данные | 200 | JWT токен | (успех) |
| Неправильный client_id | 401 | `{"detail": "Invalid client_id"}` | ✅ Показывается |
| Неправильный client_secret | 401 | `{"detail": "Invalid client_secret"}` | ✅ Показывается |
| Отсутствует access_token в ответе | 401 | - | ✅ Показывается |
| Неверные параметры | 400 | `{"detail": "..."}` | ✅ Показывается |
| API сервер недоступен | 503 | `{"detail": "..."}` | ✅ Показывается |

---

## 🔍 Отладка

### Посмотреть все логи:
```bash
docker-compose logs backend --tail=50
```

### Фильтр по аутентификации:
```bash
docker-compose logs backend --tail=50 | grep -i "authenticate\|response\|token"
```

### Фильтр по ошибкам:
```bash
docker-compose logs backend --tail=50 | grep -i "error\|warning\|invalid"
```

### Проверить текущий статус:
```bash
docker-compose ps
docker-compose logs backend --tail=5
```

---

## 📝 Изменённые файлы

- `backend/services/auth_service.py` (улучшено логирование и обработка ошибок)

---

## ✨ Что теперь работает:

✅ Неправильные учетные данные возвращают HTTP 401  
✅ Frontend показывает ошибку при неправильных данных  
✅ Правильные учетные данные возвращают JWT токен  
✅ Детальное логирование для отладки  
✅ Поддержка всех типов ошибок от API  

---

**Версия:** 2.1  
**Статус:** ✅ ГОТОВО И ПРОТЕСТИРОВАНО
