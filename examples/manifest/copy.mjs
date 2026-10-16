// Файлы питомца для сайта без сборщика — по перечню пакета (manifest.json): только файлы выбранных входов, с той же
// структурой папок. Положите скрипт в проект рядом с node_modules/ и запускайте после установки или обновления пакета:
//   node copy-pet.mjs public/vendor/pet-companion ./web
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [target = 'public/vendor/pet-companion', ...entries] = process.argv.slice(2);
const manifestFile = fileURLToPath(import.meta.resolve('pet-companion/manifest.json'));
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
const files = new Set();
for (const entry of entries.length ? entries : ['./web']) {
  if (!manifest.entries[entry]) throw new Error(`pet-companion: нет входа ${entry}`);
  for (const file of manifest.entries[entry].files) files.add(file);
}
for (const file of files) {
  await mkdir(path.dirname(path.join(target, file)), { recursive: true });
  await copyFile(path.join(path.dirname(manifestFile), file), path.join(target, file));
}
console.log(`pet-companion ${manifest.version}: ${files.size} файлов → ${target}`);
