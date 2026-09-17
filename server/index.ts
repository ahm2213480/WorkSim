import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { getEnv } from './env.js';

try {
  // One validated configuration source (server/env.ts); a bad .env fails fast
  // here with the exact field names instead of crashing mid-request later.
  const env = getEnv();
  const clientDirectory = env.NODE_ENV === 'production' ? fileURLToPath(new URL('../client/', import.meta.url)) : undefined;
  const server = createApp({ clientDirectory }).listen(env.PORT, env.HOST, () => {
    console.log(`WorkSim API listening on http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
  });
  server.on('error', () => { console.error('Unable to start server. Check host and port configuration.'); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      server.close(() => { process.exitCode = 0; });
      setTimeout(() => process.exit(1), 10_000).unref();
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid server configuration.');
  process.exit(1);
}
