const { env, adminClient, hashCode, sendMessage, escapeHtml } = require('./_shared');

function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}
function getArgs(text) { return String(text || '').trim().split(/\s+/).slice(1); }
async function linkedUser(admin, chatId) {
  const { data, error } = await admin.from('telegram_accounts').select('user_id').eq('telegram_chat_id', String(chatId)).maybeSingle();
  if (error) throw error;
  return data?.user_id || null;
}
async function listTasks(admin, userId, todayOnly=false) {
  let q = admin.from('tasks').select('id,title,subject,due_date,priority,completed,notes,scheduled_date,start_time,duration_minutes')
    .eq('user_id', userId).eq('completed', false).order('due_date', { ascending: true }).limit(20);
  if (todayOnly) q = q.eq('due_date', new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }));
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
function taskLines(rows) {
  if (!rows.length) return 'No pending tasks found.';
  return rows.map((t, i) => `${i+1}. ${t.title}\n   ID: ${t.id}\n   ${t.subject} • ${t.due_date} • ${t.priority}`).join('\n');
}
async function handleMessage(admin, message) {
  const chatId = String(message.chat.id);
  const text = String(message.text || '').trim();
  if (!text) return;
  const [commandRaw, ...args] = text.split(/\s+/);
  const command = commandRaw.split('@')[0].toLowerCase();

  if (command === '/start') {
    return sendMessage(chatId, 'Welcome to Study Board!\n\nLink your account from your signed-in Study Board website, then send:\n/link YOUR_CODE\n\nCommands after linking:\n/tasks - pending tasks\n/today - tasks due today\n/add Title | YYYY-MM-DD | Subject - add task\n/done TASK_ID - complete task\n/delete TASK_ID - delete task\n/help - command list');
  }
  if (command === '/help') return sendMessage(chatId, 'Commands:\n/link CODE - link your account\n/tasks - list pending tasks\n/today - tasks due today\n/add Title | YYYY-MM-DD | Subject\n/done TASK_ID - complete task\n/delete TASK_ID - delete task\n/unlink - unlink this Telegram chat');

  if (command === '/link') {
    const code = args[0] || '';
    if (!/^\d{6}$/.test(code)) return sendMessage(chatId, 'Please send a valid 6-digit code: /link 123456');
    const { data: pair, error } = await admin.from('telegram_pair_codes').select('code_hash,user_id,expires_at').eq('code_hash', hashCode(code)).maybeSingle();
    if (error) throw error;
    if (!pair || new Date(pair.expires_at).getTime() < Date.now()) return sendMessage(chatId, 'That code is invalid or expired. Generate a new code from your Study Board website.');
    const { error: linkError } = await admin.from('telegram_accounts').upsert({ telegram_chat_id: chatId, user_id: pair.user_id }, { onConflict: 'telegram_chat_id' });
    if (linkError) throw linkError;
    await admin.from('telegram_pair_codes').delete().eq('code_hash', pair.code_hash);
    return sendMessage(chatId, '✅ Your Telegram chat is now linked to Study Board. Send /tasks to get started.');
  }

  const userId = await linkedUser(admin, chatId);
  if (command === '/unlink') {
    if (!userId) return sendMessage(chatId, 'This chat is not linked.');
    const { error } = await admin.from('telegram_accounts').delete().eq('telegram_chat_id', chatId);
    if (error) throw error;
    return sendMessage(chatId, 'Telegram has been unlinked from your Study Board account.');
  }
  if (!userId) return sendMessage(chatId, 'Your chat is not linked yet. Open Study Board while signed in, generate a pairing code, then send /link CODE here.');

  if (command === '/tasks' || command === '/today') {
    const rows = await listTasks(admin, userId, command === '/today');
    return sendMessage(chatId, taskLines(rows));
  }
  if (command === '/add') {
    const payload = text.slice(commandRaw.length).trim();
    const parts = payload.split('|').map(x => x.trim());
    if (parts.length < 2 || !parts[0] || !parseDate(parts[1])) {
      return sendMessage(chatId, 'Format:\n/add Title | YYYY-MM-DD | Subject\nExample:\n/add Maths revision | 2026-10-12 | Mathematics');
    }
    const title = parts[0].slice(0, 200), due_date = parseDate(parts[1]), subject = (parts[2] || 'Other').slice(0, 80);
    const id = `tg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await admin.from('tasks').insert({ id, user_id: userId, title, subject, due_date, priority: 'Medium', completed: false, notes: '' });
    if (error) throw error;
    return sendMessage(chatId, `✅ Task added: ${title}\nDue: ${due_date}\nIt will sync to your website when its cloud data refreshes.`);
  }
  if (command === '/done') {
    const id = args[0];
    if (!id) return sendMessage(chatId, 'Usage: /done TASK_ID (get IDs from /tasks)');
    const { data, error } = await admin.from('tasks').update({ completed: true, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select('id,title').maybeSingle();
    if (error) throw error;
    return sendMessage(chatId, data ? `✅ Completed: ${data.title}` : 'Task not found in your account.');
  }
  if (command === '/delete') {
    const id = args[0];
    if (!id) return sendMessage(chatId, 'Usage: /delete TASK_ID (get IDs from /tasks)');
    const { data, error } = await admin.from('tasks').delete().eq('id', id).eq('user_id', userId).select('id').maybeSingle();
    if (error) throw error;
    return sendMessage(chatId, data ? '🗑 Task deleted.' : 'Task not found in your account.');
  }
  return sendMessage(chatId, 'Unknown command. Send /help to see available commands.');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  try {
    const expected = env('TELEGRAM_WEBHOOK_SECRET');
    const supplied = req.headers['x-telegram-bot-api-secret-token'];
    if (!supplied || supplied !== expected) return res.status(401).send('Unauthorized');
    const update = req.body || {};
    const message = update.message || update.edited_message;
    if (message?.chat?.id && message?.text) {
      try { await handleMessage(adminClient(), message); }
      catch (e) {
        console.error('telegram-webhook handler:', e.message);
        await sendMessage(message.chat.id, 'Sorry, that action failed. Check the bot setup or try again.');
      }
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('telegram-webhook:', error.message);
    return res.status(500).json({ ok: false });
  }
};
