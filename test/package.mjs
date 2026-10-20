// Упакованный пакет — так, как его получат сайты (npm run test:package; нужен установленный Google Chrome): npm pack во
// временную папку, повтор — те же байты; состав архива — явный список, с внутренними папками core/ и web/ и входом ядра
// core.mjs (ни проверок, ни фикстур, ни служебных файлов); граф импортов из архива — файлы архива, ядро (core.mjs и
// core/**) — только core/**; установка архива в чистый временный проект без сети; Node: входы pet-companion и
// pet-companion/core (PL05), стили по exports, внутренние модули, файлы ядра, будущие входы и несуществующий стиль
// закрыты; импорт обоих входов без браузерных глобалов (ловушки) и mountPet вне браузера — отказ без исключения; внешний
// пример examples/core-node.mjs (только pet-companion/core: хранилище, порты, команды, подписка, sync и async, destroy и
// новое ядро); TypeScript (bundler и nodenext, noUncheckedSideEffectImports, без общих деклараций CSS у проекта): вход,
// ядро и три стиля подключаются, точные результаты и снимок, неверные вызовы и внутренние входы — ошибки, ядро — без lib
// dom, несуществующий стиль и внутренние пути закрыты, стиль не экспортирует значений. Браузер, всё по http под вложенным
// адресом, внешних запросов нет: (1) архив распакован системным tar как есть — example.html из папки package/ (кот,
// уголок, «Поиграть», собака, хранение в своём пространстве и после перезагрузки, отключение и повторное подключение,
// отказ подключения без остатков; телефон — «Скрыть» → перезагрузка → «Показать», «Приходит по зову»); (2) пакет из
// node_modules без сборщика — examples/importmap.html (карта импортов, localDay, занятие, праздник ступени);
// (3) examples/commands.html — кнопки сайта вызывают pet.* и pet.core: имя, занятие, кормление, собака, облик, уголок,
// расстановка, «Скрыть» / «Показать», перезагрузка, отключение pet.core.destroy() и новое подключение. PL06: входы
// pet-companion/pets и /behaviors (штатные определения), definePet и defineBehavior во входе ядра; определения (defs/**) и
// входы штатных импортируют только defs/** и core/**; внешний пример расширения examples/extension/ на установленном
// архиве — в Node (node.mjs: кролик и живая модель, ext:v1, запасной показ, ошибочные ссылки) и в браузере (index.html:
// кролик своим набором, «Поиграть» без лапы, «Без кролика» / «С кроликом»); типы определений — позитивные и негативные.
// PL07: вход pet-companion/web (mountPetIn, createWebStorage, createWebScenes, catWeb, dogWeb) — состав архива с
// web/** и стилем вида web/view.css, вход в Node и без браузерных глобалов (mountPetIn вне браузера — отказ без
// исключения), внутренние файлы веба закрыты, типы /web (положительные и @ts-expect-error); в Chrome под вложенным адресом
// на установленном архиве — examples/container.html (два контейнера, стили вида из пакета, повторное подключение),
// examples/extension/container.html (кролик в контейнере, стили набора в теневом дереве) и examples/csp/ с HTTP-заголовком
// default-src 'self'; style-src 'self' (нарушений нет, стили применены). PL08: в архиве manifest.json, вход pet-companion/react
// (pet/react.mjs, типы) и хук pet/hooks/state.mjs; голое имя react — только у них; перечень архива совпадает с собранным по
// графу самого архива, его файлы — в архиве, версия — пакета; в проекте без React импорт /react честно отказывает (нет
// react), остальные входы работают; внутренние пути React закрыты (Node и TypeScript). Сайт без сборщика по перечню
// (examples/manifest): copy.mjs копирует только файлы входа, сервер отдаёт только эту папку под вложенным адресом — браузер
// загружает ровно файлы перечня входа (./web под CSP и «.» со стилями в порядке перечня), без 404; контроли — без стиля вида
// и без модуля перечня — 404 и отказ. PL09: в архиве входы pet-companion/native и /native-sqlite с типами, pet/native/** и
// pet/storage/**; голые имена react-native и expo-sqlite — только у своих входов, native/** и storage/** — только core/**;
// в проекте без мобильных партнёров оба входа разрешаются, а импорт честно отказывает (нет react / expo-sqlite), прежние
// входы работают; внутренние пути натива закрыты (Node и TypeScript); типы обоих входов — без lib dom и без типов партнёров.
// PL10.1: в архиве отображение pet/native/** (view, kits, motion, svg, cat, dog) — слои импортов по файлам (правила наборов
// и жизненный цикл — только ядро, рисунки — react и react-native-svg), голое react-native-svg — только у отображения;
// типы PetView и наборов — с @types/react проекта, без типов React Native и react-native-svg; логика примера Expo на
// архиве — счёт хоста, подтверждённое и восстановление питомца, облика и лакомства во втором процессе, сдвиг дня.
// PL10.2.1: в архиве ещё рисунок поверхности, координатор, общий уголок и уголок (figure, provider, room, corner) — свои
// слои импортов; внутренние пути закрыты; типы PetProvider, PetCorner, режима композиции PetView и ресурсов уголка набора.
// PL10.2.2: ещё распознавание и геометрия игры (gesture — без React, только размеры предметов ядра) и «Поиграть» (play) —
// свои слои; внутренние пути закрыты; типы PetPlay и ресурсов игры набора.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { buildManifest, manifestProblems } from '../scripts/manifest.mjs';
import { digest, tarballInfo } from '../scripts/release.mjs';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const NAME = pkg.name;
const VERSION = pkg.version;
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json' };
const START = new Date('2026-10-12T10:00:00');
// Файлы pet/ — явный список, с внутренними папками ядра и веб-адаптера (входом пакета они не открыты).
const CORE = ['core/catalog.mjs', 'core/day.mjs', 'core/define.mjs', 'core/director.mjs', 'core/editor.mjs', 'core/errors.mjs', 'core/facade.mjs', 'core/formats/legacy.mjs', 'core/index.mjs', 'core/pets.mjs', 'core/phrases.mjs', 'core/play.mjs', 'core/ports.mjs', 'core/presence.mjs', 'core/room.mjs', 'core/round.mjs', 'core/scenes.mjs', 'core/session.mjs', 'core/stages.mjs', 'core/storage.mjs', 'core/toys.mjs', 'core/version.mjs'];
// Вход ядра pet-companion/core (PL05) — pet/core.mjs и его типы pet/core.d.mts. PL06: штатные определения (defs/), входы
// pet-companion/pets и /behaviors с типами, наборы отображения веба (web/kits.mjs).
const DEFS = ['defs/calm.mjs', 'defs/cat.mjs', 'defs/dog.mjs', 'defs/room.mjs'];
// PL07: вход веба pet/web.mjs с типами, общая оболочка, места legacy, контейнер и его стиль, указатель, общие мелочи.
const WEB = ['web/catalog.mjs', 'web/kits.mjs', 'web/legacy/places.mjs', 'web/parts.mjs', 'web/pointer.mjs', 'web/scenes.mjs', 'web/shell.mjs', 'web/storage.mjs', 'web/view.css', 'web/view.mjs'];
// PL08: вход React pet/react.mjs с типами и общий хук pet/hooks/state.mjs.
const REACT = ['hooks/state.mjs', 'react.d.mts', 'react.mjs'];
// PL09: входы натива с типами, жизненный цикл и SQLite-адаптер; PL10.1: отображение, наборы и рисунки; PL10.2.1: рисунок
// поверхности, координатор, общий уголок и уголок; PL10.2.2: распознавание жестов и «Поиграть».
const NATIVE = ['native-sqlite.d.mts', 'native-sqlite.mjs', 'native.d.mts', 'native.mjs', 'native/arrange.mjs', 'native/cat.mjs', 'native/corner.mjs', 'native/dog.mjs', 'native/figure.mjs', 'native/gesture.mjs', 'native/kits.mjs', 'native/lifecycle.mjs', 'native/motion.mjs', 'native/play.mjs', 'native/provider.mjs', 'native/room.mjs', 'native/svg.mjs', 'native/view.mjs', 'storage/sqlite.mjs'];
const RUNTIME = ['behaviors.d.mts', 'behaviors.mjs', 'cat-art.mjs', 'core.d.mts', 'core.mjs', ...CORE, 'css.d.mts', ...DEFS, 'dog-art.mjs', 'dog.css', ...REACT, ...NATIVE, 'pet-base.css', 'pet-move.mjs', 'pet-place.mjs', 'pet-play.mjs', 'pet-room.mjs', 'pet-rules.mjs', 'pet-toys.mjs', 'pet.css', 'pet.d.mts', 'pet.mjs', 'pets.d.mts', 'pets.mjs', 'web.d.mts', 'web.mjs', ...WEB];
// Голые имена партнёров — только в своих файлах (PL08 — react, PL09 — react-native и expo-sqlite, PL10.1 — отображение и
// рисунки натива: react и react-native-svg; PL10.2.1 — рисунок поверхности, координатор, общий уголок, уголок; PL10.2.2 —
// «Поиграть»).
const PEER_FILES = {
  react: (file) => file === 'react.mjs' || file === 'native.mjs' || file.startsWith('hooks/') || ['native/view.mjs', 'native/svg.mjs', 'native/figure.mjs', 'native/provider.mjs', 'native/corner.mjs', 'native/play.mjs', 'native/arrange.mjs'].includes(file),
  'react-native': (file) => ['native.mjs', 'native/view.mjs', 'native/figure.mjs', 'native/provider.mjs', 'native/corner.mjs', 'native/play.mjs', 'native/arrange.mjs'].includes(file),
  'react-native-svg': (file) => ['native/svg.mjs', 'native/cat.mjs', 'native/dog.mjs', 'native/room.mjs', 'native/figure.mjs', 'native/corner.mjs', 'native/play.mjs'].includes(file),
  'expo-sqlite': (file) => file === 'native-sqlite.mjs',
};
// Локальные импорты слоёв pet/native/** (PL10.1, PL10.2.1, PL10.2.2): области, в которые файл может ссылаться.
const NATIVE_LOCAL = {
  'native/lifecycle.mjs': ['core/'],
  'native/kits.mjs': ['core/'],
  'native/motion.mjs': [],
  'native/svg.mjs': [],
  'native/cat.mjs': ['native/svg.mjs'],
  'native/dog.mjs': ['native/svg.mjs'],
  'native/room.mjs': ['core/room.mjs', 'native/kits.mjs', 'native/svg.mjs'],
  'native/figure.mjs': ['native/kits.mjs', 'native/motion.mjs'],
  'native/provider.mjs': ['core/ports.mjs', 'native/kits.mjs'],
  'native/view.mjs': ['core/ports.mjs', 'hooks/state.mjs', 'native/figure.mjs', 'native/kits.mjs', 'native/provider.mjs'],
  'native/corner.mjs': ['core/pets.mjs', 'core/ports.mjs', 'core/room.mjs', 'core/stages.mjs', 'hooks/state.mjs', 'native/figure.mjs', 'native/kits.mjs', 'native/provider.mjs', 'native/room.mjs'],
  'native/gesture.mjs': ['core/toys.mjs'],
  'native/play.mjs': ['core/play.mjs', 'core/ports.mjs', 'core/toys.mjs', 'hooks/state.mjs', 'native/figure.mjs', 'native/gesture.mjs', 'native/kits.mjs', 'native/provider.mjs', 'native/svg.mjs'],
  'native/arrange.mjs': ['core/editor.mjs', 'core/ports.mjs', 'core/room.mjs', 'hooks/state.mjs', 'native/corner.mjs', 'native/gesture.mjs', 'native/kits.mjs', 'native/provider.mjs', 'native/room.mjs'],
};
// Пример расширения (вне архива): файлы для Node и для браузера (legacy и контейнер).
const EXTENSION = ['bunny.mjs', 'bunny-web.mjs', 'bunny.css', 'container.html', 'index.html', 'lively.mjs', 'node.mjs'];
// CSP-пример контейнера (вне архива): страница, её модуль и стили — файлы; заголовок CSP ставит сервер.
const CSP_FILES = ['index.html', 'main.mjs', 'site.css'];
const CSP = "default-src 'self'; style-src 'self'";
const EXPECTED = ['CHANGELOG.md', 'LICENSE', 'README.md', 'example.html', 'manifest.json', 'package.json', ...RUNTIME.map((file) => `pet/${file}`)].sort();
// Пример сайта без сборщика по перечню (вне архива): страницы и их модули (скрипт копирования — отдельно).
const MANIFEST_SITE = ['index.html', 'main.mjs', 'site.css', 'legacy.html', 'legacy.mjs'];
// Ничего из этого не должно попасть в архив.
const FORBIDDEN = /(^|\/)(test|tests|fixtures|scripts|examples|node_modules|\.github|\.git)(\/|$)|\.env|secret|token|password|progress|\.tgz$|lock/i;
const MODULE_NODES = '.cat-dock, .cat-side, .cat-face, .cat-fold, .cat-float, .cat-bar, .cat-sheet, .cat-sections-return, .pet-zones, .pet-ghost, [id^="cat-"]';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

