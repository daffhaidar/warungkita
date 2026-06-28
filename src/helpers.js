/**
 * WarungKita — helpers.js
 * Help text, modal helpers, init chat
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ---- HELP ----
function showHelp() {
  addBotMsg(`📖 <strong>Perintah:</strong><br><br>
📝 <strong>"jual soto 3"</strong> — catat jualan<br>
💸 <strong>"beli minyak 20rb"</strong> — catat pengeluaran<br>
📦 <strong>"stok soto 20 mangkok"</strong> — set stok<br>
🎯 <strong>"target 500rb"</strong> — pasang target<br>
💰 <strong>"bayar 35000 50000"</strong> — hitung kembalian<br>
💳 <strong>"utang budi soto 2 15000"</strong> — catat utang<br>
📊 <strong>"total"</strong> — laporan hari ini<br>
📋 <strong>"riwayat"</strong> — daftar transaksi<br>
🔒 <strong>"tutup"</strong> — tutup warung + rekap<br>
📖 <strong>"help"</strong> — menu ini`);
}

// ---- MODAL HELPERS ----
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ---- BACKUP / RESTORE (client-side, no backend) ----
// Protects a real warung's data: localStorage is wiped on cache-clear / new
// phone / reinstall. "backup" downloads a JSON snapshot; "restore" re-imports it.
function backupData() {
  try {
    const data = localStorage.getItem('warungkita_state') || '{}';
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warungkita-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addBotMsg(`✅ Backup terunduh: <strong>warungkita-backup-${date}.json</strong><br>Simpan di tempat aman (Google Drive / WhatsApp sendiri). Kalo ganti HP atau kehapus, ketik <strong>"restore"</strong> buat balikin semua data.`);
  } catch (e) {
    addBotMsg('❌ Gagal bikin backup. Coba lagi ya.');
  }
}

function restoreData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('format salah');
        }
        // Merge onto current state so missing fields keep their defaults.
        state = { ...state, ...parsed };
        saveState();
        addBotMsg('✅ Data berhasil dipulihkan! Memuat ulang aplikasi...');
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        addBotMsg('❌ File ga valid. Pastikan itu file backup dari WarungKita (warungkita-backup-*.json) ya.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

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
