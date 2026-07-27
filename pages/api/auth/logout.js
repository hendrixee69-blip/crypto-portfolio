const { clearAuthCookie } = require('../../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { role } = req.body || {};
  clearAuthCookie(res, role === 'admin' ? 'admin_token' : 'user_token');
  return res.status(200).json({ ok: true });
};
