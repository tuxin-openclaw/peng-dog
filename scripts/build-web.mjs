import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const file of ['index.html', 'app.js']) {
  fs.copyFileSync(path.join(rootDir, file), path.join(distDir, file));
}

console.log('Prepared dist/ from shared root index.html + app.js');
