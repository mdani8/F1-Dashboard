import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const applicationRoot = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(applicationRoot, 'artifacts');
await mkdir(output, { recursive: true });
export function artifactPath(filename: string): string {
  return path.join(output, filename);
}
