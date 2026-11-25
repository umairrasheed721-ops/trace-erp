/**
 * services/poLedgerService.js
 *
 * Lean, Strictly Per-Store Isolated Engine for:
 * 1. Suppliers & Running Khata Statements (Opening Balance, PO Bills, Payments/Advances, Returns)
 * 2. Purchase Orders (PO-INITIAL-BASELINE, New PO, Partial Receiving, Moving Weighted Avg Cost,
 *    Opt-In Shopify Delta Push, Continue Selling Toggle, Opt-In Shared SKU Pool Mirror)
 * 3. Warehouse Stock Buckets (On Hand, Committed, Available, In-Transit) & Inventory Audit Log
 * 4. Per-Store Financial Accounts & Unified Non-Deletable Ledger (Void/Reverse Audit Trail)
 * 5. Auto-Post Hooks for Manual Expenses & CPR Courier Payouts + "Where Is My Money?" Executive Summary
 */

const db = require('../db');
const {
  adjustShopifyVariantInventoryDelta,
  updateShopifyInventoryPolicy,
} = require('../engines/shopify_finance');

const PAYMENT_VARIANCE_TOLERANCE = 0.9; // Rule 22 standard tolerance (PKR)

function todayPktDate() {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

let _tablesReady = false;
function ensurePoLedgerTables() {
  if (_tablesReady) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        contact_person TEXT DEFAULT '',
        city TEXT DEFAULT '',
        opening_balance REAL DEFAULT 0,
        notes TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now', '+5 hours'))
      );
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        po_number TEXT NOT NULL,
        supplier_id INTEGER,
        status TEXT DEFAULT 'ordered',
        is_baseline INTEGER DEFAULT 0,
        order_date TEXT NOT NULL,
        received_date TEXT,
        subtotal_cost REAL DEFAULT 0,
        landing_cost REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        billed_cost REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_by TEXT DEFAULT 'Admin',
        created_at TEXT DEFAULT (datetime('now', '+5 hours')),
        updated_at TEXT DEFAULT (datetime('now', '+5 hours')),
        UNIQUE(store_id, po_number)
      );
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        store_id INTEGER NOT NULL,
        product_cost_id INTEGER,
        shopify_variant_id TEXT DEFAULT '',
        sku TEXT DEFAULT '',
        parent_title TEXT NOT NULL,
        variant_title TEXT DEFAULT '',
        ordered_qty INTEGER NOT NULL DEFAULT 0,
        received_qty INTEGER NOT NULL DEFAULT 0,
        unit_cost REAL NOT NULL DEFAULT 0,
        landed_unit_cost REAL NOT NULL DEFAULT 0,
        line_total REAL NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', '+5 hours'))
      );
      CREATE TABLE IF NOT EXISTS inventory_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        product_cost_id INTEGER,
        sku TEXT DEFAULT '',
        parent_title TEXT NOT NULL,
        variant_title TEXT DEFAULT '',
        movement_type TEXT NOT NULL,
        qty_delta INTEGER NOT NULL DEFAULT 0,
        unit_cost REAL DEFAULT 0,
        ref_type TEXT DEFAULT '',
        ref_id TEXT DEFAULT '',
        ref_label TEXT DEFAULT '',
        shopify_pushed INTEGER DEFAULT 0,
        shopify_error TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        created_by TEXT DEFAULT 'Admin',
        created_at TEXT DEFAULT (datetime('now', '+5 hours'))
      );
      CREATE TABLE IF NOT EXISTS financial_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        account_type TEXT DEFAULT 'bank',
        opening_balance REAL DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', '+5 hours'))
      );
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        entry_date TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        account_id INTEGER,
        supplier_id INTEGER,
        po_id INTEGER,
        ref_type TEXT DEFAULT '',
        ref_id TEXT DEFAULT '',
        ref_label TEXT DEFAULT '',
        description TEXT DEFAULT '',
        is_void INTEGER DEFAULT 0,
        void_reason TEXT DEFAULT '',
        created_by TEXT DEFAULT 'Admin',
        created_at TEXT DEFAULT (datetime('now', '+5 hours'))
      );
    `);
    try { db.exec("ALTER TABLE product_master_costs ADD COLUMN shared_pool_key TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE manual_expenses ADD COLUMN account_id INTEGER"); } catch (_) {}
    try { db.exec('ALTER TABLE purchase_order_items ADD COLUMN remaining_qty INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
    _tablesReady = true;
  } catch (e) {
    console.error('[poLedgerService] ensurePoLedgerTables error:', e.message);
  }
}

/**
 * LEAN FIFO HELPERS:
 * Active FIFO Cost = landed_unit_cost of the OLDEST open PO batch (remaining_qty > 0, id ASC).
 * When that batch hits 0 remaining, active cost automatically flips to the next open PO batch.
 */
function getActiveFifoUnitCost(storeId, productCostId) {
  const sid = Number(storeId) || 1;
  const pid = Number(productCostId);
  if (!pid) return 0;

  const oldestOpen = db.prepare(`
    SELECT i.landed_unit_cost, i.unit_cost
    FROM purchase_order_items i
    JOIN purchase_orders po ON po.id = i.po_id
    WHERE i.store_id = ? AND i.product_cost_id = ? AND COALESCE(i.remaining_qty, 0) > 0
      AND po.status != 'cancelled'
    ORDER BY i.id ASC
    LIMIT 1
  `).get(sid, pid);
  if (oldestOpen) return parseFloat(oldestOpen.landed_unit_cost) || parseFloat(oldestOpen.unit_cost) || 0;

  const latestRec = db.prepare(`
    SELECT i.landed_unit_cost, i.unit_cost
    FROM purchase_order_items i
    JOIN purchase_orders po ON po.id = i.po_id
    WHERE i.store_id = ? AND i.product_cost_id = ? AND COALESCE(i.received_qty, 0) > 0
      AND po.status != 'cancelled'
    ORDER BY i.id DESC
    LIMIT 1
  `).get(sid, pid);
  if (latestRec) return parseFloat(latestRec.landed_unit_cost) || parseFloat(latestRec.unit_cost) || 0;

  const pmc = db.prepare('SELECT landed_cost, unit_cost FROM product_master_costs WHERE id = ? AND store_id = ?').get(pid, sid);
  return parseFloat(pmc?.landed_cost) || parseFloat(pmc?.unit_cost) || 0;
}

function syncSkuFifoCost(storeId, productCostId, changedBy = 'po_fifo') {
  const sid = Number(storeId) || 1;
  const pid = Number(productCostId);
  if (!pid) return 0;

  const pmc = db.prepare('SELECT * FROM product_master_costs WHERE id = ? AND store_id = ?').get(pid, sid);
  if (!pmc) return 0;

  const nextCost = getActiveFifoUnitCost(sid, pid);
  const oldCost = parseFloat(pmc.landed_cost) || parseFloat(pmc.unit_cost) || 0;

  if (nextCost > 0 && Math.abs(nextCost - oldCost) >= 0.01) {
    db.prepare("UPDATE product_master_costs SET unit_cost = ?, landed_cost = ?, updated_at = datetime('now') WHERE id = ?")
      .run(nextCost, nextCost, pid);
    try {
      db.prepare(`
        INSERT INTO cost_change_log (store_id, parent_title, variant_title, shopify_variant_id, old_cost, new_cost, old_shopify_cost, new_shopify_cost, changed_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sid, pmc.parent_title, pmc.variant_title || '', pmc.shopify_variant_id || null, oldCost, nextCost, pmc.shopify_cost || 0, pmc.shopify_cost || 0, changedBy);
    } catch (_) {}
  }
  return nextCost || oldCost;
}

/**
 * Consumes qty from oldest open FIFO PO batches (id ASC), updates remaining_qty,
 * rolls SKU's active FIFO cost forward if a batch closes, and returns exact split cost.
 */
