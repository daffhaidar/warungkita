/**
 * WarungKita — transactions.js
 * Transaction recording: finalizeTransaksi, progress bar
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ---- TRANSAKSI ----
function parseTransaksi(text) {
  // Strip common prefixes: "jual", "catat", "order", "jualin", "aku mau jual", "mau jual"
  let clean = text
    .replace(/^(aku\s+)?(mau\s+)?(jual|catat|order|jualin|in|masukin|tambahin)\s+/i, '')
    .replace(/\s+(dong|ya|yaa|woi)$/i, '')
    .trim();

  // Detect "utang [name]" at the end — e.g. "jual rokok 1 pack utang budi"
  let utangName = null;

  // Patterns:
  // 1. "... utang [name]" — e.g. "jual indomie 2 bks utang budi"
  // 2. "[name] utang [items]" — e.g. "budi utang indomie 5 bks"
  // 3. "... utang si [name]" — e.g. "pempes 1 utang si jamal"
  // 4. "si [name] utang [items]" — e.g. "si jamal utang karet 1 biji"
  const utangMatch = clean.match(/\s+utang\s+(.+)$/i);
  if (utangMatch) {
    const beforeUtang = clean.replace(/\s+utang\s+.+$/i, '').trim();
    const afterUtang = utangMatch[1].trim();

    // Helper: extract name from "si [name] ..." or "[name]"
    function extractName(s) {
      const siMatch = s.match(/^si\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
      if (siMatch) return capitalize(siMatch[1]);
      const wordMatch = s.match(/^([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/);
      return wordMatch ? capitalize(wordMatch[1]) : null;
    }
    // Helper: extract items from "... [qty] [satuan] ..." or "... [name] [qty] ..."
    function extractItems(s) {
      // Has digits → likely items
      if (/\d/.test(s)) return s;
      return null;
    }

    const beforeHasDigits = /\d/.test(beforeUtang);
    const afterHasDigits = /\d/.test(afterUtang);

    // Priority 1: "si [name]" always indicates a person name — check FIRST
    const afterSiMatch = afterUtang.match(/\b(si\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
    const beforeSiMatch = beforeUtang.match(/^(si\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)?)\b/i);

    if (afterSiMatch) {
      // Pattern 3: "pempes 1 utang si jamal" or "karet 1 biji utang si jamal"
      utangName = capitalize(afterSiMatch[1].replace(/^si\s+/i, ''));
      // Remove "si [name]" from afterUtang, combine with beforeUtang as items
      const afterClean = afterUtang.replace(/\b(si\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)?)\b/i, '').trim();
      clean = (beforeUtang + ' ' + afterClean).trim();
    } else if (beforeSiMatch) {
      // Pattern 4: "si jamal utang karet 1 biji"
      utangName = capitalize(beforeSiMatch[1].replace(/^si\s+/i, ''));
      clean = afterUtang;
    } else if (!beforeHasDigits && afterHasDigits) {
      // Pattern 2: "budi utang indomie 5 bks" → name before, items after
      const cleanName = beforeUtang.replace(/^(jual|catat|order|beli|tambah|stok|target|bayar|utang|janji|mau|aku|saya|gue|lagi|udah|sudah|minta|titip)\s+/i, '').trim();
      if (!cleanName) {
        state.pendingUtangAskName = { itemsText: afterUtang };
        addBotMsg('Utang atas nama siapa? 🙂<br>Ketik nama orangnya, misal: <strong>"Budi"</strong> atau <strong>"si Jamal"</strong>');
        return;
      }
      utangName = capitalize(cleanName);
      clean = afterUtang;
    } else {
      // Pattern 1: "jual indomie 2 bks utang budi botak" → items before, name after
      utangName = extractName(afterUtang);
      if (!utangName) {
        state.pendingUtangAskName = { itemsText: beforeUtang };
        addBotMsg('Utang atas nama siapa? 🙂<br>Ketik nama orangnya, misal: <strong>"Budi"</strong> atau <strong>"si Jamal"</strong>');
        return;
      }
      // Remove the name part from afterUtang to get any remaining items
      const remainingAfter = afterUtang.replace(/^[a-zA-Z]+(?:\s+[a-zA-Z]+)?/, '').trim();
      clean = beforeUtang + (remainingAfter ? ' ' + remainingAfter : '');
      clean = clean.trim();
    }
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

  // Validate quantities: reject negative or zero
  const bad = items.find(i => !(i.qty > 0));
  if (bad) {
    addBotMsg(`Jumlahnya gak valid nih 😅 Coba angka yang bener ya, contoh: <strong>"jual nasi goreng 3"</strong>`);
    return;
  }

  // If any item has no known price (custom needed), ask first
  const needPrice = items.find(i => i.needsPrice);
  if (needPrice) {
    askForPrice(needPrice, items, utangName);
    return;
  }

  // Check stock availability for each item
  const missingStok = items.filter(i => {
    const key = normalizeKey(i.nama);
    return state.stok[key] === undefined || state.stok[key] === null;
  });
  if (missingStok.length > 0) {
    state.pendingStockWarning = {
      items: items,
      missing: missingStok,
    };
    let warnHtml = '⚠️ Item belum tercatat di stok:<br><br>';
    missingStok.forEach(i => {
      warnHtml += `❓ <strong>${esc(i.nama)}</strong> — ga ada di penyimpanan<br>`;
    });
    warnHtml += `<br>Ketik <strong>"stok ${esc(missingStok[0].nama.toLowerCase())} [jumlah]"</strong> atau <strong>"lanjut"</strong>`;
    addBotMsg(warnHtml);
    return;
  }

  const total = items.reduce((s, i) => s + i.total, 0);
  state.pendingTx = { items, total, waktu: new Date().toISOString(), utangName };
  saveState();

  let html = 'Mau catat:<br><br>';
  items.forEach(i => {
    html += `✅ <strong>${esc(i.nama)}</strong>: ${i.qty} ${i.satuan} × ${rupiah(i.harga)} = <strong>${rupiah(i.total)}</strong><br>`;
  });

  // Stok update preview
  items.forEach(i => {
    const key = normalizeKey(i.nama);
    if (state.stok[key]) {
      const sisa = Math.max(0, state.stok[key].qty - i.qty);
      html += `<br>📦 Stok ${esc(i.nama)}: ${state.stok[key].qty}${state.stok[key].satuan} → ${sisa}${state.stok[key].satuan}`;
    }
  });

  html += '<br><br>OK? 👇';

  // Render with buttons
  const area = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = 'msg-row in';
  row.innerHTML = `<div class="msg bot">
    <div class="bot-name">🤖 WarungKita</div>
    ${html}
    <div class="msg-time">${jam()}</div>
    <div class="chat-btns">
      <button class="ok-btn" data-action="confirm-tx">OK ✅</button>
      <button class="koreksi-btn" data-action="koreksi-tx">✏️ Koreksi</button>
    </div>
  </div>`;
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

// Ask user for price AND default satuan of an unknown item
// User can respond: "15000" (keep default), "15000 per kg", or "20rb/ekor"
function askForPrice(pendingItem, fullItems, utangName) {
  state.pendingPrice = {
    pending: pendingItem,
    fullItems: fullItems,
    utangName: utangName || null,
  };
  // Pick a user-friendly example satuan to surface, falling back to the parsed one
  const contohSatuan = pendingItem.satuan && pendingItem.satuan !== 'pcs' ? pendingItem.satuan : 'pcs';
  addBotMsg(
    `💰 Harga <strong>${esc(pendingItem.nama)}</strong> per apa?<br>` +
    `Contoh: <strong>"15000 per kg"</strong>, <strong>"5000/butir"</strong>, atau langsung <strong>"15000"</strong>`
  );
}

function handlePendingPriceResponse(text) {
  const t = text.toLowerCase().trim();
  const pending = state.pendingPrice;
  if (!pending) return;

  // If user typed a new command instead of a price, cancel pending and route to processCommand
  const commandKeywords = /^(jual|catat|order|beli|stok|target|bayar|utang|help|buka|tutup|riwayat|laporan|total|kembalian|blacklist|cek)\b/;
  const looksLikeCommand = commandKeywords.test(t) || (t.includes('utang') && /\d/.test(t));
  if (looksLikeCommand) {
    state.pendingPrice = null;
    saveState();
    processCommand(text);
    return;
  }

  // Try to parse both price and satuan from response
  // Patterns: "15000 per kg", "20rb/ekor", "15000/kg", or just "15000"
  let priceNum, satuan;

  const m1 = t.match(/^(\d+(?:[.,]\d+)*)\s*(rb|ribu|jt|juta)?\s*(?:\/|per)\s*(\w+)$/i);
  const m2 = t.match(/^(\d+(?:[.,]\d+)*)\s*(rb|ribu|jt|juta)?$/i);

  if (m1) {
    // User specified both price AND satuan
    priceNum = parseFloat(m1[1].replace(/[.,]/g, m1[1].includes(',') ? '.' : ''));
    const mult = (m1[2] || '').toLowerCase();
    if (mult === 'rb' || mult === 'ribu') priceNum *= 1000;
    else if (mult === 'jt' || mult === 'juta') priceNum *= 1000000;
    satuan = m1[3].toLowerCase();
    // Expanded normalization — accepts anything the user types as-is.
    const satuanMap = {
      // weight
      'kg': 'kg', 'kilo': 'kg', 'kilogram': 'kg', 'kiloan': 'kg',
      'gram': 'gram', 'gr': 'gram', 'g': 'gram', 'ons': 'ons',
      // volume
      'liter': 'liter', 'ltr': 'liter', 'l': 'liter', 'ml': 'ml',
      'galon': 'galon', 'jerigen': 'jerigen',
      // count / unit
      'pcs': 'pcs', 'pc': 'pcs', 'pieces': 'pcs', 'ps': 'pcs',
      'butir': 'butir', 'btr': 'butir', 'biji': 'biji', 'buah': 'buah', 'bua': 'buah',
      'ekor': 'ekor', 'porsi': 'porsi', 'orsi': 'porsi',
      // packaging
      'botol': 'botol', 'btl': 'botol', 'kaleng': 'kaleng', 'klg': 'kaleng',
      'slop': 'slop', 'slp': 'slop',
      'dus': 'dus', 'box': 'box', 'bx': 'box',
      'pack': 'pack', 'pak': 'pack', 'pck': 'pack',
      'bungkus': 'bungkus', 'bks': 'bungkus', 'bk': 'bungkus',
      'krat': 'krat', 'krt': 'krat',
      'karung': 'karung', 'krng': 'karung', 'sak': 'karung',
      'peti': 'peti', 'pti': 'peti',
      'bal': 'bal', 'ikat': 'ikat', 'ikt': 'ikat',
      'karton': 'karton', 'ktn': 'karton',
      'roll': 'roll', 'tabung': 'tabung', 'tbg': 'tabung',
      // loose items
      'tangkai': 'tangkai', 'tngk': 'tangkai',
      'helai': 'helai', 'hlai': 'helai',
      'lembar': 'lembar', 'lbr': 'lembar',
      'batang': 'batang', 'btg': 'batang',
      // food/drink
      'gelas': 'gelas', 'cup': 'gelas', 'mangkok': 'mangkok',
      'piring': 'piring', 'sendok': 'sendok', 'sdk': 'sendok',
      'pincuk': 'pincuk', 'kotak': 'kotak',
    };
    // If the satuan isn't in our known list, we accept it as-is (flexible)
    satuan = satuanMap[satuan] || satuan;
  } else if (m2) {
    // Just a number — use the default satuan from pending
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

  // Save to itemConfig (includes harga AND default satuan)
  const key = normalizeKey(pending.pending.nama);
  state.itemConfig[key] = {
    harga: Math.round(priceNum),
    satuan: satuan,
    nama: pending.pending.nama,
  };

  // Update the pending item in fullItems
  const idx = pending.fullItems.findIndex(i => normalizeKey(i.nama) === key);
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
    addBotMsg(`Oke ✅ ${esc(pending.pending.nama)} = ${rupiah(Math.round(priceNum))}/${esc(satuan)}. Harga <strong>${esc(stillNeeds.nama)}</strong> per ${esc(stillNeeds.satuan)}?`);
    return;
  }

  state.pendingPrice = null;
  saveState();
  // Continue with the transaction confirmation (carry utangName through)
  finalizeTransaksi(pending.fullItems, pending.utangName);
}

// "10 apa?" — user answers which satuan they meant
function handlePendingStokSatuan(text) {
  const pending = state.pendingStokQuestion;
  if (!pending) return;
  // Accept a single word as the satuan (e.g. "pcs", "bungkus", "dus")
  const cleaned = text.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!cleaned || cleaned.length > 16) {
    addBotMsg('Hmm belum ngerti satuannya 😅 Coba <strong>"pcs"</strong>, <strong>"bungkus"</strong>, atau <strong>"dus"</strong>');
    return;
  }
  // Apply the chosen satuan to every parsed item and apply
  const updatedItems = pending.items.map(it => ({ ...it, satuan: cleaned }));
  state.pendingStokQuestion = null;
  applyStokItems(updatedItems, pending.originalText);
}

// "Pembeli bayar berapa?" handler — accepts plain number or "bayar <uang>"
function handlePendingBayarResponse(text) {
  const t = text.trim();
  const m = t.match(/^(?:bayar\s+)?(\d[\d.,]*\s*(?:rb|ribu|jt|juta)?)$/i);
  if (!m) {
    addBotMsg('Format: tinggal sebut nominalnya aja, misal <strong>"50000"</strong> atau <strong>"50rb"</strong>');
    return;
  }
  const num = parseRupiah(m[1]);
  if (!num || num <= 0) {
    addBotMsg('Nominalnya belum valid 😅 Coba lagi ya');
    return;
  }
  showKembalian(state.pendingBayar.total, num);
  state.pendingBayar = null;
}

// "Maksudnya Rokok Surya?" — user confirms or rejects the fuzzy suggestion
function handlePendingFuzzyResponse(text) {
  const pending = state.pendingFuzzy;
  if (!pending) return;
  const t = text.toLowerCase().trim();
  state.pendingFuzzy = null;
  if (t === 'ya' || t === 'y' || t === 'iya' || t === 'betul' || t === 'bener' || t === 'correct') {
    // Save mapping for next time
    state.typoMap[normalizeKey(pending.input.split(/\s+/).slice(-2).join(' '))] = normalizeKey(pending.suggested);
    // Or simpler: store the whole phrase
    state.typoMap[normalizeKey(pending.input)] = normalizeKey(pending.suggested);
    saveState();
    // Proceed with the corrected command by replacing the input item name
    pending.callback(pending.suggested);
  } else if (t === 'bukan' || t === 'no' || t === 'n' || t === 'salah' || t === 'engga' || t === 'enggak') {
    addBotMsg('Oke sip, aku pake sesuai ketikan kamu ya 🙂');
    pending.callback(null); // proceed with original input
  } else {
    addBotMsg('Ketik <strong>"ya"</strong> kalo bener, atau <strong>"bukan"</strong> kalo salah ya');
    state.pendingFuzzy = pending; // restore for retry
  }
}

function finalizeTransaksi(items, utangName) {
  const total = items.reduce((s, i) => s + i.total, 0);
  state.pendingTx = { items, total, waktu: new Date().toISOString(), utangName: utangName || null };
  saveState();

  let html = `Oke! Mau catat:<br><br>`;
  items.forEach(i => {
    html += `✅ <strong>${esc(i.nama)}</strong>: ${i.qty} ${i.satuan} × ${rupiah(i.harga)} = <strong>${rupiah(i.total)}</strong><br>`;
  });
  items.forEach(i => {
    const key = normalizeKey(i.nama);
    if (state.stok[key]) {
      const sisa = Math.max(0, state.stok[key].qty - i.qty);
      html += `<br>📦 Stok ${esc(i.nama)}: ${state.stok[key].qty}${state.stok[key].satuan} → ${sisa}${state.stok[key].satuan}`;
    }
  });
  html += '<br><br>OK? 👇';

  const area = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = 'msg-row in';
  row.innerHTML = `<div class="msg bot">
    <div class="bot-name">🤖 WarungKita</div>
    ${html}
    <div class="msg-time">${jam()}</div>
    <div class="chat-btns">
      <button class="ok-btn" data-action="confirm-tx">OK ✅</button>
      <button class="koreksi-btn" data-action="koreksi-tx">✏️ Koreksi</button>
    </div>
  </div>`;
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

function confirmTx(btn) {
  btn.closest('.chat-btns').innerHTML = '<span style="color:#6fcf97;font-size:13px">✅ Dikonfirmasi</span>';
  const tx = state.pendingTx;
  if (!tx) return;

  // Simpan transaksi
  const id = 'T' + Date.now().toString(36).toUpperCase();
  state.transaksi.push({ id, ...tx });

  // Update stok
  tx.items.forEach(i => {
    const key = normalizeKey(i.nama);
    if (state.stok[key]) {
      state.stok[key].qty = Math.max(0, state.stok[key].qty - i.qty);
    }
  });

  state.pendingTx = null;
  // Remember this transaction's total so the user can ask "bayar" / "kembalian"
  state.pendingBayar = { total: tx.total };
  saveState();

  // If "utang [name]" was in the command, auto-record the debt
  if (tx.utangName) {
    recordUtang(tx.utangName, tx.items, tx.total);
  }

  renderQuickSell();

  const totalHariIni = state.transaksi.reduce((s, t) => s + t.total, 0);
  let html = `✅ <strong>Tersimpan!</strong> (ID: #${id})<br>📊 Total hari ini: <strong>${rupiah(totalHariIni)}</strong>`;
  if (state.targetHarian > 0) {
    const pct = Math.min(999, Math.round(totalHariIni / state.targetHarian * 100));
    html += renderProgressBar(totalHariIni, state.targetHarian, pct);
  }
  addBotMsg(html);

  // Offer to calculate change if total > 0
  if (tx.total > 0) {
    addBotMsg(`💰 Pembeli bayar berapa? Sebut nominalnya, misal <strong>"50rb"</strong>, atau ketik <strong>"bayar"</strong> 🙂`);
  }
}

function koreksiTx(btn) {
  btn.closest('.chat-btns').innerHTML = '<span style="color:#b0a89a;font-size:13px">✏️ Dibatalkan, ketik ulang ya</span>';
  state.pendingTx = null;
  saveState();
}

// ---- PROGRESS BAR ----
function renderProgressBar(current, target, pct) {
  const widthPct = Math.min(100, Math.max(0, pct));
  const isOver = pct > 100;
  const colorClass = isOver ? 'over' : '';
  return `<div class="progress-wrap" style="margin-top:8px">
    <div class="progress-bar ${colorClass}">
      <div class="progress-fill" style="width:${widthPct}%"></div>
    </div>
    <div class="progress-label">🎯 ${rupiah(current)} / ${rupiah(target)} (${pct}%)${isOver ? ' 🎉' : ''}</div>
  </div>`;
}

