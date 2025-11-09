import React, { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import syntaxLogo from '../assets/syntax-logo.svg'
import '../styles/Auth.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function AuthPage() {
  const [form, setForm] = useState({
    client_id: '',
    client_secret: ''
  })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const payload = {
        client_id: form.client_id,
        client_secret: form.client_secret
      }

      console.log('🔐 AUTH: Sending authentication request:', { ...payload, client_secret: '***' })

      const response = await axios.post(`${API_URL}/api/authenticate`, payload)

      console.log('✅ AUTH: Authentication successful!', response.data)

      // Store auth data
      login(
        {
          client_id: form.client_id
        },
        response.data.access_token
      )

      // Redirect to banks page
      navigate('/banks')
    } catch (err) {
      console.error('❌ AUTH: Authentication failed:', err)
      setError(err.response?.data?.detail || 'Authentication failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        {/* Logo */}
        <div className="auth-logo">
          <img src={syntaxLogo} alt="SYNTAX" />
        </div>

        {/* Title */}
        <h1 className="auth-title">SYNTAX</h1>
        <p className="auth-subtitle">Multi-Banking Platform for Self-Employed</p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          {/* Client ID */}
          <div className="form-group">
            <label htmlFor="client_id">Team ID</label>
            <input
              id="client_id"
              type="text"
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              placeholder="your-team-id"
              required
              disabled={loading}
            />
          </div>

          {/* Client Secret */}
          <div className="form-group">
            <label htmlFor="client_secret">API Key</label>
            <input
              id="client_secret"
              type="password"
              value={form.client_secret}
              onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
              placeholder="your-api-key"
              required
              disabled={loading}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="error-message">
              ❌ {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className={`submit-button ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? '⏳ Вход...' : 'Вход'}
          </button>
        </form>
      </div>
    </div>
  )
}
