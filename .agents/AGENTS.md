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

12. **Courier Status Mapping — Architecture & Safety Rules (CRITICAL)**:
   Status mapping lives in **THREE** places — a change in one must be verified in all three:
   - `backend/engines/tracking/statusMapper.js` — keyword-to-ERP-status function (live sync)
   - `backend/db/migrations/orders.js` — startup auto-heal SQL migrations (runs on every deploy)
   - `backend/db/migrations/tracking.js` — DB seed rules for status_mappings table

   **Return Status Hierarchy (DO NOT confuse these)**:
   | ERP Status | Meaning | Example Courier Phrase |
   |---|---|---|
   | `Return Initiated` | Courier started return process, parcel still with courier | "Return Initiated", "Out For Return" |
   | `Return In Transit` | Parcel physically moving back toward merchant | "Return In Transit", "Enroute", "Return To Hub" |
   | `Returned` | Parcel physically arrived back at merchant warehouse | "Returned at Merchant Warehouse", "Returned to Shipper" |
   | `Return Received` | **MANUAL ACTION ONLY** — merchant physically confirmed receipt | Never set by sync |

   **Key Safety Rules**:
   - A keyword MUST map to ONLY ONE status — if a phrase appears in multiple status conditions, it will cause incorrect mapping.
   - Before adding ANY new keyword to a status condition, grep ALL 3 files above for that keyword to check for conflicts.
   - `Return Received` is FINAL (in DEAD_STATUSES) and MUST NEVER be set by auto-sync — only by manual user action.
   - Phrases containing `merchant warehouse` = return COMPLETE → always maps to `Returned` (never `Return In Transit`).
   - When adding new courier keywords, test by checking: does this phrase appear in ANY other status condition? If yes — resolve conflict first.

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






