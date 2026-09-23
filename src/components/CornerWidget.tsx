import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { SlideToConfirm } from './SlideToConfirm';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, ReferenceArea, ReferenceDot } from 'recharts';
import { WindowData, Nudge } from '../types';
import { buildSegments, buildGradientStops } from '../ml/analysis';
import { FocusLevel } from '../App';
import styles from './CornerWidget.module.css';

const TASK_COLORS = [
  '#4A9EFF', '#FF6BB5', '#FFB86B', '#6BFFB2',
  '#9B8AFF', '#FF6B6B', '#6BFFEF', '#FFD76B',
];
const BREAK_COLOR = '#555555';

interface Props {
  windows: WindowData[];
  currentWindow: WindowData | null;
  focusPercentage: number;
  focusedMs: number;
  distractedMs: number;
  breakMs: number;
  isCalibrating: boolean;
  focusLevel: FocusLevel;
  calibrationProgress: number;
  isOnBreak: boolean;
  breakTimeLeft: number;
  nudge: Nudge | null;
  currentTask: string;
  taskStartTime: number;
  savedTasks: string[];
  onDrag: (e: React.MouseEvent) => void;
  onBreakStart: (minutes: number) => void;
  onBreakEnd: () => void;
  onTaskLabel: (label: string) => void;
  onTaskStop: () => void;
  onRemoveSavedTask: (label: string) => void;
  isSessionActive: boolean;
  onStartSession: () => void;
  onOpenDashboard: () => void;
  onEndSession: () => void;
  onEndSessionAndShowTrends: () => void;
  onQuit: () => void;
  onSetFocusMode: (on: boolean) => void;
  onWidgetHover: (on: boolean) => void;
  showTutorialWelcome?: boolean;
  onStartTutorial?: () => void;
  onSkipTutorial?: () => void;
}

