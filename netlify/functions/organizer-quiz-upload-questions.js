const { parse } = require('csv-parse/sync');
const { query } = require('./_db');
const { verifyRole, json } = require('./_auth');

// Expected CSV columns (header row required):
// question,option_a,option_b,option_c,option_d,correct
// "correct" holds the letters of every correct option, separated by ; or , e.g. "a" or "a;c"
// (a single letter = single-correct MCQ, multiple letters = multi-select MCQ)
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
  const { slotNumber, csvText } = body;
  if (![1, 2, 3].includes(slotNumber)) return json(400, { error: 'slotNumber must be 1, 2, or 3' });
  if (!csvText) return json(400, { error: 'csvText is required' });

  let records;
  try {
    records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return json(400, { error: 'Could not parse CSV: ' + e.message });
  }
  if (records.length === 0) return json(400, { error: 'CSV has no data rows' });

  const optionCols = ['option_a', 'option_b', 'option_c', 'option_d'];
  const letterIndex = { a: 0, b: 1, c: 2, d: 3 };

  for (const [i, row] of records.entries()) {
    if (!row.question) return json(400, { error: `Row ${i + 1}: missing "question"` });
    const opts = optionCols.map((c) => row[c]).filter((v) => v && v.trim() !== '');
    if (opts.length < 2) return json(400, { error: `Row ${i + 1}: needs at least 2 options` });
    if (!row.correct) return json(400, { error: `Row ${i + 1}: missing "correct" column` });
  }

  const { rows: quizRows } = await query('SELECT id FROM quizzes WHERE slot_number = $1', [slotNumber]);
  if (quizRows.length === 0) return json(404, { error: 'Quiz slot not found' });
  const quizId = quizRows[0].id;

  // Replace the whole question bank for this slot.
  await query('DELETE FROM questions WHERE quiz_id = $1', [quizId]);

  for (const [i, row] of records.entries()) {
    const { rows: qRows } = await query(
      'INSERT INTO questions (quiz_id, question_text, order_index) VALUES ($1, $2, $3) RETURNING id',
      [quizId, row.question, i]
    );
    const questionId = qRows[0].id;

    const correctLetters = row.correct
      .split(/[;,]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    for (const col of optionCols) {
      const text = row[col];
      if (!text || text.trim() === '') continue;
      const letter = col.split('_')[1]; // a/b/c/d
      const isCorrect = correctLetters.includes(letter);
      await query(
        'INSERT INTO options (question_id, option_text, is_correct, order_index) VALUES ($1, $2, $3, $4)',
        [questionId, text, isCorrect, letterIndex[letter]]
      );
    }
  }

  await query('UPDATE quizzes SET is_active = true, updated_at = now() WHERE id = $1', [quizId]);

  return json(200, { ok: true, questionsUploaded: records.length });
};
