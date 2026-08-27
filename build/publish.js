/**
 * Publishes the built exes to a GitHub Release tagged with the version in
 * package.json. Run with `npm run publish` (build first, or use `npm run ship`).
 *
 * Releases are used rather than committing the exes: at ~95 MB each they are
 * well past what belongs in git history, and GitHub rejects files over 100 MB.
 *
 * Re-running for the same version replaces the attached files rather than
 * deleting and re-uploading, so the download link is never briefly dead.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const pkg = require(path.join(ROOT, 'package.json'));

const TAG = 'v' + pkg.version;
const ASSETS = ['UTune-Setup.exe', 'UTune.exe'];

const gh = (args, opts = {}) =>
  execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();

function exists(tag) {
  try {
    gh(['release', 'view', tag], { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch (err) {
    return false;
  }
}

const NOTES = `UTune ${pkg.version}

**To install:** download \`UTune-Setup.exe\` below and run it. Windows will warn
that it does not recognise the app — choose **More info → Run anyway**. That
happens because the app is not code-signed, which needs a paid certificate.

It installs, adds Start Menu and desktop shortcuts, and launches. Your music,
themes and profile live in \`%APPDATA%\\UTune\` and are left alone by updates.

\`UTune.exe\` is the portable build: it runs from anywhere and keeps its library
in a folder beside it, but it cannot be pinned to the taskbar.
`;

/* --------------------------------- run --------------------------------- */

const missing = ASSETS.filter((name) => !fs.existsSync(path.join(DIST, name)));
if (missing.length) {
  console.error('Missing build output: ' + missing.join(', ') + '\nRun `npm run dist` first.');
  process.exit(1);
}

// Refuse to publish a version that has not been committed - the tag would point
// at the wrong tree and the release would not be reproducible.
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim();
if (dirty) {
  console.error('Working tree has uncommitted changes:\n' + dirty
    + '\n\nCommit and push before publishing so the tag matches the code.');
  process.exit(1);
}

const files = ASSETS.map((name) => path.join(DIST, name));

if (exists(TAG)) {
  console.log(`• Release ${TAG} exists — replacing its files`);
  gh(['release', 'upload', TAG, ...files, '--clobber'], { stdio: 'inherit' });
} else {
  console.log(`• Creating release ${TAG}`);
  gh(['release', 'create', TAG, ...files,
    '--title', `UTune ${pkg.version}`,
    '--notes', NOTES], { stdio: 'inherit' });
}

const url = gh(['release', 'view', TAG, '--json', 'url', '--jq', '.url']);
console.log(`\n✓ Published ${TAG}\n  ${url}\n`);
for (const name of ASSETS) {
  const mb = (fs.statSync(path.join(DIST, name)).size / 1048576).toFixed(1);
  console.log(`  ${name}  (${mb} MB)`);
}
console.log('');
