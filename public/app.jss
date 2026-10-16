let questions = [], shortAnswers = [], shuffledQuestions = [], userAnswers = {}, saAnswers = {};
let currentQIndex = 0, studentInfo = {}, adminToken = '', quizStartTime = null, timerInterval = null;
let scoreDistChart = null, questionDiffChart = null, saPollingInterval = null;
const quizDuration = 15 * 60 * 1000;

const views = { register: document.getElementById('view-register'), quiz: document.getElementById('view-quiz'), shortAnswers: document.getElementById('view-short-answers'), results: document.getElementById('view-results'), adminLogin: document.getElementById('view-admin-login'), adminDash: document.getElementById('view-admin-dashboard') };

function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
    document.querySelector('.fixed-progress-bar').style.display = (viewName === 'quiz') ? 'block' : 'none';
}

async function init() {
    const res = await fetch('questions.json'); questions = await res.json();
    const saRes = await fetch('short-answers.json'); shortAnswers = await saRes.json();
    document.getElementById('q-total').textContent = questions.length;
}
init();

document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    studentInfo = { firstName: document.getElementById('first-name').value.trim(), middleName: document.getElementById('middle-name').value.trim(), surname: document.getElementById('surname').value.trim(), computerId: document.getElementById('computer-id').value.trim() };
    startQuiz();
});

function shuffleArray(array) { let newArr = [...array]; for (let i = newArr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [newArr[i], newArr[j]] = [newArr[j], newArr[i]]; } return newArr; }

function startQuiz() {
    shuffledQuestions = shuffleArray(questions).map(q => ({ ...q, shuffledOptions: shuffleArray(q.options) }));
    userAnswers = {}; saAnswers = {}; currentQIndex = 0; quizStartTime = Date.now();
    showView('quiz'); renderQuestion(); startTimer();
}

function startTimer() {
    const timerDisplay = document.createElement('div'); timerDisplay.id = 'timer-display'; timerDisplay.className = 'timer-display';
    document.querySelector('.quiz-header').appendChild(timerDisplay);
    const updateTimer = () => {
        const remaining = quizDuration - (Date.now() - quizStartTime);
        if (remaining <= 0) { clearInterval(timerInterval); timerDisplay.textContent = '⏱️ Time is up! (Late penalty will apply)'; timerDisplay.style.color = '#ef4444'; } 
        else {
            const m = Math.floor(remaining / 60000), s = Math.floor((remaining % 60000) / 1000);
            timerDisplay.textContent = `⏱️ ${m}:${s.toString().padStart(2, '0')} remaining`;
            timerDisplay.style.color = remaining < 180000 ? '#ef4444' : remaining < 300000 ? '#f97316' : 'var(--text)';
        }
    };
    updateTimer(); timerInterval = setInterval(updateTimer, 1000);
}

