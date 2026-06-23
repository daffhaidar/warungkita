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

// ---- PWA INSTALL PROMPT ----
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Show banner after a short delay (don't interrupt onboarding)
  if (localStorage.getItem('warungkita_install_dismissed') !== '1') {
    setTimeout(() => {
      const banner = document.getElementById('installBanner');
      if (banner && !document.getElementById('main-chat').classList.contains('active')) {
        // show on onboarding only (after they saw value)
        banner.classList.add('show');
      }
    }, 4000);
  }
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const banner = document.getElementById('installBanner');
  if (banner) banner.classList.remove('show');
});

document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('installBtn');
  const installClose = document.getElementById('installClose');
  if (installBtn) {
    installBtn.onclick = async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        document.getElementById('installBanner').classList.remove('show');
      }
      deferredInstallPrompt = null;
    };
  }
  if (installClose) {
    installClose.onclick = () => {
      const banner = document.getElementById('installBanner');
      if (banner) banner.classList.remove('show');
      localStorage.setItem('warungkita_install_dismissed', '1');
    };
  }
  // Quick-action chip scroll fade — toggle class when at end of scroll
  const qa = document.getElementById('quickActions');
  if (qa) {
    const updateScroll = () => {
      const atEnd = qa.scrollLeft + qa.clientWidth >= qa.scrollWidth - 4;
      qa.classList.toggle('scrolled-end', atEnd);
    };
    qa.addEventListener('scroll', updateScroll, {passive:true});
    setTimeout(updateScroll, 300);
    window.addEventListener('resize', updateScroll);
  }
});

// ---- SERVICE WORKER ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ---- STATE ----
let state = {
  namaWarung: '',
  buka: true,
  targetHarian: 0,
  stok: {},       // { 'telur': { qty: 10, satuan: 'kg' }, ... }
  transaksi: [],  // [{ id, items: [{nama,qty, harga,total}], total, waktu }]
  blacklist: {},  // { '0812xxx': { alasan, tanggal, kerugian } }
  pendingTx: null // transaksi yang belum dikonfirmasi
};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  if (state.namaWarung) {
    showChat();
  }
  bindEvents();
  renderChat();
});

function loadState() {
  try {
    const saved = localStorage.getItem('warungkita_state');
    if (saved) state = { ...state, ...JSON.parse(saved) };
  } catch(e) {}
}

function saveState() {
  try {
    localStorage.setItem('warungkita_state', JSON.stringify(state));
  } catch(e) {}
}

// ---- EVENTS ----
function bindEvents() {
  // Onboarding
  document.getElementById('btnMulai').onclick = () => {
    document.getElementById('onboarding').classList.remove('active');
    document.getElementById('setup').classList.add('active');
    document.getElementById('inputNama').focus();
  };

  document.getElementById('btnSetup').onclick = () => {
    const nama = document.getElementById('inputNama').value.trim();
    if (!nama) return;
    state.namaWarung = nama;
    saveState();
    setupWarungAPI(nama); // tell backend
    showChat();
    addBotMsg(`Halo! Aku bakal bantu catat jualan di <strong>${esc(nama)}</strong>. Cukup chat aja kayak biasa yaa 🙂

📌 <span style="font-size:12px;color:#b0a89a">Contoh: "stok telur 10kg" → "jual soto 2" → "target 500rb"</span>`);
  };

  document.getElementById('inputNama').onkeydown = (e) => {
    if (e.key === 'Enter') document.getElementById('btnSetup').click();
  };

  // Chat input
  document.getElementById('btnSend').onclick = handleSend;
  document.getElementById('chatInput').onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Quick actions
  document.querySelectorAll('.q-chip').forEach(btn => {
    btn.onclick = () => {
      const cmd = btn.dataset.cmd;
      const cmds = {
        catat: 'Contoh: "jual soto 2, telur 1kg"',
        laporan: 'total hari ini',
        stok: 'stok',
        target: 'target',
        tutup: 'tutup'
      };
      if (cmd === 'tutup') { showTutupModal(); return; }
      if (cmd === 'stok' || cmd === 'target' || cmd === 'laporan') {
        processUserMsg(cmd === 'laporan' ? 'total hari ini' : cmd);
        return;
      }
      document.getElementById('chatInput').placeholder = cmds[cmd] || 'Ketik di sini...';
      document.getElementById('chatInput').focus();
    };
  });

  // Tutup flow
  document.getElementById('btnTutupHeader').onclick = showTutupModal;
  document.getElementById('btnTutupYa').onclick = () => { closeModal('modalTutup'); handleTutup(); };
  document.getElementById('btnRekapTutup').onclick = () => { closeModal('modalRekap'); finalizeTutup(); };
  document.getElementById('btnBukaTutup').onclick = () => { closeModal('modalBuka'); closeModal('modalRekap'); finalizeTutup(); };
  document.getElementById('btnBukaLanjut').onclick = () => { closeModal('modalBuka'); };
  document.getElementById('btnBukaLagi').onclick = bukaWarung;

  // Reset
  document.getElementById('btnReset').onclick = () => {
    if (confirm('Reset semua data? Semua transaksi dan stok akan hilang.')) {
      localStorage.removeItem('warungkita_state');
      location.reload();
    }
  };
}