function consumeFifoBatches(storeId, productCostId, qtyToConsume) {
  const sid = Number(storeId) || 1;
  const pid = Number(productCostId);
  let remainingToTake = Math.abs(parseInt(qtyToConsume, 10) || 0);
  if (!pid || remainingToTake <= 0) return { totalCost: 0, avgUnitCost: 0, allocations: [] };

  const openBatches = db.prepare(`
    SELECT i.id, i.remaining_qty, i.landed_unit_cost, i.unit_cost
    FROM purchase_order_items i
    JOIN purchase_orders po ON po.id = i.po_id
    WHERE i.store_id = ? AND i.product_cost_id = ? AND COALESCE(i.remaining_qty, 0) > 0
      AND po.status != 'cancelled'
    ORDER BY i.id ASC
  `).all(sid, pid);

  let totalCost = 0;
  let consumedQty = 0;
  const allocations = [];
  const decStmt = db.prepare('UPDATE purchase_order_items SET remaining_qty = MAX(0, COALESCE(remaining_qty, 0) - ?) WHERE id = ?');

  for (const b of openBatches) {
    if (remainingToTake <= 0) break;
    const take = Math.min(remainingToTake, Number(b.remaining_qty) || 0);
    if (take <= 0) continue;
    const rate = parseFloat(b.landed_unit_cost) || parseFloat(b.unit_cost) || 0;
    decStmt.run(take, b.id);
    totalCost += take * rate;
    consumedQty += take;
    remainingToTake -= take;
    allocations.push({ poItemId: b.id, qty: take, unitCost: rate });
  }

  // Any leftover qty not covered by PO batches falls back strictly to verified active FIFO/SKU cost
  if (remainingToTake > 0) {
    const fallbackRate = getActiveFifoUnitCost(sid, pid);
    totalCost += remainingToTake * fallbackRate;
    consumedQty += remainingToTake;
    allocations.push({ poItemId: null, qty: remainingToTake, unitCost: fallbackRate });
  }

  // Flip SKU's active FIFO cost if oldest batch just hit 0
  syncSkuFifoCost(sid, pid, 'fifo_rollover');

  totalCost = Math.round(totalCost * 100) / 100;
  const avgUnitCost = consumedQty > 0 ? Math.round((totalCost / consumedQty) * 100) / 100 : 0;
  return { totalCost, avgUnitCost, allocations };
}

/**
 * Restores returned/added qty cleanly into the latest received PO batch for this SKU.
 */
function restoreFifoBatch(storeId, productCostId, qtyToRestore) {
  const sid = Number(storeId) || 1;
  const pid = Number(productCostId);
  const addQty = Math.abs(parseInt(qtyToRestore, 10) || 0);
  if (!pid || addQty <= 0) return;

  const latestBatch = db.prepare(`
    SELECT i.id
    FROM purchase_order_items i
    JOIN purchase_orders po ON po.id = i.po_id
    WHERE i.store_id = ? AND i.product_cost_id = ? AND COALESCE(i.received_qty, 0) > 0
      AND po.status != 'cancelled'
    ORDER BY i.id DESC
    LIMIT 1
  `).get(sid, pid);

  if (latestBatch) {
    db.prepare('UPDATE purchase_order_items SET remaining_qty = COALESCE(remaining_qty, 0) + ? WHERE id = ?').run(addQty, latestBatch.id);
    syncSkuFifoCost(sid, pid, 'fifo_restore');
  }
}

/**
 * Ensures a store has default starter Bank + Cash accounts (Plug & Play, strictly per-store).
 */
function ensureDefaultAccounts(storeId) {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const countRow = db.prepare('SELECT COUNT(*) AS c FROM financial_accounts WHERE store_id = ?').get(sid);
  if ((countRow?.c || 0) === 0) {
    db.prepare(`
      INSERT INTO financial_accounts (store_id, name, account_type, opening_balance, is_default, notes)
      VALUES (?, 'Main Bank Account', 'bank', 0, 1, 'Default account for CPR payouts & supplier payments')
    `).run(sid);
    db.prepare(`
      INSERT INTO financial_accounts (store_id, name, account_type, opening_balance, is_default, notes)
      VALUES (?, 'Cash Drawer', 'cash', 0, 0, 'Daily petty cash & cash expenses')
    `).run(sid);
  }
}

function getDefaultAccountId(storeId, preferredType = 'bank') {
  ensureDefaultAccounts(storeId);
  const sid = Number(storeId) || 1;
  if (preferredType === 'cash') {
    const cashAcc = db.prepare("SELECT id FROM financial_accounts WHERE store_id = ? AND is_active = 1 AND account_type = 'cash' ORDER BY id ASC LIMIT 1").get(sid);
    if (cashAcc) return cashAcc.id;
  }
  const defAcc = db.prepare('SELECT id FROM financial_accounts WHERE store_id = ? AND is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1').get(sid);
  return defAcc ? defAcc.id : null;
}

/**
 * Helper: push delta to a store's Shopify variant + any other linked stores sharing the same shared_pool_key.
 */
