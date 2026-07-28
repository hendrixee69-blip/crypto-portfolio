const { pool } = require('../../lib/db');
const { requireRole } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Only shown to signed-in users (either role) — not a fully public endpoint,
  // since there's no reason to expose the deposit address to anonymous visitors.
  const session = requireRole(req, 'user') || requireRole(req, 'admin');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'btc_deposit_address'");
  return res.status(200).json({ btc_deposit_address: rows[0]?.value || null });
};
