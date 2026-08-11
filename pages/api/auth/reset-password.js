const bcrypt = require('bcryptjs');
const { pool } = require('../../../lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, recovery_code, new_password } = req.body || {};
  if (!username || !recovery_code || !new_password) {
    return res.status(400).json({ error: 'Username, recovery code, and new password are required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
  const user = rows[0];
  // Same generic error whether the username doesn't exist, has no recovery
  // code set, or the code is wrong — avoids confirming which username is
  // registered while still being honest that this path didn't work.
  const genericError = 'That username and recovery code don\'t match. If you don\'t have a recovery code, ask your admin for help instead.';

  if (!user || !user.recovery_code_hash) {
    return res.status(401).json({ error: genericError });
  }

  const valid = await bcrypt.compare(recovery_code.trim(), user.recovery_code_hash);
  if (!valid) {
    return res.status(401).json({ error: genericError });
  }

  const newHash = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);

  return res.status(200).json({ ok: true });
};
