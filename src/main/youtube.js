const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DIRS, ytDlpPath } = require('./paths');
const library = require('./library');

const PROGRESS_RE = /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\w+)(?:\s+at\s+([^\s]+))?(?:\s+ETA\s+([^\s]+))?/;
const DEST_RE = /\[download\] Destination:\s+(.+)/;

const jobs = new Map();

function looksLikePlaylist(url) {
  return /[?&]list=/.test(url);
}

function formatSelector(quality) {
  switch (quality) {
    // Highest bitrate stream regardless of container (usually opus ~160k webm).
    case 'best': return 'bestaudio/best';
    // Prefer AAC in an m4a container - widest compatibility outside the app.
    case 'm4a': return 'bestaudio[ext=m4a]/bestaudio/best';
    default: return 'bestaudio[ext=m4a]/bestaudio/best';
  }
}

/**
 * Download audio for a URL into staging, then import each resulting file
 * into the library along with its thumbnail and metadata.
 */
function download(url, opts = {}, emit = () => {}) {
  const jobId = crypto.randomUUID();
  const stageDir = path.join(DIRS.staging, jobId);
  fs.mkdirSync(stageDir, { recursive: true });

  const bin = ytDlpPath();
  if (!fs.existsSync(bin)) {
    emit({ jobId, url, phase: 'error', error: 'yt-dlp.exe is missing from the app resources.' });
    return jobId;
  }

  const args = [
    '-f', formatSelector(opts.quality),
    '--no-warnings',
    '--newline',
    '--progress',
    '--no-part',
    '--write-info-json',
    '--write-thumbnail',
    '--retries', '5',
    '--fragment-retries', '10',
    '--concurrent-fragments', '4',
    '-o', path.join(stageDir, '%(title).80B [%(id)s].%(ext)s'),
  ];

  if (opts.playlist && looksLikePlaylist(url)) args.push('--yes-playlist', '--playlist-end', String(opts.playlistLimit || 50));
  else args.push('--no-playlist');

  if (opts.cookiesFromBrowser) args.push('--cookies-from-browser', opts.cookiesFromBrowser);

  args.push(url);

  emit({ jobId, url, phase: 'starting', percent: 0, title: url });

  const child = spawn(bin, args, { windowsHide: true });
  jobs.set(jobId, child);

  let currentTitle = '';
  let stderrTail = '';

  const handleLine = (line) => {
    const dest = line.match(DEST_RE);
    if (dest) {
      currentTitle = path.basename(dest[1]).replace(/\.[^.]+$/, '');
      emit({ jobId, url, phase: 'downloading', percent: 0, title: currentTitle });
      return;
    }
    const prog = line.match(PROGRESS_RE);
    if (prog) {
      emit({
        jobId, url, phase: 'downloading',
        percent: parseFloat(prog[1]),
        size: prog[2], speed: prog[3] || '', eta: prog[4] || '',
        title: currentTitle || url,
      });
      return;
    }
    if (/^\[(ExtractAudio|Merger|Metadata)\]/.test(line)) {
      emit({ jobId, url, phase: 'processing', percent: 99, title: currentTitle || url });
    }
  };

  let outBuf = '';
  child.stdout.on('data', (chunk) => {
    outBuf += chunk.toString();
    const lines = outBuf.split(/\r?\n/);
    outBuf = lines.pop();
    lines.forEach(handleLine);
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrTail = (stderrTail + text).slice(-1500);
    text.split(/\r?\n/).forEach(handleLine);
  });

  child.on('error', (err) => {
    jobs.delete(jobId);
    emit({ jobId, url, phase: 'error', error: err.message });
  });

  child.on('close', async (code) => {
    jobs.delete(jobId);
    if (code !== 0) {
      cleanup(stageDir);
      const reason = stderrTail.split(/\r?\n/).filter(Boolean).pop() || `yt-dlp exited with code ${code}`;
      emit({ jobId, url, phase: 'error', error: reason });
      return;
    }
    emit({ jobId, url, phase: 'importing', percent: 100, title: currentTitle || url });
    try {
      const tracks = await importStaged(stageDir);
      emit({ jobId, url, phase: 'done', percent: 100, tracks, title: tracks[0]?.title || currentTitle });
    } catch (err) {
      emit({ jobId, url, phase: 'error', error: err.message });
    } finally {
      cleanup(stageDir);
    }
  });

  return jobId;
}

function cancel(jobId) {
  const child = jobs.get(jobId);
  if (!child) return false;
  try { child.kill(); } catch {}
  jobs.delete(jobId);
  return true;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function baseKey(file) {
  return file.replace(/\.info\.json$/i, '').replace(/\.[^.]+$/, '');
}

async function importStaged(stageDir) {
  const files = fs.readdirSync(stageDir);
  const groups = new Map();
  for (const f of files) {
    const key = baseKey(f);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  const imported = [];
  for (const [, members] of groups) {
    const audio = members.find((f) => library.AUDIO_EXT.has(path.extname(f).toLowerCase()));
    if (!audio) continue;

    const infoFile = members.find((f) => /\.info\.json$/i.test(f));
    const thumbFile = members.find((f) => library.IMAGE_EXT.has(path.extname(f).toLowerCase()));

    let info = {};
    if (infoFile) {
      try { info = JSON.parse(fs.readFileSync(path.join(stageDir, infoFile), 'utf8')); } catch {}
    }

    let cover = null;
    if (thumbFile) cover = library.copyCoverFile(path.join(stageDir, thumbFile));

    const track = await library.importFile(path.join(stageDir, audio), {
      title: info.track || info.title || undefined,
      artist: info.artist || info.uploader || info.channel || undefined,
      album: info.album || info.playlist_title || 'YouTube',
      year: info.release_year || (info.upload_date ? Number(String(info.upload_date).slice(0, 4)) : null),
      duration: info.duration || 0,
      cover,
      source: 'youtube',
      sourceUrl: info.webpage_url || null,
    });
    if (track) imported.push(track);
  }
  return imported;
}

module.exports = { download, cancel, looksLikePlaylist };
