# Trance Promotional Website (docs)

A production-ready, dependency-free promotional site for **Trance**, the Windows
focus companion. Built as a fully isolated static site in `docs/`; nothing
outside this folder was modified.

## Run / deploy

Static files only, no build step, no dependencies.

```bash
# local preview
npx http-server docs -p 8080 -c-1
# → http://127.0.0.1:8080
```

Deploy the `docs/` folder to any static host (Vercel, Netlify, GitHub Pages,
S3, nginx). To ship the installer from the site, copy the built
`release/Trance Setup 1.0.0.exe` next to `index.html` as `Trance-Setup-1.0.0.exe`
(the download buttons already point there and fall back to `#download`).

## Why it matches the product

Everything on this site is ported from the actual application source rather
than invented:

- **Official icon** — the orbit-ring + satellite-dot geometry from
  `scripts/generate-icon.js` (rounded near-black square, white ring at 53%
  height, satellite dot at 45°) is reproduced as inline SVG and as the favicon
  (`assets/icon.svg`).
- **Design tokens** — Inter 400/500/600 only, near-black `#050505`/`#0A0A0A`
  surfaces, `#888` secondary text, 1px `#1A1A1A` borders, 50px pill
  buttons/inputs, 12–20px card radii, `tabular-nums` on every live number.
- **Task colors as data** — the exact palette from
  `src/components/Dashboard.tsx` (`#4A9EFF #FF6BB5 #FFB86B #6BFFB2 #9B8AFF
  #FF6B6B #6BFFEF #FFD76B`), with `#555555` for breaks and white for "No
  Task". Colors appear only when they mean something.
- **Widget replica** — 300×190px, 16px radius, focus pill 140×48/12px,
  hover-expand tab bar, Overview/Task/Break tabs, start screen wording
  ("Trance · Ready when you are · Start Trance session"), break screen
  ("BREAK · timer · I'm back"), focus pill ("FOCUSED/UNFOCUSED · task"), state
  borders (`#FFB800` warning, `#FF4444` unfocused) — all mirroring
  `CornerWidget.tsx` and its CSS module.
- **Real behavior** — picking a task applies it and slides back to the
  Overview tab exactly like the app; the Task tab shows the active-task box
  with a stop button plus "New task..." input and Recent-task chips; Break has
  the six presets plus the h:m custom row with a Go button; breaks never count
  against efficiency; activity-aware states go focused → warning (yellow) →
  unfocused (red) → recover.
- **Dashboard** — the "Trance Analysis" window: custom title bar, Back /
  Settings header row, full-width Timeline / Insights / Trends tab row with
  underline indicator. Timeline shows RangeCards ("Total timeline" and "Last
  hour") with samples + duration meta, Efficiency / Break / Break-time stats,
  a segmented task-colored bar and the efficiency area chart with gray break
  bands and dashed task transitions. Insights shows the app's subject table
  plus time and efficiency comparisons in task/semantic colors. Trends shows
  the four summary stats (Sessions, Total tracked, Best session, Direction),
  the efficiency line with the dashed blue 3-session moving average, red/green/
  violet bar charts (lapse episodes, avg focus streak, session duration),
  efficiency-by-hour bars in the app's semantic colors, the Task Mastery
  table, and the expandable All Sessions list. Every number is derived from
  the same generated session rows that draw the charts.
- **Copy accuracy** — activity-aware attention feedback; signals only (input
  recency, cursor movement, foreground window title for video detection);
  no screen reading, no keystroke logging, nothing medical, no AI claims.

## Accessibility & motion

- Semantic landmarks, one H1, skip-link, focusable step list, `role="img"` +
  labels on charts.
- `prefers-reduced-motion: reduce` disables the hero simulation, autoplay,
  reveals, and all transitions/animations.

## Files

```
docs/
├── index.html        # all sections, real copy, one nav, one footer
├── styles.css        # design tokens ported from the app + full site styling
├── assets/icon.svg   # favicon from official icon geometry
└── js/
    ├── data.js       # palette, icon SVG, deterministic session/trend datasets
    ├── widget.js     # the Trance widget replica (idle/session/break/focus)
    ├── charts.js     # hand-drawn SVG: RangeCards, trend line, bars
    ├── dashboard.js  # Trance Analysis window tabs + populated panes
    ├── hero.js       # looping hero desktop simulation
    ├── sections.js   # sees sequence, showcase, task colors, break, focus
    └── main.js       # nav, icon injection, reveals, wiring
```

## Notes for reviewers

- Module URLs carry `?v=N` cache-busters (and the page self-heals once via a
  `fresh=1` redirect) so every visitor gets the newest code on any static
  host.
- The hero widget and all miniature simulations are non-interactive by design;
  the only interactive widget is the working replica in "The Widget" section.
