import React, { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/BanksPage.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function BanksPage() {
  const navigate = useNavigate()
  const { user, accessToken, selectBank, logout } = useAuth()
  
  const [selectedUserIndex, setSelectedUserIndex] = useState(null)
  const [selectedBank, setSelectedBankState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [consentSuccess, setConsentSuccess] = useState(null)

  const banks = [
    { id: 'vbank', name: 'VBank', icon: '🏦', color: '#1A73E8' },
    { id: 'abank', name: 'ABank', icon: '💳', color: '#4CAF50' },
    { id: 'sbank', name: 'SBank', icon: '🏛️', color: '#FF6F00' }
  ]

  const handleBankConnect = async (bankId) => {
    if (selectedUserIndex === null) {
      setError('Please select a user first')
      return
    }

    setLoading(true)
    setError(null)
    setSelectedBankState(bankId)

    try {
      console.log(`🏦 BANKS: Connecting bank ${bankId} for user ${selectedUserIndex}`)

      const payload = {
        access_token: accessToken,
        bank_id: bankId,
        user_id: `team-286-${selectedUserIndex}`
      }

      const response = await axios.post(`${API_URL}/api/consents`, payload)

      console.log('✅ BANKS: Consent created:', response.data)

      // Update selected bank
      selectBank(selectedUserIndex, bankId)
      setConsentSuccess(`✅ Bank ${bankId.toUpperCase()} connected!`)

      // Redirect to transactions immediately
      console.log('🔄 BANKS: Redirecting to /transactions')
      navigate('/transactions')
    } catch (err) {
      console.error('❌ BANKS: Error:', err)
      setError(err.response?.data?.detail || `Failed to connect ${bankId}`)
      setSelectedBankState(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="banks-wrapper">
      {/* Header */}
      <div className="banks-header">
        <div className="banks-header-left">
          <h1>SELECT BANK</h1>
          <p>Choose user and connect your bank account</p>
        </div>
        <button className="btn-logout" onClick={() => {
          logout()
          navigate('/auth')
        }}>
          🚪 Logout
        </button>
      </div>

      {/* Main Content */}
      <div className="banks-content">
        {/* User Selection */}
        <div className="section">
          <h2 className="section-title">Select User (1-9)</h2>
          <div className="user-grid">
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

        {/* Bank Selection */}
        <div className="section">
          <h2 className="section-title">Select Bank</h2>
          <div className="banks-grid">
            {banks.map(bank => (
              <div key={bank.id} className="bank-card">
                <div className="bank-icon" style={{ color: bank.color }}>
                  {bank.icon}
                </div>
                <h3>{bank.name}</h3>
                <button
                  className={`btn-connect ${selectedBank === bank.id ? 'connected' : ''}`}
                  onClick={() => handleBankConnect(bank.id)}
                  disabled={loading || selectedUserIndex === null}
                >
                  {loading && selectedBank === bank.id ? '⏳ Connecting...' : 'Connect'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        {consentSuccess && (
          <div className="success-message">
            {consentSuccess}
          </div>
        )}
      </div>
    </div>
  )
}
