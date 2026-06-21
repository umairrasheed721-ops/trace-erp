import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useApp } from './context/AppContext'
import AppProvider from './context/AppProvider'
import { TenantProvider } from './context/TenantContext'
import { QuoteDraftProvider } from './context/QuoteDraftContext'
import { FinanceProvider } from './context/FinanceContext'
import { RoutePersistenceProvider, RoutePersistenceWatcher } from './context/RoutePersistenceContext'

import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import ToastContainer from './components/ToastContainer'
import ErrorBoundary from './components/ErrorBoundary'

const lazyWithRetry = (componentImport, componentName) =>
  lazy(async () => {
    const pageHasReloadedKey = `page-reloaded-${componentName}`;
    try {
      const result = await componentImport();
      try {
        sessionStorage.removeItem(pageHasReloadedKey);
      } catch (e) {}
      return result;
    } catch (error) {
      console.error(`Dynamic import failed for ${componentName}:`, error);
      let hasReloaded = false;
      try {
        hasReloaded = !!sessionStorage.getItem(pageHasReloadedKey);
      } catch (e) {}
      if (!hasReloaded) {
        try {
          sessionStorage.setItem(pageHasReloadedKey, 'true');
        } catch (e) {}
        console.log(`Forcing page reload to fetch new bundles for ${componentName}...`);
        window.location.reload();
        return new Promise(() => {});
      }
      throw error;
    }
  });

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'), 'Dashboard')
const SearchTool = lazyWithRetry(() => import('./pages/SearchTool'), 'SearchTool')
const StuckMonitor = lazyWithRetry(() => import('./pages/StuckMonitor'), 'StuckMonitor')
const AdviceMonitor = lazyWithRetry(() => import('./pages/AdviceMonitor'), 'AdviceMonitor')
const Watchdog = lazyWithRetry(() => import('./pages/Watchdog'), 'Watchdog')
const ReturnsManager = lazyWithRetry(() => import('./pages/ReturnsManager'), 'ReturnsManager')
const FinanceManager = lazyWithRetry(() => import('./pages/FinanceManager'), 'FinanceManager')
const Reports = lazyWithRetry(() => import('./pages/Reports'), 'Reports')
const CourierIntelligence = lazyWithRetry(() => import('./pages/CourierIntelligence'), 'CourierIntelligence')
const Connect = lazyWithRetry(() => import('./pages/Connect'), 'Connect')
const Login = lazyWithRetry(() => import('./pages/Login'), 'Login')
const Users = lazyWithRetry(() => import('./pages/Users'), 'Users')
const Profile = lazyWithRetry(() => import('./pages/Profile'), 'Profile')
const CostManager = lazyWithRetry(() => import('./pages/CostManager'), 'CostManager')
const PreventionManager = lazyWithRetry(() => import('./pages/PreventionManager'), 'PreventionManager')
const MarketingIntelligence = lazyWithRetry(() => import('./pages/MarketingIntelligence'), 'MarketingIntelligence')
const WhatsAppBot = lazyWithRetry(() => import('./pages/WhatsAppBot'), 'WhatsAppBot')
const TemplateManager = lazyWithRetry(() => import('./pages/TemplateManager'), 'TemplateManager')
const DiagnosticCenter = lazyWithRetry(() => import('./pages/DiagnosticCenter'), 'DiagnosticCenter')
const SystemStatus = lazyWithRetry(() => import('./pages/SystemStatus'), 'SystemStatus')
const StatusMappingManager = lazyWithRetry(() => import('./pages/StatusMappingManager'), 'StatusMappingManager')

const PayoutReconciler = lazyWithRetry(() => import('./pages/PayoutReconciler'), 'PayoutReconciler')
const TrackingPortal = lazyWithRetry(() => import('./pages/TrackingPortal'), 'TrackingPortal')
const WhatsAppPortal = lazyWithRetry(() => import('./pages/WhatsAppPortal'), 'WhatsAppPortal')
const ReviewsManager = lazyWithRetry(() => import('./pages/ReviewsManager'), 'ReviewsManager')

function AppContent() {
  const { token, sidebarCollapsed, toasts } = useApp()

  // 🔄 Automated Cache-Buster Engine
  React.useEffect(() => {
    let currentBuildId = null;
    let isChecking = false;

    const checkVersion = async () => {
      if (isChecking) return;
      isChecking = true;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.buildId) {
            if (currentBuildId && currentBuildId !== data.buildId) {
              console.log(`✨ A new version of Trace ERP is available! Current: ${currentBuildId}, New: ${data.buildId}. Reloading...`);
              const url = new URL(window.location.href);
              url.searchParams.set('v', data.buildId);
              window.location.href = url.toString();
            } else if (!currentBuildId) {
              currentBuildId = data.buildId;
            }
          }
        }
      } catch (err) {
        console.warn('[CacheBuster] Version check failed:', err);
      } finally {
        isChecking = false;
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 60000); // Check every 60 seconds
    return () => clearInterval(interval);
  }, []);

  // Public Unauthenticated Tracking Portal Route
  if (window.location.pathname.startsWith('/track')) {
    return (
      <BrowserRouter>
        <Suspense fallback={<div className="loading-screen"><span className="loading-spinner"></span></div>}>
          <Routes>
            <Route path="/track/:slug" element={<TrackingPortal />} />
          </Routes>
        </Suspense>
        <ToastContainer toasts={toasts} />
      </BrowserRouter>
    )
  }

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
      <RoutePersistenceWatcher />
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
                  <Route path="/whatsapp-portal" element={<WhatsAppPortal />} />
                  <Route path="/whatsapp-bot" element={<WhatsAppBot />} />
                  <Route path="/whatsapp-templates" element={<TemplateManager />} />
                  <Route path="/finance" element={<FinanceManager />} />
                  <Route path="/payout-reconciler" element={<PayoutReconciler />} />
                  <Route path="/track/:slug" element={<TrackingPortal />} />
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
                  <Route path="/system-status" element={<SystemStatus />} />
                  <Route path="/status-mappings" element={<StatusMappingManager />} />
                  <Route path="/reviews" element={<ReviewsManager />} />
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
      <TenantProvider>
        <FinanceProvider>
          <QuoteDraftProvider>
            <RoutePersistenceProvider>
              <AppContent />
            </RoutePersistenceProvider>
          </QuoteDraftProvider>
        </FinanceProvider>
      </TenantProvider>
    </AppProvider>
  )
}
