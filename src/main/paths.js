const path = require('path');
const fs = require('fs');
const { app } = require('electron');

/**
 * Where the library lives.
 *
 * Portable build - beside the .exe, so the app and its music travel together.
 * Installed build - in %APPDATA%\UTune. Not next to the exe: the install
 *   directory is replaced on update and removed on uninstall, which would
 *   take the library with it.
 * Dev - inside the repo.
 */
function resolveDataRoot() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) return path.join(portableDir, 'UTune-Data');
  if (!app.isPackaged) return path.join(app.getAppPath(), '.utune-data');
  return path.join(app.getPath('userData'), 'UTune-Data');
}

const DATA_ROOT = resolveDataRoot();

const DIRS = {
  root: DATA_ROOT,
  media: path.join(DATA_ROOT, 'media'),
  covers: path.join(DATA_ROOT, 'covers'),
  backgrounds: path.join(DATA_ROOT, 'backgrounds'),
  fonts: path.join(DATA_ROOT, 'fonts'),
  avatars: path.join(DATA_ROOT, 'avatars'),
  ambience: path.join(DATA_ROOT, 'ambience'),
  playlists: path.join(DATA_ROOT, 'playlists'),
  sounds: path.join(DATA_ROOT, 'sounds'),
  staging: path.join(DATA_ROOT, '.staging'),
};

const FILES = {
  library: path.join(DATA_ROOT, 'library.json'),
  theme: path.join(DATA_ROOT, 'theme.json'),
  settings: path.join(DATA_ROOT, 'settings.json'),
  profile: path.join(DATA_ROOT, 'profile.json'),
};

function ensureDirs() {
  for (const dir of Object.values(DIRS)) fs.mkdirSync(dir, { recursive: true });
}

/* ------------------------- library recovery ------------------------- */

/**
 * A portable library moves whenever the exe does. The last known data folder is
 * recorded in %APPDATA%; if the app starts somewhere new with no library of its
 * own while the recorded one still exists, the contents are brought across.
 *
 * This covers replacing the exe with a new build, moving it to another folder,
 * and switching between the portable and installed builds.
 */
const POINTER_FILE = path.join(app.getPath('appData'), 'UTune', 'location.json');

// A folder counts as populated if it holds tracks, a theme or a profile.
// Checking library.json alone would strand a saved theme.
const CONTENT_FILES = ['library.json', 'theme.json', 'profile.json'];

const hasData = (root) => {
  try {
    return CONTENT_FILES.some((f) => fs.existsSync(path.join(root, f)));
  } catch (err) {
    return false;
  }
};

function rememberLocation() {
  try {
    fs.mkdirSync(path.dirname(POINTER_FILE), { recursive: true });
    fs.writeFileSync(POINTER_FILE, JSON.stringify({ dataRoot: DATA_ROOT, seenAt: Date.now() }, null, 2));
  } catch (err) { /* a missing pointer only disables the recovery hint */ }
}

/** Returns the path it recovered from, or null if there was nothing to do. */
function recoverPreviousData() {
  let previous = null;
  try {
    const raw = fs.readFileSync(POINTER_FILE, 'utf8');
    // Tolerate a BOM - see store.js.
    previous = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).dataRoot;
  } catch (err) {
    return null;
  }

  if (!previous) return null;
  if (path.normalize(previous) === path.normalize(DATA_ROOT)) return null;
  if (hasData(DATA_ROOT)) return null;      // this copy already has its own
  if (!hasData(previous)) return null;      // nothing worth bringing over

  try {
    // Copy rather than move, so the original survives a failure part-way through.
    fs.cpSync(previous, DATA_ROOT, {
      recursive: true,
      filter: (src) => !path.basename(src).startsWith('.staging'),
    });
    return previous;
  } catch (err) {
    console.error('could not recover previous library', err);
    return null;
  }
}

// Bundled files live in extraResources when packaged, in the repo when developing.
function bundled(...parts) {
  const packed = path.join(process.resourcesPath || '', ...parts);
  if (fs.existsSync(packed)) return packed;
  return path.join(app.getAppPath(), 'resources', ...parts);
}

const ytDlpPath = () => bundled('bin', 'yt-dlp.exe');

/**
 * The default start-up chime is copied into the data folder on first run rather
 * than played from inside the app bundle, so the sounds folder is the only
 * location start-up audio is ever read from, and the file can be replaced there.
 */
const DEFAULT_SOUND = 'startup.mp3';

function ensureDefaultSound() {
  const dest = path.join(DIRS.sounds, DEFAULT_SOUND);
  if (fs.existsSync(dest)) return DEFAULT_SOUND;
  try {
    fs.copyFileSync(bundled('sounds', DEFAULT_SOUND), dest);
  } catch (err) {
    return null;
  }
  return DEFAULT_SOUND;
}

module.exports = {
  DIRS, FILES, ensureDirs, ytDlpPath, bundled, ensureDefaultSound, DEFAULT_SOUND, DATA_ROOT,
  recoverPreviousData, rememberLocation,
};
