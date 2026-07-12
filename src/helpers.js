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

function backupData() {
  try {
    const data = localStorage.getItem('warungkita_state') || '{}';
    const date = new Date().toISOString().slice(0, 10);
    
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
