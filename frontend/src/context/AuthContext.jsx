import React, { createContext, useContext, useState, useEffect } from 'react'

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
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth)
        setUser(parsed.user)
        setAccessToken(parsed.accessToken)
        setSelectedUserIndex(parsed.selectedUserIndex)
        setSelectedBank(parsed.selectedBank)
      } catch (err) {
        console.error('❌ AUTH: Failed to parse stored auth:', err)
        localStorage.removeItem('syntax_auth')
      }
    }
    setIsLoading(false)
  }, [])

  // Persist auth to localStorage whenever it changes
  useEffect(() => {
    if (user && accessToken) {
      const authData = {
        user,
        accessToken,
        selectedUserIndex,
        selectedBank
      }
      localStorage.setItem('syntax_auth', JSON.stringify(authData))
    }
  }, [user, accessToken, selectedUserIndex, selectedBank])

  const login = (userData, token) => {
    setUser(userData)
    setAccessToken(token)
  }

  const logout = () => {
    setUser(null)
    setAccessToken(null)
    setSelectedUserIndex(null)
    setSelectedBank(null)
    localStorage.removeItem('syntax_auth')
  }

  const isAuthenticated = () => {
    return user !== null && accessToken !== null
  }

  const selectBank = (userIdx, bankId) => {
    setSelectedUserIndex(userIdx)
    setSelectedBank(bankId)
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
    selectBank
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
