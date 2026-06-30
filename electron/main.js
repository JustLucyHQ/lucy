// Electron main process — boots Lucy's bundled Next standalone server on a
// local port and loads it in a window. STANDALONE / local-only: the window only
// ever shows the bundled local server. It never loads the live justlucy.ai site
// in-window (that would defeat local-first); "Open on the web" opens the browser.
const { app, BrowserWindow, Menu, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const http = require('http');
const fs = require('fs');

const CLOUD_URL = 'https://justlucy.ai';
// Desktop app skips the marketing home page: load the app directly. The auth
// middleware sends unauthenticated users to /auth/login, authenticated users
// straight into chat.
const HOME_PATH = '/chat';

// Inline splash shown instantly while the bundled Next server boots, so the
// window appears immediately instead of after the Node + Next cold start.
const SPLASH_URL =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
      `*{margin:0;box-sizing:border-box}html,body{height:100%}` +
      `body{background:#0c0a16;display:flex;align-items:center;justify-content:center;` +
      `font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff}` +
      `.w{text-align:center}` +
      `.logo{width:60px;height:60px;border-radius:18px;margin:0 auto 20px;` +
      `background:linear-gradient(135deg,#a78bfa,#7c3aed);box-shadow:0 0 36px rgba(139,92,246,.55);` +
      `animation:p 1.5s ease-in-out infinite}` +
      `.n{font-size:21px;font-weight:800;letter-spacing:-.02em}.n b{color:#6b7280;font-weight:800}` +
      `.s{margin-top:10px;font-size:13px;color:#6b7280}` +
      `@keyframes p{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.9);opacity:.65}}` +
      `</style></head><body><div class="w"><div class="logo"></div>` +
      `<div class="n"><b>Just</b> Lucy</div><div class="s">Starting up…</div></div></body></html>`
  );

// Shown if the bundled local server can't start. We do NOT fall back to the
// cloud site — a standalone app must stay local — so we surface the server's
// actual output (also written to lucy-server.log) so the failure is diagnosable.
function escapeHtml(s) {
  return String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}
function errorPageUrl(detail) {
  let logPath = 'lucy-server.log';
  try { logPath = path.join(app.getPath('userData'), 'lucy-server.log'); } catch { /* app not ready */ }
  const tail = escapeHtml(String(detail || '').slice(-2600));
  return (
    'data:text/html;charset=utf-8,' +
    encodeURIComponent(
      `<!doctype html><html><head><meta charset="utf-8"><style>` +
        `*{margin:0;box-sizing:border-box}html,body{height:100%}` +
        `body{background:#0c0a16;display:flex;align-items:center;justify-content:center;` +
        `font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;padding:24px}` +
        `.w{max-width:660px;width:100%;text-align:center}` +
        `.logo{width:52px;height:52px;border-radius:15px;margin:0 auto 16px;` +
        `background:linear-gradient(135deg,#a78bfa,#7c3aed)}` +
        `h1{font-size:18px;font-weight:800;margin-bottom:8px}` +
        `p{font-size:13px;color:#9ca3af;line-height:1.5;margin-bottom:6px}` +
        `pre{text-align:left;margin-top:14px;padding:12px;border-radius:8px;background:#16131f;` +
        `color:#c9b8f0;font-size:11px;line-height:1.45;max-height:240px;overflow:auto;white-space:pre-wrap}` +
        `</style></head><body><div class="w"><div class="logo"></div>` +
        `<h1>Lucy couldn’t start its local engine</h1>` +
        `<p>The bundled local server didn’t start. Quit and reopen Lucy to retry.</p>` +
        `<p style="font-size:11px;color:#6b7280">Full log: ${escapeHtml(logPath)}</p>` +
        (tail ? `<pre>${tail}</pre>` : '') +
        `</div></body></html>`
    )
  );
}

let serverProcess = null;
let serverLog = '';
let mainWindow = null;
let localUrl = null;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function appendServerLog(chunk) {
  serverLog += chunk;
  if (serverLog.length > 24000) serverLog = serverLog.slice(-24000);
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'lucy-server.log'), chunk);
  } catch {
    /* logging is best-effort */
  }
}

function waitForServer(port, timeoutMs = 90000) {
  // Resolve when /chat answers; reject early if the server process exits first.
  // The long timeout tolerates a fresh, unsigned app on a clean PC where Windows
  // Defender scans every file the Node server touches on first launch.
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (serverProcess && serverProcess.exitCode !== null) {
        reject(new Error(`server process exited (code ${serverProcess.exitCode}) before it was ready`));
        return;
      }
      // Probe the page we actually load (/chat) so the route is warm by the
      // time loadURL fires — avoids rendering the heavy '/' landing twice.
      const req = http.get({ host: '127.0.0.1', port, path: HOME_PATH }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('local server did not respond in time'));
        else setTimeout(attempt, 150);
      });
    };
    attempt();
  });
}

function serverEntryPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'standalone', 'server.js')
    : path.join(__dirname, '..', '.next', 'standalone', 'server.js');
}

async function startLocalServer() {
  const port = await getFreePort();
  const entry = serverEntryPath();
  if (!fs.existsSync(entry)) {
    throw new Error(`bundled server not found at ${entry}`);
  }
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'lucy-server.log'), '');
  } catch {
    /* best-effort */
  }
  serverProcess = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
    },
    // Capture output — a packaged GUI app has no console, so 'inherit' would
    // black-hole any crash. Piping it lets us log + show it on the error page.
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (serverProcess.stdout) serverProcess.stdout.on('data', (b) => appendServerLog(b.toString()));
  if (serverProcess.stderr) serverProcess.stderr.on('data', (b) => appendServerLog(b.toString()));
  serverProcess.on('error', (e) => appendServerLog(`\n[spawn error] ${e.message}\n`));

  await waitForServer(port);
  return `http://127.0.0.1:${port}`;
}

function buildMenu() {
  const template = [
    {
      label: 'Lucy',
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Local (offline)',
          enabled: !!localUrl,
          click: () => localUrl && mainWindow && mainWindow.loadURL(localUrl + HOME_PATH),
        },
        {
          label: 'Open Lucy on the web (justlucy.ai)',
          // Opens in the OS browser — never loads the live site inside this
          // standalone window.
          click: () => shell.openExternal(CLOUD_URL),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'Lucy',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    backgroundColor: '#0c0a16',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Electron denies getUserMedia by default — grant microphone (and camera)
  // so in-app voice recording works. Only 'media' is allowed; everything else
  // is denied.
  const ses = mainWindow.webContents.session;
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  // Open target=_blank / external links in the OS browser, not a new window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Show the splash instantly, then boot the bundled server in parallel and
  // swap to the app once it's ready — the window is visible the whole time
  // instead of appearing only after the Node + Next cold start.
  mainWindow.loadURL(SPLASH_URL);
  buildMenu();

  let startErr = null;
  try {
    localUrl = await startLocalServer();
  } catch (err) {
    startErr = err;
    console.error('[lucy-desktop] local server failed to start:', err.message);
    localUrl = null;
  }
  buildMenu(); // refresh so the "Local (offline)" menu item reflects availability

  if (mainWindow && !mainWindow.isDestroyed()) {
    // Local-only: load the bundled server, or an error page (with the server's
    // own output) if it didn't boot. NEVER fall back to the live cloud site.
    mainWindow.loadURL(
      localUrl
        ? localUrl + HOME_PATH
        : errorPageUrl(serverLog || (startErr && startErr.message) || 'unknown error')
    );
  }
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
