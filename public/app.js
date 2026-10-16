let questions = [];
let shuffledQuestions = [];
let userAnswers = {};
let currentQIndex = 0;
let studentInfo = {};
let adminToken = '';
let scoreDistChart = null;
let questionDiffChart = null;

const views = {
    register: document.getElementById('view-register'),
    quiz: document.getElementById('view-quiz'),
    results: document.getElementById('view-results'),
    adminLogin: document.getElementById('view-admin-login'),
    adminDash: document.getElementById('view-admin-dashboard')
};

function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
    const progressBar = document.querySelector('.fixed-progress-bar');
    progressBar.style.display = (viewName === 'quiz') ? 'block' : 'none';
}

async function init() {
    const res = await fetch('questions.json');
    questions = await res.json();
    document.getElementById('q-total').textContent = questions.length;
}
init();

document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    studentInfo = {
        firstName: document.getElementById('first-name').value.trim(),
        middleName: document.getElementById('middle-name').value.trim(),
        surname: document.getElementById('surname').value.trim(),
        computerId: document.getElementById('computer-id').value.trim()
    };
    startQuiz();
});

function shuffleArray(array) {
    let newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
}

function startQuiz() {
    shuffledQuestions = shuffleArray(questions).map(q => {
        const shuffledOptions = shuffleArray(q.options);
        return { ...q, shuffledOptions };
    });
    userAnswers = {};
    currentQIndex = 0;
    showView('quiz');
    renderQuestion();
}

function renderQuestion() {
    const q = shuffledQuestions[currentQIndex];
    document.getElementById('q-current').textContent = currentQIndex + 1;
    const progressPercent = ((currentQIndex + 1) / shuffledQuestions.length) * 100;
    document.getElementById('progress-fill').style.width = `${progressPercent}%`;
    const container = document.getElementById('question-container');
    container.innerHTML = `
        <p class="question-text">${q.question}</p>
        <ul class="options-list">
            ${q.shuffledOptions.map((opt) => `
                <li class="option-item ${userAnswers[q.question] === opt ? 'selected' : ''}" data-option="${opt}">${opt}</li>
            `).join('')}
        </ul>
    `;
    document.querySelectorAll('.option-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            userAnswers[q.question] = item.dataset.option;
        });
    });
    const nextBtn = document.getElementById('btn-next');
    nextBtn.textContent = currentQIndex === shuffledQuestions.length - 1 ? 'Submit Quiz' : 'Next';
}

document.getElementById('btn-next').addEventListener('click', () => {
    const q = shuffledQuestions[currentQIndex];
    if (!userAnswers[q.question]) { alert('Please select an answer before proceeding.'); return; }
    if (currentQIndex === shuffledQuestions.length - 1) { submitQuiz(); } 
    else { currentQIndex++; renderQuestion(); }
});

async function submitQuiz() {
    let correctCount = 0;
    const total = shuffledQuestions.length;
    shuffledQuestions.forEach(q => { if (userAnswers[q.question] === q.correct_answer) correctCount++; });
    const percentage = Math.round((correctCount / total) * 100);
    const rawAnswersForAnalytics = {};
    shuffledQuestions.forEach(q => { rawAnswersForAnalytics[q.question] = userAnswers[q.question]; });

    await fetch('/api/submit-quiz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...studentInfo, score: correctCount, total: total, percentage: percentage, userAnswers: rawAnswersForAnalytics })
    });

    document.getElementById('score-text').textContent = `Score: ${correctCount}/${total} (${percentage}%)`;
    const breakdown = document.getElementById('breakdown-container');
    breakdown.innerHTML = shuffledQuestions.map((q, idx) => {
        const userAns = userAnswers[q.question];
        const isCorrect = userAns === q.correct_answer;
        const wrongReasons = q.shuffledOptions.filter(opt => opt !== q.correct_answer).map(opt => {
            const reason = q.explanations.incorrect_reasons.find(r => r.includes(opt.substring(0, 20))) || "This option does not align with the core principles described in the text.";
            return `<li><strong>${opt.substring(0, 40)}...</strong>: ${reason}</li>`;
        }).join('');
        return `
            <div class="question-review ${isCorrect ? 'correct' : 'incorrect'}">
                <p class="review-header">Q${idx + 1}: ${q.question}</p>
                <div class="review-answers">
                    <p><strong>Your Answer:</strong> ${userAns} ${isCorrect ? '✅' : '❌'}</p>
                    <p><strong>Correct Answer:</strong> ${q.correct_answer}</p>
                </div>
                <div class="review-explanation">
                    <strong>✅ Why the correct answer is right:</strong><p>${q.explanations.correct_reason}</p>
                    ${!isCorrect ? `<strong style="margin-top:10px;">❌ Why other options are wrong:</strong><ul style="margin-left:20px;">${wrongReasons}</ul>` : ''}
                </div>
            </div>`;
    }).join('');
    showView('results');
}

