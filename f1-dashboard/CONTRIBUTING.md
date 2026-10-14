# Working on Gridline

Use the Node version range in `package.json`; the production image uses the pinned Node 24 base. Install with `npm ci` from this directory. Keep dependency versions and `package-lock.json` together.

## Architecture

`src/client` owns React, browser routing, storage, fetch clients, presentation and user interactions. Organize feature components and their data hooks together. Reusable controls live in `components`; clock/visibility/navigation hooks live in `hooks`.

`src/server` owns Node HTTP, runtime configuration, provider access and background RSS collection. HTTP handlers translate requests and responses. Provider adapters validate external input before normalizing it. Feature services compose those adapters. Startup creates one results service shared by HTTP and RSS; feature code receives clocks, fetchers, stores and loggers through explicit dependencies.

`src/shared` contains contracts and pure domain functions. It cannot import React, browser storage, Node built-ins or either application layer. Client and server code cannot import each other. ESLint enforces these boundaries, and the client/server compiler configurations check their runtime environments separately.

Use the existing feature or domain folder before adding a new abstraction. Avoid generic utility collections, unnecessary barrel exports and dependencies that duplicate an existing capability.

## Conventions

- Use TypeScript with strict checking, checked array access and explicit type-only imports. Treat JSON and caught errors as `unknown` until validated or narrowed.
- Name React component files/exports in PascalCase, other modules and directories in kebab-case, functions/variables/hooks in camelCase, and constants with descriptive names. Test files end in `.test.ts`; executable browser/smoke scenarios have descriptive names.
- Give functions one clear responsibility. Prefer early returns and small domain types over nested conditionals or general-purpose frameworks. Keep state changes immutable and external effects visible.
- Preserve nullable timing values. Published points, source attribution, retrieval time and independent availability/staleness belong to the normalized API contract.
- Keep route/session/driver identities stable during requests. Retain abort controllers, revision guards, selected controls, DOM keys, focus and scroll when changing data-loading code.
- Use semantic tables, labelled controls, keyboard-operable tabs/disclosures, status announcements and reduced-motion behavior. Scrollable regions remain focusable.
- Use Prettier for formatting and ESLint for code correctness. Write comments for constraints and deliberate fallbacks, including optional storage, platform-specific fsync support and XML character filtering.
- Remove code after checking imports, scripts, container entrypoints and runtime behavior. Knip's entries describe actual executable roots; do not mask findings by marking every source file as an entry.

The lint configuration deliberately allows focusable regions/tab panels and async test doubles that implement promise-based interfaces. Other type-aware and accessibility checks remain enabled. The lint toolchain pins versions compatible with its React/accessibility plugins; review peer compatibility when updating it.

## Validation

```shell
npm run check
npm run build
```

The aggregate check runs type checks, lint, formatting, unused-code analysis and deterministic Node tests. Use `npm run format` to apply formatting. Do not update fixtures or weaken assertions to make a refactor pass.

```shell
npx playwright install chromium
npm run test:e2e
```

Browser scenarios run against ephemeral fixture servers and produce evidence under `artifacts/`. Shared support code owns browser setup, readiness, animation settling, provider doubles and output paths. Programmatic button activation is used deliberately when a scenario must preserve existing focus/scroll. The animation suite uses real animation time; polling scenarios align the browser animation clock after virtual-time jumps. A test-only name helper supports browser callbacks serialized by `tsx`.

Check mobile overflow and horizontal table scrolling, tab/driver changes during loading, Back/Forward/direct links, unchanged polling, changed-cell highlights and reduced motion after frontend changes. Keep live provider checks separate from fixture checks and respect throttling.

## Build and containers

`npm run build` emits the frontend into `dist/` and server/shared code into `build/`. `npm start` builds and launches `build/server/index.js`. No source loader or frontend build runs inside a started production container.

`npm run test:docker` builds an isolated verification image. Its small compiled fixture bootstrap uses the internal `#server/*` package alias to load the production server output. Fixture helpers are type-checked before transpilation and are excluded from the default production target.

Keep the Compose project/service names, environment variables, volume and RSS journal schema stable. Before replacing a running image, use the README's backup procedure. Verify restart and restore behavior without deleting the production volume. Container health must remain independent of external provider availability.
