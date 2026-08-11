const { pool } = require('../../lib/db');
const { requireRole } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = requireRole(req, 'user');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const { rows } = await pool.query(
    `SELECT coin,
            SUM(CASE WHEN type = 'deposit' THEN amount
                     WHEN type = 'withdrawal' THEN -amount
                     ELSE amount END) AS balance
     FROM ledger
     WHERE user_id = $1
     GROUP BY coin
     HAVING SUM(CASE WHEN type = 'deposit' THEN amount
                      WHEN type = 'withdrawal' THEN -amount
                      ELSE amount END) != 0`,
    [session.id]
  );

  const { rows: history } = await pool.query(
    `SELECT type, coin, amount, note, created_at
     FROM ledger WHERE user_id = $1 AND type IN ('deposit', 'withdrawal') AND visible_to_user = true
     ORDER BY created_at DESC LIMIT 50`,
    [session.id]
  );

  return res.status(200).json({ holdings: rows, history });
};
