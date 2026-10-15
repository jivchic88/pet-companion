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
// расстановка, «Скрыть» / «Показать», перезагрузка, отключение pet.core.destroy() и новое подключение.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const NAME = pkg.name;
const VERSION = pkg.version;
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json' };
const START = new Date('2026-10-12T10:00:00');
// Файлы pet/ — явный список, с внутренними папками ядра и веб-адаптера (входом пакета они не открыты).
const CORE = ['core/day.mjs', 'core/director.mjs', 'core/editor.mjs', 'core/errors.mjs', 'core/facade.mjs', 'core/figure.mjs', 'core/formats/legacy.mjs', 'core/index.mjs', 'core/pets.mjs', 'core/phrases.mjs', 'core/play.mjs', 'core/ports.mjs', 'core/presence.mjs', 'core/room.mjs', 'core/round.mjs', 'core/scenes.mjs', 'core/session.mjs', 'core/stages.mjs', 'core/storage.mjs', 'core/toys.mjs', 'core/version.mjs'];
// Вход ядра pet-companion/core (PL05) — pet/core.mjs и его типы pet/core.d.mts.
const RUNTIME = ['cat-art.mjs', 'core.d.mts', 'core.mjs', ...CORE, 'css.d.mts', 'dog-art.mjs', 'dog.css', 'pet-base.css', 'pet-move.mjs', 'pet-place.mjs', 'pet-play.mjs', 'pet-room.mjs', 'pet-rules.mjs', 'pet-toys.mjs', 'pet.css', 'pet.d.mts', 'pet.mjs', 'web/scenes.mjs', 'web/storage.mjs'];
const EXPECTED = ['CHANGELOG.md', 'LICENSE', 'README.md', 'example.html', 'package.json', ...RUNTIME.map((file) => `pet/${file}`)].sort();
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

