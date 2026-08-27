const path = require('path');
const fs = require('fs');
const { app, shell } = require('electron');

/**
 * Start Menu and desktop shortcuts, and the AppUserModelID that ties the running
 * window to them. Windows groups a window under a shortcut carrying the same ID,
 * so the shortcut must be written before the first window is created and must
 * point at the real exe rather than any unpacked copy of it.
 */
const APP_ID = 'com.matt.utune';

// The real exe when portable; the normal exe path otherwise.
function realExePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe');
}

function startMenuDir() {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
}

function shortcutOptions(name) {
  const target = realExePath();
  return {
    target,
    cwd: path.dirname(target),
    icon: target,
    iconIndex: 0,
    appUserModelId: APP_ID,
    description: name,
  };
}

function write(dir, name) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const linkPath = path.join(dir, `${name}.lnk`);
    const op = fs.existsSync(linkPath) ? 'update' : 'create';
    const ok = shell.writeShortcutLink(linkPath, op, shortcutOptions(name));
    return ok ? linkPath : null;
  } catch (err) {
    console.error('shortcut failed', err);
    return null;
  }
}

/**
 * Portable builds only, so that the app appears in the Start Menu at all.
 * Rewritten each launch so the shortcut follows the exe if it is moved.
 *
 * This does not make a portable build pinnable to the taskbar: the portable exe
 * unpacks to %TEMP% and the real process runs from there, and Windows will not
 * pin an executable in a volatile path regardless of the AppUserModelID it
 * declares. Only the installed build can be pinned.
 *
 * The installer creates its own shortcuts, which are left untouched.
 */
function ensureStartMenu(name = 'UTune') {
  if (process.platform !== 'win32' || !app.isPackaged) return null;
  if (!process.env.PORTABLE_EXECUTABLE_FILE) return null;
  return write(startMenuDir(), name);
}

function createDesktop(name = 'UTune') {
  if (process.platform !== 'win32') return null;
  return write(app.getPath('desktop'), name);
}

module.exports = { APP_ID, ensureStartMenu, createDesktop, realExePath };
