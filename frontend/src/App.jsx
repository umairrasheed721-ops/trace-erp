import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useApp } from './context/AppContext'
import AppProvider from './context/AppProvider'

import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import ToastContainer from './components/ToastContainer'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Orders = lazy(() => import('./pages/Orders'))
const SearchTool = lazy(() => import('./pages/SearchTool'))
const StuckMonitor = lazy(() => import('./pages/StuckMonitor'))
const AdviceMonitor = lazy(() => import('./pages/AdviceMonitor'))
const Watchdog = lazy(() => import('./pages/Watchdog'))
const ReturnsManager = lazy(() => import('./pages/ReturnsManager'))
const FinanceManager = lazy(() => import('./pages/FinanceManager'))
const Reports = lazy(() => import('./pages/Reports'))
const CourierIntelligence = lazy(() => import('./pages/CourierIntelligence'))
const Connect = lazy(() => import('./pages/Connect'))
const Login = lazy(() => import('./pages/Login'))
const Users = lazy(() => import('./pages/Users'))
const Profile = lazy(() => import('./pages/Profile'))

function AppContent() {
  const { token, sidebarCollapsed, toasts } = useApp()

  if (!token) {
    return (
      <>
        <Suspense fallback={<div className="loading-screen"><span className="loading-spinner"></span></div>}>
          <Login />
        </Suspense>
        <ToastContainer toasts={toasts} />
      </>
    )
  }

  return (
    <BrowserRouter>
      <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${localStorage.getItem('search_compact') === 'true' ? 'ultra-compact-mode' : ''}`}>
        <Sidebar />
        <div className="main-content">
          <Topbar />
          <div className="page-content">
            <Suspense fallback={<div className="loading-screen"><span className="loading-spinner"></span></div>}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/search" element={<SearchTool />} />
                <Route path="/returns" element={<ReturnsManager />} />
                <Route path="/finance" element={<FinanceManager />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/intelligence" element={<CourierIntelligence />} />
                <Route path="/stuck" element={<StuckMonitor />} />
                <Route path="/advice" element={<AdviceMonitor />} />
                <Route path="/watchdog" element={<Watchdog />} />
                <Route path="/connect" element={<Connect />} />
                <Route path="/users" element={<Users />} />
                <Route path="/profile" element={<Profile />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </div>
      <ToastContainer toasts={toasts} />
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
