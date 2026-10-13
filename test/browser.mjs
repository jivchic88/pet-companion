// Модуль питомца в браузере без сайта-источника: стенд test/stand.html — условный сайт со своей разметкой и своими
// классами .btn, .muted, .visually-hidden, h2; свой мини-сервер отдаёт только стенд, файлы модуля (pet/) и фикстуру
// версий 0.1.1 и 0.1.4 (test/fixtures/). Проверки: подключение кота и собаки, уголок и «Поиграть», поглаживание,
// лапа, миска и мячик, клавиатура и Esc, следующий шаг сайта, сохранение настроек после перезагрузки, состояние и события
// сайта (знаки, ступень, лакомство, тишина таймера), своё пространство имён хранения (localStorage и IndexedDB),
// отключение (элементы, отметки html, слушатели document, window и медиазапросов, отложенные вызовы, события storage,
// методы прежнего экземпляра) и повторное подключение без дублей, стили и разметка сайта не меняются, ошибок нет;
// телефон — питомец в шапке, «Скрыть» и «Показать» из меню сайта. Позднее завершение транзакции сценки после
// отключения (управляемый шлюз IndexedDB; другое и то же пространство имён, ветка lost); пример подключения из README как
// есть — «Скрыть», перезагрузка, «Показать …» и «Приходит по зову» на телефоне; переходы следующего шага (нет ↔ шаг) при
// вводе имени, с фокусом на ссылке и прокруткой. Отказ подключения (место вставило элемент и выбросило исключение, место
// выбросило до вставки, progress() выбросил при запуске, неверные места и настройки, вложенное подключение) — ни
// элементов, ни отметок, ни слушателей, сайт не тронут, методы неудачного экземпляра пустые, затем обычное подключение
// без дублей; две копии модуля по разным адресам (/pet/ и /pet2/) — один питомец, отключение прежнего не задевает нового,
// отложенное прежней копии молчит; версия 0.1.1 (/old/) — новая копия отказывает; стили сайта до и после CSS модуля и
// подключения — минимальный сайт и сайт с общими правилами button, input, h2, dialog; сохранность данных (PL02) —
// test/browser-storage.mjs. Часы — page.clock (таймеры модуля — по runFor). Запуск: npm run test:browser (нужен
// установленный Google Chrome).
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { VERSION } from '../pet/pet.mjs';
import { storageKeys } from '../pet/pet-rules.mjs';
import { storageQa } from './browser-storage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
// Версия 0.1.1 (до реестра страницы) — фикстура: те же файлы, что выпуск 0.1.1 (test/fixtures/pet-0.1.1/README.md).
const OLD = path.join(root, 'test', 'fixtures', 'pet-0.1.1');
// Версия 0.1.4 (до PL02) — фикстура для смешанных версий хранения (test/fixtures/pet-0.1.4/README.md).
const OLD14 = path.join(root, 'test', 'fixtures', 'pet-0.1.4');
const K = storageKeys('stand');
const START = new Date('2026-10-11T10:00:00');
const DAY = '2026-10-11';
const MODULE = '.cat-dock, .cat-side, .cat-face, .cat-fold, .cat-float, .cat-bar, .cat-sheet, .cat-sections-return, .pet-zones, .pet-ghost, #cat-live';
// Разметка и стили сайта, которые модуль не должен менять.
const FOREIGN = ['body', '#site-title', '#site-menu', '#site-check', '#site-main h2', '#site-main .muted', '#site-side .muted', '#site-main .visually-hidden', '#site-input'];
const PROPS = ['color', 'background-color', 'font-family', 'font-size', 'font-style', 'font-weight', 'padding', 'margin', 'border', 'border-radius', 'display', 'position', 'box-sizing', 'min-height', 'filter', 'opacity', 'outline'];

// Пример подключения из README модуля — как есть (первый блок html).
const readmeExample = async () => /```html\n([\s\S]*?)\n```/.exec(await readFile(path.join(root, 'README.md'), 'utf8'))[1];

