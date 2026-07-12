// WarungKita GenAI Serverless Function (v4.0 — Hardened+)
// Security: rate limiting (Redis-ready), CORS, Referer check, input validation
// Keys from Vercel env vars — NEVER exposed to client

const BAI_BASE = 'https://api.b.ai/v1/chat/completions';
const BAI_MODEL = 'minimax-m3';
const ALLOWED_ORIGIN = 'https://warungkita.vercel.app';

// --- CORS & Referer Check ---
function checkOrigin(req) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  
  // Check Origin header (for CORS preflight/actual requests)
  if (origin && origin !== ALLOWED_ORIGIN) {
    return { valid: false, error: 'Invalid origin' };
  }
  
  // Check Referer header (for simple POST requests)
  if (referer && !referer.startsWith(ALLOWED_ORIGIN)) {
    return { valid: false, error: 'Invalid referer' };
  }
  
  return { valid: true };
}

// --- Rate Limiting (in-memory, per-IP) ---
// TODO: Migrate to Vercel KV for production: 
//   import { kv } from '@vercel/kv';
//   const count = await kv.incr(`rate:${ip}`);
//   await kv.expire(`rate:${ip}`, 60);
const RATE_WINDOW_MS = 60_000;      // 1 minute
const RATE_MAX_REQS = 10;            // 10 requests per minute per IP
const rateBuckets = new Map();       // ip -> [timestamps]

function checkRateLimit(ip) {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const timestamps = (rateBuckets.get(ip) || []).filter(t => t > cutoff);
  
  if (timestamps.length >= RATE_MAX_REQS) {
    return false; // rate limited
  }
  timestamps.push(now);
  rateBuckets.set(ip, timestamps);
  
  // Cleanup old entries periodically (prevent memory leak)
  if (rateBuckets.size > 1000) {
    for (const [key, val] of rateBuckets) {
      const filtered = val.filter(t => t > cutoff);
      if (filtered.length === 0) rateBuckets.delete(key);
      else rateBuckets.set(key, filtered);
    }
  }
  return true;
}

// --- Input Validation ---
const MAX_MESSAGES = 20;          // max messages array length
const MAX_MSG_CONTENT = 2000;     // max chars per message content
const MAX_TOTAL_TOKENS = 2500;    // cap max_tokens param (MiniMax-M3 is a reasoning model — it spends tokens on <think> first; <1500 truncates mid-reasoning and leaves an empty answer)
const MIN_TEMP = 0;
const MAX_TEMP = 2;

function validateInput(body) {
  const { messages, temperature = 0.7, max_tokens = 500 } = body;
  
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { error: 'messages array required' };
  }
  if (messages.length > MAX_MESSAGES) {
    return { error: `Too many messages (max ${MAX_MESSAGES})` };
  }
  for (const msg of messages) {
    if (!msg || typeof msg.content !== 'string') {
      return { error: 'Each message must have content string' };
    }
    if (msg.content.length > MAX_MSG_CONTENT) {
      return { error: `Message too long (max ${MAX_MSG_CONTENT} chars)` };
    }
  }
  const temp = Number(temperature);
  if (isNaN(temp) || temp < MIN_TEMP || temp > MAX_TEMP) {
    return { error: 'Invalid temperature (0-2)' };
  }
  const tokens = Number(max_tokens);
  if (isNaN(tokens) || tokens < 1 || tokens > MAX_TOTAL_TOKENS) {
    return { error: `Invalid max_tokens (1-${MAX_TOTAL_TOKENS})` };
  }
  return null; // no error
}

// --- Key Rotation ---
function getKeys() {
  const keys = [];
  for (let i = 1; i <= 8; i++) {
    const k = process.env[`BAI_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  return keys;
}

let keyIndex = 0;
function getNextKey(keys) {
  if (keys.length === 0) return null;
  const key = keys[keyIndex % keys.length];
  keyIndex++;
  return key;
}

// --- Handler ---
export default async function handler(req, res) {
  // Method check
  if (req.method !== 'POST' && req.method !== 'OPTIONS') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Origin & Referer check (prevent direct API access)
  const originCheck = checkOrigin(req);
  if (!originCheck.valid) {
    return res.status(403).json({ error: 'Forbidden: Invalid origin' });
  }

  // Rate limit — use only the FIRST IP from x-forwarded-for (Vercel sets the
  // real client IP as the leftmost entry). Using the raw header as the key let
  // an attacker rotate it (e.g. "1.1.1.1, x") to mint a fresh bucket per request.
  const fwd = req.headers['x-forwarded-for'];
  const ip = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Slow down.' });
  }

  // Input validation
  const validationError = validateInput(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError.error });
  }

  const keys = getKeys();
  if (keys.length === 0) {
    return res.status(503).json({ error: 'Service unavailable' });
  }

  const { messages, temperature = 0.7, max_tokens = 500 } = req.body;

  // Try up to 3 keys in case of rate limit
  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getNextKey(keys);

    try {
      const response = await fetch(BAI_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: BAI_MODEL,
          messages,
          temperature: Number(temperature),
          max_tokens: Math.min(Number(max_tokens), MAX_TOTAL_TOKENS)
        })
      });

      if (response.status === 429) {
        continue; // try next key
      }

      if (!response.ok) {
        const errText = await response.text();
        // Don't leak backend error details to client
        return res.status(response.status).json({ error: 'AI service error' });
      }

      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      if (attempt === 2) {
        return res.status(500).json({ error: 'Service temporarily unavailable' });
      }
    }
  }

  return res.status(429).json({ error: 'AI service busy, try again later' });
}
