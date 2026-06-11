# TracePK ERP - AI Context Map

## 1. Architecture Overview
TracePK ERP is built using a modern, decoupled, multi-tenant architecture designed for premium stability, performance, and anti-ban WhatsApp operations.
* **Frontend Command Centre:** Built as a responsive React single-page application using modern utility styles and Server-Sent Events (SSE) + WebSockets for real-time live data updates.
* **Backend APIs & Routing:** An Express-based backend serving dynamic REST APIs with modular middleware, lazy loading for isolated worker processes, and full WebSocket/SSE streaming.
* **WhatsApp Engine (Baileys):** Leverages a decoupled socket structure with custom hooks. Bypasses standard serialization models for poll updates to preserve cryptographic binary signatures, enabling secure native AES-GCM vote decryption. Includes simulated typing delays and smart queue backoff mechanisms to evade WhatsApp spam filters.
* **Database Layer:** Utilizes SQLite via the Node.js native `node:sqlite` (DatabaseSync) module for near-zero latency. Features WAL logging, RAM temp tables, mmap configurations, and thread-safe AsyncLocalStorage for multi-tenant isolation.
* **Shopify & Courier Integrations:** Integrates order webhook syncs with a resilient, background-throttled queue to reliably push tags to Shopify and coordinate booking with regional couriers.

## 2. Total LOC Summary
* **Frontend:** 29,185 lines
* **Backend APIs & Routing:** 15,790 lines
* **WhatsApp Engine:** 8,868 lines
* **Database Layer:** 1,514 lines
* **Shopify Sync:** 300 lines

**Total Workspace Codebase size:** 55,657 lines of code (LOC).

