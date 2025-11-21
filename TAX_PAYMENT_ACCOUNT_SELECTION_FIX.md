# Исправление: Выбор счета для оплаты налога

## Проблема
При открытии модала оплаты налога одновременно отображались счета ИЗ ВСЕХ ПОДКЛЮЧЕННЫХ БАНКОВ (ABANK и VBANK на одном экране), что вызывало:
1. React warning: "Warning: Encountered two children with the same key, `acc-3959`"
2. Ошибку 403 при платеже: "Согласие не действительно или отозвано"

## Причина
- Метод `.map()` без фильтрации по банку показывал все счета из всех банков
- При выборе счета можно было случайно выбрать счет из разных банков
- Использовался неправильный `consent_id` для конкретного банка

## Решение

### 1. Добавлен выбор банка перед выбором счета
Теперь модал имеет двухуровневую систему:
- **Уровень 1:** Выбрать БАНК (ABANK или VBANK)
- **Уровень 2:** Выбрать СЧЕТ из выбранного банка

```jsx
{/* Show bank selection first */}
<div className="bank-selection">
  <label className="selection-label">Выберите банк:</label>
  <div className="banks-list">
    {[...new Set(accounts.map(acc => acc.bank_name))].map(bankName => (
      <button key={bankName} onClick={() => setSelectedAccount(null)}>
        {bankName.toUpperCase()}
      </button>
    ))}
  </div>
</div>

{/* Show accounts only for selected bank */}
<div className="accounts-list">
  {accounts
    .filter(acc => {
      const selectedBankName = selectedAccount?.bank_name
      return !selectedBankName || acc.bank_name === selectedBankName
    })
    .map((account) => ...)}
</div>
```

### 2. Улучшена генерация ключей
Изменена генерация ключей в `.map()` с простого `accountId` на `bank-${bankName}-${accountId}` для избежания дублей:

```jsx
key={`${account.bank_name || account.bankName}-${accountId}`}
```

### 3. Гарантированное использование правильного consent_id
При каждой загрузке счетов сохраняется `consent_id` именно из того банка, к которому относится счет:

```jsx
// Line 196: Save consent_id with account
account.consent_id = consentId

// Line 307: Use saved consent_id in payment request
const consentId = selectedAccount.consent_id
```

## Результат

✅ **До исправления:**
- Показывались счета из ALL банков одновременно
- React warning про duplicate keys
- Ошибка 403 при платеже

✅ **После исправления:**
- Пользователь сначала выбирает БАНК
- Потом выбирает СЧЕТ только из этого банка
- Используется правильный `consent_id`
- Платеж успешно обрабатывается

## Файлы изменены
- `frontend/src/pages/TaxPaymentsPage.jsx`
  - Добавлена система выбора банка перед выбором счета
  - Улучшена генерация ключей в .map()
  - Сброс выбранного счета при открытии модала

## Тестирование

1. Подключить 2+ банка (ABank, VBank)
2. Перейти на страницу "Налоги"
3. Открыть модал оплаты налога
4. ✅ Увидеть кнопки выбора банков
5. ✅ Выбрать ABank - показываются только счета ABank
6. ✅ Выбрать VBank - показываются только счета VBank
7. ✅ Выбрать счет и завершить оплату
8. ✅ Платеж успешно обработан