type Tab = 'dashboard' | 'task' | 'break';

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min >= 60) {
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hr}h ${remMin}m`;
  }
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatBreakTime(ms: number) {
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function getTaskColor(label: string, allTasks: string[]): string {
  const idx = allTasks.indexOf(label);
  return TASK_COLORS[idx >= 0 ? idx % TASK_COLORS.length : 0];
}

export function CornerWidget({
  windows,
  currentWindow,
  focusPercentage,
  focusedMs,
  distractedMs,
  breakMs,
  isCalibrating,
  calibrationProgress,
  isOnBreak,
  breakTimeLeft,
  nudge,
  currentTask,
  taskStartTime,
  focusLevel,
  savedTasks,
  onDrag,
  onBreakStart,
  onBreakEnd,
  isSessionActive,
  onTaskLabel,
  onTaskStop,
  onRemoveSavedTask,
  onOpenDashboard,
  onStartSession,
  onEndSession,
  onEndSessionAndShowTrends,
  onQuit,
  onSetFocusMode,
  onWidgetHover,
  showTutorialWelcome = false,
  onStartTutorial,
  onSkipTutorial,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [focusMode, setFocusMode] = useState(false);
  const [taskInput, setTaskInput] = useState('');
  const [breakHours, setBreakHours] = useState('');
  const [breakMins, setBreakMins] = useState('');
  const [now, setNow] = useState(Date.now());
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('right');
  const prevTabRef = useRef<Tab>('dashboard');
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recent tasks — all chips are always in the DOM; the section is clipped
  // to the exact height that fully fits above the widget's bottom edge, so
  // nothing is ever half-visible. Measuring the FULL list (not a sliced
  // subset) keeps the count from getting stuck.
  const savedTasksSectionRef = useRef<HTMLDivElement>(null);
  const [fittedHeight, setFittedHeight] = useState<number | null>(null);
  const [fitsAny, setFitsAny] = useState(true);

  // Slide-to-confirm end session
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  // Right-click menu for recent-task chips (remove from history)
  const [taskMenu, setTaskMenu] = useState<{ label: string; x: number; y: number } | null>(null);

  const openConfirmEnd = () => setConfirmEndOpen(true);

  const cancelConfirmEnd = () => setConfirmEndOpen(false);

  const confirmEndSession = () => {
    setConfirmEndOpen(false);
    onEndSessionAndShowTrends();
  };

  const toggleFocusMode = () => {
    const next = !focusMode;
    setFocusMode(next);
    onSetFocusMode(next);
  };

  const handleMouseEnter = () => {
    // Resizing the native Electron window can briefly emit mouseleave while
    // the pointer is moving toward the top controls. Cancel the pending
    // collapse so Dashboard and Focus mode remain reachable.
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setExpanded(true);
    onWidgetHover(true);
  };

  const handleMouseLeave = () => {
    // Give the pointer a short grace period to cross the moving top edge
    // during the upward expansion. This prevents the widget shrinking under
    // the cursor before a top-right button can be clicked.
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      collapseTimerRef.current = null;
      setExpanded(false);
      onWidgetHover(false);
      // Always settle on the Overview tab while collapsed — pan back if needed
      if (activeTab !== 'dashboard') {
        prevTabRef.current = activeTab;
        setSlideDir('left');
        setActiveTab('dashboard');
      }
    }, 900);
  };

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
  }, []);

  // Close the task context menu on any click elsewhere
  useEffect(() => {
    if (!taskMenu) return;
    const close = () => setTaskMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [taskMenu]);

  // When a break ends (either manually or by timer), return to the Overview tab
  const wasOnBreakRef = useRef(isOnBreak);
  useEffect(() => {
    if (wasOnBreakRef.current && !isOnBreak) {
      setActiveTab('dashboard');
    }
    wasOnBreakRef.current = isOnBreak;
  }, [isOnBreak]);

  const switchTab = (tab: Tab) => {
    const tabs: Tab[] = ['dashboard', 'task', 'break'];
    const prevIdx = tabs.indexOf(prevTabRef.current);
    const nextIdx = tabs.indexOf(tab);
    setSlideDir(nextIdx > prevIdx ? 'right' : 'left');
    prevTabRef.current = tab;
    setActiveTab(tab);
  };

  const uniqueTasks = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const w of windows) {
      if (w.taskLabel && !seen.has(w.taskLabel)) {
        seen.add(w.taskLabel);
        result.push(w.taskLabel);
      }
    }
    return result;
  }, [windows]);

  const sparklineData = useMemo(() => {
    const recent = windows.slice(-150);
    let prevValue: number | null = null;
    return recent.map((w, i) => {
      // During a break the line flatlines (carries the last level) in gray so
      // it connects seamlessly through the break block instead of gaping.
      const value = w.isBreak
        ? prevValue ?? 0.5
        : w.state === 'focused'
        ? 1
        : w.state === 'restless'
        ? 0.6
        : 0.2;
      if (!w.isBreak) prevValue = value;
      return {
        index: i,
        value,
        isBreak: w.isBreak,
        taskLabel: w.isBreak ? 'Break' : w.taskLabel || 'No Task',
      };
    });
  }, [windows]);

  const segments = useMemo(() => buildSegments(sparklineData), [sparklineData]);

  // Tasks available for color assignment — includes the current task so it
  // gets its real color the instant it's set, instead of flashing the
  // fallback color (blue) until the first window carrying its label arrives.
  const colorTasks = useMemo(() => {
    if (currentTask === 'No Task' || uniqueTasks.includes(currentTask)) return uniqueTasks;
    return [...uniqueTasks, currentTask];
  }, [uniqueTasks, currentTask]);

  const gradientStops = useMemo(
    () =>
      buildGradientStops(
        segments,
        (l) =>
          l === 'Break' ? BREAK_COLOR : l === 'No Task' ? '#FFFFFF' : getTaskColor(l, colorTasks)
      ),
    [segments, colorTasks]
  );

  const legendItems = useMemo(() => {
    const seen = new Set<string>();
    const items: { label: string; color: string }[] = [];
    for (const seg of segments) {
      if (!seen.has(seg.label)) {
        seen.add(seg.label);
        items.push({
          label: seg.label,
          color:
            seg.label === 'Break'
              ? BREAK_COLOR
              : seg.label === 'No Task'
              ? '#FFFFFF'
              : getTaskColor(seg.label, colorTasks),
        });
      }
    }
    return items;
  }, [segments, colorTasks]);

  const breakRegions = useMemo(() => {
    const regions: { start: number; end: number }[] = [];
    let inBreak = false, start = 0;
    for (const w of sparklineData) {
      if (w.isBreak && !inBreak) { inBreak = true; start = w.index; }
      else if (!w.isBreak && inBreak) { inBreak = false; regions.push({ start, end: w.index }); }
    }
    if (inBreak && sparklineData.length) regions.push({ start, end: sparklineData[sparklineData.length - 1].index });
    return regions;
  }, [sparklineData]);

  const taskElapsed = taskStartTime > 0 ? now - taskStartTime : 0;
  const isTaskActive = currentTask !== 'No Task' && taskStartTime > 0;
  const currentTaskColor = isTaskActive ? getTaskColor(currentTask, colorTasks) : '#FFFFFF';

  // Measure after layout: every chip is rendered, so this sees the full
  // list. Find how many chips fully fit above the bottom edge, then clip
  // the section to exactly that height — overflow rows are fully hidden,
  // never half-shown. Re-measures on any layout-affecting change.
  useLayoutEffect(() => {
    const container = savedTasksSectionRef.current;
    if (!container) {
      setFitsAny(true);
      return;
    }
    const panel = container.parentElement;
    if (!panel) return;
    const panelBottom = panel.getBoundingClientRect().bottom - 4;
    const sectionTop = container.getBoundingClientRect().top;
    let lastFitBottom = 0;
    for (const child of Array.from(container.children)) {
      if (child.tagName !== 'BUTTON') continue;
      const bottom = child.getBoundingClientRect().bottom;
      if (bottom > panelBottom) break;
      lastFitBottom = bottom;
    }
    const fits = lastFitBottom > 0;
    const height = fits ? lastFitBottom - sectionTop + 2 : 0;
    setFitsAny(fits);
    setFittedHeight((prev) => (prev === height ? prev : height));
  }, [savedTasks, isTaskActive, activeTab]);

  const handleBreakStart = () => {
    const hours = parseInt(breakHours) || 0;
    const mins = parseInt(breakMins) || 0;
    const total = hours * 60 + mins;
    if (total > 0) onBreakStart(total);
  };

  const handleTaskSubmit = () => {
    if (taskInput.trim()) {
      onTaskLabel(taskInput.trim());
      setTaskInput('');
    }
  };

  // Break state — full screen timer
  if (isOnBreak) {
    // Break mode owns the whole widget immediately, preventing the previous
    // session's red/unfocused state from flashing during the transition.
    const breakDone = breakTimeLeft <= 0;
    return (
      <div className={`${styles.widget} ${styles.breakWidget} ${breakDone ? styles.breakDone : ''}`} onMouseDown={onDrag}>
        <div className={styles.dragRegion} />
        <div className={styles.breakContent}>
          <div className={`${styles.breakLabel} ${breakDone ? styles.breakLabelDone : ''}`}>BREAK</div>
          <div className={`${styles.breakTimer} ${breakDone ? styles.breakTimerDone : ''} tabular-nums`}>
            {formatBreakTime(breakTimeLeft)}
          </div>
          <button
            className={`${styles.pillButton} ${breakDone ? styles.breakDoneBtn : ''}`}
            onClick={(e) => { e.stopPropagation(); onBreakEnd(); }}
          >
            I'm back
          </button>
        </div>
      </div>
    );
  }

  // No session running — show the start screen (takes priority over calibration)
  // If the tutorial hasn't been completed yet, the same screen invites the
  // user to start the tutorial instead of a session — identical sizing and
  // coloring, just a different primary button.
  if (!isSessionActive) {
    return (
      <div className={styles.widget} onMouseDown={onDrag}>
        <div className={styles.dragRegion} />
        <button className={styles.quitBtn} title="Quit Trance" aria-label="Quit Trance" onClick={(e) => { e.stopPropagation(); onQuit(); }}>
          ✕
        </button>
        <button className={styles.startDashboardBtn} onClick={(e) => { e.stopPropagation(); onOpenDashboard(); }}>
          Dashboard
        </button>
        <div className={styles.startContent}>
          <div className={styles.startTitle}>Trance</div>
          <div className={styles.startSub}>Ready when you are</div>
          {showTutorialWelcome ? (
            <>
              <button className={styles.startBtn} onClick={(e) => { e.stopPropagation(); onStartTutorial?.(); }}>
                Start tutorial
              </button>
              <button className={styles.startSkip} onClick={(e) => { e.stopPropagation(); onSkipTutorial?.(); }}>
                Skip the tutorial
              </button>
            </>
          ) : (
            <button className={styles.startBtn} onClick={(e) => { e.stopPropagation(); onStartSession(); }}>
              Start Trance session
            </button>
          )}
        </div>
      </div>
    );
  }

  // Calibration
  if (isCalibrating) {
    return (
      <div className={styles.widget} onMouseDown={onDrag}>
        <div className={styles.dragRegion} />
        <div className={styles.calibrationOverlay}>
          <div className={styles.calibrationText}>Calibrating...</div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${calibrationProgress}%` }} />
          </div>
        </div>
      </div>
    );
  }

  // Focus mode — compact status pill: just the status word + current task
  if (focusMode) {
    return (
      <div
        className={`${styles.widget} ${styles.widgetCompact} ${focusLevel === 'unfocused' ? styles.unfocused : focusLevel === 'warning' ? styles.warning : ''}`}
        onMouseDown={onDrag}
      >
        <div className={styles.dragRegion} />
        <button
          className={styles.focusExitBtn}
          title="Exit focus mode"
          aria-label="Exit focus mode"
          onClick={(e) => { e.stopPropagation(); toggleFocusMode(); }}
        >
          <svg className={styles.focusExitIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
          </svg>
        </button>
        <div className={styles.focusView}>
          <div
            className={`${styles.focusViewState} ${focusLevel === 'unfocused' ? styles.focusStateUnfocused : focusLevel === 'warning' ? styles.focusStateWarning : ''}`}
          >
            {focusLevel === 'focused' ? 'FOCUSED' : 'UNFOCUSED'}
          </div>
          <div className={styles.focusViewTask} style={{ color: currentTaskColor }}>
            {currentTask}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.widget} ${expanded ? styles.widgetExpanded : styles.widgetCollapsed} ${focusLevel === 'unfocused' ? styles.unfocused : focusLevel === 'warning' ? styles.warning : ''}`}
      onMouseDown={onDrag}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={styles.dragRegion} />

      {/* Top-right buttons — Dashboard (text, hidden until hover) + Focus mode */}
      <div className={styles.topRightBtns}>
        <button className={styles.dashboardBtn} onClick={(e) => { e.stopPropagation(); onOpenDashboard(); }}>
          Dashboard
        </button>
        <button
          className={`${styles.focusBtn}${focusMode ? ' ' + styles.focusBtnActive : ''}`}
          title={focusMode ? 'Exit focus mode' : 'Focus mode'}
          aria-label={focusMode ? 'Exit focus mode' : 'Focus mode'}
          onClick={(e) => { e.stopPropagation(); toggleFocusMode(); }}
        >
          Focus mode
        </button>
      </div>

      {/* End session button — top left, always visible, slide-to-confirm */}
      {isSessionActive && (
        <button className={styles.endSessionTop} title="End session" aria-label="End session" onClick={(e) => { e.stopPropagation(); openConfirmEnd(); }}>
          ✕
        </button>
      )}

      {/* Nudge */}
      {nudge && (
        <div className={`${styles.nudge} ${nudge.severity === 'moderate' ? styles.nudgeModerate : styles.nudgeMild}`}>
          {nudge.message}
        </div>
      )}

      {/* Slide-to-confirm end session overlay */}
      {confirmEndOpen && (
        <div className={styles.confirmEndOverlay} onMouseDown={(e) => e.stopPropagation()}>
          <div className={styles.confirmEndTitle}>End session?</div>
          <SlideToConfirm label="slide to end session" onConfirm={confirmEndSession} />
          <button
            className={styles.confirmCancelBtn}
            onClick={(e) => { e.stopPropagation(); cancelConfirmEnd(); }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Tab content */}
      <div className={styles.tabContent}>
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className={`${styles.tabPanel} ${slideDir === 'right' ? styles.slideInRight : styles.slideInLeft}`}>
            {/* Task timer */}
            {isTaskActive && (
              <div className={styles.taskTimer}>
                <span className={styles.taskTimerLabel} style={{ color: currentTaskColor }}>{currentTask}</span>
                <span className={`${styles.taskTimerValue} tabular-nums`}>{formatDuration(taskElapsed)}</span>
                <button className={styles.taskStopBtn} onClick={(e) => { e.stopPropagation(); onTaskStop(); }}>✕</button>
              </div>
            )}

            {/* Sparkline — simple line, colored per task, gray block on break */}
            <div className={styles.sparklineContainer}>
              <ResponsiveContainer width="100%" height={expanded ? (isTaskActive ? 48 : 62) : 40}>
                <LineChart data={sparklineData}>
                  <defs>
                    {/* userSpaceOnUse + fixed coords — an objectBoundingBox gradient
                        fails on a flat line (zero-height bbox) in packaged builds */}
                    <linearGradient id="taskLineGrad" gradientUnits="userSpaceOnUse" x1="5" y1="0" x2="265" y2="0">
                      {gradientStops.map((s, i) => (
                        <stop key={i} offset={`${(s.offset * 100).toFixed(2)}%`} stopColor={s.color} />
                      ))}
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 1]} hide padding={{ top: 12, bottom: 8 }} />
                  <XAxis dataKey="index" hide />
                  {breakRegions.map((r, i) => (
                    <ReferenceArea key={`b-${i}`} x1={r.start} x2={r.end} fill={BREAK_COLOR} fillOpacity={0.55} stroke={BREAK_COLOR} strokeOpacity={0.8} />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="url(#taskLineGrad)"
                    strokeWidth={3}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  {/* End dot — anchors the line so a flat 100% line reads as a
                      chart line instead of invisible empty space */}
                  {sparklineData.length > 0 && (
                    <ReferenceDot
                      x={sparklineData[sparklineData.length - 1].index}
                      y={sparklineData[sparklineData.length - 1].value}
                      r={3}
                      fill="#FFFFFF"
                      stroke="#000000"
                      strokeWidth={1.5}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Task legend — every task visible in the line */}
            {legendItems.length > 1 && (
              <div className={styles.miniLegend}>
                {legendItems.map((item) => (
                  <span key={item.label} className={styles.legendItemInline}>
                    <span className={styles.legendDot} style={{ background: item.color }} />
                    <span className={styles.legendLabel}>{item.label}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Efficiency % (left) + time stats stacked (right) */}
            <div className={styles.statsRow}>
              <div className={styles.focusBlock}>
                <div className={`${styles.focusPercent} tabular-nums`}>{focusPercentage}%</div>
                <div className={styles.focusLabel}>efficiency</div>
              </div>
              <div className={styles.timeStats}>
                <div className={styles.timeStat}>
                  <span className={styles.timeStatLabel}>focused</span>
                  <span className={`${styles.timeStatValue} tabular-nums`}>{formatDuration(focusedMs)}</span>
                </div>
                <div className={styles.timeStat}>
                  <span className={styles.timeStatLabel}>distracted</span>
                  <span className={`${styles.timeStatValue} tabular-nums`}>{formatDuration(distractedMs)}</span>
                </div>
                <div className={styles.timeStat}>
                  <span className={styles.timeStatLabel}>break</span>
                  <span className={`${styles.timeStatValue} tabular-nums`}>{formatDuration(breakMs)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TASK TAB */}
        {activeTab === 'task' && (
          <div className={`${styles.tabPanel} ${slideDir === 'right' ? styles.slideInRight : styles.slideInLeft}`}>
            {/* Current task */}
            {isTaskActive ? (
              <div className={styles.taskActiveBox}>
                <div className={styles.taskActiveHeader}>
                  <span className={styles.taskActiveName} style={{ color: currentTaskColor }}>{currentTask}</span>
                  <span className={`${styles.taskActiveTime} tabular-nums`}>{formatDuration(taskElapsed)}</span>
                  <button
                    className={styles.taskActiveStop}
                    title="End task"
                    aria-label="End task"
                    onClick={(e) => { e.stopPropagation(); onTaskStop(); }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.taskInactiveMsg}>No active task</div>
            )}

            {/* New task input */}
            <div className={styles.taskNewSection}>
              <div className={styles.taskInputRow}>
                <input
                  type="text"
                  placeholder="New task..."
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTaskSubmit()}
                  className={styles.taskInput}
                />
                <button className={styles.pillButtonSmall} onClick={handleTaskSubmit}>Set</button>
              </div>
            </div>

            {/* Right-click menu — remove a saved task from history */}
            {taskMenu && (
              <div
                className={styles.taskContextMenu}
                style={{ left: Math.min(taskMenu.x, 300 - 150), top: Math.min(taskMenu.y, 220 - 40) }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
              >
                <button
                  className={styles.taskContextItem}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSavedTask(taskMenu.label);
                    setTaskMenu(null);
                  }}
                >
                  Remove from history
                </button>
              </div>
            )}

            {/* Saved tasks — all chips render; overflow is clipped, not sliced */}
            {savedTasks.length > 0 && fitsAny && (
              <div
                className={styles.savedTasksSection}
                ref={savedTasksSectionRef}
                style={{ maxHeight: fittedHeight ?? undefined, overflow: 'hidden' }}
              >
                <div className={styles.savedTasksLabel}>Recent tasks</div>
                {savedTasks.map((task, i) => (
                  <button
                    key={`${task}-${i}`}
                    className={styles.savedTaskBtn}
                    onClick={(e) => { e.stopPropagation(); onTaskLabel(task); }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Position relative to the tab panel (the menu's containing block)
                      const panel = e.currentTarget.parentElement?.parentElement;
                      const rect = panel?.getBoundingClientRect();
                      setTaskMenu({
                        label: task,
                        x: e.clientX - (rect?.left ?? 0),
                        y: e.clientY - (rect?.top ?? 0),
                      });
                    }}
                  >
                    <span className={styles.legendDot} style={{ background: getTaskColor(task, uniqueTasks) }} />
                    {task}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BREAK TAB */}
        {activeTab === 'break' && (
          <div className={`${styles.tabPanel} ${slideDir === 'right' ? styles.slideInRight : styles.slideInLeft}`}>
            <div className={styles.breakPickerSection}>
              {/* Preset buttons */}
              <div className={styles.breakPresets}>
                {[
                  { label: '1m', mins: 1 },
                  { label: '5m', mins: 5 },
                  { label: '10m', mins: 10 },
                  { label: '15m', mins: 15 },
                  { label: '30m', mins: 30 },
                  { label: '1h', mins: 60 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    className={styles.breakPresetBtn}
                    onClick={(e) => { e.stopPropagation(); onBreakStart(preset.mins); }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom break input */}
              <div className={styles.customBreakRow}>
                <input
                  type="number"
                  placeholder="h"
                  value={breakHours}
                  onChange={(e) => setBreakHours(e.target.value)}
                  className={styles.breakTimeInput}
                  min={0}
                  max={24}
                />
                <span className={styles.breakTimeSep}>:</span>
                <input
                  type="number"
                  placeholder="m"
                  value={breakMins}
                  onChange={(e) => setBreakMins(e.target.value)}
                  className={styles.breakTimeInput}
                  min={0}
                  max={59}
                />
                <button
                  className={`${styles.pillButtonSmall}${(!breakHours.trim() && !breakMins.trim()) ? ' ' + styles.pillButtonSmallDisabled : ''}`}
                  disabled={!breakHours.trim() && !breakMins.trim()}
                  onClick={(e) => { e.stopPropagation(); handleBreakStart(); }}
                >
                  Go
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tab bar — sliding indicator */}
      <div className={styles.tabBar}>
        {([
          { key: 'dashboard' as Tab, label: 'Overview' },
          { key: 'task' as Tab, label: 'Task' },
          { key: 'break' as Tab, label: 'Break' },
        ]).map((tab) => (
          <button
            key={tab.key}
            className={`${styles.tabBtn} ${activeTab === tab.key ? styles.tabBtnActive : ''}`}
            onClick={(e) => { e.stopPropagation(); switchTab(tab.key); }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
