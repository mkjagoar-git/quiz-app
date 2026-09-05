const { query } = require('./_db');
const { verifyRole, json } = require('./_auth');

exports.handler = async (event) => {
  const decoded = verifyRole(event, 'organizer');
  if (!decoded) return json(401, { error: 'Unauthorized' });

  if (event.httpMethod === 'GET') {
    const { rows } = await query(
      `SELECT q.id, q.slot_number, q.quiz_name, q.duration_minutes, q.num_questions, q.is_active,
              (SELECT count(*) FROM questions WHERE quiz_id = q.id) AS uploaded_questions
       FROM quizzes q ORDER BY q.slot_number`
    );
    return json(200, { quizzes: rows });
  }

  if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return json(400, { error: 'Invalid JSON' });
    }
    const { slotNumber, quizName, durationMinutes, numQuestions } = body;
    if (![1, 2, 3].includes(slotNumber)) return json(400, { error: 'slotNumber must be 1, 2, or 3' });
    if (!quizName || !durationMinutes || !numQuestions) {
      return json(400, { error: 'quizName, durationMinutes, and numQuestions are required' });
    }

    const { rows } = await query(
      `UPDATE quizzes SET quiz_name = $1, duration_minutes = $2, num_questions = $3, updated_at = now()
       WHERE slot_number = $4 RETURNING *`,
      [quizName, durationMinutes, numQuestions, slotNumber]
    );
    return json(200, { quiz: rows[0] });
  }

  return json(405, { error: 'Method not allowed' });
};
