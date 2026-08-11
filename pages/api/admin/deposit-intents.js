const { pool } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = requireRole(req, 'admin');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const { rows } = await pool.query(
    `SELECT di.id, di.coin, di.amount, di.created_at,
            u.id AS user_id, u.username, u.display_name
     FROM deposit_intents di
     JOIN users u ON u.id = di.user_id
     ORDER BY di.created_at DESC
     LIMIT 100`
  );
  return res.status(200).json({ intents: rows });
};
