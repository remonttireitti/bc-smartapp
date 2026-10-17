import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconSvg = readFileSync(path.join(root, 'public', 'icon.svg'));
const maskableSvg = readFileSync(path.join(root, 'public', 'brand', 'icon-maskable.svg'));
const markSvg = readFileSync(path.join(root, 'public', 'brand', 'logo-icon.svg'));
const ogSvg = readFileSync(path.join(root, 'public', 'brand', 'og.svg'));

const jobs = [
  { svg: iconSvg, name: 'pwa-180.png', size: 180 },
  { svg: iconSvg, name: 'pwa-192.png', size: 192 },
  { svg: iconSvg, name: 'pwa-512.png', size: 512 },
  { svg: maskableSvg, name: 'pwa-512-maskable.png', size: 512 },
  { svg: markSvg, name: 'favicon-32.png', size: 32 },
  { svg: markSvg, name: 'favicon-16.png', size: 16 },
];

for (const { svg, name, size } of jobs) {
  await sharp(svg).resize(size, size).png().toFile(path.join(root, 'public', name));
  console.log(`Generated public/${name}`);
}

await sharp(ogSvg).resize(1200, 630).png().toFile(path.join(root, 'public', 'og.png'));
console.log('Generated public/og.png');
