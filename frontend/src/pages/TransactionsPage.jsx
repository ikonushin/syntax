import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Header } from '../components/Header'
import axios from 'axios'
import '../styles/TransactionsPage.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function TransactionsPage() {
  const navigate = useNavigate()
  const { logout, selectedBank, selectedUserIndex } = useAuth()
  
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [connectedBanks, setConnectedBanks] = useState([])
  
  // Settings for transaction display
  const [txSettings, setTxSettings] = useState({
    transactionLimit: 100, // Default limit (max 100 allowed by bank API)
    daysBack: 30 // Default to last 30 days
  })
  
  // Load real data on component mount
  useEffect(() => {
    loadRealData()
  }, [])
  
  const [selectedTransactions, setSelectedTransactions] = useState(new Set())
  const [showBankSettings, setShowBankSettings] = useState(false)
  const [showTxSettings, setShowTxSettings] = useState(false)
  const [toast, setToast] = useState(null)
  const [sbankModal, setSbankModal] = useState(null) // For SBank approval flow
  
  const [filters, setFilters] = useState({
    type: 'all', // 'all', 'income', 'expense'
    amountFrom: '',
    amountTo: '',
    search: '',
    dateFrom: '',
    dateTo: ''
  })

  // Load real data from API
  const loadRealData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const accessToken = localStorage.getItem('accessToken')
      const userId = selectedUserIndex ? `team286-${selectedUserIndex}` : 'team286'
      
      if (!accessToken) {
        throw new Error('Access token not found')
      }
      
      console.log(`TRANSACTIONS: Loading user consents for ${userId}`)
      
      // First, get list of user's active consents
      let userConsents = []
      try {
        const consentsResponse = await axios.get(`${API_URL}/api/user-consents`, {
          params: {
            user_id: userId,
            access_token: accessToken
          }
        })
        
        userConsents = consentsResponse.data.consents || []
        console.log(`TRANSACTIONS: Found ${userConsents.length} active consents:`, userConsents)
      } catch (err) {
        console.warn(`⚠️ TRANSACTIONS: Failed to get user consents:`, err)
        // If we can get consents from localStorage, use them
        const storedBank = localStorage.getItem('selectedBank')
        const storedConsent = localStorage.getItem('consentId')
        if (storedBank && storedConsent) {
          userConsents = [{
            bank_id: storedBank,
            bank_name: storedBank.toUpperCase(),
            consent_id: storedConsent,
            status: 'authorized'
          }]
        } else {
          throw err
        }
      }
      
      if (userConsents.length === 0) {
        console.warn(`⚠️ TRANSACTIONS: No active consents found`)
        showToast('Нет подключённых банков. Пожалуйста, подключите банк.', 'warning')
        setTimeout(() => navigate('/banks'), 2000)
        return
      }
      
      // Filter out pending consents (not yet approved)
      const approvedConsents = userConsents.filter(consent => {
        const isApproved = consent.status === 'approved' || consent.status === 'authorized' || consent.status === 'success'
        const isPending = consent.status === 'pending' || consent.status === 'awaitingAuthorization'
        
        if (isPending) {
          console.warn(`⚠️ TRANSACTIONS: Skipping ${consent.bank_id} - consent status is ${consent.status}`)
        }
        
        return isApproved
      })
      
      if (approvedConsents.length === 0) {
        console.warn(`⚠️ TRANSACTIONS: No approved consents found`)
        // Only show warning if there are pending consents
        if (userConsents.some(c => c.status === 'pending' || c.status === 'awaitingAuthorization')) {
          showToast('Некоторые согласия требуют подтверждения. Пожалуйста, подтвердите на странице Банки.', 'warning')
          setTimeout(() => navigate('/banks'), 2000)
        }
        return
      }
      
      // Bank icon mapping
      const bankIcons = {
        'abank': '💳',
        'sbank': '🏛️',
        'vbank': '🏦'
      }
      
      // Create connected banks list from APPROVED consents only
      const updatedBanks = approvedConsents.map(consent => ({
        id: consent.bank_id,
        name: consent.bank_name || consent.bank_id.toUpperCase(),
        icon: bankIcons[consent.bank_id] || '🏦',
        status: 'active',
        transactionsCount: 0,
        visible: true,
        consentId: consent.consent_id
      }))
      
      let allTransactions = []
      
      // For each approved consent, get accounts and transactions
      for (const consent of approvedConsents) {
        try {
          const bankId = consent.bank_id
          const consentId = consent.consent_id
          
          console.log(`TRANSACTIONS: Loading data for ${bankId}...`)
          
          // Get accounts
          let accountIds = []
          try {
            const accountsResponse = await axios.get(`${API_URL}/v1/accounts`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'consent_id': consentId,
                'X-Bank-Name': bankId,
                'client_id': userId
              }
            })
            
            accountIds = accountsResponse.data.accounts?.map(acc => acc.id || acc.accountId || acc.account) || []
            console.log(`TRANSACTIONS: Found ${accountIds.length} accounts in ${bankId}`)
          } catch (err) {
            console.error(`TRANSACTIONS: Failed to get accounts from ${bankId}:`, err)
            continue
          }
          
          // Get transactions for each account
          for (const accountId of accountIds) {
            try {
              const today = new Date()
              const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
              
              const dateFrom = lastMonth.toISOString().split('T')[0]
              const dateTo = today.toISOString().split('T')[0]
              
              console.log(`TRANSACTIONS: Fetching from ${bankId} account ${accountId}`)
              
              const txResponse = await axios.get(`${API_URL}/v1/transactions`, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'consent_id': consentId,
                  'X-Bank-Name': bankId,
                  'client_id': userId,
                  'accountId': accountId
                },
                params: {
                  from_date: dateFrom,
                  to_date: dateTo,
                  limit: txSettings.transactionLimit
                }
              })
              
              const bankTransactions = txResponse.data.transactions || []
              console.log(`TRANSACTIONS: Got ${bankTransactions.length} transactions from ${bankId}`)
              
              if (bankTransactions.length > 0) {
                const transformed = bankTransactions.map((tx, index) => {
                  const amount = tx.amount?.amount || tx.amount || 0
                  const isDebit = tx.creditDebitIndicator === 'Debit' || tx.transactionType === 'Debit'
                  
                  return {
                    id: `${bankId}-${tx.transactionId || tx.id || accountId}-${index}`,
                    date: tx.bookingDateTime ? tx.bookingDateTime.split('T')[0] : new Date().toISOString().split('T')[0],
                    amount: parseFloat(amount) * (isDebit ? -1 : 1),
                    type: isDebit ? 'expense' : 'income',
                    description: tx.transactionInformation || tx.merchant?.name || tx.description || 'Транзакция',
                    merchant: tx.merchant?.name || tx.counterparty || 'Неизвестный отправитель',
                    bank: bankId,
                    hasReceipt: false,
                    accountId: accountId,
                    rawData: tx
                  }
                })
                
                allTransactions = [...allTransactions, ...transformed]
              }
              
            } catch (txErr) {
              console.error(`TRANSACTIONS: Failed to get transactions from ${bankId}:`, txErr)
            }
          }
          
          // Update bank status
          const bankTxCount = allTransactions.filter(tx => tx.bank === bankId).length
          const bankIndex = updatedBanks.findIndex(b => b.id === bankId)
          if (bankIndex >= 0) {
            updatedBanks[bankIndex].status = 'active'
            updatedBanks[bankIndex].transactionsCount = bankTxCount
          }
          
        } catch (bankErr) {
          console.error(`TRANSACTIONS: Error processing ${consent.bank_id}:`, bankErr)
        }
      }
      
      allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date))
      
      setTransactions(allTransactions)
      setConnectedBanks(updatedBanks)
      
      if (allTransactions.length === 0) {
        showToast('Нет данных о транзакциях за последний месяц', 'info')
      } else {
        showToast(`Загружено ${allTransactions.length} транзакций от ${userConsents.length} банков`, 'success')
      }
      
    } catch (err) {
      console.error('TRANSACTIONS: Unexpected error:', err)
      const errorMsg = err.response?.data?.detail || err.message || 'Ошибка при загрузке данных'
      setError(errorMsg)
      showToast(`Ошибка: ${errorMsg}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  // Фильтрация транзакций по видимым банкам
  const visibleBankIds = connectedBanks.filter(b => b.visible).map(b => b.id)
  const transactionsByVisibleBanks = transactions.filter(tx => visibleBankIds.includes(tx.bank))

  // Apply filters to transactions (only from visible banks and respecting limit)
  const filteredTransactions = transactionsByVisibleBanks
    .filter(tx => {
      // Type filter (but show all, including expenses)
      if (filters.type === 'income' && tx.amount <= 0) return false
      if (filters.type === 'expense' && tx.amount >= 0) return false
      
      // Amount range filter
      if (filters.amountFrom && Math.abs(tx.amount) < parseFloat(filters.amountFrom)) return false
      if (filters.amountTo && Math.abs(tx.amount) > parseFloat(filters.amountTo)) return false
      
      // Search filter (description + merchant)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const matchDesc = tx.description.toLowerCase().includes(searchLower)
        const matchMerchant = tx.merchant.toLowerCase().includes(searchLower)
        if (!matchDesc && !matchMerchant) return false
      }
      
      // Date range filter
      if (filters.dateFrom && tx.date < filters.dateFrom) return false
      if (filters.dateTo && tx.date > filters.dateTo) return false
      
      return true
    })
    .slice(0, txSettings.transactionLimit) // Apply transaction limit

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const resetFilters = () => {
    setFilters({
      type: 'all',
      amountFrom: '',
      amountTo: '',
      search: '',
      dateFrom: '',
      dateTo: ''
    })
    showToast('Фильтры сброшены', 'info')
  }

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const toggleBankVisibility = (bankId) => {
    setConnectedBanks(prev => 
      prev.map(bank => 
        bank.id === bankId ? { ...bank, visible: !bank.visible } : bank
      )
    )
  }

  const selectAllTransactions = () => {
    const allIds = new Set(filteredTransactions.filter(tx => tx.amount > 0).map(tx => tx.id))
    setSelectedTransactions(allIds)
    showToast(`Выбрано ${allIds.size} кредитов из ${filteredTransactions.length} транзакций`, 'info')
  }

  const deselectAllTransactions = () => {
    setSelectedTransactions(new Set())
    showToast('Выбор отменён', 'info')
  }

    const handleConnectBank = async (bankId) => {
    // Проверяем, не подключен ли уже такой банк
    if (connectedBanks.find(b => b.id === bankId && b.status === 'active')) {
      showToast(`Банк ${bankId.toUpperCase()} уже подключен`, 'info')
      return
    }

    const bankConfig = {
      abank: { name: 'ABank', icon: '💳' },
      sbank: { name: 'SBank', icon: '🏛️' },
      vbank: { name: 'VBank', icon: '🏦' }
    }

    const config = bankConfig[bankId]
    if (!config) {
      showToast('Неизвестный банк', 'error')
      return
    }

    try {
      const accessToken = localStorage.getItem('accessToken')
      if (!accessToken) {
        showToast('Ошибка: токен авторизации не найден', 'error')
        return
      }
      
      // Получаем user_id из auth context
      const userId = selectedUserIndex ? `team286-${selectedUserIndex}` : 'team286'
      
      // Создаем согласие через API
      showToast(`Подключаем ${config.name}...`, 'info')
      
      const response = await axios.post(
        `${API_URL}/api/consents`,
        {
          user_id: userId,
          bank_id: bankId
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      )
      
      console.log('Consent created:', response.data)
      const consentId = response.data.consent_id
      const requestId = response.data.request_id
      const status = response.data.status
      const redirectUrl = response.data.redirect_url
      
      // Если SBank/VBank и требует ручного подтверждения
      if ((bankId === 'sbank' || bankId === 'vbank') && status === 'pending') {
        console.log(`TRANSACTIONS: ${bankId.toUpperCase()} requires manual approval`)
        
        // Store modal info for SBank approval
        setSbankModal({
          consentId: consentId,
          requestId: requestId,
          redirectUrl: redirectUrl,
          status: 'awaiting_approval',
          accessToken: accessToken,
          bankId: bankId,
          userId: userId
        })
        
        // Open approval link in new tab
        if (redirectUrl) {
          window.open(redirectUrl, '_blank')
          console.log(`TRANSACTIONS: Opened ${bankId.toUpperCase()} approval URL in new tab`)
        }
        
        setShowBankSettings(false)
        return
      }
      
      const newBank = {
        id: bankId,
        name: config.name,
        icon: config.icon,
        status: status === 'pending' ? 'pending' : 'active',
        transactionsCount: 0,
        visible: true,
        consentId: consentId // Сохраняем consent_id для отзыва
      }
      
      // Store in localStorage for TransactionsPage
      localStorage.setItem('selectedBank', bankId)
      localStorage.setItem('consentId', consentId)
      localStorage.setItem('userId', userId)
      
      setConnectedBanks(prev => [...prev, newBank])
      setShowBankSettings(false)
      showToast(`Банк ${newBank.name} подключен`, 'success')
      
      // Reload data
      setTimeout(() => loadRealData(), 1000)
      
    } catch (error) {
      console.error('Error creating consent:', error)
      showToast(
        `Ошибка при подключении банка: ${error.response?.data?.detail || error.message}`,
        'error'
      )
    }
  }

  const handleSbankApproval = async (approved) => {
    if (approved) {
      try {
        setLoading(true)
        console.log('TRANSACTIONS: User confirmed approval, fetching consent_id from request_id...')
        console.log('TRANSACTIONS: Request ID:', sbankModal.requestId)
        console.log('TRANSACTIONS: Bank ID:', sbankModal.bankId)
        
        // For SBank: Use request_id to get actual consent_id
        const consentLookupId = sbankModal.requestId || sbankModal.consentId
        
        console.log('TRANSACTIONS: Making GET request to /api/consents/' + consentLookupId)
        
        // Make GET request to fetch actual consent_id from request_id
        const checkResponse = await axios.get(
          `${API_URL}/api/consents/${consentLookupId}?bank_id=${sbankModal.bankId}&user_id=${sbankModal.userId}`,
          {
            headers: {
              'Authorization': `Bearer ${sbankModal.accessToken}`
            }
          }
        )
        
        console.log('TRANSACTIONS: Consent response:', checkResponse.data)
        
        // Check if consent is approved
        const consentStatus = checkResponse.data.status
        const returnedConsentId = checkResponse.data.consent_id || consentLookupId
        
        console.log('TRANSACTIONS: Consent status:', consentStatus)
        console.log('TRANSACTIONS: Returned consent_id:', returnedConsentId)
        
        if (consentStatus === 'pending' || consentStatus === 'awaitingAuthorization') {
          showToast('⚠️ Согласие ещё не подтверждено в SBank. Пожалуйста, подтвердите в открывшейся вкладке браузера.', 'warning')
          setLoading(false)
          return
        }
        
        if (consentStatus !== 'approved' && consentStatus !== 'authorized' && consentStatus !== 'success') {
          showToast(`Согласие имеет статус "${consentStatus}". Требуется повторное подключение.`, 'error')
          setSbankModal(null)
          setLoading(false)
          return
        }
        
        // Store consent info for transactions page - use the returned consent_id
        localStorage.setItem('accessToken', sbankModal.accessToken)
        localStorage.setItem('consentId', returnedConsentId)
        localStorage.setItem('selectedBank', sbankModal.bankId)
        localStorage.setItem('userId', sbankModal.userId)
        
        // Add new bank to connected banks
        const bankConfig = {
          abank: { name: 'ABank', icon: '💳' },
          sbank: { name: 'SBank', icon: '🏛️' },
          vbank: { name: 'VBank', icon: '🏦' }
        }
        
        const config = bankConfig[sbankModal.bankId]
        const newBank = {
          id: sbankModal.bankId,
          name: config.name,
          icon: config.icon,
          status: 'active',
          transactionsCount: 0,
          visible: true,
          consentId: returnedConsentId
        }
        
        setConnectedBanks(prev => [...prev, newBank])
        
        showToast(`Банк ${config.name} подключен!`, 'success')
        console.log('TRANSACTIONS: Bank connected with consent_id:', returnedConsentId)
        
        // Clear modal state before reloading
        setSbankModal(null)
        
        // Reload data
        setTimeout(() => loadRealData(), 1000)
      } catch (err) {
        console.error('TRANSACTIONS: Error checking consent:', err)
        const errorMsg = err.response?.data?.detail || err.message || 'Failed to verify consent status'
        showToast(`Ошибка: ${errorMsg}`, 'error')
        setLoading(false)
      }
    } else {
      showToast('Подключение SBank отменено', 'info')
      setSbankModal(null)
    }
  }

  const handleDisconnectBank = async (bankId) => {
    const bank = connectedBanks.find(b => b.id === bankId)
    if (!bank) return
    
    if (window.confirm(`Отключить банк ${bank.name}? Согласие будет отозвано.`)) {
      try {
        const accessToken = localStorage.getItem('accessToken')
        if (!accessToken) {
          showToast('Ошибка: токен авторизации не найден', 'error')
          return
        }
        
        // consentId - это правильное имя поля (из loadRealData)
        const consentId = bank.consentId
        
        if (!consentId) {
          showToast('Ошибка: не найден consent_id банка', 'error')
          return
        }
        
        console.log(`TRANSACTIONS: Disconnecting ${bankId}, consent_id: ${consentId}`)
        
        // Вызываем DELETE /api/consents/{consent_id}
        const response = await axios.delete(
          `${API_URL}/api/consents/${consentId}`,
          {
            params: {
              bank_id: bankId,
              access_token: accessToken
            }
          }
        )
        
        console.log('TRANSACTIONS: Consent revoked:', response.data)
        
        // Удаляем банк из списка подключенных
        setConnectedBanks(prev => prev.filter(b => b.id !== bankId))
        
        // Обновляем транзакции
        setTransactions(prev => prev.filter(tx => tx.bank !== bankId))
        
        // Проверяем был ли банк удален (не найден в системе)
        if (response.data.deleted) {
          showToast(`Банк ${bank.name} удален (согласие не найдено в системе)`, 'success')
        } else {
          showToast(`Банк ${bank.name} отключен, согласие отозвано`, 'success')
        }
        
      } catch (error) {
        console.error('TRANSACTIONS: Error revoking consent:', error)
        const errorMsg = error.response?.data?.detail || error.message || 'Unknown error'
        
        // Если согласие не найдено - всё равно удаляем банк из интерфейса
        if (error.response?.status === 404 || errorMsg.toLowerCase().includes('не найден')) {
          console.log('TRANSACTIONS: Consent not found - removing bank from interface')
          setConnectedBanks(prev => prev.filter(b => b.id !== bankId))
          setTransactions(prev => prev.filter(tx => tx.bank !== bankId))
          showToast(`Банк ${bank.name} удален из системы`, 'success')
        } else {
          showToast(
            `Ошибка при отключении банка: ${errorMsg}`,
            'error'
          )
        }
      }
    }
  }

  const toggleTransaction = (id) => {
    const newSet = new Set(selectedTransactions)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedTransactions(newSet)
  }

  const handleCreateReceipt = () => {
    if (selectedTransactions.size === 0) return
    
    // Get full transaction data for selected transactions
    const selectedTransactionsData = filteredTransactions.filter(tx => 
      selectedTransactions.has(tx.id)
    )
    
    navigate('/receipts', { 
      state: { 
        selectedTransactions: Array.from(selectedTransactions),
        selectedTransactionsData: selectedTransactionsData
      } 
    })
  }

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 2
    }).format(amount)
  }

  return (
    <div className="transactions-page">
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      <Header />
      
      <div className="page-title-bar">
        <div className="header-left">
          <h1>Транзакции</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowTxSettings(true)} className="btn-settings">
            ⚙️ Настройки
          </button>
          <button onClick={() => setShowBankSettings(true)} className="btn-settings">
            🏦 Банки
          </button>
        </div>
      </div>

      {/* Banks Panel */}
      <div className="banks-panel">
        <div className="banks-panel-header">
          <h3>Подключённые счета</h3>
        </div>

        <div className="banks-list">
          {connectedBanks.map(bank => (
            <div 
              key={bank.id} 
              className={`bank-card ${bank.visible ? 'active' : 'inactive'}`}
              onClick={() => toggleBankVisibility(bank.id)}
            >
              <span className="bank-icon">{bank.icon}</span>
              <div className="bank-info">
                <div className="bank-name">{bank.name}</div>
                <div className="bank-status">
                  <span className={`status-badge ${bank.status}`}>{bank.status === 'active' ? 'Активен' : 'Неактивен'}</span>
                  <span className="tx-count">{bank.transactionsCount} операций</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters Panel */}
      <div className="filters-panel">
        <div className="filters-row">
          {/* Type Filter */}
          <div className="filter-group">
            <label>Тип</label>
            <div className="type-toggle">
              <button 
                className={filters.type === 'all' ? 'active' : ''}
                onClick={() => handleFilterChange('type', 'all')}
              >
                Все
              </button>
              <button 
                className={filters.type === 'income' ? 'active' : ''}
                onClick={() => handleFilterChange('type', 'income')}
              >
                Доходы
              </button>
              <button 
                className={filters.type === 'expense' ? 'active' : ''}
                onClick={() => handleFilterChange('type', 'expense')}
              >
                Расходы
              </button>
            </div>
          </div>

          {/* Amount Range */}
          <div className="filter-group">
            <label>Сумма</label>
            <div className="amount-range">
              <input 
                type="number" 
                placeholder="от"
                value={filters.amountFrom}
                onChange={(e) => handleFilterChange('amountFrom', e.target.value)}
              />
              <span>—</span>
              <input 
                type="number" 
                placeholder="до"
                value={filters.amountTo}
                onChange={(e) => handleFilterChange('amountTo', e.target.value)}
              />
              <span className="currency">₽</span>
            </div>
          </div>

          {/* Search */}
          <div className="filter-group">
            <label>Поиск</label>
            <input 
              type="text" 
              placeholder="Описание или отправитель"
              className="search-input"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </div>

          {/* Date Range */}
          <div className="filter-group">
            <label>Период</label>
            <div className="date-range">
              <input 
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
              <span>—</span>
              <input 
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>
          </div>

          {/* Reset Button */}
          <button className="reset-filters-btn" onClick={resetFilters}>
            Сбросить
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="page-content">
        {loading ? (
          <div className="empty-state">
            <div className="empty-icon">⏳</div>
            <h2>Загрузка транзакций...</h2>
            <p>Получаем данные из банков</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <h2>Ошибка при загрузке</h2>
            <p>{error}</p>
            <button onClick={loadRealData} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
              Попробовать ещё раз
            </button>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"></div>
            <h2>Нет подходящих транзакций</h2>
            <p>Попробуйте изменить фильтры</p>
          </div>
        ) : (
          <div className="transactions-list">
            {filteredTransactions.map(tx => {
              const isCredit = tx.amount > 0  // Only credits can be selected
              return (
              <div
                key={tx.id}
                className={`transaction-item ${selectedTransactions.has(tx.id) ? 'selected' : ''} ${tx.hasReceipt ? 'has-receipt' : ''} ${!isCredit ? 'debit' : ''}`}
                onClick={() => isCredit && toggleTransaction(tx.id)}
              >
                {isCredit && (
                  <input
                    type="checkbox"
                    checked={selectedTransactions.has(tx.id)}
                    onChange={() => toggleTransaction(tx.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                {!isCredit && (
                  <div className="checkbox-placeholder"></div>
                )}
                <div className="tx-content">
                  <div className="tx-header">
                    <div className="tx-date">{tx.date}</div>
                    {tx.hasReceipt && (
                      <span className="receipt-badge" title="Чек создан">
                        Чек создан
                      </span>
                    )}
                  </div>
                  <div className="tx-sender">{tx.merchant}</div>
                  {tx.description && <div className="tx-description">{tx.description}</div>}
                </div>
                <div className={`tx-amount ${tx.type === 'expense' ? 'expense' : 'income'}`}>
                  {formatAmount(tx.amount)}
                </div>
              </div>
            )
            })}
          </div>
        )}
      </div>

      {/* Sticky Action Bar */}
      {filteredTransactions.length > 0 && (
        <div className="sticky-action-bar">
          <div className="selection-info">
            {selectedTransactions.size > 0 ? (
              <>Выбрано {selectedTransactions.size} из {filteredTransactions.length}</>
            ) : (
              <>Доступно {filteredTransactions.length} транзакций</>
            )}
          </div>
          <div className="action-buttons">
            {selectedTransactions.size === 0 ? (
              <button className="btn-action btn-select-all" onClick={selectAllTransactions}>
                ✓ Выбрать все
              </button>
            ) : (
              <>
                <button className="btn-action btn-deselect" onClick={deselectAllTransactions}>
                  ✕ Очистить
                </button>
                <button className="btn-action" onClick={handleCreateReceipt}>
                  Создать чеки
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bank Settings Modal */}
      {showBankSettings && (
        <div className="modal-overlay" onClick={() => setShowBankSettings(false)}>
          <div className="modal-content bank-settings-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Настройки банков</h2>
            
            <div className="settings-section">
              <h3>Подключённые банки</h3>
              {connectedBanks.length === 0 ? (
                <p className="empty-text">Нет подключённых банков</p>
              ) : (
                <div className="connected-banks-list">
                  {connectedBanks.map(bank => (
                    <div key={bank.id} className="settings-bank-item">
                      <div className="settings-bank-info">
                        <span className="bank-icon">{bank.icon}</span>
                        <div>
                          <div className="bank-name">{bank.name}</div>
                          <div className="bank-meta">
                            <span className={`status-badge ${bank.status}`}>
                              {bank.status === 'active' ? 'Активен' : 'Неактивен'}
                            </span>
                            <span className="tx-count">{bank.transactionsCount} операций</span>
                          </div>
                        </div>
                      </div>
                      <button 
                        className="btn-disconnect"
                        onClick={() => handleDisconnectBank(bank.id)}
                      >
                        Отключить
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="settings-section">
              <h3>Добавить новый банк</h3>
              <p className="section-hint">Подключение банка создаст новый consent для доступа к данным</p>
              <div className="bank-options">
                <button className="bank-option" onClick={() => handleConnectBank('abank')}>
                  <span className="bank-icon-large">💳</span>
                  <span>ABank</span>
                </button>
                <button className="bank-option" onClick={() => handleConnectBank('sbank')}>
                  <span className="bank-icon-large">🏛️</span>
                  <span>SBank</span>
                </button>
                <button className="bank-option" onClick={() => handleConnectBank('vbank')}>
                  <span className="bank-icon-large">🏦</span>
                  <span>VBank</span>
                </button>
              </div>
            </div>

            <button className="close-modal-btn" onClick={() => setShowBankSettings(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Transaction Settings Modal */}
      {showTxSettings && (
        <div className="modal-overlay" onClick={() => setShowTxSettings(false)}>
          <div className="modal-content tx-settings-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Настройки отображения</h2>
            
            <div className="settings-section">
              <h3>Лимит транзакций на странице</h3>
              <p className="section-hint">Загруженные данные: до 100 транзакций за последний месяц</p>
              <div className="setting-input-group">
                <label>Показывать транзакций:</label>
                <div className="input-with-buttons">
                  <button 
                    className="btn-adjust-down"
                    onClick={() => setTxSettings(prev => ({
                      ...prev, 
                      transactionLimit: Math.max(10, prev.transactionLimit - 10)
                    }))}
                  >
                    −
                  </button>
                  <input 
                    type="number"
                    min="10"
                    max="100"
                    value={txSettings.transactionLimit}
                    onChange={(e) => setTxSettings(prev => ({
                      ...prev,
                      transactionLimit: Math.max(10, Math.min(100, parseInt(e.target.value) || 10))
                    }))}
                    className="limit-input"
                  />
                  <button 
                    className="btn-adjust-up"
                    onClick={() => setTxSettings(prev => ({
                      ...prev, 
                      transactionLimit: Math.min(100, prev.transactionLimit + 10)
                    }))}
                  >
                    +
                  </button>
                </div>
                <small className="input-hint">Минимум 10, максимум 100</small>
              </div>
            </div>

            <div className="settings-section info-section">
              <p>💡 <strong>Совет:</strong> Нажмите на блок банка, чтобы включить/отключить отображение его транзакций. Загруженные данные сохраняются в памяти.</p>
            </div>

            <button className="close-modal-btn" onClick={() => setShowTxSettings(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* SBank Approval Modal */}
      {sbankModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>🏛️ SBank - Подтверждение подключения</h2>
            <p>
              Окно подтверждения открыто в новой вкладке. Пожалуйста, подтвердите подключение в браузере.
            </p>
            
            <div className="modal-info">
              <p><strong>ID запроса:</strong> {sbankModal.requestId}</p>
              {sbankModal.redirectUrl && (
                <p>
                  <strong>Ссылка подтверждения:</strong>{' '}
                  <a href={sbankModal.redirectUrl} target="_blank" rel="noreferrer">
                    Открыть в SBank
                  </a>
                </p>
              )}
            </div>

            <div className="modal-actions">
              <button
                className="btn-primary"
                onClick={() => handleSbankApproval(true)}
                disabled={loading}
              >
                {loading ? '⏳ Проверяем...' : '✅ Я подтвердил подключение'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => handleSbankApproval(false)}
                disabled={loading}
              >
                ❌ Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
