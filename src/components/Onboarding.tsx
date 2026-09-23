import { useState, type MouseEvent, type SVGProps } from 'react';
import { CornerWidget } from './CornerWidget';
import styles from './Onboarding.module.css';

type DemoTab = 'overview' | 'task' | 'break';
type DashboardTab = 'timeline' | 'insights' | 'trends';

type Step = {
  label: string;
  title: string;
  instruction: string;
  kind: 'welcome' | 'start' | 'focus' | 'overview' | 'dashboard' | 'timeline' | 'insights' | 'trends' | 'task' | 'break' | 'finish';
};

interface Props {
  onComplete: () => void;
}

const STEPS: Step[] = [
  {
    label: 'Welcome',
    title: 'Trance',
    instruction: 'A minimalist path to efficiency.',
    kind: 'welcome',
  },
  {
    label: 'Step 1 of 9',
    title: 'Start a session',
    instruction: 'Click Start Trance session in the widget below.',
    kind: 'start',
  },
  {
    label: 'Step 2 of 9',
    title: 'Read the Overview',
    instruction: 'The overview shows the live efficiency line, your percentage, and the focused, distracted, and break timers.',
    kind: 'overview',
  },
  {
    label: 'Step 3 of 9',
    title: 'Explore Tasks',
    instruction: 'Hover your cursor over the app, click Task at the bottom, type in a task name, and click Set.',
    kind: 'task',
  },
  {
    label: 'Step 4 of 9',
    title: 'Start a break',
    instruction: 'Hover your cursor over the app and click Break at the bottom. Choose 1m to see the break timer.',
    kind: 'break',
  },
  {
    label: 'Step 5 of 9',
    title: 'Try Focus mode',
    instruction: 'If the break timer is showing, click I’m back first. Then hover your cursor over the app and click Focus mode. When you are done, click the unfullscreen icon to return.',
    kind: 'focus',
  },
  {
    label: 'Step 6 of 9',
    title: 'Open the Dashboard',
    instruction: 'Hover your cursor over the app and click Dashboard in the top-right.',
    kind: 'dashboard',
  },
  {
    label: 'Step 7 of 9',
    title: 'Explore Timeline',
    instruction: 'Timeline shows your total timeline and recent ranges when enough data exists.',
    kind: 'timeline',
  },
  {
    label: 'Step 8 of 9',
    title: 'Explore Insights',
    instruction: 'Click Insights to compare the time and efficiency of your tasks.',
    kind: 'insights',
  },
  {
    label: 'Step 9 of 9',
    title: 'Explore Trends',
    instruction: 'Click Trends to compare sessions and review your history stored on this device.',
    kind: 'trends',
  },
  {
    label: 'Complete',
    title: 'You are ready',
    instruction: 'Start a session, set a task, take a break, and use Dashboard when you want deeper detail.',
    kind: 'finish',
  },
];

function TranceLogo({ size }: { size?: number }): JSX.Element {
  const s = size ?? 28;
  const r = s / 2;
  const cx = r;
  const cy = r;

  // A rounded-square monochrome mark with the white orbit-ring + satellite-dot
  // motif used by the app icon. Black background so it reads in both dark and
  // light theme shells.
  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      aria-hidden="true"
      role="img"
      fill="none"
      stroke="currentColor"
    >
      {/* Rounded square background */}
      <rect
        x={1}
        y={1}
        width={s - 2}
        height={s - 2}
        rx={(s - 2) * 0.225}
        fill="currentColor"
      />
      {/* White orbit ring centred slightly below midpoint */}
      <circle
        cx={cx}
        cy={cy + s * 0.03}
        r={s * 0.30}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={Math.max(2, s * 0.095)}
      />
      {/* White satellite dot at ~45° down-right on the ring */}
      <circle
        cx={cx + s * 0.30 * Math.cos(Math.PI / 4)}
        cy={cy + s * 0.03 + s * 0.30 * Math.sin(Math.PI / 4)}
        r={Math.max(2.5, s * 0.105)}
        fill="#FFFFFF"
      />
    </svg>
  );
}

