# WarungKita

> Asisten chat untuk UMKM Indonesia. Catat transaksi, pantau stok, kelola utang, hitung kembalian — cukup chat seperti WhatsApp.

[![Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://warungkita.vercel.app)
[![Stack](https://img.shields.io/badge/stack-Vanilla_JS_+_PWA-8b7e6a)](https://github.com/daffhaidar/warungkita)

---

## Masalah

Indonesia punya **64 juta pelaku UMKM** yang menyumbang **60% PDB nasional** — tapi hanya 12% yang berhasil mengintegrasikan teknologi ke dalam operasional bisnisnya. Mayoritas masih mencatat transaksi di buku tulis, mengandalkan promosi dari mulut ke mulut, dan menghitung stok secara manual.

Tools digital yang tersedia terlalu rumit, terlalu mahal, atau tidak berbahasa Indonesia. Pelaku UMKM butuh sesuatu yang **segampang chat**.

## Solusi

**WarungKita** menggantikan buku catatan dengan tampilan chat yang familiar. Pemilik warung cukup mengetik seperti biasa — tanpa formulir, tanpa spreadsheet, tanpa perlu belajar.

```
👤 "jual indomie 2 bks 3500"
🤖 ✅ Indomie: 2 bks × Rp3.500 = Rp7.000

👤 "jamal utang karet gelang 1 biji 500"
🤖 💳 Tercatat utang Jamal: Rp500

👤 "bayar 7000 10000"
🤖 💰 Kembalian: Rp3.000
```

## Cara Pakai

1. Buka **warungkita.vercel.app** di HP
2. Ketik nama warung, tekan **"Gas mulai"**
3. Langsung bisa dipake — ketik aja kayak chat WhatsApp

Contoh perintah sehari-hari:

| Mau ngapain? | Ketik |
|---|---|
| Catet jualan | `jual soto 2` |
| Jual + langsung kasih harga | `jual indomie 1 bks 3500` |
| Catet utang pelanggan | `utang budi soto 2 15000` |
| Jual + catet utang sekaligus | `jual rokok 1 pack utang budi` |
| Hitung kembalian | `bayar 35000 50000` |
| Catet pengeluaran/beli bahan | `beli minyak 20rb` |
| Cek stok | `stok` |
| Lihat laporan hari ini | `total hari ini` |
| Lihat daftar utang | `utang` |
| Bikin promosi WA Story (AI) | pencet chip `📣 Promosi` |
| Tutup warung + rekap | `tutup` |

---

## Fitur & Trigger Words

### 📝 Catat Penjualan

| Perintah | Contoh | Keterangan |
|----------|--------|------------|
| `jual [item] [qty]` | `jual indomie 2 bks` | Catat transaksi, harga diinget otomatis |
| `jual [item] [qty] [harga]` | `jual indomie 2 bks 3500` | Auto-create item + harga sekaligus |
| `jual [item] [qty] [satuan] utang [nama]` | `jual rokok 1 pack utang budi` | Jual + catat utang dalam satu perintah |
| `[nama] utang [item] [qty]` | `budi utang indomie 5 bks` | Pola utang alternatif |
| `si [nama] utang [item] [qty]` | `si jamal utang karet 1 biji` | Dengan marker "si" |
| `[item] utang si [nama]` | `pempes 1 utang si jamal` | Nama di belakang |

### 💳 Utang (Kasbon)

| Perintah | Contoh | Keterangan |
|----------|--------|------------|
| `utang [nama] [item] [qty] [harga]` | `utang budi indomie 2 3500` | Catat utang langsung |
| `utang` | `utang` | Lihat semua daftar utang |
| `utang [nama]` | `utang budi` | Lihat detail utang satu orang |
| `bayar utang [nama] [jumlah]` | `bayar utang budi 5000` | Bayar sebagian |
| `utang lunas [nama]` | `utang lunas budi` | Tandai lunas |

### 💰 Kembalian

| Perintah | Contoh | Keterangan |
|----------|--------|------------|
| `bayar [total] [uang]` | `bayar 35000 50000` | Hitung kembalian |
| `bayar` | `bayar` | Kembalian dari transaksi terakhir |
| `kembalian` | `kembalian` | Hitung ulang dari transaksi terakhir |

> Support: `bayar 35rb 50rb`, `bayar 1jt 1.5jt`

### 📦 Stok

| Perintah | Contoh | Keterangan |
|----------|--------|------------|
| `stok [item] [qty]` | `stok telur 10kg` | Set stok awal |
| `stok [item] [qty] [harga]` | `stok indomie 10 bks 3500` | Stok + auto-create harga |
| `isi/tambah/restock [item] [qty]` | `isi telur 5kg` | Tambah stok |
| `stok` | `stok` | Cek stok sekarang |

> Jual item yang belum ada stoknya → bot nanya: "Mau stok dulu atau lanjut?"

### 💸 Pengeluaran

| Perintah | Contoh | Keterangan |
|----------|--------|------------|
| `beli [item] [harga]` | `beli minyak 20rb` | Catat pengeluaran |
| `belanja [item] [harga]` | `belanja daging 50rb` | Sama dengan `beli` |
| `pengeluaran` | `pengeluaran` | Lihat daftar pengeluaran hari ini |

### 🎯 Target

| Perintah | Contoh | Keterangan |
|----------|--------|------------|
| `target [jumlah]` | `target 500rb` | Pasang target harian |
| `target` | `target` | Cek progress (dengan progress bar) |

> Support: `500rb`, `1jt`, `1.5jt`, `2,5jt`, `500000`

### 📊 Laporan

| Perintah | Contoh | Keterangan |
|----------|--------|------------|
| `total hari ini` | `total hari ini` | Omzet, transaksi, produk terlaris, untung bersih |
| `laporan` | `laporan` | Sama dengan `total hari ini` |
| `riwayat` / `history` | `riwayat` | Daftar semua transaksi hari ini |

### ⚠️ Blacklist

| Perintah | Contoh | Keterangan |
|----------|--------|------------|
| `blacklist [nomor]` | `blacklist 08123456789` | Tambah nomor bermasalah |
| `cek [nomor]` | `cek 08123456789` | Cek apakah nomor di blacklist |

### 🔒 Tutup Warung

| Perintah | Contoh | Keterangan |
|----------|--------|------------|
| `tutup` | `tutup` | Rekap harian + opsi cetak laporan + share WhatsApp |
| `buka` | `buka` | Buka warung lagi |

### 📖 Lainnya

| Perintah | Contoh | Keterangan |
|----------|--------|------------|
| `help` / `bantuan` / `?` | `help` | Lihat menu bantuan |
| `backup` / `cadangkan` / `export` | `backup` | Unduh cadangan data (JSON) |
| `restore` / `pulihkan` / `import` | `restore` | Pulihkan data dari file cadangan |

---

## Fitur Utama

### 🧠 100% Generic — Tanpa Hardcode Produk
Sistem tidak menghardcode nama produk atau harga. Item apa saja bisa dicatat — dari indomie sampai karet gelang. Harga dan satuan diinget otomatis setelah input pertama.

### 📏 Satuan Fleksibel
Support 50+ satuan lokal Indonesia: `kg`, `bks` (bungkus), `btr` (butir), `pcs`, `ekor`, `krat`, `dus`, `slop`, `lbr` (lembar), `btg` (batang), dan banyak lagi. Satuan baru diterima apa adanya.

### 🔍 Typo Tolerance
Sistem punya fuzzy matching (Levenshtein distance) — kalau user ngetik "rkok surya", bot nanya: "Maksudnya **Rokok Surya**? (Ya/Bukan)". Typo yang sudah dikonfirmasi disimpan untuk koreksi otomatis.

### 💳 Utang (Kasbon)
Fitur krusial untuk warung Indonesia. Catat utang pelanggan lewat chat, pantau siapa yang belum bayar, dan tandai lunas. Total utang muncul di rekap tutup warung.

### 💰 Kembalian
Hitung kembalian instan — cukup ketik `bayar 35000 50000`. Setelah transaksi, bot otomatis nanya "Pembeli bayar berapa?"

### 📱 PWA
Bisa di-install sebagai app di HP (Add to Home Screen). Data tersimpan di localStorage — offline tetap jalan.

### 💾 Backup & Restore Data
Karena data tersimpan di localStorage (per-perangkat), pemilik warung bisa mengamankan datanya kapan saja. Ketik `backup` untuk mengunduh snapshot JSON (`warungkita-backup-YYYY-MM-DD.json`) — simpan di Google Drive atau kirim ke WhatsApp sendiri. Saat ganti HP, clear cache, atau install ulang, ketik `restore` lalu pilih file cadangannya. Sepenuhnya client-side, tanpa server.

### 🤖 AI Ringkasan (Generative AI)
Setiap kali user membuka laporan harian (`laporan`) atau menutup warung (`tutup`), sistem secara otomatis menghasilkan ringkasan naratif menggunakan **MiniMax-M3** (Generative AI). Ringkasan mencakup analisis omzet, produk terlaris, progress target, dan motivasi harian — dalam bahasa Indonesia yang natural dan emoji. Didukung oleh 8 API key dengan rotasi otomatis untuk availability tinggi.

> ⏳ **Catatan soal waktu respons:** ringkasan AI butuh beberapa detik (umumnya ~5–10 detik) untuk muncul, dan ini **wajar**. MiniMax-M3 adalah *reasoning model* — sebelum menjawab, ia "berpikir" dulu lewat proses `<think>` internal untuk menganalisis data dengan lebih hati-hati dan akurat sebelum mengeluarkan output. Jadi delay ini adalah trade-off yang disengaja: jawaban yang lebih matang dan relevan, bukan respons asal cepat. Selama menunggu, indikator titik-titik ("🤖 AI lagi nganalisis...") akan tampil supaya jelas prosesnya sedang berjalan.

### 📣 AI Promosi — Caption WhatsApp Story (Generative AI)
Pencet chip **📣 Promosi**, dan WarungKita pakai **MiniMax-M3** untuk membuatkan caption promosi siap-pakai berdasarkan nama warung dan produk terlaris. Hasilnya bisa langsung **disalin** atau **dibagikan ke WhatsApp** (native share sheet → Status di HP, fallback `wa.me` di desktop) — tinggal tempel jadi WA Story buat narik pelanggan.

```
👤 (pencet 📣 Promosi)
🤖 📣 Promosi buat WA Story:
   Lagi lapar ngganjel perut? 😋🍜
   Soto ayam gurih + es teh seger, lengkap di Warung Bu Sri!
   Mampir sekarang, kamu bakal balik lagi! 🥤
   [ 📋 Salin ]  [ 📲 Share ke WA ]
```

> Menjawab kebutuhan UMKM "pembuatan materi promosi otomatis" — pemilik warung yang nggak punya waktu/skill bikin caption tinggal sekali pencet.

---

## Stack Teknologi

| Lapisan | Teknologi |
|---------|-----------|
| Frontend | Vanilla HTML/CSS/JS (mobile-first) |
| State | localStorage (client-side) |
| Parser | Regex + NLP lokal (tanpa API call) |
| GenAI | MiniMax-M3 via B.AI API (8-key rotation) |
| Deployment | Vercel (static) |
| PWA | Service Worker + Web App Manifest |

**Arsitektur:** Frontend-only, zero backend dependency. Semua parsing dan state management di client-side. Data tersimpan di browser localStorage.

---

## Mulai Cepat

```bash
# Clone
git clone https://github.com/daffhaidar/warungkita.git
cd warungkita

# Development
python3 -m http.server 8080
# Buka http://localhost:8080

# Production
# Deploy ke Vercel, Netlify, atau hosting static manapun
```

---

## Struktur Proyek

```
warungkita/
├── index.html       # App shell (PWA)
├── style.css        # Tema warm cream + earth tones
├── genai.js         # Helper pemanggil GenAI (serverless)
├── src/             # Logika modular (parser, state, UI, fitur)
│   ├── config.js    # Konfigurasi & deteksi environment
│   ├── state.js     # Manajemen state + localStorage
│   ├── input.js     # Parser perintah chat
│   ├── transactions.js, items.js, utang.js, pengeluaran.js, report.js, tutup.js
│   ├── chat.js, events.js, helpers.js, utils.js, pwa.js
├── api/
│   └── genai.js     # Serverless function — proxy ke B.AI (key server-side)
├── sw.js            # Service Worker (PWA)
├── manifest.json    # Web App Manifest
├── favicon.svg      # Ikon warung
├── vercel.json      # Security headers + CORS
├── preview/         # Purwarupa statis (arsip)
└── README.md
```

---

## Studi Kasus

WarungKita dikembangkan bersama **[Soto Sapi Nana Wulan](https://maps.app.goo.gl/BaAHPFkbaCHZXQpTA)** — warung keluarga di Minggir, Sleman, Yogyakarta (rating 5.0 ⭐ di Google Maps).

Tantangan utama yang diidentifikasi:
- Pencatatan transaksi masih manual di buku tulis
- Tidak ada sistem pencatatan utang pelanggan (kasbon)
- Hitung kembalian dan rekap harian memakan waktu

WarungKita menjawab ketiga masalah tersebut dalam satu antarmuka chat.

**Dampak yang terukur:**
- Rekap harian: dari **~30 menit manual** → **hitungan detik** dengan satu perintah chat
- Pencatatan utang: dari **"siapa tadi yang ngutang?"** → **daftar utang otomatis** per pelanggan
- Kembalian: dari **itung manual** → **instan** (`bayar 35rb 50rb`)

---

## Konteks Submission

Proyek ini dibangun untuk **IDCamp Developer Challenge #2: Digitalisasi & Akselerasi UMKM dengan Generative AI** (Mei–Juli 2026).

**Keputusan desain:**
- Mobile-first dengan fallback offline
- Sepenuhnya Bahasa Indonesia
- Tanpa registrasi akun
- Alur konfirmasi sebelum penyimpanan (UX pemaaf)
- 100% generic — cocok untuk warung jenis apapun

---

<p align="center">
  <sub>Dibuat untuk 64 juta UMKM Indonesia</sub>
</p>
