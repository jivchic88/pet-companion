// Внешние потребители установленного архива (PL08; npm run test:consumers; нужны сеть или кэш npm и Google Chrome): npm pack
// во временную папку и установка именно этого .tgz (не link, не путь к исходникам) в чистые проекты вместе со сборщиком и
// React точных версий (devDependencies; React 18 — отдельный проект). Всё отдаёт сервер из папки сборки под вложенным
// адресом, внешние запросы обрываются и записываются; исходники пакета и node_modules браузеру недоступны.
//
// (1) Обычный веб, Vite production (examples/vite): контейнер — стили пакета перенесены сборщиком файлами и применены в
//     Shadow DOM (вычисленные стили, готовность вида), кролик — стили набора через styles/import.meta.url, прежний mountPet —
//     CSS пакета сохранён после tree shaking; строгий CSP без нарушений; 1280×900 и 390×844. Контроли: без
//     assetsInlineLimit: 0 pet-base.css встроен data: — под CSP нарушение и отказ вида, без CSP работает; прежний механизм
//     адресов (перечисление через map, как в 290e949) в той же сборке — 404 стилей и отказ вида. Сервер разработки Vite
//     (предварительная сборка зависимостей) — стили по адресам пакета.
// (2) React (examples/react): vite build клиента и сервера, renderToString в Node с ловушками браузерных глобалов,
//     hydrateRoot в Chrome — без ошибок гидратации, заглушка сменяется питомцем после эффекта.
// (3) Жизненный цикл (test/react-app): development-сборка (StrictMode: двойной эффект действительно происходит) и
//     production отдельно, React 19 и 18: onCore по порядку и относительно отключения, один живой вид, подписки хука
//     (initial: false, снятие при смене ядра и размонтировании), смена функций без пересоздания, progress и refresh без
//     награды, смена namespace, прямой core.destroy без оживления, отказ подключения, поздняя ошибка CSS, ресурсы страницы
//     после размонтирования — как до подключения.
// (4) Только ядро в проекте с React — в сборке ни React, ни веба, ни CSS. (5) Типы /react из архива (bundler и nodenext,
//     @types/react 19 и 18): положительные и @ts-expect-error.
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { digest, tarballInfo } from '../scripts/release.mjs';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const NAME = pkg.name;
const VERSION = pkg.version;
const VITE = pkg.devDependencies.vite;
const REACT = { 19: { react: pkg.devDependencies.react, types: pkg.devDependencies['@types/react'] }, 18: { react: '18.3.1', types: '18.3.29' } };
const CSP = "default-src 'self'; style-src 'self'";
const START = new Date('2026-10-12T10:00:00');
const PLACEHOLDER = 'Питомец появится после загрузки страницы.';
const HERO_PLACEHOLDER = 'Персонаж появится после загрузки страницы.';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const SIZES = [
  { label: '1280×900', options: { viewport: { width: 1280, height: 900 } } },
  { label: '390×844', options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
];

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
// Сторож: зацикленная страница (например, пересоздание питомца на каждом рендере) не отвечает на page.evaluate — набор
// падает по времени, а не висит.
setTimeout(() => {
  console.error('\n✗ test:consumers: превышено время (10 мин) — страница не отвечает или зависла сборка');
  process.exit(1);
}, 10 * 60 * 1000).unref();
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const note = (text) => console.log(`  ${text}`);

async function pack(dir, dest) {
  await mkdir(dest, { recursive: true });
  const { stdout } = await run('npm', ['pack', '--json', '--pack-destination', dest], { cwd: dir });
  const [info] = JSON.parse(stdout);
  return { ...info, path: path.join(dest, info.filename) };
}

// Чистый проект: package.json и установка архива с точными версиями зависимостей сайта.
async function project(dir, tarball, deps) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'site', private: true, type: 'module' }, null, 2)}\n`);
  await run('npm', ['install', tarball, ...Object.entries(deps).map(([name, version]) => `${name}@${version}`), '--save-exact', '--no-audit', '--no-fund', '--prefer-offline'], { cwd: dir, maxBuffer: 1 << 24 });
  const installed = JSON.parse(await readFile(path.join(dir, 'node_modules', NAME, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(dir, 'package-lock.json'), 'utf8'));
  const versions = {};
  for (const name of Object.keys(deps)) versions[name] = JSON.parse(await readFile(path.join(dir, 'node_modules', name, 'package.json'), 'utf8')).version;
  return { installed, versions, resolved: lock.packages[`node_modules/${NAME}`]?.resolved ?? '', link: (await lstat(path.join(dir, 'node_modules', NAME))).isSymbolicLink() };
}

// Vite установленного проекта dir: CLI из его node_modules (не из репозитория); cwd — папка приложения.
const vite = (dir, args, env = {}, cwd = dir) =>
  run(process.execPath, [path.join(dir, 'node_modules', 'vite', 'bin', 'vite.js'), ...args], { cwd, env: { ...process.env, ...env }, maxBuffer: 1 << 24 }).then(
    ({ stdout, stderr }) => ({ ok: true, out: `${stdout}${stderr}` }),
    (error) => ({ ok: false, out: `${error.stdout ?? ''}${error.stderr ?? ''}${error.message}` }),
  );

// Коды предупреждений в выводе сборщика ([MODULE_LEVEL_DIRECTIVE] и т. п.) с файлом, о котором речь. PLUGIN_TIMINGS —
// диагностика скорости плагинов на загруженной машине, не о коде: не считается.
const warnings = (out) =>
  [...out.replace(/\x1b\[[0-9;]*m/g, '').matchAll(/\[([A-Z][A-Z_]+)\]([^\n]*)/g)].filter(([, code]) => code !== 'PLUGIN_TIMINGS').map(([, code, rest]) => `${code} ${/ in "([^"]+)"/.exec(rest)?.[1] ?? ''}`.trim());

async function files(dir, rel = '') {
  const list = [];
  for (const entry of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const name = path.posix.join(rel, entry.name);
    if (entry.isDirectory()) list.push(...(await files(dir, name)));
    else list.push(name);
  }
  return list.sort();
}

