import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'public', 'icon.svg');
const svg = readFileSync(svgPath);

const sizes = [
  { name: 'pwa-180.png', size: 180 },
  { name: 'pwa-192.png', size: 192 },
  { name: 'pwa-512.png', size: 512 },
];

for (const { name, size } of sizes) {
  await sharp(svg).resize(size, size).png().toFile(path.join(root, 'public', name));
  console.log(`Generated public/${name}`);
}
