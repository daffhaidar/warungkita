/**
 * WarungKita — helpers.js
 * Help text, modal helpers, init chat
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ---- HELP ----
function showHelp() {
  addBotMsg(`📖 <strong>Perintah:</strong><br><br>
📝 <strong>"jual soto 3"</strong> — catat jualan<br>
💸 <strong>"beli minyak 20rb"</strong> — catat pengeluaran<br>
📦 <strong>"stok soto 20 mangkok"</strong> — set stok<br>
🎯 <strong>"target 500rb"</strong> — pasang target<br>
💰 <strong>"bayar 35000 50000"</strong> — hitung kembalian<br>
💳 <strong>"utang budi soto 2 15000"</strong> — catat utang<br>
📊 <strong>"total"</strong> — laporan hari ini<br>
📋 <strong>"riwayat"</strong> — daftar transaksi<br>
🔒 <strong>"tutup"</strong> — tutup warung + rekap<br>
📖 <strong>"help"</strong> — menu ini`);
}

// ---- MODAL HELPERS ----
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ---- BACKUP / RESTORE (client-side, no backend) ----
// Protects a real warung's data: localStorage is wiped on cache-clear / new
// phone / reinstall. "backup" downloads a JSON snapshot; "restore" re-imports it.
// v4.0: Added optional encryption using Web Crypto API (AES-GCM)
// v4.1: Added CSV export (Excel-compatible) + WhatsApp report + PDF export

// Generate encryption key from password using PBKDF2
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt data with password
async function encryptData(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  
  // Package: salt + iv + encrypted data (all as base64)
  const package = {
    salt: b64(salt),
    iv: b64(iv),
    data: b64(new Uint8Array(encrypted))
  };
  return JSON.stringify(package);
}

// Decrypt data with password
async function decryptData(encryptedJson, password) {
  try {
    const pkg = JSON.parse(encryptedJson);
    if (!pkg.salt || !pkg.iv || !pkg.data) {
      throw new Error('Invalid format');
    }
    const salt = b64d(pkg.salt);
    const iv = b64d(pkg.iv);
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      b64d(pkg.data)
    );
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
  } catch (e) {
    throw new Error('Decryption failed. Wrong password or corrupted file.');
  }
}

// Base64 helpers
function b64(arr) {
  return btoa(String.fromCharCode(...arr));
}
function b64d(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

// ---- CSV EXPORT (Excel-compatible) ----
function exportToCSV() {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const headers = ['Tanggal', 'Jam', 'Item', 'Qty', 'Satuan', 'Harga', 'Total', 'Tipe'];
    
    // Collect all transactions
    const rows = [];
    state.transaksi.forEach(t => {
      const [tgl, jam] = t.waktu.split(' ');
      t.items.forEach(i => {
        rows.push([
          tgl,
          jam || '00:00',
          i.nama,
          i.qty,
          i.satuan,
          i.harga,
          i.total,
          'jual'
        ]);
      });
    });
    
    // Add expenses
    (state.pengeluaran || []).forEach(p => {
      const [tgl, jam] = p.waktu.split(' ');
      p.items.forEach(i => {
        rows.push([
          tgl,
          jam || '00:00',
          i.nama,
          i.qty,
          i.satuan,
          i.harga,
          i.total,
          'beli'
        ]);
      });
    });
    
    // Build CSV
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warungkita-laporan-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addBotMsg(`✅ Excel/CSV terunduh: <strong>warungkita-laporan-${date}.csv</strong><br>Bisa dibuka di Excel, Google Sheets, atau Numbers.`);
  } catch (e) {
    addBotMsg('❌ Gagal export CSV. Coba lagi ya.');
  }
}

// ---- WHATSAPP REPORT ----
function sendWhatsAppReport() {
  try {
    const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const totalOmzet = state.transaksi.reduce((sum, t) => sum + t.total, 0);
    const totalTransaksi = state.transaksi.length;
    const totalPengeluaran = (state.pengeluaran || []).reduce((sum, p) => sum + p.total, 0);
    const bersih = totalOmzet - totalPengeluaran;
    
    // Top products
    const productCount = {};
    state.transaksi.forEach(t => {
      t.items.forEach(i => {
        productCount[i.nama] = (productCount[i.nama] || 0) + i.qty;
      });
    });
    const topProducts = Object.entries(productCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    // Total utang
    let totalUtang = 0;
    Object.values(state.utang || {}).forEach(u => {
      if (!u.lunas) totalUtang += u.total;
    });
    
    // Build message
    let msg = `📊 *LAPORAN HARIAN - ${state.namaWarung}*\n`;
    msg += `📅 ${today}\n\n`;
    msg += `💰 *Omzet:* Rp ${totalOmzet.toLocaleString('id-ID')}\n`;
    msg += `📦 *Transaksi:* ${totalTransaksi}\n`;
    msg += `💸 *Pengeluaran:* Rp ${totalPengeluaran.toLocaleString('id-ID')}\n`;
    msg += `✅ *Bersih:* Rp ${bersih.toLocaleString('id-ID')}\n\n`;
    
    if (topProducts.length > 0) {
      msg += `🏆 *Terlaris:*\n`;
      topProducts.forEach(([nama, qty], i) => {
        msg += `${i + 1}. ${nama} (${qty}x)\n`;
      });
      msg += '\n';
    }
    
    if (totalUtang > 0) {
      msg += `💳 *Total Utang:* Rp ${totalUtang.toLocaleString('id-ID')}\n\n`;
    }
    
    msg += `_Dibuat otomatis oleh WarungKita_`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(msg).then(() => {
      addBotMsg(`✅ Laporan disalin! Sekarang tinggal paste ke WhatsApp.\n\n<b>Atau klik:</b> <a href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank">📲 Buka WhatsApp</a>`);
    }).catch(() => {
      addBotMsg(`✅ Laporan siap!<br><a href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank">📲 Kirim ke WhatsApp</a>`);
    });
  } catch (e) {
    addBotMsg('❌ Gagal bikin laporan. Coba lagi ya.');
  }
}

// ---- PDF EXPORT (Simple) ----
function exportToPDF() {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const totalOmzet = state.transaksi.reduce((sum, t) => sum + t.total, 0);
    const totalTransaksi = state.transaksi.length;
    
    // Simple HTML-based PDF (print-friendly)
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Laporan - ${state.namaWarung}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { color: #6b8c4e; border-bottom: 2px solid #6b8c4e; padding-bottom: 10px; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .summary div { margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #6b8c4e; color: white; }
    tr:nth-child(even) { background: #f9f9f9; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>📊 Laporan Harian - ${state.namaWarung}</h1>
  <p>📅 ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  
  <div class="summary">
    <div>💰 <strong>Omzet:</strong> Rp ${totalOmzet.toLocaleString('id-ID')}</div>
    <div>📦 <strong>Transaksi:</strong> ${totalTransaksi}</div>
    <div>✅ <strong>Bersih:</strong> Rp ${totalOmzet.toLocaleString('id-ID')}</div>
  </div>
  
  <h2>Riwayat Transaksi</h2>
  <table>
    <thead>
      <tr><th>Waktu</th><th>Item</th><th>Qty</th><th>Total</th></tr>
    </thead>
    <tbody>
      ${state.transaksi.map(t => 
        t.items.map(i => `
          <tr>
            <td>${t.waktu}</td>
            <td>${i.nama}</td>
            <td>${i.qty} ${i.satuan}</td>
            <td>Rp ${i.total.toLocaleString('id-ID')}</td>
          </tr>
        `).join('')
      ).join('')}
    </tbody>
  </table>
  
  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    Dibuat otomatis oleh WarungKita
  </p>
  
  <script>
    // Auto-print on load
    window.onload = () => {
      if (confirm('Mau cetak laporan ini?')) {
        window.print();
      }
    };
  </script>
</body>
</html>`;
    
    // Open in new window
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    
    addBotMsg(`✅ Laporan PDF dibuka di tab baru.<br>Klik kanan → "Save as PDF" atau tekan Ctrl+P untuk cetak.`);
  } catch (e) {
    addBotMsg('❌ Gagal bikin PDF. Coba lagi ya.');
  }
}

function backupData() {
  try {
    const date = new Date().toISOString().slice(0, 10);
    
    // Show format options
    const options = confirm(
      'Pilih format backup:\n\n' +
      '✅ OK = JSON (untuk restore data)\n' +
      '❌ Cancel = CSV (Excel/Google Sheets)\n\n' +
      'Mau yang mana?'
    );
    
    if (options) {
      // JSON backup (existing flow)
      const data = localStorage.getItem('warungkita_state') || '{}';
      
      // Ask user if they want encryption
      const wantEncrypt = confirm('Mau enkripsi backup dengan password? (Recommended biar aman kalo file jatuh ke orang lain)');
      
      if (wantEncrypt) {
        const password = prompt('Masukkan password untuk enkripsi:\n\n⚠️ PASSWORD INI PENTING! Kalo lupa, data GA BISA dibalikin.\nSimpan password di tempat aman (password manager / catet di buku).');
        if (!password || password.length < 4) {
          addBotMsg('❌ Batal backup. Password minimal 4 karakter.');
          return;
        }
        const confirmPass = prompt('Konfirmasi password (ketik ulang):');
        if (password !== confirmPass) {
          addBotMsg('❌ Password ga cocok. Backup dibatalkan.');
          return;
        }
        
        // Encrypt and download
        encryptData(JSON.parse(data), password).then(encrypted => {
          const blob = new Blob([encrypted], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `warungkita-backup-${date}-encrypted.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          addBotMsg(`✅ Backup terenkripsi: <strong>warungkita-backup-${date}-encrypted.json</strong><br>⚠️ <strong>PENTING:</strong> Password ga tersimpan di file! Kalo lupa password, data GA BISA dibalikin.<br>Simpan password di tempat aman, baru download file.`);
        }).catch(err => {
          addBotMsg('❌ Gagal enkripsi backup. Coba lagi ya.');
        });
      } else {
        // Plain backup (no encryption)
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `warungkita-backup-${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addBotMsg(`✅ Backup terunduh: <strong>warungkita-backup-${date}.json</strong><br>⚠️ File ini TIDAK terenkripsi. Simpan di tempat aman (Google Drive / WhatsApp sendiri). Kalo ganti HP atau kehapus, ketik <strong>"restore"</strong> buat balikin semua data.`);
      }
    } else {
      // CSV export
      exportToCSV();
    }
  } catch (e) {
    addBotMsg('❌ Gagal bikin backup. Coba lagi ya.');
  }
}

function restoreData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const content = ev.target.result;
        let parsed;
        
        // Check if encrypted (has salt, iv, data fields)
        try {
          const pkg = JSON.parse(content);
          if (pkg.salt && pkg.iv && pkg.data) {
            // Encrypted backup - ask for password
            const password = prompt('File backup ini terenkripsi.\nMasukkan password untuk decrypt:');
            if (!password) {
              addBotMsg('❌ Restore dibatalkan.');
              return;
            }
            parsed = decryptData(content, password);
          } else {
            // Plain backup
            parsed = pkg;
          }
        } catch (e) {
          throw new Error('format salah');
        }
        
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('format salah');
        }
        // Merge onto current state so missing fields keep their defaults.
        state = { ...state, ...parsed };
        saveState();
        addBotMsg('✅ Data berhasil dipulihkan! Memuat ulang aplikasi...');
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        addBotMsg('❌ File ga valid atau password salah. Pastikan itu file backup dari WarungKita (warungkita-backup-*.json) ya.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ---- INIT CHAT ----
function renderChat() {
  if (!state.namaWarung) return;
  addDateLabel();
  // If there are saved transactions, show summary
  if (state.transaksi.length) {
    const total = state.transaksi.reduce((s, t) => s + t.total, 0);
    addBotMsg(`Selamat datang kembali! 👋<br>📊 Total hari ini: <strong>${rupiah(total)}</strong> (${state.transaksi.length} transaksi)`);
  }
  if (!state.buka) {
    document.getElementById('closedOverlay').classList.add('active');
    document.getElementById('statusBar').innerHTML = '<span class="dot merah"></span> <span>Warung tutup</span>';
    document.getElementById('btnTutupHeader').style.display = 'none';
    document.getElementById('chatInput').disabled = true;
    document.getElementById('chatInput').placeholder = 'Warung lagi tutup..';
    document.getElementById('btnSend').disabled = true;
  }
}
