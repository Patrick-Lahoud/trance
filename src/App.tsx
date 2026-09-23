import { useState, useEffect, useRef, useMemo } from 'react';
import { CornerWidget } from './components/CornerWidget';
import { Dashboard } from './components/Dashboard';
import { Onboarding } from './components/Onboarding';
import { DebriefGenerator } from './ml/debrief';
import { rowFromWindows } from './ml/analysis';
import { Nudge, SessionData, WindowData, TrackingData, DebriefInsight } from './types';

export type FocusLevel = 'focused' | 'warning' | 'unfocused';
export type ThemeMode = 'auto' | 'dark' | 'light';

const THEME_MODE_KEY = 'trance-theme-mode';
const REDUCE_MOTION_KEY = 'trance-reduce-motion';
const ONBOARDING_COMPLETE_KEY = 'trance-onboarding-complete';

function readThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_MODE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function readBooleanPreference(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

// One window per second
const WINDOW_MS = 1000;

export default function App() {
  // View routing (accepts #/dashboard and #/dashboard?tab=trends)
  const isDashHash = () => window.location.hash.startsWith('#/dashboard');
  const isTutorialHash = () =>
    window.location.hash === '#/tutorial' || window.location.pathname.endsWith('/tutorial');
  const [isDashboard, setIsDashboard] = useState(isDashHash());
  const isDashboardWindow = isDashboard; // alias used in the tracking tick
  const [isTutorial, setIsTutorial] = useState(isTutorialHash);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode);
  const [reduceMotion, setReduceMotion] = useState(() => readBooleanPreference(REDUCE_MOTION_KEY));

  // Tutorial trigger priority:
  // 1) Installer launch marker in the user data folder
  // 2) Local onboarding-complete flag in the renderer
  const [showOnboarding, setShowOnboarding] = useState(
    () => !readBooleanPreference(ONBOARDING_COMPLETE_KEY)
  );
  // Tutorial shows a "Start tutorial" screen in the widget; clicking it opens
  // the full tutorial in its own window (like the Dashboard button).
  const [tutorialWelcome, setTutorialWelcome] = useState(true);

  useEffect(() => {
    const onHash = () => {
      setIsDashboard(isDashHash());
      setIsTutorial(isTutorialHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Apply appearance preferences to the whole renderer, including the widget
  // and the separate dashboard window. Auto falls back to dark if the browser
  // cannot expose a system color-scheme preference.
  useEffect(() => {
    const root = document.documentElement;
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: light)')
      : null;
    const applyTheme = () => {
      const resolved = themeMode === 'light'
        ? 'light'
        : themeMode === 'dark'
        ? 'dark'
        : media?.matches
        ? 'light'
        : 'dark';
      root.dataset.theme = resolved;
    };
    applyTheme();
    if (themeMode === 'auto' && media) {
      media.addEventListener?.('change', applyTheme);
      return () => media.removeEventListener?.('change', applyTheme);
    }
  }, [themeMode]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_MODE_KEY, themeMode);
      localStorage.setItem(REDUCE_MOTION_KEY, String(reduceMotion));
    } catch {
      // Preferences are optional when storage is unavailable.
    }
    document.documentElement.dataset.reduceMotion = reduceMotion ? 'true' : 'false';
  }, [themeMode, reduceMotion]);

  // Keep the widget and dashboard windows in sync when settings change in
  // their separate renderer processes.
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_MODE_KEY) setThemeMode(readThemeMode());
      if (event.key === REDUCE_MOTION_KEY) setReduceMotion(readBooleanPreference(REDUCE_MOTION_KEY));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const startOnboarding = () => {
    // Electron: open the full tutorial window like the Dashboard button.
    // Browser preview: fall back to showing the tutorial in-page.
    if ((window as any).trance?.openTutorial) {
      (window as any).trance.openTutorial();
    } else {
      window.location.hash = '#/tutorial';
      setIsTutorial(true);
      setTutorialWelcome(false);
    }
  };

  const completeOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    } catch {
      // The tutorial can still be dismissed if storage is unavailable.
    }
    (window as any).trance?.completeOnboarding?.();
    setShowOnboarding(false);
    setTutorialWelcome(false);
    setIsTutorial(false);
    // If completing inside the dedicated tutorial window, close it so the
    // app returns to the widget showing the regular start screen
    // (the widget window picks this up via the localStorage storage event).
    if (window.location.hash.startsWith('#/tutorial')) {
      if ((window as any).trance) {
        try { window.close(); } catch { /* best effort */ }
      } else {
        // Browser preview — return to the widget directly
        window.location.hash = '';
      }
    }
  };

  // When the tutorial is completed in another window, the widget window
  // learns about it through localStorage and returns to the regular start
  // screen ("Ready when you are / Start Trance session").
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === ONBOARDING_COMPLETE_KEY) {
        setShowOnboarding(!readBooleanPreference(ONBOARDING_COMPLETE_KEY));
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const replayOnboarding = () => {
    // Settings > Replay tutorial: open the full tutorial window.
    if ((window as any).trance?.openTutorial) {
      (window as any).trance.openTutorial();
    } else {
      window.location.hash = '#/tutorial';
      setIsTutorial(true);
      setTutorialWelcome(false);
      setShowOnboarding(true);
    }
  };  // ---- Session lifecycle ----
  const [isSessionActive, setIsSessionActive] = useState(false);

  // ---- Core tracking state (driven ONLY by idleSeconds) ----
  const [windows, setWindows] = useState<WindowData[]>([]);
  const [focusPercentage, setFocusPercentage] = useState(100);
  const [focusLevel, setFocusLevel] = useState<FocusLevel>('focused');
  const [isCalibrating, setIsCalibrating] = useState(true);

  // Break state
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakEndTime, setBreakEndTime] = useState(0);
  const [breakTimeLeft, setBreakTimeLeft] = useState(0);

  // Task state
  const [currentTask, setCurrentTask] = useState('No Task');
  const [taskStartTime, setTaskStartTime] = useState(0);
  const [savedTasks, setSavedTasks] = useState<string[]>([]);

  // Debrief / history
  const [debrief, setDebrief] = useState<DebriefInsight[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SessionData[]>([]);
  const debriefGenRef = useRef(new DebriefGenerator());

  // Refs so the tracking callback always reads current values
  const isOnBreakRef = useRef(false);
  const currentTaskRef = useRef('No Task');
  const sessionActiveRef = useRef(false);
  const lastIdleSecRef = useRef(0);
  const windowStartRef = useRef(Date.now());
  const recentFocusedRef = useRef<boolean[]>([]); // last 120 windows (2 min)
  const movementStreakRef = useRef(0); // consecutive moving ticks to confirm real movement
  // Cumulative session seconds (never capped, unlike the window history)
  const focusedSecRef = useRef(0);
  const distractedSecRef = useRef(0);
  const breakSecRef = useRef(0);

  useEffect(() => { isOnBreakRef.current = isOnBreak; }, [isOnBreak]);
  useEffect(() => { currentTaskRef.current = currentTask; }, [currentTask]);
  useEffect(() => { sessionActiveRef.current = isSessionActive; }, [isSessionActive]);

  // Wipe all tracking state for a fresh session
  const resetForNewSession = () => {
    const now = Date.now();
    // Seed the line chart with a focused starting segment so the efficiency
    // line is visible the instant the session starts, instead of waiting for
    // the first tracking windows to arrive.
    const seedWin = (ts: number): WindowData => ({
      timestamp: ts,
      velocity: 0,
      idlePercent: 0,
      clickRate: 0,
      state: 'focused',
      zScore: 0,
      isBreak: false,
      taskLabel: 'No Task',
    });
    setWindows([seedWin(now - 1000), seedWin(now)]);
    setFocusPercentage(100);
    // Brief yellow flash on session start — visible confirmation that the
    // session began, and a forced re-paint so the seeded line is drawn
    // immediately even on the very first frame.
    setFocusLevel('warning');
    setTimeout(() => setFocusLevel('focused'), 100);
    setCurrentTask('No Task');
    setTaskStartTime(0);
    setIsOnBreak(false);
    setBreakEndTime(0);
    setBreakTimeLeft(0);
    recentFocusedRef.current = [];
    movementStreakRef.current = 0;
    lastIdleSecRef.current = 0;
    focusedSecRef.current = 0;
    distractedSecRef.current = 0;
    breakSecRef.current = 0;
    windowStartRef.current = 0; // first real tick creates a window immediately
    setIsCalibrating(false);
  };

  // Called once per tracking tick (1s in Electron, 1s in simulation)
  const handleTick = (data: TrackingData) => {
    if (!sessionActiveRef.current && !isDashboardWindow) return; // Dashboard can still display persisted/current data
    lastIdleSecRef.current = data.idleSeconds;

    // 1) Border color — yellow at 5s, red at 10s
    // Clearing requires 3 consecutive moving ticks to filter out jitter
    if (!isOnBreakRef.current && !data.isVideoWatching) {
      if (data.idleSeconds >= 10) {
        movementStreakRef.current = 0;
        setFocusLevel('unfocused');
      } else if (data.idleSeconds >= 5) {
        movementStreakRef.current = 0;
        setFocusLevel('warning');
      } else {
        movementStreakRef.current++;
        if (movementStreakRef.current >= 3) setFocusLevel('focused');
      }
    }

    // 2) Build one window per second
    const now = data.timestamp;
    if (now - windowStartRef.current < WINDOW_MS) return;
    windowStartRef.current = now;

    const isBreak = isOnBreakRef.current;
    const idleSec = data.idleSeconds;

    const win: WindowData = {
      timestamp: now,
      velocity: data.velocity,
      idlePercent: Math.min(idleSec / 10, 1),
      clickRate: 0,
      state: isBreak || data.isVideoWatching ? 'focused' : idleSec >= 10 ? 'idle' : idleSec >= 5 ? 'restless' : 'focused',
      zScore: 0,
      isBreak,
      taskLabel: currentTaskRef.current,
    };

    // 3) Efficiency — % of non-break windows that were focused (idle < 10s).
    // Break samples remain in the timeline, but pause this rolling calculation
    // so taking a break cannot lower or raise the efficiency percentage.
    if (!isBreak && !data.isVideoWatching) {
      const focused = idleSec < 10;
      recentFocusedRef.current.push(focused);
      if (recentFocusedRef.current.length > 120) recentFocusedRef.current.shift();
      const pct = Math.round(
        (recentFocusedRef.current.filter(Boolean).length / recentFocusedRef.current.length) * 100
      );
      setFocusPercentage(pct);
    }

    // Cumulative time stats — whole session, not just the window history
    if (win.isBreak) breakSecRef.current++;
    else if (win.state === 'focused') focusedSecRef.current++;
    else distractedSecRef.current++;

    setWindows((prev) => [...prev.slice(-599), win]);
    setIsCalibrating(false);

    // Persist for cross-session trends (only the widget window records)
    (window as any).trance?.recordWindow(win);
  };

  // ---- Tracking source: Electron or browser simulation ----
  useEffect(() => {
    const trance = (window as any).trance;

    if (!trance) {
      // Browser simulation: alternates active / idle episodes
      let mode: 'active' | 'idle' = 'active';
      let modeTicks = 0;
      let modeDuration = 15 + Math.floor(Math.random() * 15);
      const sim = setInterval(() => {
        modeTicks++;
        if (modeTicks >= modeDuration) {
          mode = mode === 'active' ? 'idle' : 'active';
          modeDuration =
            mode === 'idle'
              ? 12 + Math.floor(Math.random() * 10) // idle 12-22s (hits red)
              : 15 + Math.floor(Math.random() * 15);
          modeTicks = 0;
        }
        handleTick({
          cursorX: Math.random() * 1920,
          cursorY: Math.random() * 1080,
          idleSeconds: mode === 'idle' ? modeTicks : 0,
          timestamp: Date.now(),
          velocity: mode === 'idle' ? 0 : 50 + Math.random() * 100,
          clickCount: 0,
        });
      }, 1000);
      return () => clearInterval(sim);
    }

    // Electron: tracking data comes from the main process tracker
    trance.onTrackingUpdate((data: TrackingData) => handleTick(data));

    trance.onBreakStarted((durationMinutes: number) => {
      setTaskStartTime(0);
      setIsOnBreak(true);
      setBreakEndTime(Date.now() + durationMinutes * 60 * 1000);
    });

    trance.onBreakEnded(() => {
      setIsOnBreak(false);
      setBreakEndTime(0);
    });

    trance.onTaskLabeled((label: string) => {
      setCurrentTask(label);
      setTaskStartTime(Date.now());
      setSavedTasks((prev) => [label, ...prev.filter((t) => t !== label)].slice(0, 5));
    });

    trance.onSessionStarted(() => {
      resetForNewSession();
      setIsSessionActive(true);
    });

    trance.onSessionEnded(() => {
      setIsSessionActive(false);
      setWindows([]);
      setFocusPercentage(100);
    });

    // A session may already be running when this window mounts (e.g. the
    // dashboard was opened mid-session, or the widget was recreated) — adopt
    // its state so tracking data flows immediately instead of showing an
    // empty dashboard.
    trance.getCurrentSession?.().then((cur: any) => {
      if (cur && Array.isArray(cur.windows)) {
        setWindows(cur.windows);
        setIsSessionActive(true);
        setIsCalibrating(false);
        setFocusPercentage(100);
      }
    });
  }, []);

  // Break countdown
  useEffect(() => {
    if (!isOnBreak || breakEndTime === 0) return;
    const interval = setInterval(() => {
      setBreakTimeLeft(Math.max(0, breakEndTime - Date.now()));
    }, 100);
    return () => clearInterval(interval);
  }, [isOnBreak, breakEndTime]);

  // Session end → save to history, back to the start screen
  const endSession = () => {
    if (windows.length > 0) {
      const session: SessionData = {
        id: Date.now().toString(36),
        startTime: windows[0]?.timestamp || Date.now(),
        endTime: Date.now(),
        windows,
        focusPercentage,
        driftCount: 0,
        avgFocusStreak: 0,
        taskLabels: [],
      };
      setDebrief(debriefGenRef.current.generate(session));
      setSessionHistory((prev) => [...prev, session]);
    }
    setIsSessionActive(false);
    setWindows([]);
    setFocusPercentage(100);
  };

  // Session start (browser mode — Electron reacts to session-started broadcast)
  const startSession = () => {
    resetForNewSession();
    setIsSessionActive(true);
  };

  // Widget drag — uses screen coordinates consistently, and ignores
  // micro-movement so a plain click never moves the window
  const handleDrag = (e: React.MouseEvent) => {
    let startX = e.screenX;
    let startY = e.screenY;
    let dragging = false;
    const onMove = (me: MouseEvent) => {
      const dx = me.screenX - startX;
      const dy = me.screenY - startY;
      if (!dragging) {
        // A click is never perfectly still — only start dragging after ~4px
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        dragging = true;
      }
      startX = me.screenX;
      startY = me.screenY;
      (window as any).trance?.moveWidget(dx, dy);
    };
    const onUp = () => {
      dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const trance = (window as any).trance;

  // Live session (never requires ending the session) merged with stored history
  const liveSession = useMemo<SessionData>(() => {
    const r = rowFromWindows(windows);
    return {
      id: 'live',
      startTime: windows[0]?.timestamp || Date.now(),
      endTime: Date.now(),
      windows,
      focusPercentage: r.focusPct,
      driftCount: r.driftCount,
      avgFocusStreak: r.avgStreak,
      taskLabels: [],
    };
  }, [windows]);

  const sessions = useMemo<SessionData[]>(
    () => [liveSession, ...sessionHistory],
    [liveSession, sessionHistory]
  );

  // The one-shot tutorial launch opens a dedicated full window. The
  // renderer detects the tutorial hash (#/tutorial) and renders the full
  // tutorial shell immediately, instead of the compact widget.
  if (isTutorial) {
    return (
      <div className="tutorialShell" style={{width: 100 + "vw", height: 100 + "vh", minWidth: 1060, minHeight: 720, maxWidth: "none", maxHeight: "none", overflow: "auto"}}>
        <Onboarding onComplete={completeOnboarding} />
      </div>
    );
  }

  // ---- Views ----
  if (isDashboard) {
    return (
      <>
        <Dashboard
          windows={windows}
          sessions={sessions}
          currentSubject={currentTask}
          themeMode={themeMode}
          reduceMotion={reduceMotion}
          onThemeModeChange={setThemeMode}
          onReduceMotionChange={setReduceMotion}
          onResetPreferences={() => {
            setThemeMode('auto');
            setReduceMotion(false);
          }}
          onResetAllData={async () => {
            if (trance?.resetAllData) {
              trance.resetAllData();
              try {
                localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
              } catch {
                // Storage may be unavailable; the Electron store already
                // cleared onboardingComplete, so the tutorial will still
                // play on a reinstall.
              }
              try {
                window.location.reload();
              } catch {
                window.location.hash = '';
                setIsDashboard(false);
              }
            }
          }}
          onReplayTutorial={replayOnboarding}
          onLoadHistory={async () => {
            if (trance) {
              const history = await trance.getSessionHistory();
              if (history) setSessionHistory(history);
            }
          }}
          onBack={() => {
            if (trance) {
              window.close(); // Close the separate dashboard window
            } else {
              window.location.hash = '';
              setIsDashboard(false);
            }
          }}
        />
        {showOnboarding && !tutorialWelcome && <Onboarding onComplete={completeOnboarding} />}
      </>
    );
  }

  const widget = (
    <CornerWidget
      windows={windows}
      currentWindow={null}
      focusPercentage={focusPercentage}
      isCalibrating={isCalibrating}
      focusLevel={focusLevel}
      calibrationProgress={100}
      isOnBreak={isOnBreak}
      breakTimeLeft={breakTimeLeft}
      nudge={null}
      currentTask={currentTask}
      taskStartTime={taskStartTime}
      savedTasks={savedTasks}
      onDrag={handleDrag}
      onBreakStart={(minutes) => {
        trance?.startBreak(minutes);
        // Set break state locally too — the IPC broadcast is a redundant
        // confirmation, so the timer always starts even if it's slow/broken.
        setTaskStartTime(0);
        setIsOnBreak(true);
        setBreakEndTime(Date.now() + minutes * 60 * 1000);
      }}
      onBreakEnd={() => {
        trance?.endBreak();
        // Same local fallback — end the break even if the broadcast is slow.
        setIsOnBreak(false);
        setBreakEndTime(0);
      }}
      onTaskStop={() => {
        setCurrentTask('No Task');
        setTaskStartTime(0);
      }}
      onTaskLabel={(label) => {
        trance?.setTaskLabel(label);
        if (!trance) {
          setCurrentTask(label);
          setTaskStartTime(Date.now());
          setSavedTasks((prev) => [label, ...prev.filter((t) => t !== label)].slice(0, 5));
        }
      }}
      onRemoveSavedTask={(label) => {
        // Remove from the saved/recent history — the current task is untouched
        setSavedTasks((prev) => prev.filter((t) => t !== label));
      }}
      onOpenDashboard={() => {
        if (trance) {
          // Electron: the dashboard is a separate window — the widget must stay put
          trance.openDashboard();
        } else {
          // Browser preview: no separate window exists, show it inline
          window.location.hash = '#/dashboard';
          setIsDashboard(true);
        }
      }}
      isSessionActive={isSessionActive}
      focusedMs={focusedSecRef.current * 1000}
      distractedMs={distractedSecRef.current * 1000}
      breakMs={breakSecRef.current * 1000}
      onStartSession={() => {
        trance?.startSession();
        if (!trance) startSession();
      }}
      onEndSession={() => {
        endSession();
        trance?.endSession();
      }}
      onEndSessionAndShowTrends={() => {
        endSession();
        trance?.endSession();
        if (trance) {
          // Electron: open the separate dashboard window showing the session summary
          trance.openDashboard('summary');
        } else {
          // Browser preview: show it inline as the session summary
          window.location.hash = '#/dashboard?tab=summary';
          setIsDashboard(true);
        }
      }}
      onQuit={() => {
        if (trance) {
          // Electron: fully quit — tray included
          trance.quitApp();
        } else {
          // Browser preview: try to close the tab
          window.close();
        }
      }}
      onSetFocusMode={(on) => {
        // Electron: resize the widget window to the compact status pill
        trance?.setFocusMode?.(on);
      }}
      onWidgetHover={(on) => {
        // Electron: expand/collapse the widget vertically on hover
        trance?.setWidgetExpanded?.(on);
      }}
      showTutorialWelcome={showOnboarding}
      onStartTutorial={startOnboarding}
      onSkipTutorial={completeOnboarding}
    />
  );

  return <>{widget}</>;
}
