-- Таблица пользователей
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Таблица подключений банков
CREATE TABLE bank_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    bank_name TEXT NOT NULL,
    access_token TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Таблица транзакций
CREATE TABLE transactions (
    id UUID PRIMARY KEY,
    bank_id TEXT,
    account_id TEXT,
    txn_date TIMESTAMPTZ,
    amount NUMERIC,
    currency TEXT,
    description TEXT,
    counterparty TEXT,
    raw JSONB,
    status TEXT DEFAULT 'imported'
);

-- Таблица клиентов/контрагентов
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name TEXT NOT NULL
);

-- Таблица услуг
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name TEXT NOT NULL
);

-- Таблица чеков
CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES transactions(id),
    user_id UUID REFERENCES users(id),
    date TIMESTAMPTZ,
    amount NUMERIC,
    service TEXT,
    client_name TEXT,
    status TEXT DEFAULT 'draft',
    external_id TEXT,
    sent_at TIMESTAMPTZ,
    meta JSONB
);

-- Пример пользователя
INSERT INTO users (username, password_hash)
VALUES ('testuser', 'hashed_password_here');

-- Пример услуги
INSERT INTO services (user_id, name)
SELECT id, 'Консультация' FROM users WHERE username='testuser';

-- Пример клиента
INSERT INTO clients (user_id, name)
SELECT id, 'Иванов Иван' FROM users WHERE username='testuser';

-- Пример транзакций
INSERT INTO transactions (id, bank_id, txn_date, amount, currency, description, counterparty, raw)
VALUES
('tx_001', 'sandbox-bank-1', NOW(), 1500.00, 'RUB', 'Оплата от Иванов Иван', 'Иванов Иван', '{}'),
('tx_002', 'sandbox-bank-1', NOW(), 2300.50, 'RUB', 'Оплата от Петров Петр', 'Петров Петр', '{}');
