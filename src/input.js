/**
 * WarungKita — input.js
 * Input handling: handleSend, processUserMsg, command parser, first-setup wizard
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

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
    addBotMsg('Warung lagi tutup. Ketik <strong>"buka"</strong> buat mulai lagi 🙂');
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
    renderQuickSell();
    addBotMsg(`Oke sip langsung mulai 🚀<br><span style="font-size:12px;color:#b0a89a">"jual soto 3" → "target 500rb" → "tutup"</span>`);
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
      renderQuickSell();
      let html = `✅ Stok awal tercatat:<br>`;
      items.forEach(i => {
        html += `&nbsp;&nbsp;📦 ${esc(i.nama)}: <strong>${i.qty}${i.satuan}</strong><br>`;
      });
      html += `<br>✅ Udah siap. Coba <strong>"jual ${esc(items[0].nama.toLowerCase())} 1"</strong> yuk 🙂`;
      addBotMsg(html);
      return;
    }
  }
  // Fallback: didn't parse as anything
  addBotMsg(`Belum ngerti 😅 Ketik: <strong>"stok soto 20 mangkok"</strong> atau <strong>"skip"</strong>`);
}

async function tryBackend(text) {
  // Backend removed (v3.5): the app runs fully on the local parser below.
  // Short-circuit so we don't fire dead /api/chat (which also triggers the dead
  // /api/init key fetch) on every single message — saves two failed round-trips
  // per message and removes the latency before the local fallback kicks in.
  return null;
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
  // Backend removed (v3.5): no-op. The warung name is persisted locally via
  // saveState() — there's no /api/setup endpoint to notify anymore.
  return;
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
      addBotMsg(`Total: <strong>${rupiah(state.pendingBayar.total)}</strong>. Bayar berapa? Sebut nominalnya, misal <strong>"50rb"</strong>`);
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
      addBotMsg(`Total: <strong>${rupiah(state.pendingBayar.total)}</strong>. Bayar berapa? Sebut nominalnya`);
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
    addBotMsg('Mau jual apa? 🙂 Contoh: <strong>"jual soto 3"</strong> atau <strong>"jual soto 2, es teh 3"</strong>');
    return;
  }

  // Help
  if (t === 'help' || t === 'bantuan' || t === '?') { showHelp(); return; }

  // Backup / Restore data (client-side, protects against localStorage wipe)
  if (t === 'backup' || t === 'cadangkan' || t === 'export') { backupData(); return; }
  if (t === 'restore' || t === 'pulihkan' || t === 'import') { restoreData(); return; }

  // Plain number — treat as target
  const maybeNum = parseRupiah(t);
  if (maybeNum && maybeNum > 0) {
    setTargetText(maybeNum);
    return;
  }

  // Default — random / unknown text
  addBotMsg(`Ga ngerti 😅 Coba:<br>• <strong>"jual soto 3 mangkok"</strong> — catat jualan<br>• <strong>"bayar 35000 50000"</strong> — hitung kembalian<br>Ketik <strong>"help"</strong> buat semua perintah`);
}

