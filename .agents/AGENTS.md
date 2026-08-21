# Workspace Customization Guidelines (AI-Smart & Token-Efficient)

To ensure high-performance, cost-effective, and token-efficient pair programming in this large ERP codebase:

1. **Concise Responses**: Keep all chat communication extremely brief. Summarize actions in 1-2 sentences. Avoid long pleasantries.
2. **Targeted Reading**: When inspecting code, read only the exact line range of interest using [view_file](file:///absolute/path/to/file) rather than viewing full files to conserve context window tokens.
3. **Helper Reuse**: Do not write redundant utility logic. Always check existing helpers in `backend/utils/` and common controllers before writing new code.
4. **Minimal Diffs**: Make targeted edits (using replace_file_content for contiguous changes) instead of rewriting large sections of files.
5. **No Code Re-Summarization**: Do not re-summarize completed code changes or walkthrough contents in chat responses; simply point the user to the updated files or walkthrough.md.
6. **Shopify Active Theme Safe Sync & Settings Preservation**: Theme ki online settings aur configurations kabhi bhi reset ya overwrite nahi honi chahiye. Agent hamesha pehle `node scratch/pull_theme_settings.js` run kar ke active theme se most recent settings (`settings_data.json` aur `templates/index.json`) fetch aur back up karega, aur uske baad hi safely online updates apply karega. Iske sath hi, theme updates ke baad hamesha `node package_clean_theme.js` (jo `/Users/umairrasheed/Desktop/antigravity/shopify_theme` mein hai) run kar ke dynamic theme zip files (`trace-dynamic-theme.zip`) ko update aur save karega.
7. **Language Preference & Formatting**: Always reply to the user in Roman Urdu (Urdu written in Latin/English script). Explanations ko hamesha bullet points me format karna hai aur comparisons ke liye Roman Urdu markdown tables ka use karna hai.
8. **Brainstorming Mode**: Is session/chat me direct code edit nahi karna jab tak user na kahe. User ki queries aur screenshots ke base par pure focus ke sath brainstorming aur guidance provide karni hai.
9. **Railway Cost & Resource Optimization**: Railway deployment billing ko control me rakhne ke liye agent hamesha code optimize karega:
   - High RAM/CPU leak hone se roko: Unbounded in-memory arrays, redundant background loops, ya fast unthrottled polling loops code me add na karo.
   - Database queries ko indexed, lightweight, aur memory-efficient banao.
   - Node.js garbage collection aur stream handling optimize rakho taake Railway RAM billing ($12+ RAM usage) minimum scale par rahe.
10. **PNL Reports Module — Dual Calculation Architecture (CRITICAL)**:
   - Reports module me PNL calculations **DO NOT** live in one place — they have TWO separate paths:
     - **Daily PNL (📅 Daily PNL view)**: Calculated in `backend/routes/reports.js` (lines ~140-165). Any formula change MUST be applied here.
     - **Monthly PNL (📊 Month Vise view)**: Calculated in `frontend/src/hooks/useReportsData.js` (lines ~279-356) via a `useMemo` monthly `reduce` aggregation. Any formula change MUST ALSO be applied here.
   - **Rule**: Whenever ANY PNL metric formula is changed (e.g. `actualPnl`, `pnl`, `grossProfit`), ALWAYS grep both files for the variable and apply the fix in BOTH locations before building.
   - **Key Metric Formulas**:
     - `Final PNL` = `Gross Profit - Ad Spend - Hybrid Courier - Manual Exp` (uses estimated/hybrid courier)
     - `Actual PNL (Cash)` = `(Payouts Received - CGS) - Ad Spend - Actual Courier - Manual Exp` (uses actual reconciled courier fees)
11. **PNL Reports Module — Code Health & AI-Readability Standard**:
   Whenever ANY change is made to the PNL Reports module, the agent MUST enforce the following code quality standards:
   - **AI-Friendly Comments**: Every formula block in `backend/routes/reports.js` (lines ~140-165) and `frontend/src/hooks/useReportsData.js` (lines ~326-354) MUST have a 1-line comment above it explaining WHAT it computes and WHY. Format: `// 📊 METRIC_NAME: Formula description. Source fields: X, Y, Z`
   - **No Dead Code**: Remove any unused variables, commented-out formula lines, or leftover debug `console.log()` statements before committing.
   - **No Magic Numbers**: Raw numbers like `200` (per-order courier estimate), `0.04` (tax rate), `0.9` (payment diff threshold) MUST be extracted to named constants at the top of the file with a comment explaining them. E.g. `const EST_COURIER_PER_ORDER = 200; // Rs per dispatched order standard rate`
   - **Backfill Zero-Row Parity**: The zeroed-row backfill object in `reports.js` (lines ~248-257) MUST always be updated to match the live computed row shape. If a new field is added to the live result, it MUST also be added to the backfill row with a safe default.
   - **Formula Source Labels**: Each metric variable name MUST clearly imply its source:
     - `deliveredSale` = Shopify delivered orders value
     - `paymentPaid` = Actual payout from courier (bank deposit)
     - `hybridCourierFee` = Est. for unreconciled + actual for reconciled orders
     - `actualCourierFee` = Only reconciled/paid courier fees

12. **Courier Status Mapping — 7 Core ERP Statuses Architecture (CRITICAL)**:
   ERP Statuses are strictly limited to **7 Core Statuses** across frontend (`frontend/src/utils/orderUtils.js`) and backend (`backend/routes/status-mappings.js`, `backend/engines/tracking/statusMapper.js`):
   - `Pending`, `Booked`, `In Transit`, `Delivered`, `Returned`, `Return Received`, `Cancelled`

   **Status Hierarchy**:
   | ERP Status | Purpose / Meaning | Example Courier Phrases |
   |---|---|---|
   | `Pending` | Order placed, awaiting booking | Unfulfilled, New |
   | `Booked` | Courier booking generated | Pickup Done, Booked, Confirmed |
   | `In Transit` | Active movement (Forward OR Return journey) | In Transit, Shipped, En Route, Out for Delivery, Attempted, Shipper Advice, Return Initiated, Return In Transit |
   | `Delivered` | Successfully delivered to customer | Delivered, Delivered to Customer |
   | `Returned` | Parcel returned by courier to merchant warehouse | Returned at Merchant Warehouse, Returned to Shipper |
   | `Return Received` | **RESTOCK (MANUAL ONLY)** — Merchant verified & restocked inventory | Never set by auto-sync |
   | `Cancelled` | Order cancelled before dispatch | Cancelled, Void |

   **Key Safety Rules**:
   - Intermediate return statuses (`Return Initiated`, `Return In Transit`, `Shipper Advice`, `Out for Delivery`, `Attempted`) MUST NEVER be separate ERP statuses — all active parcel movement MUST map to `In Transit`.
   - `Return Received` (Restock) is in `DEAD_STATUSES` and MUST NEVER be set automatically by courier sync.
   - `Returned` represents parcels physically arrived back at merchant warehouse (`returned at merchant`).
   - **No Dispatched / Tracked Order at Pending**: Any order that has a assigned `tracking_number` OR a non-empty `courier_status` (e.g. `Attempted`, `Booked`, `In Transit`) MUST NEVER remain at `Pending` ERP status — it MUST automatically be mapped to `In Transit`, `Booked`, `Delivered`, or `Returned`.
   - **Single-Source-of-Truth Status Parity (CRITICAL)**: Reports (`backend/routes/reports.js`) MUST ALWAYS be a 100% exact 1-to-1 mirror of Command Center `delivery_status` (ERP Status). Reports MUST NEVER apply custom override logic or fallback rules that disagree with what is shown in Command Center. If an order's status is wrong (e.g. a Voided order stuck at Pending), the bug MUST be fixed at the data/sync source (updating `delivery_status = 'Cancelled'` in DB via migration) so that BOTH Command Center dropdown AND Reports table reflect `Cancelled` simultaneously.

   **Mandatory Auto-Heal Migration Rule**:
   Whenever a status mapping bug is FIXED (wrong keyword removed or corrected), you MUST ALSO add a new numbered migration in `backend/db/migrations/orders.js` that:
   - Targets all orders already stuck at the wrong `delivery_status` due to the old bug
   - Safely updates them to the correct status
   - NEVER touches orders already at final statuses (`returned`, `return received`, `cancelled`, `delivered`)
   - Logs how many orders were healed (e.g. `✅ [Migration #N] Auto-healed X orders...`)
   
   Template:
   ```js
   // N. Auto-heal orders stuck due to [bug description]
   (db) => {
     try {
       const result = db.prepare(`
         UPDATE orders SET delivery_status = 'CORRECT_STATUS'
         WHERE LOWER(courier_status) LIKE '%affected_keyword%'
         AND LOWER(delivery_status) NOT IN ('returned', 'return received', 'cancelled', 'delivered')
       `).run();
       if (result.changes > 0) console.log(`✅ [Migration #N] Auto-healed ${result.changes} orders.`);
     } catch (e) { console.error('Migration #N failed:', e.message); }
   }
   ```

13. **Product Costing & PO-SKU Architecture Specification**:
   Future implementation of Product Costing & PO Module MUST strictly follow the design specification in `.agents/skills/cost-manager-po-architecture/SKILL.md`:
   - 3-Tier Cascade Lookup (`SKU Primary` -> `Variant ID Backup` -> `Title Key for Ghosts`).
   - 1-Click Shopify Baseline Auto-Sync (`PO-INITIAL-BASELINE` & `PO-GHOST-BASELINE`).
   - Zero-Cost Hard Blocking Guard on booking/confirmation.

14. **Universal Double-Tap Copy & Multi-Courier Live Tracking Standards**:
   - **Universal Double-Click & Touch Double-Tap Copy**: Double-click (or mobile touch `touchend` double-tap < 350ms) MUST trigger quick copy with `copyWithTooltip` across ALL elements (table cells, cards, modals, drawers, tracking timelines, text badges) in the entire ERP. Always check `window.getSelection()` first to preserve user's highlighted text.
   - **Multi-Courier Tracking History Log Parity**: `/api/shipper-advice/live-tracking-history` MUST support ALL integrated couriers (PostEx, Instaworld, Leopards, TCS, LCS, Trax) with automatic key rotation and fallback to DB `tracking_history`. Date strings from Pakistani APIs (`DD/MM/YYYY hh:mm AM/PM`) MUST be parsed using a dedicated `DD/MM/YYYY` regex parser to prevent month/day misinterpretations (e.g. 11/08 being parsed as November 8 instead of August 11).

15. **Production Deployment & Architecture Change Guard (CRITICAL)**:
    - **No Aggressive Gateway or Schema Overhauls Without Isolated Staging Verification**: Never perform mass file consolidation, gateway routing overhauls, or global layout rewrites in a single commit on production.
    - **Strict Pre-Commit Empirical Verification**: Any optimization or simplification MUST be verified locally and via production endpoint testing before committing. If an optimization breaks data loading or layout accessibility, immediately perform a clean git revert to the last verified commit (`git reset --hard <working_hash>`).
    - **Zero-Downtime Resilience**: Core system gateways (`orders-query.js`, `storeAccess.js`, `App.jsx`) MUST maintain fallback defaults so that missing parameters or legacy data shapes NEVER crash the UI or cause 0-row query locks.

16. **Core Layout Component Import Protection Standard**:
    - When editing top-level application containers (`App.jsx`, `AppProvider.jsx`, `Sidebar.jsx`), core layout component imports (`Sidebar`, `Topbar`, `ToastContainer`, `ErrorBoundary`) MUST NEVER be removed, deleted, or mis-replaced.
    - All edits to `App.jsx` MUST preserve the original import headers to guarantee that React layout components are defined at render time.

17. **Middleware & Query Fallback Protocol (Zero 0-Row Locks)**:
    - Express middlewares (`storeAccess.js`, `tenant.js`) and database query filter builders (`orderFilterBuilder.js`, `orders-query.js`) MUST ALWAYS enforce safe fallback defaults (e.g. `rawStoreId || 1`).
    - If a client request omits `store_id` or passes `null`/`undefined`, backend endpoints MUST default to active store `#1` rather than generating `o.store_id = NaN` or returning empty `0-row` results.

