import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/DashboardPage.css'

export function DashboardPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [receipts, setReceipts] = useState([])

  // Load receipts from localStorage on mount
  useEffect(() => {
    const storedReceipts = localStorage.getItem('syntax_receipts')
    if (storedReceipts) {
      try {
        const parsed = JSON.parse(storedReceipts)
        setReceipts(parsed)
        console.log('📦 DASHBOARD: Loaded receipts:', parsed)
      } catch (err) {
        console.error('❌ DASHBOARD: Failed to parse receipts:', err)
      }
    }
  }, [])

  // Calculate statistics
  const totalReceipts = receipts.length
  const sentReceipts = receipts.filter(r => r.status === 'sent').length
  const draftReceipts = receipts.filter(r => r.status === 'draft').length
  const totalTax = receipts.reduce((sum, r) => sum + r.taxAmount, 0)
  const totalAmount = receipts.reduce((sum, r) => sum + r.totalAmount, 0)

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB'
    }).format(amount)
  }

  return (
    <div className="dashboard-page-wrapper">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>DASHBOARD</h1>
          <p>Analytics and reports</p>
        </div>
        <div className="page-header-right">
          <button className="btn-nav" onClick={() => navigate('/transactions')}>
            📋 Transactions
          </button>
          <button className="btn-nav" onClick={() => navigate('/receipts')}>
            📧 Receipts
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
        <div className="dashboard-grid">
          {/* Summary Cards */}
          <div className="summary-cards">
            <div className="card">
              <div className="card-icon">📊</div>
              <div className="card-content">
                <div className="card-label">Total Receipts</div>
                <div className="card-value">{totalReceipts}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-icon">✅</div>
              <div className="card-content">
                <div className="card-label">Sent</div>
                <div className="card-value">{sentReceipts}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-icon">📝</div>
              <div className="card-content">
                <div className="card-label">Drafts</div>
                <div className="card-value">{draftReceipts}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-icon">💰</div>
              <div className="card-content">
                <div className="card-label">Total Tax</div>
                <div className="card-value">{formatAmount(totalTax)}</div>
              </div>
            </div>

            <div className="card">
              <div className="card-icon">💵</div>
              <div className="card-content">
                <div className="card-label">Total Amount</div>
                <div className="card-value">{formatAmount(totalAmount)}</div>
              </div>
            </div>
          </div>

          {/* Chart Placeholder */}
          <div className="chart-section">
            <h2>Monthly Activity</h2>
            <div className="chart-placeholder">
              <div className="chart-message">📈 Chart data coming soon...</div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="activity-section">
            <h2>Recent Activity ({receipts.length})</h2>
            {receipts.length === 0 ? (
              <div className="empty-activity">
                <p>No receipts yet</p>
              </div>
            ) : (
              <div className="activity-list">
                {receipts.slice(0, 5).map(receipt => (
                  <div key={receipt.id} className="activity-item">
                    <div className="activity-info">
                      <div className="activity-title">{receipt.service}</div>
                      <div className="activity-meta">{receipt.date} • {receipt.clientName}</div>
                    </div>
                    <div className="activity-amount">{formatAmount(receipt.totalAmount)}</div>
                    <div className={`activity-status status-${receipt.status}`}>
                      {receipt.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
