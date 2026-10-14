import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const folders = ['unit', 'integration'];
const files = (
  await Promise.all(
    folders.map(async (folder) => {
      const directory = path.join(root, 'tests', folder);
      return (await readdir(directory))
        .filter((file) => file.endsWith('.test.ts'))
        .map((file) => path.join(directory, file));
    }),
  )
)
  .flat()
  .sort();
const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...files], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