function showChat() {
  document.getElementById('onboarding').classList.remove('active');
  document.getElementById('setup').classList.remove('active');
  document.getElementById('main-chat').classList.add('active');
  document.getElementById('displayNama').textContent = state.namaWarung;
  document.getElementById('chatInput').focus();
}

// ---- CHAT RENDERING ----
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function safeHTML(s) {
  // Strip script tags and event handlers from HTML
  return s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
          .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
          .replace(/javascript\s*:/gi, '');
}
function jam() { return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }

function addMsg(html, type = 'bot') {
  const area = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = `msg-row ${type === 'user' ? 'out' : 'in'}`;
  const cls = type === 'bot' ? 'msg bot' : 'msg out';
  const botLabel = type === 'bot' ? '<div class="bot-name">🤖 WarungKita</div>' : '';
  row.innerHTML = `<div class="${cls}">${botLabel}${html}<div class="msg-time">${jam()}</div></div>`;
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

function addUserMsg(text) {
  const area = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = 'msg-row out';
  row.innerHTML = `<div class="msg out">${esc(text)}<div class="msg-time">${jam()}</div></div>`;
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

function addBotMsg(html) { addMsg(safeHTML(html), 'bot'); }

function addDateLabel() {
  const area = document.getElementById('chatArea');
  const label = document.createElement('div');
  label.className = 'date-label';
  label.textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  area.appendChild(label);
}

// ---- USER INPUT ----
function handleSend() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.placeholder = 'Ketik di sini...';
  processUserMsg(text);
}

function processUserMsg(text) {
  addUserMsg(text);
  if (!state.buka) {
    addBotMsg('Warung lagi tutup nih. Ketik <strong>"buka"</strong> kalo mau mulai jualan lagi 🙂');
    return;
  }
  // Try backend first
  tryBackend(text).then(reply => {
    if (reply) {
      addBotMsg(reply);
      // Refresh state from backend
      syncState();
    } else {
      // Fallback to local parser
      setTimeout(() => processCommand(text), 300);
    }
  });
}

async function tryBackend(text) {
  try {
    const resp = await apiFetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: text, warung_name: state.namaWarung }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    useBackend = true;
    // Handle actions that need special treatment
    if (data.action === 'close_shop') {
      showRekapFromBackend(data);
      return null; // rekap handled separately
    }
    if (data.action === 'open_shop') {
      state.buka = true;
      saveState();
      updateUIForOpen();
    }
    return data.reply;
  } catch(e) {
    return null; // fallback to local
  }
}

async function syncState() {
  try {
    const resp = await apiFetch('/api/state');
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.warung_name) state.namaWarung = data.warung_name;
    state.buka = data.is_open;
    state.targetHarian = data.target_amount;
    state.stok = data.stock || {};
    state.transaksi = (data.transactions_today || []).map(t => ({
      id: t.id,
      items: t.items,
      total: t.total,
      waktu: t.time,
    }));
    state.blacklist = data.blacklist || {};
    saveState();
  } catch(e) {}
}

