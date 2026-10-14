# Project index

Gridline lives in `f1-dashboard/` and uses React, Motion, Vite and TypeScript with a Node HTTP backend. The project is maintained as one npm package.

| Area | Location | Responsibility |
| --- | --- | --- |
| Frontend | `src/client/` | Application shell, browser API/cache clients, reusable controls, dashboard/weekend/circuit/favourites features and styles |
| Backend | `src/server/` | Startup/configuration, HTTP handlers, provider cache/rate limits, results/circuits/RSS services and operational commands |
| Shared | `src/shared/` | Runtime-validated contracts and pure date/session/identity/calendar/lap/track functions |
| Verification | `tests/` | Unit, integration, browser and live smoke checks, fixtures and support helpers |
| Development scripts | `scripts/` | Portable regression/browser runners and compiled Docker test fixtures |
| Circuit references | `data/` | Geographic references and their licence |
| Runtime packaging | `Dockerfile`, `compose.yaml`, `compose.proxy.yaml` | Production and verification images, persistent RSS volume and optional proxy network |
| Generated output | `dist/`, `build/`, `build-fixtures/`, `artifacts/` | Ignored build output, reports, screenshots, recordings and retained baseline evidence |

All paths in the table are relative to `f1-dashboard/`.

Features include calendar/standings, every scheduled session's classification, published points, pits, tires, driver laps/sectors, north-oriented maps, sticky controls, favourites, countdowns, iCalendar export and three RSS feeds. Results continue to use Jolpica/OpenF1 with shared caching, throttling and publication-aware updates.

Read the [application README](f1-dashboard/README.md) for setup and operations and [CONTRIBUTING](f1-dashboard/CONTRIBUTING.md) for coding conventions and test commands.
