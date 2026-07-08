'use strict';
/*
 * Parses init.html (the "Fragenkatalog Medizin" study catalog) into questions.json.
 *
 * Source structure (flat sequence of elements inside div.user-text):
 *   - Section header:  <p> with a grey background-color span, text "7 Fragen zu ..."
 *   - Multiple choice: a plain <p> (the question) followed by one or more <ul>.
 *                      Correct options are the <li> that contain an <u> (underlined).
 *   - Open questions:  a <p> whose text is wrapped in <em><strong> ... </strong></em>,
 *                      followed by free-form answer content (p / ul / ol / h3).
 *
 * Rule that keeps parsing robust: inside every section the MC block comes first,
 * then the open block. Once the first open (em+strong) question of a section is
 * seen, every following "plain <p> + <ul>" is treated as answer content, never MC.
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const html = fs.readFileSync(path.join(__dirname, 'init.html'), 'utf8');
const $ = cheerio.load(html);

const norm = (s) => (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// Structural tags we keep in open-answer HTML; everything else is unwrapped/dropped.
function cleanHtml(el) {
  const $el = $(el).clone();
  // Drop empty/name-only anchors, unwrap styling spans, strip inline styles.
  $el.find('[style]').removeAttr('style');
  $el.find('span').each((_, s) => $(s).replaceWith($(s).contents()));
  $el.find('a').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) $(a).replaceWith($(a).contents());
  });
  const wrapper = $('<div>').append($el);
  return norm.length ? wrapper.html() : wrapper.html();
}

function isSectionHeader($p) {
  if (!$p.is('p')) return false;
  const hasGrey = $p.find('[style*="background-color"]').length > 0;
  return hasGrey && /Fragen/i.test($p.text());
}
function isOpenQuestion($p) {
  if (!$p.is('p')) return false;
  // em wrapping strong (or strong wrapping em) and no bullet list role
  return $p.find('em strong, strong em').length > 0 && norm($p.text()).length > 0;
}
function isEmpty($p) {
  return $p.is('p') && norm($p.text()) === '';
}

const children = $('.user-text').children().toArray();
const questions = [];
let section = null;
let seenOpenInSection = false;
let idCounter = 0;

for (let i = 0; i < children.length; i++) {
  const el = children[i];
  const $el = $(el);

  if (isSectionHeader($el)) {
    // "7 Fragen zur Anatomie des Hundes" -> "Anatomie des Hundes"
    section = norm($el.text())
      .replace(/^\d+\s*Fragen\s+(zu\s+den|zu[rm]?|zu)\s+/i, '')
      .trim();
    // Balance parentheses left unclosed in the source headings.
    const opens = (section.match(/\(/g) || []).length;
    const closes = (section.match(/\)/g) || []).length;
    if (opens > closes) section += ')'.repeat(opens - closes);
    seenOpenInSection = false;
    continue;
  }
  if (!section) continue; // skip intro before first section
  if (isEmpty($el)) continue;

  // ---- Open / order / number question ----
  if (isOpenQuestion($el)) {
    seenOpenInSection = true;
    const questionText = norm($el.text());
    // Gather answer body until next question or section header.
    const bodyEls = [];
    let j = i + 1;
    for (; j < children.length; j++) {
      const $n = $(children[j]);
      if (isSectionHeader($n)) break;
      if (isOpenQuestion($n)) break;
      if (isEmpty($n)) continue;
      bodyEls.push(children[j]);
    }
    i = j - 1;

    const bodyText = bodyEls.map((b) => norm($(b).text())).filter(Boolean);
    const answerHtml = bodyEls.map(cleanHtml).join('\n');

    // Detect ORDER questions: intro "Folge ..." + body is a list of "- item" lines.
    const dashLines = bodyEls
      .filter((b) => $(b).is('p'))
      .map((b) => norm($(b).text()))
      .filter((t) => /^[-–]\s*/.test(t))
      .map((t) => t.replace(/^[-–]\s*/, '').trim());

    // "label = value" paragraph lines mark a number/fill question (e.g. Wirbelsäule).
    const numberLines = bodyEls
      .filter((b) => $(b).is('p'))
      .map((b) => norm($(b).text()))
      .filter((t) => /=\s*\(?\d/.test(t));

    let type = 'open';
    let order = null;
    if (/^Folge\b/i.test(questionText) && dashLines.length >= 3) {
      type = 'order';
      order = dashLines;
    } else if (numberLines.length >= 2) {
      type = 'number';
    }

    questions.push({
      id: ++idCounter,
      section,
      type,
      question: questionText,
      order,
      answerHtml,
    });
    continue;
  }

  // ---- Multiple choice: plain <p> followed by <ul>(s), only in the MC block ----
  if ($el.is('p') && !seenOpenInSection) {
    // find next non-empty sibling
    let k = i + 1;
    while (k < children.length && isEmpty($(children[k]))) k++;
    if (k < children.length && $(children[k]).is('ul')) {
      const questionText = norm($el.text());
      // merge consecutive <ul> blocks
      const options = [];
      const correct = [];
      let m = k;
      while (m < children.length && ($(children[m]).is('ul') || isEmpty($(children[m])))) {
        if ($(children[m]).is('ul')) {
          $(children[m]).children('li').each((_, li) => {
            const $li = $(li);
            const idx = options.length;
            options.push(norm($li.text()));
            if ($li.find('u').length > 0) correct.push(idx);
          });
        }
        m++;
      }
      i = m - 1;
      if (options.length && correct.length) {
        questions.push({
          id: ++idCounter,
          section,
          type: correct.length === 1 ? 'single' : 'multi',
          question: questionText,
          options,
          correct,
        });
      }
      continue;
    }
  }
  // otherwise: stray content ("Offene Fragen:" label etc.) -> ignore
}

fs.writeFileSync(path.join(__dirname, 'public', 'questions.json'), JSON.stringify(questions, null, 2), 'utf8');

// Summary
const byType = questions.reduce((a, q) => ((a[q.type] = (a[q.type] || 0) + 1), a), {});
console.log(`Parsed ${questions.length} questions`);
console.log('By type:', byType);
const sections = [...new Set(questions.map((q) => q.section))];
console.log(`Sections (${sections.length}):`);
sections.forEach((s) => console.log('  -', s, '=>', questions.filter((q) => q.section === s).length));
