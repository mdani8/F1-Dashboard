# Project index

Snapshot: 14 October 2026 (Europe/Brussels).

## Current application

The workspace contains **Gridline — F1 Championship** in `f1-dashboard/`: a responsive Formula 1 dashboard with standings, favourites, countdowns, calendar exports, north-oriented track maps, sticky controls, session results/strategy/lap analysis, and public RSS feeds for results, 24-hour reminders and corrections. The complete application has a production Docker Compose setup.

The interface uses React 19 and Motion 14. Vite 8 builds into `dist/`; Node serves the assets and aggregates Jolpica/OpenF1 through read-only APIs, shared caches and rate limits. The pinned Node 24 production image builds/tests the frontend and runs as a non-root user with a read-only application filesystem. Docker Compose persists RSS history in a named volume and supports an existing reverse proxy's external network. Direct `npm start` remains available. There is no database/account system. The workspace is not a Git repository.

## File map

| Path | Purpose |
| --- | --- |
| `f1-dashboard/package.json`, `package-lock.json` | Pinned React, React DOM, Motion, Vite and React plugin dependencies; build/start/test scripts; Node 20.19+ or 22.12+ requirement. |
| `f1-dashboard/vite.config.js`, `index.html` | React build configuration and HTML entry; static output goes to `dist/`. |
| `f1-dashboard/README.md` | Detailed Windows/Linux Docker Compose quickstart, public proxy setup, configuration, RSS subscriptions, maintenance, backup/restore, troubleshooting and local development. |
| `f1-dashboard/Dockerfile`, `.dockerignore` | Pinned multi-stage Node 24 production build, test stage and runtime content. |
| `f1-dashboard/compose.yaml`, `compose.proxy.yaml`, `.env.example` | Localhost-published application, RSS named volume and optional existing proxy network configuration. |
| `f1-dashboard/server.mjs`, `runtime-config.mjs` | Configurable HTTP entry, existing APIs, RSS/health routes, startup validation and graceful shutdown. |
| `f1-dashboard/feed-service.mjs` | Independent five-minute collector for reminders, backfill, material corrections and stale/partial failure handling. |
| `f1-dashboard/feed-model.mjs`, `feed-store.mjs` | RSS 2.0 rendering, classification signatures, stable revisions and atomic validated JSON state. |
| `f1-dashboard/scripts/healthcheck.mjs`, `scripts/feed-state.mjs` | Provider-independent container health probe and safe journal restore helper. |
| `f1-dashboard/upstream.mjs` | Shared provider caches, request deduplication, rate limiting, Retry-After, backoff, and stale fallbacks. |
| `f1-dashboard/results-service.mjs` | Weekend/driver identity matching and normalization of classifications, pit stops, tire stints, and laps. |
| `f1-dashboard/src/main.jsx`, `src/App.jsx` | React entry, persistent shell, hash navigation, page transitions, and dashboard selections. |
| `f1-dashboard/src/Dashboard.jsx` | Race hero, standings, calendar, and animated schedule disclosures. |
| `f1-dashboard/src/Weekend.jsx` | Session results, pit tables, tire timelines, and driver analysis as keyed React components. |
| `f1-dashboard/src/CircuitMap.jsx` | Independently loaded SVG track map, interactive sector highlighting, start/finish, reference times and stale/unavailable states. |
| `f1-dashboard/src/Favourites.jsx` | Saved local driver/team preferences and accessible star controls shared across pages. |
| `f1-dashboard/src/WeekendTools.jsx` | Visibility-aware session countdown and weekend iCalendar download. |
| `f1-dashboard/track-service.mjs` | Published reference lap selection, prior-season fallback, shared map caching and request deduplication. |
| `f1-dashboard/src/hooks.js` | Request cancellation, polling, visibility, late-response protection, and preserved focus/scroll. |
| `f1-dashboard/src/ui.jsx` | Semantic tabs with sliding indicators, keyboard/resize handling, data notices, and common presentation helpers. |
| `f1-dashboard/src/motion.jsx` | Shared easing/timings, reduced-motion preferences, page/content reveals, spinner, tire bars, and changed-cell highlights. |
| `f1-dashboard/src/styles.css` | Dark theme, responsive layouts, typography, focus indicators, and motion styling. |
| `f1-dashboard/shared/data.js` | Reused API client, validation, browser caching, session ordering, next-race selection, and timezone formatting. |
| `f1-dashboard/shared/weekend-model.js` | Shared routing, session selection, refresh-window, and duration helpers. |
| `f1-dashboard/shared/weekend-client.js` | Reused weekend browser cache, fetch cancellation, validation, and stale transport fallback. |
| `f1-dashboard/shared/track-model.js` | Circuit identity matching, clean lap selection, position validation, geometry projection and sector interpolation. |
| `f1-dashboard/shared/track-orientation.js` | Shape matching and rotation of entire telemetry maps to geographic north. |
| `f1-dashboard/data/circuit-geography.json`, `circuit-geography.LICENSE.txt` | Pinned WGS84 geographic references for calendar circuits, credited to F1 Circuits with its MIT licence. |
| `f1-dashboard/shared/qol.js` | Favourite identities, countdown selection, UTC/Unicode-safe calendar export, lap filters and tied fastest-lap selection. |
| `f1-dashboard/static/favicon.svg` | Gridline favicon, copied into the build. |
| `f1-dashboard/test/data.test.js` | Eight automated data-layer tests using the built-in Node test runner. |
| `f1-dashboard/test/results.test.js` | Fifteen fixture-based tests covering results, identities, cache/failure behavior, and rate limiting. |
| `f1-dashboard/test/track.test.js` | Six tests for sector boundaries, incomplete positions, reference selection, independent failures and prior-season maps. |
| `f1-dashboard/test/orientation.test.js`, `test/qol.test.js` | Eight tests for geographic rotation, cache invalidation, preferences, countdowns, calendar export and lap filtering. |
| `f1-dashboard/test/feeds.test.js` | Seventeen RSS/runtime tests for publication, reminders, corrections, chronological backfill, caching, persistence, shutdown and configuration. |
| `f1-dashboard/qa/fixtures.mjs` | Deterministic normal/sprint provider fixtures for unit and browser checks. |
| `f1-dashboard/qa/browser.mjs` | Playwright checks for navigation, keyboard access, mobile layouts, refresh, stale states, and outstanding requests. Uses local Codex Playwright and Chrome paths. |
| `f1-dashboard/qa/animations.mjs` | Real-timer checks for interrupted transitions, tire reveals, changed cells, stable DOM, reduced motion, and review video capture. |
| `f1-dashboard/qa/qol.mjs` | Seven fixture browser check groups for countdowns, favourites, calendar downloads, sticky controls, delayed loading, lap filtering and mobile navigation. |
| `f1-dashboard/qa/qol-live.mjs` | Running-preview checks with real Hungaroring/Spa maps, scroll/focus preservation and mobile lap analysis. |
| `f1-dashboard/qa/feeds.mjs` | Browser XML parsing, escaped classification content, session links, discovery and desktop/mobile subscription checks. |
| `f1-dashboard/qa/rss-live.mjs` | Production-container verification with published RSS classifications from both providers and the real Hungaroring driver view. |
| `f1-dashboard/qa/docker.mjs`, `qa/compose.fixtures.yaml`, `qa/container-fixture.mjs` | Isolated disposable Docker tests for Linux runtime, shared proxy network, persistence and backup/restore. |
| `f1-dashboard/qa/live.mjs` | Read-only verification of six published sessions from completed normal and sprint weekends. |
| `f1-dashboard/qa/preview.mjs` | Browser check against the running React preview, Australian race, Chinese sprint qualifying, and current dashboard data. |
| `f1-dashboard/qa/*.png` | Dashboard, results, and preview screenshots at desktop/mobile sizes. |
| `f1-dashboard/qa/animations.webm` | Short animation recording for visual review. |
| `f1-dashboard/qa/*-report.json`, `f1-dashboard/qa/live-verification.json` | Browser and provider verification summaries. |
| `f1-dashboard/preview*.log` | Retained historical Node preview logs. Current container logs use `docker compose logs gridline`. |

