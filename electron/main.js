// Electron main process — boots Lucy's bundled Next standalone server on a
// local port and loads it in a window. STANDALONE / local-only: the window only
// ever shows the bundled local server. It never loads the live justlucy.ai site
// in-window (that would defeat local-first); "Open on the web" opens the browser.
const { app, BrowserWindow, Menu, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const http = require('http');

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
// cloud site — a standalone app must stay local — so surface the failure and let
// the user reopen the app (which retries the server boot).
const ERROR_URL =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
      `*{margin:0;box-sizing:border-box}html,body{height:100%}` +
      `body{background:#0c0a16;display:flex;align-items:center;justify-content:center;` +
      `font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;padding:24px}` +
      `.w{text-align:center;max-width:420px}` +
      `.logo{width:56px;height:56px;border-radius:16px;margin:0 auto 18px;` +
      `background:linear-gradient(135deg,#a78bfa,#7c3aed)}` +
      `h1{font-size:19px;font-weight:800;margin-bottom:10px}` +
      `p{font-size:13px;color:#9ca3af;line-height:1.5}` +
      `</style></head><body><div class="w"><div class="logo"></div>` +
      `<h1>Lucy couldn’t start its local engine</h1>` +
      `<p>The bundled local server didn’t start. Please quit and reopen Lucy. ` +
      `If it keeps happening, reinstall the latest version.</p></div></body></html>`
  );

let serverProcess = null;
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

function waitForServer(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      // Probe the page we actually load (/chat) so the route is warm by the
      // time loadURL fires — avoids rendering the heavy '/' landing twice.
      const req = http.get({ host: '127.0.0.1', port, path: HOME_PATH }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('Lucy server did not start in time'));
        else setTimeout(attempt, 120);
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
  serverProcess = spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
    },
    stdio: 'inherit',
  });
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

  try {
    localUrl = await startLocalServer();
  } catch (err) {
    console.error('[lucy-desktop] local server failed to start:', err.message);
    localUrl = null;
  }
  buildMenu(); // refresh so the "Local (offline)" menu item reflects availability

  if (mainWindow && !mainWindow.isDestroyed()) {
    // Local-only: load the bundled server, or an error page if it didn't boot.
    // NEVER fall back to the live cloud site — that would break standalone.
    mainWindow.loadURL(localUrl ? localUrl + HOME_PATH : ERROR_URL);
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
