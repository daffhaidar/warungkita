/**
 * WarungKita — pengeluaran.js
 * Expense tracking and confirmation
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ---- PENGELUARAN ----
function parsePengeluaran(text) {
  // Strip prefix: "beli", "belanja", "keluar", "pengeluaran"
  let clean = text.replace(/^(aku\s+)?(mau\s+)?(beli|belanja|keluar|pengeluaran)\s+/i, '').trim();
  if (!clean) {
    addBotMsg('Mau beli apa? Contoh: <strong>"beli minyak 20rb"</strong> atau <strong>"beli daging 50rb, minyak 15rb"</strong>');
    return;
  }
  // Split by comma — each part is "item harga"
  const parts = clean.split(/[,+&]\s*/).map(p => p.trim()).filter(Boolean);
  const items = [];
  let total = 0;
  let allOk = true;
  for (const part of parts) {
    // Match "telur 20rb" or "telur 20000" or "telur rp20.000"
    const m = part.match(/^(.+?)\s+(rp\.?\s*)?(\d[\d.,]*\s*(rb|ribu|jt|juta|k)?)\s*$/i);
    if (!m) { allOk = false; break; }
    const nama = capitalize(m[1].trim());
    const harga = parseRupiah(m[3]);
    if (!harga || harga <= 0) { allOk = false; break; }
    items.push({ nama, harga });
    total += harga;
  }
  if (!allOk || !items.length) {
    addBotMsg('Format: <strong>"beli minyak 20rb"</strong> atau <strong>"beli daging 50rb, minyak 15rb"</strong>');
    return;
  }
  // Show confirmation
  state.pendingPengeluaran = { items, total, waktu: new Date().toISOString() };
  saveState();
  let html = `Mau catat pengeluaran:<br><br>`;
  items.forEach(i => {
    html += `💸 <strong>${esc(i.nama)}</strong>: <strong>${rupiah(i.harga)}</strong><br>`;
  });
  html += `<br>💰 <strong>Total: ${rupiah(total)}</strong><br><br>Kalo bener, pencet <strong>"OK"</strong> ya`;
  const area = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = 'msg-row in';
  row.innerHTML = `<div class="msg bot">
    <div class="bot-name">🤖 WarungKita</div>
    ${html}
    <div class="msg-time">${jam()}</div>
    <div class="chat-btns">
      <button class="ok-btn" data-action="confirm-pengeluaran">OK ✅</button>
      <button class="koreksi-btn" data-action="koreksi-pengeluaran">✏️ Koreksi</button>
    </div>
  </div>`;
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

function handlePendingPengeluaranResponse(text) {
  // If user types something other than confirmation text, treat as a new command
  // (the buttons are the main path; this is a fallback)
  // For now, just clear and ask user to use buttons
  addBotMsg('Pencet tombol <strong>OK ✅</strong> atau <strong>✏️ Koreksi</strong> di pesan sebelumnya ya 🙂');
}

function confirmPengeluaran(btn) {
  btn.closest('.chat-btns').innerHTML = '<span style="color:#6fcf97;font-size:13px">✅ Tersimpan</span>';
  const p = state.pendingPengeluaran;
  if (!p) return;
  const id = 'P' + Date.now().toString(36).toUpperCase();
  state.pengeluaran.push({
    id,
    items: p.items,
    total: p.total,
    waktu: p.waktu,
    keterangan: p.items.map(i => `${i.nama} ${rupiah(i.harga)}`).join(', '),
  });
  state.pendingPengeluaran = null;
  saveState();
  const totalTx = state.transaksi.reduce((s, t) => s + t.total, 0);
  const untung = totalTx - getTotalPengeluaran();
  let html = `✅ <strong>Pengeluaran tersimpan!</strong> (ID: #${id})<br>💸 Total keluar: <strong>${rupiah(p.total)}</strong>`;
  if (totalTx > 0) {
    html += `<br>💰 Untung bersih hari ini: <strong>${rupiah(untung)}</strong>`;
  }
  addBotMsg(html);
}

function koreksiPengeluaran(btn) {
  btn.closest('.chat-btns').innerHTML = '<span style="color:#b0a89a;font-size:13px">✏️ Dibatalkan, ketik ulang ya</span>';
  state.pendingPengeluaran = null;
  saveState();
}

function showPengeluaranList() {
  const list = state.pengeluaran;
  if (!list.length) {
    addBotMsg('Belum ada pengeluaran hari ini.<br>Catet pake <strong>"beli [item] [harga]"</strong> ya 🙂');
    return;
  }
  const total = getTotalPengeluaran();
  let html = `💸 <strong>Pengeluaran Hari Ini</strong><br><br>`;
  list.forEach(p => {
    const time = new Date(p.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    html += `<div class="riwayat-item">`;
    html += `<div class="riwayat-id">#${esc(p.id)} · ${esc(time)}</div>`;
    p.items.forEach(i => {
      html += `<div class="riwayat-line">• ${esc(i.nama)} = <strong>${rupiah(i.harga)}</strong></div>`;
    });
    html += `<div class="riwayat-total">Total: <strong>${rupiah(p.total)}</strong></div>`;
    html += `</div>`;
  });
  html += `<br>💰 <strong>Total Pengeluaran: ${rupiah(total)}</strong>`;
  addBotMsg(html);
}

