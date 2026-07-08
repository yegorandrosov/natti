'use strict';

/* ---------- State ---------- */
let ALL = [];              // all questions from API
let quiz = [];             // current run's questions (shuffled, sliced)
let idx = 0;               // current question index
let mode = 'immediate';    // 'immediate' | 'end'
let answered = false;      // current question checked/revealed?
let timerId = null;
let startTs = 0;
let elapsedFrozen = 0;

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const shuffle = (a) => {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
const TYPE_LABEL = {
  single: 'Eine Antwort', multi: 'Mehrere Antworten',
  order: 'Reihenfolge', number: 'Zahlen', open: 'Offene Frage',
};

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $('screen-' + name).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Timer ---------- */
function startTimer() {
  startTs = performance.now();
  $('hud').hidden = false;
  timerId = setInterval(() => {
    $('hudTimer').textContent = fmtTime(performance.now() - startTs);
  }, 500);
}
function stopTimer() {
  clearInterval(timerId);
  timerId = null;
  elapsedFrozen = performance.now() - startTs;
}

/* ---------- Start ---------- */
async function loadQuestions() {
  // Relative path so it works both on a server and on GitHub Pages (project subpath).
  const res = await fetch('questions.json');
  ALL = await res.json();
  const sel = $('countSelect');
  const total = ALL.length;
  [10, 20, 30].filter((n) => n < total).forEach((n) => {
    sel.add(new Option(`${n} Fragen`, String(n)));
  });
  sel.add(new Option(`Alle ${total} Fragen`, String(total)));
  sel.value = String(total);
}

$('modeGroup').addEventListener('change', () => {
  document.querySelectorAll('#modeGroup .pick').forEach((p) => {
    p.classList.toggle('selected', p.querySelector('input').checked);
  });
});

$('startBtn').addEventListener('click', () => {
  mode = document.querySelector('input[name="mode"]:checked').value;
  const count = parseInt($('countSelect').value, 10);
  quiz = shuffle(ALL).slice(0, count).map((q) => ({
    q,
    response: null,      // user's answer (indices array / order array / self-bool)
    correct: null,       // graded boolean (null = not yet graded)
    revealed: false,
  }));
  idx = 0;
  showScreen('quiz');
  startTimer();
  renderQuestion();
});

$('restartBtn').addEventListener('click', () => {
  stopTimer();
  showScreen('start');
  $('hud').hidden = true;
});

/* ---------- Render a question ---------- */
function renderQuestion() {
  const item = quiz[idx];
  const q = item.q;
  answered = false;

  $('hudProgress').textContent = `${idx + 1} / ${quiz.length}`;
  $('progressFill').style.width = ((idx) / quiz.length * 100) + '%';

  const card = $('questionCard');
  card.innerHTML = '';

  const meta = document.createElement('div');
  meta.className = 'q-meta';
  meta.innerHTML = `<span class="badge">${escapeHtml(q.section)}</span><span class="badge type">${TYPE_LABEL[q.type]}</span>`;
  card.appendChild(meta);

  const qt = document.createElement('p');
  qt.className = 'q-text';
  qt.textContent = q.question;
  card.appendChild(qt);

  if (q.type === 'single' || q.type === 'multi') renderChoice(card, item);
  else if (q.type === 'order') renderOrder(card, item);
  else renderOpen(card, item); // open + number

  updateActions();
}

/* ----- MC (single/multi) ----- */
function renderChoice(card, item) {
  const q = item.q;
  const multi = q.type === 'multi';
  const hint = document.createElement('p');
  hint.className = 'q-hint';
  hint.textContent = multi ? 'Mehrere Antworten möglich.' : 'Wähle eine Antwort.';
  card.appendChild(hint);

  // Shuffle option display order but remember original indices for grading.
  if (!item.optOrder) item.optOrder = shuffle(q.options.map((_, i) => i));

  const wrap = document.createElement('div');
  wrap.className = 'answers';
  item.optOrder.forEach((origIdx) => {
    const lab = document.createElement('label');
    lab.className = 'answer';
    lab.dataset.idx = String(origIdx);
    lab.innerHTML =
      `<input type="${multi ? 'checkbox' : 'radio'}" name="opt" value="${origIdx}" />` +
      `<span class="txt">${escapeHtml(q.options[origIdx])}</span><span class="mark"></span>`;
    lab.querySelector('input').addEventListener('change', () => {
      if (answered) return;
      wrap.querySelectorAll('.answer').forEach((a) => {
        a.classList.toggle('selected', a.querySelector('input').checked);
      });
      updateActions();
    });
    wrap.appendChild(lab);
  });
  card.appendChild(wrap);
}

/* ----- Order ----- */
function renderOrder(card, item) {
  const q = item.q;
  const hint = document.createElement('p');
  hint.className = 'q-hint';
  hint.textContent = 'Bringe die Einträge in die richtige Reihenfolge.';
  card.appendChild(hint);

  if (!item.workOrder) {
    // start from a shuffle guaranteed different from correct
    let s = shuffle(q.order);
    if (eq(s, q.order) && q.order.length > 1) s = shuffle(q.order);
    item.workOrder = s;
  }

  const list = document.createElement('div');
  list.className = 'order-list';
  list.id = 'orderList';
  renderOrderItems(list, item);
  card.appendChild(list);
}

function renderOrderItems(list, item) {
  list.innerHTML = '';
  item.workOrder.forEach((txt, i) => {
    const row = document.createElement('div');
    row.className = 'order-item';
    row.draggable = !answered;
    row.dataset.i = String(i);
    row.innerHTML =
      `<span class="pos">${i + 1}</span><span class="txt">${escapeHtml(txt)}</span>` +
      (answered ? '<span class="mark"></span>' :
        `<span class="order-move"><button data-dir="-1" ${i === 0 ? 'disabled' : ''}>▲</button>` +
        `<button data-dir="1" ${i === item.workOrder.length - 1 ? 'disabled' : ''}>▼</button></span>`);
    if (!answered) {
      row.querySelectorAll('.order-move button').forEach((b) => {
        b.addEventListener('click', () => moveOrder(item, i, parseInt(b.dataset.dir, 10), list));
      });
      addDragHandlers(row, item, list);
    }
    list.appendChild(row);
  });
}
function moveOrder(item, i, dir, list) {
  const j = i + dir;
  if (j < 0 || j >= item.workOrder.length) return;
  [item.workOrder[i], item.workOrder[j]] = [item.workOrder[j], item.workOrder[i]];
  renderOrderItems(list, item);
}
let dragFrom = null;
function addDragHandlers(row, item, list) {
  row.addEventListener('dragstart', () => { dragFrom = parseInt(row.dataset.i, 10); row.classList.add('dragging'); });
  row.addEventListener('dragend', () => row.classList.remove('dragging'));
  row.addEventListener('dragover', (e) => e.preventDefault());
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    const to = parseInt(row.dataset.i, 10);
    if (dragFrom === null || dragFrom === to) return;
    const moved = item.workOrder.splice(dragFrom, 1)[0];
    item.workOrder.splice(to, 0, moved);
    dragFrom = null;
    renderOrderItems(list, item);
  });
}

