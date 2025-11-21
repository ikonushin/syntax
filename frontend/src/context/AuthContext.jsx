import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

// Create Auth Context
const AuthContext = createContext(null)

// AuthProvider component
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [selectedUserIndex, setSelectedUserIndex] = useState(null)
  const [selectedBank, setSelectedBank] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load auth data from localStorage on mount
  useEffect(() => {
    const storedAuth = localStorage.getItem('syntax_auth')
    const storedToken = localStorage.getItem('accessToken')
    
    if (storedAuth && storedToken) {
      try {
        const parsed = JSON.parse(storedAuth)
        setUser(parsed.user)
        setAccessToken(storedToken)
        setSelectedUserIndex(parsed.selectedUserIndex)
        setSelectedBank(parsed.selectedBank)
        console.log('AUTH: Restored session from localStorage')
      } catch (err) {
        console.error('AUTH: Failed to parse stored auth:', err)
        localStorage.removeItem('syntax_auth')
        localStorage.removeItem('accessToken')
      }
    }
    setIsLoading(false)
  }, [])

  // Persist auth to localStorage whenever it changes
  useEffect(() => {
    if (user && accessToken) {
      const authData = {
        user,
        selectedUserIndex,
        selectedBank
      }
      localStorage.setItem('syntax_auth', JSON.stringify(authData))
      localStorage.setItem('accessToken', accessToken)
      
      // Set JWT in axios default headers
      axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
    }
  }, [user, accessToken, selectedUserIndex, selectedBank])

  const login = (userData, token) => {
    setUser(userData)
    setAccessToken(token)
    console.log('AUTH: User logged in with JWT')
  }

  const logout = () => {
    setUser(null)
    setAccessToken(null)
    setSelectedUserIndex(null)
    setSelectedBank(null)
    localStorage.removeItem('syntax_auth')
    localStorage.removeItem('accessToken')
    
    // Remove JWT from axios headers
    try {
      delete axios.defaults.headers.common['Authorization']
    } catch (err) {
      // axios not yet loaded
    }
    console.log('AUTH: User logged out')
  }

  const isAuthenticated = () => {
    return user !== null && accessToken !== null
  }

  const selectBank = (userIdx, bankId) => {
    setSelectedUserIndex(userIdx)
    setSelectedBank(bankId)
  }

  const selectUserBank = (userIdx, bankId) => {
    setSelectedUserIndex(userIdx)
    setSelectedBank(bankId)
  }

  const refreshToken = async (newToken) => {
    setAccessToken(newToken)
    localStorage.setItem('accessToken', newToken)
    console.log('AUTH: Token refreshed')
  }

  const value = {
    user,
    accessToken,
    selectedUserIndex,
    selectedBank,
    isAuthenticated: isAuthenticated(),
    isLoading,
    login,
    logout,
    selectBank,
    selectUserBank,
    refreshToken
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// Custom hook to use Auth Context
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
