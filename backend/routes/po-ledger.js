/**
 * routes/po-ledger.js
 *
 * Strictly Per-Store Isolated REST API for Purchase Orders, Warehouse Inventory & Financial Ledger.
 */

const express = require('express');
const router = express.Router();
const svc = require('../services/poLedgerService');

function resolveStoreId(req) {
  return parseInt(req.body?.store_id || req.query.store_id || req.headers['x-active-store-id'], 10) || 1;
}

function resolveActor(req) {
  return req.user?.username || req.user?.name || req.user?.email || 'Admin';
}

// ── Executive Summary ("Where Is My Money?") ─────────────────────────────────
router.get('/summary', (req, res) => {
  try {
    res.json({ success: true, data: svc.getExecutiveSummary(resolveStoreId(req)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Suppliers & Khata Statements ─────────────────────────────────────────────
router.get('/suppliers', (req, res) => {
  try {
    res.json({ success: true, data: svc.listSuppliers(resolveStoreId(req)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/suppliers', (req, res) => {
  try {
    const saved = svc.saveSupplier(resolveStoreId(req), req.body || {});
    res.json({ success: true, data: saved, message: 'Supplier saved' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/suppliers/:id/statement', (req, res) => {
  try {
    const data = svc.getSupplierStatement(resolveStoreId(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

router.post('/suppliers/return', async (req, res) => {
  try {
    const result = await svc.recordSupplierReturn(resolveStoreId(req), req.body || {}, resolveActor(req));
    res.json({ success: true, data: result, message: `Supplier return recorded (Rs. ${result.creditAmount.toLocaleString()} credit)` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── Purchase Orders ──────────────────────────────────────────────────────────
router.get('/pos', (req, res) => {
  try {
    res.json({ success: true, data: svc.listPurchaseOrders(resolveStoreId(req)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/pos/backorders', (req, res) => {
  try {
    res.json({ success: true, data: svc.getBackorderDemands(resolveStoreId(req)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/pos/baseline', (req, res) => {
  try {
    const po = svc.createBaselinePo(resolveStoreId(req), resolveActor(req));
    res.json({ success: true, data: po, message: `Baseline PO created with ${po.items.length} stocked SKUs` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/pos/:id', (req, res) => {
  try {
    res.json({ success: true, data: svc.getPurchaseOrder(resolveStoreId(req), req.params.id) });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

router.post('/pos', (req, res) => {
  try {
    const po = svc.createPurchaseOrder(resolveStoreId(req), req.body || {}, resolveActor(req));
    res.json({ success: true, data: po, message: `Purchase Order ${po.po_number} created` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/pos/:id', async (req, res) => {
  try {
    const result = await svc.updatePurchaseOrder(resolveStoreId(req), req.params.id, req.body || {}, resolveActor(req));
    const pushNote = req.body?.pushToShopify && result.adjustedLines > 0
      ? ` · Shopify delta pushed: ${result.shopifyResults.pushed}${result.shopifyResults.failed ? ` (${result.shopifyResults.failed} failed)` : ''}`
      : (result.adjustedLines > 0 ? ` · ${result.adjustedLines} line(s) adjusted in ERP` : '');
    res.json({
      success: true,
      data: result,
      message: `${result.po.po_number} updated${pushNote}`,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/pos/:id/reverse', async (req, res) => {
  try {
    const result = await svc.reversePurchaseOrder(resolveStoreId(req), req.params.id, req.body || {}, resolveActor(req));
    const pushNote = req.body?.pushToShopify && result.reversedLines > 0
      ? ` · Shopify reverted: ${result.shopifyResults.pushed}${result.shopifyResults.failed ? ` (${result.shopifyResults.failed} failed)` : ''}`
      : '';
    res.json({
      success: true,
      data: result,
      message: `${result.po?.po_number || 'PO'} reversed & cancelled${pushNote}`,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/pos/:id/receive', async (req, res) => {
  try {
    const result = await svc.receivePurchaseOrder(resolveStoreId(req), req.params.id, req.body || {}, resolveActor(req));
    const mode = result.shopifyResults?.mode || (req.body?.pushToShopify ? 'add_delta' : 'erp_only');
    const modeLabel = mode === 'set_exact_on_hand'
      ? 'Shopify On-Hand set exact'
      : (mode === 'add_delta' ? 'Shopify +Delta pushed' : '');
    const pushNote = modeLabel
      ? ` · ${modeLabel}: ${result.shopifyResults.pushed}${result.shopifyResults.failed ? ` (${result.shopifyResults.failed} failed)` : ''}`
      : ' · ERP Only';
    res.json({
      success: true,
      data: result,
      message: `Received ${result.receivedLines} line(s) on ${result.po.po_number}${pushNote}`,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/pos/:id/cancel', (req, res) => {
  try {
    svc.cancelPurchaseOrder(resolveStoreId(req), req.params.id);
    res.json({ success: true, message: 'Purchase order cancelled' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── Warehouse Inventory, Adjustments, Continue Selling & Shared Pool ─────────
router.get('/inventory', (req, res) => {
  try {
    res.json({ success: true, data: svc.getWarehouseStock(resolveStoreId(req), req.query.search || '') });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/inventory/ledger', (req, res) => {
  try {
    res.json({ success: true, data: svc.listInventoryLedger(resolveStoreId(req), req.query.limit) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/inventory/committed-orders', (req, res) => {
  try {
    const data = svc.getCommittedOrdersForSkus(resolveStoreId(req), {
      product_cost_id: req.query.product_cost_id,
      product_cost_ids: req.query.product_cost_ids,
      parent_title: req.query.parent_title,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/inventory/adjust', async (req, res) => {
  try {
    const result = await svc.recordManualStockAdjust(resolveStoreId(req), req.body || {}, resolveActor(req));
    res.json({
      success: true,
      data: result,
      message: `Stock updated to ${result.newQty}${req.body?.pushToShopify ? (result.shopifyResult?.ok ? ' & pushed to Shopify' : ` (Shopify: ${result.shopifyResult?.error || 'skipped'})`) : ''}`,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/inventory/push-shopify', async (req, res) => {
  try {
    const result = await svc.pushInventoryToShopify(resolveStoreId(req), req.body || {}, resolveActor(req));
    const parts = [`Pushed ${result.pushed} SKU(s) to Shopify (Exact On-Hand)`];
    if (result.skippedNoVariant > 0) parts.push(`${result.skippedNoVariant} skipped (no Shopify Variant ID)`);
    if (result.failed > 0) parts.push(`${result.failed} failed`);
    res.json({
      success: result.pushed > 0 || (result.failed === 0 && result.skippedNoVariant > 0),
      data: result,
      message: parts.join(' · '),
      error: result.pushed === 0 && result.failed > 0 ? result.errors.join(' | ') : undefined,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/inventory/:productCostId/continue-selling', async (req, res) => {
  try {
    const result = await svc.toggleContinueSelling(resolveStoreId(req), req.params.productCostId, Boolean(req.body?.enabled));
    res.json({ success: true, data: result, message: `Continue Selling ${result.inventory_policy === 'continue' ? 'ON' : 'OFF'} on Shopify` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/inventory/:productCostId/shared-pool', (req, res) => {
  try {
    const result = svc.linkSharedPool(resolveStoreId(req), req.params.productCostId, req.body?.shared_pool_key || '');
    res.json({ success: true, data: result, message: result.shared_pool_key ? `Linked to Shared Pool: ${result.shared_pool_key}` : 'Unlinked (Isolated Store SKU)' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── Financial Accounts & Unified Ledger ──────────────────────────────────────
router.get('/accounts', (req, res) => {
  try {
    res.json({ success: true, data: svc.listAccounts(resolveStoreId(req)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/accounts', (req, res) => {
  try {
    const saved = svc.saveAccount(resolveStoreId(req), req.body || {});
    res.json({ success: true, data: saved, message: 'Account saved' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/ledger', (req, res) => {
  try {
    const data = svc.listLedgerEntries(resolveStoreId(req), {
      account_id: req.query.account_id,
      supplier_id: req.query.supplier_id,
      entry_type: req.query.entry_type,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      includeVoid: req.query.includeVoid === '1',
      limit: req.query.limit,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/ledger', (req, res) => {
  try {
    const result = svc.recordLedgerEntry(resolveStoreId(req), req.body || {}, resolveActor(req));
    res.json({ success: true, data: result, message: 'Ledger entry recorded' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/ledger/:id/void', (req, res) => {
  try {
    svc.voidLedgerEntry(resolveStoreId(req), req.params.id, req.body?.reason || '', resolveActor(req));
    res.json({ success: true, message: 'Ledger entry voided (audit preserved)' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
