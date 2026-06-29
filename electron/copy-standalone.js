// Copy the assets Next does NOT place into the standalone output. The standalone
// server (.next/standalone/server.js) serves ./.next/static and ./public
// relative to its own directory, so they must be copied in after `next build`.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-standalone] missing source, skipping: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(standalone)) {
  console.error('[copy-standalone] .next/standalone not found — run `next build` first.');
  process.exit(1);
}

copyDir(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'));
copyDir(path.join(root, 'public'), path.join(standalone, 'public'));

console.log('[copy-standalone] copied .next/static and public into .next/standalone');
