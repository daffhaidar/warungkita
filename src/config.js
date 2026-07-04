/**
 * WarungKita — config.js
 * Config, constants, regex patterns, satuan tokens
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ===== WarungKita Frontend =====
// Backend removed (v3.5): runs fully on local parser

// ---- CONFIG ----
const API_BASE = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8000';
  return window.location.origin;
})();

let API_KEY = localStorage.getItem('warungkita_api_key') || null;
let useBackend = false;
let _keyFetchPromise = null;

async function ensureApiKey() {
  return null;
}

async function apiFetch(path, opts = {}) {
  await ensureApiKey();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  return fetch(API_BASE + path, Object.assign({}, opts, { headers }));
}

// ---- SATUAN TOKENS (for item parsing) ----
// Grouped by category for clarity
const SATUAN_WEIGHT = 'kg|kilo|kilogram|kiloan|gram|gr|g|ons';
const SATUAN_VOLUME = 'liter|ltr|l|ml|galon|jerigen';
const SATUAN_COUNT = 'pcs|pc|pieces|ps|butir|btr|biji|buah|bua|ekor|porsi|orsi';
const SATUAN_PACKAGING = 'botol|btl|kaleng|klg|slop|slp|dus|box|bx|pack|pak|pck|bungkus|bks|bk|krat|krt|karung|krng|sak|peti|pti|bal|ikat|ikt|karton|ktn|roll|tabung|tbg';
const SATUAN_LOOSE = 'tangkai|tngk|helai|hlai|lembar|lbr|batang|btg|pohon';
const SATUAN_FOOD = 'gelas|cup|mangkok|piring|sendok|sdk|pincuk|kotak';

// Combined regex pattern for satuan matching
const SATUAN_PATTERN = `${SATUAN_WEIGHT}|${SATUAN_VOLUME}|${SATUAN_COUNT}|${SATUAN_PACKAGING}|${SATUAN_LOOSE}|${SATUAN_FOOD}`;

// ---- REGEX PATTERNS (centralized for maintainability) ----
// Item parsing: "nama qty [satuan] [harga]"
const ITEM_REGEX = new RegExp(
  `^(.+?)\\s+(-?\\d+(?:\\.\\d+)?)\\s*(${SATUAN_PATTERN})?\\s*(?:(\\d[\\d.,]*\\s*(?:rb|ribu|jt|juta|k)?))?\\s*$`,
  'i'
);

// Rupiah parsing: "500rb", "1,5jt", "500000", "Rp 50.000"
const RUPIAH_REGEX = /^(?:rp\.?)?(\d+(?:[.,]\d+)*)(?:[.,](\d+))?\s*(rb|ribu|jt|juta|m|miliar)?$/i;

// Command detection patterns
const COMMAND_PATTERNS = {
  buka: /^(buka(?:\s+warung)?)$/,
  tutup: /^(tutup)$/,
  target: /^(target(?:\s+.+)?)$/,
  stok: /^(stok|isi|tambah|restock)(?:\s+(awal)?\s+)?(.+)$/,
  laporan: /^(total|laporan|rekap)(?:\s+hari\s+ini)?$/,
  laporanMinggu: /^(total|laporan)\s+minggu/,
  riwayat: /^(riwayat|history|riwayat\stransaksi)$/,
  pengeluaran: /^(beli|belanja|keluar|pengeluaran)(?:\s+(.+))?$/,
  blacklist: /^blacklist\s+(.+)$/,
  cekBlacklist: /^cek\s+08(\d+)$/,
  bayar: /^bayar(?:\s+(\d[\\d.,]*\s*(?:rb|ribu|jt|juta)?))?(?:\s+(\d[\\d.,]*\s*(?:rb|ribu|jt|juta)?))?$/,
  kembalian: /^(kembalian)$/,
  utang: /^utang(?:\s+([a-z]+))?(?:\s+(.+))?$/,
  jual: /^(?:jual|catat|order|jualin|in|masukin|tambahin)(?:\s+(.+))?$/,
  jualLoose: /^[a-zA-Z]+\s+\d/, // "soto 3" without prefix
  help: /^(help|bantuan|\?)$/,
  backup: /^(backup|cadangkan|export)$/,
  restore: /^(restore|pulihkan|import)$/,
};

// Utang pattern helpers
const UTANG_PATTERNS = {
  // "jual indomie 2 bks utang budi"
  pattern1: /(.+?)\s+utang\s+(.+)$/i,
  // "budi utang indomie 5 bks"
  pattern2: /^([a-z]+)\s+utang\s+(.+)$/i,
  // "pempes 1 utang si jamal"
  pattern3: /\s+utang\s+si\s+([a-z]+(?:\s+[a-z]+)?)$/i,
  // "si jamal utang karet 1 biji"
  pattern4: /^si\s+([a-z]+(?:\s+[a-z]+)?)\s+utang\s+(.+)$/i,
};

// Satuan normalization map
const SATUAN_MAP = {
  // weight
  kg: 'kg', kilo: 'kg', kilogram: 'kg', kiloan: 'kg',
  gram: 'gram', gr: 'gram', g: 'gram', ons: 'ons',
  // volume
  liter: 'liter', ltr: 'liter', l: 'liter', ml: 'ml',
  galon: 'galon', jerigen: 'jerigen',
  // count
  pcs: 'pcs', pc: 'pcs', pieces: 'pcs', ps: 'pcs',
  butir: 'butir', btr: 'butir', biji: 'biji', buah: 'buah', bua: 'buah',
  ekor: 'ekor', porsi: 'porsi', orsi: 'porsi',
  // packaging
  botol: 'botol', btl: 'botol', kaleng: 'kaleng', klg: 'kaleng',
  slop: 'slop', slp: 'slop',
  dus: 'dus', box: 'box', bx: 'box',
  pack: 'pack', pak: 'pack', pck: 'pack',
  bungkus: 'bungkus', bks: 'bungkus', bk: 'bungkus',
  krat: 'krat', krt: 'krat',
  karung: 'karung', krng: 'karung', sak: 'karung',
  peti: 'peti', pti: 'peti',
  bal: 'bal', ikat: 'ikat', ikt: 'ikat',
  karton: 'karton', ktn: 'karton',
  roll: 'roll', tabung: 'tabung', tbg: 'tabung',
  // loose
  tangkai: 'tangkai', tngk: 'tangkai',
  helai: 'helai', hlai: 'helai',
  lembar: 'lembar', lbr: 'lembar',
  batang: 'batang', btg: 'batang',
  pohon: 'pohon',
  // food
  gelas: 'gelas', cup: 'gelas', mangkok: 'mangkok',
  piring: 'piring', sendok: 'sendok', sdk: 'sendok',
  pincuk: 'pincuk', kotak: 'kotak',
};

// Command keywords for pending state cancellation
const COMMAND_KEYWORDS = /^(jual|catat|order|beli|stok|target|bayar|utang|help|buka|tutup|riwayat|laporan|total|kembalian|blacklist|cek)\b/;

// Export for use across modules
window.WarungConfig = {
  API_BASE,
  SATUAN_PATTERN,
  ITEM_REGEX,
  RUPIAH_REGEX,
  COMMAND_PATTERNS,
  UTANG_PATTERNS,
  SATUAN_MAP,
  COMMAND_KEYWORDS,
};