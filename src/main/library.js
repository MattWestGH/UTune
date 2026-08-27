const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DIRS, FILES } = require('./paths');
const { readJson, writeJson } = require('./store');

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.oga', '.opus', '.webm', '.weba', '.mp4']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp']);

const PIC_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

let cache = null;

function load() {
  if (!cache) {
    cache = readJson(FILES.library, null) || { tracks: [], playlists: [] };
    if (!Array.isArray(cache.tracks)) cache.tracks = [];
    if (!Array.isArray(cache.playlists)) cache.playlists = [];
  }
  return cache;
}

function save() {
  writeJson(FILES.library, load());
  return cache;
}

const id = () => crypto.randomUUID();

function uniqueName(dir, base, ext) {
  const safe = base.replace(/[^\w\-. ]+/g, '_').slice(0, 60).trim() || 'track';
  let name = `${safe}${ext}`;
  let n = 1;
  while (fs.existsSync(path.join(dir, name))) name = `${safe} (${n++})${ext}`;
  return name;
}

async function readTags(filePath) {
  try {
    const mm = require('music-metadata');
    const meta = await mm.parseFile(filePath, { duration: true });
    return meta;
  } catch {
    return null;
  }
}

function saveCoverBuffer(buf, mime) {
  const ext = PIC_EXT[mime] || '.jpg';
  const name = id() + ext;
  fs.writeFileSync(path.join(DIRS.covers, name), buf);
  return name;
}

function copyCoverFile(srcPath) {
  const ext = path.extname(srcPath).toLowerCase();
  if (!IMAGE_EXT.has(ext)) return null;
  const name = id() + ext;
  fs.copyFileSync(srcPath, path.join(DIRS.covers, name));
  return name;
}

// Import one audio file into the library folder (copy, so the original can move/vanish).
async function importFile(srcPath, extra = {}) {
  const ext = path.extname(srcPath).toLowerCase();
  if (!AUDIO_EXT.has(ext)) return null;

  const stem = path.basename(srcPath, ext);
  const fileName = uniqueName(DIRS.media, stem, ext);
  const destPath = path.join(DIRS.media, fileName);
  fs.copyFileSync(srcPath, destPath);

  const meta = await readTags(destPath);
  const common = meta?.common || {};
  let cover = extra.cover || null;
  if (!cover && common.picture && common.picture[0]) {
    cover = saveCoverBuffer(common.picture[0].data, common.picture[0].format);
  }

  const track = {
    id: id(),
    file: fileName,
    title: extra.title || common.title || stem,
    artist: extra.artist || common.artist || common.albumartist || 'Unknown Artist',
    album: extra.album || common.album || 'Unknown Album',
    year: extra.year || common.year || null,
    genre: extra.genre || (common.genre && common.genre[0]) || null,
    duration: extra.duration || meta?.format?.duration || 0,
    cover,
    source: extra.source || 'local',
    sourceUrl: extra.sourceUrl || null,
    addedAt: Date.now(),
    playCount: 0,
    favorite: false,
  };

  load().tracks.push(track);
  save();
  return track;
}

async function importMany(paths, onProgress) {
  const added = [];
  for (let i = 0; i < paths.length; i++) {
    try {
      const t = await importFile(paths[i]);
      if (t) added.push(t);
    } catch (err) {
      console.error('import failed', paths[i], err);
    }
    onProgress?.({ done: i + 1, total: paths.length, name: path.basename(paths[i]) });
  }
  return added;
}

// Walk a dropped folder for audio files.
function collectAudio(entryPath, out = [], depth = 0) {
  if (depth > 6) return out;
  let stat;
  try { stat = fs.statSync(entryPath); } catch { return out; }
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(entryPath)) collectAudio(path.join(entryPath, name), out, depth + 1);
  } else if (AUDIO_EXT.has(path.extname(entryPath).toLowerCase())) {
    out.push(entryPath);
  }
  return out;
}

function removeTrack(trackId, deleteFile = true) {
  const lib = load();
  const idx = lib.tracks.findIndex((t) => t.id === trackId);
  if (idx === -1) return false;
  const [track] = lib.tracks.splice(idx, 1);
  for (const pl of lib.playlists) pl.trackIds = (pl.trackIds || []).filter((x) => x !== trackId);
  if (deleteFile) {
    try { fs.unlinkSync(path.join(DIRS.media, track.file)); } catch {}
    // Only drop the cover if nothing else points at it.
    if (track.cover && !lib.tracks.some((t) => t.cover === track.cover)) {
      try { fs.unlinkSync(path.join(DIRS.covers, track.cover)); } catch {}
    }
  }
  save();
  return true;
}

function updateTrack(trackId, patch) {
  const lib = load();
  const track = lib.tracks.find((t) => t.id === trackId);
  if (!track) return null;
  const allowed = ['title', 'artist', 'album', 'year', 'genre', 'favorite', 'playCount'];
  for (const key of allowed) if (key in patch) track[key] = patch[key];
  save();
  return track;
}

function setTrackCover(trackId, srcPath) {
  const lib = load();
  const track = lib.tracks.find((t) => t.id === trackId);
  if (!track) return null;
  const name = copyCoverFile(srcPath);
  if (!name) return null;
  track.cover = name;
  save();
  return track;
}

// --- playlists ---
function createPlaylist(name) {
  const pl = { id: id(), name: name || 'New Playlist', trackIds: [], createdAt: Date.now(), cover: null };
  load().playlists.push(pl);
  save();
  return pl;
}

function updatePlaylist(playlistId, patch) {
  const pl = load().playlists.find((p) => p.id === playlistId);
  if (!pl) return null;
  if ('name' in patch) pl.name = patch.name;
  if ('trackIds' in patch) pl.trackIds = patch.trackIds.filter((t) => load().tracks.some((x) => x.id === t));
  save();
  return pl;
}

function deletePlaylist(playlistId) {
  const lib = load();
  const idx = lib.playlists.findIndex((p) => p.id === playlistId);
  if (idx === -1) return false;
  lib.playlists.splice(idx, 1);
  save();
  return true;
}

function addToPlaylist(playlistId, trackIds) {
  const pl = load().playlists.find((p) => p.id === playlistId);
  if (!pl) return null;
  for (const t of trackIds) if (!pl.trackIds.includes(t)) pl.trackIds.push(t);
  save();
  return pl;
}

module.exports = {
  AUDIO_EXT, IMAGE_EXT,
  load, save, importFile, importMany, collectAudio, removeTrack, updateTrack, setTrackCover,
  saveCoverBuffer, copyCoverFile,
  createPlaylist, updatePlaylist, deletePlaylist, addToPlaylist,
};
