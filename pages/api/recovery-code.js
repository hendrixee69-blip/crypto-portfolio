const bcrypt = require('bcryptjs');
const { pool } = require('../../lib/db');
const { requireRole } = require('../../lib/auth');
const { generateRecoveryCode } = require('../../lib/recovery');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = requireRole(req, 'user');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const code = generateRecoveryCode();
  const hash = await bcrypt.hash(code, 10);
  await pool.query('UPDATE users SET recovery_code_hash = $1 WHERE id = $2', [hash, session.id]);

  return res.status(200).json({ ok: true, recovery_code: code });
};
