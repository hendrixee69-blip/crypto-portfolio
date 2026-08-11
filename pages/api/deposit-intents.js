const { pool } = require('../../lib/db');
const { requireRole } = require('../../lib/auth');
const { BY_SYMBOL } = require('../../lib/coins');

module.exports = async function handler(req, res) {
  const session = requireRole(req, 'user');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      `SELECT id, coin, amount, created_at
       FROM deposit_intents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [session.id]
    );
    return res.status(200).json({ intents: rows });
  }

  if (req.method === 'POST') {
    const { coin, amount } = req.body || {};
    if (!coin || !BY_SYMBOL[coin]) {
      return res.status(400).json({ error: `Unknown coin symbol: ${coin}` });
    }
    const numericAmount = Number(amount);
    if (!(numericAmount > 0)) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    const { rows } = await pool.query(
      `INSERT INTO deposit_intents (user_id, coin, amount) VALUES ($1, $2, $3) RETURNING *`,
      [session.id, coin, numericAmount]
    );
    return res.status(201).json({ intent: rows[0] });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
