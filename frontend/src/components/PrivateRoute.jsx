import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * PrivateRoute Component
 * Protects routes that require authentication
 * 
 * Usage:
 *   <Route element={<PrivateRoute><YourComponent /></PrivateRoute>} />
 */
export function PrivateRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth()

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#FFFFFF',
        color: '#1A2233',
        fontFamily: 'Oswald, sans-serif',
        fontSize: '18px'
      }}>
        ⏳ Загружаем...
      </div>
    )
  }

  // If not authenticated, redirect to /auth
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />
  }

  // If authenticated, render the component
  return children
}
