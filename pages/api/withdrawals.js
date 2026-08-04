const { pool } = require('../../lib/db');
const { requireRole } = require('../../lib/auth');
const { BY_SYMBOL } = require('../../lib/coins');

module.exports = async function handler(req, res) {
  const session = requireRole(req, 'user');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      `SELECT id, coin, amount, destination_address, status, created_at, resolved_at
       FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [session.id]
    );
    return res.status(200).json({ requests: rows });
  }

  if (req.method === 'POST') {
    const { coin, amount, destination_address } = req.body || {};
    if (!coin || !BY_SYMBOL[coin]) {
      return res.status(400).json({ error: `Unknown coin symbol: ${coin}` });
    }
    if (typeof destination_address !== 'string' || destination_address.trim().length < 10) {
      return res.status(400).json({ error: 'A valid destination address is required' });
    }
    const numericAmount = Number(amount);
    if (!(numericAmount > 0)) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    // Available balance = confirmed ledger balance minus anything already
    // tied up in a pending request, so a user can't queue more requests
    // than they actually have.
    const { rows: balRows } = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount
                                 WHEN type = 'withdrawal' THEN -amount
                                 ELSE amount END), 0) AS balance
       FROM ledger WHERE user_id = $1 AND coin = $2`,
      [session.id, coin]
    );
    const { rows: pendingRows } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS pending
       FROM withdrawal_requests WHERE user_id = $1 AND coin = $2 AND status = 'pending'`,
      [session.id, coin]
    );
    const available = Number(balRows[0].balance) - Number(pendingRows[0].pending);
    if (numericAmount > available) {
      return res.status(400).json({
        error: `Insufficient available balance: ${available} ${coin} available`,
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO withdrawal_requests (user_id, coin, amount, destination_address)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [session.id, coin, numericAmount, destination_address.trim()]
    );
    return res.status(201).json({ request: rows[0] });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
