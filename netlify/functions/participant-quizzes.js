const { query } = require('./_db');
const { verifyRole, json } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const decoded = verifyRole(event, 'participant');
  if (!decoded) return json(401, { error: 'Unauthorized' });

  const { rows } = await query(
    `SELECT q.id, q.slot_number, q.quiz_name, q.duration_minutes, q.num_questions, q.is_active,
            (SELECT count(*) FROM attempts a WHERE a.participant_id = $1 AND a.quiz_id = q.id AND a.submitted_at IS NOT NULL) AS attempts_taken,
            (SELECT max(score) FROM attempts a WHERE a.participant_id = $1 AND a.quiz_id = q.id AND a.submitted_at IS NOT NULL) AS best_score,
            COALESCE((SELECT retake_allowed FROM participant_quiz_state s WHERE s.participant_id = $1 AND s.quiz_id = q.id), false) AS retake_allowed
     FROM quizzes q
     WHERE q.is_active = true
     ORDER BY q.slot_number`,
    [decoded.participantId]
  );

  const quizzes = rows.map((r) => ({
    ...r,
    can_attempt: Number(r.attempts_taken) === 0 || r.retake_allowed,
  }));

  return json(200, { quizzes });
};