function renderQuestion() {
    const q = shuffledQuestions[currentQIndex];
    document.getElementById('q-current').textContent = currentQIndex + 1;
    document.getElementById('progress-fill').style.width = `${((currentQIndex + 1) / shuffledQuestions.length) * 100}%`;
    document.getElementById('question-container').innerHTML = `<p class="question-text">${q.question}</p><ul class="options-list">${q.shuffledOptions.map(opt => `<li class="option-item ${userAnswers[q.question] === opt ? 'selected' : ''}" data-option="${opt}">${opt}</li>`).join('')}</ul>`;
    document.querySelectorAll('.option-item').forEach(item => item.addEventListener('click', () => { document.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected')); item.classList.add('selected'); userAnswers[q.question] = item.dataset.option; }));
    document.getElementById('btn-next').textContent = currentQIndex === shuffledQuestions.length - 1 ? 'Submit MCQs' : 'Next';
}

document.getElementById('btn-next').addEventListener('click', () => {
    if (!userAnswers[shuffledQuestions[currentQIndex].question]) { alert('Please select an answer.'); return; }
    if (currentQIndex === shuffledQuestions.length - 1) submitMCQs(); else { currentQIndex++; renderQuestion(); }
});

async function submitMCQs() {
    clearInterval(timerInterval);
    let correctCount = 0; const total = shuffledQuestions.length;
    shuffledQuestions.forEach(q => { if (userAnswers[q.question] === q.correct_answer) correctCount++; });
    const isLate = (Date.now() - quizStartTime) > quizDuration;
    let percentage = Math.round((correctCount / total) * 100);
    if (isLate) { percentage = Math.floor(percentage * 0.5); }
    
    const rawAnswers = {}; shuffledQuestions.forEach(q => { rawAnswers[q.question] = userAnswers[q.question]; });
    const res = await fetch('/api/submit-quiz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...studentInfo, score: correctCount, total, percentage, userAnswers: rawAnswers, penaltyApplied: isLate, timeElapsed: Date.now() - quizStartTime }) });
    const data = await res.json();

    document.getElementById('score-text').textContent = `Score: ${correctCount}/${total} (${percentage}%)${isLate ? ' ⚠️ (50% late penalty applied)' : ''}`;
    document.getElementById('breakdown-container').innerHTML = shuffledQuestions.map((q, idx) => {
        const userAns = userAnswers[q.question], isCorrect = userAns === q.correct_answer;
        const wrongReasons = q.shuffledOptions.filter(opt => opt !== q.correct_answer).map(opt => `<li><strong>${opt.substring(0, 40)}...</strong>: ${q.explanations.incorrect_reasons.find(r => r.includes(opt.substring(0, 20))) || "Incorrect."}</li>`).join('');
        return `<div class="question-review ${isCorrect ? 'correct' : 'incorrect'}"><p class="review-header">Q${idx + 1}: ${q.question}</p><div class="review-answers"><p><strong>Your Answer:</strong> ${userAns} ${isCorrect ? '✅' : '❌'}</p><p><strong>Correct Answer:</strong> ${q.correct_answer}</p></div><div class="review-explanation"><strong>✅ Why right:</strong><p>${q.explanations.correct_reason}</p>${!isCorrect ? `<strong style="margin-top:10px;"> Why wrong:</strong><ul style="margin-left:20px;">${wrongReasons}</ul>` : ''}</div></div>`;
    }).join('');
    
    showView('shortAnswers');
    startSAPolling(data.studentId || studentInfo.computerId);
}

function startSAPolling(computerId) {
    document.getElementById('sa-waiting').style.display = 'block';
    document.getElementById('sa-questions').style.display = 'none';
    saPollingInterval = setInterval(async () => {
        const res = await fetch('/api/short-answers/status');
        const data = await res.json();
        if (data.enabled) {
            clearInterval(saPollingInterval);
            document.getElementById('sa-waiting').style.display = 'none';
            document.getElementById('sa-questions').style.display = 'block';
            renderShortAnswers();
            document.getElementById('btn-submit-sa').onclick = () => submitShortAnswers(computerId);
        }
    }, 3000);
}

function renderShortAnswers() {
    document.getElementById('sa-container').innerHTML = shortAnswers.map(q => `<div class="sa-question-block"><label>${q.id}. ${q.question}</label><textarea id="sa-${q.id}" placeholder="Type your answer here..."></textarea></div>`).join('');
}

async function submitShortAnswers(computerId) {
    const answers = {};
    shortAnswers.forEach(q => { answers[q.id] = document.getElementById(`sa-${q.id}`).value.trim(); });
    await fetch('/api/submit-short-answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ computerId, answers }) });
    showView('results');
}

document.getElementById('btn-download-pdf').addEventListener('click', () => {
    const btn = document.getElementById('btn-download-pdf'); btn.textContent = 'Generating...'; btn.disabled = true;
    html2pdf().from(document.getElementById('results-content')).set({ margin: 10, filename: `Quiz_${studentInfo.firstName}_${studentInfo.surname}.pdf`, html2canvas: { scale: 2 }, jsPDF: { format: 'a4' } }).save().then(() => { btn.textContent = '📄 Download PDF Report'; btn.disabled = false; });
});
document.getElementById('btn-retake').addEventListener('click', () => { document.getElementById('register-form').reset(); document.querySelector('#timer-display')?.remove(); showView('register'); });
document.getElementById('settings-btn').addEventListener('click', () => { showView('adminLogin'); document.getElementById('admin-password').value = ''; document.getElementById('login-error').textContent = ''; });
document.getElementById('btn-cancel-login').addEventListener('click', () => showView('register'));

document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('admin-password').value }) });
    const data = await res.json();
    if (data.success) { adminToken = data.token; loadAdminData(); showView('adminDash'); } else { document.getElementById('login-error').textContent = 'Incorrect password!'; }
});
document.getElementById('btn-logout').addEventListener('click', () => { adminToken = ''; showView('register'); });

document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active')); btn.classList.add('active'); document.getElementById(`tab-content-${btn.dataset.tab}`).classList.add('active'); }));