async function pushDeltaToShopifyAndLinkedPools(storeId, productCostRow, deltaQty) {
  const sid = Number(storeId) || 1;
  const delta = parseInt(deltaQty, 10);
  if (!productCostRow || !delta) return { ok: false, error: 'Nothing to push', syncedStores: 0 };

  const targets = [];
  if (productCostRow.shopify_variant_id) {
    targets.push({ storeId: sid, variantId: productCostRow.shopify_variant_id, productCostId: productCostRow.id, isPrimary: true });
  }

  // Optional Shared SKU Pool Mirror across other connected stores
  const poolKey = (productCostRow.shared_pool_key || '').trim();
  if (poolKey) {
    const linked = db.prepare(`
      SELECT id, store_id, shopify_variant_id
      FROM product_master_costs
      WHERE shared_pool_key = ? AND store_id != ? AND shopify_variant_id IS NOT NULL AND shopify_variant_id != ''
    `).all(poolKey, sid);
    for (const l of linked) {
      targets.push({ storeId: Number(l.store_id), variantId: l.shopify_variant_id, productCostId: l.id, isPrimary: false });
    }
  }

  if (targets.length === 0) {
    return { ok: false, error: 'No Shopify variant ID linked to this SKU', syncedStores: 0 };
  }

  let syncedStores = 0;
  const errors = [];
  for (const t of targets) {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(t.storeId);
    if (!store) continue;
    const res = await adjustShopifyVariantInventoryDelta(store, t.variantId, delta);
    if (res.ok) {
      syncedStores++;
      if (!t.isPrimary) {
        // Keep linked store's local inventory_qty mirrored too
        db.prepare("UPDATE product_master_costs SET inventory_qty = COALESCE(inventory_qty, 0) + ?, updated_at = datetime('now') WHERE id = ?")
          .run(delta, t.productCostId);
      }
    } else {
      errors.push(`Store #${t.storeId}: ${res.error}`);
    }
  }

  return {
    ok: syncedStores > 0 && errors.length === 0,
    partialOk: syncedStores > 0,
    syncedStores,
    error: errors.join(' | '),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. EXECUTIVE SUMMARY ("WHERE IS MY MONEY?" + BALANCE SHEET)
// ─────────────────────────────────────────────────────────────────────────────

function listAccounts(storeId) {
  ensureDefaultAccounts(storeId);
  const sid = Number(storeId) || 1;
  const accounts = db.prepare(`
    SELECT
      a.*,
      COALESCE((
        SELECT SUM(CASE WHEN e.direction = 'in' THEN e.amount ELSE -e.amount END)
        FROM ledger_entries e
        WHERE e.store_id = a.store_id AND e.account_id = a.id AND e.is_void = 0
      ), 0) AS net_movement
    FROM financial_accounts a
    WHERE a.store_id = ? AND a.is_active = 1
    ORDER BY a.is_default DESC, a.id ASC
  `).all(sid);

  return accounts.map(a => ({
    ...a,
    opening_balance: Number(a.opening_balance) || 0,
    net_movement: Math.round((Number(a.net_movement) || 0) * 100) / 100,
    current_balance: Math.round(((Number(a.opening_balance) || 0) + (Number(a.net_movement) || 0)) * 100) / 100,
  }));
}

function listSuppliers(storeId) {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const rows = db.prepare(`
    SELECT
      s.*,
      COALESCE((
        SELECT SUM(CASE WHEN po.is_baseline = 0 AND po.status != 'cancelled' THEN COALESCE(po.billed_cost, 0) ELSE 0 END)
        FROM purchase_orders po
        WHERE po.store_id = s.store_id AND po.supplier_id = s.id
      ), 0) AS total_billed,
      COALESCE((
        SELECT SUM(e.amount)
        FROM ledger_entries e
        WHERE e.store_id = s.store_id AND e.supplier_id = s.id AND e.is_void = 0
          AND e.entry_type IN ('po_payment', 'supplier_advance')
      ), 0) AS total_paid,
      COALESCE((
        SELECT SUM(e.amount)
        FROM ledger_entries e
        WHERE e.store_id = s.store_id AND e.supplier_id = s.id AND e.is_void = 0
          AND e.entry_type = 'supplier_return'
      ), 0) AS total_returns,
      COALESCE((
        SELECT COUNT(*) FROM purchase_orders po
        WHERE po.store_id = s.store_id AND po.supplier_id = s.id AND po.status != 'cancelled'
      ), 0) AS po_count
    FROM suppliers s
    WHERE s.store_id = ? AND s.is_active = 1
    ORDER BY s.name ASC
  `).all(sid);

  return rows.map(r => {
    const opening = Number(r.opening_balance) || 0;
    const billed = Number(r.total_billed) || 0;
    const paid = Number(r.total_paid) || 0;
    const returns = Number(r.total_returns) || 0;
    // Positive = We owe Supplier (Payable); Negative = Supplier owes us (Advance / Peshgi)
    const netBalance = Math.round((opening + billed - paid - returns) * 100) / 100;
    return {
      ...r,
      opening_balance: opening,
      total_billed: Math.round(billed),
      total_paid: Math.round(paid),
      total_returns: Math.round(returns),
      net_balance: netBalance,
    };
  });
}

function getExecutiveSummary(storeId) {
  ensureDefaultAccounts(storeId);
  const sid = Number(storeId) || 1;

  // 1. Cash & Bank Balance
  const accounts = listAccounts(sid);
  const cashBalance = Math.round(accounts.reduce((s, a) => s + a.current_balance, 0));

  // 2. Shelf Stock Valuation (STRICT FIFO batch valuation when open PO batches exist, else verified landed_cost)
  const stockRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(p.inventory_qty, 0) > 0 THEN p.inventory_qty ELSE 0 END), 0) AS shelf_units,
      COALESCE(SUM(CASE
        WHEN COALESCE(p.inventory_qty, 0) <= 0 THEN 0
        WHEN COALESCE((SELECT SUM(i.remaining_qty) FROM purchase_order_items i JOIN purchase_orders po ON po.id = i.po_id WHERE i.store_id = p.store_id AND i.product_cost_id = p.id AND po.status != 'cancelled' AND i.remaining_qty > 0), 0) > 0
          THEN COALESCE((SELECT SUM(i.remaining_qty * COALESCE(NULLIF(i.landed_unit_cost, 0), i.unit_cost, 0)) FROM purchase_order_items i JOIN purchase_orders po ON po.id = i.po_id WHERE i.store_id = p.store_id AND i.product_cost_id = p.id AND po.status != 'cancelled' AND i.remaining_qty > 0), 0)
        ELSE p.inventory_qty * COALESCE(NULLIF(p.landed_cost, 0), p.unit_cost, 0)
      END), 0) AS shelf_value,
      COALESCE(SUM(CASE WHEN COALESCE(p.inventory_qty, 0) < 0 THEN 1 ELSE 0 END), 0) AS backorder_skus,
      COALESCE(SUM(CASE WHEN COALESCE(p.inventory_qty, 0) < 0 THEN ABS(p.inventory_qty) ELSE 0 END), 0) AS backorder_units
    FROM product_master_costs p
    WHERE p.store_id = ? AND LOWER(COALESCE(p.status, 'active')) != 'archived'
      AND (TRIM(COALESCE(p.sku, '')) != '' OR TRIM(COALESCE(p.shopify_variant_id, '')) != '')
  `).get(sid);

  // 3. Stock In-Transit with Couriers (Booked / In Transit / Returned — not yet Delivered or Return Received)
  const transitRow = db.prepare(`
    SELECT
      COUNT(*) AS transit_orders,
      COALESCE(SUM(COALESCE(cost, 0)), 0) AS transit_value
    FROM orders
    WHERE store_id = ?
      AND LOWER(COALESCE(delivery_status, '')) IN ('booked', 'in transit', 'returned')
  `).get(sid);

  // 4. Courier Pending COD Receivables (Delivered orders unpaid beyond 0.9 PKR tolerance)
  const courierRow = db.prepare(`
    SELECT
      COUNT(*) AS unpaid_orders,
      COALESCE(SUM(COALESCE(price, 0) - COALESCE(paid_amount, 0)), 0) AS unpaid_cod
    FROM orders
    WHERE store_id = ?
      AND LOWER(COALESCE(delivery_status, '')) = 'delivered'
      AND (COALESCE(price, 0) - COALESCE(paid_amount, 0)) > ?
  `).get(sid, PAYMENT_VARIANCE_TOLERANCE);

  // 5. Supplier Payables & Advances
  const suppliers = listSuppliers(sid);
  const supplierPayables = Math.round(suppliers.reduce((s, sup) => s + (sup.net_balance > 0 ? sup.net_balance : 0), 0));
  const supplierAdvances = Math.round(suppliers.reduce((s, sup) => s + (sup.net_balance < 0 ? Math.abs(sup.net_balance) : 0), 0));

  const shelfValue = Math.round(Number(stockRow?.shelf_value) || 0);
  const inTransitValue = Math.round(Number(transitRow?.transit_value) || 0);
  const courierReceivables = Math.round(Number(courierRow?.unpaid_cod) || 0);
  const netWorth = Math.round(cashBalance + shelfValue + inTransitValue + courierReceivables + supplierAdvances - supplierPayables);

  const baselineRow = db.prepare('SELECT id, po_number, received_date FROM purchase_orders WHERE store_id = ? AND is_baseline = 1 LIMIT 1').get(sid);

  return {
    storeId: sid,
    hasBaseline: Boolean(baselineRow),
    baselinePo: baselineRow || null,
    cashBalance,
    shelfUnits: Number(stockRow?.shelf_units) || 0,
    shelfValue,
    backorderSkus: Number(stockRow?.backorder_skus) || 0,
    backorderUnits: Number(stockRow?.backorder_units) || 0,
    inTransitOrders: Number(transitRow?.transit_orders) || 0,
    inTransitValue,
    unpaidDeliveredOrders: Number(courierRow?.unpaid_orders) || 0,
    courierReceivables,
    supplierPayables,
    supplierAdvances,
    netWorth,
    accountsCount: accounts.length,
    suppliersCount: suppliers.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SUPPLIERS CRUD & RUNNING KHATA STATEMENT
// ─────────────────────────────────────────────────────────────────────────────

function saveSupplier(storeId, payload = {}) {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const name = (payload.name || '').trim();
  if (!name) throw new Error('Supplier name is required');

  const phone = (payload.phone || '').trim();
  const contactPerson = (payload.contact_person || '').trim();
  const city = (payload.city || '').trim();
  const openingBalance = parseFloat(payload.opening_balance) || 0;
  const notes = (payload.notes || '').trim();

  if (payload.id) {
    const upd = db.prepare(`
      UPDATE suppliers
      SET name = ?, phone = ?, contact_person = ?, city = ?, opening_balance = ?, notes = ?
      WHERE id = ? AND store_id = ?
    `).run(name, phone, contactPerson, city, openingBalance, notes, Number(payload.id), sid);
    if (!upd.changes) throw new Error('Supplier not found for this store');
    return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(Number(payload.id));
  }

  const info = db.prepare(`
    INSERT INTO suppliers (store_id, name, phone, contact_person, city, opening_balance, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sid, name, phone, contactPerson, city, openingBalance, notes);
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(Number(info.lastInsertRowid));
}

