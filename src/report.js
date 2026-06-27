/**
 * WarungKita — report.js
 * Daily report, riwayat (history)
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ---- LAPORAN ----
function getTotalPengeluaran() {
  return state.pengeluaran.reduce((s, p) => s + (p.total || 0), 0);
}

function showLaporan() {
  const tx = state.transaksi;
  const total = tx.reduce((s, t) => s + t.total, 0);
  const totalPengeluaran = getTotalPengeluaran();
  const untung = total - totalPengeluaran;
  if (!tx.length && !state.pengeluaran.length) {
    addBotMsg('Belum ada transaksi atau pengeluaran hari ini.');
    return;
  }
  const itemCounts = {};
  tx.forEach(t => t.items.forEach(i => {
    if (!itemCounts[i.nama]) itemCounts[i.nama] = 0;
    itemCounts[i.nama] += i.qty;
  }));
  const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);

  let html = `📊 <strong>Laporan Hari Ini</strong><br><br>`;
  html += `💵 Omzet: <strong>${rupiah(total)}</strong><br>`;
  if (state.pengeluaran.length) {
    html += `💸 Pengeluaran: <strong>${rupiah(totalPengeluaran)}</strong><br>`;
    html += `💰 <strong>Untung Bersih: ${rupiah(untung)}</strong><br>`;
  }
  html += `📝 ${tx.length} transaksi<br>`;
  if (sorted.length) {
    html += `<br>🏆 <strong>Produk terlaris:</strong><br>`;
    sorted.forEach(([nama, qty], i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || '&nbsp;&nbsp;';
      html += `${medal} ${esc(nama)} — ${qty}<br>`;
    });
  }
  if (state.targetHarian > 0) {
    const pct = Math.min(999, Math.round(total / state.targetHarian * 100));
    html += renderProgressBar(total, state.targetHarian, pct);
  }
  addBotMsg(html);

  // GenAI summary — async follow-up
  if (typeof callGenAI === 'function' && typeof buildLaporanPrompt === 'function') {
    const loadingId = 'ai-loading-' + Date.now();
    addBotMsg('<span id="' + loadingId + '" style="color:#b0a89a">🤖 AI sedang menganalisis...</span>');
    const prompt = buildLaporanPrompt(state.namaWarung, tx, total, totalPengeluaran, untung, state.targetHarian, sorted);
    callGenAI([{role:'user',content:prompt}]).then(summary => {
      const el = document.getElementById(loadingId);
      if (summary && el) {
        el.parentElement.innerHTML = '🤖 <strong>Ringkasan AI:</strong><br><br>' + esc(summary);
      } else if (el) {
        el.parentElement.parentElement.style.display = 'none';
      }
    }).catch(() => {
      const el = document.getElementById(loadingId);
      if (el) el.parentElement.parentElement.style.display = 'none';
    });
  }
}

function showLaporanMinggu() {
  addBotMsg('📊 Laporan mingguan belum tersedia di versi ini. Fitur ini coming soon ya~');
}

// ---- RIWAYAT ----
function showRiwayat() {
  const tx = state.transaksi;
  if (!tx.length) {
    addBotMsg('Belum ada transaksi hari ini');
    return;
  }
  let html = `📋 <strong>Riwayat Hari Ini</strong> (${tx.length})<br><br>`;
  // Sort by waktu ascending
  const sorted = [...tx].sort((a, b) => new Date(a.waktu) - new Date(b.waktu));
  sorted.forEach(t => {
    const time = new Date(t.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    html += `<div class="riwayat-item">`;
    html += `<div class="riwayat-id">#${esc(t.id)} · ${esc(time)}</div>`;
    t.items.forEach(i => {
      html += `<div class="riwayat-line">• ${esc(i.nama)} × ${i.qty} ${esc(i.satuan)} = <strong>${rupiah(i.total)}</strong></div>`;
    });
    html += `<div class="riwayat-total">Total: <strong>${rupiah(t.total)}</strong></div>`;
    html += `</div>`;
  });
  addBotMsg(html);
}

