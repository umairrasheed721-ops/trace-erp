/**
 * TRACE ERP — Global UI Constants
 * Centrally managed layout tokens, z-indexes, icons, and action triggers to
 * prevent layout fragmentation, icon overlap bugs, and inconsistent behaviors.
 */

export const TABLE_CONSTANTS = {
  // Layout and spacing tokens
  ROW_HEIGHT: 44,
  HEADER_HEIGHT: 48,
  CELL_PADDING: '10px 14px',
  COMPACT_CELL_PADDING: '4px 10px',
  
  // Explicit column widths to ensure fixed layouts (prevents horizontal jittering)
  DEFAULT_COLUMN_WIDTH: 120,
  COLUMN_WIDTHS: {
    ref_number: 160,
    order_date: 100,
    customer_name: 140,
    phone: 110,
    address: 240,
    city: 90,
    items: 220,
    tracking_number: 130,
    courier: 90,
    courier_status: 120,
    delivery_status: 120,
    payment_status: 90,
    paid_amount: 100,
    price: 90,
    cost: 95,
    profit: 95,
    order_source: 90,
    status_date: 120,
    payment_ref: 140,
    payment_date: 110,
    postex_weight: 90,
    edit: 80,
    notes: 180
  },

  // Centralized Z-index scale to prevent overlapping bugs across tooltips, sticky headers, and modals
  Z_INDEX: {
    TABLE_HEADER: 10,
    STICKY_COLUMN: 20,
    DROPDOWN_PICKER: 100,
    TOOLTIP: 2000,
    MODAL_OVERLAY: 9999
  },

  // Consistent icons used under columns and cells
  ICONS: {
    INFO: 'ℹ️',
    EDIT: '🖊️',
    DELETE: '🗑️',
    SEARCH: '🔍',
    WARNING: '⚠️',
    SUCCESS: '✅',
    ERROR: '❌',
    SORT_ASC: '▲',
    SORT_DESC: '▼',
    SPINNER: '⏳'
  },

  // Central trigger behavior guidelines
  TRIGGERS: {
    SEARCH_KEY: 'Enter',
    SUBMIT_ON_ENTER: true
  }
};
