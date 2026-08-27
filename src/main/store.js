const fs = require('fs');
const path = require('path');

// A UTF-8 BOM is invisible but makes JSON.parse throw, and both Notepad and
// PowerShell write one. Stripping it keeps a hand-edited file readable instead
// of having it silently fall back to the default.
const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

// Tiny JSON store with atomic writes, so a crash mid-save can't shred the library.
function readJson(file, fallback) {
  try {
    return JSON.parse(stripBom(fs.readFileSync(file, 'utf8')));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

module.exports = { readJson, writeJson, stripBom };
