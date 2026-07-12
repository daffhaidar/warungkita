#!/bin/bash
# WarungKita v4.0 Security Patch Deploy Script
# Run this from your local machine with git credentials configured

set -e

echo "🔧 WarungKita v4.0 Security Patch Deploy"
echo "========================================"
echo ""
echo "Changes:"
echo "  ✅ vercel.json: CORS updated to https://warungkita.web.id"
echo "  ✅ api/genai.js: Added Origin + Referer check, OPTIONS preflight"
echo "  ✅ src/helpers.js: Backup encryption (AES-GCM) + decrypt support"
echo ""

cd "$(dirname "$0")"

echo "📝 Git status:"
git status --short
echo ""

read -p "Push to GitHub? (y/n): " confirm
if [ "$confirm" != "y" ]; then
  echo "❌ Deploy cancelled"
  exit 1
fi

git add -A
git commit -m "security: harden API with CORS, Referer check + backup encryption (v4.0)"
git push origin main

echo ""
echo "✅ Pushed to GitHub!"
echo ""
echo "🚀 Next steps:"
echo "  1. Vercel will auto-deploy from GitHub"
echo "  2. Wait ~1-2 min for deployment"
echo "  3. Verify: curl -sI https://warungkita.web.id | grep -i 'access-control'"
echo "  4. Test backup: Open app → ketik 'backup' → pilih 'Yes' untuk enkripsi"
echo ""