/* ----- Open / Number (self-assessed) ----- */
function renderOpen(card, item) {
  const hint = document.createElement('p');
  hint.className = 'q-hint';
  hint.textContent = mode === 'immediate'
    ? 'Überlege dir die Antwort und decke danach die Musterlösung auf.'
    : 'Überlege dir die Antwort. Die Selbstbewertung erfolgt am Ende in der Durchsicht.';
  card.appendChild(hint);
  const holder = document.createElement('div');
  holder.id = 'openHolder';
  card.appendChild(holder);
}

/* ---------- Actions / flow ---------- */
function currentSelection(item) {
  const q = item.q;
  if (q.type === 'single' || q.type === 'multi') {
    return [...document.querySelectorAll('#questionCard input[name="opt"]:checked')]
      .map((el) => parseInt(el.value, 10)).sort((a, b) => a - b);
  }
  return null;
}

function updateActions() {
  const item = quiz[idx];
  const q = item.q;
  const reveal = $('revealBtn'), check = $('checkBtn'), next = $('nextBtn');
  reveal.hidden = true; check.hidden = true; next.hidden = true;

  const isOpen = q.type === 'open' || q.type === 'number';
  const isAuto = !isOpen; // single/multi/order

  if (!answered) {
    if (isOpen && mode === 'immediate') {
      reveal.hidden = false;
    } else if (isOpen) {
      // end mode: no reveal now; self-assessment happens in the results review
      next.hidden = false;
      next.textContent = idx === quiz.length - 1 ? 'Test abschließen' : 'Weiter';
    } else if (mode === 'immediate') {
      check.hidden = false;
      const sel = currentSelection(item);
      check.disabled = q.type === 'order' ? false : !(sel && sel.length);
    } else {
      // end mode, auto-graded: just advance (answer recorded on Next)
      next.hidden = false;
      next.textContent = idx === quiz.length - 1 ? 'Test abschließen' : 'Weiter';
    }
  } else {
    next.hidden = false;
    next.textContent = idx === quiz.length - 1 ? 'Ergebnis anzeigen' : 'Weiter';
  }
}

