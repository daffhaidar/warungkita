# WarungKita

> Asisten chat berbasis AI untuk UMKM Indonesia. Catat transaksi, pantau stok, pasang target penjualan — cukup chat seperti WhatsApp.

[![Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://warungkita-app-zeta.vercel.app)
[![Stack](https://img.shields.io/badge/stack-FastAPI_+_SQLite_+_Vanilla_JS-8b7e6a)](https://github.com/daffhaidar/warungkita)

---

## Masalah

Indonesia punya **64 juta pelaku UMKM** yang menyumbang **60% PDB nasional** — tapi hanya 12% yang berhasil mengintegrasikan teknologi ke dalam operasional bisnisnya. Mayoritas masih mencatat transaksi di buku tulis, mengandalkan promosi dari mulut ke mulut, dan menghitung stok secara manual. 

Tools digital yang tersedia terlalu rumit, terlalu mahal, atau tidak berbahasa Indonesia. Pelaku UMKM butuh sesuatu yang **segampang chat**.

## Solusi

**WarungKita** menggantikan buku catatan dengan tampilan chat yang familiar. Pemilik warung cukup mengetik seperti biasa, dan AI yang akan mencatat, menghitung, serta merangkum datanya. Tanpa formulir. Tanpa spreadsheet. Tanpa perlu belajar.

```
👤 "jual soto 2, telur 1kg"
🤖 ✅ Tercatat: Rp65.000 | Stok diupdate

👤 "total hari ini?"
🤖 📊 Rp335.000 (67% dari target)
```

## Fitur

| Fitur | Contoh Perintah | Deskripsi |
|---|---|---|
| **Catat Penjualan** | `jual soto 2, telur 1kg` | NLP parsing + konfirmasi sebelum simpan |
| **Pantau Stok** | `stok telur 10kg` / `stok` | Otomatis berkurang tiap penjualan, alert menipis |
| **Target Penjualan** | `target 500rb` / `target` | Support singkatan: `500rb`, `1.5jt`, `2,5jt` |
| **Laporan Harian** | `total hari ini` | Omzet, jumlah transaksi, produk terlaris |
| **Riwayat Pelanggan** | `blacklist 0812xxx` / `cek 0812xxx` | Catat nomor bermasalah |
| **Tutup Warung** | `tutup` | Rekap otomatis + opsi buka kembali |

## Arsitektur

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend    │────▶│   Nginx      │────▶│   FastAPI    │
│  (Vercel)    │     │  (rate limit,│     │  (port 8000) │
│  Vanilla JS  │     │   CSP, SSL)  │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                          ┌───────▼───────┐
                                          │    SQLite     │
                                          │  (persistent) │
                                          └───────────────┘
```

**Frontend:** Vanilla HTML/CSS/JS, mobile-first, arsitektur backend-first. Fallback ke parser lokal saat API tidak terjangkau.

**Backend:** FastAPI dengan dual-layer parsing — LLM via B.AI (`kimi-k2.5`) untuk input kompleks, parser regex lokal sebagai cadangan.

**Keamanan:** Rate limiting (Nginx + FastAPI), CORS whitelist, validasi input (maksimal 500 karakter, XSS filtering), CSP headers, HSTS.

## Stack Teknologi

| Lapisan | Teknologi |
|---|---|
| Frontend | Vanilla HTML/CSS/JS (mobile-first) |
| Backend | Python 3.11 + FastAPI |
| Database | SQLite (WAL mode) |
| AI Parser | B.AI API (`kimi-k2.5`) + regex fallback |
| Deployment | Vercel (frontend) + self-hosted (backend) |
| Reverse Proxy | Nginx (rate limiting, SSL termination) |

## Mulai Cepat

```bash
# Clone
git clone https://github.com/daffhaidar/warungkita.git
cd warungkita

# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env  # isi BAI_API_KEY
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend (development)
cd ../frontend
python3 -m http.server 8080
# Buka http://localhost:8080
```

**Production:** Lihat `backend/warungkita.service` untuk konfigurasi systemd.

## Studi Kasus: Warung Soto di Sleman

WarungKita dikembangkan bersama **mitra UMKM nyata** di Sleman, Yogyakarta — sebuah warung soto keluarga dengan rating 5.0 ⭐ di Google Maps yang menjual berbagai produk mulai dari soto sapi, telur bebek, hingga tiwul.

Selama pengembangan, kami mengidentifikasi beberapa tantangan utama yang dihadapi warung tradisional:
- Pencatatan transaksi masih manual di buku tulis, menyulitkan rekap bulanan
- Promosi hanya mengandalkan WhatsApp Story secara bergantian antar anggota keluarga
- Tidak ada sistem pencatatan riwayat pelanggan untuk menghindari transaksi bermasalah

WarungKita dirancang untuk menjawab ketiga masalah tersebut dalam satu antarmuka chat yang sederhana.

## Konteks Submission

Proyek ini dibangun untuk **IDCamp Developer Challenge #2: Digitalisasi & Akselerasi UMKM dengan Generative AI** (Mei–Juli 2026).

**Keputusan desain utama:**
- Mobile-first dengan fallback offline (penting untuk koneksi tidak stabil)
- Sepenuhnya Bahasa Indonesia (target pengguna tidak berbahasa Inggris)
- Tanpa registrasi akun, tanpa onboarding berbelit (interaksi pertama sudah produktif)
- Alur konfirmasi sebelum penyimpanan (UX pemaaf untuk pengguna non-teknis)

## Struktur Proyek

```
warungkita/
├── frontend/
│   ├── index.html          # SPA shell
│   ├── style.css           # Tema warm cream + sage
│   ├── app.js              # Logika chat (backend-first)
│   └── favicon.svg         # Ikon warung
├── backend/
│   ├── main.py             # Aplikasi FastAPI
│   ├── database.py         # Skema SQLite + helper
│   ├── parser.py           # Parser intent (LLM + fallback)
│   ├── security.py         # Rate limiting + validasi input
│   ├── requirements.txt    # Dependensi Python
│   └── warungkita.service  # Unit file systemd
├── preview/                # Purwarupa statis (arsip)
└── README.md
```

---

<p align="center">
  <sub>Dibuat untuk 64 juta UMKM Indonesia 🇮🇩</sub>
</p>
