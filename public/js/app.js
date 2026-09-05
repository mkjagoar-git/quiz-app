const API = '/api';

const ALL_VIEWS = [
  'roleView', 'orgLoginView', 'orgDashView',
  'partLoginView', 'partChangePwView', 'partListView', 'partQuizView', 'partResultView',
];

function showView(name) {
  for (const v of ALL_VIEWS) {
    document.getElementById(v).style.display = v === name ? 'block' : 'none';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===================== ORGANIZER =====================

let quizSlotsCache = [];

function orgAuthHeaders() {
  const token = sessionStorage.getItem('organizerToken');
  return token ? { Authorization: 'Bearer ' + token } : {};
}

async function orgLogin() {
  const username = document.getElementById('orgUser').value.trim();
  const password = document.getElementById('orgPass').value;
  const errEl = document.getElementById('orgLoginError');
  errEl.textContent = '';
  try {
    const res = await fetch(`${API}/organizer-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Login failed'; return; }
    sessionStorage.setItem('organizerToken', data.token);
    showView('orgDashView');
    orgLoadQuizSlots();
    orgLoadReports();
  } catch (e) {
    errEl.textContent = 'Network error';
  }
}

function orgLogout() {
  sessionStorage.removeItem('organizerToken');
  showView('roleView');
}

async function orgLoadQuizSlots() {
  const res = await fetch(`${API}/organizer-quiz-config`, { headers: orgAuthHeaders() });
  if (res.status === 401) { showView('orgLoginView'); return; }
  const data = await res.json();
  quizSlotsCache = data.quizzes;
  const container = document.getElementById('quizSlots');
  container.innerHTML = '';
  for (const q of data.quizzes) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>QUIZ-${q.slot_number}</h3>
      <p class="lede">${q.uploaded_questions} question(s) uploaded · ${q.is_active ? 'active' : 'not active yet'}</p>
      <label>Quiz name (as shown to participants)</label>
      <input type="text" id="name-${q.slot_number}" value="${escapeHtml(q.quiz_name)}">
      <label>Duration (minutes)</label>
      <input type="number" id="dur-${q.slot_number}" value="${q.duration_minutes}">
      <label>Number of questions per attempt</label>
      <input type="number" id="num-${q.slot_number}" value="${q.num_questions}">
      <button onclick="orgSaveQuizConfig(${q.slot_number})">Save settings</button>
      <div id="configResult-${q.slot_number}" class="notice"></div>

      <label style="margin-top:20px">Upload / replace question bank (CSV)</label>
      <p class="lede" style="margin:2px 0 6px">Columns: question,option_a,option_b,option_c,option_d,correct — "correct" is the option letter(s), e.g. "a" or "a;c" for multi-select.</p>
      <textarea id="csv-${q.slot_number}" placeholder="question,option_a,option_b,option_c,option_d,correct"></textarea>
      <button onclick="orgUploadQuestions(${q.slot_number})">Upload questions</button>
      <div id="uploadResult-${q.slot_number}" class="notice"></div>
    `;
    container.appendChild(card);
  }
}

async function orgSaveQuizConfig(slot) {
  const quizName = document.getElementById(`name-${slot}`).value.trim();
  const durationMinutes = Number(document.getElementById(`dur-${slot}`).value);
  const numQuestions = Number(document.getElementById(`num-${slot}`).value);
  const resEl = document.getElementById(`configResult-${slot}`);
  const res = await fetch(`${API}/organizer-quiz-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...orgAuthHeaders() },
    body: JSON.stringify({ slotNumber: slot, quizName, durationMinutes, numQuestions }),
  });
  const data = await res.json();
  resEl.textContent = res.ok ? 'Saved.' : (data.error || 'Save failed');
  if (res.ok) orgLoadQuizSlots();
}

async function orgUploadQuestions(slot) {
  const csvText = document.getElementById(`csv-${slot}`).value;
  const resEl = document.getElementById(`uploadResult-${slot}`);
  const res = await fetch(`${API}/organizer-quiz-upload-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...orgAuthHeaders() },
    body: JSON.stringify({ slotNumber: slot, csvText }),
  });
  const data = await res.json();
  resEl.textContent = res.ok ? `Uploaded ${data.questionsUploaded} question(s).` : (data.error || 'Upload failed');
  if (res.ok) orgLoadQuizSlots();
}

async function orgUploadParticipants() {
  const usernames = document.getElementById('participantUsernames').value;
  const defaultPassword = document.getElementById('defaultPassword').value;
  const resEl = document.getElementById('participantsResult');
  const res = await fetch(`${API}/organizer-participants-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...orgAuthHeaders() },
    body: JSON.stringify({ usernames, defaultPassword }),
  });
  const data = await res.json();
  if (!res.ok) { resEl.textContent = data.error || 'Upload failed'; return; }
  resEl.textContent = `Created: ${data.created.join(', ') || 'none'}. Already existed: ${data.skipped.join(', ') || 'none'}.`;
}

async function orgResetParticipant() {
  const username = document.getElementById('resetUser').value.trim();
  const newPassword = document.getElementById('resetNewPw').value;
  const slotVal = document.getElementById('retakeSlot').value;
  const resEl = document.getElementById('resetResult');
  const res = await fetch(`${API}/organizer-reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...orgAuthHeaders() },
    body: JSON.stringify({
      username,
      newPassword: newPassword || undefined,
      grantRetakeSlot: slotVal ? Number(slotVal) : undefined,
    }),
  });
  const data = await res.json();
  resEl.textContent = res.ok ? 'Applied.' : (data.error || 'Failed');
}