/* Reveal (open/number) */
$('revealBtn').addEventListener('click', () => {
  const item = quiz[idx];
  item.revealed = true;
  const holder = $('openHolder');
  holder.innerHTML =
    `<div class="model-answer"><h4>Musterlösung</h4>${item.q.answerHtml || ''}</div>` +
    `<div class="self-assess"><button class="btn btn-no" id="saNo">Nicht gewusst</button>` +
    `<button class="btn btn-ok" id="saOk">Gewusst</button></div>`;
  $('saOk').addEventListener('click', () => selfAssess(item, true));
  $('saNo').addEventListener('click', () => selfAssess(item, false));
  $('revealBtn').hidden = true;
});
function selfAssess(item, ok) {
  item.response = ok;
  item.correct = ok;
  answered = true;
  $('saOk').classList.toggle('chosen', ok);
  $('saNo').classList.toggle('chosen', !ok);
  $('saOk').disabled = true; $('saNo').disabled = true;
  updateActions();
}

/* Check (immediate mode, auto-graded) */
$('checkBtn').addEventListener('click', () => {
  const item = quiz[idx];
  gradeAuto(item);
  answered = true;
  showAutoFeedback(item);
  updateActions();
});

function gradeAuto(item) {
  const q = item.q;
  if (q.type === 'single' || q.type === 'multi') {
    const sel = currentSelection(item);
    item.response = sel;
    item.correct = eq(sel, q.correct.slice().sort((a, b) => a - b));
  } else if (q.type === 'order') {
    item.response = item.workOrder.slice();
    item.correct = eq(item.workOrder, q.order);
  }
}

function showAutoFeedback(item) {
  const q = item.q;
  if (q.type === 'single' || q.type === 'multi') {
    const correctSet = new Set(q.correct);
    document.querySelectorAll('#questionCard .answer').forEach((a) => {
      const i = parseInt(a.dataset.idx, 10);
      const chosen = a.querySelector('input').checked;
      a.classList.add('locked');
      a.querySelector('input').disabled = true;
      if (correctSet.has(i)) a.classList.add('correct');
      else if (chosen) a.classList.add('wrong');
    });
  } else if (q.type === 'order') {
    const list = $('orderList');
    renderOrderItems(list, item); // re-render locked
    [...list.children].forEach((row, i) => {
      const ok = item.workOrder[i] === q.order[i];
      row.classList.add(ok ? 'correct' : 'wrong');
      const mark = row.querySelector('.mark');
      if (mark) mark.textContent = ok ? '✓' : '✗';
    });
    if (!item.correct) {
      const sol = document.createElement('div');
      sol.className = 'model-answer';
      sol.innerHTML = `<h4>Richtige Reihenfolge</h4><ol>${q.order.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ol>`;
      $('questionCard').appendChild(sol);
    }
  }
}

/* Next */
$('nextBtn').addEventListener('click', () => {
  const item = quiz[idx];
  // In end mode, auto-graded questions are graded on advance.
  if (mode === 'end' && item.correct === null && (item.q.type !== 'open' && item.q.type !== 'number')) {
    gradeAuto(item);
  }
  if (idx < quiz.length - 1) {
    idx++;
    $('progressFill').style.width = (idx / quiz.length * 100) + '%';
    renderQuestion();
  } else {
    finish();
  }
});

