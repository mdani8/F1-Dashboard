import { fileURLToPath } from 'node:url';
// Source and compiled modules have identical depth below the application root.
export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
