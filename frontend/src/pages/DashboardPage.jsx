import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Header } from '../components/Header'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import axios from 'axios'
import '../styles/DashboardPage.css'

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']

export function DashboardPage() {
  const navigate = useNavigate()
  const { user, logout, selectedBank } = useAuth()
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  // State management
  const [receipts, setReceipts] = useState([])
  const [period, setPeriod] = useState('month') // week, month, year
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Load receipts from localStorage
  const loadReceiptsFromLocalStorage = () => {
    try {
      const storedReceipts = localStorage.getItem('syntax_receipts')
      if (storedReceipts) {
        const parsed = JSON.parse(storedReceipts)
        setReceipts(parsed)
        console.log('Dashboard: Loaded receipts from localStorage:', parsed)
      }
    } catch (err) {
      console.error('Dashboard: Failed to load receipts from localStorage:', err)
    }
  }

  // Fetch receipts from localStorage on mount
  useEffect(() => {
    loadReceiptsFromLocalStorage()
    // Set up listener for localStorage changes
    const handleStorageChange = () => {
      loadReceiptsFromLocalStorage()
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Filter receipts by period
  const getFilteredReceipts = () => {
    const now = new Date()
    let startDate = new Date()

    switch (period) {
      case 'week':
        startDate.setDate(now.getDate() - 7)
        break
      case 'month':
        startDate.setMonth(now.getMonth() - 1)
        break
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1)
        break
      default:
        return receipts
    }

    return receipts.filter(receipt => {
      const receiptDate = new Date(receipt.date)
      return receiptDate >= startDate && receiptDate <= now
    })
  }

  // Calculate metrics
  const filteredReceipts = getFilteredReceipts()
  const sentReceipts = filteredReceipts.filter(r => r.status === 'sent')
  const draftReceipts = filteredReceipts.filter(r => r.status === 'draft')

  const totalAmount = filteredReceipts.reduce((sum, r) => {
    const amount = typeof r.totalAmount === 'string' ? parseFloat(r.totalAmount) : (r.totalAmount || r.amount || 0)
    return sum + (isNaN(amount) ? 0 : amount)
  }, 0)

  const sentAmount = sentReceipts.reduce((sum, r) => {
    const amount = typeof r.totalAmount === 'string' ? parseFloat(r.totalAmount) : (r.totalAmount || r.amount || 0)
    return sum + (isNaN(amount) ? 0 : amount)
  }, 0)

  const taxAmount = filteredReceipts.reduce((sum, r) => {
    const tax = typeof r.taxAmount === 'string' ? parseFloat(r.taxAmount) : (r.taxAmount || 0)
    return sum + (isNaN(tax) ? 0 : tax)
  }, 0)
  
  const averageReceipt = filteredReceipts.length > 0 ? totalAmount / filteredReceipts.length : 0

  // Prepare chart data - daily revenue
  const getRevenueByDate = () => {
    const map = {}
    filteredReceipts.forEach(receipt => {
      const date = new Date(receipt.date).toLocaleDateString('ru-RU', {
        month: '2-digit',
        day: '2-digit'
      })
      const amount = typeof receipt.totalAmount === 'string' ? parseFloat(receipt.totalAmount) : (receipt.totalAmount || receipt.amount || 0)
      map[date] = (map[date] || 0) + (isNaN(amount) ? 0 : amount)
    })

    return Object.entries(map)
      .map(([date, amount]) => ({ date, amount: Math.round(amount) }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-14) // Last 14 periods
  }

  // Prepare service categories chart
  const getServiceCategories = () => {
    const map = {}
    filteredReceipts.forEach(receipt => {
      const service = receipt.service || 'Unknown'
      const amount = typeof receipt.totalAmount === 'string' ? parseFloat(receipt.totalAmount) : (receipt.totalAmount || receipt.amount || 0)
      map[service] = (map[service] || 0) + (isNaN(amount) ? 0 : amount)
    })

    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }

  // Bank names mapping
  const getBankName = (accountId) => {
    // Map account IDs to bank names
    const bankMap = {
      '40702810012340000001': 'Сбербанк',
      '40702810098765432101': 'ВТБ',
      '4070281001': 'Альфа-Банк',
      '40702814': 'Газпромбанк'
    }
    
    // Try to find exact match or prefix match
    for (const [key, value] of Object.entries(bankMap)) {
      if (accountId.includes(key) || accountId === key) {
        return value
      }
    }
    
    // Default mapping by first digits
    if (accountId.startsWith('40702810012')) return 'Сбербанк'
    if (accountId.startsWith('40702810098')) return 'ВТБ'
    return 'Другой банк'
  }

  // Prepare account/bank categories chart with bank names
  const getAccountCategories = () => {
    const map = {}
    filteredReceipts.forEach(receipt => {
      const bankName = getBankName(receipt.account_id)
      const amount = typeof receipt.amount === 'string' ? parseFloat(receipt.amount) : receipt.amount
      map[bankName] = (map[bankName] || 0) + (isNaN(amount) ? 0 : amount)
    })

    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
  }

  // Get top clients
  const getTopClients = () => {
    const map = {}
    filteredReceipts.forEach(receipt => {
      const client = receipt.client_name || 'Unknown'
      const amount = typeof receipt.amount === 'string' ? parseFloat(receipt.amount) : receipt.amount
      map[client] = (map[client] || 0) + (isNaN(amount) ? 0 : amount)
    })

    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value), count: filteredReceipts.filter(r => r.client_name === name).length }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }

  // Get recent receipts
  const recentReceipts = [...filteredReceipts]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3)

  // Compare with previous period
  const getPreviousPeriodAmount = () => {
    const now = new Date()
    let startDate = new Date()
    let endDate = new Date()

    switch (period) {
      case 'week':
        endDate.setDate(now.getDate() - 7)
        startDate.setDate(now.getDate() - 14)
        break
      case 'month':
        endDate.setMonth(now.getMonth() - 1, 1)
        startDate.setMonth(now.getMonth() - 2, 1)
        break
      case 'year':
        endDate.setFullYear(now.getFullYear() - 1)
        startDate.setFullYear(now.getFullYear() - 2)
        break
      default:
        return 0
    }

    return receipts
      .filter(r => {
        const d = new Date(r.date)
        return d >= startDate && d < endDate
      })
      .reduce((sum, r) => {
        const amount = typeof r.amount === 'string' ? parseFloat(r.amount) : r.amount
        return sum + (isNaN(amount) ? 0 : amount)
      }, 0)
  }

  const previousAmount = getPreviousPeriodAmount()
  const growth = previousAmount > 0 ? ((totalAmount - previousAmount) / previousAmount * 100).toFixed(1) : 0

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const revenueData = getRevenueByDate()
  const serviceData = getServiceCategories()
  const accountData = getAccountCategories()
  const topClients = getTopClients()

  return (
    <>
      <Header />
      <div className="dashboard-page">
        <div className="dashboard-content">
          {/* Page Title */}
          <div className="dashboard-title">
            <h1>Статистика</h1>
          </div>

          {/* Period Filter */}
          <div className="period-filter">
            <span className="filter-label">Период:</span>
            <div className="filter-buttons">
              <button
                className={`period-btn ${period === 'week' ? 'active' : ''}`}
                onClick={() => setPeriod('week')}
              >
                Неделя
              </button>
              <button
                className={`period-btn ${period === 'month' ? 'active' : ''}`}
                onClick={() => setPeriod('month')}
              >
                Месяц
              </button>
              <button
                className={`period-btn ${period === 'year' ? 'active' : ''}`}
                onClick={() => setPeriod('year')}
              >
                Год
              </button>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-header">
                <div className="metric-icon"></div>
                <div className="metric-label">Общий доход</div>
              </div>
              <div className="metric-value">{formatCurrency(totalAmount)}</div>
              <div className={`metric-compare ${growth >= 0 ? 'positive' : 'negative'}`}>
                {growth >= 0 ? '↑' : '↓'} {Math.abs(growth)}% vs период
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <div className="metric-icon"></div>
                <div className="metric-label">Отправленные чеки</div>
              </div>
              <div className="metric-value">{sentReceipts.length}</div>
              <div className="metric-subtext">{formatCurrency(sentAmount)}</div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <div className="metric-icon"></div>
                <div className="metric-label">Средний чек</div>
              </div>
              <div className="metric-value">{formatCurrency(averageReceipt)}</div>
              <div className="metric-subtext">из {filteredReceipts.length} чеков</div>
            </div>

            <div className="metric-card tax-card">
              <div className="metric-header">
                <div className="metric-icon"></div>
                <div className="metric-label">Налог к оплате</div>
              </div>
              <div className="metric-value">{formatCurrency(taxAmount)}</div>
              <div className="metric-subtext">6% от дохода</div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="charts-section">
            {/* Revenue Trend Chart */}
            <div className="chart-container full-width">
              <h3>Динамика доходов</h3>
              {revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={revenueData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      stroke="#666"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis
                      stroke="#666"
                      style={{ fontSize: '12px' }}
                      tickFormatter={(value) => `₽${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #ddd',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar
                      dataKey="amount"
                      fill="#3b82f6"
                      radius={[8, 8, 0, 0]}
                      isAnimationActive={true}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-chart">Нет данных для этого периода</div>
              )}
            </div>

            {/* Service Categories Pie Chart */}
            <div className="chart-container">
              <h3>По услугам</h3>
              {serviceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={serviceData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {serviceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-chart">Нет данных</div>
              )}
            </div>

            {/* Account/Bank Distribution Pie Chart */}
            <div className="chart-container">
              <h3>По счётам</h3>
              {accountData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={accountData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {accountData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-chart">Нет данных</div>
              )}
            </div>
          </div>

          {/* Top Clients Section */}
          <div className="top-clients-section">
            <h3>Топ клиентов</h3>
            {topClients.length > 0 ? (
              <div className="clients-list">
                {topClients.map((client, idx) => (
                  <div key={idx} className="client-item">
                    <div className="client-rank">#{idx + 1}</div>
                    <div className="client-info">
                      <div className="client-name">{client.name}</div>
                      <div className="client-meta">
                        <span className="client-transactions">{client.count} транзакций</span>
                      </div>
                    </div>
                    <div className="client-total">
                      {formatCurrency(client.value)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-clients">
                <p>Нет данных по клиентам</p>
              </div>
            )}
          </div>

          {/* Recent Receipts Section */}
          <div className="recent-receipts-section">
            <h3>Последние чеки</h3>
            {recentReceipts.length > 0 ? (
              <div className="receipts-list">
                {recentReceipts.map((receipt, idx) => (
                  <div key={receipt.id || idx} className="receipt-item">
                    <div className="receipt-info">
                      <div className="receipt-service">{receipt.service}</div>
                      <div className="receipt-meta">
                        <span className="receipt-date">📅 {formatDate(receipt.date)}</span>
                        <span className="receipt-client">👤 {receipt.client_name}</span>
                        <span className="receipt-account">💳 {receipt.account_id}</span>
                      </div>
                    </div>
                    <div className="receipt-amount">
                      {formatCurrency(receipt.amount)}
                    </div>
                    <div className={`receipt-status status-${receipt.status}`}>
                      {receipt.status === 'sent' ? '✅' : '📝'} {receipt.status}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-receipts">
                <p>Нет чеков за этот период</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
