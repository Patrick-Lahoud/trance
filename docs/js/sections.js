/* Widget sections: the problem sequence, the working showcase, the
   task-colors strip, the break countdown and Focus Mode. */
import { createWidget } from './widget.js?v=24';
import { COLOR_SESSION, taskColor } from './data.js?v=24';
import { buildSessionLine } from './charts.js?v=24';

export function initSections() {
  /* ================= What Trance sees ================= */
  const seesHost = document.getElementById('sees-widget');
  const steps = document.querySelectorAll('#sees-steps li[data-state]');
  if (seesHost && steps.length) {
    // The widget itself is not interactive: only the four state buttons drive it.
    const w = createWidget({ interactive: false });
    seesHost.appendChild(w.el);
    seesHost.querySelector('.trance-widget')?.style.setProperty('transform', 'scale(1.12)');

    const order = ['focused', 'restless', 'unfocused', 'back'];
    function apply(state) {
      steps.forEach((li) => li.classList.toggle('active', li.dataset.state === state));
      if (state === 'focused') {
        w.resetAll();
        w.setMode('session');
        w.setTask('Writing');
      } else if (state === 'restless') {
        w.setLevel('warning');
      } else if (state === 'unfocused') {
        w.setLevel('unfocused');
      } else {
        w.setLevel('focused');
      }
    }

    steps.forEach((li) => {
      li.addEventListener('click', () => { stopSeq(); apply(li.dataset.state); });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stopSeq(); apply(li.dataset.state); }
      });
    });
    const playBtn = document.getElementById('sees-play');
    if (playBtn) playBtn.addEventListener('click', () => { playSeq(); });

    let idx = 0, autoplay = null;
    function playSeq() {
      stopSeq();
      idx = 0;
      apply(order[0]);
      autoplay = setInterval(() => {
        idx++;
        if (idx >= order.length) { stopSeq(); return; }
        apply(order[idx]);
      }, 2600);
    }
    function stopSeq() { if (autoplay) { clearInterval(autoplay); autoplay = null; } }

    const io = new IntersectionObserver((es) => {
      es.forEach((en) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        apply('focused');
        playSeq();
      });
    }, { threshold: 0.4 });
    io.observe(seesHost);
  }

  /* ================= Showcase widget (hover/drag/tabs) ================= */
  const showHost = document.getElementById('showcase-widget');
  if (showHost) {
    const w = createWidget({ interactive: true, draggable: true, recentTasks: ['Writing', 'Research', 'Reading'] });
    showHost.appendChild(w.el);
    // pre-run a session so the widget shows live data on arrival
    setTimeout(() => { w.setMode('session'); w.setTask('Writing'); }, 600);
  }

  // state strip highlight follows the widget's mode
  const strip = document.getElementById('state-strip');
  if (strip && showHost) {
    const mo = new MutationObserver(() => {
      const el = showHost.querySelector('.trance-widget');
      let mode = 'idle';
      if (el.querySelector('.w-breakcontent')) mode = 'break';
      else if (el.querySelector('.w-focusview')) mode = 'focus';
      else if (el.querySelector('.w-tabcontent')) mode = el.querySelector('.tt-label')?.textContent !== 'No Task' ? 'task' : 'working';
      else if (el.querySelector('.w-start')) mode = 'idle';
      strip.querySelectorAll('span').forEach((s) => s.classList.toggle('on', s.dataset.state === mode));
      // "Task" also lights when a task is simply set
      if (mode === 'working' && el.querySelector('.tt-label')) {
        strip.querySelectorAll('span').forEach((s) => s.classList.toggle('on', s.dataset.state === 'task'));
      }
    });
    mo.observe(showHost, { childList: true, subtree: true });
  }

  /* ================= Task colors: the strip + task rows ================= */
  const colorStrip = document.getElementById('task-strip');
  const rowsHost = document.getElementById('task-rows');
  if (colorStrip && rowsHost) {
    // expand COLOR_SESSION into 10s rows so the line has a natural texture
    const rows = [];
    for (const p of COLOR_SESSION) {
      const n = Math.round(p.minutes * 6);
      for (let i = 0; i < n; i++) {
        const r = Math.abs((Math.sin((i + p.minutes) * 12.9898) * 43758.5453) % 1);
        rows.push({
          task: p.task,
          state: r > 0.28 ? 'focused' : r > 0.12 ? 'restless' : 'idle',
        });
      }
    }
    buildSessionLine(colorStrip, rows);

    const labels = [...new Set(COLOR_SESSION.map((p) => p.task))];
    let acc = 0;
    rowsHost.innerHTML = COLOR_SESSION.map((p) => {
      const start = acc;
      acc += p.minutes;
      const end = acc;
      const fmt = (m) => `${String(Math.floor(m)).padStart(2, '0')}:${m % 1 ? '30' : '00'}`;
      return `
        <div class="task-row" style="--tc:${taskColor(p.task, labels)}">
          <span class="tr-dot"></span>
          <span class="tr-name">${p.task}</span>
          <span class="tr-time">${fmt(start)} <i>to</i> ${fmt(end)}</span>
          <span class="tr-len">${p.minutes} min</span>
        </div>`;
    }).join('');
  }

  /* ================= Break countdown ================= */
  const bt = document.getElementById('bt-count');
  if (bt) {
    let left = 300; // 5:00
    const render = () => { bt.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; };
    render();
    let iv = null;
    const io = new IntersectionObserver((es) => {
      es.forEach((en) => {
        if (en.isIntersecting && !iv) iv = setInterval(() => {
          left = left > 0 ? left - 1 : 300;
          render();
          if (left === 300) return; // wrapped
        }, 1000);
        if (!en.isIntersecting && iv) { clearInterval(iv); iv = null; }
      });
    }, { threshold: 0.3 });
    io.observe(bt);
  }

  /* ================= Focus mode demo ================= */
  const focusHost = document.getElementById('focus-widget');
  const focusBtn = document.getElementById('focus-toggle');
  if (focusHost && focusBtn) {
    const w = createWidget({ interactive: false });
    focusHost.appendChild(w.el);
    w.setMode('session');
    w.setTask('Writing');
    let focused = false;
    focusBtn.addEventListener('click', () => {
      focused = !focused;
      if (focused) { w.setMode('focus'); focusBtn.textContent = 'Exit Focus Mode'; }
      else { w.setMode('session'); focusBtn.textContent = 'Enter Focus Mode'; }
    });
    // auto-demonstrate once when scrolled into view
    const io = new IntersectionObserver((es) => {
      es.forEach((en) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        setTimeout(() => {
          if (!focused) { focused = true; w.setMode('focus'); focusBtn.textContent = 'Exit Focus Mode'; }
        }, 900);
      });
    }, { threshold: 0.5 });
    io.observe(focusHost);
  }
}
