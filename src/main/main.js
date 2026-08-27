const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');

const {
  DIRS, FILES, ensureDirs, ensureDefaultSound, DEFAULT_SOUND, DATA_ROOT,
  recoverPreviousData, rememberLocation,
} = require('./paths');
const { readJson, writeJson } = require('./store');
const library = require('./library');
const youtube = require('./youtube');
const server = require('./server');
const shortcuts = require('./shortcuts');

// Must be set before any window exists, or the taskbar groups the app wrongly.
app.setAppUserModelId(shortcuts.APP_ID);

// Single instance - a second launch just focuses the running window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;

function createWindow() {
  const bounds = readJson(FILES.settings, {}).bounds || {};
  win = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 820,
    x: bounds.x,
    y: bounds.y,
    minWidth: 940,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0b0b0f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  if (!app.isPackaged) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[renderer] ${message}  (${source}:${line})`);
    });
  }

  const persistBounds = () => {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const settings = readJson(FILES.settings, {});
    settings.bounds = win.getNormalBounds();
    writeJson(FILES.settings, settings);
  };
  win.on('resize', persistBounds);
  win.on('move', persistBounds);
  win.on('closed', () => { win = null; });

  const sendState = () => win && win.webContents.send('window:state', { maximized: win.isMaximized() });
  win.on('maximize', sendState);
  win.on('unmaximize', sendState);

  // Real links open in the system browser, never inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

let recoveredFrom = null;

app.whenReady().then(async () => {
  ensureDirs();

  // If this copy of the app is new but a previous library exists elsewhere,
  // bring it across before anything reads from disk.
  recoveredFrom = recoverPreviousData();
  if (recoveredFrom) console.log('recovered library from', recoveredFrom);
  rememberLocation();

  try {
    fs.rmSync(DIRS.staging, { recursive: true, force: true });
    fs.mkdirSync(DIRS.staging, { recursive: true });
  } catch (err) { /* staging is best-effort */ }

  await server.start();
  ensureDefaultSound();
  shortcuts.ensureStartMenu(readJson(FILES.profile, {}).appName || 'UTune');

  // Needed so the font picker can call queryLocalFonts().
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'local-fonts'));
  ses.setPermissionCheckHandler((wc, permission) => permission === 'local-fonts');

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());

/* ------------------------------- IPC ------------------------------- */

const on = (channel, fn) => ipcMain.handle(channel, (_e, ...args) => fn(...args));

on('window:minimize', () => win && win.minimize());
on('window:maximize', () => {
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});
on('window:close', () => win && win.close());
on('window:isMaximized', () => !!(win && win.isMaximized()));

on('app:mediaBase', () => server.getBaseUrl());
on('app:recoveredFrom', () => recoveredFrom);
on('app:dataDir', () => DATA_ROOT);
on('app:openDataDir', () => shell.openPath(DATA_ROOT));
on('app:openExternal', (url) => { if (/^https?:/.test(url)) shell.openExternal(url); });
on('app:version', () => app.getVersion());

on('lib:get', () => library.load());

const reportImport = (p) => win && win.webContents.send('lib:importProgress', p);

on('lib:pickAndImport', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Add music to UTune',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'oga', 'opus', 'webm'] }],
  });
  if (res.canceled) return [];
  return library.importMany(res.filePaths, reportImport);
});

on('lib:pickFolderAndImport', async () => {
  const res = await dialog.showOpenDialog(win, { title: 'Add a music folder', properties: ['openDirectory'] });
  if (res.canceled) return [];
  return library.importMany(library.collectAudio(res.filePaths[0]), reportImport);
});

on('lib:importPaths', async (paths) => {
  const files = paths.flatMap((p) => library.collectAudio(p));
  return library.importMany(files, reportImport);
});

on('lib:remove', (id, deleteFile) => library.removeTrack(id, deleteFile !== false));
on('lib:update', (id, patch) => library.updateTrack(id, patch));

on('lib:revealTrack', (id) => {
  const t = library.load().tracks.find((x) => x.id === id);
  if (t) shell.showItemInFolder(path.join(DIRS.media, t.file));
});

on('lib:pickCover', async (trackId) => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose cover art',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] }],
  });
  if (res.canceled) return null;
  return library.setTrackCover(trackId, res.filePaths[0]);
});

on('pl:create', (name) => library.createPlaylist(name));
on('pl:update', (id, patch) => library.updatePlaylist(id, patch));
on('pl:delete', (id) => library.deletePlaylist(id));
on('pl:add', (id, trackIds) => library.addToPlaylist(id, trackIds));

on('yt:download', (url, opts) =>
  youtube.download(url, opts || {}, (evt) => win && win.webContents.send('yt:progress', evt)));
on('yt:cancel', (jobId) => youtube.cancel(jobId));

on('yt:pickCookies', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a cookies.txt file',
    properties: ['openFile'],
    filters: [{ name: 'Cookies', extensions: ['txt'] }],
  });
  if (res.canceled) return null;
  return res.filePaths[0];
});

/* ------------------------------ profile ------------------------------ */

const DEFAULT_PROFILE = {
  name: '',
  avatar: null,
  bio: '',
  startupSound: DEFAULT_SOUND,
  playStartupSound: true,
  showIntro: true,
};

on('profile:get', () => ({ ...DEFAULT_PROFILE, ...readJson(FILES.profile, {}) }));

on('profile:save', (patch) => {
  const next = { ...DEFAULT_PROFILE, ...readJson(FILES.profile, {}), ...patch };
  writeJson(FILES.profile, next);
  return next;
});

on('profile:pickAvatar', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a profile picture',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] }],
  });
  if (res.canceled) return null;
  return storeAsset(res.filePaths[0], DIRS.avatars);
});

on('profile:pickSound', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a start-up sound',
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'ogg', 'opus', 'flac', 'aac'] }],
  });
  if (res.canceled) return null;
  return storeAsset(res.filePaths[0], DIRS.sounds);
});

on('profile:listSounds', () => safeList(DIRS.sounds));
on('profile:deleteSound', (name) => (name === DEFAULT_SOUND ? false : safeDelete(DIRS.sounds, name)));

on('app:createDesktopShortcut', (name) => !!shortcuts.createDesktop(name || 'UTune'));
on('app:pinInfo', () => ({ exe: shortcuts.realExePath(), portable: !!process.env.PORTABLE_EXECUTABLE_FILE }));

on('theme:get', () => readJson(FILES.theme, null));
on('theme:save', (theme) => { writeJson(FILES.theme, theme); return true; });

on('theme:export', async (payload, suggestedName) => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Export theme',
    defaultPath: ((suggestedName || 'utune-theme').replace(/[^\w\- ]/g, '') || 'utune-theme') + '.utunetheme.json',
    filters: [{ name: 'UTune theme', extensions: ['json'] }],
  });
  if (res.canceled) return false;
  fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf8');
  return true;
});

on('theme:import', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Import theme',
    properties: ['openFile'],
    filters: [{ name: 'UTune theme', extensions: ['json'] }],
  });
  if (res.canceled) return null;
  try {
    return JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
  } catch (err) {
    return null;
  }
});

// Background images / videos live in the data folder so themes stay portable.
on('asset:pickBackground', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a background',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images & video', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'mp4', 'webm', 'mov'] }],
  });
  if (res.canceled) return [];
  return res.filePaths.map((p) => storeAsset(p, DIRS.backgrounds)).filter(Boolean);
});

on('asset:listBackgrounds', () => safeList(DIRS.backgrounds));
on('asset:deleteBackground', (name) => safeDelete(DIRS.backgrounds, name));

on('font:pick', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Add a font file',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
  });
  if (res.canceled) return [];
  return res.filePaths.map((p) => storeAsset(p, DIRS.fonts)).filter(Boolean);
});

on('font:list', () => safeList(DIRS.fonts));
on('font:delete', (name) => safeDelete(DIRS.fonts, name));

function storeAsset(srcPath, destDir) {
  try {
    const ext = path.extname(srcPath).toLowerCase();
    const stem = path.basename(srcPath, ext).replace(/[^\w\-. ]+/g, '_').slice(0, 50) || 'asset';
    let name = stem + ext;
    let n = 1;
    while (fs.existsSync(path.join(destDir, name))) name = stem + '-' + n++ + ext;
    fs.copyFileSync(srcPath, path.join(destDir, name));
    return { name, ext: ext.replace('.', '') };
  } catch (err) {
    return null;
  }
}

function safeList(dir) {
  try {
    return fs.readdirSync(dir).map((name) => ({ name, ext: path.extname(name).slice(1).toLowerCase() }));
  } catch (err) {
    return [];
  }
}

function safeDelete(dir, name) {
  const full = path.normalize(path.join(dir, path.basename(name)));
  if (!full.startsWith(path.normalize(dir))) return false;
  try {
    fs.unlinkSync(full);
    return true;
  } catch (err) {
    return false;
  }
}
