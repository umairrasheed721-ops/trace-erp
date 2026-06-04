import React, { createContext, useContext, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export const RoutePersistenceContext = createContext(null)

const PATH_TO_MODULE = {
  '/reports': 'Reports',
  '/search': 'CommandCenter'
}

export const RoutePersistenceProvider = ({ children }) => {
  const modulesRef = useRef({})

  const persistModuleState = (moduleName, state) => {
    try {
      sessionStorage.setItem(`route_persist_${moduleName}`, JSON.stringify(state))
    } catch (e) {
      console.error(`[RoutePersistence] Failed to persist state for ${moduleName}:`, e)
    }
  }

  const getModuleState = (moduleName) => {
    try {
      const data = sessionStorage.getItem(`route_persist_${moduleName}`)
      return data ? JSON.parse(data) : null
    } catch (e) {
      console.error(`[RoutePersistence] Failed to get state for ${moduleName}:`, e)
      return null
    }
  }

  const registerModule = (moduleName, callbacks) => {
    modulesRef.current[moduleName] = callbacks
  }

  const unregisterModule = (moduleName) => {
    if (modulesRef.current[moduleName]) {
      delete modulesRef.current[moduleName]
    }
  }

  return (
    <RoutePersistenceContext.Provider value={{
      persistModuleState,
      getModuleState,
      registerModule,
      unregisterModule,
      modulesRef
    }}>
      {children}
    </RoutePersistenceContext.Provider>
  )
}

export const useRoutePersistence = () => {
  const context = useContext(RoutePersistenceContext)
  if (!context) {
    throw new Error('useRoutePersistence must be used within a RoutePersistenceProvider')
  }
  return context
}

export const RoutePersistenceWatcher = () => {
  const location = useLocation()
  const { modulesRef } = useRoutePersistence()
  const prevPathRef = useRef(location.pathname)

  // Detect location change during render to save departing module state before unmounting.
  const prevPath = prevPathRef.current
  const currentPath = location.pathname

  if (prevPath !== currentPath) {
    const prevModule = PATH_TO_MODULE[prevPath]
    const nextModule = PATH_TO_MODULE[currentPath]

    // Save state of the departing module
    if (prevModule && modulesRef.current[prevModule]?.saveState) {
      try {
        modulesRef.current[prevModule].saveState()
      } catch (e) {
        console.error(`[RoutePersistenceWatcher] saveState failed for ${prevModule}:`, e)
      }
    }

    // Call restoreState of the arriving module if already mounted/registered
    if (nextModule && modulesRef.current[nextModule]?.restoreState) {
      try {
        modulesRef.current[nextModule].restoreState()
      } catch (e) {
        console.error(`[RoutePersistenceWatcher] restoreState failed for ${nextModule}:`, e)
      }
    }

    prevPathRef.current = currentPath
  }

  return null
}
