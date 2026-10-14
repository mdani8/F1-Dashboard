import { isRecord } from '../../shared/contracts/guards.js';
try {
  const response = await fetch('http://127.0.0.1:' + (process.env.PORT || 5173) + '/healthz', {
    signal: AbortSignal.timeout(3000),
  });
  const body: unknown = await response.json();
  process.exitCode = response.ok && isRecord(body) && body.status === 'ok' ? 0 : 1;
} catch {
  process.exitCode = 1;
}
