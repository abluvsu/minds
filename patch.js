const fs = require('fs');

const path = 'd:/Minds_db_my_folder/minds/frontend/src/main/server-process.ts';
let code = fs.readFileSync(path, 'utf8');

// Chunk 1: Imports
code = code.replace(
  `import { app } from 'electron';`,
  `import { app, BrowserWindow } from 'electron';\nimport { IPC } from '../shared/ipc-channels';`
);

// Chunk 2: probeHealth + watchdog
const probeHealthTarget = `async function probeHealth(timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(
        { hostname: SERVER_HOST, port: serverPort, path: '/api/v1/health/', timeout: 1000 },
        (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        },
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.warn(\`[server] health check failed after \${timeoutMs}ms on port \${serverPort}\`);
  return false;
}`;

const probeHealthReplacement = `function getCoworkDevServerEnv(): boolean {
  if (process.env.COWORK_DEV_SERVER === '1') return true;
  try {
    const envPath = path.join(os.homedir(), '.anton', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\\n')) {
      if (line.trim() === 'COWORK_DEV_SERVER=1') return true;
    }
  } catch {}
  return false;
}

function getServerBuildStampHash(): string | null {
  try {
    const stampPath = path.join(os.homedir(), '.cowork', 'server-build-stamp.json');
    const content = fs.readFileSync(stampPath, 'utf8');
    const parsed = JSON.parse(content);
    return parsed.hash || null;
  } catch {
    return null;
  }
}

export interface HealthStatus {
  ok: boolean;
  buildHash?: string | null;
}

async function probeHealthData(timeoutMs: number): Promise<HealthStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = await new Promise<HealthStatus>((resolve) => {
      const req = http.get(
        { hostname: SERVER_HOST, port: serverPort, path: '/api/v1/health/', timeout: Math.min(timeoutMs, 5000) },
        (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode !== 200) { resolve({ ok: false }); return; }
            try {
              const data = JSON.parse(body);
              resolve({ ok: true, buildHash: data?.build?.hash });
            } catch {
              resolve({ ok: true });
            }
          });
        }
      );
      req.on('error', () => resolve({ ok: false }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    });
    if (status.ok) return status;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.warn(\`[server] health check failed after \${timeoutMs}ms on port \${serverPort}\`);
  return { ok: false };
}

async function probeHealth(timeoutMs: number): Promise<boolean> {
  const res = await probeHealthData(timeoutMs);
  return res.ok;
}

let watchdogTimer: NodeJS.Timeout | null = null;
let watchdogFailCount = 0;
let watchdogRespawnCount = 0;

function startWatchdog() {
  if (watchdogTimer) return;
  watchdogFailCount = 0;
  watchdogTimer = setInterval(async () => {
    if (getCoworkDevServerEnv()) return; // Don't manage dev server
    if (_stopRequested) return;
    
    const status = await probeHealthData(5000);
    if (status.ok) {
      watchdogFailCount = 0;
    } else {
      watchdogFailCount++;
      console.warn(\`[server-watchdog] Health check failed (\${watchdogFailCount}/3)\`);
      if (watchdogFailCount >= 3) {
         console.error(\`[server-watchdog] Server unhealthy. Restarting...\`);
         handleWatchdogFailure();
      }
    }
  }, 30000);
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

async function handleWatchdogFailure() {
  stopWatchdog();
  if (watchdogRespawnCount >= 3) {
    console.error(\`[server-watchdog] Reached max respawns (3). Giving up.\`);
    BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => w.webContents.send(IPC.SERVER_UNRECOVERABLE));
    return;
  }
  
  const backoff = [5000, 15000, 45000][watchdogRespawnCount] || 45000;
  watchdogRespawnCount++;
  
  await stopServer();
  setTimeout(() => {
    startServer();
  }, backoff);
}`;

if (code.includes(probeHealthTarget)) {
  code = code.replace(probeHealthTarget, probeHealthReplacement);
} else {
  code = code.replace(probeHealthTarget.replace(/\n/g, '\r\n'), probeHealthReplacement);
}

// Chunk 3: startServer Pre-flight
const preflightTarget = `  const alreadyHealthy = await probeHealth(500);
  if (alreadyHealthy) {
    serverStarted = true;
    _adoptedExternal = true;
    lastStartError = null;
    console.log(\`[server] adopted existing instance on port \${serverPort}\`);
    return { ok: true, port: serverPort };
  }`;

const preflightReplacement = `  const isDevServer = getCoworkDevServerEnv();
  const alreadyHealthy = await probeHealthData(5000); // Wait up to 5s if occupied
  
  if (isDevServer) {
    console.log(\`[server] COWORK_DEV_SERVER=1 detected. Skipping kill/spawn.\`);
    serverStarted = true;
    _adoptedExternal = true;
    lastStartError = null;
    BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => w.webContents.send(IPC.SERVER_DEV_MODE));
    return { ok: true, port: serverPort };
  }

  if (alreadyHealthy.ok) {
    const expectedHash = getServerBuildStampHash();
    if (expectedHash && expectedHash === alreadyHealthy.buildHash) {
      serverStarted = true;
      _adoptedExternal = true;
      lastStartError = null;
      console.log(\`[server] adopted existing instance on port \${serverPort} (hash matched: \${expectedHash})\`);
      startWatchdog();
      return { ok: true, port: serverPort };
    } else {
      console.log(\`[server] existing instance hash mismatch (expected \${expectedHash}, got \${alreadyHealthy.buildHash}). Killing...\`);
      await killProcessOnPort(serverPort);
    }
  } else {
    // Port might be occupied by hung process. kill it just in case
    await killProcessOnPort(serverPort);
  }`;

if (code.includes(preflightTarget)) {
  code = code.replace(preflightTarget, preflightReplacement);
} else {
  code = code.replace(preflightTarget.replace(/\n/g, '\r\n'), preflightReplacement);
}

// Chunk 4: startWatchdog hook
const startTarget = `    serverStarted = true;
    // Successful start — clear the previous failure note but keep
    // the rolling stderr in case downstream code wants to inspect.
    lastStartError = null;
    return { ok: true, port: serverPort };`;

const startReplacement = `    serverStarted = true;
    // Successful start — clear the previous failure note but keep
    // the rolling stderr in case downstream code wants to inspect.
    lastStartError = null;
    startWatchdog();
    return { ok: true, port: serverPort };`;

if (code.includes(startTarget)) {
  code = code.replace(startTarget, startReplacement);
} else {
  code = code.replace(startTarget.replace(/\n/g, '\r\n'), startReplacement);
}

// Chunk 5: stopWatchdog hook
const stopTarget = `export async function stopServer(): Promise<void> {
  const proc = serverProcess;`;

const stopReplacement = `export async function stopServer(): Promise<void> {
  stopWatchdog();
  const proc = serverProcess;`;

if (code.includes(stopTarget)) {
  code = code.replace(stopTarget, stopReplacement);
} else {
  code = code.replace(stopTarget.replace(/\n/g, '\r\n'), stopReplacement);
}

fs.writeFileSync(path, code);
console.log('Patch complete.');
