// Форма пакета без сборки и сети: одна версия (package.json = VERSION ядра = README = CHANGELOG); публичные входы — только
// mountPet, localDay, VERSION, вход ядра pet-companion/core (PL05: createPetCore, createStorage, PetError, localDay,
// VERSION; PL06: definePet, defineBehavior), входы определений pet-companion/pets (cat, dog, corner, cornerItems) и
// /behaviors (calm) и три стиля; модуль замкнут (импорты — только относительные пути внутри pet/, в том числе вложенные
// core/, defs/ и web/, без сети и динамических импортов); граф ядра (pet/core.mjs и pet/core/**) — только pet/core/**, без
// ID штатных питомцев вне formats/legacy.mjs; определения (pet/defs/**) — только проверка ядра и defs/**; CSS без внешних
// файлов, переменные темы с рабочими значениями; package.json без зависимостей и скриптов установки, exports и files
// согласованы; пример README = example.html; ссылки руководства — только на файлы пакета; типы описывают те же экспорты,
// у стилей — своя декларация без значений; лицензия заполнена; в файлах пакета нет следов приложения-источника.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import * as Behaviors from '../pet/behaviors.mjs';
import * as Core from '../pet/core.mjs';
import * as Pet from '../pet/pet.mjs';
import * as Pets from '../pet/pets.mjs';
import * as R from './legacy-rules.mjs';

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

