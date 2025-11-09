import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { PrivateRoute } from './components/PrivateRoute'
import { AuthPage } from './pages/AuthPage'
import { BanksPage } from './pages/BanksPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { ReceiptsPage } from './pages/ReceiptsPage'
import { DashboardPage } from './pages/DashboardPage'
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

      {/* Catch-all: Redirect to Auth */}
      <Route path="/" element={<Navigate to="/auth" replace />} />
      <Route path="*" element={<Navigate to="/auth" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
