const jwt = require('jsonwebtoken');

function secret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET env var is not set');
  }
  return process.env.JWT_SECRET;
}

function signToken(payload) {
  // 8 hour session — long enough for one quiz sitting or one organizer session.
  return jwt.sign(payload, secret(), { expiresIn: '8h' });
}

// Returns the decoded payload, or null if missing/invalid/wrong role.
function verifyRole(event, requiredRole) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, secret());
    if (requiredRole && decoded.role !== requiredRole) return null;
    return decoded;
  } catch (e) {
    return null;
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

module.exports = { signToken, verifyRole, json };
