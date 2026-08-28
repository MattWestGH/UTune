/**
 * Rebuilds every Cove ambience file as a short, seamless Opus loop.
 *
 *   node build/make-all-loops.js
 *
 * Lengths are chosen per sound rather than uniformly. Diffuse textures (fire,
 * rain, stream, wind) loop undetectably in well under a minute. Sounds with
 * recognisable events - thunder rolls, individual bird calls - need to stay long
 * enough that the repeat is not obvious, so they are barely trimmed and are
 * converted mainly for the size saving.
 *
 * Sources stay in resources/ambience-src/ so this can be re-run.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'resources', 'ambience-src');
const OUT = path.join(ROOT, 'resources', 'ambience');
const electron = require('electron');

const PLAN = [
  { id: 'fire',     seconds: 45 },
  { id: 'stream',   seconds: 45 },
  { id: 'rain',     seconds: 60 },
  { id: 'wind',     seconds: 60 },
  { id: 'thunder',  seconds: 90 },
  { id: 'birds',    seconds: 90 },
  { id: 'downpour', seconds: 28 },
  { id: 'waves',    seconds: 30 },
  { id: 'leaves',   seconds: 33 },
  { id: 'crickets', seconds: 30 },
];

const only = process.argv.slice(2);
const todo = only.length ? PLAN.filter((p) => only.includes(p.id)) : PLAN;

fs.mkdirSync(OUT, { recursive: true });

for (const item of todo) {
  const src = path.join(SRC, item.id + '.mp3');
  if (!fs.existsSync(src)) {
    console.log('[all] skipping ' + item.id + ' - no source');
    continue;
  }
  const out = path.join(OUT, item.id + '.webm');
  execFileSync(electron, [
    path.join(__dirname, 'make-loop.js'), src, out, String(item.seconds),
  ], { stdio: 'inherit' });
}
