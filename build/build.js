/**
 * Builds dist/UTune-Setup.exe (installer) and dist/UTune.exe (portable).
 *
 * electron-builder is not invoked directly because it resolves its signtool
 * vendor bundle before determining that there is nothing to sign, and extracting
 * that bundle requires the Windows privilege to create symlinks (it contains
 * macOS .dylib links). Without that privilege the extraction fails and takes the
 * build with it.
 *
 * Instead, win.signAndEditExecutable is false and the icon and version resources
 * are applied here using the rcedit that ships inside app-builder.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const UNPACKED = path.join(DIST, 'win-unpacked');
const pkg = require(path.join(ROOT, 'package.json'));

const APP_BUILDER = path.join(ROOT, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe');
const BUILDER_CLI = path.join(ROOT, 'node_modules', 'electron-builder', 'cli.js');

const step = (msg) => console.log('\n• ' + msg);

function builder(args) {
  execFileSync(process.execPath, [BUILDER_CLI, ...args], { cwd: ROOT, stdio: 'inherit' });
}

/* 1 ------------------------------------------------- fresh icon */
step('Generating icon');
execFileSync(require('electron'), [path.join(__dirname, 'make-icon.js')], { stdio: 'inherit' });

/* 2 ------------------------------------------- package app tree */
step('Packaging application');

/**
 * Clear ONLY the files this script produces. Never clear the whole dist folder:
 * running the built exe from dist/ creates a UTune-Data library alongside it,
 * and removing that would destroy the user's music, themes and profile.
 */
const BUILD_OUTPUTS = [
  'win-unpacked', 'UTune.exe', 'UTune-Setup.exe',
  'builder-debug.yml', 'builder-effective-config.yaml', 'latest.yml',
];
for (const name of BUILD_OUTPUTS) {
  fs.rmSync(path.join(DIST, name), { recursive: true, force: true });
}

if (fs.existsSync(path.join(DIST, 'UTune-Data'))) {
  console.log('  ! dist\\UTune-Data found - left untouched. Move the exe out of dist\\ so');
  console.log('    your library never sits in a build folder.');
}

builder(['--win', 'dir']);

const exePath = path.join(UNPACKED, `${pkg.build.productName}.exe`);
if (!fs.existsSync(exePath)) {
  throw new Error('packaging did not produce ' + exePath);
}

/* 3 ------------------------------- stamp icon + version resources */
step('Applying icon and version info');
const version = pkg.version;
const rceditArgs = [
  exePath,
  '--set-version-string', 'FileDescription', pkg.description,
  '--set-version-string', 'ProductName', pkg.build.productName,
  '--set-version-string', 'CompanyName', pkg.author,
  '--set-version-string', 'LegalCopyright', `Copyright © ${new Date().getFullYear()} ${pkg.author}`,
  '--set-version-string', 'InternalName', pkg.build.productName,
  '--set-version-string', 'OriginalFilename', '',
  '--set-file-version', version,
  '--set-product-version', version,
  '--set-icon', path.join(ROOT, 'build', 'icon.ico'),
];
execFileSync(APP_BUILDER, ['rcedit', '--args', JSON.stringify(rceditArgs)], { stdio: 'inherit' });

/* 4 -------------------------------------- installer + portable exe */
step('Building the installer');
builder(['--win', 'nsis', '--prepackaged', UNPACKED]);

step('Building the portable exe');
builder(['--win', 'portable', '--prepackaged', UNPACKED]);

const artifacts = [
  ['UTune-Setup.exe', 'installer - pinnable to the taskbar, survives updates'],
  ['UTune.exe', 'portable - runs from anywhere, keeps its library beside it'],
];

console.log('');
for (const [name, note] of artifacts) {
  const file = path.join(DIST, name);
  if (!fs.existsSync(file)) throw new Error(name + ' was not produced');
  const mb = (fs.statSync(file).size / 1024 / 1024).toFixed(1);
  console.log(`✓ ${path.join('dist', name)}  (${mb} MB)  — ${note}`);
}
console.log('');
