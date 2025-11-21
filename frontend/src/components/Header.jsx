import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/Header.css'

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/auth')
  }

  const handleBack = () => {
    // If on dashboard, go to first sub-page or stay on dashboard
    if (location.pathname === '/dashboard') {
      // Stay on dashboard or navigate to a default page
      return
    }
    navigate('/dashboard')
  }

  return (
    <div className="header-wrapper">
      <div className="header-container">
        {location.pathname !== '/dashboard' && (
          <button
            className="header-btn header-back"
            onClick={handleBack}
            title="Назад на главную"
          >
            ← НАЗАД
          </button>
        )}

        {location.pathname === '/dashboard' && (
          <button
            className="header-btn header-transactions"
            onClick={() => navigate('/transactions')}
            title="Транзакции"
          >
            ТРАНЗАКЦИИ
          </button>
        )}

        {location.pathname === '/dashboard' && (
          <button
            className="header-btn header-receipts"
            onClick={() => navigate('/receipts')}
            title="Чеки"
          >
            ЧЕКИ
          </button>
        )}

        {location.pathname === '/dashboard' && (
          <button
            className="header-btn header-tax"
            onClick={() => navigate('/tax-payments')}
            title="Налоги"
          >
            НАЛОГИ
          </button>
        )}

        {location.pathname !== '/dashboard' && (
          <button
            className="header-btn header-banks"
            onClick={() => navigate('/banks')}
            title="Банки"
          >
            БАНКИ
          </button>
        )}

        <button
          className="header-btn header-settings"
          onClick={() => navigate('/settings')}
          title="Настройки"
        >
          НАСТРОЙКИ
        </button>

        <button
          className="header-btn header-logout"
          onClick={handleLogout}
          title="Выход"
        >
          ВЫЙТИ
        </button>
      </div>
    </div>
  )
}
