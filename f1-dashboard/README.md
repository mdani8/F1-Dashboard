# Gridline - F1 Championship

A React and TypeScript Formula 1 dashboard with standings, weekend results, track maps, pit stops, tire strategies, filterable lap analysis, favourites, countdowns, calendar exports, and public RSS feeds. A production Docker image serves the entire frontend and Node backend. Motion adds subtle transitions while preserving Gridline's dark design.

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
Set-Location -LiteralPath 'C:\path\to\f1-dashboard'
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
docker compose exec gridline node build/server/cli/healthcheck.js
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

   | Proxy setting             | Value                                                     |
   | ------------------------- | --------------------------------------------------------- |
   | Public hostname           | Your domain, for example `gridline.example.com`           |
   | Upstream scheme           | `http`                                                    |
   | Upstream hostname/service | `gridline`                                                |
   | Upstream port             | `5173`                                                    |
   | Path                      | `/`, preserving `/api/`, `/feeds/`, assets and `/healthz` |
   | Public TLS                | Terminated by your existing proxy                         |

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

| Setting           | Default                 | Purpose                                                                                                                                                                     |
| ----------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:5173` | Absolute site/feed origin. Set the actual HTTPS public origin behind your proxy. A root trailing slash is accepted; credentials, paths, queries and fragments are rejected. |
| `HOST_PORT`       | `5173`                  | Host-side localhost port. Map a different port when the Node preview occupies 5173.                                                                                         |
| `PROXY_NETWORK`   | Empty                   | Existing proxy Docker network; required only with `compose.proxy.yaml`.                                                                                                     |
| `HOST`            | `0.0.0.0` in Compose    | Listening interface inside the container. Direct Node use defaults to `127.0.0.1`.                                                                                          |
| `PORT`            | `5173`                  | Internal Node port. Compose fixes this to 5173 so its mapping and proxy target agree.                                                                                       |
| `DATA_DIR`        | `/data` in Compose      | RSS journal directory. Direct Node use defaults to `.gridline-data/` beside the application.                                                                                |
| `NODE_ENV`        | `production` in Compose | Production runtime configuration.                                                                                                                                           |
| `TZ`              | `UTC` in Compose        | Server timezone. Browser session displays still use the browser's timezone; RSS dates explicitly use GMT/UTC.                                                               |

Compose reads `.env` to interpolate its configuration and explicitly passes the runtime settings above into Gridline. Shell environment variables take precedence over `.env`; inspect `docker compose config` if a value seems unexpected. Restarting alone does not apply changed environment settings—use `docker compose up -d --wait` to recreate the service.

### Container contents and persistent data

The pinned official Node 24 Bookworm Slim base is used for both build and runtime. The build installs the lockfile, runs type, lint, format, unused-code and regression checks, and produces `dist/` plus compiled server/shared modules in `build/`. The final image contains compiled frontend assets, compiled Node services/shared modules, circuit data/licence and compiled maintenance commands. It runs `node build/server/index.js` directly as the unprivileged `node` user, without installing dependencies or rebuilding at startup. Build tools, browser recordings, local configuration and host `node_modules` are excluded.

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
docker compose run --rm --no-deps -v "./rss-state-backup.json:/backup/rss-state.json:ro" gridline node build/server/cli/feed-state.js restore /backup/rss-state.json
docker compose start gridline
docker compose logs --tail=100 gridline
```

The helper validates the journal version/content and writes atomically as the normal container user, preserving data-directory ownership. Verify that the helper succeeds before restarting. On Linux, the helper's UID 1000 must be able to read the backup bind mount; if needed, make this public-result backup readable with `chmod a+r rss-state-backup.json`.

A restored snapshot keeps its existing RSS identifiers. Readers do not receive duplicate reminders just because the container restarts. Restoring an older backup can replay changes published since that backup; prefer the newest backup. A damaged/unsupported journal stops RSS publication without overwriting the file; the rest of the website remains usable. Restore a valid backup and restart to recover.

**Optional full reset:** `docker compose down --volumes` removes this project's RSS volume as well as its containers. It erases feed publication history; rebuilding afterwards can republish backfilled results/reminders. Use ordinary `docker compose down` for routine shutdown.

### Docker troubleshooting

