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

export interface SessionData {
  id: string;
  startTime: number;
  endTime: number;
  windows: WindowData[];
  focusPercentage: number;
  driftCount: number;
  avgFocusStreak: number;
  taskLabels: string[];
  name?: string;
}

export interface TrackingData {
  cursorX: number;
  cursorY: number;
  idleSeconds: number;
  timestamp: number;
  velocity: number;
  clickCount: number;
  isVideoWatching?: boolean;
}

export interface Nudge {
  message: string;
  severity: 'mild' | 'moderate';
  timestamp: number;
}

export interface DebriefInsight {
  text: string;
  type: 'stat' | 'pattern' | 'suggestion';
}
