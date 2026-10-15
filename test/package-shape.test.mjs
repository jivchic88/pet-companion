// Форма пакета без сборки и сети: одна версия (package.json = VERSION ядра = README = CHANGELOG); публичные входы — только
// mountPet, localDay, VERSION, вход ядра pet-companion/core (PL05: createPetCore, createStorage, PetError, localDay,
// VERSION) и три стиля; модуль замкнут (импорты — только относительные пути внутри pet/, в том числе вложенные core/ и
// web/, без сети и динамических импортов); граф ядра (pet/core.mjs и pet/core/**) — только pet/core/**; CSS без внешних
// файлов, переменные темы с рабочими значениями; package.json без зависимостей и скриптов установки, exports и files
// согласованы; пример README = example.html; ссылки руководства — только на файлы пакета; типы описывают те же экспорты,
// у стилей — своя декларация без значений; лицензия заполнена; в файлах пакета нет следов приложения-источника.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import * as Core from '../pet/core.mjs';
import * as Pet from '../pet/pet.mjs';
import * as R from '../pet/pet-rules.mjs';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// Файлы pet/ с вложенными папками — пути от pet/ ('pet.mjs', 'core/index.mjs').
const runtime = async (ext) => (await readdir(new URL('../pet/', import.meta.url), { recursive: true })).map((file) => file.split(path.sep).join('/')).filter((file) => file.endsWith(ext)).sort();
const IMPORT = /^(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|^import\s*['"]([^'"]+)['"]/gm;
// Импорты файла pet/<file>: пути, разрешённые от pet/ (или null — вне pet/).
async function imports(file) {
  const source = await read(`pet/${file}`);
  return [...source.matchAll(IMPORT)].map(([, from, bare]) => {
    const spec = from ?? bare;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    return { spec, resolved: resolved.startsWith('../') || path.posix.isAbsolute(resolved) ? null : resolved };
  });
}

test('версия одна: package.json = VERSION = README = CHANGELOG', async () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(Pet.VERSION, pkg.version);
  assert.match(await read('README.md'), new RegExp(`Версия \\*\\*${pkg.version.replace(/\./g, '\\.')}\\*\\*`));
  const changelog = await read('CHANGELOG.md');
  // Сверху — раздел «Не выпущено» (изменения после выпуска) или запись текущей версии.
  const heads = [...changelog.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  const released = heads[0] === 'Не выпущено' ? heads[1] : heads[0];
  assert.match(released, new RegExp(`^${pkg.version.replace(/\./g, '\\.')} — \\d{4}-\\d{2}-\\d{2}$`), 'запись текущей версии в CHANGELOG');
  // Одна константа — core/version.mjs (PL05: её отдают оба входа, pet-companion и pet-companion/core); второй нет.
  assert.match(await read('pet/core/version.mjs'), new RegExp(`^export const VERSION = '${pkg.version.replace(/\./g, '\\.')}';$`, 'm'));
  assert.equal(Core.VERSION, pkg.version);
  for (const file of await runtime('.mjs')) if (file !== 'core/version.mjs') assert.doesNotMatch(await read(`pet/${file}`), /VERSION = '\d/, `${file}: второй версии нет`);
});

test('публичные входы: mountPet, localDay, VERSION; ядро (PL05) — createPetCore, createStorage, PetError, localDay, VERSION; localDay — одна граница дня', () => {
  assert.deepEqual(Object.keys(Pet).sort(), ['VERSION', 'localDay', 'mountPet']);
  assert.deepEqual(Object.keys(Core).sort(), ['PetError', 'VERSION', 'createPetCore', 'createStorage', 'localDay']);
  assert.equal(Pet.localDay, R.localDay);
  assert.equal(Core.localDay, Pet.localDay);
  assert.equal(Pet.localDay(new Date(2026, 9, 10, 23, 59, 59)), '2026-10-10');
  assert.equal(Pet.localDay(new Date(2026, 9, 11, 0, 0, 1)), '2026-10-11');
  assert.match(Pet.localDay(), /^\d{4}-\d{2}-\d{2}$/);
});

test('модуль замкнут: импорты — только относительные пути к файлам pet/ (и вложенных папок); без сети, динамических импортов и внешних адресов', async () => {
  const files = await runtime('.mjs');
  assert.ok(files.includes('core/index.mjs') && files.includes('web/storage.mjs'), files.join(', '));
  for (const file of files) {
    for (const { spec, resolved } of await imports(file)) {
      assert.match(spec, /^\.\.?\/(?:[\w-]+\/)*[\w-]+\.mjs$/, `${file}: ${spec} — относительный путь к .mjs`);
      assert.ok(resolved && files.includes(resolved), `${file}: ${spec} — файл внутри pet/`);
    }
    const code = strip(await read(`pet/${file}`));
    assert.doesNotMatch(code, /\bimport\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|new Worker|serviceWorker|https?:\/\//, `${file}: сеть или внешний адрес`);
  }
});

test('граф ядра: вход pet/core.mjs и pet/core/** импортируют только pet/core/** — ни оболочки, ни рисунков, ни стилей, ни веб-адаптеров', async () => {
  const files = (await runtime('.mjs')).filter((file) => file.startsWith('core/'));
  // Рекурсивно от входов ядра (публичный вход pet-companion/core; экземпляр и координатор хранения — их берут
  // legacy-оболочка и веб-адаптеры): всё достижимое — внутри core/; каждый файл core/ достижим (нет мёртвых модулей).
  const seen = new Set();
  const walk = async (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const { spec, resolved } of await imports(file)) {
      assert.ok(resolved?.startsWith('core/'), `${file}: ${spec} — вне pet/core/`);
      await walk(resolved);
    }
  };
  await walk('core.mjs');
  await walk('core/index.mjs');
  await walk('core/storage.mjs');
  assert.deepEqual([...seen].filter((file) => file !== 'core.mjs').sort(), files);
  // Ядро без обращений к браузеру (исполнение проверяет test/core-globals.test.mjs с глобалами-ловушками). Сеть — вызов
  // fetch(…) или обращение .fetch / ["fetch"]; само слово fetch — имя сценки собаки «приносит мячик» (данные 0.1.4).
  for (const file of ['core.mjs', ...files]) assert.doesNotMatch(strip(await read(`pet/${file}`)), /\b(window|document|navigator|localStorage|indexedDB|matchMedia|crypto)\b|\bfetch\s*\(|\.fetch\b|\[\s*['"]fetch['"]\s*\]/, file);
  // PL04.1: время, случайность и задачи — только порты экземпляра; системные Date, Math.random и таймеры — в реализациях
  // портов по умолчанию (core/ports.mjs и местный день core/day.mjs), не в правилах и сессии.
  for (const file of files.filter((name) => !['core/ports.mjs', 'core/day.mjs'].includes(name))) {
    assert.doesNotMatch(strip(await read(`pet/${file}`)), /\bDate\.now\b|\bnew Date\b|\bMath\.random\b|\b(setTimeout|setInterval|clearTimeout|requestAnimationFrame|queueMicrotask)\b/, file);
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

test('package.json: без зависимостей и скриптов установки; exports — публичные входы с типами, их файлы в files; стили — sideEffects', async () => {
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundleDependencies', 'bundledDependencies']) assert.equal(pkg[field], undefined, field);
  for (const script of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack', 'preuninstall', 'uninstall', 'postuninstall']) assert.equal(pkg.scripts?.[script], undefined, script);
  assert.equal(pkg.type, 'module');
  // PL05: вход ядра ./core — только он; внутренние pet/core/**, pet/web/** и будущие входы (pets, behaviors, web, react,
  // native, manifest) закрыты.
  assert.deepEqual(Object.keys(pkg.exports), ['.', './core', './pet.css', './dog.css', './pet-base.css', './package.json']);
  assert.deepEqual(pkg.exports['.'], { types: './pet/pet.d.mts', default: './pet/pet.mjs' });
  assert.deepEqual(pkg.exports['./core'], { types: './pet/core.d.mts', default: './pet/core.mjs' });
  assert.equal(pkg.main, './pet/pet.mjs');
  assert.equal(pkg.types, './pet/pet.d.mts');
  // Стиль: TypeScript берёт декларацию (условие types — первым), сборщик и Node — сам файл .css.
  for (const name of ['pet.css', 'dog.css', 'pet-base.css']) assert.deepEqual(pkg.exports[`./${name}`], { types: './pet/css.d.mts', default: `./pet/${name}` });
  for (const [entry, target] of Object.entries(pkg.exports)) if (typeof target === 'object') assert.deepEqual(Object.keys(target), ['types', 'default'], entry);
  assert.deepEqual(pkg.files, ['pet/', 'example.html', 'CHANGELOG.md']);
  assert.deepEqual(pkg.sideEffects, ['*.css']);
  assert.ok(pkg.license && pkg.license !== 'UNLICENSED', 'license');
});

test('руководство: пример = example.html; импорты — имя пакета; ссылки — только на файлы пакета и https', async () => {
  const readme = await read('README.md');
  const example = /```html\n([\s\S]*?)\n```/.exec(readme)?.[1];
  assert.equal(await read('example.html'), `${example}\n`);
  assert.match(example, /^<!doctype html>[\s\S]*<meta name="viewport"[\s\S]*href="\.\/pet\/pet\.css"[\s\S]*from '\.\/pet\/pet\.mjs'[\s\S]*storage: '[\w-]+'[\s\S]*notify\('saved'/);
  for (const [, spec] of readme.matchAll(/from '([^'.][^']*)'/g)) assert.ok([pkg.name, `${pkg.name}/core`].includes(spec), `импорт ${spec}`);
  for (const [, spec] of readme.matchAll(/import '([^'.][^']*)'/g)) assert.ok([`${pkg.name}/pet.css`, `${pkg.name}/dog.css`, `${pkg.name}/pet-base.css`].includes(spec), spec);
  assert.ok(readme.includes(`npm install ${pkg.name}`), 'установка по имени пакета');
  for (const doc of ['README.md', 'CHANGELOG.md']) {
    for (const [, href] of (await read(doc)).matchAll(/\]\(([^)\s]+)\)/g)) assert.ok(/^(https:|#)/.test(href) || ['README.md', 'CHANGELOG.md', 'LICENSE', 'example.html'].includes(href), `${doc}: ${href}`);
  }
});

test('типы: pet.d.mts и core.d.mts объявляют те же экспорты значений, что pet.mjs и core.mjs; css.d.mts — стиль без значений', async () => {
  const values = (text) => [...text.matchAll(/^export declare (?:const|function|class) (\w+)/gm)].map((match) => match[1]).filter((name, i, all) => all.indexOf(name) === i).sort();
  assert.deepEqual(values(await read('pet/pet.d.mts')), Object.keys(Pet).sort());
  assert.deepEqual(values(await read('pet/core.d.mts')), Object.keys(Core).sort());
  // Декларация ядра не тянет DOM (ядро — и для Node без lib dom).
  assert.doesNotMatch(strip(await read('pet/core.d.mts')), /\bHTML\w*Element\b|\bDocument\b|\bWindow\b|\bEvent\b/);
  // Ни default, ни имён классов (это не CSS Modules), ни declare module '*.css' для всего проекта сайта.
  assert.equal(strip(await read('pet/css.d.mts')).trim(), 'export {};');
});

test('лицензия заполнена; в файлах пакета нет следов приложения-источника', async () => {
  const license = await read('LICENSE');
  assert.match(license, /^MIT License/);
  assert.doesNotMatch(license, /<[^>]+>|\[[^\]]+\]/, 'правообладатель и год заполнены');
  const files = ['README.md', 'CHANGELOG.md', 'example.html', ...(await runtime('')).filter((file) => /\.\w+$/.test(file)).map((file) => `pet/${file}`)];
  for (const file of files) assert.doesNotMatch(await read(file), /trainer\/|pet-study|cat-ui|progress\.md|ADR \d|docs\/adr|Team Lead|cloudflare|wrangler/i, file);
});
