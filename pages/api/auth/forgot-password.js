const { pool } = require('../../../lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username } = req.body || {};
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }

  // Always respond with the same generic success message regardless of
  // whether the username exists, so this endpoint can't be used to check
  // which usernames are registered.
  const { rows } = await pool.query('SELECT id FROM users WHERE username = $1', [username.trim()]);
  if (rows[0]) {
    await pool.query('INSERT INTO password_reset_requests (user_id) VALUES ($1)', [rows[0].id]);
  }

  return res.status(200).json({ ok: true });
};
