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
