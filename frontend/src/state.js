/**
 * WarungKita — state.js
 * Global state object, loadState(), saveState()
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ---- STATE ----
let state = {
  namaWarung: '',
  buka: true,
  targetHarian: 0,
  stok: {},            // { 'telur': { qty, satuan, nama }, ... }
  transaksi: [],       // [{ id, items, total, waktu }]
  blacklist: {},
  pendingTx: null,
  // NEW FIELDS:
  pengeluaran: [],     // [{ id, items, total, waktu, keterangan }]
  hargaCustom: {},     // LEGACY — migrated to itemConfig on load
  itemConfig: {},      // { 'nama_item': { harga, satuan, nama } } — per-item config
  pendingPrice: null,  // { nama, qty, satuan, callback } — when waiting for user to confirm price
  pendingPengeluaran: null, // { items, total, waktu, callback } — when waiting for user to confirm expense
  pendingStockWarning: null, // { items, missing } — stock check before transaksi
  pendingBayar: null,  // { total } — saved last transaction total for "bayar" follow-up
  pendingStokQuestion: null, // transient — when asking "10 apa? (pcs/bungkus/dus)"
  pendingFuzzy: null, // { input, suggested, callback } — typo suggestion flow
  pendingUtangAskName: null, // { itemsText } — when "janji utang mangkok 1 biji" has no person name
  // Setup wizard flag
  setupDone: false,
  // Debt tracking (utang piutang)
  utang: {},           // { 'budi': { items:[{nama,qty,harga}], total, tanggal, lunas } }
  // Typo auto-correction map: { 'rkok surya': 'rokok surya' }
  typoMap: {},
};