// Страница проверки стилей: разметка сайта без CSS модуля; rules — общие правила сайта по тегам. CSS модуля и питомец —
// по команде сценария (qaCss, qaMount).
const SITE_RULES = `body { margin: 0; font: 17px/1.6 Georgia, serif; color: #1d1d1f; background: #fffaf0; }
button { padding: 12px 28px; border: 3px solid #333; border-radius: 0; background: #ffd400; color: #111; font: 700 18px/1.2 Georgia, serif; text-transform: uppercase; letter-spacing: 0.08em; min-width: 120px; }
input { display: block; width: 100%; padding: 14px; border: 2px solid #333; font-size: 20px; margin: 8px 0; }
h2 { margin: 48px 0 16px; font: italic 700 36px/1.1 Georgia, serif; color: #b00; text-transform: uppercase; }
dialog { padding: 48px; border: 6px solid #b00; border-radius: 0; max-width: 480px; background: #fff3c4; color: #222; }`;
const sitePage = (rules) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Сайт</title><link rel="icon" href="data:," />${rules ? `<style>${SITE_RULES}</style>` : ''}</head>
<body><header id="head" style="position: relative"><h1 id="title">Сайт</h1><nav id="nav"><a id="link" href="#a">Ссылка</a></nav></header>
<main id="main"><h2 id="h2">Раздел</h2><p id="text">Текст <small id="small">мелкий</small></p><label id="label">Поле <input id="input" type="text" value="текст" /></label><button id="button" type="button">Кнопка</button><ul id="list"><li id="item">Пункт</li></ul></main>
<dialog id="dialog"><h2 id="dialog-h2">Диалог</h2><button id="dialog-button" type="button">Закрыть</button></dialog>
<script type="module">
window.qaCss = (list) => Promise.all(list.map((href) => new Promise((resolve, reject) => { const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href, onload: resolve, onerror: reject }); document.head.append(link); })));
window.qaMount = async () => { const { mountPet } = await import('/pet/pet.mjs'); const head = document.getElementById('head'); window.qaPet = mountPet({ storage: 'site', places: { logo: (el) => head.append(el), top: (el) => head.prepend(el), float: (el) => document.body.append(el) } }); };
window.qaReady = true;
</script></body></html>`;

// Мини-сервер стенда: / — стенд, /readme — пример из README, /pet/<файл>.mjs|css — модуль, /pet2/… — те же файлы по
// другому адресу (вторая копия модуля), /old/… — версия 0.1.1, /old14/… — версия 0.1.4 (фикстуры), /site/plain и
// /site/rules — страницы стилей; остальное — 404.
function serve() {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://stand');
    // Пример из README без значка: запрос браузера не считается ошибкой страницы.
    if (pathname === '/favicon.ico') return res.writeHead(204).end();
    const name = /^\/(pet|pet2|old|old14)\/([\w-]+\.(mjs|css))$/.exec(pathname);
    const dir = { old: OLD, old14: OLD14 }[name?.[1]] ?? path.join(root, 'pet');
    const file = pathname === '/' ? path.join(root, 'test', 'stand.html') : pathname === '/readme' ? 'readme.html' : pathname.startsWith('/site/') ? 'site.html' : name ? path.join(dir, name[2]) : '';
    try {
      const body = file === 'readme.html' ? await readmeExample() : file === 'site.html' ? (['/site/plain', '/site/rules'].includes(pathname) ? sitePage(pathname === '/site/rules') : null) : await readFile(file);
      if (body === null) throw new Error('нет');
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)], 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((done) => server.close(done)) })));
}

// Только QA: сработавшие отложенные вызовы модуля (стек — /pet/pet.mjs) и созданные медиазапросы (для подсчёта слушателей).
function hooks() {
  const set = window.setTimeout.bind(window);
  window.qaPetFired = 0;
  window.setTimeout = (fn, ms = 0, ...args) => {
    const pet = (new Error().stack ?? '').includes('/pet/pet.mjs');
    return set((...rest) => {
      if (pet) window.qaPetFired += 1;
      if (typeof fn === 'function') fn(...rest);
    }, ms, ...args);
  };
  const match = window.matchMedia.bind(window);
  window.qaMql = [];
  window.matchMedia = (query) => {
    const list = match(query);
    window.qaMql.push(list);
    return list;
  };
}

// Только QA: управляемый шлюз транзакции сценки. window.qaGate[база] = 'hold' — событие complete приходит, но обработчик
// модуля (oncomplete) ждёт window.qaHeld.run(); 'lost' — сразу после записи дня транзакция отменяется, обработчик onabort
// так же ждёт. Пауз нет: продолжение модуля выполняется ровно тогда, когда его отпускает сценарий.
function gate() {
  const open = indexedDB.open.bind(indexedDB);
  window.qaGate = {};
  window.qaHeld = null;
  indexedDB.open = (name, ...rest) => {
    const request = open(name, ...rest);
    const mode = window.qaGate[name];
    if (!mode) return request;
    request.addEventListener('success', () => {
      const db = request.result;
      const transaction = db.transaction.bind(db);
      db.transaction = (...args) => {
        const tx = transaction(...args);
        for (const type of ['complete', 'abort']) {
          let handler = null;
          Object.defineProperty(tx, `on${type}`, { configurable: true, get: () => handler, set: (fn) => (handler = fn) });
          tx.addEventListener(type, (event) => (window.qaHeld = { type, run: () => handler?.call(tx, event) }));
        }
        if (mode === 'lost') {
          const objectStore = tx.objectStore.bind(tx);
          tx.objectStore = (...names) => {
            const store = objectStore(...names);
            const put = store.put.bind(store);
            store.put = (...values) => {
              const write = put(...values);
              write.addEventListener('success', () => tx.abort());
              return write;
            };
            return store;
          };
        }
        return tx;
      };
    });
    return request;
  };
}

async function open(browser, options, init = null) {
  const context = await browser.newContext(options);
  await context.clock.install({ time: START });
  await context.addInitScript(hooks);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.qaErrors = [];
  page.on('pageerror', (error) => page.qaErrors.push(error.message));
  // Ошибки модуль глушит (safe) с предупреждением «Питомец: …» — для стенда это тоже ошибка.
  page.on('console', (message) => (message.type() === 'error' || message.text().startsWith('Питомец:')) && page.qaErrors.push(message.text()));
  return { context, page, cdp: await context.newCDPSession(page) };
}

// Слушатели document, window и медиазапросов, созданных модулем (CDP).
async function listeners(page, cdp) {
  const count = async (expression) => {
    const { result } = await cdp.send('Runtime.evaluate', { expression });
    return result.objectId ? (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.length : 0;
  };
  const mql = [];
  for (let i = 0; i < (await page.evaluate(() => window.qaMql.length)); i += 1) mql.push(await count(`window.qaMql[${i}]`));
  return { document: await count('document'), window: await count('window'), mql };
}

const foreign = (page) =>
  page.evaluate(
    ([selectors, props]) => [
      ...selectors.map((selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return `${selector}: ${props.map((prop) => style.getPropertyValue(prop)).join('|')}`;
      }),
      `разметка: ${document.getElementById('site-main').innerHTML}|${document.getElementById('site-title').outerHTML}|${document.getElementById('site-menu').outerHTML}`,
    ],
    [FOREIGN, PROPS],
  );

const moduleNodes = (page) => page.evaluate((selector) => document.querySelectorAll(selector).length + document.querySelectorAll('[id^="cat-"]').length, MODULE);
const marks = (page) =>
  page.evaluate(() => {
    const html = document.documentElement;
    return [...html.classList].filter((name) => /^(cat|pet)-/.test(name)).concat(Object.keys(html.dataset).filter((name) => /^(cat|pet)[A-Z]/.test(name)), html.hasAttribute('data-pet-call') ? ['data-pet-call'] : []);
  });
const stored = (page) => page.evaluate(() => Object.keys(localStorage).sort());
const sheetOpen = (page) => page.evaluate(() => Boolean(document.getElementById('cat-sheet')?.open));
const pose = (page, selector) => page.evaluate((s) => document.querySelector(s)?.dataset.pose ?? '', selector);
const hint = (page) => page.evaluate(() => document.querySelector('[data-cat-play-hint]')?.textContent ?? '');
const live = (page) => page.evaluate(() => document.getElementById('cat-live')?.textContent ?? '');
const focused = (page, selector) => page.evaluate((s) => Boolean(document.activeElement?.matches(s)), selector);

async function desktop(browser, base, check, layout) {
  const label = 'модуль 1280×900';
  const { context, page, cdp } = await open(browser, { viewport: { width: 1280, height: 900 } });
  try {
    // Сайт до подключения: стили, разметка, слушатели.
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    const before = await foreign(page);
    const baseline = await listeners(page, cdp);
    check(`${label}: стенд — только модуль и разметка сайта`, (await page.evaluate(() => [...document.querySelectorAll('script[src], link[rel="stylesheet"]')].map((el) => el.getAttribute('src') ?? el.getAttribute('href')).join(','))) === '/pet/pet-base.css,/pet/pet.css,/pet/dog.css');

    await page.evaluate(() => window.stand.mount());
    // Приветствие (через 0,9 с, 1,7 с) доигрывает — часы идут только по runFor.
    await page.clock.runFor(3000);
    const mounted = await listeners(page, cdp);
    const at = await page.evaluate(() => ({ at: document.documentElement.dataset.petAt, view: document.documentElement.dataset.petView, version: window.stand.pet.version, standVersion: window.stand.VERSION }));
    check(`${label}: подключение — кот целиком в боковой панели сайта; версия ${VERSION}`, at.at === 'sidebar' && at.view === 'full' && at.version === VERSION && at.standVersion === VERSION && (await page.locator('#cat-dock .cat-art[data-cat-managed]').isVisible()), JSON.stringify(at));
    check(`${label}: стили и разметка сайта после подключения те же`, JSON.stringify(await foreign(page)) === JSON.stringify(before));
    check(`${label}: приветствие при первом открытии за день`, (await page.evaluate(() => JSON.parse(localStorage.getItem('stand:cat:v1')))).greetDay === DAY);

    // Уголок: заголовок, шаг сайта, знаки, тексты по умолчанию; переноса без рамок мест (zone) нет.
    await page.locator('#cat-dock .cat-dock-btn').click();
    const corner = await page.evaluate(() => ({
      title: document.getElementById('cat-sheet-title').textContent,
      step: document.querySelector('[data-cat-learn-title]')?.textContent,
      line: document.querySelector('[data-cat-line]').textContent,
      wait: document.querySelector('[data-cat-treat-note]').textContent,
      move: document.querySelector('[data-cat-move]').disabled,
      store: document.querySelector('[data-cat-store]').textContent,
    }));
    const drag = await page.evaluate(() => document.querySelectorAll('[data-pet-drag]').length);
    check(`${label}: уголок — имя, шаг сайта, знаки «сегодня 0 из 3», тексты по умолчанию; без рамок мест — без переноса`, (await sheetOpen(page)) && corner.title === 'Марс' && corner.step === 'Урок 2: дроби' && corner.line === '0 знаков практики · сегодня 0 из 3' && corner.wait === 'Одно занятие — и можно угостить.' && corner.move && drag === 0 && corner.store.endsWith('Знаки и вещи даёт сайт и совпадают везде.'), JSON.stringify({ ...corner, drag }));
    check(`${label}: открыт уголок — фокус на «Закрыть»`, await focused(page, '[data-cat-close]'));
    await page.locator('[data-cat-learn]').click();
    const went = await page.evaluate(() => ({ goes: window.stand.goes.join(','), hash: location.hash }));
    check(`${label}: следующий шаг — переход сайта (go), уголок закрыт, адрес не трогается`, went.goes === '#lesson-2' && went.hash === '' && !(await sheetOpen(page)), JSON.stringify(went));

    // «Поиграть»: поглаживание мышью, лапа, миска, мячик; Esc — в уголок, ещё Esc — к сайту.
    await page.locator('#cat-dock .cat-dock-btn').click();
    await page.locator('[data-cat-play]').click();
    const box = await page.locator('.cat-play-pet').boundingBox();
    const [x0, y0] = [box.x + (box.width * 70) / 220, box.y + (box.height * 66) / 204];
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) await page.mouse.move(x0 + i * 8, y0);
    const stroke = { pose: await pose(page, '.cat-play .cat-art'), hint: await hint(page) };
    await page.mouse.up();
    check(`${label}: поглаживание мышью — довольная поза и «мурлычет»`, stroke.pose === 'pet' && stroke.hint === 'Марс мурлычет.', JSON.stringify(stroke));
    await page.clock.runFor(1500);
    await page.locator('[data-cat-play-paw]').click();
    const paw = await hint(page);
    await page.clock.runFor(1500);
    await page.locator('[data-cat-play-bowl]').click();
    const bowl = await hint(page);
    await page.clock.runFor(1500);
    await page.locator('[data-cat-play-ball]').click();
    const ball = await hint(page);
    check(`${label}: лапа, миска и мячик кнопками — итоги сцены`, paw === 'Марс касается твоей руки лапой.' && bowl === 'Марс принюхивается к миске.' && ball === 'Марс следит за мячиком.', [paw, bowl, ball].join(' | '));
    await page.keyboard.press('Escape');
    const back = await page.evaluate(() => ({ open: document.getElementById('cat-sheet').open, view: document.getElementById('cat-sheet').dataset.view ?? '' }));
    check(`${label}: Esc в «Поиграть» — назад в уголок, фокус на «Поиграть»`, back.open && back.view === '' && (await focused(page, '[data-cat-play]')), JSON.stringify(back));
    await page.keyboard.press('Escape');
    check(`${label}: ещё Esc — уголок закрыт, фокус на питомце`, !(await sheetOpen(page)) && (await focused(page, '#cat-dock .cat-dock-btn')));
    await page.keyboard.press('Enter');
    check(`${label}: Enter на питомце — уголок открыт с клавиатуры`, (await sheetOpen(page)) && (await focused(page, '[data-cat-close]')));

    // Настройки: собака, имя, облик — сохраняются сразу в своих ключах.
    await page.locator('.cat-kind-option:has(input[value="dog"])').click();
    await page.clock.runFor(100);
    // Подборка открыта на странице имени по умолчанию (Тоби): Шашлычок, Тоби, Пончик, Стендап.
    await page.locator('[data-cat-names] [data-cat-name-pick="Пончик"]').click();
    await page.locator('.cat-coat-option:has(input[value="spotted"])').click();
    await page.keyboard.press('Escape');
    const saved = await page.evaluate((k) => ({ companion: JSON.parse(localStorage.getItem(k.companion)), look: JSON.parse(localStorage.getItem(k.look)), dock: document.querySelector('#cat-dock .cat-art')?.dataset.kind }), K);
    check(`${label}: собака, имя и облик — в ключах stand:…`, saved.companion.kind === 'dog' && saved.companion.dog.name === 'Пончик' && saved.look.dog === 'spotted' && saved.dock === 'dog', JSON.stringify(saved));
    check(`${label}: хранение — только своё пространство имён`, (await stored(page)).every((key) => key.startsWith('stand:')), (await stored(page)).join(','));

    // Перезагрузка: стенд сам подключает питомца (адрес без ?manual).
    await page.goto(base);
    await page.waitForFunction(() => Boolean(window.stand?.pet));
    await page.clock.runFor(3000);
    const again = await page.evaluate(() => ({ kind: document.querySelector('#cat-dock .cat-art')?.dataset.kind, coat: document.querySelector('#cat-dock .cat-art')?.dataset.coat, name: document.querySelector('#cat-dock [data-cat-name]')?.textContent }));
    check(`${label}: после перезагрузки — собака Пончик в облике «Белый с пятном»`, again.kind === 'dog' && again.coat === 'spotted' && again.name === 'Пончик', JSON.stringify(again));

    // События сайта: занятие дало знак и открыло ступень — радость, новая вещь, объявление; seenStage — сразу.
    await page.evaluate(() => window.stand.set(3, 1));
    await page.evaluate(() => window.stand.pet.notify('saved', { key: 'e1', counted: true, first: true }));
    const joy = await pose(page, '#cat-dock .cat-art');
    await page.clock.runFor(200);
    const told = await live(page);
    await page.clock.runFor(1500);
    const unlock = await pose(page, '#cat-dock .cat-art');
    const seen = await page.evaluate((k) => JSON.parse(localStorage.getItem(k.cat)).seenStage, K);
    check(`${label}: занятие сайта — радость, затем новая вещь; ступень «Освоился» объявлена и отмечена`, joy === 'joy' && unlock === 'unlock' && told.includes('открыта ступень «Освоился»') && seen === 1, JSON.stringify({ joy, unlock, told, seen }));
    await page.clock.runFor(3000);

    // Лакомство: занятие сегодня есть — «Покормить», отметка дня — в stand:treat:v1.
    await page.locator('#cat-dock .cat-dock-btn').click();
    await page.locator('[data-cat-feed]').click();
    const fed = await page.evaluate((k) => JSON.parse(localStorage.getItem(k.treat)), K);
    await page.keyboard.press('Escape');
    await page.clock.runFor(6000);
    check(`${label}: лакомство после занятия — отметка дня в своём ключе`, fed?.fedDay === DAY, JSON.stringify(fed));

    // Тишина таймера сайта: реакция ждёт, после — играет.
    await page.evaluate(() => window.stand.pet.update({ timer: true }));
    await page.evaluate(() => window.stand.set(4, 2));
    await page.evaluate(() => window.stand.pet.notify('saved', { key: 'e2', counted: true }));
    const quiet = await pose(page, '#cat-dock .cat-art');
    await page.evaluate(() => window.stand.pet.update({ timer: false }));
    const after = await pose(page, '#cat-dock .cat-art');
    check(`${label}: таймер сайта — тихо (внимание), после — отложенная радость`, quiet === 'attentive' && after === 'joy', `${quiet} → ${after}`);
    await page.clock.runFor(3000);

    // Редкая сценка: день показа — в IndexedDB stand:scene и копии stand:scene:v1 (не pet:…).
    await page.evaluate(() => {
      Math.random = () => 0;
    });
    await page.evaluate(() => window.stand.set(5, 3));
    await page.evaluate(() => window.stand.pet.notify('saved', { key: 'e3', counted: true }));
    await page.clock.runFor(1600);
    await page.waitForFunction(() => Boolean(document.querySelector('#cat-dock .cat-art')?.dataset.scene));
    const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((db) => String(db.name)).sort().join(','));
    const copy = await page.evaluate((k) => JSON.parse(localStorage.getItem(k.scene) ?? 'null'), K);
    check(`${label}: сценка — база ${K.db} и копия ${K.scene}`, dbs === K.db && copy?.day === DAY && (await stored(page)).every((key) => key.startsWith('stand:')), JSON.stringify({ dbs, copy }));
    await page.clock.runFor(6000);

    // Диалог сайта открывается и выглядит как раньше; стили сайта после всех действий — те же.
    check(`${label}: стили и разметка сайта после всех действий те же`, JSON.stringify(await foreign(page)) === JSON.stringify(before));

    // Отключение: ни элементов, ни отметок, ни слушателей, ни отложенных вызовов; события storage его не оживляют.
    const pet = await page.evaluateHandle(() => window.stand.pet);
    await page.evaluate(() => window.stand.pet.notify('saved', { key: 'e4', counted: false }));
    await page.evaluate(() => window.stand.pet.destroy());
    const fired = await page.evaluate(() => window.qaPetFired);
    await page.clock.runFor(16 * 3600 * 1000);
    const gone = await listeners(page, cdp);
    check(`${label}: отключение — элементов питомца и отметок на html нет`, (await moduleNodes(page)) === 0 && (await marks(page)).length === 0, (await marks(page)).join(','));
    // Подключённый питомец слушал document, window и медиазапросы — после отключения их счёт как до подключения.
    const listened = mounted.document > baseline.document && mounted.window > baseline.window && mounted.mql.filter((n) => n > 0).length >= 8;
    check(`${label}: отключение — слушатели document, window и медиазапросов сняты`, listened && gone.document === baseline.document && gone.window === baseline.window && gone.mql.every((n) => n === 0), JSON.stringify({ baseline, mounted, gone }));
    check(`${label}: отключение — отложенные вызовы (реакция, объявление, полночь) не срабатывают`, fired > 0 && (await page.evaluate(() => window.qaPetFired)) === fired, `${fired} → ${await page.evaluate(() => window.qaPetFired)}`);
    const other = await context.newPage();
    await other.goto(`${base}?manual`);
    await other.evaluate((k) => localStorage.setItem(k.cat, JSON.stringify({ ...JSON.parse(localStorage.getItem(k.cat)), name: 'Барсик' })), K);
    await page.clock.runFor(100);
    await pet.evaluate((handle) => {
      handle.open();
      handle.update({ timer: true });
      handle.notify('saved', { key: 'x', counted: true });
    });
    check(`${label}: отключён — событие другой вкладки и методы прежнего экземпляра ничего не делают`, (await moduleNodes(page)) === 0 && !(await pet.evaluate((handle) => handle.opened)));
    await other.close();

    // Повторное подключение: те же настройки, слушатели — как при первом, одно окно, одна реакция.
    await page.evaluate(() => window.stand.mount());
    await page.clock.runFor(3000);
    const remount = await listeners(page, cdp);
    const live2 = remount.mql.filter((n) => n > 0);
    check(`${label}: повторное подключение — слушателей столько же, сколько при первом`, remount.document === mounted.document && remount.window === mounted.window && live2.length === mounted.mql.filter((n) => n > 0).length && live2.every((n) => n === 1), JSON.stringify({ mounted, remount }));
    await page.locator('#cat-dock .cat-dock-btn').click();
    const one = await page.evaluate(() => ({ sheets: document.querySelectorAll('#cat-sheet').length, docks: document.querySelectorAll('#cat-dock').length, lives: document.querySelectorAll('#cat-live').length, title: document.getElementById('cat-sheet-title').textContent }));
    check(`${label}: повторное подключение — одно окно и одно место, собака с прежним именем`, one.sheets === 1 && one.docks === 1 && one.lives === 1 && one.title === 'Пончик' && (await sheetOpen(page)), JSON.stringify(one));
    await page.keyboard.press('Escape');
    // Новое подключение без отключения: прежнее отключается само, его методы ничего не делают.
    const first = await page.evaluateHandle(() => window.stand.pet);
    await page.evaluate(() => window.stand.mount());
    await page.clock.runFor(1000);
    await first.evaluate((handle) => handle.open());
    const twice = await listeners(page, cdp);
    check(`${label}: подключение поверх активного — прежний отключён, дублей нет`, (await page.evaluate(() => document.querySelectorAll('#cat-sheet').length)) === 1 && !(await sheetOpen(page)) && twice.document === mounted.document && twice.window === mounted.window, JSON.stringify(twice));
    await layout(page, label);
    check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

async function phone(browser, base, check, layout) {
  const label = 'модуль 390×844';
  const { context, page } = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  try {
    await page.goto(base);
    await page.waitForFunction(() => Boolean(window.stand?.pet));
    await page.clock.runFor(3000);
    const at = await page.evaluate(() => ({ at: document.documentElement.dataset.petAt, face: Boolean(document.querySelector('#site-head > .cat-face')) }));
    check(`${label}: питомец в шапке сайта (место «наверху»)`, at.at === 'top' && at.face && (await page.locator('.cat-face').isVisible()), JSON.stringify(at));
    await page.locator('.cat-face').tap();
    check(`${label}: касание — уголок открыт`, await sheetOpen(page));
    await page.locator('[data-cat-play]').tap();
    await page.locator('[data-cat-play-pet]').tap();
    check(`${label}: «Погладить» в сцене — итог`, (await hint(page)) === 'Марс мурлычет.', await hint(page));
    await page.locator('[data-cat-play-corner], [data-cat-play-close]').first().tap();
    await page.locator('.cat-settings summary').tap();
    await page.locator('[data-cat-hide]').tap();
    await page.clock.runFor(200);
    check(`${label}: «Скрыть» — в шапке питомца нет`, (await page.locator('.cat-face').count()) === 0 && !(await sheetOpen(page)));
    await page.locator('#site-menu').tap();
    const restore = page.locator('.cat-sections-return button');
    check(`${label}: «Показать кота» — в меню сайта`, (await restore.isVisible()) && (await restore.textContent()) === 'Показать кота');
    // Меню сайта закрывается и возвращает фокус на свою кнопку; питомец получает его после события close (setTimeout 0).
    await page.evaluate(() => {
      window.qaMenuClosed = new Promise((resolve) => document.getElementById('site-dialog').addEventListener('close', resolve, { once: true }));
    });
    await restore.tap();
    await page.evaluate(() => window.qaMenuClosed);
    await page.clock.runFor(50);
    check(`${label}: «Показать» — меню сайта закрыто, питомец снова в шапке`, (await page.locator('.cat-face').isVisible()) && !(await page.evaluate(() => document.getElementById('site-dialog').open)));
    check(`${label}: «Показать» — фокус на питомце`, await focused(page, '.cat-face'), await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)));
    await layout(page, label);
    check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
  // «Уменьшить движение» системы — весь интерфейс питомца без анимации.
  const reduced = await open(browser, { viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  try {
    await reduced.page.goto(base);
    await reduced.page.waitForFunction(() => Boolean(window.stand?.pet));
    check('модуль: системное «уменьшить движение» — без анимации', (await reduced.page.evaluate(() => document.documentElement.dataset.catMotion)) === 'none');
  } finally {
    await reduced.context.close();
  }
}

// День сценки в базе IndexedDB (без шлюза); базы нет — создаётся пустой.
const sceneDay = (page, name) =>
  page.evaluate(
    (db) =>
      new Promise((resolve) => {
        const request = indexedDB.open(db, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('scene');
        request.onsuccess = () => {
          const get = request.result.transaction('scene').objectStore('scene').get('shown');
          get.onsuccess = () => {
            request.result.close();
            resolve(get.result?.day ?? '');
          };
        };
      }),
    name,
  );

// Сценка прежнего экземпляра и отключение: показ начался (день записан в транзакции), обработчик её завершения держит
// шлюз; питомца отключают, подключают снова и только потом отпускают завершение. Ни копии дня, ни реакций, ни фокуса —
// ни в прежнем пространстве, ни в новом; день в базе прежнего пространства остаётся (сценки в этот день больше нет).
async function scenes(browser, base, check) {
  const label = 'модуль: сценка и отключение';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, gate);
  const begin = async (ns, mode) => {
    await page.evaluate(
      ([ns, mode, day]) => {
        Math.random = () => 0;
        window.qaGate = { [`${ns}:scene`]: mode };
        window.qaHeld = null;
        localStorage.setItem(`${ns}:cat:v1`, JSON.stringify({ v: 1, seenStage: 1, greetDay: day }));
        window.stand.mount({ storage: ns });
        window.stand.set(4, 1);
        window.stand.set(5, 2);
        window.stand.pet.notify('saved', { key: `${ns}-entry`, counted: true });
      },
      [ns, mode, DAY],
    );
    await page.clock.runFor(1700);
    await page.waitForFunction(() => Boolean(window.qaHeld));
    const held = await page.evaluate(() => ({ type: window.qaHeld.type, scene: document.querySelector('#cat-dock .cat-art')?.dataset.scene ?? '' }));
    await page.evaluate(() => (window.qaGate = {}));
    return held;
  };
  const after = (keys) =>
    page.evaluate((list) => ({ copies: list.map((key) => localStorage.getItem(key)), scene: document.querySelector('#cat-dock .cat-art')?.dataset.scene ?? '', pose: document.querySelector('#cat-dock .cat-art')?.dataset.pose ?? '', focus: document.activeElement?.id ?? '' }), keys);
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));

    // Другое пространство имён сразу после отключения.
    const held = await begin('old', 'hold');
    check(`${label}: показ начался, завершение транзакции удержано`, held.type === 'complete' && held.scene !== '', JSON.stringify(held));
    await page.evaluate(() => {
      document.getElementById('site-check').focus();
      window.stand.pet.destroy();
      window.stand.mount({ storage: 'new' });
      window.qaHeld.run();
    });
    const other = await after(['old:scene:v1', 'new:scene:v1']);
    check(`${label}: подключение с другим пространством — позднее завершение не пишет ни old:scene:v1, ни new:scene:v1`, other.copies.every((item) => item === null), JSON.stringify(other));
    check(`${label}: новый экземпляр не затронут — без сценки, фокус на месте`, other.scene === '' && other.pose !== 'stretch' && other.focus === 'site-check', JSON.stringify(other));
    check(`${label}: день показа в базе old:scene остаётся`, (await sceneDay(page, 'old:scene')) === DAY);

    // То же пространство имён: копии нет, а сценки в этот день больше нет — день держит база.
    await page.evaluate(() => window.stand.pet.destroy());
    await begin('same', 'hold');
    await page.evaluate(() => {
      window.stand.pet.destroy();
      window.stand.mount({ storage: 'same' });
      window.qaHeld.run();
    });
    const same = await after(['same:scene:v1']);
    check(`${label}: повторное подключение с тем же пространством — позднее завершение копию не пишет, новый без сценки`, same.copies[0] === null && same.scene === '', JSON.stringify(same));
    check(`${label}: день показа в базе same:scene остаётся`, (await sceneDay(page, 'same:scene')) === DAY);
    await page.evaluate(() => {
      window.stand.set(6, 3);
      window.stand.pet.notify('saved', { key: 'same-next', counted: true });
    });
    await page.clock.runFor(1700);
    // Транзакция чтения той же базы выполняется после попытки показа (очередь IndexedDB).
    await sceneDay(page, 'same:scene');
    const again = await after(['same:scene:v1']);
    check(`${label}: новый экземпляр того же пространства — второй сценки в этот день нет`, again.scene === '' && again.copies[0] === null, JSON.stringify(again));

    // Отменённая запись ('lost'): прежний остановил бы сценку — новый экземпляр это не задевает.
    await page.evaluate(() => window.stand.pet.destroy());
    const lost = await begin('lost', 'lost');
    check(`${label}: ветка lost — показ начался, отмена транзакции удержана`, lost.type === 'abort' && lost.scene !== '', JSON.stringify(lost));
    await page.evaluate(() => {
      window.stand.pet.destroy();
      localStorage.setItem('fresh:cat:v1', JSON.stringify({ v: 1, seenStage: 1, greetDay: '2026-10-11' }));
      window.stand.mount({ storage: 'fresh' });
      window.stand.set(5, 2);
      window.stand.pet.notify('saved', { key: 'fresh-entry', counted: true });
      window.qaHeld.run();
    });
    const busy = await after(['lost:scene:v1', 'fresh:scene:v1']);
    check(`${label}: ветка lost после отключения — не пишет и не останавливает реакцию нового`, busy.copies.every((item) => item === null) && busy.pose === 'joy', JSON.stringify(busy));
    check(`${label}: ветка lost — день в базе lost:scene откатился`, (await sceneDay(page, 'lost:scene')) === '');
    await page.clock.runFor(1700);

    // Отключение без нового подключения.
    await page.evaluate(() => window.stand.pet.destroy());
    await begin('gone', 'hold');
    await page.evaluate(() => {
      window.stand.pet.destroy();
      window.qaHeld.run();
    });
    const gone = await after(['gone:scene:v1']);
    check(`${label}: отключение до завершения — копия gone:scene:v1 не пишется, элементов нет`, gone.copies[0] === null && (await moduleNodes(page)) === 0, JSON.stringify(gone));
    check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Пример подключения из README как есть (места logo, top, float — без restore и home): телефон — «Скрыть», лапка
// «Показать …» в шапке с фокусом, перезагрузка в скрытом состоянии, возврат, «Приходит по зову»; компьютер — у логотипа.
async function minimal(browser, base, check, layout) {
  const label = 'модуль: минимальный пример 390×844';
  const { context, page } = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const back = page.getByRole('button', { name: 'Показать кота' });
  try {
    await page.goto(`${base}readme`);
    await page.waitForSelector('#head > .cat-face');
    await page.clock.runFor(3000);
    check(`${label}: питомец в шапке примера`, (await page.evaluate(() => document.documentElement.dataset.petAt)) === 'top' && (await page.locator('.cat-face').isVisible()));
    await page.locator('#done').tap();
    await page.clock.runFor(3000);
    await page.locator('.cat-face').tap();
    await page.locator('.cat-settings > summary').tap();
    await page.locator('[data-cat-hide]').tap();
    await page.clock.runFor(200);
    const hidden = await page.evaluate(() => ({ face: document.querySelectorAll('.cat-face').length, stored: JSON.parse(localStorage.getItem('mysite:cat:v1')).hidden, live: document.getElementById('cat-live').textContent, inHead: Boolean(document.activeElement?.closest('#head')) }));
    const box = await back.boundingBox();
    check(`${label}: «Скрыть» — питомца нет, в шапке кнопка «Показать кота» с фокусом`, hidden.face === 0 && hidden.stored === true && (await back.isVisible()) && hidden.inHead && (await back.evaluate((el) => el === document.activeElement)) && hidden.live.includes('спрятан'), JSON.stringify(hidden));
    check(`${label}: «Показать кота» — кнопка не меньше 44×44`, box?.width >= 44 && box?.height >= 44, JSON.stringify(box));
    await layout(page, `${label}, спрятан`);

    await page.reload();
    await page.waitForFunction(() => Boolean(document.getElementById('cat-live')));
    await page.clock.runFor(1000);
    check(`${label}: после перезагрузки — по-прежнему спрятан, «Показать кота» в шапке`, (await page.locator('.cat-face').count()) === 0 && (await back.isVisible()));
    await page.keyboard.press('Tab');
    check(`${label}: «Показать кота» доступна с клавиатуры (первая по Tab)`, await back.evaluate((el) => el === document.activeElement));
    await back.tap();
    await page.clock.runFor(100);
    const shownBack = await page.evaluate(() => ({ stored: JSON.parse(localStorage.getItem('mysite:cat:v1')).hidden, live: document.getElementById('cat-live').textContent }));
    check(`${label}: «Показать кота» — питомец в шапке, фокус на нём, кнопки возврата не видно`, shownBack.stored === false && (await page.locator('.cat-face').isVisible()) && (await focused(page, '.cat-face')) && !(await back.isVisible()) && shownBack.live.includes('снова рядом'), JSON.stringify(shownBack));

    // «Приходит по зову» после возврата: лапка в шапке, касание — сразу «Поиграть».
    await page.locator('.cat-face').tap();
    await page.locator('.cat-presence .cat-place-option:has(input[value="on-call"])').tap();
    await page.locator('[data-cat-close]').first().tap();
    await page.clock.runFor(100);
    const call = await page.evaluate(() => ({ call: document.documentElement.hasAttribute('data-pet-call'), face: document.querySelector('.cat-face')?.hasAttribute('data-cat-call'), label: document.querySelector('.cat-face')?.getAttribute('aria-label') }));
    check(`${label}: «Приходит по зову» — лапка в шапке`, call.call && call.face && call.label === 'Позвать питомца: Марс' && (await page.locator('.cat-face').isVisible()), JSON.stringify(call));
    await page.locator('.cat-face').tap();
    check(`${label}: лапка — сразу «Поиграть»`, (await sheetOpen(page)) && (await page.evaluate(() => document.getElementById('cat-sheet').dataset.view)) === 'play');
    await layout(page, label);
    check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
  // Компьютер: тот же пример — «Показать кота» у логотипа.
  const wide = await open(browser, { viewport: { width: 1280, height: 900 } });
  try {
    await wide.page.goto(`${base}readme`);
    await wide.page.waitForSelector('#head > .cat-side');
    await wide.page.clock.runFor(3000);
    await wide.page.locator('.cat-side-face').click();
    await wide.page.locator('.cat-settings > summary').click();
    await wide.page.locator('[data-cat-hide]').click();
    const side = wide.page.locator('#head > .cat-side [data-cat-return]');
    check('модуль: минимальный пример 1280×900 — «Показать кота» у логотипа с фокусом, вторая кнопка не видна', (await side.isVisible()) && (await side.evaluate((el) => el === document.activeElement)) && (await wide.page.locator('.cat-sections-return').evaluateAll((list) => list.every((el) => !el.checkVisibility()))));
    await side.click();
    check('модуль: минимальный пример 1280×900 — «Показать» возвращает питомца с фокусом', await focused(wide.page, '.cat-side-face'));
    check('модуль: минимальный пример 1280×900 — ошибок нет', wide.page.qaErrors.length === 0, wide.page.qaErrors.join(' | '));
  } catch (error) {
    check('модуль: минимальный пример 1280×900 — сценарий выполнен', false, error.stack);
  } finally {
    await wide.context.close();
  }
}

// Следующий шаг сайта меняется при открытом уголке (pet.update()): нет → шаг, шаг → другой шаг (та же ссылка, фокус на
// месте), шаг → нет (фокус с ссылки — на видимое под ней), отложенно при вводе имени, видимое не сдвигается.
async function steps(browser, base, check) {
  const label = 'модуль: следующий шаг';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } });
  const card = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-cat-learn-card]');
      return el ? { count: document.querySelectorAll('[data-cat-learn-card]').length, title: el.querySelector('[data-cat-learn-title]').textContent, href: el.querySelector('[data-cat-learn]').getAttribute('href'), after: el.previousElementSibling?.hasAttribute('data-cat-treat'), type: el.dataset.type } : null;
    });
  const set = (step) =>
    page.evaluate((value) => {
      window.qaStep = value;
      window.stand.pet.update();
    }, step);
  const A = { type: 'lesson', kind: 'Урок', title: 'Урок 3: проценты', action: 'Открыть урок', href: '#lesson-3' };
  const B = { type: 'quiz', kind: 'Тест', title: 'Тест по дробям', action: 'Пройти тест', href: '#quiz-1' };
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    await page.evaluate(() => {
      window.qaStep = null;
      window.stand.mount({ storage: 'steps', step: () => window.qaStep });
    });
    await page.clock.runFor(3000);
    await page.locator('#cat-dock .cat-dock-btn').click();
    check(`${label}: шага нет — карточки нет`, (await card()) === null);
    await set(A);
    const added = await card();
    check(`${label}: нет → шаг — карточка сразу, после лакомства`, added?.count === 1 && added.title === A.title && added.href === A.href && added.after && added.type === 'lesson', JSON.stringify(added));

    await page.locator('[data-cat-learn]').focus();
    await page.evaluate(() => {
      window.qaLink = document.querySelector('[data-cat-learn]');
      window.qaLink.scrollIntoView({ block: 'end' });
    });
    await set(B);
    const other = await card();
    check(`${label}: шаг → другой шаг — та же ссылка, фокус на ней`, other?.title === B.title && other.href === B.href && other.type === 'quiz' && (await page.evaluate(() => window.qaLink.isConnected && document.activeElement === window.qaLink)), JSON.stringify(other));

    await set(null);
    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      const box = el.getBoundingClientRect();
      const view = document.querySelector('[data-cat-body]').getBoundingClientRect();
      return { summary: el.matches('.cat-rules > summary'), visible: el.checkVisibility() && box.top >= view.top && box.bottom <= view.bottom, inSheet: document.getElementById('cat-sheet').contains(el) };
    });
    check(`${label}: шаг → нет — карточки нет, фокус с её ссылки — на «Как появляются знаки…»`, (await card()) === null && focus.summary && focus.visible && focus.inSheet, JSON.stringify(focus));

    // Ввод имени: карточка не появляется и не исчезает, пока в поле курсор; после ухода из поля — догоняет.
    const name = page.locator('input[name="cat-name"]');
    await name.click();
    await page.keyboard.press('End');
    await page.keyboard.type('Мурзик');
    await set(A);
    const typing = { card: await card(), value: await name.inputValue(), focus: await name.evaluate((el) => el === document.activeElement) };
    check(`${label}: ввод имени — шаг появился, карточка ждёт; имя и фокус на месте`, typing.card === null && typing.value === 'Мурзик' && typing.focus, JSON.stringify(typing));
    await page.keyboard.press('Tab');
    await page.clock.runFor(500);
    const named = { card: await card(), value: await name.inputValue(), stored: await page.evaluate(() => JSON.parse(localStorage.getItem('steps:cat:v1')).name) };
    check(`${label}: ушли из поля имени — карточка появилась, имя сохранено`, named.card?.title === A.title && named.value === 'Мурзик' && named.stored === 'Мурзик', JSON.stringify(named));
    await name.focus();
    await set(null);
    const kept = await card();
    await page.keyboard.press('Tab');
    await page.clock.runFor(500);
    check(`${label}: ввод имени — шаг пропал, карточка ждёт ухода из поля, затем убрана`, kept?.title === A.title && (await card()) === null, JSON.stringify(kept));

    // Видимое не сдвигается: уголок прокручен ниже карточки — появление и исчезновение не двигают видимый блок; вверху —
    // прокрутка не меняется. Без встроенной привязки прокрутки браузера (overflow-anchor: none, как в Safari) — так же.
    for (const anchor of [true, false]) {
      const how = anchor ? '' : ' (без привязки прокрутки браузера)';
      if (!anchor) await page.addStyleTag({ content: '[data-cat-body] { overflow-anchor: none !important; }' });
      const spot = () =>
        page.evaluate(() => {
          const body = document.querySelector('[data-cat-body]');
          return { top: body.scrollTop, mark: Math.round(document.querySelector('.cat-settings > summary').getBoundingClientRect().top) };
        });
      await page.evaluate(() => {
        const body = document.querySelector('[data-cat-body]');
        body.scrollTop = body.scrollHeight;
      });
      const low = await spot();
      await set(A);
      await page.screenshot();
      const lowAdded = await spot();
      await set(null);
      await page.screenshot();
      const lowRemoved = await spot();
      check(`${label}: прокручено вниз — появление и исчезновение карточки не сдвигают видимое${how}`, lowAdded.mark === low.mark && lowRemoved.mark === low.mark && lowAdded.top > low.top, JSON.stringify({ low, lowAdded, lowRemoved }));
      await page.evaluate(() => (document.querySelector('[data-cat-body]').scrollTop = 0));
      await set(A);
      await page.screenshot();
      const topAdded = await spot();
      await set(null);
      check(`${label}: вверху уголка — прокрутка не меняется${how}`, topAdded.top === 0 && (await spot()).top === 0, JSON.stringify(topAdded));
    }
    check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Сайт стенда для сценариев отказа: свой элемент с id и классом cat-*, своя отметка и данные на html, свои данные в
// localStorage, свой обработчик, поле с текстом, фокусом и кареткой. Снимок — то, что модуль не должен менять.
const siteSetup = (page) =>
  page.evaluate(() => {
    const note = Object.assign(document.createElement('p'), { id: 'cat-facts', className: 'cat-note', textContent: 'Кошки спят до 16 часов в сутки.' });
    document.getElementById('site-main').append(note);
    document.documentElement.classList.add('cat-lover');
    document.documentElement.dataset.theme = 'sea';
    localStorage.setItem('site:answers', '["42"]');
    window.qaClicks = 0;
    document.getElementById('site-check').addEventListener('click', () => (window.qaClicks += 1));
    const input = document.getElementById('site-input');
    input.value = 'черновик ответа';
    input.focus();
    input.setSelectionRange(3, 3);
  });
const siteState = (page) =>
  page.evaluate(() => {
    const input = document.getElementById('site-input');
    return JSON.stringify({
      dom: ['site-head', 'site-side', 'site-main', 'site-dialog'].map((id) => document.getElementById(id).outerHTML),
      value: input.value,
      caret: input.selectionStart,
      focus: document.activeElement?.id,
      html: document.documentElement.className,
      theme: document.documentElement.dataset.theme,
      data: localStorage.getItem('site:answers'),
    });
  });
// Элементы модуля без элемента сайта #cat-facts; отметки модуля без отметки сайта cat-lover.
const ownNodes = (page) => page.evaluate((selector) => [...document.querySelectorAll(`${selector}, [id^="cat-"]`)].filter((el) => el.id !== 'cat-facts').length, MODULE);
const ownMarks = async (page) => (await marks(page)).filter((name) => name !== 'cat-lover');
const counts = (page) => page.evaluate(() => ['cat-sheet', 'cat-dock', 'cat-side', 'cat-live'].map((id) => document.querySelectorAll(`#${id}`).length).join(','));
const sameListeners = (a, b) => a.document === b.document && a.window === b.window && a.mql.filter((n) => n > 0).length === b.mql.filter((n) => n > 0).length;
const refusals = (page) => page.qaErrors.filter((text) => text.startsWith('Питомец не подключён'));
const unexpected = (page) => page.qaErrors.filter((text) => !text.startsWith('Питомец не подключён'));

