import { screen, powerMonitor, BrowserWindow } from 'electron';
import { execFile } from 'child_process';

interface RawTrackingSample {
  cursorX: number;
  cursorY: number;
  idleSeconds: number;
  timestamp: number;
  velocity: number;
  clickCount: number;
  isVideoWatching: boolean;
}

let trackingInterval: NodeJS.Timeout | null = null;
let lastCursorPos = { x: 0, y: 0 };
let lastTimestamp = Date.now();
let clickCount = 0;
let latestSample: RawTrackingSample | null = null;
let foregroundCheckInFlight = false;
let isVideoWatching = false;

const VIDEO_TITLE_PATTERN = /youtube|netflix|hulu|twitch|disney\+|prime video|amazon video|max\s*\||hbomax|vimeo|pluto tv|peacock|paramount\+|vlc|media player|potplayer|mpv|video playback|watching video/i;
const VIDEO_PROCESS_PATTERN = /vlc|wmplayer|mpv|potplayer|iina|quicktimeplayer|chrome|msedge|firefox/i;

function refreshVideoState(): void {
  if (foregroundCheckInFlight) return;
  foregroundCheckInFlight = true;

  const script = [
    '$sig = \'[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);\'',
    'Add-Type -MemberDefinition $sig -Name NativeMethods -Namespace Trance',
    '$h = [Trance.NativeMethods]::GetForegroundWindow()',
    '$sb = New-Object System.Text.StringBuilder 512',
    '[Trance.NativeMethods]::GetWindowText($h, $sb, $sb.Capacity) | Out-Null',
    '$pid = 0',
    '[Trance.NativeMethods]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null',
    '$p = Get-Process -Id $pid -ErrorAction SilentlyContinue',
    'if ($p) { Write-Output ($sb.ToString() + "`t" + $p.ProcessName) } else { Write-Output $sb.ToString() }',
  ].join('; ');

  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 800 }, (error, stdout) => {
    if (!error) {
      const [title = '', processName = ''] = stdout.trim().split(/\r?\n|\t/);
      isVideoWatching = VIDEO_TITLE_PATTERN.test(title) || VIDEO_PROCESS_PATTERN.test(processName);
    }
    foregroundCheckInFlight = false;
  });
}

export function startTracking(mainWindow: BrowserWindow): void {
  // Initialize position
  const pos = screen.getCursorScreenPoint();
  lastCursorPos = { x: pos.x, y: pos.y };
  lastTimestamp = Date.now();

  // Poll every 500ms. Foreground video detection runs asynchronously so the
  // tracker never blocks cursor/idle sampling on a PowerShell call.
  trackingInterval = setInterval(() => {
    refreshVideoState();
    const now = Date.now();
    const cursorPos = screen.getCursorScreenPoint();

    // Calculate velocity (pixels per second) — informational only
    const dt = (now - lastTimestamp) / 1000;
    const dx = cursorPos.x - lastCursorPos.x;
    const dy = cursorPos.y - lastCursorPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const velocity = dt > 0 ? distance / dt : 0;

    // Use the OS's own idle timer as the authoritative signal.
    // It resets only on REAL input events (mouse move, click, keypress),
    // so our polling can never cause false movement detection.
    const idleSeconds = powerMonitor.getSystemIdleTime();

    latestSample = {
      cursorX: cursorPos.x,
      cursorY: cursorPos.y,
      idleSeconds,
      timestamp: now,
      velocity,
      clickCount,
      isVideoWatching,
    };

    lastCursorPos = { x: cursorPos.x, y: cursorPos.y };
    lastTimestamp = now;
    clickCount = 0;
  }, 500);
}

export function stopTracking(): void {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
}

export function getTrackingData(): RawTrackingSample | null {
  return latestSample;
}

// Export click increment for when we add mouse button detection
export function recordClick(): void {
  clickCount++;
}
