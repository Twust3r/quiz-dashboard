const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMINS = { MAPIKI: '123', MACHI: '123' }; // username (case-insensitive) -> password
const isAdmin = (u, p) => {
  const key = String(u || '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(ADMINS, key) && ADMINS[key] === String(p || '');
};
const DATA_FILE = path.join(__dirname, 'data.json');
const TIME_LIMIT_SECONDS = 15 * 60;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { submissions: [], shortEnabled: false };
  }
}
function saveData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}
if (!fs.existsSync(DATA_FILE)) saveData({ submissions: [], shortEnabled: false });

function loadQuestions() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'questions.json'), 'utf8'));
}
const clean = (v, max = 80) => String(v || '').trim().slice(0, max);

function requireAdmin(req, res, next) {
  if (isAdmin(req.get('x-admin-user'), req.get('x-admin-password'))) return next();
  res.status(401).json({ error: 'Incorrect username or password' });
}

// Public: is the short answer section enabled?
app.get('/api/status', (req, res) => {
  res.json({ shortEnabled: !!loadData().shortEnabled });
});

// Student submits MCQ answers: { student, answers: {qid: selectedText}, elapsed }
app.post('/api/submit-mcq', (req, res) => {
  const { student, answers, elapsed } = req.body || {};
  if (!student || !clean(student.firstName) || !clean(student.surname) || !clean(student.computerId)) {
    return res.status(400).json({ error: 'Missing student details' });
  }
  const questions = loadQuestions();
  const correctMap = {};
  let score = 0;
  questions.forEach((q) => {
    const ok = !!answers && answers[q.id] === q.options[q.correct_index];
    correctMap[q.id] = ok;
    if (ok) score++;
  });
  const penalty = Number(elapsed) > TIME_LIMIT_SECONDS;
  const finalScore = penalty ? Math.round((score / 2) * 10) / 10 : score;
  const data = loadData();
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    firstName: clean(student.firstName),
    middleName: clean(student.middleName),
    surname: clean(student.surname),
    computerId: clean(student.computerId, 40),
    date: new Date().toISOString(),
    elapsed: Math.round(Number(elapsed) || 0),
    rawScore: score,
    finalScore,
    total: questions.length,
    penalty,
    correctMap,
    shortSubmitted: false,
    shortAnswers: []
  };
  data.submissions.push(record);
  saveData(data);
  res.json({ id: record.id, rawScore: score, finalScore, total: questions.length, penalty, correctMap });
});

// Student submits ungraded short answers: { id, answers: [string x20] }
app.post('/api/submit-short', (req, res) => {
  const { id, answers } = req.body || {};
  const data = loadData();
  const rec = data.submissions.find((s) => s.id === id);
  if (!rec) return res.status(404).json({ error: 'Submission not found' });
  rec.shortAnswers = (Array.isArray(answers) ? answers : []).slice(0, 20).map((a) => clean(a, 3000));
  rec.shortSubmitted = true;
  saveData(data);
  res.json({ ok: true });
});

// Admin
app.post('/api/admin/login', (req, res) => {
  const b = req.body || {};
  if (isAdmin(b.username, b.password)) return res.json({ ok: true });
  res.status(401).json({ error: 'Incorrect username or password' });
});

app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  const d = loadData();
  res.json({ submissions: d.submissions, shortEnabled: !!d.shortEnabled });
});

app.post('/api/admin/enable-short', requireAdmin, (req, res) => {
  const d = loadData();
  d.shortEnabled = req.body && typeof req.body.enabled === 'boolean' ? req.body.enabled : true;
  saveData(d);
  res.json({ shortEnabled: d.shortEnabled });
});

app.listen(PORT, () => console.log(`Quiz dashboard running on http://localhost:${PORT}`));
