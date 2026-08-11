const { pool } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');
const { BY_SYMBOL } = require('../../../lib/coins');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = requireRole(req, 'admin');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const { user_id, coin, target } = req.body || {};
  if (!user_id || !coin || !BY_SYMBOL[coin]) {
    return res.status(400).json({ error: 'user_id and a valid coin are required' });
  }
  const targetAmount = Number(target);
  if (!(targetAmount >= 0)) {
    return res.status(400).json({ error: 'Target balance must be zero or a positive number' });
  }

  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount
                               WHEN type = 'withdrawal' THEN -amount
                               ELSE amount END), 0) AS balance
     FROM ledger WHERE user_id = $1 AND coin = $2`,
    [user_id, coin]
  );
  const current = Number(rows[0].balance);
  const delta = targetAmount - current;

  // Rounding noise (e.g. from a prior conversion) can leave a delta that's
  // technically nonzero but meaningless — treat anything under a dust
  // threshold as "already there" rather than writing a near-zero entry.
  if (Math.abs(delta) < 1e-9) {
    return res.status(200).json({ ok: true, unchanged: true, current });
  }

  const type = delta > 0 ? 'deposit' : 'withdrawal';
  const amount = Math.abs(delta);
  const note = `Balance set to ${targetAmount} ${coin} by ${session.username}`;

  const { rows: inserted } = await pool.query(
    `INSERT INTO ledger (user_id, type, coin, amount, note, created_by, visible_to_user)
     VALUES ($1, $2, $3, $4, $5, $6, false) RETURNING *`,
    [user_id, type, coin, amount, note, session.username]
  );

  return res.status(200).json({ ok: true, entry: inserted[0], previous: current, target: targetAmount });
};
