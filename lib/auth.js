const jwt = require('jsonwebtoken');

// Checked lazily (on first actual use) rather than at module load time.
// Next.js imports this file while building the app, before Railway's env
// vars are necessarily in scope for that step — throwing here would crash
// the build itself, not just a real request that's missing the secret.
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET env var is not set. Set it in your environment variables.');
  }
  return secret;
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: '12h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

function setAuthCookie(res, name, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', [
    `${name}=${token}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax${isProd ? '; Secure' : ''}`,
  ]);
}

function clearAuthCookie(res, name) {
  res.setHeader('Set-Cookie', [`${name}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`]);
}

// Reads either cookie, verifies it, and confirms the role matches what's required.
function requireRole(req, role) {
  const cookies = parseCookies(req);
  const cookieName = role === 'admin' ? 'admin_token' : 'user_token';
  const token = cookies[cookieName];
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || payload.role !== role) return null;
  return payload;
}

module.exports = {
  signToken,
  verifyToken,
  parseCookies,
  setAuthCookie,
  clearAuthCookie,
  requireRole,
};
