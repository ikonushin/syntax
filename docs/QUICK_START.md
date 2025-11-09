# 🚀 SYNTAX - Быстрый старт

**Последнее обновление:** 9 ноября 2025

---

## ⚡ За 60 секунд

### 1. Запуск

```bash
cd /Users/mac/Desktop/projects/Syntax/Syntax-main
docker-compose up --build -d
```

### 2. Откройте браузер

Откройте: **http://localhost:5173**

### 3. Вход

```
Team ID:  team286
API Key:  DQXtm3ql5qZP89C7EX21QpPeHc4YSvey
```

Нажмите **"Войти"** ✅

---

## 🎨 Дизайн

- **Фон:** Белый (#FFFFFF)
- **Акцент:** Золото (#FFD700)
- **Шрифт:** Oswald
- **Логотип:** СИНТАКСИС

---

## 📝 Учетные данные

| Параметр | Значение | Статус |
|----------|----------|--------|
| Team ID | `team286` | ✅ Рабочий |
| API Key | `DQXtm3ql5qZP89C7EX21QpPeHc4YSvey` | ✅ Рабочий |
| Base URL | `https://sbank.open.bankingapi.ru` | ✅ По умолчанию |

---

## 🧪 Тестирование

### Правильные данные:
```bash
curl -X POST http://localhost:8000/api/authenticate \
  -d '{"client_id":"team286","client_secret":"DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"}'
```
✅ **Ожидается:** HTTP 200 + JWT токен

### Неправильные данные:
```bash
curl -X POST http://localhost:8000/api/authenticate \
  -d '{"client_id":"invalid","client_secret":"wrong"}'
```
✅ **Ожидается:** HTTP 401 + сообщение об ошибке

---

## 📱 Сервисы

```
Backend:   http://localhost:8000
Frontend:  http://localhost:5173
Database:  localhost:5432 (PostgreSQL)
Docs:      http://localhost:8000/docs
```

---

## 🔧 Полезные команды

```bash
# Просмотр статуса
docker-compose ps

# Просмотр логов
docker-compose logs backend --tail=50
docker-compose logs frontend --tail=50

# Перезагрузка
docker-compose restart

# Остановка
docker-compose down

# Очистка и пересборка
docker-compose down
docker-compose up --build -d
```

---

## 📚 Документация

- `AUTHENTICATION_FINAL_REPORT.md` — Полный отчет
- `AUTHENTICATION_USER_GUIDE_v2.md` — Руководство пользователя
- `AUTHENTICATION_TECHNICAL_SPEC.md` — Техническая спецификация

---

## ⚠️ Если что-то не работает

1. **Страница не загружается:**
   ```bash
   docker-compose restart frontend
   curl -I http://localhost:5173
   ```

2. **Не можете войти:**
   ```bash
   docker-compose logs backend --tail=50 | grep -i "authenticate"
   ```

3. **Очистить кэш:**
   - Откройте DevTools (F12)
   - Storage → Clear All

4. **Полная переустановка:**
   ```bash
   docker-compose down
   docker-compose up --build -d
   ```

---

## ✅ Проверочный лист

- [ ] Запустил docker-compose
- [ ] Открыл http://localhost:5173
- [ ] Введи team286 и ключ
- [ ] Нажал "Войти"
- [ ] Вошел в систему ✅

**Готово!** 🎉

---

**Версия:** 2.1  
**Статус:** ✅ Готово к использованию
