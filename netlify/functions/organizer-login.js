const bcrypt = require('bcryptjs');
const { signToken, json } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid JSON' });
  }
  const { username, password } = body;
  if (!username || !password) return json(400, { error: 'username and password required' });

  const expectedUser = process.env.ORGANIZER_USERNAME;
  const expectedHash = process.env.ORGANIZER_PASSWORD_HASH;
  if (!expectedUser || !expectedHash) {
    return json(500, { error: 'Organizer account is not configured on the server' });
  }

  if (username !== expectedUser) return json(401, { error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, expectedHash);
  if (!ok) return json(401, { error: 'Invalid credentials' });

  const token = signToken({ role: 'organizer', username });
  return json(200, { token });
};
