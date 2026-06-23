"""WarungKita Backend — FastAPI + SQLite + AI Parser."""
import hmac, json, os, re, secrets
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from database import init_db, get_db, get_setting, set_setting, today, now
from parser import parse_message
from security import rate_limit_middleware, validate_chat_message, validate_warung_name, check_api_key

app = FastAPI(title="WarungKita API", version="1.3.0")

# CORS — restrict to known origins
ALLOWED_ORIGINS = [
    "https://warungkita-app.vercel.app",
    "https://warungkita.vercel.app", 
    "https://54.169.227.204",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
    max_age=86400,
)

# ---- MODELS ----
class ChatRequest(BaseModel):
    message: str
    warung_name: str = ""

    @field_validator("message")
    @classmethod
    def sanitize_message(cls, v: str) -> str:
        return validate_chat_message(v)

class ChatResponse(BaseModel):
    action: str
    reply: str  
    data: dict = {}

# ---- STARTUP ----
@app.on_event("startup")
async def startup():
    init_db()
    # Generate API key if not set (first run)
    from database import set_setting, get_setting
    existing = get_setting("api_key", "")
    if not existing:
        new_key = "wk_" + secrets.token_urlsafe(32)
        set_setting("api_key", new_key)
        print(f"[WARUNGKITA] Generated new API key: {new_key}", flush=True)
        print(f"[WARUNGKITA] ⚠️  Save this! It's stored in DB now.", flush=True)

# ---- HEALTH ----
@app.get("/api/health")
async def health():
    """Public health check (no auth required)."""
    try:
        db = get_db()
        db.execute("SELECT 1").fetchone()
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {str(e)}"
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "db": db_status,
        "version": "1.3.0",
    }

# ---- INIT (bootstrap API key to frontend) ----
@app.get("/api/init")
async def init(t: str = ""):
    """Bootstrap endpoint: return API key for the frontend.

    Two-tier protection:
    1. Admin token (from URL ?t= or X-Admin-Token header) — full key returned.
       Set via WARUNGKITA_ADMIN_TOKEN env var (default: same as API key for first deploy).
    2. No token — returns masked key (first 8 + *** + last 4) so it's safe to expose.

    The frontend only needs the full key if it's a trusted first-party PWA install.
    Browser fingerprinting + masked key is enough for normal usage.
    """
    expected_admin = os.getenv("WARUNGKITA_ADMIN_TOKEN", "")
    provided = t or ""

    key = get_setting("api_key", "")
    if not key:
        raise HTTPException(503, "API key not initialized")

    # Admin token path — full key
    if expected_admin and provided and hmac.compare_digest(provided, expected_admin):
        return {"api_key": key, "masked": False}

    # Public path — masked key
    masked = key[:8] + "***" + key[-4:] if len(key) > 12 else "***"
    return {"api_key": masked, "masked": True}

# ---- API KEY ROUTES (require key) ----
# ---- ENDPOINTS (require API key) ----

@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request, _: None = Depends(check_api_key)):
    """Main chat endpoint — parse message, execute action, return response."""
    # Rate limit
    await rate_limit_middleware(request)

    db = get_db()
    msg = req.message.strip()
    if not msg:
        return ChatResponse(action="unknown", reply="Ketik sesuatu dong 🙂")

    # Get products for parser context
    products = [dict(p) for p in db.execute("SELECT * FROM products").fetchall()]

    # Parse intent
    parsed = await parse_message(msg, products)
    action = parsed.get("action", "unknown")
    params = parsed.get("params", {})

    # Execute action
    try:
        if action == "record_sale":
            return _handle_record_sale(db, params)
        elif action == "set_stock":
            return _handle_set_stock(db, params)
        elif action == "check_stock":
            return _handle_check_stock(db)
        elif action == "set_target":
            return _handle_set_target(db, params)
        elif action == "check_target":
            return _handle_check_target(db)
        elif action == "daily_report":
            return _handle_daily_report(db)
        elif action == "blacklist_add":
            return _handle_blacklist_add(db, params)
        elif action == "blacklist_check":
            return _handle_blacklist_check(db, params)
        elif action == "close_shop":
            return _handle_close_shop(db)
        elif action == "open_shop":
            return _handle_open_shop(db)
        elif action == "set_price":
            return _handle_set_price(db, params)
        elif action == "help":
            return _handle_help()
        else:
            return ChatResponse(
                action="unknown",
                reply="""🤖 Hmm, aku gak ngerti maksudnya 😅

Coba ketik "help" buat liat yang bisa aku bantu ya~"""
            )
    except Exception as e:
        return ChatResponse(action="error", reply=f"⚠️ Error: {str(e)}")

