const bcrypt = require('bcryptjs');
const { query } = require('./_db');
const { verifyRole, json } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const decoded = verifyRole(event, 'participant');
  if (!decoded) return json(401, { error: 'Unauthorized' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid JSON' });
  }
  const { newPassword } = body;
  if (!newPassword || newPassword.length < 4) {
    return json(400, { error: 'newPassword must be at least 4 characters' });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await query(
    'UPDATE participants SET password_hash = $1, must_change_password = false WHERE id = $2',
    [hash, decoded.participantId]
  );

  return json(200, { ok: true });
};
