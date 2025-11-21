# Transactions Screen - Visual Reference & Quick Guide

## 🎯 User Flow

```
┌─────────────────────────────────────────────────┐
│  Bank Selection Screen                          │
│  [Select 1-2 Banks] → [Получить согласие]    │
└────────────────┬────────────────────────────────┘
                 │
                 ▼ (Success)
┌─────────────────────────────────────────────────┐
│  Transactions Screen                            │
├─────────────────────────────────────────────────┤
│  [← Back]  Транзакции (20)  [🔍 Filters]       │ ◄─ Desktop: Shows filter bar
├─────────────────────────────────────────────────┤ ◄─ Mobile: Shows search icon
│  ┌─────────────────────────────────────────┐   │
│  │ [Filter Bar - Desktop Only]             │   │
│  │ Bank | Контрагент | Min | Max | Dates  │   │
│  └─────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│  ┌──────────────────────────────────┐           │
│  │ ☐ Transaction 1                  │ ◄─ Clickable card/checkbox
│  │   📅 10.11.2024 💰 +5000 руб    │   Gold accent when selected
│  │   АО "Company A" | ВБанк         │
│  └──────────────────────────────────┘           │
│  ┌──────────────────────────────────┐           │
│  │ ☐ Transaction 2                  │           │
│  │   📅 09.11.2024 💰 -3000 руб    │           │
│  │   ООО "Company B" | АБанк        │           │
│  └──────────────────────────────────┘           │
│  ┌──────────────────────────────────┐           │
│  │ ☐ Transaction 3                  │           │
│  │   📅 08.11.2024 💰 +12000 руб   │           │
│  │   ИП "Company C" | СБанк         │           │
│  └──────────────────────────────────┘           │
├─────────────────────────────────────────────────┤
│ [Выбрано 2 транзакций]  [Создать чек]          │ ◄─ Fixed action bar
└─────────────────────────────────────────────────┘
```

## 📱 Mobile Filter Sheet

```
┌──────────────────────────────┐
│ ///////  OVERLAY  /////////  │ ◄─ Semi-transparent background (z: 99)
├──────────────────────────────┤
│ ≡≡≡ (Drag handle)            │
│                              │
│ 🔍 ФИЛЬТРЫ                   │
│                              │
│ □ Банк          [Dropdown ▼] │
│ □ Контрагент    [Text Input] │
│ □ От суммы      [0 ───────]  │
│ □ До суммы      [999999 ──]  │
│ □ С даты        [Date Picker]│
│ □ По дату       [Date Picker]│
│                              │
│ [Применить]                  │ ◄─ Closes on click
└──────────────────────────────┘ ◄─ Bottom sheet (z: 100)
```

## 🎨 Color Reference

### Primary Colors
```
#FFD700 - Gold Accent (Highlights, accents, selected states)
#1A2233 - Dark Navy (Primary text, backgrounds, action bar)
#FFFFFF - White (Main background, card backgrounds)
```

### Semantic Colors
```
#10B981 - Green (Positive amounts, success states)
#DC2626 - Red (Negative amounts, error states)
#D1D5DB - Gray (Borders, disabled states, dividers)
#FFFAEB - Light Beige (Selected card background gradient)
```

### Usage Examples
```css
/* Gold accents */
color: #FFD700;                /* Gold text */
border-color: #FFD700;         /* Gold borders */
background-color: #FFD700;     /* Gold buttons */

/* Navy for text/backgrounds */
color: #1A2233;                /* Dark text */
background-color: #1A2233;     /* Action bar */

/* Amount styling */
color: #10B981;                /* Green for positive */
color: #DC2626;                /* Red for negative */
```

## 📐 Responsive Breakpoints

### Desktop (1024px and above)
```
┌──────────────────────────────────────────────────┐
│ [← Back] Транзакции (20)                     [🔍]│
├──────────────────────────────────────────────────┤
│ Bank | Контрагент | Min $ | Max $ | С даты | По │
├──────────────────────────────────────────────────┤
│ [Full width transaction cards in flex layout]    │
│ [Action bar at bottom if selected]               │
└──────────────────────────────────────────────────┘
```

### Tablet (768px - 1024px)
```
┌────────────────────────────────┐
│ [← Back] Транзакции (20)  [🔍] │
├────────────────────────────────┤
│ Bank | Контрагент | Amounts   │
│ [Dates filter group]           │
├────────────────────────────────┤
│ [Transaction cards]            │
├────────────────────────────────┤
│ [Action bar]                   │
└────────────────────────────────┘
```

### Mobile (480px - 768px)
```
┌───────────────────────────┐
│ [← Back] Транзакции [🔍] │
├───────────────────────────┤
│ [Transaction card 1]      │
│ [Transaction card 2]      │
│ [Transaction card 3]      │
│                           │
│ [Action bar - sticky]     │
└───────────────────────────┘

[Click 🔍 opens bottom sheet]
```

## ⚙️ State Management

### State Structure
```javascript
{
  // Transaction Selection (Set for O(1) performance)
  selectedTransactions: Set([id1, id2, ...]),
  
  // Filter UI
  showFilters: boolean,
  
  // Filter Values
  filters: {
    bank: '',              // "" | "vbank" | "abank" | "sbank"
    minAmount: '',         // Number string or empty
    maxAmount: '',         // Number string or empty
    startDate: '',         // YYYY-MM-DD or empty
    endDate: '',           // YYYY-MM-DD or empty
    counterparty: '',      // Search string or empty
    operationType: ''      // Reserved for future use
  },
  
  // Consent Management
  activeConsent: {...},
  consentSuccess: {...}
}
```

