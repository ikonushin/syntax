# Receipts Feature Documentation

## Overview

The Receipts screen is a comprehensive system for creating, managing, and exporting tax receipts ("чеки") directly to Russian tax service ("Мой налог"). Users can create receipts from selected transactions with automatic tax calculation.

## Feature Breakdown

### 1. Receipt Creation Form (`screen === 'receipt_create'`)

#### Auto-filled Transaction Summary
- Displays all selected transactions from Transactions screen
- Shows: Date, Sender name, Amount
- Calculates and displays total amount

#### Form Fields
```
- Услуга (Service) - TEXT INPUT [REQUIRED]
  * User describes the service provided
  * Examples: "Консультация", "Разработка API", "Дизайн сайта"

- Имя клиента (Client Name) - TEXT INPUT [OPTIONAL]
  * Name of the client who made the payment
  * Can be left blank

- Тип клиента (Client Type) - DROPDOWN [REQUIRED]
  * Individual (Физ. лицо) - 4% tax
  * Company (Юр. лицо) - 6% tax
```

#### Tax Calculation
```javascript
// Function: calculateTax(amount, clientType)
const taxRate = clientType === 'individual' ? 0.04 : 0.06
const taxAmount = Math.round(amount * taxRate * 100) / 100
```

**Example:**
- Amount: 8,500 ₽
- Client Type: Company (6%)
- Tax: 8,500 × 0.06 = 510 ₽
- Total with tax: 9,010 ₽

#### Action Buttons
```
Primary Button: "Отправить в Мой налог" (#FFD700)
  → Creates receipt with status: 'sent'
  → Shows toast: "Чек успешно отправлен в Мой налог"

Secondary Button: "Сохранить как черновик" (outline)
  → Creates receipt with status: 'draft'
  → Shows toast: "Чек сохранён как черновик"

Back Button: "← Назад"
  → Returns to Transactions screen
```

### 2. Receipts List View (`screen === 'receipts'`)

#### Main Table Columns
```
| Дата | Услуга | Клиент | Сумма (₽) | Налог (₽) | Статус | Действия |
|------|--------|--------|-----------|-----------|--------|----------|
```

#### Status Badge Styling
```
Status: 'sent'   → Green background (#E8F5E9), text: #2E7D32 → "Отправлен"
Status: 'draft'  → Orange background (#FFF3E0), text: #E65100 → "Черновик"
Status: 'failed' → Red background (#FFEBEE), text: #C62828 → "Ошибка отправки"
```

#### Filter Buttons
```
Все (X)           → Show all receipts
Отправлены (X)    → Filter by status: 'sent'
Черновики (X)     → Filter by status: 'draft'
```
Each button shows count of receipts in that category.

#### Export Button
```
"📊 Экспорт отчёта" → Triggers exportToCSV()
  * Downloads file: receipts-YYYY-MM-DD.csv
  * Columns: Date, Receipt ID, Service, Client, Client Type, Amount, Tax, Status
  * Quote-wrapped fields for Excel compatibility
  * Shows success toast
```

#### Create New Receipt Button
```
"+ Создать чек" → Navigates to Transactions screen
  (to select transactions first)
```

### 3. Receipt Expansion

#### Click Behavior
- Click any row to expand/collapse details
- Smooth animation (`expandIn` keyframes)
- Max-height: 500px, transition opacity and max-height

#### Expanded Details
```
Detail Item Layout (3-column grid, responsive):
├── Услуга: [service description]
├── Клиент: [client name]
├── Тип клиента: [Individual/Company]
└── ID чека: [unique receipt ID]
```

#### Action Buttons (By Status)

**Draft Status:**
```
- "Отправить" → sendReceiptToTaxService(receipt.id)
- "Удалить" → deleteReceipt(receipt.id)
```

**Sent Status:**
```
- "Отправить повторно" → sendReceiptToTaxService(receipt.id)
```

**Failed Status:**
```
- "Повторить" → sendReceiptToTaxService(receipt.id)
```

### 4. Receipt Data Structure

```javascript
{
  id: 'CHK-1731148400000',           // Unique receipt ID
  date: '2025-11-09',                // Creation date (YYYY-MM-DD)
  service: 'Консультация',           // Service description
  clientName: 'Иван Петров',         // Client name
  clientType: 'individual',          // 'individual' or 'company'
  totalAmount: 5000,                 // Total amount in rubles
  taxAmount: 200,                    // Tax amount (calculated)
  status: 'draft',                   // 'draft', 'sent', or 'failed'
  transactions: [...],               // Array of selected transactions
  createdAt: Date                    // Timestamp
}
```

## State Management

### React State Variables