@app.get("/api/state")
async def get_state(_: None = Depends(check_api_key)):
    """Get complete warung state for frontend hydration."""
    db = get_db()
    date = today()
    state_row = db.execute("SELECT * FROM daily_state WHERE date=?", (date,)).fetchone()
    products = [dict(p) for p in db.execute("SELECT * FROM products").fetchall()]
    stocks = {}
    for s in db.execute("SELECT s.*, p.name FROM stock s JOIN products p ON s.product_id=p.id").fetchall():
        stocks[s["name"]] = {"qty": s["qty"], "satuan": s["satuan"]}

    txns = []
    for t in db.execute("SELECT * FROM transactions WHERE date=? ORDER BY created_at DESC LIMIT 50", (date,)).fetchall():
        txns.append({
            "id": t["id"],
            "items": json.loads(t["items"]),
            "total": t["total"],
            "time": t["time"],
        })

    blacklist = {}
    for b in db.execute("SELECT * FROM blacklist").fetchall():
        blacklist[b["phone"]] = {
            "reason": b["reason"],
            "loss_amount": b["loss_amount"],
            "created_at": b["created_at"],
        }

    return {
        "warung_name": get_setting("warung_name", ""),
        "is_open": bool(state_row["is_open"]) if state_row else True,
        "target_amount": state_row["target_amount"] if state_row else 0,
        "products": products,
        "stock": stocks,
        "transactions_today": txns,
        "blacklist": blacklist,
        "total_today": sum(t["total"] for t in txns),
    }

@app.post("/api/setup")
async def setup(data: dict, _: None = Depends(check_api_key)):
    """Set warung name (validated)."""
    name = validate_warung_name(data.get("name", "").strip())
    if name:
        set_setting("warung_name", name)
        return {"status": "ok", "name": name}
    raise HTTPException(400, "Name required")

# ---- ACTION HANDLERS ----

def _match_product(db, name: str):
    """Find product by name or keyword match."""
    name = name.lower().strip()
    # Direct match first
    for p in db.execute("SELECT * FROM products").fetchall():
        if name == p["name"].lower():
            return dict(p)
    # Keyword match
    for p in db.execute("SELECT * FROM products").fetchall():
        keywords = p["keywords"].split(",")
        for kw in keywords:
            if kw.strip() in name or name in kw.strip():
                return dict(p)
    return None

def _rupiah(n): return f"Rp{n:,}".replace(",", ".")

def _handle_record_sale(db, params) -> ChatResponse:
    items = params.get("items", [])
    if not items:
        return ChatResponse(action="record_sale", reply="Formatnya: jual soto 2, telur 1kg")
    
    txn_items = []
    total = 0
    stock_updates = []
    
    for item in items:
        product = _match_product(db, item["name"])
        if not product:
            return ChatResponse(action="record_sale", reply=f"Produk '{item['name']}' gak dikenal. Ketik 'help' buat liat daftar produk.")
        
        qty = item["qty"]
        price = product["price"]
        subtotal = price * int(qty)
        total += subtotal
        
        txn_items.append({
            "name": product["name"],
            "qty": qty,
            "price": price,
            "total": subtotal,
        })
        
        # Check stock
        stock = db.execute("SELECT * FROM stock WHERE product_id=?", (product["id"],)).fetchone()
        if stock:
            new_qty = max(0, stock["qty"] - qty)
            stock_updates.append({
                "name": product["name"],
                "old_qty": stock["qty"],
                "new_qty": new_qty,
                "satuan": stock["satuan"],
            })
    
    # Save transaction
    txn_id = f"T{datetime.now().strftime('%y%m%d%H%M%S')}"
    date = today()
    time = now()
    
    db.execute(
        "INSERT INTO transactions (id, date, time, items, total) VALUES (?,?,?,?,?)",
        (txn_id, date, time, json.dumps(txn_items), total),
    )
    
    # Update stock
    for su in stock_updates:
        product = _match_product(db, su["name"])
        if product:
            db.execute(
                "UPDATE stock SET qty=? WHERE product_id=?",
                (su["new_qty"], product["id"]),
            )
    
    db.commit()
    
    # Build reply
    reply = "📝 Mau catat nih:\n\n"
    for item in txn_items:
        reply += f"✅ {item['name']}: {item['qty']} × {_rupiah(item['price'])} = {_rupiah(item['total'])}\n"
    reply += f"\n💰 Total: {_rupiah(total)}"
    
    for su in stock_updates:
        if su["old_qty"] != su["new_qty"]:
            reply += f"\n📦 {su['name']}: {su['old_qty']}{su['satuan']} → {su['new_qty']}{su['satuan']}"
    
    # Check target
    target = db.execute("SELECT target_amount FROM daily_state WHERE date=?", (date,)).fetchone()
    if target and target["target_amount"] > 0:
        today_total = sum(
            json.loads(t["items"])[0]["total"] if len(json.loads(t["items"])) == 1 else 
            sum(i["total"] for i in json.loads(t["items"]))
            for t in db.execute("SELECT items FROM transactions WHERE date=?", (date,)).fetchall()
        )
        pct = int(today_total / target["target_amount"] * 100)
        reply += f"\n🎯 {_rupiah(today_total)} / {_rupiah(target['target_amount'])} ({pct}%)"
    
    return ChatResponse(action="record_sale", reply=reply, data={"txn_id": txn_id, "total": total})

