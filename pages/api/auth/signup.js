const bcrypt = require('bcryptjs');
const { pool } = require('../../../lib/db');
const { signToken, setAuthCookie } = require('../../../lib/auth');
const { generateRecoveryCode } = require('../../../lib/recovery');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password, display_name } = req.body || {};
  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'Name, username, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-32 characters: letters, numbers, _ . -' });
  }

  const hash = await bcrypt.hash(password, 10);
  const recoveryCode = generateRecoveryCode();
  const recoveryHash = await bcrypt.hash(recoveryCode, 10);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, display_name, recovery_code_hash) VALUES ($1, $2, $3, $4) RETURNING id, username',
      [username, hash, display_name, recoveryHash]
    );
    const user = rows[0];
    const token = signToken({ role: 'user', id: user.id, username: user.username });
    setAuthCookie(res, 'user_token', token);
    // Only moment the plaintext code ever exists outside the user's own head —
    // shown once here, never stored or retrievable again.
    return res.status(201).json({ ok: true, recovery_code: recoveryCode });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That username is already taken' });
    throw err;
  }
};
