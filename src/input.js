/**
 * WarungKita — input.js
 * Input handling: handleSend, processUserMsg, pending state handlers
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

  // First-time setup wizard
  if (!state.setupDone) {
    handleFirstSetup(text);
    return;
  }

  // Pending state handlers (priority order)
  if (state.pendingPrice) {
    handlePendingPriceResponse(text);
    return;
  }
  
  if (state.pendingPengeluaran) {
    handlePendingPengeluaranResponse(text);
    return;
  }
  
  if (state.pendingStokQuestion) {
    handlePendingStokSatuan(text);
    return;
  }
  
  if (state.pendingBayar) {
    handlePendingBayarResponse(text);
    return;
  }
  
  if (state.pendingFuzzy) {
    handlePendingFuzzyResponse(text);
    return;
  }
  
  if (state.pendingStockWarning) {
    handlePendingStockWarningResponse(text);
    return;
  }
  
  if (state.pendingUtangAskName) {
    handlePendingUtangNameResponse(text);
    return;
  }

  // Normal command processing
  window.WarungCommands.processCommand(text);
}

// ---- PENDING STATE HANDLERS ----
function handlePendingStockWarningResponse(text) {
  const t = text.toLowerCase().trim();
  
  if (['lanjut', 'gas', 'tetep', 'ya', 'y', 'skip'].includes(t)) {
    const saved = state.pendingStockWarning;
    state.pendingStockWarning = null;
    finalizeTransaksi(saved.items);
  } else if (t.startsWith('stok ') || t.startsWith('isi ')) {
    window.WarungCommands.processCommand(text);
  } else {
    addBotMsg('Ketik <strong>"stok [nama] [jumlah]"</strong> buat catet stok dulu, atau <strong>"lanjut"</strong> kalo tetep mau jual tanpa stok');
  }
}

function handlePendingUtangNameResponse(text) {
  const name = window.WarungUtils.capitalize(text.trim());
  if (!name || name.length > 50) {
    addBotMsg('Ketik nama orangnya aja, misal: <strong>"Budi"</strong> atau <strong>"Mami Budi"</strong>');
    return;
  }
  const saved = state.pendingUtangAskName;
  state.pendingUtangAskName = null;
  saveState();
  parseTransaksi(`utang ${name} ${saved.itemsText}`);
}

function handlePendingPriceResponse(text) {
  const t = text.toLowerCase().trim();
  const pending = state.pendingPrice;
  if (!pending) return;

  // If user typed a new command instead of a price
  if (window.WarungConfig.COMMAND_KEYWORDS.test(t) || (t.includes('utang') && /\d/.test(t))) {
    state.pendingPrice = null;
    saveState();
    window.WarungCommands.processCommand(text);
    return;
  }

  // Parse price and satuan
  const m1 = t.match(/^(\d+(?:[.,]\d+)*)\s*(rb|ribu|jt|juta)?\s*(?:\/|per)\s*(\w+)$/i);
  const m2 = t.match(/^(\d+(?:[.,]\d+)*)\s*(rb|ribu|jt|juta)?$/i);

  let priceNum, satuan;
  if (m1) {
    priceNum = parseFloat(m1[1].replace(/[.,]/g, m1[1].includes(',') ? '.' : ''));
    const mult = (m1[2] || '').toLowerCase();
    if (mult === 'rb' || mult === 'ribu') priceNum *= 1000;
    else if (mult === 'jt' || mult === 'juta') priceNum *= 1000000;
    satuan = m1[3].toLowerCase();
    satuan = window.WarungConfig.SATUAN_MAP[satuan] || satuan;
  } else if (m2) {
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

  // Save to itemConfig
  const key = window.WarungUtils.normalizeKey(pending.pending.nama);
  state.itemConfig[key] = { harga: Math.round(priceNum), satuan, nama: pending.pending.nama };

  // Update the pending item
  const idx = pending.fullItems.findIndex(i => window.WarungUtils.normalizeKey(i.nama) === key);
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
    addBotMsg(`Oke ✅ ${window.WarungUtils.esc(pending.pending.nama)} = ${window.WarungUtils.rupiah(Math.round(priceNum))}/${window.WarungUtils.esc(satuan)}. Harga <strong>${window.WarungUtils.esc(stillNeeds.nama)}</strong> per ${window.WarungUtils.esc(stillNeeds.satuan)}?`);
    return;
  }

  state.pendingPrice = null;
  saveState();
  finalizeTransaksi(pending.fullItems, pending.utangName);
}

function handlePendingStokSatuan(text) {
  const pending = state.pendingStokQuestion;
  if (!pending) return;
  
  const cleaned = text.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned || cleaned.length > 16) {
    addBotMsg('Hmm belum ngerti satuannya 😅 Coba <strong>"pcs"</strong>, <strong>"bungkus"</strong>, atau <strong>"dus"</strong>');
    return;
  }
  
  const updatedItems = pending.items.map(it => ({ ...it, satuan: cleaned }));
  state.pendingStokQuestion = null;
  applyStokItems(updatedItems, pending.originalText);
}

function handlePendingBayarResponse(text) {
  const t = text.trim();
  const m = t.match(/^(?:bayar\s+)?(\d[\d.,]*\s*(?:rb|ribu|jt|juta)?)$/i);
  if (!m) {
    addBotMsg('Format: tinggal sebut nominalnya aja, misal <strong>"50000"</strong> atau <strong>"50rb"</strong>');
    return;
  }
  const num = window.WarungUtils.parseRupiah(m[1]);
  if (!num || num <= 0) {
    addBotMsg('Nominalnya belum valid 😅 Coba lagi ya');
    return;
  }
  window.WarungUtils.showKembalian(state.pendingBayar.total, num);
  state.pendingBayar = null;
}

function handlePendingFuzzyResponse(text) {
  const pending = state.pendingFuzzy;
  if (!pending) return;
  
  const t = text.toLowerCase().trim();
  state.pendingFuzzy = null;
  
  if (['ya', 'y', 'iya', 'betul', 'bener', 'correct'].includes(t)) {
    state.typoMap[window.WarungUtils.normalizeKey(pending.input)] = window.WarungUtils.normalizeKey(pending.suggested);
    saveState();
    pending.callback(pending.suggested);
  } else if (['bukan', 'no', 'n', 'salah', 'engga', 'enggak'].includes(t)) {
    addBotMsg('Oke sip, aku pake sesuai ketikan kamu ya 🙂');
    pending.callback(null);
  } else {
    addBotMsg('Ketik <strong>"ya"</strong> kalo bener, atau <strong>"bukan"</strong> kalo salah ya');
    state.pendingFuzzy = pending;
  }
}

// ---- FIRST-SETUP WIZARD ----
function handleFirstSetup(text) {
  const t = text.toLowerCase().trim();
  
  if (['skip', 'lanjut', 'ga', 'gak', 'enggak', 'nanti'].includes(t)) {
    state.setupDone = true;
    saveState();
    setQuickActionsVisible(true);
    renderQuickSell();
    addBotMsg(`Oke sip langsung mulai 🚀<br><span style="font-size:12px;color:#b0a89a">"jual soto 3" → "target 500rb" → "tutup"</span>`);
    return;
  }
  
  if (t.match(/^(stok|isi|tambah|restock)\s+/) || t.match(/\d/)) {
    const wasStokCmd = t.match(/^(stok|isi|tambah|restock)\s+/);
    const clean = wasStokCmd ? t.replace(/^(stok|isi|tambah|restock)\s+/, '') : t;
    const items = parseItems(clean);
    
    if (items.length) {
      items.forEach(i => {
        const key = window.WarungUtils.normalizeKey(i.nama);
        state.stok[key] = { qty: i.qty, satuan: i.satuan, nama: i.nama };
      });
      state.setupDone = true;
      saveState();
      setQuickActionsVisible(true);
      renderQuickSell();
      
      let html = `✅ Stok awal tercatat:<br>`;
      items.forEach(i => {
        html += `&nbsp;&nbsp;📦 ${window.WarungUtils.esc(i.nama)}: <strong>${i.qty}${i.satuan}</strong><br>`;
      });
      html += `<br>✅ Udah siap. Coba <strong>"jual ${window.WarungUtils.esc(items[0].nama.toLowerCase())} 1"</strong> yuk 🙂`;
      addBotMsg(html);
      return;
    }
  }
  
  addBotMsg(`Belum ngerti 😅 Ketik: <strong>"stok soto 20 mangkok"</strong> atau <strong>"skip"</strong>`);
}

// ---- BACKEND STUBS (removed v3.5) ----
async function tryBackend(text) {
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
  showTutupModal();
}

async function setupWarungAPI(name) {
  return;
}

// Export
window.WarungInput = {
  handleSend,
  processUserMsg,
  handleFirstSetup,
  handlePendingStockWarningResponse,
  handlePendingUtangNameResponse,
  handlePendingPriceResponse,
  handlePendingStokSatuan,
  handlePendingBayarResponse,
  handlePendingFuzzyResponse,
};