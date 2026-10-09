const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
function adminClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}
async function telegram(method, payload) {
  const token = env('TELEGRAM_BOT_TOKEN');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram API request failed (${method})`);
  return result;
}
async function sendMessage(chatId, text, extra = {}) {
  return telegram('sendMessage', { chat_id: chatId, text, ...extra });
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
module.exports = { env, adminClient, hashCode, telegram, sendMessage, escapeHtml };
