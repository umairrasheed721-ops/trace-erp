# TracePK ERP - AI Context Map & Agent Readiness Guide

Welcome! This document acts as an entry-point index for AI coding agents to understand, search, analyze, and modify the Trace ERP codebase with maximum safety and speed.

---

## 1. ⚙️ System Architecture Overview

TracePK ERP is a multi-tenant enterprise management platform specialized in logistics, order fulfillment, and WhatsApp anti-ban notifications.

*   **Frontend (React + Vite)**: Renders a modern CSS glassmorphism dashboard inside `frontend/`. Communicates with the backend using REST APIs, Server-Sent Events (SSE), and WebSockets.
*   **Backend (Node.js + Express)**: Serves APIs inside `backend/`. Incorporates HTML template layouts, JWT authorization, compression, and real-time SSE event dispatchers.
*   **Database (Native Node.js SQLite)**: Uses Node.js v22's built-in `node:sqlite` (`DatabaseSync`) module inside `backend/db.js`. Avoids heavy native binaries like `better-sqlite3`. Includes SQLite WAL logging, prepared statement caching, and `AsyncLocalStorage`-based tenant context mapping.
*   **WhatsApp integration (Baileys)**: Fully modular. Bypasses typical serialization to preserve cryptographic binary signatures for native poll updates. Includes custom message queues and simulated typing delays to prevent WhatsApp spam bans.

---

## 2. 🗂️ Active Directory Tree & File Inventory

Below is the clean and optimized file list of the workspace (excluding deleted temporary test and scratch files):

```text
├── .cursorrules                  - Active AI instructions & code guidelines.
├── .gitignore                    - Configured to ignore .env, database WAL/SHM, and log files.
├── Dockerfile                    - Multi-stage Docker config for Node.js production.
├── backend_check.js              - Pre-flight syntax check script running syntax verification on all backend files.
├── build_script.js               - Compiles frontend and copies production assets to backend/public/.
├── package.json                  - Root workspace package.json (concurrency scripts).
├── railway.json                  - Deployment instructions for Railway.
├── railway.toml                  - Setup settings for Railway environment.
│
├── backend/
│   ├── db.js                     - Database initialization, WAL setting, mmap caching, and transaction wrappers.
│   ├── index.js                  - Server entry point. Mounts middlewares, public routes, and starts server.
│   ├── scheduler.js              - Crons and background background polling sync tasks (PostEx, Instaworld, Catalog).
│   ├── sse.js                    - Real-time Server-Sent Events controller.
│   ├── startup.js                - Performs boot checks, auto-cleans disk space, runs startup migrations.
│   ├── tenant-context.js         - Thread-safe AsyncLocalStorage for multi-tenant isolation.
│   ├── websocket.js              - WebSocket backend for real-time live chat features.
│   │
│   ├── db/migrations/            - Schema definitions (finance, orders, tracking, whatsapp, reviews).
│   ├── engines/
│   │   ├── bot/                  - Baileys socket managers, session managers, event routers.
│   │   ├── gemini/               - AI tool definitions and dispatch handlers.
│   │   ├── processors/           - Media formats, AI responses formatting, audio transcoders.
│   │   ├── shopify/              - Shopify API engines (orders, products, fulfillments).
│   │   ├── tracking/             - PostEx/Instaworld tracking integration engines and status mappers.
│   │   ├── audit_service.js      - Nightly self-learning audit engine.
│   │   ├── cod_verifier.js       - COD confirmation WhatsApp poll sender.
│   │   ├── gemini_engine.js      - Interface to Google Gemini API models.
│   │   └── sniper.js             - Automatic customer alert system for stuck courier parcels.
│   │
│   ├── middleware/               - Security guards, tenant isolations, and error handlers.
│   ├── routes/                   - REST routes segmented by domain (finance, orders, whatsapp, auth, public).
│   ├── scripts/                  - Automated maintenance scripts (auto-shrink, storage-audits, reconcilers).
│   ├── services/                 - Shared services (Google Drive integration, filter builders, aggregates).
│   └── utils/                    - Volume cleaner and rate-limiter helpers.
│
├── frontend/
│   ├── src/
│   │   ├── components/           - Component library (OrderTable, CourierBooking, WhatsAppBot).
│   │   ├── context/              - Global React contexts (App, Finance, Quote, Tenant).
│   │   ├── hooks/                - React Hooks (useOrderManagement, useWhatsAppPortal).
│   │   ├── pages/                - Top-level routing views (Dashboard, CostManager, SearchTool).
│   │   ├── App.jsx               - Root React entry point and routing config.
│   │   └── index.css             - Vanilla CSS layout styles.
```

---

## 3. 🧠 Guidelines for AI Agents (AI Friendly Tips)

To make changes rapidly and prevent regression, follow these key tips:

### 1. Database Operations
*   Always prepare SQL queries using `db.prepare("...")`.
*   Note that the custom wrapper in `backend/db.js` caches statement compilations. Do **not** compile inline SQL statements in a loop; call them via the cached wrapper for maximum speed.
*   Transactions should use the `db.transaction(fn)` wrapper which automatically manages `BEGIN`, `COMMIT`, and `ROLLBACK`.

### 2. Multi-Tenant Safety
*   The application isolates stores using `AsyncLocalStorage` tenant IDs. 
*   **Rule**: Never bypass `tenantContext.getStore()` or read files outside the tenant scope unless performing database system audits.
*   When executing background cron jobs, wrap the task call in `runMultiTenant(...)` inside `backend/scheduler.js`.

### 3. Shopify API & Custom CS Guard
*   Shopify order syncing must check `is_cs_edited === 1`.
*   If `is_cs_edited` is set to `1` in the database, the agent has manually modified prices, shipping fees, or discounts in the ERP. **Do not overwrite these fields** with values returned from Shopify webhook updates.

### 4. Code Structuring & JSDoc
*   Keep functions decoupled.
*   Add high-level JSDoc type signatures above new functions. This helps subsequent LLM agents parse parameter shapes instantly.
*   Write clear console log traces before making remote API requests to help debug failure states during live execution runs.
