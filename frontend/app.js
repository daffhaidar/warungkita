/**
 * WarungKita App Loader (v3.5 — Modular)
 * 
 * This file replaces the monolithic app.js (2214 lines).
 * All logic is now split into 14 modules under src/.
 * Modules load via <script> tags in index.html (no build step needed).
 * 
 * Module load order (dependencies flow top-down):
 * 1.  config.js       — constants, API_BASE (no deps)
 * 2.  state.js        — global state object (deps: config)
 * 3.  pwa.js          — service worker, install prompt (deps: none)
 * 4.  chat.js         — esc, safeHTML, addMsg, addBotMsg (deps: state)
 * 5.  utils.js        — currency parser, fuzzy match, change calc (deps: none)
 * 6.  items.js        — item parsing, stock mgmt (deps: state, chat, utils)
 * 7.  transactions.js — finalizeTransaksi, progress bar (deps: state, chat, utils, items)
 * 8.  report.js       — laporan, riwayat (deps: state, chat, utils)
 * 9.  pengeluaran.js  — expense tracking (deps: state, chat, utils)
 * 10. utang.js        — debt tracking, blacklist (deps: state, chat, utils)
 * 11. tutup.js        — close shop, rekap, export (deps: state, chat, utils, report)
 * 12. input.js        — handleSend, processUserMsg, command parser (deps: all above)
 * 13. events.js       — bindEvents, quick-sell, DOMContentLoaded (deps: all above)
 * 14. helpers.js      — help text, modal helpers, initChat (deps: all above)
 *
 * Legacy backup: app.legacy.js
 * 
 * @module app
 * @since v3.5
 */

// All modules are loaded via <script> tags in index.html.
// This file exists as documentation + ensures namespace is set up.
console.log('[WarungKita] v3.5 modular loaded');
