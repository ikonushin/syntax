# 🎯 Bank Selection Screen - Quick Test Guide

**Project:** SYNTAX Multi-Banking MVP  
**Date:** November 9, 2025  
**Component:** Bank Selection Screen (`/user_bank`)  

---

## ✅ Pre-Flight Checklist

Before testing, ensure:

```bash
# 1. All containers running
docker compose ps
# Expected: 3 containers healthy (backend, frontend, db)

# 2. Frontend hot-reload working
# Open browser console - should see updates

# 3. Backend healthy
curl http://localhost:8000/health
# Expected: {"status":"ok"}

# 4. CORS enabled
curl -X OPTIONS http://localhost:8000/api/authenticate
# Expected: 200 OK with CORS headers
```

---

## 🚀 Quick Test Flow (3 minutes)

### Step 1: Navigate to Bank Selection
1. Open browser at `http://localhost:5173`
2. Login with credentials:
   - Team ID: `team286`
   - API Key: `DQXtm3ql5qZP89C7EX21QpPeHc4YSvey`
3. Expected: See new SYNTAX bank selection screen

### Step 2: Test User Selection
1. Click button **"5"**
   - ✅ Should highlight in gold (#FFD700)
   - ✅ Should lift up on hover
2. Click button **"3"**
   - ✅ Button 5 should unhighlight
   - ✅ Button 3 should highlight
   - ✅ Only one button active at a time
3. Hover over button "1"
   - ✅ Should show gold border
   - ✅ Should lift slightly (-3px transform)

### Step 3: Test Bank Selection
1. Click **VBANK** card (🏦)
   - ✅ Gold border appears
   - ✅ Slight glow effect
   - ✅ Card scales slightly
2. Click **ABANK** card (💳)
   - ✅ VBANK loses highlight
   - ✅ ABANK gains gold border
3. Hover over **SBANK** card
   - ✅ Scales up (~1.02x)
   - ✅ Shows shadow effect
   - ✅ Cursor pointer

### Step 4: Test Button States
1. Start: "Подключить" button should be **disabled** (gray, no-pointer cursor)
2. Select user 5, don't select bank
   - ✅ Button still disabled
3. Select ABANK bank
   - ✅ Button now **enabled** (gold color, cursor pointer)
4. Hover over button
   - ✅ Slight lift effect, stronger shadow
5. Click button
   - ✅ Text changes to "Подключение..."
   - ✅ Spinner animation appears
   - ✅ Button becomes disabled (loading state)

### Step 5: Test Success Path
1. From Step 4 with user 5 + ABANK selected, click "Подключить"
2. Wait for response (~1-2 seconds)
3. Expected:
   - ✅ Green success box appears: "Банк успешно подключён!"
   - ✅ "Подключение..." button changes back to "Подключить"
   - ✅ After 2 seconds, auto-navigate to transactions screen
   - ✅ Transactions page shows sample data

### Step 6: Test Console Logging
1. Open Browser DevTools: `F12` or `Cmd+Option+I`
2. Go to **Console** tab
3. Go back to login (`Cmd+R` refresh)
4. Login again, see:
   - ✅ "Отправляем на /api/authenticate: {...}"
   - ✅ "Ответ от сервера: 200"
5. Select user + bank, click connect
6. See in console:
   - ✅ "Отправляем запрос на /api/consents: {...}"
   - ✅ "Ответ от /api/consents: {...}"

---

## 🎨 Visual Checklist

**Page Layout:**
- [ ] Title "SYNTAX" visible in header
- [ ] Subtitle "Выбор пользователя и банка" below title
- [ ] White background (#FFFFFF)
- [ ] Good spacing (not cramped)

**User Buttons:**
- [ ] 9 buttons numbered 1-9
- [ ] Each button 60px × 60px (desktop)
- [ ] Arranged in responsive grid
- [ ] Light gray border by default
- [ ] Gold (#FFD700) border + background when active

**Bank Cards:**
- [ ] 3 cards visible (VBANK, ABANK, SBANK)
- [ ] Each has emoji icon (🏦 💳 🏧)
- [ ] Each has bank name below icon
- [ ] Each has small description text
- [ ] Good spacing between cards (20px gap)
- [ ] Arrange in 3-column grid on desktop

**Connect Button:**
- [ ] Large, centered button
- [ ] Gold gradient background by default
- [ ] Text "Подключить" (not "Создать согласие")
- [ ] Text all caps, Oswald font
- [ ] Disabled (gray) until both selections made
- [ ] Hover shows lift effect and stronger shadow

**Animations:**
- [ ] Page fades in on load (0.6s)
- [ ] Header slides down (0.5s)
- [ ] Content scales in with delay (0.6s)
- [ ] Button hover has smooth transition
- [ ] Loading spinner rotates smoothly
- [ ] Success/error messages animate in

---

## 🔍 Browser Console Output (Expected)

### On Login:
```
Отправляем на /api/authenticate: {
  client_id: "team286"
  client_secret: "DQXtm3ql5qZP89C7EX21QpPeHc4YSvey"
  user_id: 1
}

Ответ от сервера: 200
{
  access_token: "eyJhbGciOiJIUzI1NiIs..."
  token_type: "bearer"
  expires_in: 86400
  bank_token_expires_in: 86400
}
```

### On Bank Connection:
```
Отправляем запрос на /api/consents: {
  access_token: "eyJhbGciOiJIUzI1NiIs..."
  user_id: "team-286-5"
  bank_id: "abank"
}

Ответ от /api/consents: {
  status: "success"
  consent_id: "abc123..."
}
```

---

## 📱 Responsive Testing

### Desktop (1200px)
- [ ] 3-column bank grid
- [ ] User buttons 60px
- [ ] Full width layout feels balanced
- [ ] No horizontal scroll

### Tablet (768px)
- [ ] Banks still arranged well (might compress to 2 cols)
- [ ] User buttons responsive
- [ ] Padding appropriate

### Mobile (375px)
- [ ] Banks stack in single column
- [ ] User buttons smaller (50px) but still clickable
- [ ] Layout not cramped
- [ ] Text readable
- [ ] No overflow

---

## 🐛 Troubleshooting

### Issue: Button click doesn't work
**Check:**
- Is frontend hot-reloading? (Check Vite logs)
- Open DevTools Console - any errors?
- Try hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

### Issue: "Подключить" button always disabled
**Check:**
- Are both user and bank selected? (Visual check - should show gold)
- Browser console: What's `selectedUserIndex` and `selectedBank` values?
- Try clicking different user and bank combo

### Issue: Success message doesn't appear
**Check:**
- Open DevTools Network tab
- Click "Подключить" 
- Look for POST request to `/api/consents`
- Check response status (should be 200)
- Check response body for `status: "success"`

### Issue: Page doesn't fade in
**Check:**
- Browser console - any CSS errors?
- Verify `BankSelection.css` is imported in App.jsx
- Check CSS file exists: `/frontend/src/BankSelection.css`

### Issue: Gold color not showing
**Check:**
- Verify CSS: Search for `#FFD700` in BankSelection.css
- Clear browser cache: DevTools → Settings → Network → "Disable cache"
- Check if system light/dark mode interfering

---

## ✨ Feature Verification

| Feature | Status | How to Test |
|---------|--------|------------|
| User buttons clickable | ✅ | Click 1-9, should highlight |
| Only one user active | ✅ | Click 3, then 5, only 5 stays gold |
| Bank cards clickable | ✅ | Click cards, should highlight |
| Only one bank active | ✅ | Click VBANK, then ABANK, only ABANK gold |
| Connect button disables | ✅ | Load page - button gray/disabled |
| Connect button enables | ✅ | Select both - button gold/enabled |
| Loading state | ✅ | Click connect - spinner appears |
| Success message | ✅ | Wait for response - green box |
| Auto-transition | ✅ | After success, navigate to transactions |
| Animations | ✅ | Watch page load - fade/slide/scale |
| Responsive | ✅ | Resize browser - layout adapts |
| Keyboard accessible | ✅ | Tab to bank cards, press Enter/Space |

---

## 📊 Performance Checklist

- [ ] Page loads in <1s
- [ ] No console errors (red text in DevTools)
- [ ] CSS loads correctly (no unstyled content flash)
- [ ] Animations are smooth (60fps, no jank)
- [ ] Button clicks respond instantly
- [ ] API request completes in <3s

---

## 🎯 Success Criteria

✅ **All tests pass** if:
1. User buttons 1-9 are clickable and only one stays selected
2. Bank cards show interactive hover states and only one stays selected
3. "Подключить" button enables only when both user and bank selected
4. Clicking "Подключить" sends proper API request
5. Success message appears and auto-redirects after 2s
6. All animations play smoothly
7. Design matches SYNTAX branding (Oswald, white, gold)
8. Layout is responsive on mobile/tablet/desktop
9. No console errors
10. Keyboard navigation works

---

## 📞 Support

**Found an issue?** 
1. Note the exact steps to reproduce
2. Take screenshot/video
3. Open browser DevTools Console
4. Share error message with full stack trace

**Questions?**
- Check `/frontend/src/BankSelection.css` for CSS details
- Check `/frontend/src/App.jsx` lines 290-356 for component logic
- Check `/backend/routes/auth.py` for API endpoint

---

**Happy testing! 🚀**

**Ready?** Start with **Quick Test Flow** section above!
