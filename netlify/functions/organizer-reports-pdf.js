const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { query } = require('./_db');
const { verifyRole, json } = require('./_auth');

const PAGE_SIZE = [595, 842]; // A4 portrait
const MARGIN = 40;
const ROW_HEIGHT = 20;
const COLS = [
  { key: 'username', label: 'Participant', x: 0, width: 110 },
  { key: 'quiz_name', label: 'Quiz', x: 110, width: 110 },
  { key: 'attempt_number', label: 'Attempt', x: 220, width: 55 },
  { key: 'score_display', label: 'Score', x: 275, width: 70 },
  { key: 'submitted_display', label: 'Submitted', x: 345, width: 170 },
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const decoded = verifyRole(event, 'organizer');
  if (!decoded) return json(401, { error: 'Unauthorized' });

  const slotNumber = event.queryStringParameters && event.queryStringParameters.slot;

  let sql = `
    SELECT p.username, q.slot_number, q.quiz_name, a.attempt_number, a.score, a.total_marks, a.submitted_at
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
  sql += ' ORDER BY q.slot_number, a.submitted_at DESC';

  const { rows } = await query(sql, params);

  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.12, 0.18, 0.25);
  const soft = rgb(0.4, 0.45, 0.5);

  let page = pdf.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  const drawHeader = () => {
    page.drawText('Quiz Report', { x: MARGIN, y, size: 20, font: bold, color: ink });
    y -= 20;
    const scope = slotNumber ? `QUIZ-${slotNumber}` : 'All quizzes';
    page.drawText(`${scope} · generated ${new Date().toLocaleString()}`, { x: MARGIN, y, size: 10, font: regular, color: soft });
    y -= 24;
    COLS.forEach((c) => page.drawText(c.label, { x: MARGIN + c.x, y, size: 9, font: bold, color: soft }));
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_SIZE[0] - MARGIN, y }, thickness: 0.5, color: soft });
    y -= ROW_HEIGHT;
  };

  drawHeader();

  if (rows.length === 0) {
    page.drawText('No completed attempts yet.', { x: MARGIN, y, size: 11, font: regular, color: soft });
  }

  for (const r of rows) {
    if (y < MARGIN + ROW_HEIGHT) {
      page = pdf.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
      drawHeader();
    }
    const record = {
      username: r.username,
      quiz_name: r.quiz_name,
      attempt_number: String(r.attempt_number),
      score_display: `${r.score} / ${r.total_marks}`,
      submitted_display: new Date(r.submitted_at).toLocaleString(),
    };
    COLS.forEach((c) => {
      const text = String(record[c.key] ?? '').slice(0, 40);
      page.drawText(text, { x: MARGIN + c.x, y, size: 10, font: regular, color: ink });
    });
    y -= ROW_HEIGHT;
  }

  const pdfBytes = await pdf.save();
  const base64 = Buffer.from(pdfBytes).toString('base64');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="quiz-report${slotNumber ? '-quiz-' + slotNumber : ''}.pdf"`,
    },
    body: base64,
    isBase64Encoded: true,
  };
};
