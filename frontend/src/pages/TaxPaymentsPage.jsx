import React, { useState, useEffect } from 'react';
import axios from 'axios';
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

  // Get user data from localStorage
  const userId = localStorage.getItem('userId') || 'team286-1';
  const bankToken = localStorage.getItem('bankToken');
  const userINN = '123456789012'; // Mock INN for MVP

  useEffect(() => {
    loadTaxPayments();
    loadAccounts();
  }, []);

  const loadTaxPayments = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/v1/tax-payments`, {
        params: { user_id: userId }
      });
      setTaxPayments(response.data);
      setError(null);
    } catch (err) {
      console.error('Error loading tax payments:', err);
      setError('Ошибка загрузки налоговых платежей');
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      // Load accounts from localStorage (assuming they were fetched earlier)
      const storedAccounts = localStorage.getItem('accounts');
      if (storedAccounts) {
        setAccounts(JSON.parse(storedAccounts));
      }
    } catch (err) {
      console.error('Error loading accounts:', err);
    }
  };

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
    setShowPaymentModal(true);
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setSelectedTax(null);
    setSelectedAccount(null);
  };

  const handlePayTax = async () => {
    if (!selectedAccount || !selectedTax) {
      setError('Выберите счёт для оплаты');
      return;
    }

    if (!bankToken) {
      setError('Отсутствует токен авторизации. Пожалуйста, войдите снова.');
      return;
    }

    try {
      setPaying(true);
      setError(null);

      const response = await axios.post(
        `${API_BASE_URL}/v1/tax-payments/${selectedTax.id}/pay`,
        {
          account_id: selectedAccount.account_id,
          bank_name: selectedAccount.bank_name,
          bank_token: bankToken
        }
      );

      setSuccessMessage(response.data.message);
      await loadTaxPayments();
      closePaymentModal();

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error paying tax:', err);
      setError(err.response?.data?.detail || 'Ошибка при оплате налога');
    } finally {
      setPaying(false);
    }
  };

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB'
    }).format(amount);
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

  return (
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
        <div className="tax-list">
          {taxPayments.map((tax) => (
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

                {tax.payment_date && (
                  <div className="payment-info">
                    <span className="info-label">Дата оплаты:</span>
                    <span className="info-value">
                      {new Date(tax.payment_date).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                )}

                {tax.error_message && (
                  <div className="error-info">
                    <span className="error-icon">⚠️</span>
                    <span className="error-text">{tax.error_message}</span>
                  </div>
                )}
              </div>

              <div className="tax-card-footer">
                {tax.status === 'pending' && (
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
                  <p className="no-accounts">Нет доступных счетов. Подключите банк в разделе "Счета".</p>
                ) : (
                  <div className="accounts-list">
                    {accounts.map((account) => (
                      <div
                        key={account.account_id}
                        className={`account-option ${selectedAccount?.account_id === account.account_id ? 'selected' : ''}`}
                        onClick={() => setSelectedAccount(account)}
                      >
                        <div className="account-info">
                          <div className="account-name">{account.account_name || account.account_id}</div>
                          <div className="account-balance">
                            {formatAmount(account.balance?.amount || 0)}
                          </div>
                        </div>
                        <div className="account-bank">{account.bank_name?.toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
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
    </div>
  );
}

export default TaxPaymentsPage;
