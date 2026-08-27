const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DIRS } = require('./paths');

/**
 * Tiny loopback file server for library media.
 *
 * <audio> requires real HTTP Range support to seek, and the visualiser requires
 * a CORS-clean response or WebAudio silences the audio graph. A custom protocol
 * provides neither. Listens on 127.0.0.1 with an ephemeral port; every URL
 * carries a token regenerated each run.
 */

const MIME = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
  '.weba': 'audio/webm', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.avif': 'image/avif', '.bmp': 'image/bmp',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// .webm can be either; audio-only webm still decodes fine when typed as video.
function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.webm') return 'video/webm';
  return MIME[ext] || 'application/octet-stream';
}

const SERVED = ['media', 'covers', 'backgrounds', 'fonts', 'avatars', 'sounds'];

let token = null;
let baseUrl = null;
let server = null;

function start() {
  if (baseUrl) return Promise.resolve(baseUrl);
  token = crypto.randomBytes(24).toString('hex');

  server = http.createServer((req, res) => {
    try { handle(req, res); } catch (err) {
      res.writeHead(500).end('error');
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}/${token}`;
      resolve(baseUrl);
    });
  });
}

function handle(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (parts[0] !== token) return res.writeHead(403).end('forbidden');

  const kind = parts[1];
  const name = parts.slice(2).join('/');
  if (!SERVED.includes(kind) || !name) return res.writeHead(404).end('not found');

  const dir = DIRS[kind];
  const full = path.normalize(path.join(dir, name));
  if (!full.startsWith(path.normalize(dir))) return res.writeHead(403).end('forbidden');

  let stat;
  try { stat = fs.statSync(full); } catch (err) { return res.writeHead(404).end('not found'); }
  if (!stat.isFile()) return res.writeHead(404).end('not found');

  const type = contentType(full);
  const headers = {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };

  if (req.method === 'HEAD') {
    return res.writeHead(200, { ...headers, 'Content-Length': stat.size }).end();
  }

  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      let start = match[1] === '' ? null : parseInt(match[1], 10);
      let end = match[2] === '' ? null : parseInt(match[2], 10);
      if (start === null) {
        // suffix range: last N bytes
        start = Math.max(0, stat.size - (end || 0));
        end = stat.size - 1;
      } else if (end === null || end >= stat.size) {
        end = stat.size - 1;
      }
      if (start > end || start >= stat.size) {
        return res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` }).end();
      }
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1,
      });
      return fs.createReadStream(full, { start, end }).pipe(res);
    }
  }

  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  fs.createReadStream(full).pipe(res);
}

module.exports = { start, getBaseUrl: () => baseUrl };