document.getElementById('btn-download-pdf').addEventListener('click', () => {
    const element = document.getElementById('results-content');
    const opt = { margin: 10, filename: `Quiz_Result_${studentInfo.firstName}_${studentInfo.surname}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
    html2pdf().from(element).set(opt).save();
});

document.getElementById('btn-retake').addEventListener('click', () => { document.getElementById('register-form').reset(); showView('register'); });
document.getElementById('settings-btn').addEventListener('click', () => { showView('adminLogin'); document.getElementById('admin-password').value = ''; document.getElementById('login-error').textContent = ''; });
document.getElementById('btn-cancel-login').addEventListener('click', () => showView('register'));

document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = document.getElementById('admin-password').value;
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) });
    const data = await res.json();
    if (data.success) { adminToken = data.token; loadAdminData(); showView('adminDash'); } 
    else { document.getElementById('login-error').textContent = 'Incorrect password!'; }
});

document.getElementById('btn-logout').addEventListener('click', () => { adminToken = ''; showView('register'); });

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-content-${btn.dataset.tab}`).classList.add('active');
    });
});

async function loadAdminData() {
    const res = await fetch('/api/admin/marks', { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const data = await res.json();
    if (data.success) { renderMarksTable(data.data); renderAnalytics(data.data); }
}

let sortDirection = {};
function renderMarksTable(records) {
    const tbody = document.getElementById('marks-tbody');
    tbody.innerHTML = records.map(r => {
        const fullName = `${r.firstName} ${r.middleName || ''} ${r.surname}`.replace(/\s+/g, ' ').trim();
        const date = new Date(r.timestamp).toLocaleString();
        return `<tr><td>${fullName}</td><td>${r.computerId}</td><td>${date}</td><td><strong>${r.percentage}%</strong> (${r.score}/${r.total})</td></tr>`;
    }).join('');
}

document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
        const key = th.dataset.sort;
        sortDirection[key] = !sortDirection[key];
        fetch('/api/admin/marks', { headers: { 'Authorization': `Bearer ${adminToken}` } })
            .then(res => res.json()).then(data => {
                if(data.success) {
                    const sorted = data.data.sort((a, b) => {
                        let valA, valB;
                        if (key === 'name') { valA = `${a.firstName} ${a.surname}`; valB = `${b.firstName} ${b.surname}`; }
                        else if (key === 'timestamp') { valA = new Date(a.timestamp); valB = new Date(b.timestamp); }
                        else { valA = a[key]; valB = b[key]; }
                        if (valA < valB) return sortDirection[key] ? -1 : 1;
                        if (valA > valB) return sortDirection[key] ? 1 : -1;
                        return 0;
                    });
                    renderMarksTable(sorted);
                }
            });
    });
});

function renderAnalytics(records) {
    const container = document.getElementById('analytics-container');
    if (!records || records.length === 0) { container.innerHTML = '<p class="empty-state">No students have taken the quiz yet.</p>'; return; }
    const scores = records.map(r => r.percentage);
    const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    const high = Math.max(...scores); const low = Math.min(...scores); const totalAttempts = records.length;
    const dist = { '0-20%': 0, '21-40%': 0, '41-60%': 0, '61-80%': 0, '81-100%': 0 };
    scores.forEach(s => { if (s <= 20) dist['0-20%']++; else if (s <= 40) dist['21-40%']++; else if (s <= 60) dist['41-60%']++; else if (s <= 80) dist['61-80%']++; else dist['81-100%']++; });
    const questionStats = questions.map((q) => {
        let correctCount = 0; let attemptedCount = 0;
        records.forEach(r => { if (r.userAnswers && r.userAnswers[q.question] !== undefined) { attemptedCount++; if (r.userAnswers[q.question] === q.correct_answer) correctCount++; } });
        return { label: q.question.length > 60 ? q.question.substring(0, 60) + '...' : q.question, percentCorrect: attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0 };
    });
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><h3>Total Attempts</h3><div class="stat-value">${totalAttempts}</div></div>
            <div class="stat-card"><h3>Class Average</h3><div class="stat-value">${avg}%</div></div>
            <div class="stat-card high"><h3>Highest Score</h3><div class="stat-value">${high}%</div></div>
            <div class="stat-card low"><h3>Lowest Score</h3><div class="stat-value">${low}%</div></div>
        </div>
        <div class="charts-grid">
            <div class="chart-card"><h3>Score Distribution</h3><div class="chart-container"><canvas id="scoreDistChart"></canvas></div></div>
            <div class="chart-card"><h3>Question Difficulty (% Correct)</h3><div class="chart-container"><canvas id="questionDiffChart"></canvas></div></div>
        </div>`;
    if (scoreDistChart) scoreDistChart.destroy();
    if (questionDiffChart) questionDiffChart.destroy();
    const ctx1 = document.getElementById('scoreDistChart').getContext('2d');
    scoreDistChart = new Chart(ctx1, { type: 'doughnut', data: { labels: Object.keys(dist), datasets: [{ data: Object.values(dist), backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
    const ctx2 = document.getElementById('questionDiffChart').getContext('2d');
    questionDiffChart = new Chart(ctx2, { type: 'bar', data: { labels: questionStats.map(q => q.label), datasets: [{ label: '% Correct', data: questionStats.map(q => q.percentCorrect), backgroundColor: questionStats.map(q => { if (q.percentCorrect >= 80) return '#10b981'; if (q.percentCorrect >= 50) return '#eab308'; return '#ef4444'; }), borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, max: 100, ticks: { callback: value => value + '%' } }, y: { ticks: { font: { size: 10 }, autoSkip: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { return context.raw + '% of students answered correctly'; } } } } } });
}