| Symptom                                             | Check / fix                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker` or `docker compose` is not found           | Start a new terminal after installation. Ensure Docker Desktop's CLI tools are installed/on PATH, or install the Linux Compose plugin.                             |
| Cannot connect to Docker; missing named pipe/socket | Start the engine and wait until `docker version` shows Server information. Use Linux containers on Windows.                                                        |
| Port 5173 is already allocated                      | Keep the Node preview running and choose `HOST_PORT=5174` plus the matching local `PUBLIC_BASE_URL`, or stop the previous preview.                                 |
| External network not found                          | Use the actual existing proxy network name in `PROXY_NETWORK`. Inspect it with `docker network inspect NAME`; do not start the public override with an empty name. |
| Proxy returns 502                                   | Check both containers share the network. The upstream is HTTP `gridline:5173`, not `127.0.0.1` inside the proxy. Check `docker compose ps` and logs.               |
| Feed URLs contain localhost                         | Correct `PUBLIC_BASE_URL` to the public HTTPS origin and recreate using both Compose files. Existing item identifiers are retained.                                |
| RSS initially returns 503                           | Check `/healthz` and logs. Initial calendar collection may still be running; retry after 60 seconds.                                                               |
| `feeds.state` is degraded                           | The server is serving retained publications while some provider data is unavailable. Check internet/DNS and provider messages; rate limits/backoff are automatic.  |
| Upcoming feed is empty                              | Reminders appear only for confirmed starts within 24 hours. Time-TBC/cancelled sessions do not get new reminders.                                                  |
| Website works but results are missing               | Free data may not be published yet. Provider outages/authentication restrictions do not mean a Docker startup failure.                                             |
| RSS journal cannot be loaded                        | Preserve the damaged file, restore a validated backup and restart. Do not delete the volume as a routine repair.                                                   |
| Permission denied for a bind-mounted data directory | Prefer the provided named volume. A custom data directory must be writable by container UID/GID 1000.                                                              |
| Source/environment changes are not visible          | Rebuild/recreate with `up -d --build --wait`; `restart` uses the existing image/configuration.                                                                     |

## Images from GitHub Actions

The repository's [Docker workflow](../.github/workflows/docker-image.yml) builds and publishes **`ghcr.io/mdani8/f1-dashboard`** on every branch or Git tag push. You can also run **Build and publish Docker image** manually from the repository's **Actions** tab. Deleting a branch or tag does not build an image.

Each image includes **Linux AMD64 and ARM64** variants. Docker selects the matching architecture when pulling it. The workflow uses the existing Dockerfile's `production` target, including type checking, lint, formatting, unused-code analysis and all 54 regression tests. A failed build/check prevents publication. After publishing, it verifies the registry manifest and starts both variants with read-only filesystems and temporary data directories to check `/healthz`. These checks have networking disabled, so provider availability does not affect their result.

| Image tag                   | Meaning                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `sha-<full-commit-sha>`     | Image for a specific source commit; available after each successful build.                         |
| `branch-<sanitized-branch>` | Most recently published build of that branch, such as `branch-main` or `branch-codex-new-feature`. |
| `tag-<sanitized-git-tag>`   | Build associated with a Git tag, such as `tag-v1.0.0`.                                             |
| `latest`                    | Updated only by successful builds from `main`, including manual runs on that branch.               |

Automatic `latest` tagging is disabled for other branches and Git tags. Tags can move; use the digest shown in the workflow summary to select an exact image. The summary includes the published tags, digest and ready-to-copy pull commands. Source repository and commit labels are attached to the image.

The workflow uses GitHub's built-in `GITHUB_TOKEN` with `contents: read` and `packages: write`; no Docker Hub account or additional registry secrets are needed. Actions are pinned to verified commit SHAs, and Docker layers use GitHub Actions caching. Each job has a 45-minute timeout. ARM64 builds and checks use QEMU and can take longer than native AMD64 builds. See [GitHub's publishing guide](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images) and [Docker's multi-platform guide](https://docs.docker.com/build/ci/github-actions/multi-platform/).

### Registry access

New GHCR packages are **private by default**, including packages built from public repositories. Publishing does not change the repository or package visibility. To allow anonymous pulls, open your GitHub profile's **Packages**, select **f1-dashboard**, and use **Package settings → Change visibility → Public**. Public visibility applies to the whole package, including images published from feature branches; keep the package private if those images should require authentication. See [GHCR access and visibility](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

For a private package, sign in on each Docker host with a GitHub personal access token **(classic)** that has `read:packages` and an account authorized to read the package. Run this command and enter the token at the password prompt; do not put it in Compose, `.env`, or the command itself:

```shell
docker login ghcr.io --username YOUR_GITHUB_USERNAME
docker pull ghcr.io/mdani8/f1-dashboard:latest
```

Public packages can be pulled without signing in. Publishing from Actions continues to use `GITHUB_TOKEN`, rather than a personal access token.

### Run a published image with the existing Compose setup

Configure `.env` and the reverse proxy as described above. If updating an existing installation, follow the RSS backup procedure first and optionally tag the current `gridline:local` image as `gridline:rollback`. From `f1-dashboard/`:

```shell
docker pull ghcr.io/mdani8/f1-dashboard:latest
docker image tag ghcr.io/mdani8/f1-dashboard:latest gridline:local
docker compose up -d --no-build --force-recreate --wait
docker compose exec gridline node build/server/cli/healthcheck.js
```

This retains the Compose service, runtime protections and `gridline_feed_data` volume. For a proxy deployment, keep using `-f compose.yaml -f compose.proxy.yaml` with each Compose command. Repeat the pull/tag/recreate steps to update, or substitute `sha-<full-commit-sha>` for `latest` to select a commit. To select an exact digest, pull and tag `ghcr.io/mdani8/f1-dashboard@sha256:<digest>` instead.

Keep `--no-build` when using the downloaded image: `--build` rebuilds the local source. The workflow publishes images without automatically restarting or deploying any installation. Existing local builds and rollback commands continue to work.

### Workflow troubleshooting

| Symptom                                       | Check / fix                                                                                                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No workflow run after a push                  | The workflow must be at the repository root under `.github/workflows/`, and Actions must be enabled in repository settings. Branch/tag deletions are intentionally skipped.   |
| Workflow cannot publish to GHCR               | Check the failed step and repository/organization Actions policy. An existing package must grant this repository write access under its package settings.                     |
| Local pull returns `denied` or `unauthorized` | Authenticate with a classic token containing `read:packages`, confirm package access, or explicitly make the package public. Publishing successfully does not make it public. |
| A tag is missing                              | Check the run for that push. Git tags use the `tag-` prefix; only `main` publishes `latest`. Build/check failures prevent publication.                                        |
| Image was published but the run is red        | Read the manifest/container verification step. Publication happens before these checks, so use the previous known-good commit tag or digest until the failure is resolved.    |
| A job reaches its timeout                     | Inspect the failing stage. The first multi-platform build and ARM64 emulation are slower; later builds reuse cached layers.                                                   |

## RSS subscriptions

Copy one of these URLs into your RSS reader, replacing the origin with your public domain or configured local port:

| Feed                                                | URL                                      |
| --------------------------------------------------- | ---------------------------------------- |
| All results, reminders and corrections              | `https://YOUR_DOMAIN/feeds/all.xml`      |
| Full session classifications and result corrections | `https://YOUR_DOMAIN/feeds/results.xml`  |
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

