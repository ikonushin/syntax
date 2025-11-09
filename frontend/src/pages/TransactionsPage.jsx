import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/TransactionsPage.css'

export function TransactionsPage() {
  const navigate = useNavigate()
  const { logout, selectedBank } = useAuth()
  
  const [transactions, setTransactions] = useState([
    { id: 1, date: '2025-11-09', amount: 5000, type: 'income', description: 'оплата за консультацию', sender: 'Иван Петров', bank: 'vbank' },
    { id: 2, date: '2025-11-08', amount: 3500, type: 'income', description: 'проектирование веб-сайта', sender: 'ООО Рога и Копыта', bank: 'vbank' },
    { id: 3, date: '2025-11-07', amount: 2000, type: 'income', description: 'тестирование приложения', sender: 'Мария Смирнова', bank: 'abank' },
    { id: 4, date: '2025-11-06', amount: 7500, type: 'income', description: 'разработка API', sender: 'TechStart LLC', bank: 'abank' },
    { id: 5, date: '2025-11-05', amount: 1200, type: 'income', description: 'помощь в отладке кода', sender: 'Алексей Васильев', bank: 'sbank' }
  ])
  
  const [connectedBanks, setConnectedBanks] = useState([
    { id: 'abank', name: 'ABank', icon: '💳', status: 'active', transactionsCount: 2, visible: true },
    { id: 'sbank', name: 'SBank', icon: '🏛️', status: 'active', transactionsCount: 1, visible: true },
    { id: 'vbank', name: 'VBank', icon: '�', status: 'active', transactionsCount: 2, visible: true }
  ])
  
  const [selectedTransactions, setSelectedTransactions] = useState(new Set())
  const [showBankSettings, setShowBankSettings] = useState(false)
  const [showBankVisibilityMenu, setShowBankVisibilityMenu] = useState(false)
  const [toast, setToast] = useState(null)
  
  const [filters, setFilters] = useState({
    type: 'all', // 'all', 'income', 'expense'
    amountFrom: '',
    amountTo: '',
    search: '',
    dateFrom: '',
    dateTo: ''
  })

  // Фильтрация транзакций по видимым банкам
  const visibleBankIds = connectedBanks.filter(b => b.visible).map(b => b.id)
  const transactionsByVisibleBanks = transactions.filter(tx => visibleBankIds.includes(tx.bank))

  // Apply filters to transactions (only from visible banks)
  const filteredTransactions = transactionsByVisibleBanks.filter(tx => {
    // Type filter
    if (filters.type === 'income' && tx.amount <= 0) return false
    if (filters.type === 'expense' && tx.amount >= 0) return false
    
    // Amount range filter
    if (filters.amountFrom && Math.abs(tx.amount) < parseFloat(filters.amountFrom)) return false
    if (filters.amountTo && Math.abs(tx.amount) > parseFloat(filters.amountTo)) return false
    
    // Search filter (description + sender)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const matchDesc = tx.description.toLowerCase().includes(searchLower)
      const matchSender = tx.sender.toLowerCase().includes(searchLower)
      if (!matchDesc && !matchSender) return false
    }
    
    // Date range filter
    if (filters.dateFrom && tx.date < filters.dateFrom) return false
    if (filters.dateTo && tx.date > filters.dateTo) return false
    
    return true
  })

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

  const handleConnectBank = async (bankId) => {
    // TODO: Реальный запрос на создание consent
    // const response = await fetch('/api/consents', {
    //   method: 'POST',
    //   body: JSON.stringify({ bank_id: bankId, user_id: ... })
    // })
    
    // Проверяем, не подключен ли уже такой банк
    if (connectedBanks.find(b => b.id === bankId)) {
      showToast(`Банк уже подключен`, 'info')
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

    const newBank = {
      id: bankId,
      name: config.name,
      icon: config.icon,
      status: 'active',
      transactionsCount: 0,
      visible: true
    }
    setConnectedBanks(prev => [...prev, newBank])
    setShowBankSettings(false)
    showToast(`Банк ${newBank.name} подключен`, 'success')
  }

  const handleDisconnectBank = (bankId) => {
    const bank = connectedBanks.find(b => b.id === bankId)
    if (!bank) return
    
    if (window.confirm(`Отключить банк ${bank.name}?`)) {
      setConnectedBanks(prev => prev.filter(b => b.id !== bankId))
      showToast(`Банк ${bank.name} отключен`, 'info')
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
    navigate('/receipts', { state: { selectedTransactions: Array.from(selectedTransactions) } })
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

      <header className="page-header">
        <div className="header-left">
          <h1>Транзакции</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => navigate('/dashboard')} className="btn-secondary">
            ← Назад
          </button>
          <button onClick={() => setShowBankSettings(true)} className="btn-settings">
            ⚙️ Настройки банков
          </button>
          <button onClick={logout} className="btn-logout">
            Выйти
          </button>
        </div>
      </header>

      {/* Banks Panel */}
      <div className="banks-panel">
        <div className="banks-panel-header">
          <h3>Подключённые счета</h3>
          <button 
            className="banks-visibility-toggle"
            onClick={() => setShowBankVisibilityMenu(!showBankVisibilityMenu)}
          >
            {showBankVisibilityMenu ? '✕ Закрыть' : '👁️ Управление'}
          </button>
        </div>

        {showBankVisibilityMenu && (
          <div className="bank-visibility-menu">
            <p className="menu-hint">Выберите банки для отображения транзакций</p>
            {connectedBanks.map(bank => (
              <label key={bank.id} className="bank-checkbox">
                <input 
                  type="checkbox"
                  checked={bank.visible}
                  onChange={() => toggleBankVisibility(bank.id)}
                />
                <span className="bank-icon-small">{bank.icon}</span>
                <span className="bank-name-small">{bank.name}</span>
                <span className="bank-tx-count">({bank.transactionsCount})</span>
              </label>
            ))}
          </div>
        )}

        <div className="banks-list">
          {connectedBanks.filter(b => b.visible).map(bank => (
            <div key={bank.id} className={`bank-card ${selectedBank === bank.id ? 'active' : ''}`}>
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
        {filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h2>Нет подходящих транзакций</h2>
            <p>Попробуйте изменить фильтры</p>
          </div>
        ) : (
          <div className="transactions-list">
            {filteredTransactions.map(tx => (
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
                <div className="tx-content">
                  <div className="tx-date">{tx.date}</div>
                  <div className="tx-sender">{tx.sender}</div>
                  {tx.description && <div className="tx-description">{tx.description}</div>}
                </div>
                <div className="tx-amount">{formatAmount(tx.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky Action Bar */}
      {selectedTransactions.size > 0 && (
        <div className="sticky-action-bar">
          <div className="selection-info">
            Выбрано {selectedTransactions.size} {selectedTransactions.size === 1 ? 'транзакция' : 'транзакций'}
          </div>
          <button className="btn-action" onClick={handleCreateReceipt}>
            Создать чеки
          </button>
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
    </div>
  )
}