```javascript
// Receipt form state
const [receiptForm, setReceiptForm] = useState({
  service: '',
  clientName: '',
  clientType: 'individual'
})

// Receipt management
const [receipts, setReceipts] = useState([])
const [expandedReceiptId, setExpandedReceiptId] = useState(null)
const [filterStatus, setFilterStatus] = useState('all') // 'all', 'sent', 'draft', 'failed'

// Notifications
const [toast, setToast] = useState(null)
const [sendingReceipt, setSendingReceipt] = useState(false)
```

### State Transitions

```
User Flow:
1. Transactions Screen (selected transactions stored in selectedTransactions Set)
2. Click "Создать чек" → startReceipt() → setScreen('receipt_create')
3. Fill form → handleCreateReceiptForm()
4. Submit → Create receipt object → setReceipts([newReceipt, ...receipts])
5. Navigate → setScreen('receipts')
6. View/Filter receipts → setFilterStatus()
7. Click row → setExpandedReceiptId(id)
8. Click action button → sendReceiptToTaxService() / deleteReceipt()
9. Show toast notification → setToast({ message, type })
```

## Key Functions

### `showToast(message, type = 'success')`
```javascript
Displays temporary notification (auto-dismiss after 3s)
Types: 'success' (green), 'error' (red), 'warning' (orange)
Example: showToast('Чек успешно отправлен', 'success')
```

### `calculateTax(amount, clientType)`
```javascript
Returns: Tax amount based on client type
- Individual: amount * 0.04
- Company: amount * 0.06
Rounded to 2 decimal places
```

### `getTotalAmount()`
```javascript
Returns: Sum of all selected transaction amounts
Used to populate the Summary box
```

### `handleCreateReceiptForm(e)`
```javascript
Validates:
- service field is not empty
- At least 1 transaction selected

Creates receipt object:
- Generates unique ID: CHK-{timestamp}
- Sets status based on button clicked
- Stores transaction references
- Resets form
- Updates receipts list
- Shows success toast
```

### `sendReceiptToTaxService(receiptId)`
```javascript
Simulates API call to tax service (2-second delay)
Updates receipt status from 'draft' to 'sent'
Shows success/error toast
Could be replaced with real API call later
```

### `deleteReceipt(receiptId)`
```javascript
Removes receipt from receipts array
Shows success toast
Only available for draft receipts
```

### `exportToCSV()`
```javascript
Generates CSV data from all receipts
Creates downloadable .csv file
Filename: receipts-YYYY-MM-DD.csv
Fields: Date, Receipt ID, Service, Client, Type, Amount, Tax, Status
Quote-wrapped for Excel compatibility
Shows success toast
```

### `getFilteredReceipts()`
```javascript
Returns filtered receipts based on filterStatus
- 'all': returns all receipts
- 'sent': returns receipts with status === 'sent'
- 'draft': returns receipts with status === 'draft'
Used in rendering the table
```

## Styling (Receipts.css)

### Layout Components

```css
.receipts-wrapper
  ├── .receipts-header
  │   ├── h2 (Title: "ЧЕКИ")
  │   └── p (Subtitle)
  │
  ├── .receipt-form-container (for receipt_create screen)
  │   ├── .receipt-form-title
  │   ├── .selected-transactions-summary
  │   ├── form fields (grid, responsive)
  │   ├── .tax-calculation (3-column display)
  │   └── .receipt-form-buttons
  │
  └── .receipts-list-container (for receipts screen)
      ├── .receipts-toolbar
      │   ├── .receipts-toolbar-left (buttons & filters)
      │   └── .receipts-toolbar-right (export button)
      ├── .receipts-table
      │   ├── thead (column headers)
      │   └── tbody > tr/Fragment (receipt rows)
      ├── .receipt-expanded (expand animation)
      └── .receipts-empty (no results state)
```

### Responsive Breakpoints

```css
Desktop:   > 1000px
Tablet:    768px - 1000px (2-col grid)
Mobile:    480px - 768px (single col)
Small:     < 480px (stacked layout)

Key Changes:
- Form labels stack vertically on mobile
- Table becomes card-style on mobile
- Export button moves to new line on tablet
- Toast notifications repositioned for mobile
```

### Color Scheme

```
Background:     #FFFFFF
Text:           #1A2233
Accent:         #FFD700
Hover:          #FFF9E0
Border:         #E0E0E0
Status - Sent:  #E8F5E9 (text: #2E7D32)
Status - Draft: #FFF3E0 (text: #E65100)
Status - Error: #FFEBEE (text: #C62828)
```

## User Workflows

### Workflow 1: Create Receipt from Transactions

