import { WindowData, SessionData, DebriefInsight } from '../types';

export const WINDOW_MS = 1000;

export function formatMs(ms: number): string {
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

export interface RangeStats {
  label: string;
  windows: WindowData[];
  totalMs: number;
  focusedMs: number;
  idleMs: number;
  breakMs: number;
  subjectMs: number;
  efficiencyPct: number;
  subjectPct: number;
  breakPct: number;
}

export function sliceByMs(windows: WindowData[], ms: number): WindowData[] {
  if (windows.length === 0) return [];
  const cutoff = windows[windows.length - 1].timestamp - ms;
  return windows.filter((w) => w.timestamp >= cutoff);
}

export function computeRangeStats(windows: WindowData[], subject: string): RangeStats {
  const total = windows.length;
  const nonBreak = windows.filter((w) => !w.isBreak);
  const focused = nonBreak.filter((w) => w.state === 'focused').length;
  const breaks = windows.filter((w) => w.isBreak).length;
  const subjectWindows = windows.filter((w) => (w.taskLabel || 'No Task') === subject).length;

  return {
    label: '',
    windows,
    totalMs: total * WINDOW_MS,
    focusedMs: focused * WINDOW_MS,
    idleMs: (nonBreak.length - focused) * WINDOW_MS,
    breakMs: breaks * WINDOW_MS,
    subjectMs: subjectWindows * WINDOW_MS,
    efficiencyPct: nonBreak.length > 0 ? Math.round((focused / nonBreak.length) * 100) : 100,
    subjectPct: total > 0 ? Math.round((subjectWindows / total) * 100) : 0,
    breakPct: total > 0 ? Math.round((breaks / total) * 100) : 0,
  };
}

export interface SubjectStat {
  label: string;
  windows: number;
  timeMs: number;
  focusPct: number;
  sharePct: number;
}

export function subjectStats(windows: WindowData[]): SubjectStat[] {
  const map = new Map<string, { focused: number; total: number }>();
  let current = 'No Task';
  for (const w of windows) {
    if (w.taskLabel) current = w.taskLabel;
    if (w.isBreak) continue;
    const entry = map.get(current) || { focused: 0, total: 0 };
    entry.total++;
    if (w.state === 'focused') entry.focused++;
    map.set(current, entry);
  }
  const totalAll = Array.from(map.values()).reduce((a, e) => a + e.total, 0);
  return Array.from(map.entries()).map(([label, e]) => ({
    label,
    windows: e.total,
    timeMs: e.total * WINDOW_MS,
    focusPct: e.total > 0 ? Math.round((e.focused / e.total) * 100) : 0,
    sharePct: totalAll > 0 ? Math.round((e.total / totalAll) * 100) : 0,
  }));
}

// ---------------------------------------------------------------------------
// Live insights — computed from current windows, no session end required
// ---------------------------------------------------------------------------

export function generateLiveInsights(windows: WindowData[], subject: string): DebriefInsight[] {
  const insights: DebriefInsight[] = [];
  const subjects = subjectStats(windows);
  const nonBreak = windows.filter((w) => !w.isBreak);
  if (nonBreak.length === 0 || subjects.length === 0) {
    insights.push({
      text: 'No tracking data yet — keep working and your task insights will appear live.',
      type: 'stat',
    });
    return insights;
  }

  const sorted = [...subjects].sort((x, y) => y.focusPct - x.focusPct);
  const byTime = [...subjects].sort((x, y) => y.timeMs - x.timeMs);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const mostTime = byTime[0];
  const current = subjects.find((s) => s.label === subject);

  // 1) Overall subject picture
  if (subjects.length === 1) {
    insights.push({
      text: `You've spent all your time on "${subjects[0].label}" — ${formatMs(subjects[0].timeMs)}, ${subjects[0].sharePct}% of the session, ${subjects[0].focusPct}% efficiency.`,
      type: 'stat',
    });
  } else {
    insights.push({
      text: `${subjects.length} tasks tracked — "${mostTime.label}" leads with ${formatMs(mostTime.timeMs)} (${mostTime.sharePct}% of your time).`,
      type: 'stat',
    });
  }

  // 2) Best vs worst subject
  if (subjects.length >= 2) {
    insights.push({
      text: `You focus best on "${best.label}" (${best.focusPct}%) and weakest on "${worst.label}" (${worst.focusPct}%).`,
      type: 'pattern',
    });
  }

  // 3) Time concentration
  if (subjects.length >= 2 && mostTime.sharePct >= 70) {
    insights.push({
      text: `"${mostTime.label}" takes ${mostTime.sharePct}% of your session — splitting time across more tasks could keep things fresh.`,
      type: 'pattern',
    });
  }

  // 4) Subjects that need help
  const struggling = subjects.filter((s) => s.focusPct < 50 && s.windows >= 10);
  if (struggling.length > 0) {
    insights.push({
      text: `"${struggling.map((s) => s.label).join('", "')}" ${struggling.length === 1 ? 'has' : 'have'} low focus (under 50%). Break it into smaller chunks next session.`,
      type: 'suggestion',
    });
  }

  // 5) Strongest subject momentum
  if (best && best.focusPct >= 75 && best.windows >= 10) {
    insights.push({
      text: `Your strongest task is "${best.label}" (${best.focusPct}%) — starting with it builds momentum for the rest of the session.`,
      type: 'suggestion',
    });
  }

  // 6) Current task status
  if (current) {
    insights.push({
      text: `Current task "${current.label}" — ${current.focusPct}% efficiency over ${formatMs(current.timeMs)} (${current.sharePct}% of the session).`,
      type: 'stat',
    });
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Session rows (one row per session, for trends)
// ---------------------------------------------------------------------------

export function rowFromWindows(
  windows: WindowData[]
): { focusPct: number; driftCount: number; avgStreak: number; durationMs: number } {
  const nonBreak = windows.filter((w) => !w.isBreak);
  const focused = nonBreak.filter((w) => w.state === 'focused').length;
  const focusPct = nonBreak.length > 0 ? Math.round((focused / nonBreak.length) * 100) : 100;

  let driftCount = 0;
  let inLapse = false;
  const streaks: number[] = [];
  let cur = 0;
  for (const w of nonBreak) {
    if (w.state === 'focused') {
      inLapse = false;
      cur++;
    } else {
      if (!inLapse) {
        driftCount++;
        inLapse = true;
      }
      if (cur > 0) {
        streaks.push(cur);
        cur = 0;
      }
    }
  }
  if (cur > 0) streaks.push(cur);
  const avgStreak =
    streaks.length > 0
      ? Math.round((streaks.reduce((a, b) => a + b, 0) / streaks.length) * 10) / 10
      : 0;
  const durationMs =
    windows.length > 0
      ? Math.max(0, windows[windows.length - 1].timestamp - windows[0].timestamp) + WINDOW_MS
      : 0;
  return { focusPct, driftCount, avgStreak, durationMs };
}

// ---------------------------------------------------------------------------
// Cross-session trends (live session + stored history)
// ---------------------------------------------------------------------------

export interface TrendRow {
  id: string;
  date: string;
  startTime: number;
  durationMs: number;
  focusPct: number;
  driftCount: number;
  avgStreak: number;
}

export interface TrendStats {
  rows: TrendRow[];
  movingAvg: (number | null)[];
  best: TrendRow | null;
  direction: 'up' | 'down' | 'flat' | 'insufficient';
  totalTrackedMs: number;
  hourOfDay: { hour: string; focusPct: number }[];
  subjectAgg: SubjectStat[];
}

export function computeTrends(sessions: SessionData[]): TrendStats {
  const rows: TrendRow[] = sessions
    .filter((s) => s.windows.length > 0)
    .map((s) => {
      const r = rowFromWindows(s.windows);
      return {
        id: s.id,
        date: new Date(s.startTime).toLocaleDateString(),
        startTime: s.startTime,
        durationMs: r.durationMs,
        focusPct: r.focusPct,
        driftCount: r.driftCount,
        avgStreak: r.avgStreak,
      };
    })
    .sort((a, b) => a.startTime - b.startTime);

  const movingAvg = rows.map((_, i) => {
    if (i < 2) return null;
    const slice = rows.slice(Math.max(0, i - 2), i + 1);
    return Math.round(slice.reduce((a, r) => a + r.focusPct, 0) / slice.length);
  });

  const best = rows
    .filter((r) => r.durationMs >= 5 * 60 * 1000)
    .reduce<TrendRow | null>((b, r) => (!b || r.focusPct > b.focusPct ? r : b), null);

  let direction: TrendStats['direction'] = 'insufficient';
  if (rows.length >= 4) {
    const last = rows.slice(-3).reduce((a, r) => a + r.focusPct, 0) / 3;
    const prev = rows.slice(-6, -3).reduce((a, r) => a + r.focusPct, 0) / 3;
    const delta = last - prev;
    direction = delta > 3 ? 'up' : delta < -3 ? 'down' : 'flat';
  }

  const hourOfDay = hourOfDayEfficiency(sessions);
  const subjectAgg = subjectStats(sessions.flatMap((s) => s.windows));

  return {
    rows,
    movingAvg,
    best,
    direction,
    totalTrackedMs: rows.reduce((a, r) => a + r.durationMs, 0),
    hourOfDay,
    subjectAgg,
  };
}

function hourOfDayEfficiency(
  sessions: SessionData[]
): { hour: string; focusPct: number }[] {
  const byHour = new Map<number, { focused: number; total: number }>();
  for (const s of sessions) {
    for (const w of s.windows) {
      if (w.isBreak) continue;
      const h = new Date(w.timestamp).getHours();
      const entry = byHour.get(h) || { focused: 0, total: 0 };
      entry.total++;
      if (w.state === 'focused') entry.focused++;
      byHour.set(h, entry);
    }
  }
  return Array.from(byHour.entries())
    .filter(([, entry]) => entry.total >= 3)
    .sort((a, b) => a[0] - b[0])
    .map(([h, entry]) => ({
      hour: `${h}:00`,
      focusPct: Math.round((entry.focused / entry.total) * 100),
    }));
}

// ---------------------------------------------------------------------------
// Segmented line data — one segment per subject run so the line color can
// change at subject boundaries instead of recoloring the whole graph
// ---------------------------------------------------------------------------

export interface LineSegment {
  key: string;
  data: { index: number; value: number | null }[];
  label: string;
}

export function buildSegments(
  points: { index: number; value: number | null; taskLabel: string }[]
): LineSegment[] {
  const segments: LineSegment[] = [];
  let current: LineSegment | null = null;
  let segId = 0;
  for (const p of points) {
    if (!current || current.label !== p.taskLabel) {
      current = {
        key: `seg-${segId++}-${p.taskLabel}`,
        data: [],
        label: p.taskLabel,
      };
      segments.push(current);
    }
    current.data.push({ index: p.index, value: p.value });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Gradient stops for a single seamless line whose color changes at task
// boundaries (replaces fragile multi-line rendering)
// ---------------------------------------------------------------------------

export interface GradientStop {
  offset: number;
  color: string;
}

export function buildGradientStops(
  segments: LineSegment[],
  colorFor: (label: string) => string
): GradientStop[] {
  if (segments.length === 0) return [];
  const last = segments[segments.length - 1];
  const total = last.data.length ? last.data[last.data.length - 1].index + 1 : 0;
  if (total <= 0) return [];
  const stops: GradientStop[] = [];
  for (const seg of segments) {
    if (seg.data.length === 0) continue;
    const color = colorFor(seg.label);
    const startFrac = seg.data[0].index / total;
    const endFrac = (seg.data[seg.data.length - 1].index + 1) / total;
    stops.push({ offset: startFrac, color });
    stops.push({ offset: endFrac, color });
  }
  return stops;
}