// Сервер папки dir под адресом prefix; остальное — 404 и запись в список.
function serve(dir, prefix) {
  const outside = [];
  const served = [];
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://site');
    served.push(pathname);
    const rel = pathname.startsWith(prefix) ? decodeURIComponent(pathname.slice(prefix.length)) : null;
    const file = rel === null ? null : path.resolve(dir, rel);
    if (pathname !== '/favicon.ico' && (file === null || !file.startsWith(`${dir}${path.sep}`))) outside.push(pathname);
    try {
      if (!file?.startsWith(`${dir}${path.sep}`)) throw new Error('вне папки');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${server.address().port}`, outside, served, close: () => new Promise((done) => server.close(done)) })));
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

const tmp = await mkdtemp(path.join(tmpdir(), `${NAME}-package-`));
let browser;
try {
  // Упаковка: состав, повтор — те же байты.
  const first = await pack(path.join(tmp, 'pack1'));
  const second = await pack(path.join(tmp, 'pack2'));
  const tarball = await readFile(first.path);
  const listed = first.files.map((item) => item.path).sort();
  check(`npm pack: ${first.filename} — ровно файлы пакета (${EXPECTED.length})`, JSON.stringify(listed) === JSON.stringify(EXPECTED), listed.join(', '));
  check('npm pack: ни проверок, ни фикстур, ни служебных файлов', listed.every((file) => !FORBIDDEN.test(file)), listed.filter((file) => FORBIDDEN.test(file)).join(', '));
  check('npm pack: повторная упаковка — те же байты', first.integrity === second.integrity && sha256(tarball) === sha256(await readFile(second.path)), `${first.integrity} / ${second.integrity}`);
  console.log(`  ${first.filename}: ${tarball.length} байт, integrity ${first.integrity}, sha256 ${sha256(tarball)}`);

  // Архив как есть: системный tar.
  const unpacked = path.join(tmp, 'site');
  await mkdir(unpacked);
  await run('tar', ['-xzf', first.path, '-C', unpacked]);
  const inside = await files(path.join(unpacked, 'package'));
  check('архив: распакован системным tar — папка package/ с теми же файлами', JSON.stringify(inside) === JSON.stringify(EXPECTED) && (await readdir(unpacked)).join() === 'package', inside.join(', '));
  const same = await Promise.all(RUNTIME.map(async (file) => sha256(await readFile(path.join(unpacked, 'package', 'pet', file))) === sha256(await readFile(path.join(root, 'pet', file)))));
  check('архив: pet/ — байт в байт файлы репозитория', same.every(Boolean));
  // Граф импортов из архива: каждый относительный импорт — файл архива внутри pet/; ядро (core/**) — только core/**.
  const graph = [];
  for (const file of RUNTIME.filter((name) => name.endsWith('.mjs'))) {
    const source = await readFile(path.join(unpacked, 'package', 'pet', file), 'utf8');
    for (const [, from, bare] of source.matchAll(/^(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|^import\s*['"]([^'"]+)['"]/gm)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), from ?? bare));
      if (!RUNTIME.includes(target) || ((file.startsWith('core/') || file === 'core.mjs') && !target.startsWith('core/'))) graph.push(`${file} → ${from ?? bare}`);
    }
  }
  check('архив: импорты — файлы архива внутри pet/; вход ядра core.mjs и ядро core/** импортируют только core/**', graph.length === 0, graph.join(', '));

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
    const resolve = (spec) => { try { return import.meta.resolve(spec); } catch (error) { return error.code; } };
    const closed = await import('${NAME}/pet/pet-rules.mjs').then(() => 'open', (error) => error.code);
    const shut = ['missing.css', 'pet/pet.css', 'pet/css.d.mts', 'pet/core.mjs', 'pet/core.d.mts', 'pet/core/index.mjs', 'pet/core/facade.mjs', 'pet/core/version.mjs', 'pet/core/storage.mjs', 'pet/core/session.mjs', 'pet/core/scenes.mjs', 'pet/core/presence.mjs', 'pet/core/room.mjs', 'pet/core/play.mjs', 'pet/core/editor.mjs', 'pet/core/toys.mjs', 'pet/core/figure.mjs', 'pet/web/storage.mjs', 'pet/web/scenes.mjs', 'core/index.mjs', 'pets', 'behaviors', 'web', 'react', 'native', 'native-sqlite', 'manifest.json'].map((name) => resolve('${NAME}/' + name));
    console.log(JSON.stringify({ keys: Object.keys(pet).sort(), coreKeys: Object.keys(core).sort(), coreAt: resolve('${NAME}/core').replace(/^.*node_modules\\//, ''), sameDay: core.localDay === pet.localDay, sameVersion: core.VERSION === pet.VERSION, version: pet.VERSION, day: pet.localDay(new Date(2026, 9, 12, 23, 59)), css: ['pet.css', 'dog.css', 'pet-base.css'].map((name) => resolve('${NAME}/' + name).replace(/^.*node_modules\\//, '')), closed, shut, own: resolve('${NAME}/package.json').endsWith('package.json') }));`;
  const { stdout } = await run(process.execPath, ['--input-type=module', '-e', probe], { cwd: project });
  const node = JSON.parse(stdout);
  check('Node: вход — mountPet, localDay, VERSION; версия пакета', JSON.stringify(node.keys) === '["VERSION","localDay","mountPet"]' && node.version === VERSION && node.day === '2026-10-12', stdout);
  check('Node: вход ядра pet-companion/core (PL05) — ровно createPetCore, createStorage, PetError, localDay, VERSION из pet/core.mjs; та же граница дня и версия', JSON.stringify(node.coreKeys) === '["PetError","VERSION","createPetCore","createStorage","localDay"]' && node.coreAt === `${NAME}/pet/core.mjs` && node.sameDay && node.sameVersion, stdout);
  check('Node: стили по exports — pet.css, dog.css, pet-base.css; внутренние модули закрыты', JSON.stringify(node.css) === JSON.stringify(['pet.css', 'dog.css', 'pet-base.css'].map((name) => `${NAME}/pet/${name}`)) && node.closed === 'ERR_PACKAGE_PATH_NOT_EXPORTED' && node.own, stdout);
  check('Node: несуществующий стиль, стиль и декларация по внутреннему пути, файл входа ядра и файлы ядра по внутренним путям (фасад, версия, экземпляр, сессия, хранение, сценки, присутствие, комната, игра, редактор, данные рисунка), веб-адаптеры и будущие входы (pets, behaviors, web, react, native, native-sqlite, manifest.json) — ERR_PACKAGE_PATH_NOT_EXPORTED', node.shut.length === 27 && node.shut.every((code) => code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'), stdout);

  // Импорт без браузера (безопасность серверного рендера без React): оба входа загружаются, не трогая браузерные глобалы
  // (ловушки бросают); mountPet вне браузера — отказ без исключения (console.error), pet.core — null.
  const ssr = `
    const names = ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'matchMedia', 'requestAnimationFrame', 'HTMLElement', 'customElements', 'location'];
    for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error('обращение к ' + name + ' при импорте'); } });
    const core = await import('${NAME}/core');
    const legacy = await import('${NAME}');
    for (const name of names) delete globalThis[name];
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.map(String).join(' '));
    let pet;
    try { pet = legacy.mountPet({ places: { logo: () => {}, top: () => {} } }); } finally { console.error = original; }
    console.log(JSON.stringify({ core: Object.keys(core).length, legacy: Object.keys(legacy).length, mounted: pet.mounted, petCore: pet.core, state: pet.getState(), command: pet.setName('x').error?.code, errors }));`;
  const server = await run(process.execPath, ['--input-type=module', '-e', ssr], { cwd: project }).then(({ stdout }) => JSON.parse(stdout), (error) => ({ failed: error.stderr || error.message }));
  check('Node без браузера: импорт pet-companion и pet-companion/core не трогает браузерные глобалы; mountPet — отказ без исключения, pet.core и снимок null, команды — destroyed', server.core === 5 && server.legacy === 3 && server.mounted === false && server.petCore === null && server.state === null && server.command === 'destroyed' && server.errors.length === 1 && server.errors[0].includes('mountPet подключается только в браузере'), JSON.stringify(server));

  // Внешний пример — только публичный вход pet-companion/core установленного архива.
  await cp(path.join(root, 'examples', 'core-node.mjs'), path.join(project, 'core-node.mjs'));
  const example = await run(process.execPath, ['core-node.mjs'], { cwd: project }).then(({ stdout }) => JSON.parse(stdout.trim().split('\n').at(-1)), (error) => ({ failed: error.stderr || error.message }));
  check('Node: внешний пример examples/core-node.mjs на установленном архиве — хранилище, порты, имя, событие, кормление, питомец, облик, отказ записи, виды, жест, комната, присутствие, снимок, destroy, новое ядро, асинхронное хранилище и done после destroy', example.ok === true && example.version === VERSION && example.stored?.every((key) => key.startsWith('demo:')), JSON.stringify(example));

  // TypeScript: полное подключение, как в README, — вход и три стиля. У проекта нет общих деклараций CSS (declare module
  // '*.css', vite/client): стили находит сам пакет, иначе noUncheckedSideEffectImports даёт TS2307.
  await writeFile(
    path.join(project, 'site.mts'),
    `import { localDay, mountPet, VERSION, type Pet, type PetOptions } from '${NAME}';
import '${NAME}/pet-base.css';
import '${NAME}/pet.css';
import '${NAME}/dog.css';
const head = document.createElement('header');
const options: PetOptions = { storage: 'site', places: { logo: (el) => head.append(el), top: (el) => head.prepend(el) }, progress: () => ({ marks: 1, today: 0, limit: 3 }), step: () => null, zone: (device, id) => (device === 'phone' && id === 'top' ? { left: 0, top: 0, width: 10, height: 10 } : null) };
const pet: Pet = mountPet(options);
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
const map = new Map<string, string>();
const storage: PetSyncStorage = createStorage({ namespace: 'site', backend: { get: (name) => map.get(name) ?? null, set: (name, text) => void map.set(name, text) } });
const loaded: 'ready' | 'failed' = storage.load();
const remote: PetAsyncStorage = createStorage({ backend: { async: true, get: async (name) => map.get(name) ?? null, set: async (name, text) => void map.set(name, text) } });
const later: Promise<'ready' | 'failed'> = remote.load();
const pet: PetCore = createPetCore({ storage, progress: () => ({ marks: 1, today: 1, limit: 3 }), clock: { now: () => 0, day: () => localDay(), nextDay: (at) => at + 1 }, random: () => 0.5, scheduler: { later: () => () => {} }, log: { warn: () => {} }, scenes: null });
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
const kind: 'cat' | 'dog' = snap.pet.shown;
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
  createPetCore({ storage });
} catch (error) {
  if (error instanceof PetError) code = error.code === 'invalid-options' ? 'internal' : '';
}
// @ts-expect-error неизвестный питомец
pet.setPet('fox');
// @ts-expect-error неизвестный облик
pet.setAppearance({ coat: 'zebra' });
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
// @ts-expect-error регистрация определений — не в этой версии
createPetCore({ storage, pets: [] });
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
const storage = createStorage({ backend: { get: () => null, set: () => {} } });
storage.load();
const snapshot: PetSnapshot = createPetCore({ storage }).getState();
export { snapshot };
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
import '${NAME}/pets';
import styles from '${NAME}/pet.css';
export { styles };
`,
  );
  const PATH_ERRORS = ['1 TS2307', '2 TS2307', '3 TS2307', '4 TS2307', '5 TS2307', '6 TS2307', '7 TS2307', '8 TS1192'];
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
    check(`TypeScript (${resolution}): pet-companion/core — точные результаты, отчёт сохранения, снимок, эффекты и подписка; legacy pet.core и команды pet.*; неверные ID и аргументы, событие без key, внутренние входы и признаки, запись в снимок — ошибки (26 @ts-expect-error)`, core === '', core);
    const plain = await types('core-only.mts', 'es2022');
    check(`TypeScript (${resolution}): ядро без lib dom`, plain === '', plain);
    const closed = await types('paths.mts');
    const errors = [...closed.matchAll(/^paths\.mts\((\d+),\d+\): error (TS\d+)/gm)].map(([, line, code]) => `${line} ${code}`);
    check(`TypeScript (${resolution}): несуществующий стиль, внутренние пути (в том числе файлы ядра) и будущий вход pets — TS2307, значения из стиля нет — TS1192`, JSON.stringify(errors) === JSON.stringify(PATH_ERRORS) && closed.trim().split('\n').length === PATH_ERRORS.length, closed);
  }

  // Браузер.
  browser = await chromium.launch({ channel: 'chrome' });
  await archive(browser, path.join(unpacked, 'package'));
  await cp(path.join(root, 'examples', 'importmap.html'), path.join(project, 'importmap.html'));
  await importmap(browser, project);
  await cp(path.join(root, 'examples', 'commands.html'), path.join(project, 'commands.html'));
  await commands(browser, project);
} catch (error) {
  check('пакет: сценарий выполнен', false, error.stack);
} finally {
  await browser?.close();
  await rm(tmp, { recursive: true, force: true });
}
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено`);
process.exit(failed.length ? 1 : 0);
