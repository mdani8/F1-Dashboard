import { errorMessage } from '../shared/contracts/guards.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { installShutdown, startApplication } from './app.js';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const app = await startApplication();
    installShutdown(app);
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}
