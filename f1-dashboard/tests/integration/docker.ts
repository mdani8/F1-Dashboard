import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { validateFeedState } from '../../src/server/features/feeds/feed-store.js';
import { errorMessage, isRecord } from '../../src/shared/contracts/guards.js';
import type { SessionBundle } from '../../src/shared/contracts/results.js';
import { applicationRoot as root } from '../support/paths.js';
interface Health {
  status: string;
  feeds: { state: string; items: number };
}
interface DockerInspection {
  Image: string;
  Config: { User: string };
  State: { Health: { Status: string } };
  HostConfig: { ReadonlyRootfs: boolean; PortBindings: Record<string, { HostIp: string }[]> };
}

const exec = promisify(execFile);
const docker = process.env.DOCKER_BIN || 'docker';
const project = 'gridline-verification',
  network = 'gridline-verification-proxy';
const base = 'http://127.0.0.1:5174';
const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: project,
  HOST_PORT: '5174',
  PUBLIC_BASE_URL: base,
  PROXY_NETWORK: network,
};
const files = [
  '-f',
  'compose.yaml',
  '-f',
  'compose.proxy.yaml',
  '-f',
  'tests/support/compose.fixtures.yaml',
];
const checks = [];
async function run(args: string[]) {
  try {
    return (
      await exec(docker, args, { cwd: root, env, windowsHide: true, maxBuffer: 4 * 1024 * 1024 })
    ).stdout.trim();
  } catch (error) {
    const details = isRecord(error)
      ? [error.stdout, error.stderr]
          .filter((value): value is string => typeof value === 'string')
          .join('\n')
      : errorMessage(error);
    throw new Error(`${args.join(' ')}\n${details}`);
  }
}
const compose = (args: string[]) => run(['compose', ...files, ...args]);
async function ready() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const health = (await (await fetch(base + '/healthz')).json()) as Health;
      if (health.feeds.state === 'ready' && health.feeds.items === 10) return health;
    } catch {
      /* The isolated container may still be starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Fixture container did not finish RSS collection.');
}
let created = false,
  networkCreated = false;
try {
  assert.equal(
    await run([
      'ps',
      '-a',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--format',
      '{{.ID}}',
    ]),
    '',
    'Verification project must be unused.',
  );
  assert.equal(
    await run([
      'volume',
      'ls',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--format',
      '{{.Name}}',
    ]),
    '',
    'Verification volume must be unused.',
  );
  assert.equal(
    await run(['network', 'ls', '--filter', `name=^${network}$`, '--format', '{{.Name}}']),
    '',
    'Verification network must be unused.',
  );
  await run(['network', 'create', network]);
  networkCreated = true;
  await compose(['config', '--quiet']);
  await compose(['build', 'gridline']);
  created = true;
  await compose(['up', '-d', '--no-build', '--wait']);
  const health = await ready(),
    id = await compose(['ps', '-q', 'gridline']);
  const inspected = (JSON.parse(await run(['inspect', id])) as DockerInspection[])[0]!;
  assert.equal(inspected.Config.User, 'node');
  assert.equal(inspected.HostConfig.ReadonlyRootfs, true);
  assert.equal(inspected.State.Health.Status, 'healthy');
  assert.ok(
    inspected.HostConfig.PortBindings['5173/tcp']!.every(
      (binding: { HostIp: string }) => binding.HostIp === '127.0.0.1',
    ),
  );
  const probe = await compose([
    'exec',
    '-T',
    'gridline',
    'node',
    '--input-type=module',
    '-e',
    "import fs from 'node:fs';let readonly=false;try{fs.writeFileSync('/app/probe','test')}catch(error){readonly=['EROFS','EACCES'].includes(error.code)}console.log(JSON.stringify({uid:process.getuid(),readonly,nodeModules:fs.existsSync('/app/node_modules'),geo:fs.existsSync('/app/data/circuit-geography.LICENSE.txt')}));",
  ]);
  assert.deepEqual(JSON.parse(probe), { uid: 1000, readonly: true, nodeModules: false, geo: true });
  checks.push(
    'Linux container is healthy, non-root, read-only, localhost-bound and contains the built application and licensed circuit data',
  );
  const html = await (await fetch(base)).text();
  assert.match(html, /application\/rss\+xml/);
  const asset = /src="([^" ]+\.js)"/.exec(html)![1];
  assert.equal((await fetch(base + asset)).status, 200);
  assert.equal(
    ((await (await fetch(base + '/api/weekends/2026/1/sessions/race')).json()) as SessionBundle)
      .results.data.length,
    3,
  );
  const original = await (await fetch(base + '/feeds/all.xml')).text();
  assert.equal((original.match(/<item>/g) || []).length, 10);
  assert.match(original, /http:\/\/127.0.0.1:5174\/#\/weekend/);
  checks.push(
    'compiled assets, existing results APIs and populated RSS feeds work inside the container',
  );
  const proxy = await run([
    'run',
    '--rm',
    '--network',
    network,
    '--entrypoint',
    'node',
    'gridline:verification',
    '--input-type=module',
    '-e',
    "const health=await(await fetch('http://gridline:5173/healthz')).json();const rss=await fetch('http://gridline:5173/feeds/all.xml');console.log(JSON.stringify({status:health.status,rss:rss.status}));",
  ]);
  assert.deepEqual(JSON.parse(proxy), { status: 'ok', rss: 200 });
  checks.push(
    'a separate container on the existing-style external proxy network reaches gridline:5173 and RSS',
  );
  await compose(['restart', 'gridline']);
  await ready();
  assert.equal(await (await fetch(base + '/feeds/all.xml')).text(), original);
  checks.push('normal restart preserves the RSS document, publication identifiers and revisions');
  await compose(['stop', 'gridline']);
  await compose(['cp', 'gridline:/data/rss-state.json', './artifacts/rss-state-backup-check.json']);
  const journal = validateFeedState(
    JSON.parse(await readFile(path.join(root, 'artifacts/rss-state-backup-check.json'), 'utf8')),
  );
  assert.equal(journal.items.length, 10);
  await compose([
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'node',
    '-v',
    './artifacts/rss-state-backup-check.json:/backup/rss-state.json:ro',
    'gridline',
    'build/server/cli/feed-state.js',
    'restore',
    '/backup/rss-state.json',
  ]);
  await compose(['start', 'gridline']);
  await ready();
  assert.equal(await (await fetch(base + '/feeds/all.xml')).text(), original);
  await compose(['up', '-d', '--no-build', '--force-recreate', '--wait']);
  await ready();
  assert.equal(await (await fetch(base + '/feeds/all.xml')).text(), original);
  checks.push(
    'documented backup/restore helper and container recreation retain journal ownership and RSS identity',
  );
  const report = {
    fixtureBased: true,
    project,
    image: inspected.Image,
    node: await compose(['exec', '-T', 'gridline', 'node', '--version']),
    health,
    checks,
  };
  await writeFile(path.join(root, 'artifacts/docker-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  // Only the verified-absent disposable project/network created above are removed.
  if (created) await compose(['down', '--volumes', '--remove-orphans']);
  if (networkCreated) await run(['network', 'rm', network]);
}
