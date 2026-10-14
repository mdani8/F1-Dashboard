import { spawn } from 'node:child_process';
for (const scenario of ['navigation', 'animations', 'preferences', 'feeds']) {
  const code = await new Promise<number>((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', `tests/e2e/${scenario}.ts`], {
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', (error) => {
      console.error(error.message);
      resolve(1);
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
  if (code) {
    process.exitCode = code;
    break;
  }
}
