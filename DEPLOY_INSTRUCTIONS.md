# WarungKita v4.0 Security Patch - Deployment Instructions

## ✅ What's Been Patched

### 1. **vercel.json** - CORS Updated
- Changed from `https://warungkita.vercel.app` → `https://warungkita.web.id`
- Added `OPTIONS` method for CORS preflight
- Added `Authorization` header support
- Added `Access-Control-Max-Age: 86400` (24h cache)

### 2. **api/genai.js** - Origin + Referer Check
- Added `checkOrigin()` function - validates Origin + Referer headers
- Returns `403 Forbidden` for requests from unauthorized domains
- Handles CORS preflight (`OPTIONS` method)
- Prevents direct API access from malicious sites

### 3. **src/helpers.js** - Backup Encryption
- Added AES-GCM encryption using Web Crypto API
- PBKDF2 key derivation (100K iterations, SHA-256)
- User chooses: encrypted or plain backup
- Encrypted files: `warungkita-backup-YYYY-MM-DD-encrypted.json`
- Restore auto-detects encrypted files + prompts for password
- **Warning**: Password NOT stored - if lost, data CANNOT be recovered

---

## 🚀 Deploy Steps (Do This Now)

### Option A: Deploy from Your Local Machine (Recommended)

```bash
# 1. Clone fresh (or pull latest if already have it)
git clone https://github.com/daffhaidar/warungkita.git
cd warungkita

# 2. Copy patched files from /tmp/warungkita-patch
# Download these 3 files from the patch directory:
#   - vercel.json
#   - api/genai.js
#   - src/helpers.js
#   - DEPLOY.sh (optional helper script)

# 3. Verify changes
git diff

# 4. Commit + push
git add -A
git commit -m "security: harden API with CORS, Referer check + backup encryption (v4.0)"
git push origin main

# 5. Vercel will auto-deploy (wait 1-2 min)
```

### Option B: Manual Upload via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) → your WarungKita project
2. Click "Deploy" → "Manual Deploy"
3. Download the 3 patched files from `/tmp/warungkita-patch/`:
   - `vercel.json`
   - `api/genai.js`
   - `src/helpers.js`
4. Upload to your repo via GitHub web UI
5. Vercel auto-deploys on push

---

## ✅ Verification Checklist

After deploy completes (~1-2 min):

### 1. Check CORS Headers
```bash
curl -sI https://warungkita.web.id | grep -i 'access-control'
# Should return: access-control-allow-origin: https://warungkita.web.id
```

### 2. Test API Protection
```bash
# Should return 403 Forbidden (blocked)
curl -X POST https://warungkita.web.id/api/genai \
  -H "Origin: https://evil.com" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"content":"test","role":"user"}]}'

# Should work (allowed)
curl -X POST https://warungkita.web.id/api/genai \
  -H "Origin: https://warungkita.web.id" \
  -H "Referer: https://warungkita.web.id/" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"content":"test","role":"user"}]}'
```

### 3. Test Backup Encryption
1. Open https://warungkita.web.id
2. Ketik: `backup`
3. Click "OK" when asked about encryption
4. Enter password (min 4 chars)
5. Confirm password
6. Download file: `warungkita-backup-YYYY-MM-DD-encrypted.json`
7. Verify file content is JSON with `salt`, `iv`, `data` fields (not plaintext)

### 4. Test Restore Encrypted Backup
1. Ketik: `restore`
2. Select the encrypted backup file
3. Enter password when prompted
4. Should see: "✅ Data berhasil dipulihkan!"

---

## 🔒 Cloudflare Rate Limiting (Free Tier)

Since you're on Cloudflare Free tier, here's how to enable rate limiting:

### Option 1: Cloudflare WAF Custom Rule (Free)
1. Login to Cloudflare Dashboard
2. Go to: **Security** → **WAF** → **Custom rules**
3. Click **Create rule**
4. Settings:
   - **Rule name**: `Rate Limit - GenAI API`
   - **Field**: `URI Path` **contains** `/api/genai`
   - **Action**: `Block` (or `Managed Challenge`)
   - **Rate limiting**: 
     - Request rate: `100` requests per `5 minutes`
     - Scope: `IP address`
5. Click **Deploy**

### Option 2: Upgrade to Cloudflare Pro ($20/mo)
- Unmetered mitigation
- Advanced rate limiting rules
- WAF custom rules with more granularity

---

## 📋 Summary of Changes

| File | Changes | Impact |
|------|---------|--------|
| `vercel.json` | CORS origin → `.web.id`, added OPTIONS | Blocks cross-origin requests from unauthorized domains |
| `api/genai.js` | Origin + Referer validation, 403 on fail | Prevents direct API abuse from curl/Postman |
| `src/helpers.js` | AES-GCM encryption for backups | Protects sensitive data (transactions, utang) if file leaks |

---

## ⚠️ Important Notes

1. **CORS Origin**: Now locked to `https://warungkita.web.id`. If you also want `.vercel.app` to work, update vercel.json to support both (or use wildcard).

2. **Backup Password**: Users MUST remember their password. No recovery mechanism (by design). Consider adding a hint system if needed.

3. **Browser Compatibility**: Web Crypto API supported in:
   - Chrome 37+
   - Firefox 34+
   - Safari 10+
   - Edge 14+
   - All modern mobile browsers

4. **Rate Limiting**: In-memory rate limiting still active (10 req/min/IP). For production, migrate to Vercel KV or Cloudflare WAF.

---

## 🎯 Next Steps After Deploy

1. ✅ Deploy to Vercel
2. ✅ Verify CORS headers
3. ✅ Test API protection (should block evil.com)
4. ✅ Test backup encryption flow
5. ✅ Enable Cloudflare WAF rate limiting
6. ✅ Monitor Vercel logs for 403 errors (legit users vs attackers)

---

**Questions?** Reach out in Telegram.