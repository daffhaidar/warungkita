"""Rate limiting + request validation + API key auth."""
import hmac, hashlib, time
from fastapi import Request, HTTPException
from collections import defaultdict
from database import get_setting

# Per-IP rate limits
RATE_WINDOW = 60  # 1 minute
MAX_REQUESTS = 30  # 30 requests per minute per IP
MAX_MSG_LENGTH = 500  # max chat message length

_ip_buckets = defaultdict(list)

def _cleanup_buckets():
    now = time.time()
    for ip in list(_ip_buckets.keys()):
        _ip_buckets[ip] = [t for t in _ip_buckets[ip] if now - t < RATE_WINDOW]
        if not _ip_buckets[ip]:
            del _ip_buckets[ip]

async def rate_limit_middleware(request: Request):
    """Block IPs exceeding rate limit."""
    ip = request.client.host if request.client else "unknown"
    now = time.time()

    # Cleanup old entries
    _ip_buckets[ip] = [t for t in _ip_buckets[ip] if now - t < RATE_WINDOW]

    if len(_ip_buckets[ip]) >= MAX_REQUESTS:
        raise HTTPException(429, "Terlalu banyak request. Coba lagi sebentar ya.")

    _ip_buckets[ip].append(now)

async def check_api_key(request: Request):
    """Validate X-API-Key header against stored key (constant-time compare)."""
    provided = request.headers.get("X-API-Key", "")
    if not provided:
        raise HTTPException(401, "Missing X-API-Key header")
    expected = get_setting("api_key", "")
    if not expected:
        raise HTTPException(503, "API key not initialized — server misconfigured")
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(403, "Invalid API key")
    return True

def validate_chat_message(text: str) -> str:
    """Sanitize chat input."""
    if not text or not isinstance(text, str):
        raise HTTPException(400, "Pesan kosong")
    if len(text) > MAX_MSG_LENGTH:
        raise HTTPException(400, f"Pesan kepanjangan (max {MAX_MSG_LENGTH} karakter)")
    # Strip control chars
    text = ''.join(c for c in text if ord(c) >= 32 or c in '\n\t')
    return text.strip()

def validate_warung_name(name: str) -> str:
    """Validate warung name."""
    if not name or len(name) > 100:
        raise HTTPException(400, "Nama warung gak valid")
    # Allow letters, numbers, spaces, basic punctuation
    import re
    if not re.match(r'^[\w\s\-.,&()]+$', name):
        raise HTTPException(400, "Nama warung mengandung karakter aneh")
    return name.strip()
