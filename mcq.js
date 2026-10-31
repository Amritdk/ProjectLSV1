/* mcq.js — automatic MCQ builder. No dataset changes needed.
   Optional per-question override in JSON:
     { "q": "...", "a": "...", "options": ["a","b","c","d"], "answerIndex": 2 } */

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function answerShape(s) {
  s = String(s).trim();
  return {
    isNum: /^[\d.,%₹रु\s\-]+$/.test(s),
    isDevanagari: /[\u0900-\u097F]/.test(s),
    isLatin: /^[A-Za-z0-9\s.,'"()\-]+$/.test(s),
    len: s.length,
    bucket: s.length <= 8 ? 'short' : s.length <= 30 ? 'med' : 'long'
  };
}

function shapeCompatible(correct, candidate) {
  const a = answerShape(correct), b = answerShape(candidate);
  if (a.isNum !== b.isNum) return false;
  if (a.isDevanagari && !b.isDevanagari) return false;
  if (a.isLatin && !b.isLatin) return false;
  if (a.bucket === 'short' && b.bucket === 'long') return false;
  if (a.bucket === 'long' && b.bucket === 'short') return false;
  return true;
}

function numericDistractors(answer) {
  const m = String(answer).match(/(-?\d+(?:\.\d+)?)/);
  if (!m) return [];
  const n = parseFloat(m[1]);
  const seen = new Set([String(answer).trim()]);
  const out = [];
  const variants = [n * 2, n / 2, n + 1, n - 1, n + 10, n - 10];
  for (const v of variants) {
    if (!isFinite(v) || v <= 0 || v === n) continue;
    const rounded = Number.isInteger(n) ? Math.round(v) : Math.round(v * 100) / 100;
    const candidate = String(answer).replace(m[1], String(rounded)).trim();
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
    if (out.length >= 4) break;
  }
  return out;
}

function buildMcq(question, allQuestions) {
  // 1. Explicit override from JSON
  if (Array.isArray(question.options) && question.options.length >= 2) {
    let opts = question.options.map(o => String(o).trim()).filter(o => o.length > 0);
    if (opts.length > 4) opts = opts.slice(0, 4);   // cap at 4
    let idx;
    if (typeof question.answerIndex === 'number' &&
        question.answerIndex >= 0 && question.answerIndex < opts.length) {
      idx = question.answerIndex;
    } else {
      idx = opts.findIndex(o => o.toLowerCase() === String(question.answer).toLowerCase().trim());
    }
    if (idx < 0) {
      if (opts.length >= 4) opts = opts.slice(0, 3);
      opts.push(String(question.answer).trim());
      idx = opts.length - 1;
    }
    const correct = opts[idx];
    shuffleInPlace(opts);
    return { options: opts, correctIndex: opts.indexOf(correct) };
  }

  // 2. Auto-build from siblings
  const correct = String(question.answer).trim();
  const correctNorm = correct.toLowerCase();
  const qNorm = String(question.question).toLowerCase();

  const usable = other => {
    if (!other || other.id === question.id) return false;
    const ans = String(other.answer || '').trim();
    if (!ans) return false;
    const low = ans.toLowerCase();
    if (low === correctNorm) return false;
    if (qNorm.includes(low)) return false;
    if (!shapeCompatible(correct, ans)) return false;
    return true;
  };

  // Pool A: same category
  let pool = allQuestions
    .filter(q => usable(q) && q.category === question.category)
    .map(q => String(q.answer).trim());

  // Pool B: widen to all questions if A is too small
  if (new Set(pool).size < 3) {
    const extra = allQuestions.filter(usable).map(q => String(q.answer).trim());
    pool = [...new Set([...pool, ...extra])];
  }

  // Dedupe
  const seen = new Set([correctNorm]);
  pool = pool.filter(a => {
    const k = a.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  shuffleInPlace(pool);
  let distractors = pool.slice(0, 3);

  // Numeric fallback
  if (distractors.length < 3) {
    const extra = numericDistractors(correct)
      .filter(d => !distractors.some(x => x.toLowerCase() === d.toLowerCase()));
    distractors.push(...extra.slice(0, 3 - distractors.length));
  }

  if (distractors.length < 3) return null;   // caller → flashcard fallback

  const options = shuffleInPlace([correct, ...distractors]);
  return { options, correctIndex: options.indexOf(correct) };
}