const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// A UTF-8 BOM is invisible but makes JSON.parse throw, and both Notepad and
// PowerShell write one. Stripping it keeps a hand-edited file readable instead
// of having it silently fall back to the default.
const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/**
 * Reads a JSON file and says which of three things happened.
 *
 * The distinction matters enormously for the library: "there is no file yet" is
 * an empty library, but "there is a file and it would not parse" is a problem,
 * and treating the second like the first is how a library gets erased. Callers
 * that hold real user data must check `status` rather than just taking a value.
 */
function readJsonChecked(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { status: 'missing', value: null };
    return { status: 'unreadable', value: null, error: err };
  }
  try {
    return { status: 'ok', value: JSON.parse(stripBom(raw)) };
  } catch (err) {
    return { status: 'unreadable', value: null, error: err };
  }
}

/** Convenience for settings-shaped files, where a default is genuinely fine. */
function readJson(file, fallback) {
  const { status, value } = readJsonChecked(file);
  return status === 'ok' ? value : fallback;
}

const backupPath = (file) => file + '.bak';

/**
 * Atomic write, keeping the previous contents as a .bak.
 *
 * The temp file carries a random suffix so two writes can never land on the same
 * scratch path. The rename itself is atomic on NTFS, so a crash leaves either
 * the old file or the new one, never a half-written one - and the .bak gives
 * something to fall back to if the file is damaged by anything outside this
 * process.
 */
function writeJson(file, value, { backup = true } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;

  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8');
      // Get it on to the disk before the rename, so a power cut cannot leave a
      // renamed but empty file.
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    if (backup && fs.existsSync(file)) {
      try {
        fs.copyFileSync(file, backupPath(file));
      } catch (err) { /* a missing backup must not stop the write */ }
    }

    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (e) { /* nothing to clean up */ }
    throw err;
  }
}

module.exports = { readJson, readJsonChecked, writeJson, stripBom, backupPath };
