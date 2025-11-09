import React, { useState } from 'react'
import axios from 'axios'
import './App.css'
import './Login.css'
import './BankSelection.css'
import './Transactions.css'
import './Receipts.css'
import syntaxLogo from './assets/syntax-logo.svg'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function App() {
  // Authentication state
  const [screen, setScreen] = useState('login') // 'login', 'user_bank', 'transactions', 'receipts', 'receipt_create'
  const [accessToken, setAccessToken] = useState(null)
  const [loginForm, setLoginForm] = useState({ 
    client_id: '', 
    client_secret: '',
    user_number: 1
  })
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)
  
  // User and bank selection
  const [selectedUserIndex, setSelectedUserIndex] = useState(null) // Index from 1-9
  const [selectedBank, setSelectedBank] = useState(null) // 'vbank', 'abank', 'sbank'
  const [pollingConsentId, setPollingConsentId] = useState(null)
  const [pollingActive, setPollingActive] = useState(false)
  const [consentError, setConsentError] = useState(null)
  const [consentSuccess, setConsentSuccess] = useState(null)
  const [consentLoading, setConsentLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState(null)
  
  // Transactions and receipts
  const [transactions, setTransactions] = useState([])
  const [selectedTransactions, setSelectedTransactions] = useState(new Set())
  const [receiptFlow, setReceiptFlow] = useState(null)
  const [currentReceipt, setCurrentReceipt] = useState(null)
  const [receiptItems, setReceiptItems] = useState([])
  const [receipts, setReceipts] = useState([])
  const [sendingReceipt, setSendingReceipt] = useState(false)
  const [toast, setToast] = useState(null)
  const [expandedReceiptId, setExpandedReceiptId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all') // 'all', 'sent', 'draft', 'failed'
  
  // Receipt form state
  const [receiptForm, setReceiptForm] = useState({
    service: '',
    clientName: '',
    clientType: 'individual' // 'individual' or 'company'
  })

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 2
    }).format(amount)
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true)
    setLoginError(null)

    // Логируем что отправляем
    const payload = {
      client_id: loginForm.client_id,
      client_secret: loginForm.client_secret,
      user_id: parseInt(loginForm.user_number) || 1
    };
    console.log("Отправляем на /api/authenticate:", JSON.stringify(payload, null, 2));

    try {
      const response = await axios.post(
        `${API_URL}/api/authenticate`,
        payload,
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
      
      console.log("Ответ от сервера:", response.status, response.data);
      
      if (response.data.access_token) {
        // Store JWT token in localStorage
        localStorage.setItem('auth_token', response.data.access_token)
        localStorage.setItem('token_type', response.data.token_type || 'bearer')
        
        setAccessToken(response.data.access_token)
        setScreen('user_bank')
        setLoginForm({ client_id: '', client_secret: '', user_number: 1 })
      }
    } catch (error) {
      console.error("Ошибка запроса:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      setLoginError(error.response?.data?.detail || "Ошибка соединения");
    } finally {
      setLoginLoading(false)
    }
  }

  // Polling function for SBank manual approval
  const pollConsentStatus = async (consentId, bankId, accessToken) => {
    console.log(`🔍 POLLING: Starting to poll consent ${consentId} on ${bankId}`)
    setPollingActive(true)
    
    const maxAttempts = 24 // 24 * 5s = 2 minutes max
    let attempts = 0
    
    const pollInterval = setInterval(async () => {
      attempts++
      
      if (attempts > maxAttempts) {
        console.log(`⏰ POLLING: Timeout after ${maxAttempts} attempts (2 minutes)`)
        clearInterval(pollInterval)
        setPollingActive(false)
        setConsentSuccess(null)
        setConsentError('Истекло время ожидания подписания согласия. Пожалуйста, попробуйте снова.')
        return
      }
      
      try {
        console.log(`🔍 POLLING: Attempt ${attempts}/${maxAttempts}`)
        
        const statusResponse = await axios.get(
          `${API_URL}/api/consents/${consentId}/status`,
          {
            params: {
              bank_id: bankId,
              access_token: accessToken
            }
          }
        )
        
        console.log(`🔍 POLLING: Status check response:`, statusResponse.data)
        
        const status = statusResponse.data.status
        
        // ✅ Consent authorized! User signed successfully
        if (status === 'authorized' || status === 'active' || status === 'success') {
          console.log(`✅ POLLING: Consent authorized! Proceeding to transactions...`)
          clearInterval(pollInterval)
          setPollingActive(false)
          setConsentSuccess(`✅ Согласие подписано! Загружаем ваши транзакции...`)
          
          // Wait 2 seconds then transition to transactions
          setTimeout(() => {
            setScreen('transactions')
            setTransactions([
              { id: 1, date: '2025-11-09', amount: 5000, description: 'Консультация' },
              { id: 2, date: '2025-11-08', amount: 3500, description: 'Проектирование' },
              { id: 3, date: '2025-11-07', amount: 2000, description: 'Тестирование' }
            ])
          }, 2000)
          
          return
        }
        
        // Still pending - keep polling
        if (status === 'pending' || status === 'awaitingAuthorization') {
          console.log(`⏳ POLLING: Still pending (attempt ${attempts}/${maxAttempts}), will retry in 5s...`)
        }
        
      } catch (error) {
        console.warn(`⚠️ POLLING: Error checking status (attempt ${attempts}):`, error.message)
        // Continue polling on error - backend might be temporarily unavailable
      }
    }, 5000) // Poll every 5 seconds
  }

  const handleCreateConsent = async () => {
    if (selectedUserIndex === null || !selectedBank) {
      setConsentError('Выберите пользователя и банк')
      return
    }
    setConsentLoading(true)
    setConsentError(null)
    setConsentSuccess(null)
    
    try {
      // Format user ID as "team-286-{userIndex}"
      const userId = `team-286-${selectedUserIndex}`
      
      console.log("🔍 CONSENT: Отправляем запрос на /api/consents:", {
        access_token: accessToken?.substring(0, 20) + "...",
        user_id: userId,
        bank_id: selectedBank
      })
      
      const response = await axios.post(`${API_URL}/api/consents`, {
        access_token: accessToken,
        user_id: userId,
        bank_id: selectedBank
      })
      
      console.log("🔍 CONSENT: Ответ от /api/consents:", response.data)
      
      // ============================================
      // СЛУЧАЙ 1: Auto-approval (VBank, ABank)
      // ============================================
      if (response.data.status === 'success' && response.data.consent_id) {
        console.log(`✅ CONSENT: Автоматическое одобрение! ID: ${response.data.consent_id}`)
        setConsentSuccess(`✅ Банк успешно подключён! (ID: ${response.data.consent_id})`)
        
        setTimeout(() => {
          setScreen('transactions')
          setTransactions([
            { 
              id: 1, 
              date: '2025-11-09', 
              amount: 5000, 
              description: 'оплата за консультацию',
              sender: 'Иван Петров'
            },
            { 
              id: 2, 
              date: '2025-11-08', 
              amount: 3500, 
              description: 'проектирование веб-сайта',
              sender: 'ООО Рога и Копыта'
            },
            { 
              id: 3, 
              date: '2025-11-07', 
              amount: 2000, 
              description: 'тестирование приложения',
              sender: 'Мария Смирнова'
            },
            { 
              id: 4, 
              date: '2025-11-06', 
              amount: 7500, 
              description: 'разработка API',
              sender: 'TechStart LLC'
            },
            { 
              id: 5, 
              date: '2025-11-05', 
              amount: 1200, 
              description: 'помощь в отладке кода',
              sender: 'Алексей Васильев'
            }
          ])
        }, 2000)
      } 
      // ============================================
      // СЛУЧАЙ 2: Manual approval (SBank)
      // ============================================
      else if (response.data.status === 'pending' && response.data.redirect_url) {
        console.log(`⏳ CONSENT: Ручное подписание требуется!`)
        console.log(`📋 Consent ID: ${response.data.consent_id}`)
        console.log(`📍 Редирект URL: ${response.data.redirect_url}`)
        
        // Store consent ID for polling
        setPollingConsentId(response.data.consent_id)
        
        // Start polling immediately
        await pollConsentStatus(response.data.consent_id, selectedBank, accessToken)
        
        // Show waiting message with redirect instructions
        setConsentSuccess(`⏳ Переводим вас в ЛК банка для подписания согласия...`)
        
        // Open redirect URL in new tab after 1 second (to show message first)
        setTimeout(() => {
          console.log(`🔗 CONSENT: Открываем в новой вкладке: ${response.data.redirect_url}`)
          
          // Open in new tab (not current tab)
          const newWindow = window.open(response.data.redirect_url, '_blank')
          
          // Notify user
          setConsentSuccess(`⏳ Окно подписания открыто в новой вкладке. Ожидаем вашей подписи...`)
          
          if (!newWindow) {
            console.warn("⚠️ CONSENT: Не удалось открыть новую вкладку. Используем текущую.")
            window.location.href = response.data.redirect_url
          }
        }, 1000)
      } 
      else {
        console.error("❌ CONSENT: Неожиданный ответ от сервера:", response.data)
        setConsentError(`Ошибка: ${response.data.error || 'Не удалось подключить банк'}`)
      }
    } catch (error) {
      console.error("❌ CONSENT: Ошибка при подключении банка:", error)
      setConsentError(error.response?.data?.detail || 'Ошибка при подключении банка')
    } finally {
      setConsentLoading(false)
    }
  }

  const toggleTransaction = (id) => {
    const newSet = new Set(selectedTransactions)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedTransactions(newSet)
  }

  const startReceipt = () => {
    if (selectedTransactions.size === 0) return
    setReceiptForm({ service: '', clientName: '', clientType: 'individual' })
    setScreen('receipt_create')
  }

  const getItemsTotal = () => {
    return receiptItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)
  }

  const isValid = () => {
    return Math.abs(getItemsTotal() - (currentReceipt?.amount || 0)) < 0.01
  }

  const sendReceipt = async () => {
    if (!isValid()) {
      alert('Сумма не совпадает')
      return
    }
    setSendingReceipt(true)
    await new Promise(r => setTimeout(r, 1500))
    setReceipts([...receipts, {
      id: Date.now(),
      date: currentReceipt.date,
      amount: currentReceipt.amount,
      description: currentReceipt.description
    }])
    setReceiptFlow('success')
    setTimeout(() => {
      setReceiptFlow(null)
      setSelectedTransactions(new Set())
    }, 2000)
    setSendingReceipt(false)
  }

  // ============================================
  // RECEIPTS MANAGEMENT FUNCTIONS
  // ============================================

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const calculateTax = (amount, clientType) => {
    const rate = clientType === 'individual' ? 0.04 : 0.06
    return Math.round(amount * rate * 100) / 100
  }

  const getTotalAmount = () => {
    return Array.from(selectedTransactions).reduce((sum, txId) => {
      const tx = transactions.find(t => t.id === txId)
      return sum + (tx?.amount || 0)
    }, 0)
  }

  const handleCreateReceiptForm = async (e) => {
    e.preventDefault()
    
    if (!receiptForm.service.trim()) {
      showToast('Укажите услугу', 'error')
      return
    }

    const selectedTxs = Array.from(selectedTransactions)
      .map(id => transactions.find(t => t.id === id))
      .filter(Boolean)

    if (selectedTxs.length === 0) {
      showToast('Выберите транзакции', 'error')
      return
    }

    const totalAmount = getTotalAmount()
    const taxAmount = calculateTax(totalAmount, receiptForm.clientType)
    const receiptId = `CHK-${Date.now()}`

    const newReceipt = {
      id: receiptId,
      date: new Date().toISOString().split('T')[0],
      service: receiptForm.service,
      clientName: receiptForm.clientName || 'Не указано',
      clientType: receiptForm.clientType,
      totalAmount,
      taxAmount,
      status: 'draft',
      transactions: selectedTxs,
      createdAt: new Date()
    }

    setReceipts([newReceipt, ...receipts])
    showToast('Чек сохранён как черновик', 'success')
    
    // Reset form
    setReceiptForm({ service: '', clientName: '', clientType: 'individual' })
    setSelectedTransactions(new Set())
    setScreen('receipts')
  }

  const sendReceiptToTaxService = async (receiptId) => {
    const receipt = receipts.find(r => r.id === receiptId)
    if (!receipt) return

    setSendingReceipt(true)
    try {
      // Simulate API call to tax service
      await new Promise(r => setTimeout(r, 2000))
      
      const updatedReceipts = receipts.map(r => 
        r.id === receiptId ? { ...r, status: 'sent' } : r
      )
      setReceipts(updatedReceipts)
      showToast('Чек успешно отправлен в Мой налог', 'success')
    } catch (error) {
      showToast('Ошибка при отправке чека', 'error')
      const updatedReceipts = receipts.map(r => 
        r.id === receiptId ? { ...r, status: 'failed' } : r
      )
      setReceipts(updatedReceipts)
    } finally {
      setSendingReceipt(false)
    }
  }

  const deleteReceipt = (receiptId) => {
    setReceipts(receipts.filter(r => r.id !== receiptId))
    showToast('Чек удалён', 'success')
  }

  const exportToCSV = () => {
    if (receipts.length === 0) {
      showToast('Нет чеков для экспорта', 'warning')
      return
    }

    const headers = ['Дата', 'ID чека', 'Услуга', 'Клиент', 'Тип клиента', 'Сумма (₽)', 'Налог (₽)', 'Статус']
    const rows = receipts.map(r => [
      r.date,
      r.id,
      r.service,
      r.clientName,
      r.clientType === 'individual' ? 'Физ. лицо' : 'Юр. лицо',
      r.totalAmount.toFixed(2),
      r.taxAmount.toFixed(2),
      r.status === 'sent' ? 'Отправлен' : r.status === 'draft' ? 'Черновик' : 'Ошибка'
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `receipts-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    showToast('Отчёт экспортирован', 'success')
  }

  const getFilteredReceipts = () => {
    if (filterStatus === 'all') return receipts
    return receipts.filter(r => r.status === filterStatus)
  }

  // LOGIN SCREEN - MODERN TAILWIND DESIGN
  if (screen === 'login') {
    return (
      <div className="login-wrapper">
        <div className="login-container">
          {/* Header */}
          <div className="login-header">
            <div className="logo-container">
              <img src={syntaxLogo} alt="SYNTAX Logo" />
            </div>
            <h1 className="login-title">SYNTAX</h1>
            <p className="login-subtitle">Автоматизация самозанятости</p>
          </div>

          {/* Login Card */}
          <div className="login-card">
            <form className="login-form" onSubmit={handleLogin}>
              {/* Client ID Input */}
              <div className="form-group">
                <label className="form-label">Team ID</label>
                <input
                  type="text"
                  placeholder="e.g., team286"
                  value={loginForm.client_id}
                  onChange={(e) => setLoginForm({ ...loginForm, client_id: e.target.value })}
                  disabled={loginLoading}
                  className="form-input"
                  required
                />
              </div>

              {/* Client Secret Input */}
              <div className="form-group">
                <label className="form-label">API Ключ</label>
                <input
                  type="password"
                  placeholder="Ваш секретный ключ"
                  value={loginForm.client_secret}
                  onChange={(e) => setLoginForm({ ...loginForm, client_secret: e.target.value })}
                  disabled={loginLoading}
                  className="form-input"
                  required
                />
              </div>

              {/* Error Message */}
              {loginError && (
                <div className="error-container">
                  <span className="error-icon">⚠️</span>
                  <div className="error-text">{loginError}</div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loginLoading}
                className="btn-submit"
              >
                {loginLoading ? (
                  <>
                    <div className="spinner"></div>
                    <span>Проверка...</span>
                  </>
                ) : (
                  'Войти'
                )}
              </button>

              {/* Help Text */}
              <div className="help-section">
                <p className="help-text">
                  Используйте учетные данные OpenBanking Russia для доступа к системе
                </p>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="login-footer">
            <p className="footer-text">
              <span className="footer-icon">🔒</span>
              Данные передаются в защищенном виде
            </p>
          </div>
        </div>
      </div>
    )
  }

  // USER & BANK SELECTION SCREEN
  if (screen === 'user_bank') {
    const banksList = [
      { id: 'vbank', name: 'VBANK', icon: '🏦', description: 'Виртуальный банк' },
      { id: 'abank', name: 'ABANK', icon: '💳', description: 'Альтернативный банк' },
      { id: 'sbank', name: 'SBANK', icon: '🏧', description: 'Системный банк' }
    ]

    return (
      <div className="bank-selection-wrapper">
        {/* Header */}
        <div className="bank-selection-header">
          <h1>SYNTAX</h1>
          <p>Выбор пользователя и банка</p>
        </div>

        {/* Main Content */}
        <div className="bank-selection-content">
          
          {/* User Selection Section */}
          <div className="user-selection-section">
            <h2 className="section-title">Выберите пользователя</h2>
            <div className="users-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  className={`user-button ${selectedUserIndex === num ? 'active' : ''}`}
                  onClick={() => setSelectedUserIndex(num)}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Bank Selection Section */}
          <div className="bank-selection-section">
            <h2 className="section-title">Выберите банк для подключения</h2>
            <div className="banks-grid">
              {banksList.map(bank => (
                <div
                  key={bank.id}
                  className={`bank-card ${selectedBank === bank.id ? 'active' : ''}`}
                  onClick={() => setSelectedBank(bank.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedBank(bank.id)
                    }
                  }}
                >
                  <div className="bank-icon">{bank.icon}</div>
                  <h3 className="bank-name">{bank.name}</h3>
                  <p className="bank-description">{bank.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {consentError && (
            <div className="error-message">
              ⚠️ {consentError}
            </div>
          )}

          {/* Success Message */}
          {consentSuccess && (
            <div className="success-message">
              ✓ {consentSuccess}
            </div>
          )}

          {/* Action Button */}
          <div className="action-button-container">
            <button
              onClick={handleCreateConsent}
              className={`submit-button ${consentLoading ? 'loading' : ''}`}
              disabled={selectedUserIndex === null || !selectedBank || consentLoading}
            >
              {consentLoading ? 'Подключение...' : 'Подключить'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // TRANSACTIONS SCREEN
  if (screen === 'transactions') {
    const sortedTransactions = [...transactions].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    )
    
    return (
      <div className="transactions-wrapper">
        {/* Header */}
        <div className="transactions-header">
          <h1>ТРАНЗАКЦИИ</h1>
          <p>Выберите платежи для создания чеков</p>
        </div>

        {/* Main Content */}
        <div className="transactions-content">
          {sortedTransactions.length === 0 ? (
            <div className="transactions-empty">
              <div className="transactions-empty-icon">📋</div>
              <h2>Нет транзакций</h2>
              <p>После подключения банка здесь появятся входящие платежи</p>
            </div>
          ) : (
            <div>
              {sortedTransactions.map(tx => (
                <div
                  key={tx.id}
                  className={`transaction-item ${selectedTransactions.has(tx.id) ? 'selected' : ''}`}
                  onClick={() => toggleTransaction(tx.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedTransactions.has(tx.id)}
                    onChange={() => toggleTransaction(tx.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="transaction-content">
                    <div className="transaction-date">{tx.date}</div>
                    <div className="transaction-sender">
                      {tx.sender || 'Отправитель не указан'}
                    </div>
                    {tx.description && (
                      <div className="transaction-description">{tx.description}</div>
                    )}
                  </div>
                  <div className="transaction-amount">
                    {formatAmount(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky Bottom Bar */}
        <div className={`transactions-sticky-bar ${selectedTransactions.size === 0 ? 'hidden' : ''}`}>
          <div className="selection-info">
            Выбрано <span className="count">{selectedTransactions.size}</span> транзакци{
              selectedTransactions.size === 1 ? 'я' :
              selectedTransactions.size % 10 === 2 || selectedTransactions.size % 10 === 3 || selectedTransactions.size % 10 === 4 ? 'и' :
              'й'
            }
          </div>
          <button
            className="btn-create-receipt"
            onClick={startReceipt}
            disabled={selectedTransactions.size === 0}
          >
            Создать чек
          </button>
        </div>
      </div>
    )
  }

  // RECEIPT CREATE SCREEN
  if (screen === 'receipt_create') {
    const totalAmount = getTotalAmount()
    const taxAmount = calculateTax(totalAmount, receiptForm.clientType)

    return (
      <div className="receipts-wrapper">
        {/* Header */}
        <div className="receipts-header">
          <h2>СОЗДАНИЕ ЧЕК</h2>
          <p>Заполните информацию для чека</p>
        </div>

        {/* Form Container */}
        <div className="receipt-form-container">
          <div className="receipt-form-title">📋 Информация о чеке</div>

          {/* Selected Transactions Summary */}
          <div className="selected-transactions-summary">
            <div className="summary-title">Выбранные транзакции</div>
            <div className="selected-transactions-list">
              {Array.from(selectedTransactions)
                .map(id => transactions.find(t => t.id === id))
                .filter(Boolean)
                .map(tx => (
                  <div key={tx.id} className="selected-tx-item">
                    <div className="selected-tx-left">
                      <div className="selected-tx-date">{tx.date}</div>
                      <div className="selected-tx-sender">{tx.sender}</div>
                    </div>
                    <div className="selected-tx-amount">{formatAmount(tx.amount)}</div>
                  </div>
                ))}
            </div>
            <div className="total-row">
              <div className="total-row-label">Всего:</div>
              <div className="total-row-value">{formatAmount(totalAmount)}</div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleCreateReceiptForm}>
            {/* Service */}
            <div className="form-group">
              <label>Услуга *</label>
              <input
                type="text"
                value={receiptForm.service}
                onChange={(e) => setReceiptForm({...receiptForm, service: e.target.value})}
                placeholder="Консультация, разработка, дизайн..."
                required
              />
            </div>

            {/* Two Column Layout */}
            <div className="form-row">
              <div className="form-group">
                <label>Имя клиента</label>
                <input
                  type="text"
                  value={receiptForm.clientName}
                  onChange={(e) => setReceiptForm({...receiptForm, clientName: e.target.value})}
                  placeholder="Иван Петров"
                />
              </div>

              <div className="form-group">
                <label>Тип клиента</label>
                <select
                  value={receiptForm.clientType}
                  onChange={(e) => setReceiptForm({...receiptForm, clientType: e.target.value})}
                >
                  <option value="individual">Физ. лицо (4%)</option>
                  <option value="company">Юр. лицо (6%)</option>
                </select>
              </div>
            </div>

            {/* Tax Calculation */}
            <div className="tax-calculation">
              <div className="tax-calc-item">
                <div className="tax-calc-label">Сумма</div>
                <div className="tax-calc-value">{formatAmount(totalAmount)}</div>
              </div>
              <div className="tax-calc-item">
                <div className="tax-calc-label">Налог</div>
                <div className="tax-calc-value accent">{formatAmount(taxAmount)}</div>
              </div>
              <div className="tax-calc-item">
                <div className="tax-calc-label">Итого</div>
                <div className="tax-calc-value">{formatAmount(totalAmount + taxAmount)}</div>
              </div>
            </div>

            {/* Buttons */}
            <div className="receipt-form-buttons">
              <button
                type="button"
                className="btn-back"
                onClick={() => setScreen('transactions')}
              >
                ← Назад
              </button>
              <button
                type="button"
                className="btn-draft"
                onClick={handleCreateReceiptForm}
              >
                Сохранить как черновик
              </button>
              <button
                type="submit"
                className="btn-submit"
              >
                Отправить в Мой налог
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // RECEIPTS LIST SCREEN
  if (screen === 'receipts') {
    const filteredReceipts = getFilteredReceipts()

    return (
      <div className="receipts-wrapper">
        {/* Header */}
        <div className="receipts-header">
          <h2>ЧЕ КИ</h2>
          <p>Управление чеками и отправка в Мой налог</p>
        </div>

        {/* Toolbar */}
        <div className="receipts-list-container">
          <div className="receipts-toolbar">
            <div className="receipts-toolbar-left">
              <button className="btn-new-receipt" onClick={() => setScreen('transactions')}>
                + Создать чек
              </button>
              <div className="receipts-filter">
                <button
                  className={`filter-button ${filterStatus === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('all')}
                >
                  Все ({receipts.length})
                </button>
                <button
                  className={`filter-button ${filterStatus === 'sent' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('sent')}
                >
                  Отправлены ({receipts.filter(r => r.status === 'sent').length})
                </button>
                <button
                  className={`filter-button ${filterStatus === 'draft' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('draft')}
                >
                  Черновики ({receipts.filter(r => r.status === 'draft').length})
                </button>
              </div>
            </div>
            <div className="receipts-toolbar-right">
              <button className="btn-export" onClick={exportToCSV}>
                📊 Экспорт отчёта
              </button>
            </div>
          </div>

          {/* Receipts Table/List */}
          {filteredReceipts.length === 0 ? (
            <div className="receipts-empty">
              <div className="receipts-empty-icon">📭</div>
              <div className="receipts-empty-text">
                {filterStatus === 'all' 
                  ? 'Чеков ещё нет. Создайте первый чек из транзакций!'
                  : filterStatus === 'sent'
                  ? 'Отправленных чеков не найдено'
                  : 'Черновиков не найдено'}
              </div>
              {filterStatus === 'all' && (
                <button className="btn-new-receipt" onClick={() => setScreen('transactions')}>
                  + Создать первый чек
                </button>
              )}
            </div>
          ) : (
            <div>
              <table className="receipts-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Услуга</th>
                    <th>Клиент</th>
                    <th style={{textAlign: 'right'}}>Сумма</th>
                    <th style={{textAlign: 'right'}}>Налог</th>
                    <th>Статус</th>
                    <th style={{textAlign: 'center'}}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceipts.map(receipt => (
                    <React.Fragment key={receipt.id}>
                      <tr onClick={() => setExpandedReceiptId(expandedReceiptId === receipt.id ? null : receipt.id)}>
                        <td>{receipt.date}</td>
                        <td>{receipt.service}</td>
                        <td>{receipt.clientName}</td>
                        <td style={{textAlign: 'right'}} className="receipt-amount">
                          {formatAmount(receipt.totalAmount)}
                        </td>
                        <td style={{textAlign: 'right'}} className="receipt-tax">
                          {formatAmount(receipt.taxAmount)}
                        </td>
                        <td>
                          <span className={`receipt-status status-${receipt.status}`}>
                            {receipt.status === 'sent' ? 'Отправлен' : 
                             receipt.status === 'draft' ? 'Черновик' : 'Ошибка'}
                          </span>
                        </td>
                        <td style={{textAlign: 'center'}}>
                          <button
                            className="receipt-actions"
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedReceiptId(expandedReceiptId === receipt.id ? null : receipt.id)
                            }}
                          >
                            ▼
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Details */}
                      {expandedReceiptId === receipt.id && (
                        <tr>
                          <td colSpan="7" style={{padding: 0, border: 'none'}}>
                            <div className="receipt-expanded">
                              <div className="expanded-details">
                                <div className="detail-item">
                                  <div className="detail-label">Услуга</div>
                                  <div className="detail-value">{receipt.service}</div>
                                </div>
                                <div className="detail-item">
                                  <div className="detail-label">Клиент</div>
                                  <div className="detail-value">{receipt.clientName}</div>
                                </div>
                                <div className="detail-item">
                                  <div className="detail-label">Тип клиента</div>
                                  <div className="detail-value">
                                    {receipt.clientType === 'individual' ? 'Физ. лицо' : 'Юр. лицо'}
                                  </div>
                                </div>
                                <div className="detail-item">
                                  <div className="detail-label">ID чека</div>
                                  <div className="detail-value">{receipt.id}</div>
                                </div>
                              </div>

                              {/* Expanded Buttons */}
                              <div className="expanded-buttons">
                                {receipt.status === 'draft' && (
                                  <>
                                    <button
                                      className="btn-resend"
                                      onClick={() => sendReceiptToTaxService(receipt.id)}
                                      disabled={sendingReceipt}
                                    >
                                      {sendingReceipt ? '⏳ Отправка...' : 'Отправить'}
                                    </button>
                                    <button
                                      className="btn-delete"
                                      onClick={() => deleteReceipt(receipt.id)}
                                    >
                                      Удалить
                                    </button>
                                  </>
                                )}
                                {receipt.status === 'sent' && (
                                  <button
                                    className="btn-resend"
                                    onClick={() => sendReceiptToTaxService(receipt.id)}
                                    disabled={sendingReceipt}
                                  >
                                    {sendingReceipt ? '⏳ Отправка...' : 'Отправить повторно'}
                                  </button>
                                )}
                                {receipt.status === 'failed' && (
                                  <button
                                    className="btn-resend"
                                    onClick={() => sendReceiptToTaxService(receipt.id)}
                                    disabled={sendingReceipt}
                                  >
                                    {sendingReceipt ? '⏳ Отправка...' : 'Повторить'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Toast Notifications */}
        {toast && (
          <div className={`toast ${toast.type}`}>
            {toast.message}
          </div>
        )}
      </div>
    )
  }

  return null
}

export default App
