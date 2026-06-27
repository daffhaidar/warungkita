// WarungKita GenAI Serverless Function
// Reads B.AI API keys from Vercel env vars — NEVER exposed to client
const BAI_BASE = 'https://api.b.ai/v1/chat/completions';
const BAI_MODEL = 'minimax-m3';

// Collect all keys from env (BAI_API_KEY_1 through BAI_API_KEY_8)
function getKeys() {
  const keys = [];
  for (let i = 1; i <= 8; i++) {
    const k = process.env[`BAI_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  return keys.length > 0 ? keys : [];
}

// Simple round-robin key rotation
let keyIndex = 0;
function getNextKey(keys) {
  if (keys.length === 0) return null;
  const key = keys[keyIndex % keys.length];
  keyIndex++;
  return key;
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const keys = getKeys();
  if (keys.length === 0) {
    return res.status(503).json({ error: 'No API keys configured. Set BAI_API_KEY_1-8 in Vercel env vars.' });
  }

  const { messages, temperature = 0.7, max_tokens = 500 } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

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
          temperature,
          max_tokens
        })
      });

      if (response.status === 429) {
        // Rate limited, try next key
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `B.AI API error: ${errText}` });
      }

      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      // Network error, try next key
      if (attempt === 2) {
        return res.status(500).json({ error: `Failed after 3 attempts: ${err.message}` });
      }
    }
  }

  return res.status(429).json({ error: 'All API keys rate limited' });
}
