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
 * Reading cookies straight out of a Chromium browser is unreliable on Windows.
 * Chrome 127+ encrypts them with an app-bound key that other processes cannot
 * unwrap (yt-dlp issue 10927), and while the browser is running the database is
 * locked so it cannot even be copied (issue 7271). Either way the cookie step
 * fails before the download starts.
 *
 * Most videos need no cookies at all, so a failure here is not fatal: the job
 * retries once without them and only reports an error if that also fails.
 */
const COOKIE_FAILURE = new RegExp([
  'could not copy .*cookie database',
  'failed to decrypt with dpapi',
  'could not find .*cookies database',
  'unsupported browser',
  'cookies database .*(locked|permission denied)',
  'failed to (read|extract|decrypt).*cookies',
].join('|'), 'i');

/** Turns yt-dlp's stderr into something worth showing a person. */
function friendlyError(stderr, code) {
  const text = String(stderr || '');

  // Messages arrive as "ERROR: [extractor] id: the actual problem".
  const strip = (line) => line
    .replace(/^ERROR:\s*/i, '')
    .replace(/^\[[^\]]+\]\s*[^:]*:\s*/, '')
    .trim();

  if (/sign in to confirm your age|age.?restricted|inappropriate for some users/i.test(text)) {
    return 'YouTube wants a sign-in for this one. Set "Age-restricted videos" to a cookies.txt file and try again.';
  }
  if (/sign in to confirm/i.test(text)) {
    return 'YouTube is asking this download to sign in. A cookies.txt file usually gets past it.';
  }
  if (/private video/i.test(text)) return 'That video is private.';
  if (/members-only|join this channel/i.test(text)) return 'That video is members-only.';
  if (/video (is )?unavailable|removed by the uploader|has been terminated/i.test(text)) {
    return 'That video is not available any more.';
  }
  if (/unsupported url|is not a valid url/i.test(text)) {
    return 'That link is not one yt-dlp recognises.';
  }

  // A genuine connectivity failure, as distinct from the server answering with
  // an error - "unable to download webpage" alone covers both, so it cannot be
  // treated as being offline.
  if (/getaddrinfo|enotfound|eai_again|name resolution|network is unreachable|connection (refused|reset|aborted)|timed out/i.test(text)) {
    return 'Could not reach the internet.';
  }

  const http = text.match(/HTTP Error (\d{3})/i);
  if (http) return `That page could not be loaded (HTTP ${http[1]}).`;

  if (/requested format is not available/i.test(text)) return 'No audio stream was offered for that video.';

  const lines = text.split(/\r?\n/).filter(Boolean);
  const errorLine = lines.filter((l) => /^ERROR:/i.test(l)).pop() || lines.pop();
  return errorLine ? strip(errorLine) : `yt-dlp exited with code ${code}`;
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

  const baseArgs = () => {
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
    if (opts.playlist && looksLikePlaylist(url)) {
      args.push('--yes-playlist', '--playlist-end', String(opts.playlistLimit || 50));
    } else {
      args.push('--no-playlist');
    }
    return args;
  };

  // A cookies.txt file is preferred when both are set - it is the one that works.
  const wantsCookies = !!(opts.cookiesFile || opts.cookiesFromBrowser);

  let currentTitle = '';
  let stderrTail = '';
  let retriedWithoutCookies = false;

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

  const run = (useCookies) => {
    const args = baseArgs();
    if (useCookies && opts.cookiesFile) args.push('--cookies', opts.cookiesFile);
    else if (useCookies && opts.cookiesFromBrowser) args.push('--cookies-from-browser', opts.cookiesFromBrowser);
    args.push(url);

    stderrTail = '';
    const child = spawn(bin, args, { windowsHide: true });
    jobs.set(jobId, child);

    let outBuf = '';
    child.stdout.on('data', (chunk) => {
      outBuf += chunk.toString();
      const lines = outBuf.split(/\r?\n/);
      outBuf = lines.pop();
      lines.forEach(handleLine);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-2000);
      text.split(/\r?\n/).forEach(handleLine);
    });

    child.on('error', (err) => {
      jobs.delete(jobId);
      emit({ jobId, url, phase: 'error', error: err.message });
    });

    child.on('close', (code) => onClose(code, useCookies));
  };

  const onClose = async (code, usedCookies) => {
    jobs.delete(jobId);

    if (code !== 0) {
      // Cookies could not be read. Most videos do not need them, so drop them
      // and try once more rather than failing outright.
      if (usedCookies && !retriedWithoutCookies && COOKIE_FAILURE.test(stderrTail)) {
        retriedWithoutCookies = true;
        emit({
          jobId, url, phase: 'downloading', percent: 0, title: currentTitle || url,
          notice: 'Could not read browser cookies - retrying without them.',
        });
        run(false);
        return;
      }

      cleanup(stageDir);
      let error = friendlyError(stderrTail, code);
      if (retriedWithoutCookies) {
        error += ' (browser cookies could not be read, so this ran without them.)';
      }
      emit({ jobId, url, phase: 'error', error });
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
  };

  emit({ jobId, url, phase: 'starting', percent: 0, title: url });
  run(wantsCookies);

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
