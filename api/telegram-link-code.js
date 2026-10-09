const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { env, adminClient, hashCode } = require('./_shared');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const authorization = req.headers.authorization || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'Please sign in to Study Board first.' });
    const authClient = createClient(env('SUPABASE_URL'), env('SUPABASE_PUBLISHABLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: userData, error: authError } = await authClient.auth.getUser(match[1]);
    if (authError || !userData.user) return res.status(401).json({ error: 'Your session expired. Please sign in again.' });

    const admin = adminClient();
    // Remove old codes for this user, so only the latest code can be used.
    await admin.from('telegram_pair_codes').delete().eq('user_id', userData.user.id);
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error } = await admin.from('telegram_pair_codes').insert({
      code_hash: hashCode(code), user_id: userData.user.id, expires_at: expiresAt
    });
    if (error) throw error;
    return res.status(200).json({ code, expires_at: expiresAt, expires_in_seconds: 600 });
  } catch (error) {
    console.error('telegram-link-code:', error.message);
    return res.status(500).json({ error: 'Could not create a pairing code. Check server environment variables and SQL setup.' });
  }
};