function showRekapFromBackend(data) {
  // Will be handled by the rear modal
  showTutupModal();
}

async function setupWarungAPI(name) {
  try {
    const resp = await apiFetch('/api/setup', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (resp.ok) useBackend = true;
  } catch(e) {}
}

// ---- COMMAND PARSER (mock AI) ----
function processCommand(text) {
  const t = text.toLowerCase().trim();

  // Buka warung
  if (t === 'buka' || t === 'buka warung') { bukaWarung(); return; }

  // Tutup
  if (t === 'tutup') { showTutupModal(); return; }

  // Target
  if (t === 'target') { showTarget(); return; }
  if (t.match(/^target\s+/)) { setTarget(t.replace('target', '').trim()); return; }

  // Stok
  if (t === 'stok') { showStok(); return; }
  if (t.match(/^(stok|isi|tambah|restock)\s+/)) { setStok(t); return; }

  // Laporan / total
  if (t.match(/^(total|laporan|rekap)(\s+hari\s+ini)?$/)) { showLaporan(); return; }
  if (t.match(/^(total|laporan)\s+minggu/)) { showLaporanMinggu(); return; }

  // Blacklist
  if (t.match(/^blacklist\s+/)) { tambahBlacklist(t); return; }
  if (t.match(/^cek\s+08/)) { cekBlacklist(t); return; }

  // Jual (transaksi)
  if (t.match(/^(jual|catat|order)\s+/)) { parseTransaksi(t); return; }

  // Help
  if (t === 'help' || t === 'bantuan' || t === '?') { showHelp(); return; }

  // Plain number — treat as target
  const maybeNum = parseRupiah(t);
  if (maybeNum && maybeNum > 0) {
    setTargetText(maybeNum);
    return;
  }

  // Default
  addBotMsg(`Hmm, aku gak ngerti maksudnya 😅<br><br>Ketik <strong>"help"</strong> buat liat apa aja yang bisa aku bantu.`);
}

// ---- TRANSAKSI ----
function parseTransaksi(text) {
  const clean = text.replace(/^(jual|catat|order)\s+/i, '');
  const items = parseItems(clean);
  if (!items.length) {
    addBotMsg('Formatnya belum bener nih. Contoh: <strong>"jual soto 2, telur 1kg"</strong>');
    return;
  }
  const total = items.reduce((s, i) => s + i.total, 0);
  state.pendingTx = { items, total, waktu: new Date().toISOString() };
  saveState();

  let html = 'Mau catat nih:<br><br>';
  items.forEach(i => {
    html += `✅ <strong>${esc(i.nama)}</strong>: ${i.qty} ${i.satuan || 'porsi'} × ${rupiah(i.harga)} = <strong>${rupiah(i.total)}</strong><br>`;
  });
  html += `<br>💰 <strong>Total: ${rupiah(total)}</strong>`;

  // Stok update preview
  items.forEach(i => {
    const key = normalizeKey(i.nama);
    if (state.stok[key]) {
      const sisa = Math.max(0, state.stok[key].qty - i.qty);
      html += `<br>📦 Stok ${esc(i.nama)}: ${state.stok[key].qty}${state.stok[key].satuan} → ${sisa}${state.stok[key].satuan}`;
    }
  });

  html += '<br><br>Kalo bener, pencet <strong>"OK"</strong> ya';

  // Render with buttons
  const area = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = 'msg-row in';
  row.innerHTML = `<div class="msg bot">
    <div class="bot-name">🤖 WarungKita</div>
    ${html}
    <div class="msg-time">${jam()}</div>
    <div class="chat-btns">
      <button class="ok-btn" onclick="confirmTx(this)">OK ✅</button>
      <button class="koreksi-btn" onclick="koreksiTx(this)">✏️ Koreksi</button>
    </div>
  </div>`;
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

function confirmTx(btn) {
  btn.closest('.chat-btns').innerHTML = '<span style="color:#6fcf97;font-size:13px">✅ Dikonfirmasi</span>';
  const tx = state.pendingTx;
  if (!tx) return;

  // Simpan transaksi
  const id = 'T' + Date.now().toString(36).toUpperCase();
  state.transaksi.push({ id, ...tx });

  // Update stok
  tx.items.forEach(i => {
    const key = normalizeKey(i.nama);
    if (state.stok[key]) {
      state.stok[key].qty = Math.max(0, state.stok[key].qty - i.qty);
    }
  });

  state.pendingTx = null;
  saveState();

  const totalHariIni = state.transaksi.reduce((s, t) => s + t.total, 0);
  let html = `✅ <strong>Tersimpan!</strong> (ID: #${id})<br>📊 Total hari ini: <strong>${rupiah(totalHariIni)}</strong>`;
  if (state.targetHarian > 0) {
    const pct = Math.round(totalHariIni / state.targetHarian * 100);
    html += `<br>🎯 Progress: ${rupiah(totalHariIni)} / ${rupiah(state.targetHarian)} (${pct}%)`;
  }
  addBotMsg(html);
}

function koreksiTx(btn) {
  btn.closest('.chat-btns').innerHTML = '<span style="color:#b0a89a;font-size:13px">✏️ Dibatalkan, ketik ulang ya</span>';
  state.pendingTx = null;
  saveState();
}

// ---- ITEM PARSER ----
function parseItems(text) {
  const items = [];
  const parts = text.split(/[,+&]\s*/);
  parts.forEach(p => {
    p = p.trim();
    // Pattern: "soto 2" or "telur 1kg" or "nasi goreng 3"
    const m = p.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(kg|gram|gr|g|liter|ltr|l|pcs|porsi|ekor|pohon|batang)?$/i);
    if (m) {
      const nama = capitalize(m[1].trim());
      const qty = parseFloat(m[2]);
      const satuan = m[3] ? m[3].toLowerCase() : 'porsi';
      const harga = getHarga(nama);
      items.push({ nama, qty, satuan, harga, total: harga * qty });
    }
  });
  return items;
}

// ---- PRODUK & HARGA (in-memory catalog) ----
const PRODUK_DEFAULT = {
  'soto': { nama: 'Soto Sapi', harga: 15000, satuan: 'porsi' },
  'nasi goreng': { nama: 'Nasi Goreng', harga: 15000, satuan: 'porsi' },
  'telur': { nama: 'Telur Bebek', harga: 35000, satuan: 'kg' },
  'nila': { nama: 'Nila Goreng', harga: 25000, satuan: 'porsi' },
  'kambing': { nama: 'Kambing', harga: 50000, satuan: 'kg' },
  'ikan': { nama: 'Ikan Nila', harga: 20000, satuan: 'kg' },
  'tiwul': { nama: 'Tiwul', harga: 10000, satuan: 'porsi' },
};

function getHarga(nama) {
  const key = normalizeKey(nama);
  for (const [k, v] of Object.entries(PRODUK_DEFAULT)) {
    if (key.includes(k) || k.includes(key)) return v.harga;
  }
  return 10000; // default
}

function normalizeKey(s) { return s.toLowerCase().replace(/[^a-z ]/g, '').trim(); }
function capitalize(s) { return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
function rupiah(n) { return 'Rp' + n.toLocaleString('id-ID'); }

// ---- STOK ----
function setStok(text) {
  const clean = text.replace(/^(stok|isi|tambah|restock)\s+(awal\s+)?/i, '');
  const items = parseItems(clean);
  if (!items.length) {
    addBotMsg('Format: <strong>"stok telur 10kg"</strong> atau <strong>"stok soto 20"</strong>');
    return;
  }

  let html = '✅ Stok tercatat:<br>';
  items.forEach(i => {
    const key = normalizeKey(i.nama);
    const existing = state.stok[key];
    if (existing && text.match(/^(isi|tambah|restock)/i)) {
      existing.qty += i.qty;
      html += `&nbsp;&nbsp;📦 ${esc(i.nama)}: ${existing.qty - i.qty}${existing.satuan} → <strong>${existing.qty}${existing.satuan}</strong><br>`;
    } else {
      state.stok[key] = { qty: i.qty, satuan: i.satuan, nama: i.nama };
      html += `&nbsp;&nbsp;📦 ${esc(i.nama)}: <strong>${i.qty}${i.satuan}</strong><br>`;
    }
  });
  saveState();
  addBotMsg(html);
}

function showStok() {
  const keys = Object.keys(state.stok);
  if (!keys.length) {
    addBotMsg('Belum ada stok yang tercatat. Ketik <strong>"stok telur 10kg"</strong> buat mulai.');
    return;
  }
  let html = '📦 <strong>Stok Sekarang:</strong><br>';
  keys.forEach(k => {
    const s = state.stok[k];
    const alert = s.qty <= 2 ? ' 🚨 <em>menipis!</em>' : '';
    html += `&nbsp;&nbsp;${esc(s.nama)}: <strong>${s.qty}${s.satuan}</strong>${alert}<br>`;
  });
  addBotMsg(html);
}

// ---- CURRENCY PARSER ----
// "500rb" → 500000, "1jt" → 1000000, "1,5jt" → 1500000, "500.000" → 500000
function parseRupiah(text) {
  const t = text.toLowerCase().replace(/\s/g, '');
  
  // Strip "rp" prefix if present
  const clean = t.replace(/^rp\.?/, '');
  
  // Match: number [optional decimal] [optional multiplier] [optional extra multiplier]
  // e.g. "500rb", "1,5jt", "1.5juta", "2.500.000", "500", "500000"
  const m = clean.match(/^(\d+(?:[.,]\d+)*)(?:[.,](\d+))?\s*(rb|ribu|jt|juta|m|miliar)?$/i);
  
  if (!m) return null;
  
  let num = parseFloat(m[1].replace(/\./g, '').replace(/,/g, '.'));
  if (m[2]) num = parseFloat(m[1].replace(/\./g, '').replace(',', '.')) + parseFloat('0.' + m[2]);
  
  const mult = (m[3] || '').toLowerCase();
  if (mult === 'rb' || mult === 'ribu') num *= 1000;
  else if (mult === 'jt' || mult === 'juta') num *= 1_000_000;
  else if (mult === 'm' || mult === 'miliar') num *= 1_000_000_000;
  
  return Math.round(num);
}

// ---- TARGET ----
function setTarget(text) {
  const num = parseRupiah(text);
  if (!num || num <= 0) {
    addBotMsg('Format: <strong>"target 500rb"</strong> atau <strong>"target 500000"</strong> — support juga "1jt", "2,5jt", dsb.');
    return;
  }
  setTargetText(num);
}

function setTargetText(num) {
  state.targetHarian = num;
  saveState();
  addBotMsg(`✅ Target hari ini: <strong>${rupiah(state.targetHarian)}</strong><br>Semangat jualannya! 🔥`);
}

function showTarget() {
  const total = state.transaksi.reduce((s, t) => s + t.total, 0);
  if (state.targetHarian <= 0) {
    addBotMsg(`Belum ada target. Ketik <strong>"target 500rb"</strong> buat pasang target hari ini.<br><br>📊 Total hari ini: <strong>${rupiah(total)}</strong>`);
    return;
  }
  const pct = Math.round(total / state.targetHarian * 100);
  const emoji = pct >= 100 ? '🎉 TARGET TERCAPAI!' : pct >= 70 ? '🔥 Hampir sampe!' : '💪 Gas terus!';
  addBotMsg(`🎯 <strong>Progress Target</strong><br>${rupiah(total)} / ${rupiah(state.targetHarian)} (${pct}%)<br><br>${emoji}`);
}

// ---- LAPORAN ----
function showLaporan() {
  const tx = state.transaksi;
  if (!tx.length) {
    addBotMsg('Belum ada transaksi hari ini.');
    return;
  }
  const total = tx.reduce((s, t) => s + t.total, 0);
  const itemCounts = {};
  tx.forEach(t => t.items.forEach(i => {
    if (!itemCounts[i.nama]) itemCounts[i.nama] = 0;
    itemCounts[i.nama] += i.qty;
  }));
  const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);

  let html = `📊 <strong>Laporan Hari Ini</strong><br><br>`;
  html += `💵 Total: <strong>${rupiah(total)}</strong><br>`;
  html += `📝 ${tx.length} transaksi<br><br>`;
  html += `🏆 <strong>Produk terlaris:</strong><br>`;
  sorted.forEach(([nama, qty], i) => {
    const medal = ['🥇', '🥈', '🥉'][i] || '&nbsp;&nbsp;';
    html += `${medal} ${esc(nama)} — ${qty}<br>`;
  });
  if (state.targetHarian > 0) {
    const pct = Math.round(total / state.targetHarian * 100);
    html += `<br>🎯 Target: ${rupiah(state.targetHarian)} (${pct}%)`;
  }
  addBotMsg(html);
}

function showLaporanMinggu() {
  addBotMsg('📊 Laporan mingguan belum tersedia di versi ini. Fitur ini coming soon ya~');
}

// ---- BLACKLIST ----
function tambahBlacklist(text) {
  const m = text.match(/blacklist\s+(\+?[\d\s-]+)/);
  if (!m) { addBotMsg('Format: <strong>"blacklist 08123456789"</strong>'); return; }
  const nomor = m[1].replace(/\s/g, '');
  state.blacklist[nomor] = { tanggal: new Date().toLocaleDateString('id-ID'), alasan: 'order fiktif' };
  saveState();
  addBotMsg(`✅ Nomor <strong>${esc(nomor)}</strong> ditambahkan ke blacklist.`);
}

function cekBlacklist(text) {
  const m = text.match(/cek\s+(\+?[\d\s-]+)/);
  if (!m) return;
  const nomor = m[1].replace(/\s/g, '');
  const entry = state.blacklist[nomor];
  if (entry) {
    addBotMsg(`⚠️ <strong>HATI-HATI!</strong><br>Nomor ini tercatat pernah <strong>${esc(entry.alasan)}</strong><br>Tanggal: ${entry.tanggal}<br><br>✅ Disarankan: minta DP dulu sebelum masak.`);
  } else {
    addBotMsg(`✅ Nomor <strong>${esc(nomor)}</strong> aman, gak ada di blacklist.`);
  }
}

// ---- TUTUP WARUNG ----
function showTutupModal() {
  if (!state.buka) return;
  document.getElementById('modalTutup').classList.add('active');
}

function handleTutup() {
  const jam = new Date().getHours();
  if (jam < 20) {
    document.getElementById('modalBukaTitle').textContent = 'Masih awal nih..';
    document.getElementById('modalBukaDesc').innerHTML = `Baru jam <strong>${jam}:00</strong>. Mau jualan lagi?`;
    document.getElementById('modalBuka').classList.add('active');
  }
  showRekap();
}

function showRekap() {
  const now = new Date();
  document.getElementById('rekapDate').textContent = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · Tutup ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const tx = state.transaksi;
  const total = tx.reduce((s, t) => s + t.total, 0);
  const itemCounts = {};
  tx.forEach(t => t.items.forEach(i => {
    if (!itemCounts[i.nama]) itemCounts[i.nama] = 0;
    itemCounts[i.nama] += i.qty;
  }));
  const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);

  let html = '<div class="rekap-card">';
  html += `<div class="r-line"><span class="r-lbl">Omzet</span><span class="r-val">${rupiah(total)}</span></div>`;
  if (state.targetHarian > 0) {
    const pct = Math.round(total / state.targetHarian * 100);
    html += `<div class="r-line"><span class="r-lbl">Target</span><span class="r-val">${rupiah(state.targetHarian)} (${pct}%)</span></div>`;
  }
  html += `<div class="r-line"><span class="r-lbl">Total Transaksi</span><span class="r-val">${tx.length} item</span></div>`;

  if (sorted.length) {
    html += '<div class="rekap-divider"></div>';
    sorted.forEach(([nama, qty]) => {
      html += `<div class="r-line"><span class="r-lbl">${esc(nama)}</span><span class="r-val">${qty}</span></div>`;
    });
  }

  const stokKeys = Object.keys(state.stok);
  if (stokKeys.length) {
    html += '<div class="rekap-divider"></div>';
    stokKeys.forEach(k => {
      const s = state.stok[k];
      html += `<div class="r-line"><span class="r-lbl">📦 Stok ${esc(s.nama)}</span><span class="r-val">sisa ${s.qty}${s.satuan}</span></div>`;
    });
  }
  html += '</div>';

  document.getElementById('rekapContent').innerHTML = html;
  document.getElementById('modalRekap').classList.add('active');
}

