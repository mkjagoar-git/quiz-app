const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { query } = require('./_db');
const { verifyRole, json } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const decoded = verifyRole(event, 'organizer');
  if (!decoded) return json(401, { error: 'Unauthorized' });

  const attemptId = event.queryStringParameters && event.queryStringParameters.attemptId;
  if (!attemptId) return json(400, { error: 'attemptId query param is required' });

  const { rows } = await query(
    `SELECT p.username, q.quiz_name, a.score, a.total_marks, a.submitted_at
     FROM attempts a
     JOIN participants p ON p.id = a.participant_id
     JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.id = $1 AND a.submitted_at IS NOT NULL`,
    [attemptId]
  );
  if (rows.length === 0) return json(404, { error: 'Completed attempt not found' });
  const r = rows[0];

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]); // landscape A4
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifRegular = await pdf.embedFont(StandardFonts.TimesRoman);

  const { width, height } = page.getSize();
  const accent = rgb(0.16, 0.29, 0.53);

  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: accent, borderWidth: 2 });
  page.drawText('Certificate of Completion', {
    x: width / 2 - 220, y: height - 130, size: 32, font: serif, color: accent,
  });
  page.drawText('This certifies that', {
    x: width / 2 - 70, y: height - 200, size: 14, font: serifRegular,
  });
  page.drawText(r.username, {
    x: width / 2 - (r.username.length * 9), y: height - 250, size: 30, font: serif,
  });
  page.drawText(`has completed "${r.quiz_name}" with a score of ${r.score} / ${r.total_marks}`, {
    x: width / 2 - 230, y: height - 300, size: 15, font: serifRegular,
  });
  const dateStr = new Date(r.submitted_at).toLocaleDateString();
  page.drawText(`Date: ${dateStr}`, { x: width / 2 - 45, y: height - 340, size: 12, font: serifRegular });

  const pdfBytes = await pdf.save();
  const base64 = Buffer.from(pdfBytes).toString('base64');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificate-${r.username}.pdf"`,
    },
    body: base64,
    isBase64Encoded: true,
  };
};
