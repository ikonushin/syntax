import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Header } from '../components/Header'
import '../styles/ReceiptsPage.css'

export function ReceiptsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  const [receipts, setReceipts] = useState([])
  const [transactions, setTransactions] = useState([
    { id: 1, date: '2025-11-09', amount: 5000, description: 'оплата за консультацию', sender: 'Иван Петров', card: '1234' },
    { id: 2, date: '2025-11-08', amount: 3500, description: 'проектирование веб-сайта', sender: 'ООО Рога и Копыта', card: '5678' },
    { id: 3, date: '2025-11-07', amount: 2000, description: 'тестирование приложения', sender: 'Мария Смирнова', card: '9012' },
  ])
  
  // Saved service templates for autocomplete
  const [savedServices, setSavedServices] = useState([])
  
  // Individual receipt forms (one per transaction)
  const [receiptForms, setReceiptForms] = useState({})
  
  const [selectedTxIds, setSelectedTxIds] = useState(() => {
    // Initialize from location.state, or if selectedTxData is available, use those IDs
    const stateIds = location.state?.selectedTransactions || []
    if (stateIds.length === 0) {
      const stateData = location.state?.selectedTransactionsData || []
      return stateData.map(tx => tx.id)
    }
    return stateIds
  })
  const [selectedTxData, setSelectedTxData] = useState(location.state?.selectedTransactionsData || [])
  const [expandedReceiptId, setExpandedReceiptId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [toast, setToast] = useState(null)
  
  // Bulk operations state
  const [selectedReceiptIds, setSelectedReceiptIds] = useState(new Set())
  const [bulkActionMode, setBulkActionMode] = useState(false)
  
  // State for splitting receipts into multiple services
  const [splitReceiptMode, setSplitReceiptMode] = useState(null) // receipId being split
  const [splitServices, setSplitServices] = useState({}) // { receiptId: [{ name, amount }, ...] }

  // Load receipts from localStorage on mount
  useEffect(() => {
    const storedReceipts = localStorage.getItem('syntax_receipts')
    if (storedReceipts) {
      try {
        const parsed = JSON.parse(storedReceipts)
        setReceipts(parsed)
        console.log('RECEIPTS: Loaded from localStorage:', parsed)
      } catch (err) {
        console.error('RECEIPTS: Failed to parse stored receipts:', err)
      }
    }
    
    // Load saved service templates (from Settings page)
    const storedPurposes = localStorage.getItem('syntax_saved_purposes')
    if (storedPurposes) {
      try {
        const parsed = JSON.parse(storedPurposes)
        setSavedServices(parsed)
      } catch (err) {
        console.error('RECEIPTS: Failed to parse saved purposes:', err)
      }
    }
    
    // Fallback to old syntax_services key for compatibility
    const storedServices = localStorage.getItem('syntax_services')
    if (storedServices && !storedPurposes) {
      try {
        const parsed = JSON.parse(storedServices)
        setSavedServices(parsed)
      } catch (err) {
        console.error('RECEIPTS: Failed to parse saved services:', err)
      }
    }
  }, [])

  // Save receipts to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('syntax_receipts', JSON.stringify(receipts))
    console.log('RECEIPTS: Saved to localStorage:', receipts)
  }, [receipts])
  
  // Auto-create receipts based on rules from Settings
  useEffect(() => {
    const autoCreateReceipts = () => {
      const storedRules = localStorage.getItem('syntax_auto_receipt_rules')
      if (!storedRules || transactions.length === 0) return
      
      try {
        const rules = JSON.parse(storedRules)
        const activeRules = rules.filter(rule => rule.enabled)
        
        if (activeRules.length === 0) return
        
        const newAutoReceipts = []
        
        // Check each transaction against rules
        transactions.forEach(tx => {
          // Skip if receipt already exists for this transaction
          const existingReceipt = receipts.find(r => r.transactionIds?.includes(tx.id))
          if (existingReceipt) return
          
          // Skip expenses
          if (tx.amount <= 0) return
          
          // Check rules
          activeRules.forEach(rule => {
            let matches = false
            
            if (rule.type === 'keyword') {
              matches = tx.description?.toLowerCase().includes(rule.value.toLowerCase())
            } else if (rule.type === 'sender') {
              matches = tx.sender?.toLowerCase().includes(rule.value.toLowerCase())
            }
            
            if (matches) {
              // Auto-create receipt
              const taxAmount = calculateTax(tx.amount, 'individual')
              const receiptId = `AUTO-${Date.now()}-${tx.id}`
              
              const newReceipt = {
                id: receiptId,
                date: new Date().toISOString().split('T')[0],
                service: rule.serviceName,
                clientName: tx.sender || 'Не указано',
                clientType: 'individual',
                totalAmount: tx.amount,
                taxAmount,
                status: 'draft',
                transactionIds: [tx.id],
                transactionDate: tx.date,
                autoCreated: true,
                createdAt: new Date()
              }
              
              newAutoReceipts.push(newReceipt)
              console.log('AUTO-RECEIPT: Matched tx', tx.id, 'by rule:', rule.value)
            }
          })
        })
        
        if (newAutoReceipts.length > 0) {
          setReceipts(prev => [...newAutoReceipts, ...prev])
          showToast(`Автоматически создано ${newAutoReceipts.length} чек(ов)`, 'info')
        }
      } catch (err) {
        console.error('Error auto-creating receipts:', err)
      }
    }
    
    // Run only once after initial load
    const hasRun = sessionStorage.getItem('auto_receipts_created')
    if (!hasRun && transactions.length > 0) {
      autoCreateReceipts()
      sessionStorage.setItem('auto_receipts_created', 'true')
    }
  }, [transactions.length]) // Run when transactions are loaded
  
  // Initialize forms when transactions are selected
  useEffect(() => {
    if (selectedTxIds.length > 0) {
      const newForms = {}
      
      // First try to use real transaction data from TransactionsPage
      if (selectedTxData && selectedTxData.length > 0) {
        selectedTxData.forEach(tx => {
          if (!receiptForms[tx.id]) {
            newForms[tx.id] = {
              service: tx.description || '',
              clientName: tx.merchant || tx.sender || '',
              clientType: 'individual'
            }
          }
        })
        console.log('RECEIPTS: Initialized forms from real transaction data:', Object.keys(newForms).length)
      } else {
        // Fallback to local transaction array
        selectedTxIds.forEach(txId => {
          const tx = transactions.find(t => t.id === txId)
          if (tx) {
            if (!receiptForms[txId]) {
              newForms[txId] = {
                service: tx.description || '',
                clientName: tx.sender || '',
                clientType: 'individual'
              }
            }
          }
        })
        console.log('RECEIPTS: Initialized forms for', Object.keys(newForms).length, 'transactions (local)')
      }
      
      if (Object.keys(newForms).length > 0) {
        setReceiptForms(prev => ({ ...prev, ...newForms }))
      }
    }
  }, [selectedTxIds, selectedTxData, transactions])

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB'
    }).format(amount)
  }

  const calculateTax = (amount, clientType) => {
    const rate = clientType === 'individual' ? 0.04 : 0.06
    return Math.round(amount * rate * 100) / 100
  }

  const getTotalAmount = () => {
    // First try with real transaction data
    if (selectedTxData && selectedTxData.length > 0) {
      return selectedTxData.reduce((sum, tx) => {
        return sum + (tx.amount || 0)
      }, 0)
    }
    
    // Fallback to local transactions
    return selectedTxIds.reduce((sum, txId) => {
      const tx = transactions.find(t => t.id === txId)
      return sum + (tx?.amount || 0)
    }, 0)
  }

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const updateReceiptForm = (txId, field, value) => {
    setReceiptForms(prev => ({
      ...prev,
      [txId]: {
        ...prev[txId],
        [field]: value
      }
    }))
  }
  
  const addServiceTemplate = (service) => {
    if (service && !savedServices.includes(service)) {
      const updated = [...savedServices, service]
      setSavedServices(updated)
      localStorage.setItem('syntax_saved_purposes', JSON.stringify(updated))
    }
  }
  
  const validateAllForms = () => {
    console.log('VALIDATION: Checking forms...', {
      selectedTxIds: selectedTxIds.length,
      receiptFormsKeys: Object.keys(receiptForms).length,
      receiptForms: receiptForms
    })
    
    for (const txId of selectedTxIds) {
      const form = receiptForms[txId]
      if (!form) {
        console.log('VALIDATION: Missing form for txId', txId)
        return false
      }
      if (!form.service.trim()) {
        console.log('VALIDATION: Empty service for txId', txId)
        return false
      }
    }
    console.log('VALIDATION: All forms valid')
    return true
  }

  const handleCreateReceipts = (e) => {
    e.preventDefault()

    console.log('CREATE RECEIPTS: Starting...', {
      selectedTxIds: selectedTxIds.length,
      receiptForms: Object.keys(receiptForms).length
    })

    if (selectedTxIds.length === 0) {
      showToast('Please select transactions', 'error')
      return
    }
    
    if (!validateAllForms()) {
      showToast('Please fill in all required fields', 'error')
      return
    }

    const newReceipts = []
    
    selectedTxIds.forEach(txId => {
      console.log('CREATE RECEIPTS: Processing txId:', txId)
      // First try to find in real transaction data, then fall back to local array
      let tx = selectedTxData.find(t => t.id === txId)
      if (!tx) {
        tx = transactions.find(t => t.id === txId)
      }
      
      const form = receiptForms[txId]
      
      console.log('CREATE RECEIPTS: Found tx:', !!tx, 'Found form:', !!form, 'Form:', form)
      
      if (tx && form) {
        const taxAmount = calculateTax(tx.amount, form.clientType)
        const receiptId = `CHK-${Date.now()}-${txId}`
        
        console.log('CREATE RECEIPTS: Creating receipt:', receiptId)
        
        // Save service template for future use
        addServiceTemplate(form.service)

        newReceipts.push({
          id: receiptId,
          date: new Date().toISOString().split('T')[0],
          service: form.service,
          clientName: form.clientName || tx.merchant || tx.sender || 'Not specified',
          clientType: form.clientType,
          totalAmount: tx.amount,
          taxAmount,
          status: 'draft',
          transactionIds: [txId],
          transactionDate: tx.date,
          transactionCard: tx.card,
          createdAt: new Date()
        })
      }
    })

    console.log('CREATE RECEIPTS: Created', newReceipts.length, 'receipts')
    
    setReceipts(prev => {
      const updated = [...newReceipts, ...prev]
      console.log('CREATE RECEIPTS: Total receipts after update:', updated.length)
      // Save to localStorage immediately
      localStorage.setItem('syntax_receipts', JSON.stringify(updated))
      return updated
    })
    
    showToast(`${newReceipts.length} receipt(s) created successfully`, 'success')
    setReceiptForms({})
    setSelectedTxIds([])
  }

  const sendReceiptToTaxService = async (receiptId) => {
    const updatedReceipts = receipts.map(r =>
      r.id === receiptId ? { ...r, status: 'sent' } : r
    )
    setReceipts(updatedReceipts)
    localStorage.setItem('syntax_receipts', JSON.stringify(updatedReceipts))
    showToast('Чек отправлен налоговой службе', 'success')
  }

  const deleteReceipt = (receiptId) => {
    const updatedReceipts = receipts.filter(r => r.id !== receiptId)
    setReceipts(updatedReceipts)
    localStorage.setItem('syntax_receipts', JSON.stringify(updatedReceipts))
    showToast('Чек удален', 'success')
  }
  
  // Bulk selection functions
  const toggleReceiptSelection = (receiptId) => {
    setSelectedReceiptIds(prev => {
      const updated = new Set(prev)
      if (updated.has(receiptId)) {
        updated.delete(receiptId)
      } else {
        updated.add(receiptId)
      }
      return updated
    })
  }
  
  const selectAllInCategory = () => {
    const filteredIds = filteredReceipts.map(r => r.id)
    setSelectedReceiptIds(new Set(filteredIds))
  }
  
  const deselectAll = () => {
    setSelectedReceiptIds(new Set())
  }
  
  const toggleBulkMode = () => {
    setBulkActionMode(!bulkActionMode)
    if (bulkActionMode) {
      deselectAll()
    }
  }
  
  // Bulk operations
  const bulkSendReceipts = async () => {
    if (selectedReceiptIds.size === 0) {
      showToast('Нет выбранных чеков', 'warning')
      return
    }
    
    const updatedReceipts = receipts.map(r =>
      selectedReceiptIds.has(r.id) && r.status === 'draft'
        ? { ...r, status: 'sent' }
        : r
    )
    setReceipts(updatedReceipts)
    localStorage.setItem('syntax_receipts', JSON.stringify(updatedReceipts))
    showToast(`${selectedReceiptIds.size} чек(ов) отправлено в налоговою службу`, 'success')
    deselectAll()
    setBulkActionMode(false)
  }
  
  const bulkResendReceipts = async () => {
    if (selectedReceiptIds.size === 0) {
      showToast('Нет выбранных чеков', 'warning')
      return
    }
    
    const updatedReceipts = receipts.map(r =>
      selectedReceiptIds.has(r.id) && r.status === 'sent'
        ? { ...r, status: 'sent', resentAt: new Date() }
        : r
    )
    setReceipts(updatedReceipts)
    localStorage.setItem('syntax_receipts', JSON.stringify(updatedReceipts))
    showToast(`${selectedReceiptIds.size} чек(ов) отправлено повторно`, 'success')
    deselectAll()
    setBulkActionMode(false)
  }
  
  const bulkDeleteReceipts = () => {
    if (selectedReceiptIds.size === 0) {
      showToast('Нет выбранных чеков', 'warning')
      return
    }
    
    if (window.confirm(`Удалить ${selectedReceiptIds.size} чек(ов)? Это действие нельзя отменить.`)) {
      const updatedReceipts = receipts.filter(r => !selectedReceiptIds.has(r.id))
      setReceipts(updatedReceipts)
      localStorage.setItem('syntax_receipts', JSON.stringify(updatedReceipts))
      showToast(`${selectedReceiptIds.size} чек(ов) удалено`, 'success')
      deselectAll()
      setBulkActionMode(false)
    }
  }
  
  // Functions for splitting receipts
  const startSplitReceipt = (receiptId) => {
    const receipt = receipts.find(r => r.id === receiptId)
    if (!receipt) return
    
    setSplitReceiptMode(receiptId)
    // Initialize split services with current service as one item
    setSplitServices({
      [receiptId]: [{
        name: receipt.service,
        amount: receipt.totalAmount
      }]
    })
  }
  
  const addSplitService = (receiptId) => {
    setSplitServices(prev => ({
      ...prev,
      [receiptId]: [
        ...prev[receiptId],
        { name: '', amount: 0 }
      ]
    }))
  }
  
  const removeSplitService = (receiptId, index) => {
    setSplitServices(prev => ({
      ...prev,
      [receiptId]: prev[receiptId].filter((_, i) => i !== index)
    }))
  }
  
  const updateSplitService = (receiptId, index, field, value) => {
    setSplitServices(prev => {
      const updated = [...prev[receiptId]]
      if (field === 'amount') {
        updated[index][field] = parseFloat(value) || 0
      } else {
        updated[index][field] = value
      }
      return { ...prev, [receiptId]: updated }
    })
  }
  
  const getSplitTotal = (receiptId) => {
    const services = splitServices[receiptId] || []
    return services.reduce((sum, s) => sum + s.amount, 0)
  }
  
  const validateSplitReceipt = (receiptId) => {
    const receipt = receipts.find(r => r.id === receiptId)
    const services = splitServices[receiptId] || []
    
    if (services.length === 0) {
      showToast('Добавьте хотя бы одну услугу', 'error')
      return false
    }
    
    if (services.some(s => !s.name.trim())) {
      showToast('Укажите название для всех услуг', 'error')
      return false
    }
    
    const total = getSplitTotal(receiptId)
    if (Math.abs(total - receipt.totalAmount) > 0.01) {
      showToast(`Сумма услуг (${total.toFixed(2)}) должна равняться ${receipt.totalAmount.toFixed(2)}`, 'error')
      return false
    }
    
    return true
  }
  
  const confirmSplitReceipt = (receiptId) => {
    if (!validateSplitReceipt(receiptId)) return
    
    const receipt = receipts.find(r => r.id === receiptId)
    const services = splitServices[receiptId]
    
    // Update receipt with split services info
    const updatedReceipt = {
      ...receipt,
      services: services,
      isSplit: services.length > 1
    }
    
    const updatedReceipts = receipts.map(r => r.id === receiptId ? updatedReceipt : r)
    setReceipts(updatedReceipts)
    localStorage.setItem('syntax_receipts', JSON.stringify(updatedReceipts))
    
    setSplitReceiptMode(null)
    setSplitServices({})
    showToast('Чек разделен на услуги', 'success')
  }

  const exportToCSV = () => {
    if (receipts.length === 0) {
      showToast('No receipts to export', 'warning')
      return
    }

    const headers = ['Date', 'Receipt ID', 'Service', 'Client', 'Type', 'Amount', 'Tax', 'Status']
    const rows = receipts.map(r => [
      r.date,
      r.id,
      r.service,
      r.clientName,
      r.clientType === 'individual' ? 'Individual' : 'Company',
      r.totalAmount.toFixed(2),
      r.taxAmount.toFixed(2),
      r.status
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

    showToast('Report exported', 'success')
  }

  const getFilteredReceipts = () => {
    if (filterStatus === 'all') return receipts
    return receipts.filter(r => r.status === filterStatus)
  }

  const filteredReceipts = getFilteredReceipts()

  return (
    <div className="receipts-page-wrapper">
      {/* Header */}
      <Header />

      {/* Page Title */}
      <div className="page-title-section">
        <h1>ЧЕКИ</h1>
        <p className="header-subtitle">Создание и управление налоговыми чеками</p>
      </div>

      {/* Main Content */}
      <div className="page-content">
        {/* Receipt Creation Forms (if transactions selected) */}
        {selectedTxIds.length > 0 && (
          <div className="receipt-form-section">
            <div className="form-header">
              <h2>Создать новые чеки</h2>
              <p className="form-subtitle">Выбрано {selectedTxIds.length} транзакц{selectedTxIds.length === 1 ? 'ия' : 'ий'} • Будет создано {selectedTxIds.length} чек{selectedTxIds.length === 1 ? '' : 'ов'}</p>
            </div>
            <form onSubmit={handleCreateReceipts} className="receipt-forms-container">
              {/* Individual Receipt Cards */}
              {selectedTxIds.map(txId => {
                // First try to find in real transaction data, then fall back to local array
                let tx = selectedTxData.find(t => t.id === txId)
                if (!tx) {
                  tx = transactions.find(t => t.id === txId)
                }
                const form = receiptForms[txId] || { service: '', clientName: '', clientType: 'individual' }
                const txTax = calculateTax(tx?.amount || 0, form.clientType)
                
                return tx ? (
                  <div key={txId} className="receipt-card">
                    {/* Transaction Info */}
                    <div className="receipt-card-header">
                      <div className="tx-info">
                        <span className="tx-date">{tx.date}</span>
                        <span className="tx-amount">{formatAmount(tx.amount)}</span>
                        <span className="tx-card">•••• {tx.card}</span>
                      </div>
                    </div>

                    {/* Form Fields */}
                    <div className="receipt-card-body">
                      <div className="form-group">
                        <label>Описание услуги *</label>
                        <input
                          type="text"
                          list={`services-${txId}`}
                          value={form.service}
                          onChange={(e) => updateReceiptForm(txId, 'service', e.target.value)}
                          placeholder="Консультация, разработка, дизайн..."
                          required
                          className={form.service === tx.description ? 'autofilled' : ''}
                        />
                        <datalist id={`services-${txId}`}>
                          {savedServices.map((service, idx) => (
                            <option key={idx} value={service} />
                          ))}
                        </datalist>
                        {savedServices.length === 0 && (
                          <small className="hint">Совет: ваши шаблоны услуг появятся здесь после первого сохранения</small>
                        )}
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>Имя клиента</label>
                          <input
                            type="text"
                            value={form.clientName}
                            onChange={(e) => updateReceiptForm(txId, 'clientName', e.target.value)}
                            placeholder="Автоматически заполнится из транзакции"
                            className={form.clientName === (tx.merchant || tx.sender) ? 'autofilled' : ''}
                          />
                          {form.clientName === (tx.merchant || tx.sender) && (
                            <small className="autofill-badge">Автоматически заполнено из транзакции</small>
                          )}
                        </div>

                        <div className="form-group">
                          <label>Тип клиента</label>
                          <select
                            value={form.clientType}
                            onChange={(e) => updateReceiptForm(txId, 'clientType', e.target.value)}
                          >
                            <option value="individual">Физ. лицо (4%)</option>
                            <option value="company">Юр. лицо (6%)</option>
                          </select>
                        </div>
                      </div>

                      {/* Tax Summary */}
                      <div className="tax-summary-compact">
                        <div className="tax-row">
                          <span>Amount:</span>
                          <strong>{formatAmount(tx.amount)}</strong>
                        </div>
                        <div className="tax-row">
                          <span>Tax ({form.clientType === 'individual' ? '4%' : '6%'}):</span>
                          <strong className="tax-highlight">{formatAmount(txTax)}</strong>
                        </div>
                        <div className="tax-row total">
                          <span>Total with Tax:</span>
                          <strong>{formatAmount(tx.amount + txTax)}</strong>
                        </div>
                      </div>
                      
                      {/* Validation Error */}
                      {!form.service.trim() && (
                        <div className="validation-error">
                          Описание услуги обязательно
                        </div>
                      )}
                    </div>
                  </div>
                ) : null
              })}

              {/* Form Buttons */}
              <div className="form-buttons-sticky">
                <button type="button" className="btn-secondary" onClick={() => {
                  setSelectedTxIds([])
                  setReceiptForms({})
                }}>
                  ← Отмена
                </button>
                <button 
                  type="submit" 
                  className="btn-primary-large"
                  disabled={!validateAllForms()}
                >
                  Создать {selectedTxIds.length} чек({selectedTxIds.length === 1 ? '' : 'ов'})
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Receipts List */}
        <div className="receipts-list-section">
          <div className="list-toolbar">
            <div className="list-toolbar-left">
              <h2>Мои чеки ({receipts.length})</h2>
              <div className="filters">
                <button
                  className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('all')}
                >
                  Все ({receipts.length})
                </button>
                <button
                  className={`filter-btn ${filterStatus === 'sent' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('sent')}
                >
                  Отправленные ({receipts.filter(r => r.status === 'sent').length})
                </button>
                <button
                  className={`filter-btn ${filterStatus === 'draft' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('draft')}
                >
                  Черновики ({receipts.filter(r => r.status === 'draft').length})
                </button>
              </div>
            </div>
            <div className="list-toolbar-right">
              <button 
                className={`btn-bulk ${bulkActionMode ? 'active' : ''}`}
                onClick={toggleBulkMode}
              >
                {bulkActionMode ? 'Отменить выделение' : 'Выбрать'}
              </button>
              <button className="btn-export" onClick={exportToCSV}>
                Экспорт CSV
              </button>
            </div>
          </div>
          
          {/* Bulk Actions Bar */}
          {bulkActionMode && (
            <div className="bulk-actions-bar">
              <div className="bulk-actions-left">
                <button className="btn-select-all" onClick={selectAllInCategory}>
                  Выбрать все ({filteredReceipts.length})
                </button>
                <button className="btn-deselect" onClick={deselectAll}>
                  Снять выбор
                </button>
                <span className="selected-count">
                  Выбрано: {selectedReceiptIds.size}
                </span>
              </div>
              
              {selectedReceiptIds.size > 0 && (
                <div className="bulk-actions-right">
                  {/* Send button - only for drafts */}
                  {receipts.filter(r => selectedReceiptIds.has(r.id) && r.status === 'draft').length > 0 && (
                    <button className="btn-bulk-send" onClick={bulkSendReceipts}>
                      ✉️ Отправить ({receipts.filter(r => selectedReceiptIds.has(r.id) && r.status === 'draft').length})
                    </button>
                  )}
                  
                  {/* Resend button - only for sent */}
                  {receipts.filter(r => selectedReceiptIds.has(r.id) && r.status === 'sent').length > 0 && (
                    <button className="btn-bulk-resend" onClick={bulkResendReceipts}>
                      🔄 Отправить повторно ({receipts.filter(r => selectedReceiptIds.has(r.id) && r.status === 'sent').length})
                    </button>
                  )}
                  
                  <button className="btn-bulk-delete" onClick={bulkDeleteReceipts}>
                    🗑️ Удалить ({selectedReceiptIds.size})
                  </button>
                </div>
              )}
            </div>
          )}

          {filteredReceipts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"></div>
              <p>{filterStatus === 'all' ? 'Чеков еще нет' : `Нет ${filterStatus === 'sent' ? 'отправленных' : 'черновых'} чеков`}</p>
            </div>
          ) : (
            <div className="receipts-table">
              {filteredReceipts.map(receipt => (
                <div key={receipt.id} className={`receipt-row ${selectedReceiptIds.has(receipt.id) ? 'selected' : ''}`}>
                  <div
                    className="receipt-row-main"
                    onClick={() => {
                      if (bulkActionMode) {
                        toggleReceiptSelection(receipt.id)
                      } else {
                        setExpandedReceiptId(expandedReceiptId === receipt.id ? null : receipt.id)
                      }
                    }}
                  >
                    {/* Checkbox for bulk selection */}
                    {bulkActionMode && (
                      <div className="receipt-checkbox" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedReceiptIds.has(receipt.id)}
                          onChange={() => toggleReceiptSelection(receipt.id)}
                        />
                      </div>
                    )}
                    
                    <div className="receipt-info">
                      <div className="receipt-date">{receipt.date}</div>
                      <div className="receipt-service">{receipt.service}</div>
                      <div className="receipt-client">{receipt.clientName}</div>
                    </div>
                    <div className="receipt-amounts">
                      <div className="receipt-amount">{formatAmount(receipt.totalAmount)}</div>
                      <div className="receipt-tax">{formatAmount(receipt.taxAmount)}</div>
                    </div>
                    <div className={`receipt-status status-${receipt.status}`}>
                      {receipt.status}
                    </div>
                    <div className="receipt-toggle">▼</div>
                  </div>

                  {/* Expanded Details */}
                  {expandedReceiptId === receipt.id && (
                    <div className="receipt-expanded">
                      {splitReceiptMode === receipt.id ? (
                        // Split Services Mode
                        <div className="split-receipt-mode">
                          <h3>Разделение чека на услуги</h3>
                          <p className="split-hint">Укажите наименование и стоимость каждой оказанной услуги</p>
                          
                          <div className="split-services-list">
                            {(splitServices[receipt.id] || []).map((service, index) => (
                              <div key={index} className="split-service-item">
                                <div className="split-service-row">
                                  <input
                                    type="text"
                                    placeholder="Наименование услуги"
                                    value={service.name}
                                    onChange={(e) => updateSplitService(receipt.id, index, 'name', e.target.value)}
                                    className="service-name-input"
                                  />
                                  <div className="amount-input-group">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      placeholder="Сумма"
                                      value={service.amount || ''}
                                      onChange={(e) => updateSplitService(receipt.id, index, 'amount', e.target.value)}
                                      className="service-amount-input"
                                    />
                                    <span className="currency-label">₽</span>
                                  </div>
                                  {(splitServices[receipt.id]?.length || 0) > 1 && (
                                    <button
                                      className="btn-remove-service"
                                      onClick={() => removeSplitService(receipt.id, index)}
                                      title="Удалить услугу"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          <div className="split-total-row">
                            <span>Всего:</span>
                            <strong className={getSplitTotal(receipt.id) === receipt.totalAmount ? 'valid' : 'invalid'}>
                              {formatAmount(getSplitTotal(receipt.id))} / {formatAmount(receipt.totalAmount)}
                            </strong>
                          </div>
                          
                          <button
                            className="btn-add-service"
                            onClick={() => addSplitService(receipt.id)}
                          >
                            + Добавить ещё услугу
                          </button>
                          
                          <div className="split-actions">
                            <button
                              className="btn-confirm-split"
                              onClick={() => confirmSplitReceipt(receipt.id)}
                              disabled={getSplitTotal(receipt.id) !== receipt.totalAmount}
                            >
                              Подтвердить разделение
                            </button>
                            <button
                              className="btn-cancel-split"
                              onClick={() => {
                                setSplitReceiptMode(null)
                                setSplitServices({})
                              }}
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Normal Details Mode
                        <>
                          <div className="detail-grid">
                            <div><span>ID:</span><code>{receipt.id}</code></div>
                            <div><span>Услуга:</span><strong>{receipt.service}</strong></div>
                            <div><span>Клиент:</span><strong>{receipt.clientName}</strong></div>
                            <div><span>Тип:</span><strong>{receipt.clientType}</strong></div>
                            <div><span>Сумма:</span><strong>{formatAmount(receipt.totalAmount)}</strong></div>
                            <div><span>Налог:</span><strong>{formatAmount(receipt.taxAmount)}</strong></div>
                          </div>
                          
                          {receipt.isSplit && receipt.services && (
                            <div className="split-services-summary">
                              <strong>Разделено на услуги:</strong>
                              {receipt.services.map((svc, idx) => (
                                <div key={idx} className="service-summary-item">
                                  {svc.name}: <strong>{formatAmount(svc.amount)}</strong>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <div className="expanded-buttons">
                            {receipt.status === 'draft' && (
                              <>
                                <button className="btn-split" onClick={() => startSplitReceipt(receipt.id)}>
                                  ✂️ Разделить чек
                                </button>
                                <button className="btn-send" onClick={() => sendReceiptToTaxService(receipt.id)}>
                                  Отправить
                                </button>
                                <button className="btn-delete" onClick={() => deleteReceipt(receipt.id)}>
                                  Удалить
                                </button>
                              </>
                            )}
                            {receipt.status === 'sent' && (
                              <button className="btn-send" onClick={() => sendReceiptToTaxService(receipt.id)}>
                                Отправить повторно
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast Notifications */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