function finalizeTutup() {
  state.buka = false;
  saveState();

  document.getElementById('statusBar').innerHTML = '<span class="dot merah"></span> <span>Warung tutup</span>';
  document.getElementById('btnTutupHeader').style.display = 'none';
  document.getElementById('chatInput').disabled = true;
  document.getElementById('chatInput').placeholder = 'Warung lagi tutup..';
  document.getElementById('btnSend').disabled = true;
  document.getElementById('closedOverlay').classList.add('active');

  addBotMsg('🌙 Warung ditutup. Semua data udah tersimpan. Besok tinggal bilang <strong>"buka"</strong> kalo mau lanjut!');
}

function updateUIForOpen() {
  document.getElementById('closedOverlay').classList.remove('active');
  document.getElementById('statusBar').innerHTML = '<span class="dot"></span> <span>Siap bantu catat transaksi</span>';
  document.getElementById('btnTutupHeader').style.display = 'inline-block';
  document.getElementById('chatInput').disabled = false;
  document.getElementById('chatInput').placeholder = 'Ketik di sini...';
  document.getElementById('btnSend').disabled = false;
}

function bukaWarung() {
  state.buka = true;
  saveState();

  updateUIForOpen();

  const total = state.transaksi.reduce((s, t) => s + t.total, 0);
  let html = `☀️ Warung dibuka lagi!<br>📊 Total hari ini: <strong>${rupiah(total)}</strong>`;
  if (state.targetHarian > 0) {
    const pct = Math.round(total / state.targetHarian * 100);
    html += `<br>🎯 Target: ${pct}%`;
  }
  addBotMsg(html);
}