`npm start` builds the React frontend into `dist/`, compiles the backend into `build/`, and starts the compiled Node server. Open **http://127.0.0.1:5173**. Keep the terminal running; press Ctrl+C to stop the server. The server listens only on your computer. If port 5173 is occupied, stop the previous preview before restarting. `npm run build` produces both frontend and backend without starting the server; restart `npm start` after editing source files.

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

The application is one npm package. TypeScript source is separated by runtime and feature:

```text
src/
  client/       React application, browser API clients, feature components and hooks
  server/       HTTP handlers, provider adapters, results, circuits, RSS and CLI commands
  shared/       Validated contracts and framework-independent domain functions
tests/
  unit/         Pure domain, provider and client-cache regression tests
  integration/  HTTP, durable RSS storage and isolated Docker verification
  e2e/          Fixture-based navigation, animation, preference and RSS scenarios
  smoke/        Explicit checks against published data and a running application
  fixtures/     Deterministic provider responses
  support/      Shared fixture, browser, HTTP and output helpers
scripts/        Portable test runners and verification-fixture compilation
data/           Circuit references and their licence
static/         Static assets copied by Vite
```

Frontend features include dashboard standings/calendar, weekend results and driver analysis, circuit maps, and favourites. CSS is split into ordered theme, base, shell, component and feature styles. Shared modules contain no React, browser-storage or Node-only dependencies. The server composes one provider service shared by HTTP requests and the RSS collector.

