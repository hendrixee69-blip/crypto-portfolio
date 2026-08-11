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

  // Conversions are stored as two linked rows (a withdrawal + a deposit,
  // both hidden from the query above) — reassemble each pair into a single
  // "conversion" activity item instead of showing two separate entries.
  const { rows: conversionRows } = await pool.query(
    `SELECT conversion_group,
            MAX(created_at) AS created_at,
            MAX(CASE WHEN type = 'withdrawal' THEN coin END) AS from_coin,
            MAX(CASE WHEN type = 'withdrawal' THEN amount END) AS from_amount,
            MAX(CASE WHEN type = 'deposit' THEN coin END) AS to_coin,
            MAX(CASE WHEN type = 'deposit' THEN amount END) AS to_amount
     FROM ledger
     WHERE user_id = $1 AND conversion_group IS NOT NULL
     GROUP BY conversion_group
     ORDER BY MAX(created_at) DESC
     LIMIT 50`,
    [session.id]
  );
  const conversions = conversionRows.map((c) => ({
    type: 'conversion',
    from_coin: c.from_coin,
    from_amount: c.from_amount,
    to_coin: c.to_coin,
    to_amount: c.to_amount,
    created_at: c.created_at,
  }));

  const combinedHistory = [...history, ...conversions]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 50);

  return res.status(200).json({ holdings: rows, history: combinedHistory });
};
