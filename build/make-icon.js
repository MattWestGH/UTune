/**
 * Builds build/icon.ico (and icon.png) from build/source-icon.png.
 *
 * Runs under Electron rather than plain node so it can use nativeImage for the
 * downscaling, which avoids hand-rolling a PNG decoder and resampler.
 * Invoke with `npm run icon`.
 */
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [256, 128, 64, 48, 32, 16];
const SOURCE = path.join(__dirname, 'source-icon.png');

// Corners are rounded to sit correctly among the rounded tiles Windows uses
// on the taskbar and in the Start menu.
const CORNER = 0.16;

/* ------------------------------ png encode ------------------------------ */

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(rgba, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------- ico -------------------------------- */

function toIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;

  entries.forEach((entry, i) => {
    const at = i * 16;
    // 256 is stored as 0 in the directory - the field is a single byte.
    dir[at] = entry.size >= 256 ? 0 : entry.size;
    dir[at + 1] = entry.size >= 256 ? 0 : entry.size;
    dir.writeUInt16LE(1, at + 4);   // colour planes
    dir.writeUInt16LE(32, at + 6);  // bits per pixel
    dir.writeUInt32LE(entry.png.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

/* ------------------------------ rounding ------------------------------ */

// Fractional coverage of a pixel by the rounded square, for a soft edge.
function coverage(x, y, size, radius) {
  const inset = 0.5;
  const min = inset;
  const max = size - 1 - inset;
  const cx = Math.min(Math.max(x, min + radius), max - radius);
  const cy = Math.min(Math.max(y, min + radius), max - radius);
  const dist = Math.hypot(x - cx, y - cy);
  if (dist <= radius - 0.5) return 1;
  if (dist >= radius + 0.5) return 0;
  return radius + 0.5 - dist;
}

function render(size) {
  const image = nativeImage.createFromPath(SOURCE)
    .resize({ width: size, height: size, quality: 'best' });

  // nativeImage hands back BGRA; PNG wants RGBA.
  const bgra = image.toBitmap();
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * CORNER;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cov = coverage(x, y, size, radius);
      rgba[i] = bgra[i + 2];
      rgba[i + 1] = bgra[i + 1];
      rgba[i + 2] = bgra[i];
      rgba[i + 3] = Math.round(bgra[i + 3] * cov);
    }
  }
  return rgba;
}

/* -------------------------------- run -------------------------------- */

app.whenReady().then(() => {
  if (!fs.existsSync(SOURCE)) throw new Error('missing ' + SOURCE);

  const entries = SIZES.map((size) => ({ size, png: toPng(render(size), size) }));

  const icoPath = path.join(__dirname, 'icon.ico');
  fs.writeFileSync(icoPath, toIco(entries));
  fs.writeFileSync(path.join(__dirname, 'icon.png'), entries[0].png);

  console.log('wrote', icoPath, fs.statSync(icoPath).size, 'bytes',
    '(' + SIZES.join(', ') + 'px)');
  app.quit();
}).catch((err) => {
  console.error(err);
  app.exit(1);
});
