/**
 * WarungKita — items.js
 * Item parsing, price/satuan config, stock management
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ---- ITEM PARSER ----
function parseItems(text) {
  const items = [];
  const parts = text.split(/[,+&]\s*/);
  
  parts.forEach(p => {
    p = p.trim();
    if (!p) return;

    const m = window.WarungConfig.ITEM_REGEX.exec(p);
    let nama, qty, satuan, inlineHarga;
    
    if (m && (m[1] || m[2])) {
      nama = window.WarungUtils.capitalize(m[1].trim());
      qty = parseFloat(m[2]);
      satuan = m[3] ? m[3].toLowerCase() : null;
      inlineHarga = m[4] ? window.WarungUtils.parseRupiah(m[4]) : null;
    } else {
      const simpleMatch = p.match(/^(.+)$/);
      if (!simpleMatch) return;
      nama = window.WarungUtils.capitalize(simpleMatch[1].trim());
      qty = 1;
      satuan = null;
      inlineHarga = null;
    }

    if (qty < 0 || qty === 0) {
      items.push({ nama, qty, satuan: satuan || 'pcs', harga: 0, total: 0, needsPrice: false, invalid: true });
      return;
    }

    const key = window.WarungUtils.normalizeKey(nama);
    const config = state.itemConfig[key];

    if (!satuan && config) {
      satuan = config.satuan;
    } else if (!satuan) {
      satuan = 'pcs';
    }

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
function getHarga(nama, satuan) {
  const key = window.WarungUtils.normalizeKey(nama);
  
  if (state.itemConfig[key]) {
    return { harga: state.itemConfig[key].harga, needsPrice: false, displayName: state.itemConfig[key].nama };
  }
  
  if (state.hargaCustom && state.hargaCustom[key]) {
    state.itemConfig[key] = state.hargaCustom[key];
    delete state.hargaCustom[key];
    saveState();
    return { harga: state.itemConfig[key].harga, needsPrice: false, displayName: state.itemConfig[key].nama };
  }
  
  return { harga: 0, needsPrice: true, displayName: null };
}

// ---- STOK ----
function setStok(text) {
  const clean = text.replace(/^(stok|isi|tambah|restock)\s+(awal\s+)?/i, '');
  const items = parseItems(clean);
  
  if (!items.length) {
    addBotMsg('Format: <strong>"stok telur 10kg"</strong> atau <strong>"stok nasi 20"</strong>.<br>Bisa juga pake harga: <strong>"stok indomie 10 pcs 3500"</strong>');
    return;
  }

  const hasInlineHarga = /\d[\d.,]*\s*(rb|ribu|jt|juta)?$/i.test(clean);
  const knownSatuanTokens = new RegExp(window.WarungConfig.SATUAN_PATTERN, 'i');
  const hasSatuanToken = knownSatuanTokens.test(clean);

  items.forEach(it => {
    const key = window.WarungUtils.normalizeKey(it.nama);
    const existing = state.stok[key];
    
    if (!existing && !hasSatuanToken && !hasInlineHarga) {
      state.pendingStokQuestion = { items, originalText: text };
      addBotMsg(`${window.WarungUtils.esc(it.nama)} ${it.qty} apa? 📦 Bilang satuannya: <strong>"pcs"</strong>, <strong>"bungkus"</strong>, atau <strong>"dus"</strong>`);
      return;
    }
  });

  if (state.pendingStokQuestion) return;
  applyStokItems(items, text);
}

function applyStokItems(items, originalText) {
  state.pendingStokQuestion = null;
  let html = '✅ Stok tercatat:<br>';
  
  items.forEach(i => {
    const key = window.WarungUtils.normalizeKey(i.nama);
    const existing = state.stok[key];
    
    if (existing && originalText.match(/^(isi|tambah|restock)/i)) {
      existing.qty += i.qty;
      html += `&nbsp;&nbsp;📦 ${window.WarungUtils.esc(i.nama)}: ${existing.qty - i.qty}${existing.satuan} → <strong>${existing.qty}${existing.satuan}</strong><br>`;
    } else {
      state.stok[key] = { qty: i.qty, satuan: i.satuan, nama: i.nama };
      html += `&nbsp;&nbsp;📦 ${window.WarungUtils.esc(i.nama)}: <strong>${i.qty}${i.satuan}</strong><br>`;
    }
  });
  
  saveState();
  addBotMsg(html);
  renderQuickSell();

  if (state.pendingStockWarning) {
    const first = state.pendingStockWarning.items[0];
    addBotMsg(
      `Stok udah dicatat ✅ Mau lanjut jual <strong>${window.WarungUtils.esc(first.nama)} ${first.qty}${first.satuan}</strong>? Ketik <strong>"lanjut"</strong>`
    );
  }
}

function showStok() {
  const keys = Object.keys(state.stok);
  if (!keys.length) {
    addBotMsg('Belum ada stok. Ketik <strong>"stok soto 20 mangkok"</strong> buat mulai');
    return;
  }
  
  let html = '📦 <strong>Stok Sekarang:</strong><br>';
  keys.forEach(k => {
    const s = state.stok[k];
    const alert = s.qty <= 2 ? ' 🚨 <em>menipis!</em>' : '';
    html += `&nbsp;&nbsp;${window.WarungUtils.esc(s.nama)}: <strong>${s.qty}${s.satuan}</strong>${alert}<br>`;
  });
  addBotMsg(html);
}

// Export
window.WarungItems = {
  parseItems,
  getHarga,
  setStok,
  applyStokItems,
  showStok,
};