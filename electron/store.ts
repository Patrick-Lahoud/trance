import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { execFileSync } from 'child_process';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
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

interface StoredData {
  sessions: SessionData[];
  preferences?: {
    onboardingComplete?: boolean;
  };
}

export class SessionStore {
  private dataPath: string;
  private data: StoredData;
  private currentSession: SessionData | null = null;
  private taskLabels: string[] = [];

  constructor() {
    const userDataPath = app.getPath('userData');
    this.dataPath = path.join(userDataPath, 'trance-sessions.json');
    this.data = this.load();
    // No session until the user explicitly starts one via startSession()
  }

  startSession(): SessionData {
    this.currentSession = {
      id: generateId(),
      startTime: Date.now(),
      endTime: 0,
      windows: [],
      focusPercentage: 0,
      driftCount: 0,
      avgFocusStreak: 0,
      taskLabels: [],
    };
    return this.currentSession;
  }

  private load(): StoredData {
    try {
      if (fs.existsSync(this.dataPath)) {
        const raw = fs.readFileSync(this.dataPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {
      // Corrupted file, start fresh
    }
    return { sessions: [] };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('Failed to save session data:', err);
    }
  }

  addWindow(windowData: WindowData): void {
    if (this.currentSession) {
      this.currentSession.windows.push(windowData);
    }
  }

  addTaskLabel(label: string): void {
    if (!this.currentSession) return; // No session — ignore task labels
    this.taskLabels.push(label);
    this.currentSession.taskLabels.push(label);
  }

  getCurrentSession(): SessionData | null {
    return this.currentSession;
  }

  saveSession(sessionData: SessionData): void {
    sessionData.endTime = Date.now();
    sessionData.taskLabels = [...this.taskLabels];

    // Calculate stats
    const nonBreakWindows = sessionData.windows.filter((w) => !w.isBreak);
    if (nonBreakWindows.length > 0) {
      const focusedCount = nonBreakWindows.filter(
        (w) => w.state === 'focused'
      ).length;
      sessionData.focusPercentage = Math.round(
        (focusedCount / nonBreakWindows.length) * 100
      );

      // Count lapse episodes (consecutive non-focused windows)
      let driftCount = 0;
      let inLapse = false;
      for (const w of nonBreakWindows) {
        if (w.state !== 'focused') {
          if (!inLapse) {
            driftCount++;
            inLapse = true;
          }
        } else {
          inLapse = false;
        }
      }
      sessionData.driftCount = driftCount;

      // Average focus streak length
      let streaks: number[] = [];
      let currentStreak = 0;
      for (const w of nonBreakWindows) {
        if (w.state === 'focused') {
          currentStreak++;
        } else {
          if (currentStreak > 0) {
            streaks.push(currentStreak);
          }
          currentStreak = 0;
        }
      }
      if (currentStreak > 0) streaks.push(currentStreak);
      sessionData.avgFocusStreak =
        streaks.length > 0
          ? Math.round(
              (streaks.reduce((a, b) => a + b, 0) / streaks.length) * 10
            ) / 10
          : 0;
    }

    this.data.sessions.push(sessionData);
    this.save();
    this.currentSession = null;
    this.taskLabels = [];
  }

  renameSession(id: string, name: string): void {
    // Rename an in-progress session (carries to saveSession) or a stored one
    if (this.currentSession && this.currentSession.id === id) {
      this.currentSession.name = name;
      return;
    }
    const session = this.data.sessions.find((s) => s.id === id);
    if (session) {
      session.name = name;
      this.save();
    }
  }

  deleteSession(id: string): void {
    // Never delete the in-progress session
    if (this.currentSession && this.currentSession.id === id) return;
    const idx = this.data.sessions.findIndex((s) => s.id === id);
    if (idx >= 0) {
      this.data.sessions.splice(idx, 1);
      this.save();
    }
  }

  isOnboardingComplete(): boolean {
    return this.data.preferences?.onboardingComplete === true;
  }

  resetOnboardingFromInstaller(): void {
    if (process.platform !== 'win32') return;
    try {
      const value = execFileSync('reg.exe', ['query', 'HKCU\\Software\\Trance', '/v', 'RunTutorial'], { encoding: 'utf8', windowsHide: true });
      if (!/RunTutorial\s+REG_DWORD\s+0x1/i.test(value)) return;
      this.data.preferences = { ...this.data.preferences, onboardingComplete: false };
      this.save();
      execFileSync('reg.exe', ['delete', 'HKCU\\Software\\Trance', '/v', 'RunTutorial', '/f'], { windowsHide: true, stdio: 'ignore' });
    } catch {
      // The flag is optional and may not exist outside an installer launch.
    }
  }

  setOnboardingComplete(complete: boolean): void {
    this.data.preferences = {
      ...this.data.preferences,
      onboardingComplete: complete,
    };
    this.save();
  }

  getSessionHistory(): SessionData[] {
    return this.data.sessions;
  }

  getSessionsForTrends(): SessionData[] {
    // Return last 30 sessions for trends view
    return this.data.sessions.slice(-30);
  }

  readTranceRunTutorialMarker(): boolean {
    if (process.platform !== 'win32') return false;
    try {
      const markerPath = path.join(app.getPath('userData'), '.trance-run-tutorial');
      return fs.existsSync(markerPath);
    } catch {
      return false;
    }
  }

  clearTranceRunTutorialMarker(): void {
    if (process.platform !== 'win32') return;
    try {
      const markerPath = path.join(app.getPath('userData'), '.trance-run-tutorial');
      if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
    } catch {
      // Best-effort cleanup.
    }
  }

  clearTutorialRequestFile(): void {
    if (process.platform !== 'win32') return;
    try {
      const markerPath = path.join(app.getPath('userData'), '.tutorialRequest');
      if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
    } catch {
      // Best-effort cleanup.
    }
  }

  deleteRegistryRunTutorialFlag(): void {
    if (process.platform !== 'win32') return;
    try {
      execFileSync('reg.exe', ['delete', 'HKCU\\Software\\Trance', '/v', 'RunTutorial', '/f'], { windowsHide: true, stdio: 'ignore' });
    } catch {
      // The registry flag is optional and may not exist.
    }
  }

  // Complete reset: wipes session history, current/pending session state,
  // and onboarding so the tutorial will play on the next launch (including
  // after a reinstall when the user explicitly chooses a full reset).
  resetAllData(): void {
    this.data = { sessions: [] };
    this.currentSession = null;
    this.taskLabels = [];
    this.data.preferences = {
      ...this.data.preferences,
      onboardingComplete: false,
    };
    this.save();

    // Also purge any installer launch markers the app may have left in the
    // user data folder. This makes a post-reset reinstall reliably treat the
    // next launch as a first-run tutorial again.
    this.clearTranceRunTutorialMarker();
    this.clearTutorialRequestFile();
    this.deleteRegistryRunTutorialFlag?.();
  }

  // Optional helper for the renderer to also clear the renderer-side
  // onboarding flag in localStorage as part of a full reset.
  async clearRendererOnboardingFlag(): Promise<void> {
    // The main process cannot touch renderer localStorage; the renderer
    // handles that itself when it receives the reset signal.
  }
}
