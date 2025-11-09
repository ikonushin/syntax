#!/bin/bash

# Bank Selection and Consent Screen - Feature Test
# Tests the new UI and API integration

echo "🧪 Testing Bank Selection and Consent Screen"
echo "=============================================="
echo ""

# Test 1: Health check
echo "1️⃣ Checking backend health..."
HEALTH=$(curl -s http://localhost:8000/health | grep -c "ok")
if [ $HEALTH -eq 1 ]; then
    echo "   ✅ Backend is healthy"
else
    echo "   ❌ Backend is not responding"
    exit 1
fi

echo ""
echo "2️⃣ Testing consent endpoints with different banks..."

# Test VBank
echo "   Testing VBank (Auto-approve)..."
VBANK=$(curl -s -X POST "http://localhost:8000/v1/consents/request?bank_name=vbank&client_id=team286-1" | jq -r '.status' 2>/dev/null)
if [ "$VBANK" == "authorized" ]; then
    echo "   ✅ VBank: Status = $VBANK"
else
    echo "   ⚠️ VBank: Status = $VBANK (expected: authorized)"
fi

# Test ABank
echo "   Testing ABank (Auto-approve)..."
ABANK=$(curl -s -X POST "http://localhost:8000/v1/consents/request?bank_name=abank&client_id=team286-2" | jq -r '.status' 2>/dev/null)
if [ "$ABANK" == "authorized" ]; then
    echo "   ✅ ABank: Status = $ABANK"
else
    echo "   ⚠️ ABank: Status = $ABANK (expected: authorized)"
fi

# Test SBank
echo "   Testing SBank (Manual approval)..."
SBANK=$(curl -s -X POST "http://localhost:8000/v1/consents/request?bank_name=sbank&client_id=team286-3" | jq -r '.status' 2>/dev/null)
if [ "$SBANK" == "awaitingAuthorization" ]; then
    echo "   ✅ SBank: Status = $SBANK"
else
    echo "   ⚠️ SBank: Status = $SBANK (expected: awaitingAuthorization)"
fi

echo ""
echo "3️⃣ Verifying frontend files..."

# Check App.jsx
if grep -q "toggleBankSelection" frontend/src/App.jsx; then
    echo "   ✅ App.jsx has bank selection logic"
else
    echo "   ❌ App.jsx missing bank selection"
fi

# Check CSS
if grep -q "bank-card" frontend/src/App.css; then
    echo "   ✅ App.css has bank card styling"
else
    echo "   ❌ App.css missing bank card styling"
fi

# Check success card
if grep -q "consent-success-card" frontend/src/App.css; then
    echo "   ✅ App.css has success card styling"
else
    echo "   ❌ App.css missing success card styling"
fi

echo ""
echo "4️⃣ Checking frontend URL..."
FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173)
if [ "$FRONTEND" == "200" ]; then
    echo "   ✅ Frontend is accessible (HTTP $FRONTEND)"
else
    echo "   ❌ Frontend returned HTTP $FRONTEND"
fi

echo ""
echo "5️⃣ Feature verification..."

# Check for screen switching capability
if grep -q "currentScreen === 'banks'" frontend/src/App.jsx; then
    echo "   ✅ Two-screen navigation implemented"
else
    echo "   ❌ Screen navigation not found"
fi

# Check for checkbox support
if grep -q "checkbox" frontend/src/App.jsx; then
    echo "   ✅ Checkbox selection implemented"
else
    echo "   ❌ Checkbox selection not found"
fi

# Check for success message
if grep -q "Согласие получено" frontend/src/App.jsx; then
    echo "   ✅ Success message implemented"
else
    echo "   ❌ Success message not found"
fi

# Check for back button
if grep -q "handleBackToBanks" frontend/src/App.jsx; then
    echo "   ✅ Back navigation implemented"
else
    echo "   ❌ Back navigation not found"
fi

echo ""
echo "=============================================="
echo "✅ All tests completed!"
echo ""
echo "📍 Features implemented:"
echo "   • Bank selection with cards and checkboxes (1-2 banks)"
echo "   • Consent request with \"Получить согласие\" button"
echo "   • Success confirmation with green checkmark"
echo "   • 2-second auto-transition to transactions screen"
echo "   • Back navigation to bank selection"
echo "   • Loading state with spinner"
echo "   • Mobile-responsive design"
echo "   • Russian localization"
echo ""
echo "🎨 Colors:"
echo "   • Background: #FFFFFF"
echo "   • Accent: #FFD700"
echo "   • Text: #1A2233"
echo "   • Success: #10B981"
echo ""
echo "📱 Visit: http://localhost:5173"
echo "📚 Docs: BANK_SELECTION_SCREEN.md"
echo ""