async function orgLoadReports() {
  const slot = document.getElementById('reportSlot').value;
  const url = slot ? `${API}/organizer-reports?slot=${slot}` : `${API}/organizer-reports`;
  const res = await fetch(url, { headers: orgAuthHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  const tbody = document.querySelector('#reportsTable tbody');
  tbody.innerHTML = '';
  for (const a of data.attempts) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(a.username)}</td>
      <td>${escapeHtml(a.quiz_name)}</td>
      <td>${a.attempt_number}</td>
      <td>${a.score} / ${a.total_marks}</td>
      <td>${new Date(a.submitted_at).toLocaleString()}</td>
      <td><button class="link" onclick="orgDownloadCertificate(${a.attempt_id}, '${escapeHtml(a.username)}')">Certificate</button></td>
    `;
    tbody.appendChild(tr);
  }
}

async function orgDownloadReportPdf() {
  const slot = document.getElementById('reportSlot').value;
  const url = slot ? `${API}/organizer-reports-pdf?slot=${slot}` : `${API}/organizer-reports-pdf`;
  const res = await fetch(url, { headers: orgAuthHeaders() });
  if (!res.ok) { alert('Could not generate the report'); return; }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = slot ? `quiz-report-quiz-${slot}.pdf` : 'quiz-report.pdf';
  a.click();
  URL.revokeObjectURL(objUrl);
}

async function orgDownloadCertificate(attemptId, username) {
  const res = await fetch(`${API}/organizer-certificate?attemptId=${attemptId}`, { headers: orgAuthHeaders() });
  if (!res.ok) { alert('Could not generate certificate'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `certificate-${username}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===================== PARTICIPANT =====================

let currentAttempt = null;
let timerInterval = null;

function partAuthHeaders() {
  const token = sessionStorage.getItem('participantToken');
  return token ? { Authorization: 'Bearer ' + token } : {};
}

async function partLogin() {
  const username = document.getElementById('pUser').value.trim();
  const password = document.getElementById('pPass').value;
  const errEl = document.getElementById('pLoginError');
  errEl.textContent = '';
  const res = await fetch(`${API}/participant-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'Login failed'; return; }
  sessionStorage.setItem('participantToken', data.token);
  if (data.mustChangePassword) {
    showView('partChangePwView');
  } else {
    showView('partListView');
    partLoadQuizList();
  }
}

async function partChangePassword() {
  const newPassword = document.getElementById('newPw').value;
  const errEl = document.getElementById('changePwError');
  const res = await fetch(`${API}/participant-change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...partAuthHeaders() },
    body: JSON.stringify({ newPassword }),
  });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'Could not set password'; return; }
  showView('partListView');
  partLoadQuizList();
}