18. **3-Point Automated Pre-Push Verification Protocol**:
    - Before pushing any commit to production main branch, the agent MUST run a 3-point automated verification:
      1. Syntax check (`node backend_check.js`).
      2. Frontend bundle build (`npm run build`).
      3. Empirical database query test (`node -e "require('./backend/db')"` / `getOrderFilters` test).
    - If any of the 3 points fails or yields unexpected behavior, the agent MUST fix or revert immediately before calling git push.

19. **Shopify Liquid Theme & CRO Funnel Precautionary Standard**:
    - **No Hardcoded Store Content**: Bank details, wallet labels, prices, or promotion text in Liquid snippets (`snippets/trace-cro-funnel.liquid`, `snippets/trace-cod-checkout.liquid`) MUST NEVER be hardcoded. Always bind them to dynamic Liquid theme settings (`settings.*`) or theme customizer inputs.
    - **Mobile Viewport & Typography Shield (>=320px)**: All buttons, tags, and price badges MUST be responsive down to 320px screens. Avoid fixed-width inline SVGs inside button flex containers that shrink, stretch, or deform text.
    - **Order Payload & Conversion Protection**: Modifications to draft order payloads or WhatsApp conversion links MUST preserve line item quantities, variant IDs, discount percentages, and customer metadata to ensure zero conversion tracking loss.

