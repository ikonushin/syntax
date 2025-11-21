import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { PrivateRoute } from './components/PrivateRoute'
import { ErrorBoundary } from './components/ErrorBoundary'
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
          <ErrorBoundary>
            <PrivateRoute>
              <TransactionsPage />
            </PrivateRoute>
          </ErrorBoundary>
        }
      />

      <Route
        path="/receipts"
        element={
          <ErrorBoundary>
            <PrivateRoute>
              <ReceiptsPage />
            </PrivateRoute>
          </ErrorBoundary>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ErrorBoundary>
            <PrivateRoute>
              <DashboardPage />
            </PrivateRoute>
          </ErrorBoundary>
        }
      />

      <Route
        path="/tax-payments"
        element={
          <ErrorBoundary>
            <PrivateRoute>
              <TaxPaymentsPage />
            </PrivateRoute>
          </ErrorBoundary>
        }
      />

      <Route
        path="/settings"
        element={
          <ErrorBoundary>
            <PrivateRoute>
              <SettingsPage />
            </PrivateRoute>
          </ErrorBoundary>
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
