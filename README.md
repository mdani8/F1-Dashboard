# Gridline - F1 Championship

A React Formula 1 dashboard with standings, weekend results, track maps, pit stops, tire strategies, filterable lap analysis, favourites, countdowns, calendar exports, and public RSS feeds. A production Docker image serves the entire frontend and Node backend. Motion adds subtle transitions while preserving Gridline's dark design.

## Docker Compose setup

### 1. Prerequisites

- **Windows/macOS:** install [Docker Desktop](https://docs.docker.com/desktop/) and start it. On Windows, use **Linux containers**; the WSL 2 backend is recommended by Docker's installation guide.
- **Linux server:** install [Docker Engine](https://docs.docker.com/engine/install/) and the [Docker Compose plugin](https://docs.docker.com/compose/install/linux/). Start the Docker service and ensure your account can use Docker.
- Use a current Compose release supporting `docker compose up --wait`. The project uses the modern `docker compose` command, with a space.
- Docker needs internet access to pull the pinned Node base image and install frontend build dependencies. Running Gridline needs outbound HTTPS/DNS access to Jolpica F1 and OpenF1 for fresh data.
- Node/npm are **not required on the host** for Docker use. The image builds and tests with Node 24 and includes the frontend's compiled assets.

Check installation before continuing:

```shell
docker version
docker compose version
```

`docker version` must show both **Client** and **Server**. A named-pipe/socket connection error means the Docker engine is not ready. Start Docker Desktop on Windows/macOS, or the Docker service on Linux, and retry.

### 2. Open the application folder and configure it

Run all following commands from the folder containing `compose.yaml` and `Dockerfile`, **`f1-dashboard/`**, rather than its parent workspace.

Windows PowerShell:

```powershell
Set-Location -LiteralPath 'C:\Users\miksi\Desktop\Test Project\f1-dashboard'
Copy-Item -LiteralPath '.env.example' -Destination '.env'
```

Linux/macOS, after copying this project to the server:

```sh
cd /path/to/f1-dashboard
cp .env.example .env
```

Copy the example only on the first setup; retain your existing `.env` during updates. Edit it in a text editor:

```dotenv
PUBLIC_BASE_URL=http://127.0.0.1:5173
HOST_PORT=5173
PROXY_NETWORK=
```

If the existing Node preview already occupies port 5173, use the following pair to run Docker alongside it:

```dotenv
PUBLIC_BASE_URL=http://127.0.0.1:5174
HOST_PORT=5174
```

Changing the port requires changing both settings so RSS links point to the correct origin. The internal container port remains 5173.

### 3. Build and start locally

```shell
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
docker compose logs --tail=100 gridline
```

Open **http://127.0.0.1:5173/**, or port 5174 if configured above. The first build downloads dependencies, runs the unit tests, and builds React. Later builds reuse unchanged layers. Containers run in the background; closing the terminal does not stop them.

The default port mapping is **localhost only**. Public access is through your existing reverse proxy, configured in the next section.

Check the running application without installing curl inside the image:

```shell
docker compose exec gridline node scripts/healthcheck.mjs
```

An exit status of zero means the web server is available. For more detail, open `/healthz` in your browser. Windows PowerShell can inspect it with:

```powershell
Invoke-RestMethod 'http://127.0.0.1:5173/healthz'
```

Example response:

```json
{
  "status": "ok",
  "feeds": {
    "state": "ready",
    "items": 10,
    "lastAttempt": 1792000000000,
    "lastSuccessfulRefresh": 1792000000000,
    "message": null
  }
}
```

The timestamp numbers and item count depend on actual publication. Feed states are `initializing`, `ready`, `degraded`, or `failed`. Container health checks the application independently of external provider availability. Initial RSS requests may return **503 with Retry-After: 60** while the calendar/history initializes. An empty feed after initialization is valid when nothing has been published for it.

### 4. Connect your existing public reverse proxy

This setup uses your existing HTTPS proxy on the **same Docker server**. It adds one Gridline container; it does not install a proxy or issue TLS certificates.

1. Point your public domain's DNS to the existing reverse proxy and configure a valid HTTPS certificate there.
2. Find the Docker network that proxy already uses:

   ```shell
   docker network ls
   docker inspect YOUR_PROXY_CONTAINER --format '{{json .NetworkSettings.Networks}}'
   ```

3. Update `.env` with your actual domain and **existing external network name**:

   ```dotenv
   PUBLIC_BASE_URL=https://gridline.example.com
   HOST_PORT=5173
   PROXY_NETWORK=your_existing_proxy_network
   ```

4. Validate and start with both Compose files:

   ```shell
   docker compose -f compose.yaml -f compose.proxy.yaml config --quiet
   docker compose -f compose.yaml -f compose.proxy.yaml up -d --build --wait
   docker compose -f compose.yaml -f compose.proxy.yaml ps
   ```

5. Configure the existing proxy with these upstream settings:

   | Proxy setting | Value |
   | --- | --- |
   | Public hostname | Your domain, for example `gridline.example.com` |
   | Upstream scheme | `http` |
   | Upstream hostname/service | `gridline` |
   | Upstream port | `5173` |
   | Path | `/`, preserving `/api/`, `/feeds/`, assets and `/healthz` |
   | Public TLS | Terminated by your existing proxy |

   In Nginx Proxy Manager these correspond to a Proxy Host's domain, HTTP scheme, forward hostname `gridline`, and forward port `5173`; configure its SSL tab with your existing certificate setup. A proxy in a container must use `gridline:5173`, rather than its own `localhost` or the host's mapped port.

   For an existing NGINX configuration, the upstream location is:

   ```nginx
   location / {
       proxy_pass http://gridline:5173;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   }
   ```

   Add this to your existing HTTPS virtual host and reload the proxy using its normal procedure. WebSocket support is not required.

6. Visit `https://YOUR_DOMAIN/healthz` and the site. Inspect `https://YOUR_DOMAIN/feeds/all.xml`: its channel and session links must use your HTTPS domain, rather than `localhost`, `gridline`, or a Docker IP.

The external network must exist before starting with `compose.proxy.yaml`. Gridline also keeps its own default network for outbound provider requests. Docker service DNS survives container recreation; do not configure the proxy using a container's temporary IP address. Refer to [Docker's networking guide](https://docs.docker.com/compose/how-tos/networking/) for shared external networks.

**Use the same two `-f` arguments whenever rebuilding or recreating a public deployment**, including update, restore-helper and rollback commands below. This retains its proxy-network attachment. The application is served at the domain root; `PUBLIC_BASE_URL` does not support a `/gridline` subpath. RSS links use the configured origin, independent of incoming Host/forwarded headers.

### Configuration reference

| Setting | Default | Purpose |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:5173` | Absolute site/feed origin. Set the actual HTTPS public origin behind your proxy. A root trailing slash is accepted; credentials, paths, queries and fragments are rejected. |
| `HOST_PORT` | `5173` | Host-side localhost port. Map a different port when the Node preview occupies 5173. |
| `PROXY_NETWORK` | Empty | Existing proxy Docker network; required only with `compose.proxy.yaml`. |
| `HOST` | `0.0.0.0` in Compose | Listening interface inside the container. Direct Node use defaults to `127.0.0.1`. |
| `PORT` | `5173` | Internal Node port. Compose fixes this to 5173 so its mapping and proxy target agree. |
| `DATA_DIR` | `/data` in Compose | RSS journal directory. Direct Node use defaults to `.gridline-data/` beside the application. |
| `NODE_ENV` | `production` in Compose | Production runtime configuration. |
| `TZ` | `UTC` in Compose | Server timezone. Browser session displays still use the browser's timezone; RSS dates explicitly use GMT/UTC. |

Compose reads `.env` to interpolate its configuration and explicitly passes the runtime settings above into Gridline. Shell environment variables take precedence over `.env`; inspect `docker compose config` if a value seems unexpected. Restarting alone does not apply changed environment settings—use `docker compose up -d --wait` to recreate the service.

### Container contents and persistent data

The pinned official Node 24 Bookworm Slim base is used for both build and runtime. The build installs the lockfile, runs tests, and produces `dist/`. The final image contains compiled frontend assets, Node services, shared modules, circuit data/licence and maintenance scripts. It runs `node server.mjs` directly as the unprivileged `node` user, without installing dependencies or rebuilding at startup. Build tools, browser recordings, local configuration and host `node_modules` are excluded.

The application filesystem is read-only. Compose supplies a writable `/data` named volume and a small temporary `/tmp`. Logs go to Docker's standard output/error and rotate at 10 MB, retaining three files. The service restarts unless explicitly stopped and has a 30-second graceful-shutdown period.

The default Compose project name is `gridline`. Its named volume is **`gridline_feed_data`**, containing `/data/rss-state.json`. It preserves publication identifiers, reminder state, correction revisions and recent feed items across updates/recreation. Keep one Gridline replica per journal volume. Changing the Compose project name creates a differently named volume unless you migrate it.

Provider response caches remain in memory and rebuild after a restart. Favourites stay in each browser's local storage, separated by site origin. They are not put into public feeds or the container volume.

### Common maintenance commands

These examples use the local Compose file. For public deployments, insert `-f compose.yaml -f compose.proxy.yaml` after `docker compose`.

```shell
# Follow logs; Ctrl+C only stops following the logs.
docker compose logs -f --tail=100 gridline

# Restart the existing container, retaining its configuration and data.
docker compose restart gridline

# Stop temporarily, then resume the existing container.
docker compose stop gridline
docker compose start gridline

# Stop/remove the container and project network; retain RSS history.
docker compose down
```

To update, copy the updated project files into the same application folder, retaining `.env` and the named volume. Optionally tag the current image for rollback, then build and recreate:

```shell
docker image tag gridline:local gridline:rollback
docker compose up -d --build --wait
docker compose logs --tail=100 gridline
```

A failed image build does not replace the running container. To return to the saved image:

```shell
docker image tag gridline:rollback gridline:local
docker compose up -d --no-build --force-recreate --wait
```

The base image is pinned by digest for repeatable builds. To update Node itself, update the two matching image references in `Dockerfile` after verifying an official Node 24 image, then rebuild and run the checks. See the [official Node image](https://github.com/nodejs/docker-node) and [Docker multi-stage documentation](https://docs.docker.com/build/building/multi-stage/).

### Back up and restore RSS history

Wait until the RSS collector has initialized before taking the first backup. Stop the application to capture its latest committed state, copy the file through Docker, then resume. These commands work in PowerShell and Linux shells:

```shell
docker compose stop gridline
docker compose cp gridline:/data/rss-state.json ./rss-state-backup.json
docker compose start gridline
```

Store the backup outside the application folder as well if you need protection against host disk failure. To restore, first copy the backup into this folder, then:

```shell
docker compose stop gridline
docker compose run --rm --no-deps -v "./rss-state-backup.json:/backup/rss-state.json:ro" gridline node scripts/feed-state.mjs restore /backup/rss-state.json
docker compose start gridline
docker compose logs --tail=100 gridline
```

The helper validates the journal version/content and writes atomically as the normal container user, preserving data-directory ownership. Verify that the helper succeeds before restarting. On Linux, the helper's UID 1000 must be able to read the backup bind mount; if needed, make this public-result backup readable with `chmod a+r rss-state-backup.json`.

A restored snapshot keeps its existing RSS identifiers. Readers do not receive duplicate reminders just because the container restarts. Restoring an older backup can replay changes published since that backup; prefer the newest backup. A damaged/unsupported journal stops RSS publication without overwriting the file; the rest of the website remains usable. Restore a valid backup and restart to recover.

**Optional full reset:** `docker compose down --volumes` removes this project's RSS volume as well as its containers. It erases feed publication history; rebuilding afterwards can republish backfilled results/reminders. Use ordinary `docker compose down` for routine shutdown.

### Docker troubleshooting

| Symptom | Check / fix |
| --- | --- |
| `docker` or `docker compose` is not found | Start a new terminal after installation. Ensure Docker Desktop's CLI tools are installed/on PATH, or install the Linux Compose plugin. |
| Cannot connect to Docker; missing named pipe/socket | Start the engine and wait until `docker version` shows Server information. Use Linux containers on Windows. |
| Port 5173 is already allocated | Keep the Node preview running and choose `HOST_PORT=5174` plus the matching local `PUBLIC_BASE_URL`, or stop the previous preview. |
| External network not found | Use the actual existing proxy network name in `PROXY_NETWORK`. Inspect it with `docker network inspect NAME`; do not start the public override with an empty name. |
| Proxy returns 502 | Check both containers share the network. The upstream is HTTP `gridline:5173`, not `127.0.0.1` inside the proxy. Check `docker compose ps` and logs. |
| Feed URLs contain localhost | Correct `PUBLIC_BASE_URL` to the public HTTPS origin and recreate using both Compose files. Existing item identifiers are retained. |
| RSS initially returns 503 | Check `/healthz` and logs. Initial calendar collection may still be running; retry after 60 seconds. |
| `feeds.state` is degraded | The server is serving retained publications while some provider data is unavailable. Check internet/DNS and provider messages; rate limits/backoff are automatic. |
| Upcoming feed is empty | Reminders appear only for confirmed starts within 24 hours. Time-TBC/cancelled sessions do not get new reminders. |
| Website works but results are missing | Free data may not be published yet. Provider outages/authentication restrictions do not mean a Docker startup failure. |
| RSS journal cannot be loaded | Preserve the damaged file, restore a validated backup and restart. Do not delete the volume as a routine repair. |
| Permission denied for a bind-mounted data directory | Prefer the provided named volume. A custom data directory must be writable by container UID/GID 1000. |
| Source/environment changes are not visible | Rebuild/recreate with `up -d --build --wait`; `restart` uses the existing image/configuration. |

## RSS subscriptions

Copy one of these URLs into your RSS reader, replacing the origin with your public domain or configured local port:

| Feed | URL |
| --- | --- |
| All results, reminders and corrections | `https://YOUR_DOMAIN/feeds/all.xml` |
| Full session classifications and result corrections | `https://YOUR_DOMAIN/feeds/results.xml` |
| 24-hour reminders and schedule/cancellation updates | `https://YOUR_DOMAIN/feeds/upcoming.xml` |

The same links appear in the website footer, and the HTML includes RSS autodiscovery links. These are standard [RSS 2.0](https://www.rssboard.org/rss-specification) feeds. They support GET/HEAD, ETag and Last-Modified validators, 304 responses, and a five-minute RSS TTL hint. HTTP responses can be cached for 60 seconds. There is no account, token or per-favourite feed; published items are public.

- **Results:** all practice, qualifying, sprint qualifying, sprint and race classifications. Initial collection seeds the latest two completed weekends and any active weekend. Later collections watch the active weekend and latest two completed weekends. Older published items remain in feed history but older weekends are not continually rechecked for penalties.
- **Content:** every driver, team and relevant published classification value is included. Race/sprint points are never inferred. Practice/qualifying state “No points awarded”; missing values remain unavailable. Pits, tires and lap analysis are linked through the session page.
- **Reminders:** one item is posted when a confirmed start is within the next 24 hours. A first startup or return after downtime can post it later in that window. Date-only sessions wait for a confirmed time, including an OpenF1 time when available. Past/cancelled sessions do not generate new reminders.
- **Changes:** a changed classification gets a new “Corrected results” item with the updated full table. A previously announced session moving, becoming TBC or being cancelled gets a schedule update. Repeated identical data and retrieval timestamps do not create new items. A later reversal of a correction gets its own revision.
- **Timing:** collection starts without opening the website and runs every five minutes, sharing upstream caches/limits. Providers may publish later, and readers choose their own polling/delivery cadence. These are published-data updates rather than a paid live timing feed.
- **Dates:** item publication dates record the first observation of that revision, not the future event time. Session start times are explicitly labelled GMT/UTC in the content so future-dated items are not hidden by readers. Browser views still use the viewer's timezone.
- **Retention:** each XML feed exposes its latest 100 items, including past reminders as an archive. The journal retains the latest 500 publications and identity state for the current/previous season. Normal restarts/rebuilds preserve identifiers and revisions.
- **Failures:** successful publications remain available. `X-Feed-Stale: true` and `/healthz` indicate an incomplete refresh without generating error notifications. No usable initialized history produces a temporary 503 response. Schedule/classification sections can fail independently.

## Run directly with Node (optional)

Use Node.js 20.19+ or 22.12+ (including the installed Node 26.10). These are [Vite's supported runtimes](https://vite.dev/guide/). Dependencies are pinned in `package-lock.json`.

From this folder, run:

```powershell
npm ci
npm start
```

`npm start` builds the React frontend into `dist/` and starts the existing Node server. Open **http://127.0.0.1:5173**. Keep the terminal running; press Ctrl+C to stop the server. The server listens only on your computer. If port 5173 is occupied, stop the previous preview before restarting. `npm run build` produces the frontend without starting the server; restart `npm start` after editing source files.

Stop the Docker service first with `docker compose stop gridline` if you want to use Node on the same port. Direct Node uses its own `.gridline-data/` RSS journal; Docker keeps its journal in the named volume.

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

There are no accounts or database. Browser storage and server memory are used for data caches; RSS publication history uses the JSON journal described above. Fonts use Google Fonts with system-font fallbacks. React, React DOM, and [Motion for React](https://motion.dev/docs/react) provide the interface; Vite and its React plugin build the static frontend. The backend remains Node's HTTP server.

## Motion and accessibility

Page entrances use a 200 ms fade and 8 px upward reveal. Tab indicators slide over 180 ms and session content fades over 140 ms. Schedules expand over 220 ms, driver analysis fades over 180 ms, and tire colors reveal from left to right over 400 ms while labels stay still. Buttons and links use 120 ms hover feedback and an 80 ms press response. The refresh icon rotates only during a request.

Changed result cells update their values immediately and receive an 800 ms background highlight. Initial loading, unchanged responses, and retrieval timestamps do not highlight. Stable component keys keep tables, focus, selection, and scroll in place during refresh. Polling and driver changes do not replay page or tire entrances.

The interface respects the system's reduced-motion preference with `MotionConfig` and `useReducedMotion`: geometry updates immediately, rotation and translation are disabled, and opacity feedback is shortened. Exiting content is inert during transitions. Tables, tabs, disclosure controls, visible keyboard focus, and status announcements remain semantic and accessible.

## Source layout

- `src/App.jsx` owns routing, page transitions, and persistent dashboard selections.
- `feed-service.mjs`, `feed-model.mjs` and `feed-store.mjs` collect classifications/reminders, render RSS and persist publication history. `runtime-config.mjs` validates startup settings; maintenance scripts handle health checks and journal restores.
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

All 37 previous tests remain, plus 17 RSS/runtime tests (**54 total**). The suite covers date boundaries, normal/sprint schedules, identities, classifications, points, missing values, cancellation, publication transitions, stale fallbacks, browser caching, rate limits, track geometry/orientation, favourites, countdowns, calendar exports, lap filters and tied fastest laps. RSS checks add 24-hour boundaries, Time TBC/fallback timing, corrections/reversals, chronological startup backfill, season rollover, durable identity, failed writes/corruption, independent failures, background scheduling/shutdown and conditional HTTP responses. The Docker build runs this same suite in Linux.

```powershell
npm run test:browser
npm run test:animations
npm run test:qol
npm run test:rss
npm run test:providers
```

The four browser scripts build first. Fixture checks verify navigation, direct links, keyboard access, mobile layouts, automatic refresh, focus/scroll preservation, visibility changes, independent stale sections, and navigation during an outstanding request. The animation suite uses real browser timers to check interrupted transitions, tire reveals, changed cells, retained DOM, and reduced motion. It captures `qa/react-desktop.png`, `qa/react-mobile.png`, and a short `qa/animations.webm` recording.

RSS browser checks parse every feed with Chrome's XML parser, check full classifications and escaped provider text, follow a session link, and verify desktop/mobile subscription navigation. Reports/screenshots are `qa/rss-report.json`, `qa/rss-desktop.png` and `qa/rss-mobile.png`.

`node qa/rss-live.mjs` checks the running production container with real published classifications from both providers, compares a race feed item with its session API, and verifies the Hungaroring driver page, map and mobile layout. Its current verification is saved in `qa/rss-live-report.json`. Live checks may need to be retried after provider cooldowns; the fixture checks remain independent of external availability.

For container verification after building the image:

```shell
docker compose build
npm run test:docker
```

This optional host-side test needs Node and Docker. It uses a separate disposable `gridline-verification` Compose project, its own volume and external network, fixture providers, and localhost port 5174; these names/port must be unused. It verifies the image's user/filesystem, assets/APIs/RSS, proxy-network connectivity, restart/recreation identity, and the documented backup/restore helper. It removes only those verified-new test resources, leaving the production `gridline` project untouched. Its result is saved in `qa/docker-report.json`. `DOCKER_BIN` can select a Docker executable; the runtime application needs no test/browser dependencies.

Quality-of-life checks cover saved favourites across pages and reloads, countdown updates, actual calendar downloads, sticky tables and keyboard scrolling, delayed session requests without scroll jumps, lap filters, tied fastest markers, and mobile navigation. Reports are in `qa/qol-report.json`, with `qa/qol-desktop.png`, `qa/qol-mobile.png` and `qa/qol-mobile-analysis.png` for visual review. `node qa/qol-live.mjs` verifies the running preview with real Hungaroring/Spa maps and lap timing; it saves `qa/qol-live-report.json`, north-oriented map screenshots and a mobile lap-analysis screenshot.

Track browser checks cover keyboard highlighting, retained map selection during session/driver changes, mobile layout and an independent stale fallback. Real-data checks include Albert Park, Shanghai and an upcoming Las Vegas weekend. Map screenshots are `qa/track-desktop.png` and `qa/track-mobile.png`; API verification is in `qa/track-verification.json`.

The browser scripts use Playwright from the local Codex runtime and the Chrome installation configured in `qa/`. Video recording also needs Playwright's FFmpeg helper in `node_modules/.cache/playwright` (or a configured `PLAYWRIGHT_BROWSERS_PATH`). On a different computer, adjust those local paths. Provider checks make read-only requests for representative completed normal and sprint weekends. `node qa/preview.mjs` checks the running preview against real data. Reports and screenshots are saved in `qa/`.