async function files(dir, rel = '') {
  const list = [];
  for (const entry of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const name = path.posix.join(rel, entry.name);
    if (entry.isDirectory()) list.push(...(await files(dir, name)));
    else list.push(name);
  }
  return list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

async function pack(dest) {
  await mkdir(dest, { recursive: true });
  const { stdout } = await run('npm', ['pack', '--json', '--pack-destination', dest], { cwd: root });
  const [info] = JSON.parse(stdout);
  return { ...info, path: path.join(dest, info.filename) };
}

// Сервер папки dir под адресом prefix; остальное — 404 и запись в список. csp — путь (внутри prefix), страницы и файлы
// которого отдаются с заголовком Content-Security-Policy.
function serve(dir, prefix, { csp = null } = {}) {
  const outside = [];
  const served = [];
  const missing = [];
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://site');
    served.push(pathname);
    const rel = pathname.startsWith(prefix) ? decodeURIComponent(pathname.slice(prefix.length)) : null;
    const file = rel === null ? null : path.resolve(dir, rel);
    if (pathname !== '/favicon.ico' && (file === null || !file.startsWith(`${dir}${path.sep}`))) outside.push(pathname);
    try {
      if (!file?.startsWith(`${dir}${path.sep}`)) throw new Error('вне папки');
      const body = await readFile(file);
      const headers = { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' };
      if (csp && pathname.startsWith(`${prefix}${csp}`)) headers['content-security-policy'] = CSP;
      res.writeHead(200, headers);
      res.end(body);
    } catch {
      if (pathname !== '/favicon.ico') missing.push(pathname);
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${server.address().port}`, outside, served, missing, close: () => new Promise((done) => server.close(done)) })));
}

async function open(browser, origin, options) {
  const context = await browser.newContext(options);
  await context.clock.install({ time: START });
  const external = [];
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : (external.push(route.request().url()), route.abort())));
  const page = await context.newPage();
  page.qaErrors = [];
  page.qaRefusals = [];
  page.on('pageerror', (error) => page.qaErrors.push(error.message));
  page.on('console', (message) => {
    if (message.text().startsWith('Питомец не подключён')) page.qaRefusals.push(message.text());
    else if (message.type() === 'error' || message.text().startsWith('Питомец')) page.qaErrors.push(message.text());
  });
  page.on('requestfailed', (request) => !request.url().endsWith('/favicon.ico') && page.qaErrors.push(`запрос не выполнен: ${request.url()}`));
  return { context, page, external };
}

const nodes = (page) => page.evaluate((selector) => document.querySelectorAll(selector).length, MODULE_NODES);
const sheetOpen = (page) => page.evaluate(() => Boolean(document.getElementById('cat-sheet')?.open));
const stored = (page) => page.evaluate(() => Object.keys(localStorage).sort());
const layout = async (page, label) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${label}: без горизонтальной прокрутки`, overflow <= 0, `overflow=${overflow}`);
};

// Архив распакован как есть: example.html из package/ под вложенным адресом (как на сайте без сборки).
async function archive(browser, dir) {
  const label = 'архив';
  const prefix = '/sites/demo/vendor/package/';
  const server = await serve(dir, prefix);
  const example = `${server.origin}${prefix}example.html`;
  try {
    {
      const { context, page, external } = await open(browser, server.origin, { viewport: { width: 1280, height: 900 } });
      try {
        await page.goto(example);
        await page.waitForSelector('#head > .cat-side .cat-side-face');
        await page.clock.runFor(3000);
        const version = await page.evaluate(async () => (await import(new URL('pet/pet.mjs', location.href).href)).VERSION);
        check(`${label} 1280×900: пример загрузил модули (и вложенные — ядро, веб-хранение) и стили из архива, версия ${VERSION}`, version === VERSION && ['pet/pet.mjs', 'pet/pet-rules.mjs', 'pet/cat-art.mjs', 'pet/dog-art.mjs', 'pet/pet-room.mjs', 'pet/core/index.mjs', 'pet/core/formats/legacy.mjs', 'pet/web/storage.mjs', 'pet/pet.css', 'pet/dog.css', 'pet/pet-base.css'].every((file) => server.served.includes(`${prefix}${file}`)), server.served.join(', '));
        await page.locator('.cat-side-face').click();
        check(`${label} 1280×900: кот у логотипа, уголок открыт`, (await sheetOpen(page)) && (await page.evaluate(() => document.getElementById('cat-sheet-title').textContent)) === 'Марс');
        await page.locator('[data-cat-play]').click();
        await page.locator('[data-cat-play-pet]').click();
        check(`${label} 1280×900: «Поиграть» — «Погладить»`, (await page.evaluate(() => document.querySelector('[data-cat-play-hint]')?.textContent)) === 'Марс мурлычет.');
        await page.keyboard.press('Escape');
        await page.locator('.cat-settings > summary').click();
        await page.locator('.cat-kind-option:has(input[value="dog"])').click();
        await page.clock.runFor(200);
        await page.keyboard.press('Escape');
        const dog = await page.evaluate(() => ({ kind: document.querySelector('#head .cat-art')?.dataset.kind, stored: JSON.parse(localStorage.getItem('mysite:companion:v1'))?.kind }));
        check(`${label} 1280×900: собака у логотипа, выбор в mysite:companion:v1`, dog.kind === 'dog' && dog.stored === 'dog', JSON.stringify(dog));
        await page.locator('#done').click();
        await page.clock.runFor(200);
        check(`${label} 1280×900: «Урок пройден» — радость`, (await page.evaluate(() => document.querySelector('#head .cat-art')?.dataset.pose)) === 'joy');
        await page.clock.runFor(6000);
        await page.reload();
        await page.waitForSelector('#head > .cat-side .cat-side-face');
        const again = await page.evaluate(() => document.querySelector('#head .cat-art')?.dataset.kind);
        const keys = await stored(page);
        check(`${label} 1280×900: после перезагрузки — собака; хранение только в пространстве mysite`, again === 'dog' && keys.length > 0 && keys.every((key) => key.startsWith('mysite:')), `${again}; ${keys.join(',')}`);
        const cycle = await page.evaluate(async () => {
          const { mountPet } = await import(new URL('pet/pet.mjs', location.href).href);
          const head = document.getElementById('head');
          const options = { storage: 'mysite', places: { logo: (el) => head.append(el), top: (el) => head.prepend(el), float: (el) => document.body.append(el) } };
          const count = () => document.querySelectorAll('#cat-sheet, #cat-side, #cat-live').length;
          const a = mountPet(options);
          const replaced = count();
          a.destroy();
          const gone = count() + document.querySelectorAll('.cat-face, .cat-sections-return').length;
          const b = mountPet(options);
          return { replaced, gone, again: count(), mounted: b.mounted };
        });
        check(`${label} 1280×900: подключение поверх примера, отключение и повторное подключение — без дублей и остатков`, cycle.replaced === 3 && cycle.gone === 0 && cycle.again === 3 && cycle.mounted, JSON.stringify(cycle));
        const failures = await page.evaluate(async () => {
          const { mountPet } = await import(new URL('pet/pet.mjs', location.href).href);
          const head = document.getElementById('head');
          const places = { logo: (el) => head.append(el), top: (el) => head.prepend(el), float: (el) => document.body.append(el) };
          const marks = () => [...document.documentElement.classList].filter((name) => /^(cat|pet)-/.test(name)).length + Object.keys(document.documentElement.dataset).filter((name) => /^(cat|pet)[A-Z]/.test(name)).length;
          const left = () => document.querySelectorAll('[id^="cat-"], .cat-face, .cat-side, .cat-float, .cat-sections-return').length + marks();
          const one = mountPet({ storage: 'mysite', places: { ...places, float: (el) => (document.body.append(el), (() => { throw new Error('pkg: float'); })()) } });
          const afterPlace = left();
          const two = mountPet({ storage: 'mysite', places, progress: () => { throw new Error('pkg: progress'); } });
          const afterProgress = left();
          const three = mountPet({ storage: 'mysite', places });
          return { one: one.mounted, two: two.mounted, three: three.mounted, afterPlace, afterProgress, sheets: document.querySelectorAll('#cat-sheet').length };
        });
        check(`${label} 1280×900: отказ подключения (место, progress()) — без остатков, затем обычное подключение`, failures.one === false && failures.two === false && failures.afterPlace === 0 && failures.afterProgress === 0 && failures.three && failures.sheets === 1 && page.qaRefusals.length === 2 && page.qaRefusals.every((text, i) => text.includes(['pkg: float', 'pkg: progress'][i])), JSON.stringify({ failures, told: page.qaRefusals }));
        check(`${label} 1280×900: внешних запросов и запросов вне папки нет, ошибок нет`, external.length === 0 && server.outside.length === 0 && page.qaErrors.length === 0, JSON.stringify({ external, outside: server.outside, errors: page.qaErrors }));
      } catch (error) {
        check(`${label} 1280×900: сценарий выполнен`, false, error.stack);
      } finally {
        await context.close();
      }
    }
    {
      const { context, page, external } = await open(browser, server.origin, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const back = page.getByRole('button', { name: 'Показать кота' });
      try {
        await page.goto(example);
        await page.waitForSelector('#head > .cat-face');
        await page.clock.runFor(3000);
        check(`${label} 390×844: кот в шапке`, (await page.evaluate(() => document.documentElement.dataset.petAt)) === 'top' && (await page.locator('.cat-face').isVisible()));
        await layout(page, `${label} 390×844`);
        await page.locator('.cat-face').tap();
        await page.locator('[data-cat-play]').tap();
        check(`${label} 390×844: «Поиграть» с касанием`, (await page.evaluate(() => document.getElementById('cat-sheet').dataset.view)) === 'play');
        await layout(page, `${label} 390×844, «Поиграть»`);
        await page.locator('[data-cat-play-corner], [data-cat-play-close]').first().tap();
        await page.locator('.cat-settings > summary').tap();
        await page.locator('[data-cat-hide]').tap();
        await page.clock.runFor(200);
        check(`${label} 390×844: «Скрыть» — в шапке «Показать кота»`, (await page.locator('.cat-face').count()) === 0 && (await back.isVisible()));
        await page.reload();
        await page.waitForFunction(() => Boolean(document.getElementById('cat-live')));
        await page.clock.runFor(1000);
        check(`${label} 390×844: после перезагрузки — спрятан, «Показать кота» на месте`, (await page.locator('.cat-face').count()) === 0 && (await back.isVisible()) && (await page.evaluate(() => JSON.parse(localStorage.getItem('mysite:cat:v1')).hidden)) === true);
        await back.tap();
        await page.clock.runFor(100);
        check(`${label} 390×844: «Показать» — кот снова в шапке`, (await page.locator('.cat-face').isVisible()) && !(await back.isVisible()));
        await page.locator('.cat-face').tap();
        await page.locator('.cat-presence .cat-place-option:has(input[value="on-call"])').tap();
        await page.locator('[data-cat-close]').first().tap();
        await page.clock.runFor(100);
        check(`${label} 390×844: «Приходит по зову» — лапка в шапке`, (await page.evaluate(() => document.documentElement.hasAttribute('data-pet-call') && document.querySelector('.cat-face')?.hasAttribute('data-cat-call'))) === true);
        await page.locator('.cat-face').tap();
        check(`${label} 390×844: лапка — сразу «Поиграть»`, (await sheetOpen(page)) && (await page.evaluate(() => document.getElementById('cat-sheet').dataset.view)) === 'play');
        await page.keyboard.press('Escape');
        await page.evaluate(async () => (await import(new URL('pet/pet.mjs', location.href).href)).mountPet({ storage: 'mysite', places: { logo: () => {}, top: () => {} } }).destroy());
        const html = await page.evaluate(() => [...document.documentElement.attributes].map((attr) => `${attr.name}=${attr.value}`).filter((item) => item !== 'lang=ru' && item !== 'class='));
        check(`${label} 390×844: замена и отключение — элементов питомца и отметок на html нет`, (await nodes(page)) === 0 && html.length === 0, html.join(', '));
        check(`${label} 390×844: внешних запросов и запросов вне папки нет, ошибок нет`, external.length === 0 && server.outside.length === 0 && page.qaErrors.length === 0, JSON.stringify({ external, outside: server.outside, errors: page.qaErrors }));
      } catch (error) {
        check(`${label} 390×844: сценарий выполнен`, false, error.stack);
      } finally {
        await context.close();
      }
    }
  } finally {
    await server.close();
  }
}

// Пакет из node_modules без сборщика: examples/importmap.html в корне проекта, проект — под вложенным адресом.
async function importmap(browser, project) {
  const label = 'npm без сборщика';
  const prefix = '/apps/demo/';
  const server = await serve(project, prefix);
  const { context, page, external } = await open(browser, server.origin, { viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${server.origin}${prefix}importmap.html`);
    await page.waitForSelector('#head > .cat-side .cat-side-face');
    await page.clock.runFor(3000);
    const base = `${prefix}node_modules/${NAME}/pet/`;
    check(`${label}: карта импортов — модуль (и вложенные ядро и веб-хранение) и стили из node_modules/${NAME}/pet/`, ['pet.mjs', 'pet-rules.mjs', 'core/index.mjs', 'web/storage.mjs', 'pet.css', 'dog.css', 'pet-base.css'].every((file) => server.served.includes(`${base}${file}`)), server.served.join(', '));
    // Три занятия — третий знак открывает первую ступень: праздник.
    for (let i = 0; i < 3; i += 1) {
      await page.locator('#done').click();
      await page.clock.runFor(6000);
    }
    const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('mysite:cat:v1') ?? '{}').seenStage);
    check(`${label}: три занятия — третий знак открыл первую ступень`, seen === 1, String(seen));
    await page.locator('.cat-side-face').click();
    const line = await page.evaluate(() => document.getElementById('cat-sheet').textContent);
    check(`${label}: уголок — «3 знака практики · сегодня 3 из 3»`, line.includes('3 знака практики') && line.includes('сегодня 3 из 3'), line.slice(0, 300));
    check(`${label}: внешних запросов и запросов вне проекта нет, ошибок нет`, external.length === 0 && server.outside.length === 0 && page.qaErrors.length === 0, JSON.stringify({ external, outside: server.outside, errors: page.qaErrors }));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
    await server.close();
  }
}

// Кнопки сайта вызывают команды pet.* и pet.core (examples/commands.html, пакет из node_modules): интерфейс питомца
// догоняет команду без нажатий на его кнопки; запись — в своём пространстве и после перезагрузки; pet.core.destroy() —
// ничего не осталось; новое подключение работает.
async function commands(browser, project) {
  const label = 'команды сайта';
  const prefix = '/apps/demo/';
  const server = await serve(project, prefix);
  const { context, page, external } = await open(browser, server.origin, { viewport: { width: 1280, height: 900 } });
  const status = () => page.evaluate(() => document.getElementById('status').textContent);
  const act = (name) => page.evaluate((id) => window.demo.actions[id](), name);
  try {
    await page.goto(`${server.origin}${prefix}commands.html`);
    await page.waitForSelector('#head > .cat-side .cat-side-face');
    await page.clock.runFor(3000);
    check(`${label}: модуль и ядро из node_modules/${NAME}/pet/ — вход, ядро (core/facade.mjs, core/version.mjs), веб-хранение`, ['pet.mjs', 'core/index.mjs', 'core/facade.mjs', 'core/version.mjs', 'web/storage.mjs'].every((file) => server.served.includes(`${prefix}node_modules/${NAME}/pet/${file}`)), server.served.join(', '));
    await page.locator('#name').click();
    await page.clock.runFor(100);
    const named = { status: await status(), label: await page.evaluate(() => document.querySelector('.cat-side-face')?.getAttribute('aria-label')), stored: await page.evaluate(() => JSON.parse(localStorage.getItem('mysite:cat:v1')).name) };
    check(`${label}: «Назвать» — pet.setName: подпись питомца и состояние подписки без нажатий на питомца`, named.status.startsWith('Пиксель') && named.label.startsWith('Пиксель') && named.stored === 'Пиксель', JSON.stringify(named));
    await page.locator('#lesson').click();
    await page.clock.runFor(200);
    const joy = await page.evaluate(() => document.querySelector('#head .cat-art')?.dataset.pose);
    await page.clock.runFor(6000);
    await page.locator('#feed').click();
    await page.clock.runFor(100);
    check(`${label}: «Урок пройден» — pet.core.notify: радость; «Покормить» — pet.feed: лакомство дня`, joy === 'joy' && (await status()).includes('лакомство: fed') && (await page.evaluate(() => JSON.parse(localStorage.getItem('mysite:treat:v1')).fedDay)) === '2026-10-12', JSON.stringify({ joy, status: await status() }));
    await page.locator('#dog').click();
    await page.clock.runFor(100);
    await page.locator('#coat').click();
    await page.clock.runFor(100);
    const dog = await page.evaluate(() => ({ kind: document.querySelector('#head .cat-art')?.dataset.kind, coat: document.querySelector('#head .cat-art')?.dataset.coat }));
    check(`${label}: «Собака» и «Другой облик» — pet.setPet, pet.setAppearance: рисунок у логотипа`, dog.kind === 'dog' && dog.coat === 'spotted' && (await status()).includes('dog'), JSON.stringify(dog));
    await page.locator('#corner').click();
    await page.clock.runFor(100);
    const corner = await page.evaluate(() => ({ open: document.getElementById('cat-sheet').open, title: document.getElementById('cat-sheet-title').textContent, focus: document.activeElement?.hasAttribute('data-cat-close'), lock: document.documentElement.classList.contains('cat-open') }));
    await act('close');
    await page.clock.runFor(100);
    const shut = await page.evaluate(() => ({ open: document.getElementById('cat-sheet').open, lock: document.documentElement.classList.contains('cat-open'), focus: document.activeElement?.classList.contains('cat-side-face') }));
    check(`${label}: «Открыть уголок» — pet.core.open: уголок собаки, фокус, блокировка прокрутки; pet.core.close — закрыт, фокус на питомце`, corner.open && corner.title === 'Тоби' && corner.focus && corner.lock && !shut.open && !shut.lock && shut.focus, JSON.stringify({ corner, shut }));
    await page.locator('#room').click();
    await page.clock.runFor(100);
    const room = await page.evaluate(() => ({ view: document.getElementById('cat-sheet').dataset.view ?? '', done: document.querySelector('[data-cat-room-done]')?.textContent, bowl: JSON.parse(localStorage.getItem('mysite:room:v1'))?.dog?.bowl }));
    await act('close');
    check(`${label}: «Миску левее» — pet.core.open('room'), pet.room.select, nudge, save: итог над сценой уголка и запись`, room.view === '' && room.done === 'Расстановка сохранена.' && room.bowl?.x < 170, JSON.stringify(room));
    await page.locator('#hide').click();
    await page.clock.runFor(100);
    const hidden = await page.evaluate(() => ({ face: Boolean(document.querySelector('.cat-side-face')), back: Boolean(document.querySelector('[data-cat-return]')) }));
    await page.locator('#show').click();
    await page.clock.runFor(100);
    check(`${label}: «Скрыть» и «Показать» — pet.hide, pet.show: места по снимку`, !hidden.face && hidden.back && (await page.evaluate(() => Boolean(document.querySelector('.cat-side-face')))), JSON.stringify(hidden));
    await page.reload();
    await page.waitForSelector('#head > .cat-side .cat-side-face');
    await page.clock.runFor(1000);
    const again = await page.evaluate(() => {
      const s = window.demo.pet().getState();
      return { pet: s.pet.shown, coat: s.look.coat, catName: s.pets.cat.name.value, treat: s.treat, bowl: s.room.pos.bowl[0] };
    });
    check(`${label}: после перезагрузки — то, что задали команды сайта`, again.pet === 'dog' && again.coat === 'spotted' && again.catName === 'Пиксель' && again.treat === 'fed' && again.bowl < 170, JSON.stringify(again));
    await page.locator('#off').click();
    const gone = await page.evaluate(() => ({ nodes: document.querySelectorAll('[id^="cat-"], .cat-side, .cat-face, .cat-float').length, marks: [...document.documentElement.classList].filter((name) => /^(cat|pet)-/.test(name)).length + Object.keys(document.documentElement.dataset).length, mounted: window.demo.pet().mounted, status: window.demo.pet().core.status }));
    await page.locator('#on').click();
    await page.clock.runFor(500);
    const back = await page.evaluate(() => ({ mounted: window.demo.pet().mounted, face: Boolean(document.querySelector('.cat-side-face')), sheets: document.querySelectorAll('#cat-sheet').length }));
    check(`${label}: «Отключить» — pet.core.destroy(): ничего не осталось; «Подключить» — снова один питомец`, gone.nodes === 0 && gone.marks === 0 && !gone.mounted && gone.status === 'destroyed' && back.mounted && back.face && back.sheets === 1, JSON.stringify({ gone, back }));
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    check(`${label}: хранение только в пространстве mysite; внешних запросов и запросов вне проекта нет, ошибок нет`, keys.length > 0 && keys.every((key) => key.startsWith('mysite:')) && external.length === 0 && server.outside.length === 0 && page.qaErrors.length === 0, JSON.stringify({ keys, external, outside: server.outside, errors: page.qaErrors }));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
    await server.close();
  }
}

// Пример расширения (PL06) в браузере: examples/extension/index.html в папке extension/ проекта — карта импортов на
// node_modules установленного архива (входы pet-companion, /core, /pets, /behaviors), кролик своим набором и стилями.
async function extension(browser, project) {
  const label = 'пример расширения';
  const prefix = '/apps/ext/';
  const server = await serve(project, prefix);
  const { context, page, external } = await open(browser, server.origin, { viewport: { width: 1280, height: 900 } });
  // «Без кролика»: модель «живая» ссылается на реплики кролика — слабая ссылка, журнал (§ 7.3), не ошибка.
  const WEAK = 'Питомец: behaviors[1].phrases.byPet["example.bunny"]: питомца «example.bunny» нет в этом экземпляре — замены реплик не используются';
  try {
    await page.goto(`${server.origin}${prefix}extension/index.html`);
    await page.waitForFunction(() => Boolean(window.demoPet?.getState()));
    const base = `${prefix}node_modules/${NAME}/pet/`;
    check(`${label}: карта импортов — входы и определения из node_modules/${NAME}/pet/ (pets, behaviors, defs, наборы), свои файлы примера`, ['pet.mjs', 'core.mjs', 'pets.mjs', 'behaviors.mjs', 'defs/cat.mjs', 'defs/calm.mjs', 'core/define.mjs', 'web/kits.mjs'].every((file) => server.served.includes(`${base}${file}`)) && ['bunny.mjs', 'bunny-web.mjs', 'bunny.css', 'lively.mjs'].every((file) => server.served.includes(`${prefix}extension/${file}`)), server.served.join(', '));
    await page.locator('#bunny').click();
    await page.clock.runFor(100);
    const chosen = await page.evaluate(() => ({ shown: window.demoPet.getState().pet.shown, art: Boolean(document.querySelector('#head .bunny-art')), ext: JSON.parse(localStorage.getItem('extension-demo:ext:v1')), companion: localStorage.getItem('extension-demo:companion:v1') }));
    check(`${label}: «Кролик» — рисунок набора в шапке, выбор в ext:v1, companion не записан`, chosen.shown === 'example.bunny' && chosen.art && chosen.ext?.pet?.id === 'example.bunny' && chosen.companion === null, JSON.stringify(chosen));
    await page.clock.runFor(5000);
    await page.locator('#play').click();
    await page.clock.runFor(500);
    const play = await page.evaluate(() => ({ view: document.getElementById('cat-sheet')?.dataset.view, art: Boolean(document.querySelector('.cat-play .bunny-art')), paw: Boolean(document.querySelector('[data-cat-play-paw], [data-play-hit="paw"]')) }));
    await page.locator('[data-cat-play-pet]').click();
    const hint = await page.evaluate(() => document.querySelector('[data-cat-play-hint]')?.textContent);
    check(`${label}: «Поиграть» — кролик, ни кнопки, ни области лапы; «Погладить» — «Пух шевелит носом.»`, play.view === 'play' && play.art && !play.paw && hint === 'Пух шевелит носом.', JSON.stringify({ play, hint }));
    for (let i = 0; i < 3 && (await sheetOpen(page)); i += 1) {
      await page.keyboard.press('Escape');
      await page.clock.runFor(100);
    }
    await page.locator('#without').click();
    await page.clock.runFor(100);
    const without = await page.evaluate(() => ({ pet: window.demoPet.getState().pet, art: document.querySelector('#head .cat-art')?.classList.contains('bunny-art') }));
    await page.locator('#with').click();
    await page.clock.runFor(100);
    const back = await page.evaluate(() => ({ shown: window.demoPet.getState().pet.shown, art: Boolean(document.querySelector('#head .bunny-art')), sheets: document.querySelectorAll('#cat-sheet').length }));
    check(`${label}: «Без кролика» — запасной показ (кот), выбор недоступен; «С кроликом» — снова кролик, одно подключение`, without.pet.id === 'example.bunny' && without.pet.shown === 'cat' && !without.pet.available && without.art === false && back.shown === 'example.bunny' && back.art && back.sheets <= 1, JSON.stringify({ without, back }));
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    const errors = page.qaErrors.filter((text) => text !== WEAK);
    check(`${label}: хранение только в пространстве extension-demo; внешних запросов и запросов вне проекта нет, ошибок нет (слабая ссылка — одно предупреждение журнала)`, keys.length > 0 && keys.every((key) => key.startsWith('extension-demo:')) && external.length === 0 && server.outside.length === 0 && errors.length === 0 && page.qaErrors.filter((text) => text === WEAK).length === 1, JSON.stringify({ keys, external, outside: server.outside, errors: page.qaErrors }));
    await layout(page, label);
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
    await server.close();
  }
}

// Питомец в контейнере (PL07): examples/container.html в корне проекта под вложенным адресом — вход pet-companion/web
// установленного архива (карта импортов), стили вида — файлы пакета, найденные модулем по своему адресу; два контейнера,
// занятие, повторное подключение, onOpenChange.
async function container(browser, project) {
  const label = 'контейнер из node_modules';
  const prefix = '/apps/view/';
  const server = await serve(project, prefix);
  const { context, page, external } = await open(browser, server.origin, { viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${server.origin}${prefix}container.html`);
    await page.waitForFunction(() => Boolean(window.demo?.pet?.core));
    await page.clock.runFor(3000);
    const base = `${prefix}node_modules/${NAME}/pet/`;
    check(`${label}: вход /web и стили вида — из node_modules/${NAME}/pet/ под вложенным адресом (web.mjs, web/view.mjs, web/shell.mjs, pet.css, dog.css, pet-base.css, web/view.css); страница CSS пакета не подключает`, ['web.mjs', 'web/view.mjs', 'web/shell.mjs', 'core/index.mjs', 'pet.css', 'dog.css', 'pet-base.css', 'web/view.css'].every((file) => server.served.includes(`${base}${file}`)) && (await page.evaluate(() => document.querySelectorAll('link[rel="stylesheet"]').length)) === 0, server.served.join(', '));
    const views = await page.evaluate(() => ['main-pet', 'small-pet'].map((id) => {
      const shadow = document.querySelector(`#${id} > [data-pet-view]`)?.shadowRoot;
      const box = shadow?.querySelector('.pet-view');
      return { view: box?.dataset.view, hidden: box?.hidden, sheet: getComputedStyle(shadow.querySelector('.cat-sheet')).position };
    }));
    check(`${label}: два контейнера — целиком и портретом, стили применены (диалог fixed)`, views[0].view === 'full' && views[1].view === 'portrait' && views.every((one) => one.hidden === false && one.sheet === 'fixed'), JSON.stringify(views));
    await page.locator('#done').click();
    await page.clock.runFor(100);
    const joy = await page.evaluate(() => document.querySelector('#main-pet > [data-pet-view]').shadowRoot.querySelector('.cat-art').dataset.pose);
    await page.locator('#main-pet .cat-view-btn').click();
    const locked = await page.evaluate(() => document.documentElement.classList.contains('locked'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.documentElement.classList.contains('locked'), null, { timeout: 3000 }).catch(() => {});
    check(`${label}: «Урок пройден» — радость; уголок — сайт блокирует прокрутку по onOpenChange, Esc — снимает`, joy === 'joy' && locked && !(await page.evaluate(() => document.documentElement.classList.contains('locked'))), JSON.stringify({ joy, locked }));
    await page.evaluate(() => window.demo.pet.core.setName('Пиксель'));
    await page.clock.runFor(6000);
    await page.locator('#again').click();
    await page.clock.runFor(500);
    const again = await page.evaluate(() => ({ mounted: window.demo.pet.mounted, name: window.demo.pet.core.getState().name.display, hosts: document.querySelectorAll('#main-pet > [data-pet-view]').length, small: window.demo.small.mounted }));
    check(`${label}: «Подключить заново» — новый вид с сохранёнными настройками (имя), один элемент в контейнере, второй вид не тронут`, again.mounted && again.name === 'Пиксель' && again.hosts === 1 && again.small, JSON.stringify(again));
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    check(`${label}: хранение — пространства mysite и mysite-small; внешних запросов и запросов вне проекта нет, ошибок нет`, keys.length > 0 && keys.every((key) => /^mysite(-small)?:/.test(key)) && external.length === 0 && server.outside.length === 0 && page.qaErrors.length === 0, JSON.stringify({ keys, external, outside: server.outside, errors: page.qaErrors }));
    await layout(page, label);
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
    await server.close();
  }
}

// Пример расширения в контейнере (PL07): examples/extension/container.html на установленном архиве — кролик своим набором,
// стили набора (styles) — в теневом дереве вида; страница CSS не подключает.
async function extensionView(browser, project) {
  const label = 'расширение в контейнере';
  const prefix = '/apps/ext-view/';
  const server = await serve(project, prefix);
  const { context, page, external } = await open(browser, server.origin, { viewport: { width: 1280, height: 900 } });
  const WEAK = 'Питомец: behaviors[1].phrases.byPet["example.bunny"]: питомца «example.bunny» нет в этом экземпляре — замены реплик не используются';
  try {
    await page.goto(`${server.origin}${prefix}extension/container.html`);
    await page.waitForFunction(() => Boolean(window.demoView?.core));
    await page.clock.runFor(2000);
    await page.locator('#bunny').click();
    await page.clock.runFor(100);
    const bunny = await page.evaluate(() => {
      const shadow = document.querySelector('#pet > [data-pet-view]').shadowRoot;
      const shut = shadow.querySelector('.pet-view .bunny-eyes-shut');
      return { shown: window.demoView.core.getState().pet.shown, art: Boolean(shadow.querySelector('.pet-view .bunny-art')), links: [...shadow.querySelectorAll('link')].map((link) => new URL(link.href).pathname), shut: shut ? getComputedStyle(shut).display : null };
    });
    check(`${label}: «Кролик» — рисунок набора в контейнере; bunny.css и стили пакета — в теневом дереве вида (адреса установленного архива)`, bunny.shown === 'example.bunny' && bunny.art && bunny.shut === 'none' && bunny.links.includes(`${prefix}extension/bunny.css`) && bunny.links.includes(`${prefix}node_modules/${NAME}/pet/web/view.css`), JSON.stringify(bunny));
    await page.clock.runFor(5000);
    await page.locator('#play').click();
    await page.clock.runFor(300);
    const play = await page.evaluate(() => {
      const sheet = document.querySelector('#pet > [data-pet-view]').shadowRoot.querySelector('.cat-sheet');
      return { open: sheet.open, art: Boolean(sheet.querySelector('.cat-play .bunny-art')), paw: Boolean(sheet.querySelector('[data-cat-play-paw], [data-play-hit="paw"]')) };
    });
    check(`${label}: «Поиграть» — кролик в диалоге вида, ни кнопки, ни области лапы`, play.open && play.art && !play.paw, JSON.stringify(play));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.demoView.core.getState().view.open === null, null, { timeout: 3000 }).catch(() => {});
    await page.locator('#without').click();
    await page.locator('#with').click();
    await page.clock.runFor(200);
    const errors = page.qaErrors.filter((text) => text !== WEAK);
    check(`${label}: «Без кролика» / «С кроликом» — снова кролик; внешних запросов и запросов вне проекта нет, ошибок нет (слабая ссылка — одно предупреждение)`, (await page.evaluate(() => window.demoView.core.getState().pet.shown)) === 'example.bunny' && external.length === 0 && server.outside.length === 0 && errors.length === 0 && page.qaErrors.length === 1, JSON.stringify({ external, outside: server.outside, errors: page.qaErrors }));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
    await server.close();
  }
}

// CSP-пример (PL07): examples/csp/ на установленном архиве под вложенным адресом, заголовок default-src 'self';
// style-src 'self' от сервера: нарушений нет, стили вида применены, уголок и «Поиграть» работают.
async function cspView(browser, project) {
  const label = 'строгий CSP на установленном архиве';
  const prefix = '/apps/strict/';
  const server = await serve(project, prefix, { csp: 'csp/' });
  const { context, page, external } = await open(browser, server.origin, { viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    window.qaViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => window.qaViolations.push(`${event.violatedDirective} ${event.blockedURI}`), true);
  });
  try {
    const response = await page.goto(`${server.origin}${prefix}csp/index.html`);
    await page.waitForFunction(() => Boolean(window.cspDemo?.core));
    // Приветствие дня доигрывает (отклик «Погладить» не важнее идущей реакции) — часы идут только по runFor.
    await page.clock.runFor(4000);
    await page.locator('#pet .cat-view-btn').click();
    await page.locator('#pet [data-cat-play]').click();
    await page.locator('#pet [data-cat-play-pet]').click();
    const result = await page.evaluate(() => {
      const shadow = document.querySelector('#pet > [data-pet-view]').shadowRoot;
      const sheet = shadow.querySelector('.cat-sheet');
      return { header: null, hint: sheet.querySelector('[data-cat-play-hint]').textContent, position: getComputedStyle(sheet).position, hit: getComputedStyle(sheet.querySelector('[data-play-hit="head"]')).left, violations: window.qaViolations };
    });
    result.header = response.headers()['content-security-policy'];
    check(`${label}: заголовок ${CSP}; вид, уголок и «Поиграть» — стили применены (диалог fixed, области CSSOM), «Погладить» — итог; нарушений нет`, result.header === CSP && result.hint === 'Марс мурлычет.' && result.position === 'fixed' && /px$/.test(result.hit) && result.violations.length === 0, JSON.stringify(result));
    check(`${label}: файлы — node_modules/${NAME}/pet/ под вложенным адресом (web.mjs, стили вида); внешних запросов и запросов вне проекта нет, ошибок нет`, ['web.mjs', 'pet.css', 'web/view.css'].every((file) => server.served.includes(`${prefix}node_modules/${NAME}/pet/${file}`)) && external.length === 0 && server.outside.length === 0 && page.qaErrors.length === 0, JSON.stringify({ external, outside: server.outside, errors: page.qaErrors }));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
    await server.close();
  }
}

// Сайт без сборщика по перечню (PL08): copy-pet.mjs (examples/manifest/copy.mjs) копирует из node_modules только файлы
// входа; сервер отдаёт только папку сайта под вложенным адресом. Браузер загружает ровно файлы перечня входа.
async function manifestSites(browser, project, manifest) {
  const copyEntry = async (dir, entry) => {
    const { stdout } = await run(process.execPath, ['copy-pet.mjs', path.join(dir, 'vendor', 'pet-companion'), entry], { cwd: project });
    for (const file of MANIFEST_SITE) await cp(path.join(root, 'examples', 'manifest', file), path.join(project, dir, file));
    return stdout.trim();
  };
  const copied = (dir) => files(path.join(project, dir, 'vendor', 'pet-companion'));
  const vendor = (prefix, server) => [...new Set(server.served.filter((url) => url.startsWith(`${prefix}vendor/pet-companion/`)).map((url) => url.slice(`${prefix}vendor/pet-companion/`.length)))].sort();
  const web = manifest.entries['./web'];
  const legacy = manifest.entries['.'];
  const told = await copyEntry('site', './web');
  check(`по перечню: copy-pet.mjs скопировал ровно файлы входа ./web (${web.files.length}) с той же структурой — «${told}»`, JSON.stringify(await copied('site')) === JSON.stringify(web.files) && told === `${NAME} ${VERSION}: ${web.files.length} файлов → ${path.join('site', 'vendor', 'pet-companion')}`, told);
  // Страница legacy подключает стили в порядке перечня (entries["."].styles).
  const legacyPage = await readFile(path.join(root, 'examples', 'manifest', 'legacy.html'), 'utf8');
  const order = [...legacyPage.matchAll(/href="\.\/vendor\/pet-companion\/([^"]+)"/g)].map(([, file]) => file);
  check('по перечню: legacy.html подключает стили входа «.» ссылками в порядке перечня (pet-base.css — по желанию, первым)', JSON.stringify(order) === JSON.stringify(legacy.styles.map((style) => style.file)) && legacy.styles[0].required === false, order.join(', '));
  for (const [label, options] of [
    ['1280×900', { viewport: { width: 1280, height: 900 } }],
    ['390×844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ]) {
    const prefix = '/sites/shop/';
    const server = await serve(path.join(project, 'site'), prefix, { csp: 'index.html' });
    const { context, page, external } = await open(browser, server.origin, options);
    await context.addInitScript(() => {
      window.qaViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => window.qaViolations.push(`${event.violatedDirective} ${event.blockedURI}`), true);
    });
    const touch = Boolean(options.hasTouch);
    const press = (selector) => (touch ? page.locator(selector).first().tap() : page.locator(selector).first().click());
    try {
      const response = await page.goto(`${server.origin}${prefix}index.html`);
      await page.waitForFunction(() => Boolean(window.manifestDemo?.core));
      await page.waitForFunction(() => document.querySelector('#pet > [data-pet-view]')?.shadowRoot?.querySelector('.pet-view')?.hidden === false, null, { timeout: 5000 }).catch(() => {});
      await page.clock.runFor(4000);
      const styled = await page.evaluate(() => {
        const shadow = document.querySelector('#pet > [data-pet-view]').shadowRoot;
        const box = shadow.querySelector('.pet-view');
        return { ready: !box.hidden, box: `${getComputedStyle(box).position} ${getComputedStyle(box).display}`, sheet: getComputedStyle(shadow.querySelector('.cat-sheet')).position, links: [...shadow.querySelectorAll('link')].map((link) => Boolean(link.sheet)) };
      });
      await press('#pet .cat-view-btn');
      const corner = await page.evaluate(() => document.querySelector('#pet > [data-pet-view]').shadowRoot.querySelector('.cat-sheet').open);
      await press('#pet [data-cat-play]');
      await press('#pet [data-cat-play-pet]');
      const hint = await page.evaluate(() => document.querySelector('#pet > [data-pet-view]').shadowRoot.querySelector('[data-cat-play-hint]').textContent);
      const loaded = vendor(prefix, server);
      const violations = await page.evaluate(() => window.qaViolations);
      check(`по перечню ${label}: сервер отдаёт только папку сайта под ${prefix}, CSP ${CSP} — браузер загрузил ровно файлы перечня ./web (${loaded.length}), без 404 и запросов мимо; стили в Shadow DOM применены (.pet-view absolute grid, .cat-sheet fixed); уголок и «Поиграть» — «Марс мурлычет.»`, response.headers()['content-security-policy'] === CSP && JSON.stringify(loaded) === JSON.stringify(web.files) && server.missing.length === 0 && server.outside.length === 0 && external.length === 0 && violations.length === 0 && styled.ready && styled.box === 'absolute grid' && styled.sheet === 'fixed' && styled.links.length === 4 && styled.links.every(Boolean) && corner && hint === 'Марс мурлычет.' && page.qaErrors.length === 0, JSON.stringify({ extra: loaded.filter((file) => !web.files.includes(file)), notLoaded: web.files.filter((file) => !loaded.includes(file)), missing: server.missing, outside: server.outside, violations, styled, corner, hint, errors: page.qaErrors }));
      await layout(page, `по перечню ${label}`);
    } catch (error) {
      check(`по перечню ${label}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
      await server.close();
    }
  }
  // Вход «.» (mountPet) по перечню.
  await copyEntry('site-legacy', '.');
  check(`по перечню: вход «.» — скопированы ровно его файлы (${legacy.files.length}, со стилями)`, JSON.stringify(await copied('site-legacy')) === JSON.stringify(legacy.files));
  {
    const prefix = '/sites/legacy/';
    const server = await serve(path.join(project, 'site-legacy'), prefix);
    const { context, page, external } = await open(browser, server.origin, { viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(`${server.origin}${prefix}legacy.html`);
      await page.locator('#head .cat-side-face:visible, #head .cat-face:visible').first().waitFor();
      await page.clock.runFor(3000);
      await page.locator('#head .cat-side-face:visible, #head .cat-face:visible').first().click();
      const sheet = await page.evaluate(() => ({ open: document.getElementById('cat-sheet').open, position: getComputedStyle(document.getElementById('cat-sheet')).position }));
      const loaded = vendor(prefix, server);
      check('по перечню 1280×900: mountPet — браузер загрузил ровно файлы перечня «.» (модули и стили), без 404 и запросов мимо; уголок открыт, стили применены', JSON.stringify(loaded) === JSON.stringify(legacy.files) && server.missing.length === 0 && server.outside.length === 0 && external.length === 0 && sheet.open && sheet.position === 'fixed' && page.qaErrors.length === 0, JSON.stringify({ extra: loaded.filter((file) => !legacy.files.includes(file)), notLoaded: legacy.files.filter((file) => !loaded.includes(file)), missing: server.missing, sheet, errors: page.qaErrors }));
    } catch (error) {
      check('по перечню mountPet: сценарий выполнен', false, `${error.stack}\n${JSON.stringify({ missing: server.missing, outside: server.outside, errors: page.qaErrors, refusals: page.qaRefusals })}`);
    } finally {
      await context.close();
      await server.close();
    }
  }
  // Контроли: перечень без файла — стиль вида (вид отключается) и модуль (граф не загружается); 404 видны.
  for (const [dir, lost] of [
    ['site-no-css', 'pet/web/view.css'],
    ['site-no-module', 'pet/web/pointer.mjs'],
  ]) {
    await copyEntry(dir, './web');
    await rm(path.join(project, dir, 'vendor', 'pet-companion', lost));
    const prefix = `/sites/${dir}/`;
    const server = await serve(path.join(project, dir), prefix);
    const { context, page } = await open(browser, server.origin, { viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(`${server.origin}${prefix}index.html`);
      await page.waitForFunction(() => window.manifestDemo === undefined || !window.manifestDemo.mounted, null, { timeout: 5000 }).catch(() => {});
      await page.clock.runFor(1000);
      const state = await page.evaluate(() => (window.manifestDemo ? { mounted: window.manifestDemo.mounted } : null));
      check(`контроль по перечню: без ${lost} — 404 этого файла и ${lost.endsWith('.css') ? 'отказ вида («стили не загрузились»)' : 'граф модулей не загрузился (питомца нет)'}`, server.missing.includes(`${prefix}vendor/pet-companion/${lost}`) && (lost.endsWith('.css') ? state?.mounted === false && page.qaErrors.some((text) => text.includes('стили не загрузились')) : state === null), JSON.stringify({ state, missing: server.missing, errors: page.qaErrors }));
    } finally {
      await context.close();
      await server.close();
    }
  }
}

const tmp = await mkdtemp(path.join(tmpdir(), `${NAME}-package-`));
let browser;
try {
  // Упаковка: состав, повтор — те же байты. PL12: PET_TARBALL — проверяется ровно этот архив выпуска (scripts/release.mjs
  // prepare), и свежая упаковка рабочего дерева должна дать то же содержимое.
  const given = process.env.PET_TARBALL ? await tarballInfo(path.resolve(process.env.PET_TARBALL)) : null;
  const first = given ?? (await pack(path.join(tmp, 'pack1')));
  const second = await pack(path.join(tmp, 'pack2'));
  const tarball = await readFile(first.path);
  const listed = first.files.map((item) => item.path).sort();
  check(`npm pack: ${first.filename} — ровно файлы пакета (${EXPECTED.length})`, JSON.stringify(listed) === JSON.stringify(EXPECTED), listed.join(', '));
  check('npm pack: ни проверок, ни фикстур, ни служебных файлов', listed.every((file) => !FORBIDDEN.test(file)), listed.filter((file) => FORBIDDEN.test(file)).join(', '));
  if (given) check(`архив выпуска ${first.filename} (PET_TARBALL) — то же содержимое, что упаковка рабочего дерева`, given.digest.filesSha256 === digest(await readFile(second.path)).filesSha256, `${given.digest.filesSha256} / ${digest(await readFile(second.path)).filesSha256}`);
  else check('npm pack: повторная упаковка — те же байты', first.integrity === second.integrity && sha256(tarball) === sha256(await readFile(second.path)), `${first.integrity} / ${second.integrity}`);
  console.log(`  ${first.filename}: ${tarball.length} байт, integrity ${first.integrity}, sha256 ${sha256(tarball)}`);

  // Архив как есть: системный tar.
  const unpacked = path.join(tmp, 'site');
  await mkdir(unpacked);
  await run('tar', ['-xzf', first.path, '-C', unpacked]);
  const inside = await files(path.join(unpacked, 'package'));
  check('архив: распакован системным tar — папка package/ с теми же файлами', JSON.stringify(inside) === JSON.stringify(EXPECTED) && (await readdir(unpacked)).join() === 'package', inside.join(', '));
  const same = await Promise.all(RUNTIME.map(async (file) => sha256(await readFile(path.join(unpacked, 'package', 'pet', file))) === sha256(await readFile(path.join(root, 'pet', file)))));
  check('архив: pet/ — байт в байт файлы репозитория', same.every(Boolean));
  // Граф импортов из архива: каждый относительный импорт — файл архива внутри pet/; ядро (core/**) — только core/**;
  // штатные определения (defs/**) и их входы (pets.mjs, behaviors.mjs) — только defs/** и core/** (без браузера).
  const graph = [];
  const defsSide = (file) => file.startsWith('defs/') || file === 'pets.mjs' || file === 'behaviors.mjs';
  for (const file of RUNTIME.filter((name) => name.endsWith('.mjs'))) {
    const source = await readFile(path.join(unpacked, 'package', 'pet', file), 'utf8');
    for (const [, from, bare] of source.matchAll(/^(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|^import\s*['"]([^'"]+)['"]/gm)) {
      // Голое имя — только партнёр в своём файле (PL08 — react, PL09 — react-native и expo-sqlite).
      const spec = from ?? bare;
      if (!spec.startsWith('./') && !spec.startsWith('../')) {
        if (!Object.hasOwn(PEER_FILES, spec) || !PEER_FILES[spec](file)) graph.push(`${file} → ${spec}`);
        continue;
      }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      const coreOnly = file.startsWith('core/') || file === 'core.mjs' || file.startsWith('storage/');
      const nativeLayer = file.startsWith('native/') && !(NATIVE_LOCAL[file] ?? []).some((area) => (area.endsWith('/') ? target.startsWith(area) : target === area));
      if (!RUNTIME.includes(target) || nativeLayer || (coreOnly && !target.startsWith('core/')) || (defsSide(file) && !target.startsWith('core/') && !target.startsWith('defs/'))) graph.push(`${file} → ${spec}`);
    }
  }
  check('архив: импорты — файлы архива внутри pet/; голое имя react — только у pet/react.mjs, pet/hooks/**, pet/native.mjs и отображения натива, react-native — у pet/native.mjs и pet/native/view.mjs, react-native-svg — у отображения и рисунков натива, expo-sqlite — у pet/native-sqlite.mjs (PL08–PL10.1); вход ядра core.mjs, ядро core/** и SQLite storage/** импортируют только core/**, слои pet/native/** — только свои области; определения defs/** и входы pets.mjs, behaviors.mjs — только defs/** и core/**', graph.length === 0, graph.join(', '));

  // Перечень (PL08): в архиве, публичным путём; совпадает с собранным по графу самого архива; файлы — в архиве, внутри
  // пакета, без повторов; версия — пакета; каждый файл исполнения pet/ архива — в перечне хотя бы одного входа.
  const shipped = JSON.parse(await readFile(path.join(unpacked, 'package', 'manifest.json'), 'utf8'));
  const rebuilt = await buildManifest(path.join(unpacked, 'package')).catch((error) => ({ error: error.message }));
  const problems = await manifestProblems(shipped, path.join(unpacked, 'package'));
  const listedFiles = new Set(Object.values(shipped.entries).flatMap((own) => own.files));
  const runtimeFiles = inside.filter((file) => /^pet\/.+\.(mjs|css)$/.test(file));
  check(`архив: manifest.json — версия ${VERSION}, входы ${Object.keys(shipped.entries).join(' ')}; совпадает с собранным по графу архива; ${listedFiles.size} файлов — все в архиве, без повторов и путей за пределы пакета; все файлы исполнения pet/ перечислены, типов и документов нет`, shipped.version === VERSION && JSON.stringify(rebuilt) === JSON.stringify(shipped) && problems.length === 0 && JSON.stringify([...listedFiles].sort()) === JSON.stringify(runtimeFiles), JSON.stringify({ problems, rebuilt: rebuilt.error ?? 'ok' }));

  // Чистый проект: установка архива без сети.
  const project = path.join(tmp, 'project');
  await mkdir(project);
  await writeFile(path.join(project, 'package.json'), `${JSON.stringify({ name: 'site', private: true, type: 'module' }, null, 2)}\n`);
  await run('npm', ['install', first.path, '--offline', '--no-audit', '--no-fund'], { cwd: project });
  const installed = JSON.parse(await readFile(path.join(project, 'node_modules', NAME, 'package.json'), 'utf8'));
  const deps = (await readdir(path.join(project, 'node_modules'))).filter((name) => !name.startsWith('.'));
  check(`установка: ${NAME}@${VERSION} в чистый проект без сети; других пакетов нет`, installed.version === VERSION && JSON.stringify(deps) === JSON.stringify([NAME]), deps.join(', '));

  // Node: входы пакета.
  const probe = `
    const pet = await import('${NAME}');
    const core = await import('${NAME}/core');
    const pets = await import('${NAME}/pets');
    const behaviors = await import('${NAME}/behaviors');
    const web = await import('${NAME}/web');
    const resolve = (spec) => { try { return import.meta.resolve(spec); } catch (error) { return error.code; } };
    const closed = await import('${NAME}/pet/pet-rules.mjs').then(() => 'open', (error) => error.code);
    const shut = ['missing.css', 'pet/pet.css', 'pet/css.d.mts', 'pet/core.mjs', 'pet/core.d.mts', 'pet/core/index.mjs', 'pet/core/facade.mjs', 'pet/core/version.mjs', 'pet/core/storage.mjs', 'pet/core/session.mjs', 'pet/core/scenes.mjs', 'pet/core/presence.mjs', 'pet/core/room.mjs', 'pet/core/play.mjs', 'pet/core/editor.mjs', 'pet/core/toys.mjs', 'pet/core/figure.mjs', 'pet/core/define.mjs', 'pet/core/catalog.mjs', 'pet/pets.mjs', 'pet/behaviors.mjs', 'pet/defs/cat.mjs', 'pet/defs/calm.mjs', 'pet/web/kits.mjs', 'pet/web/storage.mjs', 'pet/web/scenes.mjs', 'pet/web.mjs', 'pet/web.d.mts', 'pet/web/view.mjs', 'pet/web/shell.mjs', 'pet/web/pointer.mjs', 'pet/web/legacy/places.mjs', 'pet/web/view.css', 'web/view.mjs', 'view.css', 'core/index.mjs', 'defs', 'defs/cat', 'kits', 'pet/react.mjs', 'pet/react.d.mts', 'pet/hooks/state.mjs', 'hooks', 'hooks/state.mjs', 'pet/native.mjs', 'pet/native.d.mts', 'pet/native-sqlite.mjs', 'pet/native/lifecycle.mjs', 'pet/storage/sqlite.mjs', 'native/lifecycle.mjs', 'storage/sqlite.mjs', 'storage', 'pet/native/view.mjs', 'pet/native/cat.mjs', 'native/view.mjs', 'native/kits.mjs', 'pet/native/corner.mjs', 'pet/native/provider.mjs', 'native/room.mjs', 'pet/native/play.mjs', 'pet/native/gesture.mjs', 'native/play.mjs', 'native/gesture.mjs'].map((name) => resolve('${NAME}/' + name));
    const react = await import('${NAME}/react').then(() => 'imported', (error) => ({ code: error.code, message: error.message }));
    const failure = (error) => ({ code: error.code, message: error.message });
    const native = { at: resolve('${NAME}/native').replace(/^.*node_modules\\//, ''), sqliteAt: resolve('${NAME}/native-sqlite').replace(/^.*node_modules\\//, ''), lifecycle: await import('${NAME}/native').then(() => 'imported', failure), sqlite: await import('${NAME}/native-sqlite').then(() => 'imported', failure) };
    console.log(JSON.stringify({ webKeys: Object.keys(web).sort(), webAt: resolve('${NAME}/web').replace(/^.*node_modules\\//, ''), keys: Object.keys(pet).sort(), coreKeys: Object.keys(core).sort(), petsKeys: Object.keys(pets).sort(), behaviorsKeys: Object.keys(behaviors).sort(), petsAt: resolve('${NAME}/pets').replace(/^.*node_modules\\//, ''), behaviorsAt: resolve('${NAME}/behaviors').replace(/^.*node_modules\\//, ''), frozen: Object.isFrozen(pets.cat) && Object.isFrozen(pets.cat.room) && Object.isFrozen(behaviors.calm.reactions.joy), ids: [pets.cat.id, pets.dog.id, behaviors.calm.id], coreAt: resolve('${NAME}/core').replace(/^.*node_modules\\//, ''), sameDay: core.localDay === pet.localDay, sameVersion: core.VERSION === pet.VERSION, version: pet.VERSION, day: pet.localDay(new Date(2026, 9, 12, 23, 59)), css: ['pet.css', 'dog.css', 'pet-base.css'].map((name) => resolve('${NAME}/' + name).replace(/^.*node_modules\\//, '')), closed, shut, own: resolve('${NAME}/package.json').endsWith('package.json'), manifestAt: resolve('${NAME}/manifest.json').replace(/^.*node_modules\\//, ''), reactAt: resolve('${NAME}/react').replace(/^.*node_modules\\//, ''), react, native }));`;
  const { stdout } = await run(process.execPath, ['--input-type=module', '-e', probe], { cwd: project });
  const node = JSON.parse(stdout);
  check('Node: вход — mountPet, localDay, VERSION; версия пакета', JSON.stringify(node.keys) === '["VERSION","localDay","mountPet"]' && node.version === VERSION && node.day === '2026-10-12', stdout);
  check('Node: вход ядра pet-companion/core — ровно createPetCore, createStorage, defineBehavior, definePet (PL06), PetError, localDay, VERSION из pet/core.mjs; та же граница дня и версия', JSON.stringify(node.coreKeys) === '["PetError","VERSION","createPetCore","createStorage","defineBehavior","definePet","localDay"]' && node.coreAt === `${NAME}/pet/core.mjs` && node.sameDay && node.sameVersion, stdout);
  check('Node: входы pet-companion/pets (cat, dog, corner, cornerItems) и pet-companion/behaviors (calm) — pet/pets.mjs и pet/behaviors.mjs; определения глубоко заморожены', JSON.stringify(node.petsKeys) === '["cat","corner","cornerItems","dog"]' && JSON.stringify(node.behaviorsKeys) === '["calm"]' && node.petsAt === `${NAME}/pet/pets.mjs` && node.behaviorsAt === `${NAME}/pet/behaviors.mjs` && node.frozen && node.ids.join() === 'cat,dog,calm', stdout);
  check('Node: стили по exports — pet.css, dog.css, pet-base.css; внутренние модули закрыты', JSON.stringify(node.css) === JSON.stringify(['pet.css', 'dog.css', 'pet-base.css'].map((name) => `${NAME}/pet/${name}`)) && node.closed === 'ERR_PACKAGE_PATH_NOT_EXPORTED' && node.own, stdout);
  check('Node: несуществующий стиль, стиль и декларация по внутреннему пути, файл входа ядра и файлы ядра по внутренним путям (фасад, версия, экземпляр, сессия, хранение, сценки, присутствие, комната, игра, редактор, удалённый figure, define, catalog), файлы входов штатных и определений (pets.mjs, behaviors.mjs, defs/*), файлы входа веба и внутренние веба (web.mjs, web.d.mts, view, shell, pointer, места legacy, стиль вида view.css), веб-адаптеры и наборы, файлы React по внутренним путям (pet/react.mjs, типы, хук), файлы натива по внутренним путям (pet/native.mjs, типы, pet/native-sqlite.mjs, жизненный цикл, SQLite-адаптер; PL10.1 — отображение и наборы; PL10.2.1 — уголок, координатор, общий уголок; PL10.2.2 — игра и распознавание жестов), несуществующие входы (defs, kits, hooks, storage) — ERR_PACKAGE_PATH_NOT_EXPORTED', node.shut.length === 63 && node.shut.every((code) => code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'), stdout);
  check('Node без мобильных партнёров (PL09): pet-companion/native и /native-sqlite разрешаются в pet/native.mjs и pet/native-sqlite.mjs, импорт честно отказывает — нет react (необязательный партнёр /native, за ним react-native) и expo-sqlite; прежние входы выше работают', node.native?.at === `${NAME}/pet/native.mjs` && node.native.sqliteAt === `${NAME}/pet/native-sqlite.mjs` && node.native.lifecycle?.code === 'ERR_MODULE_NOT_FOUND' && /'react'/.test(node.native.lifecycle.message) && node.native.sqlite?.code === 'ERR_MODULE_NOT_FOUND' && /'expo-sqlite'/.test(node.native.sqlite.message), stdout);
  check('Node без React (PL08): pet-companion/manifest.json — публичный путь к manifest.json; pet-companion/react разрешается в pet/react.mjs, а импорт честно отказывает — нет пакета react (необязательный партнёр); остальные входы выше работают', node.manifestAt === `${NAME}/manifest.json` && node.reactAt === `${NAME}/pet/react.mjs` && node.react?.code === 'ERR_MODULE_NOT_FOUND' && /'react'/.test(node.react.message), stdout);
  check('Node: вход pet-companion/web (PL07) — ровно catWeb, createWebScenes, createWebStorage, dogWeb, mountPetIn из pet/web.mjs', JSON.stringify(node.webKeys) === '["catWeb","createWebScenes","createWebStorage","dogWeb","mountPetIn"]' && node.webAt === `${NAME}/pet/web.mjs`, stdout);

  // Импорт без браузера (безопасность серверного рендера без React): оба входа загружаются, не трогая браузерные глобалы
  // (ловушки бросают); mountPet вне браузера — отказ без исключения (console.error), pet.core — null.
  const ssr = `
    const names = ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'matchMedia', 'requestAnimationFrame', 'HTMLElement', 'customElements', 'location'];
    for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error('обращение к ' + name + ' при импорте'); } });
    const core = await import('${NAME}/core');
    const legacy = await import('${NAME}');
    const pets = await import('${NAME}/pets');
    const behaviors = await import('${NAME}/behaviors');
    const web = await import('${NAME}/web');
    for (const name of names) delete globalThis[name];
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.map(String).join(' '));
    let pet;
    let view;
    try {
      pet = legacy.mountPet({ places: { logo: () => {}, top: () => {} } });
      view = web.mountPetIn({}, { namespace: 'ssr' });
    } finally { console.error = original; }
    console.log(JSON.stringify({ core: Object.keys(core).length, legacy: Object.keys(legacy).length, defs: Object.keys(pets).length + Object.keys(behaviors).length, web: Object.keys(web).length, mounted: pet.mounted, petCore: pet.core, state: pet.getState(), command: pet.setName('x').error?.code, view: { mounted: view.mounted, core: view.core, open: view.open().error?.code }, errors }));`;
  const server = await run(process.execPath, ['--input-type=module', '-e', ssr], { cwd: project }).then(({ stdout }) => JSON.parse(stdout), (error) => ({ failed: error.stderr || error.message }));
  check('Node без браузера: импорт pet-companion, pet-companion/core, /pets, /behaviors и /web не трогает браузерные глобалы; mountPet и mountPetIn — отказ без исключения (по одному сообщению), core и снимок null, команды — destroyed', server.core === 7 && server.legacy === 3 && server.defs === 5 && server.web === 5 && server.mounted === false && server.petCore === null && server.state === null && server.command === 'destroyed' && server.view?.mounted === false && server.view.core === null && server.view.open === 'destroyed' && server.errors.length === 2 && server.errors[0].includes('mountPet подключается только в браузере') && server.errors[1].includes('mountPetIn подключается только в браузере'), JSON.stringify(server));

  // Внешний пример — только публичный вход pet-companion/core установленного архива.
  await cp(path.join(root, 'examples', 'core-node.mjs'), path.join(project, 'core-node.mjs'));
  const example = await run(process.execPath, ['core-node.mjs'], { cwd: project }).then(({ stdout }) => JSON.parse(stdout.trim().split('\n').at(-1)), (error) => ({ failed: error.stderr || error.message }));
  check('Node: внешний пример examples/core-node.mjs на установленном архиве — хранилище, порты, имя, событие, кормление, питомец, облик, отказ записи, виды, жест, комната, присутствие, снимок, destroy, новое ядро, асинхронное хранилище и done после destroy', example.ok === true && example.version === VERSION && example.stored?.every((key) => key.startsWith('demo:')), JSON.stringify(example));
  // Пример расширения (PL06) — только публичные входы установленного архива: кролик и живая модель.
  await mkdir(path.join(project, 'extension'));
  for (const file of EXTENSION) await cp(path.join(root, 'examples', 'extension', file), path.join(project, 'extension', file));
  const extensionNode = await run(process.execPath, [path.join('extension', 'node.mjs')], { cwd: project }).then(({ stdout }) => JSON.parse(stdout.trim().split('\n').at(-1)), (error) => ({ failed: error.stderr || error.message }));
  check('Node: внешний пример расширения examples/extension/node.mjs на установленном архиве — кролик и живая модель через definePet/defineBehavior, ext:v1, лапы нет, лимит модели, сценка hop, запасной показ без определения, ошибочные ссылки отклонены', extensionNode.ok === true && extensionNode.pets?.join() === 'cat,dog,example.bunny' && extensionNode.ext?.pet?.id === 'example.bunny' && extensionNode.ext?.behavior === 'example.lively' && extensionNode.stored?.every((key) => key.startsWith('demo-ext:')) && extensionNode.warnings === 1, JSON.stringify(extensionNode));
  // PL09, PL10.1: логика мобильного примера (examples/expo/diagnostics.mjs) на установленном архиве; expo-sqlite — замена
  // загрузчиком (тестовый драйвер node:sqlite, та же сигнатура openDatabaseAsync), четыре процесса подряд с одним файлом:
  // первый — занятие хоста (запись, затем notify), кормление, собака, имя и облик, резервирование, занятый файл, новое
  // ядро после load; второй — тот же день: восстановление подтверждённого (питомец, имя, облик, лакомство дня и счёт
  // хоста), повтор кормления — отказ ядра, сдвиг дня хоста — новое ядро ждёт занятия; третий — следующий день, сдвиг
  // сохранён: подтверждённое первого дня восстановлено, лакомство нового дня (waiting) не сверяется (доработка PL10.1),
  // затем занятие этого дня — запись подтверждённого; четвёртый — тот же следующий день: сверено целиком, ready. Не
  // устройство: React Native, Metro и настоящий expo-sqlite здесь не участвуют.
  await mkdir(path.join(project, 'expo', 'fake'), { recursive: true });
  await cp(path.join(root, 'examples', 'expo', 'diagnostics.mjs'), path.join(project, 'expo', 'diagnostics.mjs'));
  for (const file of ['sqlite-driver.mjs', 'sqlite-worker.mjs']) await cp(path.join(root, 'test', file), path.join(project, 'expo', 'fake', file));
  await writeFile(
    path.join(project, 'expo', 'fake', 'expo-sqlite.mjs'),
    `import { lab } from './sqlite-driver.mjs';
const L = await lab({ prefix: 'pet-expo-fake-' });
const shared = new Map();
export async function openDatabaseAsync(name, options = {}, directory = process.env.PET_EXPO_DIR) {
  const path = directory.replace(/\\/*$/, '') + '/' + name.replace(/^\\/+/, '');
  if (options.useNewConnection === true) return L.open(path);
  if (!shared.has(path)) shared.set(path, L.other(path));
  return shared.get(path);
}
`,
  );
  await writeFile(
    path.join(project, 'expo', 'run.mjs'),
    `import { registerHooks } from 'node:module';
registerHooks({ resolve: (specifier, context, next) => (specifier === 'expo-sqlite' ? { url: new URL('./fake/expo-sqlite.mjs', import.meta.url).href, shortCircuit: true } : next(specifier, context)) });
const D = await import('./diagnostics.mjs');
const mode = process.argv[2];
const store = await D.openStore();
const made = await D.newCore(store);
const core = made.core;
core.start();
const out = { mode, status: made.status, restart: D.restartCheck(store.expected, core.getState(), store.host.today()), shift: store.host.shift, today: store.host.progress().today, treat: core.getState().treat };
// Подтверждённое — когда записи ключей дошли (start пишет день приветствия).
const settled = async () => {
  for (let i = 0; i < 100 && !D.confirmed(core.getState(), store.host.today()); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  return D.confirmed(core.getState(), store.host.today());
};
if (mode === 'first') {
  await store.host.save('k1');
  out.reacted = core.notify('saved', { key: 'k1', counted: true }).reacted;
  out.fed = await core.feed().save.done;
  out.pet = await core.setPet('dog').save.done;
  out.saved = await core.setName('Пиксель').save.done;
  out.coat = await core.setAppearance({ coat: 'spotted' }).save.done;
  out.kept = await settled();
  await D.remember(store.db, out.kept);
  out.reserve = await D.reserveProbe(store.scenes, '2026-10-16');
  const busy = await D.busyProbe(store.db, core, 'Дымок');
  out.busy = { ok: busy.ok, done: busy.done, slow: busy.ms >= 900 };
  core.destroy();
  const fresh = await D.newCore(store);
  out.renewed = { status: fresh.status, name: fresh.core.getState().name.display, unsaved: fresh.core.getState().save.cat.unsaved };
} else if (mode === 'second') {
  out.reserve = await D.reserveProbe(store.scenes, '2026-10-16');
  out.again = core.feed().error?.code;
  core.destroy();
  out.shifted = await store.host.shiftDay(1);
  const next = await D.newCore(store);
  next.core.start();
  out.next = { treat: next.core.getState().treat, today: next.core.getState().progress.today, pet: next.core.getState().pet.shown };
} else if (mode === 'third') {
  await store.host.save('k2');
  out.reacted = core.notify('saved', { key: 'k2', counted: true }).reacted;
  out.kept = await settled();
  await D.remember(store.db, out.kept);
}
console.log(JSON.stringify(out));
process.exit(0);
`,
  );
  const expoDir = await mkdtemp(path.join(tmpdir(), `${NAME}-expo-`));
  const expo = async (mode) => run(process.execPath, [path.join('expo', 'run.mjs'), mode], { cwd: project, env: { ...process.env, PET_EXPO_DIR: expoDir } }).then(({ stdout }) => JSON.parse(stdout.trim().split('\n').at(-1)), (error) => ({ failed: error.stderr || error.message }));
  const firstRun = await expo('first');
  const secondRun = await expo('second');
  const thirdRun = await expo('third');
  const fourthRun = await expo('fourth');
  const skipped = (run) => /; лакомство не сверяется/.test(run.restart?.text ?? '');
  check(
    'Node: логика мобильного примера examples/expo/diagnostics.mjs на установленном архиве (expo-sqlite — замена на node:sqlite): занятие хоста — запись, затем notify и реакция; кормление, собака, имя и облик — saved, подтверждённое — с днём хоста; резервирование дня — shown, затем skip; занятый файл — failed после ожидания; новое ядро после load — подтверждённое; второй процесс (тот же день) — «восстановлено» вместе с лакомством (собака, Пиксель, облик, fed, счёт хоста), повтор кормления — treat-fed, сдвиг дня — новое ядро ждёт занятия; третий (следующий день, сдвиг сохранён) — «восстановлено», лакомство нового дня (waiting) не сверяется, занятие — ready записано; четвёртый (тот же следующий день) — сверено целиком',
    firstRun.status === 'ready' && firstRun.restart?.ok === null && firstRun.treat === 'waiting' && firstRun.reacted === true && firstRun.fed === 'saved' && firstRun.pet === 'saved' && firstRun.saved === 'saved' && firstRun.coat === 'saved' &&
      firstRun.kept?.v === 3 && /^\d{4}-\d\d-\d\d$/.test(firstRun.kept.day) && firstRun.kept.pet === 'dog' && firstRun.kept.name === 'Пиксель' && firstRun.kept.coat === 'spotted' && firstRun.kept.treat === 'fed' && firstRun.reserve?.ok && firstRun.reserve.first === 'shown' && firstRun.busy?.ok && firstRun.busy.slow &&
      firstRun.renewed?.status === 'ready' && firstRun.renewed.name === 'Пиксель' && secondRun.restart?.ok === true && !skipped(secondRun) && secondRun.today === 1 && secondRun.treat === 'fed' && secondRun.reserve?.first === 'skip' && secondRun.reserve.ok && secondRun.again === 'treat-fed' &&
      secondRun.shifted === 1 && secondRun.next?.treat === 'waiting' && secondRun.next.today === 0 && secondRun.next.pet === 'dog' && thirdRun.shift === 1 && thirdRun.today === 0 && thirdRun.treat === 'waiting' &&
      thirdRun.restart?.ok === true && skipped(thirdRun) && thirdRun.reacted === true && thirdRun.kept?.treat === 'ready' && thirdRun.kept.day !== firstRun.kept.day && thirdRun.kept.name === 'Пиксель' &&
      fourthRun.restart?.ok === true && !skipped(fourthRun) && fourthRun.shift === 1 && fourthRun.today === 1 && fourthRun.treat === 'ready',
    JSON.stringify({ firstRun, secondRun, thirdRun, fourthRun }),
  );
  await rm(expoDir, { recursive: true, force: true });

  // TypeScript: полное подключение, как в README, — вход и три стиля. У проекта нет общих деклараций CSS (declare module
  // '*.css', vite/client): стили находит сам пакет, иначе noUncheckedSideEffectImports даёт TS2307.
  await writeFile(
    path.join(project, 'site.mts'),
    `import { localDay, mountPet, VERSION, type Pet, type PetOptions } from '${NAME}';
import { calm } from '${NAME}/behaviors';
import { cat, dog } from '${NAME}/pets';
import '${NAME}/pet-base.css';
import '${NAME}/pet.css';
import '${NAME}/dog.css';
const head = document.createElement('header');
const options: PetOptions = { storage: 'site', places: { logo: (el) => head.append(el), top: (el) => head.prepend(el) }, progress: () => ({ marks: 1, today: 0, limit: 3 }), step: () => null, zone: (device, id) => (device === 'phone' && id === 'top' ? { left: 0, top: 0, width: 10, height: 10 } : null) };
const pet: Pet = mountPet(options);
const own: Pet = mountPet({ ...options, pets: [cat, dog], behaviors: [calm], kits: [] });
own.setBehavior('calm');
pet.update();
pet.update({ focus: true, timer: false });
pet.notify('saved', { key: 'a', counted: true, first: localDay() === '2026-10-12' });
pet.notify('saved', null);
pet.notify('failed');
pet.open('play');
pet.close({ restore: false });
const version: string = VERSION + pet.version;
const flags: boolean = pet.mounted && pet.opened;
pet.destroy();
// @ts-expect-error logo обязателен
mountPet({ places: { top: () => {} } });
// @ts-expect-error вид окна — corner или play
pet.open('room');
// @ts-expect-error событие — saved или failed
pet.notify('done');
// @ts-expect-error saved без key
pet.notify('saved', { counted: true });
export { version, flags };
`,
  );
  // Ядро (PL05): точные результаты, отчёт сохранения, снимок, эффекты и подписка; legacy pet.core и команды pet.*; неверные
  // ID, аргументы жестов и комнаты, событие без key, внутренние входы и признаки, запись в снимок, входы отображения у
  // legacy — ошибки компилятора (каждая строка @ts-expect-error должна действительно ошибаться).
  await writeFile(
    path.join(project, 'core.mts'),
    `import { createPetCore, createStorage, localDay, PetError, VERSION, type PetAsyncStorage, type PetCore, type PetErrorKind, type PetResult, type PetSaveReport, type PetSnapshot, type PetSyncStorage, type PetUpdate } from '${NAME}/core';
import { mountPet, type Pet } from '${NAME}';
import { calm } from '${NAME}/behaviors';
import { cat, dog } from '${NAME}/pets';
import type { PetId } from '${NAME}/core';
const map = new Map<string, string>();
const storage: PetSyncStorage = createStorage({ namespace: 'site', backend: { get: (name) => map.get(name) ?? null, set: (name, text) => void map.set(name, text) } });
const loaded: 'ready' | 'failed' = storage.load();
const remote: PetAsyncStorage = createStorage({ backend: { async: true, get: async (name) => map.get(name) ?? null, set: async (name, text) => void map.set(name, text) } });
const later: Promise<'ready' | 'failed'> = remote.load();
const pet: PetCore = createPetCore({ storage, pets: [cat, dog], behaviors: [calm], progress: () => ({ marks: 1, today: 1, limit: 3 }), clock: { now: () => 0, day: () => localDay(), nextDay: (at) => at + 1 }, random: () => 0.5, scheduler: { later: () => () => {} }, log: { warn: () => {} }, scenes: null });
const started = pet.start();
let code: PetErrorKind | '' = '';
if (started.ok) {
  const report: PetSaveReport = started.save;
  if (report.status === 'pending') report.done.then((total: 'saved' | 'failed' | 'partial') => total);
} else code = started.error.code;
const saved = pet.notify('saved', { key: 'a', counted: true });
const celebrate: number | null = saved.ok ? saved.celebrate : null;
const duplicate: boolean = saved.ok && saved.duplicate && saved.reacted;
const seen: readonly string[] = saved.ok ? saved.fresh : [];
pet.notify('saved', null);
const failed = pet.notify('failed');
const reacted: boolean = failed.ok ? failed.reacted : false;
const named = pet.setName('Барсик');
const namedReacted: boolean = named.ok && named.reacted;
pet.setPet('dog');
pet.setAppearance({ coat: 'ginger', accessory: 'plaid' });
pet.setPreferences({ motion: 'calm', phrases: false });
pet.feed();
pet.setPresence('on-call');
pet.hide();
pet.show();
pet.setContext({ timer: true, typing: false });
pet.setVisible(true);
pet.setReducedMotion(false);
pet.activity();
pet.setDisplay({ views: ['corner', 'play', 'room'], playFloor: [0, 0, 10, 10], playTouch: 2, scenes: { cat: ['stretch'] }, pets: ['cat'], full: true, moving: false });
const opened = pet.open('play', { source: 'call' });
const fresh: readonly string[] = opened.ok ? opened.fresh : [];
const played = pet.interact({ type: 'bowl', to: [1, 2] });
const outcome = played.ok ? played.outcome : null;
const gesture = pet.stroke.start();
let told = false;
if (gesture.ok) {
  const step = pet.stroke.step(gesture.id);
  told = step.ok && step.announced;
  pet.stroke.end(gesture.id);
  pet.stroke.cancel(gesture.id);
}
pet.toy.drag('ball', [1, 2]);
const dropped = pet.toy.drop({ roll: 3 });
pet.toy.cancel();
pet.room.select('bowl');
pet.room.move('bowl', [1, 2]);
pet.room.drag('bowl', [3, 4]);
pet.room.drop();
pet.room.dragCancel();
pet.room.nudge('left');
pet.room.reset();
const roomSaved = pet.room.save();
const closed: boolean = roomSaved.ok && roomSaved.closed;
pet.room.cancel();
pet.close();
const snap: PetSnapshot = pet.getState();
const kind: PetId = snap.pet.shown;
const view: null | 'corner' | 'play' | 'room' = snap.view.open;
const off: () => void = pet.subscribe((update: PetUpdate) => {
  for (const effect of update.effects) if (effect.type === 'announce') console.log(effect.text);
}, { initial: false });
off();
pet.destroy();
const status: 'created' | 'running' | 'destroyed' = pet.status;
const version: string = VERSION + pet.version;
const legacy: Pet = mountPet({ places: { logo: () => {}, top: () => {} } });
const core: PetCore | null = legacy.core;
const legacyName: PetResult<{ readonly reacted: boolean }> = legacy.setName('Пух');
const nothing: void = legacy.notify('saved', { key: '' });
const state: PetSnapshot | null = legacy.getState();
legacy.room.save();
try {
  // @ts-expect-error без определений — ошибка компилятора и invalid-options
  createPetCore({ storage });
} catch (error) {
  if (error instanceof PetError) code = error.code === 'invalid-options' ? 'internal' : '';
}
// @ts-expect-error неизвестный питомец
pet.setPet('fox');
// @ts-expect-error облик — строка
pet.setAppearance({ coat: 5 });
// @ts-expect-error событие — saved или failed
pet.notify('done');
// @ts-expect-error saved без key
pet.notify('saved', { counted: true });
// @ts-expect-error failed без подробностей
pet.notify('failed', { key: 'a' });
// @ts-expect-error признак scene — не параметр
pet.notify('saved', { key: 'a' }, { scene: false });
// @ts-expect-error признак выбора имени — не параметр
pet.setName('Пух', { pick: true });
// @ts-expect-error вида garden нет
pet.open('garden');
// @ts-expect-error источник — pet или call
pet.open('play', { source: 'tab' });
// @ts-expect-error точка — два числа
pet.room.move('bowl', [1]);
// @ts-expect-error направление
pet.room.nudge('north');
// @ts-expect-error id жеста — число
pet.stroke.step('1');
// @ts-expect-error предмета chair нет
pet.toy.drag('chair', [1, 2]);
// @ts-expect-error действия jump нет
pet.interact({ type: 'jump' });
// @ts-expect-error модели поведения обязательны (PL06)
createPetCore({ storage, pets: [cat] });
// @ts-expect-error внутренний вход legacy-отображения
pet.setPlace({});
// @ts-expect-error внутренний вход legacy-отображения
pet.arrive();
// @ts-expect-error внутренний вход legacy-отображения
pet.stopScene();
// @ts-expect-error снимок только для чтения
snap.name.value = 'x';
// @ts-expect-error у legacy-подключения входов отображения нет
legacy.setDisplay({ full: true });
// @ts-expect-error legacy open — corner или play
legacy.open('room');
// @ts-expect-error legacy notify ничего не возвращает
const wrong: PetResult = legacy.notify('failed');
// @ts-expect-error хранилище без get
createStorage({ backend: { set: () => {} } });
// @ts-expect-error подключение создаёт само ядро
storage.connect();
export { loaded, later, celebrate, duplicate, seen, told, reacted, namedReacted, fresh, outcome, dropped, closed, kind, view, status, version, core, legacyName, nothing, state, code, wrong };
`,
  );
  // Ядро без DOM: тот же вход компилируется с lib es2022 без dom (Node, серверный код).
  await writeFile(
    path.join(project, 'core-only.mts'),
    `import { createPetCore, createStorage, type PetSnapshot } from '${NAME}/core';
import { calm } from '${NAME}/behaviors';
import { cat, dog } from '${NAME}/pets';
const storage = createStorage({ backend: { get: () => null, set: () => {} } });
storage.load();
const snapshot: PetSnapshot = createPetCore({ storage, pets: [cat, dog], behaviors: [calm] }).getState();
export { snapshot };
`,
  );
  // Определения (PL06): своё определение из штатного (spread) и своя модель, регистрация, setPet/setBehavior с ID расширения,
  // снимок pet/behavior/pets, PetError.path; неверный формат, ID без точки, запасной не штатный, лапа, порядок и skip сценок,
  // поза реакции не из словаря, регистрация без моделей, неверные ID команд — ошибки компилятора (10 @ts-expect-error).
  await writeFile(
    path.join(project, 'ext.mts'),
    `import { createPetCore, createStorage, defineBehavior, definePet, PetError, type BehaviorDefinition, type BehaviorId, type PetDefinition, type PetErrorCode, type PetId, type PetSnapshot } from '${NAME}/core';
import { calm } from '${NAME}/behaviors';
import { cat, corner, cornerItems, dog } from '${NAME}/pets';
const kitten: PetDefinition = definePet({ ...cat, id: 'example.kitten', title: 'Котёнок', items: { list: cornerItems, gifts: cat.items.gifts }, room: { ...corner, pet: cat.room.pet, feed: cat.room.feed, toys: [] } });
const zen: BehaviorDefinition = defineBehavior({ ...calm, id: 'example.zen', title: 'Дзен', limits: { pet: 1 }, scenes: { chance: 0.1, order: 'random', skip: ['cat/curl', 'example.kitten/stretch'] }, phrases: { default: calm.phrases.default, byPet: { 'example.kitten': { pet: ['Мур.', { text: 'Мур-мур.', stage: 2 }] } } } });
const map = new Map<string, string>();
const storage = createStorage({ backend: { get: (name) => map.get(name) ?? null, set: (name, text) => void map.set(name, text) } });
storage.load();
const pet = createPetCore({ storage, pets: [cat, dog, kitten], behaviors: [calm, zen] });
pet.setPet('example.kitten');
const changed = pet.setBehavior('example.zen');
const ok: boolean = changed.ok;
const snap: PetSnapshot = pet.getState();
const shown: PetId = snap.pet.shown;
const model: BehaviorId = snap.behavior.shown;
const available: boolean = snap.pet.available && snap.behavior.available;
const kittenName: string | undefined = snap.pets['example.kitten']?.name.display;
let where: string | undefined;
let code: PetErrorCode | '' = '';
try {
  definePet(JSON.parse('{}'));
} catch (error) {
  if (error instanceof PetError) {
    where = error.path;
    code = error.code;
  }
}
// @ts-expect-error формат — 1
definePet({ ...cat, format: 2 });
// @ts-expect-error ID стороннего питомца — с точкой
definePet({ ...cat, id: 'kitten' });
// @ts-expect-error запасной — штатный питомец
definePet({ ...cat, id: 'example.cub', fallback: 'example.kitten' });
// @ts-expect-error лапа — null или { text, ask }
definePet({ ...cat, id: 'example.cub', actions: { pet: cat.actions.pet, paw: true } });
// @ts-expect-error порядок сценок — fresh или random
defineBehavior({ ...calm, id: 'example.often', scenes: { chance: 0.1, order: 'often' } });
// @ts-expect-error skip — ссылка petId/sceneId
defineBehavior({ ...calm, id: 'example.skip', scenes: { chance: 0.1, order: 'fresh', skip: ['Bunny jump'] } });
// @ts-expect-error поза реакции — из словаря
defineBehavior({ ...calm, id: 'example.jump', reactions: { ...calm.reactions, joy: { ...calm.reactions.joy, pose: 'jump' } } });
// @ts-expect-error модели поведения обязательны
createPetCore({ storage, pets: [cat] });
// @ts-expect-error модель — 'calm' или ID с точкой
pet.setBehavior('lively');
// @ts-expect-error ID питомца — штатный или с точкой
pet.setPet('kitten');
export { kitten, zen, ok, shown, model, available, kittenName, where, code };
`,
  );
  // Вход веба (PL07): контейнер, настройки, вид и его команды, веб-адаптеры для своего ядра (публичный createPetCore
  // принимает createWebStorage), штатные наборы и стили набора; неверные настройки, вид диалога, внутренние поля и вход
  // мест legacy — ошибки компилятора (8 @ts-expect-error).
  await writeFile(
    path.join(project, 'web.mts'),
    `import { createPetCore } from '${NAME}/core';
import { calm } from '${NAME}/behaviors';
import { cat, dog } from '${NAME}/pets';
import { catWeb, createWebScenes, createWebStorage, dogWeb, mountPetIn, type PetView, type PetViewOptions, type PetWebKit } from '${NAME}/web';
import type { PetSceneReserver, PetSyncStorage } from '${NAME}/core';
const box = document.createElement('div');
const options: PetViewOptions = { namespace: 'site', progress: () => ({ marks: 1, today: 1, limit: 3 }), pets: [cat, dog], behaviors: [calm], kits: [catWeb, dogWeb], home: () => box, onOpenChange: (open: boolean) => void open, watchTyping: false };
const view: PetView = mountPetIn(box, options);
const quick: PetView = mountPetIn(box);
const mounted: boolean = view.mounted && quick.mounted;
const opened = view.open('room');
const fresh: readonly string[] = opened.ok ? opened.fresh : [];
view.open();
view.close();
const named = view.core?.setName('Пиксель');
view.destroy();
const storage: PetSyncStorage = createWebStorage({ namespace: 'site' });
const loaded: 'ready' | 'failed' = storage.load();
const scenes: PetSceneReserver = createWebScenes({ namespace: 'site' });
const own = createPetCore({ storage, scenes, pets: [cat, dog], behaviors: [calm] });
const kit: PetWebKit = { ...catWeb, styles: [new URL('./my.css', import.meta.url), 'https://example.org/my.css'] };
// @ts-expect-error места сайта — не настройка контейнера
mountPetIn(box, { places: {} });
// @ts-expect-error namespace — строка
mountPetIn(box, { namespace: 3 });
// @ts-expect-error watchTyping — boolean
mountPetIn(box, { watchTyping: 'no' });
// @ts-expect-error контейнер — элемент
mountPetIn('#pet');
// @ts-expect-error вида garden нет
view.open('garden');
// @ts-expect-error mounted только для чтения
view.mounted = true;
// @ts-expect-error у веб-хранилища только namespace
createWebStorage({ namespace: 'site', area: {} });
// @ts-expect-error стили набора — адреса
const wrong: PetWebKit = { ...dogWeb, styles: [3] };
export { mounted, fresh, named, loaded, own, kit, wrong };
`,
  );
  // Закрытые пути: строка — ожидаемая ошибка. Импорт значения из стиля — ошибка: декларация не обещает CSS Modules.
  await writeFile(
    path.join(project, 'paths.mts'),
    `import '${NAME}/missing.css';
import '${NAME}/pet/pet.css';
import '${NAME}/pet/css.d.mts';
import '${NAME}/pet/pet-rules.mjs';
import '${NAME}/pet/core.mjs';
import '${NAME}/pet/core/index.mjs';
import '${NAME}/pet/pets.mjs';
import '${NAME}/pet/defs/cat.mjs';
import '${NAME}/pet/web/kits.mjs';
import '${NAME}/kits';
import '${NAME}/pet/web.mjs';
import '${NAME}/pet/web/view.mjs';
import '${NAME}/pet/react.mjs';
import '${NAME}/pet/hooks/state.mjs';
import '${NAME}/pet/native.mjs';
import '${NAME}/pet/storage/sqlite.mjs';
import styles from '${NAME}/pet.css';
export { styles };
`,
  );
  const PATH_ERRORS = ['1 TS2307', '2 TS2307', '3 TS2307', '4 TS2307', '5 TS2307', '6 TS2307', '7 TS2307', '8 TS2307', '9 TS2307', '10 TS2307', '11 TS2307', '12 TS2307', '13 TS2307', '14 TS2307', '15 TS2307', '16 TS2307', '17 TS1192'];
  // PL09: натив — типы входов без lib dom и без типов React Native и expo-sqlite (их у проекта нет). PL10.1: PetView и наборы —
  // типы элементов из react: проекту нужен @types/react (как входу /react), копия из devDependencies библиотеки, без сети.
  for (const name of ['@types/react', 'csstype']) await cp(path.join(root, 'node_modules', name), path.join(project, 'node_modules', name), { recursive: true });
  await writeFile(
    path.join(project, 'native.mts'),
    `import { calm } from '${NAME}/behaviors';
import { createPetCore, type PetCore, type PetLoadStatus, type PetSceneReserver, type PetView as PetViewName } from '${NAME}/core';
import { catNative, dogNative, PetCorner, PetPlay, PetProvider, PetRoom, PetView, useNativeLifecycle, usePetState, type NativePetKit, type PetCornerProps, type PetInsets, type PetPlayProps, type PetRoomProps, type PetViewProps } from '${NAME}/native';
import { createSqliteScenes, createSqliteStorage, type PetSqliteOptions } from '${NAME}/native-sqlite';
import { cat, dog } from '${NAME}/pets';
declare const db: { databasePath: string; execAsync(source: string): Promise<void> };
const options: PetSqliteOptions = { db, namespace: 'app', busyTimeout: 500, log: { warn: () => {} } };
const storage = createSqliteStorage(options);
const scenes: PetSceneReserver = createSqliteScenes({ db });
const loaded: Promise<PetLoadStatus> = storage.load();
const core: PetCore = createPetCore({ storage, scenes, pets: [cat, dog], behaviors: [calm] });
const ready: boolean = useNativeLifecycle(core);
const idle: boolean = useNativeLifecycle(null);
const name: string | undefined = usePetState(core)?.name.display;
// @ts-expect-error db обязателен
createSqliteStorage({ namespace: 'app' });
// @ts-expect-error busyTimeout — число мс
createSqliteStorage({ db, busyTimeout: '1000' });
// @ts-expect-error у базы нужен путь файла
createSqliteScenes({ db: {} });
// @ts-expect-error неизвестная настройка
createSqliteStorage({ db, retry: true });
// @ts-expect-error хук принимает ядро, а не хранилище
useNativeLifecycle(storage);
// @ts-expect-error load асинхронный — обещание, не итог
const sync: PetLoadStatus = storage.load();
// PL10.1: PetView — значение входа /native; тип вида ядра PetView прежний.
const props: PetViewProps = { core, pets: [cat, dog], kits: [catNative, dogNative], size: 200, style: [{ margin: 8 }, false], label: 'Марс', announce: false, testID: 'pet' };
const view = PetView(props);
const kind: PetViewName = 'corner';
const own: NativePetKit = { pet: 'example.fox', poses: ['calm'], coats: ['red'], accessories: [], substitutes: { yawn: 'calm' }, Figure: dogNative.Figure };
// @ts-expect-error kits обязательны
PetView({ core, pets: [cat] });
// @ts-expect-error набор рисует элементами react-native-svg, а не строкой разметки
const web: NativePetKit = { ...catNative, Figure: () => '<svg class="cat-art"></svg>' };
// @ts-expect-error size — число точек
PetView({ ...props, size: '200' });
// @ts-expect-error тип вида ядра — не компонент
const notView: PetViewName = 'pet';
// PL10.2.1: координатор, уголок, PetView в композиции (без core, pets, kits), ресурсы уголка набора.
const insets: PetInsets = { top: 47, right: 0, bottom: 34, left: 0 };
const provider = PetProvider({ core, pets: [cat, dog], kits: [catNative, dogNative], announce: true, children: null });
const composed = PetView({ size: 120, testID: 'pet' });
const cornerProps: PetCornerProps = { insets, entry: true, label: 'Уголок', hint: 'Открыть', returnFocus: { current: null }, testID: 'corner' };
const corner = PetCorner(cornerProps);
const bare = PetCorner({});
const room: NativePetKit = { ...own, room: true, items: ['nest'], Item: ({ id }) => catNative.Figure({ pose: 'calm', coat: 'red', accessory: '', toward: '', prefix: id }) };
const feedIn = catNative.Figure({ pose: 'feed', coat: 'smoke', accessory: 'scarf', toward: '', prefix: 'p', room: { feed: [4, -2] } });
// @ts-expect-error в композиции нет своих наборов без ядра — либо всё (core, pets, kits), либо ничего
PetView({ pets: [cat], kits: [catNative] });
// @ts-expect-error в композиции объявления скринридеру — у координатора
PetView({ announce: false });
// @ts-expect-error room набора — только true
const notRoom: NativePetKit = { ...own, room: false };
// @ts-expect-error отступы — числа top, right, bottom, left
PetCorner({ insets: { top: 0 } });
// @ts-expect-error координатору нужны наборы
PetProvider({ core, pets: [cat] });
// PL10.2.2: «Поиграть» и ресурсы игры набора.
const playProps: PetPlayProps = { insets, entry: true, label: 'Позвать', hint: 'Открыть игру', returnFocus: { current: null }, testID: 'play' };
const play = PetPlay(playProps);
const playBare = PetPlay({});
const playable: NativePetKit = { ...room, play: true };
// PL10.2.4: сценки набора — список ID.
const scened: NativePetKit = { ...room, scenes: ['stretch'] };
// @ts-expect-error scenes — список строк
const notScened: NativePetKit = { ...room, scenes: 'stretch' };
// @ts-expect-error play набора — только true
const notPlay: NativePetKit = { ...own, play: false };
// @ts-expect-error entry — boolean
PetPlay({ entry: 'yes' });
// PL10.2.3: «Обустроить уголок».
const editorProps: PetRoomProps = { insets, testID: 'room' };
const editor = PetRoom(editorProps);
const editorBare = PetRoom({});
// @ts-expect-error testID — строка
PetRoom({ testID: 1 });
export { scened, notScened, editor, editorBare, loaded, ready, idle, name, sync, view, kind, own, web, notView, provider, composed, corner, bare, room, feedIn, notRoom, play, playBare, playable, notPlay };
`,
  );
  const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  for (const [module, resolution] of [
    ['nodenext', 'nodenext'],
    ['esnext', 'bundler'],
  ]) {
    const types = (file, lib = 'es2022,dom') =>
      run(process.execPath, [tsc, '--noEmit', '--strict', '--target', 'es2022', '--lib', lib, '--module', module, '--moduleResolution', resolution, '--noUncheckedSideEffectImports', file], { cwd: project }).then(
        () => '',
        (error) => error.stdout || error.message,
      );
    const result = await types('site.mts');
    check(`TypeScript (${resolution}, noUncheckedSideEffectImports): вход и три стиля подключаются, неверные вызовы — ошибки`, result === '', result);
    const core = await types('core.mts');
    check(`TypeScript (${resolution}): pet-companion/core — точные результаты, отчёт сохранения, снимок, эффекты и подписка; legacy pet.core и команды pet.*; неверные ID и аргументы, событие без key, внутренние входы и признаки, запись в снимок — ошибки (25 @ts-expect-error)`, core === '', core);
    const plain = await types('core-only.mts', 'es2022');
    check(`TypeScript (${resolution}): ядро и входы штатных определений без lib dom`, plain === '', plain);
    const ext = await types('ext.mts', 'es2022');
    check(`TypeScript (${resolution}, без lib dom): определения PL06 — своё из штатного, своя модель, регистрация, ID расширения в командах и снимке, PetError.path; неверные определения, регистрация без моделей и ID — ошибки (10 @ts-expect-error)`, ext === '', ext);
    const web = await types('web.mts');
    check(`TypeScript (${resolution}): pet-companion/web — mountPetIn, настройки и вид, веб-адаптеры с публичным createPetCore, наборы и стили набора; неверные настройки, вид, контейнер и поля — ошибки (8 @ts-expect-error)`, web === '', web);
    const native = await types('native.mts', 'es2022');
    check(`TypeScript (${resolution}, без lib dom и без типов React Native, react-native-svg и expo-sqlite; @types/react — для PetView): pet-companion/native-sqlite — настройки, асинхронный координатор и резервирование с публичным createPetCore; pet-companion/native — useNativeLifecycle, usePetState, PetView и наборы catNative, dogNative, свой набор; PL10.2.1 — PetProvider, PetCorner с insets, PetView в композиции, ресурсы уголка набора и рисунок в комнате; PL10.2.2 — PetPlay и ресурсы игры набора; тип вида ядра PetView прежний; неверные настройки, аргумент хука, синхронный load, PetView без kits, набор-строка, size строкой, неверный вид, композиция со своими наборами и announce, room не true, неполные insets, координатор без kits, play не true, entry не boolean — ошибки (17 @ts-expect-error)`, native === '', native);
    const closed = await types('paths.mts');
    const errors = [...closed.matchAll(/^paths\.mts\((\d+),\d+\): error (TS\d+)/gm)].map(([, line, code]) => `${line} ${code}`);
    check(`TypeScript (${resolution}): несуществующий стиль, внутренние пути (в том числе файлы ядра, входов штатных, определений, наборов, веба, React и натива) и несуществующий вход kits — TS2307, значения из стиля нет — TS1192`, JSON.stringify(errors) === JSON.stringify(PATH_ERRORS) && closed.trim().split('\n').length === PATH_ERRORS.length, closed);
  }

  // Браузер.
  browser = await chromium.launch({ channel: 'chrome' });
  await archive(browser, path.join(unpacked, 'package'));
  await cp(path.join(root, 'examples', 'importmap.html'), path.join(project, 'importmap.html'));
  await importmap(browser, project);
  await cp(path.join(root, 'examples', 'commands.html'), path.join(project, 'commands.html'));
  await commands(browser, project);
  await extension(browser, project);
  // PL07: контейнер, расширение в контейнере, CSP — примеры из репозитория в проекте с установленным архивом.
  await cp(path.join(root, 'examples', 'container.html'), path.join(project, 'container.html'));
  await container(browser, project);
  await extensionView(browser, project);
  await mkdir(path.join(project, 'csp'));
  for (const file of CSP_FILES) await cp(path.join(root, 'examples', 'csp', file), path.join(project, 'csp', file));
  await cspView(browser, project);
  // PL08: сайт без сборщика — файлы по перечню.
  await cp(path.join(root, 'examples', 'manifest', 'copy.mjs'), path.join(project, 'copy-pet.mjs'));
  await manifestSites(browser, project, shipped);
} catch (error) {
  check('пакет: сценарий выполнен', false, error.stack);
} finally {
  await browser?.close();
  await rm(tmp, { recursive: true, force: true });
}
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено`);
process.exit(failed.length ? 1 : 0);
