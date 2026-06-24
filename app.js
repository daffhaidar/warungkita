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
let installShown = false;

function tryShowInstallBanner() {
  if (installShown) return;
  if (localStorage.getItem('warungkita_install_dismissed') === '1') return;
  const banner = document.getElementById('installBanner');
  if (!banner) return;
  banner.classList.add('show');
  installShown = true;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Show banner: onboarding -> 4s, main chat -> 8s (after user has had a chance to interact)
  const inMainChat = document.getElementById('main-chat')?.classList.contains('active');
  const delay = inMainChat ? 8000 : 4000;
  setTimeout(tryShowInstallBanner, delay);
});

// Re-show in main chat if user navigates from onboarding without seeing it
// (covers case where beforeinstallprompt fired late)
window.addEventListener('DOMContentLoaded', () => {
  const mainChat = document.getElementById('main-chat');
  if (!mainChat) return;
  const observer = new MutationObserver(() => {
    if (mainChat.classList.contains('active') && deferredInstallPrompt && !installShown) {
      setTimeout(tryShowInstallBanner, 6000);
    }
  });
  observer.observe(mainChat, {attributes: true, attributeFilter: ['class']});
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const banner = document.getElementById('installBanner');
  if (banner) banner.classList.remove('show');
});

document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('installBtn');
  const installClose = document.getElementById('installClose');
  const installManual = document.getElementById('btnInstallManual');

  // Show manual install button in header whenever prompt is available
  // (works even if banner was dismissed)
  const showManualIfPossible = () => {
    if (installManual && deferredInstallPrompt) {
      installManual.style.display = 'flex';
    }
  };

  // Always show manual install button — give user a way to trigger it
  // even before beforeinstallprompt fires (Chrome can take 30+ seconds
  // to fire it on first visit). Behavior adapts based on prompt availability.
  if (installManual) {
    installManual.style.display = 'flex';
  }

  if (installBtn) {
    installBtn.onclick = async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        document.getElementById('installBanner').classList.remove('show');
        if (installManual) installManual.style.display = 'none';
      }
      deferredInstallPrompt = null;
    };
  }
  if (installManual) {
    installManual.onclick = async () => {
      if (!deferredInstallPrompt) {
        // iOS Safari path — show instructions modal
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
          alert('Pasang di iPhone:\n1. Tap tombol Share (kotak dengan panah ke atas)\n2. Scroll ke bawah, pilih "Add to Home Screen"\n3. Tap "Add" ✅');
        } else {
          alert('Browser lo belum support install prompt otomatis. Buka menu browser → "Add to Home Screen" / "Install App".');
        }
        return;
      }
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        if (installManual) installManual.style.display = 'none';
        const banner = document.getElementById('installBanner');
        if (banner) banner.classList.remove('show');
      }
      deferredInstallPrompt = null;
    };
  }
  // Periodically check if prompt became available (Android fires it lazily)
  setInterval(showManualIfPossible, 2000);
  showManualIfPossible();
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
      const needsScroll = qa.scrollWidth > qa.clientWidth + 4;
      const atEnd = qa.scrollLeft + qa.clientWidth >= qa.scrollWidth - 4;
      qa.classList.toggle('scrolled-end', atEnd);
      qa.classList.toggle('no-scroll', !needsScroll);
    };
    qa.addEventListener('scroll', updateScroll, {passive:true});
    setTimeout(updateScroll, 300);
    window.addEventListener('resize', updateScroll);
  }
});

