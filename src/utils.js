/**
 * WarungKita — utils.js
 * Currency parser, fuzzy match, change calc, target
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ---- CURRENCY PARSER ----
// "500rb" → 500000, "1jt" → 1000000, "1,5jt" → 1500000, "500.000" → 500000
function parseRupiah(text) {
  if (!text) return null;
  const t = text.toLowerCase().replace(/\s/g, '');

  // Strip "rp" prefix if present
  const clean = t.replace(/^rp\.?/, '');

  // Match: number [optional decimal] [optional multiplier] [optional extra multiplier]
  // e.g. "500rb", "1,5jt", "1.5juta", "2.500.000", "500", "500000"
  const m = clean.match(/^(\d+(?:[.,]\d+)*)(?:[.,](\d+))?\s*(rb|ribu|jt|juta|m|miliar)?$/i);

  if (!m) return null;

  let num = parseFloat(m[1].replace(/\./g, '').replace(/,/g, '.'));
  if (m[2]) num = parseFloat(m[1].replace(/\./g, '').replace(',', '.')) + parseFloat('0.' + m[2]);

  const mult = (m[3] || '').toLowerCase();
  if (mult === 'rb' || mult === 'ribu') num *= 1000;
  else if (mult === 'jt' || mult === 'juta') num *= 1_000_000;
  else if (mult === 'm' || mult === 'miliar') num *= 1_000_000_000;

  return Math.round(num);
}

// ---- FUZZY MATCH (Levenshtein-based) ----
// Used for typo tolerance: "rkok surya" → suggests "Rokok Surya" if it exists in itemConfig / stok.
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        m[i][j] = m[i - 1][j - 1];
      } else {
        m[i][j] = Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
      }
    }
  }
  return m[b.length][a.length];
}

// Find the best fuzzy match for `input` in the union of known item names
// (from itemConfig keys + stok keys). Returns the matched name or null.
function fuzzyFindItem(input) {
  const norm = normalizeKey(input);
  if (!norm || norm.length < 3) return null; // too short, skip
  // Build candidate list from itemConfig + stok + typoMap canonicals
  const candidates = new Set();
  Object.values(state.itemConfig || {}).forEach(c => { if (c && c.nama) candidates.add(c.nama); });
  Object.values(state.stok || {}).forEach(s => { if (s && s.nama) candidates.add(s.nama); });
  // Exact (normalized) match — no need to suggest
  for (const c of candidates) {
    if (normalizeKey(c) === norm) return null;
  }
  // Find closest by Levenshtein distance
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const cKey = normalizeKey(c);
    const d = levenshtein(norm, cKey);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  // Threshold: distance <= 2 for words of length >= 4, or <= 1 for short ones.
  // Avoid suggesting wildly different items.
  if (!best) return null;
  const lenRatio = norm.length / best.length;
  if (lenRatio < 0.5 || lenRatio > 2) return null;
  if (bestDist <= 1) return best;
  if (bestDist === 2 && norm.length >= 5) return best;
  return null;
}

// Try fuzzy match on a "jual ..." style input. If a likely typo is detected,
// ask the user for confirmation. Otherwise invoke callback(null) directly.
function tryFuzzyOnInput(text, callback) {
  // First, check the typoMap for an exact known typo → canonical mapping
  const cleaned = text.replace(/^(jual|catat|order|jualin|in|mau\s+jual|aku\s+mau\s+jual)\s+/i, '').trim();
  // Pull out the item name (everything before the first qty-like number)
  const m = cleaned.match(/^([a-zA-Z][a-zA-Z\s]+?)(?:\s+\d|$)/);
  const itemGuess = m ? m[1].trim() : cleaned.split(/\s+/)[0];
  if (!itemGuess || itemGuess.length < 3) {
    callback(null);
    return;
  }
  // First, check typoMap for known mapping
  const mapped = state.typoMap[normalizeKey(itemGuess)];
  if (mapped) {
    const canonical = Object.values(state.itemConfig).find(c => normalizeKey(c.nama) === mapped);
    if (canonical) {
      // Auto-correct silently and proceed
      const replaced = text.replace(new RegExp('^' + escapeRegex(itemGuess) + '\\b', 'i'), canonical.nama);
      callback(replaced);
      return;
    }
  }
  // Otherwise fuzzy search
  const suggestion = fuzzyFindItem(itemGuess);
  if (!suggestion) {
    callback(null);
    return;
  }
  // Ask for confirmation
  state.pendingFuzzy = { input: itemGuess, suggested: suggestion, callback };
  addBotMsg(
    `Maksudnya <strong>${esc(suggestion)}</strong>? 🤔<br>` +
    `Ketik <strong>"ya"</strong> kalo iya, atau <strong>"bukan"</strong> kalo salah.`
  );
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ---- KEMBALIAN (Change calculation) ----
function showKembalian(total, uang) {
  const selisih = uang - total;
  let html = `💰 <strong>Hitung Kembalian</strong><br><br>`;
  html += `💵 Total: <strong>${rupiah(total)}</strong><br>`;
  html += `💴 Uang pembeli: <strong>${rupiah(uang)}</strong><br>`;
  if (selisih === 0) {
    html += `✅ <strong>Uang pas!</strong> Nggak ada kembalian.`;
  } else if (selisih > 0) {
    html += `💸 <strong>Kembalian: ${rupiah(selisih)}</strong>`;
  } else {
    html += `⚠️ Uang kurang <strong>${rupiah(-selisih)}</strong>`;
  }
  addBotMsg(html);
}

// ---- TARGET ----
function setTarget(text) {
  const num = parseRupiah(text);
  if (!num || num <= 0) {
    addBotMsg('Format: <strong>"target 500rb"</strong> atau <strong>"target 500000"</strong> — support juga "1jt", "2,5jt", dsb.');
    return;
  }
  setTargetText(num);
}

function setTargetText(num) {
  state.targetHarian = num;
  saveState();
  const total = state.transaksi.reduce((s, t) => s + t.total, 0);
  const pct = Math.round(total / num * 100);
  let html = `✅ Target hari ini: <strong>${rupiah(state.targetHarian)}</strong><br>Semangat jualannya! 🔥`;
  if (state.transaksi.length) {
    html += renderProgressBar(total, num, pct);
  }
  addBotMsg(html);
}

function showTarget() {
  const total = state.transaksi.reduce((s, t) => s + t.total, 0);
  if (state.targetHarian <= 0) {
    addBotMsg(`Belum ada target. Ketik <strong>"target 500rb"</strong> buat pasang target hari ini.<br><br>📊 Total hari ini: <strong>${rupiah(total)}</strong>`);
    return;
  }
  const pct = Math.min(999, Math.round(total / state.targetHarian * 100));
  const emoji = pct >= 100 ? '🎉 TARGET TERCAPAI!' : pct >= 70 ? '🔥 Hampir sampe!' : '💪 Gas terus!';
  addBotMsg(`🎯 <strong>Progress Target</strong>${renderProgressBar(total, state.targetHarian, pct)}<br><br>${emoji}`);
}

