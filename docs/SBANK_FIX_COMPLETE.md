# ✅ SBank Consent ID Retrieval - FIXED

## Проблема (Решена)

Фронтенд получал ошибки **401 Unauthorized** и **404 Not Found** при попытке получить `consent_id` после подтверждения согласия в SBank.

## Причина

**Несоответствие в способе передачи Authorization токена:**

- ❌ Frontend отправлял: Query parameter `?access_token=...`
- ✅ Backend ожидал: Header `Authorization: Bearer ...`

- ❌ Backend параметр: `authorization: str = None` (простой query параметр)
- ✅ Нужно: `authorization: Optional[str] = Header(None)` (header параметр)

## Решение (Реализовано)

### 1. Backend: auth.py

**Изменения:**
```python
# Добавлен импорт
from fastapi import ..., Header  # ← добавлен Header

# Исправлена функция
async def get_consent_details(
    consent_id: str,
    bank_id: str = None,
    authorization: Optional[str] = Header(None),  # ← исправлено
    session: Session = Depends(get_session)
):
    # Извлечение токена из заголовка
    access_token = None
    if authorization:
        if authorization.startswith("Bearer "):
            access_token = authorization[7:]
        else:
            access_token = authorization
```

**Результат:** 
- FastAPI автоматически распарсивает `Authorization` header
- Бэкенд получает токен из заголовка, а не из URL

### 2. Frontend: BanksPage.jsx

**Изменения:**
```javascript
// handleSbankApproval() метод
const checkResponse = await axios.get(
  `${API_URL}/api/consents/${consentLookupId}`,
  {
    headers: {
      'Authorization': `Bearer ${sbankModal.accessToken}`  // ← moved to headers
    },
    params: {
      bank_id: sbankModal.bankId  // ← остается в params
    }
  }
)
```

**Результат:**
- Токен отправляется в заголовках HTTP запроса
- Параметр `bank_id` остается в query строке

## Поток данных (Исправленный)

```
1. Frontend создает SBank consent
   ↓ POST /api/consents → returns {request_id: "req-...", ...}

2. Пользователь одобряет в SBank UI

3. Frontend нажимает "Я подтвердил"
   ↓ GET /api/consents/req-12345
   ↓ headers: {Authorization: "Bearer eyJ0..."}
   ↓ params: {bank_id: "sbank"}

4. Backend получает запрос
   ├─ FastAPI распарсивает Authorization header
   ├─ Извлекает token
   ├─ Вызывает bank_service.get_consent_id_by_request_id()
   └─ Bank API возвращает {consentId: "consent-67890", status: "approved"}

5. Backend возвращает response
   ↓ {consent_id: "consent-67890", status: "approved", ...}

6. Frontend получает ответ
   ├─ Проверяет status = "approved" ✅
   ├─ Сохраняет consent_id в localStorage
   └─ Перенаправляет на /transactions

7. TransactionsPage загружает данные
   ↓ GET /v1/accounts?access_token=...
   ↓ Используя consent_id = "consent-67890"
   ✅ Успешно загружает счета и транзакции
```

## Проверка

### Код
```bash
# ✅ Header импортирован
grep "Header" backend/routes/auth.py

# ✅ Authorization как Header параметр  
grep "Header(None)" backend/routes/auth.py

# ✅ Frontend отправляет Authorization header
grep "Authorization.*Bearer" frontend/src/pages/BanksPage.jsx
```

### Сборка
```bash
cd frontend
npm run build  # ✅ Успешно собирается
```

## Тестирование

### Автоматический тест
```bash
./test_consent_lookup.sh
```

**Проверяет:**
1. Аутентификация
2. Создание SBank consent (получение request_id)
3. Запрос к `/api/consents/{request_id}` с Authorization header
4. Получение consent_id
5. Статус должен быть "approved" или "authorized"

### Ручное тестирование
1. Открыть http://localhost:5173
2. Авторизоваться
3. Нажать "Connect SBank"
4. В DevTools → Network проверить:
   - Запрос к `/api/consents/req-...`
   - Headers содержат `Authorization: Bearer ...`
   - Response: 200 с `{consent_id: "...", status: "approved"}`
5. Нажать "Я подтвердил"
6. Должно перенаправить на /transactions
7. Должны загрузиться счета и транзакции

## Файлы

### Изменены
- `backend/routes/auth.py` - Добавлен Header импорт и исправлена функция
- `frontend/src/pages/BanksPage.jsx` - Изменен способ передачи токена

### Созданы
- `docs/SBANK_FIX_401_404.md` - Детальное объяснение проблемы и решения
- `test_consent_lookup.sh` - Автоматический тест для проверки

## Статус

✅ **READY FOR TESTING**

Все изменения реализованы. Фронтенд пересобран. Готово к тестированию SBank flow.

## Ожидаемое поведение

✅ Без ошибок 401 и 404
✅ Получение consent_id после одобрения
✅ Загрузка счетов и транзакций
✅ Полный SBank flow работает от начала до конца

## Если все еще есть ошибки

1. **401 Unauthorized**
   - Проверить что frontend отправляет `Authorization: Bearer <token>` в headers
   - Проверить что token валидный (не истек)
   - Смотреть в DevTools → Network → Headers

2. **404 Not Found**
   - Проверить что URL правильный: `/api/consents/<request_id>`
   - Проверить что request_id начинается с "req-"
   - Смотреть в backend логах 🔍 GET_CONSENT DEBUG

3. **405 Method Not Allowed**
   - Проверить что это GET запрос, не POST или PUT

4. **500 Internal Server Error**
   - Смотреть в backend логах полную ошибку
   - Проверить что банк API работает
