# Desktop Localhost Architecture for TableFlow Pro

## Architecture Overview

```
Server Machine (Electron App)
├── Electron Main Process
│   ├── Express API Server (port 3000) ← LAN clients connect here
│   ├── SQLite Database (better-sqlite3) ← all local data
│   ├── USB Thermal Printer Service (node-thermal-printer)
│   └── Cloud Sync Service (push/pull to Supabase)
├── Electron Renderer (React App)
│   └── Vite-built frontend served by Express
└── System Tray Icon (sync/quit controls)

LAN Kiosk 1 → http://192.168.x.x:3000
LAN Kiosk 2 → http://192.168.x.x:3000
```

**Key design decisions:**
- SQLite via `better-sqlite3` (synchronous, extremely fast, no network overhead)
- Express API replaces direct Supabase calls (same REST patterns)
- Real-time updates via Server-Sent Events (SSE) instead of Supabase subscriptions
- USB printer via `node-thermal-printer` with ESC/POS commands
- Cloud sync is manual (button click or app close), not continuous

---

## Task 1: Initialize Electron + Express Backend Structure

Add Electron and Express dependencies. Create the main process entry point.

**Files to create/modify:**
- `package.json` — add electron, electron-builder, better-sqlite3, express, cors, node-thermal-printer, concurrently
- `electron/main.js` — Electron main process: creates BrowserWindow, starts Express server, auto-opens app
- `electron/preload.js` — preload script for IPC bridge (printer commands, sync triggers)
- `vite.config.ts` — adjust build output for Electron packaging

**New dependencies:**
```
electron, electron-builder, better-sqlite3, express, cors, 
node-thermal-printer, escpos, usb (for printer detection)
```

---

## Task 2: Create SQLite Database Layer

Create a local SQLite database matching the current Supabase schema. This is the core of the offline-first approach.

**Files to create:**
- `electron/database/schema.sql` — full schema (restaurants, orders, order_items, menu_items, menu_categories, floors, tables, kitchens, staff_members, shifts, expenses, etc.)
- `electron/database/db.js` — database initialization and connection manager using better-sqlite3
- `electron/database/migrations.js` — schema versioning for future updates

**Schema notes:**
- Mirror all Supabase tables from `src/integrations/supabase/types.ts`
- Add `sync_status` column (synced/pending/conflict) to every table
- Add `updated_at` timestamp to every table for sync tracking
- Use UUIDs as primary keys (same as Supabase) for seamless sync

---

## Task 3: Build Express REST API

Create Express routes that match the Supabase query patterns used in the frontend. This lets us change the data layer with minimal frontend refactoring.

**Files to create:**
- `electron/api/server.js` — Express app setup with CORS (allow LAN access)
- `electron/api/routes/restaurants.js` — CRUD for restaurants
- `electron/api/routes/orders.js` — CRUD for orders + order_items (most critical for speed)
- `electron/api/routes/menu.js` — CRUD for menu_items + menu_categories
- `electron/api/routes/tables.js` — CRUD for floors + tables
- `electron/api/routes/kitchens.js` — CRUD for kitchens
- `electron/api/routes/staff.js` — CRUD for staff_members + shifts
- `electron/api/routes/expenses.js` — CRUD for expenses
- `electron/api/routes/auth.js` — simple local auth (PIN-based or password, no Supabase auth needed offline)
- `electron/api/routes/printer.js` — printer discovery, connection, and print endpoints
- `electron/api/routes/sync.js` — trigger cloud sync
- `electron/api/sse.js` — Server-Sent Events for real-time updates across LAN clients

**Performance considerations:**
- All SQLite queries are synchronous (no async overhead, ~0.1ms per query)
- Prepared statements for hot paths (order creation, item insertion)
- Transaction batching for multi-table operations (order + items + table update)

---

## Task 4: Create Frontend API Client (Replace Supabase Client)

Create a drop-in replacement for Supabase client calls that talks to the local Express API.

**Files to create/modify:**
- `src/services/localApi.ts` — API client class with methods matching Supabase patterns: `from('table').select()`, `from('table').insert()`, etc.
- `src/services/sseClient.ts` — SSE client for real-time updates (replaces Supabase realtime channels)
- `src/integrations/supabase/client.ts` — modify to use local API when in Electron/localhost mode, Supabase when in cloud mode

