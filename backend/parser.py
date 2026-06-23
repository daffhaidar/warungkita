"""LLM Parser — NLP intent extraction via B.AI API."""
import json, os, httpx

BAI_API_KEY = os.getenv("BAI_API_KEY", "")
BAI_BASE_URL = os.getenv("BAI_BASE_URL", "https://api.b.ai/v1")
MODEL = os.getenv("LLM_MODEL", "kimi-k2.5")

SYSTEM_PROMPT = """Kamu adalah parser untuk aplikasi WarungKita — asisten chat untuk UMKM (warung) Indonesia.

Tugasmu: baca pesan user lalu keluarkan JSON dengan action dan parameter.

Format output WAJIB:
{"action": "...", "params": {...}, "reply": "..."}

Daftar action:
1. record_sale — jual/catat/order. params: {items: [{name, qty, satuan}]}, reply: ringkasan
2. set_stock — set stok. params: {items: [{name, qty, satuan}]}, reply: konfirmasi
3. check_stock — cek stok. params: {}, reply: "stok"
4. set_target — pasang target. params: {amount: int}, reply: konfirmasi
5. check_target — cek target. params: {}, reply: "target"
6. daily_report — laporan/total. params: {}, reply: "laporan"
7. blacklist_add — tambah blacklist. params: {phone: str, reason: str, loss: int}, reply: konfirmasi
8. blacklist_check — cek blacklist. params: {phone: str}, reply: "blacklist"
9. close_shop — tutup warung. params: {}, reply: "tutup"
10. open_shop — buka warung. params: {}, reply: "buka"
11. set_price — set harga produk. params: {name: str, price: int}, reply: konfirmasi
12. help — bantuan. params: {}, reply: "help"
13. unknown — gak ngerti. params: {}, reply: penjelasan singkat

Rules:
- "500rb" = 500000, "1jt" = 1000000, "1,5jt" = 1500000
- Satuan default "porsi" kecuali explicit (kg, liter, gelas, ekor)
- Item name WAJIB lowercase (nanti matching di backend)
- Reply WAJIB dalam bahasa Indonesia casual, friendly, singkat
- Kalo gak yakin action apa, pakai "unknown" dengan reply yang nanya balik
- JANGAN tambah field lain selain action, params, reply
- JANGAN kasih markdown, JANGAN kasih ```json```
"""

async def parse_message(text: str, products: list[dict]) -> dict:
    """Parse user message via LLM, return structured intent."""
    
    # Build product catalog for context
    catalog = "\n".join(
        f"- {p['name']}: {p['keywords']} | Rp{p['price']}/{p['satuan']}"
        for p in products
    )
    
    user_prompt = f"""Produk tersedia:
{catalog}

Pesan user: "{text}"

Output JSON:"""

    # Try B.AI first
    result = await _call_llm(SYSTEM_PROMPT, user_prompt)
    
    if result:
        try:
            parsed = json.loads(result)
            if "action" in parsed:
                return parsed
        except json.JSONDecodeError:
            # Try to extract JSON from response
            import re
            m = re.search(r'\{[^{}]*"action"[^{}]*\}', result, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group())
                except:
                    pass
    
    # Fallback: local parser
    return _local_parse(text)

async def _call_llm(system: str, user: str) -> str | None:
    """Call B.AI API."""
    if not BAI_API_KEY:
        return None
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{BAI_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {BAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 500,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
    except Exception:
        pass
    
    return None

def _local_parse(text: str) -> dict:
    """Local fallback parser (no LLM)."""
    t = text.lower().strip()
    
    # Target
    if t.startswith("target"):
        rest = t.replace("target", "").strip()
        if not rest:
            return {"action": "check_target", "params": {}, "reply": "target"}
        num = _parse_rupiah(rest)
        if num:
            return {"action": "set_target", "params": {"amount": num}, "reply": f"target {num}"}
    
    # Stok
    if t == "stok":
        return {"action": "check_stock", "params": {}, "reply": "stok"}
    if t.startswith(("stok ", "isi ", "tambah ", "restock ")):
        items = _parse_items(t.replace("stok ", "").replace("isi ", "").replace("tambah ", "").replace("restock ", ""))
        if items:
            return {"action": "set_stock", "params": {"items": items}, "reply": "stok"}
    
    # Jual
    if t.startswith(("jual ", "catat ", "order ")):
        rest = t.replace("jual ", "").replace("catat ", "").replace("order ", "")
        items = _parse_items(rest)
        if items:
            return {"action": "record_sale", "params": {"items": items}, "reply": "transaksi"}
    
    # Laporan
    if any(w in t for w in ["total", "laporan", "rekap", "omzet"]):
        return {"action": "daily_report", "params": {}, "reply": "laporan"}
    
    # Blacklist
    if t.startswith("blacklist ") or t.startswith("blokir "):
        phone = t.replace("blacklist ", "").replace("blokir ", "").strip()
        return {"action": "blacklist_add", "params": {"phone": phone, "reason": "order fiktif", "loss": 0}, "reply": "blacklist"}
    if t.startswith("cek ") and any(c.isdigit() for c in t):
        phone = t.replace("cek ", "").strip()
        return {"action": "blacklist_check", "params": {"phone": phone}, "reply": "blacklist"}
    
    # Tutup / Buka
    if t in ("tutup", "tutup warung", "close"):
        return {"action": "close_shop", "params": {}, "reply": "tutup"}
    if t in ("buka", "buka warung", "buka lagi", "open"):
        return {"action": "open_shop", "params": {}, "reply": "buka"}
    
    # Help
    if t in ("help", "bantuan", "?"):
        return {"action": "help", "params": {}, "reply": "help"}
    
    # Number only -> target
    num = _parse_rupiah(t)
    if num and num > 0:
        return {"action": "set_target", "params": {"amount": num}, "reply": f"target {num}"}
    
    return {"action": "unknown", "params": {}, "reply": "unknown"}

def _parse_rupiah(text: str) -> int | None:
    """500rb→500000, 1jt→1000000, 1,5jt→1500000"""
    t = text.lower().replace("rp.", "").replace("rp", "").replace(" ", "")
    m = __import__("re").match(r'^(\d+(?:[.,]\d+)?)\s*(rb|ribu|jt|juta|m|miliar)?$', t)
    if not m:
        return None
    num = float(m.group(1).replace(",", "."))
    mult = m.group(2) or ""
    if mult in ("rb", "ribu"): num *= 1000
    elif mult in ("jt", "juta"): num *= 1_000_000
    elif mult in ("m", "miliar"): num *= 1_000_000_000
    return int(num)

def _parse_items(text: str) -> list[dict]:
    """Parse "soto 2, telur 1kg" into structured items."""
    items = []
    for part in text.split(","):
        part = part.strip()
        m = __import__("re").match(r'^(.+?)\s+(\d+(?:\.\d+)?)\s*(kg|gram|liter|gelas|ekor|pcs|porsi|batang)?$', part, __import__("re").IGNORECASE)
        if m:
            items.append({
                "name": m.group(1).strip().lower(),
                "qty": float(m.group(2)),
                "satuan": (m.group(3) or "porsi").lower(),
            })
    return items
