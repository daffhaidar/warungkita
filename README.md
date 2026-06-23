# WarungKita 🏪

AI chat-based assistant untuk UMKM Indonesia. Catat transaksi, pantau stok, pasang target jualan — cukup chat kayak chat biasa.

## Fitur

- **📝 Catat Jualan** — chat "jual soto 2" → AI parsing + konfirmasi → tersimpan
- **📦 Pantau Stok** — stok otomatis berkurang tiap transaksi, isi ulang tinggal chat
- **🎯 Target Jualan** — pasang target harian, lihat progress real-time
- **📊 Laporan Harian** — rekap otomatis pas tutup warung
- **⚠️ Blacklist** — catat & cek nomor yang pernah order fiktif
- **🔒 Tutup Warung** — fitur tutup dengan rekap + opsi buka lagi

## Struktur

```
warungkita/
├── frontend/          # Web app (mobile-first chat UI)
│   ├── index.html     # Main HTML
│   ├── style.css      # Styles (warm cream + sage)
│   └── app.js         # Chat logic + mock AI parser
├── backend/           # (coming soon) FastAPI + SQLite
├── docs/              # Documentation
└── preview/           # Static preview (archived)
```

## Tech Stack

- **Frontend:** HTML/CSS/JS (vanilla, mobile-first)
- **Backend:** Python + FastAPI (planned)
- **Database:** SQLite (planned)
- **AI:** LLM API untuk chat parsing (planned)

## Cara Pakai

1. Buka `frontend/index.html` di browser
2. Masukin nama warung
3. Mulai chat!

## IDCamp Developer Challenge #2

Submission untuk IDCamp Developer Challenge: Digitalization & Acceleration of MSMEs with Generative AI.

Partner UMKM: **Soto Sapi Nana Wulan** — Sleman, Yogyakarta

---

Dibuat khusus untuk UMKM Indonesia 🇮🇩
