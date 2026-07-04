/**
 * WarungKita — transactions.js
 * Transaction recording: parseTransaksi, finalizeTransaksi, progress bar
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ---- TRANSAKSI ----
function parseTransaksi(text) {
  // Strip common prefixes
  let clean = text
    .replace(/^(aku\s+)?(mau\s+)?(jual|catat|order|jualin|in|masukin|tambahin)\s+/i, '')
    .replace(/\s+(dong|ya|yaa|woi)$/i, '')
    .trim();

  // Detect and parse utang pattern
  let utangName = null;
  const utangPattern = window.WarungUtangCommands.parseUtangPattern(clean);
  
  if (utangPattern) {
    if (utangPattern.type === 'ask_name') {
      state.pendingUtangAskName = { itemsText: utangPattern.itemsText };
      addBotMsg('Utang atas nama siapa? 🙂<br>Ketik nama orangnya, misal: <strong>"Budi"</strong> atau <strong>"si Jamal"</strong>');
      return;
    }
    
    utangName = utangPattern.name;
    clean = utangPattern.itemsText;
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

  // Validate quantities
  const bad = items.find(i => !(i.qty > 0));
  if (bad) {
    addBotMsg(`Jumlahnya gak valid nih 😅 Coba angka yang bener ya, contoh: <strong>"jual nasi goreng 3"</strong>`);
    return;
  }

  // Check if any item needs price
  const needPrice = items.find(i => i.needsPrice);
  if (needPrice) {
    askForPrice(needPrice, items, utangName);
    return;
  }

  // Check stock availability
  const missingStok = items.filter(i => {
    const key = window.WarungUtils.normalizeKey(i.nama);
    return state.stok[key] === undefined || state.stok[key] === null;
  });
  
  if (missingStok.length > 0) {
    window.WarungUtils.setPendingState('pendingStockWarning', {
      items: items,
      missing: missingStok,
    });
    
    let warnHtml = '⚠️ Item belum tercatat di stok:<br><br>';
    missingStok.forEach(i => {
      warnHtml += `❓ <strong>${window.WarungUtils.esc(i.nama)}</strong> — ga ada di penyimpanan<br>`;
    });
    warnHtml += `<br>Ketik <strong>"stok ${window.WarungUtils.esc(missingStok[0].nama.toLowerCase())} [jumlah]"</strong> atau <strong>"lanjut"</strong>`;
    addBotMsg(warnHtml);
    return;
  }

  const total = items.reduce((s, i) => s + i.total, 0);
  state.pendingTx = { items, total, waktu: new Date().toISOString(), utangName };
  saveState();

  renderTransactionConfirmation(items, total);
}

function renderTransactionConfirmation(items, total) {
  let html = 'Mau catat:<br><br>';
  items.forEach(i => {
    html += `✅ <strong>${window.WarungUtils.esc(i.nama)}</strong>: ${i.qty} ${i.satuan} × ${window.WarungUtils.rupiah(i.harga)} = <strong>${window.WarungUtils.rupiah(i.total)}</strong><br>`;
  });

  items.forEach(i => {
    const key = window.WarungUtils.normalizeKey(i.nama);
    if (state.stok[key]) {
      const sisa = Math.max(0, state.stok[key].qty - i.qty);
      html += `<br>📦 Stok ${window.WarungUtils.esc(i.nama)}: ${state.stok[key].qty}${state.stok[key].satuan} → ${sisa}${state.stok[key].satuan}`;
    }
  });

  html += '<br><br>OK? 👇';

  const area = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = 'msg-row in';
  row.innerHTML = `<div class="msg bot">
    <div class="bot-name">🤖 WarungKita</div>
    ${html}
    <div class="msg-time">${window.WarungUtils.jam()}</div>
    <div class="chat-btns">
      <button class="ok-btn" data-action="confirm-tx">OK ✅</button>
      <button class="koreksi-btn" data-action="koreksi-tx">✏️ Koreksi</button>
    </div>
  </div>`;
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

function askForPrice(pendingItem, fullItems, utangName) {
  window.WarungUtils.setPendingState('pendingPrice', {
    pending: pendingItem,
    fullItems: fullItems,
    utangName: utangName || null,
  });
  
  const contohSatuan = pendingItem.satuan && pendingItem.satuan !== 'pcs' ? pendingItem.satuan : 'pcs';
  addBotMsg(
    `💰 Harga <strong>${window.WarungUtils.esc(pendingItem.nama)}</strong> per apa?<br>` +
    `Contoh: <strong>"15000 per kg"</strong>, <strong>"5000/butir"</strong>, atau langsung <strong>"15000"</strong>`
  );
}

function finalizeTransaksi(items, utangName) {
  const total = items.reduce((s, i) => s + i.total, 0);
  state.pendingTx = { items, total, waktu: new Date().toISOString(), utangName: utangName || null };
  saveState();
  renderTransactionConfirmation(items, total);
}

function confirmTx(btn) {
  btn.closest('.chat-btns').innerHTML = '<span style="color:#6fcf97;font-size:13px">✅ Dikonfirmasi</span>';
  const tx = state.pendingTx;
  if (!tx) return;

  // Save transaction
  const id = 'T' + Date.now().toString(36).toUpperCase();
  state.transaksi.push({ id, ...tx });

  // Update stock
  tx.items.forEach(i => {
    const key = window.WarungUtils.normalizeKey(i.nama);
    if (state.stok[key]) {
      state.stok[key].qty = Math.max(0, state.stok[key].qty - i.qty);
    }
  });

  state.pendingTx = null;
  state.pendingBayar = { total: tx.total };
  saveState();

  // Record debt if applicable
  if (tx.utangName) {
    recordUtang(tx.utangName, tx.items, tx.total);
  }

  renderQuickSell();

  const totalHariIni = state.transaksi.reduce((s, t) => s + t.total, 0);
  let html = `✅ <strong>Tersimpan!</strong> (ID: #${id})<br>📊 Total hari ini: <strong>${window.WarungUtils.rupiah(totalHariIni)}</strong>`;
  if (state.targetHarian > 0) {
    html += window.WarungUtils.renderProgressBar(totalHariIni, state.targetHarian, Math.min(999, Math.round(totalHariIni / state.targetHarian * 100)));
  }
  addBotMsg(html);

  if (tx.total > 0) {
    addBotMsg(`💰 Pembeli bayar berapa? Sebut nominalnya, misal <strong>"50rb"</strong>, atau ketik <strong>"bayar"</strong> 🙂`);
  }
}

function koreksiTx(btn) {
  btn.closest('.chat-btns').innerHTML = '<span style="color:#b0a89a;font-size:13px">✏️ Dibatalkan, ketik ulang ya</span>';
  state.pendingTx = null;
  saveState();
}

// Export
window.WarungTransactions = {
  parseTransaksi,
  finalizeTransaksi,
  confirmTx,
  koreksiTx,
  askForPrice,
};