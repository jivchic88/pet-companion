// Упакованный пакет — так, как его получат сайты (npm run test:package; нужен установленный Google Chrome): npm pack во
// временную папку, повтор — те же байты; состав архива — явный список (ни проверок, ни фикстур, ни служебных файлов);
// установка архива в чистый временный проект без сети; Node: публичные входы, стили по exports, внутренние модули и
// несуществующий стиль закрыты; TypeScript (bundler и nodenext, noUncheckedSideEffectImports, без общих деклараций CSS у
// проекта): вход и три стиля подключаются, неверные вызовы — ошибки, несуществующий стиль и внутренние пути закрыты,
// стиль не экспортирует значений. Браузер, всё по http под вложенным
// адресом, внешних запросов нет: (1) архив распакован системным tar как есть — example.html из папки package/ (кот,
// уголок, «Поиграть», собака, хранение в своём пространстве и после перезагрузки, отключение и повторное подключение,
// отказ подключения без остатков; телефон — «Скрыть» → перезагрузка → «Показать», «Приходит по зову»); (2) пакет из
// node_modules без сборщика — examples/importmap.html (карта импортов, localDay, занятие, праздник ступени).
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
const RUNTIME = ['cat-art.mjs', 'css.d.mts', 'dog-art.mjs','dog.css', 'pet-base.css', 'pet-move.mjs', 'pet-place.mjs', 'pet-play.mjs', 'pet-room.mjs', 'pet-rules.mjs', 'pet-toys.mjs', 'pet.css', 'pet.d.mts', 'pet.mjs'];
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
        check(`${label} 1280×900: пример загрузил модули и стили из архива, версия ${VERSION}`, version === VERSION && ['pet/pet.mjs', 'pet/pet-rules.mjs', 'pet/cat-art.mjs', 'pet/dog-art.mjs', 'pet/pet-room.mjs', 'pet/pet.css', 'pet/dog.css', 'pet/pet-base.css'].every((file) => server.served.includes(`${prefix}${file}`)), server.served.join(', '));
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
    check(`${label}: карта импортов — модуль и стили из node_modules/${NAME}/pet/`, ['pet.mjs', 'pet-rules.mjs', 'pet.css', 'dog.css', 'pet-base.css'].every((file) => server.served.includes(`${base}${file}`)), server.served.join(', '));
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
    const resolve = (spec) => { try { return import.meta.resolve(spec); } catch (error) { return error.code; } };
    const closed = await import('${NAME}/pet/pet-rules.mjs').then(() => 'open', (error) => error.code);
    const shut = ['missing.css', 'pet/pet.css', 'pet/css.d.mts'].map((name) => resolve('${NAME}/' + name));
    console.log(JSON.stringify({ keys: Object.keys(pet).sort(), version: pet.VERSION, day: pet.localDay(new Date(2026, 9, 12, 23, 59)), css: ['pet.css', 'dog.css', 'pet-base.css'].map((name) => resolve('${NAME}/' + name).replace(/^.*node_modules\\//, '')), closed, shut, own: resolve('${NAME}/package.json').endsWith('package.json') }));`;
  const { stdout } = await run(process.execPath, ['--input-type=module', '-e', probe], { cwd: project });
  const node = JSON.parse(stdout);
  check('Node: вход — mountPet, localDay, VERSION; версия пакета', JSON.stringify(node.keys) === '["VERSION","localDay","mountPet"]' && node.version === VERSION && node.day === '2026-10-12', stdout);
  check('Node: стили по exports — pet.css, dog.css, pet-base.css; внутренние модули закрыты', JSON.stringify(node.css) === JSON.stringify(['pet.css', 'dog.css', 'pet-base.css'].map((name) => `${NAME}/pet/${name}`)) && node.closed === 'ERR_PACKAGE_PATH_NOT_EXPORTED' && node.own, stdout);
  check('Node: несуществующий стиль, стиль и декларация по внутреннему пути — ERR_PACKAGE_PATH_NOT_EXPORTED', node.shut.every((code) => code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'), stdout);

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
  // Закрытые пути: строка — ожидаемая ошибка. Импорт значения из стиля — ошибка: декларация не обещает CSS Modules.
  await writeFile(
    path.join(project, 'paths.mts'),
    `import '${NAME}/missing.css';
import '${NAME}/pet/pet.css';
import '${NAME}/pet/css.d.mts';
import '${NAME}/pet/pet-rules.mjs';
import styles from '${NAME}/pet.css';
export { styles };
`,
  );
  const PATH_ERRORS = ['1 TS2307', '2 TS2307', '3 TS2307', '4 TS2307', '5 TS1192'];
  const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  for (const [module, resolution] of [
    ['nodenext', 'nodenext'],
    ['esnext', 'bundler'],
  ]) {
    const types = (file) =>
      run(process.execPath, [tsc, '--noEmit', '--strict', '--target', 'es2022', '--lib', 'es2022,dom', '--module', module, '--moduleResolution', resolution, '--noUncheckedSideEffectImports', file], { cwd: project }).then(
        () => '',
        (error) => error.stdout || error.message,
      );
    const result = await types('site.mts');
    check(`TypeScript (${resolution}, noUncheckedSideEffectImports): вход и три стиля подключаются, неверные вызовы — ошибки`, result === '', result);
    const closed = await types('paths.mts');
    const errors = [...closed.matchAll(/^paths\.mts\((\d+),\d+\): error (TS\d+)/gm)].map(([, line, code]) => `${line} ${code}`);
    check(`TypeScript (${resolution}): несуществующий стиль и внутренние пути — TS2307, значения из стиля нет — TS1192`, JSON.stringify(errors) === JSON.stringify(PATH_ERRORS) && closed.trim().split('\n').length === PATH_ERRORS.length, closed);
  }

  // Браузер.
  browser = await chromium.launch({ channel: 'chrome' });
  await archive(browser, path.join(unpacked, 'package'));
  await cp(path.join(root, 'examples', 'importmap.html'), path.join(project, 'importmap.html'));
  await importmap(browser, project);
} catch (error) {
  check('пакет: сценарий выполнен', false, error.stack);
} finally {
  await browser?.close();
  await rm(tmp, { recursive: true, force: true });
}
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено`);
process.exit(failed.length ? 1 : 0);
