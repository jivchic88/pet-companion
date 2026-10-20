// manifest.json (PL08; README, «Файлы пакета без сборщика»; docs/ARCHITECTURE.md § 11.4): записанный перечень совпадает с
// собранным по графу (scripts/manifest.mjs); версия — package.json и VERSION; входы — ровно JS-входы exports; пути —
// внутри пакета, без повторов и несуществующих файлов, только файлы исполнения (без типов и документов); каждый файл
// исполнения pet/ принадлежит хотя бы одному входу. Сверка не только разбором: загрузчик Node (registerHooks) записывает
// каждый модуль, который действительно загружает импорт входа, — ровно JS-файлы его перечня. Отрицательные контроли на
// копии пакета: новый модуль и новый стиль в графе — перечень устарел (для /web и /react, не для /core); импорт
// несуществующего файла, путь за пределы пакета, необъявленная зависимость и адрес стиля не литералом (как в 290e949 —
// перечисление через map) — перечень не собирается; испорченные перечни — каждая ошибка названа; стиль из комментария —
// не ресурс. PL09: входы /native (react, react-native; PL10.1 — ещё react-native-svg) и /native-sqlite (expo-sqlite) — без
// веба, DOM и CSS; в загрузчике react-native, react-native-svg и expo-sqlite — заглушки (в devDependencies их нет), граф
// файлов пакета — настоящий.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { VERSION } from '../pet/core.mjs';
import { buildManifest, manifestCheck, manifestProblems, manifestText, PAGE_STYLES, scan } from '../scripts/manifest.mjs';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const stored = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const JS_ENTRIES = ['.', './core', './pets', './behaviors', './web', './react', './character', './character-web', './character-react', './native', './native-sqlite'];

// Копия пакета (package.json, manifest.json, pet/) во временной папке; правка files: { путь: текст | (текст) => текст }.
async function copy(edits = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'pet-manifest-'));
  for (const file of ['package.json', 'manifest.json']) await cp(path.join(root, file), path.join(dir, file));
  await cp(path.join(root, 'pet'), path.join(dir, 'pet'), { recursive: true });
  for (const [file, edit] of Object.entries(edits)) {
    const target = path.join(dir, file);
    const before = await readFile(target, 'utf8').catch(() => '');
    await writeFile(target, typeof edit === 'function' ? edit(before) : edit);
  }
  return dir;
}

