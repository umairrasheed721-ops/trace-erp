import { createContext, useContext } from 'react'

export const AppContext = createContext(null)

export const useApp = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

export function useToast() {
  const { addToast } = useApp()
  return addToast
}
