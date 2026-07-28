const { pool } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');

module.exports = async function handler(req, res) {
  const session = requireRole(req, 'admin');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'btc_deposit_address'");
    return res.status(200).json({ btc_deposit_address: rows[0]?.value || null });
  }

  if (req.method === 'POST') {
    const { btc_deposit_address } = req.body || {};
    if (typeof btc_deposit_address !== 'string' || !btc_deposit_address.trim()) {
      return res.status(400).json({ error: 'A valid BTC address is required' });
    }
    // Loose sanity check only — real address validation (checksums per address
    // type) is out of scope here. This just catches obvious typos/garbage.
    const addr = btc_deposit_address.trim();
    if (addr.length < 26 || addr.length > 90) {
      return res.status(400).json({ error: 'That doesn\'t look like a valid BTC address' });
    }

    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('btc_deposit_address', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [addr]
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
