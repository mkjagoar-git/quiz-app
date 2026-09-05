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
  const { attemptId, answers } = body; // answers: [{ questionId, selectedOptionIds: [] }]
  if (!attemptId || !Array.isArray(answers)) {
    return json(400, { error: 'attemptId and answers[] are required' });
  }

  const { rows: attemptRows } = await query(
    'SELECT id, participant_id, quiz_id, attempt_number, submitted_at FROM attempts WHERE id = $1',
    [attemptId]
  );
  if (attemptRows.length === 0) return json(404, { error: 'Attempt not found' });
  const attempt = attemptRows[0];
  if (attempt.participant_id !== decoded.participantId) return json(403, { error: 'Not your attempt' });
  if (attempt.submitted_at) return json(409, { error: 'Attempt already submitted' });

  const questionIds = answers.map((a) => a.questionId);
  const { rows: correctOptions } = await query(
    `SELECT question_id, id FROM options WHERE question_id = ANY($1::int[]) AND is_correct = true`,
    [questionIds]
  );

  let score = 0;
  for (const ans of answers) {
    const correctIds = correctOptions
      .filter((o) => o.question_id === ans.questionId)
      .map((o) => o.id)
      .sort();
    const selectedIds = [...(ans.selectedOptionIds || [])].sort();
    // All-or-nothing: exact match of the correct set required (handles single- and multi-select alike).
    const isCorrect =
      correctIds.length === selectedIds.length && correctIds.every((id, i) => id === selectedIds[i]);
    if (isCorrect) score += 1;

    await query(
      'INSERT INTO attempt_answers (attempt_id, question_id, selected_option_ids, is_correct) VALUES ($1, $2, $3, $4)',
      [attemptId, ans.questionId, ans.selectedOptionIds || [], isCorrect]
    );
  }

  await query('UPDATE attempts SET score = $1, submitted_at = now() WHERE id = $2', [score, attemptId]);

  if (attempt.attempt_number > 1) {
    // This was a granted retake — the grant is single-use, so lock it again.
    await query(
      'UPDATE participant_quiz_state SET retake_allowed = false WHERE participant_id = $1 AND quiz_id = $2',
      [attempt.participant_id, attempt.quiz_id]
    );
  }

  return json(200, { score, totalMarks: answers.length });
};
