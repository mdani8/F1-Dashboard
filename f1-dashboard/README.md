# Gridline - F1 Championship

A local React Formula 1 dashboard with driver and constructor standings, a next-race feature, expandable schedules, and detailed weekend results with pit stops, tire strategies, and driver lap analysis. Motion adds subtle transitions while preserving Gridline's dark design.

## Start

Use Node.js 20.19+ or 22.12+ (including the installed Node 26.10). These are [Vite's supported runtimes](https://vite.dev/guide/). Dependencies are pinned in `package-lock.json`.

From this folder, run:

```powershell
npm ci
npm start
```

`npm start` builds the React frontend into `dist/` and starts the existing Node server. Open **http://127.0.0.1:5173**. Keep the terminal running; press Ctrl+C to stop the server. The server listens only on your computer. If port 5173 is occupied, stop the previous preview before restarting. `npm run build` produces the frontend without starting the server; restart `npm start` after editing source files.

## Use

- Switch between Drivers and Constructors; arrow keys also work on the tabs.
- Expand any race to see available practice, qualifying, sprint, and race sessions.
- Click a weekend name to open its results page, or click a session in its expanded schedule to open that session directly.
- Each weekend has a track diagram with coloured S1/S2/S3 sections, sector split markers, a start/finish line and direction arrow. Click a sector on the map or use its keyboard-accessible button to highlight it; select it again to show all sectors.
- Sector times belong to the labelled reference lap. The map prefers a completed reference from the selected season and uses an explicitly labelled previous-season lap for upcoming weekends when needed. Refresh map checks the map independently of session results.
- Maps align recorded positions with a geographic circuit reference so north is at the top. Verified layouts include an N arrow. Sector colours, timing boundaries and start/finish rotate together.
- Session tabs show published classifications. Race and sprint tables include published points; practice and qualifying award no points.
- Session tabs stay at the top while scrolling. Changing sessions retains scroll and keyboard focus through loading and transitions; a different weekend opens at the top. Tables have their own scroll area with sticky column headers and support keyboard scrolling.
- Use the stars beside driver and team names to follow favourites. Amber highlights appear across standings and session results, including pits and tires. Preferences are saved locally in your browser and survive reloads; they do not change table order.
- Upcoming sessions have a countdown that updates every second while the page is visible. **Export calendar** downloads every scheduled session in that weekend as an `.ics` file for your calendar app. Timed events use UTC so calendars display the right local time, date-only events remain all-day with Time TBC, and end times are included only when published.
- Pit-stop tables distinguish stationary stop duration from total pit-lane duration. Tire timelines show compounds, lap ranges, stint lengths, and starting tire age when available.
- Click a driver or use the Driver selector to inspect lap times, sector times, tire compounds, and pit/out-lap markers. Filter all, clean, pit or out laps; the filter survives driver changes. Purple markers identify the fastest recorded clean lap, including ties. Clean laps require known pit/out flags and a valid time; missing annotations never imply a clean lap or an official fastest-lap award. Tables scroll horizontally on narrow screens.
- Weekend/session/driver selections have shareable URLs and support reloads and browser Back/Forward. For example: `http://127.0.0.1:5173/#/weekend/2026/1?session=race&driver=63`.
- The selected standings tab and expanded schedules survive trips to weekend pages and back. Arrow keys, Home, and End navigate tabs; the selected session stays visible on narrow screens.
- All timed sessions use your browser's timezone. Announced date-only sessions retain their source date and show **Time TBC**.
- Use Refresh to request fresh data. Opening the page reuses successful cached responses for up to 15 minutes. Cached responses remain available as an explicitly marked fallback if refresh fails.
- Current weekend pages check for newly published data every 60 seconds, from the first session through the UTC day after the race. Checks pause while the page is hidden or when you leave the weekend view; returning checks the cache again. Older weekend data uses a 15-minute cache.

Calendar, standings, race/sprint results and points, and qualifying results come from [Jolpica F1](https://github.com/jolpica/jolpica-f1). Practice and sprint-qualifying classifications, pit activity, tire stints, and lap/sector records come from [OpenF1](https://openf1.org/docs/). Internet access is required for fresh data.

This application uses free published data. Live timing during active sessions requires a separate paid provider plan and is not enabled here. Sessions show scheduled, cancelled, awaiting-publication, or failure messages until the corresponding free data is available. Sections can fail independently; each shows its source, retrieved time, and stale state. Missing values remain unavailable, and points are never inferred from position.

Track diagrams are drawn from [OpenF1 lap timing and position samples](https://openf1.org/docs/), with sector boundaries interpolated at the recorded sector times. They show the reference lap's racing line rather than a surveyed track boundary. Incomplete traces, unknown circuits and ambiguous matches show an unavailable state instead of an invented map. Reference maps use a shared 24-hour server cache and the existing provider request limits; browser responses are reused for 15 minutes. A failed refresh retains a successful map with a stale notice. Maps stay mounted while changing sessions or drivers and do not participate in minute-by-minute results polling.

Geographic orientation uses a pinned subset of [F1 Circuits](https://github.com/bacinger/f1-circuits), by Tomislav Bacinger, under the MIT licence. `data/circuit-geography.json` records its source revision, and `data/circuit-geography.LICENSE.txt` retains the licence. Shape matching handles different polyline starting points and direction, then applies one rotation to the entire recorded lap. A mismatched geographic reference never displays a north claim. Existing cached maps without geographic-orientation support are refreshed automatically.

The server matches weekends by season, race date, and circuit/location, and drivers by code/name and the session roster. Ambiguous matches leave affected details unavailable. Shared upstream caches and request deduplication limit traffic to two requests per second, with sustained caps of 24/minute for OpenF1 and 400/hour for Jolpica. Provider throttling and Retry-After are respected.

There are no accounts or database. Browser storage and server memory are used for data caches. Fonts use Google Fonts with system-font fallbacks. React, React DOM, and [Motion for React](https://motion.dev/docs/react) provide the interface; Vite and its React plugin build the static frontend. The backend remains Node's HTTP server.

## Motion and accessibility

Page entrances use a 200 ms fade and 8 px upward reveal. Tab indicators slide over 180 ms and session content fades over 140 ms. Schedules expand over 220 ms, driver analysis fades over 180 ms, and tire colors reveal from left to right over 400 ms while labels stay still. Buttons and links use 120 ms hover feedback and an 80 ms press response. The refresh icon rotates only during a request.

Changed result cells update their values immediately and receive an 800 ms background highlight. Initial loading, unchanged responses, and retrieval timestamps do not highlight. Stable component keys keep tables, focus, selection, and scroll in place during refresh. Polling and driver changes do not replay page or tire entrances.

The interface respects the system's reduced-motion preference with `MotionConfig` and `useReducedMotion`: geometry updates immediately, rotation and translation are disabled, and opacity feedback is shortened. Exiting content is inert during transitions. Tables, tabs, disclosure controls, visible keyboard focus, and status announcements remain semantic and accessible.

## Source layout

- `src/App.jsx` owns routing, page transitions, and persistent dashboard selections.
- `src/Dashboard.jsx` and `src/Weekend.jsx` render standings, schedules, session tables, pits, tires, and driver analysis.
- `src/CircuitMap.jsx` loads the map independently and renders the responsive SVG diagram, sector controls and reference information.
- `src/Favourites.jsx` shares saved driver/team preferences across pages. `src/WeekendTools.jsx` renders visibility-aware countdowns and the calendar download.
- `src/hooks.js` manages requests, cancellation, cached data, visibility, polling, and focus/scroll preservation.
- `src/motion.jsx` and `src/ui.jsx` share motion preferences, timing, changed cells, tabs, and reusable interface components.
- `shared/` contains framework-independent API/cache, route, date, and session helpers used by the frontend, Node backend, and existing unit tests. Browser cache prefixes remain `gridline:v1:` and `gridline:results:v1:`.
- `shared/track-model.js` matches circuits, selects fully timed laps, projects positions and splits the lap at actual sector times. `track-service.mjs` handles reference selection, cached geometry, request deduplication and fallback data.
- `shared/track-orientation.js` aligns telemetry geometry to the geographic references in `data/`. `shared/qol.js` contains favourite identities, countdowns, iCalendar generation, lap filters and fastest-lap selection. Favourite preferences use the separate `gridline:favourites:v1` storage key.
- `index.html`, `src/styles.css`, `static/favicon.svg`, and `vite.config.js` are Vite's frontend inputs. The server serves built files from `dist/`.

## Local results API

- `GET /api/weekends/:season/:round` — weekend metadata and session identifiers.
- `GET /api/weekends/:season/:round/track` — reference track geometry, three sectors, start/finish and reference lap details; supports `refresh=1`.
- `GET /api/weekends/:season/:round/sessions/:slug` — results, driver roster, pit stops, and tire stints.
- `GET /api/weekends/:season/:round/sessions/:slug/laps?driver=<number>` — selected driver's laps and sectors.

Session slugs are `practice-1`, `practice-2`, `practice-3`, `qualifying`, `sprint-qualifying`, `sprint`, and `race`, when present in that weekend's calendar. Add `refresh=1` to request a refresh within provider limits. The dashboard's calendar and standings use a restricted `/api/jolpica/` proxy.

## Checks

```powershell
npm test
```

All 23 original unit tests remain, plus six track-map tests, three orientation tests and five quality-of-life tests (**37 total**). The suite covers date boundaries, normal/sprint schedules, driver identities, published classifications, points, missing values, cancellation, publication transitions, stale fallbacks, malformed responses, browser caching, rate limits, circuit matching, reference-year fallback, position coverage, accurate sector boundaries, geographic rotation, favourite identities, countdowns, calendar UTC/DST handling, Unicode line folding, lap filters and tied fastest laps.

```powershell
npm run test:browser
npm run test:animations
npm run test:qol
npm run test:providers
```

The three browser scripts build first. Fixture checks verify navigation, direct links, keyboard access, mobile layouts, automatic refresh, focus/scroll preservation, visibility changes, independent stale sections, and navigation during an outstanding request. The animation suite uses real browser timers to check interrupted transitions, tire reveals, changed cells, retained DOM, and reduced motion. It captures `qa/react-desktop.png`, `qa/react-mobile.png`, and a short `qa/animations.webm` recording.

Quality-of-life checks cover saved favourites across pages and reloads, countdown updates, actual calendar downloads, sticky tables and keyboard scrolling, delayed session requests without scroll jumps, lap filters, tied fastest markers, and mobile navigation. Reports are in `qa/qol-report.json`, with `qa/qol-desktop.png`, `qa/qol-mobile.png` and `qa/qol-mobile-analysis.png` for visual review. `node qa/qol-live.mjs` verifies the running preview with real Hungaroring/Spa maps and lap timing; it saves `qa/qol-live-report.json`, north-oriented map screenshots and a mobile lap-analysis screenshot.

Track browser checks cover keyboard highlighting, retained map selection during session/driver changes, mobile layout and an independent stale fallback. Real-data checks include Albert Park, Shanghai and an upcoming Las Vegas weekend. Map screenshots are `qa/track-desktop.png` and `qa/track-mobile.png`; API verification is in `qa/track-verification.json`.

The browser scripts use Playwright from the local Codex runtime and the Chrome installation configured in `qa/`. Video recording also needs Playwright's FFmpeg helper in `node_modules/.cache/playwright` (or a configured `PLAYWRIGHT_BROWSERS_PATH`). On a different computer, adjust those local paths. Provider checks make read-only requests for representative completed normal and sprint weekends. `node qa/preview.mjs` checks the running preview against real data. Reports and screenshots are saved in `qa/`.
