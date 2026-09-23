/* Hero desktop simulation: one looping session, two scenes.
   Scene 1: typing a real essay on productivity in a word processor (Writing).
   Typing stops mid-word, Trance alerts (yellow, then red) and efficiency
   falls; typing resumes and the state recovers. Scene 2: the same person is
   now in a VS Code-style editor (Coding), stops mid-word in a line of code,
   and recovers the same way. Then the whole scene loops back to the essay.
   Typing is character by character, and the window keeps the newest text in
   view (older lines scroll out of the glass like a real editor). */
import { createWidget } from './widget.js?v=24';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The essay: a short, calm piece on attention and productivity. The person
   stalls mid-word at "What surpr" and, after returning, has only about two
   sentences left: one to finish the thought, then the closing call to action. */
const ESSAY = `The Attention Economy of One

Nobody sets out to waste an afternoon. It happens one tab at a time.

You sit down with the best of intentions. The document is open, the cursor blinking, and for a while the words actually arrive. Then a thought surfaces, half-formed, and you reach for the browser to chase it. Just a second, you tell yourself. The second becomes a minute. The minute becomes a scroll.

What surprises most people is not how long the detour lasts but what it costs afterwards. That is the whole idea. See the lapse. Return to the work.`;/* The code: a small module about the same idea, typed in an editor. Kept
   short: the person stalls mid-word shortly after starting the function. */
const CODE = `// focus.ts

interface Span {
  start: number;
  end: number;
}

export function lapse(points: number[]): Span[] {
  const spans: Span[] = [];
  let start = 0;

  for (let i = 1; i < points.length; i++) {
    if (points[i] < points[i - 1] - 0.25) {
      spans.pu
sh({ start, end: i });
      start = i;
    }
  }

  return spans;
}`;

/* The person goes AFK mid-word: right before finishing "surprises" in the
   essay, and right after "spans.pu" in the code. */
const ESSAY_STALL = ESSAY.indexOf('What surpr') + 'What surpr'.length;
const CODE_STALL = CODE.indexOf('spans.pu\nsh') + 'spans.pu'.length;
const STALL_RESUME = 5600; // ms from stall start until the person returns

function pausePoints(pairs, src) {
  return pairs
    .map(({ at, ms }) => ({ pos: src.indexOf(at) + at.length, ms: ms[0] + Math.random() * (ms[1] - ms[0]) }))
    .filter((p) => p.pos > 0 && p.pos < src.length)
    .sort((a, b) => a.pos - b.pos);
}

/* Brief hesitations: the typist stops for a beat mid-word, thinking, then
   carries on. These are ordinary pauses, not lapses, so Trance stays quiet.
   Essay: two in the opening paragraph. Code: four, spread across the module.
   Each anchor ends mid-word; the pause lands exactly on the cut. */
const ESSAY_PAUSES = [
  { at: 'waste an afterno', ms: [1500, 2300] }, // afterno|n
  { at: 'a tab at a ti', ms: [1500, 2300] }, // ti|me
];
const CODE_PAUSES = [
  { at: 'inte', ms: [1300, 2000] }, // inte|rface
  { at: 'start: numbe', ms: [1300, 2000] }, // numbe|r
  { at: 'function lapse(poin', ms: [1300, 2000] }, // poin|ts
  { at: 'const spans: Sp', ms: [1300, 2000] }, // Sp|an[]
];

