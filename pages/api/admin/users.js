const bcrypt = require('bcryptjs');
const { pool } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');

module.exports = async function handler(req, res) {
  const session = requireRole(req, 'admin');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const { rows: users } = await pool.query(
      'SELECT id, username, display_name, created_at FROM users ORDER BY created_at DESC'
    );
    const { rows: balances } = await pool.query(
      `SELECT user_id, coin,
              SUM(CASE WHEN type = 'deposit' THEN amount
                       WHEN type = 'withdrawal' THEN -amount
                       ELSE amount END) AS balance
       FROM ledger GROUP BY user_id, coin`
    );
    const byUser = {};
    balances.forEach((b) => {
      if (!byUser[b.user_id]) byUser[b.user_id] = [];
      if (Number(b.balance) !== 0) byUser[b.user_id].push({ coin: b.coin, balance: b.balance });
    });
    const result = users.map((u) => ({ ...u, holdings: byUser[u.id] || [] }));
    return res.status(200).json({ users: result });
  }

  if (req.method === 'POST') {
    const { username, password, display_name } = req.body || {};
    if (!username || !password || !display_name) {
      return res.status(400).json({ error: 'username, password, and display_name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(password, 10);
    try {
      const { rows } = await pool.query(
        'INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, username, display_name, created_at',
        [username, hash, display_name]
      );
      return res.status(201).json({ user: rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
      throw err;
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });
    // Cascades to that user's ledger entries and withdrawal requests too —
    // both tables reference users.id with ON DELETE CASCADE.
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
