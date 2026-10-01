// Recomprime en el lugar las imagenes pesadas de public/guides y public/social.
// Motivo: vite-plugin-pwa falla el build si algun asset supera 2 MiB (limite de
// precache de workbox) y, ademas, estas imagenes tardaban mucho en cargar en
// el sitio. No cambia extensiones ni rutas (no hace falta tocar petGuides.ts).
import sharp from 'sharp';
import { readdir, stat, rename } from 'node:fs/promises';
import path from 'node:path';

const TARGET_DIRS = ['public/guides', 'public/social'];
const MAX_WIDTH = 1400;
const JPEG_QUALITY = 78;
const PNG_QUALITY = 80;

async function collectImageFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectImageFiles(full)));
    } else if (/\.(png|jpe?g)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function compressOne(file) {
  const before = (await stat(file)).size;
  const ext = path.extname(file).toLowerCase();
  const tmp = `${file}.tmp`;

  let pipeline = sharp(file).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true });
  pipeline =
    ext === '.png'
      ? pipeline.png({ quality: PNG_QUALITY, compressionLevel: 9, palette: true })
      : pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });

  await pipeline.toFile(tmp);
  await rename(tmp, file);

  const after = (await stat(file)).size;
  return { file, before, after };
}

const results = [];
for (const dir of TARGET_DIRS) {
  const files = await collectImageFiles(dir);
  for (const file of files) {
    results.push(await compressOne(file));
  }
}

let totalBefore = 0;
let totalAfter = 0;
for (const { file, before, after } of results) {
  totalBefore += before;
  totalAfter += after;
  console.log(
    `${file}: ${(before / 1024 / 1024).toFixed(2)} MB -> ${(after / 1024 / 1024).toFixed(2)} MB`,
  );
}
console.log(
  `\nTotal: ${(totalBefore / 1024 / 1024).toFixed(2)} MB -> ${(totalAfter / 1024 / 1024).toFixed(2)} MB (${results.length} archivos)`,
);
