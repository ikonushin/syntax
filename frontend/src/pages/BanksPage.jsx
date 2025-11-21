import React, { useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Header } from '../components/Header'
import '../styles/BanksPage.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function BanksPage() {
  const navigate = useNavigate()
  const { user, accessToken, selectedUserIndex, selectBank, logout } = useAuth()
  
  const [selectedBank, setSelectedBankState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [consentSuccess, setConsentSuccess] = useState(null)
  const [sbankModal, setSbankModal] = useState(null) // For SBank/VBank approval flow

  const banks = [
    { id: 'vbank', name: 'VBank', icon: '🏦', color: '#1A73E8' },
    { id: 'abank', name: 'ABank', icon: '💳', color: '#4CAF50' },
    { id: 'sbank', name: 'SBank', icon: '🏛️', color: '#FF6F00' }
  ]

  const handleBankConnect = async (bankId) => {
    setLoading(true)
    setError(null)
    setSelectedBankState(bankId)

    try {
      const fullClientId = `team286-${selectedUserIndex}`
      console.log(`BANKS: Подключение банка ${bankId} для пользователя ${fullClientId}`)

      const payload = {
        bank_id: bankId,
        user_id: fullClientId
      }

      const response = await axios.post(`${API_URL}/api/consents`, payload, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      console.log('BANKS: Consent created:', response.data)
      console.log('DEBUG: response.data.status =', response.data.status)
      console.log('DEBUG: bankId =', bankId)
      console.log('DEBUG: Condition check:', bankId === 'sbank', 'AND', response.data.status === 'pending')

      // Update selected bank
      selectBank(selectedUserIndex, bankId)

      // Handle bank-specific flows
      if ((bankId === 'sbank' || bankId === 'vbank') && response.data.status === 'pending') {
        // SBank/VBank manual approval flow - open redirect URL in new tab
        console.log(`BANKS: ${bankId.toUpperCase()} requires manual approval`)
        
        // Store info for modal
        setSbankModal({
          consentId: response.data.consent_id,
          requestId: response.data.request_id,
          redirectUrl: response.data.redirect_url,
          status: 'awaiting_approval',
          accessToken: accessToken,
          bankId: bankId
        })
        
        console.log('BANKS: Modal state set:', {
          consentId: response.data.consent_id,
          requestId: response.data.request_id,
          redirectUrl: response.data.redirect_url
        })
        
        // Open approval link in new tab
        if (response.data.redirect_url) {
          window.open(response.data.redirect_url, '_blank')
          console.log(`BANKS: Opened ${bankId.toUpperCase()} approval URL in new tab`)
        }
      } else {
        // Поток автоматического одобрения ABank
        // Сохранение информации согласия для страницы транзакций
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('consentId', response.data.consent_id)
        localStorage.setItem('selectedBank', bankId)
        localStorage.setItem('userId', fullClientId)
        
        setConsentSuccess(`Банк ${bankId.toUpperCase()} подключен!`)
        console.log('BANKS: Перенаправление к транзакциям')
        setTimeout(() => {
          navigate('/transactions')
        }, 1500)
      }
    } catch (err) {
      console.error('BANKS: Ошибка:', err)
      setError(err.response?.data?.detail || `Ошибка подключения ${bankId}`)
      setSelectedBankState(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSbankApproval = async (approved) => {
    if (approved) {
      try {
        setLoading(true)
        console.log('BANKS: Пользователь подтвердил одобрение, получение consent_id из request_id...')
        console.log('BANKS: Request ID:', sbankModal.requestId)
        console.log('BANKS: Bank ID:', sbankModal.bankId)
        console.log('BANKS: Access Token:', sbankModal.accessToken?.substring(0, 50) + '...')
        
        // Для SBank: используем request_id для получения actual consent_id
        const consentLookupId = sbankModal.requestId || sbankModal.consentId
        
        console.log('BANKS: Отправка GET запроса к /api/consents/' + consentLookupId)
        
        // GET запрос для получения actual consent_id из request_id
        const checkResponse = await axios.get(
          `${API_URL}/api/consents/${consentLookupId}`,
          {
            headers: {
              'Authorization': `Bearer ${sbankModal.accessToken}`
            },
            params: {
              bank_id: sbankModal.bankId,
              user_id: `team286-${selectedUserIndex}`
            }
          }
        )
        
        console.log('BANKS: Ответ согласия:', checkResponse.data)
        
        // Check if consent is approved
        const consentStatus = checkResponse.data.status
        const returnedConsentId = checkResponse.data.consent_id || consentLookupId
        
        console.log('BANKS: Consent status:', consentStatus)
        console.log('BANKS: Returned consent_id:', returnedConsentId)
        
        if (consentStatus === 'pending' || consentStatus === 'awaitingAuthorization') {
          setError('⚠️ Согласие ещё не подтверждено в SBank. Пожалуйста, подтвердите в открывшейся вкладке браузера.')
          setLoading(false)
          return
        }
        
        if (consentStatus !== 'approved' && consentStatus !== 'authorized' && consentStatus !== 'success') {
          setError(`Согласие имеет статус "${consentStatus}". Требуется повторное подключение.`)
          setSbankModal(null)
          setSelectedBankState(null)
          setLoading(false)
          return
        }
        
        // Store consent info for transactions page - use the returned consent_id
        localStorage.setItem('accessToken', sbankModal.accessToken)
        localStorage.setItem('consentId', returnedConsentId)
        localStorage.setItem('selectedBank', sbankModal.bankId)
        localStorage.setItem('userId', `team286-${selectedUserIndex}`)
        
        setConsentSuccess('SBank подключен! Переход к транзакциям...')
        console.log('BANKS: Перенаправление к транзакциям с consent_id:', returnedConsentId)
        
        // Очистка состояния модалльного окна перед навигацией
        setSbankModal(null)
        
        setTimeout(() => {
          navigate('/transactions')
        }, 1500)
      } catch (err) {
        console.error('BANKS: Ошибка проверки согласия:', err)
        const errorMsg = err.response?.data?.detail || err.message || 'Не удалось проверить статус согласия'
        setError(errorMsg)
      } finally {
        setLoading(false)
      }
    } else {
      setError('Подключение к SBank отменено')
      setSbankModal(null)
      setSelectedBankState(null)
    }
  }

  return (
    <div className="banks-wrapper">
      <Header />
      
      {/* Заголовок */}
      <div className="banks-header">
        <div className="banks-header-left">
          <h1>ВЫБОР БАНКА</h1>
          <p>Подключите банковский счет (Пользователь: team286-{selectedUserIndex})</p>
        </div>
      </div>

      {/* Основное содержимое */}
      <div className="banks-content">
        {/* Выбор банка */}
        <div className="section">
          <h2 className="section-title">Доступные банки</h2>
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
                  disabled={loading}
                >
                  {loading && selectedBank === bank.id ? '⏳ Подключение...' : 'Подключить'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Сообщения */}
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

      {/* Модальное окно подтверждения SBank/VBank */}
      {sbankModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>SBank - Подтверждение подключения</h2>
            <p>
              Окно подтверждения открыто в новой вкладке. Пожалуйста, подтвердите подключение в браузере.
            </p>
            
            <div className="modal-info">
              <p><strong>ID запроса:</strong> {sbankModal.consentId}</p>
              {sbankModal.redirectUrl && (
                <p>
                  <strong>Ссылка подтверждения:</strong>{' '}
                  <a href={sbankModal.redirectUrl} target="_blank" rel="noreferrer">
                    Открыть в {sbankModal.bankId.toUpperCase()}
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
                {loading ? 'Проверяем...' : 'Я подтвердил подключение'}
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
