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

