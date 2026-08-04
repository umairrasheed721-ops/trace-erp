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
import { copyWithTooltip } from './utils/orderUtils'

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
const ReturnsManager = lazyWithRetry(() => import('./pages/ReturnsManager'), 'ReturnsManager')
const FinanceManager = lazyWithRetry(() => import('./pages/FinanceManager'), 'FinanceManager')
const Reports = lazyWithRetry(() => import('./pages/Reports'), 'Reports')
const CourierIntelligence = lazyWithRetry(() => import('./pages/CourierIntelligence'), 'CourierIntelligence')
const Connect = lazyWithRetry(() => import('./pages/Connect'), 'Connect')
const Login = lazyWithRetry(() => import('./pages/Login'), 'Login')
const Users = lazyWithRetry(() => import('./pages/Users'), 'Users')
const Profile = lazyWithRetry(() => import('./pages/Profile'), 'Profile')
const CostManager = lazyWithRetry(() => import('./pages/CostManager'), 'CostManager')
const TemplateManager = lazyWithRetry(() => import('./pages/TemplateManager'), 'TemplateManager')

const PayoutReconciler = lazyWithRetry(() => import('./pages/PayoutReconciler'), 'PayoutReconciler')
const TrackingPortal = lazyWithRetry(() => import('./pages/TrackingPortal'), 'TrackingPortal')
const ReviewsManager = lazyWithRetry(() => import('./pages/ReviewsManager'), 'ReviewsManager')
const AbandonedCheckouts = lazyWithRetry(() => import('./pages/AbandonedCheckouts'), 'AbandonedCheckouts')
const ExpenseManager = lazyWithRetry(() => import('./pages/ExpenseManager'), 'ExpenseManager')

import KeyboardShortcutsModal from './components/KeyboardShortcutsModal'

function AppContent() {
  const { token, sidebarCollapsed, toasts } = useApp()
  const [showShortcutsModal, setShowShortcutsModal] = React.useState(false)

  // ⌨️ Global Keyboard Hotkeys Engine
  React.useEffect(() => {
    let lastKey = '';
    let lastKeyTime = 0;

    const handleToggleEvent = () => setShowShortcutsModal(prev => !prev);
    window.addEventListener('toggle-keyboard-shortcuts', handleToggleEvent);

    const handleKeyDown = (e) => {
      const activeElement = document.activeElement;
      const isInput = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT' ||
        activeElement.isContentEditable
      );

      // 1. Cmd + K / Ctrl + K (Global Search)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('#cmd-center-keyword-input') || 
                            document.querySelector('input[placeholder*="Keyword"]') ||
                            document.querySelector('input[placeholder*="Search"]');
        if (searchInput) {
          searchInput.focus();
          if (typeof searchInput.select === 'function') searchInput.select();
        } else {
          window.location.href = '/search';
        }
        return;
      }

      // 2. Escape to close modals or shortcuts modal
      if (e.key === 'Escape') {
        setShowShortcutsModal(false);
        const closeBtn = document.querySelector('.modal-overlay button.btn-close') ||
                         document.querySelector('.modal-content button') ||
                         document.querySelector('[data-close-modal="true"]');
        if (closeBtn && typeof closeBtn.click === 'function') {
          closeBtn.click();
        }
        return;
      }

      // 3. Question mark (?) or Cmd+/ for Shortcuts Modal
      if (!isInput && (e.key === '?' || (e.metaKey && e.key === '/'))) {
        e.preventDefault();
        setShowShortcutsModal(prev => !prev);
        return;
      }

      // 4. Alt + B to toggle Sidebar
      if (!isInput && e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        const toggleBtn = document.querySelector('.sidebar-toggle-btn');
        if (toggleBtn) toggleBtn.click();
        return;
      }

      // 5. Shift + R for Refresh Page Data
      if (!isInput && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        const refreshBtns = Array.from(document.querySelectorAll('button'));
        const refBtn = refreshBtns.find(b => b.innerText && b.innerText.includes('Refresh'));
        if (refBtn) refBtn.click();
        return;
      }

      // 6. Number keys (1, 2, 3, 4) for Switching Page Tabs
      if (!isInput && ['1', '2', '3', '4'].includes(e.key)) {
        const tabBtns = Array.from(document.querySelectorAll('button'));
        const filteredTabs = tabBtns.filter(b => b.style && b.style.borderRadius && b.innerText && (b.innerText.includes('(') || b.className.includes('btn-primary') || b.className.includes('btn-secondary')));
        const targetIdx = parseInt(e.key) - 1;
        if (filteredTabs[targetIdx]) {
          e.preventDefault();
          filteredTabs[targetIdx].click();
        }
        return;
      }

      // 7. Chording: G + [Key] for Rapid Navigation
      if (!isInput) {
        const now = Date.now();
        const key = e.key.toLowerCase();

        if (lastKey === 'g' && now - lastKeyTime < 1000) {
          if (key === 'c') window.location.href = '/search';
          else if (key === 'a') window.location.href = '/advice';
          else if (key === 's') window.location.href = '/stuck';
          else if (key === 'r') window.location.href = '/returns';
          else if (key === 'f') window.location.href = '/finance';
          else if (key === 'e') window.location.href = '/expenses';
          else if (key === 'd') window.location.href = '/';
          lastKey = '';
          return;
        }

        if (key === 'g') {
          lastKey = 'g';
          lastKeyTime = now;
        } else {
          lastKey = '';
        }
      }
    };

    // 🎯 Double-Click Quick Copy on Any Table Cell
    const handleDblClick = (e) => {
      const td = e.target.closest('td');
      if (!td) return;
      if (['BUTTON', 'INPUT', 'SELECT', 'A', 'TEXTAREA'].includes(e.target.tagName)) return;

      const clone = td.cloneNode(true);
      clone.querySelectorAll('button, a, .btn, script, style').forEach(el => el.remove());

      let text = (clone.innerText || clone.textContent || '').trim();
      text = text.replace(/⚡\s*Command Center\s*↗?/gi, '')
                 .replace(/⚡\s*Action\s*↗?/gi, '')
                 .replace(/\s+/g, ' ')
                 .trim();

      if (!text || text === '—' || text === 'No Notes') return;

      copyWithTooltip(text, e);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('dblclick', handleDblClick);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('toggle-keyboard-shortcuts', handleToggleEvent);
      document.removeEventListener('dblclick', handleDblClick);
    };
  }, []);

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
                  <Route path="/whatsapp-templates" element={<TemplateManager />} />
                  <Route path="/finance" element={<FinanceManager />} />
                  <Route path="/payout-reconciler" element={<PayoutReconciler />} />
                  <Route path="/track/:slug" element={<TrackingPortal />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/intelligence" element={<CourierIntelligence />} />
                  <Route path="/stuck" element={<StuckMonitor />} />
                  <Route path="/advice" element={<AdviceMonitor />} />
                  <Route path="/connect" element={<Connect />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/costing" element={<CostManager />} />
                  <Route path="/prevention" element={<CostManager />} />
                  <Route path="/reviews" element={<ReviewsManager />} />
                  <Route path="/abandoned" element={<AbandonedCheckouts />} />
                  <Route path="/expenses" element={<ExpenseManager />} />
                </Routes>
              </ErrorBoundary>
            </Suspense>
          </div>
        </div>
      </div>
      <ToastContainer toasts={toasts} />
      <KeyboardShortcutsModal isOpen={showShortcutsModal} onClose={() => setShowShortcutsModal(false)} />
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
