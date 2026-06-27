// WarungKita GenAI Module — calls serverless /api/genai (keys NOT exposed)
// Rewritten v3.4: moved API keys to Vercel serverless function

const GENAI_ENDPOINT = '/api/genai';

/**
 * Call GenAI API via serverless function
 * @param {Array} messages - [{role, content}]
 * @param {Object} opts - {temperature, max_tokens}
 * @returns {Promise<string>} - AI response text
 */
async function callGenAI(messages, opts = {}) {
  const { temperature = 0.7, max_tokens = 500 } = opts;

  try {
    const response = await fetch(GENAI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, temperature, max_tokens })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('GenAI error:', response.status, err.error || '');
      return null;
    }

    const data = await response.json();
    // Strip think blocks if present
    let text = data.choices?.[0]?.message?.content || '';
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Strip unclosed think blocks
    text = text.replace(/<think>[\s\S]*$/gi, '').trim();
    // Strip trailing artifacts
    text = text.replace(/```[\s\S]*?```/g, m => m.replace(/```/g, '')).trim();
    return text || null;
  } catch (err) {
    console.error('GenAI fetch error:', err);
    return null;
  }
}

// Export for use in app.js
if (typeof window !== 'undefined') {
  window.callGenAI = callGenAI;
}
