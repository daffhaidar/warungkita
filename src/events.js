/**
 * WarungKita — events.js
 * Event bindings, DOMContentLoaded, quick-sell setup
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

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
  // Delegated click handler for dynamically-rendered buttons (replaces inline
  // onclick= so we can drop 'unsafe-inline' from the script-src CSP). One
  // listener on chatArea covers tx/pengeluaran confirm+koreksi and quick-sell;
  // modal close buttons live outside chatArea so bind at document level.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'confirm-tx':            confirmTx(btn); break;
      case 'koreksi-tx':            koreksiTx(btn); break;
      case 'confirm-pengeluaran':   confirmPengeluaran(btn); break;
      case 'koreksi-pengeluaran':   koreksiPengeluaran(btn); break;
      case 'quick-sell':            quickSell(btn.dataset.nama); break;
      case 'close-modal':           closeModal(btn.dataset.modal); break;
      case 'promo-copy':            copyPromoToClipboard(); break;
      case 'promo-share':           sharePromoToWhatsApp(); break;
    }
  });
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
    addBotMsg(`Haloo! Aku bantu catat jualan <strong>${esc(nama)}</strong>. Stok dulu? <em>"stok soto 20 mangkok"</em> — atau <strong>"skip"</strong>`);
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
      if (cmd === 'tutup') { showTutupModal(); return; }
      if (cmd === 'promosi') { showPromosi(); return; }
      if (cmd === 'backup') { backupData(); return; }
      if (cmd === 'whatsapp') { sendWhatsAppReport(); return; }
      if (cmd === 'pdf') { exportToPDF(); return; }
      if (cmd === 'jual') {
        document.getElementById('chatInput').placeholder = 'Ketik: "jual soto 3"';
        document.getElementById('chatInput').focus();
        return;
      }
      const map = {
        stok: 'stok',
        laporan: 'total hari ini',
        utang: 'utang',
      };
      processUserMsg(map[cmd] || cmd);
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

// ---- QUICK-SELL BUTTONS ----
// Render quick-sell buttons from stok items
function renderQuickSell() {
  const qs = document.getElementById('quickSell');
  if (!qs) return;
  const keys = Object.keys(state.stok);
  if (!keys.length || !state.buka) {
    qs.style.display = 'none';
    return;
  }
  let html = '';
  keys.forEach(k => {
    const s = state.stok[k];
    const satuanEmoji = s.satuan === 'mangkok' ? '🍜' : s.satuan === 'kg' ? '⚖️' : s.satuan === 'gelas' ? '🥤' : '📦';
    html += `<button class="qs-btn" data-action="quick-sell" data-nama="${esc(s.nama)}">${satuanEmoji} ${esc(s.nama)}</button>`;
  });
  qs.innerHTML = html;
  qs.style.display = 'flex';
}

function quickSell(nama) {
  const input = document.getElementById('chatInput');
  input.value = `jual ${nama.toLowerCase()} `;
  input.focus();
}

function showChat() {
  document.getElementById('onboarding').classList.remove('active');
  document.getElementById('setup').classList.remove('active');
  document.getElementById('main-chat').classList.add('active');
  document.getElementById('displayNama').textContent = state.namaWarung;
  document.getElementById('chatInput').focus();
  renderQuickSell();
}

