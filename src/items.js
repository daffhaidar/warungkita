/**
 * WarungKita — items.js
 * Item parsing, price/satuan config, stock management
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

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
      addBotMsg(`${esc(it.nama)} ${it.qty} apa? 📦 Bilang satuannya: <strong>"pcs"</strong>, <strong>"bungkus"</strong>, <strong>"kg"</strong>...`);
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
  renderQuickSell();

  // AUTO-RESUME: if there's a pending stock warning, offer to continue the sale
  if (state.pendingStockWarning) {
    const first = state.pendingStockWarning.items[0];
    addBotMsg(
      `Stok udah dicatat ✅ Mau lanjut jual <strong>${esc(first.nama)} ${first.qty}${first.satuan}</strong>? Ketik <strong>"lanjut"</strong>`
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
    html += `&nbsp;&nbsp;${esc(s.nama)}: <strong>${s.qty}${s.satuan}</strong>${alert}<br>`;
  });
  addBotMsg(html);
}

