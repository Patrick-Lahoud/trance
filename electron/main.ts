import { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import zlib from 'zlib';
import { startTracking, stopTracking, getTrackingData } from './tracker';
import { SessionStore } from './store';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: SessionStore;
let isQuitting = false;
let widgetResizeAnim: ReturnType<typeof setInterval> | null = null;

const WIDGET_WIDTH = 300;
const WIDGET_HEIGHT = 190;
// Collapsed (idle) height — the widget grows to WIDGET_HEIGHT on hover
const COLLAPSED_WIDGET_HEIGHT = 135;
// Compact size used while focus mode is active — just the status word
const COMPACT_WIDGET_WIDTH = 140;
const COMPACT_WIDGET_HEIGHT = 48;
const DASHBOARD_WIDTH = 800;
const DASHBOARD_HEIGHT = 600;
const TUTORIAL_WIDTH = 1060;
const TUTORIAL_HEIGHT = 720;

let tutorialWindowMode = false;
let tutorialRestoreBounds: Electron.Rectangle | null = null;

// ---------- App icon ----------
// Multi-size ICO (16→256px) shipped in dist/ (vite copies public/icon.ico).
// Each size is rendered at native resolution with anti-aliasing, so the icon
// stays crisp (vector-like) in the tray and taskbar.
function iconPath(): string {
  return path.join(app.getAppPath(), 'dist', 'icon.ico');
}

// Fallback icon generator (no external assets) used only if the ICO can't
// be loaded — monochrome circle with a white center dot.
const BRAND_R = 10;
const BRAND_G = 10;
const BRAND_B = 10;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Builds a valid RGBA PNG of a blue circle with a white center dot
function iconPng(size: number): Buffer {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.46;
  const innerR = size * 0.22;
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= innerR) {
        raw[o++] = 255; raw[o++] = 255; raw[o++] = 255; raw[o++] = 255;
      } else if (dist <= outerR) {
        // Anti-aliased edge
        const edge = Math.max(0, Math.min(1, outerR - dist + 0.5));
        raw[o++] = BRAND_R; raw[o++] = BRAND_G; raw[o++] = BRAND_B;
        raw[o++] = Math.round(255 * edge);
      } else {
        raw[o++] = 0; raw[o++] = 0; raw[o++] = 0; raw[o++] = 0;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeTrayImage(): Electron.NativeImage {
  // Preferred: the multi-size ICO (Electron picks the right tray size)
  const ico = nativeImage.createFromPath(iconPath());
  if (!ico.isEmpty()) return ico;
  // Fallback: runtime-generated circle
  const img = nativeImage.createFromBuffer(iconPng(32));
  img.addRepresentation({ scaleFactor: 1, buffer: iconPng(16) });
  return img;
}

function createTutorialWindow(quitOnClose = false): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const window = new BrowserWindow({
    width: Math.min(TUTORIAL_WIDTH, screenWidth - 32),
    height: Math.min(TUTORIAL_HEIGHT, screenHeight - 32),
    x: Math.round((screenWidth - Math.min(TUTORIAL_WIDTH, screenWidth - 32)) / 2),
    y: Math.round((screenHeight - Math.min(TUTORIAL_HEIGHT, screenHeight - 32)) / 2),
    title: 'Trance Tutorial',
    backgroundColor: '#000000',
    show: false,
    resizable: true,
    minWidth: 720,
    minHeight: 480,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const indexPath = path.join(__dirname, '../dist/index.html');
  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/tutorial`);
  } else {
    window.loadURL(`file://${indexPath}#/tutorial`);
  }

  window.once('ready-to-show', () => window.show());

  window.on('closed', () => {
    // One-shot first-launch tutorial: when it is closed, quit the app so the
    // normal launcher can start Trance as the widget next time.
    if (quitOnClose) app.quit();
  });

  return window;
}

function createWidgetWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  tutorialWindowMode = false;
  const width = WIDGET_WIDTH;
  const height = WIDGET_HEIGHT;
  const x = screenWidth - width - 16;
  const y = screenHeight - height - 16;

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Dev or prod URL
  function loadAppHtml(window: BrowserWindow): void {
    if (process.env.VITE_DEV_SERVER_URL) {
      window.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      window.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Never destroy the widget window — hide it instead so it can always be
  // restored from the tray. This prevents the widget from "disappearing".
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Crash recovery — a transparent window with a dead renderer is completely
  // invisible (no content, no border), so if the renderer ever crashes, tear
  // the window down and recreate it with a fresh renderer at the same spot.
  // Otherwise the widget looks "hidden forever" even from the tray.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (isQuitting) return;
    console.error('Widget renderer crashed:', details.reason);
    const pos = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getPosition() : undefined;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy(); // fires 'closed' → mainWindow = null
    } else {
      mainWindow = null;
    }
    const rebuilt = createWidgetWindow();
    if (pos && rebuilt) rebuilt.setPosition(pos[0], pos[1]);
  });

  // If the renderer hangs, reload it instead of leaving a frozen widget
  mainWindow.webContents.on('unresponsive', () => {
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  });

  return mainWindow;
}