document.getElementById('btn-toggle-sa').addEventListener('click', async () => {
    const res = await fetch('/api/admin/short-answers/toggle', { method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` } });
    const data = await res.json();
    const btn = document.getElementById('btn-toggle-sa');
    if (data.enabled) { btn.textContent = '🔒 Disable Short Answer Section'; btn.style.background = '#ef4444'; } else { btn.textContent = '🔓 Enable Short Answer Section for Students'; btn.style.background = 'var(--primary)'; }
});

async function loadAdminData() {
    const res = await fetch('/api/admin/marks', { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const data = await res.json();
    if (data.success) { renderMarksTable(data.data); renderAnalytics(data.data); }
}

let sortDirection = {};
function renderMarksTable(records) {
    document.getElementById('marks-tbody').innerHTML = records.filter(r => r.type === 'mcq').map(r => {
        const name = `${r.firstName} ${r.middleName || ''} ${r.surname}`.replace(/\s+/g, ' ').trim();
        return `<tr><td>${name}${r.penaltyApplied ? ' ⚠️' : ''}</td><td>${r.computerId}</td><td>${new Date(r.timestamp).toLocaleString()}</td><td><strong>${r.percentage}%</strong></td><td>${r.shortAnswers ? '✅ Submitted' : '⏳ Pending'}</td></tr>`;
    }).join('');
}
document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
    const key = th.dataset.sort; sortDirection[key] = !sortDirection[key];
    fetch('/api/admin/marks', { headers: { 'Authorization': `Bearer ${adminToken}` } }).then(res => res.json()).then(data => {
        if(data.success) {
            const sorted = data.data.filter(r => r.type === 'mcq').sort((a, b) => {
                let valA = key === 'name' ? `${a.firstName} ${a.surname}` : key === 'timestamp' ? new Date(a.timestamp) : a[key];
                let valB = key === 'name' ? `${b.firstName} ${b.surname}` : key === 'timestamp' ? new Date(b.timestamp) : b[key];
                return valA < valB ? (sortDirection[key] ? -1 : 1) : valA > valB ? (sortDirection[key] ? 1 : -1) : 0;
            });
            renderMarksTable(sorted);
        }
    });
}));

function renderAnalytics(records) {
    const mcqRecords = records.filter(r => r.type === 'mcq');
    const container = document.getElementById('analytics-container');
    if (!mcqRecords.length) { container.innerHTML = '<p class="empty-state">No students have taken the quiz yet.</p>'; return; }
    const scores = mcqRecords.map(r => r.percentage);
    const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    const dist = { '0-20%': 0, '21-40%': 0, '41-60%': 0, '61-80%': 0, '81-100%': 0 };
    scores.forEach(s => { if (s <= 20) dist['0-20%']++; else if (s <= 40) dist['21-40%']++; else if (s <= 60) dist['41-60%']++; else if (s <= 80) dist['61-80%']++; else dist['81-100%']++; });
    const qStats = questions.map(q => { let c = 0, t = 0; mcqRecords.forEach(r => { if (r.userAnswers?.[q.question] !== undefined) { t++; if (r.userAnswers[q.question] === q.correct_answer) c++; } }); return { label: q.question.substring(0, 60) + (q.question.length>60?'...':''), pct: t ? Math.round((c/t)*100) : 0 }; });
    container.innerHTML = `<div class="stats-grid"><div class="stat-card"><h3>Total Attempts</h3><div class="stat-value">${mcqRecords.length}</div></div><div class="stat-card"><h3>Class Average</h3><div class="stat-value">${avg}%</div></div><div class="stat-card high"><h3>Highest</h3><div class="stat-value">${Math.max(...scores)}%</div></div><div class="stat-card low"><h3>Lowest</h3><div class="stat-value">${Math.min(...scores)}%</div></div></div><div class="charts-grid"><div class="chart-card"><h3>Score Distribution</h3><div class="chart-container"><canvas id="scoreDistChart"></canvas></div></div><div class="chart-card"><h3>Question Difficulty</h3><div class="chart-container"><canvas id="questionDiffChart"></canvas></div></div></div>`;
    if (scoreDistChart) scoreDistChart.destroy(); if (questionDiffChart) questionDiffChart.destroy();
    scoreDistChart = new Chart(document.getElementById('scoreDistChart').getContext('2d'), { type: 'doughnut', data: { labels: Object.keys(dist), datasets: [{ data: Object.values(dist), backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
    questionDiffChart = new Chart(document.getElementById('questionDiffChart').getContext('2d'), { type: 'bar', data: { labels: qStats.map(q=>q.label), datasets: [{ data: qStats.map(q=>q.pct), backgroundColor: qStats.map(q=>q.pct>=80?'#10b981':q.pct>=50?'#eab308':'#ef4444') }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, max: 100, ticks: { callback: v=>v+'%' } }, y: { ticks: { font: { size: 10 }, autoSkip: false } } }, plugins: { legend: { display: false } } } });
}