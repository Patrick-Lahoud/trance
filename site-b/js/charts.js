/* SVG chart builders matching the app's recharts output: bordered grid,
   task-color gradient line, white-to-transparent fill, gray break bands,
   dashed task transitions. Also the task-colors session line. */
import { BREAK_COLOR, NO_TASK_COLOR, HOURS, levelColor, taskColor } from './data.js?v=24';

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/* #RRGGBB -> rgba() with alpha (color-mix() is unavailable in the embedded
   Chromium the preview uses, so bars use inline rgba). */
export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* Compress 10s rows into ~1-per-minute samples, like the app's live 1s rows
   render. Break samples carry no value; the line carries the previous level
   through them so it stays connected through the gray band. */
function compress(rows, target = 120) {
  const step = Math.max(1, Math.ceil(rows.length / target));
  const out = [];
  for (let i = 0; i < rows.length; i += step) {
    const chunk = rows.slice(i, i + step);
    const active = chunk.filter((r) => !r.break);
    if (!active.length) { out.push({ break: true, task: null }); continue; }
    const val = { focused: 1, restless: 0.6, idle: 0.3, erratic: 0.15 };
    let v = 0, n = 0, focusedN = 0;
    for (const r of active) { v += val[r.state] ?? 0.2; n++; if (r.state === 'focused') focusedN++; }
    out.push({
      v: v / n,
      task: active[0].task,
      focusedPct: Math.round((focusedN / n) * 100),
      break: false,
      span: step,
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Range card chart: segmented task-colored bar + efficiency area chart.
   This is the app's RangeCard, one to one.
--------------------------------------------------------------------------- */
export function buildRangeCard(host, rows, opts = {}) {
  const data = compress(rows);
  const segBar = document.createElement('div');
  segBar.className = 'range-segbar';
  buildSegSegments(segBar, data);
  const chart = document.createElement('div');
  chart.className = 'range-chart-svg';
  buildAreaChart(chart, data, opts);
  host.innerHTML = '';
  host.appendChild(segBar);
  host.appendChild(chart);
}

export function buildSegSegments(container, data) {
  container.innerHTML = '';
  let i = 0;
  const total = data.length;
  while (i < total) {
    const d = data[i];
    const key = d.break ? 'Break' : d.task || 'No Task';
    let j = i + 1;
    while (j < total) {
      const dj = data[j];
      const k2 = dj.break ? 'Break' : dj.task || 'No Task';
      if (k2 !== key) break;
      j++;
    }
    const span = document.createElement('span');
    span.style.width = ((j - i) / total) * 100 + '%';
    if (d.break) {
      span.style.background = BREAK_COLOR;
      span.title = 'Break';
    } else {
      const c = d.task ? colorFor(d.task) : NO_TASK_COLOR;
      span.style.background = hexToRgba(c, 0.25 + (d.focusedPct / 100) * 0.55);
      span.title = key;
    }
    container.appendChild(span);
    i = j;
  }
}

let COLOR_CONTEXT = [];
export function setColorContext(labels) { COLOR_CONTEXT = labels || []; }
function colorFor(label) {
  return !label || label === 'No Task' ? NO_TASK_COLOR : taskColor(label, COLOR_CONTEXT);
}

/* Area chart with per-task gradient stops, gray break bands, dashed
   task transitions. Carries the previous value through breaks. */
export function buildAreaChart(container, data, opts = {}) {
  const W = 880, H = 150;
  const padT = 10, padB = 6, padX = 2;
  const s = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', preserveAspectRatio: 'none' });
  const tasks = [];
  for (const d of data) if (d.task && !tasks.includes(d.task)) tasks.push(d.task);
  const X = (i) => padX + (i / (data.length - 1)) * (W - padX * 2);
  const Y = (v) => padT + (1 - v) * (H - padT - padB);

  const defs = el('defs');
  const grad = el('linearGradient', { id: (opts.id || 'lg') + '-line', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: W, y2: 0 });
  let prevTask = null;
  data.forEach((d, i) => {
    const t = d.task || prevTask;
    if (!t || t === prevTask) return;
    grad.appendChild(el('stop', { offset: ((X(i) / W) * 100).toFixed(2) + '%', 'stop-color': colorFor(t) }));
    prevTask = t;
  });
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': colorFor(prevTask || tasks[0] || 'No Task') }));
  const fillG = el('linearGradient', { id: (opts.id || 'lg') + '-fill', x1: 0, y1: 0, x2: 0, y2: 1 });
  fillG.appendChild(el('stop', { offset: '5%', 'stop-color': '#FFFFFF', 'stop-opacity': '0.12' }));
  fillG.appendChild(el('stop', { offset: '95%', 'stop-color': '#FFFFFF', 'stop-opacity': '0' }));
  defs.appendChild(grad);
  defs.appendChild(fillG);
  s.appendChild(defs);

  // bordered grid, exactly the app's CartesianGrid look
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    s.appendChild(el('line', { x1: 0, y1: Y(g), x2: W, y2: Y(g), stroke: '#1A1A1A', 'stroke-dasharray': '3 3', 'stroke-width': 1 }));
  }
  s.appendChild(el('line', { x1: 0, y1: padT, x2: 0, y2: H - padB, stroke: '#1A1A1A', 'stroke-width': 1 }));
  s.appendChild(el('rect', { x: 0.5, y: padT, width: W - 1, height: H - padT - padB, fill: 'none', stroke: '#1A1A1A', 'stroke-width': 1 }));

  // break bands
  data.forEach((d, i) => {
    if (!d.break) return;
    let j = i;
    while (j < data.length && data[j].break) j++;
    s.appendChild(el('rect', {
      x: X(i), y: padT,
      width: X(Math.min(j, data.length - 1)) - X(i),
      height: H - padT - padB,
      fill: BREAK_COLOR, 'fill-opacity': 0.28, stroke: BREAK_COLOR, 'stroke-opacity': 0.4,
    }));
  });

  // task transition dashed lines
  let lastT = null;
  data.forEach((d, i) => {
    if (d.break) return;
    const t = d.task || 'No Task';
    if (lastT && t !== lastT) {
      s.appendChild(el('line', { x1: X(i), y1: padT, x2: X(i), y2: H - padB, stroke: '#555', 'stroke-dasharray': '3 3', 'stroke-width': 1 }));
    }
    lastT = t;
  });

  // area + line, carrying the previous value through breaks
  let dPath = '';
  let prevV = 0.5;
  const pts = [];
  data.forEach((d, i) => {
    const v = d.break ? prevV : d.v;
    if (!d.break) prevV = v;
    pts.push([X(i), Y(v)]);
  });
  pts.forEach(([x, y], i) => { dPath += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' '; });
  s.appendChild(el('path', { d: dPath + `L ${W - padX} ${H - padB} L ${padX} ${H - padB} Z`, fill: `url(#${(opts.id || 'lg')}-fill)` }));
  s.appendChild(el('path', { d: dPath, fill: 'none', stroke: `url(#${(opts.id || 'lg')}-line)`, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // end dot
  const lastP = pts[pts.length - 1];
  s.appendChild(el('circle', { cx: lastP[0], cy: lastP[1], r: 3, fill: '#fff', stroke: '#000', 'stroke-width': 1.2 }));

  container.innerHTML = '';
  container.appendChild(s);
}

/* ---------------------------------------------------------------------------
   Task colors section: the session as one continuous line, recolored at each
   task boundary, with the unnamed stretch in white.
--------------------------------------------------------------------------- */
export function buildSessionLine(host, rows) {
  const W = 900, H = 168;
  const padT = 18, padB = 30, padX = 2;
  const s = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', preserveAspectRatio: 'none' });
  const allLabels = ['Reading', 'Writing', 'Research', 'Email'];
  const val = { focused: 1, restless: 0.6, idle: 0.3, erratic: 0.15 };

  const X = (i) => padX + (i / (rows.length - 1)) * (W - padX * 2);
  const Y = (v) => padT + (1 - v) * (H - padT - padB);

  const defs = el('defs');
  const grad = el('linearGradient', { id: 'csn-line', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: W, y2: 0 });
  let prev = null;
  rows.forEach((r, i) => {
    const t = r.task || prev;
    if (t !== prev) {
      grad.appendChild(el('stop', { offset: ((X(i) / W) * 100).toFixed(2) + '%', 'stop-color': t ? taskColor(t, allLabels) : NO_TASK_COLOR }));
      prev = t;
    }
  });
  const fillG = el('linearGradient', { id: 'csn-fill', x1: 0, y1: 0, x2: 0, y2: 1 });
  fillG.appendChild(el('stop', { offset: '5%', 'stop-color': '#FFFFFF', 'stop-opacity': '0.1' }));
  fillG.appendChild(el('stop', { offset: '95%', 'stop-color': '#FFFFFF', 'stop-opacity': '0' }));
  defs.appendChild(grad);
  defs.appendChild(fillG);
  s.appendChild(defs);

  for (const g of [0.25, 0.5, 0.75]) {
    s.appendChild(el('line', { x1: 0, y1: Y(g), x2: W, y2: Y(g), stroke: '#1F1F1F', 'stroke-dasharray': '3 4' }));
  }

  // subtle transition dashes at each rename
  prev = null;
  rows.forEach((r, i) => {
    if (prev && r.task !== prev) {
      s.appendChild(el('line', { x1: X(i), y1: padT, x2: X(i), y2: H - padB, stroke: '#3A3A3A', 'stroke-dasharray': '3 3' }));
    }
    prev = r.task;
  });

  let path = '';
  const pts = rows.map((r, i) => [X(i), Y(val[r.state] ?? 0.4)]);
  pts.forEach(([x, y], i) => { path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' '; });
  s.appendChild(el('path', { d: path + `L ${W - padX} ${H - padB} L ${padX} ${H - padB} Z`, fill: 'url(#csn-fill)' }));
  s.appendChild(el('path', { d: path, fill: 'none', stroke: 'url(#csn-line)', 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // time ticks
  let acc = 0;
  rows.forEach((r, i) => { acc += 10; });
  const marks = [];
  acc = 0;
  rows.forEach((r, i) => {
    const before = acc;
    acc += 10;
    if (i > 0 && r.task !== rows[i - 1].task) marks.push({ x: X(i), min: before / 60 });
  });
  marks.forEach((m) => {
    const t = el('text', { x: m.x, y: H - 8, 'text-anchor': 'middle', fill: '#666', 'font-size': 10 });
    t.textContent = `${Math.floor(m.min)}m`;
    s.appendChild(t);
  });

  host.innerHTML = '';
  host.appendChild(s);
}

/* ---------------------------------------------------------------------------
   Trends charts.
--------------------------------------------------------------------------- */
export function buildTrendLine(container, sessions) {
  const W = 640, H = 210;
  const pad = { l: 34, r: 10, t: 14, b: 26 };
  const s = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg' });
  const vals = sessions.map((x) => x.pct);
  const X = (i) => pad.l + (i / (vals.length - 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);

  for (const g of [0, 25, 50, 75, 100]) {
    s.appendChild(el('line', { x1: pad.l, y1: Y(g), x2: W - pad.r, y2: Y(g), stroke: '#1A1A1A', 'stroke-dasharray': '3 3', 'stroke-width': 1 }));
    const t = el('text', { x: pad.l - 7, y: Y(g) + 3, 'text-anchor': 'end', fill: '#777', 'font-size': 10 });
    t.textContent = g + '%';
    s.appendChild(t);
  }

  // moving average, dashed blue exactly like the app
  const ma = vals.map((_, i) => {
    if (i < 2) return null;
    const slice = vals.slice(i - 2, i + 1);
    return slice.reduce((a, b) => a + b, 0) / 3;
  });
  let maPath = '';
  let started = false;
  ma.forEach((v, i) => {
    if (v == null) return;
    maPath += (started ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' ';
    started = true;
  });
  s.appendChild(el('path', { d: maPath, fill: 'none', stroke: '#4A9EFF', 'stroke-width': 2, 'stroke-dasharray': '5 3' }));

  // raw line with white dots on every point, like the app
  let path = '';
  vals.forEach((v, i) => { path += (i === 0 ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' '; });
  s.appendChild(el('path', { d: path, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2 }));
  vals.forEach((v, i) => s.appendChild(el('circle', { cx: X(i), cy: Y(v), r: 2.6, fill: '#FFFFFF' })));

  // x labels
  [['Sep 1', 0], ['Sep 10', 9], ['Sep 18', vals.length - 1]].forEach(([lab, i]) => {
    const t = el('text', { x: X(i), y: H - 7, 'text-anchor': i === 0 ? 'start' : i === vals.length - 1 ? 'end' : 'middle', fill: '#777', 'font-size': 10 });
    t.textContent = lab;
    s.appendChild(t);
  });

  container.innerHTML = '';
  container.appendChild(s);
}

export function buildBarChart(container, data, opts = {}) {
  const W = opts.compact ? 300 : 640, H = opts.compact ? 150 : 160;
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  const s = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg' });
  const max = opts.max ?? Math.max(...data.map((d) => d.v)) * 1.1;
  const n = data.length;
  const slot = (W - pad.l - pad.r) / n;
  const bw = Math.max(2, slot - (n > 12 ? 2 : 6));
  const Y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  data.forEach((d, i) => {
    const x = pad.l + i * slot + (slot - bw) / 2;
    const color = d.c || '#FFFFFF';
    const bar = el('rect', { x, y: Y(d.v), width: bw, height: H - pad.b - Y(d.v), rx: 2, fill: color });
    const title = el('title');
    title.textContent = d.label ? `${d.label}: ${d.v}${opts.unit || ''}` : `${d.v}${opts.unit || ''}`;
    bar.appendChild(title);
    s.appendChild(bar);
    const every = n > 16 ? 3 : n > 8 ? 2 : 1;
    if (i % every === 0 && d.h !== undefined) {
      const t = el('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', fill: '#777', 'font-size': 10 });
      t.textContent = d.h;
      s.appendChild(t);
    }
  });
  container.innerHTML = '';
  container.appendChild(s);
}

export function buildHourBars(container) {
  const data = HOURS.filter((d) => d.v != null).map((d) => ({ h: d.h, v: d.v, c: levelColor(d.v) }));
  buildBarChart(container, data, { compact: true, max: 100, unit: '%' });
}
