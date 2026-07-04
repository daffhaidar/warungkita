/**
 * WarungKita — commands.js
 * Command router and handlers (broken down from 350-line processCommand)
 * Part of modular refactor (v3.5)
 */

// ---- COMMAND ROUTER ----
function processCommand(text) {
  const t = text.toLowerCase().trim();
  const patterns = window.WarungConfig.COMMAND_PATTERNS;

  // Reject negative/zero quantities early
  if (t.match(/^(jual|catat|order)\s+/) || t.match(/^(jual|catat|order|in)\s*$/)) {
    // Handled by parseTransaksi
  }

  // Buka warung
  if (patterns.buka.test(t)) { bukaWarung(); return; }

  // Tutup
  if (patterns.tutup.test(t)) { showTutupModal(); return; }

  // Target
  if (patterns.target.test(t)) { 
    if (t === 'target') { showTarget(); return; }
    setTarget(t.replace('target', '').trim()); 
    return; 
  }

  // Stok
  if (patterns.stok.test(t)) {
    if (t === 'stok') { showStok(); return; }
    setStok(t);
    return;
  }

  // Laporan / total
  if (patterns.laporan.test(t)) { showLaporan(); return; }
  if (patterns.laporanMinggu.test(t)) { showLaporanMinggu(); return; }

  // Riwayat
  if (patterns.riwayat.test(t)) { showRiwayat(); return; }

  // Pengeluaran / keluar
  if (patterns.pengeluaran.test(t)) {
    if (t === 'pengeluaran' || t === 'keluar' || t === 'laporan keluar') {
      showPengeluaranList();
      return;
    }
    parsePengeluaran(t);
    return;
  }

  // Blacklist
  if (patterns.blacklist.test(t)) { tambahBlacklist(t); return; }
  if (patterns.cekBlacklist.test(t)) { cekBlacklist(t); return; }

  // Kembalian / Bayar
  if (patterns.kembalian.test(t)) {
    handleKembalianCommand();
    return;
  }
  
  if (patterns.bayar.test(t)) {
    handleBayarCommand(t);
    return;
  }

  // Utang
  if (window.WarungUtangCommands.handleUtangCommand(t)) { return; }

  // "[name] utang [items]" — Pattern 2
  if (t.includes('utang') && /\d/.test(t) && !t.match(/^(jual|catat|order|beli|stok|target|bayar|help|buka|tutup)\b/)) {
    tryFuzzyOnInput(t, (corrected) => {
      parseTransaksi(corrected !== null ? corrected : t);
    });
    return;
  }

  // Jual (transaksi)
  if (
    patterns.jual.test(t) ||
    patterns.jualLoose.test(t) ||
    t.match(/^(aku\s+)?(mau\s+)?(jual|catat|order|jualin)\s+/)
  ) {
    tryFuzzyOnInput(t, (corrected) => {
      parseTransaksi(corrected !== null ? corrected : t);
    });
    return;
  }

  // "jual" alone
  if (t === 'jual' || t === 'jual dong' || t === 'catat') {
    addBotMsg('Mau jual apa? 🙂 Contoh: <strong>"jual soto 3"</strong> atau <strong>"jual soto 2, es teh 3"</strong>');
    return;
  }

  // Help
  if (patterns.help.test(t)) { showHelp(); return; }

  // Backup / Restore
  if (patterns.backup.test(t)) { backupData(); return; }
  if (patterns.restore.test(t)) { restoreData(); return; }

  // Plain number — treat as target
  const maybeNum = window.WarungUtils.parseRupiah(t);
  if (maybeNum && maybeNum > 0) {
    setTargetText(maybeNum);
    return;
  }

  // Default — unknown text
  addBotMsg(`Ga ngerti 😅 Coba:<br>• <strong>"jual soto 3 mangkok"</strong> — catat jualan<br>• <strong>"bayar 35000 50000"</strong> — hitung kembalian<br>Ketik <strong>"help"</strong> buat semua perintah`);
}

// ---- KEMBALIAN HANDLER ----
function handleKembalianCommand() {
  if (state.pendingBayar && state.pendingBayar.total > 0) {
    addBotMsg(`Total: <strong>${window.WarungUtils.rupiah(state.pendingBayar.total)}</strong>. Bayar berapa? Sebut nominalnya, misal <strong>"50rb"</strong>`);
  } else {
    addBotMsg('Belum ada transaksi terakhir. Coba <strong>"bayar [total] [uang]"</strong>, misal: <strong>"bayar 35000 50000"</strong>');
  }
}

// ---- BAYAR HANDLER ----
function handleBayarCommand(text) {
  const patterns = window.WarungConfig.COMMAND_PATTERNS;
  const m = patterns.bayar.exec(text);
  
  if (!m) {
    // "bayar" alone
    if (state.pendingBayar && state.pendingBayar.total > 0) {
      addBotMsg(`Total: <strong>${window.WarungUtils.rupiah(state.pendingBayar.total)}</strong>. Bayar berapa? Sebut nominalnya`);
    } else {
      addBotMsg('Format: <strong>"bayar [total] [uang]"</strong><br>Contoh: <strong>"bayar 35000 50000"</strong> → kembalian Rp15.000');
    }
    return;
  }
  
  const total = m[1] ? window.WarungUtils.parseRupiah(m[1]) : null;
  const uang = m[2] ? window.WarungUtils.parseRupiah(m[2]) : null;
  
  if (m[1] && (!total || !uang || total <= 0 || uang <= 0)) {
    addBotMsg('Format: <strong>"bayar 35000 50000"</strong> (total dulu, baru uang pembayaran)');
    return;
  }
  
  if (total && uang) {
    window.WarungUtils.showKembalian(total, uang);
  }
}

// Export
window.WarungCommands = {
  processCommand,
  handleKembalianCommand,
  handleBayarCommand,
};