export function initHero() {
  const anchor = document.getElementById('hero-widget-anchor');
  if (!anchor) return;

  // Not interactive: this widget represents what the simulated session is doing.
  const w = createWidget({ interactive: false, recentTasks: ['Writing', 'Coding'] });
  anchor.appendChild(w.el);
  anchor.classList.add('hero-widget');

  // live desktop clock
  const clock = document.getElementById('desk-clock');
  const setClock = () => {
    const d = new Date();
    clock.textContent = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  setClock();
  setInterval(setClock, 30000);

  const editor = document.getElementById('hero-editor');
  const code = document.getElementById('hero-code');
  const docText = document.getElementById('doc-text');
  const codeText = document.getElementById('code-text');
  if (!editor || !code || !docText || !codeText) return;

  const rand = (a, b) => a + Math.random() * (b - a);
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  let running = false;

  function show(scene) {
    editor.classList.toggle('active', scene === 'editor');
    code.classList.toggle('active', scene === 'code');
  }
  function setTyping(on) {
    editor.classList.toggle('typing', on && editor.classList.contains('active'));
    code.classList.toggle('typing', on && code.classList.contains('active'));
  }

  /* Keep the newest text in view: the glass stays pinned to the bottom, so
     older lines scroll out of the window exactly like a real editor. */
  function keepInView(el) {
    const scroller = el.closest('.doc-scroll, .code-scroll');
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
    if (el.id === 'code-text') {
      // the code body wraps, the gutter does not: match scroll proportion
      // so the bottom line number always lines up with the bottom code line
      const gutter = document.getElementById('code-gutter');
      if (gutter) {
        const csMax = scroller.scrollHeight - scroller.clientHeight;
        const gsMax = gutter.scrollHeight - gutter.clientHeight;
        gutter.scrollTop = csMax > 0 ? gsMax * (scroller.scrollTop / csMax) : 0;
      }
    }
  }
  function syncGutter() {
    const gutter = document.getElementById('code-gutter');
    if (!gutter) return;
    const n = codeText.textContent.split('\n').length;
    gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
  }

  /* Type one character at a time from src[pos] to src[end], with human
     pauses at words, commas and sentence ends. `pauses` holds the brief
     mid-word hesitations still to come, earliest first. */
  function typeChars(target, src, pos, end, done, pauses = []) {
    if (!running) return;
    if (pos >= end) { done(pos); return; }
    if (pauses.length && pos === pauses[0].pos) {
      // a thinking pause: hands off the keys for a beat, then carry on
      const { ms } = pauses.shift();
      setTyping(false);
      later(() => {
        if (!running) return;
        setTyping(true);
        typeChars(target, src, pos, end, done, pauses);
      }, ms);
      return;
    }
    const ch = src[pos];
    target.textContent += ch;
    keepInView(target);
    if (target.id === 'code-text') syncGutter();
    let delay = rand(24, 62);
    if (ch === ' ') delay += rand(6, 34);
    else if ('.?!:'.includes(ch)) delay += rand(150, 380);
    else if (',;'.includes(ch)) delay += rand(60, 140);
    else if (ch === '\n') delay += rand(90, 220);
    later(() => typeChars(target, src, pos + 1, end, done), delay);
  }

  /* One scene: type, stall mid-word (yellow, red), return, recover, hand off. */
  function scene({ which, task, text, host, stallAt, resumeChars, next }) {
    show(which);
    host.textContent = '';
    if (host === codeText) syncGutter();
    setTyping(false);
    w.resetAll();
    w.setMode('session');
    w.setTask(task);

    later(() => setTyping(true), 400);
    const pauses = pausePoints(which === 'editor' ? ESSAY_PAUSES : CODE_PAUSES, text);
    typeChars(host, text, 0, stallAt, (pos) => {
      // the person stops mid-word. Trance notices.
      setTyping(false);
      later(() => w.setLevel('warning'), 900);
      later(() => w.setLevel('unfocused'), 3600);

      // back at the desk: pick up the word where it was left
      later(() => setTyping(true), STALL_RESUME);
      later(() => w.setLevel('focused'), STALL_RESUME + 300);
      later(() => {
        typeChars(host, text, pos, pos + resumeChars, () => {
          setTyping(false);
          later(next, 2200);
        }, []);
      }, STALL_RESUME + 650);
    });
  }

  /* One full cycle: essay, stall, recover; code, stall, recover; loop. */
  function cycle() {
    if (!running) return;
    scene({
      which: 'editor', task: 'Writing', text: ESSAY, host: docText,
      stallAt: ESSAY_STALL, resumeChars: ESSAY.length - ESSAY_STALL,
      next: () => scene({
        which: 'code', task: 'Coding', text: CODE, host: codeText,
        stallAt: CODE_STALL, resumeChars: CODE.length - CODE_STALL,
        next: () => later(cycle, 1600),
      }),
    });
  }

  if (reduceMotion) {
    // one still, complete scene: a fitted excerpt, session healthy
    docText.textContent = ESSAY.slice(0, ESSAY.indexOf('What surpr'));
    show('editor');
    w.setMode('session');
    w.setTask('Writing');
    return;
  }

  const stage = anchor.closest('.desktop') || anchor;
  const io = new IntersectionObserver((es) => {
    es.forEach((en) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      running = true;
      cycle();
    });
  }, { threshold: 0.35 });
  io.observe(stage);

  // pause when the tab is hidden; restart the cycle cleanly when visible again
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      timers.forEach(clearTimeout);
      timers = [];
      running = false;
    } else if (!running && !reduceMotion) {
      running = true;
      cycle();
    }
  });

  /* QA hook: lets the simulation be driven in environments where
     IntersectionObserver is deferred (hidden webviews, screenshot runners). */
  window.__tranceHeroQA = {
    start() { if (!running) { running = true; cycle(); } },
    stop() { timers.forEach(clearTimeout); timers = []; running = false; },
    get widget() { return w; },
  };
}