20. **Idempotent DB Migration & Railway Server Resilience**:
    - All database migrations in `backend/db/migrations/` MUST be strictly idempotent (`IF NOT EXISTS`, safe `try/catch` per migration block). A failing migration must log an error and allow the app server to start smoothly on Railway without crash loops.
    - Unhandled Promise rejections in API routes MUST be caught and handled with standard structured JSON responses `{ success: false, message: '...' }`.

21. **Courier API Resilience & Rate-Limit Guard**:
    - All external courier API requests (PostEx, Leopards, TCS, Trax, LCS, Instaworld) MUST enforce explicit timeouts (e.g. 5000ms max via Axios/Fetch) and key rotation fallbacks. API outages MUST gracefully degrade to cached DB status without throwing unhandled exceptions.

22. **Payment Variance Tolerance Threshold Standard**:
    - The payment variance tolerance threshold is strictly set to **`10.0` PKR (Rs. 10)** across PNL reports (`backend/routes/reports.js`), Command Center filters (`backend/services/orderFilterBuilder.js`), and Finance Payout Reconciler (`backend/routes/finance/finance-sessions.js`).
    - Payout discrepancies <= Rs. 10 MUST automatically be marked as **Paid & Cleared** without flagging unpaid balance.

23. **Shopify Order Notes Reconciliation Standard**:
    - Every reconciled payout synced to Shopify MUST include full financial details in the Shopify Order Note:
      - Delivered: `| 💰 COD Rec: YYYY-MM-DD | Ref: CPR-XXX | Amt: X | Charges: Y | Net: Z`
      - Return: `| ↩️ Return Charged: YYYY-MM-DD | Ref: CPR-XXX | Charges: Y`

