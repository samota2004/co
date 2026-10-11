import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const serverDirectory = fileURLToPath(new URL('../', import.meta.url));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function occupy(port = 0) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });
  return server;
}
function launch(port) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: serverDirectory, windowsHide: true,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development', DATABASE_URL: '', DISABLE_HMR: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const ended = once(child, 'exit');
  return { child, ended, output: () => output };
}
async function stop(run) {
  if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill();
  await run.ended;
}
async function waitReady(run) {
  for (let i = 0; i < 200; i++) {
    const match = run.output().match(/Server running on http:\/\/localhost:(\d+)/);
    if (match) return Number(match[1]);
    if (run.child.exitCode !== null) throw new Error(`Backend exited before listening: ${run.output()}`);
    await pause(100);
  }
  throw new Error('Backend startup timed out');
}

test('duplicate backend fails clearly before opening Vite or its WebSocket', { timeout: 30000 }, async () => {
  const blocker = await occupy();
  const port = blocker.address().port;
  const run = launch(port);
  try {
    const [code] = await run.ended;
    assert.equal(code, 1);
    assert.ok(run.output().includes(`Port ${port} is already in use.`));
    assert.ok(run.output().includes('Ctrl+C'));
    assert.doesNotMatch(run.output(), /Unhandled 'error' event|WebSocket server error|Server running/);
  } finally {
    await stop(run);
    await new Promise(resolve => blocker.close(resolve));
  }
});

test('backend serves HTTP and Vite WebSocket on one port even when 24678 is occupied', { timeout: 45000 }, async () => {
  const blocker = await occupy(24678);
  const run = launch(0);
  let ws;
  try {
    const port = await waitReady(run);
    const origin = `http://127.0.0.1:${port}`;
    const health = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(5000) });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, 'CyberOrbit API');
    const page = await fetch(origin, { signal: AbortSignal.timeout(20000) }).catch(error => {
      throw new Error(`Development HTML request failed: ${error.message}. Backend: ${run.output()}`);
    });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /\/@vite\/client/);
    const client = await fetch(`${origin}/@vite/client`, { signal: AbortSignal.timeout(10000) }).catch(error => {
      throw new Error(`Vite client request failed: ${error.message} (${error.cause?.code || error.name}). Backend: ${run.output()}`);
    });
    assert.equal(client.status, 200);
    const clientScript = await client.text();
    const token = clientScript.match(/const wsToken = "([^"]+)"/)?.[1];
    assert.ok(token, 'Vite client exposes its WebSocket authentication token');
    ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`, 'vite-hmr');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Vite WebSocket connection timed out')), 5000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Vite WebSocket connection failed')); }, { once: true });
    });
    assert.doesNotMatch(run.output(), /WebSocket server error|EADDRINUSE|Unhandled 'error' event/);
  } finally {
    ws?.close();
    await stop(run);
    await new Promise(resolve => blocker.close(resolve));
  }
});
