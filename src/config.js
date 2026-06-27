/**
 * WarungKita — config.js
 * Config & constants, API_BASE detection, env setup
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ===== WarungKita Frontend =====
// Backend-first: tries API, falls back to local parser
// API_BASE: auto-detected from current host

// ---- CONFIG ----
const API_BASE = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8000';
  // Production: same server (nginx proxies /api → backend)
  return window.location.origin;
})();

// API key — fetched once from backend on first load, cached in localStorage.
// Backwards compat: if old key exists in localStorage, try it first.
let API_KEY = localStorage.getItem('warungkita_api_key') || null;
let useBackend = false; // set true after successful API ping
let _keyFetchPromise = null;

async function ensureApiKey() {
  if (API_KEY) return API_KEY;
  if (_keyFetchPromise) return _keyFetchPromise;
  _keyFetchPromise = (async () => {
    try {
      // Init endpoint returns (or reuses) the api key. Requires admin token from URL or localStorage.
      const adminToken = new URLSearchParams(location.search).get('t') || localStorage.getItem('warungkita_admin_token') || '';
      const resp = await fetch(API_BASE + '/api/init' + (adminToken ? '?t=' + encodeURIComponent(adminToken) : ''));
      if (resp.ok) {
        const data = await resp.json();
        if (data.api_key) {
          API_KEY = data.api_key;
          localStorage.setItem('warungkita_api_key', API_KEY);
          return API_KEY;
        }
      }
    } catch(e) {}
    _keyFetchPromise = null;
    return null;
  })();
  return _keyFetchPromise;
}

// Wrap fetch with auto-injected X-API-Key header
async function apiFetch(path, opts = {}) {
  await ensureApiKey();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  return fetch(API_BASE + path, Object.assign({}, opts, { headers }));
}

