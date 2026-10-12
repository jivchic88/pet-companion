#!/usr/bin/env node
// Номер версии — из package.json (его меняет npm version; этот скрипт — его шаг "version", до коммита и тега). Здесь —
// та же версия в VERSION (pet/pet.mjs) и в строке «Версия **x.y.z**» README; раздел «## Не выпущено» CHANGELOG получает
// номер и дату. Без записи в CHANGELOG выпуск останавливается. Повторный запуск ничего не меняет.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (file) => path.join(root, file);
const fail = (message) => {
  console.error(`sync-version — ${message}`);
  process.exit(1);
};

const { version } = JSON.parse(await readFile(at('package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`версия package.json «${version}» — нужен вид x.y.z`);

// Местная дата выпуска — как у записей CHANGELOG.
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

async function replace(file, pattern, next, what) {
  const text = await readFile(at(file), 'utf8');
  if (!pattern.test(text)) fail(`${file}: не найдено ${what}`);
  const changed = text.replace(pattern, next);
  if (changed !== text) await writeFile(at(file), changed);
}

const changelog = await readFile(at('CHANGELOG.md'), 'utf8');
if (/^## Не выпущено\s*$/m.test(changelog)) {
  await writeFile(at('CHANGELOG.md'), changelog.replace(/^## Не выпущено\s*$/m, `## ${version} — ${today}`));
} else if (/^## (\d+\.\d+\.\d+)/m.exec(changelog)?.[1] !== version) {
  fail(`в CHANGELOG.md нет раздела «## Не выпущено» и последняя запись — не ${version}: опишите изменения до выпуска`);
}
await replace('pet/pet.mjs', /^export const VERSION = '[^']*';$/m, `export const VERSION = '${version}';`, 'export const VERSION');
await replace('README.md', /Версия \*\*[^*]+\*\*/, `Версия **${version}**`, '«Версия **…**»');
console.log(`Версия ${version}: pet/pet.mjs, README.md, CHANGELOG.md согласованы`);
