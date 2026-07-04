/**
 * WarungKita — commands-utang.js
 * Utang (debt) command handlers
 * Part of modular refactor (v3.5)
 */

// ---- UTANG PATTERN PARSING ----
function parseUtangPattern(text) {
  const patterns = window.WarungConfig.UTANG_PATTERNS;
  const clean = text.trim();
  
  // Pattern 3: "pempes 1 utang si jamal"
  const siAfterMatch = clean.match(patterns.pattern3);
  if (siAfterMatch) {
    return {
      type: 'si_after',
      name: window.WarungUtils.capitalize(siAfterMatch[1]),
      itemsText: clean.replace(/\s+utang\s+si\s+[a-z]+(?:\s+[a-z]+)?/i, '').trim()
    };
  }
  
  // Pattern 4: "si jamal utang karet 1 biji"
  const siBeforeMatch = clean.match(patterns.pattern4);
  if (siBeforeMatch) {
    return {
      type: 'si_before',
      name: window.WarungUtils.capitalize(siBeforeMatch[1]),
      itemsText: siBeforeMatch[2]
    };
  }
  
  // Pattern 1: "jual indomie 2 bks utang budi"
  const pattern1Match = clean.match(patterns.pattern1);
  if (pattern1Match) {
    const beforeUtang = pattern1Match[1].trim();
    const afterUtang = pattern1Match[2].trim();
    const beforeHasDigits = /\d/.test(beforeUtang);
    const afterHasDigits = /\d/.test(afterUtang);
    
    if (!beforeHasDigits && afterHasDigits) {
      // Pattern 2: "budi utang indomie 5 bks"
      const cleanName = beforeUtang.replace(/^(jual|catat|order|beli|tambah|stok|target|bayar|utang|janji|mau|aku|saya|gue|lagi|udah|sudah|minta|titip)\s+/i, '').trim();
      if (!cleanName) {
        return { type: 'ask_name', itemsText: afterUtang };
      }
      return {
        type: 'name_before',
        name: window.WarungUtils.capitalize(cleanName),
        itemsText: afterUtang
      };
    }
    
    // Pattern 1: name after items
    const nameMatch = afterUtang.match(/^([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/);
    if (!nameMatch) {
      return { type: 'ask_name', itemsText: beforeUtang };
    }
    
    const remainingAfter = afterUtang.replace(/^[a-zA-Z]+(?:\s+[a-zA-Z]+)?/, '').trim();
    return {
      type: 'name_after',
      name: window.WarungUtils.capitalize(nameMatch[1]),
      itemsText: beforeUtang + (remainingAfter ? ' ' + remainingAfter : '')
    };
  }
  
  return null;
}

// ---- UTANG COMMAND HANDLERS ----
function handleUtangCommand(text) {
  const t = text.toLowerCase().trim();
  
  // "utang" alone - show list
  if (t === 'utang') {
    showUtangList();
    return true;
  }
  
  // "utang budi" - show detail
  const detailMatch = t.match(/^utang\s+([a-z]+)\s*$/);
  if (detailMatch) {
    showUtangDetail(detailMatch[1]);
    return true;
  }
  
  // "utang lunas budi" - mark as paid
  const lunasMatch = t.match(/^utang\s+lunas\s+([a-z]+)$/);
  if (lunasMatch) {
    markUtangLunas(lunasMatch[1]);
    return true;
  }
  
  // "bayar utang budi 5000" - reduce debt
  const bayarUtangMatch = t.match(/^bayar\s+utang\s+([a-z]+)\s+(\d[\d.,]*\s*(?:rb|ribu|jt|juta)?)$/i);
  if (bayarUtangMatch) {
    const name = bayarUtangMatch[1];
    const amount = window.WarungUtils.parseRupiah(bayarUtangMatch[2]);
    if (!amount || amount <= 0) {
      addBotMsg('Format: <strong>"bayar utang budi 5000"</strong> atau <strong>"bayar utang budi 5rb"</strong>');
      return true;
    }
    bayarUtang(name, amount);
    return true;
  }
  
  // "utang budi indomie 2 3500" - record debt
  const utangMatch = t.match(/^utang\s+([a-z]+)\s+(.+)$/);
  if (utangMatch) {
    addUtang(utangMatch[1], utangMatch[2]);
    return true;
  }
  
  return false;
}

// Export
window.WarungUtangCommands = {
  parseUtangPattern,
  handleUtangCommand,
};