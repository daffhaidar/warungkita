// WarungKita GenAI Module — calls serverless /api/genai (keys NOT exposed)
// Rewritten v3.4: moved API keys to Vercel serverless function

const GENAI_ENDPOINT = '/api/genai';

/**
 * Call GenAI API via serverless function
 * @param {Array} messages - [{role, content}]
 * @param {Object} opts - {temperature, max_tokens}
 * @returns {Promise<string>} - AI response text
 */
async function callGenAI(messages, opts = {}) {
  const { temperature = 0.7, max_tokens = 500 } = opts;

  try {
    const response = await fetch(GENAI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, temperature, max_tokens })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('GenAI error:', response.status, err.error || '');
      return null;
    }

    const data = await response.json();
    // Strip think blocks if present
    let text = data.choices?.[0]?.message?.content || '';
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Strip unclosed think blocks
    text = text.replace(/<think>[\s\S]*$/gi, '').trim();
    // Strip trailing artifacts
    text = text.replace(/```[\s\S]*?```/g, m => m.replace(/```/g, '')).trim();
    return text || null;
  } catch (err) {
    console.error('GenAI fetch error:', err);
    return null;
  }
}

// ---- PROMPT BUILDERS (casual-motivasi, gaya chat WarungKita) ----
// Dipakai showLaporan() (report.js) & rekap tutup (tutup.js). Tanpa fungsi ini,
// blok AI di-skip diam-diam (guard `typeof build...Prompt === 'function'`).
function _rp(n) { return 'Rp' + (Number(n) || 0).toLocaleString('id-ID'); }
function _topProduk(sorted) {
  return (sorted || []).slice(0, 3)
    .map(([nama, qty], i) => `${i + 1}. ${nama} (${qty} terjual)`)
    .join(', ') || 'belum ada penjualan';
}

function buildLaporanPrompt(namaWarung, tx, total, totalPengeluaran, untung, targetHarian, sorted) {
  const target = targetHarian > 0
    ? `Target harian ${_rp(targetHarian)}, tercapai ${Math.round(total / targetHarian * 100)}%.`
    : 'Belum pasang target harian.';
  const profit = totalPengeluaran > 0
    ? `Pengeluaran ${_rp(totalPengeluaran)}, untung bersih ${_rp(untung)}.`
    : '';
  return `Kamu WarungKita, asisten warung yang ramah dan suka nyemangatin. Buatin ringkasan SINGKAT (maks 3 kalimat) buat pemilik warung "${namaWarung}" soal jualan hari ini. Pakai Bahasa Indonesia santai gaya ngobrol (boleh "kamu"), kasih 1-2 emoji yang pas. JANGAN pakai markdown/heading/bullet — teks mengalir aja. Langsung mulai, tanpa pembuka kayak "Tentu" atau "Berikut".

Data hari ini:
- Omzet: ${_rp(total)} dari ${(tx || []).length} transaksi
- Produk terlaris: ${_topProduk(sorted)}
${profit ? '- ' + profit + '\n' : ''}- ${target}

Selipin 1 insight berguna (produk andalan / progress target) + 1 kalimat penyemangat yang tulus.`;
}

function buildRekapPrompt(namaWarung, tx, total, totalPengeluaran, untung, totalUtang, targetHarian, sorted) {
  const target = targetHarian > 0
    ? `Target ${_rp(targetHarian)} (tercapai ${Math.round(total / targetHarian * 100)}%)`
    : 'tanpa target';
  const utang = totalUtang > 0
    ? `Masih ada utang pelanggan ${_rp(totalUtang)}.`
    : 'Gak ada utang nyangkut.';
  return `Kamu WarungKita, asisten warung yang ramah dan suka nyemangatin. Warung "${namaWarung}" baru aja tutup hari ini. Buatin penutup yang HANGAT dan SINGKAT (maks 3 kalimat) buat pemiliknya. Pakai Bahasa Indonesia santai gaya ngobrol (boleh "kamu"), kasih 1-2 emoji yang pas. JANGAN pakai markdown/heading/bullet — teks mengalir aja. Langsung mulai, tanpa pembuka kayak "Tentu" atau "Berikut".

Rekap hari ini:
- Omzet: ${_rp(total)} dari ${(tx || []).length} transaksi
- Untung bersih: ${_rp(untung)} (pengeluaran ${_rp(totalPengeluaran)})
- Produk terlaris: ${_topProduk(sorted)}
- ${target}
- ${utang}

Apresiasi kerja kerasnya hari ini, kasih 1 catatan berguna buat besok, tutup dengan semangat.`;
}

// Export for use in app.js
if (typeof window !== 'undefined') {
  window.callGenAI = callGenAI;
  window.buildLaporanPrompt = buildLaporanPrompt;
  window.buildRekapPrompt = buildRekapPrompt;
}