function createTray(): void {
  tray = new Tray(makeTrayImage());
  tray.setToolTip('Trance — Focus Tracker');

  const showWidget = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // A crashed renderer in a transparent window shows nothing — recreate
      // the widget so it actually comes back instead of "showing" a blank.
      if (mainWindow.webContents.isCrashed()) {
        const [x, y] = mainWindow.getPosition();
        mainWindow.destroy();
        mainWindow = null;
        const rebuilt = createWidgetWindow();
        if (rebuilt) rebuilt.setPosition(x, y);
        return;
      }
      // Guard against off-screen positions (bad drags, display changes) so the
      // widget can never be lost permanently — requires the FULL widget to be
      // within the work area
      const [x, y] = mainWindow.getPosition();
      const wa = screen.getPrimaryDisplay().workArea;
      const onScreen =
        x >= wa.x &&
        y >= wa.y &&
        x + WIDGET_WIDTH <= wa.x + wa.width &&
        y + WIDGET_HEIGHT <= wa.y + wa.height;
      if (!onScreen) {
        mainWindow.setPosition(
          wa.x + wa.width - WIDGET_WIDTH - 16,
          wa.y + wa.height - WIDGET_HEIGHT - 16
        );
      }
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWidgetWindow();
    }
  };

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Widget',
      click: showWidget,
    },
    {
      label: 'Open Dashboard',
      click: () => openDashboard(),
    },
    { type: 'separator' },
    {
      label: 'Quit Trance',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', showWidget);
}

function openDashboard(tab?: string): void {
  const existing = BrowserWindow.getAllWindows().find(
    (w) => w.getTitle() === 'Trance Dashboard'
  );
  if (existing) {
    if (tab) existing.webContents.send('dashboard-tab', tab);
    existing.focus();
    return;
  }

  const dashboard = new BrowserWindow({
    width: 760,
    height: 620,
    minWidth: 560,
    minHeight: 380,
    title: 'Trance Dashboard',
    backgroundColor: '#1A1B1E',
    show: false,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  dashboard.once('ready-to-show', () => {
    if (!dashboard.isDestroyed()) dashboard.show();
  });

  // Default to a non-fullscreen, non-maximized window. The renderer scrolls
  // internally so the settings popup and all dashboard content stay usable in a
  // smaller window.
  dashboard.setFullScreen(false);


  dashboard.on('closed', () => {
    if (dashboard === mainWindow) mainWindow = null;
  });

  const dashHash = tab ? `/dashboard?tab=${tab}` : '/dashboard';
  if (process.env.VITE_DEV_SERVER_URL) {
    dashboard.loadURL(`${process.env.VITE_DEV_SERVER_URL}#${dashHash}`);
  } else {
    dashboard.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: dashHash,
    });
  }
}

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  }
}

