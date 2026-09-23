import { contextBridge, ipcRenderer } from 'electron';

export interface TrackingData {
  cursorX: number;
  cursorY: number;
  idleSeconds: number;
  timestamp: number;
  velocity: number;
  clickCount: number;
  isVideoWatching?: boolean;
}

export interface SessionHistoryEntry {
  id: string;
  startTime: number;
  endTime: number;
  windows: WindowData[];
  focusPercentage: number;
  driftCount: number;
  avgFocusStreak: number;
  taskLabels: string[];
}

export interface WindowData {
  timestamp: number;
  velocity: number;
  idlePercent: number;
  clickRate: number;
  state: 'focused' | 'restless' | 'idle' | 'erratic';
  zScore: number;
  isBreak: boolean;
  taskLabel?: string;
}

contextBridge.exposeInMainWorld('trance', {
  // Tracking
  onTrackingUpdate: (callback: (data: TrackingData) => void) => {
    ipcRenderer.on('tracking-update', (_event, data) => callback(data));
  },

  // Break controls
  startBreak: (durationMinutes: number) => {
    ipcRenderer.send('start-break', durationMinutes);
  },
  onBreakStarted: (callback: (durationMinutes: number) => void) => {
    ipcRenderer.on('break-started', (_event, duration) => callback(duration));
  },
  endBreak: () => {
    ipcRenderer.send('end-break');
  },
  onBreakEnded: (callback: () => void) => {
    ipcRenderer.on('break-ended', () => callback());
  },

  // Task labeling
  setTaskLabel: (label: string) => {
    ipcRenderer.send('task-label', label);
  },
  onTaskLabeled: (callback: (label: string) => void) => {
    ipcRenderer.on('task-labeled', (_event, label) => callback(label));
  },

  // Navigation
  openDashboard: (tab?: string) => {
    ipcRenderer.send('open-dashboard', tab);
  },
  // Open the tutorial in its own full-size window (like the Dashboard)
  openTutorial: () => {
    ipcRenderer.send('open-tutorial');
  },
  onDashboardTab: (callback: (tab: string) => void) => {
    ipcRenderer.on('dashboard-tab', (_event, tab) => callback(tab));
  },

  // Persist a window sample
  recordWindow: (win: WindowData) => {
    ipcRenderer.send('record-window', win);
  },

  // First-launch tutorial
  completeOnboarding: () => {
    ipcRenderer.send('onboarding-complete');
  },

  // Session
  startSession: () => {
    ipcRenderer.send('start-session');
  },
  onSessionStarted: (callback: () => void) => {
    ipcRenderer.on('session-started', () => callback());
  },
  endSession: () => {
    ipcRenderer.send('end-session');
  },
  renameSession: (id: string, name: string) => {
    ipcRenderer.send('rename-session', id, name);
  },
  deleteSession: (id: string) => {
    ipcRenderer.send('delete-session', id);
  },
  onSessionEnded: (callback: () => void) => {
    ipcRenderer.on('session-ended', () => callback());
  },

  // Full reset
  resetAllData: () => {
    ipcRenderer.send('reset-all-data');
  },

  // Data access
  getSessionHistory: (): Promise<SessionHistoryEntry[]> => {
    return ipcRenderer.invoke('get-session-history');
  },
  getCurrentSession: (): Promise<SessionHistoryEntry | null> => {
    return ipcRenderer.invoke('get-current-session');
  },
  getTrackingData: (): Promise<TrackingData> => {
    return ipcRenderer.invoke('get-tracking-data');
  },
  getSessionsForTrends: (): Promise<SessionHistoryEntry[]> => {
    return ipcRenderer.invoke('get-sessions-for-trends');
  },

  // Widget drag
  moveWidget: (deltaX: number, deltaY: number) => {
    ipcRenderer.send('move-widget', deltaX, deltaY);
  },

  // Focus mode — resize the widget to the compact status pill
  setFocusMode: (on: boolean) => {
    ipcRenderer.send('focus-mode', on);
  },

  // Hover expand — grow/shrink the widget vertically
  setWidgetExpanded: (on: boolean) => {
    ipcRenderer.send('widget-expanded', on);
  },

  // Fully quit the app (tray included)
  quitApp: () => {
    ipcRenderer.send('quit-app');
  },

  removeTutorialRequestFile: () => {
    ipcRenderer.send('remove-tutorial-request-file');
  },
});