## Data and behavior

1. On dashboard load, React's dashboard data hook requests the current season calendar and standings through a restricted local Jolpica proxy. The server sends the required application User-Agent.
2. The season returned by the calendar selects the driver and constructor standings endpoints. Both standings requests run independently.
3. Successful responses are cached in browser `localStorage` under `gridline:v1:` keys for 15 minutes. Keys isolate season data. Refresh and Retry request fresh data; requests time out after 12 seconds.
4. If a request fails, a valid cached response can be displayed with a stale-data notice. Sections without usable data show a retry message.
5. Timed sessions use the viewer's browser timezone and a 24-hour clock. Date-only sessions retain their announced date and show `Time TBC`.
6. Calendar links open `#/weekend/<season>/<round>?session=<slug>&driver=<number>`. Weekend pages load one session at a time; lap timing is fetched only for a selected driver.
7. Jolpica supplies race/sprint results and points and qualifying results. OpenF1 supplies practice/sprint-qualifying classifications, rosters, pits, tires, and lap/sector timing. Ambiguous identities and missing values remain unavailable.
8. Current weekend pages check published data every minute through the UTC day after the race. Checks pause when hidden or after leaving the page. Older results and metadata use 15-minute caches; sections retain independent stale/failure states.
9. Expanded schedules and the standings tab are held above page boundaries. Stable keys preserve tables and selected session/driver state during data refresh. The results cache retains its original `gridline:results:v1:` prefix.
10. Page entrances, tab changes, schedule disclosures, analysis panels, and tire colors use short ease-out transitions. Changed points, times, positions, and status update immediately and highlight for 800 ms. Initial loading, unchanged polling, and timestamps do not highlight or replay entrances. Reduced motion renders geometry immediately, disables rotation/translation, and shortens fades; exiting content becomes inert.
11. Each weekend loads a track diagram independently from recorded OpenF1 lap positions. Sectors split at the reference lap's actual sector times. Maps prefer the current season, explicitly label an older reference when needed, retain successful geometry on refresh failures, and use a 24-hour server cache plus a 15-minute browser cache. Session/driver changes and results polling retain the same map and selected sector.
12. Track geometry aligns to pinned [F1 Circuits](https://github.com/bacinger/f1-circuits) geographic polylines; verified maps show north at the top and an N arrow. One rotation preserves timing sectors, start/finish and travel direction. Unknown/mismatched references never claim north, and older cached geometry is invalidated.
13. Session tabs stay visible while scrolling; tables have bounded scroll areas and sticky headers. Session changes retain focus and scroll through request/animation transitions. Entering a different weekend opens at the top.
14. Stars save favourite drivers by code/name and teams by canonical identity under `gridline:favourites:v1`. Amber highlights apply across standings, results, pits and tires, survive reloads and synchronise browser tabs.
15. Upcoming sessions show a local one-second countdown that pauses while hidden. Weekend exports include every published session in an `.ics` file, using UTC for timed events, all-day TBC events, stable identifiers, published end times and cancellation status.
16. Lap analysis filters all/clean/pit/out records and keeps its filter while changing drivers. Fastest recorded clean laps, including ties, receive purple markers. Unknown or stale pit annotations are excluded from clean/fastest claims; classification remains the authority for official results.
17. RSS routes `/feeds/all.xml`, `/feeds/results.xml` and `/feeds/upcoming.xml` serve the latest 100 publications each. The independent collector starts without a browser, runs every five minutes, seeds the latest two completed weekends and watches those plus the active weekend. Classification-only requests avoid unrelated timing/strategy data.
18. Confirmed sessions get one reminder within 24 hours of their start; changed schedules/cancellations and classifications produce new labelled revisions. Retrieved timestamps/unchanged data do not publish items. The named volume stores stable identities, the latest 500 publications and current/previous-season identity state; failed upstream refreshes retain successful snapshots.
19. `PUBLIC_BASE_URL` generates absolute RSS URLs and supports the public HTTPS origin. The production Compose service listens on all container interfaces at 5173 while publishing only host localhost. The optional override joins an existing proxy network and exposes service DNS `gridline:5173` to that proxy. `/healthz` reports app/feed state without treating provider outages as server failures.

Read-only results interfaces: `/api/weekends/:season/:round`, `/api/weekends/:season/:round/track`, `/api/weekends/:season/:round/sessions/:slug`, and `/api/weekends/:season/:round/sessions/:slug/laps?driver=<number>`. Free published data is used; paid live timing is not configured.

Fresh F1 data requires internet access. Google Fonts supplies Barlow fonts, with system-font fallbacks.

## Run and check

For Docker, run from `f1-dashboard/` (copy `.env.example` to `.env` on first setup and set the public URL/network for a public server):

```shell
docker compose up -d --build --wait
docker compose ps
```

For a direct Node preview instead:

```powershell
Set-Location -LiteralPath '.\f1-dashboard'
npm ci
npm start
```

Preview URL: **http://127.0.0.1:5173/**. The server listens only on the local computer. A foreground server stops with Ctrl+C.

Run the checks from `f1-dashboard/` (the browser scripts build first):

```powershell
npm test
npm run test:browser
npm run test:animations
npm run test:qol
npm run test:rss
npm run test:docker
npm run test:providers
```

## Verified state

- Installed runtime: Node `v26.10.0`, npm `11.19.1`.
- The pinned production image builds successfully with Node `v24.22.0`; all 54 unit tests pass inside Linux and on the installed Windows Node runtime.
- `npm test`: **54 passed, 0 failed**, retaining the previous 37 tests and adding seventeen RSS/runtime tests.
- Existing 11 navigation, seven animation and seven quality-of-life browser groups pass after adding RSS, with no browser runtime errors.
- Four RSS browser groups verify XML parsing, full/escaped content, shareable session links, discovery and desktop/mobile keyboard controls.
- Five Docker groups verify the non-root/read-only Linux image, assets/APIs/feeds, a shared external proxy network, restart identity, and backup/restore/recreation. Disposable verification resources were removed after the tests; the production Compose project is separate.
- The production Compose service is healthy at `http://127.0.0.1:5173`, using its persistent RSS volume. No public domain or external proxy configuration has been applied on this computer.
- The real-data RSS check verified seven full 22-driver classifications from Jolpica/OpenF1, valid XML, stable unique identifiers and a race/API comparison. The Docker-served Hungaroring race returned 22 results and 64 clean laps for driver 44, with a north-oriented map and no mobile overflow or browser runtime errors. An initial provider cooldown was respected before the successful retry.
- Browser checks cover all nine existing groups of navigation, mobile, refresh, visibility, stale-state, and late-response scenarios, plus sector/map persistence and independent map failure checks (11 groups), with no browser runtime errors.
- Seven additional real-timer groups verify interrupted disclosures, actual tire reveals, rapid tab changes, dashboard state restoration, stable refreshes, changed-cell highlights, driver selection during loading, keyboard/mobile behavior, and reduced motion. Desktop/mobile screenshots and a short recording are saved in `qa/`.
- Seven quality-of-life browser groups verify countdowns, saved favourites, actual calendar downloads, sticky headers, keyboard table scrolling, delayed session loading without jumps, lap filters, tied fastest markers and mobile controls. No runtime errors were reported.
- The restarted preview was verified with real Hungaroring and Spa data. Both maps matched their geographic references and displayed north arrows. A real session change retained scroll, focus and map selection; Hungaroring lap analysis returned 16 recorded laps and 10 clean laps. Mobile layout had no page overflow. Screenshots and `qa/qol-live-report.json` capture these checks.
- The running preview was checked on desktop and mobile with real Australian race data: 22 results, 36 pit records, 21 tire timelines, and 57 laps for the selected driver, with no runtime errors or mobile page overflow.
- The React preview also returned 21 Chinese sprint-qualifying classifications and tire timelines, plus 23 driver standings and 23 calendar weekends on the current dashboard.
- Real map checks verified Albert Park and Shanghai using 2026 qualifying laps, plus Las Vegas using an explicitly labelled 2025 reference. Three continuous sectors and a closed reference lap were available for all three. Desktop/mobile map screenshots and `qa/track-verification.json` capture the current result.
- Real provider checks verified six Australian/Chinese practice, qualifying, sprint-qualifying, sprint, and race sessions, including pit/tire records and a selected driver's lap timing. All returned result drivers matched their session rosters.
