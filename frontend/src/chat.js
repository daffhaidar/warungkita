/**
 * WarungKita — chat.js
 * Chat rendering: addMsg, addUserMsg, addBotMsg, esc, safeHTML, jam
 * Part of modular refactor (v3.5)
 * Original: app.js (2214 lines, split for maintainability)
 */

// ---- CHAT RENDERING ----
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function safeHTML(s) {
  // Strip script tags and event handlers from HTML
  return s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
          .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
          .replace(/javascript\s*:/gi, '');
}
function jam() { return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }

function addMsg(html, type = 'bot') {
  const area = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = `msg-row ${type === 'user' ? 'out' : 'in'}`;
  const cls = type === 'bot' ? 'msg bot' : 'msg out';
  const botLabel = type === 'bot' ? '<div class="bot-name">🤖 WarungKita</div>' : '';
  row.innerHTML = `<div class="${cls}">${botLabel}${html}<div class="msg-time">${jam()}</div></div>`;
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

function addUserMsg(text) {
  const area = document.getElementById('chatArea');
  const row = document.createElement('div');
  row.className = 'msg-row out';
  row.innerHTML = `<div class="msg out">${esc(text)}<div class="msg-time">${jam()}</div></div>`;
  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

function addBotMsg(html) { addMsg(safeHTML(html), 'bot'); }

function addDateLabel() {
  const area = document.getElementById('chatArea');
  const label = document.createElement('div');
  label.className = 'date-label';
  label.textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  area.appendChild(label);
}

