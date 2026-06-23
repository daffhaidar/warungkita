#!/bin/bash
# WarungKita SQLite Backup — hourly
# Keeps last 24 backups (24h retention)
set -euo pipefail

BACKUP_DIR="/home/ubuntu/backups/warungkita"
DB_PATH="/home/ubuntu/warungkita/backend/warungkita.db"
TS=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/warungkita_${TS}.db"

mkdir -p "$BACKUP_DIR"

# Use sqlite3 .backup for safe online backup (WAL-safe)
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# Compress
gzip -f "$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"

# Verify integrity
if [ ! -s "$BACKUP_FILE" ]; then
    echo "[ERROR] Backup empty: $BACKUP_FILE" >&2
    exit 1
fi

# Retention: keep 24 latest
cd "$BACKUP_DIR"
ls -1t warungkita_*.db.gz 2>/dev/null | tail -n +25 | xargs -r rm -f

# Log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] backup OK: $(basename $BACKUP_FILE) ($(stat -c %s $BACKUP_FILE) bytes)"
