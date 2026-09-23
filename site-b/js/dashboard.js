/* Dashboard replica: "Trance Analysis" window with the app's Back / Settings
   header, its three tabs, RangeCards, subject tables, bar charts and the
   expandable All Sessions list. Every number derives from the same generated
   session rows the charts draw. */
import {
  BREAK_COLOR, HERO_SESSION, LAST_HOUR_SESSION, sessionStats, subjectStats,
  buildObservations, TREND_SESSIONS, trendSessionRows, TASK_MASTERY,
  taskColor, levelColor, fmtMs,
} from './data.js?v=24';
import { buildRangeCard, buildSegSegments, buildAreaChart, buildTrendLine, buildBarChart, buildHourBars, setColorContext, hexToRgba } from './charts.js?v=24';

export function initDashboard() {
  const tabs = document.querySelectorAll('.dash-tab[data-dashtab]');
  const panes = document.querySelectorAll('.dash-pane[data-pane]');
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      tabs.forEach((x) => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
      panes.forEach((p) => p.classList.toggle('on', p.dataset.pane === t.dataset.dashtab));
      if (t.dataset.dashtab === 'insights') animateBars();
    })
  );

  const heroLabels = [...new Set(HERO_SESSION.filter((r) => !r.break).map((r) => r.task))];
  setColorContext(heroLabels);
  const segColor = (label) => (label === 'Break' ? BREAK_COLOR : taskColor(label, heroLabels));

  /* ---------------- Timeline ---------------- */
  const rt = document.getElementById('rt-chart');
  if (rt) {
    const st = sessionStats(HERO_SESSION);
    buildRangeCard(rt, HERO_SESSION, { id: 'rt' });
    fillMeta('rt-meta', st);
    fillStats('rt', st);
    fillLegend('rt-legend', HERO_SESSION, segColor);

    const stH = sessionStats(LAST_HOUR_SESSION);
    buildRangeCard(document.getElementById('rh-chart'), LAST_HOUR_SESSION, { id: 'rh' });
    fillMeta('rh-meta', stH);
    fillStats('rh', stH);
    fillLegend('rh-legend', LAST_HOUR_SESSION, segColor);
  }

  function fillMeta(id, st) {
    const el = document.getElementById(id);
    if (el) el.textContent = `${st.samples} samples · ${fmtMs(st.totalMs)}`;
  }
  function fillStats(prefix, st) {
    const set = (suffix, val) => {
      const el = document.getElementById(`${prefix}-${suffix}`);
      if (el) el.textContent = val;
    };
    set('eff', st.efficiency + '%');
    set('breakpct', st.breakPct + '%');
    set('breaktime', fmtMs(st.breakMs));
  }
  function fillLegend(id, rows, colorFn) {
    const el = document.getElementById(id);
    if (!el) return;
    const seen = [];
    for (const r of rows) {
      const name = r.break ? 'Break' : r.task;
      if (!seen.find((s) => s.name === name)) seen.push({ name, c: colorFn(name) });
    }
    el.innerHTML = seen
      .map((s) => `<span class="legend-item"><span class="legend-dot" style="background:${s.c}"></span>${s.name}</span>`)
      .join('');
  }

  /* ---------------- Insights ---------------- */
  const table = document.getElementById('insight-table');
  if (table) {
    const subjects = subjectStats(HERO_SESSION);
    table.innerHTML = subjects
      .map((s) => subjectRowHTML(s, heroLabels))
      .join('');

    // Task time comparison: horizontal bars, task-colored, minutes on the axis
    const timeHost = document.getElementById('insight-time');
    const maxMin = Math.max(...subjects.map((s) => s.timeMs)) / 60000;
    timeHost.innerHTML = subjects
      .map((s) => {
        const min = s.timeMs / 60000;
        const w = (min / maxMin) * 100;
        const c = taskColor(s.label, heroLabels);
        return `
          <div class="time-bar">
            <span class="tb-label"><span class="legend-dot" style="background:${c}"></span>${s.label}</span>
            <span class="tb-track"><span class="tb-fill" style="width:${w}%;background:${c}" data-w="${w}"></span></span>
            <span class="tb-val">${fmtMs(s.timeMs)}</span>
          </div>`;
      })
      .join('');

    // Task efficiency comparison: vertical bars in semantic colors
    const effHost = document.getElementById('insight-eff');
    effHost.innerHTML = `
      <div class="eff-bars">
        ${subjects
          .map((s) => {
            const c = levelColor(s.focusPct);
            return `
              <div class="eff-col">
                <div class="eff-track"><div class="eff-fill" data-h="${s.focusPct}" style="background:${c}"></div></div>
                <div class="eff-pct">${s.focusPct}%</div>
                <div class="eff-name"><span class="legend-dot" style="background:${taskColor(s.label, heroLabels)}"></span>${s.label}</div>
              </div>`;
          })
          .join('')}
      </div>`;

    animateBars();
  }

  function subjectRowHTML(s, labels) {
    return `
      <div class="subject-row">
        <span class="legend-dot" style="background:${taskColor(s.label, labels)}"></span>
        <span class="sr-name">${s.label}</span>
        <span class="sr-time">${fmtMs(s.timeMs)}</span>
        <span class="sr-share">${s.sharePct}% of session</span>
        <span class="sr-focus">${s.focusPct}% efficiency</span>
      </div>`;
  }

  function animateBars() {
    document.querySelectorAll('#insight-time .tb-fill').forEach((f, i) => {
      f.style.width = '0%';
      setTimeout(() => { f.style.width = f.dataset.w + '%'; }, 80 + i * 90);
    });
    document.querySelectorAll('#insight-eff .eff-fill').forEach((f, i) => {
      f.style.height = '0%';
      setTimeout(() => { f.style.height = f.dataset.h + '%'; }, 120 + i * 90);
    });
  }

  /* ---------------- Trends ---------------- */
  const tl = document.getElementById('trend-line');
  if (tl) {
    // summary cards
    const best = Math.max(...TREND_SESSIONS.map((s) => s.pct));
    const totalMs = TREND_SESSIONS.reduce((a, s) => a + s.dur * 60000, 0);
    document.getElementById('ts-sessions').textContent = TREND_SESSIONS.length;
    document.getElementById('ts-total').textContent = fmtMs(totalMs);
    document.getElementById('ts-best').textContent = best + '%';
    document.getElementById('ts-dir').textContent = '▲';
    document.getElementById('ts-dir-label').textContent = 'Improving';

    buildTrendLine(tl, TREND_SESSIONS);
    buildBarChart(document.getElementById('trend-lapses'), TREND_SESSIONS.map((s) => ({ v: s.lapses, h: s.date, c: '#FF6B6B' })), { max: 12, unit: ' episodes' });
    buildBarChart(document.getElementById('trend-streak'), TREND_SESSIONS.map((s) => ({ v: s.streak, h: s.date, c: '#6BFFB2' })), { unit: 's' });
    buildBarChart(document.getElementById('trend-dur'), TREND_SESSIONS.map((s) => ({ v: s.dur, h: s.date, c: '#9B8AFF' })), { unit: ' min' });
    buildHourBars(document.getElementById('trend-hours'));

    // task mastery table: times derive from the same total the summary shows
    const mastery = TASK_MASTERY.map((m) => ({
      label: m.label,
      timeMs: Math.round((totalMs * m.sharePct) / 100),
      sharePct: m.sharePct,
      focusPct: m.focusPct,
    }));
    document.getElementById('mastery-table').innerHTML = mastery
      .map((s) => subjectRowHTML(s, TASK_MASTERY.map((x) => x.label)))
      .join('');

    // All sessions list with expandable details (mini RangeCard + stats + tasks)
    const list = document.getElementById('sessions-list');
    list.innerHTML = [...TREND_SESSIONS]
      .slice(-8)
      .reverse()
      .map((s) => {
        const i = TREND_SESSIONS.indexOf(s);
        return `
          <div class="session-item">
            <button class="session-row" data-sid="${i}" type="button" aria-expanded="false">
              <span class="s-dot" style="background:${levelColor(s.pct)}"></span>
              <span class="s-name">${s.name}</span>
              <span class="s-meta">${s.date} · ${fmtMs(s.dur * 60000)} · ${s.pct}% efficiency</span>
              <span class="s-chev">▾</span>
            </button>
            <div class="session-detail" hidden></div>
          </div>`;
      })
      .join('');

    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.session-row');
      if (!btn) return;
      const item = btn.parentElement;
      const detail = item.querySelector('.session-detail');
      const open = detail.hidden;
      if (open && !detail.dataset.built) {
        buildSessionDetail(detail, Number(btn.dataset.sid));
        detail.dataset.built = '1';
      }
      detail.hidden = !open;
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    function buildSessionDetail(detail, i) {
      const s = TREND_SESSIONS[i];
      const rows = trendSessionRows(i);
      const st = sessionStats(rows);
      const labels = [...new Set(rows.filter((r) => !r.break).map((r) => r.task))];
      detail.innerHTML = `
        <div class="sd-head"><b>${s.name}</b><span>${s.date} · ${fmtMs(st.totalMs)}</span></div>
        <div class="sd-chart"></div>
        <div class="sd-stats">
          <div class="sd-stat"><b>${st.efficiency}%</b><span>Efficiency</span></div>
          <div class="sd-stat"><b>${st.lapses}</b><span>Lapses</span></div>
          <div class="sd-stat"><b>${st.avgStreakSec}s</b><span>Avg focus streak</span></div>
          <div class="sd-stat"><b>${st.breakPct > 0 ? st.breakPct + '%' : '0%'}</b><span>Break time</span></div>
        </div>
        <div class="sd-tasks">
          ${subjectStats(rows).map((x) => subjectRowHTML(x, labels)).join('')}
        </div>`;
      const chartHost = detail.querySelector('.sd-chart');
      setColorContext(labels);
      buildRangeCard(chartHost, rows, { id: 'sd' + i });
      setColorContext(heroLabels);
    }
  }

  // animate the insight bars when the window first scrolls into view
  const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) animateBars(); }), { threshold: 0.3 });
  const winEl = document.getElementById('dash-window');
  if (winEl) io.observe(winEl);
}