/* Small logo used only as a decorative brand mark beside text. */
function BrandMark({ size }: { size?: number }): JSX.Element {
  const s = size ?? 28;
  return (
    <div
      className={styles.brandMark}
      style={{ width: s, height: s, border: 'none' }}
      aria-hidden="true"
    >
      <TranceLogo size={s} />
    </div>
  );
}

function DemoWidget({
  tab,
  started,
  focusMode,
  taskSet,
  breakActive,
  onStart,
  onFocus,
  onExitFocus,
  onDashboard,
  onTab,
  onTask,
  onBreak,
  onBreakEnd,
}: {
  tab: DemoTab;
  started: boolean;
  focusMode: boolean;
  taskSet: boolean;
  breakActive: boolean;
  onStart: () => void;
  onFocus: () => void;
  onExitFocus: () => void;
  onDashboard: () => void;
  onTab: (tab: DemoTab) => void;
  onTask: () => void;
  onBreak: () => void;
  onBreakEnd: () => void;
}) {
  if (breakActive) {
    return (
      <div className={styles.realWidget}>
        <div className={styles.demoDragBar} />
        <div className={styles.breakScreen}>
          <div className={styles.breakLabel}>BREAK</div>
          <div className={styles.breakClock}>0:59</div>
          <button type="button" className={styles.primarySmall} onClick={onBreakEnd}>I'm back</button>
        </div>
      </div>
    );
  }

  if (focusMode) {
    return (
      <div className={`${styles.realWidget} ${styles.realWidgetCompact}`}>
        <div className={styles.demoDragBar} />
        <button type="button" className={styles.unfullscreenButton} aria-label="Exit focus mode" onClick={onExitFocus}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" /></svg>
        </button>
        <div className={styles.compactStatus}>{taskSet ? 'FOCUSED' : 'FOCUSED'}<small>{taskSet ? 'Writing' : 'No Task'}</small></div>
      </div>
    );
  }

  return (
    <div className={styles.realWidget}>
      <div className={styles.demoDragBar} />
      <div className={styles.widgetTopControls}>
        <span className={styles.demoX}>x</span>
        <div className={styles.widgetButtons}>
          <button type="button" onClick={onDashboard}>Dashboard</button>
          <button type="button" onClick={onFocus}>Focus mode</button>
        </div>
      </div>
      {!started ? (
        <div className={styles.startWidgetScreen}>
          <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TranceLogo size={20} />
            Trance
          </strong>
          <span>Ready when you are</span>
          <button type="button" className={styles.primarySmall} onClick={onStart}>Start Trance session</button>
        </div>
      ) : (
        <>
          <div className={styles.widgetPanel}>
            {tab === 'overview' && (
              <>
                <div className={styles.currentTaskLine} style={{ color: taskSet ? '#FF6BB5' : 'var(--text-primary)' }}>
                  {taskSet ? 'Writing' : 'No Task'} <span>{taskSet ? '0:03' : '0:00'}</span>
                </div>
                <div className={`${styles.simpleLine} ${taskSet ? styles.taskLinePink : ''}`}><i /><i /><i /><i /></div>
                <div className={styles.widgetStats}>
                  <span><b>100%</b><small>efficiency</small></span>
                  <span><small>focused</small><b>0:03</b></span>
                  <span><small>distracted</small><b>0:00</b></span>
                  <span><small>break</small><b>0:00</b></span>
                </div>
              </>
            )}
            {tab === 'task' && (
              <div className={styles.taskPanel}>
                <small className={styles.panelEyebrow}>TASK</small>
                <div className={styles.taskCurrent} style={{ color: taskSet ? '#FF6BB5' : 'var(--text-primary)' }}>
                  {taskSet ? 'Writing' : 'No active task'} <span>{taskSet ? '0:03' : ''}</span>
                </div>
                <div className={styles.taskInputLine}>
                  <button type="button" onClick={onTask} className={styles.fakeInput}>{taskSet ? 'Writing' : 'New task...'}</button>
                  <button type="button" onClick={onTask} className={styles.primarySmall}>Set</button>
                </div>
                {taskSet && <div className={styles.colorNotice}><i /> Line is now pink for Writing</div>}
              </div>
            )}
            {tab === 'break' && (
              <div className={styles.taskPanel}>
                <small className={styles.panelEyebrow}>BREAK</small>
                <div className={styles.breakChoices}>
                  <button type="button" onClick={onBreak}>1m</button>
                  <button type="button" onClick={onBreak}>5m</button>
                  <button type="button" onClick={onBreak}>30m</button>
                </div>
                <div className={styles.breakTip}>Choose a preset or enter a custom time.</div>
              </div>
            )}
          </div>
          <div className={styles.widgetTabs}>
            {(['overview', 'task', 'break'] as DemoTab[]).map((item) => (
              <button type="button" key={item} className={tab === item ? styles.widgetTabActive : ''} onClick={() => onTab(item)}>
                {item === 'overview' ? 'Overview' : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DemoDashboard({
  tab,
  settingsOpen,
  onTab,
  onSettings,
}: {
  tab: DashboardTab;
  settingsOpen: boolean;
  onTab: (tab: DashboardTab) => void;
  onSettings: () => void;
}) {
  return (
    <div className={styles.realDashboard}>
      <div className={styles.dashboardHeader}>
        <span>Back</span>
        <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TranceLogo size={14} />
          Trance Analysis
        </strong>
        <button type="button" onClick={onSettings}>Settings</button>
      </div>
      <div className={styles.dashboardTabs}>
        {(['timeline', 'insights', 'trends'] as DashboardTab[]).map((item) => (
          <button type="button" key={item} className={tab === item ? styles.dashboardTabActive : ''} onClick={() => onTab(item)}>
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      {settingsOpen ? (
        <div className={styles.settingsDemo}>
          <strong>Settings</strong>
          <span>Lighting: Auto</span>
          <span>Reduce motion: Off</span>
          <span>Replay tutorial</span>
        </div>
      ) : (
        <div className={styles.dashboardBody}>
          {tab === 'timeline' && <><h3>Total timeline</h3><div className={styles.dashboardGraph}><i /><i /><i /></div><div className={styles.dashboardMetrics}><b>92%<small>efficiency</small></b><b>0:18<small>break time</small></b></div></>}
          {tab === 'insights' && <><h3>Tasks</h3><div className={styles.taskMetric}><i />Writing <b>92% efficiency</b></div><div className={styles.taskMetric}><i className={styles.pinkDot} />Planning <b>86% efficiency</b></div><div className={styles.barChart}><i /><i /><i /></div></>}
          {tab === 'trends' && <><h3>Across sessions</h3><div className={styles.trendGraph}><i /><i /><i /><i /></div><div className={styles.sessionMetric}>Today <b>92% efficiency</b></div><div className={styles.sessionMetric}>Yesterday <b>84% efficiency</b></div></>}
        </div>
      )}
    </div>
  );
}

export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [demoTab, setDemoTab] = useState<DemoTab>('overview');
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('timeline');
  const [started, setStarted] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [focusUsed, setFocusUsed] = useState(false);
  const [dashboardOpened, setDashboardOpened] = useState(false);
  const [taskSet, setTaskSet] = useState(false);
  const [breakActive, setBreakActive] = useState(false);

  const current = STEPS[step];
  const isWelcome = current.kind === 'welcome';
  const isFinish = current.kind === 'finish';

  const actionComplete = (() => {
    switch (current.kind) {
      case 'start': return started;
      case 'focus': return focusUsed && !focusMode;
      case 'dashboard': return dashboardOpened;
      case 'timeline': return dashboardOpened && dashboardTab === 'timeline';
      case 'insights': return dashboardOpened && dashboardTab === 'insights';
      case 'trends': return dashboardOpened && dashboardTab === 'trends';
      case 'task': return taskSet;
      case 'break': return breakActive;
      default: return true;
    }
  })();

  const next = () => {
    if (actionComplete || isFinish) {
      setStep((value) => Math.min(STEPS.length - 1, value + 1));
    }
  };

  const startTutorial = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setStep(1);
  };

  const goBack = () => setStep((value) => Math.max(0, value - 1));

  const demoKind = current.kind;
  const showDashboard = ['dashboard', 'timeline', 'insights', 'trends'].includes(demoKind) && dashboardOpened;
  const widgetTab: DemoTab = demoKind === 'task' ? 'task' : demoKind === 'break' ? 'break' : 'overview';

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Trance tutorial">
      <div className={styles.tutorialShell}>
        <button type="button" className={styles.skipButton} onClick={onComplete}>Skip tutorial</button>
        <BrandMark size={28} />
        <div className={styles.progressRow} aria-label={`Tutorial step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((item, index) => <span key={item.label} className={index <= step ? styles.progressActive : ''} />)}
        </div>

        {isWelcome ? (
          <div className={styles.welcomeScreen}>
            <small>WELCOME TO</small>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
              <TranceLogo size={44} />
              Trance
            </h1>
            <p>A minimalist path to efficiency.</p>
            <button type="button" className={styles.primaryButton} onClick={startTutorial}>Start tutorial</button>
            <button type="button" className={styles.skipLink} onClick={onComplete}>Skip for now</button>
          </div>
        ) : (
          <div className={styles.stepLayout}>
            <section className={styles.instructionColumn}>
              <div className={styles.stepLabel}>{current.label}</div>
              <h1>{current.title}</h1>
              {current.instruction && (
                <div className={styles.doThisBox}>
                  <strong>{current.instruction}</strong>
                </div>
              )}
              <div className={`${styles.actionStatus} ${actionComplete ? styles.actionDone : ''}`}>
                <i /> {actionComplete ? 'Done. Continue when ready.' : 'Waiting for your action.'}
              </div>
              <div className={styles.navigationRow}>
                <button type="button" className={styles.secondaryButton} onClick={goBack}>Back</button>
                <button type="button" className={styles.primaryButton} disabled={!actionComplete && !isFinish} onClick={isFinish ? onComplete : next}>
                  {isFinish ? 'Finish tutorial' : 'Continue'}
                </button>
              </div>
            </section>
            <section className={styles.demoColumn} aria-label="Interactive tutorial demo">
              {showDashboard ? (
                <DemoDashboard
                  tab={dashboardTab}
                  settingsOpen={false}
                  onTab={(value) => setDashboardTab(value)}
                  onSettings={() => undefined}
                />
              ) : (
                <CornerWidget
                  windows={[{ timestamp: Date.now() - 4000, velocity: 20, idlePercent: 0, clickRate: 0, state: 'focused', zScore: 0, isBreak: false, taskLabel: '' }, { timestamp: Date.now() - 3000, velocity: 8, idlePercent: 0.2, clickRate: 0, state: 'restless', zScore: 0, isBreak: false, taskLabel: '' }, { timestamp: Date.now() - 2000, velocity: 16, idlePercent: 0, clickRate: 0, state: 'focused', zScore: 0, isBreak: false, taskLabel: '' }, { timestamp: Date.now() - 1000, velocity: 18, idlePercent: 0, clickRate: 0, state: 'focused', zScore: 0, isBreak: false, taskLabel: '' }]}
                  currentWindow={null}
                  focusPercentage={92}
                  focusedMs={3000}
                  distractedMs={0}
                  breakMs={0}
                  isCalibrating={false}
                  calibrationProgress={100}
                  focusLevel="focused"
                  isOnBreak={breakActive}
                  breakTimeLeft={breakActive ? 59000 : 0}
                  nudge={null}
                  currentTask={taskSet ? 'Writing' : 'No Task'}
                  taskStartTime={taskSet ? Date.now() - 3000 : 0}
                  savedTasks={taskSet ? ['Writing'] : []}
                  isSessionActive={started}
                  onDrag={() => undefined}
                  onBreakStart={() => { setBreakActive(true); setDemoTab('break'); }}
                  onBreakEnd={() => setBreakActive(false)}
                  onTaskLabel={() => { setTaskSet(true); setDemoTab('task'); }}
                  onTaskStop={() => setTaskSet(false)}
                  onRemoveSavedTask={() => undefined}
                  onStartSession={() => setStarted(true)}
                  onOpenDashboard={() => setDashboardOpened(true)}
                  onEndSession={() => undefined}
                  onEndSessionAndShowTrends={() => undefined}
                  onQuit={() => undefined}
                  onSetFocusMode={(value) => { setFocusUsed(true); setFocusMode(value); }}
                  onWidgetHover={() => undefined}
                />
              )}
              <div className={styles.demoInstruction}>{showDashboard ? 'Dashboard preview' : 'Widget preview'}</div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