test('публичные входы: mountPet, localDay, VERSION; ядро (PL05, PL06) — createPetCore, createStorage, definePet, defineBehavior, PetError, localDay, VERSION; определения — cat, dog, corner, cornerItems и calm; localDay — одна граница дня', () => {
  assert.deepEqual(Object.keys(Pet).sort(), ['VERSION', 'localDay', 'mountPet']);
  assert.deepEqual(Object.keys(Core).sort(), ['PetError', 'VERSION', 'createPetCore', 'createStorage', 'defineBehavior', 'definePet', 'localDay']);
  assert.deepEqual(Object.keys(Pets).sort(), ['cat', 'corner', 'cornerItems', 'dog']);
  assert.deepEqual(Object.keys(Behaviors).sort(), ['calm']);
  assert.deepEqual([Pets.cat.id, Pets.dog.id, Behaviors.calm.id], ['cat', 'dog', 'calm']);
  assert.ok([Pets.cat, Pets.dog, Behaviors.calm].every((def) => Object.isFrozen(def) && Core.definePet !== undefined), 'определения — замороженные копии');
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
  // PL06: ID штатных питомцев (cat, dog) — только в модуле совместимости форматов 0.1.4 (formats/legacy.mjs): ни строк
  // 'cat' / 'dog', ни полей .cat / .dog и ключей cat: / dog: в остальном ядре — ветвлений по виду нет, данные — определения.
  for (const file of ['core.mjs', ...files.filter((name) => name !== 'core/formats/legacy.mjs')]) {
    assert.doesNotMatch(strip(await read(`pet/${file}`)), /['"`](cat|dog)['"`]|\.(cat|dog)\b|\b(cat|dog)\s*:/, `${file}: ID штатного питомца вне formats/legacy.mjs`);
  }
  // PL04.1: время, случайность и задачи — только порты экземпляра; системные Date, Math.random и таймеры — в реализациях
  // портов по умолчанию (core/ports.mjs и местный день core/day.mjs), не в правилах и сессии.
  for (const file of files.filter((name) => !['core/ports.mjs', 'core/day.mjs'].includes(name))) {
    assert.doesNotMatch(strip(await read(`pet/${file}`)), /\bDate\.now\b|\bnew Date\b|\bMath\.random\b|\b(setTimeout|setInterval|clearTimeout|requestAnimationFrame|queueMicrotask)\b/, file);
  }
});

test('граф определений (PL06): pet/defs/** — только проверка ядра (core/define.mjs и её зависимости) и defs/**; входы pets.mjs и behaviors.mjs — только defs/**; ядро определения не импортирует', async () => {
  const defs = (await runtime('.mjs')).filter((file) => file.startsWith('defs/'));
  assert.deepEqual(defs, ['defs/calm.mjs', 'defs/cat.mjs', 'defs/dog.mjs', 'defs/room.mjs']);
  for (const file of defs) for (const { spec, resolved } of await imports(file)) assert.ok(resolved === 'core/define.mjs' || resolved?.startsWith('defs/'), `${file}: ${spec}`);
  for (const file of ['pets.mjs', 'behaviors.mjs']) for (const { spec, resolved } of await imports(file)) assert.ok(resolved?.startsWith('defs/'), `${file}: ${spec}`);
  for (const file of (await runtime('.mjs')).filter((name) => name.startsWith('core/') || name === 'core.mjs')) for (const { resolved } of await imports(file)) assert.ok(!resolved?.startsWith('defs/'), `${file} импортирует определения`);
  // Определения — данные без кода: ни функций, ни обращений к браузеру и сети.
  for (const file of defs) assert.doesNotMatch(strip(await read(`pet/${file}`)), /\b(window|document|navigator|localStorage|indexedDB|matchMedia|crypto|Date|Math)\b|=>\s*\{|function\b/, file);
});

test('пример расширения (§ 7.10): examples/extension — только публичные входы пакета и свои файлы; в pet/** нет ID и файлов примера', async () => {
  const dir = new URL('../examples/extension/', import.meta.url);
  const own = (await readdir(dir)).sort();
  assert.deepEqual(own, ['bunny-web.mjs', 'bunny.css', 'bunny.mjs', 'index.html', 'lively.mjs', 'node.mjs']);
  const PUBLIC = ['pet-companion', 'pet-companion/core', 'pet-companion/pets', 'pet-companion/behaviors'];
  const specs = [];
  for (const file of own.filter((name) => name.endsWith('.mjs'))) specs.push(...[...(await read(`examples/extension/${file}`)).matchAll(IMPORT)].map(([, from, bare]) => [file, from ?? bare]));
  // Модуль страницы — те же правила; карта импортов связывает имена входов с файлами установленного пакета.
  const page = await read('examples/extension/index.html');
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(page)[1];
  specs.push(...[...script.matchAll(/^\s*import\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/gm)].map(([, spec]) => ['index.html', spec]));
  for (const [file, spec] of specs) assert.ok(PUBLIC.includes(spec) || spec.startsWith('node:') || /^\.\/[\w-]+\.mjs$/.test(spec), `${file}: ${spec} — не публичный вход`);
  assert.deepEqual(JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(page)[1]).imports, Object.fromEntries(PUBLIC.map((name) => [name, `../node_modules/pet-companion/pet/${{ 'pet-companion': 'pet', 'pet-companion/core': 'core', 'pet-companion/pets': 'pets', 'pet-companion/behaviors': 'behaviors' }[name]}.mjs`])));
  // Ядро и пакет о примере не знают: в коде (без комментариев) нет его ID отдельной строкой — ветвлений по нему нет — и
  // путей к его файлам (образец формата ID в тексте ошибки — не ветвление).
  for (const file of await runtime('.mjs')) assert.doesNotMatch(strip(await read(`pet/${file}`)), /['"`]example\.[\w.-]+['"`]|examples\/|bunny-web|lively\.mjs/, file);
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
  // PL05: вход ядра ./core; PL06: входы определений ./pets и ./behaviors; внутренние pet/core/**, pet/defs/**, pet/web/** и
  // будущие входы (web, react, native, manifest) закрыты.
  assert.deepEqual(Object.keys(pkg.exports), ['.', './core', './pets', './behaviors', './pet.css', './dog.css', './pet-base.css', './package.json']);
  assert.deepEqual(pkg.exports['.'], { types: './pet/pet.d.mts', default: './pet/pet.mjs' });
  assert.deepEqual(pkg.exports['./core'], { types: './pet/core.d.mts', default: './pet/core.mjs' });
  assert.deepEqual(pkg.exports['./pets'], { types: './pet/pets.d.mts', default: './pet/pets.mjs' });
  assert.deepEqual(pkg.exports['./behaviors'], { types: './pet/behaviors.d.mts', default: './pet/behaviors.mjs' });
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
  for (const [, spec] of readme.matchAll(/from '([^'.][^']*)'/g)) assert.ok([pkg.name, `${pkg.name}/core`, `${pkg.name}/pets`, `${pkg.name}/behaviors`].includes(spec), `импорт ${spec}`);
  for (const [, spec] of readme.matchAll(/import '([^'.][^']*)'/g)) assert.ok([`${pkg.name}/pet.css`, `${pkg.name}/dog.css`, `${pkg.name}/pet-base.css`].includes(spec), spec);
  assert.ok(readme.includes(`npm install ${pkg.name}`), 'установка по имени пакета');
  for (const doc of ['README.md', 'CHANGELOG.md']) {
    for (const [, href] of (await read(doc)).matchAll(/\]\(([^)\s]+)\)/g)) assert.ok(/^(https:|#)/.test(href) || ['README.md', 'CHANGELOG.md', 'LICENSE', 'example.html'].includes(href), `${doc}: ${href}`);
  }
});

test('типы: pet.d.mts, core.d.mts, pets.d.mts и behaviors.d.mts объявляют те же экспорты значений, что их входы; css.d.mts — стиль без значений', async () => {
  const values = (text) => [...text.matchAll(/^export declare (?:const|function|class) (\w+)/gm)].map((match) => match[1]).filter((name, i, all) => all.indexOf(name) === i).sort();
  assert.deepEqual(values(await read('pet/pet.d.mts')), Object.keys(Pet).sort());
  assert.deepEqual(values(await read('pet/core.d.mts')), Object.keys(Core).sort());
  assert.deepEqual(values(await read('pet/pets.d.mts')), Object.keys(Pets).sort());
  assert.deepEqual(values(await read('pet/behaviors.d.mts')), Object.keys(Behaviors).sort());
  // Декларации ядра и определений не тянут DOM (ядро — и для Node без lib dom).
  for (const file of ['pet/core.d.mts', 'pet/pets.d.mts', 'pet/behaviors.d.mts']) assert.doesNotMatch(strip(await read(file)), /\bHTML\w*Element\b|\bDocument\b|\bWindow\b|\bEvent\b/, file);
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