test('manifest.json актуален: совпадает с собранным по графу байт в байт; схема 1, имя и версия пакета (= VERSION), входы — ровно JS-входы exports по порядку', async () => {
  assert.deepEqual(await manifestCheck(root), []);
  const built = await buildManifest(root);
  assert.equal(await readFile(path.join(root, 'manifest.json'), 'utf8'), manifestText(built));
  assert.equal(stored.schema, 1);
  assert.equal(stored.name, pkg.name);
  assert.equal(stored.version, pkg.version);
  assert.equal(stored.version, VERSION);
  assert.deepEqual(Object.keys(stored.entries), JS_ENTRIES);
  for (const entry of JS_ENTRIES) assert.equal(stored.entries[entry].module, pkg.exports[entry].default.replace(/^\.\//, ''), entry);
  assert.deepEqual(await manifestProblems(stored, root), []);
});

test('перечень — только файлы исполнения внутри pet/: без типов и документов; каждый файл исполнения pet/ — в перечне хотя бы одного входа', async () => {
  const all = (await readdir(path.join(root, 'pet'), { recursive: true })).map((file) => `pet/${file.split(path.sep).join('/')}`).filter((file) => /\.(mjs|css)$/.test(file)).sort();
  const listed = new Set(Object.values(stored.entries).flatMap((own) => own.files));
  assert.deepEqual([...listed].sort(), all, 'ни лишнего, ни пропущенного файла исполнения');
  for (const file of listed) assert.match(file, /^pet\/[\w/-]+\.(mjs|css)$/, file);
});

test('входы: стили страницы — только у mountPet (порядок каскада, pet-base.css по желанию); контейнер (/web, /react) — свои стили в files; peers — react у /react, react, react-native и react-native-svg у /native, expo-sqlite у /native-sqlite; ядро, определения и натив — без веба и CSS', () => {
  const { entries } = stored;
  assert.deepEqual(entries['.'].styles, PAGE_STYLES['.'].map((style) => ({ ...style })));
  assert.deepEqual(entries['.'].styles.map((style) => [style.file, style.required]), [['pet/pet-base.css', false], ['pet/pet.css', true], ['pet/dog.css', true]]);
  for (const entry of ['./core', './pets', './behaviors', './web', './react', './character', './character-web', './character-react', './native', './native-sqlite']) assert.deepEqual(entries[entry].styles, [], entry);
  for (const entry of ['./web', './react']) for (const file of ['pet/pet-base.css', 'pet/pet.css', 'pet/dog.css', 'pet/web/view.css']) assert.ok(entries[entry].files.includes(file), `${entry}: ${file}`);
  assert.deepEqual(entries['./react'].peers, { react: pkg.peerDependencies.react });
  // PL09: натив — только свой слой, общий хук и ядро; SQLite — только адаптер и ядро.
  assert.deepEqual(entries['./native'].peers, { react: pkg.peerDependencies.react, 'react-native': pkg.peerDependencies['react-native'], 'react-native-svg': pkg.peerDependencies['react-native-svg'] });
  assert.deepEqual(entries['./native-sqlite'].peers, { 'expo-sqlite': pkg.peerDependencies['expo-sqlite'] });
  assert.ok(entries['./native'].files.every((file) => file === 'pet/native.mjs' || /^pet\/(native|hooks|core)\//.test(file)), `/native: ${entries['./native'].files.join(', ')}`);
  assert.ok(entries['./native-sqlite'].files.every((file) => file === 'pet/native-sqlite.mjs' || /^pet\/(storage|core)\//.test(file)), `/native-sqlite: ${entries['./native-sqlite'].files.join(', ')}`);
  for (const entry of ['.', './core', './pets', './behaviors', './web', './react']) assert.ok(!entries[entry].files.some((file) => /^pet\/(native|storage)(\/|\.|-)/.test(file)), `${entry} не достигает натива`);
  for (const entry of ['.', './core', './pets', './behaviors', './web']) {
    assert.deepEqual(entries[entry].peers, {}, entry);
    assert.ok(!entries[entry].files.some((file) => file === 'pet/react.mjs' || file.startsWith('pet/hooks/')), `${entry} без React`);
  }
  for (const entry of ['./core', './pets', './behaviors']) assert.ok(entries[entry].files.every((file) => file.endsWith('.mjs') && !file.startsWith('pet/web') && !/art\.mjs$/.test(file)), entry);
  assert.ok(entries['./core'].files.every((file) => file === 'pet/core.mjs' || file.startsWith('pet/core/')), 'ядро — только core/**');
  assert.ok(!entries['./web'].files.includes('pet/pet.mjs') && !entries['./web'].files.includes('pet/web/legacy/places.mjs'), '/web без legacy-фасада и мест');
  assert.ok(!entries['.'].files.includes('pet/web/view.mjs') && !entries['.'].files.includes('pet/web/view.css'), 'mountPet без контейнера');
});

// Модули, которые действительно загружает импорт входа (загрузчик Node, отдельный процесс на вход).
async function loaded(module) {
  const base = pathToFileURL(`${root}${path.sep}`).href;
  // react-native, react-native-svg и expo-sqlite (партнёры /native и /native-sqlite) в проверках не установлены — заглушки
  // загрузчика с теми же именами экспорта.
  const stubs = {
    'react-native': 'data:text/javascript,export const AppState = {}; export const AccessibilityInfo = {}; export const Animated = {}; export const Easing = {}; export const Keyboard = {}; export const Platform = {}; export const Modal = () => null; export const ScrollView = () => null; export const TextInput = () => null; export const Pressable = () => null; export const Text = () => null; export const View = () => null; export const StyleSheet = { create: (styles) => styles };',
    'react-native-svg': "data:text/javascript,export default () => null; export const Circle = 'circle', ClipPath = 'clipPath', Defs = 'defs', Ellipse = 'ellipse', G = 'g', LinearGradient = 'linearGradient', Path = 'path', Pattern = 'pattern', RadialGradient = 'radialGradient', Rect = 'rect', Stop = 'stop';",
    'expo-sqlite': 'data:text/javascript,export function openDatabaseAsync() {}',
  };
  const probe = `
    import { registerHooks } from 'node:module';
    const seen = new Set();
    registerHooks({
      resolve(specifier, context, next) { const stubs = ${JSON.stringify(stubs)}; return Object.hasOwn(stubs, specifier) ? { url: stubs[specifier], shortCircuit: true } : next(specifier, context); },
      load(url, context, next) { if (url.startsWith(${JSON.stringify(`${base}pet/`)})) seen.add(url.slice(${base.length})); return next(url, context); },
    });
    await import(${JSON.stringify(new URL(module, base).href)});
    console.log(JSON.stringify([...seen].sort()));`;
  const { stdout } = await run(process.execPath, ['--input-type=module', '-e', probe], { cwd: root });
  return JSON.parse(stdout);
}

test('загрузчик Node: импорт каждого входа загружает ровно JS-файлы его перечня (react — из node_modules, react-native, react-native-svg и expo-sqlite — заглушки, вне перечня)', async () => {
  for (const entry of JS_ENTRIES) {
    const own = stored.entries[entry];
    assert.deepEqual(await loaded(own.module), own.files.filter((file) => file.endsWith('.mjs')), entry);
  }
});

test('разбор: импорты и ресурсы — по синтаксису, комментарии не считаются; адрес стиля не литералом — ошибка', async () => {
  const kits = scan('pet/web/kits.mjs', await readFile(path.join(root, 'pet/web/kits.mjs'), 'utf8'));
  assert.ok((await readFile(path.join(root, 'pet/web/kits.mjs'), 'utf8')).includes("new URL('./my.css', import.meta.url)"), 'пример адреса — в комментарии');
  assert.deepEqual(kits.resources, [], 'пример из комментария — не ресурс');
  assert.deepEqual(kits.errors, []);
  const view = scan('pet/web/view.mjs', await readFile(path.join(root, 'pet/web/view.mjs'), 'utf8'));
  assert.deepEqual(view.resources, ['../pet-base.css', '../pet.css', '../dog.css', './view.css']);
  const old = scan('x.mjs', "const styles = () => ['../pet.css', './view.css'].map((file) => new URL(file, import.meta.url).href);");
  assert.deepEqual(old.resources, []);
  assert.match(old.errors.join(), /не литералом/);
  const parts = scan('x.mjs', "import a from './a.mjs';\nexport { b } from './b.mjs';\nexport * from './c.mjs';\nimport './d.mjs';\nconst e = import('./e.mjs');\n// import f from './f.mjs';\n/* new URL('./g.css', import.meta.url) */\nconst h = `import i from './i.mjs'`;\nconst j = new URL('./j.css', import.meta.url);\nconst k = new URL('./k.css', 'https://x/');");
  assert.deepEqual(parts.imports, ['./a.mjs', './b.mjs', './c.mjs', './d.mjs', './e.mjs']);
  assert.deepEqual(parts.resources, ['./j.css']);
});

test('отрицательный контроль: новый модуль и новый стиль в графе контейнера — записанный перечень устарел (/web и /react), другие входы — без расхождений', async () => {
  const dir = await copy({
    'pet/web/view.mjs': (text) => text.replace("import { createWebStorage } from './storage.mjs';", "import { createWebStorage } from './storage.mjs';\nimport { extra } from './extra.mjs';\nvoid extra;"),
    'pet/web/extra.mjs': "export const extra = () => new URL('./extra.css', import.meta.url).href;\n",
    'pet/web/extra.css': '.pet-extra {\n  color: inherit;\n}\n',
  });
  try {
    const diff = await manifestCheck(dir);
    assert.deepEqual(diff.sort(), ['./react: нет pet/web/extra.css (его загружает вход)', './react: нет pet/web/extra.mjs (его загружает вход)', './web: нет pet/web/extra.css (его загружает вход)', './web: нет pet/web/extra.mjs (его загружает вход)'], diff.join('\n'));
    // Пересобранный перечень копии — с новыми файлами только у /web и /react.
    const built = await buildManifest(dir);
    for (const entry of JS_ENTRIES) assert.equal(built.entries[entry].files.includes('pet/web/extra.css'), ['./web', './react'].includes(entry), entry);
    // Удалённый из графа файл — лишний в записанном перечне.
    const lean = await copy({ 'pet/behaviors.mjs': (text) => text.replace("export { calm } from './defs/calm.mjs';", 'export const calm = null;') });
    try {
      const extra = await manifestCheck(lean);
      assert.ok(extra.includes('./behaviors: лишний pet/defs/calm.mjs (вход его не загружает)') && extra.every((line) => line.startsWith('./behaviors: лишний')), extra.join('\n'));
    } finally {
      await rm(lean, { recursive: true, force: true });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('отрицательный контроль: импорт несуществующего файла, путь за пределы пакета, необъявленная зависимость, адрес стиля перечислением (290e949) — перечень не собирается, причина названа', async () => {
  const cases = [
    [{ 'pet/web/parts.mjs': (text) => `import './gone.mjs';\n${text}` }, /pet\/web\/gone\.mjs: нет такого файла/],
    [{ 'pet/core/day.mjs': (text) => `import '../../../outside.mjs';\n${text}` }, /за пределами пакета/],
    [{ 'pet/web/parts.mjs': (text) => `import 'left-pad';\n${text}` }, /left-pad — зависимость не объявлена в peerDependencies/],
    [{ 'pet/web/view.mjs': (text) => text.replace(/const packageStyles = \(\) => \[[\s\S]*?\];/, "const packageStyles = () => ['../pet-base.css', '../pet.css', '../dog.css', './view.css'].map((file) => new URL(file, import.meta.url).href);") }, /не литералом/],
    [{ 'pet/web/view.css': (text) => `@import url('./more.css');\n${text}` }, /внешний файл в CSS/],
  ];
  for (const [edits, reason] of cases) {
    const dir = await copy(edits);
    try {
      await assert.rejects(buildManifest(dir), reason, Object.keys(edits).join());
      await assert.rejects(manifestCheck(dir), reason);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test('отрицательный контроль: испорченный перечень — повтор, несуществующий файл, пути за пределы пакета и абсолютный, модуль вне files, чужая версия, пропущенный вход, необъявленный peer — каждая ошибка названа', async () => {
  const broken = (change) => {
    const manifest = structuredClone(stored);
    change(manifest);
    return manifestProblems(manifest, root);
  };
  const web = (manifest) => manifest.entries['./web'];
  assert.ok((await broken((m) => web(m).files.splice(1, 0, web(m).files[0]))).some((line) => line === `./web: ${stored.entries['./web'].files[0]} — повтор`));
  assert.ok((await broken((m) => (web(m).files = [...web(m).files, 'pet/web/missing.mjs'].sort()))).includes('./web: pet/web/missing.mjs — нет такого файла'));
  for (const bad of ['../package.json', '/etc/hosts', './pet/web.mjs', 'pet/../package.json', 'pet\\web.mjs']) {
    assert.ok((await broken((m) => web(m).files.push(bad))).some((line) => line.startsWith(`./web: ${bad} — путь не внутри пакета`)), bad);
  }
  assert.ok((await broken((m) => (web(m).files = web(m).files.filter((file) => file !== 'pet/web.mjs')))).includes('./web: module не в files'));
  assert.ok((await broken((m) => (m.version = '9.9.9'))).includes(`version 9.9.9 — в package.json ${pkg.version}`));
  assert.ok((await broken((m) => delete m.entries['./react'])).some((line) => line.startsWith('входы')));
  assert.ok((await broken((m) => (web(m).peers = { vue: '*' }))).includes('./web: peer vue не объявлен'));
  assert.ok((await broken((m) => m.entries['.'].styles.push({ file: 'pet/web/view.css', required: true }))).includes('.: стиль pet/web/view.css не в files'));
  // Расхождение с графом при правильной форме: перечень без файла, который вход загружает.
  const dir = await copy({ 'manifest.json': (text) => text.replace('      "pet/web/view.css",\n', '') });
  try {
    assert.ok((await manifestCheck(dir)).includes('./web: нет pet/web/view.css (его загружает вход)'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