function partLogout() {
  sessionStorage.removeItem('participantToken');
  clearInterval(timerInterval);
  showView('roleView');
}

async function partLoadQuizList() {
  const res = await fetch(`${API}/participant-quizzes`, { headers: partAuthHeaders() });
  if (res.status === 401) { showView('partLoginView'); return; }
  const data = await res.json();
  const container = document.getElementById('quizList');
  container.innerHTML = '';
  for (const q of data.quizzes) {
    const card = document.createElement('div');
    card.className = 'card';
    const statusLine = Number(q.attempts_taken) === 0
      ? 'Not attempted yet'
      : `Best score so far: ${q.best_score} — ${q.retake_allowed ? 'retake unlocked' : 'already attempted'}`;
    card.innerHTML = `
      <h3>${escapeHtml(q.quiz_name)}</h3>
      <p class="lede">${q.duration_minutes} min · ${q.num_questions} question(s) · ${statusLine}</p>
      <button ${q.can_attempt ? '' : 'disabled'} onclick="partStartQuiz(${q.slot_number})">
        ${Number(q.attempts_taken) === 0 ? 'Start quiz' : 'Retake quiz'}
      </button>
    `;
    container.appendChild(card);
  }
}

async function partStartQuiz(slotNumber) {
  const res = await fetch(`${API}/participant-quiz-start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...partAuthHeaders() },
    body: JSON.stringify({ slotNumber }),
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error || 'Could not start quiz'); return; }

  currentAttempt = { attemptId: data.attemptId, questions: data.questions };
  document.getElementById('quizTitle').textContent = data.quizName;
  partRenderQuestions(data.questions);
  showView('partQuizView');
  partStartTimer(data.durationMinutes);
}

function partRenderQuestions(questions) {
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';
  questions.forEach((q, qi) => {
    const block = document.createElement('div');
    block.className = 'card';
    let optsHtml = '';
    q.options.forEach((o) => {
      optsHtml += `
        <div class="option-row">
          <input type="checkbox" name="q-${q.id}" value="${o.id}">
          <span>${escapeHtml(o.text)}</span>
        </div>`;
    });
    block.innerHTML = `<p><strong>${qi + 1}.</strong> ${escapeHtml(q.text)}</p>${optsHtml}`;
    container.appendChild(block);
  });
}

function partStartTimer(durationMinutes) {
  const endTime = Date.now() + durationMinutes * 60 * 1000;
  const display = document.getElementById('timerDisplay');
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const remaining = Math.max(0, endTime - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (remaining <= 0) {
      clearInterval(timerInterval);
      partSubmitQuiz();
    }
  }, 250);
}

async function partSubmitQuiz() {
  clearInterval(timerInterval);
  if (!currentAttempt) return;
  const answers = currentAttempt.questions.map((q) => {
    const checked = document.querySelectorAll(`input[name="q-${q.id}"]:checked`);
    return { questionId: q.id, selectedOptionIds: Array.from(checked).map((c) => Number(c.value)) };
  });

  const res = await fetch(`${API}/participant-quiz-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...partAuthHeaders() },
    body: JSON.stringify({ attemptId: currentAttempt.attemptId, answers }),
  });
  const data = await res.json();
  const errEl = document.getElementById('submitError');
  if (!res.ok) { errEl.textContent = data.error || 'Submit failed'; return; }

  document.getElementById('resultText').textContent = `Score: ${data.score} / ${data.totalMarks}`;
  currentAttempt = null;
  showView('partResultView');
}

function partBackToList() {
  showView('partListView');
  partLoadQuizList();
}

// ===================== INITIAL STATE =====================

if (sessionStorage.getItem('organizerToken')) {
  showView('orgDashView');
  orgLoadQuizSlots();
  orgLoadReports();
} else if (sessionStorage.getItem('participantToken')) {
  showView('partListView');
  partLoadQuizList();
} else {
  showView('roleView');
}
