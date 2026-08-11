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
      // A plain "YYYY-MM-DD" from a date picker parses as UTC midnight, which
      // can display as the previous day in negative-UTC-offset timezones.
      // Anchoring to midday UTC keeps it on the intended calendar date almost
      // everywhere. Only do this for date-only strings, not full timestamps.
      const raw = /^\d{4}-\d{2}-\d{2}$/.test(created_at) ? `${created_at}T12:00:00Z` : created_at;
      const parsed = new Date(raw);
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
    const { id, created_at, note, amount } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    if (created_at === undefined && note === undefined && amount === undefined) {
      return res.status(400).json({ error: 'Provide created_at, note, and/or amount to update' });
    }

    const sets = [];
    const values = [];
    let paramIndex = 1;

    if (created_at !== undefined) {
      const raw = /^\d{4}-\d{2}-\d{2}$/.test(created_at) ? `${created_at}T12:00:00Z` : created_at;
      const parsed = new Date(raw);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'Invalid date' });
      }
      sets.push(`created_at = $${paramIndex++}`);
      values.push(parsed.toISOString());
    }
    if (note !== undefined) {
      sets.push(`note = $${paramIndex++}`);
      values.push(note.trim() || null);
    }
    if (amount !== undefined) {
      const numericAmount = Number(amount);
      if (!(numericAmount > 0)) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }
      sets.push(`amount = $${paramIndex++}`);
      values.push(numericAmount);
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE ledger SET ${sets.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Entry not found' });
    return res.status(200).json({ entry: rows[0] });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });
    const { rowCount } = await pool.query('DELETE FROM ledger WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
