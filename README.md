# Trance

**Trance is an open-source desktop focus companion built for Windows using Electron, React, and TypeScript. It utilizes OS-level idle timers to provide activity-aware attention feedback.**

It runs as a small always-on-top widget in the corner of your screen, quietly
watching your activity signals while you work and letting you know the moment
your attention begins to leave the task. The interface is deliberately quiet:
near-black surfaces, white type, Inter, and task colors that appear only when
they mean something.

## Highlights

- **Activity-aware widget** (`src/components/CornerWidget.tsx`) - a 300x190
  always-on-top React widget that watches input recency and cursor movement,
  and walks through focused / warning / unfocused states as your attention
  drifts. Sessions, tasks, and breaks are one click away.
- **OS-level idle detection** (`electron/tracker.ts`) - interfaces with
  Windows idle APIs and foreground-window signals from the Electron main
  process. No screen reading, no keystroke logging; video detection uses
  window titles only.
- **Analysis dashboard** (`src/components/Dashboard.tsx`) - a recharts-based
  analytics window: efficiency timelines, insights, and long-term trends with
  a 3-session moving average, computed and rendered entirely from local data.
- **Local-first storage** (`electron/store.ts`) - sessions persist to a local
  JSON store. Nothing leaves the machine.
- **Open-source website** (`site-b/`) - a dependency-free static site built
  with vanilla JS and hand-drawn SVG charts, deployable to GitHub Pages.

## Tech stack

| Layer      | Technology                                    |
| ---------- | --------------------------------------------- |
| Shell      | Electron 28 (main process in TypeScript)      |
| UI         | React 18 + TypeScript, CSS Modules            |
| Charts     | Recharts                                      |
| Build      | Vite 5, electron-builder (NSIS target)        |
| Website    | Vanilla HTML/CSS/JS + hand-rolled SVG charts  |

## Getting started

```bash
npm install
npm run dev            # Vite dev server
npm run electron:dev   # full Electron app with hot reload
npm run electron:build # builds the Windows NSIS installer
```

Requires Node 18+ and Windows 10/11.

## Project structure

```
├── electron/           # main process: tracker, store, preload bridge
├── src/                # React renderer: widget, dashboard, onboarding, ML
├── scripts/            # icon generation
├── site-b/             # the static promotional website (GitHub Pages)
└── public/             # static assets (app icon)
```

## Privacy

Trance is fully local. Activity signals are processed in memory, sessions are
stored in a local JSON file, and no telemetry, accounts, or network calls are
involved. See the privacy policy in `public/privacy-policy.html`.

## License

MIT
