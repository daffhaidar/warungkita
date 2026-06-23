"""WarungKita Database — SQLite with session management."""
import sqlite3, os, json, threading

DB_PATH = os.path.join(os.path.dirname(__file__), "warungkita.db")

_local = threading.local()

def get_db() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = sqlite3.connect(DB_PATH)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA foreign_keys=ON")
    return _local.conn

def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS warung (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            keywords TEXT NOT NULL,
            price INTEGER NOT NULL,
            satuan TEXT DEFAULT 'porsi'
        );
        CREATE TABLE IF NOT EXISTS stock (
            product_id INTEGER PRIMARY KEY,
            qty REAL NOT NULL,
            satuan TEXT NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(id)
        );
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            items TEXT NOT NULL,
            total INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS blacklist (
            phone TEXT PRIMARY KEY,
            reason TEXT DEFAULT 'order fiktif',
            loss_amount INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS daily_state (
            date TEXT PRIMARY KEY,
            is_open INTEGER DEFAULT 1,
            target_amount INTEGER DEFAULT 0,
            opened_at TEXT,
            closed_at TEXT
        );

        -- Default products
        INSERT OR IGNORE INTO products (name, keywords, price, satuan) VALUES
            ('Soto Sapi', 'soto,sapi,soto sapi', 15000, 'porsi'),
            ('Soto Ayam', 'ayam,soto ayam', 12000, 'porsi'),
            ('Nasi Goreng', 'nasi,nasi goreng', 15000, 'porsi'),
            ('Telur Bebek', 'telur,telur bebek', 35000, 'kg'),
            ('Nila Goreng', 'nila,nila goreng', 25000, 'porsi'),
            ('Kambing', 'kambing', 50000, 'kg'),
            ('Ikan Nila', 'ikan,ikan nila', 20000, 'kg'),
            ('Tiwul', 'tiwul', 10000, 'porsi'),
            ('Es Teh', 'teh,es teh', 5000, 'gelas'),
            ('Es Jeruk', 'jeruk,es jeruk', 7000, 'gelas');
    """)
    db.commit()

def get_setting(key, default=None):
    row = get_db().execute("SELECT value FROM warung WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default

def set_setting(key, value):
    get_db().execute("INSERT OR REPLACE INTO warung (key, value) VALUES (?,?)", (key, value))
    get_db().commit()

def today():
    from datetime import datetime
    return datetime.now().strftime("%Y-%m-%d")

def now():
    from datetime import datetime
    return datetime.now().strftime("%H:%M")
