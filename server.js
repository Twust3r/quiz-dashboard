const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize data.json if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

// --- API ROUTES ---

// 1. Submit Quiz Results
app.post('/api/submit-quiz', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE));
        const studentRecord = {
            ...req.body,
            timestamp: new Date().toISOString(),
            id: Date.now().toString() 
        };
        data.push(studentRecord);
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        res.json({ success: true, message: "Results saved successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error saving data." });
    }
});

// 2. Admin Login
app.post('/api/admin/login', (req, res) => {
    if (req.body.password === 'MAPIKI123') {
        res.json({ success: true, token: 'admin_secure_token_8675309' });
    } else {
        res.status(401).json({ success: false, message: "Invalid password." });
    }
});

// 3. Get Admin Marks
app.get('/api/admin/marks', (req, res) => {
    const token = req.headers['authorization'];
    if (token !== 'Bearer admin_secure_token_8675309') {
        return res.status(401).json({ success: false, message: "Unauthorized." });
    }
    
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE));
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error reading data." });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});