24. **WhatsApp Bot & Template Variable Protection**:
    - All WhatsApp template placeholders (`{{customer_name}}`, `{{tracking_number}}`, `{{courier_name}}`, `{{order_ref}}`) MUST be sanitized and checked against `null`/`undefined` before invoking WhatsApp API to prevent blank message dispatches.

25. **Payout Reconciliation Duplicate Prevention Protocol**:
    - Quick Reconcile and Payout Session processing MUST enforce strict idempotent duplicate checks on `cpr_reference` or `(order_id, payment_date)` in `recon_logs` to prevent double-recording payments or inflating financial payouts.

26. **24-Hour PNL Delta Tracking & Baseline Snapshot Architecture**:
    - **Month Vise View 24h Delta Badges**: Month Vise View (`useReportsData.js` & `PnLMetricsPanel.jsx`) MUST compare current monthly metrics against the 24-hour baseline snapshot stored in `pnl_daily_snapshots`.
    - **Snapshot Auto-Persistence**: Whenever `monthlyData` is rendered or updated, frontend MUST automatically persist today's monthly snapshot to `/api/reports/snapshots-24h` so that future 24h comparisons always have accurate historical baselines.
    - **Delta Directional Rules**: Positive growth metrics (PNL, Delivered Sale, DEL%) show GREEN for positive diffs (`⚡ +12.5k`), RED for negative diffs (`🔻 -4.2k`). Expense/cost/cancel metrics show RED for positive diffs (`▲ +2k`) and GREEN for negative diffs (`▼ -1k`).
    - **Top-Level Helper Scope Protection**: Render helpers like `render24hBadge` MUST be declared in the top-level component scope (above `if (loading)` or conditional layout blocks like `if (tableLayout === 'vertical')`) so that both Horizontal and Vertical table views can invoke them without `ReferenceError` crashes.

