import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
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
  
  const [selectedTxIds, setSelectedTxIds] = useState(location.state?.selectedTransactions || [])
  const [expandedReceiptId, setExpandedReceiptId] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [toast, setToast] = useState(null)
  
  // Bulk operations state
  const [selectedReceiptIds, setSelectedReceiptIds] = useState([])
  const [bulkActionMode, setBulkActionMode] = useState(false)

  // Load receipts from localStorage on mount
  useEffect(() => {
    const storedReceipts = localStorage.getItem('syntax_receipts')
    if (storedReceipts) {
      try {
        const parsed = JSON.parse(storedReceipts)
        setReceipts(parsed)
        console.log('📦 RECEIPTS: Loaded from localStorage:', parsed)
      } catch (err) {
        console.error('❌ RECEIPTS: Failed to parse stored receipts:', err)
      }
    }
    
    // Load saved service templates (from Settings page)
    const storedPurposes = localStorage.getItem('syntax_saved_purposes')
    if (storedPurposes) {
      try {
        const parsed = JSON.parse(storedPurposes)
        setSavedServices(parsed)
      } catch (err) {
        console.error('❌ RECEIPTS: Failed to parse saved purposes:', err)
      }
    }
    
    // Fallback to old syntax_services key for compatibility
    const storedServices = localStorage.getItem('syntax_services')
    if (storedServices && !storedPurposes) {
      try {
        const parsed = JSON.parse(storedServices)
        setSavedServices(parsed)
      } catch (err) {
        console.error('❌ RECEIPTS: Failed to parse saved services:', err)
      }
    }
  }, [])

  // Save receipts to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('syntax_receipts', JSON.stringify(receipts))
    console.log('💾 RECEIPTS: Saved to localStorage:', receipts)
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
              console.log('🤖 AUTO-RECEIPT: Matched tx', tx.id, 'by rule:', rule.value)
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
      selectedTxIds.forEach(txId => {
        const tx = transactions.find(t => t.id === txId)
        if (tx) {
          // Always create form if it doesn't exist
          if (!receiptForms[txId]) {
            newForms[txId] = {
              service: tx.description || '',
              clientName: tx.sender || '',
              clientType: 'individual'
            }
          }
        }
      })
      if (Object.keys(newForms).length > 0) {
        setReceiptForms(prev => ({ ...prev, ...newForms }))
        console.log('📝 RECEIPTS: Initialized forms for', Object.keys(newForms).length, 'transactions')
      }
    }
  }, [selectedTxIds, transactions])

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
    console.log('🔍 VALIDATION: Checking forms...', {
      selectedTxIds: selectedTxIds.length,
      receiptFormsKeys: Object.keys(receiptForms).length,
      receiptForms: receiptForms
    })
    
    for (const txId of selectedTxIds) {
      const form = receiptForms[txId]
      if (!form) {
        console.log('❌ VALIDATION: Missing form for txId', txId)
        return false
      }
      if (!form.service.trim()) {
        console.log('❌ VALIDATION: Empty service for txId', txId)
        return false
      }
    }
    console.log('✅ VALIDATION: All forms valid')
    return true
  }

  const handleCreateReceipts = (e) => {
    e.preventDefault()

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
      const tx = transactions.find(t => t.id === txId)
      const form = receiptForms[txId]
      
      if (tx && form) {
        const taxAmount = calculateTax(tx.amount, form.clientType)
        const receiptId = `CHK-${Date.now()}-${txId}`
        
        // Save service template for future use
        addServiceTemplate(form.service)

        newReceipts.push({
          id: receiptId,
          date: new Date().toISOString().split('T')[0],
          service: form.service,
          clientName: form.clientName || tx.sender || 'Not specified',
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

    setReceipts([...newReceipts, ...receipts])
    showToast(`${newReceipts.length} receipt(s) created successfully`, 'success')
    setReceiptForms({})
    setSelectedTxIds([])
  }

  const sendReceiptToTaxService = async (receiptId) => {
    const updatedReceipts = receipts.map(r =>
      r.id === receiptId ? { ...r, status: 'sent' } : r
    )
    setReceipts(updatedReceipts)
    showToast('Receipt sent to tax service', 'success')
  }

  const deleteReceipt = (receiptId) => {
    setReceipts(receipts.filter(r => r.id !== receiptId))
    showToast('Receipt deleted', 'success')
  }
  
  // Bulk selection functions
  const toggleReceiptSelection = (receiptId) => {
    setSelectedReceiptIds(prev => 
      prev.includes(receiptId) 
        ? prev.filter(id => id !== receiptId)
        : [...prev, receiptId]
    )
  }
  
  const selectAllInCategory = () => {
    const filteredIds = filteredReceipts.map(r => r.id)
    setSelectedReceiptIds(filteredIds)
  }
  
  const deselectAll = () => {
    setSelectedReceiptIds([])
  }
  
  const toggleBulkMode = () => {
    setBulkActionMode(!bulkActionMode)
    if (bulkActionMode) {
      deselectAll()
    }
  }
  
  // Bulk operations
  const bulkSendReceipts = async () => {
    if (selectedReceiptIds.length === 0) {
      showToast('No receipts selected', 'warning')
      return
    }
    
    const updatedReceipts = receipts.map(r =>
      selectedReceiptIds.includes(r.id) && r.status === 'draft'
        ? { ...r, status: 'sent' }
        : r
    )
    setReceipts(updatedReceipts)
    showToast(`${selectedReceiptIds.length} receipt(s) sent to tax service`, 'success')
    deselectAll()
    setBulkActionMode(false)
  }
  
  const bulkResendReceipts = async () => {
    if (selectedReceiptIds.length === 0) {
      showToast('No receipts selected', 'warning')
      return
    }
    
    const updatedReceipts = receipts.map(r =>
      selectedReceiptIds.includes(r.id) && r.status === 'sent'
        ? { ...r, status: 'sent', resentAt: new Date() }
        : r
    )
    setReceipts(updatedReceipts)
    showToast(`${selectedReceiptIds.length} receipt(s) resent`, 'success')
    deselectAll()
    setBulkActionMode(false)
  }
  
  const bulkDeleteReceipts = () => {
    if (selectedReceiptIds.length === 0) {
      showToast('No receipts selected', 'warning')
      return
    }
    
    if (window.confirm(`Delete ${selectedReceiptIds.length} receipt(s)? This action cannot be undone.`)) {
      setReceipts(receipts.filter(r => !selectedReceiptIds.includes(r.id)))
      showToast(`${selectedReceiptIds.length} receipt(s) deleted`, 'success')
      deselectAll()
      setBulkActionMode(false)
    }
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
      <div className="page-header">
        <div className="page-header-left">
          <h1>RECEIPTS</h1>
          <p>Create and manage tax receipts</p>
        </div>
        <div className="page-header-right">
          <button className="btn-nav" onClick={() => navigate('/transactions')}>
            📋 Transactions
          </button>
          <button className="btn-nav" onClick={() => navigate('/dashboard')}>
            📊 Dashboard
          </button>
          <button className="btn-logout" onClick={() => {
            logout()
            navigate('/auth')
          }}>
            🚪 Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="page-content">
        {/* Receipt Creation Forms (if transactions selected) */}
        {selectedTxIds.length > 0 && (
          <div className="receipt-form-section">
            <div className="form-header">
              <h2>Create New Receipts</h2>
              <p className="form-subtitle">{selectedTxIds.length} transaction(s) selected • {selectedTxIds.length} receipt(s) will be created</p>
            </div>
            <form onSubmit={handleCreateReceipts} className="receipt-forms-container">
              {/* Individual Receipt Cards */}
              {selectedTxIds.map(txId => {
                const tx = transactions.find(t => t.id === txId)
                const form = receiptForms[txId] || { service: '', clientName: '', clientType: 'individual' }
                const txTax = calculateTax(tx?.amount || 0, form.clientType)
                
                return tx ? (
                  <div key={txId} className="receipt-card">
                    {/* Transaction Info */}
                    <div className="receipt-card-header">
                      <div className="tx-info">
                        <span className="tx-date">📅 {tx.date}</span>
                        <span className="tx-amount">{formatAmount(tx.amount)}</span>
                        <span className="tx-card">💳 •••• {tx.card}</span>
                      </div>
                    </div>

                    {/* Form Fields */}
                    <div className="receipt-card-body">
                      <div className="form-group">
                        <label>Service Description *</label>
                        <input
                          type="text"
                          list={`services-${txId}`}
                          value={form.service}
                          onChange={(e) => updateReceiptForm(txId, 'service', e.target.value)}
                          placeholder="Start typing... (e.g., Consultation, Development)"
                          required
                          className={form.service === tx.description ? 'autofilled' : ''}
                        />
                        <datalist id={`services-${txId}`}>
                          {savedServices.map((service, idx) => (
                            <option key={idx} value={service} />
                          ))}
                        </datalist>
                        {savedServices.length === 0 && (
                          <small className="hint">💡 Tip: Your service templates will appear here after first save</small>
                        )}
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>Client Name</label>
                          <input
                            type="text"
                            value={form.clientName}
                            onChange={(e) => updateReceiptForm(txId, 'clientName', e.target.value)}
                            placeholder="Auto-filled from transaction"
                            className={form.clientName === tx.sender ? 'autofilled' : ''}
                          />
                          {form.clientName === tx.sender && (
                            <small className="autofill-badge">✨ Auto-filled from sender</small>
                          )}
                        </div>

                        <div className="form-group">
                          <label>Client Type</label>
                          <select
                            value={form.clientType}
                            onChange={(e) => updateReceiptForm(txId, 'clientType', e.target.value)}
                          >
                            <option value="individual">Individual (4%)</option>
                            <option value="company">Company (6%)</option>
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
                          ⚠️ Service description is required
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
                  ← Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary-large"
                  disabled={!validateAllForms()}
                >
                  ✓ Create {selectedTxIds.length} Receipt(s)
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Receipts List */}
        <div className="receipts-list-section">
          <div className="list-toolbar">
            <div className="list-toolbar-left">
              <h2>My Receipts ({receipts.length})</h2>
              <div className="filters">
                <button
                  className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('all')}
                >
                  All ({receipts.length})
                </button>
                <button
                  className={`filter-btn ${filterStatus === 'sent' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('sent')}
                >
                  Sent ({receipts.filter(r => r.status === 'sent').length})
                </button>
                <button
                  className={`filter-btn ${filterStatus === 'draft' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('draft')}
                >
                  Draft ({receipts.filter(r => r.status === 'draft').length})
                </button>
              </div>
            </div>
            <div className="list-toolbar-right">
              <button 
                className={`btn-bulk ${bulkActionMode ? 'active' : ''}`}
                onClick={toggleBulkMode}
              >
                {bulkActionMode ? '✓ Cancel Bulk' : '☑ Bulk Actions'}
              </button>
              <button className="btn-export" onClick={exportToCSV}>
                📊 Export CSV
              </button>
            </div>
          </div>
          
          {/* Bulk Actions Bar */}
          {bulkActionMode && (
            <div className="bulk-actions-bar">
              <div className="bulk-actions-left">
                <button className="btn-select-all" onClick={selectAllInCategory}>
                  Select All ({filteredReceipts.length})
                </button>
                <button className="btn-deselect" onClick={deselectAll}>
                  Deselect All
                </button>
                <span className="selected-count">
                  {selectedReceiptIds.length} selected
                </span>
              </div>
              
              {selectedReceiptIds.length > 0 && (
                <div className="bulk-actions-right">
                  {/* Send button - only for drafts */}
                  {receipts.filter(r => selectedReceiptIds.includes(r.id) && r.status === 'draft').length > 0 && (
                    <button className="btn-bulk-send" onClick={bulkSendReceipts}>
                      ✉️ Send ({receipts.filter(r => selectedReceiptIds.includes(r.id) && r.status === 'draft').length})
                    </button>
                  )}
                  
                  {/* Resend button - only for sent */}
                  {receipts.filter(r => selectedReceiptIds.includes(r.id) && r.status === 'sent').length > 0 && (
                    <button className="btn-bulk-resend" onClick={bulkResendReceipts}>
                      🔄 Resend ({receipts.filter(r => selectedReceiptIds.includes(r.id) && r.status === 'sent').length})
                    </button>
                  )}
                  
                  <button className="btn-bulk-delete" onClick={bulkDeleteReceipts}>
                    🗑️ Delete ({selectedReceiptIds.length})
                  </button>
                </div>
              )}
            </div>
          )}

          {filteredReceipts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>{filterStatus === 'all' ? 'No receipts yet' : `No ${filterStatus} receipts`}</p>
            </div>
          ) : (
            <div className="receipts-table">
              {filteredReceipts.map(receipt => (
                <div key={receipt.id} className={`receipt-row ${selectedReceiptIds.includes(receipt.id) ? 'selected' : ''}`}>
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
                          checked={selectedReceiptIds.includes(receipt.id)}
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
                      <div className="detail-grid">
                        <div><span>ID:</span><code>{receipt.id}</code></div>
                        <div><span>Service:</span><strong>{receipt.service}</strong></div>
                        <div><span>Client:</span><strong>{receipt.clientName}</strong></div>
                        <div><span>Type:</span><strong>{receipt.clientType}</strong></div>
                        <div><span>Amount:</span><strong>{formatAmount(receipt.totalAmount)}</strong></div>
                        <div><span>Tax:</span><strong>{formatAmount(receipt.taxAmount)}</strong></div>
                      </div>
                      <div className="expanded-buttons">
                        {receipt.status === 'draft' && (
                          <>
                            <button className="btn-send" onClick={() => sendReceiptToTaxService(receipt.id)}>
                              Send
                            </button>
                            <button className="btn-delete" onClick={() => deleteReceipt(receipt.id)}>
                              Delete
                            </button>
                          </>
                        )}
                        {receipt.status === 'sent' && (
                          <button className="btn-send" onClick={() => sendReceiptToTaxService(receipt.id)}>
                            Resend
                          </button>
                        )}
                      </div>
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
