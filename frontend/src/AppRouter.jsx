import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { PrivateRoute } from './components/PrivateRoute'
import { AuthPage } from './pages/AuthPage'
import { BanksPage } from './pages/BanksPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { ReceiptsPage } from './pages/ReceiptsPage'
import { DashboardPage } from './pages/DashboardPage'
import TaxPaymentsPage from './pages/TaxPaymentsPage'
import SettingsPage from './pages/SettingsPage'
import api from './api/axiosConfig'
import './styles/PageShared.css'
import './index.css'

function AppRoutes() {
  return (
    <Routes>
      {/* Public Route: Auth Page */}
      <Route path="/auth" element={<AuthPage />} />

      {/* Protected Routes */}
      <Route
        path="/banks"
        element={
          <PrivateRoute>
            <BanksPage />
          </PrivateRoute>
        }
      />

      <Route
        path="/transactions"
        element={
          <PrivateRoute>
            <TransactionsPage />
          </PrivateRoute>
        }
      />

      <Route
        path="/receipts"
        element={
          <PrivateRoute>
            <ReceiptsPage />
          </PrivateRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <DashboardPage />
          </PrivateRoute>
        }
      />

      <Route
        path="/tax-payments"
        element={
          <PrivateRoute>
            <TaxPaymentsPage />
          </PrivateRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <SettingsPage />
          </PrivateRoute>
        }
      />

      {/* Catch-all: Redirect to Auth */}
      <Route path="/" element={<Navigate to="/auth" replace />} />
      <Route path="*" element={<Navigate to="/auth" replace />} />
    </Routes>
  )
}

function App() {
  useEffect(() => {
    // Initialize JWT in axios from localStorage
    const token = localStorage.getItem('accessToken')
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      console.log('AUTH: JWT token loaded from localStorage')
    }
  }, [])

  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