**Approach:** Create a `LocalClient` that implements the same `.from().select().eq().order()` chain pattern so existing page code needs minimal changes. Detect environment (Electron vs cloud) and swap clients automatically.

---

## Task 5: Modify Frontend Pages for Local API

Update the key pages to use the new API client and SSE for real-time updates.

**Files to modify:**
- `src/pages/dashboard/Orders.tsx` — replace Supabase calls with local API, SSE for real-time
- `src/pages/dashboard/KitchenView.tsx` — SSE-based real-time order updates
- `src/pages/dashboard/Floors.tsx` — local API for floor/table management
- `src/pages/dashboard/Menu.tsx` — local API for menu management
- `src/pages/dashboard/OrderKiosk.tsx` — local API for kiosk mode
- `src/contexts/AuthContext.tsx` — local auth (PIN/password without Supabase)
- `src/contexts/RestaurantContext.tsx` — fetch from local API

---

## Task 6: USB Thermal Printer Service

Replace Bluetooth printer with USB thermal printer support. The server machine handles all printing; LAN clients send print requests to the server API.

**Files to create/modify:**
- `electron/services/printerService.js` — USB printer discovery and management using `node-thermal-printer`
  - Support: Epson M325A, TVS RP3210, Epson TM-T82, POS-580
  - ESC/POS command formatting for bills
  - Printer auto-detection on USB
- `src/services/thermalPrinter.ts` — rewrite to call `/api/printer/print` endpoint instead of Bluetooth
- `src/components/PrinterSelector.tsx` — show USB printers from server API instead of Bluetooth scan
- `electron/api/routes/printer.js` — endpoints: GET /printers (list), POST /print (print bill), POST /connect (select printer)

**Printer flow:**
1. LAN client creates order and clicks "Print Bill"
2. Frontend calls `POST /api/printer/print` with order data
3. Express route formats ESC/POS receipt and sends to USB printer
4. Response confirms print success

---

## Task 7: Cloud Sync Service

Sync local SQLite data to Supabase cloud storage on demand.

**Files to create:**
- `electron/services/syncService.js` — bidirectional sync engine
  - Tracks changes via `sync_status` and `updated_at` columns
  - Push: upload all `pending` records to Supabase
  - Pull: download records newer than last sync timestamp
  - Conflict resolution: last-write-wins based on `updated_at`
  - Progress events for UI feedback
- `electron/api/routes/sync.js` — HTTP endpoints to trigger sync from frontend
- `src/components/SyncButton.tsx` — UI button showing sync status and triggering sync

**Sync triggers:**
- Manual "Sync Data" button in the dashboard header
- Automatic sync on app close (Electron `before-quit` event)
- Optional: periodic background sync every N minutes if internet available

---

## Task 8: Electron Packaging and Auto-Launch

Configure Electron to build as a standalone Windows installer.

**Files to create/modify:**
- `electron/main.js` — finalize: auto-start Express, open BrowserWindow, system tray, close handler with sync
- `electron-builder.yml` — build config for Windows (NSIS installer), include SQLite binary
- `package.json` — add build/package scripts:
  - `npm run electron:dev` — development mode
  - `npm run electron:build` — production build
  - `npm run electron:pack` — create installer

**Behavior:**
- Double-click icon → app starts → Express serves on port 3000 → BrowserWindow opens
- System tray shows LAN IP address for other kiosks to connect
- Close button triggers sync dialog → sync completes → app exits

---

## Task 9: Performance Optimization

Ensure the system handles 5+ bills/minute from 3 simultaneous clients.

**Optimizations:**
- SQLite WAL mode (Write-Ahead Logging) for concurrent reads during writes
- Prepared statements cached for all hot-path queries
- Order creation as single transaction (order + items + table update in one atomic op)
- Express response compression with `compression` middleware
- Static asset caching with long cache headers
- SSE with debounced broadcasts (batch multiple changes into single event)
- React Query with aggressive stale times to reduce refetches

---

## Task 10: Testing and LAN Setup Guide

- Test order creation flow from LAN client
- Test concurrent billing from multiple clients
- Test USB printer with each supported model
- Test sync to cloud and back
- Display LAN IP in system tray and dashboard for easy kiosk setup
