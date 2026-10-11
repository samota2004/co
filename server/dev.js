import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// An explicit development entry point, shared by both npm run dev commands.
// The endpoint router still checks the actual peer is loopback, and production
// startup never imports this file. An explicit false setting is respected.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
process.env.NODE_ENV = 'development';
process.env.ENDPOINT_ALLOW_LOOPBACK_HTTP ??= 'true';
await import('./server.js');
