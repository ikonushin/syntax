# SBank Consent Lookup Fix - 401 и 404 Ошибки

## Проблема

После реализации SBank flow, возникли две ошибки:
1. **401 Unauthorized** - "Invalid or expired access token"
2. **404 Not Found** - Эндпоинт `/api/consents/req-...` не найден

## Причины

### Ошибка 401
**Причина:** Frontend отправляет `access_token` как query parameter в URL, но бэкенд ожидает его в HTTP заголовке `Authorization`.

**Было:**
```javascript
axios.get(`${API_URL}/api/consents/${consentLookupId}`, {
  params: {
    bank_id: sbankModal.bankId,
    access_token: sbankModal.accessToken  // ❌ Query parameter
  }
})
```

**Бэкенд не видит token в headers → 401**

### Ошибка 404
**Причина:** Параметр `authorization: str = None` в функции не был помечен как `Header()`, поэтому FastAPI не передавал его в функцию.

**Было:**
```python
async def get_consent_details(
    consent_id: str,
    bank_id: str = None,
    authorization: str = None,  # ❌ Обычный query parameter
    session: Session = Depends(get_session)
):
```

**FastAPI не понимает что это header → не передает его → authorization = None**

## Решение

### 1. Frontend: Отправка токена через Authorization Header

**Исправлено:**
```javascript
// BanksPage.jsx - handleSbankApproval()
const checkResponse = await axios.get(
  `${API_URL}/api/consents/${consentLookupId}`,
  {
    headers: {
      'Authorization': `Bearer ${sbankModal.accessToken}`  // ✅ Header
    },
    params: {
      bank_id: sbankModal.bankId  // ✅ Query parameter
    }
  }
)
```

**Результат:** Token отправляется в заголовке, как ожидает бэкенд

### 2. Backend: Правильное объявление Header параметра

**Было:**
```python
from fastapi import APIRouter, HTTPException, status, Body, Depends

async def get_consent_details(
    consent_id: str,
    bank_id: str = None,
    authorization: str = None,  # ❌ Неправильно
    session: Session = Depends(get_session)
):
```

**Исправлено:**
```python
from fastapi import APIRouter, HTTPException, status, Body, Depends, Header

async def get_consent_details(
    consent_id: str,
    bank_id: str = None,
    authorization: Optional[str] = Header(None),  # ✅ Правильно
    session: Session = Depends(get_session)
):
```

**Результат:** FastAPI автоматически извлекает `Authorization` из заголовков

### 3. Backend: Логирование для отладки

**Добавлено:**
```python
logger.info(f"🔍 GET_CONSENT DEBUG: Getting consent/request {consent_id}, bank={bank_id}, has_auth={bool(authorization)}")
```

**Результат:** Видим в логах был ли передан заголовок

## Поток запроса (Исправленный)

```
Frontend (BanksPage.jsx)
├── axios.get('/api/consents/req-12345')
├── headers: {Authorization: 'Bearer eyJ0eXAi...'}
├── params: {bank_id: 'sbank'}
└── ↓

Backend (auth.py: get_consent_details)
├── FastAPI распарсивает Authorization header
├── authorization = 'Bearer eyJ0eXAi...'
├── access_token = 'eyJ0eXAi...' (после обрезания 'Bearer ')
├── is_request_id = True (req- prefix)
├── Вызывает: bank_service.get_consent_id_by_request_id()
├── Bank API: GET /account-consents/request/req-12345
└── ↓

Response
├── {consent_id: 'consent-67890', status: 'approved'}
└── ↓

Frontend
├── Проверяет status: 'approved' ✅
├── localStorage.setItem('consentId', 'consent-67890')
└── navigate('/transactions')
```

## Файлы, измененные

### 1. backend/routes/auth.py
- **Строка 14:** Добавлен импорт `Header`
- **Строка 327:** Параметр `authorization: Optional[str] = Header(None)`
- **Строка 353:** Логирование с `has_auth` флагом

### 2. frontend/src/pages/BanksPage.jsx
- **Строка 110:** Headers с Authorization Bearer token
- **Строка 112:** bank_id в params (не в headers)

## Тестирование

### Вручную в браузере
1. Открыть DevTools → Network tab
2. Подключить SBank
3. Нажать "Я подтвердил"
4. Посмотреть запрос к `/api/consents/req-...`:
   - Headers должны содержать `Authorization: Bearer ...`
   - Query параметры: `?bank_id=sbank`
   - Response: 200 с `{consent_id: '...', status: 'approved'}`

### Через скрипт
```bash
./test_consent_lookup.sh
```

## Важные моменты

✅ **Правильное использование FastAPI параметров:**
- **Query parameter:** `param: str = None` или `param: str = Query(None)`
- **Path parameter:** `param: str` (в фигурных скобках URL)
- **Header parameter:** `param: str = Header(None)`
- **Body parameter:** `param: BodyModel` или с `Body(...)`

✅ **Authorization Header формат:**
- Всегда: `Authorization: Bearer <token>`
- Не: `Authorization: <token>`
- Не: `token: <token>`

✅ **Логирование для отладки:**
- Логируем что получили от клиента
- Логируем что отправили банку
- Логируем что пришло от банка

## Проверка

```bash
# После изменений
cd /Users/mac/Desktop/projects/Syntax/Syntax-main/frontend
npm run build  # ✅ Should succeed

# Проверить что Header импортирован
grep "from fastapi import" backend/routes/auth.py | head -1
# Output: from fastapi import APIRouter, HTTPException, status, Body, Depends, Header
```

## Результат

✅ Frontend отправляет Authorization header
✅ Backend корректно его получает
✅ SBank flow работает как ожидается
✅ Ошибки 401 и 404 устранены