function setupIPC(): void {
  // First-launch tutorial completion. The renderer also stores this in
  // localStorage, while the main process uses the store to choose the native
  // window size before the first renderer frame is shown.
  ipcMain.on('launch-tutorial-request', () => {
    // This channel is only sent once after the first load.
  });

  ipcMain.on('remove-tutorial-request-file', () => {
    store.clearTutorialRequestFile();
  });


  ipcMain.on('onboarding-complete', () => {
    store.setOnboardingComplete(true);
    store.clearTranceRunTutorialMarker();
    if (!tutorialWindowMode || !mainWindow || mainWindow.isDestroyed()) return;

    const restore = tutorialRestoreBounds;
    tutorialWindowMode = false;
    tutorialRestoreBounds = null;
    const primaryDisplay = screen.getPrimaryDisplay();
    const wa = primaryDisplay.workArea;
    const bounds = restore ?? {
      x: wa.x + wa.width - WIDGET_WIDTH - 16,
      y: wa.y + wa.height - WIDGET_HEIGHT - 16,
      width: WIDGET_WIDTH,
      height: WIDGET_HEIGHT,
    };
    mainWindow.setBounds({
      x: Math.min(Math.max(bounds.x, wa.x), wa.x + wa.width - WIDGET_WIDTH),
      y: Math.min(Math.max(bounds.y, wa.y), wa.y + wa.height - WIDGET_HEIGHT),
      width: WIDGET_WIDTH,
      height: WIDGET_HEIGHT,
    });
  });

  // Widget controls
  ipcMain.on('start-break', (_event, durationMinutes: number) => {
    broadcast('break-started', durationMinutes);
  });

  ipcMain.on('end-break', () => {
    broadcast('break-ended');
  });

  ipcMain.on('task-label', (_event, label: string) => {
    store.addTaskLabel(label);
    broadcast('task-labeled', label);
  });

  ipcMain.on('open-dashboard', (_event, tab?: string) => {
    openDashboard(typeof tab === 'string' ? tab : undefined);
  });

  // Open the tutorial in its own full-size window — the same way the
  // Dashboard button opens a separate window. Works from the widget's
  // "Start tutorial" screen and from Settings > Replay tutorial.
  ipcMain.on('open-tutorial', () => {
    const existing = BrowserWindow.getAllWindows().find(
      (w) => w.getTitle() === 'Trance Tutorial'
    );
    if (existing) {
      existing.focus();
      return;
    }
    createTutorialWindow(false);
  });

  ipcMain.on('start-session', () => {
    store.startSession();
    broadcast('session-started');
  });

  ipcMain.on('rename-session', (_event, id: string, name: string) => {
    if (typeof id === 'string' && typeof name === 'string' && name.trim()) {
      store.renameSession(id, name.trim());
    }
  });

  ipcMain.on('delete-session', (_event, id: string) => {
    if (typeof id === 'string') {
      store.deleteSession(id);
    }
  });

  ipcMain.on('end-session', () => {
    const sessionData = store.getCurrentSession();
    if (sessionData && sessionData.windows.length > 0) {
      store.saveSession(sessionData);
    }
    broadcast('session-ended');
  });

  // Full reset — clears session history, preferences, and onboarding
  ipcMain.on('reset-all-data', () => {
    if (store) store.resetAllData();
    broadcast('session-ended');
  });

  // Fully quit the app — from the widget's quit button, tray included
  ipcMain.on('quit-app', () => {
    isQuitting = true;
    app.quit();
  });

  // Dashboard data requests
  ipcMain.handle('get-session-history', () => {
    return store.getSessionHistory();
  });

  ipcMain.handle('get-current-session', () => {
    return store.getCurrentSession();
  });

  ipcMain.handle('get-tracking-data', () => {
    return getTrackingData();
  });

  ipcMain.handle('get-sessions-for-trends', () => {
    return store.getSessionsForTrends();
  });

  // Full reset — clears session history, current session, and onboarding
  ipcMain.on('reset-all-data', () => {
    if (store) store.resetAllData();
  });

  // Persist a window sample (only the widget window records)
  ipcMain.on('record-window', (event, windowData: unknown) => {
    if (event.sender === mainWindow?.webContents) {
      store.addWindow(windowData as never);
    }
  });

  // Focus mode — shrink the widget to a compact status pill and back,
  // anchored at the bottom-right corner so it stays visually in place
  ipcMain.on('focus-mode', (_event, on: boolean) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    const w = on ? COMPACT_WIDGET_WIDTH : WIDGET_WIDTH;
    const h = on ? COMPACT_WIDGET_HEIGHT : WIDGET_HEIGHT;
    const dw = WIDGET_WIDTH - w;
    const dh = WIDGET_HEIGHT - h;
    let newX = on ? x + dw : x - dw;
    let newY = on ? y + dh : y - dh;
    const wa = screen.getPrimaryDisplay().workArea;
    newX = Math.min(Math.max(newX, wa.x), wa.x + wa.width - w);
    newY = Math.min(Math.max(newY, wa.y), wa.y + wa.height - h);
    mainWindow.setBounds({
      x: Math.round(newX),
      y: Math.round(newY),
      width: w,
      height: h,
    });
  });

  // Hover expand — animate the normal widget height. Tutorial welcome and
  // onboarding are rendered inside the persistent widget window.
  ipcMain.on('widget-expanded', (_event, on: boolean) => {
    if (tutorialWindowMode || !mainWindow || mainWindow.isDestroyed()) return;
    const target = on ? WIDGET_HEIGHT : COLLAPSED_WIDGET_HEIGHT;

    if (widgetResizeAnim) {
      clearInterval(widgetResizeAnim);
      widgetResizeAnim = null;
    }

    const wa = screen.getPrimaryDisplay().workArea;
    const start = mainWindow.getBounds();
    const startH = start.height;
    const startX = start.x;
    const bottom = start.y + startH;
    const delta = target - startH;
    if (delta === 0) return;

    const t0 = Date.now();
    const duration = 240;
    widgetResizeAnim = setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        if (widgetResizeAnim) clearInterval(widgetResizeAnim);
        widgetResizeAnim = null;
        return;
      }
      const t = Math.min(1, (Date.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 5);
      const h = Math.round(startH + delta * eased);
      const y = Math.min(Math.max(Math.round(bottom - h), wa.y), wa.y + wa.height - h);
      mainWindow.setBounds({ x: startX, y, width: WIDGET_WIDTH, height: h });
      if (t >= 1) {
        if (widgetResizeAnim) clearInterval(widgetResizeAnim);
        widgetResizeAnim = null;
      }
    }, 16);
  });

  // Move widget — clamped so the widget can never be pushed off-screen
  ipcMain.on('move-widget', (_event, deltaX: number, deltaY: number) => {
    if (!mainWindow) return;
    const [x, y] = mainWindow.getPosition();
    const wa = screen.getPrimaryDisplay().workArea;
    const newX = Math.min(Math.max(x + deltaX, wa.x), wa.x + wa.width - WIDGET_WIDTH);
    const newY = Math.min(Math.max(y + deltaY, wa.y), wa.y + wa.height - WIDGET_HEIGHT);
    mainWindow.setPosition(Math.round(newX), Math.round(newY));
  });
}

app.whenReady().then(() => {
  store = new SessionStore();

  // A leftover installer marker no longer forces a separate tutorial window;
  // the widget itself shows "Start tutorial" until onboarding is complete.
  // Still clear it so it never lingers.
  store.clearTranceRunTutorialMarker();
  store.clearTutorialRequestFile();

  setupIPC();

  createWidgetWindow();
  createTray();
  startTracking(mainWindow!);


  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWidgetWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep running in the tray — the widget can always be restored from there
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  stopTracking();
  // Persist any in-progress session so no tracked data is ever lost
  const sessionData = store?.getCurrentSession();
  if (sessionData && sessionData.windows.length > 0) {
    store.saveSession(sessionData);
  }
});

// Periodic data push to ALL windows (widget + dashboard) — every 1s
setInterval(() => {
  const data = getTrackingData();
  if (data) {
    broadcast('tracking-update', data);
  }
}, 1000);
