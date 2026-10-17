const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const LIMIT = 15 * 60;

let MCQ = [], SA = [];
let quiz = [], idx = 0, answers = {}, student = {}, result = null, shortAnswers = [];
let startTime = 0, timerInt = null, pollInt = null;
let adminPw = '', subs = [], shortEnabled = false, sortKey = 'date', sortDir = -1, charts = {};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const show = (id) => { $$('.screen').forEach((e) => e.classList.add('hidden')); $('#' + id).classList.remove('hidden'); window.scrollTo(0, 0); };

async function api(url, body, pw) {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-admin-password': pw || '' },
    body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

async function init() {
  try {
    [MCQ, SA] = await Promise.all([
      fetch('questions.json').then((r) => r.json()),
      fetch('short-answers.json').then((r) => r.json())
    ]);
  } catch (e) {
    alert('Could not load question files.');
  }
}

/* ---------- Registration & Quiz ---------- */
$('#regForm').addEventListener('submit', (e) => {
  e.preventDefault();
  student = {
    firstName: $('#firstName').value.trim(),
    middleName: $('#middleName').value.trim(),
    surname: $('#surname').value.trim(),
    computerId: $('#computerId').value.trim()
  };
  if (!MCQ.length) return alert('Questions not loaded. Refresh the page.');
  quiz = shuffle(MCQ).map((q) => ({ ...q, opts: shuffle(q.options) }));
  idx = 0; answers = {}; startTime = Date.now();
  $('#progressWrap').classList.remove('hidden');
  show('quiz');
  renderQ();
  tick();
  timerInt = setInterval(tick, 1000);
});

function fmt(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }

function tick() {
  const el = Math.floor((Date.now() - startTime) / 1000);
  const t = $('#timer');
  if (el <= LIMIT) {
    t.textContent = fmt(LIMIT - el);
    t.className = 'timer' + (LIMIT - el <= 60 ? ' low' : '');
  } else {
    t.textContent = '+' + fmt(el - LIMIT) + ' overtime';
    t.className = 'timer over';
    $('#timeWarn').classList.remove('hidden');
  }
}

function renderQ() {
  const q = quiz[idx];
  $('#qCounter').textContent = `Question ${idx + 1} of ${quiz.length}`;
  $('#progressBar').style.width = (idx / quiz.length) * 100 + '%';
  $('#qText').textContent = `${idx + 1}. ${q.question}`;
  $('#qOptions').innerHTML = q.opts.map((o, i) => `<button class="opt" data-i="${i}">${String.fromCharCode(65 + i)}. ${esc(o)}</button>`).join('');
  $('#nextBtn').textContent = idx === quiz.length - 1 ? 'Submit MCQs' : 'Next';
  $('#nextBtn').disabled = true;
  $$('.opt').forEach((b) => b.addEventListener('click', () => {
    $$('.opt').forEach((x) => x.classList.remove('selected'));
    b.classList.add('selected');
    answers[q.id] = q.opts[+b.dataset.i];
    $('#nextBtn').disabled = false;
  }));
}

$('#nextBtn').addEventListener('click', async () => {
  if (idx < quiz.length - 1) { idx++; renderQ(); return; }
  clearInterval(timerInt);
  $('#progressBar').style.width = '100%';
  $('#nextBtn').disabled = true;
  try {
    result = await api('/api/submit-mcq', { student, answers, elapsed: Math.floor((Date.now() - startTime) / 1000) });
    $('#progressWrap').classList.add('hidden');
    renderShort();
  } catch (err) {
    alert(err.message);
    $('#nextBtn').disabled = false;
    timerInt = setInterval(tick, 1000);
  }
});

/* ---------- Waiting & Short answers ---------- */
function renderShort() {
  $('#shortList').innerHTML = SA.map((q, i) => `
    <div class="sa-item"><p>${i + 1}. ${esc(q.question)}</p>
    <textarea data-i="${i}" placeholder="Type your answer…"></textarea></div>`).join('');
  show('short');
}

$('#shortSubmit').addEventListener('click', async () => {
  shortAnswers = [...$$('#shortList textarea')].map((t) => t.value.trim());
  $('#shortSubmit').disabled = true;
  try {
    await api('/api/submit-short', { id: result.id, answers: shortAnswers });
    renderResults();
  } catch (err) {
    alert(err.message);
    $('#shortSubmit').disabled = false;
  }
});

/* ---------- Results ---------- */
function reasonFor(q, text) {
  const correct = q.options[q.correct_index];
  const ex = q.explanations || {};
  if (text === correct) return ex.correct_reason || '';
  const wrong = q.options.filter((_, i) => i !== q.correct_index);
  return (ex.incorrect_reasons || [])[wrong.indexOf(text)] || '';
}

function renderResults() {
  const name = [student.firstName, student.middleName, student.surname].filter(Boolean).join(' ');
  let h = `<h2>Results — ${esc(name)}</h2><p class="note">Computer ID: ${esc(student.computerId)}</p>
    <div class="score-big">${result.finalScore} / ${result.total}</div>`;
  if (result.penalty) {
    h += `<div class="penalty-box">⚠️ You exceeded the 15-minute limit, so a 50% penalty was applied. Raw score: ${result.rawScore} / ${result.total}.</div>`;
  }
  h += '<h3>MCQ Breakdown</h3>';
  quiz.forEach((q, n) => {
    const correct = q.options[q.correct_index];
    const mine = answers[q.id];
    const ok = mine === correct;
    h += `<div class="res-q ${ok ? 'ok' : 'bad'}"><h4>${n + 1}. ${esc(q.question)} ${ok ? '✅' : '❌'}</h4>`;
    q.opts.forEach((o) => {
      const cls = o === correct ? 'right' : o === mine ? 'wrong' : '';
      const tag = o === correct ? ' (correct)' : o === mine ? ' (your answer)' : '';
      const why = reasonFor(q, o);
      h += `<div class="res-opt ${cls}">${esc(o)}<b>${tag}</b>${why ? `<span class="reason">${esc(why)}</span>` : ''}</div>`;
    });
    h += '</div>';
  });
  h += '<h3>Short Answers (Ungraded) — Answer Key</h3>';
  SA.forEach((q, i) => {
    h += `<div class="key-box"><b>${i + 1}. ${esc(q.question)}</b>
      <p><u>Your answer:</u> ${esc(shortAnswers[i] || '(blank)')}</p>
      <p><u>Key:</u> ${esc(q.answer_key)}</p><p><i>Trick: ${esc(q.trick)}</i></p></div>`;
  });
  $('#resultsContent').innerHTML = h;
  show('results');
}

$('#pdfBtn').addEventListener('click', async () => {
  const btn = $('#pdfBtn');
  btn.disabled = true; btn.textContent = 'Preparing PDF…';
  window.scrollTo(0, 0);
  // Render a clean copy in a visible, top-left positioned wrapper (avoids blank PDFs)
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;top:0;left:0;width:720px;background:#fff;color:#17324a;padding:16px;z-index:-1;';
  wrap.innerHTML = $('#resultsContent').innerHTML;
  document.body.appendChild(wrap);
  try {
    await new Promise((r) => setTimeout(r, 300));
    await html2pdf().set({
      margin: [10, 10, 10, 10],
      filename: `Quiz-Results-${student.surname || 'student'}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0, windowWidth: 760 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    }).from(wrap).save();
  } catch (e) {
    alert('PDF failed. Try again or use your browser Print > Save as PDF.');
  } finally {
    wrap.remove(); btn.disabled = false; btn.textContent = '⬇ Download PDF';
  }
});

/* ---------- Admin ---------- */
$('#settingsBtn').addEventListener('click', () => {
  $('#adminPw').value = ''; $('#loginErr').textContent = '';
  $('#adminLogin').classList.remove('hidden');
  $('#adminPw').focus();
});
$('#loginCancel').addEventListener('click', () => $('#adminLogin').classList.add('hidden'));
$('#adminPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginBtn').click(); });

$('#loginBtn').addEventListener('click', async () => {
  try {
    const pw = $('#adminPw').value;
    await api('/api/admin/login', { password: pw });
    adminPw = pw;
    $('#adminLogin').classList.add('hidden');
    $('#progressWrap').classList.add('hidden');
    show('admin');
    loadAdmin();
  } catch (e) { $('#loginErr').textContent = 'Incorrect password'; }
});

$('#exitAdmin').addEventListener('click', () => {
  adminPw = '';
  if (result && !$('#results').classList.contains('hidden')) return show('results');
  location.reload();
});

$$('.tab').forEach((t) => t.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
  $('#tab-marks').classList.toggle('hidden', t.dataset.tab !== 'marks');
  $('#tab-analytics').classList.toggle('hidden', t.dataset.tab !== 'analytics');
  if (t.dataset.tab === 'analytics') renderAnalytics();
}));

async function loadAdmin() {
  try {
    const d = await api('/api/admin/submissions', null, adminPw);
    subs = d.submissions.map((s) => ({ ...s, name: [s.firstName, s.middleName, s.surname].filter(Boolean).join(' ') }));
    shortEnabled = d.shortEnabled;
    renderTable();
    if (!$('#tab-analytics').classList.contains('hidden')) renderAnalytics();
  } catch (e) { alert(e.message); }
}

$('#refreshBtn').addEventListener('click', loadAdmin);

$$('#marksTable th').forEach((th) => th.addEventListener('click', () => {
  const k = th.dataset.k;
  sortDir = sortKey === k ? -sortDir : 1;
  sortKey = k;
  renderTable();
}));

function renderTable() {
  const rows = [...subs].sort((a, b) => {
    const x = a[sortKey], y = b[sortKey];
    return (typeof x === 'string' ? x.localeCompare(y) : (x > y) - (x < y)) * sortDir;
  });
  $('#marksTable tbody').innerHTML = rows.length ? rows.map((s) => `<tr>
      <td>${esc(s.name)}</td><td>${esc(s.computerId)}</td><td>${new Date(s.date).toLocaleString()}</td>
      <td><b>${s.finalScore}</b> / ${s.total}</td><td>${s.penalty ? '⚠️' : '—'}</td>
      <td>${s.shortSubmitted ? '✅' : '⏳'}</td></tr>`).join('')
    : '<tr><td colspan="6">No submissions yet.</td></tr>';
}

function renderAnalytics() {
  const n = subs.length;
  const scores = subs.map((s) => s.finalScore);
  const avg = n ? (scores.reduce((a, b) => a + b, 0) / n).toFixed(1) : '—';
  $('#stats').innerHTML = [['Total Attempts', n], ['Class Average', avg], ['Highest', n ? Math.max(...scores) : '—'], ['Lowest', n ? Math.min(...scores) : '—']]
    .map(([l, v]) => `<div class="stat"><b>${v}</b>${l}</div>`).join('');

  const buckets = [0, 0, 0, 0];
  subs.forEach((s) => {
    const p = (s.finalScore / s.total) * 100;
    buckets[p < 40 ? 0 : p < 60 ? 1 : p < 80 ? 2 : 3]++;
  });
  Object.values(charts).forEach((c) => c.destroy());
  charts.dist = new Chart($('#distChart'), {
    type: 'doughnut',
    data: { labels: ['0–39%', '40–59%', '60–79%', '80–100%'], datasets: [{ data: buckets, backgroundColor: ['#e57373', '#f2c14e', '#5db8ee', '#2eb872'] }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  const pct = MCQ.map((q) => {
    const c = subs.filter((s) => s.correctMap && s.correctMap[q.id]).length;
    return n ? Math.round((c / n) * 100) : 0;
  });
  charts.diff = new Chart($('#diffChart'), {
    type: 'bar',
    data: { labels: MCQ.map((q) => `Q${q.id}: ${q.topic || ''}`), datasets: [{ label: '% correct', data: pct, backgroundColor: '#2e9fe0' }] },
    options: { indexAxis: 'y', scales: { x: { min: 0, max: 100 } }, plugins: { legend: { display: false } } }
  });
}

init();