// Отказ подключения: исключение места (после вставки и до неё), progress() при запуске; после отказа — ни элементов, ни
// отметок, ни слушателей, сайт не тронут, понятное сообщение, методы неудачного экземпляра пустые, destroy — сколько
// угодно раз, затем обычное подключение без дублей и с тем же числом слушателей. Неверные места и настройки — отказ до
// любых действий, работающий питомец не тронут. Подключение из функции места (вложенное) — отказ.
async function failures(browser, base, check) {
  const label = 'модуль: отказ подключения';
  const { context, page, cdp } = await open(browser, { viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    await siteSetup(page);
    const before = await siteState(page);
    const baseline = await listeners(page, cdp);

    // Образец: обычное подключение и отключение.
    await page.evaluate(() => window.stand.mount());
    await page.clock.runFor(3000);
    const reference = { listeners: await listeners(page, cdp), nodes: await ownNodes(page) };
    await page.evaluate(() => window.stand.pet.destroy());
    check(`${label}: образец — обычное подключение и отключение не трогают сайт`, reference.nodes > 5 && (await ownNodes(page)) === 0 && sameListeners(await listeners(page, cdp), baseline) && (await siteState(page)) === before, JSON.stringify(reference));

    const CASES = [
      ['sidebar-after', 'а) места: sidebar вставил элемент и выбросил исключение', 'qa: sidebar'],
      ['logo-before', 'б) места: logo выбросил исключение до вставки', 'qa: logo'],
      ['top-after', 'места: top вставил элемент и выбросил исключение', 'qa: top'],
      ['restore-after', 'места: restore вставил элемент и выбросил исключение', 'qa: restore'],
      ['progress', 'в) progress() выбросил исключение при запуске', 'qa: progress'],
    ];
    for (const [kind, title, message] of CASES) {
      const was = refusals(page).length;
      const failed = await page.evaluateHandle((kind) => {
        const $ = (id) => document.getElementById(id);
        const places = window.stand.places();
        const fail = {
          'sidebar-after': { places: { ...places, sidebar: (el) => ($('site-side-end').before(el), (() => { throw new Error('qa: sidebar'); })()) } },
          'logo-before': { places: { ...places, logo: () => { throw new Error('qa: logo'); } } },
          'top-after': { places: { ...places, top: (el) => ($('site-head').insertBefore(el, $('site-title')), (() => { throw new Error('qa: top'); })()) } },
          'restore-after': { places: { ...places, restore: (el) => ($('site-menu-list').append(el), (() => { throw new Error('qa: restore'); })()) } },
          progress: { progress: () => { throw new Error('qa: progress'); } },
        }[kind];
        return window.stand.mount(fail);
      }, kind);
      const after = { nodes: await ownNodes(page), marks: await ownMarks(page), listeners: await listeners(page, cdp), mounted: await failed.evaluate((pet) => pet.mounted) };
      check(`${label}: ${title} — элементов и отметок модуля нет`, after.nodes === 0 && after.marks.length === 0, JSON.stringify({ nodes: after.nodes, marks: after.marks, counts: await counts(page) }));
      check(`${label}: ${title} — слушатели document, window и медиазапросов сняты`, sameListeners(after.listeners, baseline), JSON.stringify({ baseline, now: after.listeners }));
      check(`${label}: ${title} — сайт не тронут (разметка, свой cat-*, поле, фокус, каретка, данные, отметка html)`, (await siteState(page)) === before);
      const told = refusals(page).slice(was);
      check(`${label}: ${title} — исключение не дошло до сайта, сообщение понятное, экземпляр не подключён`, after.mounted === false && told.length === 1 && told[0].includes(message), JSON.stringify({ mounted: after.mounted, told }));
      // Методы неудачного экземпляра ничего не делают; destroy — дважды.
      const calls = await failed.evaluate((pet) => {
        pet.open();
        pet.open('play');
        pet.update();
        pet.update({ timer: true, focus: true });
        pet.notify('saved', { key: 'late', counted: true, first: true });
        pet.notify('failed');
        pet.close();
        pet.destroy();
        pet.destroy();
        return { opened: pet.opened, mounted: pet.mounted };
      });
      const fired = await page.evaluate(() => window.qaPetFired);
      await page.clock.runFor(10000);
      check(`${label}: ${title} — методы и повторный destroy ничего не оживляют, отложенного нет`, calls.opened === false && calls.mounted === false && (await ownNodes(page)) === 0 && (await page.evaluate(() => window.qaPetFired)) === fired && (await siteState(page)) === before, JSON.stringify(calls));
      // г, к) После отказа — обычное подключение: без дублей, столько же слушателей, сколько у образца.
      await page.evaluate(() => window.stand.mount());
      await page.clock.runFor(3000);
      const normal = { counts: await counts(page), nodes: await ownNodes(page), listeners: await listeners(page, cdp), mounted: await page.evaluate(() => window.stand.pet.mounted) };
      check(`${label}: ${title} — затем обычное подключение без дублей и лишних слушателей`, normal.counts === '1,1,1,1' && normal.nodes === reference.nodes && sameListeners(normal.listeners, reference.listeners) && normal.mounted === true, JSON.stringify({ normal, reference }));
      await page.evaluate(() => window.stand.pet.destroy());
      check(`${label}: ${title} — отключение после него — чисто`, (await ownNodes(page)) === 0 && (await ownMarks(page)).length === 0 && sameListeners(await listeners(page, cdp), baseline) && (await siteState(page)) === before);
    }

    // Неверные места и настройки — отказ до любых действий: работающий питомец, хранилище и слушатели не тронуты.
    await page.evaluate(() => window.stand.mount());
    await page.clock.runFor(3000);
    const storage = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])));
    const working = { listeners: await listeners(page, cdp), nodes: await ownNodes(page), stored: await storage() };
    const BAD = [
      ['без places.logo', '{ "logo": null }', 'places.logo'],
      ['places.top — не функция', '{ "top": "#site-head" }', 'places.top'],
      ['places.sidebar — не функция', '{ "sidebar": 1 }', 'places.sidebar'],
      ['без places', 'null', 'places'],
      ['progress — не функция', '"progress"', 'progress'],
      ['storage — пустая строка', '"storage"', 'storage'],
    ];
    for (const [title, patch, message] of BAD) {
      const was = refusals(page).length;
      const result = await page.evaluate(
        async ([patch, title]) => {
          const { mountPet } = await import('/pet/pet.mjs');
          const value = JSON.parse(patch);
          const options = title.startsWith('без places') && value === null ? { places: undefined } : value === 'progress' ? { progress: 42 } : value === 'storage' ? { storage: '' } : { places: { ...window.stand.places(), ...value } };
          const bad = mountPet(window.stand.options(options));
          return { bad: bad.mounted, working: window.stand.pet.mounted };
        },
        [patch, title],
      );
      const told = refusals(page).slice(was);
      const now = { listeners: await listeners(page, cdp), nodes: await ownNodes(page), stored: await storage() };
      check(`${label}: ${title} — отказ без действий, работающий питомец на месте`, result.bad === false && result.working === true && told.length === 1 && told[0].includes(message) && now.nodes === working.nodes && sameListeners(now.listeners, working.listeners) && now.stored === working.stored, JSON.stringify({ result, told, nodes: now.nodes }));
    }
    await page.evaluate(() => window.stand.pet.open());
    check(`${label}: после неверных подключений прежний питомец открывается`, (await sheetOpen(page)) && (await counts(page)) === '1,1,1,1');
    await page.evaluate(() => window.stand.pet.destroy());

    // Подключение из функции места (вложенное): отказ вложенного, внешний подключён без дублей.
    const nested = await page.evaluate(async () => {
      const { mountPet } = await import('/pet/pet.mjs');
      const places = window.stand.places();
      window.stand.mount({
        places: {
          ...places,
          logo: (el) => {
            places.logo(el);
            window.qaInner = mountPet(window.stand.options());
          },
        },
      });
      return { inner: window.qaInner.mounted, outer: window.stand.pet.mounted };
    });
    await page.clock.runFor(3000);
    check(`${label}: подключение из функции места — вложенное отказано, внешнее работает без дублей`, nested.inner === false && nested.outer === true && (await counts(page)) === '1,1,1,1' && refusals(page).at(-1)?.includes('подключение уже идёт'), JSON.stringify({ nested, counts: await counts(page), told: refusals(page).at(-1) }));
    await page.evaluate(() => window.stand.pet.destroy());
    check(`${label}: после всех отказов — сайт тот же, слушателей как до подключения`, (await ownNodes(page)) === 0 && (await ownMarks(page)).length === 0 && sameListeners(await listeners(page, cdp), baseline) && (await siteState(page)) === before);
    await page.evaluate(() => document.getElementById('site-check').click());
    check(`${label}: обработчики сайта работают`, (await page.evaluate(() => window.qaClicks)) === 1);
    check(`${label}: других ошибок и предупреждений нет`, unexpected(page).length === 0, unexpected(page).join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Две копии модуля на странице (одинаковые файлы по адресам /pet/ и /pet2/ — разные модули браузера): одновременно
// работает один питомец; новое подключение любой копии заменяет прежнее; отключение прежнего не задевает нового; отложенное
// прежней копии молчит. Версия 0.1.1 (без реестра) активна — новая копия отказывает и её не трогает.
async function copies(browser, base, check) {
  const label = 'модуль: две копии';
  const { context, page, cdp } = await open(browser, { viewport: { width: 1280, height: 900 } });
  const opened = () => page.evaluate(() => document.querySelectorAll('dialog.cat-sheet[open]').length);
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    const baseline = await listeners(page, cdp);
    const loaded = await page.evaluate(async () => {
      window.qaA = await import('/pet/pet.mjs');
      window.qaB = await import('/pet2/pet.mjs');
      return { distinct: window.qaA.mountPet !== window.qaB.mountPet, versions: [window.qaA.VERSION, window.qaB.VERSION] };
    });
    check(`${label}: две копии — разные модули одной версии`, loaded.distinct && loaded.versions.every((v) => v === VERSION), JSON.stringify(loaded));

    // ж) A, затем B: один комплект элементов, A отключён, его отложенное молчит, открыт только B.
    await page.evaluate(() => {
      window.qaPa = window.stand.mount({}, window.qaA.mountPet);
    });
    await page.clock.runFor(3000);
    const single = await listeners(page, cdp);
    await page.evaluate(() => {
      window.stand.set(3, 1);
      window.qaPa.notify('saved', { key: 'copy-a', counted: true, first: true });
    });
    const firedA = await page.evaluate(() => window.qaPetFired);
    await page.evaluate(() => {
      window.qaPb = window.stand.mount({}, window.qaB.mountPet);
    });
    await page.clock.runFor(3000);
    const both = await page.evaluate(() => ({ a: window.qaPa.mounted, b: window.qaPb.mounted }));
    check(`${label}: подключение второй копии — один комплект элементов (#cat-sheet, #cat-dock, #cat-side, #cat-live)`, (await counts(page)) === '1,1,1,1', await counts(page));
    check(`${label}: вторая копия заменила первую — первая отключена`, both.a === false && both.b === true, JSON.stringify(both));
    await page.clock.runFor(10000);
    check(`${label}: отложенные реакции и объявления первой копии не срабатывают`, (await page.evaluate(() => window.qaPetFired)) === firedA, `${firedA} → ${await page.evaluate(() => window.qaPetFired)}`);
    await page.evaluate(() => {
      window.qaPa.open();
      window.qaPb.open();
    });
    check(`${label}: открыть обе — открыт один диалог, второй копии`, (await opened()) === 1 && (await page.evaluate(() => window.qaPb.opened && !window.qaPa.opened)));
    check(`${label}: слушателей — как у одного питомца`, sameListeners(await listeners(page, cdp), single), JSON.stringify({ single, now: await listeners(page, cdp) }));
    // з) Отключение прежнего при существующем новом: отметки, элементы и диалог нового на месте.
    const marked = await ownMarks(page);
    await page.evaluate(() => window.qaPa.destroy());
    check(`${label}: destroy первой копии не трогает вторую — отметки html, элементы, открытый диалог`, JSON.stringify(await ownMarks(page)) === JSON.stringify(marked) && marked.includes('cat-open') && (await counts(page)) === '1,1,1,1' && (await opened()) === 1, JSON.stringify({ marked, now: await ownMarks(page) }));
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.qaPb.destroy());
    check(`${label}: отключение второй — чисто`, (await moduleNodes(page)) === 0 && (await marks(page)).length === 0 && sameListeners(await listeners(page, cdp), baseline));

    // Обратный порядок и одна копия дважды: прежний destroy не трогает нового.
    const reverse = await page.evaluate(() => {
      const pb = window.stand.mount({}, window.qaB.mountPet);
      const pa = window.stand.mount({}, window.qaA.mountPet);
      pb.destroy();
      const kept = { a: pa.mounted, b: pb.mounted, at: document.documentElement.dataset.petAt ?? '' };
      pa.destroy();
      const a1 = window.stand.mount({}, window.qaA.mountPet);
      const a2 = window.stand.mount({}, window.qaA.mountPet);
      a1.destroy();
      a2.open();
      return { kept, same: { a1: a1.mounted, a2: a2.mounted, opened: a2.opened, at: document.documentElement.dataset.petAt ?? '' } };
    });
    check(`${label}: B, затем A — destroy B не трогает A`, reverse.kept.a === true && reverse.kept.b === false && reverse.kept.at === 'sidebar', JSON.stringify(reverse.kept));
    check(`${label}: одна копия дважды — destroy первого не трогает второго`, reverse.same.a2 === true && reverse.same.a1 === false && reverse.same.opened && reverse.same.at === 'sidebar' && (await counts(page)) === '1,1,1,1', JSON.stringify(reverse.same));
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.stand.pet.destroy());
    check(`${label}: после всех подключений — чисто`, (await moduleNodes(page)) === 0 && (await marks(page)).length === 0 && sameListeners(await listeners(page, cdp), baseline));

    // Версия 0.1.1 (без реестра) уже работает: новая копия отказывает и её не трогает.
    const legacy = await page.evaluate(async () => {
      window.qaOld = await import('/old/pet.mjs');
      window.qaPo = window.stand.mount({}, window.qaOld.mountPet);
      const pn = window.stand.mount({}, window.qaA.mountPet);
      window.qaPo.open();
      return { old: window.qaOld.VERSION, newer: pn.mounted, opened: window.qaPo.opened };
    });
    check(`${label}: работает 0.1.1 — новая копия отказывает, 0.1.1 не тронута`, legacy.old === '0.1.1' && legacy.newer === false && legacy.opened && (await counts(page)) === '1,1,1,1' && refusals(page).at(-1)?.includes('#cat-'), JSON.stringify({ legacy, counts: await counts(page), told: refusals(page).at(-1) }));
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.qaPo.destroy());
    const after = await page.evaluate(() => window.stand.mount({}, window.qaA.mountPet).mounted);
    check(`${label}: после отключения 0.1.1 — новая копия подключается`, after === true && (await counts(page)) === '1,1,1,1');
    await page.evaluate(() => window.stand.pet.destroy());
    // Элемент сайта с id модуля: отказ, элемент сайта не тронут.
    const foreignId = await page.evaluate(() => {
      const own = Object.assign(document.createElement('div'), { id: 'cat-live', textContent: 'сайт' });
      document.body.append(own);
      const pet = window.stand.mount();
      const kept = document.getElementById('cat-live') === own && own.textContent === 'сайт' && document.querySelectorAll('#cat-live').length === 1;
      own.remove();
      return { mounted: pet.mounted, kept };
    });
    check(`${label}: на странице уже есть #cat-live сайта — отказ, элемент сайта не тронут`, foreignId.mounted === false && foreignId.kept && (await moduleNodes(page)) === 0, JSON.stringify(foreignId));
    check(`${label}: других ошибок и предупреждений нет`, unexpected(page).length === 0, unexpected(page).join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Стили сайта до CSS модуля, после него и после подключения: минимальный сайт и сайт с общими правилами по тегам button,
// input, h2, dialog. Все вычисленные свойства элементов сайта (кроме переменных --pet-* и --cat-* на :root) — те же; после
// подключения — те же, кроме размеров контейнеров, куда сайт поставил питомца; открытый уголок блокирует прокрутку
// (overflow у html) — и только. Питомец под общими правилами сайта — та же геометрия уголка и сцены, кнопки не меньше 44 px.
const SITE_ELEMENTS = ['html', 'body', '#head', '#title', '#nav', '#link', '#main', '#h2', '#text', '#small', '#label', '#input', '#button', '#list', '#item', '#dialog', '#dialog-h2', '#dialog-button'];
const SIZES = ['width', 'height', 'inline-size', 'block-size', 'perspective-origin', 'transform-origin'];
const computed = (page) =>
  page.evaluate(
    (list) =>
      Object.fromEntries(
        list.map((selector) => {
          const style = getComputedStyle(document.querySelector(selector));
          const props = {};
          for (let i = 0; i < style.length; i += 1) if (!style[i].startsWith('--')) props[style[i]] = style.getPropertyValue(style[i]);
          return [selector, props];
        }),
      ),
    SITE_ELEMENTS,
  );
const changed = (a, b, skip = []) =>
  Object.keys(a).flatMap((selector) =>
    Object.keys(a[selector])
      .filter((prop) => !skip.includes(prop) && a[selector][prop] !== b[selector][prop])
      .map((prop) => `${selector} ${prop}: ${a[selector][prop]} → ${b[selector][prop]}`),
  );
// Вид питомца: окно и все видимые кнопки, поля, заголовки и абзацы в нём — рамка и свойства, которые задевают общие
// правила сайта по тегам; кнопка места в шапке сайта — рамка и свойства рамки (шрифт у мест наследуется от сайта).
const LOOK = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-transform', 'letter-spacing', 'padding', 'margin', 'border', 'border-radius', 'background-color', 'color', 'min-width', 'display', 'width'];
const BOX = ['padding', 'margin', 'border', 'border-radius', 'background-color', 'min-width', 'display', 'width', 'height'];
const petLook = (page) =>
  page.evaluate(
    ([props, box]) => {
      const sheet = document.querySelector('.cat-sheet');
      const line = (el, list) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const frame = list === props ? [r.left, r.top, r.width, r.height] : [r.width, r.height];
        return `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}[${el.textContent.trim().slice(0, 24) || el.getAttribute('aria-label') || ''}] ${frame.map(Math.round).join(' ')} ${list.map((prop) => style.getPropertyValue(prop)).join('|')}`;
      };
      const visible = (list) => [...list].filter((el) => el.checkVisibility());
      return [...visible([sheet, ...sheet.querySelectorAll('button, input, h2, h3, p, label, a, legend, summary')]).map((el) => line(el, props)), ...visible(document.querySelectorAll('#head :is(.cat-side, .cat-face) button, #head .cat-face')).map((el) => line(el, box))];
    },
    [LOOK, BOX],
  );