// Сервер папки dir под адресом prefix: только её файлы; запросы записываются, 404 — отдельно; csp — заголовок на всё.
function serve(dir, prefix, { csp = false } = {}) {
  const served = [];
  const missing = [];
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://site');
    served.push(pathname);
    const rel = pathname.startsWith(prefix) ? decodeURIComponent(pathname.slice(prefix.length)) || 'index.html' : null;
    const file = rel === null ? null : path.resolve(dir, rel);
    try {
      if (!file?.startsWith(`${dir}${path.sep}`)) throw new Error('вне папки');
      const body = await readFile(file);
      const headers = { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' };
      if (csp) headers['content-security-policy'] = CSP;
      res.writeHead(200, headers);
      res.end(body);
    } catch {
      if (pathname !== '/favicon.ico') missing.push(pathname);
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${server.address().port}`, served, missing, close: () => new Promise((done) => server.close(done)) })));
}

// Только QA: ресурсы страницы целиком (в сборке модули пакета слиты в один файл — по стеку их не отличить): ждущие таймеры
// и интервалы, кадры анимации, активные наблюдатели размеров, слушатели медиазапросов (и снятые сигналом); нарушения CSP.
function counters() {
  window.qaViolations = [];
  document.addEventListener('securitypolicyviolation', (event) => window.qaViolations.push(`${event.violatedDirective} ${event.blockedURI}`), true);
  const wrapTimers = (setName, clearName, store) => {
    const set = window[setName].bind(window);
    const clear = window[clearName].bind(window);
    window[setName] = (fn, ms = 0, ...args) => {
      const id = set(
        (...rest) => {
          if (setName === 'setTimeout') store.delete(id);
          if (typeof fn === 'function') fn(...rest);
        },
        ms,
        ...args,
      );
      store.add(id);
      return id;
    };
    window[clearName] = (id) => {
      store.delete(id);
      clear(id);
    };
  };
  window.qaTimers = new Set();
  window.qaIntervals = new Set();
  wrapTimers('setTimeout', 'clearTimeout', window.qaTimers);
  wrapTimers('setInterval', 'clearInterval', window.qaIntervals);
  const frame = window.requestAnimationFrame.bind(window);
  const unframe = window.cancelAnimationFrame.bind(window);
  window.qaFrames = new Set();
  window.requestAnimationFrame = (fn) => {
    const id = frame((time) => {
      window.qaFrames.delete(id);
      fn(time);
    });
    window.qaFrames.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    window.qaFrames.delete(id);
    unframe(id);
  };
  const Observer = window.ResizeObserver;
  window.qaObservers = new Set();
  window.ResizeObserver = class extends Observer {
    constructor(callback) {
      super(callback);
      this.qaTargets = new Set();
    }
    observe(target, options) {
      this.qaTargets.add(target);
      window.qaObservers.add(this);
      return super.observe(target, options);
    }
    unobserve(target) {
      this.qaTargets.delete(target);
      if (!this.qaTargets.size) window.qaObservers.delete(this);
      return super.unobserve(target);
    }
    disconnect() {
      this.qaTargets.clear();
      window.qaObservers.delete(this);
      return super.disconnect();
    }
  };
  window.qaMedia = new Set();
  const add = MediaQueryList.prototype.addEventListener;
  const remove = MediaQueryList.prototype.removeEventListener;
  MediaQueryList.prototype.addEventListener = function (type, fn, options) {
    const token = { list: this, type, fn };
    window.qaMedia.add(token);
    options?.signal?.addEventListener('abort', () => window.qaMedia.delete(token), { once: true });
    return add.call(this, type, fn, options);
  };
  MediaQueryList.prototype.removeEventListener = function (type, fn, options) {
    for (const token of window.qaMedia) if (token.list === this && token.type === type && token.fn === fn) window.qaMedia.delete(token);
    return remove.call(this, type, fn, options);
  };
}

async function open(browser, origin, options) {
  const context = await browser.newContext(options);
  await context.clock.install({ time: START });
  await context.addInitScript(counters);
  const external = [];
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : (external.push(route.request().url()), route.abort())));
  const page = await context.newPage();
  page.qaErrors = [];
  page.qaConsole = [];
  page.on('pageerror', (error) => page.qaErrors.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) page.qaConsole.push(`${message.type()}: ${message.text()}`);
  });
  page.on('requestfailed', (request) => !request.url().endsWith('/favicon.ico') && page.qaConsole.push(`запрос не выполнен: ${request.url()}`));
  return { context, page, external };
}

// Ресурсы страницы: слушатели document и window (CDP) и счётчики init-скрипта.
async function resources(page) {
  const cdp = await page.context().newCDPSession(page);
  const list = async (expression) => {
    const { result } = await cdp.send('Runtime.evaluate', { expression });
    return (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.length;
  };
  const own = await page.evaluate(() => ({ timers: window.qaTimers.size, intervals: window.qaIntervals.size, frames: window.qaFrames.size, observers: window.qaObservers.size, media: window.qaMedia.size }));
  const counts = { document: await list('document'), window: await list('window'), ...own };
  await cdp.detach();
  return counts;
}

// Вид в контейнере selector: свой элемент, готовность, вычисленные стили (view.css — .pet-view, pet.css — .cat-sheet),
// ссылки стилей теневого дерева и их загрузка, рисунок.
const viewOf = (page, selector) =>
  page.evaluate((sel) => {
    const hosts = document.querySelectorAll(`${sel} > [data-pet-view]`);
    const host = hosts[0] ?? null;
    const shadow = host?.shadowRoot ?? null;
    const box = shadow?.querySelector('.pet-view') ?? null;
    const sheet = shadow?.querySelector('.cat-sheet') ?? null;
    const art = box?.querySelector('.cat-art') ?? null;
    const boxStyle = box ? getComputedStyle(box) : null;
    return {
      hosts: hosts.length,
      ready: box ? !box.hidden : null,
      view: box?.dataset.view ?? null,
      box: boxStyle ? `${boxStyle.position} ${boxStyle.display}` : null,
      sheet: sheet ? getComputedStyle(sheet).position : null,
      open: Boolean(sheet?.open),
      links: [...(shadow?.querySelectorAll('link[rel="stylesheet"]') ?? [])].map((link) => ({ href: link.href.startsWith('data:') ? 'data:' : new URL(link.href).pathname, loaded: Boolean(link.sheet) })),
      kind: art ? (art.dataset.kind ?? 'cat') : null,
      pose: art?.dataset.pose ?? null,
      bunny: box?.querySelector('.bunny-art') ? getComputedStyle(box.querySelector('.bunny-eyes-shut')).display : null,
    };
  }, selector);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const clean = (page, external, server) => ({ external, missing: server.missing, errors: page.qaErrors, console: page.qaConsole, violations: null });

// Питомец в контейнере: открыть уголок кнопкой питомца, «Поиграть», «Погладить» — итог; Esc по шагам до закрытия.
async function playThrough(page, selector, touch) {
  const press = (target) => (touch ? page.locator(target).first().tap() : page.locator(target).first().click());
  await press(`${selector} .cat-view-btn`);
  const corner = await viewOf(page, selector);
  await press(`${selector} [data-cat-play]`);
  await press(`${selector} [data-cat-play-pet]`);
  const hint = await page.evaluate((sel) => document.querySelector(`${sel} > [data-pet-view]`).shadowRoot.querySelector('[data-cat-play-hint]')?.textContent ?? null, selector);
  for (let i = 0; i < 3 && (await viewOf(page, selector)).open; i += 1) {
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
  }
  return { corner: corner.open, hint, closed: !(await viewOf(page, selector)).open };
}

// Настоящий путь (на macOS временная папка — ссылка /var → /private/var): иначе Vite сочтёт node_modules внешними.
const tmp = await realpath(await mkdtemp(path.join(tmpdir(), `${NAME}-consumers-`)));
let browser;
const env = { node: process.version, npm: (await run('npm', ['-v'])).stdout.trim() };
try {
  // Архив: упаковка дважды — те же байты; состав — с manifest.json, входом React и хуком. PL12: PET_TARBALL — ставится ровно
  // этот архив выпуска (scripts/release.mjs prepare), свежая упаковка рабочего дерева — то же содержимое.
  const given = process.env.PET_TARBALL ? await tarballInfo(path.resolve(process.env.PET_TARBALL)) : null;
  const first = given ?? (await pack(root, path.join(tmp, 'pack1')));
  const second = await pack(root, path.join(tmp, 'pack2'));
  const tarball = await readFile(first.path);
  const listed = first.files.map((item) => item.path);
  const same = given ? given.digest.filesSha256 === digest(await readFile(second.path)).filesSha256 : first.integrity === second.integrity && sha256(tarball) === sha256(await readFile(second.path));
  check(`${given ? `архив выпуска ${first.filename} (PET_TARBALL) — то же содержимое, что упаковка рабочего дерева` : `npm pack: ${first.filename} — повторная упаковка даёт те же байты`}; в архиве manifest.json, pet/react.mjs, pet/react.d.mts, pet/hooks/state.mjs`, same && ['manifest.json', 'pet/react.mjs', 'pet/react.d.mts', 'pet/hooks/state.mjs'].every((file) => listed.includes(file)), listed.join(', '));
  note(`${first.filename}: ${tarball.length} байт, integrity ${first.integrity}, sha256 ${sha256(tarball)}`);

  // Проекты: обычный веб (без React), React 19 и React 18 — установка этого .tgz и точных версий.
  const web = path.join(tmp, 'web');
  const r19 = path.join(tmp, 'react19');
  const r18 = path.join(tmp, 'react18');
  const sites = {
    web: await project(web, first.path, { vite: VITE }),
    19: await project(r19, first.path, { vite: VITE, react: REACT[19].react, 'react-dom': REACT[19].react, '@types/react': REACT[19].types }),
    18: await project(r18, first.path, { vite: VITE, react: REACT[18].react, 'react-dom': REACT[18].react, '@types/react': REACT[18].types }),
  };
  for (const [label, site] of Object.entries(sites)) {
    check(`установка (${label}): ${NAME}@${VERSION} — из этого .tgz (file:), не ссылка; зависимости сайта точных версий ${JSON.stringify(site.versions)}`, site.installed.version === VERSION && site.resolved.startsWith('file:') && site.resolved.endsWith(first.filename) && !site.link, JSON.stringify(site));
  }
  check('установка без React: npm не поставил react (необязательный партнёр входа /react)', !(await readdir(path.join(web, 'node_modules'))).includes('react'));
  Object.assign(env, { vite: sites.web.versions.vite, react: [sites[19].versions.react, sites[18].versions.react], reactDom: [sites[19].versions['react-dom'], sites[18].versions['react-dom']], typesReact: [sites[19].versions['@types/react'], sites[18].versions['@types/react']] });

  // Исходники примеров — в проекты как есть.
  await cp(path.join(root, 'examples', 'vite'), path.join(web, 'vite'), { recursive: true });
  await cp(path.join(root, 'examples', 'extension'), path.join(web, 'extension'), { recursive: true });
  await cp(path.join(root, 'examples', 'react'), path.join(r19, 'react'), { recursive: true });
  for (const dir of [r19, r18]) await cp(path.join(root, 'test', 'react-app'), path.join(dir, 'react-app'), { recursive: true });

  browser = await chromium.launch({ channel: 'chrome' });
  env.chrome = browser.version();

  // (1) Обычный веб: production-сборка примера.
  const built = await vite(web, ['build', 'vite', '--outDir', '../dist/vite', '--emptyOutDir']);
  check(`Vite ${VITE} production: examples/vite собран из установленного архива, без предупреждений сборщика`, built.ok && warnings(built.out).length === 0, built.out);
  const dist = path.join(web, 'dist', 'vite');
  const out = await files(dist);
  const js = (await Promise.all(out.filter((file) => file.endsWith('.js')).map((file) => readFile(path.join(dist, file), 'utf8')))).join('\n');
  const css = Object.fromEntries(await Promise.all(out.filter((file) => file.endsWith('.css')).map(async (file) => [file, await readFile(path.join(dist, file), 'utf8')])));
  const asset = (name) => out.find((file) => new RegExp(`^assets/${name}-[\\w-]+\\.css$`).test(file));
  const legacyCss = Object.entries(css).find(([file]) => /^assets\/index-[\w-]+\.css$/.test(file))?.[1] ?? '';
  const shape = {
    assets: ['pet-base', 'pet', 'dog', 'view', 'bunny'].filter((name) => !asset(name)),
    inline: js.includes('data:text/css'),
    legacy: ['.cat-sheet', '.cat-face', '.cat-side', '.dog-mouth-yawn'].filter((rule) => !legacyCss.includes(rule)),
    paths: [...new Set(js.match(/node_modules\/[\w@./-]+|\/pet\/[\w-]+\.css/g) ?? [])],
    react: /react\.production|useSyncExternalStore/.test(js),
  };
  check('сборка: стили контейнера — файлы ассетов (pet-base, pet, dog, view, bunny), не data:; CSS mountPet сохранён после tree shaking (.cat-sheet, .cat-face, .cat-side, собака); ни React, ни путей node_modules и pet/ в коде', !shape.assets.length && !shape.inline && !shape.legacy.length && !shape.paths.length && !shape.react, JSON.stringify({ shape, out }));
  for (const { label, options } of SIZES) {
    const server = await serve(dist, '/sites/shop/', { csp: true });
    const { context, page, external } = await open(browser, server.origin, options);
    const touch = Boolean(options.hasTouch);
    try {
      const response = await page.goto(`${server.origin}/sites/shop/`);
      await page.waitForFunction(() => Boolean(window.viteDemo?.view));
      await page.waitForFunction(() => document.querySelector('#pet > [data-pet-view]')?.shadowRoot?.querySelector('.pet-view')?.hidden === false, null, { timeout: 5000 }).catch(() => {});
      await page.clock.runFor(3000);
      const view = await viewOf(page, '#pet');
      check(`Vite production ${label}: контейнер — стили пакета (pet-base, pet, dog, view) и набора кролика ссылками в Shadow DOM из assets/ (загружены), вид готов, view.css (.pet-view absolute grid) и pet.css (.cat-sheet fixed) применены`, view.hosts === 1 && view.ready && view.box === 'absolute grid' && view.sheet === 'fixed' && JSON.stringify(view.links.map((link) => /^\/sites\/shop\/assets\/([a-z-]+)-[\w-]+\.css$/.exec(link.href)?.[1])) === '["pet-base","pet","dog","view","bunny"]' && view.links.every((link) => link.loaded), JSON.stringify(view));
      const played = await playThrough(page, '#pet', touch);
      check(`Vite production ${label}: уголок, «Поиграть», «Погладить» — «Марс мурлычет.», Esc закрывает`, played.corner && played.hint === 'Марс мурлычет.' && played.closed, JSON.stringify(played));
      await page.locator('#done').click();
      await page.clock.runFor(200);
      const joy = await viewOf(page, '#pet');
      await page.clock.runFor(6000);
      await page.locator('#bunny').click();
      await page.clock.runFor(200);
      const bunny = await viewOf(page, '#pet');
      check(`Vite production ${label}: занятие — радость; кролик — рисунок набора, bunny.css набора через styles/import.meta.url — ассет сборки в теневом дереве, применён`, joy.pose === 'joy' && bunny.kind === 'example.bunny' && bunny.bunny === 'none' && bunny.links.some((link) => /^\/sites\/shop\/assets\/bunny-[\w-]+\.css$/.test(link.href) && link.loaded), JSON.stringify({ joy: joy.pose, bunny }));
      const legacy = await page.evaluate(() => ({ face: Boolean(document.querySelector('#head .cat-face, #head .cat-side-face')), at: document.documentElement.dataset.petAt ?? null }));
      await page.locator('#head .cat-face:visible, #head .cat-side-face:visible').first()[touch ? 'tap' : 'click']();
      const sheet = await page.evaluate(() => ({ open: Boolean(document.getElementById('cat-sheet')?.open), position: getComputedStyle(document.getElementById('cat-sheet')).position }));
      await page.keyboard.press('Escape');
      check(`Vite production ${label}: mountPet в шапке — стили пакета из сборки применены (#cat-sheet fixed, открыт)`, legacy.face && sheet.open && sheet.position === 'fixed', JSON.stringify({ legacy, sheet }));
      const violations = await page.evaluate(() => window.qaViolations);
      const bad = server.served.filter((url) => /node_modules|\/pet\//.test(url));
      check(`Vite production ${label}: заголовок CSP ${CSP} — нарушений нет; запросы — только файлы сборки (нет 404, node_modules, pet/, внешних); ошибок нет; без горизонтальной прокрутки`, response.headers()['content-security-policy'] === CSP && violations.length === 0 && server.missing.length === 0 && bad.length === 0 && external.length === 0 && page.qaErrors.length === 0 && page.qaConsole.length === 0 && (await overflow(page)) <= 0, JSON.stringify({ violations, bad, ...clean(page, external, server) }));
    } catch (error) {
      check(`Vite production ${label}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
      await server.close();
    }
  }

  // Контроль: та же сборка без assetsInlineLimit: 0 — pet-base.css (меньше 4 КБ) встроен data:. Без CSP работает; под
  // строгим CSP стиль запрещён — вид отключается (README: настройка нужна только строгому CSP).
  await writeFile(path.join(web, 'vite', 'inline.config.js'), "export default { base: './' };\n");
  const inline = await vite(web, ['build', 'vite', '--config', 'vite/inline.config.js', '--outDir', '../dist/inline', '--emptyOutDir']);
  const inlineJs = (await Promise.all((await files(path.join(web, 'dist', 'inline'))).filter((file) => file.endsWith('.js')).map((file) => readFile(path.join(web, 'dist', 'inline', file), 'utf8')))).join('\n');
  const inlineRuns = {};
  for (const csp of [false, true]) {
    const server = await serve(path.join(web, 'dist', 'inline'), '/sites/inline/', { csp });
    const { context, page } = await open(browser, server.origin, SIZES[0].options);
    try {
      await page.goto(`${server.origin}/sites/inline/`);
      await page.waitForFunction(() => Boolean(window.viteDemo?.view));
      await page.clock.runFor(2000);
      await page.waitForFunction(() => !window.viteDemo.view.mounted || document.querySelector('#pet > [data-pet-view]')?.shadowRoot?.querySelector('.pet-view')?.hidden === false, null, { timeout: 5000 }).catch(() => {});
      inlineRuns[csp ? 'csp' : 'plain'] = { mounted: await page.evaluate(() => window.viteDemo.view.mounted), violations: await page.evaluate(() => window.qaViolations), console: page.qaConsole };
    } finally {
      await context.close();
      await server.close();
    }
  }
  check('контроль: сборка без assetsInlineLimit: 0 — pet-base.css встроен data:; без CSP вид работает, под строгим CSP — нарушение style-src и отказ вида («стили не загрузились»)', inline.ok && inlineJs.includes('data:text/css') && inlineRuns.plain.mounted && inlineRuns.plain.violations.length === 0 && !inlineRuns.csp.mounted && inlineRuns.csp.violations.some((line) => line.startsWith('style-src')) && inlineRuns.csp.console.some((line) => line.includes('стили не загрузились')), JSON.stringify(inlineRuns));

  // Контроль: прежний механизм адресов стилей (перечисление через map, 290e949) в той же сборке — сборщик не видит стили:
  // запросы мимо ассетов (404) и отказ вида. Архив собирается из копии пакета с прежней строкой.
  const oldSrc = path.join(tmp, 'old-src');
  for (const file of ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'example.html', 'manifest.json']) await cp(path.join(root, file), path.join(oldSrc, file));
  await cp(path.join(root, 'pet'), path.join(oldSrc, 'pet'), { recursive: true });
  const viewFile = path.join(oldSrc, 'pet', 'web', 'view.mjs');
  const viewText = await readFile(viewFile, 'utf8');
  const oldText = viewText.replace(/const packageStyles = \(\) => \[[\s\S]*?\];/, "const packageStyles = () => ['../pet-base.css', '../pet.css', '../dog.css', './view.css'].map((file) => new URL(file, import.meta.url).href);");
  await writeFile(viewFile, oldText);
  const oldPack = await pack(oldSrc, path.join(tmp, 'pack-old'));
  const old = path.join(tmp, 'old');
  await project(old, oldPack.path, { vite: VITE });
  await cp(path.join(root, 'examples', 'vite'), path.join(old, 'vite'), { recursive: true });
  await cp(path.join(root, 'examples', 'extension'), path.join(old, 'extension'), { recursive: true });
  const oldBuilt = await vite(old, ['build', 'vite', '--outDir', '../dist/vite', '--emptyOutDir']);
  {
    const server = await serve(path.join(old, 'dist', 'vite'), '/sites/old/');
    const { context, page } = await open(browser, server.origin, SIZES[0].options);
    try {
      await page.goto(`${server.origin}/sites/old/`);
      await page.waitForFunction(() => Boolean(window.viteDemo?.view));
      await page.waitForFunction(() => !window.viteDemo.view.mounted, null, { timeout: 5000 }).catch(() => {});
      const mounted = await page.evaluate(() => window.viteDemo.view.mounted);
      check('контроль (прежний механизм 290e949): адреса стилей перечислением — сборщик их не переносит: 404 стилей пакета и отказ вида', viewText !== oldText && oldBuilt.ok && !mounted && server.missing.some((url) => /\/sites\/old\/(pet-base|pet|dog)\.css$/.test(url)) && page.qaConsole.some((line) => line.includes('стили не загрузились')), JSON.stringify({ mounted, missing: server.missing, console: page.qaConsole }));
    } finally {
      await context.close();
      await server.close();
    }
  }

  // Сервер разработки Vite: зависимости предварительно собраны (node_modules/.vite/deps), стили — по адресам пакета.
  {
    const port = 5600 + Math.floor(Math.random() * 300);
    const child = spawn(process.execPath, [path.join(web, 'node_modules', 'vite', 'bin', 'vite.js'), 'vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: web, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (chunk) => (log += chunk));
    child.stderr.on('data', (chunk) => (log += chunk));
    try {
      const origin = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 100 && !log.includes('ready in'); i += 1) await new Promise((done) => setTimeout(done, 100));
      const { context, page } = await open(browser, origin, SIZES[0].options);
      const requested = [];
      page.on('request', (request) => requested.push(new URL(request.url()).pathname));
      try {
        await page.goto(`${origin}/`);
        await page.waitForFunction(() => Boolean(window.viteDemo?.view), null, { timeout: 30000 });
        await page.waitForFunction(() => document.querySelector('#pet > [data-pet-view]')?.shadowRoot?.querySelector('.pet-view')?.hidden === false, null, { timeout: 10000 }).catch(() => {});
        const view = await viewOf(page, '#pet');
        const prebundled = requested.some((url) => url.includes(`/node_modules/.vite/deps/${NAME}_web.js`));
        const own = view.links.slice(0, 4).map((link) => link.href);
        check('Vite dev (предварительная сборка зависимостей): вход /web — из node_modules/.vite/deps, стили вида — файлы установленного пакета node_modules/pet-companion/pet/ (загружены), вид готов, стили применены', prebundled && view.ready && view.box === 'absolute grid' && view.sheet === 'fixed' && ['pet-base.css', 'pet.css', 'dog.css', 'web/view.css'].every((file, i) => own[i]?.endsWith(`/node_modules/${NAME}/pet/${file}`)) && view.links.every((link) => link.loaded) && page.qaErrors.length === 0, JSON.stringify({ prebundled, view, requested: requested.filter((url) => url.includes('.vite')), console: page.qaConsole }));
      } finally {
        await context.close();
      }
    } finally {
      child.kill();
    }
  }

  // (2) Пример React: клиент и сервер собраны Vite из установленного архива; разметка сервера — в Node с ловушками.
  const app = path.join(r19, 'react');
  const client = await vite(r19, ['build', '--outDir', 'dist/client', '--emptyOutDir'], {}, app);
  const ssr = await vite(r19, ['build', '--ssr', 'src/server.jsx', '--outDir', 'dist/server', '--emptyOutDir'], {}, app);
  const trapped = `
    const names = ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'matchMedia', 'requestAnimationFrame', 'ResizeObserver', 'HTMLElement', 'customElements', 'location'];
    const touched = [];
    for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, get() { touched.push(name); throw new Error('обращение к ' + name); } });
    const loaded = [];
    const { registerHooks } = await import('node:module');
    registerHooks({ load(url, context, next) { if (url.includes('/node_modules/${NAME}/')) loaded.push(url.replace(/^.*node_modules\\//, '')); return next(url, context); } });
    const { render } = await import('./dist/server/server.js');
    const html = render();
    console.log(JSON.stringify({ html, touched, loaded }));`;
  const server19 = await run(process.execPath, ['--input-type=module', '-e', trapped], { cwd: app }).then(({ stdout }) => JSON.parse(stdout), (error) => ({ failed: error.stderr || error.message }));
  const prerender = await run(process.execPath, ['prerender.mjs'], { cwd: app }).then(() => true, (error) => error.stderr || error.message);
  const page19 = await readFile(path.join(app, 'dist', 'client', 'index.html'), 'utf8');
  // Единственное предупреждение сборки клиента — о директиве 'use client' входа React (граница серверных компонентов).
  const told = warnings(client.out);
  check(`пример React: сборка клиента — одно предупреждение Vite: MODULE_LEVEL_DIRECTIVE о 'use client' в pet/react.mjs (README, «Серверный рендер»), других нет`, told.length === 1 && /^MODULE_LEVEL_DIRECTIVE .*node_modules\/pet-companion\/pet\/react\.mjs$/.test(told[0]), JSON.stringify(told));
  check('пример React: vite build клиента и сервера (--ssr); сервер импортирует установленный pet-companion/react (pet/react.mjs) с ловушками браузерных глобалов — ни одного обращения; разметка — пустой контейнер и заглушка, она же в странице', client.ok && ssr.ok && prerender === true && server19.touched?.length === 0 && server19.loaded?.includes(`${NAME}/pet/react.mjs`) && server19.html === `<div class="pet"></div><p>${PLACEHOLDER}</p>` && page19.includes(`<div id="root">${server19.html}</div>`), JSON.stringify({ client: client.ok || client.out, ssr: ssr.ok || ssr.out, prerender, server19 }));
  for (const { label, options } of SIZES) {
    const server = await serve(path.join(app, 'dist', 'client'), '/apps/react/');
    const { context, page, external } = await open(browser, server.origin, options);
    try {
      const response = await page.goto(`${server.origin}/apps/react/`);
      const initial = await response.text();
      await page.waitForFunction(() => document.querySelector('#root p')?.textContent !== 'Питомец появится после загрузки страницы.', null, { timeout: 10000 }).catch(() => {});
      await page.waitForFunction(() => document.querySelector('.pet > [data-pet-view]')?.shadowRoot?.querySelector('.pet-view')?.hidden === false, null, { timeout: 5000 }).catch(() => {});
      const after = await page.evaluate(() => ({ text: document.querySelector('#root p')?.textContent, roots: document.querySelectorAll('#root > *').length }));
      const view = await viewOf(page, '.pet');
      const played = await playThrough(page, '.pet', Boolean(options.hasTouch));
      check(`пример React ${label}: hydrateRoot разметки сервера — без ошибок гидратации и сообщений консоли; после эффекта заглушка сменилась строкой снимка, питомец в контейнере, стили применены; уголок и «Поиграть»`, initial.includes(`<div class="pet"></div><p>${PLACEHOLDER}</p>`) && after.text === 'Марс: рядом' && after.roots === 2 && view.hosts === 1 && view.ready && view.sheet === 'fixed' && played.hint === 'Марс мурлычет.' && page.qaErrors.length === 0 && page.qaConsole.length === 0 && server.missing.length === 0 && external.length === 0 && !server.served.some((url) => /node_modules|\/pet\//.test(url)), JSON.stringify({ after, view, played, ...clean(page, external, server) }));
    } catch (error) {
      check(`пример React ${label}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
      await server.close();
    }
  }

  // (4) Только ядро в проекте с React: в сборке ни React, ни веба (Shadow DOM, localStorage), ни CSS.
  await mkdir(path.join(r19, 'core'));
  await writeFile(path.join(r19, 'core', 'index.html'), '<!doctype html>\n<html lang="ru"><head><meta charset="utf-8" /><title>Ядро</title><script type="module" src="./main.js"></script></head><body><p id="out"></p></body></html>\n');
  await writeFile(
    path.join(r19, 'core', 'main.js'),
    "import { calm } from 'pet-companion/behaviors';\nimport { createPetCore, createStorage } from 'pet-companion/core';\nimport { cat, dog } from 'pet-companion/pets';\n\nconst data = new Map();\nconst storage = createStorage({ namespace: 'core-only', backend: { get: (name) => data.get(name) ?? null, set: (name, text) => data.set(name, text) } });\nstorage.load();\nconst pet = createPetCore({ storage, pets: [cat, dog], behaviors: [calm] });\npet.start();\npet.setName('Пиксель');\ndocument.getElementById('out').textContent = pet.getState().name.display;\n",
  );
  const coreBuilt = await vite(r19, ['build', 'core', '--outDir', '../dist/core', '--emptyOutDir', '--base', './']);
  const coreOut = await files(path.join(r19, 'dist', 'core'));
  const coreJs = (await Promise.all(coreOut.filter((file) => file.endsWith('.js')).map((file) => readFile(path.join(r19, 'dist', 'core', file), 'utf8')))).join('\n');
  {
    const server = await serve(path.join(r19, 'dist', 'core'), '/apps/core/');
    const { context, page } = await open(browser, server.origin, SIZES[0].options);
    try {
      await page.goto(`${server.origin}/apps/core/`);
      await page.waitForFunction(() => document.getElementById('out').textContent !== '');
      check('только ядро (проект с установленным React): сборка без React, хука и веба (react.production, useSyncExternalStore, attachShadow, localStorage), без CSS; ядро работает в браузере', coreBuilt.ok && !/react\.production|useSyncExternalStore|attachShadow|localStorage|mountPetIn/.test(coreJs) && coreOut.every((file) => !file.endsWith('.css')) && (await page.evaluate(() => document.getElementById('out').textContent)) === 'Пиксель' && page.qaErrors.length === 0, JSON.stringify({ out: coreOut, built: coreBuilt.ok || coreBuilt.out }));
    } finally {
      await context.close();
      await server.close();
    }
  }

  // (3) Жизненный цикл React: development (StrictMode) и production, React 19 и 18.
  for (const major of [19, 18]) {
    const dir = major === 19 ? r19 : r18;
    for (const mode of ['development', 'production']) {
      const tag = `React ${sites[major].versions.react} ${mode}`;
      const base = `/qa/react${major}-${mode}/`;
      const outDir = path.join('dist', `qa-${mode}`);
      const builtQa = await vite(dir, ['build', 'react-app', '--outDir', `../${outDir}`, '--emptyOutDir', '--base', base, '--mode', mode, '--assetsInlineLimit', '0'], { NODE_ENV: mode });
      const pre = await run(process.execPath, [path.join('react-app', 'prerender.mjs'), outDir], { cwd: dir }).then(({ stdout }) => JSON.parse(stdout), (error) => ({ failed: error.stderr || error.message }));
      const dev = mode === 'development';
      check(`${tag}: сборка ${mode} (base ${base}); серверный рендер страницы в Node с ловушками браузерных глобалов — без обращений и сообщений; разметка — пустой контейнер и null`, builtQa.ok && /<div class="pet-box"><\/div><p id="pet-state">Питомец появится после загрузки страницы\.<\/p>/.test(pre.full ?? '') && !(pre.empty ?? '').includes('pet-box') && pre.touched?.length === 0 && pre.calls?.length === 0, JSON.stringify({ built: builtQa.ok || builtQa.out, pre }));
      await lifecycle(browser, path.join(dir, outDir), base, tag, dev);
    }
  }

  // (5) Типы /react из установленного архива.
  await typesCheck(r19, 19);
  await typesCheck(r18, 18);
} catch (error) {
  check('потребители: сценарий выполнен', false, error.stack);
} finally {
  await browser?.close();
  await rm(tmp, { recursive: true, force: true });
}

// Жизненный цикл на собранной странице test/react-app (dir — папка сборки с index.html и empty.html от prerender.mjs).
async function lifecycle(browser, dir, base, tag, dev) {
  const pairs = dev ? 'StrictMode: двойной эффект' : 'без двойного эффекта';
  // index.html: гидратация с питомцем; в хранилище заранее подтверждённое имя «Пиксель».
  for (const { label, options } of SIZES) {
    const full = label === '1280×900';
    const server = await serve(dir, base);
    const { context, page, external } = await open(browser, server.origin, options);
    await context.addInitScript(() => {
      if (!sessionStorage.getItem('qa-seeded')) {
        sessionStorage.setItem('qa-seeded', '1');
        localStorage.setItem('qa:cat:v1', JSON.stringify({ v: 1, name: 'Пиксель' }));
      }
    });
    const name = `${tag} ${label}`;
    const state = () => page.evaluate(() => window.qa.state());
    const call = (fn, arg) => page.evaluate(fn, arg);
    // React применяет setState пульта и эффекты асинхронно: ждать итог (все ядра отключены / вид готов).
    const settled = () => page.waitForFunction(() => window.qa.state().views === 0 && window.qa.state().statuses.every((status) => status === 'destroyed'), null, { timeout: 5000 }).catch(() => {});
    const ready = () => page.waitForFunction(() => document.querySelector('.pet-box > [data-pet-view]')?.shadowRoot?.querySelector('.pet-view')?.hidden === false, null, { timeout: 5000 }).catch(() => {});
    try {
      const response = await page.goto(`${server.origin}${base}`);
      const html = await response.text();
      await page.waitForFunction(() => window.qa?.state().views === 1 && document.getElementById('pet-state').textContent.includes('|'), null, { timeout: 10000 }).catch(() => {});
      await page.waitForFunction(() => document.querySelector('.pet-box > [data-pet-view]')?.shadowRoot?.querySelector('.pet-view')?.hidden === false, null, { timeout: 5000 }).catch(() => {});
      let s = await state();
      const view = await viewOf(page, '.pet-box');
      const cores = dev ? [1, null, 2] : [1];
      check(`${name}: hydrateRoot разметки сервера — без восстанавливаемых ошибок и сообщений консоли; ${pairs} — onCore ${JSON.stringify(cores)}, null — до отключения (ядро running, вид в контейнере); живёт ровно один вид, стили применены`, html.includes(`<div class="pet-box"></div><p id="pet-state">${PLACEHOLDER}</p>`) && JSON.stringify(s.log.map((entry) => entry.core)) === JSON.stringify(cores) && (!dev || (s.log[1].prev === 'running' && s.log[1].views === 1)) && s.views === 1 && s.added === (dev ? 2 : 1) && JSON.stringify(s.statuses) === JSON.stringify(dev ? ['destroyed', 'running'] : ['running']) && view.ready && view.sheet === 'fixed' && s.recoverable.length === 0 && page.qaErrors.length === 0 && page.qaConsole.length === 0, JSON.stringify({ s, view, errors: page.qaErrors, console: page.qaConsole }));
      const live = dev ? 2 : 1;
      // U01: персонаж минимального режима на той же странице — свой экземпляр без хранения; серверная разметка — заглушка.
      await page.waitForFunction(() => document.querySelector('.hero-box > [data-pet-character]')?.shadowRoot?.querySelector('.pet-character')?.hidden === false && document.getElementById('hero-state').textContent === 'Бип|calm|started', null, { timeout: 5000 }).catch(() => {});
      s = await state();
      const heroBefore = { heroes: s.heroes, text: s.heroText, log: s.heroLog, status: s.heroStatus };
      const reacted = await call(() => window.qa.hero().react('done', { key: 'qa-1' }));
      await page.waitForFunction(() => document.getElementById('hero-state').textContent === 'Бип|happy|started', null, { timeout: 5000 }).catch(() => {});
      s = await state();
      check(`${name}: персонаж (U01) — серверная разметка с заглушкой, после эффекта один вид в контейнере (${pairs} — onCore ${JSON.stringify(dev ? ['core', null, 'core'] : ['core'])}), хук — «Бип|calm|started»; событие продукта — поза happy в хуке и в рисунке; ни ключей персонажа в localStorage`, html.includes(`<div class="hero-box"></div><p id="hero-state">${HERO_PLACEHOLDER}</p>`) && heroBefore.heroes === 1 && heroBefore.text === 'Бип|calm|started' && JSON.stringify(heroBefore.log) === JSON.stringify(dev ? ['core', null, 'core'] : ['core']) && heroBefore.status === 'started' && reacted.ok && reacted.played && s.heroText === 'Бип|happy|started' && (await page.evaluate(() => document.querySelector('.hero-box > [data-pet-character]').shadowRoot.querySelector('svg').dataset.pose)) === 'happy' && (await page.evaluate(() => Object.keys(localStorage).every((key) => key.startsWith('qa')))), JSON.stringify({ heroBefore, reacted, heroText: s.heroText }));
      await page.clock.runFor(2000);
      // По проверке Codex: строка подписи, функция подписи и появление/снятие onActivate — живому виду без пересоздания.
      const liveProps = await page.evaluate(async () => {
        const wait = () => new Promise((resolve) => setTimeout(resolve, 30));
        const coreBefore = window.qa.hero();
        const out = {};
        window.qa.heroProps({ label: 'Первая подпись', onActivate: null });
        await wait();
        out.first = window.qa.heroFigure();
        window.qa.heroProps({ label: 'Вторая подпись', onActivate: null });
        await wait();
        out.second = window.qa.heroFigure();
        window.qa.heroProps({ label: (state) => `${state.name.display}: функция`, onActivate: null });
        await wait();
        out.fn = window.qa.heroFigure();
        window.qaHeroClicks = 0;
        window.qa.heroProps({ label: (state) => `${state.name.display}: функция`, onActivate: () => (window.qaHeroClicks += 1) });
        await wait();
        out.button = window.qa.heroFigure();
        document.querySelector('.hero-box > [data-pet-character]').shadowRoot.querySelector('.pet-character-figure').click();
        out.clicks = window.qaHeroClicks;
        window.qa.heroProps({ label: undefined, onActivate: null });
        await wait();
        out.plain = window.qa.heroFigure();
        out.sameCore = window.qa.hero() === coreBefore && coreBefore.status === 'started';
        return out;
      });
      check(`${name}: живые свойства персонажа — вторая строка подписи и функция применяются к тому же экземпляру, onActivate после подключения делает рисунок кнопкой (нажатие — действие), снятие — снова рисунок; персонаж не пересоздан`, liveProps.first?.label === 'Первая подпись' && liveProps.first.tag === 'DIV' && liveProps.second?.label === 'Вторая подпись' && liveProps.fn?.label === 'Бип: функция' && liveProps.button?.tag === 'BUTTON' && liveProps.button.svg === 1 && liveProps.clicks === 1 && liveProps.plain?.tag === 'DIV' && liveProps.plain.role === 'img' && liveProps.plain.label === 'Бип — Робот' && liveProps.sameCore === true, JSON.stringify(liveProps));
      check(`${name}: подписка хука — с initial: false (без синхронной доставки), на живом ядре одна${dev ? ', на отключённом core1 активной нет (onCore двойного эффекта — один рендер)' : ''}; подтверждённое имя после подключения — «Пиксель»`, s.subs[live]?.active === 1 && s.subs[live].options.every((one) => one === '{"initial":false}') && s.subs[live].early === 0 && (!dev || !(s.subs[1]?.active > 0)) && s.text === 'Пиксель|1|running', JSON.stringify({ subs: s.subs, text: s.text }));
      // Повторный destroy core1: в development — уже отключённое ядро StrictMode (безопасно, живое не тронуто); в production —
      // живое ядро страницы (прямое отключение, проверка ниже).
      const again = await call((n) => {
        const first = window.qa.core(1);
        first.destroy();
        return { first: first.status, live: window.qa.core(n).status };
      }, live);
      await page.clock.runFor(100);
      s = await state();
      if (dev) check(`${name}: повторный destroy() отключённого core1 — безопасен, живое core2 не тронуто, вид на месте`, again.first === 'destroyed' && again.live === 'running' && s.views === 1 && JSON.stringify(s.log.map((entry) => entry.core)) === '[1,null,2]', JSON.stringify({ again, s }));
      if (!dev) {
        // В production без двойного эффекта core1 — живое ядро страницы; destroy выше его отключил: сайту null, вид снят.
        check(`${name}: прямой core.destroy() — onCore(null) после отключения (ядро destroyed), хук null — и у сайта, который держит ссылку на отключённое ядро; вид снят`, JSON.stringify(s.log.map((entry) => entry.core)) === '[1,null]' && s.log[1].prev === 'destroyed' && s.text === PLACEHOLDER && s.held === PLACEHOLDER && s.views === 0, JSON.stringify(s));
        await call(() => window.qa.set({ tag: 'A', namespace: 'qa-x' }));
        await call(() => window.qa.set({ tag: 'A', namespace: 'qa' }));
        await page.waitForFunction(() => window.qa.state().views === 1).catch(() => {});
        await ready();
      }
      if (!full) {
        // Телефон по ширине: касание питомца — уголок; без горизонтальной прокрутки; размонтирование — ни вида, ни подписок.
        await page.clock.runFor(1000);
        await page.locator('.pet-box .cat-view-btn').tap();
        const opened = await viewOf(page, '.pet-box');
        await page.keyboard.press('Escape');
        await page.clock.runFor(200);
        await call(() => window.qa.show(false));
        await settled();
        s = await state();
        check(`${name}: касание — уголок открыт, без горизонтальной прокрутки; размонтирование — ни вида, ни активных подписок, все ядра отключены; персонаж — снят, экземпляр destroyed, onCore(null), хук — заглушка`, opened.open && (await overflow(page)) <= 0 && s.views === 0 && Object.values(s.subs).every((stat) => stat.active === 0) && s.statuses.every((status) => status === 'destroyed') && s.heroes === 0 && s.heroStatus === 'destroyed' && s.heroLog.at(-1) === null && s.heroText === HERO_PLACEHOLDER, JSON.stringify({ opened, s }));
        continue;
      }
      // Новые функции и progress при рендере: без пересоздания, без onCore, без обновлений и награды; refresh — новый счёт.
      const before = await state();
      await call(() => {
        window.qaEffects = [];
        const core = window.qa.qa.cores.findLast((one) => one.status === 'running');
        core.subscribe((update) => window.qaEffects.push(...update.effects.map((effect) => effect.type)), { initial: false });
        window.qa.set({ tag: 'B', marks: 5 });
      });
      await page.clock.runFor(100);
      s = await state();
      const liveId = s.statuses.lastIndexOf('running') + 1;
      const quiet = { added: s.added === before.added, log: s.log.length === before.log.length, text: s.text, deliveries: s.subs[liveId].deliveries === before.subs[liveId].deliveries };
      const refreshed = await call((n) => {
        const core = window.qa.core(n);
        const result = core.refresh();
        return { ok: result.ok, marks: core.getState().progress.marks, reaction: core.getState().pose.reaction, effects: [...window.qaEffects] };
      }, liveId);
      await page.clock.runFor(100);
      s = await state();
      check(`${name}: новые progress/home/onOpenChange/onCore при рендере — тот же вид (без mount/destroy и onCore), снимок не меняется сам; core.refresh() читает новый progress — счёт 5, без праздника и реакции`, quiet.added && quiet.log && quiet.text === 'Пиксель|1|running' && quiet.deliveries && refreshed.ok && refreshed.marks === 5 && refreshed.reaction === null && !refreshed.effects.includes('celebrate') && s.text === 'Пиксель|5|running', JSON.stringify({ quiet, refreshed, text: s.text }));
      await call((n) => window.qa.core(n).open('corner'), liveId);
      await page.clock.runFor(100);
      await call((n) => window.qa.core(n).close(), liveId);
      await page.clock.runFor(100);
      s = await state();
      const opens = s.log.filter((entry) => 'open' in entry).map((entry) => `${entry.open}:${entry.tag}`);
      check(`${name}: open/close ядра — onOpenChange последнего рендера (метка B)`, JSON.stringify(opens) === '["true:B","false:B"]', JSON.stringify(opens));
      // Без бесконечных обновлений: 20 с покоя — рендеров не больше, чем доставок ядра (×2 в StrictMode), предупреждений нет.
      const idle = await state();
      await page.clock.runFor(20000);
      s = await state();
      const renders = s.renders - idle.renders;
      const deliveries = s.subs[liveId].deliveries - idle.subs[liveId].deliveries;
      check(`${name}: 20 с покоя — рендеров ${renders} при ${deliveries} обновлениях ядра (снимок стабилен, бесконечных обновлений нет), консоль чиста`, renders <= (deliveries + 1) * (dev ? 2 : 1) && page.qaConsole.length === 0, JSON.stringify({ renders, deliveries, console: page.qaConsole }));
      // Смена namespace с фокусом внутри вида: прежнее ядро отключено (null — пока оно ещё running), фокус — home() последнего
      // рендера (#home-C); новое — своё пространство; старое не пишет.
      const logBefore = s.log.length;
      await ready();
      await page.evaluate(() => document.querySelector('.pet-box > [data-pet-view]').shadowRoot.querySelector('.cat-view-btn').focus());
      await call(() => window.qa.set({ tag: 'C', namespace: 'qa-b', marks: 5 }));
      await page.waitForFunction(() => window.qa.state().views === 1 && window.qa.state().text.startsWith('Марс')).catch(() => {});
      const homeFocus = await page.evaluate(() => document.activeElement?.id ?? null);
      s = await state();
      const added = s.log.slice(logBefore).filter((entry) => !('open' in entry));
      const nextId = s.statuses.length;
      const isolated = await call(([was, now]) => {
        const old = window.qa.core(was).setName('Чужой');
        const fresh = window.qa.core(now).setName('Бэ');
        return { old: old.ok ? 'ok' : old.error.code, fresh: fresh.ok ? fresh.save.status : fresh.error.code, a: JSON.parse(localStorage.getItem('qa:cat:v1')).name, b: JSON.parse(localStorage.getItem('qa-b:cat:v1')).name };
      }, [liveId, nextId]);
      await page.waitForFunction(() => window.qa.state().text.startsWith('Бэ|')).catch(() => {});
      s = await state();
      check(`${name}: смена namespace с фокусом внутри — onCore(null) до отключения (ядро running, вид в контейнере), фокус — home() последнего рендера (#home-C), затем новое ядро; прежнее отключено, подписка хука снята, новая одна; новое пространство (имя по умолчанию), прежнее ядро — destroyed и не пишет`, homeFocus === 'home-C' && JSON.stringify(added.map((entry) => entry.core)) === `[null,${nextId}]` && added[0].prev === 'running' && added[0].views === 1 && added.every((entry) => entry.tag === 'C') && s.statuses[liveId - 1] === 'destroyed' && s.subs[liveId].active === 0 && s.subs[nextId]?.active === 1 && s.views === 1 && isolated.old === 'destroyed' && isolated.fresh === 'saved' && isolated.a === 'Пиксель' && isolated.b === 'Бэ' && s.text.startsWith('Бэ|'), JSON.stringify({ homeFocus, added, isolated, statuses: s.statuses, subs: s.subs, text: s.text }));
      // Прямой core.destroy() при сохранённой ссылке: хук null (и у сайта, который ссылку не сбрасывает), onCore(null) после
      // отключения, вид снят; 30 с — не оживает.
      const heldBefore = s.held;
      await call((n) => window.qa.core(n).destroy(), nextId);
      await page.waitForFunction(() => window.qa.state().text === 'Питомец появится после загрузки страницы.').catch(() => {});
      s = await state();
      const dead = { last: s.log.at(-1), text: s.text, held: s.held, heldBefore, views: s.views, subs: s.subs[nextId].active, log: s.log.length, added: s.added };
      await page.clock.runFor(30000);
      s = await state();
      check(`${name}: прямой core.destroy() — хук null, onCore(null) (ядро уже destroyed), вид снят, подписка снята; сайт, который держит ссылку на отключённое ядро, тоже получает null; 30 с — без позднего оживления`, dead.last.core === null && dead.last.prev === 'destroyed' && dead.text === PLACEHOLDER && dead.heldBefore === 'Бэ|running' && dead.held === PLACEHOLDER && dead.views === 0 && dead.subs === 0 && s.views === 0 && s.held === PLACEHOLDER && s.added === dead.added && s.log.length === dead.log, JSON.stringify({ dead, s }));
      // Возврат namespace — новое ядро с подтверждённым именем «Пиксель»; cleanup отключённого ничего не говорит сайту.
      const logged = s.log.length;
      await call(() => window.qa.set({ tag: 'B', namespace: 'qa', marks: 1 }));
      await page.waitForFunction(() => window.qa.state().views === 1 && window.qa.state().text.startsWith('Пиксель')).catch(() => {});
      s = await state();
      const back = s.log.slice(logged);
      check(`${name}: снова namespace qa — одно onCore(новое ядро) без лишнего null; подтверждённое имя «Пиксель»`, back.length === 1 && back[0].core === s.statuses.length && s.text === 'Пиксель|1|running', JSON.stringify(back));
      // Размонтирование: React убирает контейнер из документа раньше эффектов, поэтому onCore(null) «до отключения» —
      // ядро ещё running; затем ни вида, ни подписок. Фокус внутри убранного контейнера браузер вернул странице (body).
      await ready();
      const focusedIn = await page.evaluate(() => {
        const host = document.querySelector('.pet-box > [data-pet-view]');
        host.shadowRoot.querySelector('.cat-view-btn').focus();
        return document.activeElement === host;
      });
      const unmountFrom = s.log.length;
      await call(() => window.qa.show(false));
      await settled();
      s = await state();
      const gone = s.log.slice(unmountFrom);
      const focus = await page.evaluate(() => (document.activeElement === document.body ? 'body' : (document.activeElement?.id ?? document.activeElement?.tagName ?? null)));
      check(`${name}: размонтирование (фокус был в виде) — onCore(null) до отключения (ядро running), затем ни вида, ни активных подписок, все ядра destroyed; фокус — у страницы (body); персонаж — снят, экземпляр destroyed, хук — заглушка`, focusedIn && gone.length === 1 && gone[0].core === null && gone[0].prev === 'running' && s.views === 0 && Object.values(s.subs).every((stat) => stat.active === 0) && s.statuses.every((status) => status === 'destroyed') && focus === 'body' && s.heroes === 0 && s.heroStatus === 'destroyed' && s.heroText === HERO_PLACEHOLDER, JSON.stringify({ gone, focus, s }));
      // Отказ подключения: неизвестное свойство и children — console.error с причиной, onCore(null), вида нет; без лишних вызовов при снятии.
      for (const [extra, reason] of [
        [{ places: {} }, 'неизвестная настройка: places'],
        [{ children: 'текст' }, 'неизвестная настройка: children'],
      ]) {
        const from = s.log.length;
        const consoleFrom = page.qaConsole.length;
        await call((own) => window.qa.set({ tag: 'B', extra: own }), extra);
        await call(() => window.qa.show(true));
        await page.clock.runFor(100);
        s = await state();
        const told = s.log.slice(from);
        const refusals = page.qaConsole.slice(consoleFrom);
        await call(() => window.qa.show(false));
        await page.clock.runFor(100);
        const after = await state();
        check(`${name}: отказ (${Object.keys(extra)[0]}) — ${dev ? 'дважды (двойной эффект) ' : ''}console.error «${reason}», onCore(null), вида нет, хук null; снятие — без новых вызовов`, told.length === (dev ? 2 : 1) && told.every((entry) => entry.core === null && entry.views === 0) && refusals.length === told.length && refusals.every((line) => line.startsWith('error: Питомец не подключён') && line.includes(reason)) && s.views === 0 && s.text === PLACEHOLDER && after.log.length === s.log.length, JSON.stringify({ told, refusals }));
        page.qaConsole.splice(consoleFrom);
        s = after;
      }
      check(`${name}: без ошибок страницы и внешних запросов; запросы — только сборка (нет 404, node_modules, pet/)`, page.qaErrors.length === 0 && external.length === 0 && server.missing.length === 0 && !server.served.some((url) => /node_modules|\/pet\//.test(url)), JSON.stringify(clean(page, external, server)));
    } catch (error) {
      check(`${name}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
      await server.close();
    }
  }

  // empty.html: база ресурсов без питомца → подключение → открытый уголок → размонтирование — ресурсы как в базе.
  {
    const server = await serve(dir, base);
    const { context, page } = await open(browser, server.origin, SIZES[0].options);
    const name = `${tag} 1280×900`;
    try {
      await page.goto(`${server.origin}${base}empty.html`);
      await page.waitForFunction(() => Boolean(window.qa));
      await page.clock.runFor(1000);
      const baseline = await resources(page);
      await page.evaluate(() => window.qa.show(true));
      await page.waitForFunction(() => document.querySelector('.pet-box > [data-pet-view]')?.shadowRoot?.querySelector('.pet-view')?.hidden === false, null, { timeout: 5000 }).catch(() => {});
      await page.clock.runFor(3000);
      await page.locator('.pet-box .cat-view-btn').click();
      const during = await resources(page);
      await page.keyboard.press('Escape');
      await page.clock.runFor(200);
      const s1 = await page.evaluate(() => window.qa.state());
      await page.evaluate(() => window.qa.show(false));
      await page.clock.runFor(1000);
      const after = await resources(page);
      const s2 = await page.evaluate(() => window.qa.state());
      const cores = dev ? [1, null, 2, null] : [1, null];
      check(`${name}: подключение после гидратации (${pairs}) и размонтирование — onCore ${JSON.stringify(cores)}; ресурсы страницы (слушатели document/window, таймеры, интервалы, кадры, наблюдатели размеров, медиазапросы) — как до подключения`, JSON.stringify(s2.log.filter((entry) => !('open' in entry)).map((entry) => entry.core)) === JSON.stringify(cores) && s1.views === 1 && s2.views === 0 && during.observers > baseline.observers && JSON.stringify(after) === JSON.stringify(baseline) && page.qaErrors.length === 0 && page.qaConsole.length === 0, JSON.stringify({ baseline, during, after, log: s2.log, console: page.qaConsole }));
    } catch (error) {
      check(`${name}: база ресурсов — сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
      await server.close();
    }
  }

  // Поздняя ошибка CSS (стиль вида не загрузился): вид отключается, onCore(null), хук null; без оживления.
  {
    const server = await serve(dir, base);
    const { context, page } = await open(browser, server.origin, SIZES[0].options);
    await page.route(/\/assets\/view-[\w-]+\.css$/, (route) => route.abort());
    const name = `${tag} 1280×900`;
    try {
      await page.goto(`${server.origin}${base}`);
      await page.waitForFunction(() => window.qa?.state().log.some((entry) => entry.core !== null) && window.qa.state().views === 0, null, { timeout: 10000 }).catch(() => {});
      await page.clock.runFor(10000);
      const s = await page.evaluate(() => window.qa.state());
      const cores = s.log.map((entry) => entry.core);
      check(`${name}: поздняя ошибка CSS вида — «стили не загрузились», вид отключён, onCore(null) после отключения (destroyed), хук null; 10 с — без оживления`, JSON.stringify(cores) === JSON.stringify(dev ? [1, null, 2, null] : [1, null]) && s.log.at(-1).prev === 'destroyed' && s.views === 0 && s.text === PLACEHOLDER && s.held === PLACEHOLDER && s.statuses.every((status) => status === 'destroyed') && page.qaConsole.some((line) => line.includes('стили не загрузились')) && s.recoverable.length === 0, JSON.stringify({ s, console: page.qaConsole }));
    } catch (error) {
      check(`${name}: поздняя ошибка CSS — сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
      await server.close();
    }
  }
}

// Типы входа /react установленного архива (@types/react проекта): bundler и nodenext, jsx react-jsx.
async function typesCheck(dir, major) {
  await writeFile(
    path.join(dir, 'react.tsx'),
    `import { useState } from 'react';
import { calm } from '${NAME}/behaviors';
import type { PetCore, PetSnapshot } from '${NAME}/core';
import { cat, dog } from '${NAME}/pets';
import { PetCompanion, usePetState, type PetCompanionProps } from '${NAME}/react';
import { catWeb, dogWeb } from '${NAME}/web';

export function Corner() {
  const [core, setCore] = useState<PetCore | null>(null);
  const pet: PetSnapshot | null = usePetState(core);
  const name: string = pet ? pet.name.display : '';
  const props: PetCompanionProps = { namespace: 'site', pets: [cat, dog], behaviors: [calm], kits: [catWeb, dogWeb], watchTyping: false, progress: () => ({ marks: 1, today: 1, limit: 3 }), home: () => null, onOpenChange: (open: boolean) => void open, onCore: setCore, className: 'pet' };
  return (
    <>
      <PetCompanion {...props} />
      <PetCompanion />
      <PetCompanion namespace="other" onCore={(next) => next?.feed()} />
      <p>{name}</p>
      {/* @ts-expect-error детей у контейнера нет — содержимым управляет библиотека */}
      <PetCompanion>текст</PetCompanion>
      {/* @ts-expect-error namespace — строка */}
      <PetCompanion namespace={3} />
      {/* @ts-expect-error места сайта — не свойство */}
      <PetCompanion places={{}} />
      {/* @ts-expect-error onCore получает и null */}
      <PetCompanion onCore={(next: PetCore) => next.feed()} />
      {/* @ts-expect-error watchTyping — boolean */}
      <PetCompanion watchTyping="no" />
    </>
  );
}

export function Wrong() {
  // @ts-expect-error снимок может быть null
  const display: string = usePetState(null).name.display;
  // @ts-expect-error ядро — PetCore или null
  usePetState('core');
  // @ts-expect-error снимок только для чтения
  const touched = (usePetState(null) as PetSnapshot).status = 'running';
  return <p>{display}{touched}</p>;
}
`,
  );
  await writeFile(path.join(dir, 'react-paths.mts'), `import '${NAME}/pet/react.mjs';\nimport '${NAME}/pet/hooks/state.mjs';\nimport '${NAME}/hooks';\nexport {};\n`);
  const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  for (const [module, resolution] of [
    ['nodenext', 'nodenext'],
    ['esnext', 'bundler'],
  ]) {
    const types = (file) =>
      run(process.execPath, [tsc, '--noEmit', '--strict', '--target', 'es2022', '--lib', 'es2022,dom', '--jsx', 'react-jsx', '--module', module, '--moduleResolution', resolution, '--noUncheckedSideEffectImports', file], { cwd: dir }).then(
        () => '',
        (error) => error.stdout || error.message,
      );
    const result = await types('react.tsx');
    check(`TypeScript (${resolution}, @types/react ${major === 19 ? REACT[19].types : REACT[18].types}): pet-companion/react — PetCompanion, свойства и onCore(PetCore | null), usePetState → PetSnapshot | null; дети, неверные свойства и аргументы, снимок только для чтения — ошибки (8 @ts-expect-error)`, result === '', result);
    const closed = await types('react-paths.mts');
    const errors = [...closed.matchAll(/^react-paths\.mts\((\d+),\d+\): error (TS\d+)/gm)].map(([, line, code]) => `${line} ${code}`);
    check(`TypeScript (${resolution}): внутренние пути React (pet/react.mjs, pet/hooks/state.mjs, hooks) закрыты — TS2307`, JSON.stringify(errors) === JSON.stringify(['1 TS2307', '2 TS2307', '3 TS2307']), closed);
  }
}

console.log(`\nОкружение: ${JSON.stringify(env)}`);
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено`);
process.exit(failed.length ? 1 : 0);
