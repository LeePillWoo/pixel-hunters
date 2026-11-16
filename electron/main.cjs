// Desktop shell: keeps the game docked in the bottom-right corner of the screen, above the taskbar.
//   npm run desktop      -> builds the web game and runs it here
//   npm run desktop:dev  -> loads the Vite dev server instead (http://localhost:5173)
const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, net, protocol, screen } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEV = process.argv.includes('--dev');
const DEV_URL = 'http://localhost:5173/';
const DIST = path.join(__dirname, '..', 'dist');
const MINI = { w: 720, h: 192 }; // the 360x96 mini widget at 2x
const FULL = { w: 1280, h: 720 }; // 640x360 at 2x
const TOGGLE_KEY = 'CommandOrControl+Alt+P';

let win = null;
let tray = null;
let mode = 'strip';

// the built game uses ES modules, which need a proper origin rather than file://
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

/** Window bounds for a mode on the display the window is on. */
function boundsFor(m) {
  const display = win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  const wa = display.workArea; // excludes the taskbar
  if (m === 'strip') return { x: wa.x + wa.width - MINI.w, y: wa.y + wa.height - MINI.h, width: MINI.w, height: MINI.h };
  // largest whole multiple of 640x360 that fits, docked to the bottom-right corner
  const k = Math.max(1, Math.min(Math.floor(wa.width / 640), Math.floor(wa.height / 360), FULL.w / 640));
  const width = 640 * k;
  const height = 360 * k;
  return { x: wa.x + wa.width - width, y: wa.y + wa.height - height, width, height };
}

function applyMode(m) {
  mode = m;
  win.setBounds(boundsFor(m));
  refreshTray();
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else {
    win.setBounds(boundsFor(mode)); // the screen may have changed while hidden
    win.show();
  }
  refreshTray();
}

function refreshTray() {
  if (!tray || !win) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win.isVisible() ? '숨기기' : '보이기', accelerator: TOGGLE_KEY, click: toggleVisible },
    { label: mode === 'strip' ? '펼친 화면으로' : '하단 띠로 접기', click: () => win.webContents.send('mode', mode === 'strip' ? 'full' : 'strip') },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]));
  tray.setToolTip(`픽셀 헌터스 (${TOGGLE_KEY.replace('CommandOrControl', 'Ctrl')}로 숨기기/보이기)`);
}

function createWindow() {
  win = new BrowserWindow({
    ...boundsFor(mode),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true, // lives in the tray instead
    backgroundColor: '#14101c',
    icon: path.join(__dirname, 'icon.png'),
    title: '픽셀 헌터스',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: false, // keep the game running while hidden or behind other windows
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.loadURL(DEV ? DEV_URL : 'app://game/index.html');
  win.on('closed', () => (win = null));
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    return net.fetch(pathToFileURL(path.join(DIST, decodeURIComponent(pathname))).toString());
  });

  ipcMain.handle('set-mode', (_e, m) => applyMode(m === 'full' ? 'full' : 'strip'));
  ipcMain.on('hide', () => {
    win?.hide();
    refreshTray();
  });

  createWindow();
  tray = new Tray(path.join(__dirname, 'tray.png'));
  tray.on('click', toggleVisible);
  refreshTray();
  globalShortcut.register(TOGGLE_KEY, toggleVisible);
  // keep the strip on the bottom edge when the taskbar or resolution changes
  screen.on('display-metrics-changed', () => win && win.setBounds(boundsFor(mode)));
});

if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', () => win && (win.show(), refreshTray()));

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
