/* Trance widget replica: geometry, states and behavior ported from
   src/components/CornerWidget.tsx + CornerWidget.module.css.
   States: start screen, session (Overview / Task / Break tabs with the app's
   slide direction), break screen, focus pill. Live canvas efficiency line.
   Non-interactive hosts can lock interaction via `interactive: false`. */
import { taskColor, BREAK_COLOR, NO_TASK_COLOR } from './data.js?v=24';

const PRESET_MIN = { '1m': 1, '5m': 5, '10m': 10, '15m': 15, '30m': 30, '1h': 60 };
const MAX_SAMPLES = 240;
const FOCUS_EXIT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6"/></svg>';

const TABS = ['dashboard', 'task', 'break'];
const TAB_LABEL = { dashboard: 'Overview', task: 'Task', break: 'Break' };

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
function fmtBreak(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function createWidget(opts = {}) {
  const o = Object.assign(
    { interactive: true, draggable: false, recentTasks: ['Writing', 'Research', 'Reading'] },
    opts
  );

  const root = document.createElement('div');
  root.className = 'trance-widget';
  const listeners = {};
  const on = (ev, fn) => { (listeners[ev] ??= new Set()).add(fn); return () => listeners[ev].delete(fn); };
  const emit = (ev, ...a) => { (listeners[ev] || new Set()).forEach((fn) => fn(...a)); };

  const S = {
    mode: 'idle', tab: 'dashboard', prevTab: 'dashboard', slideDir: 'right',
    level: 'focused',
    task: 'No Task', taskStart: 0,
    startTs: 0, focusedMs: 0, distractedMs: 0, breakMs: 0,
    breakLeft: 0, focusMode: false,
    samples: [], focusedCount: 0, activeCount: 0,
  };
  let timer = null;

  const taskCol = (name) => (!name || name === 'No Task' ? NO_TASK_COLOR : taskColor(name, o.recentTasks));
  const levelVal = () => (S.level === 'focused' ? 1 : S.level === 'warning' ? 0.6 : 0.2);
  const levelWord = () => (S.level === 'focused' ? 'FOCUSED' : 'UNFOCUSED');

  function pushSample() {
    const last = S.samples[S.samples.length - 1];
    if (S.mode === 'break') {
      if (last) S.samples.push({ v: last.v, c: BREAK_COLOR, b: 1 });
    } else {
      S.samples.push({ v: levelVal(), c: taskCol(S.task), b: 0 });
    }
    if (S.samples.length > MAX_SAMPLES) S.samples.shift();
  }

  /* ---------- rendering ---------- */
  function renderIdle() {
    root.dataset.level = '';
    root.innerHTML = `
      <div class="w-start">
        <div class="w-start-title">Trance</div>
        <div class="w-start-sub">Ready when you are</div>
        <button class="w-start-btn" data-act="start" type="button">Start Trance session</button>
      </div>`;
  }

  function dashPanelHTML() {
    const taskActive = S.task !== 'No Task' && S.taskStart > 0;
    const taskElapsed = taskActive ? Date.now() - S.taskStart : 0;
    const eff = S.activeCount ? Math.round((S.focusedCount / S.activeCount) * 100) : 0;
    const legend = legendItems()
      .map((it) => `<span class="w-legend-item"><span class="legend-dot" style="background:${it.c}"></span>${esc(it.n)}</span>`)
      .join('');
    return `
      <div class="w-tasktimer" ${taskActive ? '' : 'hidden'}>
        <span class="tt-label" style="color:${taskCol(S.task)}">${esc(S.task)}</span>
        <span class="tt-value">${fmt(taskElapsed)}</span>
        <button class="w-taskstop" data-act="stop-task" title="End task" aria-label="End task" type="button">&#10005;</button>
      </div>
      <div class="w-spark"><canvas></canvas></div>
      <div class="w-legend">${legend}</div>
      <div class="w-statsrow">
        <div class="w-effwrap">
          <span class="w-focuspct js-eff">${eff}%</span>
          <span class="w-focuslabel">efficiency</span>
        </div>
        <div class="w-timestats">
          <span class="w-ts"><span class="tsl">focused</span><span class="tsv js-foc">${fmt(S.focusedMs)}</span></span>
          <span class="w-ts"><span class="tsl">distracted</span><span class="tsv js-dis">${fmt(S.distractedMs)}</span></span>
          <span class="w-ts"><span class="tsl">break</span><span class="tsv js-brk">${fmt(S.breakMs)}</span></span>
        </div>
      </div>`;
  }

  function taskPanelHTML() {
    const taskActive = S.task !== 'No Task' && S.taskStart > 0;
    const taskElapsed = taskActive ? Date.now() - S.taskStart : 0;
    const chips = o.recentTasks
      .map((t) => `<button class="w-chip" data-task="${esc(t)}" type="button"><span class="legend-dot" style="background:${taskCol(t)}"></span>${esc(t)}</button>`)
      .join('');
    return `
      <div class="w-taskactive ${taskActive ? 'on' : ''}">
        <span class="w-ta-name" style="color:${taskCol(S.task)}">${esc(taskActive ? S.task : 'No active task')}</span>
        ${taskActive ? `<span class="w-ta-time">${fmt(taskElapsed)}</span><button class="w-ta-stop" data-act="stop-task" title="End task" aria-label="End task" type="button">&#10005;</button>` : ''}
      </div>
      <div class="w-taskrow">
        <input class="w-taskinput js-taskinput" maxlength="24" placeholder="New task..." aria-label="New task" />
        <button class="w-setbtn" data-act="set-task" type="button">Set</button>
      </div>
      <div class="w-recent">
        <div class="w-recent-label">Recent tasks</div>
        <div class="w-chips">${chips}</div>
      </div>`;
  }

  function breakPanelHTML() {
    return `
      <div class="w-breakpresets">
        ${Object.keys(PRESET_MIN).map((k) => `<button class="w-breakpreset" data-break="${PRESET_MIN[k]}" type="button">${k}</button>`).join('')}
      </div>
      <div class="w-custombreak">
        <input class="w-bh" inputmode="numeric" maxlength="2" placeholder="h" aria-label="Break hours" />
        <span class="w-bsep">:</span>
        <input class="w-bm" inputmode="numeric" maxlength="2" placeholder="m" aria-label="Break minutes" />
        <button class="w-bgo" data-act="custom-break" type="button">Go</button>
      </div>`;
  }

  function renderSession(animate = false) {
    root.dataset.level = S.level === 'focused' ? '' : S.level;
    const panel =
      S.tab === 'dashboard' ? dashPanelHTML() : S.tab === 'task' ? taskPanelHTML() : breakPanelHTML();
    root.innerHTML = `
      <button class="w-end" data-act="end" title="End session" aria-label="End session" type="button">&#10005;</button>
      <div class="w-top">
        <button class="w-topbtn" data-act="focus" type="button">Focus mode</button>
      </div>
      <div class="w-tabcontent">
        <div class="w-panel slide-${animate ? S.slideDir : 'none'}">${panel}</div>
      </div>
      <div class="w-tabbar">
        ${TABS.map((t) => `<button class="w-tab ${S.tab === t ? 'active' : ''}" data-tab="${t}" type="button">${TAB_LABEL[t]}</button>`).join('')}
      </div>`;
    if (S.tab === 'dashboard') { sizeSpark(); drawSpark(); }
    bindTaskInput();
    bindBreakInputs();
  }

  function renderBreak() {
    root.dataset.level = '';
    root.innerHTML = `
      <div class="w-breakcontent">
        <div class="w-breaklabel js-breaklabel">BREAK</div>
        <div class="w-breaktimer js-breaktimer">${fmtBreak(S.breakLeft)}</div>
        <button class="w-breakback" data-act="back" type="button">I'm back</button>
      </div>`;
  }

  function renderFocus() {
    const c = taskCol(S.task);
    root.innerHTML = `
      <button class="w-focusexit" data-act="focus-exit" title="Exit focus mode" aria-label="Exit focus mode" type="button">${FOCUS_EXIT}</button>
      <div class="w-focusview">
        <div class="w-focusstate js-focusstate">${levelWord()}</div>
        <div class="w-focustask" style="color:${c}">${esc(S.task)}</div>
      </div>`;
  }

  function legendItems() {
    const seen = new Map();
    if (S.task !== 'No Task') seen.set(S.task, taskCol(S.task));
    for (const s of S.samples) {
      if (s.b) { if (!seen.has('Break')) seen.set('Break', BREAK_COLOR); }
      else if (s.c !== NO_TASK_COLOR) {
        if (!seen.has(S.task)) seen.set(S.task, s.c);
      }
    }
    return Array.from(seen, ([n, c]) => ({ n, c }));
  }

  function bindTaskInput() {
    const input = root.querySelector('.js-taskinput');
    if (!input) return;
    const submit = () => {
      const v = input.value.trim();
      if (v) { setTask(v); input.value = ''; }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const setBtn = root.querySelector('[data-act="set-task"]');
    if (setBtn) setBtn.addEventListener('click', submit);
  }

  function bindBreakInputs() {
    const go = root.querySelector('[data-act="custom-break"]');
    if (!go) return;
    const total = () => {
      const h = parseInt(root.querySelector('.w-bh').value, 10) || 0;
      const m = parseInt(root.querySelector('.w-bm').value, 10) || 0;
      return h * 60 + m;
    };
    go.addEventListener('click', () => { const t = total(); if (t > 0) takeBreak(t); });
  }

  /* ---------- canvas efficiency line ---------- */
  function sizeSpark() {
    const wrap = root.querySelector('.w-spark');
    const canvas = root.querySelector('.w-spark canvas');
    if (!wrap || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = wrap.clientWidth * dpr;
    canvas.height = wrap.clientHeight * dpr;
    canvas.style.width = wrap.clientWidth + 'px';
    canvas.style.height = wrap.clientHeight + 'px';
  }

  function drawSpark() {
    const canvas = root.querySelector('.w-spark canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (S.samples.length < 2) return;
    const padT = 12, padB = 8, padX = 2;
    const X = (i) => padX + (i / (S.samples.length - 1)) * (w - padX * 2);
    const Y = (v) => padT + (1 - v) * (h - padT - padB);
    ctx.lineWidth = 3 * (window.devicePixelRatio || 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let prev = null;
    for (let i = 0; i < S.samples.length; i++) {
      const s = S.samples[i];
      if (prev && (s.b || prev.c !== s.c || prev.b)) {
        ctx.strokeStyle = prev.c;
        ctx.beginPath();
        ctx.moveTo(X(i - 1), Y(prev.v));
        ctx.lineTo(X(i), Y(s.v));
        ctx.stroke();
        ctx.beginPath();
      } else if (i === 0 || (prev && prev.b)) {
        ctx.beginPath();
        ctx.moveTo(X(i), Y(s.v));
      }
      ctx.strokeStyle = s.c;
      ctx.lineTo(X(i), Y(s.v));
      ctx.stroke();
      prev = s;
    }
    const last = S.samples[S.samples.length - 1];
    const dpr = window.devicePixelRatio || 1;
    ctx.beginPath();
    ctx.arc(X(S.samples.length - 1), Y(last.v), 3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = '#000';
    ctx.stroke();
  }

  /* ---------- timers ---------- */
  function startTimer() {
    stopTimer();
    timer = setInterval(tick, 1000);
    tick();
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function tick() {
    if (S.mode === 'break') {
      S.breakLeft -= 1;
      S.breakMs += 1000;
      updateBreakUI();
      if (S.breakLeft <= 0) setLevel('unfocused');
      return;
    }
    if (S.mode !== 'session') return;
    pushSample();
    if (S.task !== 'No Task') {
      S.activeCount++;
      if (S.level === 'focused') S.focusedCount++;
    }
    if (S.level === 'focused') S.focusedMs += 1000;
    else S.distractedMs += 1000;
    updateSessionUI();
  }

  function updateSessionUI() {
    if (root.querySelector('.w-spark')) {
      drawSpark();
      const eff = S.activeCount ? Math.round((S.focusedCount / S.activeCount) * 100) : 0;
      const effEl = root.querySelector('.js-eff');
      if (effEl) effEl.textContent = eff + '%';
      const foc = root.querySelector('.js-foc');
      if (foc) foc.textContent = fmt(S.focusedMs);
      const dis = root.querySelector('.js-dis');
      if (dis) dis.textContent = fmt(S.distractedMs);
      const brk = root.querySelector('.js-brk');
      if (brk) brk.textContent = fmt(S.breakMs);
    }
    const taskElapsed = S.task !== 'No Task' && S.taskStart > 0 ? Date.now() - S.taskStart : 0;
    const ttv = root.querySelector('.tt-value');
    if (ttv) ttv.textContent = fmt(taskElapsed);
    const tat = root.querySelector('.w-ta-time');
    if (tat) tat.textContent = fmt(taskElapsed);
    const fs = root.querySelector('.js-focusstate');
    if (fs) fs.textContent = levelWord();
  }

  function updateBreakUI() {
    const t = root.querySelector('.js-breaktimer');
    if (t) t.textContent = fmtBreak(S.breakLeft);
    if (S.breakLeft <= 0) {
      root.classList.add('w-breakdone');
      const l = root.querySelector('.js-breaklabel');
      if (l) l.textContent = 'BREAK';
    }
  }

  /* ---------- public API ---------- */
  function setMode(m, extra = {}) {
    S.mode = m;
    root.classList.toggle('w-focusmode', m === 'focus');
    root.classList.toggle('w-breakmode', m === 'break');
    if (m === 'idle') { stopTimer(); renderIdle(); }
    if (m === 'session') {
      if (!S.startTs) S.startTs = Date.now();
      renderSession();
      startTimer();
    }
    if (m === 'break') {
      S.breakLeft = (extra.minutes ?? 1) * 60;
      renderBreak();
    }
    if (m === 'focus') renderFocus();
    emit('mode', m, extra);
    emit('level', S.level);
  }

  function setTab(t, dir) {
    if (S.tab === t) return;
    const prevIdx = TABS.indexOf(S.prevTab);
    const nextIdx = TABS.indexOf(t);
    S.slideDir = dir || (nextIdx > prevIdx ? 'right' : 'left');
    S.prevTab = S.tab;
    S.tab = t;
    renderSession(true);
  }

  function setLevel(l) {
    S.level = l;
    root.dataset.level = l === 'focused' ? '' : l;
    if (S.mode === 'session') {
      // refresh border + focus pill text without tearing down the tab
      const fs = root.querySelector('.js-focusstate');
      if (fs) fs.textContent = levelWord();
    }
    emit('level', l);
  }

  function setTask(name) {
    if (!name) return;
    if (!o.recentTasks.includes(name)) o.recentTasks = [name, ...o.recentTasks].slice(0, 5);
    S.task = name;
    S.taskStart = Date.now();
    emit('task', name);
    if (S.mode === 'session') {
      // the real app returns to the Overview tab when a task is picked
      if (S.tab !== 'dashboard') { S.prevTab = S.tab; S.slideDir = 'left'; S.tab = 'dashboard'; }
      renderSession(true);
    }
  }

  function stopTask() { S.task = 'No Task'; S.taskStart = 0; if (S.mode === 'session') renderSession(true); emit('task', S.task); }
  function takeBreak(min) { setMode('break', { minutes: min }); }
  function endBreak() { S.mode = 'session'; renderSession(); startTimer(); emit('mode', 'session'); }
  function endSession() {
    stopTimer();
    const stats = {
      efficiency: S.activeCount ? Math.round((S.focusedCount / S.activeCount) * 100) : 0,
      focusedMs: S.focusedMs, distractedMs: S.distractedMs, breakMs: S.breakMs,
      task: S.task, samples: S.samples.length,
    };
    resetState();
    setMode('idle');
    return stats;
  }
  function resetState() {
    S.task = 'No Task'; S.taskStart = 0; S.startTs = 0;
    S.focusedMs = 0; S.distractedMs = 0; S.breakMs = 0;
    S.samples = []; S.focusedCount = 0; S.activeCount = 0;
    S.level = 'focused'; S.tab = 'dashboard'; S.prevTab = 'dashboard'; S.focusMode = false;
  }

  /* ---------- events (delegated; skipped entirely in non-interactive hosts) ---------- */
  if (o.interactive) {
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.dataset.act;
      const tab = btn.dataset.tab;
      if (tab) { setTab(tab); return; }
      if (btn.dataset.task) { setTask(btn.dataset.task); return; }
      if (btn.dataset.break) { takeBreak(parseInt(btn.dataset.break, 10)); return; }
      if (act === 'start') { setMode('session'); return; }
      if (act === 'end') { const st = endSession(); emit('end', st); return; }
      if (act === 'dash') { emit('dash'); return; }
      if (act === 'focus') { S.focusMode = true; setMode('focus'); return; }
      if (act === 'focus-exit') { S.focusMode = false; if (S.mode === 'focus') setMode('session'); return; }
      if (act === 'back') { endBreak(); return; }
      if (act === 'stop-task') { stopTask(); return; }
    });
  } else {
    root.classList.add('static');
  }

  /* ---------- drag ---------- */
  if (o.draggable) {
    root.classList.add('draggable');
    let dragging = null;
    // Nearest ancestor wide enough to drag within (skips tiny positioning anchors).
    function dragHost() {
      let p = root.parentElement;
      const need = root.getBoundingClientRect().width + 40;
      while (p && p.getBoundingClientRect().width < need) p = p.parentElement;
      return p;
    }
    root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, input')) return;
      const host = dragHost();
      if (!host) return;
      const hr = host.getBoundingClientRect();
      const wr = root.getBoundingClientRect();
      dragging = { dx: e.clientX - wr.left, dy: e.clientY - wr.top, minX: 8, minY: 8, maxX: Math.max(8, hr.width - wr.width - 8), maxY: Math.max(8, hr.height - wr.height - 8) };
      root.classList.add('dragging');
      root.setPointerCapture(e.pointerId);
    });
    root.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const host = dragHost();
      if (!host) return;
      const hr = host.getBoundingClientRect();
      let x = e.clientX - hr.left - dragging.dx;
      let y = e.clientY - hr.top - dragging.dy;
      x = Math.max(dragging.minX, Math.min(dragging.maxX, x));
      y = Math.max(dragging.minY, Math.min(dragging.maxY, y));
      root.style.position = 'absolute';
      root.style.left = x + 'px';
      root.style.top = y + 'px';
    });
    ['pointerup', 'pointercancel'].forEach((ev) => root.addEventListener(ev, () => { dragging = null; root.classList.remove('dragging'); }));
  }

  renderIdle();

  return {
    el: root,
    on,
    setMode, setTab, setLevel, setTask, stopTask, takeBreak, endBreak, endSession,
    resetAll() { stopTimer(); resetState(); setMode('idle'); },
    setRecentTasks(list) { o.recentTasks = list; if (S.mode === 'session') renderSession(true); },
    get state() { return S; },
  };
}