## 3. Directory Tree & File LOC
```text
├── .deployment_trigger (2 LOC) - ERP workspace source file: .deployment_trigger
├── .dockerignore (59 LOC) - ERP workspace source file: .dockerignore
├── .gitignore (63 LOC) - ERP workspace source file: .gitignore
├── Dockerfile (59 LOC) - ERP workspace source file: Dockerfile
├── backend/
│   ├── db/
│   │   └── migrations/
│   │       ├── finance.js (81 LOC) - Database schema migration definitions for: finance.js
│   │       ├── orders.js (282 LOC) - Contains SQLite definitions for main order registry tables, customer profiles, and settings.
│   │       ├── tracking.js (109 LOC) - Database schema migration definitions for: tracking.js
│   │       └── whatsapp.js (539 LOC) - Contains SQLite definitions for whatsapp_polls, indexes, and functional updates (order_id, erp_status).
│   ├── engines/
│   │   ├── bot/
│   │   │   ├── eventRouter.js (717 LOC) - Routes incoming events. Handles delivery checks, native poll votes, and fuzzy Urdu/English text replier.
│   │   │   ├── groupHandler.js (18 LOC) - ERP workspace source file: groupHandler.js
│   │   │   └── sessionManager.js (521 LOC) - Initializes makeWASocket connections, logs creds saves, and exposes native getMessage decryption hook.
│   │   ├── gemini/
│   │   │   ├── functionDispatcher.js (269 LOC) - ERP workspace source file: functionDispatcher.js
│   │   │   └── toolDefinitions.js (83 LOC) - ERP workspace source file: toolDefinitions.js
│   │   ├── processors/
│   │   │   ├── aiDispatcher.js (222 LOC) - ERP workspace source file: aiDispatcher.js
│   │   │   ├── mediaHandler.js (184 LOC) - ERP workspace source file: mediaHandler.js
│   │   │   └── replyFormatter.js (319 LOC) - ERP workspace source file: replyFormatter.js
│   │   ├── shopify/
│   │   │   ├── fulfillments.js (118 LOC) - ERP workspace source file: fulfillments.js
│   │   │   ├── orders.js (739 LOC) - ERP workspace source file: orders.js
│   │   │   └── products.js (327 LOC) - ERP workspace source file: products.js
│   │   ├── tracking/
│   │   │   ├── instaworld.js (202 LOC) - ERP workspace source file: instaworld.js
│   │   │   ├── postex.js (169 LOC) - ERP workspace source file: postex.js
│   │   │   └── statusMapper.js (38 LOC) - ERP workspace source file: statusMapper.js
│   │   ├── alerts.js (15 LOC) - ERP workspace source file: alerts.js
│   │   ├── audit_service.js (105 LOC) - ERP workspace source file: audit_service.js
│   │   ├── circuit_breaker.js (92 LOC) - ERP workspace source file: circuit_breaker.js
│   │   ├── cod_verifier.js (227 LOC) - ERP workspace source file: cod_verifier.js
│   │   ├── courier_sync.js (163 LOC) - ERP workspace source file: courier_sync.js
│   │   ├── ffmpeg_transcode.js (174 LOC) - ERP workspace source file: ffmpeg_transcode.js
│   │   ├── gemini_engine.js (418 LOC) - ERP workspace source file: gemini_engine.js
│   │   ├── instaworld_http.js (122 LOC) - ERP workspace source file: instaworld_http.js
│   │   ├── instaworld.js (91 LOC) - ERP workspace source file: instaworld.js
│   │   ├── logistics.js (50 LOC) - ERP workspace source file: logistics.js
│   │   ├── postex.js (101 LOC) - ERP workspace source file: postex.js
│   │   ├── redis_auth.js (101 LOC) - ERP workspace source file: redis_auth.js
│   │   ├── shopify_finance.js (339 LOC) - ERP workspace source file: shopify_finance.js
│   │   ├── shopify_sync.js (226 LOC) - ERP workspace source file: shopify_sync.js
│   │   ├── shopify.js (38 LOC) - ERP workspace source file: shopify.js
│   │   ├── sniper.js (87 LOC) - ERP workspace source file: sniper.js
│   │   ├── tracking.js (219 LOC) - ERP workspace source file: tracking.js
│   │   ├── watchdog.js (146 LOC) - ERP workspace source file: watchdog.js
│   │   ├── whatsapp_bot.js (938 LOC) - Instantiates the Baileys connection socket, QR buffers, auto-retry schedulers, and memory store maps.
│   │   └── whatsapp_message_processor.js (1290 LOC) - Core processing loop. Simulates human typing delay, handles media resizing, and logs message history.
│   ├── middleware/
│   │   ├── async.js (6 LOC) - ERP workspace source file: async.js
│   │   ├── error.js (15 LOC) - ERP workspace source file: error.js
│   │   ├── response.js (20 LOC) - ERP workspace source file: response.js
│   │   └── tenant.js (28 LOC) - ERP workspace source file: tenant.js
│   ├── public/
│   │   ├── assets/
│   │   │   ├── AdviceMonitor-2cad559I.js (6 LOC) - ERP workspace source file: AdviceMonitor-2cad559I.js
│   │   │   ├── ApiStatusBanner-Bp7TB8sL.js (2 LOC) - ERP workspace source file: ApiStatusBanner-Bp7TB8sL.js
│   │   │   ├── Connect-_E9c-Gdc.js (2 LOC) - ERP workspace source file: Connect-_E9c-Gdc.js
│   │   │   ├── CostManager-DCh_M6oC.js (10 LOC) - ERP workspace source file: CostManager-DCh_M6oC.js
│   │   │   ├── CourierIntelligence-BkrR6DAU.js (2 LOC) - ERP workspace source file: CourierIntelligence-BkrR6DAU.js
│   │   │   ├── Dashboard-C-eAOSTQ.js (69 LOC) - ERP workspace source file: Dashboard-C-eAOSTQ.js
│   │   │   ├── DiagnosticCenter-BuRLrsxw.js (2 LOC) - ERP workspace source file: DiagnosticCenter-BuRLrsxw.js
│   │   │   ├── FinanceManager-CPwLTtJb.js (2 LOC) - ERP workspace source file: FinanceManager-CPwLTtJb.js
│   │   │   ├── index-CBLh90Ep.css (2 LOC) - ERP workspace source file: index-CBLh90Ep.css
│   │   │   ├── index-DOhygjqJ.js (88 LOC) - ERP workspace source file: index-DOhygjqJ.js
│   │   │   ├── Login-DGxLekfV.js (2 LOC) - ERP workspace source file: Login-DGxLekfV.js
│   │   │   ├── MarketingIntelligence-DFGtTKGe.js (26 LOC) - ERP workspace source file: MarketingIntelligence-DFGtTKGe.js
│   │   │   ├── PayoutReconciler-DWFgp9hF.js (105 LOC) - ERP workspace source file: PayoutReconciler-DWFgp9hF.js
│   │   │   ├── PreventionManager-BqKrpgNy.js (2 LOC) - ERP workspace source file: PreventionManager-BqKrpgNy.js
│   │   │   ├── Profile-BsrFmQMl.js (2 LOC) - ERP workspace source file: Profile-BsrFmQMl.js
│   │   │   ├── Reports-8UvWdRyX.js (17 LOC) - ERP workspace source file: Reports-8UvWdRyX.js
│   │   │   ├── ReturnsManager-CyevDski.js (4 LOC) - ERP workspace source file: ReturnsManager-CyevDski.js
│   │   │   ├── SearchTool-cKYWv3CQ.js (48 LOC) - ERP workspace source file: SearchTool-cKYWv3CQ.js
│   │   │   ├── StatusMappingManager-HtJBUw07.js (2 LOC) - ERP workspace source file: StatusMappingManager-HtJBUw07.js
│   │   │   ├── StuckMonitor-BAgXR7Pe.js (2 LOC) - ERP workspace source file: StuckMonitor-BAgXR7Pe.js
│   │   │   ├── SystemStatus-59tBEpuf.js (2 LOC) - ERP workspace source file: SystemStatus-59tBEpuf.js
│   │   │   ├── TemplateManager-6XdPwvtO.js (2 LOC) - ERP workspace source file: TemplateManager-6XdPwvtO.js
│   │   │   ├── TrackingPortal-BZy5OjRz.js (2 LOC) - ERP workspace source file: TrackingPortal-BZy5OjRz.js
│   │   │   ├── usePersistentState-Db5WhLBa.js (2 LOC) - ERP workspace source file: usePersistentState-Db5WhLBa.js
│   │   │   ├── Users-B7_Zq5BY.js (2 LOC) - ERP workspace source file: Users-B7_Zq5BY.js
│   │   │   ├── Watchdog-Dl1KcfBU.js (2 LOC) - ERP workspace source file: Watchdog-Dl1KcfBU.js
│   │   │   ├── WhatsAppBot-BecMPUaC.js (2 LOC) - ERP workspace source file: WhatsAppBot-BecMPUaC.js
│   │   │   └── WhatsAppPortal-D9IaRExB.js (97 LOC) - ERP workspace source file: WhatsAppPortal-D9IaRExB.js
│   │   ├── favicon.svg (9 LOC) - ERP workspace source file: favicon.svg
│   │   └── index.html (18 LOC) - ERP workspace source file: index.html
│   ├── routes/
│   │   ├── finance/
│   │   │   ├── finance-corrections.js (576 LOC) - Express API route handler for: finance-corrections.js
│   │   │   ├── finance-exports.js (37 LOC) - Express API route handler for: finance-exports.js
│   │   │   └── finance-sessions.js (500 LOC) - Express API route handler for: finance-sessions.js
│   │   ├── orders/
│   │   │   ├── orders-bulk.js (243 LOC) - Express API route handler for: orders-bulk.js
│   │   │   ├── orders-mutations.js (535 LOC) - Express API route handler for: orders-mutations.js
│   │   │   └── orders-query.js (377 LOC) - Retrieves and filters client orders, merged in JavaScript with SQLite poll data.
│   │   ├── whatsapp/
│   │   │   ├── wa-broadcasts.js (174 LOC) - Express API route handler for: wa-broadcasts.js
│   │   │   ├── wa-optouts.js (33 LOC) - Express API route handler for: wa-optouts.js
│   │   │   ├── wa-rules.js (497 LOC) - Express API route handler for: wa-rules.js
│   │   │   └── wa-templates.js (177 LOC) - Express API route handler for: wa-templates.js
│   │   ├── auth.js (277 LOC) - Express API route handler for: auth.js
│   │   ├── bulk_booking.js (214 LOC) - Express API route handler for: bulk_booking.js
│   │   ├── cities.js (60 LOC) - Express API route handler for: cities.js
│   │   ├── cost_debug.js (43 LOC) - Express API route handler for: cost_debug.js
│   │   ├── cost-manager.js (112 LOC) - Express API route handler for: cost-manager.js
│   │   ├── customer-success.js (290 LOC) - Express API route handler for: customer-success.js
│   │   ├── diagnostics.js (557 LOC) - Express API route handler for: diagnostics.js
│   │   ├── finance.js (10 LOC) - Express API route handler for: finance.js
│   │   ├── index.js (321 LOC) - Express API route handler for: index.js
│   │   ├── monitors.js (127 LOC) - Express API route handler for: monitors.js
│   │   ├── orders.js (10 LOC) - Express API route handler for: orders.js
│   │   ├── postex.js (173 LOC) - Express API route handler for: postex.js
│   │   ├── public.js (151 LOC) - Express API route handler for: public.js
│   │   ├── reports.js (427 LOC) - Express API route handler for: reports.js
│   │   ├── scheduler.js (57 LOC) - Express API route handler for: scheduler.js
│   │   ├── settings.js (139 LOC) - Express API route handler for: settings.js
│   │   ├── status-mappings.js (88 LOC) - Express API route handler for: status-mappings.js
│   │   ├── stores.js (225 LOC) - Express API route handler for: stores.js
│   │   ├── sync.js (220 LOC) - Express API route handler for: sync.js
│   │   ├── system.js (16 LOC) - Express API route handler for: system.js
│   │   ├── templates.js (181 LOC) - Express API route handler for: templates.js
│   │   ├── tracking.js (278 LOC) - Express API route handler for: tracking.js
│   │   ├── users.js (97 LOC) - Express API route handler for: users.js
│   │   ├── watchdog.js (45 LOC) - Express API route handler for: watchdog.js
│   │   ├── webhooks.js (206 LOC) - Mounts Shopify and WhatsApp callbacks to receive webhook event signals.
│   │   ├── whatsapp-governance.js (1243 LOC) - Express API route handler for: whatsapp-governance.js
│   │   └── whatsapp.js (232 LOC) - REST endpoints to query WhatsApp connection state, trigger test messages, and poll vote statuses.
│   ├── scripts/
│   │   ├── auto_shrink.js (133 LOC) - ERP workspace source file: auto_shrink.js
│   │   ├── optimize_db.js (50 LOC) - ERP workspace source file: optimize_db.js
│   │   ├── purge_old_media.js (84 LOC) - ERP workspace source file: purge_old_media.js
│   │   ├── reset_wa_session.js (64 LOC) - ERP workspace source file: reset_wa_session.js
│   │   ├── run_migrations.js (120 LOC) - ERP workspace source file: run_migrations.js
│   │   ├── shrink_db.js (154 LOC) - ERP workspace source file: shrink_db.js
│   │   ├── storage_audit.js (136 LOC) - ERP workspace source file: storage_audit.js
│   │   ├── stressTest.js (174 LOC) - ERP workspace source file: stressTest.js
│   │   ├── syncImagesNightly.js (224 LOC) - ERP workspace source file: syncImagesNightly.js
│   │   ├── trackingReconciler.js (302 LOC) - ERP workspace source file: trackingReconciler.js
│   │   └── truncate_logs.js (81 LOC) - ERP workspace source file: truncate_logs.js
│   ├── services/
│   │   ├── finance-aggregator.js (113 LOC) - ERP workspace source file: finance-aggregator.js
│   │   ├── FinanceService.js (84 LOC) - ERP workspace source file: FinanceService.js
│   │   ├── googleDrive.js (124 LOC) - ERP workspace source file: googleDrive.js
│   │   ├── orderFilterBuilder.js (142 LOC) - ERP workspace source file: orderFilterBuilder.js
│   │   └── SyncService.js (86 LOC) - ERP workspace source file: SyncService.js
│   ├── utils/
│   │   └── volumeCleaner.js (152 LOC) - ERP workspace source file: volumeCleaner.js
│   ├── webhooks/
│   │   └── shopify.js (94 LOC) - Handles incoming third-party callback webhook event alerts for: shopify.js
│   ├── .env (27 LOC) - ERP workspace source file: .env
│   ├── api_response.json (1 LOC) - ERP workspace source file: api_response.json
│   ├── audit_instaworld.js (63 LOC) - ERP workspace source file: audit_instaworld.js
│   ├── audit_parcel.js (27 LOC) - ERP workspace source file: audit_parcel.js
│   ├── db.js (293 LOC) - SQLite DatabaseSync initialization. Configures optimized WAL, mmap, Temp Store RAM settings, and proxy methods.
│   ├── debug_mapping.js (44 LOC) - ERP workspace source file: debug_mapping.js
│   ├── debug_scan.js (23 LOC) - ERP workspace source file: debug_scan.js
│   ├── fix_mappings.js (34 LOC) - ERP workspace source file: fix_mappings.js
│   ├── fix_mappings.sql (32 LOC) - ERP workspace source file: fix_mappings.sql
│   ├── force_sync_debug.js (25 LOC) - ERP workspace source file: force_sync_debug.js
│   ├── force_sync_final.js (27 LOC) - ERP workspace source file: force_sync_final.js
│   ├── force_sync_stuck.js (106 LOC) - ERP workspace source file: force_sync_stuck.js
│   ├── force_sync.js (27 LOC) - ERP workspace source file: force_sync.js
│   ├── forensic_audit.js (41 LOC) - ERP workspace source file: forensic_audit.js
│   ├── index.js (134 LOC) - Main Express server file. Configures security middleware, logging pipelines, and initializes routes.
│   ├── live_probe.js (37 LOC) - ERP workspace source file: live_probe.js
│   ├── package 2.json (26 LOC) - ERP workspace source file: package 2.json
│   ├── package.json (36 LOC) - ERP workspace source file: package.json
│   ├── scheduler.js (392 LOC) - Manages cron tasks, auto-polls Shopify orders, and checks shipping couriers for delivery updates.
│   ├── scratch_test_instaworld.js (28 LOC) - ERP workspace source file: scratch_test_instaworld.js
│   ├── scratch.js (19 LOC) - ERP workspace source file: scratch.js
│   ├── sse.js (94 LOC) - Server-Sent Events server broadcasting instant verification changes to all open dashboards.
│   ├── startup.js (292 LOC) - Runs system checks, validates volume permissions, and pre-allocates database migrations on launch.
│   ├── sync_all_active.js (38 LOC) - ERP workspace source file: sync_all_active.js
│   ├── sync_exact_264.js (31 LOC) - ERP workspace source file: sync_exact_264.js
│   ├── sync_historical.js (31 LOC) - ERP workspace source file: sync_historical.js
│   ├── sync_only_instaworld.js (33 LOC) - ERP workspace source file: sync_only_instaworld.js
│   ├── sync_smart_recent.js (32 LOC) - ERP workspace source file: sync_smart_recent.js
│   ├── sync_specific.js (24 LOC) - ERP workspace source file: sync_specific.js
│   ├── sync_targeted_264.js (32 LOC) - ERP workspace source file: sync_targeted_264.js
│   ├── sync_the_264.js (31 LOC) - ERP workspace source file: sync_the_264.js
│   ├── sync_total_pipeline.js (39 LOC) - ERP workspace source file: sync_total_pipeline.js
│   ├── tenant-context.js (6 LOC) - Enforces thread-safe multi-tenant isolation context using Node.js AsyncLocalStorage.
│   ├── test_antiban.js (145 LOC) - ERP workspace source file: test_antiban.js
│   ├── test_api.js (32 LOC) - ERP workspace source file: test_api.js
│   ├── test_automation_runner.js (264 LOC) - ERP workspace source file: test_automation_runner.js
│   ├── test_batch_tracking.js (30 LOC) - ERP workspace source file: test_batch_tracking.js
│   ├── test_cost_raw.js (20 LOC) - ERP workspace source file: test_cost_raw.js
│   ├── test_formats.js (69 LOC) - ERP workspace source file: test_formats.js
│   ├── test_gql.js (34 LOC) - ERP workspace source file: test_gql.js
│   ├── test_heartbeat.js (62 LOC) - ERP workspace source file: test_heartbeat.js
│   ├── test_instaworld_sync.js (28 LOC) - ERP workspace source file: test_instaworld_sync.js
│   ├── test_lcs_proxy.js (67 LOC) - ERP workspace source file: test_lcs_proxy.js
│   ├── test_leopards.js (44 LOC) - ERP workspace source file: test_leopards.js
│   ├── test_media_ai.js (146 LOC) - ERP workspace source file: test_media_ai.js
│   ├── test_postex_sync.js (27 LOC) - ERP workspace source file: test_postex_sync.js
│   ├── test_postex.js (108 LOC) - ERP workspace source file: test_postex.js
│   ├── test_query.js (15 LOC) - ERP workspace source file: test_query.js
│   ├── test_tenant_isolation.js (277 LOC) - ERP workspace source file: test_tenant_isolation.js
│   ├── test_variant_raw.js (20 LOC) - ERP workspace source file: test_variant_raw.js
│   ├── test_wa.js (35 LOC) - ERP workspace source file: test_wa.js
│   ├── tracking_page.html (1 LOC) - ERP workspace source file: tracking_page.html
│   ├── wa_store.json (1 LOC) - ERP workspace source file: wa_store.json
│   └── websocket.js (74 LOC) - Websocket backend server. Streams real-time messages, typing indicators, and deletion notifications.
├── backend_check.js (52 LOC) - ERP workspace source file: backend_check.js
├── build_script.js (74 LOC) - ERP workspace source file: build_script.js
├── fix_zero_cost_orders.js (110 LOC) - ERP workspace source file: fix_zero_cost_orders.js
├── frontend/
│   ├── public/
│   │   └── favicon.svg (9 LOC) - ERP workspace source file: favicon.svg
│   ├── src/
│   │   ├── components/
│   │   │   ├── CommandCenter/
│   │   │   │   ├── Layout/
│   │   │   │   │   ├── CommandCenterFilters.jsx (197 LOC) - Frontend UI component/logic: CommandCenterFilters.jsx
│   │   │   │   │   ├── CommandCenterHeader.jsx (40 LOC) - Frontend UI component/logic: CommandCenterHeader.jsx
│   │   │   │   │   ├── CommandCenterStats.jsx (109 LOC) - Frontend UI component/logic: CommandCenterStats.jsx
│   │   │   │   │   └── CommandCenterTable.jsx (103 LOC) - Frontend UI component/logic: CommandCenterTable.jsx
│   │   │   │   └── SyncDashboard.jsx (295 LOC) - Frontend UI component/logic: SyncDashboard.jsx
│   │   │   ├── OrderTableParts/
│   │   │   │   ├── TableHeader.jsx (151 LOC) - Frontend UI component/logic: TableHeader.jsx
│   │   │   │   ├── TablePagination.jsx (60 LOC) - Frontend UI component/logic: TablePagination.jsx
│   │   │   │   └── TableRow.jsx (616 LOC) - Frontend UI component/logic: TableRow.jsx
│   │   │   ├── Reports/
│   │   │   │   ├── PnLMetricsPanel.jsx (130 LOC) - Frontend UI component/logic: PnLMetricsPanel.jsx
│   │   │   │   ├── ReportsChartSection.jsx (6 LOC) - Frontend UI component/logic: ReportsChartSection.jsx
│   │   │   │   └── ReportsFilterBar.jsx (111 LOC) - Frontend UI component/logic: ReportsFilterBar.jsx
│   │   │   ├── Settings/
│   │   │   │   ├── ApiKeysSettings.jsx (50 LOC) - Frontend UI component/logic: ApiKeysSettings.jsx
│   │   │   │   ├── StoreSettings.jsx (39 LOC) - Frontend UI component/logic: StoreSettings.jsx
│   │   │   │   └── WhatsAppSettings.jsx (310 LOC) - Frontend UI component/logic: WhatsAppSettings.jsx
│   │   │   ├── WhatsAppBot/
│   │   │   │   ├── BotAnalyticsPanel.jsx (229 LOC) - Frontend UI component/logic: BotAnalyticsPanel.jsx
│   │   │   │   ├── BotRulesPanel.jsx (222 LOC) - Frontend UI component/logic: BotRulesPanel.jsx
│   │   │   │   ├── BotSchedulePanel.jsx (140 LOC) - Frontend UI component/logic: BotSchedulePanel.jsx
│   │   │   │   └── BotTemplatesPanel.jsx (964 LOC) - Frontend UI component/logic: BotTemplatesPanel.jsx
│   │   │   ├── WhatsAppPortal/
│   │   │   │   ├── ChatContactSidebar.jsx (220 LOC) - Frontend UI component/logic: ChatContactSidebar.jsx
│   │   │   │   └── ChatListPanel.jsx (179 LOC) - Frontend UI component/logic: ChatListPanel.jsx
│   │   │   ├── ApiStatusBanner.jsx (63 LOC) - Frontend UI component/logic: ApiStatusBanner.jsx
│   │   │   ├── BulkActions.jsx (151 LOC) - Frontend UI component/logic: BulkActions.jsx
│   │   │   ├── CourierBooking.jsx (119 LOC) - Frontend UI component/logic: CourierBooking.jsx
│   │   │   ├── CustomerHistoryModal.jsx (197 LOC) - Frontend UI component/logic: CustomerHistoryModal.jsx
│   │   │   ├── EditOrderModal.jsx (931 LOC) - Frontend UI component/logic: EditOrderModal.jsx
│   │   │   ├── ErrorBoundary.jsx (69 LOC) - Frontend UI component/logic: ErrorBoundary.jsx
│   │   │   ├── ItemsList.jsx (268 LOC) - Frontend UI component/logic: ItemsList.jsx
│   │   │   ├── MediaUploadOverlay.jsx (59 LOC) - Frontend UI component/logic: MediaUploadOverlay.jsx
│   │   │   ├── Modals.jsx (147 LOC) - Frontend UI component/logic: Modals.jsx
│   │   │   ├── OrderCells.jsx (230 LOC) - Frontend UI component/logic: OrderCells.jsx
│   │   │   ├── OrderHeader.jsx (77 LOC) - Frontend UI component/logic: OrderHeader.jsx
│   │   │   ├── OrderHistoryModal.jsx (97 LOC) - Frontend UI component/logic: OrderHistoryModal.jsx
│   │   │   ├── OrderTable.jsx (455 LOC) - Frontend UI component/logic: OrderTable.jsx
│   │   │   ├── PaymentSummary.jsx (83 LOC) - Frontend UI component/logic: PaymentSummary.jsx
│   │   │   ├── ProfitabilityCharts.jsx (161 LOC) - Frontend UI component/logic: ProfitabilityCharts.jsx
│   │   │   ├── QuickReplyPanel.jsx (209 LOC) - Frontend UI component/logic: QuickReplyPanel.jsx
│   │   │   ├── SearchFilters.jsx (247 LOC) - Frontend UI component/logic: SearchFilters.jsx
│   │   │   ├── SettingsModal.jsx (303 LOC) - Frontend UI component/logic: SettingsModal.jsx
│   │   │   ├── Sidebar.jsx (112 LOC) - Frontend UI component/logic: Sidebar.jsx
│   │   │   ├── SyncButtons.jsx (285 LOC) - Frontend UI component/logic: SyncButtons.jsx
│   │   │   ├── SyncProgressCapsule.jsx (89 LOC) - Frontend UI component/logic: SyncProgressCapsule.jsx
│   │   │   ├── ToastContainer.jsx (14 LOC) - Frontend UI component/logic: ToastContainer.jsx
│   │   │   ├── Topbar.jsx (170 LOC) - Frontend UI component/logic: Topbar.jsx
│   │   │   └── VoiceNoteButton.jsx (22 LOC) - Frontend UI component/logic: VoiceNoteButton.jsx
│   │   ├── config/
│   │   │   └── uiConstants.js (73 LOC) - Frontend UI component/logic: uiConstants.js
│   │   ├── context/
│   │   │   ├── AppContext.jsx (17 LOC) - Frontend UI component/logic: AppContext.jsx
│   │   │   ├── AppProvider.jsx (192 LOC) - Frontend UI component/logic: AppProvider.jsx
│   │   │   ├── FinanceContext.jsx (399 LOC) - Frontend UI component/logic: FinanceContext.jsx
│   │   │   ├── QuoteDraftContext.jsx (94 LOC) - Frontend UI component/logic: QuoteDraftContext.jsx
│   │   │   ├── RoutePersistenceContext.jsx (99 LOC) - Frontend UI component/logic: RoutePersistenceContext.jsx
│   │   │   └── TenantContext.jsx (36 LOC) - Frontend UI component/logic: TenantContext.jsx
│   │   ├── hooks/
│   │   │   ├── useCommandCenterBulkActions.js (362 LOC) - Manages multi-order selection, bulk courier booking, and dispatching template updates.
│   │   │   ├── useCommandCenterModals.js (138 LOC) - Frontend UI component/logic: useCommandCenterModals.js
│   │   │   ├── useOrderItems.js (164 LOC) - Frontend UI component/logic: useOrderItems.js
│   │   │   ├── useOrderManagement.js (600 LOC) - Coordinates ERP order status editing, Shopify tracking sync, and manual adjustments.
│   │   │   ├── useOrderSave.js (252 LOC) - Frontend UI component/logic: useOrderSave.js
│   │   │   ├── usePersistentState.js (41 LOC) - Frontend UI component/logic: usePersistentState.js
│   │   │   ├── useReportsData.js (382 LOC) - Frontend UI component/logic: useReportsData.js
│   │   │   ├── useSyncStream.js (121 LOC) - Frontend UI component/logic: useSyncStream.js
│   │   │   ├── useWhatsAppBot.js (418 LOC) - Client state hook managing WhatsApp configuration, manual restarts, and connection logs.
│   │   │   └── useWhatsAppPortal.js (1301 LOC) - State manager hook for live chat. Handles WebSockets, read marks, audio records, and media dispatch.
│   │   ├── pages/
│   │   │   ├── AdviceMonitor.jsx (144 LOC) - Audits address warnings, duplicate order indicators, and high risk flag warnings.
│   │   │   ├── ChatInputArea.jsx (536 LOC) - Sub-component rendering the chat input box, attachment triggers, emoji selectors, and quick-reply shortcuts.
│   │   │   ├── ChatMessageList.jsx (1354 LOC) - Renders chat transcripts, message bubbles with delivery statuses, media downloads, and OCR bank receipt matches.
│   │   │   ├── ChatSidebar.jsx (386 LOC) - Renders WhatsApp portal sidebar search filters, status lists, unread counters, and Meta/TikTok platform tags.
│   │   │   ├── Connect.jsx (364 LOC) - Frontend UI component/logic: Connect.jsx
│   │   │   ├── CostManager.jsx (813 LOC) - Frontend UI component/logic: CostManager.jsx
│   │   │   ├── CourierIntelligence.jsx (313 LOC) - Compares shipping provider performance, RTO rates, and transit durations.
│   │   │   ├── Dashboard.jsx (151 LOC) - Command Centre main home screen. Displays general KPIs, revenue charts, and delivery performance metrics.
│   │   │   ├── DiagnosticCenter.jsx (385 LOC) - Admin control room displaying system integrity checks, API response latency, and database query timings.
│   │   │   ├── FinanceManager.jsx (482 LOC) - Handles billing records, COD remittance matching, and store financial reports.
│   │   │   ├── Login.jsx (243 LOC) - Allows users to sign in to the Command Centre using email and password.
│   │   │   ├── MarketingIntelligence.jsx (234 LOC) - Frontend UI component/logic: MarketingIntelligence.jsx
│   │   │   ├── PayoutReconciler.jsx (813 LOC) - Frontend UI component/logic: PayoutReconciler.jsx
│   │   │   ├── PreventionManager.jsx (170 LOC) - Manages anti-fraud blacklist, high-risk flags, and block rules.
│   │   │   ├── Profile.jsx (133 LOC) - Frontend UI component/logic: Profile.jsx
│   │   │   ├── Reports.jsx (210 LOC) - Frontend UI component/logic: Reports.jsx
│   │   │   ├── ReturnsManager.jsx (376 LOC) - Frontend UI component/logic: ReturnsManager.jsx
│   │   │   ├── SearchTool.jsx (1634 LOC) - Unified ERP Orders Search page. Renders status metrics, live-polling tags, and bulk fulfillment actions.
│   │   │   ├── StatusMappingManager.jsx (357 LOC) - Maps shipping courier statuses to standard internal statuses.
│   │   │   ├── StuckMonitor.jsx (119 LOC) - Frontend UI component/logic: StuckMonitor.jsx
│   │   │   ├── SystemStatus.jsx (254 LOC) - Frontend UI component/logic: SystemStatus.jsx
│   │   │   ├── TemplateManager.jsx (201 LOC) - Custom WhatsApp message template designer and quick-reply library manager.
│   │   │   ├── TrackingPortal.jsx (357 LOC) - Frontend UI component/logic: TrackingPortal.jsx
│   │   │   ├── Users.jsx (460 LOC) - Frontend UI component/logic: Users.jsx
│   │   │   ├── Watchdog.jsx (153 LOC) - Frontend UI component/logic: Watchdog.jsx
│   │   │   ├── WhatsAppBot.jsx (217 LOC) - WhatsApp Bot configuration page. Displays lazily loaded connection status, logs, settings, and QR codes.
│   │   │   └── WhatsAppPortal.jsx (504 LOC) - Command Centre Live Chat Dashboard page. Renders threads, templates, quick pills, and media uploads.
│   │   ├── utils/
│   │   │   ├── errorHandler.js (136 LOC) - Frontend UI component/logic: errorHandler.js
│   │   │   └── orderUtils.js (89 LOC) - Frontend UI component/logic: orderUtils.js
│   │   ├── App.jsx (129 LOC) - Root React component. Defines app routing, theme layout, and global authentication guards.
│   │   ├── index.css (3691 LOC) - Central styling stylesheet. Contains custom CSS tokens, modern glassmorphism badges, and WA pulse animation keyframes.
│   │   └── main.jsx (11 LOC) - Frontend entry point. Mounts the React App component in the HTML DOM.
│   ├── build_log_2.txt (32 LOC) - ERP workspace source file: build_log_2.txt
│   ├── build_log.txt (32 LOC) - ERP workspace source file: build_log.txt
│   ├── index.html (17 LOC) - ERP workspace source file: index.html
│   ├── package.json (22 LOC) - ERP workspace source file: package.json
│   ├── patch_order_table.cjs (98 LOC) - ERP workspace source file: patch_order_table.cjs
│   ├── patch_order_table.js (122 LOC) - Frontend UI component/logic: patch_order_table.js
│   └── vite.config.js (16 LOC) - Frontend UI component/logic: vite.config.js
├── generate_audit.js (256 LOC) - ERP workspace source file: generate_audit.js
├── heal_costs.js (50 LOC) - ERP workspace source file: heal_costs.js
├── improvement_sheet.md (13 LOC) - ERP workspace source file: improvement_sheet.md
├── nixpacks.toml (12 LOC) - ERP workspace source file: nixpacks.toml
├── package.json (52 LOC) - ERP workspace source file: package.json
├── patch.js (67 LOC) - ERP workspace source file: patch.js
├── railway.json (15 LOC) - ERP workspace source file: railway.json
├── railway.toml (10 LOC) - ERP workspace source file: railway.toml
├── scratch.js (2 LOC) - ERP workspace source file: scratch.js
├── scripts/
│   └── add_indexes.js (31 LOC) - ERP workspace source file: add_indexes.js
├── sync_cities.js (22 LOC) - ERP workspace source file: sync_cities.js
├── test_api.js (35 LOC) - ERP workspace source file: test_api.js
├── test_sync_engine.js (19 LOC) - ERP workspace source file: test_sync_engine.js
└── trace_whatsapp_architecture.md (99 LOC) - ERP workspace source file: trace_whatsapp_architecture.md
```
