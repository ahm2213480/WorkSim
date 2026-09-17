import 'dotenv/config';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const result = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().min(1).default('127.0.0.1'),
}).safeParse(process.env);
if (!result.success) {
  console.error('Invalid server configuration:', result.error.issues.map((issue) => issue.path.join('.')).join(', '));
  process.exit(1);
}
const config = result.data;
const clientDirectory = config.NODE_ENV === 'production' ? fileURLToPath(new URL('../client/', import.meta.url)) : undefined;
const server = createApp(clientDirectory).listen(config.PORT, config.HOST, () => {
  console.log(`WorkSim API listening on http://${config.HOST}:${config.PORT}`);
});
server.on('error', () => { console.error('Unable to start server. Check host and port configuration.'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => { process.exitCode = 0; });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
