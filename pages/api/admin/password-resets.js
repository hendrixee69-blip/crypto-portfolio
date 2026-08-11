const bcrypt = require('bcryptjs');
const { pool } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');

module.exports = async function handler(req, res) {
  const session = requireRole(req, 'admin');
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      `SELECT prr.id, prr.status, prr.created_at, prr.resolved_at, prr.resolved_by,
              u.id AS user_id, u.username, u.display_name
       FROM password_reset_requests prr
       JOIN users u ON u.id = prr.user_id
       ORDER BY (prr.status = 'pending') DESC, prr.created_at DESC
       LIMIT 100`
    );
    return res.status(200).json({ requests: rows });
  }

  if (req.method === 'POST') {
    const { id, new_password } = req.body || {};
    if (!id || !new_password) {
      return res.status(400).json({ error: 'id and new_password are required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const { rows } = await pool.query('SELECT * FROM password_reset_requests WHERE id = $1', [id]);
    const request = rows[0];
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, request.user_id]);
    await pool.query(
      `UPDATE password_reset_requests SET status = 'resolved', resolved_by = $1, resolved_at = now() WHERE id = $2`,
      [session.username, id]
    );

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
