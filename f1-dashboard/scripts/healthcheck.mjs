try {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 5173}/healthz`,{signal:AbortSignal.timeout(3000)});
  process.exitCode = response.ok && (await response.json()).status === 'ok' ? 0 : 1;
} catch {process.exitCode = 1;}
