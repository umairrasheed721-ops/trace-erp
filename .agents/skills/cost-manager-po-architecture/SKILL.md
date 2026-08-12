---
name: cost-manager-po-architecture
description: Architectural specification for zero-leak PO-based SKU product costing, 3-tier lookup, ghost product resolution, and baseline historical healing.
---

# Zero-Leak PO-Based SKU Product Costing & Ghost Healing Architecture

This document contains the complete technical specification and design for upgrading TRACE ERP's Product Costing & Inventory Engine to an audit-grade, zero-leak PO system.

---

## 🏛️ Core Architectural Pillars

### 1. 3-Tier Cascade Lookup Architecture
To prevent wrong name matches and zero-cost leaks:
- **Tier 1 (Primary)**: `SKU` (Master Stock Keeping Unit in ERP Catalog).
- **Tier 2 (Backup)**: `Shopify Variant ID` (Used if SKU field is empty in Shopify).
- **Tier 3 (Ghost Products)**: `Normalized Title Key` (`parent_title + variant_title`) — Used when both SKU and Variant ID are missing (e.g. dynamic promo bundles, CRO gifts, custom items).

---

## 📦 2-Phase Deployment Strategy

### Phase 1: 1-Click Shopify Baseline Auto-Sync (Historical & Existing Stock)
- **No Manual CSV Required**.
- TRACE ERP fetches all active variants, SKUs, and Shopify `cost` fields directly via Shopify Admin API.
- Auto-creates **`PO-INITIAL-BASELINE`** for all standard inventory items.
- Scans past historical orders for unmapped Ghost Products and groups them into **`PO-GHOST-BASELINE`**.
- Admin fills/confirms costs in a 1-screen inline editor → All historical past orders auto-heal and lock their CGS instantly.

### Phase 2: PO-Based Batch Tracking (Future Restocks & Launches)
- When new stock arrives from suppliers, a new Purchase Order is logged (`PO #101`, `PO #102`, etc.):
  - `PO #`, `Supplier Name`, `Received Qty`, `Unit Purchase Price`, `Landing/Freight Charges`.
- Dispatched orders draw CGS directly from active PO batches.

---

## 👻 Ghost Product Resolution Engine
1. **Auto-Detection**: Orders containing items without SKU/Variant ID get tagged as `👻 Ghost Item`.
2. **Title Key Memory**: When an admin maps a Ghost Product title once (e.g., *"Summer Deal Pack"*), the system saves a permanent **Ghost Alias Rule**.
3. **Automated Future Resolution**: All future orders with that Ghost Title Key automatically pull the saved cost without manual intervention.

---

## 🛑 Zero-Cost Hard Guard Rules
- Any order with `cost <= 0` is flagged with a red alert: `🛑 Cost Missing`.
- Bulk confirmation or manual booking for zero-cost orders is blocked until cost is mapped.
- Prevents zero-cost leaks from corrupting Daily/Monthly PNL reports.
