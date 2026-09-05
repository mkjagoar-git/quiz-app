const { query } = require('./_db');
const { verifyRole, json } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const decoded = verifyRole(event, 'organizer');
  if (!decoded) return json(401, { error: 'Unauthorized' });

  const slotNumber = event.queryStringParameters && event.queryStringParameters.slot;

  let sql = `
    SELECT p.username, q.slot_number, q.quiz_name, a.attempt_number, a.score, a.total_marks,
           a.started_at, a.submitted_at, a.id AS attempt_id
    FROM attempts a
    JOIN participants p ON p.id = a.participant_id
    JOIN quizzes q ON q.id = a.quiz_id
    WHERE a.submitted_at IS NOT NULL
  `;
  const params = [];
  if (slotNumber) {
    params.push(Number(slotNumber));
    sql += ` AND q.slot_number = $${params.length}`;
  }
  sql += ' ORDER BY a.submitted_at DESC';

  const { rows } = await query(sql, params);
  return json(200, { attempts: rows });
};
