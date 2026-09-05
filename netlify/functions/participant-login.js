const bcrypt = require('bcryptjs');
const { query } = require('./_db');
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

  const { rows } = await query(
    'SELECT id, username, password_hash, must_change_password FROM participants WHERE username = $1',
    [username]
  );
  if (rows.length === 0) return json(401, { error: 'Invalid credentials' });

  const participant = rows[0];
  const ok = await bcrypt.compare(password, participant.password_hash);
  if (!ok) return json(401, { error: 'Invalid credentials' });

  const token = signToken({ role: 'participant', participantId: participant.id, username: participant.username });
  return json(200, {
    token,
    mustChangePassword: participant.must_change_password,
  });
};