// ---- SERVICE WORKER ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Detect SW updates — when new SW is found and installed,
      // force it to take over immediately and reload to get fresh UI.
      reg.addEventListener('updatefound', () => {
        const newSw = reg.installing;
        if (!newSw) return;
        newSw.addEventListener('statechange', () => {
          if (newSw.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW installed while old one is controlling — take over now
            newSw.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
      // If there's already a waiting SW (deployed earlier, user just reopened),
      // activate it immediately
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    }).catch(() => {});

    // When new SW takes control, reload to get fresh UI
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}

// ---- STATE ----
let state = {
  namaWarung: '',
  buka: true,
  targetHarian: 0,
  stok: {},            // { 'telur': { qty, satuan, nama }, ... }
  transaksi: [],       // [{ id, items, total, waktu }]
  blacklist: {},
  pendingTx: null,
  // NEW FIELDS:
  pengeluaran: [],     // [{ id, items, total, waktu, keterangan }]
  hargaCustom: {},     // LEGACY — migrated to itemConfig on load
  itemConfig: {},      // { 'nama_item': { harga, satuan, nama } } — per-item config
  pendingPrice: null,  // { nama, qty, satuan, callback } — when waiting for user to confirm price
  pendingPengeluaran: null, // { items, total, waktu, callback } — when waiting for user to confirm expense
  pendingStockWarning: null, // { items, missing } — stock check before transaksi
  pendingBayar: null,  // { total } — saved last transaction total for "bayar" follow-up
  pendingStokQuestion: null, // transient — when asking "10 apa? (pcs/bungkus/dus)"
  pendingFuzzy: null, // { input, suggested, callback } — typo suggestion flow
  pendingUtangAskName: null, // { itemsText } — when "janji utang mangkok 1 biji" has no person name
  // Setup wizard flag
  setupDone: false,
  // Debt tracking (utang piutang)
  utang: {},           // { 'budi': { items:[{nama,qty,harga}], total, tanggal, lunas } }
  // Typo auto-correction map: { 'rkok surya': 'rokok surya' }
  typoMap: {},
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
    if (saved) {
      const parsed = JSON.parse(saved);
      state = { ...state, ...parsed };
      // Ensure new fields exist on legacy state
      if (!Array.isArray(state.pengeluaran)) state.pengeluaran = [];
      if (typeof state.hargaCustom !== 'object' || !state.hargaCustom) state.hargaCustom = {};
      if (typeof state.itemConfig !== 'object' || !state.itemConfig) state.itemConfig = {};
      if (state.setupDone === undefined) state.setupDone = false;
      if (typeof state.utang !== 'object' || !state.utang) state.utang = {};
      if (typeof state.typoMap !== 'object' || !state.typoMap) state.typoMap = {};
      if (state.pendingBayar === undefined) state.pendingBayar = null;
      // Migrate old hargaCustom to itemConfig
      const hcKeys = Object.keys(state.hargaCustom);
      if (hcKeys.length > 0 && Object.keys(state.itemConfig).length === 0) {
        state.itemConfig = { ...state.hargaCustom };
        state.hargaCustom = {};
        saveState();
      }
    }
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
    // NEW: stok prompt as the FIRST message — wait for input before showing quick actions
    addBotMsg(
      `Halo! Aku bakal bantu catat jualan di <strong>${esc(nama)}</strong>. ` +
      `Mau isi stok dulu ga? Misal: <em>"stok beras 10kg, minyak 2l"</em>. ` +
      `Atau ketik <strong>"skip"</strong> kalo langsung mulai.`
    );
    // Hide quick actions until user responds
    setQuickActionsVisible(false);
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
        catat: 'Contoh: "jual nasi goreng 3, es teh 2"',
        laporan: 'total hari ini',
        stok: 'stok',
        target: 'target',
        tutup: 'tutup',
        riwayat: 'riwayat',
        pengeluaran: 'beli minyak 20rb',
        utang: 'utang',
      };
      if (cmd === 'tutup') { showTutupModal(); return; }
      if (cmd === 'stok' || cmd === 'target' || cmd === 'laporan' || cmd === 'riwayat' || cmd === 'pengeluaran' || cmd === 'utang') {
        const map = {
          stok: 'stok',
          target: 'target',
          laporan: 'total hari ini',
          riwayat: 'riwayat',
          pengeluaran: 'pengeluaran',
          utang: 'utang',
        };
        processUserMsg(map[cmd] || cmd);
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

  // Rekap share buttons
  const btnCopy = document.getElementById('btnRekapCopy');
  if (btnCopy) btnCopy.onclick = copyRekapToClipboard;
  const btnWA = document.getElementById('btnRekapWA');
  if (btnWA) btnWA.onclick = shareRekapToWhatsApp;

  // Reset
  document.getElementById('btnReset').onclick = () => {
    if (confirm('Reset semua data? Semua transaksi dan stok akan hilang.')) {
      localStorage.removeItem('warungkita_state');
      location.reload();
    }
  };
}

function setQuickActionsVisible(visible) {
  const qa = document.getElementById('quickActions');
  if (!qa) return;
  qa.style.display = visible ? 'flex' : 'none';
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

  // Edge case: very long input
  if (text.length > 500) {
    addBotMsg('Kebanyakan ngetik 😅 Coba lebih pendek ya');
    return;
  }

  // Edge case: empty / whitespace
  if (!text.trim()) return;

  if (!state.buka) {
    addBotMsg('Warung lagi tutup nih. Ketik <strong>"buka"</strong> kalo mau mulai jualan lagi 🙂');
    return;
  }

  // First-time setup wizard: after warung name, user responds with stok or "skip"
  if (!state.setupDone) {
    handleFirstSetup(text);
    return;
  }

  // Pending price: user is responding to "Harga [item] berapa per [satuan]?"
  if (state.pendingPrice) {
    handlePendingPriceResponse(text);
    return;
  }

  // Pending expense confirmation
  if (state.pendingPengeluaran) {
    handlePendingPengeluaranResponse(text);
    return;
  }

  // Pending "satuan apa?" — user is answering what satuan they meant
  if (state.pendingStokQuestion) {
    handlePendingStokSatuan(text);
    return;
  }

  // Pending "pembeli bayar berapa?" — user is responding after a confirmed tx
  if (state.pendingBayar) {
    handlePendingBayarResponse(text);
    return;
  }

  // Pending fuzzy-match confirmation ("Maksudnya Rokok Surya?")
  if (state.pendingFuzzy) {
    handlePendingFuzzyResponse(text);
    return;
  }

  // Stock warning: user responding to "item ga ada di penyimpanan"
  if (state.pendingStockWarning) {
    const t = text.toLowerCase().trim();
    if (t === 'lanjut' || t === 'gas' || t === 'tetep' || t === 'ya' || t === 'y' || t === 'skip') {
      // User wants to proceed without stock — process the saved transaction
      const saved = state.pendingStockWarning;
      state.pendingStockWarning = null;
      finalizeTransaksi(saved.items);
    } else if (t.startsWith('stok ') || t.startsWith('isi ')) {
      // User is adding stock — let the normal command processor handle it.
      // IMPORTANT: keep pendingStockWarning active so setStok's auto-resume triggers.
      processCommand(text);
    } else {
      addBotMsg('Ketik <strong>"stok [nama] [jumlah]"</strong> buat catet stok dulu, atau <strong>"lanjut"</strong> kalo tetep mau jual tanpa stok');
    }
    return;
  }

  // Pending utang name: user answering "utang atas nama siapa?"
  if (state.pendingUtangAskName) {
    const name = capitalize(text.trim());
    if (!name || name.length > 50) {
      addBotMsg('Ketik nama orangnya aja, misal: <strong>"Budi"</strong> atau <strong>"Mami Budi"</strong>');
      return;
    }
    const saved = state.pendingUtangAskName;
    state.pendingUtangAskName = null;
    saveState();
    // Route to parseTransaksi with the name filled in
    parseTransaksi(`utang ${name} ${saved.itemsText}`);
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

// ---- FIRST-SETUP WIZARD ----
function handleFirstSetup(text) {
  const t = text.toLowerCase().trim();
  if (t === 'skip' || t === 'lanjut' || t === 'ga' || t === 'gak' || t === 'enggak' || t === 'nanti') {
    state.setupDone = true;
    saveState();
    setQuickActionsVisible(true);
    addBotMsg(`Oke sip langsung mulai ya! 🚀<br><br>📌 <span style="font-size:12px;color:#b0a89a">Contoh: "jual nasi goreng 3" → "target 500rb" → "tutup"</span>`);
    return;
  }
  // Treat as stok input
  if (t.match(/^(stok|isi|tambah|restock)\s+/) || t.match(/\d/)) {
    const before = t;
    const wasStokCmd = t.match(/^(stok|isi|tambah|restock)\s+/);
    const clean = wasStokCmd ? t.replace(/^(stok|isi|tambah|restock)\s+/, '') : t;
    const items = parseItems(clean);
    if (items.length) {
      items.forEach(i => {
        const key = normalizeKey(i.nama);
        state.stok[key] = { qty: i.qty, satuan: i.satuan, nama: i.nama };
      });
      state.setupDone = true;
      saveState();
      setQuickActionsVisible(true);
      let html = `✅ Stok awal tercatat:<br>`;
      items.forEach(i => {
        html += `&nbsp;&nbsp;📦 ${esc(i.nama)}: <strong>${i.qty}${i.satuan}</strong><br>`;
      });
      html += `<br>Mantap! Udah siap catat jualan. Coba ketik <strong>"jual ${esc(items[0].nama.toLowerCase())} 1"</strong> dulu yuk 🙂`;
      addBotMsg(html);
      return;
    }
  }
  // Fallback: didn't parse as anything
  addBotMsg(`Belum ngerti nih 😅<br><br>Ketik <strong>"stok [nama barang] [jumlah]"</strong> (contoh: "stok telur 10kg"),<br>atau <strong>"skip"</strong> kalo mau langsung mulai.`);
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

  // Reject negative/zero quantities early for any "jual" attempt
  if (t.match(/^(jual|catat|order)\s+/) || t.match(/^(jual|catat|order|in)\s*$/)) {
    // Handled by parseTransaksi
  }

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

  // Riwayat
  if (t === 'riwayat' || t === 'history' || t === 'riwayat transaksi') { showRiwayat(); return; }

  // Pengeluaran / keluar
  if (t === 'pengeluaran' || t === 'keluar' || t === 'laporan keluar') { showPengeluaranList(); return; }
  if (t.match(/^(beli|belanja|keluar|pengeluaran)\s+/)) { parsePengeluaran(t); return; }

  // Blacklist
  if (t.match(/^blacklist\s+/)) { tambahBlacklist(t); return; }
  if (t.match(/^cek\s+08/)) { cekBlacklist(t); return; }

  // Kembalian / Bayar — calculate change from a sale
  // "bayar 35000 50000" → kembalian Rp15.000
  // "bayar 35rb 50rb" works too
  // "kembalian" alone → recalculate from last transaction
  if (t === 'kembalian') {
    if (state.pendingBayar && state.pendingBayar.total > 0) {
      addBotMsg(`Total terakhir: <strong>${rupiah(state.pendingBayar.total)}</strong><br>Pembeli bayar berapa? Tinggal sebut nominalnya, misal <strong>"50rb"</strong>`);
    } else {
      addBotMsg('Belum ada transaksi terakhir. Coba <strong>"bayar [total] [uang]"</strong>, misal: <strong>"bayar 35000 50000"</strong>');
    }
    return;
  }
  const bayarMatch = t.match(/^bayar\s+(\d[\d.,]*\s*(?:rb|ribu|jt|juta)?)\s+(\d[\d.,]*\s*(?:rb|ribu|jt|juta)?)$/i);
  if (bayarMatch) {
    const total = parseRupiah(bayarMatch[1]);
    const uang = parseRupiah(bayarMatch[2]);
    if (!total || !uang || total <= 0 || uang <= 0) {
      addBotMsg('Format: <strong>"bayar 35000 50000"</strong> (total dulu, baru uang pembayaran)');
      return;
    }
    showKembalian(total, uang);
    return;
  }
  // "bayar" alone — prompt for the last transaction's total
  if (t === 'bayar') {
    if (state.pendingBayar && state.pendingBayar.total > 0) {
      addBotMsg(`Total transaksi terakhir: <strong>${rupiah(state.pendingBayar.total)}</strong><br>Pembeli bayar berapa? Sebut nominalnya, misal <strong>"50rb"</strong>`);
    } else {
      addBotMsg('Format: <strong>"bayar [total] [uang]"</strong><br>Contoh: <strong>"bayar 35000 50000"</strong> → kembalian Rp15.000');
    }
    return;
  }

  // Utang (debt tracking)
  if (t === 'utang') { showUtangList(); return; }
  // "utang budi" → show Budi's debt
  if (t.match(/^utang\s+[a-z]+\s*$/)) {
    const name = t.replace(/^utang\s+/, '').trim();
    showUtangDetail(name);
    return;
  }
  // "utang lunas budi" → mark Budi as paid
  const lunasMatch = t.match(/^utang\s+lunas\s+([a-z]+)$/);
  if (lunasMatch) {
    markUtangLunas(lunasMatch[1]);
    return;
  }
  // "bayar utang budi 5000" → reduce debt by 5000
  const bayarUtangMatch = t.match(/^bayar\s+utang\s+([a-z]+)\s+(\d[\d.,]*\s*(?:rb|ribu|jt|juta)?)$/i);
  if (bayarUtangMatch) {
    const name = bayarUtangMatch[1];
    const amount = parseRupiah(bayarUtangMatch[2]);
    if (!amount || amount <= 0) {
      addBotMsg('Format: <strong>"bayar utang budi 5000"</strong> atau <strong>"bayar utang budi 5rb"</strong>');
      return;
    }
    bayarUtang(name, amount);
    return;
  }
  // "utang budi indomie 2 3500" → record debt for Budi
  // Also support "utang budi indomie 2 pcs 3500" with explicit satuan
  const utangMatch = t.match(/^utang\s+([a-z]+)\s+(.+)$/);
  if (utangMatch) {
    const name = utangMatch[1];
    const itemsText = utangMatch[2];
    addUtang(name, itemsText);
    return;
  }

  // "[name] utang [items]" — Pattern 2: utang in middle without "jual" prefix
  // e.g. "budi utang indomie 5 bks" or "mami budi utang kopi 2 gelas"
  if (t.includes('utang') && /\d/.test(t) && !t.match(/^(jual|catat|order|beli|stok|target|bayar|help|buka|tutup)\b/)) {
    // Route to parseTransaksi which handles Pattern 2 detection
    tryFuzzyOnInput(t, (corrected) => {
      parseTransaksi(corrected !== null ? corrected : t);
    });
    return;
  }

  // Jual (transaksi) — including loose forms
  if (
    t.match(/^(jual|catat|order|jualin|in)\s+/) ||
    // "soto 3" (item followed by qty, no prefix)
    t.match(/^[a-zA-Z]+\s+\d/) ||
    // "mau jual soto 3" or "jual soto dong" (loose)
    t.match(/^(aku\s+)?(mau\s+)?(jual|catat|order|jualin)\s+/)
  ) {
    // Run typo check first — if user typed "rkok surya" and "Rokok Surya" exists,
    // ask for confirmation.
    tryFuzzyOnInput(t, (corrected) => {
      parseTransaksi(corrected !== null ? corrected : t);
    });
    return;
  }

  // "jual" alone
  if (t === 'jual' || t === 'jual dong' || t === 'catat') {
    addBotMsg('Mau jual apa nih? 🙂<br>Contoh: <strong>"jual nasi goreng 3"</strong> atau <strong>"jual nasi goreng 2, es teh 3"</strong>');
    return;
  }

  // Help
  if (t === 'help' || t === 'bantuan' || t === '?') { showHelp(); return; }

  // Plain number — treat as target
  const maybeNum = parseRupiah(t);
  if (maybeNum && maybeNum > 0) {
    setTargetText(maybeNum);
    return;
  }

  // Default — random / unknown text
  addBotMsg(`Hmm, aku gak ngerti maksudnya 😅<br><br>Coba ketik terpisah aja:<br>• <strong>"jual kopi 2 bungkus"</strong> buat catat jualan<br>• <strong>"beli gula 10rb"</strong> buat catat pengeluaran<br>• <strong>"bayar 35000 50000"</strong> buat hitung kembalian<br><br>Atau ketik <strong>"help"</strong> buat liat semua perintah.`);
}

// ---- TRANSAKSI ----
function parseTransaksi(text) {
  // Strip common prefixes: "jual", "catat", "order", "jualin", "aku mau jual", "mau jual"
  let clean = text
    .replace(/^(aku\s+)?(mau\s+)?(jual|catat|order|jualin|in|masukin|tambahin)\s+/i, '')
    .replace(/\s+(dong|ya|yaa|woi)$/i, '')
    .trim();

  // Detect "utang [name]" at the end — e.g. "jual rokok 1 pack utang budi"
  let utangName = null;

  // Patterns:
  // 1. "... utang [name]" — e.g. "jual indomie 2 bks utang budi"
  // 2. "[name] utang [items]" — e.g. "budi utang indomie 5 bks"
  // 3. "... utang si [name]" — e.g. "pempes 1 utang si jamal"
  // 4. "si [name] utang [items]" — e.g. "si jamal utang karet 1 biji"
  const utangMatch = clean.match(/\s+utang\s+(.+)$/i);
  if (utangMatch) {
    const beforeUtang = clean.replace(/\s+utang\s+.+$/i, '').trim();
    const afterUtang = utangMatch[1].trim();

    // Helper: extract name from "si [name] ..." or "[name]"
    function extractName(s) {
      const siMatch = s.match(/^si\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
      if (siMatch) return capitalize(siMatch[1]);
      const wordMatch = s.match(/^([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/);
      return wordMatch ? capitalize(wordMatch[1]) : null;
    }
    // Helper: extract items from "... [qty] [satuan] ..." or "... [name] [qty] ..."
    function extractItems(s) {
      // Has digits → likely items
      if (/\d/.test(s)) return s;
      return null;
    }

    const beforeHasDigits = /\d/.test(beforeUtang);
    const afterHasDigits = /\d/.test(afterUtang);

    // Priority 1: "si [name]" always indicates a person name — check FIRST
    const afterSiMatch = afterUtang.match(/\b(si\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
    const beforeSiMatch = beforeUtang.match(/^(si\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)?)\b/i);

    if (afterSiMatch) {
      // Pattern 3: "pempes 1 utang si jamal" or "karet 1 biji utang si jamal"
      utangName = capitalize(afterSiMatch[1].replace(/^si\s+/i, ''));
      // Remove "si [name]" from afterUtang, combine with beforeUtang as items
      const afterClean = afterUtang.replace(/\b(si\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)?)\b/i, '').trim();
      clean = (beforeUtang + ' ' + afterClean).trim();
    } else if (beforeSiMatch) {
      // Pattern 4: "si jamal utang karet 1 biji"
      utangName = capitalize(beforeSiMatch[1].replace(/^si\s+/i, ''));
      clean = afterUtang;
    } else if (!beforeHasDigits && afterHasDigits) {
      // Pattern 2: "budi utang indomie 5 bks" → name before, items after
      const cleanName = beforeUtang.replace(/^(jual|catat|order|beli|tambah|stok|target|bayar|utang|janji|mau|aku|saya|gue|lagi|udah|sudah|minta|titip)\s+/i, '').trim();
      if (!cleanName) {
        state.pendingUtangAskName = { itemsText: afterUtang };
        addBotMsg('Utang atas nama siapa? 🙂<br>Ketik nama orangnya, misal: <strong>"Budi"</strong> atau <strong>"si Jamal"</strong>');
        return;
      }
      utangName = capitalize(cleanName);
      clean = afterUtang;
    } else {
      // Pattern 1: "jual indomie 2 bks utang budi botak" → items before, name after
      utangName = extractName(afterUtang);
      if (!utangName) {
        state.pendingUtangAskName = { itemsText: beforeUtang };
        addBotMsg('Utang atas nama siapa? 🙂<br>Ketik nama orangnya, misal: <strong>"Budi"</strong> atau <strong>"si Jamal"</strong>');
        return;
      }
      // Remove the name part from afterUtang to get any remaining items
      const remainingAfter = afterUtang.replace(/^[a-zA-Z]+(?:\s+[a-zA-Z]+)?/, '').trim();
      clean = beforeUtang + (remainingAfter ? ' ' + remainingAfter : '');
      clean = clean.trim();
    }
  }

  if (!clean) {
    addBotMsg('Mau jual apa nih? 🙂<br>Contoh: <strong>"jual nasi goreng 3"</strong>');
    return;
  }

  const items = parseItems(clean);
  if (!items.length) {
    addBotMsg('Waduh, catatannya kepanjangan atau campur aduk nih 😅<br><br>Coba ketik terpisah aja:<br>• <strong>"jual kopi 2 bungkus"</strong> dulu<br>• Baru ketik <strong>"bayar 10000 50000"</strong> kalo mau hitung kembalian');
    return;
  }

  // Validate quantities: reject negative or zero
  const bad = items.find(i => !(i.qty > 0));
  if (bad) {
    addBotMsg(`Jumlahnya gak valid nih 😅 Coba angka yang bener ya, contoh: <strong>"jual nasi goreng 3"</strong>`);
    return;
  }

  // If any item has no known price (custom needed), ask first
  const needPrice = items.find(i => i.needsPrice);
  if (needPrice) {
    askForPrice(needPrice, items, utangName);
    return;
  }

  // Check stock availability for each item
  const missingStok = items.filter(i => {
    const key = normalizeKey(i.nama);
    return state.stok[key] === undefined || state.stok[key] === null;
  });
  if (missingStok.length > 0) {
    state.pendingStockWarning = {
      items: items,
      missing: missingStok,
    };
    let warnHtml = '⚠️ Ada item yang belum tercatat di stok nih:<br><br>';
    missingStok.forEach(i => {
      warnHtml += `❓ <strong>${esc(i.nama)}</strong> — ga ada di penyimpanan<br>`;
    });
    warnHtml += `<br>📌 Ketik <strong>"stok [nama] [jumlah]"</strong> buat catet stok dulu<br>`;
    warnHtml += `Atau ketik <strong>"lanjut"</strong> kalo tetep mau jual tanpa stok`;
    addBotMsg(warnHtml);
    return;
  }

  const total = items.reduce((s, i) => s + i.total, 0);
  state.pendingTx = { items, total, waktu: new Date().toISOString(), utangName };
  saveState();

  let html = 'Mau catat nih:<br><br>';
  items.forEach(i => {
    html += `✅ <strong>${esc(i.nama)}</strong>: ${i.qty} ${i.satuan} × ${rupiah(i.harga)} = <strong>${rupiah(i.total)}</strong><br>`;
  });

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

// Ask user for price AND default satuan of an unknown item
// User can respond: "15000" (keep default), "15000 per kg", or "20rb/ekor"
function askForPrice(pendingItem, fullItems, utangName) {
  state.pendingPrice = {
    pending: pendingItem,
    fullItems: fullItems,
    utangName: utangName || null,
  };
  // Pick a user-friendly example satuan to surface, falling back to the parsed one
  const contohSatuan = pendingItem.satuan && pendingItem.satuan !== 'pcs' ? pendingItem.satuan : 'pcs';
  addBotMsg(
    `Belum tau harga <strong>${esc(pendingItem.nama)}</strong> nih 🤔<br><br>` +
    `💰 Harga <strong>${esc(pendingItem.nama)}</strong> per apa? Contoh:<br>` +
    `&nbsp;&nbsp;• <strong>"15000 per kg"</strong><br>` +
    `&nbsp;&nbsp;• <strong>"5000/butir"</strong><br>` +
    `&nbsp;&nbsp;• <strong>"3500/pcs"</strong><br>` +
    `&nbsp;&nbsp;• Atau langsung: <strong>"15000"</strong> (per ${esc(contohSatuan)})`
  );
}

function handlePendingPriceResponse(text) {
  const t = text.toLowerCase().trim();
  const pending = state.pendingPrice;
  if (!pending) return;

  // If user typed a new command instead of a price, cancel pending and route to processCommand
  const commandKeywords = /^(jual|catat|order|beli|stok|target|bayar|utang|help|buka|tutup|riwayat|laporan|total|kembalian|blacklist|cek)\b/;
  const looksLikeCommand = commandKeywords.test(t) || (t.includes('utang') && /\d/.test(t));
  if (looksLikeCommand) {
    state.pendingPrice = null;
    saveState();
    processCommand(text);
    return;
  }

  // Try to parse both price and satuan from response
  // Patterns: "15000 per kg", "20rb/ekor", "15000/kg", or just "15000"
  let priceNum, satuan;

  const m1 = t.match(/^(\d+(?:[.,]\d+)*)\s*(rb|ribu|jt|juta)?\s*(?:\/|per)\s*(\w+)$/i);
  const m2 = t.match(/^(\d+(?:[.,]\d+)*)\s*(rb|ribu|jt|juta)?$/i);

  if (m1) {
    // User specified both price AND satuan
    priceNum = parseFloat(m1[1].replace(/[.,]/g, m1[1].includes(',') ? '.' : ''));
    const mult = (m1[2] || '').toLowerCase();
    if (mult === 'rb' || mult === 'ribu') priceNum *= 1000;
    else if (mult === 'jt' || mult === 'juta') priceNum *= 1000000;
    satuan = m1[3].toLowerCase();
    // Expanded normalization — accepts anything the user types as-is.
    const satuanMap = {
      // weight
      'kg': 'kg', 'kilo': 'kg', 'kilogram': 'kg', 'kiloan': 'kg',
      'gram': 'gram', 'gr': 'gram', 'g': 'gram', 'ons': 'ons',
      // volume
      'liter': 'liter', 'ltr': 'liter', 'l': 'liter', 'ml': 'ml',
      'galon': 'galon', 'jerigen': 'jerigen',
      // count / unit
      'pcs': 'pcs', 'pc': 'pcs', 'pieces': 'pcs', 'ps': 'pcs',
      'butir': 'butir', 'btr': 'butir', 'biji': 'biji', 'buah': 'buah', 'bua': 'buah',
      'ekor': 'ekor', 'porsi': 'porsi', 'orsi': 'porsi',
      // packaging
      'botol': 'botol', 'btl': 'botol', 'kaleng': 'kaleng', 'klg': 'kaleng',
      'slop': 'slop', 'slp': 'slop',
      'dus': 'dus', 'box': 'box', 'bx': 'box',
      'pack': 'pack', 'pak': 'pack', 'pck': 'pack',
      'bungkus': 'bungkus', 'bks': 'bungkus', 'bk': 'bungkus',
      'krat': 'krat', 'krt': 'krat',
      'karung': 'karung', 'krng': 'karung', 'sak': 'karung',
      'peti': 'peti', 'pti': 'peti',
      'bal': 'bal', 'ikat': 'ikat', 'ikt': 'ikat',
      'karton': 'karton', 'ktn': 'karton',
      'roll': 'roll', 'tabung': 'tabung', 'tbg': 'tabung',
      // loose items
      'tangkai': 'tangkai', 'tngk': 'tangkai',
      'helai': 'helai', 'hlai': 'helai',
      'lembar': 'lembar', 'lbr': 'lembar',
      'batang': 'batang', 'btg': 'batang',
      // food/drink
      'gelas': 'gelas', 'cup': 'gelas', 'mangkok': 'mangkok',
      'piring': 'piring', 'sendok': 'sendok', 'sdk': 'sendok',
      'pincuk': 'pincuk', 'kotak': 'kotak',
    };
    // If the satuan isn't in our known list, we accept it as-is (flexible)
    satuan = satuanMap[satuan] || satuan;
  } else if (m2) {
    // Just a number — use the default satuan from pending
    priceNum = parseFloat(m2[1].replace(/[.,]/g, m2[1].includes(',') ? '.' : ''));
    const mult = (m2[2] || '').toLowerCase();
    if (mult === 'rb' || mult === 'ribu') priceNum *= 1000;
    else if (mult === 'jt' || mult === 'juta') priceNum *= 1000000;
    satuan = pending.pending.satuan;
  } else {
    addBotMsg('Belum ngerti formatnya 😅<br>Tulis: <strong>"15000"</strong>, <strong>"15000 per kg"</strong>, atau <strong>"20000/ekor"</strong>');
    return;
  }

  if (!priceNum || priceNum <= 0) {
    addBotMsg('Harganya belum valid 😅 Coba lagi ya');
    return;
  }

  // Save to itemConfig (includes harga AND default satuan)
  const key = normalizeKey(pending.pending.nama);
  state.itemConfig[key] = {
    harga: Math.round(priceNum),
    satuan: satuan,
    nama: pending.pending.nama,
  };

  // Update the pending item in fullItems
  const idx = pending.fullItems.findIndex(i => normalizeKey(i.nama) === key);
  if (idx >= 0) {
    pending.fullItems[idx].harga = Math.round(priceNum);
    pending.fullItems[idx].satuan = satuan;
    pending.fullItems[idx].total = Math.round(priceNum) * pending.fullItems[idx].qty;
    pending.fullItems[idx].needsPrice = false;
  }

  // Check if any other item still needs price
  const stillNeeds = pending.fullItems.find(i => i.needsPrice);
  if (stillNeeds) {
    state.pendingPrice = { pending: stillNeeds, fullItems: pending.fullItems };
    addBotMsg(`Oke noted ✅ ${esc(pending.pending.nama)} = ${rupiah(Math.round(priceNum))}/${esc(satuan)}.<br>` +
      `Sekarang harga <strong>${esc(stillNeeds.nama)}</strong> per ${esc(stillNeeds.satuan)} berapa?`);
    return;
  }

  state.pendingPrice = null;
  saveState();
  // Continue with the transaction confirmation (carry utangName through)
  finalizeTransaksi(pending.fullItems, pending.utangName);
}

// "10 apa?" — user answers which satuan they meant
function handlePendingStokSatuan(text) {
  const pending = state.pendingStokQuestion;
  if (!pending) return;
  // Accept a single word as the satuan (e.g. "pcs", "bungkus", "dus")
  const cleaned = text.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned || cleaned.length > 16) {
    addBotMsg('Hmm belum ngerti satuannya 😅 Coba <strong>"pcs"</strong>, <strong>"bungkus"</strong>, atau <strong>"dus"</strong>');
    return;
  }
  // Apply the chosen satuan to every parsed item and apply
  const updatedItems = pending.items.map(it => ({ ...it, satuan: cleaned }));
  state.pendingStokQuestion = null;
  applyStokItems(updatedItems, pending.originalText);
}

// "Pembeli bayar berapa?" handler — accepts plain number or "bayar <uang>"
function handlePendingBayarResponse(text) {
  const t = text.trim();
  const m = t.match(/^(?:bayar\s+)?(\d[\d.,]*\s*(?:rb|ribu|jt|juta)?)$/i);
  if (!m) {
    addBotMsg('Format: tinggal sebut nominalnya aja, misal <strong>"50000"</strong> atau <strong>"50rb"</strong>');
    return;
  }
  const num = parseRupiah(m[1]);
  if (!num || num <= 0) {
    addBotMsg('Nominalnya belum valid 😅 Coba lagi ya');
    return;
  }
  showKembalian(state.pendingBayar.total, num);
  state.pendingBayar = null;
}

// "Maksudnya Rokok Surya?" — user confirms or rejects the fuzzy suggestion
function handlePendingFuzzyResponse(text) {
  const pending = state.pendingFuzzy;
  if (!pending) return;
  const t = text.toLowerCase().trim();
  state.pendingFuzzy = null;
  if (t === 'ya' || t === 'y' || t === 'iya' || t === 'betul' || t === 'bener' || t === 'correct') {
    // Save mapping for next time
    state.typoMap[normalizeKey(pending.input.split(/\s+/).slice(-2).join(' '))] = normalizeKey(pending.suggested);
    // Or simpler: store the whole phrase
    state.typoMap[normalizeKey(pending.input)] = normalizeKey(pending.suggested);
    saveState();
    // Proceed with the corrected command by replacing the input item name
    pending.callback(pending.suggested);
  } else if (t === 'bukan' || t === 'no' || t === 'n' || t === 'salah' || t === 'engga' || t === 'enggak') {
    addBotMsg('Oke sip, aku pake sesuai ketikan kamu ya 🙂');
    pending.callback(null); // proceed with original input
  } else {
    addBotMsg('Ketik <strong>"ya"</strong> kalo bener, atau <strong>"bukan"</strong> kalo salah ya');
    state.pendingFuzzy = pending; // restore for retry
  }
}

function finalizeTransaksi(items, utangName) {
  const total = items.reduce((s, i) => s + i.total, 0);
  state.pendingTx = { items, total, waktu: new Date().toISOString(), utangName: utangName || null };
  saveState();

  let html = `Oke siap! Mau catat nih:<br><br>`;
  items.forEach(i => {
    html += `✅ <strong>${esc(i.nama)}</strong>: ${i.qty} ${i.satuan} × ${rupiah(i.harga)} = <strong>${rupiah(i.total)}</strong><br>`;
  });
  items.forEach(i => {
    const key = normalizeKey(i.nama);
    if (state.stok[key]) {
      const sisa = Math.max(0, state.stok[key].qty - i.qty);
      html += `<br>📦 Stok ${esc(i.nama)}: ${state.stok[key].qty}${state.stok[key].satuan} → ${sisa}${state.stok[key].satuan}`;
    }
  });
  html += '<br><br>Kalo bener, pencet <strong>"OK"</strong> ya';

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
  // Remember this transaction's total so the user can ask "bayar" / "kembalian"
  state.pendingBayar = { total: tx.total };
  saveState();

  // If "utang [name]" was in the command, auto-record the debt
  if (tx.utangName) {
    recordUtang(tx.utangName, tx.items, tx.total);
  }

  const totalHariIni = state.transaksi.reduce((s, t) => s + t.total, 0);
  let html = `✅ <strong>Tersimpan!</strong> (ID: #${id})<br>📊 Total hari ini: <strong>${rupiah(totalHariIni)}</strong>`;
  if (state.targetHarian > 0) {
    const pct = Math.min(999, Math.round(totalHariIni / state.targetHarian * 100));
    html += renderProgressBar(totalHariIni, state.targetHarian, pct);
  }
  addBotMsg(html);

  // Offer to calculate change if total > 0
  if (tx.total > 0) {
    addBotMsg(`💰 Pembeli bayar berapa? Tinggal sebut nominalnya aja, misal <strong>"${tx.total >= 50000 ? '50rb' : (tx.total * 1.5 < 100000 ? Math.round(tx.total * 1.5 / 1000) + 'rb' : '50000')}"</strong>, atau ketik <strong>"bayar"</strong> buat input manual 🙂`);
  }
}

function koreksiTx(btn) {
  btn.closest('.chat-btns').innerHTML = '<span style="color:#b0a89a;font-size:13px">✏️ Dibatalkan, ketik ulang ya</span>';
  state.pendingTx = null;
  saveState();
}

// ---- PROGRESS BAR ----
function renderProgressBar(current, target, pct) {
  const widthPct = Math.min(100, Math.max(0, pct));
  const isOver = pct > 100;
  const colorClass = isOver ? 'over' : '';
  return `<div class="progress-wrap" style="margin-top:8px">
    <div class="progress-bar ${colorClass}">
      <div class="progress-fill" style="width:${widthPct}%"></div>
    </div>
    <div class="progress-label">🎯 ${rupiah(current)} / ${rupiah(target)} (${pct}%)${isOver ? ' 🎉' : ''}</div>
  </div>`;
}

// ---- ITEM PARSER ----
// Robust parser: accepts "nama qty satuan" or "nama qty satuan harga" or "nama qty harga"
// If qty has no satuan but item is known, uses remembered default satuan.
// If qty has no satuan AND item is unknown, defaults to 'pcs' as a sane placeholder.
// If trailing number is provided (and item is unknown OR config differs), uses as inline harga.
// Inline harga lets user auto-create items in one line: "jual indomie 1 pcs 3500"
function parseItems(text) {
  const items = [];
  const parts = text.split(/[,+&]\s*/);
  parts.forEach(p => {
    p = p.trim();
    if (!p) return;

    // Pattern with optional inline harga at the end.
    // "soto 2", "telur 1kg", "nasi goreng 3", "es teh 2 gelas",
    // "soto 2 15000", "indomie 1 pcs 3500"
    // Accepts leading minus for explicit rejection of negative quantities.
    // Group 1 = nama, 2 = qty, 3 = satuan, 4 = inline harga
    let m = p.match(/^(.+?)\s+(-?\d+(?:\.\d+)?)\s*(kg|kilo|kilogram|kiloan|gram|gr|g|ons|liter|ltr|l|ml|galon|jerigen|pcs|pc|pieces|ps|butir|btr|biji|buah|bua|ekor|porsi|orsi|botol|btl|kaleng|klg|slop|slp|dus|box|bx|pack|pak|pck|bungkus|bks|bk|krat|krt|karung|krng|sak|peti|pti|bal|ikat|ikt|karton|ktn|roll|tabung|tbg|tangkai|tngk|helai|hlai|lembar|lbr|batang|btg|pohon|gelas|cup|mangkok|piring|sendok|sdk|pincuk|kotak)?\s*(?:(\d[\d.,]*\s*(?:rb|ribu|jt|juta|k)?))?$/i);
    let nama, qty, satuan, inlineHarga;
    if (m && (m[1] || m[2])) {
      nama = capitalize(m[1].trim());
      qty = parseFloat(m[2]);
      satuan = m[3] ? m[3].toLowerCase() : null;
      inlineHarga = m[4] ? parseRupiah(m[4]) : null;
    } else {
      // No number — treat whole string as nama, qty=1
      m = p.match(/^(.+)$/);
      if (!m) return;
      nama = capitalize(m[1].trim());
      qty = 1;
      satuan = null;
      inlineHarga = null;
    }

    // Reject negative or zero quantities
    if (qty < 0 || qty === 0) {
      items.push({ nama, qty, satuan: satuan || 'pcs', harga: 0, total: 0, needsPrice: false, invalid: true });
      return;
    }

    // Check if we know this item's config (harga + default satuan)
    const key = normalizeKey(nama);
    const config = state.itemConfig[key];

    // If user didn't specify satuan but we know the default, use it
    if (!satuan && config) {
      satuan = config.satuan;
    } else if (!satuan) {
      satuan = 'pcs'; // sane default for unknown items (was 'porsi' before — too specific)
    }

    // Auto-create item config if inline harga is provided
    if (inlineHarga && inlineHarga > 0) {
      const updated = { harga: inlineHarga, satuan, nama };
      if (!config || config.harga !== inlineHarga || config.satuan !== satuan) {
        state.itemConfig[key] = updated;
        saveState();
      }
      items.push({ nama, qty, satuan, harga: inlineHarga, total: inlineHarga * qty, needsPrice: false });
      return;
    }

    const result = getHarga(nama, satuan);
    const displayNama = result.displayName || nama;
    if (result.needsPrice) {
      items.push({ nama: displayNama, qty, satuan, harga: 0, total: 0, needsPrice: true });
    } else {
      items.push({ nama: displayNama, qty, satuan, harga: result.harga, total: result.harga * qty, needsPrice: false });
    }
  });
  return items;
}

// ---- HARGA & SATUAN ----
// 100% generic: stores per-item config (harga + default satuan) learned from user.
// When user first uses an item, bot asks both price and satuan.
// Renamed from "hargaCustom" to "itemConfig" for clarity; backward compat preserved.

function getHarga(nama, satuan) {
  const key = normalizeKey(nama);
  // Check itemConfig (previously set by user — includes harga + default satuan)
  if (state.itemConfig[key]) {
    return { harga: state.itemConfig[key].harga, needsPrice: false, displayName: state.itemConfig[key].nama };
  }
  // Fallback: check old hargaCustom (backward compat with old saves)
  if (state.hargaCustom && state.hargaCustom[key]) {
    // Migrate to itemConfig
    state.itemConfig[key] = state.hargaCustom[key];
    delete state.hargaCustom[key];
    saveState();
    return { harga: state.itemConfig[key].harga, needsPrice: false, displayName: state.itemConfig[key].nama };
  }
  // Unknown item — need to ask user for price + satuan
  return { harga: 0, needsPrice: true, displayName: null };
}

function normalizeKey(s) { return s.toLowerCase().replace(/[^a-z ]/g, '').trim(); }
function capitalize(s) { return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
function rupiah(n) { return 'Rp' + Math.round(n).toLocaleString('id-ID'); }

// ---- STOK ----
function setStok(text) {
  const clean = text.replace(/^(stok|isi|tambah|restock)\s+(awal\s+)?/i, '');
  const items = parseItems(clean);
  if (!items.length) {
    addBotMsg('Format: <strong>"stok telur 10kg"</strong> atau <strong>"stok nasi 20"</strong>.<br>Bisa juga pake harga: <strong>"stok indomie 10 pcs 3500"</strong>');
    return;
  }

  // Detect missing-satuan items: user typed "stok indomie 10" with no satuan.
  // If any parsed item has fallback satuan='pcs' and we never set it that way,
  // ask the user. We detect by checking if the cleaned input string had NO
  // recognized satuan token AND NO inline harga token.
  const hasInlineHarga = /\d[\d.,]*\s*(rb|ribu|jt|juta)?$/i.test(clean);
  const knownSatuanTokens = /(kg|kilo|kilogram|kiloan|gram|gr|g|ons|liter|ltr|l|ml|galon|jerigen|pcs|pc|pieces|ps|butir|btr|biji|buah|bua|ekor|porsi|orsi|botol|btl|kaleng|klg|slop|slp|dus|box|bx|pack|pak|pck|bungkus|bks|bk|krat|krt|karung|krng|sak|peti|pti|bal|ikat|ikt|karton|ktn|roll|tabung|tbg|tangkai|tngk|helai|hlai|lembar|lbr|batang|btg|pohon|gelas|cup|mangkok|piring|sendok|sdk|pincuk|kotak)/i;
  const hasSatuanToken = knownSatuanTokens.test(clean);

  // Only prompt for missing satuan on the FIRST stock entry for an unknown item.
  // If the item is already known (has config), we accept whatever default it has.
  items.forEach(it => {
    const key = normalizeKey(it.nama);
    const existing = state.stok[key];
    if (!existing && !hasSatuanToken && !hasInlineHarga) {
      // Ask user which satuan they want
      state.pendingStokQuestion = { items, originalText: text };
      addBotMsg(
        `<strong>${esc(it.nama)}</strong> ${it.qty} apa nih? 📦<br><br>` +
        `Bilang aja satuannya, misal: <strong>"pcs"</strong>, <strong>"bungkus"</strong>, <strong>"dus"</strong>, <strong>"kg"</strong>, dll.`
      );
      return;
    }
  });

  // If we kicked off a prompt, stop here
  if (state.pendingStokQuestion) return;

  applyStokItems(items, text);
}

function applyStokItems(items, originalText) {
  state.pendingStokQuestion = null;
  let html = '✅ Stok tercatat:<br>';
  items.forEach(i => {
    const key = normalizeKey(i.nama);
    const existing = state.stok[key];
    if (existing && originalText.match(/^(isi|tambah|restock)/i)) {
      existing.qty += i.qty;
      html += `&nbsp;&nbsp;📦 ${esc(i.nama)}: ${existing.qty - i.qty}${existing.satuan} → <strong>${existing.qty}${existing.satuan}</strong><br>`;
    } else {
      state.stok[key] = { qty: i.qty, satuan: i.satuan, nama: i.nama };
      html += `&nbsp;&nbsp;📦 ${esc(i.nama)}: <strong>${i.qty}${i.satuan}</strong><br>`;
    }
  });
  saveState();
  addBotMsg(html);

  // AUTO-RESUME: if there's a pending stock warning, offer to continue the sale
  if (state.pendingStockWarning) {
    const first = state.pendingStockWarning.items[0];
    addBotMsg(
      `Stok udah dicatat! ✅<br>` +
      `Mau lanjut jual <strong>${esc(first.nama)} ${first.qty}${first.satuan}</strong>? Ketik <strong>"lanjut"</strong> ya 🙂`
    );
  }
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
  if (!text) return null;
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

// ---- FUZZY MATCH (Levenshtein-based) ----
// Used for typo tolerance: "rkok surya" → suggests "Rokok Surya" if it exists in itemConfig / stok.
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        m[i][j] = m[i - 1][j - 1];
      } else {
        m[i][j] = Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
      }
    }
  }
  return m[b.length][a.length];
}

// Find the best fuzzy match for `input` in the union of known item names
// (from itemConfig keys + stok keys). Returns the matched name or null.
function fuzzyFindItem(input) {
  const norm = normalizeKey(input);
  if (!norm || norm.length < 3) return null; // too short, skip
  // Build candidate list from itemConfig + stok + typoMap canonicals
  const candidates = new Set();
  Object.values(state.itemConfig || {}).forEach(c => { if (c && c.nama) candidates.add(c.nama); });
  Object.values(state.stok || {}).forEach(s => { if (s && s.nama) candidates.add(s.nama); });
  // Exact (normalized) match — no need to suggest
  for (const c of candidates) {
    if (normalizeKey(c) === norm) return null;
  }
  // Find closest by Levenshtein distance
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const cKey = normalizeKey(c);
    const d = levenshtein(norm, cKey);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  // Threshold: distance <= 2 for words of length >= 4, or <= 1 for short ones.
  // Avoid suggesting wildly different items.
  if (!best) return null;
  const lenRatio = norm.length / best.length;
  if (lenRatio < 0.5 || lenRatio > 2) return null;
  if (bestDist <= 1) return best;
  if (bestDist === 2 && norm.length >= 5) return best;
  return null;
}

// Try fuzzy match on a "jual ..." style input. If a likely typo is detected,
// ask the user for confirmation. Otherwise invoke callback(null) directly.
function tryFuzzyOnInput(text, callback) {
  // First, check the typoMap for an exact known typo → canonical mapping
  const cleaned = text.replace(/^(jual|catat|order|jualin|in|mau\s+jual|aku\s+mau\s+jual)\s+/i, '').trim();
  // Pull out the item name (everything before the first qty-like number)
  const m = cleaned.match(/^([a-zA-Z][a-zA-Z\s]+?)(?:\s+\d|$)/);
  const itemGuess = m ? m[1].trim() : cleaned.split(/\s+/)[0];
  if (!itemGuess || itemGuess.length < 3) {
    callback(null);
    return;
  }
  // First, check typoMap for known mapping
  const mapped = state.typoMap[normalizeKey(itemGuess)];
  if (mapped) {
    const canonical = Object.values(state.itemConfig).find(c => normalizeKey(c.nama) === mapped);
    if (canonical) {
      // Auto-correct silently and proceed
      const replaced = text.replace(new RegExp('^' + escapeRegex(itemGuess) + '\\b', 'i'), canonical.nama);
      callback(replaced);
      return;
    }
  }
  // Otherwise fuzzy search
  const suggestion = fuzzyFindItem(itemGuess);
  if (!suggestion) {
    callback(null);
    return;
  }
  // Ask for confirmation
  state.pendingFuzzy = { input: itemGuess, suggested: suggestion, callback };
  addBotMsg(
    `Maksudnya <strong>${esc(suggestion)}</strong>? 🤔<br>` +
    `Ketik <strong>"ya"</strong> kalo iya, atau <strong>"bukan"</strong> kalo salah.`
  );
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ---- KEMBALIAN (Change calculation) ----
function showKembalian(total, uang) {
  const selisih = uang - total;
  let html = `💰 <strong>Hitung Kembalian</strong><br><br>`;
  html += `💵 Total: <strong>${rupiah(total)}</strong><br>`;
  html += `💴 Uang pembeli: <strong>${rupiah(uang)}</strong><br>`;
  if (selisih === 0) {
    html += `✅ <strong>Uang pas!</strong> Nggak ada kembalian.`;
  } else if (selisih > 0) {
    html += `💸 <strong>Kembalian: ${rupiah(selisih)}</strong>`;
  } else {
    html += `⚠️ Uang kurang <strong>${rupiah(-selisih)}</strong>`;
  }
  addBotMsg(html);
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
  const total = state.transaksi.reduce((s, t) => s + t.total, 0);
  const pct = Math.round(total / num * 100);
  let html = `✅ Target hari ini: <strong>${rupiah(state.targetHarian)}</strong><br>Semangat jualannya! 🔥`;
  if (state.transaksi.length) {
    html += renderProgressBar(total, num, pct);
  }
  addBotMsg(html);
}

function showTarget() {
  const total = state.transaksi.reduce((s, t) => s + t.total, 0);
  if (state.targetHarian <= 0) {
    addBotMsg(`Belum ada target. Ketik <strong>"target 500rb"</strong> buat pasang target hari ini.<br><br>📊 Total hari ini: <strong>${rupiah(total)}</strong>`);
    return;
  }
  const pct = Math.min(999, Math.round(total / state.targetHarian * 100));
  const emoji = pct >= 100 ? '🎉 TARGET TERCAPAI!' : pct >= 70 ? '🔥 Hampir sampe!' : '💪 Gas terus!';
  addBotMsg(`🎯 <strong>Progress Target</strong>${renderProgressBar(total, state.targetHarian, pct)}<br><br>${emoji}`);
}

// ---- LAPORAN ----
function getTotalPengeluaran() {
  return state.pengeluaran.reduce((s, p) => s + (p.total || 0), 0);
}

function showLaporan() {
  const tx = state.transaksi;
  const total = tx.reduce((s, t) => s + t.total, 0);
  const totalPengeluaran = getTotalPengeluaran();
  const untung = total - totalPengeluaran;
  if (!tx.length && !state.pengeluaran.length) {
    addBotMsg('Belum ada transaksi atau pengeluaran hari ini.');
    return;
  }
  const itemCounts = {};
  tx.forEach(t => t.items.forEach(i => {
    if (!itemCounts[i.nama]) itemCounts[i.nama] = 0;
    itemCounts[i.nama] += i.qty;
  }));
  const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);

  let html = `📊 <strong>Laporan Hari Ini</strong><br><br>`;
  html += `💵 Omzet: <strong>${rupiah(total)}</strong><br>`;
  if (state.pengeluaran.length) {
    html += `💸 Pengeluaran: <strong>${rupiah(totalPengeluaran)}</strong><br>`;
    html += `💰 <strong>Untung Bersih: ${rupiah(untung)}</strong><br>`;
  }
  html += `📝 ${tx.length} transaksi<br>`;
  if (sorted.length) {
    html += `<br>🏆 <strong>Produk terlaris:</strong><br>`;
    sorted.forEach(([nama, qty], i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || '&nbsp;&nbsp;';
      html += `${medal} ${esc(nama)} — ${qty}<br>`;
    });
  }
  if (state.targetHarian > 0) {
    const pct = Math.min(999, Math.round(total / state.targetHarian * 100));
    html += renderProgressBar(total, state.targetHarian, pct);
  }
  addBotMsg(html);
}

function showLaporanMinggu() {
  addBotMsg('📊 Laporan mingguan belum tersedia di versi ini. Fitur ini coming soon ya~');
}

// ---- RIWAYAT ----
function showRiwayat() {
  const tx = state.transaksi;
  if (!tx.length) {
    addBotMsg('Belum ada transaksi hari ini');
    return;
  }
  let html = `📋 <strong>Riwayat Hari Ini</strong> (${tx.length})<br><br>`;
  // Sort by waktu ascending
  const sorted = [...tx].sort((a, b) => new Date(a.waktu) - new Date(b.waktu));
  sorted.forEach(t => {
    const time = new Date(t.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    html += `<div class="riwayat-item">`;
    html += `<div class="riwayat-id">#${esc(t.id)} · ${esc(time)}</div>`;
    t.items.forEach(i => {
      html += `<div class="riwayat-line">• ${esc(i.nama)} × ${i.qty} ${esc(i.satuan)} = <strong>${rupiah(i.total)}</strong></div>`;
    });
    html += `<div class="riwayat-total">Total: <strong>${rupiah(t.total)}</strong></div>`;
    html += `</div>`;
  });
  addBotMsg(html);
}

// ---- PENGELUARAN ----
function parsePengeluaran(text) {
  // Strip prefix: "beli", "belanja", "keluar", "pengeluaran"
  let clean = text.replace(/^(aku\s+)?(mau\s+)?(beli|belanja|keluar|pengeluaran)\s+/i, '').trim();
  if (!clean) {
    addBotMsg('Mau beli apa? Contoh: <strong>"beli minyak 20rb"</strong> atau <strong>"beli daging 50rb, minyak 15rb"</strong>');
    return;
  }
  // Split by comma — each part is "item harga"
  const parts = clean.split(/[,+&]\s*/).map(p => p.trim()).filter(Boolean);
  const items = [];
  let total = 0;
  let allOk = true;
  for (const part of parts) {
    // Match "telur 20rb" or "telur 20000" or "telur rp20.000"
    const m = part.match(/^(.+?)\s+(rp\.?\s*)?(\d[\d.,]*\s*(rb|ribu|jt|juta|k)?)\s*$/i);
    if (!m) { allOk = false; break; }
    const nama = capitalize(m[1].trim());
    const harga = parseRupiah(m[3]);
    if (!harga || harga <= 0) { allOk = false; break; }
    items.push({ nama, harga });
    total += harga;
  }
  if (!allOk || !items.length) {
    addBotMsg('Format: <strong>"beli minyak 20rb"</strong> atau <strong>"beli daging 50rb, minyak 15rb"</strong>');
    return;
  }
  // Show confirmation
  state.pendingPengeluaran = { items, total, waktu: new Date().toISOString() };
  saveState();
  let html = `Mau catat pengeluaran:<br><br>`;
  items.forEach(i => {
    html += `💸 <strong>${esc(i.nama)}</strong>: <strong>${rupiah(i.harga)}</strong><br>`;
  });
  html += `<br>💰 <strong>Total: ${rupiah(total)}</strong><br><br>Kalo bener, pencet <strong>"OK"</strong> ya`;
  const area = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = 'msg-row in';
  row.innerHTML = `<div class="msg bot">
    <div class="bot-name">🤖 WarungKita</div>
    ${html}
    <div class="msg-time">${jam()}</div>
    <div class="chat-btns">
      <button class="ok-btn" onclick="confirmPengeluaran(this)">OK ✅</button>
      <button class="koreksi-btn" onclick="koreksiPengeluaran(this)">✏️ Koreksi</button>
    </div>
  </div>`;
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

function handlePendingPengeluaranResponse(text) {
  // If user types something other than confirmation text, treat as a new command
  // (the buttons are the main path; this is a fallback)
  // For now, just clear and ask user to use buttons
  addBotMsg('Pencet tombol <strong>OK ✅</strong> atau <strong>✏️ Koreksi</strong> di pesan sebelumnya ya 🙂');
}

function confirmPengeluaran(btn) {
  btn.closest('.chat-btns').innerHTML = '<span style="color:#6fcf97;font-size:13px">✅ Tersimpan</span>';
  const p = state.pendingPengeluaran;
  if (!p) return;
  const id = 'P' + Date.now().toString(36).toUpperCase();
  state.pengeluaran.push({
    id,
    items: p.items,
    total: p.total,
    waktu: p.waktu,
    keterangan: p.items.map(i => `${i.nama} ${rupiah(i.harga)}`).join(', '),
  });
  state.pendingPengeluaran = null;
  saveState();
  const totalTx = state.transaksi.reduce((s, t) => s + t.total, 0);
  const untung = totalTx - getTotalPengeluaran();
  let html = `✅ <strong>Pengeluaran tersimpan!</strong> (ID: #${id})<br>💸 Total keluar: <strong>${rupiah(p.total)}</strong>`;
  if (totalTx > 0) {
    html += `<br>💰 Untung bersih hari ini: <strong>${rupiah(untung)}</strong>`;
  }
  addBotMsg(html);
}

function koreksiPengeluaran(btn) {
  btn.closest('.chat-btns').innerHTML = '<span style="color:#b0a89a;font-size:13px">✏️ Dibatalkan, ketik ulang ya</span>';
  state.pendingPengeluaran = null;
  saveState();
}

function showPengeluaranList() {
  const list = state.pengeluaran;
  if (!list.length) {
    addBotMsg('Belum ada pengeluaran hari ini.<br>Catet pake <strong>"beli [item] [harga]"</strong> ya 🙂');
    return;
  }
  const total = getTotalPengeluaran();
  let html = `💸 <strong>Pengeluaran Hari Ini</strong><br><br>`;
  list.forEach(p => {
    const time = new Date(p.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    html += `<div class="riwayat-item">`;
    html += `<div class="riwayat-id">#${esc(p.id)} · ${esc(time)}</div>`;
    p.items.forEach(i => {
      html += `<div class="riwayat-line">• ${esc(i.nama)} = <strong>${rupiah(i.harga)}</strong></div>`;
    });
    html += `<div class="riwayat-total">Total: <strong>${rupiah(p.total)}</strong></div>`;
    html += `</div>`;
  });
  html += `<br>💰 <strong>Total Pengeluaran: ${rupiah(total)}</strong>`;
  addBotMsg(html);
}

// ---- UTANG (Debt tracking) ----
// Records debt for a person, accumulates across multiple entries.
// state.utang[name] = { items: [{nama, qty, harga, satuan}], total, tanggal, lunas }
function addUtang(name, itemsText) {
  name = (name || '').toLowerCase().trim();
  if (!name) {
    addBotMsg('Format: <strong>"utang budi indomie 2 3500"</strong> (catat utang atas nama orang)');
    return;
  }
  // Parse the items — try the same parseItems() used for jual, since it now
  // understands "nama qty satuan harga" inline. If parseItems needs a price,
  // we'll fall back to a simpler "nama qty [harga]" parser.
  let items = parseItems(itemsText);
  // Filter out anything without a price — for utang we require a price
  const noPrice = items.find(i => !i.harga || i.harga <= 0);
  if (noPrice || !items.length) {
    addBotMsg(
      `Format: <strong>"utang ${esc(name)} [item] [qty] [harga]"</strong><br>` +
      `Contoh: <strong>"utang ${esc(name)} indomie 2 3500"</strong> atau <strong>"utang ${esc(name)} indomie 2 pcs 3500"</strong>`
    );
    return;
  }
  const totalBaru = items.reduce((s, i) => s + i.total, 0);
  if (!state.utang[name]) {
    state.utang[name] = { items: [], total: 0, tanggal: new Date().toLocaleDateString('id-ID'), lunas: false };
  }
  const entry = state.utang[name];
  if (entry.lunas) {
    // Reset if they were previously marked paid and incur new debt
    entry.lunas = false;
    entry.tanggal = new Date().toLocaleDateString('id-ID');
  }
  items.forEach(i => entry.items.push({ nama: i.nama, qty: i.qty, harga: i.harga, satuan: i.satuan }));
  entry.total += totalBaru;
  saveState();

  let html = `💳 Utang <strong>${esc(capitalize(name))}</strong> bertambah:<br><br>`;
  items.forEach(i => {
    html += `• ${esc(i.nama)} ${i.qty} ${esc(i.satuan)} × ${rupiah(i.harga)} = <strong>${rupiah(i.total)}</strong><br>`;
  });
  html += `<br>💰 <strong>Total utang ${esc(capitalize(name))}: ${rupiah(entry.total)}</strong>`;
  addBotMsg(html);
}

// Record utang from already-parsed items (used by confirmTx when "utang [name]" detected)
function recordUtang(name, items, total) {
  name = (name || '').toLowerCase().trim();
  if (!name || !items || !items.length) return;
  if (!state.utang) state.utang = {};
  if (!state.utang[name]) {
    state.utang[name] = { items: [], total: 0, tanggal: new Date().toLocaleDateString('id-ID'), lunas: false };
  }
  const entry = state.utang[name];
  if (entry.lunas) {
    entry.lunas = false;
    entry.tanggal = new Date().toLocaleDateString('id-ID');
  }
  items.forEach(i => entry.items.push({ nama: i.nama, qty: i.qty, harga: i.harga, satuan: i.satuan }));
  entry.total += total;
  saveState();
  addBotMsg(`💳 Tercatat utang <strong>${esc(capitalize(name))}</strong>: <strong>${rupiah(total)}</strong><br>Total utang: <strong>${rupiah(entry.total)}</strong>`);
}

function showUtangList() {
  const keys = Object.keys(state.utang || {});
  if (!keys.length) {
    addBotMsg('Belum ada catatan utang. Tambah: <strong>"utang budi indomie 2 3500"</strong>');
    return;
  }
  // Sort by total desc, hide "lunas" entries at the bottom or filter them
  const active = keys.filter(k => !state.utang[k].lunas);
  const lunas = keys.filter(k => state.utang[k].lunas);
  let html = `💳 <strong>Daftar Utang</strong><br><br>`;
  if (active.length) {
    const sorted = active.slice().sort((a, b) => state.utang[b].total - state.utang[a].total);
    sorted.forEach(k => {
      const e = state.utang[k];
      html += `<div class="riwayat-item">`;
      html += `<div class="riwayat-id">👤 <strong>${esc(capitalize(k))}</strong> · ${esc(e.tanggal)}</div>`;
      html += `<div class="riwayat-total">💰 Total: <strong>${rupiah(e.total)}</strong></div>`;
      html += `</div>`;
    });
  } else {
    html += `<em>Semua utang udah lunas 🎉</em><br><br>`;
  }
  if (lunas.length) {
    html += `<br>✅ <em>Sudah lunas: ${lunas.map(capitalize).map(esc).join(', ')}</em>`;
  }
  const total = active.reduce((s, k) => s + state.utang[k].total, 0);
  html += `<br>💰 <strong>Total utang aktif: ${rupiah(total)}</strong>`;
  addBotMsg(html);
}

function showUtangDetail(name) {
  name = (name || '').toLowerCase().trim();
  const e = state.utang[name];
  if (!e) {
    addBotMsg(`<strong>${esc(capitalize(name))}</strong> belum ada catatan utang. Tambah: <strong>"utang ${esc(name)} [item] [qty] [harga]"</strong>`);
    return;
  }
  let html = `💳 <strong>Utang ${esc(capitalize(name))}</strong> · ${esc(e.tanggal)}`;
  if (e.lunas) html += ` · ✅ LUNAS`;
  html += `<br><br>`;
  e.items.forEach(i => {
    html += `<div class="riwayat-line">• ${esc(i.nama)} ${i.qty} ${esc(i.satuan)} × ${rupiah(i.harga)} = <strong>${rupiah(i.qty * i.harga)}</strong></div>`;
  });
  html += `<br>💰 <strong>Total: ${rupiah(e.total)}</strong>`;
  if (!e.lunas) {
    html += `<br><br>💵 Bayar sebagian: <strong>"bayar utang ${esc(name)} [nominal]"</strong>`;
    html += `<br>✅ Lunaskan: <strong>"utang lunas ${esc(name)}"</strong>`;
  }
  addBotMsg(html);
}

function bayarUtang(name, amount) {
  name = (name || '').toLowerCase().trim();
  const e = state.utang[name];
  if (!e) {
    addBotMsg(`<strong>${esc(capitalize(name))}</strong> belum ada catatan utang.`);
    return;
  }
  if (e.lunas) {
    addBotMsg(`Utang <strong>${esc(capitalize(name))}</strong> udah lunas kok ✅`);
    return;
  }
  const bayar = Math.min(amount, e.total);
  e.total -= bayar;
  if (e.total <= 0) {
    e.total = 0;
    e.lunas = true;
  }
  saveState();
  if (e.lunas) {
    addBotMsg(`✅ <strong>${esc(capitalize(name))}</strong> udah LUNAS! 🎉<br>Catet pembayarannya juga ya 💪`);
  } else {
    addBotMsg(`💵 Bayar utang <strong>${esc(capitalize(name))}</strong>: <strong>${rupiah(bayar)}</strong><br>💰 Sisa: <strong>${rupiah(e.total)}</strong>`);
  }
}

function markUtangLunas(name) {
  name = (name || '').toLowerCase().trim();
  const e = state.utang[name];
  if (!e) {
    addBotMsg(`<strong>${esc(capitalize(name))}</strong> belum ada catatan utang.`);
    return;
  }
  if (e.lunas) {
    addBotMsg(`Utang <strong>${esc(capitalize(name))}</strong> udah lunas dari sebelumnya ✅`);
    return;
  }
  e.lunas = true;
  e.total = 0;
  saveState();
  addBotMsg(`✅ Utang <strong>${esc(capitalize(name))}</strong> ditandai <strong>LUNAS</strong> 🎉`);
}

function getTotalUtang() {
  if (!state.utang) return 0;
  return Object.values(state.utang)
    .filter(e => !e.lunas)
    .reduce((s, e) => s + e.total, 0);
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
  const totalPengeluaran = getTotalPengeluaran();
  const totalUtang = getTotalUtang();
  const untung = total - totalPengeluaran;
  const itemCounts = {};
  tx.forEach(t => t.items.forEach(i => {
    if (!itemCounts[i.nama]) itemCounts[i.nama] = 0;
    itemCounts[i.nama] += i.qty;
  }));
  const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);

  let html = '<div class="rekap-card">';
  html += `<div class="r-line"><span class="r-lbl">💵 Omzet</span><span class="r-val">${rupiah(total)}</span></div>`;
  if (state.pengeluaran.length) {
    html += `<div class="r-line"><span class="r-lbl">💸 Pengeluaran</span><span class="r-val">${rupiah(totalPengeluaran)}</span></div>`;
    html += `<div class="r-line r-untung"><span class="r-lbl">💰 Untung Bersih</span><span class="r-val">${rupiah(untung)}</span></div>`;
  }
  if (totalUtang > 0) {
    html += `<div class="r-line"><span class="r-lbl">💳 Utang Aktif</span><span class="r-val">${rupiah(totalUtang)}</span></div>`;
  }
  if (state.targetHarian > 0) {
    const pct = Math.min(999, Math.round(total / state.targetHarian * 100));
    html += `<div class="r-line"><span class="r-lbl">🎯 Target</span><span class="r-val">${rupiah(state.targetHarian)} (${pct}%)</span></div>`;
    html += renderProgressBar(total, state.targetHarian, pct);
  }
  html += `<div class="r-line"><span class="r-lbl">📝 Total Transaksi</span><span class="r-val">${tx.length} item</span></div>`;

  if (sorted.length) {
    html += '<div class="rekap-divider"></div>';
    html += '<div class="r-line"><span class="r-lbl"><strong>🏆 Produk:</strong></span><span class="r-val"></span></div>';
    sorted.forEach(([nama, qty]) => {
      // Find a satuan by looking up the most-recent tx that contained this item
      let satuan = 'porsi';
      for (let i = tx.length - 1; i >= 0; i--) {
        const it = tx[i].items.find(x => x.nama === nama);
        if (it) { satuan = it.satuan; break; }
      }
      html += `<div class="r-line"><span class="r-lbl">• ${esc(nama)}</span><span class="r-val">${qty} ${satuan}</span></div>`;
    });
  }

  const stokKeys = Object.keys(state.stok);
  if (stokKeys.length) {
    html += '<div class="rekap-divider"></div>';
    html += '<div class="r-line"><span class="r-lbl"><strong>📦 Sisa Stok:</strong></span><span class="r-val"></span></div>';
    stokKeys.forEach(k => {
      const s = state.stok[k];
      html += `<div class="r-line"><span class="r-lbl">• ${esc(s.nama)}</span><span class="r-val">${s.qty}${s.satuan}</span></div>`;
    });
  }
  html += '</div>';

  // Share buttons
  html += '<div class="rekap-share-row">';
  html += '<button class="modal-btn secondary" id="btnRekapCopy" style="flex:1;min-width:0">📋 Salin Laporan</button>';
  html += '<button class="modal-btn green" id="btnRekapWA" style="flex:1;min-width:0">🔗 Share WhatsApp</button>';
  html += '</div>';

  document.getElementById('rekapContent').innerHTML = html;
  document.getElementById('modalRekap').classList.add('active');

  // Bind share buttons (re-bind because innerHTML replaced them)
  document.getElementById('btnRekapCopy').onclick = copyRekapToClipboard;
  document.getElementById('btnRekapWA').onclick = shareRekapToWhatsApp;
}

// ---- EXPORT / SHARE LAPORAN ----
function buildRekapText() {
  const tx = state.transaksi;
  const total = tx.reduce((s, t) => s + t.total, 0);
  const totalPengeluaran = getTotalPengeluaran();
  const totalUtang = getTotalUtang();
  const untung = total - totalPengeluaran;
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  const itemCounts = {};
  const itemSatuan = {};
  tx.forEach(t => t.items.forEach(i => {
    if (!itemCounts[i.nama]) itemCounts[i.nama] = 0;
    itemCounts[i.nama] += i.qty;
    itemSatuan[i.nama] = i.satuan;
  }));
  const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);

  let txt = `📋 REKAP JUALAN - ${state.namaWarung}\n`;
  txt += `📅 ${dateStr}\n\n`;
  txt += `💵 Omzet: ${rupiah(total)}\n`;
  txt += `💸 Pengeluaran: ${rupiah(totalPengeluaran)}\n`;
  txt += `💰 Untung Bersih: ${rupiah(untung)}\n`;
  if (totalUtang > 0) {
    txt += `💳 Utang Aktif: ${rupiah(totalUtang)}\n`;
  }
  txt += `📝 ${tx.length} transaksi\n`;

  if (sorted.length) {
    txt += `\n🏆 Produk:\n`;
    sorted.forEach(([nama, qty]) => {
      txt += `• ${nama} — ${qty} ${itemSatuan[nama] || 'porsi'}\n`;
    });
  }

  const stokKeys = Object.keys(state.stok);
  if (stokKeys.length) {
    txt += `\n📦 Sisa Stok:\n`;
    stokKeys.forEach(k => {
      const s = state.stok[k];
      txt += `• ${s.nama}: ${s.qty}${s.satuan}\n`;
    });
  }

  txt += `\nDicatat oleh WarungKita 🏪`;
  return txt;
}

async function copyRekapToClipboard() {
  const txt = buildRekapText();
  const btn = document.getElementById('btnRekapCopy');
  const original = btn.innerHTML;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(txt);
    } else {
      // Fallback for non-secure context
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    btn.innerHTML = '✅ Tersalin!';
    setTimeout(() => { btn.innerHTML = original; }, 1800);
  } catch(e) {
    btn.innerHTML = '❌ Gagal salin';
    setTimeout(() => { btn.innerHTML = original; }, 1800);
  }
}

function shareRekapToWhatsApp() {
  const txt = buildRekapText();
  const url = 'https://wa.me/?text=' + encodeURIComponent(txt);
  window.open(url, '_blank', 'noopener');
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
    const pct = Math.min(999, Math.round(total / state.targetHarian * 100));
    html += renderProgressBar(total, state.targetHarian, pct);
  }
  addBotMsg(html);
}

// ---- HELP ----
function showHelp() {
  addBotMsg(`📖 <strong>Yang bisa aku bantu:</strong><br><br>
📝 <strong>"jual indomie 1 pcs 3500"</strong> — catat jualan (bisa langsung sama harga!)<br>
&nbsp;&nbsp;&nbsp;<em>atau "jual nasi goreng 3, es teh 2"</em><br>
💸 <strong>"beli minyak 20rb"</strong> — catat pengeluaran<br>
📦 <strong>"stok beras 10kg"</strong> — set stok awal<br>
📦 <strong>"stok indomie 10 pcs 3500"</strong> — stok sekalian catet harga<br>
📦 <strong>"stok"</strong> — cek stok sekarang<br>
🎯 <strong>"target 500rb"</strong> — pasang target harian<br>
🎯 <strong>"target"</strong> — cek progress<br>
💰 <strong>"bayar 35000 50000"</strong> — hitung kembalian<br>
&nbsp;&nbsp;&nbsp;<em>support: "bayar 35rb 50rb" atau abis transaksi tinggal sebut nominalnya</em><br>
💳 <strong>"utang budi indomie 2 3500"</strong> — catat utang atas nama orang<br>
&nbsp;&nbsp;&nbsp;<em>atau gabung: <strong>"jual rokok 1 pack utang budi"</strong> — jual + catat utang sekaligus</em><br>
💳 <strong>"utang budi"</strong> — liat detail utang satu orang<br>
💳 <strong>"utang"</strong> — liat daftar utang<br>
💵 <strong>"bayar utang budi 5000"</strong> — bayar sebagian<br>
✅ <strong>"utang lunas budi"</strong> — tandain udah lunas<br>
📊 <strong>"total hari ini"</strong> — laporan lengkap<br>
📋 <strong>"riwayat"</strong> — daftar transaksi hari ini<br>
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
