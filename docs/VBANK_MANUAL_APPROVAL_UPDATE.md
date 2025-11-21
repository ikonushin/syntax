# 🔄 VBank Manual Approval Update

**Date:** 2025-11-20  
**Status:** ✅ COMPLETE  
**Author:** AI Assistant

---

## Summary

Vbank теперь требует ручного подтверждения согласий по аналогии с Sbank. Только Abank остается с автоподтверждением.

**Changes:**
- VBank: `auto_approved: false` (was `true`)
- SBank: `auto_approved: false` (no change)
- ABank: `auto_approved: true` (no change)

---

## Backend Changes

### 1. `/backend/services/bank_service.py`

**Line ~87:** Updated `create_consent()` method:

```python
# Before:
auto_approved = self.bank_name in ["abank", "vbank"]

# After:
auto_approved = self.bank_name in ["abank"]
```

**Impact:** VBank now sends `auto_approved: false` to bank API, requiring manual approval.

**Changes:**
- Updated docstring to reflect VBank/SBank manual approval
- Line 81: Flow documentation updated
- Line 87: BankService returns `{consent_id, request_id, status: "pending"}` for VBank

### 2. `/backend/routes/auth.py`

**Description:** Updated endpoint documentation and logic

**Changes:**
- Line 150: Updated `@router.post` description
- Lines 152-180: Updated docstring to show VBank as manual approval
- Line 318: Comment updated from "Manual approval needed (SBank)" to "Manual approval needed (SBank/VBank)"
- Line 326: Comment updated from "Auto-approved (VBank, ABank)" to "Auto-approved (ABank)"

### 3. `/backend/models/consent.py`

**Description:** Updated model documentation

**Changes:**
- Line 13: Updated docstring
  - "SBank manual approval" → "SBank/VBank manual approval"
  - "VBank/ABank: pending → authorized (auto-approved)" → "ABank: pending → authorized (auto-approved)"
  - "SBank: pending → awaitingAuthorization → authorized" → "SBank/VBank: pending → awaitingAuthorization → authorized"
- Line 44: Updated request_id description
  - "SBank manual approval flow" → "SBank/VBank manual approval flow"
- Line 53: Updated redirect_uri description
  - "SBank manual approval" → "SBank/VBank manual approval"

---

## Frontend Changes

### 1. `/frontend/src/App.jsx`

**Changes:**
- Line 213: Updated comment "Auto-approval (VBank, ABank)" → "Auto-approval (ABank)"
- Line 271: Updated comment "Manual approval (SBank)" → "Manual approval (SBank/VBank)"

### 2. `/frontend/src/pages/BanksPage.jsx`

**Changes:**
- Line 22: Comment updated "For SBank approval flow" → "For SBank/VBank approval flow"
- Line 54: Condition updated `if (bankId === 'sbank' ...)` → `if ((bankId === 'sbank' || bankId === 'vbank') ...)`
- Line 56: Comment updated
- Line 73: Log message updated to use `bankId.toUpperCase()`
- Line 77: Log message updated to use `bankId.toUpperCase()`
- Line 80: Comment updated "VBank/ABank auto-approval" → "ABank auto-approval"
- Line 237: Modal title and description updated to use `bankId.toUpperCase()`
- Line 248: Link text updated to use `bankId.toUpperCase()`

### 3. `/frontend/src/pages/TransactionsPage.jsx`

**Changes:**
- Line 379: Condition updated `if (bankId === 'sbank' ...)` → `if ((bankId === 'sbank' || bankId === 'vbank') ...)`
- Line 380: Comment and log updated

---

## Documentation Updates

### 1. `/README.md`

**Changes:**
- Lines 58-68: Updated API examples
  - VBank now listed as "manual approval" (moved from position 1)
  - Added ABank as position 3 with "auto-approved"
  - Updated order and descriptions
- Line 130: Updated consent management description
  - "VBank, ABank: Immediately approved" → "ABank: Immediately approved"
  - "SBank: Manual approval" → "VBank, SBank: Manual approval"

### 2. `/backend/scripts/test_bank_selection.sh`

**Changes:**
- Line 22: Updated comment "Testing VBank (Auto-approve)" → "Testing VBank (Manual approval)"
- Line 23: Updated status check from "authorized" to "awaitingAuthorization"
- Line 25: Updated log message

### 3. `/backend/scripts/test_consents_demo.sh`

**Changes:**
- Line 16: Updated section title "Testing VBank Consent (Auto-Approved)" → "Testing VBank Consent (Manual Approval)"
- Line 22: Updated log message "(background polling started)"
- Line 76: Updated summary line

### 4. `/docs/CONSENTS_FIX_SUMMARY.md`

**Changes:**
- Updated consent flow table
- Updated test descriptions and responses
- Updated flow descriptions
- Updated technical changes section

---

## Testing Checklist

### Backend Tests
- [ ] VBank consent returns `status: "pending"` with `redirect_url`
- [ ] SBank consent returns `status: "pending"` with `redirect_url`
- [ ] ABank consent returns `status: "success"` with `consent_id`
- [ ] Run `/backend/scripts/test_consents_demo.sh`
- [ ] Run `/backend/scripts/test_bank_selection.sh`

### Frontend Tests
- [ ] VBank connection opens redirect URL in new tab
- [ ] SBank connection opens redirect URL in new tab
- [ ] ABank connection shows auto-approval success message
- [ ] Test with all three banks on BanksPage
- [ ] Test with all three banks on TransactionsPage

### Integration Tests
- [ ] Complete flow: VBank selection → manual approval → consent approval
- [ ] Complete flow: SBank selection → manual approval → consent approval
- [ ] Complete flow: ABank selection → auto-approval → transactions
- [ ] Modal displays correctly for VBank/SBank
- [ ] Polling works when user confirms approval

---

## Behavioral Changes

### User Experience

#### Before (VBank Auto-Approval)
1. User selects VBank
2. Shows success message immediately
3. Redirects to transactions in 2 seconds

#### After (VBank Manual Approval)
1. User selects VBank
2. Shows "Redirecting to bank for approval..."
3. Opens VBank approval page in new tab
4. User manually approves in bank interface
5. Returns to app (approval modal displayed)
6. Proceeds to transactions after confirmation

### API Behavior

**VBank /account-consents/request payload:**

Before:
```json
{
  "auto_approved": true
}
```

After:
```json
{
  "auto_approved": false
}
```

**VBank Response:**

Before: `{status: "success", consent_id: "..."}`  
After: `{status: "pending", consent_id: "...", redirect_url: "..."}`

---

## Rollback Instructions

If needed to revert:

1. **Backend:** In `bank_service.py` line 87, change back to:
   ```python
   auto_approved = self.bank_name in ["abank", "vbank"]
   ```

2. **Frontend:** Revert all BanksPage.jsx and TransactionsPage.jsx changes from manual approval conditions

3. **Docs:** Update documentation to reflect original state

---

## References

- Open Banking API Specification: https://sbank.open.bankingapi.ru/docs
- Current Implementation: `/backend/services/bank_service.py`
- Frontend Logic: `/frontend/src/pages/BanksPage.jsx`
- Test Scripts: `/backend/scripts/test_*.sh`