def _handle_set_stock(db, params) -> ChatResponse:
    items = params.get("items", [])
    if not items:
        return ChatResponse(action="set_stock", reply="Format: stok telur 10kg")
    
    reply = "📦 Stok diupdate:\n"
    for item in items:
        product = _match_product(db, item["name"])
        if not product:
            reply += f"❌ {item['name']}: produk gak dikenal\n"
            continue
        
        satuan = item.get("satuan", product["satuan"])
        qty = item["qty"]
        
        existing = db.execute("SELECT * FROM stock WHERE product_id=?", (product["id"],)).fetchone()
        if existing:
            old = existing["qty"]
            db.execute("UPDATE stock SET qty=? WHERE product_id=?", (qty, product["id"]))
            reply += f"✅ {product['name']}: {old}{existing['satuan']} → {qty}{satuan}\n"
        else:
            db.execute("INSERT INTO stock (product_id, qty, satuan) VALUES (?,?,?)",
                      (product["id"], qty, satuan))
            reply += f"✅ {product['name']}: {qty}{satuan}\n"
    
    db.commit()
    return ChatResponse(action="set_stock", reply=reply)

def _handle_check_stock(db) -> ChatResponse:
    stocks = db.execute("""
        SELECT s.*, p.name FROM stock s 
        JOIN products p ON s.product_id=p.id 
        ORDER BY p.name
    """).fetchall()
    
    if not stocks:
        return ChatResponse(action="check_stock", reply="📦 Belum ada stok tercatat.\nKetik: stok telur 10kg")
    
    reply = "📦 Stok Sekarang:\n"
    for s in stocks:
        alert = " ⚠️ menipis!" if s["qty"] <= 2 else ""
        reply += f"  {s['name']}: {s['qty']}{s['satuan']}{alert}\n"
    
    return ChatResponse(action="check_stock", reply=reply, data={
        "stocks": [{"name": s["name"], "qty": s["qty"], "satuan": s["satuan"]} for s in stocks]
    })

def _handle_set_target(db, params) -> ChatResponse:
    amount = params.get("amount", 0)
    if not amount or amount <= 0:
        return ChatResponse(action="set_target", reply="Format: target 500rb atau target 500000")
    
    date = today()
    db.execute(
        "INSERT INTO daily_state (date, target_amount) VALUES (?,?) "
        "ON CONFLICT(date) DO UPDATE SET target_amount=?",
        (date, amount, amount),
    )
    db.commit()
    
    return ChatResponse(action="set_target", reply=f"🎯 Target hari ini: {_rupiah(amount)}\nSemangat jualannya! 🔥")

def _handle_check_target(db) -> ChatResponse:
    target = db.execute("SELECT target_amount FROM daily_state WHERE date=?", (today(),)).fetchone()
    if not target or target["target_amount"] <= 0:
        total = _get_today_total(db)
        return ChatResponse(action="check_target",
            reply=f"Belum ada target. Ketik target 500rb\n\n📊 Total hari ini: {_rupiah(total)}")
    
    total = _get_today_total(db)
    pct = int(total / target["target_amount"] * 100)
    emoji = "🎉 TERCAPAI!" if pct >= 100 else "🔥 Hampir!" if pct >= 70 else "💪 Gas terus!"
    
    return ChatResponse(action="check_target",
        reply=f"🎯 {_rupiah(total)} / {_rupiah(target['target_amount'])} ({pct}%)\n{emoji}")

def _handle_daily_report(db) -> ChatResponse:
    txns = db.execute("SELECT * FROM transactions WHERE date=? ORDER BY created_at", (today(),)).fetchall()
    if not txns:
        return ChatResponse(action="daily_report", reply="📊 Belum ada transaksi hari ini.")
    
    total = sum(t["total"] for t in txns)
    item_counts = {}
    for t in txns:
        for item in json.loads(t["items"]):
            name = item["name"]
            item_counts[name] = item_counts.get(name, 0) + item["qty"]
    
    sorted_items = sorted(item_counts.items(), key=lambda x: -x[1])
    
    reply = f"📊 Laporan Hari Ini\n\n💵 Total: {_rupiah(total)}\n📝 {len(txns)} transaksi\n\n🏆 Terlaris:\n"
    medals = ["🥇", "🥈", "🥉"]
    for i, (name, qty) in enumerate(sorted_items[:5]):
        medal = medals[i] if i < 3 else "  "
        reply += f"{medal} {name}: {qty}\n"
    
    target = db.execute("SELECT target_amount FROM daily_state WHERE date=?", (today(),)).fetchone()
    if target and target["target_amount"] > 0:
        pct = int(total / target["target_amount"] * 100)
        reply += f"\n🎯 Target: {_rupiah(target['target_amount'])} ({pct}%)"
    
    return ChatResponse(action="daily_report", reply=reply)

