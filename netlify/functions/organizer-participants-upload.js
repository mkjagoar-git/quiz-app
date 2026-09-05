const bcrypt = require('bcryptjs');
const { parse } = require('csv-parse/sync');
const { query } = require('./_db');
const { verifyRole, json } = require('./_auth');

// Expected CSV: header row with a single "username" column.
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
  const { csvText, defaultPassword } = body;
  if (!csvText) return json(400, { error: 'csvText is required' });
  if (!defaultPassword || defaultPassword.length < 4) {
    return json(400, { error: 'defaultPassword is required (min 4 characters) — this is what every account in this batch starts with' });
  }

  let records;
  try {
    records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return json(400, { error: 'Could not parse CSV: ' + e.message });
  }

  const created = [];
  const skipped = [];
  const hash = await bcrypt.hash(defaultPassword, 10); // same default for the whole batch — set once, reused for every insert below

  for (const row of records) {
    const username = (row.username || '').trim();
    if (!username) continue;

    const { rows: existing } = await query('SELECT id FROM participants WHERE username = $1', [username]);
    if (existing.length > 0) {
      skipped.push(username);
      continue;
    }

    await query(
      'INSERT INTO participants (username, password_hash, must_change_password) VALUES ($1, $2, true)',
      [username, hash]
    );
    created.push(username);
  }

  return json(200, { created, skipped });
};
