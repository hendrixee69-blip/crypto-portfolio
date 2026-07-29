const { pool } = require('../../lib/db');
const { requireRole } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Only shown to signed-in users (either role) — not a fully public endpoint,
  // since there's no reason to expose deposit addresses to anonymous visitors.
  const session = requireRole(req, 'user') || requireRole(req, 'admin');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const { rows } = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'deposit_address_%'");
  const addresses = {};
  rows.forEach((r) => {
    const coin = r.key.replace('deposit_address_', '');
    if (r.value) addresses[coin] = r.value;
  });
  return res.status(200).json({ addresses });
};