## 🎬 Interactions

### Transaction Selection
```
User Click on Card/Checkbox
        ↓
toggleTransactionSelection(txId)
        ↓
Set.add(txId) OR Set.delete(txId)
        ↓
Trigger re-render
        ↓
Card gets .selected class (gold accent)
Action bar appears if Set.size > 0
```

### Filter Application
```
User changes filter input
        ↓
setFilters({ ...filters, field: newValue })
        ↓
getFilteredTransactions() called
        ↓
Apply all active filters
        ↓
Return filtered array
        ↓
Show matching transactions only
```

### Mobile Filter Toggle
```
User clicks 🔍 icon
        ↓
setShowFilters(!showFilters)
        ↓
Bottom sheet slides up (animation)
Overlay appears (semi-transparent)
        ↓
User can adjust filters
        ↓
Click "Применить" or overlay
        ↓
setShowFilters(false)
        ↓
Bottom sheet slides down
Overlay fades out
```

## 🔧 CSS Classes Reference

### Main Containers
```css
.transactions-section          /* Main section wrapper */
.transactions-header           /* Header with filters and title */
.transactions-title-bar        /* Title and search icon row */
.transactions-cards            /* Cards container */
```

### Filter Bar (Desktop)
```css
.filter-bar-desktop            /* Main filter bar (hidden <768px) */
.filter-group                  /* Each filter group */
.filter-input                  /* Filter input fields */
.btn-clear-filters             /* Clear button */
.btn-filter-icon               /* Search icon button (mobile) */
```

### Filter Sheet (Mobile)
```css
.filter-sheet-mobile           /* Bottom sheet container */
.filter-sheet-mobile.active    /* When visible */
.filter-sheet-mobile-overlay   /* Backdrop overlay */
.filter-sheet-mobile-overlay.active
```

### Transaction Cards
```css
.transaction-card              /* Card container */
.transaction-card.selected     /* Selected state (gold accent) */
.transaction-checkbox          /* Checkbox styling */
.transaction-content           /* Content wrapper */
.transaction-row               /* Label + value pair */
.transaction-label             /* Field label */
.transaction-value             /* Field value */
.amount.positive                /* Green colored amount */
.amount.negative                /* Red colored amount */
```

### Action Bar
```css
.action-bar-fixed              /* Fixed position bar */
.action-bar-content            /* Content wrapper */
.selection-text                /* Selection counter */
.btn-create-check              /* Create check button */
```

## 📝 Typography Scale

```
12px: Filter labels, transaction labels (uppercase, weight 600)
13px: Filter inputs, transaction values (weight 400)
14px: Selection text, button labels (weight 600, uppercase)
```

## 🎯 Interactive States

### Normal State
```
Card: White background, 1px gray border
Checkbox: Empty, 1px gray border
Text: #1A2233 (dark text)
Amount: Green/Red based on value
```

### Hover State
```
Card: Expanded shadow, slight border expansion
Checkbox: 1px gold border
Button: 0.95 scale, darker background
```

### Selected State (Card)
```
Card: 2px gold border, #FFFAEB background gradient
Checkbox: Checked, 1px gold border, accent fill
Text: Remains #1A2233
Action Bar: Appears at bottom
```

### Focus State (Inputs)
```
Filter Input: 2px gold border, box-shadow with gold
Date Input: Calendar opens with blue highlights
Select: Dropdown shows with accent highlight
```

## 📊 Sample Data Structure

### Transaction Object
```javascript
{
  id: "tx_12345",
  date: "2024-11-10T14:30:00Z",
  amount: 5000,                    // Positive = income, negative = expense
  counterparty: "АО \"Company A\"",
  bank: "vbank",                   // "vbank" | "abank" | "sbank"
  operationType: "transfer",
  description: "Payment for services",
  status: "completed"              // "pending" | "completed" | "failed"
}
```

### Filtered Result
```javascript
// After applying filters:
// - Bank filter: "vbank"
// - Amount range: 1000 - 10000
// - Dates: 01.11.2024 - 30.11.2024

[
  {
    id: "tx_12345",
    date: "2024-11-10T14:30:00Z",
    amount: 5000,
    counterparty: "АО \"Company A\"",
    bank: "vbank",
    operationType: "transfer",
    description: "Payment for services",
    status: "completed"
  },
  // ... more matching transactions
]
```

## 🚀 Performance Notes

### Optimization Techniques Used
1. **Set-based Selection**: O(1) lookup for checking if transaction selected
2. **CSS-only Animations**: No JavaScript animations, pure CSS transitions
3. **Responsive Media Queries**: Single CSS file, no heavy JS libraries
4. **Efficient Filtering**: Single pass through array with multiple conditions
5. **Minimal Re-renders**: State updates only trigger necessary components

### Accessibility Considerations
- Touch targets: All >44x44px for mobile
- Keyboard navigation: Tab through all inputs and buttons
- Screen readers: Semantic HTML with proper labels
- Color contrast: WCAG AA compliant (4.5:1 minimum)
- Focus states: Visible outlines on all interactive elements

---

## Quick Implementation Checklist

When adding new features:

- [ ] Add state variables to `App.jsx`
- [ ] Add helper functions for business logic
- [ ] Update JSX to render new elements
- [ ] Add CSS classes to `App.css`
- [ ] Test on desktop (>768px)
- [ ] Test on tablet (768px)
- [ ] Test on mobile (<480px)
- [ ] Check keyboard navigation
- [ ] Verify color contrast
- [ ] Test with screen reader

---

*Generated: November 9, 2025*
*Last Updated: v1.0 (Complete Implementation)*
