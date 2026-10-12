// Форма пакета без сборки и сети: одна версия (package.json = VERSION = README = CHANGELOG); публичные входы — только
// mountPet, localDay, VERSION и три стиля; модуль замкнут (импорты — только своя папка, без сети и динамических
// импортов); CSS без внешних файлов, переменные темы с рабочими значениями; package.json без зависимостей и скриптов
// установки, exports и files согласованы; пример README = example.html; ссылки руководства — только на файлы пакета;
// типы описывают те же экспорты; лицензия заполнена; в файлах пакета нет следов приложения-источника.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import * as Pet from '../pet/pet.mjs';
import * as R from '../pet/pet-rules.mjs';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const runtime = async (ext) => (await readdir(new URL('../pet/', import.meta.url))).filter((file) => file.endsWith(ext)).sort();

test('версия одна: package.json = VERSION = README = CHANGELOG', async () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(Pet.VERSION, pkg.version);
  assert.match(await read('README.md'), new RegExp(`Версия \\*\\*${pkg.version.replace(/\./g, '\\.')}\\*\\*`));
  const changelog = await read('CHANGELOG.md');
  // Сверху — раздел «Не выпущено» (изменения после выпуска) или запись текущей версии.
  const heads = [...changelog.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  const released = heads[0] === 'Не выпущено' ? heads[1] : heads[0];
  assert.match(released, new RegExp(`^${pkg.version.replace(/\./g, '\\.')} — \\d{4}-\\d{2}-\\d{2}$`), 'запись текущей версии в CHANGELOG');
  for (const file of await runtime('.mjs')) if (file !== 'pet.mjs') assert.doesNotMatch(await read(`pet/${file}`), /VERSION = '\d/, `${file}: второй версии нет`);
});

test('публичные входы: mountPet, localDay, VERSION; localDay — та же граница дня, что у модуля', () => {
  assert.deepEqual(Object.keys(Pet).sort(), ['VERSION', 'localDay', 'mountPet']);
  assert.equal(Pet.localDay, R.localDay);
  assert.equal(Pet.localDay(new Date(2026, 9, 10, 23, 59, 59)), '2026-10-10');
  assert.equal(Pet.localDay(new Date(2026, 9, 11, 0, 0, 1)), '2026-10-11');
  assert.match(Pet.localDay(), /^\d{4}-\d{2}-\d{2}$/);
});

test('модуль замкнут: импорты — только файлы своей папки; без сети, динамических импортов и внешних адресов', async () => {
  const files = await runtime('.mjs');
  for (const file of files) {
    const source = await read(`pet/${file}`);
    for (const [, spec] of source.matchAll(/^(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|^import\s*['"]([^'"]+)['"]/gm)) {
      assert.match(spec, /^\.\/[\w-]+\.mjs$/, `${file}: ${spec}`);
      assert.ok(files.includes(spec.slice(2)), `${file}: ${spec} — есть в pet/`);
    }
    const code = strip(source);
    assert.doesNotMatch(code, /\bimport\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|new Worker|serviceWorker|https?:\/\//, `${file}: сеть или внешний адрес`);
  }
});

test('CSS: без внешних файлов; переменные темы --pet-* с рабочими значениями на :root', async () => {
  for (const file of await runtime('.css')) {
    const css = strip(await read(`pet/${file}`));
    assert.doesNotMatch(css, /@import|url\(\s*(?!['"]?data:)/, `${file}: внешний файл`);
  }
  const css = strip(await read('pet/pet.css'));
  const used = new Set([...css.matchAll(/var\((--pet-[\w-]+)/g)].map((match) => match[1]));
  const root = /:root \{([^}]*)\}/.exec(css)?.[1] ?? '';
  for (const name of used) assert.match(root, new RegExp(`${name}:`), `${name} — значение по умолчанию`);
  assert.ok(used.size >= 10, [...used].join(','));
});

test('package.json: без зависимостей и скриптов установки; exports — публичные входы, их файлы в files; стили — sideEffects', async () => {
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundleDependencies', 'bundledDependencies']) assert.equal(pkg[field], undefined, field);
  for (const script of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack', 'preuninstall', 'uninstall', 'postuninstall']) assert.equal(pkg.scripts?.[script], undefined, script);
  assert.equal(pkg.type, 'module');
  assert.deepEqual(Object.keys(pkg.exports), ['.', './pet.css', './dog.css', './pet-base.css', './package.json']);
  assert.deepEqual(pkg.exports['.'], { types: './pet/pet.d.mts', default: './pet/pet.mjs' });
  assert.equal(pkg.main, './pet/pet.mjs');
  assert.equal(pkg.types, './pet/pet.d.mts');
  for (const name of ['pet.css', 'dog.css', 'pet-base.css']) assert.equal(pkg.exports[`./${name}`], `./pet/${name}`);
  assert.deepEqual(pkg.files, ['pet/', 'example.html', 'CHANGELOG.md']);
  assert.deepEqual(pkg.sideEffects, ['*.css']);
  assert.ok(pkg.license && pkg.license !== 'UNLICENSED', 'license');
});

test('руководство: пример = example.html; импорты — имя пакета; ссылки — только на файлы пакета и https', async () => {
  const readme = await read('README.md');
  const example = /```html\n([\s\S]*?)\n```/.exec(readme)?.[1];
  assert.equal(await read('example.html'), `${example}\n`);
  assert.match(example, /^<!doctype html>[\s\S]*<meta name="viewport"[\s\S]*href="\.\/pet\/pet\.css"[\s\S]*from '\.\/pet\/pet\.mjs'[\s\S]*storage: '[\w-]+'[\s\S]*notify\('saved'/);
  for (const [, spec] of readme.matchAll(/from '([^'.][^']*)'/g)) assert.equal(spec, pkg.name, `импорт ${spec}`);
  for (const [, spec] of readme.matchAll(/import '([^'.][^']*)'/g)) assert.ok([`${pkg.name}/pet.css`, `${pkg.name}/dog.css`, `${pkg.name}/pet-base.css`].includes(spec), spec);
  assert.ok(readme.includes(`npm install ${pkg.name}`), 'установка по имени пакета');
  for (const doc of ['README.md', 'CHANGELOG.md']) {
    for (const [, href] of (await read(doc)).matchAll(/\]\(([^)\s]+)\)/g)) assert.ok(/^(https:|#)/.test(href) || ['README.md', 'CHANGELOG.md', 'LICENSE', 'example.html'].includes(href), `${doc}: ${href}`);
  }
});

test('типы: pet.d.mts объявляет те же экспорты, что pet.mjs', async () => {
  const types = await read('pet/pet.d.mts');
  const declared = [...types.matchAll(/^export declare (?:const|function) (\w+)/gm)].map((match) => match[1]).sort();
  assert.deepEqual(declared, Object.keys(Pet).sort());
});

test('лицензия заполнена; в файлах пакета нет следов приложения-источника', async () => {
  const license = await read('LICENSE');
  assert.match(license, /^MIT License/);
  assert.doesNotMatch(license, /<[^>]+>|\[[^\]]+\]/, 'правообладатель и год заполнены');
  const files = ['README.md', 'CHANGELOG.md', 'example.html', ...(await readdir(new URL('../pet/', import.meta.url))).map((file) => `pet/${file}`)];
  for (const file of files) assert.doesNotMatch(await read(file), /trainer\/|pet-study|cat-ui|progress\.md|ADR \d|docs\/adr|Team Lead|cloudflare|wrangler/i, file);
});
