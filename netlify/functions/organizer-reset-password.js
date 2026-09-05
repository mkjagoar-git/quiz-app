const bcrypt = require('bcryptjs');
const { query } = require('./_db');
const { verifyRole, json } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const decoded = verifyRole(event, 'organizer');
  if (!decoded) return json(401, { error: 'Unauthorized' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid JSON' });
  }
  const { username, newPassword, grantRetakeSlot } = body;
  if (!username) return json(400, { error: 'username is required' });

  const { rows } = await query('SELECT id FROM participants WHERE username = $1', [username]);
  if (rows.length === 0) return json(404, { error: 'Participant not found' });
  const participantId = rows[0].id;

  if (newPassword) {
    if (newPassword.length < 4) return json(400, { error: 'newPassword must be at least 4 characters' });
    const hash = await bcrypt.hash(newPassword, 10);
    await query(
      'UPDATE participants SET password_hash = $1, must_change_password = true WHERE id = $2',
      [hash, participantId]
    );
  }

  if (grantRetakeSlot) {
    if (![1, 2, 3].includes(grantRetakeSlot)) return json(400, { error: 'grantRetakeSlot must be 1, 2, or 3' });
    const { rows: quizRows } = await query('SELECT id FROM quizzes WHERE slot_number = $1', [grantRetakeSlot]);
    if (quizRows.length === 0) return json(404, { error: 'Quiz slot not found' });
    const quizId = quizRows[0].id;

    await query(
      `INSERT INTO participant_quiz_state (participant_id, quiz_id, retake_allowed)
       VALUES ($1, $2, true)
       ON CONFLICT (participant_id, quiz_id) DO UPDATE SET retake_allowed = true`,
      [participantId, quizId]
    );
  }

  return json(200, { ok: true });
};
