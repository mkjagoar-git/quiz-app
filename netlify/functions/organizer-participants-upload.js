const bcrypt = require('bcryptjs');
const { query } = require('./_db');
const { verifyRole, json } = require('./_auth');

// Accepts plain text: one username per line (commas also work as separators). No CSV/header needed.
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
  const { usernames, defaultPassword } = body;
  if (!usernames) return json(400, { error: 'usernames is required' });
  if (!defaultPassword || defaultPassword.length < 4) {
    return json(400, { error: 'defaultPassword is required (min 4 characters) — this is what every account in this batch starts with' });
  }

  const usernameList = usernames
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (usernameList.length === 0) return json(400, { error: 'No usernames found — type one per line' });

  const created = [];
  const skipped = [];
  const hash = await bcrypt.hash(defaultPassword, 10); // same default for the whole batch — set once, reused for every insert below

  for (const username of usernameList) {
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
