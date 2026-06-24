// WarungKita GenAI Module — B.AI minimax-m3 with 8-key rotation
// Auto-generated. Do not edit keys manually.

const BAI_KEYS = ["sk-1ev28hirm6yvyxdurbhikjboqnn1xubu", "sk-f7yatmzvrc74kq5zb2qn4ktusv29zht5", "sk-f7yqfhp72qkekgyi96y16gkla2f7u2vj", "sk-ewqx1314t3s8p1qasfq6wupbew1duvek", "sk-1ev4g6iu4nq13qhumwij8kvvm7tqduo6", "sk-2n2atkobknk2nxkf57pb56mnten16g74", "sk-f80emglud6fmz7ep0ejjzg4i27khpx9p", "sk-1ev5pdkatd5km6qvetwjww9v7mk3mlse"];
const BAI_BASE = 'https://api.b.ai/v1/chat/completions';
const BAI_MODEL = 'minimax-m3';

let _keyIndex = Math.floor(Math.random() * BAI_KEYS.length);
let _keyExhausted = {};

function getNextKey() {
  const startIdx = _keyIndex;
  do {
    const key = BAI_KEYS[_keyIndex];
    _keyIndex = (_keyIndex + 1) % BAI_KEYS.length;
    if (!_keyExhausted[key]) return key;
  } while (_keyIndex !== startIdx);
  _keyExhausted = {};
  return BAI_KEYS[0];
}

async function callBAI(prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const key = getNextKey();
    try {
      const resp = await fetch(BAI_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key,
        },
        body: JSON.stringify({
          model: BAI_MODEL,
          messages: [
            { role: 'system', content: 'Kamu adalah asisten warung yang ramah dan supportive. Buat ringkasan jualan hari ini dalam bahasa Indonesia yang santai dan memotivasi. Gunakan emoji. Maksimal 4 kalimat. Sebutkan angka-angka penting (omzet, produk terlaris, target). Jangan gunakan format markdown.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });
      if (resp.status === 429 || resp.status === 402) {
        _keyExhausted[key] = true;
        continue;
      }
      if (!resp.ok) continue;
      const data = await resp.json();
      let content = data.choices?.[0]?.message?.content?.trim() || null;
      if (content) {
        // Strip  blocks (closed and unclosed)
        content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        content = content.replace(/<think>[\s\S]*/gi, '').trim();
        // Strip trailing artifacts
        content = content.replace(/^➤\s*/gm, '').trim();
      }
      return content;
    } catch(e) {
      continue;
    }
  }
  return null;
}

function buildRekapPrompt(namaWarung, tx, total, totalPengeluaran, untung, totalUtang, target, sorted) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  let prompt = `Ringkasan jualan warung "${namaWarung}" hari ini (${dateStr}, tutup jam ${jam}):\n`;
  prompt += `- Omzet: Rp${total.toLocaleString('id-ID')}\n`;
  if (totalPengeluaran > 0) prompt += `- Pengeluaran: Rp${totalPengeluaran.toLocaleString('id-ID')}\n`;
  if (totalPengeluaran > 0) prompt += `- Untung bersih: Rp${untung.toLocaleString('id-ID')}\n`;
  if (totalUtang > 0) prompt += `- Utang aktif: Rp${totalUtang.toLocaleString('id-ID')}\n`;
  prompt += `- Jumlah transaksi: ${tx.length}\n`;
  if (sorted.length) prompt += `- Produk terlaris: ${sorted.slice(0, 3).map(([n, q]) => n + ' (' + q + ')').join(', ')}\n`;
  if (target > 0) {
    const pct = Math.round(total / target * 100);
    prompt += `- Target harian: Rp${target.toLocaleString('id-ID')} (${pct}%)\n`;
  }
  prompt += `\nBuat ringkasan yang friendly dan memotivasi pemilik warung.`;
  return prompt;
}

function buildLaporanPrompt(namaWarung, tx, total, totalPengeluaran, untung, target, sorted) {
  let prompt = `Laporan sementara warung "${namaWarung}" hari ini:\n`;
  prompt += `- Omzet: Rp${total.toLocaleString('id-ID')}\n`;
  if (totalPengeluaran > 0) prompt += `- Pengeluaran: Rp${totalPengeluaran.toLocaleString('id-ID')}\n`;
  if (totalPengeluaran > 0) prompt += `- Untung bersih: Rp${untung.toLocaleString('id-ID')}\n`;
  prompt += `- Transaksi: ${tx.length}\n`;
  if (sorted.length) prompt += `- Produk: ${sorted.slice(0, 3).map(([n, q]) => n + ' (' + q + ')').join(', ')}\n`;
  if (target > 0) {
    const pct = Math.round(total / target * 100);
    prompt += `- Target: Rp${target.toLocaleString('id-ID')} (${pct}%)\n`;
  }
  prompt += `\nBuat laporan singkat yang informatif dan memotivasi.`;
  return prompt;
}
