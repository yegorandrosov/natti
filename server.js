'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Questions live in public/ so the exact same file is served statically
// (also works on GitHub Pages). Read once at startup just for the log/count.
const questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'questions.json'), 'utf8'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Tierarzt-Quiz läuft auf http://localhost:${PORT} (${questions.length} Fragen)`);
});
