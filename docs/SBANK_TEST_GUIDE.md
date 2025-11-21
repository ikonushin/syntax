# SBank Flow - Инструкция по проверке

## Предварительно

1. **Запустить приложение:**
```bash
docker-compose up --build
```

2. **Проверить что всё запустилось:**
```bash
# Проверить backend
curl http://localhost:8000/health

# Проверить frontend
curl http://localhost:5173
```

## Тестирование SBank Flow

### Способ 1: Через браузер

**Шаг 1: Открыть приложение**
- Откройте http://localhost:5173 в браузере
- Откройте DevTools (F12) → Network tab (оставьте открытым для отладки)

**Шаг 2: Авторизация**
- CLIENT_ID: `dev-client` (или любой ID)
- CLIENT_SECRET: `dev-secret` (или любой secret)
- Нажмите "Login"

**Шаг 3: Выбрать пользователя**
- Выберите любого пользователя (e.g., User 1)

**Шаг 4: Подключить SBank**
- Нажмите кнопку "Connect SBank"
- Должно появиться модальное окно с кнопкой "Откройте ссылку для подтверждения"
- В DevTools Network должен появиться запрос `POST /api/consents`
  - Status: 200
  - Response должен содержать: `request_id` (req-...)

**Шаг 5: Оптимуляция одобрения**
- В реальной жизни: пользователь нажимает ссылку, одобряет в SBank, возвращается
- Для теста: просто нажимаем "Я подтвердил" (система все равно может работать с тестовым request_id)

**Шаг 6: Проверить запрос к эндпоинту**
- Нажмите "Я подтвердил"
- В DevTools Network должен появиться запрос `GET /api/consents/req-...`
  - **Проверить Headers:**
    - ✅ `Authorization: Bearer eyJ0...` (должен быть)
    - ✅ Query string: `bank_id=sbank` (должен быть)
  - **Проверить Response:**
    - Status: 200
    - Body: `{consent_id: "consent-...", status: "approved", ...}`

**Шаг 7: Если все успешно**
- Должно перенаправить на страницу `/transactions`
- Должны загрузиться счета и транзакции

### Способ 2: Через автоматический тест

```bash
# Перейти в папку проекта
cd /Users/mac/Desktop/projects/Syntax/Syntax-main

# Запустить тест
./test_consent_lookup.sh

# Ожидаемый результат
# 🧪 Testing SBank Consent Lookup Endpoint
# ✅ Got token: eyJ0eXAi...
# ✅ Got IDs:
#    request_id: req-12345
#    consent_id: consent-pending-xxx
# ✅ Lookup successful!
#    Returned consent_id: consent-67890
#    Returned status: approved
# ✅ All tests passed!
```

## Отладка

### Если ошибка 401 Unauthorized

**Проверить в DevTools Network tab:**
```
Request Headers:
- Authorization: Bearer <token>  ← Должен быть!

Если нет Authorization header:
- Проблема в frontend коде
- Проверить что axios отправляет headers
```

**Проверить backend логи:**
```
docker-compose logs backend | grep "GET_CONSENT"

Ожидаемо:
🔍 GET_CONSENT DEBUG: Getting consent/request req-12345, bank=sbank, has_auth=True
```

### Если ошибка 404 Not Found

**Проверить URL:**
```
Должен быть: GET /api/consents/req-12345?bank_id=sbank

Проверить что:
- request_id передается в URL, не в параметрах
- request_id начинается с "req-"
```

**Проверить backend логи:**
```
docker-compose logs backend | tail -50

Если видите:
🔍 GET_CONSENT DEBUG: has_auth=False
→ Токен не передается, проверить headers

Если видите ошибку в консоли:
→ Проверить что endpoint существует
```

### Если ошибка при создании consent

```bash
# Проверить что бэкенд работает
curl http://localhost:8000/health

# Проверить что на консоль выводятся логи
docker-compose logs backend | tail -20

# Проверить что POST к bank API работает
curl -X POST http://localhost:8000/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"client_id":"dev-client","client_secret":"dev-secret"}'
```

## Полный лог для проверки

Полный лог одного цикла (как должно быть):

```
=== БРАУЗЕР ===
Frontend console:
  🔄 BANKS: User confirmed approval, fetching consent_id from request_id...
  🔄 BANKS: Request ID: req-12345
  ✅ BANKS: Consent response: {consent_id: 'consent-67890', status: 'approved', ...}

DevTools Network:
  GET /api/consents/req-12345?bank_id=sbank
  Headers: Authorization: Bearer eyJ0...
  Response: 200 {consent_id: 'consent-67890', status: 'approved'}

=== BACKEND ЛОГИ ===
docker logs:
  🔍 GET_CONSENT DEBUG: Getting consent/request req-12345, bank=sbank, has_auth=True
  🔍 GET_CONSENT DEBUG: This is a request_id for SBank, converting to consent_id
  🔍 GET_CONSENT DEBUG: Got consent_id from request_id: {'consent_id': 'consent-67890', 'status': 'approved'}

=== РЕЗУЛЬТАТ ===
✅ Переход на страницу /transactions
✅ Загрузка счетов и транзакций
```

## Проверка кода

```bash
# Убедиться что Header импортирован
grep "from fastapi import.*Header" /Users/mac/Desktop/projects/Syntax/Syntax-main/backend/routes/auth.py

# Убедиться что параметр правильный
grep "authorization.*Header" /Users/mac/Desktop/projects/Syntax/Syntax-main/backend/routes/auth.py

# Убедиться что frontend отправляет Authorization
grep "'Authorization'.*Bearer" /Users/mac/Desktop/projects/Syntax/Syntax-main/frontend/src/pages/BanksPage.jsx
```

## После проверки

Если всё работает:
- ✅ 401 ошибок больше нет
- ✅ 404 ошибок больше нет
- ✅ SBank flow работает от начала до конца
- ✅ Счета и транзакции загружаются

**Можно переходить на боевой сервер.**

## Дополнительные команды для отладки

```bash
# Перестартить backend
docker-compose restart backend

# Перестартить frontend
docker-compose restart frontend

# Пересобрать frontend
cd frontend && npm run build && cd ..

# Просмотреть полные логи
docker-compose logs -f backend

# Просмотреть только SBank логи
docker-compose logs backend | grep "GET_CONSENT\|SBANK"

# Проверить что контейнеры запущены
docker-compose ps
```

## Что проверять в коде

**backend/routes/auth.py:**
- ✅ Строка 14: `Header` в импортах
- ✅ Строка 327: `authorization: Optional[str] = Header(None)`
- ✅ Строка 351: Извлечение токена из заголовка

**frontend/src/pages/BanksPage.jsx:**
- ✅ Строка 114: `'Authorization': \`Bearer ${sbankModal.accessToken}\``
- ✅ Строка 112: `bank_id` в params, не в headers

## Итого

Все готово! Просто запустите приложение и проверьте SBank flow. Если возникают ошибки, смотрите раздел "Отладка".