27. **Shopify Theme Push Script — File List Completeness Guard**:
    - `scratch/push_theme_files.js` me har naya edited theme file (`sections/`, `snippets/`, `assets/`) MUST be explicitly added to the upload list before deploying. Never assume a file will be uploaded if it is not listed.
    - After adding any new theme file, ALWAYS verify live rendered HTML (`curl -s "https://tracepk.com/products/..."`) to confirm new markup is present before concluding deployment is done.
    - **Root Cause Pattern**: If a Liquid/JS change is applied but live site shows old markup, FIRST check whether `push_theme_files.js` includes that file — do NOT keep iterating on file content itself.

28. **Shopify Liquid — `file_reference` Video Metafield Extraction Standard**:
    - When Metafield type is `file_reference` pointing to an uploaded Video (`.mp4`), Liquid drop structure is:
      - `metafield.value` → Video object (NOT a URL string, NOT a GID)
      - `metafield.value.sources` → array of `{ url, mime_type, format }` objects
      - `metafield.value.sources.first.url` → direct CDN MP4 URL
    - ALWAYS iterate `.sources` and match `format == 'mp4'` to extract a usable URL.
    - NEVER use `{{ metafield.value }}` directly in `<script>` expecting a URL — outputs GID string (`gid://shopify/Video/...`), not a CDN URL.
    - Railway backend's `app.get('*')` SPA catch-all will intercept any `/api/public/...` calls from Shopify storefront and return `index.html` instead of JSON. For storefront JS, ALWAYS use same-origin Shopify endpoints (`/products/handle.js` or Liquid output variables) instead of Railway public routes.

29. **Sidebar & User Management Single-Source Navigation Standard**:
    - All ERP application pages and routes MUST be registered in the single-source-of-truth registry `frontend/src/utils/navigationItems.js` (`NAV_ITEMS`).
    - Both `Sidebar.jsx` (Navigation Menu) and `Users.jsx` (`RoleAuthorityMatrix`) MUST dynamically import `NAV_ITEMS` from this registry.
    - Whenever a new page or route is added, removed, or renamed, the agent MUST update `navigationItems.js` so that Sidebar navigation and User Management permissions matrix update simultaneously in 100% parity.
