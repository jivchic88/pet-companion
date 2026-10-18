// Форма пакета без сборки и сети: одна версия (package.json = VERSION ядра = README = CHANGELOG); публичные входы — только
// mountPet, localDay, VERSION, вход ядра pet-companion/core (PL05: createPetCore, createStorage, PetError, localDay,
// VERSION; PL06: definePet, defineBehavior), входы определений pet-companion/pets (cat, dog, corner, cornerItems) и
// /behaviors (calm), веб (PL07), React (PL08: PetCompanion, usePetState) и три стиля; модуль замкнут (импорты — только
// относительные пути внутри pet/, в том числе вложенные core/, defs/, web/ и hooks/, без сети и динамических импортов; голое
// имя — только react и только в pet/react.mjs и pet/hooks/**); граф React — хук только react, обёртка — веб, ядро, хук и
// react, остальные входы React не достигают; граф ядра (pet/core.mjs и pet/core/**) — только pet/core/**, без
// ID штатных питомцев вне formats/legacy.mjs; определения (pet/defs/**) — только проверка ядра и defs/**; CSS без внешних
// файлов, переменные темы с рабочими значениями; package.json без зависимостей и скриптов установки (кроме необязательного
// партнёра react, PL08), средства проверки — точными версиями, exports и files согласованы (manifest.json — PL08); пример
// README = example.html, копирование по перечню в README = examples/manifest/copy.mjs; ссылки руководства — только на файлы
// пакета; типы описывают те же экспорты,
// у стилей — своя декларация без значений; лицензия заполнена; в файлах пакета нет следов приложения-источника. PL09:
// входы pet-companion/native (useNativeLifecycle, usePetState) и /native-sqlite (createSqliteStorage, createSqliteScenes) —
// голые имена react и react-native только у pet/native.mjs, expo-sqlite — только у pet/native-sqlite.mjs; pet/native/** и
// pet/storage/** — только ядро; натив не достигает веба, DOM и CSS, прежние входы — натива и его партнёров. PL10.1: во входе
// /native ещё PetView, catNative, dogNative; слои pet/native/** — у каждого файла свой перечень импортов (правила и
// жизненный цикл — только ядро, рисунки — react и react-native-svg, отображение — ещё react-native, хук и правила наборов),
// голое react-native-svg — только у них; SQLite-вход не достигает ни React, ни отображения. PL10.2.1: во входе /native ещё
// PetProvider и PetCorner; новые слои — рисунок поверхности (figure), координатор (provider), общий уголок (room), уголок
// (corner) — каждый со своим перечнем; PetView больше не импортирует react-native-svg сам (рисунок — figure). Нативные
// входы здесь не импортируются (партнёров в проверках нет): экспорты — разбором исходника.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import * as Behaviors from '../pet/behaviors.mjs';
import * as Core from '../pet/core.mjs';
import * as Pet from '../pet/pet.mjs';
import * as Pets from '../pet/pets.mjs';
import * as ReactEntry from '../pet/react.mjs';
import * as Web from '../pet/web.mjs';
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
    const external = !spec.startsWith('./') && !spec.startsWith('../');
    return { spec, resolved: external || resolved.startsWith('../') || path.posix.isAbsolute(resolved) ? null : resolved, external };
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

