/* Trance promotional site, shared data.
   Task colors, break color and state colors are the application's own values
   (ported from src/components/Dashboard.tsx / CornerWidget.tsx).
   All dashboard numbers are derived from the same generated session rows the
   charts draw, so every stat on the site is internally consistent. */

export const TASK_COLORS = [
  '#4A9EFF', '#FF6BB5', '#FFB86B', '#6BFFB2',
  '#9B8AFF', '#FF6B6B', '#6BFFEF', '#FFD76B',
];
export const BREAK_COLOR = '#555555';
export const NO_TASK_COLOR = '#FFFFFF';
export const WARN_COLOR = '#FFB800';
export const DANGER_COLOR = '#FF4444';

/* Trend-bar semantic colors, exactly as the app picks them. */
export function levelColor(pct) {
  return pct >= 70 ? '#6BFFB2' : pct >= 50 ? '#FFD76B' : '#FF6B6B';
}

export function taskColor(label, all) {
  const i = all.indexOf(label);
  return TASK_COLORS[(i >= 0 ? i : 0) % TASK_COLORS.length];
}

/* Official app mark: rounded near-black square, white orbit ring, satellite dot
   at 45° down-right. Geometry matches scripts/generate-icon.js. */
export function iconSVG(size = 26, radius) {
  const s = size;
  const cx = s / 2;
  const cy = s * 0.53;
  const r = s * 0.30;
  const sw = Math.max(1.6, s * 0.095);
  const dot = Math.max(2.2, s * 0.105);
  const dx = cx + r * Math.cos(Math.PI / 4);
  const dy = cy + r * Math.sin(Math.PI / 4);
  const rx = radius != null ? radius : (s - 2) * 0.225;
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">
    <rect x="1" y="1" width="${s - 2}" height="${s - 2}" rx="${rx}" fill="#0A0A0A"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FFFFFF" stroke-width="${sw}"/>
    <circle cx="${dx}" cy="${dy}" r="${dot}" fill="#FFFFFF"/>
  </svg>`;
}

/* Duration formatter, ported from the app's formatMs (analysis.ts). */
export function fmtMs(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min >= 60) {
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
  }
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
}

/* ---------------------------------------------------------------------------
   Session rows. One row = one 1s tracking window in the app; here 10s rows to
   keep chart payloads light (charts compress further as needed).
   Row shape: { task, state: 'focused'|'restless'|'idle'|'erratic' } or { break }
--------------------------------------------------------------------------- */

function hashRand(i, salt) {
  let r = Math.sin((i + salt * 131) * 12.9898) * 43758.5453;
  return r - Math.floor(r);
}

/* Direct-probability state picker: efficiency of a part equals its `focus`
   value, so stats computed from rows match the scenario exactly. */
function pickState(p, r) {
  if (r < p) return 'focused';
  if (r < p + (1 - p) * 0.55) return 'restless';
  if (r < p + (1 - p) * 0.85) return 'idle';
  return 'erratic';
}

function buildSession(parts) {
  const rows = [];
  for (const p of parts) {
    const steps = Math.round((p.break ?? p.minutes) * 6); // 10s rows
    for (let i = 0; i < steps; i++) {
      if (p.break) { rows.push({ break: true }); continue; }
      rows.push({ task: p.task, state: pickState(p.focus, hashRand(rows.length, p.task.length)) });
    }
  }
  return rows;
}

/* The featured session: 1h 58m. Writing, a lapse, Research, a real break,
   more Writing, then Email where attention frays. */
export const HERO_SESSION = buildSession([
  { task: 'Writing', minutes: 38, focus: 0.93 },
  { task: 'Writing', minutes: 9, focus: 0.35 },
  { task: 'Research', minutes: 24, focus: 0.84 },
  { break: 9.5 },
  { task: 'Writing', minutes: 27, focus: 0.9 },
  { task: 'Email', minutes: 10, focus: 0.3 },
]);

/* "Last hour" card = the final 60 minutes of the same session, exactly how
   the app slices it. */
export const LAST_HOUR_SESSION = HERO_SESSION.slice(-360);

/* ---------------------------------------------------------------------------
   Statistics, ported from the app's analysis.ts semantics.
--------------------------------------------------------------------------- */

export function sessionStats(rows) {
  const active = rows.filter((r) => !r.break);
  const focused = active.filter((r) => r.state === 'focused').length;
  const breakRows = rows.filter((r) => r.break).length;
  // lapse episodes: runs of non-focused activity between focused stretches
  let lapses = 0, inTrance = false;
  const streaks = [];
  let cur = 0;
  for (const r of active) {
    if (r.state === 'focused') { inTrance = false; cur++; }
    else {
      if (!inTrance) { lapses++; inTrance = true; }
      if (cur > 0) streaks.push(cur);
      cur = 0;
    }
  }
  if (cur > 0) streaks.push(cur);
  const avgStreakRows = streaks.length ? streaks.reduce((a, b) => a + b, 0) / streaks.length : 0;
  return {
    efficiency: active.length ? Math.round((focused / active.length) * 100) : 0,
    breakPct: rows.length ? Math.round((breakRows / rows.length) * 100) : 0,
    breakMs: breakRows * 10000,
    totalMs: rows.length * 10000,
    samples: rows.length,
    lapses,
    avgStreakSec: Math.round(avgStreakRows * 10),
  };
}

/* Per-task stats for one session (app's subjectStats). */
export function subjectStats(rows) {
  const total = rows.filter((r) => !r.break).length || 1;
  const map = new Map();
  for (const r of rows) {
    if (r.break) continue;
    const label = r.task || 'No Task';
    const e = map.get(label) || { label, rows: 0, focused: 0 };
    e.rows++;
    if (r.state === 'focused') e.focused++;
    map.set(label, e);
  }
  return [...map.values()]
    .map((e) => ({
      label: e.label,
      timeMs: e.rows * 10000,
      sharePct: Math.round((e.rows / total) * 100),
      focusPct: Math.round((e.focused / e.rows) * 100),
    }))
    .sort((a, b) => b.timeMs - a.timeMs);
}

/* Rule-based observations, phrased the way the app's generateLiveInsights does. */
export function buildObservations(subjects) {
  if (!subjects.length) return [];
  const byEff = [...subjects].sort((a, b) => b.focusPct - a.focusPct);
  const byTime = [...subjects].sort((a, b) => b.timeMs - a.timeMs);
  const best = byEff[0];
  const worst = byEff[byEff.length - 1];
  const lead = byTime[0];
  const obs = [];
  if (subjects.length > 1) {
    obs.push(`You focus best on ${best.label} and lapses most during ${worst.label}.`);
  }
  obs.push(`"${lead.label}" leads with ${fmtMs(lead.timeMs)}, ${lead.sharePct}% of the session.`);
  obs.push('You tend to lapses shortly after switching tasks. Give yourself a moment to settle in.');
  return obs;
}

/* ---------------------------------------------------------------------------
   Trends: 30 stored sessions (local, like the app) + expandable details.
--------------------------------------------------------------------------- */

export const TREND_SESSIONS = (() => {
  const names = ['Writing', 'Coding', 'Research', 'Study', 'Email + admin', 'Reading'];
  const out = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 30; i++) {
    const base = 58 + i * 0.9 + Math.sin(i * 0.9) * 9 + (rnd() - 0.5) * 12;
    const pct = Math.max(38, Math.min(94, Math.round(base)));
    const dur = Math.round(35 + rnd() * 95); // minutes
    const lapses = Math.max(1, Math.round((100 - pct) / 9 + rnd() * 3));
    const streak = Math.round(8 + (pct - 40) / 3 + rnd() * 6);
    const day = 18 - Math.floor((29 - i) / 1.4);
    out.push({ id: i, name: names[i % names.length], date: `Sep ${Math.max(1, day)}`, pct, dur, lapses, streak });
  }
  return out;
})();

/* Task mixes per stored session name; `focus` mirrors the session's pct so
   the expandable detail matches the trend line. */
const TREND_MIXES = {
  'Writing': [['Writing', 1]],
  'Coding': [['Coding', 1]],
  'Research': [['Research', 0.6], ['Coding', 0.4]],
  'Study': [['Study', 1]],
  'Email + admin': [['Email', 0.7], ['Admin', 0.3]],
  'Reading': [['Reading', 1]],
};

export function trendSessionRows(i) {
  const s = TREND_SESSIONS[i];
  const mix = TREND_MIXES[s.name] || [['Writing', 1]];
  const p = s.pct / 100;
  const parts = mix.map(([task, share], idx) => ({
    task,
    minutes: Math.max(4, Math.round(s.dur * (idx === mix.length - 1 ? 1 : share))),
    focus: Math.max(0.08, Math.min(0.97, p + (idx === 0 ? 0.04 : -0.1))),
  }));
  // a rough patch mid-session when the session lapsed often
  if (s.lapses >= 3 && parts.length) {
    parts.splice(1, 0, { task: parts[0].task, minutes: Math.max(3, Math.round(s.dur * 0.08)), focus: 0.14 });
  }
  return buildSession(parts);
}

/* Task mastery across all stored sessions (aggregate view in Trends). */
export const TASK_MASTERY = [
  { label: 'Coding', focusPct: 87, sharePct: 34 },
  { label: 'Writing', focusPct: 74, sharePct: 24 },
  { label: 'Research', focusPct: 68, sharePct: 21 },
  { label: 'Study', focusPct: 71, sharePct: 12 },
  { label: 'Email', focusPct: 44, sharePct: 9 },
];

/* Efficiency by hour of day, shown for waking hours. */
export const HOURS = [
  { h: '6a', v: null }, { h: '7a', v: 62 }, { h: '8a', v: 74 }, { h: '9a', v: 83 },
  { h: '10a', v: 88 }, { h: '11a', v: 81 }, { h: '12p', v: 54 }, { h: '1p', v: 58 },
  { h: '2p', v: 72 }, { h: '3p', v: 77 }, { h: '4p', v: 69 }, { h: '5p', v: 61 },
  { h: '6p', v: 70 }, { h: '7p', v: 79 }, { h: '8p', v: 84 }, { h: '9p', v: 66 },
];

/* ---------------------------------------------------------------------------
   Task-colors section: one named session split into named stretches. Colors
   are assigned exactly as the app assigns them (first-seen order).
--------------------------------------------------------------------------- */
export const COLOR_SESSION = [
  { task: 'Reading', minutes: 14 },
  { task: 'Writing', minutes: 26 },
  { task: 'Research', minutes: 18 },
  { task: 'Writing', minutes: 12 },
  { task: 'Email', minutes: 9 },
];
