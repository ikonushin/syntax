# Tax Payment Fix: Multi-Bank Account Selection

## Проблема
При выборе счёта для оплаты налога одновременно выбирались 2 банка, и возникала ошибка:
```
❌ Согласие не действительно или отозвано (403 Forbidden)
```

## Корень проблемы
1. Были загружены счета со всех банков в один массив
2. При отправке платежа передавался только `bank_name`, но не `consent_id`
3. На бэкэнде не было информации, какой `consent_id` использовать для конкретного счета
4. Использовался неправильный `consent_id` при попытке получить данные счета

## Решение

### Frontend (`frontend/src/pages/TaxPaymentsPage.jsx`)

1. **Сохранение consent_id с каждым счетом** (line ~116-118):
```jsx
// Add bank_name and consent_id to account for payment flow
account.bank_name = bankId
account.consent_id = consentId  // ← NEW: Store consent_id for later
```

2. **Передача consent_id при оплате** (line ~284-292):
```jsx
const handlePayTax = async () => {
  // ...
  const accountId = selectedAccount.accountId || selectedAccount.account_id
  const bankName = selectedAccount.bank_name
  const consentId = selectedAccount.consent_id  // ← NEW: Get consent_id from account

  const response = await axios.post(
    `${API_BASE_URL}/v1/tax-payments/${selectedTax.id}/pay`,
    {
      account_id: accountId,
      bank_name: bankName,
      consent_id: consentId,  // ← NEW: Send consent_id in request
      bank_token: accessToken
    },
    // ...
  )
}
```

### Backend (`backend/routes/tax_payments.py`)

1. **Обновление PayTaxRequest модели** (line ~54-58):
```python
class PayTaxRequest(BaseModel):
    """Request to pay specific tax."""
    account_id: str
    bank_name: str
    consent_id: Optional[str] = None  # ← NEW: Accept consent_id
    bank_token: str
```

2. **Использование переданного consent_id** (line ~280-296):
```python
# Check if consent_id was provided (from existing account consent)
account_consent_id = request.consent_id
if account_consent_id:
    logger.info(f"💳 PAYMENT: Using provided account consent: {account_consent_id}")
else:
    logger.warning(f"💳 PAYMENT: No consent_id provided...")

# Get account details to extract real account number (identification)
accounts_data = await bank_service.get_accounts(
    bank_token=bank_token,
    consent_id=account_consent_id  # ← NEW: Pass consent_id to get_accounts
)
```

## Результат

✅ Теперь при выборе счета для оплаты:
- Используется правильный `consent_id` из банка этого счета
- Данные счета получаются с использованием корректного согласия
- Ошибка 403 "Согласие не действительно" больше не появляется
- Платеж можно успешно отправить

## Проверка

1. Подключить несколько банков (ABank, VBank)
2. Перейти на страницу "Налоги"
3. Открыть модал оплаты налога
4. Выбрать счет
5. Проверить в логах бэкэнда: `💳 PAYMENT: Using provided account consent: consent-xxx`
6. Платеж должен обработаться успешно

## Файлы изменены

- `frontend/src/pages/TaxPaymentsPage.jsx` - сохранение и передача consent_id
- `backend/routes/tax_payments.py` - приём и использование consent_id