test('публичные входы: mountPet, localDay, VERSION; ядро (PL05, PL06) — createPetCore, createStorage, definePet, defineBehavior, PetError, localDay, VERSION; определения — cat, dog, corner, cornerItems и calm; веб (PL07) — mountPetIn, createWebStorage, createWebScenes, catWeb, dogWeb; React (PL08) — PetCompanion, usePetState; localDay — одна граница дня', () => {
  assert.deepEqual(Object.keys(Pet).sort(), ['VERSION', 'localDay', 'mountPet']);
  assert.deepEqual(Object.keys(Web).sort(), ['catWeb', 'createWebScenes', 'createWebStorage', 'dogWeb', 'mountPetIn']);
  assert.deepEqual(Object.keys(ReactEntry).sort(), ['PetCompanion', 'usePetState']);
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

// Голые имена партнёров — только в своих файлах (PL08 — react; PL09 — react-native, expo-sqlite; PL10.1 — отображение
// pet/native/view.mjs и рисунки наборов pet/native/svg.mjs, cat.mjs, dog.mjs — react и react-native-svg; PL10.2.1 —
// рисунок поверхности figure.mjs, координатор provider.mjs, общий уголок room.mjs и уголок corner.mjs).
const NATIVE_ART = ['native/svg.mjs', 'native/cat.mjs', 'native/dog.mjs', 'native/room.mjs'];
const PEER_FILES = {
  react: (file) => file === 'react.mjs' || file === 'native.mjs' || file.startsWith('hooks/') || ['native/view.mjs', 'native/svg.mjs', 'native/figure.mjs', 'native/provider.mjs', 'native/corner.mjs'].includes(file),
  'react-native': (file) => ['native.mjs', 'native/view.mjs', 'native/figure.mjs', 'native/provider.mjs', 'native/corner.mjs'].includes(file),
  'react-native-svg': (file) => ['native/figure.mjs', 'native/corner.mjs'].includes(file) || NATIVE_ART.includes(file),
  'expo-sqlite': (file) => file === 'native-sqlite.mjs',
};
// Слои pet/native/** (PL10.1, PL10.2.1): у каждого файла — ровно разрешённые голые имена и локальные области.
const NATIVE_LAYERS = {
  'native/lifecycle.mjs': { bare: [], local: ['core/'] },
  'native/kits.mjs': { bare: [], local: ['core/'] },
  'native/motion.mjs': { bare: [], local: [] },
  'native/svg.mjs': { bare: ['react', 'react-native-svg'], local: [] },
  'native/cat.mjs': { bare: ['react-native-svg'], local: ['native/svg.mjs'] },
  'native/dog.mjs': { bare: ['react-native-svg'], local: ['native/svg.mjs'] },
  'native/room.mjs': { bare: ['react-native-svg'], local: ['core/room.mjs', 'native/kits.mjs', 'native/svg.mjs'] },
  'native/figure.mjs': { bare: ['react', 'react-native', 'react-native-svg'], local: ['native/kits.mjs', 'native/motion.mjs'] },
  'native/provider.mjs': { bare: ['react', 'react-native'], local: ['core/ports.mjs', 'native/kits.mjs'] },
  'native/view.mjs': { bare: ['react', 'react-native'], local: ['core/ports.mjs', 'hooks/state.mjs', 'native/figure.mjs', 'native/kits.mjs', 'native/provider.mjs'] },
  'native/corner.mjs': { bare: ['react', 'react-native', 'react-native-svg'], local: ['core/pets.mjs', 'core/ports.mjs', 'core/room.mjs', 'core/stages.mjs', 'hooks/state.mjs', 'native/figure.mjs', 'native/kits.mjs', 'native/provider.mjs', 'native/room.mjs'] },
};
// Экспорты значений модуля разбором исходника (для входов, которые без партнёров не импортируются).
const exported = (text) =>
  [...strip(text).matchAll(/^export (?:const|function|class) (\w+)|^export \{([^}]+)\}/gm)]
    .flatMap(([, one, list]) => (one ? [one] : list.split(',').map((name) => name.trim().split(/\s+as\s+/).pop())))
    .sort();

test('модуль замкнут: импорты — только относительные пути к файлам pet/ (и вложенных папок), голое имя — react в pet/react.mjs, pet/hooks/** и pet/native.mjs, react-native — в pet/native.mjs, expo-sqlite — в pet/native-sqlite.mjs (PL08, PL09); без сети, динамических импортов и внешних адресов', async () => {
  const files = await runtime('.mjs');
  assert.ok(['core/index.mjs', 'web/storage.mjs', 'hooks/state.mjs', 'native/lifecycle.mjs', 'storage/sqlite.mjs'].every((file) => files.includes(file)), files.join(', '));
  for (const file of files) {
    for (const { spec, resolved, external } of await imports(file)) {
      if (external) {
        assert.ok(Object.hasOwn(PEER_FILES, spec) && PEER_FILES[spec](file), `${file}: ${spec} — внешний пакет вне своего слоя`);
        continue;
      }
      assert.match(spec, /^(?:\.\/|(?:\.\.\/)+)(?:[\w-]+\/)*[\w-]+\.mjs$/, `${file}: ${spec} — относительный путь к .mjs`);
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

test('граф веба (PL07): вход pet/web.mjs — контейнер, веб-адаптеры и наборы без legacy-фасада pet/pet.mjs и его реестра; ядро и определения веб не импортируют', async () => {
  const seen = new Set();
  const walk = async (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const { spec, resolved } of await imports(file)) {
      assert.ok(resolved, `${file}: ${spec} — внутри pet/`);
      await walk(resolved);
    }
  };
  await walk('web.mjs');
  assert.ok(!seen.has('pet.mjs'), 'вход /web не тянет legacy-фасад mountPet (реестр одного питомца)');
  assert.ok(!seen.has('pet-move.mjs') && !seen.has('web/legacy/places.mjs'), 'перенос между местами и места legacy — не в контейнере');
  for (const file of ['web/view.mjs', 'web/shell.mjs', 'web/pointer.mjs', 'web/storage.mjs', 'web/scenes.mjs', 'web/kits.mjs']) assert.ok(seen.has(file), file);
  // Ядро, вход ядра и определения о вебе не знают.
  for (const file of (await runtime('.mjs')).filter((name) => name.startsWith('core/') || name.startsWith('defs/') || ['core.mjs', 'pets.mjs', 'behaviors.mjs'].includes(name))) {
    for (const { resolved } of await imports(file)) assert.ok(!resolved?.startsWith('web') && resolved !== 'web.mjs', `${file} импортирует веб`);
  }
  // Ни отметок на <html>, ни элементов в <body>, ни блокировки прокрутки, ни legacy-реестра в контейнере.
  const view = strip(await read('pet/web/view.mjs'));
  assert.doesNotMatch(view, /documentElement|document\.body\.(?:append|prepend|appendChild|insert)|Symbol\.for\('pet-module'\)|scrollTo|scrollY|cat-open/, 'контейнер не трогает <html>, <body>, прокрутку и реестр legacy');
  // Состояние отображения — на экземпляр: в веб-модулях отображения нет изменяемого состояния модуля (let на уровне модуля).
  for (const file of ['pet-play.mjs', 'pet-toys.mjs', 'pet-room.mjs', 'pet-move.mjs', 'web/pointer.mjs', 'web/shell.mjs', 'web/legacy/places.mjs']) {
    assert.doesNotMatch(strip(await read(`pet/${file}`)), /^(?:let|var) /m, `${file}: изменяемое состояние модуля`);
    assert.doesNotMatch(strip(await read(`pet/${file}`)), /^const (st|one|ui) = /m, `${file}: общий объект состояния модуля`);
  }
});

test('граф React (PL08): хук pet/hooks/** — только react (ядро — аргументом, ни DOM, ни веба); обёртка pet/react.mjs — react, веб, ядро и хук; legacy, ядро, определения и веб React не достигают', async () => {
  const hooks = (await runtime('.mjs')).filter((file) => file.startsWith('hooks/'));
  assert.deepEqual(hooks, ['hooks/state.mjs']);
  for (const file of hooks) {
    assert.deepEqual((await imports(file)).map(({ spec }) => spec), ['react'], file);
    assert.doesNotMatch(strip(await read(`pet/${file}`)), /\b(window|document|navigator|localStorage|indexedDB|matchMedia|HTMLElement)\b/, file);
  }
  for (const { spec, resolved, external } of await imports('react.mjs')) assert.ok((external && spec === 'react') || resolved?.startsWith('web/') || resolved?.startsWith('core/') || resolved?.startsWith('hooks/'), `react.mjs: ${spec}`);
  assert.match(await read('pet/react.mjs'), /^'use client';\n/, "вход React — граница клиентских компонентов ('use client')");
  // От каждого другого входа: ни pet/react.mjs, ни pet/hooks/**, ни голого react.
  for (const entry of ['pet.mjs', 'core.mjs', 'pets.mjs', 'behaviors.mjs', 'web.mjs']) {
    const seen = new Set();
    const walk = async (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const { spec, resolved, external } of await imports(file)) {
        assert.ok(!external, `${entry} → ${file}: ${spec}`);
        await walk(resolved);
      }
    };
    await walk(entry);
    assert.ok(![...seen].some((file) => file === 'react.mjs' || file.startsWith('hooks/')), `${entry} достигает React`);
  }
});

test('граф натива (PL09, PL10.1, PL10.2.1): pet/storage/** — только ядро; pet/native/** — ровно слои NATIVE_LAYERS (правила наборов, движения и жизненный цикл — без React, рисунки и общий уголок — без react-native, координатор — без react-native-svg); вход /native — react, react-native, хук и pet/native/**; вход /native-sqlite — expo-sqlite и pet/storage/**; натив не достигает веба, DOM, CSS и веб-рисунков; без изменяемого состояния модуля; прежние входы не достигают натива и его партнёров', async () => {
  const files = await runtime('.mjs');
  for (const file of files.filter((name) => name.startsWith('storage/'))) {
    for (const { spec, resolved, external } of await imports(file)) assert.ok(!external && resolved?.startsWith('core/'), `${file}: ${spec} — только ядро`);
  }
  assert.deepEqual(files.filter((name) => name.startsWith('native/')).sort(), Object.keys(NATIVE_LAYERS).sort(), 'файлы pet/native/** — известные слои');
  for (const [file, layer] of Object.entries(NATIVE_LAYERS)) {
    const found = await imports(file);
    assert.deepEqual([...new Set(found.filter(({ external }) => external).map(({ spec }) => spec))].sort(), [...layer.bare].sort(), `${file}: голые имена`);
    for (const { spec, resolved, external } of found) if (!external) assert.ok(layer.local.some((area) => (area.endsWith('/') ? resolved?.startsWith(area) : resolved === area)), `${file}: ${spec}`);
    assert.doesNotMatch(strip(await read(`pet/${file}`)), /^(?:let|var) /m, `${file}: изменяемое состояние модуля`);
  }
  for (const { spec, resolved, external } of await imports('native.mjs')) assert.ok((external && ['react', 'react-native'].includes(spec)) || resolved?.startsWith('hooks/') || resolved?.startsWith('native/'), `native.mjs: ${spec}`);
  for (const { spec, resolved, external } of await imports('native-sqlite.mjs')) assert.ok((external && spec === 'expo-sqlite') || resolved?.startsWith('storage/'), `native-sqlite.mjs: ${spec}`);
  const reach = async (entry) => {
    const seen = new Set();
    const bare = new Set();
    const walk = async (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const { spec, resolved, external } of await imports(file)) {
        if (external) bare.add(spec);
        else await walk(resolved);
      }
    };
    await walk(entry);
    return { seen, bare };
  };
  for (const entry of ['native.mjs', 'native-sqlite.mjs']) {
    const { seen } = await reach(entry);
    assert.ok(![...seen].some((file) => file.startsWith('web') || file === 'react.mjs' || file === 'pet.mjs' || /^pet-|art\.mjs$/.test(file)), `${entry}: ${[...seen].join(', ')}`);
    for (const file of seen) assert.doesNotMatch(strip(await read(`pet/${file}`)), /\b(window|document|navigator|localStorage|indexedDB|matchMedia|HTMLElement|import\.meta)\b/, `${entry} → ${file}`);
  }
  const sqlite = await reach('native-sqlite.mjs');
  assert.ok(!sqlite.seen.has('hooks/state.mjs') && ![...sqlite.seen].some((file) => /^native(\/|\.mjs$)/.test(file)) && !sqlite.bare.has('react') && !sqlite.bare.has('react-native-svg'), 'SQLite не тянет React и отображение');
  assert.deepEqual([...(await reach('native.mjs')).bare].sort(), ['react', 'react-native', 'react-native-svg']);
  for (const entry of ['pet.mjs', 'core.mjs', 'pets.mjs', 'behaviors.mjs', 'web.mjs', 'react.mjs']) {
    const { seen, bare } = await reach(entry);
    assert.ok(![...seen].some((file) => /^(native|storage)(\/|\.|-)/.test(file)), `${entry} достигает натива`);
    assert.ok(!bare.has('react-native') && !bare.has('expo-sqlite') && !bare.has('react-native-svg'), `${entry}: ${[...bare].join(', ')}`);
  }
  assert.deepEqual(exported(await read('pet/native.mjs')), ['PetCorner', 'PetProvider', 'PetView', 'catNative', 'dogNative', 'useNativeLifecycle', 'usePetState']);
  assert.deepEqual(exported(await read('pet/native-sqlite.mjs')), ['createSqliteScenes', 'createSqliteStorage']);
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
  assert.deepEqual(own, ['bunny-web.mjs', 'bunny.css', 'bunny.mjs', 'container.html', 'index.html', 'lively.mjs', 'node.mjs']);
  const PUBLIC = ['pet-companion', 'pet-companion/core', 'pet-companion/pets', 'pet-companion/behaviors', 'pet-companion/web'];
  const FILE = { 'pet-companion': 'pet', 'pet-companion/core': 'core', 'pet-companion/pets': 'pets', 'pet-companion/behaviors': 'behaviors', 'pet-companion/web': 'web' };
  const specs = [];
  for (const file of own.filter((name) => name.endsWith('.mjs'))) specs.push(...[...(await read(`examples/extension/${file}`)).matchAll(IMPORT)].map(([, from, bare]) => [file, from ?? bare]));
  // Модули страниц — те же правила; карта импортов связывает имена входов с файлами установленного пакета (index.html —
  // legacy mountPet, container.html — mountPetIn, PL07).
  for (const [name, entries] of [
    ['index.html', ['pet-companion', 'pet-companion/core', 'pet-companion/pets', 'pet-companion/behaviors']],
    ['container.html', ['pet-companion/web', 'pet-companion/core', 'pet-companion/pets', 'pet-companion/behaviors']],
  ]) {
    const page = await read(`examples/extension/${name}`);
    const script = /<script type="module">([\s\S]*?)<\/script>/.exec(page)[1];
    specs.push(...[...script.matchAll(/^\s*import\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/gm)].map(([, spec]) => [name, spec]));
    assert.deepEqual(JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(page)[1]).imports, Object.fromEntries(entries.map((entry) => [entry, `../node_modules/pet-companion/pet/${FILE[entry]}.mjs`])), name);
  }
  for (const [file, spec] of specs) assert.ok(PUBLIC.includes(spec) || spec.startsWith('node:') || /^\.\/[\w-]+\.mjs$/.test(spec), `${file}: ${spec} — не публичный вход`);
  // Ядро и пакет о примере не знают: в коде (без комментариев) нет его ID отдельной строкой — ветвлений по нему нет — и
  // путей к его файлам (образец формата ID в тексте ошибки — не ветвление).
  for (const file of await runtime('.mjs')) assert.doesNotMatch(strip(await read(`pet/${file}`)), /['"`]example\.[\w.-]+['"`]|examples\/|bunny-web|lively\.mjs/, file);
});

test('мобильный пример (PL09, PL10.1, PL10.2.1): examples/expo — только публичные входы пакета, expo-sqlite, react, react-native и react-native-safe-area-context; зависимости — точная матрица SDK 58 с react-native-svg 15.16.0 (рисунки наборов; сам пример его не импортирует) и react-native-safe-area-context 5.10.1 (отступы), pet-companion — архивом без записи в package.json; в пакет не входит', async () => {
  const dir = new URL('../examples/expo/', import.meta.url);
  assert.deepEqual((await readdir(dir)).filter((name) => name !== 'node_modules' && name !== '.lib' && name !== '.expo').sort(), ['.gitignore', 'App.js', 'README.md', 'app.json', 'diagnostics.mjs', 'index.js', 'package-lock.json', 'package.json', 'scripts']);
  const example = JSON.parse(await read('examples/expo/package.json'));
  assert.deepEqual(example.dependencies, { expo: '58.0.12', 'expo-sqlite': '58.0.13', react: '19.3.0', 'react-native': '0.88.0', 'react-native-safe-area-context': '5.10.1', 'react-native-svg': '15.16.0' }, 'точные версии матрицы SDK 58 (PL10.2.1: отступы безопасной области — react-native-safe-area-context 5.10.1, ~5.10.1 в bundledNativeModules)');
  assert.equal(example.devDependencies, undefined);
  assert.equal(example.private, true);
  const lock = JSON.parse(await read('examples/expo/package-lock.json'));
  assert.deepEqual(lock.packages[''].dependencies, example.dependencies);
  assert.ok(!Object.keys(lock.packages).some((key) => /node_modules\/pet-companion$/.test(key)), 'в lock нет pet-companion');
  const svg = Object.entries(lock.packages).filter(([key]) => /(^|\/)node_modules\/react-native-svg$/.test(key));
  assert.deepEqual(svg.map(([key, entry]) => [key, entry.version]), [['node_modules/react-native-svg', '15.16.0']], 'одна копия react-native-svg 15.16.0');
  const area = Object.entries(lock.packages).filter(([key]) => /(^|\/)node_modules\/react-native-safe-area-context$/.test(key));
  assert.deepEqual(area.map(([key, entry]) => [key, entry.version, Object.keys(entry.dependencies ?? {}).length]), [['node_modules/react-native-safe-area-context', '5.10.1', 0]], 'одна копия react-native-safe-area-context 5.10.1, без своих зависимостей');
  assert.ok(!Object.values(lock.packages).some((entry) => entry.hasInstallScript), 'без скриптов установки');
  assert.equal(Object.keys(lock.packages).filter((key) => /(^|\/)node_modules\/react$/.test(key)).length, 1, 'одна копия react');
  const PUBLIC = ['pet-companion/core', 'pet-companion/pets', 'pet-companion/behaviors', 'pet-companion/native', 'pet-companion/native-sqlite', 'expo', 'expo-sqlite', 'react', 'react-native', 'react-native-safe-area-context'];
  for (const file of ['App.js', 'index.js', 'diagnostics.mjs']) {
    for (const [, from, bare] of (await read(`examples/expo/${file}`)).matchAll(IMPORT)) {
      const spec = from ?? bare;
      assert.ok(PUBLIC.includes(spec) || /^\.\/[\w-]+(\.mjs)?$/.test(spec), `${file}: ${spec} — не публичный вход`);
    }
    assert.doesNotMatch(strip(await read(`examples/expo/${file}`)), /pet-companion\/pet\/|react-native-svg|pet-companion\/web|pet-companion\/react['"]/, file);
  }
  assert.match(await read('examples/expo/scripts/library.mjs'), /'install', '--no-save'/, 'архив ставится без записи в package.json и lock');
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

test('CSS контейнера (PL07): view.css переносит каждую переменную темы :root pet.css (светлую и тёмную) с тем же умолчанием, без правил для <html> и элементов сайта', async () => {
  const css = strip(await read('pet/pet.css'));
  const view = strip(await read('pet/web/view.css'));
  const pairs = (block) => [...block.matchAll(/(--(?:pet|cat)-[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]);
  const light = pairs(/:root \{([^}]*)\}/.exec(css)[1]);
  const dark = pairs(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/.exec(css)[1]);
  const host = /:host \{([^}]*)\}/.exec(view)[1];
  const hostDark = /@media \(prefers-color-scheme: dark\) \{\s*:host \{([^}]*)\}/.exec(view)[1];
  const capture = (name) => name.replace(/^--(pet|cat)-/, '--$1-v-');
  for (const [name, value] of light) assert.ok(host.includes(`${capture(name)}: var(${name}, ${value});`), `${name}: светлое умолчание ${value}`);
  for (const [name, value] of dark) assert.ok(hostDark.includes(`${capture(name)}: var(${name}, ${value});`), `${name}: тёмное умолчание ${value}`);
  for (const [name] of light) assert.ok(view.includes(`${name}: var(${capture(name)});`), `${name}: передаётся видам`);
  assert.doesNotMatch(view, /(^|[\s,}])(html|body|:root)\b/m, 'без правил для html, body и :root');
});

test('package.json: без зависимостей и скриптов установки; react, react-native, expo-sqlite — только необязательные партнёры (PL08, PL09); средства проверки — точные версии; exports — публичные входы с типами, их файлы в files; стили — sideEffects', async () => {
  for (const field of ['dependencies', 'optionalDependencies', 'bundleDependencies', 'bundledDependencies']) assert.equal(pkg[field], undefined, field);
  // PL08: react нужен только входам React; PL09: react-native — входу /native, expo-sqlite — входу /native-sqlite; PL10.1:
  // react-native-svg — отображению входа /native. Все — необязательные партнёры: npm их не ставит сам, прежние входы их не
  // требуют.
  assert.deepEqual(pkg.peerDependencies, { 'expo-sqlite': '>=58.0.0', react: '^18.3.1 || ^19.0.0', 'react-native': '>=0.88.0', 'react-native-svg': '>=15.16.0' });
  assert.deepEqual(pkg.peerDependenciesMeta, { 'expo-sqlite': { optional: true }, react: { optional: true }, 'react-native': { optional: true }, 'react-native-svg': { optional: true } });
  for (const name of ['expo', 'expo-sqlite', 'react-native', 'react-native-svg']) assert.equal(pkg.devDependencies[name], undefined, `${name} — не средство проверки библиотеки`);
  assert.equal(pkg.dependencies?.['react-native-svg'], undefined);
  for (const [name, version] of Object.entries(pkg.devDependencies)) assert.match(version, /^\d+\.\d+\.\d+$/, `${name}: точная версия`);
  for (const script of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack', 'preuninstall', 'uninstall', 'postuninstall']) assert.equal(pkg.scripts?.[script], undefined, script);
  assert.equal(pkg.type, 'module');
  // PL05: вход ядра ./core; PL06: входы определений ./pets и ./behaviors; PL07: вход веба ./web; PL08: вход React ./react и
  // перечень ./manifest.json; PL09: ./native и ./native-sqlite; внутренние pet/core/**, pet/defs/**, pet/web/**, pet/hooks/**,
  // pet/native/**, pet/storage/** закрыты.
  assert.deepEqual(Object.keys(pkg.exports), ['.', './core', './pets', './behaviors', './web', './react', './native', './native-sqlite', './pet.css', './dog.css', './pet-base.css', './manifest.json', './package.json']);
  assert.deepEqual(pkg.exports['./native'], { types: './pet/native.d.mts', default: './pet/native.mjs' });
  assert.deepEqual(pkg.exports['./native-sqlite'], { types: './pet/native-sqlite.d.mts', default: './pet/native-sqlite.mjs' });
  assert.deepEqual(pkg.exports['.'], { types: './pet/pet.d.mts', default: './pet/pet.mjs' });
  assert.deepEqual(pkg.exports['./core'], { types: './pet/core.d.mts', default: './pet/core.mjs' });
  assert.deepEqual(pkg.exports['./pets'], { types: './pet/pets.d.mts', default: './pet/pets.mjs' });
  assert.deepEqual(pkg.exports['./behaviors'], { types: './pet/behaviors.d.mts', default: './pet/behaviors.mjs' });
  assert.deepEqual(pkg.exports['./web'], { types: './pet/web.d.mts', default: './pet/web.mjs' });
  assert.deepEqual(pkg.exports['./react'], { types: './pet/react.d.mts', default: './pet/react.mjs' });
  assert.equal(pkg.exports['./manifest.json'], './manifest.json');
  assert.equal(pkg.main, './pet/pet.mjs');
  assert.equal(pkg.types, './pet/pet.d.mts');
  // Стиль: TypeScript берёт декларацию (условие types — первым), сборщик и Node — сам файл .css.
  for (const name of ['pet.css', 'dog.css', 'pet-base.css']) assert.deepEqual(pkg.exports[`./${name}`], { types: './pet/css.d.mts', default: `./pet/${name}` });
  for (const [entry, target] of Object.entries(pkg.exports)) if (typeof target === 'object') assert.deepEqual(Object.keys(target), ['types', 'default'], entry);
  assert.deepEqual(pkg.files, ['pet/', 'manifest.json', 'example.html', 'CHANGELOG.md']);
  assert.deepEqual(pkg.sideEffects, ['*.css']);
  assert.ok(pkg.license && pkg.license !== 'UNLICENSED', 'license');
});

test('руководство: пример = example.html; импорты — имя пакета; старты PL08 (React, копирование по перечню) = проверенные файлы примеров; ссылки — только на файлы пакета и https', async () => {
  const readme = await read('README.md');
  const example = /```html\n([\s\S]*?)\n```/.exec(readme)?.[1];
  assert.equal(await read('example.html'), `${example}\n`);
  assert.match(example, /^<!doctype html>[\s\S]*<meta name="viewport"[\s\S]*href="\.\/pet\/pet\.css"[\s\S]*from '\.\/pet\/pet\.mjs'[\s\S]*storage: '[\w-]+'[\s\S]*notify\('saved'/);
  // PL08: вход React и пакет сайта в его примере (react), node: — в скрипте копирования по перечню.
  // PL09: нативные входы и пакеты приложения Expo в мобильном примере.
  for (const [, spec] of readme.matchAll(/from '([^'.][^']*)'/g)) assert.ok([pkg.name, `${pkg.name}/core`, `${pkg.name}/pets`, `${pkg.name}/behaviors`, `${pkg.name}/web`, `${pkg.name}/react`, `${pkg.name}/native`, `${pkg.name}/native-sqlite`, 'react', 'react-native', 'expo-sqlite'].includes(spec) || spec.startsWith('node:'), `импорт ${spec}`);
  // Короткие старты PL08 — те же файлы, что проверяют test:consumers и test:package: компонент React и копирование по перечню.
  const block = (lang, start) => [...readme.matchAll(new RegExp(`\`\`\`${lang}\\n([\\s\\S]*?)\\n\`\`\``, 'g'))].map((match) => `${match[1]}\n`).find((text) => text.startsWith(start));
  assert.equal(block('jsx', "import { useState } from 'react';"), await read('examples/react/src/Corner.jsx'), 'README: пример React = examples/react/src/Corner.jsx');
  assert.equal(block('js', '// Файлы питомца для сайта без сборщика'), await read('examples/manifest/copy.mjs'), 'README: копирование по перечню = examples/manifest/copy.mjs');
  for (const [, spec] of readme.matchAll(/import '([^'.][^']*)'/g)) assert.ok([`${pkg.name}/pet.css`, `${pkg.name}/dog.css`, `${pkg.name}/pet-base.css`].includes(spec), spec);
  assert.ok(readme.includes(`npm install ${pkg.name}`), 'установка по имени пакета');
  for (const doc of ['README.md', 'CHANGELOG.md']) {
    for (const [, href] of (await read(doc)).matchAll(/\]\(([^)\s]+)\)/g)) assert.ok(/^(https:|#)/.test(href) || ['README.md', 'CHANGELOG.md', 'LICENSE', 'example.html'].includes(href), `${doc}: ${href}`);
  }
});

test('типы: pet.d.mts, core.d.mts, pets.d.mts, behaviors.d.mts, web.d.mts и react.d.mts объявляют те же экспорты значений, что их входы; css.d.mts — стиль без значений', async () => {
  const values = (text) => [...text.matchAll(/^export declare (?:const|function|class) (\w+)/gm)].map((match) => match[1]).filter((name, i, all) => all.indexOf(name) === i).sort();
  assert.deepEqual(values(await read('pet/pet.d.mts')), Object.keys(Pet).sort());
  assert.deepEqual(values(await read('pet/core.d.mts')), Object.keys(Core).sort());
  assert.deepEqual(values(await read('pet/pets.d.mts')), Object.keys(Pets).sort());
  assert.deepEqual(values(await read('pet/behaviors.d.mts')), Object.keys(Behaviors).sort());
  assert.deepEqual(values(await read('pet/web.d.mts')), Object.keys(Web).sort());
  assert.deepEqual(values(await read('pet/react.d.mts')), Object.keys(ReactEntry).sort());
  // PL09: нативные входы — по разбору исходника (без партнёров не импортируются).
  assert.deepEqual(values(await read('pet/native.d.mts')), exported(await read('pet/native.mjs')));
  assert.deepEqual(values(await read('pet/native-sqlite.d.mts')), exported(await read('pet/native-sqlite.mjs')));
  // Декларации ядра, определений и натива не тянут DOM (ядро — и для Node без lib dom); натив — и типов React Native,
  // react-native-svg и expo-sqlite. PL10.1: /native — только типы элементов из react (import type), как /react; SQLite — без
  // React; ядро и веб от типов натива не зависят.
  for (const file of ['pet/core.d.mts', 'pet/pets.d.mts', 'pet/behaviors.d.mts', 'pet/native.d.mts', 'pet/native-sqlite.d.mts']) assert.doesNotMatch(strip(await read(file)), /\bHTML\w*Element\b|\bDocument\b|\bWindow\b|\bEvent\b/, file);
  for (const file of ['pet/native.d.mts', 'pet/native-sqlite.d.mts']) assert.doesNotMatch(strip(await read(file)), /from 'react-native'|from 'react-native-svg'|from 'expo-sqlite'/, file);
  assert.deepEqual([...strip(await read('pet/native.d.mts')).matchAll(/^import\b.*?from '([^']+)'/gm)].map((match) => match[0].startsWith('import type') && match[1]), ['react', './core.mjs'], 'native.d.mts: import type из react и ядра');
  assert.doesNotMatch(strip(await read('pet/native-sqlite.d.mts')), /from 'react'/);
  for (const file of ['pet/core.d.mts', 'pet/pets.d.mts', 'pet/behaviors.d.mts', 'pet/web.d.mts', 'pet/pet.d.mts']) assert.doesNotMatch(strip(await read(file)), /native/, `${file}: без типов натива`);
  // Ни default, ни имён классов (это не CSS Modules), ни declare module '*.css' для всего проекта сайта.
  assert.equal(strip(await read('pet/css.d.mts')).trim(), 'export {};');
});

test('лицензия заполнена; в файлах пакета нет следов приложения-источника', async () => {
  const license = await read('LICENSE');
  assert.match(license, /^MIT License/);
  assert.doesNotMatch(license, /<[^>]+>|\[[^\]]+\]/, 'правообладатель и год заполнены');
  const files = ['README.md', 'CHANGELOG.md', 'example.html', 'manifest.json', ...(await runtime('')).filter((file) => /\.\w+$/.test(file)).map((file) => `pet/${file}`)];
  for (const file of files) assert.doesNotMatch(await read(file), /trainer\/|pet-study|cat-ui|progress\.md|ADR \d|docs\/adr|Team Lead|cloudflare|wrangler/i, file);
});
