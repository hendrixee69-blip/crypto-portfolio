const { pool } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');
const { BY_SYMBOL } = require('../../../lib/coins');

module.exports = async function handler(req, res) {
  const session = requireRole(req, 'admin');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const { rows } = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'deposit_address_%'");
    const addresses = {};
    rows.forEach((r) => {
      const coin = r.key.replace('deposit_address_', '');
      addresses[coin] = r.value;
    });
    return res.status(200).json({ addresses });
  }

  if (req.method === 'POST') {
    const { coin, address } = req.body || {};
    if (!coin || !BY_SYMBOL[coin]) {
      return res.status(400).json({ error: `Unknown coin symbol: ${coin}` });
    }
    if (typeof address !== 'string' || !address.trim()) {
      return res.status(400).json({ error: 'A valid address is required' });
    }
    const trimmed = address.trim();
    if (trimmed.length < 20 || trimmed.length > 90) {
      return res.status(400).json({ error: 'That doesn\'t look like a valid address' });
    }

    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [`deposit_address_${coin}`, trimmed]
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
