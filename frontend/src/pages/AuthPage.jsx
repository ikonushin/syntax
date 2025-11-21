import React, { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import syntaxLogo from '../assets/syntax-logo.svg'
import '../styles/Auth.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function AuthPage() {
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login, selectUserBank } = useAuth()

  // Generate random user ID (1-7)
  const generateRandomUserId = () => {
    return Math.floor(Math.random() * 7) + 1
  }

  // Automatic login with random user
  const handleAutoLogin = async () => {
    setLoading(true)
    setError(null)

    try {
      const baseClientId = import.meta.env.VITE_CLIENT_ID || 'team286'
      const clientSecret = import.meta.env.VITE_CLIENT_SECRET || ''
      const randomUserIndex = generateRandomUserId()
      const fullClientId = `${baseClientId}-${randomUserIndex}`

      console.log('AUTH: Step 1 - Getting base authorization token with:', baseClientId)

      // Step 1: Authenticate with BASE credentials from .env to get initial token
      const authResponse = await axios.post(`${API_URL}/api/authenticate`, {
        client_id: baseClientId,
        client_secret: clientSecret
      })

      console.log('AUTH: Step 1 - Base token obtained successfully')
      const jwtToken = authResponse.data.access_token

      console.log('AUTH: Step 2 - Now working with randomly selected user:', fullClientId)
      
      // Save to localStorage
      localStorage.setItem('accessToken', jwtToken)
      localStorage.setItem('userId', fullClientId)
      localStorage.setItem('selectedUserIndex', randomUserIndex)
      localStorage.setItem('clientId', baseClientId)

      // Update auth context with JWT
      login(
        {
          client_id: baseClientId,
          user_id: fullClientId,
          user_index: randomUserIndex
        },
        jwtToken
      )

      console.log('AUTH: User logged in:', fullClientId)

      // Step 2: Check for existing consents
      try {
        const consentsResponse = await axios.get(`${API_URL}/api/user-consents`, {
          params: {
            user_id: fullClientId
          },
          headers: {
            'Authorization': `Bearer ${jwtToken}`
          }
        })
        
        const userConsents = consentsResponse.data.consents || []
        console.log(`AUTH: Found ${userConsents.length} existing consents`)
        
        if (userConsents.length > 0) {
          // User has consents, go to transactions
          console.log('AUTH: User has consents, redirecting to transactions')
          selectUserBank(randomUserIndex, null)
          navigate('/transactions')
          return
        }
      } catch (err) {
        console.warn('AUTH: Could not check consents (probably first login):', err.message)
      }
      
      // No consents found, go to bank selection
      selectUserBank(randomUserIndex, null)
      navigate('/banks')

    } catch (err) {
      console.error('AUTH: Error during automatic login:', err)
      const errorMsg = err.response?.data?.detail || err.message || 'Ошибка аутентификации'
      setError(errorMsg)
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
        <p className="auth-subtitle">Платформа мультибанкинга для самозанятых</p>

        {/* Description */}
        <div className="auth-description">
          <p>Получайте данные со всех ваших счетов в одном месте, создавайте чеки и отслеживайте налоги автоматически.</p>
        </div>

        {/* Error message */}
        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        {/* Login button */}
        <button
          className={`login-button ${loading ? 'loading' : ''}`}
          onClick={handleAutoLogin}
          disabled={loading}
        >
          {loading ? 'Загрузка...' : 'Войти'}
        </button>

        {/* Info section */}
        <div className="auth-info">
          <p className="auth-info-text">
            Приложение автоматически выберет рабочий аккаунт и подключится к вашим банкам через Open Banking API.
          </p>
        </div>
      </div>
    </div>
  )
}