function getSupplierStatement(storeId, supplierId) {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const supId = Number(supplierId);
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ? AND store_id = ?').get(supId, sid);
  if (!supplier) throw new Error('Supplier not found for this store');

  const events = [];

  // 1. Received PO bills (+)
  const pos = db.prepare(`
    SELECT id, po_number, COALESCE(received_date, order_date) AS event_date, billed_cost, status, notes, created_at
    FROM purchase_orders
    WHERE store_id = ? AND supplier_id = ? AND is_baseline = 0 AND status != 'cancelled' AND COALESCE(billed_cost, 0) > 0
  `).all(sid, supId);
  for (const po of pos) {
    events.push({
      date: po.event_date || todayPktDate(),
      sortTs: po.created_at || '',
      type: 'po_bill',
      label: `PO Bill · ${po.po_number}`,
      description: po.notes || `Stock received (${po.status})`,
      billAmount: Number(po.billed_cost) || 0,
      creditAmount: 0,
      refId: po.id,
    });
  }

  // 2. Payments, Advances & Supplier Returns (−)
  const entries = db.prepare(`
    SELECT e.*, a.name AS account_name
    FROM ledger_entries e
    LEFT JOIN financial_accounts a ON a.id = e.account_id
    WHERE e.store_id = ? AND e.supplier_id = ? AND e.is_void = 0
      AND e.entry_type IN ('po_payment', 'supplier_advance', 'supplier_return')
  `).all(sid, supId);
  for (const e of entries) {
    const labelMap = {
      po_payment: 'PO Payment',
      supplier_advance: 'Advance / Peshgi',
      supplier_return: 'Defective Return Credit',
    };
    events.push({
      date: e.entry_date || todayPktDate(),
      sortTs: e.created_at || '',
      type: e.entry_type,
      label: `${labelMap[e.entry_type] || e.entry_type}${e.ref_label ? ` · ${e.ref_label}` : ''}`,
      description: `${e.description || ''}${e.account_name ? ` (${e.account_name})` : ''}`.trim(),
      billAmount: 0,
      creditAmount: Number(e.amount) || 0,
      refId: e.id,
    });
  }

  events.sort((a, b) => (a.date === b.date ? a.sortTs.localeCompare(b.sortTs) : a.date.localeCompare(b.date)));

  let running = Number(supplier.opening_balance) || 0;
  const rows = events.map(ev => {
    running = Math.round((running + ev.billAmount - ev.creditAmount) * 100) / 100;
    return { ...ev, runningBalance: running };
  });

  return {
    supplier,
    openingBalance: Number(supplier.opening_balance) || 0,
    closingBalance: running,
    rows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PURCHASE ORDERS ENGINE (BASELINE, NEW PO, PARTIAL RECEIVE, WEIGHTED AVG)
// ─────────────────────────────────────────────────────────────────────────────

function generateNextPoNumber(storeId) {
  const sid = Number(storeId) || 1;
  const year = new Date().getFullYear();
  const countRow = db.prepare('SELECT COUNT(*) AS c FROM purchase_orders WHERE store_id = ? AND is_baseline = 0').get(sid);
  let seq = (countRow?.c || 0) + 1;
  while (true) {
    const candidate = `PO-${year}-${String(seq).padStart(3, '0')}`;
    const exists = db.prepare('SELECT id FROM purchase_orders WHERE store_id = ? AND po_number = ?').get(sid, candidate);
    if (!exists) return candidate;
    seq++;
  }
}

function listPurchaseOrders(storeId) {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const pos = db.prepare(`
    SELECT
      po.*,
      s.name AS supplier_name,
      COALESCE((SELECT SUM(ordered_qty) FROM purchase_order_items WHERE po_id = po.id), 0) AS total_ordered_qty,
      COALESCE((SELECT SUM(received_qty) FROM purchase_order_items WHERE po_id = po.id), 0) AS total_received_qty,
      COALESCE((SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id), 0) AS line_count
    FROM purchase_orders po
    LEFT JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.store_id = ?
    ORDER BY po.is_baseline ASC, po.id DESC
    LIMIT 100
  `).all(sid);

  return pos.map(p => ({
    ...p,
    remaining_payable: Math.max(0, Math.round(((Number(p.billed_cost) || 0) - (Number(p.paid_amount) || 0)) * 100) / 100),
  }));
}

function getPurchaseOrder(storeId, poId) {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const po = db.prepare(`
    SELECT po.*, s.name AS supplier_name
    FROM purchase_orders po
    LEFT JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.id = ? AND po.store_id = ?
  `).get(Number(poId), sid);
  if (!po) throw new Error('Purchase order not found for this store');

  const items = db.prepare(`
    SELECT i.*, pmc.inventory_qty AS current_stock, pmc.landed_cost AS current_avg_cost, pmc.shared_pool_key
    FROM purchase_order_items i
    LEFT JOIN product_master_costs pmc ON pmc.id = i.product_cost_id
    WHERE i.po_id = ?
    ORDER BY i.id ASC
  `).all(po.id);

  return { ...po, items };
}

/**
 * 1-Click Shopify Baseline PO (PO-INITIAL-BASELINE):
 * Captures current shelf stock snapshot with Supplier Payable = 0, plus auto-notes In-Transit stock count.
 */
function createBaselinePo(storeId, createdBy = 'Admin') {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const existing = db.prepare('SELECT id, po_number FROM purchase_orders WHERE store_id = ? AND is_baseline = 1 LIMIT 1').get(sid);
  if (existing) {
    throw new Error(`Baseline already initialized (${existing.po_number}). Create a normal PO for new stock.`);
  }

  const catalog = db.prepare(`
    SELECT id, shopify_variant_id, sku, parent_title, variant_title,
           COALESCE(inventory_qty, 0) AS inventory_qty,
           COALESCE(NULLIF(landed_cost, 0), unit_cost, 0) AS effective_cost
    FROM product_master_costs
    WHERE store_id = ? AND COALESCE(inventory_qty, 0) > 0
      AND LOWER(COALESCE(status, 'active')) != 'archived'
      AND (TRIM(COALESCE(sku, '')) != '' OR TRIM(COALESCE(shopify_variant_id, '')) != '')
    ORDER BY parent_title ASC, variant_title ASC
  `).all(sid);

  if (catalog.length === 0) {
    throw new Error('No positive-stock SKUs found in Cost Manager catalog. Run Sync Shopify in Cost Manager first.');
  }

  const transitRow = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(COALESCE(cost, 0)), 0) AS val
    FROM orders
    WHERE store_id = ? AND LOWER(COALESCE(delivery_status, '')) IN ('booked', 'in transit', 'returned')
  `).get(sid);

  const today = todayPktDate();
  let subtotal = 0;
  for (const item of catalog) {
    subtotal += item.inventory_qty * item.effective_cost;
  }
  subtotal = Math.round(subtotal * 100) / 100;

  let poId = null;
  db.exec('BEGIN');
  try {
    const info = db.prepare(`
      INSERT INTO purchase_orders
        (store_id, po_number, supplier_id, status, is_baseline, order_date, received_date, subtotal_cost, landing_cost, total_cost, billed_cost, paid_amount, notes, created_by)
      VALUES (?, 'PO-INITIAL-BASELINE', NULL, 'received', 1, ?, ?, ?, 0, ?, 0, 0, ?, ?)
    `).run(
      sid, today, today, subtotal, subtotal,
      `Opening shelf baseline (${catalog.length} SKUs). Opening In-Transit with Couriers: ${transitRow?.c || 0} orders (Rs. ${Math.round(transitRow?.val || 0)}).`,
      createdBy
    );
    poId = Number(info.lastInsertRowid);

    const insertItem = db.prepare(`
      INSERT INTO purchase_order_items
        (po_id, store_id, product_cost_id, shopify_variant_id, sku, parent_title, variant_title, ordered_qty, received_qty, remaining_qty, unit_cost, landed_unit_cost, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertInv = db.prepare(`
      INSERT INTO inventory_ledger
        (store_id, product_cost_id, sku, parent_title, variant_title, movement_type, qty_delta, unit_cost, ref_type, ref_id, ref_label, shopify_pushed, notes, created_by)
      VALUES (?, ?, ?, ?, ?, 'BASELINE', ?, ?, 'po', ?, 'PO-INITIAL-BASELINE', 0, 'Initial opening stock snapshot', ?)
    `);

    for (const item of catalog) {
      const lineTotal = Math.round(item.inventory_qty * item.effective_cost * 100) / 100;
      insertItem.run(
        poId, sid, item.id, item.shopify_variant_id || '', item.sku || '',
        item.parent_title, item.variant_title || '',
        item.inventory_qty, item.inventory_qty, item.inventory_qty, item.effective_cost, item.effective_cost, lineTotal
      );
      insertInv.run(
        sid, item.id, item.sku || '', item.parent_title, item.variant_title || '',
        item.inventory_qty, item.effective_cost, String(poId), createdBy
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getPurchaseOrder(sid, poId);
}

function createPurchaseOrder(storeId, payload = {}, createdBy = 'Admin') {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const items = Array.isArray(payload.items) ? payload.items.filter(i => (parseInt(i.ordered_qty, 10) || 0) > 0) : [];
  if (items.length === 0) throw new Error('Add at least one SKU with quantity > 0');

  const supplierId = payload.supplier_id ? Number(payload.supplier_id) : null;
  const poNumber = (payload.po_number || '').trim() || generateNextPoNumber(sid);
  const orderDate = (payload.order_date || '').trim() || todayPktDate();
  const landingCost = Math.max(0, parseFloat(payload.landing_cost) || 0);
  const notes = (payload.notes || '').trim();

  const totalUnits = items.reduce((s, i) => s + (parseInt(i.ordered_qty, 10) || 0), 0);
  const landingPerUnit = totalUnits > 0 ? landingCost / totalUnits : 0;

  let subtotal = 0;
  const enrichedItems = items.map(raw => {
    const qty = parseInt(raw.ordered_qty, 10) || 0;
    const unitCost = Math.max(0, parseFloat(raw.unit_cost) || 0);
    const landedUnitCost = Math.round((unitCost + landingPerUnit) * 100) / 100;
    const lineTotal = Math.round(qty * unitCost * 100) / 100;
    subtotal += lineTotal;

    let pmc = null;
    if (raw.product_cost_id) {
      pmc = db.prepare('SELECT id, shopify_variant_id, sku, parent_title, variant_title FROM product_master_costs WHERE id = ? AND store_id = ?')
        .get(Number(raw.product_cost_id), sid);
    }
    const resolvedSku = pmc?.sku || (raw.sku || '').trim();
    const resolvedVarId = pmc?.shopify_variant_id || (raw.shopify_variant_id || '').trim();
    if (!resolvedSku && !resolvedVarId) {
      throw new Error(`SKU or Shopify Variant ID is strictly required for "${pmc?.parent_title || raw.parent_title || 'item'}"`);
    }
    return {
      product_cost_id: pmc?.id || null,
      shopify_variant_id: resolvedVarId,
      sku: resolvedSku,
      parent_title: pmc?.parent_title || (raw.parent_title || 'Custom Item').trim(),
      variant_title: pmc?.variant_title || (raw.variant_title || '').trim(),
      ordered_qty: qty,
      unit_cost: unitCost,
      landed_unit_cost: landedUnitCost,
      line_total: lineTotal,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;
  const totalCost = Math.round((subtotal + landingCost) * 100) / 100;

  let poId = null;
  db.exec('BEGIN');
  try {
    const info = db.prepare(`
      INSERT INTO purchase_orders
        (store_id, po_number, supplier_id, status, is_baseline, order_date, subtotal_cost, landing_cost, total_cost, billed_cost, paid_amount, notes, created_by)
      VALUES (?, ?, ?, 'ordered', 0, ?, ?, ?, ?, 0, 0, ?, ?)
    `).run(sid, poNumber, supplierId, orderDate, subtotal, landingCost, totalCost, notes, createdBy);
    poId = Number(info.lastInsertRowid);

    const insItem = db.prepare(`
      INSERT INTO purchase_order_items
        (po_id, store_id, product_cost_id, shopify_variant_id, sku, parent_title, variant_title, ordered_qty, received_qty, unit_cost, landed_unit_cost, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);
    for (const it of enrichedItems) {
      insItem.run(
        poId, sid, it.product_cost_id, it.shopify_variant_id, it.sku,
        it.parent_title, it.variant_title, it.ordered_qty, it.unit_cost, it.landed_unit_cost, it.line_total
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getPurchaseOrder(sid, poId);
}

/**
 * Partial or Full PO Receiving:
 * - Updates received_qty per line
 * - Computes Moving Weighted Average Cost (handles negative Continue Selling stock cleanly!)
 * - Bills supplier strictly for ACTUALLY received qty (protects against short shipments)
 * - Optionally pushes +deltaQty to Shopify (+ linked Shared Pool stores)
 */
async function receivePurchaseOrder(storeId, poId, payload = {}, createdBy = 'Admin') {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const po = getPurchaseOrder(sid, poId);
  if (po.status === 'cancelled') throw new Error('Cannot receive a cancelled PO');
  if (po.is_baseline) throw new Error('Baseline PO is already received');

  const pushToShopify = Boolean(payload.pushToShopify);
  const receiveNotes = (payload.notes || '').trim();
  const closeShort = Boolean(payload.closeShort);
  const receiveMap = new Map();

  if (Array.isArray(payload.items) && payload.items.length > 0) {
    for (const entry of payload.items) {
      const q = Math.max(0, parseInt(entry.receiveNowQty, 10) || 0);
      if (q > 0) receiveMap.set(Number(entry.itemId), q);
    }
  } else {
    // Default: receive remaining qty of all items
    for (const item of po.items) {
      const rem = Math.max(0, (item.ordered_qty || 0) - (item.received_qty || 0));
      if (rem > 0) receiveMap.set(item.id, rem);
    }
  }

  if (receiveMap.size === 0 && !closeShort) {
    throw new Error('Enter received quantity (> 0) for at least one item');
  }

  const receivedWork = [];
  const today = todayPktDate();

  db.exec('BEGIN');
  try {
    for (const item of po.items) {
      const addQty = receiveMap.get(item.id) || 0;
      if (addQty <= 0) continue;

      let pmc = null;
      if (item.product_cost_id) {
        pmc = db.prepare('SELECT * FROM product_master_costs WHERE id = ? AND store_id = ?').get(item.product_cost_id, sid);
      }

      const oldQty = pmc ? (parseInt(pmc.inventory_qty, 10) || 0) : 0;
      // If SKU had negative backorders (Continue Selling), those waiting orders consume from this incoming batch first
      const backorderAbsorbed = oldQty < 0 ? Math.min(addQty, Math.abs(oldQty)) : 0;
      const batchRemainingAdd = Math.max(0, addQty - backorderAbsorbed);

      const newReceivedQty = (item.received_qty || 0) + addQty;
      const newRemainingQty = (item.remaining_qty || 0) + batchRemainingAdd;
      db.prepare('UPDATE purchase_order_items SET received_qty = ?, remaining_qty = ? WHERE id = ?')
        .run(newReceivedQty, newRemainingQty, item.id);

      if (pmc) {
        const nextQty = oldQty + addQty;
        db.prepare("UPDATE product_master_costs SET inventory_qty = ?, updated_at = datetime('now') WHERE id = ?")
          .run(nextQty, pmc.id);

        // STRICT FIFO: Active SKU cost stays on the OLDEST open PO batch (remaining_qty > 0, id ASC).
        // If no older batch is open (or stock was 0 / negative), it immediately adopts this PO's exact landed rate!
        syncSkuFifoCost(sid, pmc.id, 'po_receive_fifo');
      }

      const invLog = db.prepare(`
        INSERT INTO inventory_ledger
          (store_id, product_cost_id, sku, parent_title, variant_title, movement_type, qty_delta, unit_cost, ref_type, ref_id, ref_label, shopify_pushed, notes, created_by)
        VALUES (?, ?, ?, ?, ?, 'PO_RECEIVE', ?, ?, 'po', ?, ?, 0, ?, ?)
      `).run(
        sid, pmc?.id || null, item.sku || '', item.parent_title, item.variant_title || '',
        addQty, item.landed_unit_cost || item.unit_cost || 0,
        String(po.id), po.po_number, receiveNotes || `Received against ${po.po_number}`, createdBy
      );

      receivedWork.push({
        invLedgerId: Number(invLog.lastInsertRowid),
        pmc,
        addQty,
        title: `${item.parent_title}${item.variant_title ? ` (${item.variant_title})` : ''}`,
      });
    }

    // Recalculate PO status & actual billed_cost based on received_qty (never over-bills short shipments!)
    const updatedItems = db.prepare('SELECT ordered_qty, received_qty, landed_unit_cost FROM purchase_order_items WHERE po_id = ?').all(po.id);
    const totalOrdered = updatedItems.reduce((s, r) => s + (r.ordered_qty || 0), 0);
    const totalReceived = updatedItems.reduce((s, r) => s + (r.received_qty || 0), 0);
    const billedCost = Math.round(updatedItems.reduce((s, r) => s + (r.received_qty || 0) * (r.landed_unit_cost || 0), 0) * 100) / 100;

    let nextStatus = po.status;
    if (closeShort || (totalReceived >= totalOrdered && totalOrdered > 0)) {
      nextStatus = 'received';
    } else if (totalReceived > 0) {
      nextStatus = 'partial';
    }

    db.prepare(`
      UPDATE purchase_orders
      SET status = ?, billed_cost = ?, received_date = COALESCE(received_date, ?), updated_at = datetime('now', '+5 hours')
      WHERE id = ?
    `).run(nextStatus, billedCost, today, po.id);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // Post-commit: Optional Shopify Delta Push (+ Linked Shared Pool mirror)
  const shopifyResults = { pushed: 0, failed: 0, errors: [] };
  if (pushToShopify && receivedWork.length > 0) {
    for (const work of receivedWork) {
      if (!work.pmc) continue;
      const res = await pushDeltaToShopifyAndLinkedPools(sid, work.pmc, work.addQty);
      if (res.ok || res.partialOk) {
        shopifyResults.pushed++;
        db.prepare('UPDATE inventory_ledger SET shopify_pushed = 1, shopify_error = ? WHERE id = ?')
          .run(res.error || '', work.invLedgerId);
      } else {
        shopifyResults.failed++;
        shopifyResults.errors.push(`${work.title}: ${res.error}`);
        db.prepare('UPDATE inventory_ledger SET shopify_pushed = 0, shopify_error = ? WHERE id = ?')
          .run(res.error || 'Push failed', work.invLedgerId);
      }
    }
  }

  return {
    po: getPurchaseOrder(sid, po.id),
    receivedLines: receivedWork.length,
    shopifyResults,
  };
}

function cancelPurchaseOrder(storeId, poId) {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const po = getPurchaseOrder(sid, poId);
  if (po.is_baseline) throw new Error('Baseline PO cannot be cancelled');
  const receivedSum = po.items.reduce((s, i) => s + (i.received_qty || 0), 0);
  if (receivedSum > 0) throw new Error('Cannot cancel a PO that already has received stock');
  db.prepare("UPDATE purchase_orders SET status = 'cancelled', updated_at = datetime('now', '+5 hours') WHERE id = ? AND store_id = ?").run(po.id, sid);
  return { success: true };
}

function getBackorderDemands(storeId) {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  return db.prepare(`
    SELECT id, shopify_variant_id, sku, parent_title, variant_title,
           inventory_qty, ABS(inventory_qty) AS needed_qty,
           COALESCE(NULLIF(landed_cost, 0), unit_cost, 0) AS suggested_cost,
           inventory_policy
    FROM product_master_costs
    WHERE store_id = ? AND COALESCE(inventory_qty, 0) < 0
      AND LOWER(COALESCE(status, 'active')) != 'archived'
      AND (TRIM(COALESCE(sku, '')) != '' OR TRIM(COALESCE(shopify_variant_id, '')) != '')
    ORDER BY inventory_qty ASC
    LIMIT 150
  `).all(sid);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. WAREHOUSE STOCK, ADJUSTMENTS, SUPPLIER RETURNS, CONTINUE SELLING & SHARED POOL
// ─────────────────────────────────────────────────────────────────────────────

function getWarehouseStock(storeId, search = '') {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const q = (search || '').trim().toLowerCase();

  let sql = `
    SELECT p.id, p.store_id, p.shopify_variant_id, p.sku, p.parent_title, p.variant_title,
           COALESCE(p.inventory_qty, 0) AS inventory_qty,
           COALESCE(NULLIF(p.landed_cost, 0), p.unit_cost, 0) AS avg_cost,
           COALESCE(p.selling_price, 0) AS selling_price,
           COALESCE(p.inventory_policy, 'deny') AS inventory_policy,
           COALESCE(p.shared_pool_key, '') AS shared_pool_key,
           p.status,
           COALESCE((
             SELECT COUNT(*) FROM purchase_order_items i
             JOIN purchase_orders po ON po.id = i.po_id
             WHERE i.store_id = p.store_id AND i.product_cost_id = p.id AND po.status != 'cancelled' AND COALESCE(i.remaining_qty, 0) > 0
           ), 0) AS open_batches,
           COALESCE((
             SELECT SUM(i.remaining_qty * COALESCE(NULLIF(i.landed_unit_cost, 0), i.unit_cost, 0))
             FROM purchase_order_items i
             JOIN purchase_orders po ON po.id = i.po_id
             WHERE i.store_id = p.store_id AND i.product_cost_id = p.id AND po.status != 'cancelled' AND COALESCE(i.remaining_qty, 0) > 0
           ), 0) AS fifo_batch_value
    FROM product_master_costs p
    WHERE p.store_id = ? AND LOWER(COALESCE(p.status, 'active')) != 'archived'
  `;
  const params = [sid];
  if (q) {
    sql += ' AND (LOWER(p.parent_title) LIKE ? OR LOWER(p.variant_title) LIKE ? OR LOWER(COALESCE(p.sku, \'\')) LIKE ? OR LOWER(COALESCE(p.shared_pool_key, \'\')) LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY (CASE WHEN p.inventory_qty < 0 THEN 0 ELSE 1 END) ASC, p.parent_title ASC, p.variant_title ASC LIMIT 300';

  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({
    ...r,
    stock_value: r.inventory_qty > 0
      ? (r.open_batches > 0 ? Math.round(r.fifo_batch_value) : Math.round(r.inventory_qty * r.avg_cost))
      : 0,
  }));
}

async function recordManualStockAdjust(storeId, payload = {}, createdBy = 'Admin') {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const productCostId = Number(payload.product_cost_id);
  const qtyDelta = parseInt(payload.qty_delta, 10);
  const movementType = ['MANUAL_ADJUST', 'RETURN_RESTOCK', 'RETURN_DAMAGED'].includes(payload.movement_type)
    ? payload.movement_type
    : 'MANUAL_ADJUST';
  const notes = (payload.notes || '').trim();
  const pushToShopify = Boolean(payload.pushToShopify);

  if (!productCostId || !Number.isFinite(qtyDelta) || qtyDelta === 0) {
    throw new Error('Select a SKU and enter a non-zero quantity adjustment');
  }

  const pmc = db.prepare('SELECT * FROM product_master_costs WHERE id = ? AND store_id = ?').get(productCostId, sid);
  if (!pmc) throw new Error('SKU not found for this store');

  const newQty = (parseInt(pmc.inventory_qty, 10) || 0) + qtyDelta;
  let unitCost = parseFloat(pmc.landed_cost) || parseFloat(pmc.unit_cost) || 0;

  db.prepare("UPDATE product_master_costs SET inventory_qty = ?, updated_at = datetime('now') WHERE id = ?").run(newQty, pmc.id);
  if (qtyDelta < 0) {
    const consumed = consumeFifoBatches(sid, pmc.id, Math.abs(qtyDelta));
    if (consumed.avgUnitCost > 0) unitCost = consumed.avgUnitCost;
  } else if (qtyDelta > 0) {
    restoreFifoBatch(sid, pmc.id, qtyDelta);
  }
  const invLog = db.prepare(`
    INSERT INTO inventory_ledger
      (store_id, product_cost_id, sku, parent_title, variant_title, movement_type, qty_delta, unit_cost, ref_type, ref_id, ref_label, shopify_pushed, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', '', 'Stock Adjust', 0, ?, ?)
  `).run(sid, pmc.id, pmc.sku || '', pmc.parent_title, pmc.variant_title || '', movementType, qtyDelta, unitCost, notes || 'Manual adjustment', createdBy);

  let shopifyResult = { ok: false, skipped: !pushToShopify };
  if (pushToShopify) {
    shopifyResult = await pushDeltaToShopifyAndLinkedPools(sid, pmc, qtyDelta);
    db.prepare('UPDATE inventory_ledger SET shopify_pushed = ?, shopify_error = ? WHERE id = ?')
      .run(shopifyResult.ok || shopifyResult.partialOk ? 1 : 0, shopifyResult.error || '', Number(invLog.lastInsertRowid));
  }

  return { newQty, shopifyResult };
}

/**
 * Supplier Defective Batch Return:
 * Reduces On Hand (-qty), logs inventory_ledger SUPPLIER_RETURN, and posts Supplier Credit in ledger_entries.
 */
async function recordSupplierReturn(storeId, payload = {}, createdBy = 'Admin') {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const supplierId = Number(payload.supplier_id);
  const productCostId = payload.product_cost_id ? Number(payload.product_cost_id) : null;
  const qty = Math.abs(parseInt(payload.qty, 10) || 0);
  const unitCost = Math.max(0, parseFloat(payload.unit_cost) || 0);
  const entryDate = (payload.entry_date || '').trim() || todayPktDate();
  const notes = (payload.notes || '').trim();
  const pushToShopify = Boolean(payload.pushToShopify);

  if (!supplierId) throw new Error('Supplier is required');
  if (qty <= 0) throw new Error('Return quantity must be > 0');

  const supplier = db.prepare('SELECT id, name FROM suppliers WHERE id = ? AND store_id = ?').get(supplierId, sid);
  if (!supplier) throw new Error('Supplier not found for this store');

  let pmc = null;
  if (productCostId) {
    pmc = db.prepare('SELECT * FROM product_master_costs WHERE id = ? AND store_id = ?').get(productCostId, sid);
  }
  const effectiveUnitCost = unitCost > 0 ? unitCost : (parseFloat(pmc?.landed_cost) || parseFloat(pmc?.unit_cost) || 0);
  const creditAmount = Math.round(qty * effectiveUnitCost * 100) / 100;
  if (creditAmount <= 0) throw new Error('Enter a valid unit cost (> 0) for supplier return credit');

  let invLedgerId = null;
  db.exec('BEGIN');
  try {
    if (pmc) {
      db.prepare("UPDATE product_master_costs SET inventory_qty = COALESCE(inventory_qty, 0) - ?, updated_at = datetime('now') WHERE id = ?")
        .run(qty, pmc.id);
      consumeFifoBatches(sid, pmc.id, qty);
      const invInfo = db.prepare(`
        INSERT INTO inventory_ledger
          (store_id, product_cost_id, sku, parent_title, variant_title, movement_type, qty_delta, unit_cost, ref_type, ref_id, ref_label, shopify_pushed, notes, created_by)
        VALUES (?, ?, ?, ?, ?, 'SUPPLIER_RETURN', ?, ?, 'supplier', ?, ?, 0, ?, ?)
      `).run(sid, pmc.id, pmc.sku || '', pmc.parent_title, pmc.variant_title || '', -qty, effectiveUnitCost, String(supplier.id), supplier.name, notes || 'Returned defective stock to supplier', createdBy);
      invLedgerId = Number(invInfo.lastInsertRowid);
    }

    db.prepare(`
      INSERT INTO ledger_entries
        (store_id, entry_date, entry_type, direction, amount, account_id, supplier_id, po_id, ref_type, ref_id, ref_label, description, created_by)
      VALUES (?, ?, 'supplier_return', 'in', ?, NULL, ?, NULL, 'supplier_return', ?, ?, ?, ?)
    `).run(
      sid, entryDate, creditAmount, supplier.id,
      String(invLedgerId || ''), `${qty} pcs`,
      notes || `Returned ${qty} pcs (${pmc ? pmc.parent_title : 'Stock'}) to ${supplier.name}`,
      createdBy
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  let shopifyResult = { ok: false, skipped: !pushToShopify || !pmc };
  if (pushToShopify && pmc && invLedgerId) {
    shopifyResult = await pushDeltaToShopifyAndLinkedPools(sid, pmc, -qty);
    db.prepare('UPDATE inventory_ledger SET shopify_pushed = ?, shopify_error = ? WHERE id = ?')
      .run(shopifyResult.ok || shopifyResult.partialOk ? 1 : 0, shopifyResult.error || '', invLedgerId);
  }

  return { success: true, creditAmount, shopifyResult };
}

async function toggleContinueSelling(storeId, productCostId, enabled) {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const pmc = db.prepare('SELECT * FROM product_master_costs WHERE id = ? AND store_id = ?').get(Number(productCostId), sid);
  if (!pmc) throw new Error('SKU not found for this store');
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(sid);
  if (!store) throw new Error('Store not found');

  const policy = enabled ? 'continue' : 'deny';
  const res = await updateShopifyInventoryPolicy(store, pmc.shopify_variant_id, policy);
  if (!res.ok) throw new Error(res.error);

  db.prepare("UPDATE product_master_costs SET inventory_policy = ?, updated_at = datetime('now') WHERE id = ?")
    .run(policy, pmc.id);
  return { ok: true, inventory_policy: policy };
}

function linkSharedPool(storeId, productCostId, poolKey = '') {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const cleanKey = String(poolKey || '').trim().toUpperCase().replace(/\s+/g, '-').slice(0, 48);
  const upd = db.prepare("UPDATE product_master_costs SET shared_pool_key = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?")
    .run(cleanKey, Number(productCostId), sid);
  if (!upd.changes) throw new Error('SKU not found for this store');
  return { ok: true, shared_pool_key: cleanKey };
}

function listInventoryLedger(storeId, limit = 80) {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  return db.prepare(`
    SELECT * FROM inventory_ledger
    WHERE store_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(sid, Math.min(250, Number(limit) || 80));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. FINANCIAL ACCOUNTS & UNIFIED NON-DELETABLE LEDGER + AUTO-POST HOOKS
// ─────────────────────────────────────────────────────────────────────────────

function saveAccount(storeId, payload = {}) {
  ensureDefaultAccounts(storeId);
  const sid = Number(storeId) || 1;
  const name = (payload.name || '').trim();
  if (!name) throw new Error('Account name is required');
  const accountType = ['bank', 'cash', 'ad_wallet', 'mobile_wallet'].includes(payload.account_type)
    ? payload.account_type
    : 'bank';
  const openingBalance = parseFloat(payload.opening_balance) || 0;
  const isDefault = payload.is_default ? 1 : 0;
  const notes = (payload.notes || '').trim();

  if (isDefault) {
    db.prepare('UPDATE financial_accounts SET is_default = 0 WHERE store_id = ?').run(sid);
  }

  if (payload.id) {
    const upd = db.prepare(`
      UPDATE financial_accounts
      SET name = ?, account_type = ?, opening_balance = ?, is_default = ?, notes = ?
      WHERE id = ? AND store_id = ?
    `).run(name, accountType, openingBalance, isDefault, notes, Number(payload.id), sid);
    if (!upd.changes) throw new Error('Account not found for this store');
    return db.prepare('SELECT * FROM financial_accounts WHERE id = ?').get(Number(payload.id));
  }

  const info = db.prepare(`
    INSERT INTO financial_accounts (store_id, name, account_type, opening_balance, is_default, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sid, name, accountType, openingBalance, isDefault, notes);
  return db.prepare('SELECT * FROM financial_accounts WHERE id = ?').get(Number(info.lastInsertRowid));
}

function listLedgerEntries(storeId, filters = {}) {
  ensureDefaultAccounts(storeId);
  const sid = Number(storeId) || 1;
  const where = ['e.store_id = ?'];
  const params = [sid];

  if (!filters.includeVoid) where.push('e.is_void = 0');
  if (filters.account_id) { where.push('e.account_id = ?'); params.push(Number(filters.account_id)); }
  if (filters.supplier_id) { where.push('e.supplier_id = ?'); params.push(Number(filters.supplier_id)); }
  if (filters.entry_type && filters.entry_type !== 'all') { where.push('e.entry_type = ?'); params.push(filters.entry_type); }
  if (filters.startDate) { where.push('e.entry_date >= ?'); params.push(filters.startDate); }
  if (filters.endDate) { where.push('e.entry_date <= ?'); params.push(filters.endDate); }

  const limit = Math.min(300, parseInt(filters.limit, 10) || 120);
  return db.prepare(`
    SELECT
      e.*,
      a.name AS account_name,
      a.account_type,
      s.name AS supplier_name,
      po.po_number
    FROM ledger_entries e
    LEFT JOIN financial_accounts a ON a.id = e.account_id
    LEFT JOIN suppliers s ON s.id = e.supplier_id
    LEFT JOIN purchase_orders po ON po.id = e.po_id
    WHERE ${where.join(' AND ')}
    ORDER BY e.entry_date DESC, e.id DESC
    LIMIT ?
  `).all(...params, limit);
}

/**
 * Records a financial ledger entry (supports single-sided payments/capital/drawings AND 2-sided transfers like Bank -> Ad Card).
 */
function recordLedgerEntry(storeId, payload = {}, createdBy = 'Admin') {
  ensureDefaultAccounts(storeId);
  const sid = Number(storeId) || 1;
  const entryType = (payload.entry_type || '').trim();
  const amount = Math.round((parseFloat(payload.amount) || 0) * 100) / 100;
  const entryDate = (payload.entry_date || '').trim() || todayPktDate();
  const description = (payload.description || '').trim();
  const refLabel = (payload.ref_label || '').trim();

  if (amount <= 0) throw new Error('Amount must be greater than 0');

  // 2-Sided Account Transfer (e.g., Bank -> Meta Ad Card, or Bank -> Cash Drawer)
  if (entryType === 'transfer') {
    const fromAccountId = Number(payload.from_account_id || payload.account_id);
    const toAccountId = Number(payload.to_account_id);
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      throw new Error('Select two different accounts (From & To) for a transfer');
    }
    const fromAcc = db.prepare('SELECT id, name FROM financial_accounts WHERE id = ? AND store_id = ?').get(fromAccountId, sid);
    const toAcc = db.prepare('SELECT id, name FROM financial_accounts WHERE id = ? AND store_id = ?').get(toAccountId, sid);
    if (!fromAcc || !toAcc) throw new Error('Invalid source or destination account');

    const transferRef = `TRF-${Date.now()}`;
    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO ledger_entries
          (store_id, entry_date, entry_type, direction, amount, account_id, ref_type, ref_id, ref_label, description, created_by)
        VALUES (?, ?, 'transfer_out', 'out', ?, ?, 'transfer', ?, ?, ?, ?)
      `).run(sid, entryDate, amount, fromAcc.id, transferRef, `To ${toAcc.name}`, description || `Transfer to ${toAcc.name}`, createdBy);

      db.prepare(`
        INSERT INTO ledger_entries
          (store_id, entry_date, entry_type, direction, amount, account_id, ref_type, ref_id, ref_label, description, created_by)
        VALUES (?, ?, 'transfer_in', 'in', ?, ?, 'transfer', ?, ?, ?, ?)
      `).run(sid, entryDate, amount, toAcc.id, transferRef, `From ${fromAcc.name}`, description || `Transfer from ${fromAcc.name}`, createdBy);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { success: true, transferRef };
  }

  const validTypes = ['po_payment', 'supplier_advance', 'capital_in', 'owner_drawing', 'cpr_deposit', 'expense', 'adjustment'];
  if (!validTypes.includes(entryType)) throw new Error(`Invalid entry type: ${entryType}`);

  const accountId = Number(payload.account_id) || getDefaultAccountId(sid, 'bank');
  if (!accountId) throw new Error('Select a Bank/Cash account');

  let direction = payload.direction;
  if (!['in', 'out'].includes(direction)) {
    direction = ['capital_in', 'cpr_deposit'].includes(entryType) ? 'in' : 'out';
  }

  const supplierId = payload.supplier_id ? Number(payload.supplier_id) : null;
  const poId = payload.po_id ? Number(payload.po_id) : null;

  let entryId = null;
  db.exec('BEGIN');
  try {
    let resolvedSupplierId = supplierId;
    let resolvedRefLabel = refLabel;
    if (poId) {
      const po = db.prepare('SELECT id, po_number, supplier_id FROM purchase_orders WHERE id = ? AND store_id = ?').get(poId, sid);
      if (!po) throw new Error('Purchase order not found for this store');
      if (!resolvedSupplierId && po.supplier_id) resolvedSupplierId = po.supplier_id;
      if (!resolvedRefLabel) resolvedRefLabel = po.po_number;
      db.prepare("UPDATE purchase_orders SET paid_amount = COALESCE(paid_amount, 0) + ?, updated_at = datetime('now', '+5 hours') WHERE id = ?")
        .run(amount, po.id);
    }

    const info = db.prepare(`
      INSERT INTO ledger_entries
        (store_id, entry_date, entry_type, direction, amount, account_id, supplier_id, po_id, ref_type, ref_id, ref_label, description, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sid, entryDate, entryType, direction, amount, accountId,
      resolvedSupplierId, poId,
      poId ? 'po' : (payload.ref_type || 'manual'),
      poId ? String(poId) : (payload.ref_id || ''),
      resolvedRefLabel,
      description || entryType.replace(/_/g, ' '),
      createdBy
    );
    entryId = Number(info.lastInsertRowid);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { success: true, id: entryId };
}

/**
 * Safe Non-Deletable Void (Audit Trail Protection):
 * Marks entry is_void = 1 (plus matching transfer pair if transfer) and reverses po.paid_amount if linked to a PO.
 */
function voidLedgerEntry(storeId, entryId, reason = '', createdBy = 'Admin') {
  ensurePoLedgerTables();
  const sid = Number(storeId) || 1;
  const entry = db.prepare('SELECT * FROM ledger_entries WHERE id = ? AND store_id = ?').get(Number(entryId), sid);
  if (!entry) throw new Error('Ledger entry not found for this store');
  if (entry.is_void) return { success: true, alreadyVoid: true };

  const voidReason = `${(reason || 'Voided by admin').trim()} (by ${createdBy})`;

  db.exec('BEGIN');
  try {
    if (entry.ref_type === 'transfer' && entry.ref_id) {
      db.prepare('UPDATE ledger_entries SET is_void = 1, void_reason = ? WHERE store_id = ? AND ref_type = \'transfer\' AND ref_id = ?')
        .run(voidReason, sid, entry.ref_id);
    } else {
      db.prepare('UPDATE ledger_entries SET is_void = 1, void_reason = ? WHERE id = ?').run(voidReason, entry.id);
    }

    if (entry.po_id && entry.entry_type === 'po_payment') {
      db.prepare("UPDATE purchase_orders SET paid_amount = MAX(0, COALESCE(paid_amount, 0) - ?), updated_at = datetime('now', '+5 hours') WHERE id = ? AND store_id = ?")
        .run(entry.amount, entry.po_id, sid);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. AUTOMATIC ZERO-EFFORT POSTING HOOKS (EXPENSES & CPR PAYOUTS)
// ─────────────────────────────────────────────────────────────────────────────

function autoPostExpenseToLedger(expense, createdBy = 'Admin') {
  if (!expense || !expense.id || !(parseFloat(expense.amount) > 0)) return;
  try {
    ensureDefaultAccounts(expense.store_id);
    const sid = Number(expense.store_id) || 1;
    const isCash = String(expense.payment_method || '').toLowerCase().includes('cash');
    const accountId = expense.account_id ? Number(expense.account_id) : getDefaultAccountId(sid, isCash ? 'cash' : 'bank');

    const existing = db.prepare("SELECT id FROM ledger_entries WHERE store_id = ? AND ref_type = 'manual_expense' AND ref_id = ? AND is_void = 0")
      .get(sid, String(expense.id));
    if (existing) {
      db.prepare('UPDATE ledger_entries SET entry_date = ?, amount = ?, account_id = ?, ref_label = ?, description = ? WHERE id = ?')
        .run(expense.expense_date || todayPktDate(), parseFloat(expense.amount) || 0, accountId, expense.category || 'Expense', expense.title || 'Expense', existing.id);
    } else {
      db.prepare(`
        INSERT INTO ledger_entries
          (store_id, entry_date, entry_type, direction, amount, account_id, ref_type, ref_id, ref_label, description, created_by)
        VALUES (?, ?, 'expense', 'out', ?, ?, 'manual_expense', ?, ?, ?, ?)
      `).run(sid, expense.expense_date || todayPktDate(), parseFloat(expense.amount) || 0, accountId, String(expense.id), expense.category || 'Expense', expense.title || 'Expense', createdBy);
    }
  } catch (err) {
    console.warn('[poLedgerService] autoPostExpenseToLedger warning:', err.message);
  }
}

function voidExpenseInLedger(expenseId, createdBy = 'Admin') {
  try {
    ensurePoLedgerTables();
    db.prepare("UPDATE ledger_entries SET is_void = 1, void_reason = ? WHERE ref_type = 'manual_expense' AND ref_id = ? AND is_void = 0")
      .run(`Expense deleted (by ${createdBy})`, String(expenseId));
  } catch (err) {
    console.warn('[poLedgerService] voidExpenseInLedger warning:', err.message);
  }
}

function autoPostCprToLedger(storeId, { courier, cpr, amount, settlementDate }, createdBy = 'Admin') {
  const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
  if (!cpr || amt <= 0) return;
  try {
    ensureDefaultAccounts(storeId);
    const sid = Number(storeId) || 1;
    const accountId = getDefaultAccountId(sid, 'bank');
    const refId = `${courier || 'Courier'}:${cpr}`;
    const desc = `${courier || 'Courier'} COD Settlement (${cpr})`;
    const dateStr = (settlementDate || '').slice(0, 10) || todayPktDate();

    const existing = db.prepare("SELECT id FROM ledger_entries WHERE store_id = ? AND ref_type = 'cpr_settlement' AND ref_id = ? AND is_void = 0")
      .get(sid, refId);
    if (existing) {
      db.prepare('UPDATE ledger_entries SET entry_date = ?, amount = ?, description = ? WHERE id = ?')
        .run(dateStr, amt, desc, existing.id);
    } else {
      db.prepare(`
        INSERT INTO ledger_entries
          (store_id, entry_date, entry_type, direction, amount, account_id, ref_type, ref_id, ref_label, description, created_by)
        VALUES (?, ?, 'cpr_deposit', 'in', ?, ?, 'cpr_settlement', ?, ?, ?, ?)
      `).run(sid, dateStr, amt, accountId, refId, cpr, desc, createdBy);
    }
  } catch (err) {
    console.warn('[poLedgerService] autoPostCprToLedger warning:', err.message);
  }
}

module.exports = {
  ensurePoLedgerTables,
  ensureDefaultAccounts,
  getActiveFifoUnitCost,
  syncSkuFifoCost,
  consumeFifoBatches,
  restoreFifoBatch,
  getExecutiveSummary,
  listSuppliers,
  saveSupplier,
  getSupplierStatement,
  listPurchaseOrders,
  getPurchaseOrder,
  createBaselinePo,
  createPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
  getBackorderDemands,
  getWarehouseStock,
  recordManualStockAdjust,
  recordSupplierReturn,
  toggleContinueSelling,
  linkSharedPool,
  listInventoryLedger,
  listAccounts,
  saveAccount,
  listLedgerEntries,
  recordLedgerEntry,
  voidLedgerEntry,
  autoPostExpenseToLedger,
  voidExpenseInLedger,
  autoPostCprToLedger,
};
