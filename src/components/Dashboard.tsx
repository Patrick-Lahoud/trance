import { useState, useEffect, useMemo, useRef } from 'react';
import type { ThemeMode } from '../App';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import { WindowData, SessionData } from '../types';
import {
  computeRangeStats,
  sliceByMs,
  subjectStats,
  computeTrends,
  rowFromWindows,
  formatMs,
  WINDOW_MS,
  RangeStats,
  buildSegments,
  buildGradientStops,
} from '../ml/analysis';
import { SlideToConfirm } from './SlideToConfirm';
import styles from './Dashboard.module.css';

// Distinct colors for different subjects/tasks
const SUBJECT_COLORS = [
  '#4A9EFF', '#FF6BB5', '#FFB86B', '#6BFFB2',
  '#9B8AFF', '#FF6B6B', '#6BFFEF', '#FFD76B',
];
const BREAK_COLOR = '#555555';

function getSubjectColor(label: string, allLabels: string[]): string {
  const idx = allLabels.indexOf(label);
  return SUBJECT_COLORS[idx >= 0 ? idx % SUBJECT_COLORS.length : 0];
}

interface Props {
  windows: WindowData[];
  sessions: SessionData[];
  currentSubject: string;
  onLoadHistory: () => void;
  onBack: () => void;
  themeMode: ThemeMode;
  reduceMotion: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
  onReduceMotionChange: (enabled: boolean) => void;
  onResetPreferences: () => void;
  onReplayTutorial: () => void;
  onResetAllData: () => void;
}

type Tab = 'timeline' | 'insights' | 'trends';

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  fontSize: '12px',
  color: 'var(--text-primary)',
};

function stateValue(w: WindowData): number | null {
  if (w.isBreak) return null;
  switch (w.state) {
    case 'focused': return 1;
    case 'restless': return 0.6;
    case 'idle': return 0.3;
    default: return 0.15;
  }
}

function useBreakRegions(data: { index: number; isBreak: boolean }[]): { start: number; end: number }[] {
  return useMemo(() => {
    const regions: { start: number; end: number }[] = [];
    let inBreak = false;
    let start = 0;
    for (const d of data) {
      if (d.isBreak && !inBreak) {
        inBreak = true;
        start = d.index;
      } else if (!d.isBreak && inBreak) {
        inBreak = false;
        regions.push({ start, end: d.index });
      }
    }
    if (inBreak && data.length > 0) {
      regions.push({ start, end: data[data.length - 1].index });
    }
    return regions;
  }, [data]);
}

function useTaskTransitions(data: { index: number; taskLabel: string }[]): number[] {
  return useMemo(() => {
    const t: number[] = [];
    let prev = '';
    for (const d of data) {
      if (d.taskLabel !== prev && prev !== '') t.push(d.index);
      prev = d.taskLabel;
    }
    return t;
  }, [data]);
}

function formatSessionTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// One labeled timeline card: chart + its own efficiency/subject/break stats
function RangeCard({ stats, gradId }: { stats: RangeStats; gradId?: string }) {
  const data = useMemo(() => {
    let prev: number | null = null;
    return stats.windows.map((w, i) => {
      // During a break the line flatlines (carries the last level) in gray so
      // it connects seamlessly through the break block instead of gaping.
      const value = w.isBreak ? prev ?? 0.5 : stateValue(w);
      if (!w.isBreak) prev = value;
      return {
        index: i,
        value,
        isBreak: w.isBreak,
        taskLabel: w.isBreak ? 'Break' : w.taskLabel || 'No Task',
      };
    });
  }, [stats.windows]);
  const allLabels = useMemo(() => {
    const seen: string[] = [];
    for (const w of stats.windows) {
      const label = w.taskLabel || 'No Task';
      if (!seen.includes(label)) seen.push(label);
    }
    return seen;
  }, [stats.windows]);
  const segColor = (label: string) =>
    label === 'Break'
      ? BREAK_COLOR
      : label === 'No Task'
      ? 'var(--text-primary)'
      : getSubjectColor(label, allLabels);
  const segments = useMemo(() => buildSegments(data), [data]);
  const gradKey = gradId || stats.label.replace(/[^a-z0-9]/gi, '');
  const gradientStops = useMemo(
    () => buildGradientStops(segments, segColor),
    [segments]
  );
  const legendItems = useMemo(() => {
    const seen = new Set<string>();
    const items: { label: string; color: string }[] = [];
    for (const seg of segments) {
      if (!seen.has(seg.label)) {
        seen.add(seg.label);
        items.push({ label: seg.label, color: segColor(seg.label) });
      }
    }
    return items;
  }, [segments]);
  const breakRegions = useBreakRegions(data);
  const taskTransitions = useTaskTransitions(data);
  return (
    <div className={styles.chartContainer}>
      <div className={styles.rangeHeader}>
        <h2 className={styles.rangeTitle}>{stats.label}</h2>
        <span className={styles.rangeMeta}>
          {stats.windows.length} samples · {formatMs(stats.totalMs)}
        </span>
      </div>

      <div className={styles.rangeStats}>
        <div className={styles.rangeStat}>
          <span className={styles.rangeStatValue}>{stats.efficiencyPct}%</span>
          <span className={styles.rangeStatLabel}>Efficiency</span>
        </div>
        <div className={styles.rangeStat}>
          <span className={styles.rangeStatValue}>{stats.breakPct}%</span>
          <span className={styles.rangeStatLabel}>Break</span>
        </div>
        <div className={styles.rangeStat}>
          <span className={styles.rangeStatValue}>{formatMs(stats.breakMs)}</span>
          <span className={styles.rangeStatLabel}>Break time</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={110}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`line-${gradKey}`} x1="0" y1="0" x2="1" y2="0">
              {gradientStops.map((s, i) => (
                <stop key={i} offset={`${(s.offset * 100).toFixed(2)}%`} stopColor={s.color} />
              ))}
            </linearGradient>
            <linearGradient id={`fill-${gradKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--text-primary)" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#FFFFFF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="index" hide />
          <YAxis
            domain={[0, 1]}
            padding={{ top: 14, bottom: 8 }}
            tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            tickFormatter={() => ''}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number, _name: string, props: any) => {
              if (props?.payload?.isBreak) return ['Break', ''];
              const state = props?.payload?.taskLabel ? '—' : '';
              return [state, ''];
            }}
          />
          {breakRegions.map((r, i) => (
            <ReferenceArea
              key={`brk-${i}`}
              x1={r.start}
              x2={r.end}
              fill={BREAK_COLOR}
              fillOpacity={0.15}
              stroke={BREAK_COLOR}
              strokeOpacity={0.3}
            />
          ))}
          {taskTransitions.map((t, i) => (
            <ReferenceLine
              key={`task-${i}`}
              x={t}
              stroke="#555"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          ))}
          <Area
            type="monotone"
            dataKey="value"
            stroke={`url(#line-${gradKey})`}
            strokeWidth={2}
            fill={`url(#fill-${gradKey})`}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className={styles.taskLegend}>
        {legendItems.map((item) => (
          <div key={item.label} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: item.color }} />
            <span className={styles.legendLabel}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// The full detail of one session — mini timeline, stats, task breakdown.
// Used both inside the expandable All Sessions rows and as the post-end
// session summary.
function SessionDetail({
  session,
  allLabels,
  name,
}: {
  session: SessionData;
  allLabels: string[];
  name: string;
}) {
  const stats = useMemo(() => computeRangeStats(session.windows, 'No Task'), [session.windows]);
  const row = useMemo(() => rowFromWindows(session.windows), [session.windows]);
  const tasks = useMemo(() => subjectStats(session.windows), [session.windows]);

  return (
    <div className={styles.sessionDetail}>
      <RangeCard
        stats={{ ...stats, label: `${name} · ${formatMs(row.durationMs)}` }}
        gradId={`session-${session.id}`}
      />
      <div className={styles.sessionStatsGrid}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{row.driftCount}</div>
          <div className={styles.statLabel}>Lapses</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{row.avgStreak}s</div>
          <div className={styles.statLabel}>Avg focus streak</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{stats.breakMs > 0 ? stats.breakPct + '%' : '—'}</div>
          <div className={styles.statLabel}>Break time</div>
        </div>
      </div>
      {tasks.length > 0 && (
        <div className={styles.subjectTable}>
          {tasks.map((t) => (
            <div key={t.label} className={styles.subjectRow}>
              <span
                className={styles.legendDot}
                style={{ background: getSubjectColor(t.label, allLabels) }}
              />
              <span className={styles.subjectName}>{t.label}</span>
              <span className={styles.subjectTime}>{formatMs(t.timeMs)}</span>
              <span className={styles.subjectShare}>{t.sharePct}% of session</span>
              <span className={styles.subjectFocus}>{t.focusPct}% efficiency</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One expandable session in the All Sessions list — click the row to open
// the full detail (mini timeline, stats, task breakdown)
function SessionListItem({
  session,
  allLabels,
  name,
  onRename,
  onRequestDelete,
}: {
  session: SessionData;
  allLabels: string[];
  name: string;
  onRename: (id: string, name: string) => void;
  onRequestDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const isLive = session.id === 'live';
  const row = useMemo(() => rowFromWindows(session.windows), [session.windows]);
  const color = row.focusPct >= 70 ? '#6BFFB2' : row.focusPct >= 50 ? '#FFD76B' : '#FF6B6B';

  const saveRename = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(session.id, trimmed);
  };

  return (
    <div className={styles.sessionItem}>
      <div
        className={styles.sessionRow}
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <span className={styles.sessionDot} style={{ background: color }} />
        {editing ? (
          <input
            className={styles.sessionNameInput}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') saveRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={saveRename}
          />
        ) : (
          <div className={styles.sessionNameWrap}>
            <span className={styles.sessionName}>{name}</span>
            <span
              className={styles.sessionRenameBtn}
              title="Rename session"
              onClick={(e) => {
                e.stopPropagation();
                setDraft(name);
                setEditing(true);
              }}
            >
              ✎
            </span>
          </div>
        )}
        {isLive && <span className={styles.sessionLive}>live</span>}
        <span className={styles.sessionMeta}>
          {formatMs(row.durationMs)} · {row.focusPct}% efficiency
        </span>
        {!isLive && onRequestDelete && (
          <span
            className={styles.sessionDeleteBtn}
            title="Delete session"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onRequestDelete();
              }
            }}
          >
            x
          </span>
        )}
        <span className={`${styles.sessionChevron} ${expanded ? styles.sessionChevronOpen : ''}`}>
          ▾
        </span>
      </div>
      {expanded && <SessionDetail session={session} allLabels={allLabels} name={name} />}
    </div>
  );
}

export function Dashboard({
  windows,
  sessions,
  currentSubject,
  onLoadHistory,
  onBack,
  themeMode,
  reduceMotion,
  onThemeModeChange,
  onReduceMotionChange,
  onResetPreferences,
  onReplayTutorial,
  onResetAllData,
}: Props) {
  const getInitialTab = (): Tab => {
    const m = window.location.hash.match(/[?&]tab=(\w+)/);
    return m && (m[1] === 'insights' || m[1] === 'trends') ? (m[1] as Tab) : 'timeline';
  };
  const [activeTab, setActiveTab] = useState<Tab>(getInitialTab);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  // Summary mode — opened right after ending a session, shows that session's detail
  const [mode] = useState<'normal' | 'summary'>(() => {
    const m = window.location.hash.match(/[?&]tab=(\w+)/);
    return m?.[1] === 'summary' ? 'summary' : 'normal';
  });
  // Session renames — local overrides win immediately; persisted in Electron
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  // Deletes — removed from view instantly; persisted in Electron
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<SessionData | null>(null);
  const [resetAllConfirm, setResetAllConfirm] = useState(false);
  const visibleSessions = useMemo(
    () => sessions.filter((s) => !deletedIds.has(s.id)),
    [sessions, deletedIds]
  );

  useEffect(() => {
    onLoadHistory();
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [settingsOpen]);

  // Electron: the main process can ask this window to switch tabs (e.g. end-session → Trends)
  useEffect(() => {
    const trance = (window as any).trance;
    if (trance?.onDashboardTab) {
      trance.onDashboardTab((tab: string) => {
        if (tab === 'timeline' || tab === 'insights' || tab === 'trends') setActiveTab(tab);
      });
    }
  }, []);

  const renameSession = (id: string, name: string) => {
    setSessionNames((prev) => ({ ...prev, [id]: name }));
    const trance = (window as any).trance;
    if (trance?.renameSession && id !== 'live') {
      trance.renameSession(id, name);
    }
  };

  const confirmDeleteSession = (s: SessionData) => {
    setDeletedIds((prev) => {
      const n = new Set(prev);
      n.add(s.id);
      return n;
    });
    setDeleteTarget(null);
    const trance = (window as any).trance;
    if (trance?.deleteSession && s.id !== 'live') {
      trance.deleteSession(s.id);
    }
  };

  const sessionDisplayName = (s: SessionData) =>
    sessionNames[s.id] || s.name || (s.id === 'live' ? 'Live session' : formatSessionTime(s.startTime));

  const uniqueLabels = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const w of windows) {
      const label = w.taskLabel || 'No Task';
      if (!seen.has(label)) {
        seen.add(label);
        result.push(label);
      }
    }
    if (!seen.has(currentSubject)) result.push(currentSubject);
    return result;
  }, [windows, currentSubject]);

  // ---- Timeline: Total, then 5-min / 1-hour once enough time has elapsed ----
  const ranges = useMemo(() => {
    const list: { label: string; windows: WindowData[] }[] = [
      { label: 'Total timeline', windows },
    ];
    if (windows.length >= 5 * 60) {
      list.push({ label: 'Last 5 minutes', windows: sliceByMs(windows, 5 * 60 * 1000) });
    }
    if (windows.length >= 60 * 60) {
      list.push({ label: 'Last hour', windows: sliceByMs(windows, 60 * 60 * 1000) });
    }
    return list.map((r) => ({ ...r, stats: computeRangeStats(r.windows, currentSubject) }));
  }, [windows, currentSubject]);

  // ---- Insights (live, no session end required) ----
  const perSubject = useMemo(() => subjectStats(windows), [windows]);
  const perSubjectChart = useMemo(
    () => perSubject.map((s) => ({ ...s, timeSec: Math.round(s.timeMs / 1000) })),
    [perSubject]
  );
  const subjectColorMap = useMemo(
    () =>
      Object.fromEntries(
        perSubject.map((s) => [s.label, getSubjectColor(s.label, uniqueLabels)])
      ),
    [perSubject, uniqueLabels]
  );

  // ---- Trends (live session + stored history) ----
  const trends = useMemo(() => computeTrends(visibleSessions), [visibleSessions]);
  const trendData = useMemo(
    () =>
      trends.rows.map((r, i) => ({
        index: i,
        date: r.date,
        focusPct: r.focusPct,
        moving: trends.movingAvg[i],
        driftCount: r.driftCount,
        avgStreak: r.avgStreak,
        durationMin: Math.round(r.durationMs / 60000),
      })),
    [trends]
  );

  // Summary mode — the just-ended session's detail, opened from the end-session slider
  if (mode === 'summary') {
    const summarySession = [...sessions]
      .filter((s) => s.windows.length > 0)
      .sort((a, b) => b.startTime - a.startTime)[0];
    return (
      <div className={styles.dashboard}>
        <header className={styles.header}>
          <div className={styles.headerRow}>
            <button className={styles.backButton} onClick={onBack}>
              ← Back
            </button>
            <h1 className={styles.title}>Session Summary</h1>
          </div>
        </header>
        <div className={styles.content}>
          {summarySession ? (
            <SessionDetail
              session={summarySession}
              allLabels={uniqueLabels}
              name={sessionDisplayName(summarySession)}
            />
          ) : (
            <div className={styles.emptyState}>
              <p>Loading your session…</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <button className={styles.backButton} onClick={onBack}>
            ← Back
          </button>
          <h1 className={styles.title}>Trance Analysis</h1>
          <div className={styles.headerActions} ref={settingsRef}>
            <button
              className={styles.settingsButton}
              aria-label="Open settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              Settings
            </button>
            {settingsOpen && (
              <div className={styles.settingsPanel} role="dialog" aria-label="Settings">
                <div className={styles.settingsTitle}>Settings</div>

                <div className={styles.settingsSection}>
                  <div className={styles.settingsSectionLabel}>Lighting</div>
                  <div className={styles.themeOptions} role="radiogroup" aria-label="Lighting mode">
                    {([
                      { value: 'auto' as ThemeMode, label: 'Auto', detail: 'Follow your system preference' },
                      { value: 'dark' as ThemeMode, label: 'Dark', detail: 'Always use dark mode' },
                      { value: 'light' as ThemeMode, label: 'Light', detail: 'Always use light mode' },
                    ]).map((option) => (
                      <button
                        key={option.value}
                        className={`${styles.themeOption} ${themeMode === option.value ? styles.themeOptionActive : ''}`}
                        role="radio"
                        aria-checked={themeMode === option.value}
                        onClick={() => onThemeModeChange(option.value)}
                      >
                        <span className={styles.themeRadio} />
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.detail}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.settingsSection}>
                  <div className={styles.settingsSectionLabel}>Preferences</div>
                  <div className={styles.settingRow}>
                    <span>
                      <strong>Reduce motion</strong>
                      <small>Use calmer transitions and animations</small>
                    </span>
                    <button
                      className={`${styles.toggle} ${reduceMotion ? styles.toggleOn : ''}`}
                      role="switch"
                      aria-checked={reduceMotion}
                      aria-label="Reduce motion"
                      onClick={() => onReduceMotionChange(!reduceMotion)}
                    >
                      <span />
                    </button>
                  </div>
                </div>

                <div className={styles.settingsNote}>
                  Session data is stored locally on this device.
                </div>
                <a
                  className={styles.privacyLink}
                  href="/privacy-policy.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Privacy Policy
                </a>
                <button
                  className={styles.resetSettingsButton}
                  onClick={() => {
                    onResetPreferences();
                    setSettingsOpen(false);
                  }}
                >
                  Reset preferences
                </button>
                <div className={styles.settingsDangerZone}>
                  <button
                    className={styles.resetAllDataButton}
                    onClick={() => {
                      setSettingsOpen(false);
                      setResetAllConfirm(true);
                    }}
                  >
                    Complete reset
                  </button>
                  <p className={styles.resetAllDataNote}>
                    Deletes all sessions and training data. After a reinstall,
                    the tutorial will play again.
                  </p>
                </div>
                <button
                  className={styles.replayTutorialButton}
                  onClick={() => {
                    setSettingsOpen(false);
                    onReplayTutorial();
                  }}
                >
                  Replay tutorial
                </button>
              </div>
            )}
          </div>
        </div>
        <nav className={styles.tabBar}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'timeline' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            Timeline
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'insights' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('insights')}
          >
            Insights
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'trends' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('trends')}
          >
            Trends
          </button>
        </nav>
      </header>

      {/* ---------------- TIMELINE ---------------- */}
      {activeTab === 'timeline' && (
        <div className={styles.content}>
          {ranges.map((r) => (
            <RangeCard
              key={r.label}
              stats={{ ...r.stats, label: r.label }}
            />
          ))}
          {windows.length === 0 && (
            <div className={styles.emptyState}>
              <p>No tracking data yet.</p>
              <p className={styles.emptyHint}>
                Keep working — the timelines update live every second.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------------- INSIGHTS ---------------- */}
      {activeTab === 'insights' && (
        <div className={styles.content}>
          {perSubject.length > 0 && (
            <div className={styles.chartContainer}>
              <h2 className={styles.chartTitle}>Tasks</h2>
              <div className={styles.subjectTable}>
                {perSubject.map((s) => (
                  <div key={s.label} className={styles.subjectRow}>
                    <span className={styles.legendDot} style={{ background: subjectColorMap[s.label] }} />
                    <span className={styles.subjectName}>{s.label}</span>
                    <span className={styles.subjectTime}>{formatMs(s.timeMs)}</span>
                    <span className={styles.subjectShare}>{s.sharePct}% of session</span>
                    <span className={styles.subjectFocus}>{s.focusPct}% efficiency</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {perSubject.length > 0 && (
            <>
              <div className={styles.chartContainer}>
                <h2 className={styles.chartTitle}>Task time comparison</h2>
                <ResponsiveContainer width="100%" height={Math.max(130, perSubject.length * 46)}>
                  <BarChart data={perSubjectChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      type="number"
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickFormatter={(v: number) => formatMs(v * 1000)}
                    />
                    <YAxis
                      dataKey="label"
                      type="category"
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      width={110}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number, _name: string, props: any) => [
                        `${formatMs(value * 1000)} · ${props?.payload?.sharePct}% of session`,
                        props?.payload?.label,
                      ]}
                    />
                    <Bar dataKey="timeSec" name="Time" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                      {perSubject.map((s) => (
                        <Cell key={s.label} fill={subjectColorMap[s.label] || '#FFFFFF'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.chartContainer}>
                <h2 className={styles.chartTitle}>Task efficiency comparison</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={perSubject}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number, _name: string, props: any) => [
                        `${value}% efficiency · ${formatMs(props?.payload?.timeMs)}`,
                        props?.payload?.label,
                      ]}
                    />
                    <Bar dataKey="focusPct" name="Efficiency" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                      {perSubject.map((s) => (
                        <Cell key={s.label} fill={subjectColorMap[s.label] || '#FFFFFF'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

        </div>
      )}

      {/* ---------------- TRENDS ---------------- */}
      {activeTab === 'trends' && (
        <div className={styles.content}>
          {trends.rows.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No sessions tracked yet.</p>
              <p className={styles.emptyHint}>
                Your current session counts — keep working and trends appear live.
              </p>
            </div>
          ) : (
            <>
              <div className={styles.trendSummary}>
                <div className={styles.stat}>
                  <div className={styles.statValue}>{trends.rows.length}</div>
                  <div className={styles.statLabel}>Sessions</div>
                </div>
                <div className={styles.stat}>
                  <div className={styles.statValue}>{formatMs(trends.totalTrackedMs)}</div>
                  <div className={styles.statLabel}>Total tracked</div>
                </div>
                <div className={styles.stat}>
                  <div className={styles.statValue}>
                    {trends.best ? `${trends.best.focusPct}%` : '—'}
                  </div>
                  <div className={styles.statLabel}>Best session</div>
                </div>
                <div className={styles.stat}>
                  <div className={styles.statValue}>
                    {trends.direction === 'up'
                      ? '▲'
                      : trends.direction === 'down'
                      ? '▼'
                      : trends.direction === 'flat'
                      ? '→'
                      : '…'}
                  </div>
                  <div className={styles.statLabel}>
                    {trends.direction === 'up'
                      ? 'Improving'
                      : trends.direction === 'down'
                      ? 'Slipping'
                      : trends.direction === 'flat'
                      ? 'Steady'
                      : 'Needs more sessions'}
                  </div>
                </div>
              </div>

              <div className={styles.chartContainer}>
                <h2 className={styles.chartTitle}>Efficiency Across Sessions</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: any, name: any) =>
                        value === null || value === undefined ? ['—', name] : [`${value}%`, name]
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="focusPct"
                      stroke="var(--text-primary)"
                      strokeWidth={2}
                      dot={{ fill: '#FFFFFF', r: 3 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="moving"
                      stroke="#4A9EFF"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.trendRow}>
                <div className={styles.chartContainer}>
                  <h2 className={styles.chartTitle}>Lapses</h2>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="driftCount" fill="#FF6B6B" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className={styles.chartContainer}>
                  <h2 className={styles.chartTitle}>Avg Focus Streak (s)</h2>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: number) => [`${value}s`, 'Streak']}
                      />
                      <Bar dataKey="avgStreak" fill="#6BFFB2" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={styles.chartContainer}>
                <h2 className={styles.chartTitle}>Session Duration (min)</h2>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number) => [`${value} min`, 'Duration']}
                    />
                    <Bar dataKey="durationMin" fill="#9B8AFF" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {trends.hourOfDay.length > 0 && (
                <div className={styles.chartContainer}>
                  <h2 className={styles.chartTitle}>Efficiency by Hour of Day</h2>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={trends.hourOfDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="hour"
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: number) => [`${value}% focused`, 'Efficiency']}
                      />
                      <Bar dataKey="focusPct" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        {trends.hourOfDay.map((h) => (
                          <Cell
                            key={h.hour}
                            fill={h.focusPct >= 70 ? '#6BFFB2' : h.focusPct >= 50 ? '#FFD76B' : '#FF6B6B'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {trends.subjectAgg.length > 0 && (
                <div className={styles.chartContainer}>
                  <h2 className={styles.chartTitle}>Task Mastery Across All Sessions</h2>
                  <div className={styles.subjectTable}>
                    {trends.subjectAgg.map((s) => (
                      <div key={s.label} className={styles.subjectRow}>
                        <span
                          className={styles.legendDot}
                          style={{ background: getSubjectColor(s.label, trends.subjectAgg.map((x) => x.label)) }}
                        />
                        <span className={styles.subjectName}>{s.label}</span>
                        <span className={styles.subjectTime}>{formatMs(s.timeMs)}</span>
                        <span className={styles.subjectShare}>{s.sharePct}% of time</span>
                        <span className={styles.subjectFocus}>{s.focusPct}% efficiency</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All sessions — expandable list at the bottom */}
              <div className={styles.chartContainer}>
                <h2 className={styles.chartTitle}>All Sessions</h2>
                <div className={styles.sessionList}>
                  {[...visibleSessions]
                    .filter((s) => s.windows.length > 0)
                    .sort((a, b) => b.startTime - a.startTime)
                    .map((s) => (
                      <SessionListItem
                        key={s.id}
                        session={s}
                        allLabels={uniqueLabels}
                        name={sessionDisplayName(s)}
                        onRename={renameSession}
                        onRequestDelete={s.id === 'live' ? undefined : () => setDeleteTarget(s)}
                      />
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Slide-to-confirm delete modal */}
      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>Delete session?</div>
            <div className={styles.modalSub}>
              {sessionDisplayName(deleteTarget) === formatSessionTime(deleteTarget.startTime)
                ? sessionDisplayName(deleteTarget)
                : `${sessionDisplayName(deleteTarget)} · ${formatSessionTime(deleteTarget.startTime)}`}
            </div>
            <SlideToConfirm
              label="slide to delete"
              onConfirm={() => confirmDeleteSession(deleteTarget)}
            />
            <button className={styles.modalCancelBtn} onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Slide-to-confirm complete reset modal */}
      {resetAllConfirm && (
        <div className={styles.modalOverlay} onClick={() => setResetAllConfirm(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>Complete reset?</div>
            <div className={styles.modalSub}>
              Delete all sessions and tracking data. After a reinstall, the tutorial will play again.
            </div>
            <SlideToConfirm
              label="slide to reset"
              onConfirm={() => {
                setResetAllConfirm(false);
                onResetAllData();
              }}
            />
            <button className={styles.modalCancelBtn} onClick={() => setResetAllConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
