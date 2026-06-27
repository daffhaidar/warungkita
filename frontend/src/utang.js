/**
 * WarungKita — utang.js
 * Debt tracking, blacklist
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

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

