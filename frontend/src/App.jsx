import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useApp } from './context/AppContext'
import AppProvider from './context/AppProvider'

import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import ToastContainer from './components/ToastContainer'
import ErrorBoundary from './components/ErrorBoundary'

const Dashboard = lazy(() => import('./pages/Dashboard'))
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
const CostManager = lazy(() => import('./pages/CostManager'))
const PreventionManager = lazy(() => import('./pages/PreventionManager'))
const MarketingIntelligence = lazy(() => import('./pages/MarketingIntelligence'))
const WhatsAppBot = lazy(() => import('./pages/WhatsAppBot'))
const TemplateManager = lazy(() => import('./pages/TemplateManager'))
const DiagnosticCenter = lazy(() => import('./pages/DiagnosticCenter'))

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
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/search" element={<SearchTool />} />
                  <Route path="/returns" element={<ReturnsManager />} />
                  <Route path="/whatsapp-bot" element={<WhatsAppBot />} />
                  <Route path="/whatsapp-templates" element={<TemplateManager />} />
                  <Route path="/finance" element={<FinanceManager />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/intelligence" element={<CourierIntelligence />} />
                  <Route path="/stuck" element={<StuckMonitor />} />
                  <Route path="/advice" element={<AdviceMonitor />} />
                  <Route path="/watchdog" element={<Watchdog />} />
                  <Route path="/connect" element={<Connect />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/costing" element={<CostManager />} />
                  <Route path="/prevention" element={<PreventionManager />} />
                  <Route path="/marketing" element={<MarketingIntelligence />} />
                  <Route path="/diagnostics" element={<DiagnosticCenter />} />
                </Routes>
              </ErrorBoundary>
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