// ---- HELP ----
function showHelp() {
  addBotMsg(`📖 <strong>Yang bisa aku bantu:</strong><br><br>
📝 <strong>"jual soto 2, telur 1kg"</strong> — catat transaksi<br>
📦 <strong>"stok telur 10kg"</strong> — set stok awal<br>
📦 <strong>"stok"</strong> — cek stok sekarang<br>
🎯 <strong>"target 500rb"</strong> — pasang target harian<br>
🎯 <strong>"target"</strong> — cek progress<br>
📊 <strong>"total hari ini"</strong> — laporan<br>
⚠️ <strong>"cek 0812xxx"</strong> — cek blacklist<br>
⚠️ <strong>"blacklist 0812xxx"</strong> — tambah blacklist<br>
🔒 <strong>"tutup"</strong> — tutup warung + rekap<br>
📖 <strong>"help"</strong> — liat menu ini lagi`);
}

// ---- MODAL HELPERS ----
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ---- INIT CHAT ----
function renderChat() {
  if (!state.namaWarung) return;
  addDateLabel();
  // If there are saved transactions, show summary
  if (state.transaksi.length) {
    const total = state.transaksi.reduce((s, t) => s + t.total, 0);
    addBotMsg(`Selamat datang kembali! 👋<br>📊 Total hari ini: <strong>${rupiah(total)}</strong> (${state.transaksi.length} transaksi)`);
  }
  if (!state.buka) {
    document.getElementById('closedOverlay').classList.add('active');
    document.getElementById('statusBar').innerHTML = '<span class="dot merah"></span> <span>Warung tutup</span>';
    document.getElementById('btnTutupHeader').style.display = 'none';
    document.getElementById('chatInput').disabled = true;
    document.getElementById('chatInput').placeholder = 'Warung lagi tutup..';
    document.getElementById('btnSend').disabled = true;
  }
}
