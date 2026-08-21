// Single Source of Truth for ERP Navigation Pages & Role Authority Matrix
export const NAV_ITEMS = [
  { id: '/', label: 'Dashboard', icon: '🏠', to: '/' },
  { id: '/search', label: 'Command Center', icon: '🔍', to: '/search' },
  { id: '/returns', label: 'Unified Returns', icon: '↩️', to: '/returns' },
  { id: '/whatsapp-templates', label: 'WA Templates', icon: '✍️', to: '/whatsapp-templates', adminOnly: true },
  { id: '/finance', label: 'Finance Engine', icon: '💰', to: '/finance', adminOnly: true },
  { id: '/payout-reconciler', label: 'Payout Reconciler', icon: '💸', to: '/payout-reconciler', adminOnly: true },
  { id: '/costing', label: 'Costing & Watchdog', icon: '🛡️', to: '/costing', adminOnly: true },
  { id: '/reports', label: 'Profit & Loss', icon: '📊', to: '/reports', adminOnly: true },
  { id: '/expenses', label: 'Expense Manager', icon: '📝', to: '/expenses', adminOnly: true },
  { id: '/reviews', label: 'Reviews Manager', icon: '⭐', to: '/reviews', adminOnly: true },
  { id: '/abandoned', label: 'Abandoned Checkouts', icon: '🛒', to: '/abandoned' },
  { id: '/intelligence', label: 'Courier Intelligence', icon: '🚚', to: '/intelligence', adminOnly: true },
  { id: '/advice', label: 'Shipper Advice', icon: '🧠', to: '/advice' },
  { id: '/connect', label: 'Connect Store', icon: '🔌', to: '/connect', adminOnly: true },
  { id: '/users', label: 'User Management', icon: '👥', to: '/users', adminOnly: true },
  { id: '/profile', label: 'My Profile', icon: '👤', to: '/profile' }
];