async function styles(browser, base, check) {
  const label = 'модуль: стили сайта';
  const result = {};
  for (const kind of ['plain', 'rules']) {
    const title = kind === 'plain' ? 'минимальный сайт' : 'сайт с общими правилами button, input, h2, dialog';
    // Реплики уголка — одинаковые на обоих сайтах (случайность — подменой).
    const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, () => (Math.random = () => 0.5));
    try {
      await page.goto(`${base}site/${kind}`);
      await page.waitForFunction(() => window.qaReady);
      const before = await computed(page);
      await page.evaluate(() => window.qaCss(['/pet/pet-base.css', '/pet/pet.css', '/pet/dog.css']));
      const css = changed(before, await computed(page));
      check(`${label}, ${title}: CSS модуля (pet-base, pet, dog) не меняет ни одного вычисленного свойства элементов сайта`, css.length === 0, css.slice(0, 8).join(' | '));
      await page.evaluate(() => window.qaMount());
      await page.clock.runFor(3000);
      const mounted = changed(before, await computed(page), SIZES);
      check(`${label}, ${title}: подключение не меняет свойств элементов сайта (кроме размеров контейнера с питомцем)`, mounted.length === 0, mounted.slice(0, 8).join(' | '));
      await page.locator('.cat-side-face').click();
      const open = changed(before, await computed(page), SIZES);
      check(`${label}, ${title}: открытый уголок — только блокировка прокрутки страницы (overflow у html)`, open.length > 0 && open.every((line) => /^html overflow(-x|-y|-block|-inline)?: visible → hidden$/.test(line)), open.join(' | '));
      await page.locator('.cat-settings > summary').click();
      result[kind] = { corner: await petLook(page) };
      await page.locator('[data-cat-play]').click();
      result[kind].play = await petLook(page);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.qaPet.destroy());
      const gone = changed(before, await computed(page));
      check(`${label}, ${title}: после отключения — все свойства как до подключения`, gone.length === 0, gone.slice(0, 8).join(' | '));
      check(`${label}, ${title}: ошибок нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
    } catch (error) {
      check(`${label}, ${title}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
  for (const view of ['corner', 'play']) {
    const plain = result.plain?.[view] ?? [];
    const rules = result.rules?.[view] ?? [];
    const diff = rules.map((line, i) => [plain[i], line]).filter(([a, b]) => a !== b).map(([a, b]) => `${a ?? '—'} ⇒ ${b}`);
    check(`${label}: под общими правилами сайта ${view === 'corner' ? 'уголок с «Настройками»' : '«Поиграть»'} — те же рамки и свойства кнопок, полей и заголовков (${plain.length})`, plain.length > 5 && plain.length === rules.length && diff.length === 0, diff.slice(0, 30).join('\n'));
  }
}

export async function petModuleQa({ browser, check, layout }) {
  const server = await serve();
  try {
    await desktop(browser, server.base, check, layout);
    await phone(browser, server.base, check, layout);
    await scenes(browser, server.base, check);
    await minimal(browser, server.base, check, layout);
    await steps(browser, server.base, check);
    await failures(browser, server.base, check);
    await copies(browser, server.base, check);
    await styles(browser, server.base, check);
    await storageQa(browser, server.base, check, open);
  } finally {
    await server.close();
  }
}

// Запуск: npm run test:browser.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '✓' : '✗'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
  };
  const layout = async (page, label) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${label}: без горизонтальной прокрутки`, overflow <= 0, `overflow=${overflow}`);
  };
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
    await petModuleQa({ browser, check, layout });
  } catch (error) {
    check('модуль питомца: сценарий выполнен', false, error.stack);
  } finally {
    await browser?.close();
  }
  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено`);
  process.exit(failed.length ? 1 : 0);
}