Build output is disposable: Vite writes `dist/`, TypeScript writes `build/`, and verification fixtures write `build-fixtures/`. Reports, screenshots and recordings go into ignored `artifacts/`. The production image includes only runtime output and circuit data.

See [CONTRIBUTING.md](CONTRIBUTING.md) for coding conventions, module boundaries and the validation workflow.

## Local results API

- `GET /api/weekends/:season/:round` — weekend metadata and session identifiers.
- `GET /api/weekends/:season/:round/track` — reference track geometry, three sectors, start/finish and reference lap details.
- `GET /api/weekends/:season/:round/sessions/:slug` — classifications, driver roster, pit stops and tire stints.
- `GET /api/weekends/:season/:round/sessions/:slug/laps?driver=<number>` — a session roster driver's laps and sectors.
- `GET /healthz` — provider-independent application health and RSS collector status.

Session slugs are `practice-1`, `practice-2`, `practice-3`, `qualifying`, `sprint-qualifying`, `sprint` and `race`, when present in the calendar. Add `refresh=1` to request a refresh within provider limits. The dashboard uses a restricted `/api/jolpica/` proxy for the calendar and standings.

The refactor preserves API paths and response bodies, shareable hash routes, the `gridline:v1:` and `gridline:results:v1:` cache prefixes, and the `gridline:favourites:v1` preference key. RSS journal schema version 1, GUIDs, correction revisions, Compose project/service names, environment variables and the `feed_data` volume are retained. An ordinary image rebuild/recreation requires no data migration.

## Development checks

Run from this directory after `npm ci`:

```shell
npm run check
npm run build
```

`check` runs strict TypeScript checks for the application and tests, type-aware ESLint/React Hooks/accessibility checks, Prettier, Knip, and the Node regression suite. The 54 original tests are retained. Fixture tests exercise identities, published points, missing timing, cancellations, stale caches, provider throttling, maps, favourites, calendars, lap filters, RSS revisions, atomic storage, shutdown and conditional HTTP responses.

Install the project-managed browser once for browser checks:

```shell
npx playwright install chromium
npm run test:e2e
```

On Linux, use `npx playwright install --with-deps chromium` to install browser system dependencies too. Browser tooling is for development and is excluded from the production image. An existing browser may be selected through `BROWSER_EXECUTABLE_PATH`; no computer-specific browser paths are embedded in the tests.

`test:e2e` builds once and runs desktop/mobile navigation, reduced motion and animation, sticky controls/favourites/calendar/lap analysis, and RSS browser checks. Individual commands remain available: `test:browser`, `test:animations`, `test:qol` and `test:rss`. Each individual command builds first. Output is written under `artifacts/`, including desktop/mobile screenshots and `animations.webm`.

With Docker running:

```shell
npm run test:docker
```

This builds the verification target and uses the separate `gridline-verification` project, disposable volume and proxy network on localhost port 5174. It verifies the compiled application, non-root/read-only runtime, health, proxy connectivity, restart identity, and the documented backup/restore workflow, then removes its own resources. Its fixture entrypoint imports the production server's compiled JavaScript. The normal image contains no test fixtures or browser tooling. The verification script requires port 5174 and its resource names to be unused; it does not modify the running `gridline` service or its persistent volume.

Published-data smoke checks are separate from deterministic checks:

```shell
npm run test:providers
npm run test:preview
npm run test:qol-live
npm run test:rss-live
```

The provider check creates its own read-only data service. The other smoke commands inspect the application already running at `http://127.0.0.1:5173`. Provider publication schedules, outages and throttling can affect these checks; follow provider cooldowns before retrying. Their reports and screenshots also go into `artifacts/`.
