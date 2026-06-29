// Rasterize build/icon.svg into the PNGs we need:
//   electron/assets/icon.png (1024) — electron-builder derives .ico/.icns from this
//   public/icon-512.png (512)  — PWA manifest
//   public/icon-192.png (192)  — PWA manifest
//   public/apple-icon.png (180) — iOS home screen
const sharp = require('sharp');
const pngToIcoMod = require('png-to-ico');
const pngToIco = pngToIcoMod.default || pngToIcoMod;
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'electron', 'assets', 'icon.svg'));

const targets = [
  ['electron/assets/icon.png', 1024],
  ['public/icon-512.png', 512],
  ['public/icon-192.png', 192],
  ['public/apple-icon.png', 180],
];

(async () => {
  for (const [out, size] of targets) {
    await sharp(svg, { density: 384 }).resize(size, size).png().toFile(path.join(root, out));
    console.log(`[gen-icons] ${out} (${size}px)`);
  }

  // Windows multi-resolution .ico for the app/window/taskbar icon.
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(
    icoSizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer())
  );
  fs.writeFileSync(path.join(root, 'electron', 'assets', 'icon.ico'), await pngToIco(buffers));
  console.log('[gen-icons] electron/assets/icon.ico');
})();
