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
  const { slotNumber } = body;
  if (![1, 2, 3].includes(slotNumber)) return json(400, { error: 'slotNumber must be 1, 2, or 3' });

  const { rows: quizRows } = await query(
    'SELECT id, quiz_name, duration_minutes, num_questions, is_active FROM quizzes WHERE slot_number = $1',
    [slotNumber]
  );
  if (quizRows.length === 0 || !quizRows[0].is_active) return json(404, { error: 'Quiz not available' });
  const quiz = quizRows[0];

  const { rows: attemptCountRows } = await query(
    'SELECT count(*) FROM attempts WHERE participant_id = $1 AND quiz_id = $2 AND submitted_at IS NOT NULL',
    [decoded.participantId, quiz.id]
  );
  const attemptsTaken = Number(attemptCountRows[0].count);

  const { rows: stateRows } = await query(
    'SELECT retake_allowed FROM participant_quiz_state WHERE participant_id = $1 AND quiz_id = $2',
    [decoded.participantId, quiz.id]
  );
  const retakeAllowed = stateRows.length > 0 && stateRows[0].retake_allowed;

  if (attemptsTaken > 0 && !retakeAllowed) {
    return json(403, { error: 'You have already taken this quiz. Ask the organizer to unlock a retake.' });
  }

  // Pull a random subset of the question bank sized to num_questions.
  const { rows: questions } = await query(
    `SELECT id, question_text FROM questions WHERE quiz_id = $1 ORDER BY random() LIMIT $2`,
    [quiz.id, quiz.num_questions]
  );
  if (questions.length === 0) return json(500, { error: 'Quiz has no questions uploaded' });

  const questionIds = questions.map((q) => q.id);
  const { rows: options } = await query(
    `SELECT id, question_id, option_text, order_index FROM options WHERE question_id = ANY($1::int[]) ORDER BY order_index`,
    [questionIds]
  );

  const questionsWithOptions = questions.map((q) => ({
    id: q.id,
    text: q.question_text,
    options: options.filter((o) => o.question_id === q.id).map((o) => ({ id: o.id, text: o.option_text })),
  }));

  const { rows: existingAttempts } = await query(
    'SELECT count(*) FROM attempts WHERE participant_id = $1 AND quiz_id = $2',
    [decoded.participantId, quiz.id]
  );
  const attemptNumber = Number(existingAttempts[0].count) + 1;

  const { rows: newAttempt } = await query(
    `INSERT INTO attempts (participant_id, quiz_id, attempt_number, score, total_marks)
     VALUES ($1, $2, $3, 0, $4) RETURNING id`,
    [decoded.participantId, quiz.id, attemptNumber, questions.length]
  );

  return json(200, {
    attemptId: newAttempt[0].id,
    quizName: quiz.quiz_name,
    durationMinutes: quiz.duration_minutes,
    questions: questionsWithOptions,
  });
};
