const { pool } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');
const { BY_SYMBOL } = require('../../../lib/coins');

module.exports = async function handler(req, res) {
  const session = requireRole(req, 'admin');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    const { rows } = await pool.query(
      `SELECT id, type, coin, amount, note, created_by, created_at
       FROM ledger WHERE user_id = $1 ORDER BY created_at DESC`,
      [user_id]
    );
    return res.status(200).json({ entries: rows });
  }

  if (req.method === 'POST') {
    const { user_id, type, coin, amount, note, created_at } = req.body || {};
    if (!user_id || !type || !coin || !amount) {
      return res.status(400).json({ error: 'user_id, type, coin, and amount are required' });
    }
    if (!['deposit', 'withdrawal', 'adjustment'].includes(type)) {
      return res.status(400).json({ error: 'type must be deposit, withdrawal, or adjustment' });
    }
    if (!BY_SYMBOL[coin]) {
      return res.status(400).json({ error: `Unknown coin symbol: ${coin}` });
    }
    const numericAmount = Number(amount);
    if (!(numericAmount > 0)) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    let dateValue = null;
    if (created_at) {
      const parsed = new Date(created_at);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'Invalid date' });
      }
      dateValue = parsed.toISOString();
    }

    if (type === 'withdrawal') {
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount
                                   WHEN type = 'withdrawal' THEN -amount
                                   ELSE amount END), 0) AS balance
         FROM ledger WHERE user_id = $1 AND coin = $2`,
        [user_id, coin]
      );
      const currentBalance = Number(rows[0].balance);
      if (currentBalance < numericAmount) {
        return res.status(400).json({
          error: `Insufficient balance: user has ${currentBalance} ${coin}, tried to withdraw ${numericAmount}`,
        });
      }
    }

    const { rows } = dateValue
      ? await pool.query(
          `INSERT INTO ledger (user_id, type, coin, amount, note, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [user_id, type, coin, numericAmount, note || null, session.username, dateValue]
        )
      : await pool.query(
          `INSERT INTO ledger (user_id, type, coin, amount, note, created_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [user_id, type, coin, numericAmount, note || null, session.username]
        );
    return res.status(201).json({ entry: rows[0] });
  }

  if (req.method === 'PATCH') {
    const { id, created_at } = req.body || {};
    if (!id || !created_at) {
      return res.status(400).json({ error: 'id and created_at are required' });
    }
    const parsed = new Date(created_at);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Invalid date' });
    }
    const { rows } = await pool.query(
      'UPDATE ledger SET created_at = $1 WHERE id = $2 RETURNING *',
      [parsed.toISOString(), id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Entry not found' });
    return res.status(200).json({ entry: rows[0] });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