def _handle_blacklist_add(db, params) -> ChatResponse:
    phone = params.get("phone", "").strip()
    reason = params.get("reason", "order fiktif")
    loss = params.get("loss", 0)
    
    if not phone:
        return ChatResponse(action="blacklist_add", reply="Format: blacklist 08123456789")
    
    db.execute(
        "INSERT OR REPLACE INTO blacklist (phone, reason, loss_amount) VALUES (?,?,?)",
        (phone, reason, loss),
    )
    db.commit()
    
    return ChatResponse(action="blacklist_add", reply=f"⚠️ {phone} ditambahkan ke blacklist.\nAlasan: {reason}")

def _handle_blacklist_check(db, params) -> ChatResponse:
    phone = params.get("phone", "").strip()
    if not phone:
        return ChatResponse(action="blacklist_check", reply="Format: cek 08123456789")
    
    entry = db.execute("SELECT * FROM blacklist WHERE phone=?", (phone,)).fetchone()
    if entry:
        return ChatResponse(action="blacklist_check",
            reply=f"⚠️ HATI-HATI!\n{phone} pernah {entry['reason']}\nTanggal: {entry['created_at']}\n\nSaran: minta DP dulu!")
    
    return ChatResponse(action="blacklist_check", reply=f"✅ {phone} aman, gak ada di blacklist.")

def _handle_close_shop(db) -> ChatResponse:
    date = today()
    tm = now()
    
    db.execute(
        "INSERT INTO daily_state (date, is_open, closed_at) VALUES (?,0,?) "
        "ON CONFLICT(date) DO UPDATE SET is_open=0, closed_at=?",
        (date, tm, tm),
    )
    db.commit()
    
    # Get report
    total = _get_today_total(db)
    txns = db.execute("SELECT COUNT(*) as cnt FROM transactions WHERE date=?", (date,)).fetchone()
    target = db.execute("SELECT target_amount FROM daily_state WHERE date=?", (date,)).fetchone()
    
    reply = f"🌙 Warung ditutup ({tm})\n\n📋 Rekap:\n💵 Omzet: {_rupiah(total)}\n📝 {txns['cnt']} transaksi"
    if target and target["target_amount"] > 0:
        pct = int(total / target["target_amount"] * 100)
        reply += f"\n🎯 Target: {_rupiah(target['target_amount'])} ({pct}%)"
    
    reply += "\n\nData aman tersimpan. Besok bilang 'buka' ya!"
    
    return ChatResponse(action="close_shop", reply=reply, data={"total": total})

def _handle_open_shop(db) -> ChatResponse:
    date = today()
    db.execute(
        "INSERT INTO daily_state (date, is_open, opened_at) VALUES (?,1,?) "
        "ON CONFLICT(date) DO UPDATE SET is_open=1, opened_at=?",
        (date, now(), now()),
    )
    db.commit()
    
    total = _get_today_total(db)
    reply = f"☀️ Warung dibuka lagi!\n📊 Total hari ini: {_rupiah(total)}"
    
    return ChatResponse(action="open_shop", reply=reply)

def _handle_set_price(db, params) -> ChatResponse:
    name = params.get("name", "").strip()
    price = params.get("price", 0)
    if not name or price <= 0:
        return ChatResponse(action="set_price", reply="Format: harga soto 20000")
    
    product = _match_product(db, name)
    if product:
        db.execute("UPDATE products SET price=? WHERE id=?", (price, product["id"]))
        db.commit()
        return ChatResponse(action="set_price", reply=f"✅ Harga {product['name']}: {_rupiah(price)}/{product['satuan']}")
    
    return ChatResponse(action="set_price", reply=f"Produk '{name}' gak dikenal.")

def _handle_help() -> ChatResponse:
    return ChatResponse(action="help", reply="""📖 Yang bisa aku bantu:
📝 jual soto 2, telur 1kg — catat transaksi
📦 stok telur 10kg — set stok
📦 stok — cek stok sekarang
🎯 target 500rb — pasang target
🎯 target — cek progress
📊 total hari ini — laporan
⚠️ cek 0812xxx — cek blacklist
⚠️ blacklist 0812xxx — tambah blacklist
🔒 tutup — tutup warung
🔓 buka — buka lagi""")

def _get_today_total(db) -> int:
    txns = db.execute("SELECT total FROM transactions WHERE date=?", (today(),)).fetchall()
    return sum(t["total"] for t in txns)

# ---- RUN ----
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
