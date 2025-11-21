import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/Header';
import '../styles/TaxPaymentsPage.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * TaxPaymentsPage - Display and manage tax payments from "Мой налог"
 * 
 * Features:
 * - Sync tax payments from "Мой налог" (mock for MVP)
 * - Display list of tax payments with status
 * - Pay taxes from selected bank account
 * - Track payment status
 */
function TaxPaymentsPage() {
  const { accessToken, selectedUserIndex, selectedBank } = useAuth();
  
  const [taxPayments, setTaxPayments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedTax, setSelectedTax] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [paying, setPaying] = useState(false);
  
  // Approval popup state
  const [showApprovalPopup, setShowApprovalPopup] = useState(false);
  const [approvalData, setApprovalData] = useState(null);

  // Get user data from auth context
  const userId = selectedUserIndex ? `team286-${selectedUserIndex}` : 'team286'
  const userINN = '123456789012' // Mock INN for MVP

  // Clear cache when user changes
  useEffect(() => {
    // Clear localStorage when component mounts or user changes
    localStorage.removeItem('taxPayments')
    localStorage.removeItem('accounts')
    
    loadTaxPayments()
    loadAccounts()
  }, [userId, selectedBank])

  const loadTaxPayments = async () => {
    try {
      setLoading(true)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
      
      const response = await axios.get(`${API_BASE_URL}/v1/tax-payments`, {
        params: { user_id: userId },
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      setTaxPayments(response.data)
      setError(null)
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('Tax payments request timed out')
        setError('Истек timeout при загрузке налоговых платежей')
      } else {
        console.error('Error loading tax payments:', err)
        setError('Ошибка загрузки налоговых платежей')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadAccounts = async () => {
    try {
      if (!accessToken) {
        console.warn('No access token found')
        return
      }
      
      // Log current values
      console.log(`TaxPayments: Loading accounts with selectedUserIndex=${selectedUserIndex}, selectedBank=${selectedBank}`)
      console.log(`TaxPayments: Computed userId=${userId}`)
      
      // First, get list of user's consents from API
      let userConsents = []
      try {
        console.log(`TaxPayments: Fetching consents for ${userId}...`)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout
        
        const consentsResponse = await axios.get(`${API_BASE_URL}/api/user-consents`, {
          params: {
            user_id: userId,
            access_token: accessToken
          },
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        userConsents = consentsResponse.data.consents || []
        console.log(`TaxPayments: Found ${userConsents.length} consents:`, userConsents)
      } catch (err) {
        console.warn(`TaxPayments: Failed to get user consents:`, err.message)
        // Continue without consents - will show error message later
      }
      
      // If no consents found, show loading message
      if (userConsents.length === 0) {
        console.warn(`TaxPayments: No active consents found`)
        setError('Загружаем Ваши счета…')
        return
      }
      
      // Load accounts from each consent
      let allAccounts = []
      const loadStartTime = Date.now()
      const maxLoadTime = 5000 // 5 seconds total timeout
      
      for (const consent of userConsents) {
        // Check if we've exceeded max load time
        if (Date.now() - loadStartTime > maxLoadTime) {
          console.warn(`TaxPayments: Exceeded max load time, stopping account loads`)
          break
        }
        
        try {
          const bankId = consent.bank_id || consent.bank_name
          const consentId = consent.consent_id
          
          console.log(`TaxPayments: Fetching accounts from ${bankId} (consent: ${consentId})...`)
          
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout per request
          
          const response = await axios.get(`${API_BASE_URL}/v1/accounts`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'consent_id': consentId,
              'X-Bank-Name': bankId,
              'client_id': userId
            },
            signal: controller.signal
          })
          
          clearTimeout(timeoutId)
          let accounts = response.data.accounts || response.data || []
          console.log(`TaxPayments: Found ${accounts.length} accounts in ${bankId}`)
          
          // Load balance for each account (with timeout)
          for (let account of accounts) {
            // Skip balance loading if we're running out of time
            if (Date.now() - loadStartTime > maxLoadTime - 500) {
              console.warn(`TaxPayments: Skipping balance for ${account.accountId} - time running out`)
              account.balance = { amount: 0, currency: 'RUB' }
              account.bank_name = bankId
              account.consent_id = consentId
              allAccounts.push(account)
              continue
            }
            
            try {
              const accountId = account.accountId || account.account_id || account.id
              
              console.log(`TaxPayments: Fetching balance for account ${accountId}...`)
              
              const balanceController = new AbortController()
              const balanceTimeoutId = setTimeout(() => balanceController.abort(), 1500) // 1.5 second timeout
              
              const balanceResponse = await axios.get(
                `${API_BASE_URL}/v1/accounts/${accountId}/balances`,
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'consent_id': consentId,
                    'X-Bank-Name': bankId,
                    'client_id': userId
                  },
                  signal: balanceController.signal
                }
              )
              
              clearTimeout(balanceTimeoutId)
              
              // Add balance to account
              // Backend returns: {data: {balance: [...]}} or {balance: {...}, balances: [...]}
              // Extract balance data from response
              let balanceData = null
              
              // Check if response has data.balance (wrapped response)
              if (balanceResponse.data?.data?.balance && Array.isArray(balanceResponse.data.data.balance) && balanceResponse.data.data.balance.length > 0) {
                // Wrapped array format: {data: {balance: [...]}}
                balanceData = balanceResponse.data.data.balance[0]
              } else if (balanceResponse.data?.balance) {
                // Direct balance object
                balanceData = balanceResponse.data.balance
              } else if (balanceResponse.data?.balances && Array.isArray(balanceResponse.data.balances) && balanceResponse.data.balances.length > 0) {
                // Array of balances
                balanceData = balanceResponse.data.balances[0]
              }
              
              if (balanceData) {
                // Extract amount from nested structure: {amount: {amount: "772647.51", currency: "RUB"}}
                const amountObj = balanceData.amount
                if (typeof amountObj === 'object' && amountObj.amount) {
                  account.balance = {
                    amount: parseFloat(amountObj.amount),
                    currency: amountObj.currency || 'RUB'
                  }
                  console.log(`TaxPayments: Balance loaded: ${amountObj.amount} ${amountObj.currency}`)
                } else if (typeof amountObj === 'number' || typeof amountObj === 'string') {
                  account.balance = {
                    amount: parseFloat(amountObj),
                    currency: balanceData.currency || 'RUB'
                  }
                  console.log(`✅ TaxPayments: Balance loaded: ${amountObj} ${balanceData.currency}`)
                } else {
                  console.warn(`⚠️ TaxPayments: Invalid balance format:`, balanceData)
                  account.balance = { amount: 0, currency: 'RUB' }
                }
              } else {
                console.warn(`⚠️ TaxPayments: No balance data returned for account ${account.accountId}`)
                account.balance = { amount: 0, currency: 'RUB' }
              }
              
              // Add bank_name and consent_id to account for payment flow
              account.bank_name = bankId
              account.consent_id = consentId
              console.log(`📝 TaxPayments: Account ready for payment:`, {
                accountId: account.accountId || account.account_id,
                bank_name: account.bank_name,
                consent_id: account.consent_id,
                balance: account.balance
              })
            } catch (balanceErr) {
              if (balanceErr.name === 'AbortError') {
                console.warn(`TaxPayments: Balance request timed out for account ${accountId}`)
              } else {
                console.error(`TaxPayments: Failed to load balance for account ${accountId}:`, {
                  message: balanceErr.message,
                  response: balanceErr.response?.data,
                  status: balanceErr.response?.status
                })
              }
              // Set default balance if failed
              account.balance = { amount: 0, currency: 'RUB' }
              account.bank_name = bankId
              account.consent_id = consentId
            }
          }
          
          allAccounts = [...allAccounts, ...accounts]
        } catch (err) {
          console.error(`❌ TaxPayments: Failed to get accounts from consent:`, err.message)
          continue
        }
      }
      
      console.log(`✅ TaxPayments: Total accounts loaded: ${allAccounts.length}`)
      setAccounts(allAccounts)
      setError(null)
    } catch (err) {
      console.error('Error loading accounts:', err)
      
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка загрузки счетов'
      console.error(`📊 TaxPayments: ${errorMessage}`)
      
      // Show appropriate error
      if (err.response?.status === 403) {
        setError('Загружаем Ваши счета…')
      } else if (err.response?.status === 404) {
        setError('Загружаем Ваши счета…')
      } else {
        setError(errorMessage)
      }
    }
  }

  const handleSyncTaxes = async () => {
    try {
      setSyncing(true);
      setError(null);
      
      const response = await axios.post(`${API_BASE_URL}/v1/tax-payments/sync`, {
        user_id: userId,
        tax_inn: userINN
      });
      
      setSuccessMessage(response.data.message);
      await loadTaxPayments();
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error syncing taxes:', err);
      setError(err.response?.data?.detail || 'Ошибка синхронизации налогов');
    } finally {
      setSyncing(false);
    }
  };

  const openPaymentModal = (tax) => {
    setSelectedTax(tax);
    setSelectedAccount(null); // Reset account selection
    setShowPaymentModal(true);
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setSelectedTax(null);
    setSelectedAccount(null);
  };

  const handleApprovalRedirect = () => {
    if (approvalData?.redirectUrl) {
      console.log('🔗 TaxPayments: Redirecting to bank approval:', approvalData.redirectUrl)
      // Open in new window so user doesn't leave the app
      window.open(approvalData.redirectUrl, '_blank', 'width=800,height=600')
      // Keep popup open for user to click confirm after approval
    }
  }

  const handleApprovalConfirmed = async () => {
    if (!approvalData) return

    try {
      setApprovalData({ ...approvalData, confirming: true })
      console.log('✅ TaxPayments: User confirmed bank approval, finalizing payment...')

      // Call the confirm endpoint to fetch consent_id and submit payment
      const response = await axios.post(
        `${API_BASE_URL}/v1/tax-payments/${approvalData.taxId}/confirm-payment-approval`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      console.log('✅ TaxPayments: Payment confirmed:', response.data)
      setSuccessMessage(response.data.message || 'Платёж успешно обработан')
      
      // Close approval popup
      setShowApprovalPopup(false)
      setApprovalData(null)
      
      // Reload tax payments
      await loadTaxPayments()

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      console.error('❌ TaxPayments: Failed to confirm payment:', err)
      const errorMsg = err.response?.data?.detail || 'Ошибка при подтверждении платежа'
      setError(errorMsg)
      setApprovalData({ ...approvalData, confirming: false })
    }
  }

  const closeApprovalPopup = () => {
    setShowApprovalPopup(false)
    setApprovalData(null)
  }

  const handlePayTax = async () => {
    if (!selectedAccount || !selectedTax) {
      setError('Выберите счёт для оплаты')
      return
    }

    if (!accessToken) {
      setError('Отсутствует токен авторизации. Пожалуйста, войдите снова.')
      return
    }

    try {
      setPaying(true)
      setError(null)

      // Extract account ID and consent ID - handle both accountId and account_id
      const accountId = selectedAccount.accountId || selectedAccount.account_id
      const bankName = selectedAccount.bank_name || selectedAccount.bankName || 'abank'
      const consentId = selectedAccount.consent_id

      console.log('💳 TaxPayments: Initiating payment...', {
        accountId,
        bankName,
        consentId,
        taxAmount: selectedTax.tax_amount,
        taxId: selectedTax.id
      })

      const response = await axios.post(
        `${API_BASE_URL}/v1/tax-payments/${selectedTax.id}/pay`,
        {
          account_id: accountId,
          bank_name: bankName,
          consent_id: consentId,
          bank_token: accessToken
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      )

      console.log('✅ TaxPayments: Payment response:', response.data)

      // Check if response indicates pending approval (manual approval flow)
      if (response.data.status === 'pending_approval' && response.data.redirect_url) {
        console.log('🔐 TaxPayments: Manual approval required, showing popup...')
        setApprovalData({
          redirectUrl: response.data.redirect_url,
          requestId: response.data.request_id,
          bankName: bankName,
          taxId: selectedTax.id,
          message: response.data.message || 'Требуется подтверждение в банке'
        })
        setShowApprovalPopup(true)
        closePaymentModal()
        return
      }

      // Auto-approval flow (Abank) - direct success
      setSuccessMessage(response.data.message || 'Платёж успешно отправлен')
      await loadTaxPayments()
      closePaymentModal()

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      console.error('❌ TaxPayments: Payment error:', err)
      console.error('Error details:', err.response?.data)
      setError(err.response?.data?.detail || 'Ошибка при оплате налога')
    } finally {
      setPaying(false)
    }
  }

  const formatAmount = (amount) => {
    // Handle both numeric values and balance objects with amount property
    let numAmount = amount
    if (typeof amount === 'object' && amount !== null) {
      numAmount = amount.amount || amount.balanceAmount || 0
    }
    
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB'
    }).format(parseFloat(numAmount) || 0);
  };

  const formatPeriod = (period) => {
    const [year, month] = period.split('-');
    const monthNames = {
      '01': 'Январь', '02': 'Февраль', '03': 'Март', '04': 'Апрель',
      '05': 'Май', '06': 'Июнь', '07': 'Июль', '08': 'Август',
      '09': 'Сентябрь', '10': 'Октябрь', '11': 'Ноябрь', '12': 'Декабрь'
    };
    return `${monthNames[month]} ${year}`;
  };

  const getStatusLabel = (status) => {
    const statusMap = {
      pending: 'Ожидает оплаты',
      processing: 'Обрабатывается',
      paid: 'Оплачен',
      failed: 'Ошибка'
    };
    return statusMap[status] || status;
  };

  const getStatusClass = (status) => {
    return `status-badge status-${status}`;
  };

  if (loading) {
    return (
      <div className="tax-payments-page">
        <div className="loading-message">Загрузка налоговых платежей...</div>
      </div>
    );
  }

  // Check if user is selected
  if (!selectedUserIndex) {
    return (
      <div className="tax-payments-page">
        <div className="page-header">
          <div className="header-left">
            <h1>Налоговые платежи</h1>
            <p className="header-subtitle">Интеграция с приложением "Мой налог"</p>
          </div>
        </div>
        <div className="alert alert-error">
          ❌ Пожалуйста, выберите пользователя на странице аутентификации
        </div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <div className="tax-payments-page">
        <div className="page-header">
          <div className="header-left">
            <h1>Налоговые платежи</h1>
            <p className="header-subtitle">Интеграция с приложением "Мой налог"</p>
          </div>
          <button 
            className="btn-sync"
            onClick={handleSyncTaxes}
            disabled={syncing}
          >
            {syncing ? '⏳ Синхронизация...' : '🔄 Синхронизировать налоги'}
          </button>
        </div>

      {error && (
        <div className="alert alert-error">
          ❌ {error}
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success">
          ✅ {successMessage}
        </div>
      )}

      {taxPayments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>Нет налоговых платежей</h3>
          <p>Нажмите "Синхронизировать налоги" для загрузки данных из "Мой налог"</p>
        </div>
      ) : (
        <>
          {/* Pending/Failed/Processing Taxes Section */}
          {(() => {
            const unpaidTaxes = taxPayments.filter(t => 
              t.status === 'pending' || t.status === 'failed' || t.status === 'processing'
            )
            return unpaidTaxes.length > 0 ? (
              <div className="tax-section">
                <h2 className="section-title">Ожидают оплаты ({unpaidTaxes.length})</h2>
                <div className="tax-list">
                  {unpaidTaxes.map((tax) => (
                    <div key={tax.id} className="tax-card">
                      <div className="tax-card-header">
                        <div className="tax-period">
                          <span className="period-label">Период:</span>
                          <span className="period-value">{formatPeriod(tax.tax_period)}</span>
                        </div>
                        <div className={getStatusClass(tax.status)}>
                          {getStatusLabel(tax.status)}
                        </div>
                      </div>

                      <div className="tax-card-body">
                        <div className="tax-amount">
                          <span className="amount-label">Сумма налога:</span>
                          <span className="amount-value">{formatAmount(tax.tax_amount)}</span>
                        </div>

                        <div className="tax-purpose">
                          <span className="purpose-label">Назначение платежа:</span>
                          <p className="purpose-text">{tax.payment_purpose}</p>
                        </div>

                        {tax.error_message && (
                          <div className="error-info">
                            <span className="error-icon">⚠️</span>
                            <span className="error-text">{tax.error_message}</span>
                          </div>
                        )}
                      </div>

                      <div className="tax-card-footer">
                        {(tax.status === 'pending' || tax.status === 'processing') && (
                          <button
                            className="btn-pay"
                            onClick={() => openPaymentModal(tax)}
                          >
                            💳 Оплатить налог
                          </button>
                        )}
                        {tax.status === 'failed' && (
                          <button
                            className="btn-retry"
                            onClick={() => openPaymentModal(tax)}
                          >
                            🔄 Повторить оплату
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          })()}

          {/* Paid Taxes Section */}
          {(() => {
            const paidTaxes = taxPayments.filter(t => t.status === 'paid')
            return paidTaxes.length > 0 ? (
              <div className="tax-section">
                <h2 className="section-title">Оплаченные налоги ({paidTaxes.length})</h2>
                <div className="tax-list">
                  {paidTaxes.map((tax) => (
                    <div key={tax.id} className="tax-card paid">
                      <div className="tax-card-header">
                        <div className="tax-period">
                          <span className="period-label">Период:</span>
                          <span className="period-value">{formatPeriod(tax.tax_period)}</span>
                        </div>
                        <div className={getStatusClass(tax.status)}>
                          {getStatusLabel(tax.status)}
                        </div>
                      </div>

                      <div className="tax-card-body">
                        <div className="tax-amount">
                          <span className="amount-label">Сумма налога:</span>
                          <span className="amount-value">{formatAmount(tax.tax_amount)}</span>
                        </div>

                        <div className="tax-purpose">
                          <span className="purpose-label">Назначение платежа:</span>
                          <p className="purpose-text">{tax.payment_purpose}</p>
                        </div>

                        <div className="payment-details">
                          {tax.payment_date && (
                            <div className="payment-info">
                              <span className="info-label">📅 Дата оплаты:</span>
                              <span className="info-value">
                                {new Date(tax.payment_date).toLocaleDateString('ru-RU', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          )}

                          {tax.bank_name && (
                            <div className="payment-info">
                              <span className="info-label">🏦 Банк:</span>
                              <span className="info-value">{tax.bank_name.toUpperCase()}</span>
                            </div>
                          )}

                          {tax.account_id && (
                            <div className="payment-info">
                              <span className="info-label">💳 Счёт:</span>
                              <span className="info-value">{tax.account_id}</span>
                            </div>
                          )}

                          {tax.payment_id && (
                            <div className="payment-info">
                              <span className="info-label">🔖 ID платежа:</span>
                              <span className="info-value payment-id">{tax.payment_id}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          })()}
        </>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedTax && (
        <div className="modal-overlay" onClick={closePaymentModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Оплата налога</h2>
              <button className="modal-close" onClick={closePaymentModal}>×</button>
            </div>

            <div className="modal-body">
              <div className="payment-summary">
                <div className="summary-row">
                  <span className="summary-label">Период:</span>
                  <span className="summary-value">{formatPeriod(selectedTax.tax_period)}</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Сумма:</span>
                  <span className="summary-value amount-highlight">
                    {formatAmount(selectedTax.tax_amount)}
                  </span>
                </div>
              </div>

              <div className="account-selection">
                <label className="selection-label">Выберите счёт для оплаты:</label>
                {accounts.length === 0 ? (
                  <p className="no-accounts">Загружаем Ваши счета…</p>
                ) : (
                  <>
                    {/* Show bank selection first */}
                    <div className="bank-selection">
                      <label className="selection-label" style={{ fontSize: '13px', marginBottom: '8px' }}>Выберите банк:</label>
                      <div className="banks-list" style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
                        {[...new Set(accounts.map(acc => acc.bank_name || acc.bankName))].map(bankName => (
                          <button
                            key={bankName}
                            className={`bank-select-btn ${selectedAccount?.bank_name === bankName || selectedAccount?.bankName === bankName ? 'active' : ''}`}
                            onClick={() => setSelectedAccount(null)}
                            style={{
                              padding: '8px 16px',
                              border: selectedAccount?.bank_name === bankName || selectedAccount?.bankName === bankName ? '2px solid #4CAF50' : '2px solid #ddd',
                              borderRadius: '6px',
                              backgroundColor: selectedAccount?.bank_name === bankName || selectedAccount?.bankName === bankName ? '#f1f8f4' : '#fff',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              fontSize: '12px',
                              color: '#1A2233'
                            }}
                          >
                            {bankName?.toUpperCase() || 'unknown'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Show accounts only for selected bank or first bank */}
                    <div className="accounts-list">
                      {accounts
                        .filter(acc => {
                          const bankName = acc.bank_name || acc.bankName
                          const selectedBankName = selectedAccount?.bank_name || selectedAccount?.bankName
                          // Show all banks' accounts if no bank selected, otherwise filter by selected bank
                          return !selectedBankName || bankName === selectedBankName
                        })
                        .map((account) => {
                          // Handle both accountId and account_id
                          const accountId = account.accountId || account.account_id
                          const selectedAccountId = selectedAccount?.accountId || selectedAccount?.account_id
                          
                          return (
                            <div
                              key={`${account.bank_name || account.bankName}-${accountId}`}
                              className={`account-option ${selectedAccountId === accountId ? 'selected' : ''}`}
                              onClick={() => setSelectedAccount(account)}
                            >
                              <div className="account-info">
                                <div className="account-name">{account.account_name || account.name || accountId}</div>
                                <div className="account-balance">
                                  {formatAmount(account.balance?.amount || 0)}
                                </div>
                              </div>
                              <div className="account-bank">{(account.bank_name || account.bankName || 'unknown').toUpperCase()}</div>
                            </div>
                          )
                        })}
                    </div>
                  </>
                )}
              </div>

              {error && (
                <div className="modal-error">
                  ❌ {error}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn-cancel"
                onClick={closePaymentModal}
                disabled={paying}
              >
                Отмена
              </button>
              <button
                className="btn-confirm"
                onClick={handlePayTax}
                disabled={!selectedAccount || paying}
              >
                {paying ? '⏳ Оплата...' : '✓ Оплатить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank Approval Popup */}
      {showApprovalPopup && approvalData && (
        <div className="modal-overlay" onClick={closeApprovalPopup}>
          <div className="modal-content approval-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📱 Подтверждение платежа</h2>
            </div>

            <div className="modal-body">
              <div className="approval-message">
                <p>{approvalData.message}</p>
                <p style={{ marginTop: '12px', fontSize: '14px', color: '#666' }}>
                  Нажмите кнопку ниже, чтобы перейти на сайт {approvalData.bankName?.toUpperCase() || 'банка'} и подтвердить платёж.
                </p>
              </div>

              <div className="approval-actions" style={{ 
                display: 'flex', 
                gap: '10px', 
                margin: '20px 0',
                flexDirection: 'column'
              }}>
                <button
                  className="btn-bank-redirect"
                  onClick={handleApprovalRedirect}
                  style={{
                    padding: '12px 20px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}
                >
                  🔐 Перейти на сайт {approvalData.bankName?.toUpperCase() || 'банка'}
                </button>
              </div>

              <div className="approval-info" style={{
                backgroundColor: '#f5f5f5',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#666',
                marginTop: '15px',
                lineHeight: '1.5'
              }}>
                <strong>ℹ️ Что дальше:</strong>
                <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                  <li>Откроется новое окно с сайтом банка</li>
                  <li>Подтвердите платёж в ЛК банка</li>
                  <li>Вернитесь сюда и нажмите кнопку "Платёж подтвержден"</li>
                </ol>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-cancel"
                onClick={closeApprovalPopup}
                disabled={approvalData.confirming}
              >
                Отмена
              </button>
              <button
                className="btn-confirm"
                onClick={handleApprovalConfirmed}
                disabled={approvalData.confirming}
              >
                {approvalData.confirming ? '⏳ Обработка...' : '✅ Платёж подтвержден'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

export default TaxPaymentsPage;