/* ---------- Results ---------- */
function finish() {
  stopTimer();
  $('progressFill').style.width = '100%';
  showScreen('results');
  renderResults();
}

function computeScore() {
  const graded = quiz.filter((it) => it.correct !== null);
  const pending = quiz.filter((it) => it.correct === null);
  const correct = graded.filter((it) => it.correct).length;
  return { graded, pending, correct, total: quiz.length };
}

function renderResults() {
  const { pending, correct, total } = computeScore();
  const pct = Math.round((correct / total) * 100);

  $('scorePct').textContent = pct + '%';
  $('scoreFrac').textContent = `${correct} / ${total}`;
  $('scoreRing').style.setProperty('--deg', (pct * 3.6) + 'deg');
  $('statCorrect').textContent = correct;
  $('statWrong').textContent = quiz.filter((it) => it.correct === false).length;
  $('statTime').textContent = fmtTime(elapsedFrozen);
  $('pendingHint').hidden = pending.length === 0;

  renderReview(currentFilter);
}

let currentFilter = 'wrong';
$('filterSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  document.querySelectorAll('#filterSeg button').forEach((b) => b.classList.toggle('active', b === btn));
  renderReview(currentFilter);
});

function renderReview(filter) {
  const list = $('reviewList');
  list.innerHTML = '';
  const items = quiz.filter((it) => {
    if (filter === 'all') return true;
    return it.correct !== true; // wrong or pending
  });
  if (!items.length) {
    list.innerHTML = '<div class="review-empty">Keine Fragen in dieser Ansicht. 🎉</div>';
    return;
  }
  items.forEach((it) => list.appendChild(reviewCard(it)));
}

function reviewCard(item) {
  const q = item.q;
  const el = document.createElement('div');
  el.className = 'review-item ' + (item.correct === true ? 'r-ok' : item.correct === false ? 'r-bad' : 'r-pending');

  let inner = `<div class="review-sec">${escapeHtml(q.section)}</div>` +
    `<p class="review-q">${escapeHtml(q.question)}</p>`;

  if (q.type === 'single' || q.type === 'multi') {
    const names = (arr) => (arr && arr.length ? arr.map((i) => q.options[i]).join(', ') : '—');
    const yours = names(item.response);
    const right = names(q.correct);
    inner += `<div class="review-line"><span class="lbl">Deine Antwort</span><span class="val ${item.correct ? 'ok' : 'bad'}">${escapeHtml(yours)}</span></div>`;
    if (!item.correct) inner += `<div class="review-line"><span class="lbl">Richtig</span><span class="val ok">${escapeHtml(right)}</span></div>`;
  } else if (q.type === 'order') {
    inner += `<div class="review-line"><span class="lbl">Richtige Reihenfolge</span><span class="val ok">${escapeHtml(q.order.join(' → '))}</span></div>`;
    if (!item.correct && item.response) inner += `<div class="review-line"><span class="lbl">Deine</span><span class="val bad">${escapeHtml(item.response.join(' → '))}</span></div>`;
  } else {
    // open / number
    inner += `<div class="model-answer"><h4>Musterlösung</h4>${q.answerHtml || ''}</div>`;
    if (item.correct === null) {
      inner += `<div class="self-assess"><button class="btn btn-no" data-sa="no">Nicht gewusst</button><button class="btn btn-ok" data-sa="ok">Gewusst</button></div>`;
    }
  }
  el.innerHTML = inner;

  const saBtns = el.querySelectorAll('[data-sa]');
  saBtns.forEach((b) => b.addEventListener('click', () => {
    item.response = b.dataset.sa === 'ok';
    item.correct = item.response;
    renderResults(); // recompute score + refresh list
  }));
  return el;
}

/* ---------- utils ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- boot ---------- */
loadQuestions().catch((err) => {
  $('screen-start').innerHTML = '<div class="card"><h1>Fehler</h1><p>Fragen konnten nicht geladen werden.</p></div>';
  console.error(err);
});
