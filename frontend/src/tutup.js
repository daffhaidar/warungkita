/**
 * WarungKita — tutup.js
 * Close shop flow, rekap, export/share
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ---- TUTUP WARUNG ----
function showTutupModal() {
  if (!state.buka) return;
  document.getElementById('modalTutup').classList.add('active');
}

function handleTutup() {
  const jam = new Date().getHours();
  if (jam < 20) {
    document.getElementById('modalBukaTitle').textContent = 'Masih awal nih..';
    document.getElementById('modalBukaDesc').innerHTML = `Baru jam <strong>${jam}:00</strong>. Mau jualan lagi?`;
    document.getElementById('modalBuka').classList.add('active');
  }
  showRekap();
}

function showRekap() {
  const now = new Date();
  document.getElementById('rekapDate').textContent = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · Tutup ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const tx = state.transaksi;
  const total = tx.reduce((s, t) => s + t.total, 0);
  const totalPengeluaran = getTotalPengeluaran();
  const totalUtang = getTotalUtang();
  const untung = total - totalPengeluaran;
  const itemCounts = {};
  tx.forEach(t => t.items.forEach(i => {
    if (!itemCounts[i.nama]) itemCounts[i.nama] = 0;
    itemCounts[i.nama] += i.qty;
  }));
  const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);

  let html = '<div class="rekap-card">';
  html += `<div class="r-line"><span class="r-lbl">💵 Omzet</span><span class="r-val">${rupiah(total)}</span></div>`;
  if (state.pengeluaran.length) {
    html += `<div class="r-line"><span class="r-lbl">💸 Pengeluaran</span><span class="r-val">${rupiah(totalPengeluaran)}</span></div>`;
    html += `<div class="r-line r-untung"><span class="r-lbl">💰 Untung Bersih</span><span class="r-val">${rupiah(untung)}</span></div>`;
  }
  if (totalUtang > 0) {
    html += `<div class="r-line"><span class="r-lbl">💳 Utang Aktif</span><span class="r-val">${rupiah(totalUtang)}</span></div>`;
  }
  if (state.targetHarian > 0) {
    const pct = Math.min(999, Math.round(total / state.targetHarian * 100));
    html += `<div class="r-line"><span class="r-lbl">🎯 Target</span><span class="r-val">${rupiah(state.targetHarian)} (${pct}%)</span></div>`;
    html += renderProgressBar(total, state.targetHarian, pct);
  }
  html += `<div class="r-line"><span class="r-lbl">📝 Total Transaksi</span><span class="r-val">${tx.length} item</span></div>`;

  if (sorted.length) {
    html += '<div class="rekap-divider"></div>';
    html += '<div class="r-line"><span class="r-lbl"><strong>🏆 Produk:</strong></span><span class="r-val"></span></div>';
    sorted.forEach(([nama, qty]) => {
      // Find a satuan by looking up the most-recent tx that contained this item
      let satuan = 'porsi';
      for (let i = tx.length - 1; i >= 0; i--) {
        const it = tx[i].items.find(x => x.nama === nama);
        if (it) { satuan = it.satuan; break; }
      }
      html += `<div class="r-line"><span class="r-lbl">• ${esc(nama)}</span><span class="r-val">${qty} ${satuan}</span></div>`;
    });
  }

  const stokKeys = Object.keys(state.stok);
  if (stokKeys.length) {
    html += '<div class="rekap-divider"></div>';
    html += '<div class="r-line"><span class="r-lbl"><strong>📦 Sisa Stok:</strong></span><span class="r-val"></span></div>';
    stokKeys.forEach(k => {
      const s = state.stok[k];
      html += `<div class="r-line"><span class="r-lbl">• ${esc(s.nama)}</span><span class="r-val">${s.qty}${s.satuan}</span></div>`;
    });
  }
  html += '</div>';

  // Share buttons
  html += '<div class="rekap-share-row">';
  html += '<button class="modal-btn secondary" id="btnRekapCopy" style="flex:1;min-width:0">📋 Salin Laporan</button>';
  html += '<button class="modal-btn green" id="btnRekapWA" style="flex:1;min-width:0">🔗 Share WhatsApp</button>';
  html += '</div>';

  document.getElementById('rekapContent').innerHTML = html;
  document.getElementById('modalRekap').classList.add('active');

  // Bind share buttons (re-bind because innerHTML replaced them)
  document.getElementById('btnRekapCopy').onclick = copyRekapToClipboard;
  document.getElementById('btnRekapWA').onclick = shareRekapToWhatsApp;

  // GenAI summary — async, loads after modal appears
  if (typeof callGenAI === 'function' && typeof buildRekapPrompt === 'function') {
    const aiContainer = document.createElement('div');
    aiContainer.className = 'rekap-card';
    aiContainer.style.marginTop = '12px';
    aiContainer.innerHTML = '<div class="r-line"><span class="r-lbl" style="color:#b0a89a">🤖 AI sedang membuat ringkasan...</span></div>';
    document.getElementById('rekapContent').appendChild(aiContainer);

    const prompt = buildRekapPrompt(state.namaWarung, tx, total, totalPengeluaran, untung, totalUtang, state.targetHarian, sorted);
    callGenAI([{role:'user',content:prompt}]).then(summary => {
      if (summary) {
        aiContainer.innerHTML = '<div class="r-line"><span class="r-lbl"><strong>🤖 Ringkasan AI:</strong></span></div><div style="padding:8px 16px;color:#5a5047;font-size:14px;line-height:1.5">' + esc(summary) + '</div>';
      } else {
        aiContainer.style.display = 'none';
      }
    }).catch(() => { aiContainer.style.display = 'none'; });
  }
}

// ---- EXPORT / SHARE LAPORAN ----
function buildRekapText() {
  const tx = state.transaksi;
  const total = tx.reduce((s, t) => s + t.total, 0);
  const totalPengeluaran = getTotalPengeluaran();
  const totalUtang = getTotalUtang();
  const untung = total - totalPengeluaran;
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  const itemCounts = {};
  const itemSatuan = {};
  tx.forEach(t => t.items.forEach(i => {
    if (!itemCounts[i.nama]) itemCounts[i.nama] = 0;
    itemCounts[i.nama] += i.qty;
    itemSatuan[i.nama] = i.satuan;
  }));
  const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);

  let txt = `📋 REKAP JUALAN - ${state.namaWarung}\n`;
  txt += `📅 ${dateStr}\n\n`;
  txt += `💵 Omzet: ${rupiah(total)}\n`;
  txt += `💸 Pengeluaran: ${rupiah(totalPengeluaran)}\n`;
  txt += `💰 Untung Bersih: ${rupiah(untung)}\n`;
  if (totalUtang > 0) {
    txt += `💳 Utang Aktif: ${rupiah(totalUtang)}\n`;
  }
  txt += `📝 ${tx.length} transaksi\n`;

  if (sorted.length) {
    txt += `\n🏆 Produk:\n`;
    sorted.forEach(([nama, qty]) => {
      txt += `• ${nama} — ${qty} ${itemSatuan[nama] || 'porsi'}\n`;
    });
  }

  const stokKeys = Object.keys(state.stok);
  if (stokKeys.length) {
    txt += `\n📦 Sisa Stok:\n`;
    stokKeys.forEach(k => {
      const s = state.stok[k];
      txt += `• ${s.nama}: ${s.qty}${s.satuan}\n`;
    });
  }

  txt += `\nDicatat oleh WarungKita 🏪`;
  return txt;
}

async function copyRekapToClipboard() {
  const txt = buildRekapText();
  const btn = document.getElementById('btnRekapCopy');
  const original = btn.innerHTML;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(txt);
    } else {
      // Fallback for non-secure context
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    btn.innerHTML = '✅ Tersalin!';
    setTimeout(() => { btn.innerHTML = original; }, 1800);
  } catch(e) {
    btn.innerHTML = '❌ Gagal salin';
    setTimeout(() => { btn.innerHTML = original; }, 1800);
  }
}

function shareRekapToWhatsApp() {
  const txt = buildRekapText();
  const url = 'https://wa.me/?text=' + encodeURIComponent(txt);
  window.open(url, '_blank', 'noopener');
}

function finalizeTutup() {
  state.buka = false;
  saveState();

  document.getElementById('statusBar').innerHTML = '<span class="dot merah"></span> <span>Warung tutup</span>';
  document.getElementById('btnTutupHeader').style.display = 'none';
  document.getElementById('chatInput').disabled = true;
  document.getElementById('chatInput').placeholder = 'Warung lagi tutup..';
  document.getElementById('btnSend').disabled = true;
  document.getElementById('closedOverlay').classList.add('active');

  addBotMsg('🌙 Warung ditutup. Data aman tersimpan. Besok tinggal <strong>"buka"</strong>!');
}

function updateUIForOpen() {
  document.getElementById('closedOverlay').classList.remove('active');
  document.getElementById('statusBar').innerHTML = '<span class="dot"></span> <span>Siap bantu catat transaksi</span>';
  document.getElementById('btnTutupHeader').style.display = 'inline-block';
  document.getElementById('chatInput').disabled = false;
  document.getElementById('chatInput').placeholder = 'Ketik di sini...';
  document.getElementById('btnSend').disabled = false;
}

function bukaWarung() {
  state.buka = true;
  saveState();

  updateUIForOpen();
  renderQuickSell();

  const total = state.transaksi.reduce((s, t) => s + t.total, 0);
  let html = `☀️ Warung dibuka lagi!<br>📊 Total hari ini: <strong>${rupiah(total)}</strong>`;
  if (state.targetHarian > 0) {
    const pct = Math.min(999, Math.round(total / state.targetHarian * 100));
    html += renderProgressBar(total, state.targetHarian, pct);
  }
  addBotMsg(html);
}

