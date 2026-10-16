const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

let shortAnswersEnabled = false; // Admin toggle state

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

// --- STUDENT ROUTES ---
app.post('/api/submit-quiz', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE));
        const studentRecord = { ...req.body, timestamp: new Date().toISOString(), id: Date.now().toString(), type: 'mcq' };
        data.push(studentRecord);
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        res.json({ success: true, studentId: studentRecord.computerId });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/short-answers/status', (req, res) => {
    res.json({ enabled: shortAnswersEnabled });
});

app.post('/api/submit-short-answers', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE));
        const record = data.find(r => r.computerId === req.body.computerId && r.type === 'mcq');
        if (record) {
            record.shortAnswers = req.body.answers;
            record.shortAnswersSubmittedAt = new Date().toISOString();
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- ADMIN ROUTES ---
app.post('/api/admin/login', (req, res) => {
    if (req.body.password === 'MAPIKI123') {
        res.json({ success: true, token: 'admin_secure_token_8675309' });
    } else { res.status(401).json({ success: false }); }
});

app.get('/api/admin/marks', (req, res) => {
    if (req.headers['authorization'] !== 'Bearer admin_secure_token_8675309') return res.status(401).json({ success: false });
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    res.json({ success: true, data });
});

app.post('/api/admin/short-answers/toggle', (req, res) => {
    if (req.headers['authorization'] !== 'Bearer admin_secure_token_8675309') return res.status(401).json({ success: false });
    shortAnswersEnabled = !shortAnswersEnabled;
    res.json({ success: true, enabled: shortAnswersEnabled });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));