```
1. User on Transactions screen
2. Select 1+ transactions with checkboxes
3. Click "Создать чек" button
4. Routed to receipt_create screen
5. Form auto-fills selected transactions summary
6. User fills form:
   - Service (required)
   - Client name (optional)
   - Client type (affects tax rate)
7. Tax auto-calculates based on type
8. User clicks "Отправить в Мой налог" or "Сохранить как черновик"
9. Receipt created with unique ID
10. Toast notification shows result
11. Screen navigates to receipts list
12. New receipt visible in table with appropriate status
```

### Workflow 2: Manage Draft Receipt

```
1. User on Receipts screen
2. Sees draft receipt in table
3. Clicks row to expand
4. Sees full details (service, client, ID)
5. Clicks "Отправить" button
6. Receipt status updates to 'sent'
7. Toast shows success
8. Row collapses (status badge changes color)
9. User can click row again to expand and see "Отправить повторно" button
```

### Workflow 3: Export Receipts Report

```
1. User on Receipts screen
2. (Optional) Filter by status using filter buttons
3. Clicks "📊 Экспорт отчёта" button
4. Browser downloads file: receipts-2025-11-09.csv
5. Toast shows "Отчёт экспортирован"
6. User opens CSV in Excel
   - All receipts with full data
   - Proper formatting with quotes
   - Russian column names
```

### Workflow 4: Resend Failed Receipt

```
1. User sees receipt with status 'failed'
2. Clicks row to expand
3. Clicks "Повторить" button
4. Loading state shown ("⏳ Отправка...")
5. Receipt status updates to 'sent'
6. Toast confirms success
7. Button changes to "Отправить повторно"
```

## Empty States

### No Receipts
```
Icon: 📭
Title: "Чеков ещё нет. Создайте первый чек из транзакций!"
CTA Button: "+ Создать первый чек" → go to Transactions
```

### No Receipts in Current Filter
```
Title: "Отправленных чеков не найдено" (if sent filter)
       OR "Черновиков не найдено" (if draft filter)
No CTA button (user can change filter)
```

## Error Handling

### Form Validation
```javascript
if (!receiptForm.service.trim()) {
  showToast('Укажите услугу', 'error')
  return
}

if (selectedTxs.length === 0) {
  showToast('Выберите транзакции', 'error')
  return
}
```

### Export Errors
```javascript
if (receipts.length === 0) {
  showToast('Нет чеков для экспорта', 'warning')
  return
}
```

### API Failures
```javascript
try {
  await sendReceiptToTaxService(receiptId)
} catch (error) {
  showToast('Ошибка при отправке чека', 'error')
  setReceipts(receipts.map(r => 
    r.id === receiptId ? { ...r, status: 'failed' } : r
  ))
}
```

## Future Enhancements

1. **Real API Integration**
   - Replace `sendReceiptToTaxService()` with real "Мой налог" API calls
   - Store receipts in backend database
   - Add authentication tokens

2. **Advanced Filtering**
   - Date range filter
   - Amount range filter
   - Client name search

3. **Receipt Editing**
   - Edit receipt details before sending
   - Modify tax rate
   - Add/remove transactions

4. **Batch Operations**
   - Select multiple receipts and send all at once
   - Delete multiple drafts
   - Export selected receipts only

5. **Analytics**
   - Receipt statistics dashboard
   - Monthly tax report
   - Client statistics

6. **Webhooks**
   - Real-time status updates from "Мой налог"
   - Automatic retry on failure

7. **Attachments**
   - Upload supporting documents
   - Attach invoices to receipts
   - Receipt image preview

## Navigation Map

```
Login Screen
    ↓
Bank Selection
    ↓
Transactions Screen
    ├─ Select transactions
    └─ Click "Создать чек"
        ↓
    Receipt Create Form
        ├─ Fill form
        └─ Submit
            ↓
        Receipts List View
            ├─ View receipts
            ├─ Filter receipts
            ├─ Expand for details
            ├─ Send/Delete receipt
            ├─ Export CSV
            └─ Click "+ Создать чек" (back to Transactions)
```

## Testing Checklist

- [x] Create receipt form displays selected transactions
- [x] Tax calculates correctly (4% for individual, 6% for company)
- [x] Form validation prevents empty service
- [x] Receipt created with unique ID
- [x] Receipt appears in list after creation
- [x] Filter buttons work (All/Sent/Draft)
- [x] Row expands to show details
- [x] Expand/collapse animation smooth
- [x] Action buttons appear based on status
- [x] Send receipt updates status
- [x] Delete receipt removes from list
- [x] CSV export generates correct file
- [x] Toast notifications display correctly
- [x] Responsive design on mobile/tablet
- [x] Empty state displays when no receipts

## Accessibility Notes

- Form labels properly associated with inputs
- Buttons have clear labels and disabled states
- Status badges use color + text
- Toast notifications have auto-dismiss with timeout
- Expandable rows use semantic HTML (tr/td)
- Keyboard navigation supported via tabindex
