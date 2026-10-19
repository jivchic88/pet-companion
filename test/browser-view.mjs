// Контейнерный режим (PL07) в Chrome: вход pet-companion/web (mountPetIn) на стенде test/container.html — условный сайт без
// CSS модуля (питомец приносит стили сам, в своё теневое дерево) — и вместе с legacy mountPet на стенде test/stand.html.
// Проверки поведения и ресурсов, не только наличия: два контейнера разных размеров и пространств имён — независимые
// питомцы, имена, реакции, игра и редактор; изменение одного не меняет другой; сайт (его разметка, вычисленные стили,
// html и body, прокрутка, фокус) не меняется; диалог — в своём Shadow DOM (showModal), фокус и Esc по шагам, верхний
// модальный, onOpenChange — только настоящие переходы; команды через view.core и кнопки — один итог; подписка, команда
// и core.destroy из слушателя, повторный destroy; общий namespace — общий координатор (независимые поля, тихое изменение
// соседа, одно лакомство, один день сценки); отключение и повторное подключение во время жеста, кадров, объявления,
// фокуса и ожидания резервирования — позднее старого не трогает новое; размеры по контейнеру (ширина родителя при том же
// окне), ноль, display:none, удаление и возврат контейнера, вложенная прокрутка, изменение окна во время жеста;
// клавиатура, палец (CDP), уменьшение движения на старте и на ходу, масштаб 200 %, длинное имя, узкий и низкий
// контейнер; watchTyping; агрессивные правила сайта и своя тема у двух контейнеров; id, ссылки SVG и aria — внутри своего
// дерева; отказ неполного своего и неподходящего штатного набора, хранилища, IndexedDB, стилей и колбэков сайта —
// честный итог, очистка только своего; после отключения всех — ни слушателей, ни таймеров, ни кадров, ни наблюдателей,
// ни слушателя storage. Пример расширения в контейнере (кролик и живая модель) и CSP-стенд с HTTP-заголовком
// default-src 'self'; style-src 'self' — отдельные функции ниже. Часы — page.clock. Запуск — в составе npm run test:browser.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
export const CSP = "default-src 'self'; style-src 'self'";

// Только QA: учёт ресурсов страницы, заведённых модулем (стек — файл /pet/… или пакета node_modules/pet-companion/pet/…):
// ждущие таймеры, кадры анимации, наблюдатели размеров; нарушения CSP; необработанные отклонения; последнее событие
// указателя. Подмены — обёртки, поведение страницы прежнее.
export function viewInit() {
  const mine = () => /\/pet\/(?:[\w-]+\/)*[\w-]+\.mjs/.test(new Error().stack ?? '');
  window.qaRejections = [];
  window.addEventListener('unhandledrejection', (event) => window.qaRejections.push(String(event.reason)));
  window.qaViolations = [];
  document.addEventListener('securitypolicyviolation', (event) => window.qaViolations.push(`${event.violatedDirective} ${event.blockedURI} ${event.sample ?? ''}`), true);
  const set = window.setTimeout.bind(window);
  const clear = window.clearTimeout.bind(window);
  window.qaTimers = new Map();
  window.setTimeout = (fn, ms = 0, ...args) => {
    const own = mine();
    const id = set(
      (...rest) => {
        window.qaTimers.delete(id);
        if (typeof fn === 'function') fn(...rest);
      },
      ms,
      ...args,
    );
    if (own) window.qaTimers.set(id, ms);
    return id;
  };
  window.clearTimeout = (id) => {
    window.qaTimers.delete(id);
    clear(id);
  };
  const frame = window.requestAnimationFrame.bind(window);
  const unframe = window.cancelAnimationFrame.bind(window);
  window.qaFrames = new Set();
  window.requestAnimationFrame = (fn) => {
    const own = mine();
    const id = frame((time) => {
      window.qaFrames.delete(id);
      fn(time);
    });
    if (own) window.qaFrames.add(id);
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
  window.qaPointer = { n: 0, x: 0, y: 0 };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.addEventListener(type, (event) => Object.assign(window.qaPointer, { n: window.qaPointer.n + 1, x: event.clientX, y: event.clientY }), true);
}

// Ресурсы модуля на странице сейчас: ждущие таймеры, кадры, активные наблюдатели размеров.
export const resources = (page) => page.evaluate(() => ({ timers: window.qaTimers.size, frames: window.qaFrames.size, observers: window.qaObservers.size }));

// Слушатели document и window (CDP), в том числе storage окна.
export async function listeners(cdp) {
  const list = async (expression) => {
    const { result } = await cdp.send('Runtime.evaluate', { expression });
    return (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners;
  };
  const doc = await list('document');
  const win = await list('window');
  return { document: doc.length, window: win.length, storage: win.filter((item) => item.type === 'storage').length };
}

// Вид в контейнере: свой элемент, его теневое дерево, место питомца, диалог.
const shade = (page, id, fn, arg = null) =>
  page.evaluate(
    ([where, body, extra]) => {
      const host = document.querySelector(`#${where} > [data-pet-view]`);
      const shadow = host?.shadowRoot ?? null;
      const sheet = shadow?.querySelector('.cat-sheet') ?? null;
      // eslint-disable-next-line no-new-func
      return new Function('host', 'shadow', 'sheet', 'arg', body)(host, shadow, sheet, extra);
    },
    [id, fn, arg],
  );
const sheetOf = (page, id) => shade(page, id, 'return { open: Boolean(sheet?.open), view: sheet?.dataset.view ?? "", focus: shadow?.activeElement?.getAttribute("data-cat-close") !== null ? "close" : (shadow?.activeElement?.className ?? null) };');
const stageOf = (page, id) => shade(page, id, 'const box = shadow?.querySelector(".pet-view"); const art = box?.querySelector(".cat-art"); return { view: box?.dataset.view ?? null, surface: box?.dataset.surface ?? null, hidden: box?.hidden ?? null, pose: art?.dataset.pose ?? null, coat: art?.dataset.coat ?? null, kind: art?.dataset.kind ?? (art ? "cat" : null), artView: art?.dataset.view ?? null, motion: host?.getAttribute("data-cat-motion") ?? null };');
const activeIn = (page, id) => shade(page, id, 'const a = shadow?.activeElement; return a ? (a.getAttribute("data-cat-close") !== null ? "close" : a.className || a.tagName) : null;');
const liveOf = (page, id) => shade(page, id, 'return [shadow?.querySelector("#cat-live")?.textContent ?? null, sheet?.querySelector("[data-cat-live-in]")?.textContent ?? null];');
// Метод вида или его ядра (путь через точку), аргументы и результат — простые данные.
const call = (page, name, where, ...args) =>
  page.evaluate(
    ([n, w, list]) => {
      const fn = w.split('.').reduce((object, part) => object?.[part], window.qaViews[n]);
      const result = fn(...list);
      return result === undefined ? null : JSON.parse(JSON.stringify(result));
    },
    [name, where, args],
  );
const state = (page, name) => page.evaluate((n) => JSON.parse(JSON.stringify(window.qaViews[n].core?.getState() ?? null)), name);
// Закрытие диалога браузером (Esc) — событие close приходит задачей: ждём, пока ядро вида закроет вид.
const closedIn = (page, name) => page.waitForFunction((n) => window.qaViews[n].core.getState().view.open === null, name, { timeout: 3000 });
const finishOpen = (page, id) => shade(page, id, 'return Promise.all((sheet?.getAnimations() ?? []).map((animation) => animation.finished)).then(() => true);');

// Сайт без изменений: вычисленные стили своих элементов, разметка, html и body, прокрутка.
const SITE = ['body', '#title', '#text', '#site-button', '#label', '#field', '#c-own', '#scroller'];
const SITE_PROPS = ['color', 'background-color', 'font-family', 'font-size', 'font-style', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'padding', 'margin', 'border', 'display', 'position', 'box-sizing', 'overflow', 'opacity', 'visibility'];
const site = (page) =>
  page.evaluate(
    ([selectors, props]) => ({
      styles: selectors.map((s) => `${s}: ${props.map((p) => getComputedStyle(document.querySelector(s)).getPropertyValue(p)).join('|')}`),
      html: [document.documentElement.getAttribute('class'), document.documentElement.getAttribute('style'), Object.keys(document.documentElement.dataset).join(), getComputedStyle(document.documentElement).overflow].join('|'),
      body: [document.body.getAttribute('class'), document.body.getAttribute('style'), document.body.children.length, getComputedStyle(document.body).overflow].join('|'),
      markup: document.getElementById('site').outerHTML.replace(/<div data-pet-view=""[^>]*><\/div>/g, ''),
      scroll: [window.scrollX, window.scrollY],
      ids: [...document.querySelectorAll('[id]')].map((el) => el.id).filter((id) => /^cat-/.test(id)),
    }),
    [SITE, SITE_PROPS],
  );

// Мини-сервер контейнерного стенда: /container — test/container.html, /pet/… — модуль (вложенные папки), /extension/… и
// /csp/… — примеры с файлами пакета по адресу установленного архива (/node_modules/pet-companion/pet/…); CSP-стенд — с
// заголовком Content-Security-Policy; /legacy-csp/… — legacy mountPet под тем же заголовком (проверка ограничений legacy).
export function serveView() {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://stand');
    if (pathname === '/favicon.ico') return res.writeHead(204).end();
    const own = /^\/(extension|csp)\/([\w-]+\.(mjs|css|html))?$/.exec(pathname);
    const legacy = /^\/legacy-csp\/([\w-]+\.(mjs|css|html))?$/.exec(pathname);
    const pkg = /^\/(?:node_modules\/pet-companion\/)?pet\/((?:[\w-]+\/)*[\w-]+\.(mjs|css))$/.exec(pathname);
    const file =
      pathname === '/'
        ? path.join(root, 'test', 'stand.html')
        : pathname === '/container'
        ? path.join(root, 'test', 'container.html')
        : own
          ? path.join(root, 'examples', own[1], own[2] ?? 'index.html')
          : legacy
            ? path.join(root, 'test', 'csp-legacy', legacy[1] ?? 'index.html')
            : pkg
              ? path.join(root, 'pet', pkg[1])
              : '';
    const headers = { 'content-type': TYPES[path.extname(file)], 'cache-control': 'no-store' };
    if (own?.[1] === 'csp' || legacy) headers['content-security-policy'] = CSP;
    try {
      if (!file) throw new Error('нет');
      const body = await readFile(file);
      res.writeHead(200, headers);
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((done) => server.close(done)) })));
}

function watchNetwork(page, base) {
  const outside = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:')) outside.push(url);
  });
  return outside;
}

// Подключить вид на стенде: window.qaViews[name] = mountPetIn(#id, options); onOpenChange — журнал window.qaOpen.
const mount = (page, name, id, options = {}) =>
  page.evaluate(
    ([n, where, o]) => {
      window.qaViews ??= {};
      window.qaOpen ??= [];
      const view = window.web.mountPetIn(document.getElementById(where), {
        ...o,
        ...(o.home ? { home: () => document.getElementById(o.home) } : {}),
        onOpenChange: (open) => window.qaOpen.push(`${n}:${open}`),
      });
      window.qaViews[n] = view;
      return { mounted: view.mounted, core: view.core !== null };
    },
    [name, id, options],
  );
const openLog = (page) => page.evaluate(() => [...(window.qaOpen ?? [])]);
// Ввод доходит до страницы по кадрам: ждём, что событие указателя дошло, и только потом двигаем часы.
async function sent(page, send) {
  const n = await page.evaluate(() => window.qaPointer.n);
  await send();
  await page.waitForFunction((k) => window.qaPointer.n > k, n, { timeout: 3000 });
}
// Настоящая IndexedDB идёт своим временем: ждём наблюдаемое условие, не двигая часы страницы (сдвиг часов во время
// резервирования — задержанный старт сценки, она отменилась бы), не дольше timeout.
async function until(page, condition, arg = null, timeout = 5000) {
  await page.waitForFunction(condition, arg, { timeout }).catch(() => {});
  return page.evaluate(condition, arg);
}
// Запись дня сценки в базе (без шлюза); базы нет — создаётся пустая.
const sceneRecord = (page, db) =>
  page.evaluate(
    (name) =>
      new Promise((resolve) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('scene');
        request.onsuccess = () => {
          const get = request.result.transaction('scene').objectStore('scene').get('shown');
          get.onsuccess = () => {
            request.result.close();
            resolve(get.result ?? null);
          };
        };
      }),
    db,
  );
// Поглаживание мышью по голове питомца в «Поиграть» вида id: точка рисунка (70, 66) единиц 220×204, восемь сдвигов.
async function stroke(page, id) {
  const box = await page.locator(`#${id} .cat-play-pet`).boundingBox();
  const [x0, y0] = [box.x + (box.width * 70) / 220, box.y + (box.height * 66) / 204];
  await page.mouse.move(x0, y0);
  await sent(page, () => page.mouse.down());
  for (let i = 1; i <= 8; i += 1) await sent(page, () => page.mouse.move(x0 + i * 8, y0));
  return [x0 + 64, y0];
}

async function basics(browser, base, check, open, layout) {
  const label = 'контейнер 1280×900';
  const { context, page, cdp } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
  const outside = watchNetwork(page, base);
  try {
    await page.goto(`${base}container`);
    await page.waitForFunction(() => window.qaReady);
    const before = await site(page);
    const baseline = await listeners(cdp);
    const free = await resources(page);
    // Два контейнера разных размеров и пространств имён.
    const a = await mount(page, 'a', 'a', { namespace: 'one', progress: undefined });
    const b = await mount(page, 'b', 'b', { namespace: 'two' });
    await page.clock.runFor(3000);
    check(`${label}: два контейнера подключены — mounted, core`, a.mounted && a.core && b.mounted && b.core, JSON.stringify({ a, b }));
    const views = { a: await stageOf(page, 'a'), b: await stageOf(page, 'b') };
    check(`${label}: размеры по контейнеру — широкий целиком, маленький (150×130) портретом; стили загружены, место видно`, views.a.view === 'full' && views.a.artView === 'full' && views.b.view === 'portrait' && views.b.artView === 'portrait' && views.a.hidden === false && views.b.hidden === false, JSON.stringify(views));
    const after = await site(page);
    check(`${label}: сайт не изменился — стили своих элементов, разметка (кроме своего элемента в контейнере), html, body, прокрутка, ни одного id cat-* в документе`, JSON.stringify(after.styles) === JSON.stringify(before.styles) && after.markup === before.markup && after.html === before.html && after.body === before.body && after.scroll.join() === '0,0' && after.ids.length === 0, JSON.stringify({ before, after }).slice(0, 2000));
    const kids = await page.evaluate(() => [document.getElementById('c').children.length, document.getElementById('a').children.length, document.getElementById('a').firstElementChild?.getAttribute('data-pet-view'), Boolean(document.querySelector('#a > [data-pet-view]').shadowRoot), document.querySelector('#a > [data-pet-view]').shadowRoot?.mode]);
    check(`${label}: свой элемент data-pet-view с открытым Shadow DOM внутри контейнера; ShadowRoot не на самом контейнере`, kids[1] === 1 && kids[2] === '' && kids[3] && kids[4] === 'open', JSON.stringify(kids));
    // Независимые питомцы: имя одного не меняет другого, ключи — только своих пространств.
    const named = await call(page, 'a', 'core.setName', 'Альфа');
    await call(page, 'b', 'core.setPet', 'dog');
    const names = [(await state(page, 'a')).name.display, (await state(page, 'b')).name.display, (await state(page, 'b')).pet.shown, (await stageOf(page, 'a')).kind, (await stageOf(page, 'b')).kind];
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    check(`${label}: независимо — имя «Альфа» у первого, собака у второго; ключи только one:* и two:*`, named.save.status === 'saved' && names.join() === 'Альфа,Тоби,dog,cat,dog' && keys.every((key) => /^(one|two):/.test(key)) && keys.some((key) => key.startsWith('one:')) && keys.some((key) => key.startsWith('two:')), JSON.stringify({ names, keys }));
    // Команда через view.core и кнопка — один итог: облик сразу на рисунке, кнопкой — тот же снимок.
    await call(page, 'a', 'core.setAppearance', { coat: 'ginger' });
    const coat = (await stageOf(page, 'a')).coat;
    check(`${label}: прямая команда view.core.setAppearance — облик сразу на рисунке в контейнере`, coat === 'ginger', coat);
    // Клик по питомцу — диалог в своём дереве, onOpenChange только у своего, прокрутку страницы не блокирует.
    await page.locator('#a .cat-view-btn').click();
    await finishOpen(page, 'a');
    const opened = { a: await sheetOf(page, 'a'), b: await sheetOf(page, 'b'), log: await openLog(page), html: await page.evaluate(() => getComputedStyle(document.documentElement).overflow + '|' + document.documentElement.className) };
    check(`${label}: питомец кнопкой — уголок в своём Shadow DOM (showModal), фокус на «Закрыть» своего дерева; onOpenChange(true) только у первого; страница не заблокирована`, opened.a.open && !opened.b.open && opened.a.focus === 'close' && opened.log.join() === 'a:true' && opened.html === 'visible|', JSON.stringify(opened));
    check(`${label}: уголок — имя «Альфа», без мест сайта («Место питомца», «Вид рядом со страницей») и учебного шага`, (await shade(page, 'a', 'return [sheet.querySelector("#cat-sheet-title").textContent, Boolean(sheet.querySelector("[data-cat-place-box]")), Boolean(sheet.querySelector("[data-cat-view-box]")), Boolean(sheet.querySelector("[data-cat-learn-card]"))].join();')) === 'Альфа,false,false,false');
    // Облик кнопкой в уголке — тот же путь: снимок и рисунок.
    await page.locator('#a .cat-settings > summary').click();
    await page.locator('#a .cat-coat-option:has(input[value="tuxedo"])').click();
    const tux = [(await state(page, 'a')).look.coat, (await stageOf(page, 'a')).coat, (await state(page, 'b')).look.coat];
    check(`${label}: облик кнопкой уголка — тот же итог, что прямой командой; у второго — свой облик`, tux.join() === 'tuxedo,tuxedo,caramel', JSON.stringify(tux));
    await page.keyboard.press('Escape');
    await closedIn(page, 'a');
    const shut = { sheet: await sheetOf(page, 'a'), active: await activeIn(page, 'a'), log: await openLog(page) };
    check(`${label}: Esc — уголок закрыт, фокус на питомце в контейнере; onOpenChange(false)`, !shut.sheet.open && shut.active === 'cat-view-btn' && shut.log.join() === 'a:true,a:false', JSON.stringify(shut));
    // «Поиграть»: поглаживание мышью в своём дереве; второй вид не реагирует.
    await page.locator('#a .cat-view-btn').press('Enter');
    await finishOpen(page, 'a');
    await page.locator('#a [data-cat-play]').click();
    const other = JSON.stringify((await state(page, 'b')).pose);
    await stroke(page, 'a');
    const petted = { pose: await shade(page, 'a', 'return sheet.querySelector(".cat-play .cat-art").dataset.pose;'), hint: await shade(page, 'a', 'return sheet.querySelector("[data-cat-play-hint]").textContent;'), other: JSON.stringify((await state(page, 'b')).pose) };
    await sent(page, () => page.mouse.up());
    check(`${label}: «Поиграть» первого — поглаживание мышью: довольная поза и «мурлычет»; поза и реакция второго не изменились`, petted.pose === 'pet' && petted.hint === 'Альфа мурлычет.' && petted.other === other, JSON.stringify(petted));
    // Миска и мячик кнопками — итоги сцены; перенос миски мышью — через общий указатель вида.
    await page.clock.runFor(1500);
    await page.locator('#a [data-cat-play-bowl]').click();
    const bowl = await shade(page, 'a', 'return sheet.querySelector("[data-cat-play-hint]").textContent;');
    check(`${label}: миска кнопкой — итог сцены первого`, bowl === 'Альфа принюхивается к миске.', bowl);
    // Редактор с клавиатуры: выбор, стрелка, «Сохранить».
    await page.keyboard.press('Escape');
    await page.locator('#a [data-cat-room]').click();
    await page.locator('#a [data-room-pick="yarn"]').click();
    await page.keyboard.press('ArrowRight');
    const draft = (await state(page, 'a')).room.draft;
    await page.locator('#a [data-room-save]').click();
    const saved = { view: (await sheetOf(page, 'a')).view, room: await page.evaluate(() => JSON.parse(localStorage.getItem('one:room:v1'))) };
    check(`${label}: «Обустроить уголок» первого — выбор, стрелка вправо, «Сохранить»: запись one:room:v1, назад в уголок`, draft?.changed.join() === 'yarn' && saved.view === '' && saved.room?.cat?.yarn?.x > 0, JSON.stringify({ draft, saved }));
    await page.keyboard.press('Escape');
    // Подписка, команда из слушателя, отписка; core.destroy из слушателя снимает весь вид.
    const sub = await page.evaluate(() => {
      const view = window.qaViews.b;
      const seen = [];
      const off = view.core.subscribe((update) => {
        seen.push(update.reason);
        if (update.reason === 'setName') view.core.setPreferences({ phrases: false });
      }, { initial: false });
      const result = view.core.setName('Бета');
      off();
      view.core.setName('Гамма');
      return { seen, ok: result.ok, phrases: view.core.getState().prefs.phrases, name: view.core.getState().name.display };
    });
    check(`${label}: подписка — обновление команды, команда из слушателя выполнена сразу; отписка — дальше тихо`, sub.ok && sub.seen.join() === 'setName,setPreferences' && sub.phrases === false && sub.name === 'Гамма', JSON.stringify(sub));
    const lost = await page.evaluate(() => {
      const view = window.qaViews.b;
      view.core.subscribe((update) => update.reason === 'setPet' && view.core.destroy(), { initial: false });
      view.core.setPet('cat');
      return { mounted: view.mounted, status: view.core.status, host: Boolean(document.querySelector('#b > [data-pet-view]')), open: view.open().error.code };
    });
    await call(page, 'b', 'destroy');
    check(`${label}: core.destroy() из слушателя — вид снят целиком (элемент, mounted false), ядро — destroyed; повторный destroy — ничего`, lost.mounted === false && lost.status === 'destroyed' && !lost.host && lost.open === 'destroyed', JSON.stringify(lost));
    check(`${label}: первый вид после отключения второго жив, его наблюдатель размеров на месте`, (await page.evaluate(() => window.qaViews.a.mounted)) && (await stageOf(page, 'a')).view === 'full' && (await resources(page)).observers >= 1);
    // Отключение всех — ресурсы как до подключения (общий координатор живёт, но без слушателя storage).
    await call(page, 'a', 'destroy');
    await page.clock.runFor(1000);
    const gone = { listeners: await listeners(cdp), resources: await resources(page), site: await site(page) };
    check(`${label}: после отключения всех — слушатели document и window как до подключения, слушателя storage нет, ждущих таймеров, кадров и наблюдателей модуля нет`, gone.listeners.document === baseline.document && gone.listeners.window === baseline.window && gone.listeners.storage === 0 && gone.resources.timers === free.timers && gone.resources.frames === 0 && gone.resources.observers === 0, JSON.stringify({ baseline, free, gone: { ...gone, site: undefined } }));
    check(`${label}: после отключения — сайт как до подключения (своих элементов нет)`, JSON.stringify(gone.site.styles) === JSON.stringify(before.styles) && gone.site.markup === before.markup && (await page.evaluate(() => document.querySelectorAll('[data-pet-view]').length)) === 0);
    await layout(page, label);
    check(`${label}: без ошибок страницы, необработанных отклонений, нарушений и внешних запросов`, page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length + window.qaViolations.length)) === 0 && outside.length === 0, JSON.stringify({ errors: page.qaErrors, outside }));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}


// Legacy mountPet и два контейнера на одной странице (стенд legacy с pet.css в документе): каждый работает; замена и
// отключение legacy не трогают контейнеры; отключение контейнера не трогает legacy и соседний; id и отметки — свои.
async function together(browser, base, check, open) {
  const label = 'legacy и два контейнера 1280×900';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    await page.evaluate(async () => {
      window.web = await import('/pet/web.mjs');
      for (const id of ['x', 'y']) {
        const box = Object.assign(document.createElement('div'), { id });
        box.style.width = '240px';
        document.getElementById('site-main').append(box);
      }
      window.stand.mount();
    });
    await mount(page, 'x', 'x', { namespace: 'vx' });
    await mount(page, 'y', 'y', { namespace: 'vy' });
    await page.clock.runFor(3000);
    const ids = await page.evaluate(() => [document.querySelectorAll('#cat-sheet').length, document.getElementById('cat-sheet')?.getRootNode() === document && document.getElementById('cat-sheet').parentElement === document.body, ['x', 'y'].map((id) => document.querySelector(`#${id} > [data-pet-view]`).shadowRoot.querySelectorAll('#cat-sheet').length).join()]);
    check(`${label}: все подключены; #cat-sheet документа — legacy, у каждого контейнера — свой в своём дереве`, (await page.evaluate(() => window.stand.pet.mounted && window.qaViews.x.mounted && window.qaViews.y.mounted)) && ids[0] === 1 && ids[1] && ids[2] === '1,1', JSON.stringify(ids));
    // Замена legacy новым mountPet — контейнеры работают.
    await page.evaluate(() => window.stand.mount());
    await page.clock.runFor(1000);
    const replaced = await page.evaluate(() => ({ legacy: window.stand.pet.mounted, x: window.qaViews.x.mounted, y: window.qaViews.y.mounted, status: [window.qaViews.x.core.status, window.qaViews.y.core.status].join() }));
    check(`${label}: новый mountPet заменил только legacy — контейнеры подключены, ядра работают`, replaced.legacy && replaced.x && replaced.y && replaced.status === 'running,running', JSON.stringify(replaced));
    // Legacy-диалог открыт: отметки и блокировка прокрутки — legacy; контейнеры не трогаются.
    await page.locator('#cat-dock .cat-dock-btn').click();
    const legacyOpen = { lock: await page.evaluate(() => document.documentElement.classList.contains('cat-open')), log: await openLog(page), x: (await sheetOf(page, 'x')).open };
    await page.keyboard.press('Escape');
    check(`${label}: диалог legacy — его блокировка прокрутки; onOpenChange контейнеров не вызван, их диалоги закрыты`, legacyOpen.lock && legacyOpen.log.length === 0 && !legacyOpen.x, JSON.stringify(legacyOpen));
    // Диалог контейнера и Esc в нём: legacy-диалог не открывается, отметки legacy не меняются.
    await page.locator('#x .cat-view-btn').click();
    await finishOpen(page, 'x');
    const marks = await page.evaluate(() => document.documentElement.className);
    await page.keyboard.press('Escape');
    await closedIn(page, 'x');
    check(`${label}: Esc в диалоге контейнера — закрыт только он; legacy-диалог не открыт, cat-open на html не ставится`, !(await page.evaluate(() => document.getElementById('cat-sheet').open)) && !/cat-open/.test(marks) && (await openLog(page)).join() === 'x:true,x:false', marks);
    // Отключение legacy — контейнеры работают; отметки legacy сняты.
    await page.evaluate(() => window.stand.pet.destroy());
    const legacyGone = await page.evaluate(() => ({ marks: [...document.documentElement.classList].filter((name) => /^(cat|pet)-/.test(name)).length + Object.keys(document.documentElement.dataset).filter((name) => /^(cat|pet)[A-Z]/.test(name)).length, x: window.qaViews.x.mounted, y: window.qaViews.y.mounted, opened: window.qaViews.x.open().ok }));
    await page.keyboard.press('Escape');
    await closedIn(page, 'x');
    check(`${label}: destroy legacy — отметки html сняты, контейнеры подключены и открываются`, legacyGone.marks === 0 && legacyGone.x && legacyGone.y && legacyGone.opened, JSON.stringify(legacyGone));
    // Снова legacy, затем отключение контейнера — legacy и соседний живы.
    await page.evaluate(() => window.stand.mount());
    await call(page, 'x', 'destroy');
    const containerGone = await page.evaluate(() => ({ legacy: window.stand.pet.mounted, at: document.documentElement.dataset.petAt, y: window.qaViews.y.mounted, x: document.querySelectorAll('#x > [data-pet-view]').length }));
    check(`${label}: destroy контейнера — legacy (места, отметки) и соседний контейнер живы`, containerGone.legacy && containerGone.at === 'sidebar' && containerGone.y && containerGone.x === 0, JSON.stringify(containerGone));
    await page.evaluate(() => {
      window.stand.pet.destroy();
      window.qaViews.y.destroy();
    });
    check(`${label}: без ошибок страницы и необработанных отклонений`, page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Отменённый перенос legacy (PL11.2, D1): отметка вида data-pet-view на <html> — не контейнер питомца, поэтому click после
// отпускания вне мест, Esc над питомцем, pointercancel, потери захвата и скрытия вкладки поглощается и уголок не
// открывается; следующий обычный клик открывает. Нажатие внутри настоящего контейнера (data-pet-view на своём элементе)
// legacy не трогает, даже пока ждёт своего click. pointercancel и скрытие вкладки — синтетические события (у мыши
// настоящего pointercancel нет; document.hidden подменён на время события).
async function cancelledMove(browser, base, check, open) {
  const label = 'перенос legacy и контейнер 1280×900';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    await page.evaluate(async () => {
      window.web = await import('/pet/web.mjs');
      const box = Object.assign(document.createElement('div'), { id: 'x' });
      box.style.width = '240px';
      document.getElementById('site-main').append(box);
      window.qaMoveId = null;
      window.addEventListener('pointerdown', (event) => (window.qaMoveId = event.pointerId), true);
      // Перенос — только к логотипу сайта (рамка шапки стенда).
      window.stand.mount({ zone: (device, id) => (id === 'logo' ? document.getElementById('site-head').getBoundingClientRect().toJSON() : null) });
    });
    await mount(page, 'x', 'x', { namespace: 'vx' });
    await page.clock.runFor(3000);
    const legacy = () => page.evaluate(() => ({ open: Boolean(document.getElementById('cat-sheet')?.open), at: document.documentElement.dataset.petAt, view: document.documentElement.dataset.petView, move: document.documentElement.dataset.petMove ?? null, zones: document.querySelectorAll('.pet-zones').length }));
    const start = await legacy();
    const face = await page.locator('#cat-dock [data-pet-drag]').boundingBox();
    const cx = face.x + face.width / 2;
    const cy = face.y + face.height / 2;
    check(`${label}: legacy с рамкой места — кот целиком в боковой панели, на <html> data-pet-view="full"; перенос включён`, start.at === 'sidebar' && start.view === 'full' && !start.open && face.width > 0, JSON.stringify(start));
    // Начать перенос мышью: нажать на питомца и сдвинуть больше порога — места на экране.
    const grab = async () => {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 12, cy + 4, { steps: 3 });
      return legacy();
    };
    const after = async (name, run) => {
      const moving = await grab();
      await run();
      await page.clock.runFor(200);
      const end = await legacy();
      check(`${label}: ${name} — уголок не открылся, место прежнее, мест и отметки переноса нет`, moving.move === 'drag' && moving.zones === 1 && !end.open && end.at === 'sidebar' && end.move === null && end.zones === 0, JSON.stringify({ moving, end }));
      // Сценарии независимы: открытый по ошибке уголок закрыть.
      if (end.open) {
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('cat-sheet').open);
      }
    };
    await after('отпустили вне мест', async () => {
      await page.mouse.move(640, 640, { steps: 4 });
      await page.mouse.up();
    });
    await after('Esc с указателем над питомцем, затем отпустили на нём', async () => {
      await page.mouse.move(cx, cy, { steps: 2 });
      await page.keyboard.press('Escape');
      await page.mouse.up();
    });
    await after('pointercancel, затем отпустили над питомцем', async () => {
      await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: window.qaMoveId, isPrimary: true, pointerType: 'mouse' })));
      await page.mouse.move(cx, cy, { steps: 2 });
      await page.mouse.up();
    });
    await after('потеря захвата, затем отпустили над питомцем', async () => {
      await page.evaluate(() => document.querySelector('#cat-dock [data-pet-drag]').releasePointerCapture(window.qaMoveId));
      await page.mouse.move(cx, cy, { steps: 2 });
      await page.mouse.up();
    });
    await after('вкладка скрыта, затем отпустили над питомцем', async () => {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
        delete document.hidden;
      });
      await page.mouse.move(cx, cy, { steps: 2 });
      await page.mouse.up();
    });
    // Изоляция контейнера: legacy ждёт своего click (Esc при нажатой кнопке, отпускание), click внутри контейнера проходит
    // и открывает его уголок; следующий click по legacy-питомцу — часть отменённого переноса.
    await grab();
    await page.keyboard.press('Escape');
    const inside = await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: window.qaMoveId, isPrimary: true, pointerType: 'mouse' }));
      const button = document.querySelector('#x > [data-pet-view]').shadowRoot.querySelector('.cat-view-btn');
      const passed = button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, detail: 1 }));
      return { passed, legacy: Boolean(document.getElementById('cat-sheet')?.open) };
    });
    await finishOpen(page, 'x');
    const box = await sheetOf(page, 'x');
    await page.keyboard.press('Escape');
    await closedIn(page, 'x');
    await page.mouse.up();
    await page.clock.runFor(200);
    const muted = await legacy();
    check(`${label}: click внутри контейнера, пока legacy ждёт click переноса, — не поглощён, уголок контейнера открыт; click по legacy после отпускания — поглощён`, inside.passed && !inside.legacy && box.open && !muted.open && muted.at === 'sidebar', JSON.stringify({ inside, box, muted }));
    // Следующий обычный клик — открывает уголок.
    await page.mouse.click(cx, cy);
    await page.clock.runFor(200);
    const plain = await legacy();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('cat-sheet').open);
    check(`${label}: следующий обычный клик по питомцу открывает уголок`, plain.open, JSON.stringify(plain));
    // Контроль: отпустили над местом — питомец у логотипа, уголок не открыт.
    await grab();
    const head = await page.locator('#site-head').boundingBox();
    await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2, { steps: 4 });
    await page.mouse.up();
    await page.clock.runFor(200);
    const dropped = await legacy();
    check(`${label}: контроль — отпустили над местом: питомец у логотипа, уголок не открыт`, dropped.at === 'logo' && !dropped.open && dropped.move === null, JSON.stringify(dropped));
    check(`${label}: без ошибок страницы и необработанных отклонений`, page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Только перенос legacy (PL11.2, D1) — для отдельного прогона; в составе test:browser — viewQa.
export async function cancelledMoveQa(browser, check, open) {
  const server = await serveView();
  try {
    await cancelledMove(browser, server.base, check, open);
  } finally {
    await server.close();
  }
}

// Общий namespace: два контейнера на одном координаторе — независимые поля не теряются, правка соседа приходит тихо (без
// объявлений у него), одно лакомство на день, один день редкой сценки (общая IndexedDB). Изоляция DOM не означает
// изоляцию общих настроек.
async function shared(browser, base, check, open) {
  const label = 'общий namespace 1280×900';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
  await context.addInitScript(() => {
    Math.random = () => 0.05;
  });
  try {
    await page.goto(`${base}container`);
    await page.waitForFunction(() => window.qaReady);
    await page.evaluate(() => (window.qaCounts = { marks: 1, today: 1 }));
    for (const [name, id] of [
      ['p', 'a'],
      ['q', 'c'],
    ]) {
      await page.evaluate(([n, where]) => {
        window.qaViews ??= {};
        window.qaViews[n] = window.web.mountPetIn(document.getElementById(where), { namespace: 'same', progress: () => window.qaCounts });
      }, [name, id]);
    }
    await page.clock.runFor(3000);
    const told = () => page.evaluate(() => ['a', 'c'].map((id) => document.querySelector(`#${id} > [data-pet-view]`).shadowRoot.querySelector('#cat-live').textContent));
    await page.evaluate(() => {
      for (const id of ['a', 'c']) document.querySelector(`#${id} > [data-pet-view]`).shadowRoot.querySelector('#cat-live').textContent = '';
    });
    await call(page, 'p', 'core.setName', 'Общий');
    await call(page, 'q', 'core.setAppearance', { coat: 'ginger' });
    await page.clock.runFor(200);
    const stored = await page.evaluate(() => [JSON.parse(localStorage.getItem('same:cat:v1')).name, JSON.parse(localStorage.getItem('same:look:v1')).cat]);
    const shown = [(await state(page, 'p')).look.coat, (await state(page, 'q')).name.display, (await stageOf(page, 'a')).coat];
    check(`${label}: независимые поля двух видов не теряются (имя — первый, облик — второй); каждый видит правку соседа`, stored.join() === 'Общий,ginger' && shown.join() === 'ginger,Общий,ginger', JSON.stringify({ stored, shown }));
    check(`${label}: правка соседа — тихо: объявлений у другого вида нет`, (await told()).join('|') === '|', JSON.stringify(await told()));
    // Один день сценки: случайность 0,05 (шанс сценки — да). Занятие в первом — сценка и запись дня в IndexedDB same:scene;
    // занятие во втором в тот же день — сценки нет.
    await page.evaluate(() => {
      window.qaScenes = { p: 0, q: 0 };
      for (const name of ['p', 'q']) window.qaViews[name].core.subscribe((update) => update.snapshot.pose.reaction?.scene && (window.qaScenes[name] += 1), { initial: false });
    });
    await call(page, 'p', 'core.notify', 'saved', { key: 'lesson-1', counted: true });
    await page.clock.runFor(1600);
    await until(page, () => window.qaScenes.p > 0);
    const day = await sceneRecord(page, 'same:scene');
    await page.clock.runFor(6000);
    await call(page, 'q', 'core.notify', 'saved', { key: 'lesson-2', counted: true });
    await page.clock.runFor(1600);
    // Попытка второго решена: ждущей сценки и идущего резервирования нет.
    await until(page, () => { const scene = window.qaViews.q.core.getState().scene; return !scene.waiting && !scene.reserving; });
    const counted = await page.evaluate(() => ({ ...window.qaScenes }));
    check(`${label}: один день сценки на namespace — первый вид показал сценку и записал день (same:scene), второй в тот же день — нет`, counted.p > 0 && counted.q === 0 && day?.day === '2026-10-11', JSON.stringify({ counted, day }));
    // Одно лакомство на день: кормление в первом — второй видит «угостили» и не кормит второй раз.
    await page.clock.runFor(6000);
    const fed = await call(page, 'p', 'core.feed');
    const again = await call(page, 'q', 'core.feed');
    check(`${label}: одно лакомство на день — второй вид: treat-fed, в снимке fed`, fed.ok && !again.ok && again.error.code === 'treat-fed' && (await state(page, 'q')).treat === 'fed', JSON.stringify({ fed, again }));
    await page.evaluate(() => Object.values(window.qaViews).forEach((view) => view.destroy()));
    check(`${label}: без ошибок страницы и необработанных отклонений`, page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Отключение и повторное подключение посреди действий: жест (захват и слушатели окна), кадры анимации предмета,
// ждущее объявление, фокус, ожидание резервирования дня; позднее старого не действует на новый вид.
async function lifecycle(browser, base, check, open) {
  const label = 'отключение посреди действий 1280×900';
  const { context, page, cdp } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
  try {
    await page.goto(`${base}container`);
    await page.waitForFunction(() => window.qaReady);
    const baseline = await listeners(cdp);
    await mount(page, 'a', 'a', { namespace: 'life', home: 'field' });
    await mount(page, 'b', 'b', { namespace: 'life-b' });
    await page.clock.runFor(2000);
    // Жест идёт (кнопка мыши нажата, сдвиги) — отключение: захват и слушатели окна сняты.
    await page.locator('#a .cat-view-btn').click();
    await finishOpen(page, 'a');
    await page.locator('#a [data-cat-play]').click();
    const [x, y] = await stroke(page, 'a');
    const during = await listeners(cdp);
    await call(page, 'a', 'destroy');
    const after = await listeners(cdp);
    await sent(page, () => page.mouse.move(x + 20, y));
    await sent(page, () => page.mouse.up());
    const focus = await page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName);
    check(`${label}: destroy во время жеста — слушатели окна жеста сняты (их больше не стало), позднее отпускание безвредно; фокус был в диалоге — на home() сайта`, during.window > after.window && focus === 'field' && (await openLog(page)).join() === 'a:true,a:false', JSON.stringify({ during, after, focus, log: await openLog(page) }));
    // Повторное подключение в тот же контейнер: новое ядро, жест и игра работают; старое ядро — destroyed.
    await mount(page, 'a2', 'a', { namespace: 'life' });
    await page.clock.runFor(500);
    await page.locator('#a .cat-view-btn').click();
    await finishOpen(page, 'a');
    await page.locator('#a [data-cat-play]').click();
    await stroke(page, 'a');
    await sent(page, () => page.mouse.up());
    check(`${label}: повторное подключение в тот же контейнер — новый вид, поглаживание работает; старое ядро destroyed`, (await shade(page, 'a', 'return sheet.querySelector("[data-cat-play-hint]").textContent;')) === 'Марс мурлычет.' && (await page.evaluate(() => window.qaViews.a.core.status)) === 'destroyed');
    // Кадры: мячик катится (анимация кадрами) — отключение до конца: ждущих кадров нет.
    await page.locator('#a [data-cat-play-ball]').click();
    const rolling = (await resources(page)).frames;
    await call(page, 'a2', 'destroy');
    await page.clock.runFor(100);
    check(`${label}: destroy, пока мячик катится — кадры анимации сняты`, rolling > 0 && (await resources(page)).frames === 0, JSON.stringify({ rolling, now: await resources(page) }));
    // Ждущее объявление (80 мс): готовое имя → объявление «Имя: …»; отключение до него — в новом виде объявления нет.
    await mount(page, 'a3', 'a', { namespace: 'life' });
    await page.clock.runFor(200);
    await page.locator('#a .cat-view-btn').click();
    await finishOpen(page, 'a');
    await page.locator('#a [data-cat-name-pick]').first().click();
    await call(page, 'a3', 'destroy');
    await mount(page, 'a4', 'a', { namespace: 'life' });
    await page.clock.runFor(300);
    check(`${label}: объявление прежнего вида после отключения не попадает в новый`, (await liveOf(page, 'a')).join('|') === '|', JSON.stringify(await liveOf(page, 'a')));
    // Фокус у соседа: отключение вида не крадёт его.
    await page.locator('#b .cat-view-btn').focus();
    await call(page, 'a4', 'destroy');
    check(`${label}: destroy одного вида не крадёт фокус у соседа`, (await activeIn(page, 'b')) === 'cat-view-btn' && (await page.evaluate(() => document.activeElement === document.querySelector('#b > [data-pet-view]'))));
    // Резервирование дня ждёт (транзакция IndexedDB удержана): отключение и новый вид — поздний итог старого его не трогает.
    await page.evaluate(() => {
      const openDb = indexedDB.open.bind(indexedDB);
      window.qaHeld = [];
      indexedDB.open = (name, ...rest) => {
        const request = openDb(name, ...rest);
        if (name === 'held:scene')
          request.addEventListener('success', () => {
            const db = request.result;
            const tx = db.transaction.bind(db);
            db.transaction = (...args) => {
              const t = tx(...args);
              let handler = null;
              Object.defineProperty(t, 'oncomplete', { configurable: true, get: () => handler, set: (fn) => (handler = fn) });
              t.addEventListener('complete', (event) => window.qaHeld.push(() => handler?.call(t, event)));
              return t;
            };
          });
        return request;
      };
      Math.random = () => 0.05;
      window.qaCounts = { marks: 1, today: 1 };
    });
    await page.evaluate(() => {
      window.qaViews.h = window.web.mountPetIn(document.getElementById('a'), { namespace: 'held', progress: () => window.qaCounts });
    });
    await page.clock.runFor(2000);
    await call(page, 'h', 'core.notify', 'saved', { key: 'held-1', counted: true });
    await page.clock.runFor(1600);
    await until(page, () => window.qaHeld.length > 0);
    const held = await page.evaluate(() => window.qaHeld.length);
    await call(page, 'h', 'destroy');
    await page.evaluate(() => {
      window.qaViews.h2 = window.web.mountPetIn(document.getElementById('a'), { namespace: 'held', progress: () => window.qaCounts });
    });
    await page.clock.runFor(500);
    const before = JSON.stringify((await state(page, 'h2')).pose.reaction);
    await page.evaluate(() => window.qaHeld.forEach((run) => run()));
    await page.clock.runFor(200);
    const late = { reaction: JSON.stringify((await state(page, 'h2')).pose.reaction), copy: await page.evaluate(() => localStorage.getItem('held:scene:v1')) };
    check(`${label}: резервирование ждало, вид отключён и подключён заново — поздний итог старого не меняет новый (реакция та же, копию дня не пишет)`, held > 0 && late.reaction === before && late.copy === null, JSON.stringify({ held, before, late }));
    await call(page, 'h2', 'destroy');
    // Несохранённая память прежнего ядра не наследуется: запись имени отказала (хранилище переполнено), вид отключён —
    // новый вид показывает подтверждённое имя.
    await mount(page, 'm', 'a', { namespace: 'memo' });
    await call(page, 'm', 'core.setName', 'Сохранённый');
    await page.evaluate(() => {
      const set = Storage.prototype.setItem;
      window.qaUnset = () => (Storage.prototype.setItem = set);
      Storage.prototype.setItem = function (key, value) {
        if (key === 'memo:cat:v1') throw new Error('переполнено (проверка)');
        return set.call(this, key, value);
      };
    });
    const unsaved = await call(page, 'm', 'core.setName', 'Несохранённый');
    await call(page, 'm', 'destroy');
    await page.evaluate(() => window.qaUnset());
    await mount(page, 'm2', 'a', { namespace: 'memo' });
    const memo = (await state(page, 'm2')).name.display;
    check(`${label}: повторное подключение — подтверждённые настройки (имя «Сохранённый»), несохранённое имя прежнего ядра не наследуется`, unsaved.save.status === 'failed' && memo === 'Сохранённый', JSON.stringify({ unsaved: unsaved.save, memo }));
    // Поздний таймер ввода прежнего вида (проверка ухода из поля, 250 мс) новый вид не трогает.
    await page.locator('#field').focus();
    await page.locator('#site-button').focus();
    await call(page, 'm2', 'destroy');
    await mount(page, 'm3', 'a', { namespace: 'memo' });
    await page.locator('#field').focus();
    await page.clock.runFor(400);
    check(`${label}: таймер ввода прежнего вида после отключения не снимает тишину нового (ввод в поле сайта идёт)`, (await state(page, 'm3')).context.quiet.join() === 'typing');
    await page.locator('#site-button').focus();
    await call(page, 'm3', 'destroy');
    await call(page, 'b', 'destroy');
    await page.clock.runFor(1000);
    const end = { listeners: await listeners(cdp), resources: await resources(page) };
    check(`${label}: после отключения всех — слушатели как до подключения, без слушателя storage, таймеров, кадров и наблюдателей`, end.listeners.document === baseline.document && end.listeners.window === baseline.window && end.listeners.storage === 0 && end.resources.timers === 0 && end.resources.frames === 0 && end.resources.observers === 0, JSON.stringify({ baseline, end }));
    check(`${label}: без ошибок страницы и необработанных отклонений`, page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Размеры по контейнеру: меняется только ширина родителя (окно то же) — вид и объявление ядру; высота контейнера; ноль,
// display:none, удаление и возврат контейнера; вложенная прокрутка; изменение окна во время жеста — жест отменён.
async function geometry(browser, base, check, open) {
  const label = 'размеры контейнера 1280×900';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
  try {
    await page.goto(`${base}container`);
    await page.waitForFunction(() => window.qaReady);
    await mount(page, 'a', 'a', { namespace: 'geo', home: 'field' });
    await page.clock.runFor(2000);
    // Изменение стиля контейнера; наблюдатель размеров срабатывает в отрисовке — ждём ожидаемый вид (не дольше 3 с).
    const step = async (css, want) => {
      await page.evaluate((style) => Object.assign(document.getElementById('a').style, style), css);
      await page.waitForFunction((view) => document.querySelector('#a > [data-pet-view]')?.shadowRoot.querySelector('.pet-view')?.dataset.view === view, want, { timeout: 3000 }).catch(() => {});
      return { stage: await stageOf(page, 'a'), full: (await state(page, 'a')).display.full, visible: (await state(page, 'a')).visible, viewport: await page.evaluate(() => innerWidth) };
    };
    const narrow = await step({ width: '120px' }, 'portrait');
    const wide = await step({ width: '320px' }, 'full');
    const low = await step({ height: '90px' }, 'portrait');
    const tall = await step({ height: '' }, 'full');
    check(`${label}: только ширина родителя (окно то же, 1280) — 120 px портрет, 320 px целиком; ядро знает (display.full)`, narrow.viewport === 1280 && narrow.stage.view === 'portrait' && narrow.full === false && wide.stage.view === 'full' && wide.full === true, JSON.stringify({ narrow, wide }));
    check(`${label}: низкий контейнер (90 px) — портрет; высота снова по пропорции — целиком`, low.stage.view === 'portrait' && tall.stage.view === 'full', JSON.stringify({ low, tall }));
    const zero = await step({ width: '0px' }, 'none');
    const opened = await call(page, 'a', 'open');
    const back = await step({ width: '320px' }, 'full');
    check(`${label}: нулевая ширина — питомец не на виду (visible false), open() — unsupported; восстановление — снова целиком и на виду`, zero.stage.view === 'none' && zero.visible === false && opened.error?.code === 'unsupported' && back.stage.view === 'full' && back.visible === true, JSON.stringify({ zero, opened, back }));
    // display:none при открытом диалоге — диалог закрыт (показать негде), onOpenChange(false); возврат — без диалога.
    await call(page, 'a', 'open');
    await finishOpen(page, 'a');
    const hidden = await step({ display: 'none' }, 'none');
    const log = await openLog(page);
    const shown = await step({ display: '' }, 'full');
    check(`${label}: display:none при открытом уголке — диалог закрыт, onOpenChange(false), не на виду; снова видно — без диалога, на виду`, hidden.stage.view === 'none' && !hidden.visible && log.join() === 'a:true,a:false' && !(await sheetOf(page, 'a')).open && shown.visible && shown.stage.view === 'full', JSON.stringify({ hidden, log, shown }));
    // Контейнер убран из документа и возвращён (без destroy): приостановлен и продолжается; диалог — закрыт.
    await call(page, 'a', 'open');
    await finishOpen(page, 'a');
    await page.evaluate(() => {
      window.qaKept = document.getElementById('a');
      window.qaKept.remove();
    });
    await page.waitForFunction(() => window.qaViews.a.core.getState().visible === false);
    const detached = { open: (await state(page, 'a')).view.open, log: await openLog(page), mounted: await page.evaluate(() => window.qaViews.a.mounted), focus: await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName) };
    await page.evaluate(() => document.querySelector('.boxes').prepend(window.qaKept));
    await page.waitForFunction(() => window.qaViews.a.core.getState().visible === true);
    check(`${label}: контейнер убран из документа при открытом уголке — вид закрыт, onOpenChange(false), не на виду, остаётся подключённым; возвращён — снова на виду и целиком`, detached.open === null && detached.log.at(-1) === 'a:false' && detached.mounted && (await stageOf(page, 'a')).view === 'full', JSON.stringify(detached));
    // Вложенная прокрутка: вид в прокручиваемом блоке; прокрутка блока — без изменений вида и ошибок; кнопкой — уголок.
    await mount(page, 'd', 'd', { namespace: 'geo-d' });
    await page.clock.runFor(500);
    await page.evaluate(() => (document.getElementById('scroller').scrollTop = 150));
    await page.waitForFunction(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    await page.locator('#d .cat-view-btn').click();
    await finishOpen(page, 'd');
    const nested = { sheet: await sheetOf(page, 'd'), stage: await stageOf(page, 'd') };
    await page.keyboard.press('Escape');
    await closedIn(page, 'd');
    check(`${label}: вид во вложенной прокрутке — прокрутка блока не меняет вид, уголок открывается и закрывается, фокус — на питомце`, nested.sheet.open && nested.stage.view === 'full' && (await activeIn(page, 'd')) === 'cat-view-btn', JSON.stringify(nested));
    // Прокрутилась область, в которой идёт жест (событие scroll предка жеста в своём дереве), — перенос отменён; прокрутка
    // чужого блока страницы жест не трогает.
    await page.locator('#a .cat-view-btn').click();
    await finishOpen(page, 'a');
    await page.locator('#a [data-cat-play]').click();
    await page.clock.runFor(100);
    const grab = async () => {
      const toyBox = await page.locator('#a [data-play-toy="ball"]').boundingBox();
      await page.mouse.move(toyBox.x + toyBox.width / 2, toyBox.y + toyBox.height / 2);
      await sent(page, () => page.mouse.down());
      await sent(page, () => page.mouse.move(toyBox.x + toyBox.width / 2 - 30, toyBox.y + toyBox.height / 2));
      return (await state(page, 'a')).play?.drag?.toy;
    };
    const first = await grab();
    await page.evaluate(() => document.getElementById('scroller').dispatchEvent(new Event('scroll')));
    const kept = (await state(page, 'a')).play?.drag?.toy;
    await shade(page, 'a', 'sheet.querySelector(".cat-play").dispatchEvent(new Event("scroll")); return true;');
    const dropped = (await state(page, 'a')).play?.drag;
    await sent(page, () => page.mouse.up());
    check(`${label}: прокрутка своей области во время переноса мячика — перенос отменён; прокрутка блока сайта — нет`, first === 'ball' && kept === 'ball' && dropped === null && (await state(page, 'a')).play.toys.ball.home === true, JSON.stringify({ first, kept, dropped }));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await closedIn(page, 'a');
    // Изменение окна во время переноса предмета в «Поиграть» — жест отменён (захват отпущен), предмет — на месте.
    await page.locator('#a .cat-view-btn').click();
    await finishOpen(page, 'a');
    await page.locator('#a [data-cat-play]').click();
    await page.clock.runFor(100);
    const toy = await page.locator('#a [data-play-toy="bowl"]').boundingBox();
    await page.mouse.move(toy.x + toy.width / 2, toy.y + toy.height / 2);
    await sent(page, () => page.mouse.down());
    await sent(page, () => page.mouse.move(toy.x + toy.width / 2 + 40, toy.y + toy.height / 2));
    const dragging = (await state(page, 'a')).play?.drag?.toy;
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.waitForFunction(() => window.qaViews.a.core.getState().play?.drag === null);
    await sent(page, () => page.mouse.up());
    const placed = (await state(page, 'a')).play.toys.bowl.home;
    check(`${label}: изменение окна во время переноса миски — перенос отменён ядром и указателем, миска на исходном месте`, dragging === 'bowl' && placed === true, JSON.stringify({ dragging, placed }));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate(() => Object.values(window.qaViews).forEach((view) => view.destroy()));
    check(`${label}: без ошибок страницы (и цикла ResizeObserver) и необработанных отклонений`, page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Клавиатура и фокус: Tab с поля сайта на питомца, Enter и Space, Tab и Shift+Tab в диалоге, действия игры кнопками и
// клавишами, редактор стрелками; Esc по уровням (перенос → редактор → уголок → закрыт) и автоповтор одной клавиши;
// верхний модальный из двух контейнеров; watchTyping по умолчанию и false.
async function keyboard(browser, base, check, open) {
  const label = 'клавиатура 1280×900';
  const { context, page, cdp } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
  const press = (key, repeat = false) => cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: { Escape: 27, Enter: 13 }[key], nativeVirtualKeyCode: { Escape: 27, Enter: 13 }[key], autoRepeat: repeat });
  const release = (key) => cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: { Escape: 27, Enter: 13 }[key] });
  try {
    await page.goto(`${base}container`);
    await page.waitForFunction(() => window.qaReady);
    await mount(page, 'a', 'a', { namespace: 'keys' });
    await mount(page, 'b', 'b', { namespace: 'keys-b', watchTyping: false });
    await page.clock.runFor(2000);
    // Tab с поля сайта — на питомца первого контейнера (порядок как на странице), Enter — уголок.
    await page.locator('#field').focus();
    const typing = [(await state(page, 'a')).context.quiet.join(), (await state(page, 'b')).context.quiet.join()];
    await page.keyboard.press('Tab');
    const onPet = await activeIn(page, 'a');
    await page.clock.runFor(400);
    const quiet = [(await state(page, 'a')).context.quiet.join(), (await state(page, 'b')).context.quiet.join()];
    check(`${label}: ввод в поле сайта — тишина typing у вида по умолчанию, у watchTyping:false — нет; ушли из поля — снята`, typing[0] === 'typing' && typing[1] === '' && quiet.join('|') === '|', JSON.stringify({ typing, quiet }));
    const ring = await shade(page, 'a', 'const btn = shadow.querySelector(".cat-view-btn"); const style = getComputedStyle(btn); return [btn.matches(":focus-visible"), style.outlineStyle, style.outlineWidth].join();');
    check(`${label}: Tab с поля сайта — фокус на питомце в контейнере (свой Shadow DOM), видимое кольцо фокуса`, onPet === 'cat-view-btn' && ring === 'true,solid,2px', JSON.stringify({ onPet, ring }));
    await page.keyboard.press('Enter');
    await finishOpen(page, 'a');
    const first = await activeIn(page, 'a');
    await page.keyboard.press('Tab');
    const next = await shade(page, 'a', 'const a = shadow.activeElement; return a && sheet.contains(a) ? a.textContent.trim().slice(0, 20) : null;');
    await page.keyboard.press('Shift+Tab');
    const back = await activeIn(page, 'a');
    check(`${label}: Enter — уголок, фокус на «Закрыть»; Tab — следующая кнопка в диалоге, Shift+Tab — снова «Закрыть»`, first === 'close' && next !== null && next !== 'Закрыть' && back === 'close' && (await page.evaluate(() => document.activeElement === document.querySelector('#a > [data-pet-view]'))), JSON.stringify({ first, next, back }));
    // Своё поле имени — не ввод страницы: тишины typing у своего вида нет.
    await shade(page, 'a', 'sheet.querySelector(".cat-settings").open = true; sheet.querySelector("input[name=cat-name]").focus(); return true;');
    await page.clock.runFor(300);
    const own = (await state(page, 'a')).context.quiet.join();
    await page.locator('#a [data-cat-close]').focus();
    check(`${label}: фокус в своём поле имени уголка — не ввод страницы: тишины typing нет`, own === '', own);
    // «Поиграть» с клавиатуры: фокус на «Поиграть», Space; кнопки сцены — Enter.
    await page.locator('#a [data-cat-play]').focus();
    await page.keyboard.press(' ');
    await page.locator('#a [data-cat-play-pet]').focus();
    await page.keyboard.press('Enter');
    const pet = await shade(page, 'a', 'return sheet.querySelector("[data-cat-play-hint]").textContent;');
    check(`${label}: «Поиграть» пробелом, «Погладить» Enter — итог сцены`, pet === 'Марс мурлычет.', pet);
    await page.keyboard.press('Escape');
    check(`${label}: Esc в «Поиграть» — назад в уголок, фокус на «Поиграть»`, (await sheetOf(page, 'a')).open && (await sheetOf(page, 'a')).view === '' && (await activeIn(page, 'a')) === 'pet-btn cat-play-open');
    // Редактор: стрелки на кнопке предмета; перенос мышью и Esc по шагам.
    await page.locator('#a [data-cat-room]').click();
    await page.locator('#a [data-room-pick="yarn"]').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowLeft');
    const nudged = (await state(page, 'a')).room.draft.changed.join();
    const item = await page.locator('#a [data-room-hit="bowl"]').boundingBox();
    await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2);
    await sent(page, () => page.mouse.down());
    await sent(page, () => page.mouse.move(item.x + item.width / 2 + 30, item.y + item.height / 2));
    const drag = (await state(page, 'a')).room.draft.drag?.id;
    await press('Escape');
    await release('Escape');
    const level1 = { drag: (await state(page, 'a')).room.draft?.drag ?? null, view: (await state(page, 'a')).view.open, changed: (await state(page, 'a')).room.draft?.changed.join() };
    await sent(page, () => page.mouse.up());
    // Одна клавиша с автоповтором не закрывает несколько уровней: нажатие — редактор отменён; автоповтор — ничего.
    await press('Escape');
    await press('Escape', true);
    await press('Escape', true);
    await release('Escape');
    const level2 = (await state(page, 'a')).view.open;
    await press('Escape');
    await release('Escape');
    await closedIn(page, 'a');
    check(`${label}: стрелка в редакторе — шаг клубка; Esc при переносе миски — отменён только перенос (редактор открыт, клубок сдвинут)`, nudged === 'yarn' && drag === 'bowl' && level1.drag === null && level1.view === 'room' && level1.changed === 'yarn', JSON.stringify({ nudged, drag, level1 }));
    check(`${label}: Esc с автоповтором — редактор отменён в уголок, автоповтор не закрыл диалог; новое нажатие — закрыт`, level2 === 'corner' && (await state(page, 'a')).view.open === null, JSON.stringify({ level2 }));
    // Верхний модальный: открыт первый, затем второй — Esc закрывает второй, первый открыт; ещё Esc — первый.
    await call(page, 'a', 'open');
    await finishOpen(page, 'a');
    await call(page, 'b', 'open');
    await finishOpen(page, 'b');
    await page.keyboard.press('Escape');
    await closedIn(page, 'b');
    const top = { a: (await sheetOf(page, 'a')).open, b: (await sheetOf(page, 'b')).open, log: await openLog(page) };
    await page.keyboard.press('Escape');
    await closedIn(page, 'a');
    check(`${label}: два открытых диалога — Esc закрывает верхний (второй), первый остаётся; затем первый; onOpenChange каждого — свои переходы`, top.a && !top.b && top.log.filter((item) => item.startsWith('b:')).join() === 'b:true,b:false' && (await openLog(page)).filter((item) => item.startsWith('a:')).at(-1) === 'a:false', JSON.stringify(top));
    await page.evaluate(() => Object.values(window.qaViews).forEach((view) => view.destroy()));
    check(`${label}: без ошибок страницы и необработанных отклонений`, page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Палец (CDP), уменьшение движения на старте и на ходу, масштаб 200 % (окно 640×450 при плотности 2), длинное имя, узкий и
// низкий контейнер — без горизонтальной прокрутки, кнопки диалога доступны.
async function touchAndScale(browser, base, check, open, layout) {
  {
    const label = 'контейнер 390×844 (палец, уменьшить движение)';
    const { context, page, cdp } = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }, viewInit);
    const touch = async (type, x, y) => {
      const send = () => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      await sent(page, send);
    };
    try {
      await page.goto(`${base}container`);
      await page.waitForFunction(() => window.qaReady);
      await mount(page, 'a', 'a', { namespace: 'touch' });
      // Приветствие дня (через 0,9 с, около 2 с) — закончилось: жест во время более важной реакции ядро не откликает, а
      // часы стенда идут и сами — без запаса итог зависел бы от скорости шагов.
      await page.clock.runFor(4000);
      check(`${label}: системное «уменьшить движение» на старте — вид без анимации (data-cat-motion none)`, (await stageOf(page, 'a')).motion === 'none' && (await state(page, 'a')).prefs.effectiveMotion === 'none');
      await page.locator('#a .cat-view-btn').tap();
      await finishOpen(page, 'a');
      await page.locator('#a [data-cat-play]').tap();
      await page.clock.runFor(100);
      const box = await page.locator('#a .cat-play-pet').boundingBox();
      const [x0, y0] = [box.x + (box.width * 70) / 220, box.y + (box.height * 66) / 204];
      await touch('touchStart', x0, y0);
      for (let i = 1; i <= 6; i += 1) await touch('touchMove', x0 + i * 10, y0);
      const petted = await shade(page, 'a', 'return sheet.querySelector("[data-cat-play-hint]").textContent;');
      await touch('touchEnd', x0 + 60, y0);
      check(`${label}: поглаживание пальцем (CDP) в «Поиграть» контейнера — «мурлычет»`, petted === 'Марс мурлычет.', petted);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(() => document.querySelector('#a > [data-pet-view]').getAttribute('data-cat-motion') === 'normal');
      check(`${label}: «уменьшить движение» выключили на ходу — движение снова обычное`, (await state(page, 'a')).prefs.effectiveMotion === 'normal');
      await layout(page, label);
      await page.evaluate(() => window.qaViews.a.destroy());
      check(`${label}: без ошибок страницы`, page.qaErrors.length === 0, JSON.stringify(page.qaErrors));
    } catch (error) {
      check(`${label}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
  {
    const label = 'масштаб 200 % (640×450, плотность 2)';
    const { context, page } = await open(browser, { viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 }, viewInit);
    try {
      await page.goto(`${base}container`);
      await page.waitForFunction(() => window.qaReady);
      await page.evaluate(() => {
        document.getElementById('a').style.width = '100%';
        document.getElementById('b').style.cssText = 'width: 60px; height: 44px';
      });
      await mount(page, 'a', 'a', { namespace: 'zoom' });
      await mount(page, 'b', 'b', { namespace: 'zoom-b' });
      await page.clock.runFor(2000);
      await call(page, 'a', 'core.setName', 'ШШШШШШШШШШШШШШШШШШШШШШШШ');
      await page.clock.runFor(100);
      const stages = [await stageOf(page, 'a'), await stageOf(page, 'b')];
      await page.locator('#a .cat-view-btn').click();
      await finishOpen(page, 'a');
      const fit = await shade(page, 'a', 'const body = sheet.querySelector("[data-cat-body]"); const title = sheet.querySelector("#cat-sheet-title"); const close = sheet.querySelector("[data-cat-close]").getBoundingClientRect(); return { body: body.scrollWidth - body.clientWidth, title: title.scrollWidth - title.clientWidth, sheet: sheet.getBoundingClientRect().right <= innerWidth + 0.5 && sheet.getBoundingClientRect().left >= -0.5, close: close.right <= innerWidth && close.bottom <= innerHeight, scrolls: body.scrollHeight > body.clientHeight };');
      const last = await shade(page, 'a', 'sheet.querySelector(".cat-settings").open = true; const hide = sheet.querySelector("[data-cat-hide]"); hide.scrollIntoView({ block: "nearest" }); const r = hide.getBoundingClientRect(); const box = sheet.getBoundingClientRect(); return { ok: r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 && r.bottom <= innerHeight + 0.5, r: [r.top, r.bottom], box: [box.top, box.bottom], h: innerHeight };');
      check(`${label}: диалог в окне, без горизонтальной прокрутки; длинное имя переносится в заголовке; «Закрыть» видна, последняя кнопка («Скрыть») доступна прокруткой`, fit.body <= 0 && fit.title <= 0 && fit.sheet && fit.close && last.ok, JSON.stringify({ fit, last }));
      check(`${label}: широкий контейнер — целиком, узкий и низкий (60×44) — портрет`, stages[0].view === 'full' && stages[1].view === 'portrait', JSON.stringify(stages));
      await page.keyboard.press('Escape');
      await closedIn(page, 'a');
      const bubble = await shade(page, 'a', 'const box = shadow.querySelector(".cat-view-say"); return box ? box.scrollWidth - box.clientWidth : 0;');
      check(`${label}: облако с длинным именем не шире места`, bubble <= 0, String(bubble));
      await layout(page, label);
      await page.evaluate(() => Object.values(window.qaViews).forEach((view) => view.destroy()));
      check(`${label}: без ошибок страницы`, page.qaErrors.length === 0, JSON.stringify(page.qaErrors));
    } catch (error) {
      check(`${label}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
}

// Агрессивные правила сайта (*, теги, !important, svg/path/circle, наследуемые шрифт и разрядка, правила с именами
// классов модуля): вычисленные стили содержимого теневого дерева — те же, что без них; своя тема двух контейнеров; тёмная
// схема — умолчания тёмные, но тема сайта сильнее.
async function styles(browser, base, check, open) {
  const label = 'стили сайта и тема';
  const PROPS = ['display', 'position', 'font-family', 'font-size', 'font-style', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'padding', 'margin', 'border', 'border-radius', 'background-color', 'color', 'fill', 'stroke', 'opacity', 'visibility', 'width', 'height', 'min-width', 'box-sizing'];
  const look = (page) =>
    shade(
      page,
      'a',
      `const pick = (el) => el ? arg.map((p) => getComputedStyle(el).getPropertyValue(p)).join('|') : 'нет';
      const list = [['свой элемент', host], ['место', shadow.querySelector('.pet-view')], ['кнопка питомца', shadow.querySelector('.cat-view-btn')], ['рисунок', shadow.querySelector('.cat-view-btn .cat-art')], ['контур рисунка', shadow.querySelector('.cat-view-btn .cat-art path')], ['диалог', sheet], ['заголовок', sheet.querySelector('#cat-sheet-title')], ['закрыть', sheet.querySelector('[data-cat-close]')], ['поиграть', sheet.querySelector('[data-cat-play]')], ['погладить', sheet.querySelector('[data-cat-pet]')], ['поле имени', sheet.querySelector('input[name="cat-name"]')], ['пол уголка', sheet.querySelector('.cat-floor-fill')], ['окно уголка', sheet.querySelector('.cat-sky-glass')]];
      return list.map(([name, el]) => name + ': ' + pick(el));`,
      PROPS,
    );
  const read = async (query, theme = null, scheme = 'light') => {
    const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 }, colorScheme: scheme }, viewInit);
    try {
      await page.goto(`${base}container${query}`);
      await page.waitForFunction(() => window.qaReady);
      if (theme) await page.evaluate((t) => document.getElementById('a').setAttribute('style', t), theme);
      await mount(page, 'a', 'a', { namespace: 'look' });
      await mount(page, 'b', 'b', { namespace: 'look-b' });
      await page.clock.runFor(2000);
      await page.locator('#a .cat-view-btn').click({ force: true });
      await finishOpen(page, 'a');
      const result = { look: await look(page), accent: [await shade(page, 'a', 'return getComputedStyle(sheet).getPropertyValue("--pet-accent").trim() + " " + getComputedStyle(sheet.querySelector(".cat-dot") ?? sheet).backgroundColor;'), await page.evaluate(() => getComputedStyle(document.querySelector('#b > [data-pet-view]').shadowRoot.querySelector('.cat-view-btn')).getPropertyValue('--pet-accent').trim())], site: await page.evaluate(() => ['#title', '#site-button', '#field', '#c-own'].map((s) => getComputedStyle(document.querySelector(s)).cssText || [...getComputedStyle(document.querySelector(s))].map((p) => getComputedStyle(document.querySelector(s)).getPropertyValue(p)).join('|')).join('\n')), errors: page.qaErrors };
      await page.evaluate(() => Object.values(window.qaViews).forEach((view) => view.destroy()));
      return result;
    } finally {
      await context.close();
    }
  };
  try {
    const plain = await read('');
    const rules = await read('?rules');
    const diff = plain.look.map((line, i) => [line, rules.look[i]]).filter(([x, y]) => x !== y);
    check(`${label}: под агрессивными правилами сайта (* и теги с !important, svg/path, шрифт и разрядка, классы модуля) — содержимое вида то же (${plain.look.length} элементов)`, plain.look.length === 13 && diff.length === 0 && !plain.look.some((line) => line.endsWith('нет')), diff.map(([x, y]) => `${x}\n⇒ ${y}`).join('\n\n').slice(0, 3000));
    const themed = await read('', '--pet-accent: rgb(200, 30, 30); width: 320px');
    check(`${label}: своя тема контейнера (--pet-accent на контейнере) — у его вида; у соседнего — умолчание #1f6f5c`, themed.accent[0].startsWith('rgb(200, 30, 30)') && plain.accent[0].startsWith('#1f6f5c') && themed.accent[1] === '#1f6f5c' && plain.accent[1] === '#1f6f5c', JSON.stringify({ themed: themed.accent, plain: plain.accent }));
    const dark = await read('', null, 'dark');
    const darkThemed = await read('', '--pet-surface: rgb(250, 250, 250); width: 320px', 'dark');
    const surface = (result) => result.look.find((line) => line.startsWith('диалог')).split('|')[13];
    check(`${label}: тёмная схема — умолчания тёмные; тема сайта (--pet-surface) сильнее умолчания`, surface(dark) !== surface(plain) && surface(darkThemed) === 'rgb(250, 250, 250)', JSON.stringify({ plain: surface(plain), dark: surface(dark), themed: surface(darkThemed) }));
    check(`${label}: без ошибок страницы`, [plain, rules, themed, dark, darkThemed].every((result) => result.errors.length === 0), JSON.stringify([plain, rules, themed].map((result) => result.errors)));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  }
}

// id, ссылки SVG и aria — внутри своего дерева: каждая ссылка url(#…), aria-labelledby, aria-controls, aria-describedby
// и label[for] вида разрешается в его же Shadow DOM, id в дереве не повторяются, в документе их нет; у двух видов —
// одинаковые id без столкновений (каждый — в своём дереве), legacy на той же странице — свои в документе.
async function ids(browser, base, check, open) {
  const label = 'id и ссылки';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
  const scan = (id) =>
    shade(
      page,
      id,
      `const all = [shadow, ...shadow.querySelectorAll('*')].flatMap((el) => el.attributes ? [...el.attributes].map((a) => [el, a]) : []);
      const refs = [];
      for (const [el, a] of all) {
        for (const m of a.value.matchAll(/url\\(#([^)]+)\\)/g)) refs.push(['url', m[1]]);
        if (['aria-labelledby', 'aria-controls', 'aria-describedby'].includes(a.name)) for (const one of a.value.split(/\\s+/)) refs.push([a.name, one]);
        if (a.name === 'for' && el.tagName === 'LABEL') refs.push(['for', a.value]);
      }
      const idsList = [...shadow.querySelectorAll('[id]')].map((el) => el.id);
      const missing = refs.filter(([, ref]) => !shadow.getElementById(ref)).map((pair) => pair.join(' '));
      const leaked = idsList.filter((one) => document.getElementById(one) && document.getElementById(one).getRootNode() !== shadow && !document.getElementById(one).closest('[data-pet-view]'));
      return { refs: refs.length, ids: idsList.length, dup: idsList.length - new Set(idsList).size, missing, leaked, sample: idsList.slice(0, 3) };`,
    );
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    await page.evaluate(async () => {
      window.web = await import('/pet/web.mjs');
      for (const id of ['x', 'y']) {
        const box = Object.assign(document.createElement('div'), { id });
        box.style.width = '240px';
        document.getElementById('site-main').append(box);
      }
      window.stand.mount();
    });
    await mount(page, 'x', 'x', { namespace: 'ids-x' });
    await mount(page, 'y', 'y', { namespace: 'ids-y' });
    await page.clock.runFor(1000);
    for (const id of ['x', 'y']) {
      await page.locator(`#${id} .cat-view-btn`).click();
      await finishOpen(page, id);
      await page.locator(`#${id} [data-cat-play]`).click();
      const play = await scan(id);
      await page.keyboard.press('Escape');
      await page.locator(`#${id} [data-cat-room]`).click();
      const room = await scan(id);
      await page.keyboard.press('Escape');
      const corner = await scan(id);
      await page.keyboard.press('Escape');
      await closedIn(page, id);
      check(`${label} ${id}: ссылки SVG url(#…), aria-* и label[for] разрешаются в своём Shadow DOM; id в дереве не повторяются (уголок, «Поиграть», редактор)`, [play, room, corner].every((one) => one.refs > 5 && one.missing.length === 0 && one.dup === 0 && one.leaked.length === 0), JSON.stringify({ play, room, corner }).slice(0, 1500));
    }
    const doc = await page.evaluate(() => ({ sheets: document.querySelectorAll('#cat-sheet').length, legacy: document.getElementById('cat-sheet')?.getRootNode() === document, docIds: [...document.querySelectorAll('[id^="cat-"]')].length, same: ['x', 'y'].map((id) => document.querySelector(`#${id} > [data-pet-view]`).shadowRoot.getElementById('cat-sheet-title') !== null).join() }));
    check(`${label}: два вида и legacy — одинаковые id без столкновений: #cat-sheet документа — один (legacy), у каждого вида — свой в своём дереве`, doc.sheets === 1 && doc.legacy && doc.same === 'true,true', JSON.stringify(doc));
    await page.evaluate(() => {
      Object.values(window.qaViews).forEach((view) => view.destroy());
      window.stand.pet.destroy();
    });
    check(`${label}: без ошибок страницы`, page.qaErrors.length === 0, JSON.stringify(page.qaErrors));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Пример расширения в контейнере (examples/extension/container.html как есть): кролик своим набором и стилями набора
// (styles → <link> в теневом дереве), живая модель; кнопки сайта — команды ядра вида. Выбор, имя и облик, занятие,
// кормление, «Поиграть» без лапы (нет ни кнопки, ни области; команда — unsupported), комната — морковка, своя сценка hop,
// смена модели, «Без кролика» (запасной показ, данные целы) и «С кроликом» (тот же кролик). Файлы пакета — по адресу
// установленного архива; посторонних запросов нет.
async function extension(browser, base, check, open, layout) {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const label = `расширение в контейнере ${viewport.width}×${viewport.height}`;
    const { context, page } = await open(browser, { viewport, ...(viewport.width < 600 ? { hasTouch: true, isMobile: true } : {}) }, viewInit);
    await context.addInitScript(() => {
      Math.random = () => 0.05;
    });
    const outside = watchNetwork(page, base);
    const requests = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    const press = (id) => (viewport.width < 600 ? page.locator(`#${id}`).tap() : page.locator(`#${id}`).click());
    const info = () => page.evaluate(() => {
      const shadow = document.querySelector('#pet > [data-pet-view]')?.shadowRoot;
      const art = shadow?.querySelector('.pet-view .cat-art');
      const s = window.demoView.core?.getState();
      return { mounted: window.demoView.mounted, pet: s?.pet, behavior: s?.behavior.shown, name: s?.name.display, coat: s?.look.coat, art: art ? { bunny: art.classList.contains('bunny-art'), coat: art.dataset.coat, pose: art.dataset.pose } : null, status: document.getElementById('status').textContent };
    });
    try {
      await page.goto(`${base}extension/container.html`);
      await page.waitForFunction(() => Boolean(window.demoView?.core));
      await page.clock.runFor(2000);
      const start = await info();
      check(`${label}: пример подключил три питомца и две модели в контейнер только публичными входами — кот, calm`, start.mounted && start.pet.shown === 'cat' && start.behavior === 'calm' && !start.art.bunny, JSON.stringify(start));
      await press('bunny');
      await page.clock.runFor(100);
      const bunny = await info();
      const styled = await page.evaluate(() => {
        const shadow = document.querySelector('#pet > [data-pet-view]').shadowRoot;
        const links = [...shadow.querySelectorAll('link[rel="stylesheet"]')].map((link) => new URL(link.href).pathname);
        const shut = shadow.querySelector('.pet-view .bunny-eyes-shut');
        return { links, shut: shut ? getComputedStyle(shut).display : null, doc: [...document.querySelectorAll('link[rel="stylesheet"]')].length };
      });
      check(`${label}: «Кролик» — рисунок набора кролика в контейнере; стили набора (bunny.css) — в теневом дереве вида, страница CSS не подключает`, bunny.pet.shown === 'example.bunny' && bunny.art.bunny && styled.links.includes('/extension/bunny.css') && styled.links.includes('/node_modules/pet-companion/pet/web/view.css') && styled.shut === 'none' && styled.doc === 0, JSON.stringify({ bunny, styled }));
      await page.clock.runFor(5000);
      await press('name');
      await press('coat');
      await page.clock.runFor(100);
      const named = await info();
      check(`${label}: имя и облик кролика командами — в снимке и на рисунке в контейнере`, named.name === 'Морковкин' && named.coat === 'grey' && named.art.coat === 'grey', JSON.stringify(named));
      // Своя сценка кролика hop (случайность 0,05 — шанс да): после радости первого занятия дня.
      await page.evaluate(() => {
        window.qaHop = 0;
        window.demoView.core.subscribe((update) => update.snapshot.pose.reaction?.type === 'hop' && (window.qaHop += 1), { initial: false });
      });
      await press('lesson');
      await page.clock.runFor(100);
      const joy = await info();
      check(`${label}: «Урок пройден» — радость рисунком кролика`, joy.art.pose === 'joy', JSON.stringify(joy));
      await page.clock.runFor(1600);
      await until(page, () => window.qaHop > 0);
      const hop = { count: await page.evaluate(() => window.qaHop), scene: await page.evaluate(() => document.querySelector('#pet > [data-pet-view]').shadowRoot.querySelector('.pet-view .cat-art')?.dataset.scene ?? '') };
      check(`${label}: своя сценка кролика hop после занятия — рисунок кролика в контейнере (data-scene="hop")`, hop.count > 0 && hop.scene === 'hop', JSON.stringify(hop));
      await page.clock.runFor(8000);
      await press('feed');
      await page.clock.runFor(100);
      check(`${label}: «Покормить» — лакомство дня`, (await page.evaluate(() => window.demoView.core.getState().treat)) === 'fed');
      await page.clock.runFor(6000);
      // «Поиграть»: без лапы — ни кнопки, ни области; команда лапы — unsupported; поглаживание — «шевелит носом».
      await press('play');
      await page.clock.runFor(100);
      const play = await page.evaluate(() => {
        const sheet = document.querySelector('#pet > [data-pet-view]').shadowRoot.querySelector('.cat-sheet');
        return { open: sheet.open, paw: Boolean(sheet.querySelector('[data-cat-play-paw]')), area: Boolean(sheet.querySelector('[data-play-hit="paw"]')), command: window.demoView.core.interact({ type: 'paw' }).error?.code };
      });
      await page.locator('#pet [data-cat-play-pet]').click();
      const petted = await page.evaluate(() => document.querySelector('#pet > [data-pet-view]').shadowRoot.querySelector('[data-cat-play-hint]').textContent);
      check(`${label}: «Поиграть» без лапы — ни кнопки, ни области лапы, команда — unsupported; «Погладить» — «шевелит носом»`, play.open && !play.paw && !play.area && play.command === 'unsupported' && petted === 'Морковкин шевелит носом.', JSON.stringify({ play, petted }));
      for (let i = 0; i < 3 && (await page.evaluate(() => window.demoView.core.getState().view.open)); i += 1) {
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => true);
        await page.clock.runFor(100);
      }
      await page.waitForFunction(() => window.demoView.core.getState().view.open === null, null, { timeout: 3000 }).catch(() => {});
      // Комната: морковка правее и сохранить.
      await press('room');
      await page.clock.runFor(100);
      const room = await page.evaluate(() => JSON.parse(localStorage.getItem('extension-view:room:v1') ?? 'null'));
      check(`${label}: «Морковку правее и сохранить» — запись room["example.bunny"].carrot`, room?.['example.bunny']?.carrot?.x > 40, JSON.stringify(room));
      // «Сохранить» вернуло в уголок — диалог открыт (страница под ним инертна): закрыть.
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.demoView.core.getState().view.open === null, null, { timeout: 3000 }).catch(() => {});
      await page.clock.runFor(5000);
      await press('lively');
      check(`${label}: «Живая модель» — модель вида сменилась`, (await info()).behavior === 'example.lively');
      // Без кролика: запасной показ, данные целы; с кроликом — тот же кролик.
      await press('without');
      await page.clock.runFor(500);
      const without = await info();
      await press('with');
      await page.clock.runFor(500);
      const withBunny = await info();
      check(`${label}: «Без кролика» — повторное подключение без определения: показан штатный, выбор и данные целы; «С кроликом» — тот же кролик с именем и обликом`, without.mounted && without.pet.id === 'example.bunny' && without.pet.available === false && !without.art.bunny && withBunny.pet.shown === 'example.bunny' && withBunny.name === 'Морковкин' && withBunny.art.bunny && withBunny.art.coat === 'grey', JSON.stringify({ without, withBunny }));
      const keys = await page.evaluate(() => Object.keys(localStorage));
      check(`${label}: ключи — только своё пространство extension-view`, keys.length > 0 && keys.every((name) => name.startsWith('extension-view:')), keys.join());
      const foreign = requests.filter((one) => !/^\/(extension\/|node_modules\/pet-companion\/pet\/|favicon\.ico$)/.test(one));
      check(`${label}: запросы — только страница, её модули и файлы пакета (в том числе CSS вида и набора); посторонних и внешних нет`, foreign.length === 0 && outside.length === 0 && requests.includes('/node_modules/pet-companion/pet/pet.css') && requests.includes('/extension/bunny.css'), JSON.stringify({ foreign, outside }));
      await layout(page, label);
      // «Без кролика»: модель «живая» ссылается на кролика (byPet) — ожидаемое предупреждение журнала, ровно одно.
      const weak = page.qaErrors.filter((text) => text === 'Питомец: behaviors[1].phrases.byPet["example.bunny"]: питомца «example.bunny» нет в этом экземпляре — замены реплик не используются');
      check(`${label}: без ошибок страницы и необработанных отклонений (ожидаемое предупреждение слабой ссылки «Без кролика» — одно)`, weak.length === 1 && page.qaErrors.length === 1 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
    } catch (error) {
      check(`${label}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
}

// Наборы в контейнере: неполный свой (без обязательной позы, в том числе той, что использует сценка), неподходящий штатный
// (изменённый кот с новым обликом), неверные стили набора — отказ до любых действий: ни своего элемента, ни записей, ни
// IndexedDB, ни изменений соседнего вида; одно сообщение на отказ. Контроли: полный свой набор с этим обликом — подключается.
async function kits(browser, base, check, open) {
  const label = 'наборы в контейнере';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
  try {
    await page.goto(`${base}container`);
    await page.waitForFunction(() => window.qaReady);
    await mount(page, 'a', 'a', { namespace: 'kits-a' });
    await page.clock.runFor(1000);
    const before = await page.evaluate(async () => ({ keys: Object.keys(localStorage).sort().join(), dbs: (await indexedDB.databases()).map((db) => db.name).sort().join(), a: JSON.stringify(window.qaViews.a.core.getState().pet) }));
    await page.evaluate(async () => (window.qaDefine = (await import('/pet/core.mjs')).definePet));
    const result = await page.evaluate(() => {
      const { cat, catWeb } = window.web;
      const purple = { ...cat, coats: [...cat.coats, { id: 'purple', title: 'Фиолетовый' }] };
      const out = [];
      const refuse = (options) => {
        const view = window.web.mountPetIn(document.getElementById('c'), { namespace: 'kits-bad', ...options });
        out.push({ mounted: view.mounted, core: view.core, host: document.querySelectorAll('#c > [data-pet-view]').length, own: document.getElementById('c-own') !== null });
      };
      refuse({ kits: [{ ...catWeb, poses: catWeb.poses.filter((pose) => pose !== 'calm') }] });
      refuse({ pets: [purple, window.web.dog] });
      refuse({ kits: [{ ...catWeb, styles: ['/relative.css'] }] });
      refuse({ kits: [{ ...catWeb, pet: 'example.none' }] });
      // Обязательная поза, которую использует и сценка: своя сценка nap на позе rest — набор без rest всё равно отказ.
      const napper = window.qaDefine({ ...cat, id: 'example.napper', fallback: 'cat', scenes: [...cat.scenes, { id: 'nap', pose: 'rest', needs: 'any', ms: 3000, still: 2000, text: 'дремлет' }] });
      refuse({ pets: [cat, napper], kits: [{ ...catWeb, pet: 'example.napper', scenes: [...catWeb.scenes, 'nap'], poses: catWeb.poses.filter((pose) => pose !== 'rest') }] });
      const control = window.web.mountPetIn(document.getElementById('c'), { namespace: 'kits-ok', pets: [purple], kits: [{ ...catWeb, coats: [...catWeb.coats, 'purple'] }] });
      const set = control.core.setAppearance({ coat: 'purple' });
      out.push({ control: control.mounted, coat: control.core.getState().look.coat, ok: set.ok });
      control.destroy();
      return out;
    });
    const after = await page.evaluate(async () => ({ keys: Object.keys(localStorage).sort().join(), dbs: (await indexedDB.databases()).map((db) => db.name).sort().join(), a: JSON.stringify(window.qaViews.a.core.getState().pet) }));
    const refusals = page.qaErrors.filter((text) => text.startsWith('Питомец не подключён'));
    const refusedAll = result.slice(0, 5).every((one) => !one.mounted && one.core === null && one.host === 0 && one.own);
    check(`${label}: неполный свой (без calm), неподходящий штатный (кот с обликом purple), стили не абсолютным адресом, набор без определения, обязательная поза rest, занятая и сценкой, — отказ до любых действий: ни элемента, ни ядра, чужое содержимое контейнера на месте`, refusedAll, JSON.stringify(result));
    check(`${label}: отказы — по одному сообщению с причиной`, refusals.length === 5 && /не нарисовано \(poses\): calm/.test(refusals[0]) && /purple/.test(refusals[1]) && /styles/.test(refusals[2]) && /нет определения/.test(refusals[3]) && /не нарисовано \(poses\): rest/.test(refusals[4]), JSON.stringify(refusals));
    check(`${label}: после отказов — ни записей хранилища, ни баз IndexedDB отказавших (только kits-ok у контроля), соседний вид не изменился`, after.a === before.a && after.keys.split(',').every((key) => !key.startsWith('kits-bad')) && !after.dbs.includes('kits-bad'), JSON.stringify({ before, after }));
    check(`${label}: контроль — полный свой набор кота с обликом purple подключается, облик purple`, result[5].control && result[5].ok && result[5].coat === 'purple', JSON.stringify(result[5]));
    await call(page, 'a', 'destroy');
    // Контроль без собаки: слабая ссылка модели calm на собаку (byPet.dog) — ожидаемое предупреждение журнала.
    const weak = page.qaErrors.filter((text) => /byPet\["dog"\]: питомца «dog» нет/.test(text));
    check(`${label}: других ошибок нет (кроме ожидаемого предупреждения слабой ссылки контроля без собаки)`, weak.length === 1 && page.qaErrors.length === refusals.length + weak.length, JSON.stringify(page.qaErrors));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Отказы: хранилище недоступно (localStorage бросает) — вид работает в памяти, без записей, подсказка честная; IndexedDB
// нет — сценок нет, ошибок нет; стили набора не загрузились — одно console.error, вид отключён (mounted false, элемента
// нет), соседний жив; progress() сайта бросил при подключении — отказ и откат только своего; onOpenChange и home бросают —
// журнал, диалог работает, сосед не тронут.
async function failures(browser, base, check, open) {
  const label = 'отказы в контейнере';
  {
    const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('localStorage запрещён (проверка)'); } });
      Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => undefined });
      Math.random = () => 0.05;
    });
    try {
      await page.goto(`${base}container`);
      await page.waitForFunction(() => window.qaReady);
      await page.evaluate(() => (window.qaCounts = { marks: 1, today: 1 }));
      const mounted = await page.evaluate(() => {
        window.qaViews = { a: window.web.mountPetIn(document.getElementById('a'), { namespace: 'offline', progress: () => window.qaCounts }) };
        return window.qaViews.a.mounted;
      });
      await page.clock.runFor(2000);
      const named = await call(page, 'a', 'core.setName', 'Тихий');
      await call(page, 'a', 'core.notify', 'saved', { key: 'off-1', counted: true });
      await page.clock.runFor(1600);
      await until(page, () => { const scene = window.qaViews.a.core.getState().scene; return !scene.waiting && !scene.reserving; }, null, 2000);
      await page.clock.runFor(6000);
      await page.locator('#a .cat-view-btn').click();
      await finishOpen(page, 'a');
      const note = await shade(page, 'a', 'sheet.querySelector(".cat-settings").open = true; return sheet.querySelector("[data-cat-store]").textContent;');
      const warned = page.qaErrors.filter((text) => text.startsWith('Питомец: хранилище недоступно'));
      check(`${label}: localStorage бросает — вид подключён, работает в памяти (имя «Тихий», save: unavailable), подсказка — «хранилище недоступно», одно предупреждение`, mounted && named.ok && (await state(page, 'a')).name.display === 'Тихий' && (await state(page, 'a')).save.cat.status === 'unavailable' && /недоступно/.test(note) && warned.length === 1, JSON.stringify({ named, note, warned }));
      check(`${label}: IndexedDB нет — сценки нет, ошибок и необработанных отклонений нет`, (await state(page, 'a')).pose.reaction?.scene !== true && page.qaErrors.length === warned.length && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
      await page.keyboard.press('Escape');
      await call(page, 'a', 'destroy');
    } catch (error) {
      check(`${label}: хранилище — сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
  {
    const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
    try {
      await page.goto(`${base}container`);
      await page.waitForFunction(() => window.qaReady);
      await mount(page, 'b', 'b', { namespace: 'ok-b' });
      // Стили набора не загрузились (404): mountPetIn синхронно вернул mounted true; затем — console.error и отключение.
      const early = await page.evaluate(() => {
        const { catWeb } = window.web;
        window.qaViews.a = window.web.mountPetIn(document.getElementById('a'), { namespace: 'css', kits: [{ ...catWeb, styles: [new URL('/pet/missing.css', location.href).href] }] });
        return { mounted: window.qaViews.a.mounted, core: window.qaViews.a.core !== null };
      });
      await page.waitForFunction(() => !window.qaViews.a.mounted, null, { timeout: 5000 }).catch(() => {});
      const late = await page.evaluate(() => ({ mounted: window.qaViews.a.mounted, status: window.qaViews.a.core.status, host: document.querySelectorAll('#a > [data-pet-view]').length, b: window.qaViews.b.mounted }));
      const told = page.qaErrors.filter((text) => text.startsWith('Питомец: стили не загрузились'));
      check(`${label}: стили набора не загрузились — синхронно mounted true (результат — о ядре и разметке), затем одно console.error, вид отключён (mounted false, ядро destroyed, элемента нет); соседний жив`, early.mounted && early.core && !late.mounted && late.status === 'destroyed' && late.host === 0 && late.b && told.length === 1 && /missing\.css/.test(told[0]), JSON.stringify({ early, late, told }));
      // progress() бросил при подключении — отказ, своё снято, соседний жив.
      const thrown = await page.evaluate(() => {
        const view = window.web.mountPetIn(document.getElementById('a'), { namespace: 'boom', progress: () => { throw new Error('progress сайта (проверка)'); } });
        return { mounted: view.mounted, core: view.core, host: document.querySelectorAll('#a > [data-pet-view]').length, b: window.qaViews.b.mounted && window.qaViews.b.core.status === 'running' };
      });
      const boom = page.qaErrors.filter((text) => text.startsWith('Питомец не подключён'));
      check(`${label}: progress() бросил при подключении — отказ (одно сообщение), свой элемент снят, ядра нет; соседний работает`, !thrown.mounted && thrown.core === null && thrown.host === 0 && thrown.b && boom.length === 1 && /progress сайта/.test(boom[0]), JSON.stringify({ thrown, boom }));
      // onOpenChange и home бросают: журнал, диалог открывается и закрывается, фокус — на питомце; соседний не тронут.
      await page.evaluate(() => {
        window.qaViews.c = window.web.mountPetIn(document.getElementById('a'), { namespace: 'cb', onOpenChange: () => { throw new Error('onOpenChange сайта (проверка)'); }, home: () => { throw new Error('home сайта (проверка)'); } });
      });
      await page.clock.runFor(500);
      await page.locator('#a .cat-view-btn').click();
      await finishOpen(page, 'a');
      const opened = (await sheetOf(page, 'a')).open;
      await page.keyboard.press('Escape');
      await closedIn(page, 'c');
      const warned = page.qaErrors.filter((text) => text.startsWith('Питомец:') && !text.startsWith('Питомец: стили'));
      check(`${label}: onOpenChange бросает — журнал (предупреждение), диалог открывается и закрывается, фокус на питомце; соседний не тронут`, opened && (await activeIn(page, 'a')) === 'cat-view-btn' && warned.length === 2 && (await page.evaluate(() => window.qaViews.b.core.getState().view.open)) === null, JSON.stringify(warned));
      await page.evaluate(() => {
        window.qaViews.c.destroy();
        window.qaViews.b.destroy();
      });
      // Ожидаемое сообщение браузера о 404 отсутствующего CSS (его и проверяли) — отдельно.
      const rest = page.qaErrors.filter((text) => !text.startsWith('Питомец') && !/Failed to load resource: .*404/.test(text));
      check(`${label}: других ошибок страницы нет (кроме ожидаемого 404 отсутствующего CSS набора)`, rest.length === 0 && page.qaErrors.filter((text) => /404/.test(text)).length === 1 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
    } catch (error) {
      check(`${label}: стили и колбэки — сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
}

// Строгий CSP: стенд examples/csp/ с HTTP-заголовком default-src 'self'; style-src 'self' (без встроенных скриптов,
// стилей и карты импортов): контроль — встроенный style сайта действительно запрещён; вид подключается, его стили
// действительно применены (вычисленные свойства теневого дерева, общий уголок, области «Поиграть» и редактора через
// CSSOM), поглаживание и редактор работают; нарушений нет. Legacy mountPet под тем же заголовком — отдельно
// (test/csp-legacy/): ограничения legacy описаны отдельно.
async function csp(browser, base, check, open) {
  {
    const label = 'CSP-стенд контейнера';
    const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
    const outside = watchNetwork(page, base);
    const requests = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    try {
      const response = await page.goto(`${base}csp/`);
      await page.waitForFunction(() => Boolean(window.cspDemo));
      // Приветствие дня закончилось до поглаживания (как в стенде касаний).
      await page.clock.runFor(4000);
      const header = response.headers()['content-security-policy'];
      const control = await page.evaluate(() => {
        const before = window.qaViolations.length;
        const probe = document.createElement('div');
        probe.setAttribute('style', 'color: rgb(1, 2, 3)');
        document.body.append(probe);
        const blocked = getComputedStyle(probe).color !== 'rgb(1, 2, 3)';
        probe.remove();
        return { blocked, added: window.qaViolations.length - before };
      });
      await page.waitForFunction((n) => window.qaViolations.length >= n, 1, { timeout: 2000 }).catch(() => {});
      check(`${label}: заголовок Content-Security-Policy — ${header}; контроль: встроенный style сайта запрещён и даёт нарушение`, header === "default-src 'self'; style-src 'self'" && control.blocked && (await page.evaluate(() => window.qaViolations.length)) >= 1, JSON.stringify({ header, control }));
      // Контрольное нарушение (и его сообщение в консоли) — ожидаемое: дальше считаются только новые.
      await page.evaluate(() => (window.qaViolations.length = 0));
      page.qaErrors.length = 0;
      const look = await page.evaluate(() => {
        const host = document.querySelector('#pet > [data-pet-view]');
        const shadow = host.shadowRoot;
        const btn = shadow.querySelector('.cat-view-btn');
        return { mounted: window.cspDemo.mounted, view: shadow.querySelector('.pet-view').dataset.view, hidden: shadow.querySelector('.pet-view').hidden, host: getComputedStyle(host).display + ' ' + getComputedStyle(host).position, btn: [getComputedStyle(btn).backgroundColor, getComputedStyle(btn).cursor, btn.getBoundingClientRect().width > 100].join() };
      });
      check(`${label}: вид подключён, стили теневого дерева применены (свой элемент block/relative, кнопка питомца — фон прозрачный, курсор pointer)`, look.mounted && look.view === 'full' && look.hidden === false && look.host === 'block relative' && look.btn === 'rgba(0, 0, 0, 0),pointer,true', JSON.stringify(look));
      await page.locator('#pet .cat-view-btn').click();
      await finishOpen(page, 'pet');
      const sheet = await page.evaluate(() => {
        const sheet = document.querySelector('#pet > [data-pet-view]').shadowRoot.querySelector('.cat-sheet');
        const floor = sheet.querySelector('.cat-floor-fill');
        const glass = sheet.querySelector('.cat-sky-glass');
        const meter = sheet.querySelector('.cat-meter > span');
        return { open: sheet.open, position: getComputedStyle(sheet).position, radius: getComputedStyle(sheet).borderTopLeftRadius, floor: getComputedStyle(floor).fill, glass: [getComputedStyle(glass).fill, getComputedStyle(glass).stroke].join(), meter: meter.style.width, styleAttrs: [...sheet.querySelectorAll('[style]')].filter((el) => !el.style.cssText).length };
      });
      check(`${label}: уголок — диалог со стилями пакета (fixed, скруглён), общий уголок — цвета темы классами (пол #dccbb4, окно), шкала — шириной через CSSOM`, sheet.open && sheet.position === 'fixed' && sheet.radius === '18px' && sheet.floor === 'rgb(220, 203, 180)' && sheet.glass === 'rgb(219, 233, 239),rgb(248, 244, 237)' && sheet.meter === '0%', JSON.stringify(sheet));
      await page.locator('#pet [data-cat-play]').click();
      const hits = await page.evaluate(() => {
        const sheet = document.querySelector('#pet > [data-pet-view]').shadowRoot.querySelector('.cat-sheet');
        return [...sheet.querySelectorAll('[data-play-hit]')].map((el) => `${el.dataset.playHit}:${getComputedStyle(el).left}`).join();
      });
      const box = await page.locator('#pet .cat-play-pet').boundingBox();
      const [x0, y0] = [box.x + (box.width * 70) / 220, box.y + (box.height * 66) / 204];
      await page.mouse.move(x0, y0);
      await sent(page, () => page.mouse.down());
      for (let i = 1; i <= 8; i += 1) await sent(page, () => page.mouse.move(x0 + i * 8, y0));
      await sent(page, () => page.mouse.up());
      const petted = await page.evaluate(() => document.querySelector('#pet > [data-pet-view]').shadowRoot.querySelector('[data-cat-play-hint]').textContent);
      check(`${label}: «Поиграть» — области головы, тела и лапы размещены CSSOM (left в px), поглаживание мышью — «мурлычет»`, /head:\d/.test(hits) && /paw:\d/.test(hits) && petted === 'Марс мурлычет.', JSON.stringify({ hits, petted }));
      await page.keyboard.press('Escape');
      await page.locator('#pet [data-cat-room]').click();
      const room = await page.evaluate(() => {
        const sheet = document.querySelector('#pet > [data-pet-view]').shadowRoot.querySelector('.cat-sheet');
        const hit = sheet.querySelector('[data-room-hit="bowl"]');
        return { x: hit.style.getPropertyValue('--x'), width: getComputedStyle(hit).width };
      });
      await page.locator('#pet [data-room-pick="yarn"]').click();
      await page.keyboard.press('ArrowRight');
      await page.locator('#pet [data-room-save]').click();
      check(`${label}: редактор — области предметов CSSOM (--x), стрелка и «Сохранить» — запись`, room.x !== '' && parseFloat(room.width) >= 44 && (await page.evaluate(() => JSON.parse(localStorage.getItem('csp-demo:room:v1') ?? 'null')?.cat?.yarn?.x)) > 0, JSON.stringify(room));
      await page.keyboard.press('Escape');
      await page.click('#done');
      await page.clock.runFor(200);
      const violations = await page.evaluate(() => [...window.qaViolations]);
      const foreign = requests.filter((one) => !/^\/(csp\/|node_modules\/pet-companion\/pet\/|favicon\.ico$)/.test(one));
      check(`${label}: нарушений CSP нет (securitypolicyviolation), запросы — страница, её файлы и файлы пакета; внешних нет`, violations.length === 0 && foreign.length === 0 && outside.length === 0, JSON.stringify({ violations, foreign, outside }));
      check(`${label}: без ошибок страницы и сообщений об отказе стилей или скриптов`, page.qaErrors.length === 0, JSON.stringify(page.qaErrors));
      await page.evaluate(() => window.cspDemo.destroy());
    } catch (error) {
      check(`${label}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
  {
    const label = 'legacy под строгим CSP';
    const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
    try {
      await page.goto(`${base}legacy-csp/`);
      await page.waitForFunction(() => Boolean(window.legacyPet));
      await page.clock.runFor(2000);
      await page.locator('.cat-side-face').click();
      await page.locator('[data-cat-play]').click();
      await page.keyboard.press('Escape');
      await page.locator('[data-cat-room]').click();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.clock.runFor(200);
      const violations = await page.evaluate(() => [...window.qaViolations]);
      check(`${label}: mountPet с CSS модуля файлами — уголок, «Поиграть», редактор без нарушений CSP (атрибутов style в разметке модуля нет)`, (await page.evaluate(() => window.legacyPet.mounted)) && violations.length === 0 && page.qaErrors.length === 0, JSON.stringify({ violations, errors: page.qaErrors }));
      await page.evaluate(() => window.legacyPet.destroy());
    } catch (error) {
      check(`${label}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
}

// Вход диалога вида id: доступное имя, раскрытие, связь с диалогом, точка «новое», облик, питомец и вид рисунка, фокус в
// своём дереве; old — та же кнопка, что помечена markEntry (не пересоздана).
const entryOf = (page, id) =>
  shade(page, id, 'const b = shadow?.querySelector(".cat-view-btn"); const art = b?.querySelector(".cat-art"); return b ? { label: b.getAttribute("aria-label"), expanded: b.getAttribute("aria-expanded"), controls: b.getAttribute("aria-controls"), dot: b.querySelector(".cat-dot")?.hidden === false, coat: art?.dataset.coat ?? null, kind: art?.dataset.kind ?? (art ? "cat" : null), view: art?.dataset.view ?? null, focused: shadow.activeElement === b, old: b.hasAttribute("data-qa-old") } : null;');
const markEntry = (page, id) => shade(page, id, 'shadow.querySelector(".cat-view-btn")?.setAttribute("data-qa-old", ""); return true;');
// Кнопки контейнера с этим вычисленным доступным именем (роль и имя — дерево доступности Playwright; теневое дерево открыто).
const byName = (page, id, name) => page.locator(`#${id}`).getByRole('button', { name, exact: true }).count();
// Стили вида загружены: место питомца видно.
const readyIn = (page, id) => page.waitForFunction((where) => document.querySelector(`#${where} > [data-pet-view]`)?.shadowRoot?.querySelector('.pet-view')?.hidden === false, id, { timeout: 5000 });
// Подключить вид со счётом сайта window.qaCounts и журналами: onOpenChange — window.qaOpen, начатые реакции ядра —
// window.qaPlayed[name] (тип, у сценки — «:scene»). styles — свой набор кота с CSS по этому адресу стенда (и штатная собака).
const mountCounted = (page, name, id, namespace, styles = null) =>
  page.evaluate(
    ([n, where, ns, css]) => {
      window.qaViews ??= {};
      window.qaOpen ??= [];
      window.qaPlayed ??= {};
      const { catWeb, dogWeb } = window.web;
      const kits = css ? { kits: [{ ...catWeb, styles: [new URL(css, location.href).href] }, dogWeb] } : {};
      const view = window.web.mountPetIn(document.getElementById(where), { namespace: ns, progress: () => window.qaCounts, onOpenChange: (open) => window.qaOpen.push(`${n}:${open}`), ...kits });
      window.qaViews[n] = view;
      const played = (window.qaPlayed[n] = []);
      let last = null;
      view.core?.subscribe(
        (update) => {
          const reaction = update.snapshot.pose.reaction;
          if (reaction && reaction.id !== last) played.push(`${reaction.type}${reaction.scene ? ':scene' : ''}`);
          last = reaction?.id ?? null;
        },
        { initial: false },
      );
      return { mounted: view.mounted, core: view.core !== null };
    },
    [name, id, namespace, styles],
  );
// Управляемый шлюз ответов адреса (page.route): запросы ждут решения проверки — open() пропускает, fail() отвечает 404;
// held() — дождаться первого удержанного запроса (не дольше 5 с — тогда итог проверки покажет, что запроса не было).
// Запрос отключённого вида браузер мог уже отменить — тогда ответ ему не нужен.
async function gate(page, pattern) {
  let decide;
  let arrived;
  const decided = new Promise((resolve) => (decide = resolve));
  const first = new Promise((resolve) => (arrived = resolve));
  await page.route(pattern, async (route) => {
    arrived();
    if ((await decided) === 'fail') await route.fulfill({ status: 404, body: '' }).catch(() => {});
    else await route.continue().catch(() => {});
  });
  return { open: () => decide('open'), fail: () => decide('fail'), held: () => Promise.race([first, new Promise((resolve) => setTimeout(resolve, 5000))]) };
}
// Шаги часов с продолжениями IndexedDB и задач страницы между ними (настоящая база идёт своим временем).
async function steps(page, n, ms) {
  for (let i = 0; i < n; i += 1) {
    await page.clock.runFor(ms);
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}
const sceneDbs = (page) => page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name).filter((name) => name.endsWith(':scene')));

// Доступное имя входа после пересоздания кнопки (независимая проверка PL07): смена облика пересоздаёт кнопку питомца в
// контейнере — прямой командой, кнопкой уголка при открытом диалоге и тихой правкой соседнего ядра того же namespace; кот и
// собака, целиком и портретом. Новая кнопка — с доступным именем (и по дереву доступности), aria-expanded, aria-controls,
// точкой «новое»; фокус остаётся на питомце; соседний контейнер не меняется.
async function labels(browser, base, check, open) {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const label = `доступное имя входа ${viewport.width}×${viewport.height}`;
    const { context, page } = await open(browser, { viewport }, viewInit);
    try {
      await page.goto(`${base}container`);
      await page.waitForFunction(() => window.qaReady);
      await page.evaluate(() => {
        // Знаков на ступень «Освоился», увидена — «Познакомились»: точка «новое» у входа. Приветствие дня уже было.
        localStorage.setItem('lab:cat:v1', JSON.stringify({ v: 1, seenStage: 0, greetDay: '2026-10-11' }));
        localStorage.setItem('lab-b:cat:v1', JSON.stringify({ v: 1, seenStage: 0, greetDay: '2026-10-11' }));
        window.qaCounts = { marks: 3, today: 1 };
      });
      await mountCounted(page, 'a', 'a', 'lab');
      await mountCounted(page, 'b', 'b', 'lab-b');
      await readyIn(page, 'a');
      await readyIn(page, 'b');
      await call(page, 'b', 'core.setPet', 'dog');
      await call(page, 'a', 'core.setName', 'Альфа');
      const NAME = 'Альфа — уголок кота, есть новая вещь';
      const DOG = 'Тоби — уголок собаки, есть новая вещь';
      const before = await entryOf(page, 'a');
      check(`${label}: до смены облика — имя входа «${NAME}», точка «новое»`, before.label === NAME && before.dot && (await byName(page, 'a', NAME)) === 1, JSON.stringify(before));
      // Прямая команда при фокусе на питомце.
      await page.locator('#a .cat-view-btn').focus();
      await markEntry(page, 'a');
      const neighbour = await entryOf(page, 'b');
      const command = await call(page, 'a', 'core.setAppearance', { coat: 'ginger' });
      const direct = await entryOf(page, 'a');
      check(`${label}: core.setAppearance — кнопка пересоздана с доступным именем «${NAME}» (и в дереве доступности), aria-expanded false, aria-controls cat-sheet, точка «новое»; фокус на новой кнопке`, command.ok && command.save.status === 'saved' && !direct.old && direct.coat === 'ginger' && direct.label === NAME && direct.expanded === 'false' && direct.controls === 'cat-sheet' && direct.dot && direct.focused && (await byName(page, 'a', NAME)) === 1, JSON.stringify({ command, direct }));
      check(`${label}: соседний контейнер (собака, портрет) не изменился`, JSON.stringify(await entryOf(page, 'b')) === JSON.stringify(neighbour) && neighbour.label === DOG && neighbour.kind === 'dog' && neighbour.view === 'portrait', JSON.stringify(neighbour));
      // Собака портретом, фокус — у первого контейнера.
      await markEntry(page, 'b');
      await call(page, 'b', 'core.setAppearance', { coat: 'spotted' });
      const dog = await entryOf(page, 'b');
      check(`${label}: собака портретом — облик командой: новая кнопка «${DOG}», aria-expanded false, aria-controls, точка «новое»; фокус остался у первого контейнера`, !dog.old && dog.coat === 'spotted' && dog.kind === 'dog' && dog.view === 'portrait' && dog.label === DOG && dog.expanded === 'false' && dog.controls === 'cat-sheet' && dog.dot && (await byName(page, 'b', DOG)) === 1 && (await entryOf(page, 'a')).focused && (await page.evaluate(() => document.activeElement === document.querySelector('#a > [data-pet-view]'))), JSON.stringify(dog));
      // Кот портретом: узкий контейнер, затем облик.
      await page.evaluate(() => (document.getElementById('a').style.width = '120px'));
      await until(page, () => document.querySelector('#a > [data-pet-view]').shadowRoot.querySelector('.cat-art')?.dataset.view === 'portrait');
      await markEntry(page, 'a');
      await call(page, 'a', 'core.setAppearance', { coat: 'smoke' });
      const portrait = await entryOf(page, 'a');
      check(`${label}: кот портретом — облик командой: новая кнопка «${NAME}», aria-expanded, aria-controls, точка «новое»`, !portrait.old && portrait.view === 'portrait' && portrait.coat === 'smoke' && portrait.label === NAME && portrait.expanded === 'false' && portrait.controls === 'cat-sheet' && portrait.dot && (await byName(page, 'a', NAME)) === 1, JSON.stringify(portrait));
      await page.evaluate(() => (document.getElementById('a').style.width = ''));
      await until(page, () => document.querySelector('#a > [data-pet-view]').shadowRoot.querySelector('.cat-art')?.dataset.view === 'full');
      // Встроенный выбор облика при открытом уголке, затем Esc. Открытый уголок отмечает ступень увиденной — дальше имя
      // без «есть новая вещь» и без точки (снимок ядра: progress.unseen).
      const SEEN = 'Альфа — уголок кота';
      const DOG_SEEN = 'Тоби — уголок собаки';
      await page.locator('#a .cat-view-btn').click();
      await finishOpen(page, 'a');
      await markEntry(page, 'a');
      await page.locator('#a .cat-settings > summary').click();
      await page.locator('#a .cat-coat-option:has(input[value="tuxedo"])').click();
      const during = { entry: await entryOf(page, 'a'), unseen: (await state(page, 'a')).progress.unseen };
      await page.keyboard.press('Escape');
      await closedIn(page, 'a');
      const closed = await entryOf(page, 'a');
      check(`${label}: облик кнопкой уголка при открытом диалоге — новая кнопка с именем «${SEEN}» (ступень увидена — без точки) и aria-expanded true; Esc — фокус на питомце, aria-expanded false`, !during.entry.old && during.unseen === false && during.entry.coat === 'tuxedo' && during.entry.label === SEEN && !during.entry.dot && during.entry.expanded === 'true' && during.entry.controls === 'cat-sheet' && closed.focused && closed.expanded === 'false' && closed.label === SEEN && !closed.dot && (await byName(page, 'a', SEEN)) === 1 && (await openLog(page)).join() === 'a:true,a:false', JSON.stringify({ during, closed }));
      // Тихая правка соседнего ядра того же namespace: облик, затем питомец. Объявление выбора в уголке уже прозвучало.
      await page.clock.runFor(200);
      await mountCounted(page, 'c', 'c', 'lab');
      await readyIn(page, 'c');
      await page.locator('#a .cat-view-btn').focus();
      await markEntry(page, 'a');
      await shade(page, 'a', 'shadow.querySelector("#cat-live").textContent = ""; return true;');
      await call(page, 'c', 'core.setAppearance', { coat: 'ginger' });
      await until(page, () => document.querySelector('#a > [data-pet-view]').shadowRoot.querySelector('.cat-view-btn .cat-art')?.dataset.coat === 'ginger');
      await page.clock.runFor(200);
      const quiet = { entry: await entryOf(page, 'a'), live: await liveOf(page, 'a') };
      check(`${label}: облик правкой соседнего вида того же namespace — тихо (без объявлений): новая кнопка «${SEEN}», aria-*, фокус на питомце`, !quiet.entry.old && quiet.entry.coat === 'ginger' && quiet.entry.label === SEEN && !quiet.entry.dot && quiet.entry.expanded === 'false' && quiet.entry.controls === 'cat-sheet' && quiet.entry.focused && quiet.live.join('|') === '|' && (await byName(page, 'a', SEEN)) === 1, JSON.stringify(quiet));
      await call(page, 'c', 'core.setPet', 'dog');
      await until(page, () => document.querySelector('#a > [data-pet-view]').shadowRoot.querySelector('.cat-view-btn .cat-art')?.dataset.kind === 'dog');
      const kind = await entryOf(page, 'a');
      check(`${label}: питомец правкой соседа — собака у первого: кнопка «${DOG_SEEN}», aria-*, фокус на питомце`, kind.kind === 'dog' && kind.label === DOG_SEEN && !kind.dot && kind.expanded === 'false' && kind.controls === 'cat-sheet' && kind.focused && (await byName(page, 'a', DOG_SEEN)) === 1, JSON.stringify(kind));
      await page.evaluate(() => Object.values(window.qaViews).forEach((view) => view.destroy()));
      check(`${label}: без ошибок страницы и необработанных отклонений`, page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
    } catch (error) {
      check(`${label}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
}

// Стили ещё грузятся (независимая проверка PL07): пока обязательный CSS вида (пакета или своего набора) удержан шлюзом,
// место скрыто и для ядра питомец не на виду — занятие не играет реакцию, не резервирует день сценки (ни базы, ни копии),
// диалог не открывается; загрузка при том же размере делает вид видимым, отменённое не доигрывается, новое занятие —
// обычным путём ядра. Ещё: готовность при нулевом контейнере, независимость соседа, поздний отказ CSS, отключение и
// повторное подключение до конца прежней загрузки, приветствие дня при запуске не на виду. Часы — page.clock, случайность
// 0,05 (сценка выпадает).
async function loading(browser, base, check, open) {
  const label = 'стили ещё грузятся 1280×900';
  const today = (keys) => (page) =>
    page.evaluate((list) => {
      for (const key of list) localStorage.setItem(`${key}:cat:v1`, JSON.stringify({ v: 1, seenStage: 0, greetDay: '2026-10-11' }));
      window.qaCounts = { marks: 1, today: 1 };
    }, keys);
  const played = (page, name) => page.evaluate((n) => [...window.qaPlayed[n]], name);
  const scened = (page, name) => until(page, (n) => window.qaPlayed[n].some((type) => type.endsWith(':scene')), name);
  {
    const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
    await context.addInitScript(() => {
      Math.random = () => 0.05;
    });
    try {
      const css = await gate(page, '**/pet/web/view.css');
      await page.goto(`${base}container`);
      await page.waitForFunction(() => window.qaReady);
      await today(['slow'])(page);
      const mounted = await mountCounted(page, 'a', 'a', 'slow');
      const early = await page.evaluate(() => {
        const view = window.qaViews.a;
        const opened = view.open();
        const direct = view.core.open('corner');
        return { opened, direct: direct.ok, after: view.core.getState().view.open, notify: view.core.notify('saved', { key: 'lesson-1', counted: true }).ok };
      });
      await steps(page, 8, 1000);
      const held = { stage: await stageOf(page, 'a'), visible: (await state(page, 'a')).visible, played: await played(page, 'a'), copy: await page.evaluate(() => localStorage.getItem('slow:scene:v1')), dbs: await sceneDbs(page), sheet: (await sheetOf(page, 'a')).open, log: await openLog(page) };
      check(`${label}: подключение синхронно (mounted, core) при удержанном CSS вида`, mounted.mounted && mounted.core && early.notify, JSON.stringify({ mounted, early }));
      check(`${label}: пока CSS удержан — место скрыто (вид full по размеру), для ядра не на виду; занятие — ни реакции, ни сценки, ни дня (нет копии slow:scene:v1 и базы slow:scene)`, held.stage.hidden === true && held.stage.view === 'full' && held.visible === false && held.played.length === 0 && held.copy === null && held.dbs.length === 0, JSON.stringify(held));
      check(`${label}: до готовности view.open() — unsupported; core.open закрыт отображением; диалога и onOpenChange нет`, early.opened.ok === false && early.opened.error.code === 'unsupported' && early.after === null && !held.sheet && held.log.length === 0, JSON.stringify({ early, held }));
      css.open();
      await readyIn(page, 'a');
      const ready = { stage: await stageOf(page, 'a'), visible: (await state(page, 'a')).visible };
      await steps(page, 4, 1000);
      const after = { played: await played(page, 'a'), copy: await page.evaluate(() => localStorage.getItem('slow:scene:v1')), dbs: await sceneDbs(page) };
      check(`${label}: CSS загрузился при том же размере (full до и после) — место видно, для ядра на виду; отменённое занятие не доигрывается (ни реакции, ни сценки, ни дня)`, ready.stage.hidden === false && ready.stage.view === 'full' && ready.visible === true && after.played.length === 0 && after.copy === null && after.dbs.length === 0, JSON.stringify({ ready, after }));
      const opened = await call(page, 'a', 'open');
      await finishOpen(page, 'a');
      const sheet = (await sheetOf(page, 'a')).open;
      await page.keyboard.press('Escape');
      await closedIn(page, 'a');
      check(`${label}: после готовности view.open() — уголок открыт, onOpenChange — настоящие переходы`, opened.ok && sheet && (await openLog(page)).join() === 'a:true,a:false', JSON.stringify(opened));
      await page.clock.runFor(1000);
      await call(page, 'a', 'core.notify', 'saved', { key: 'lesson-2', counted: true });
      await page.clock.runFor(1600);
      await scened(page, 'a');
      const fresh = { played: await played(page, 'a'), day: await sceneRecord(page, 'slow:scene'), copy: JSON.parse((await page.evaluate(() => localStorage.getItem('slow:scene:v1'))) ?? 'null') };
      check(`${label}: после готовности новое занятие — реакция и сценка обычным путём ядра; день записан (IndexedDB slow:scene и копия)`, fresh.played[0] === 'joy' && fresh.played.some((type) => type.endsWith(':scene')) && fresh.day?.day === '2026-10-11' && fresh.copy?.day === '2026-10-11', JSON.stringify(fresh));
      // Приветствие дня: при подключении стили ещё не загружены — питомец не на виду, как вкладка, открытая в фоне.
      await mountCounted(page, 'g', 'c', 'hello');
      await readyIn(page, 'c');
      await steps(page, 3, 1000);
      const greet = { played: await played(page, 'g'), day: await page.evaluate(() => JSON.parse(localStorage.getItem('hello:cat:v1'))?.greetDay ?? null), visible: (await state(page, 'g')).visible };
      check(`${label}: приветствие дня — при запуске стили не загружены, питомец не на виду: решение и день — при запуске (ядро, как вкладка в фоне), невидимо не проигрывается и после загрузки не доигрывается`, greet.visible && greet.played.length === 0 && greet.day === '2026-10-11', JSON.stringify(greet));
      await page.evaluate(() => Object.values(window.qaViews).forEach((view) => view.destroy()));
      check(`${label}: без ошибок страницы и необработанных отклонений`, page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
    } catch (error) {
      check(`${label}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
  {
    // Свой набор: его CSS удержан — только этот вид скрыт; сосед со штатными стилями показывает своё. Готовность при
    // нулевом контейнере — не на виду, размеры вернулись — на виду.
    const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
    await context.addInitScript(() => {
      Math.random = () => 0.05;
    });
    try {
      const css = await gate(page, '**/extension/bunny.css');
      await page.goto(`${base}container`);
      await page.waitForFunction(() => window.qaReady);
      await today(['kit', 'kit-b'])(page);
      await mountCounted(page, 'b', 'b', 'kit-b');
      await readyIn(page, 'b');
      await mountCounted(page, 'a', 'a', 'kit', '/extension/bunny.css');
      await css.held();
      await call(page, 'a', 'core.notify', 'saved', { key: 'kit-1', counted: true });
      await call(page, 'b', 'core.notify', 'saved', { key: 'kit-b-1', counted: true });
      await page.clock.runFor(1600);
      await scened(page, 'b');
      await steps(page, 4, 1000);
      const split = { a: { stage: await stageOf(page, 'a'), visible: (await state(page, 'a')).visible, played: await played(page, 'a') }, b: { visible: (await state(page, 'b')).visible, played: await played(page, 'b') }, dbs: await sceneDbs(page), copies: await page.evaluate(() => [localStorage.getItem('kit:scene:v1'), JSON.parse(localStorage.getItem('kit-b:scene:v1') ?? 'null')?.day]) };
      check(`${label}: CSS своего набора удержан — этот вид скрыт и не на виду (ни реакции, ни дня); сосед со штатными стилями — радость и сценка, его день (kit-b:scene)`, split.a.stage.hidden === true && split.a.visible === false && split.a.played.length === 0 && split.b.visible && split.b.played[0] === 'joy' && split.b.played.some((type) => type.endsWith(':scene')) && split.dbs.join() === 'kit-b:scene' && split.copies[0] === null && split.copies[1] === '2026-10-11', JSON.stringify(split));
      await page.evaluate(() => (document.getElementById('a').style.width = '0px'));
      await until(page, () => document.querySelector('#a > [data-pet-view]').shadowRoot.querySelector('.pet-view').dataset.view === 'none');
      css.open();
      await readyIn(page, 'a');
      const zero = { stage: await stageOf(page, 'a'), visible: (await state(page, 'a')).visible, opened: await call(page, 'a', 'open') };
      check(`${label}: стили загрузились при нулевом контейнере — не на виду, view.open() — unsupported`, zero.stage.view === 'none' && zero.visible === false && zero.opened.error?.code === 'unsupported', JSON.stringify(zero));
      await page.evaluate(() => (document.getElementById('a').style.width = ''));
      await until(page, () => window.qaViews.a.core.getState().visible === true);
      await steps(page, 3, 1000);
      const back = { stage: await stageOf(page, 'a'), visible: (await state(page, 'a')).visible, played: await played(page, 'a'), copy: await page.evaluate(() => localStorage.getItem('kit:scene:v1')) };
      check(`${label}: размеры вернулись — на виду, целиком; отменённое занятие не доигрывается`, back.stage.view === 'full' && back.visible && back.played.length === 0 && back.copy === null, JSON.stringify(back));
      await call(page, 'a', 'core.notify', 'saved', { key: 'kit-2', counted: true });
      await page.clock.runFor(1600);
      await scened(page, 'a');
      const fresh = { played: await played(page, 'a'), day: await sceneRecord(page, 'kit:scene') };
      check(`${label}: новое занятие после готовности — сценка своим набором обычным путём ядра, день kit:scene`, fresh.played[0] === 'joy' && fresh.played.some((type) => type.endsWith(':scene')) && fresh.day?.day === '2026-10-11', JSON.stringify(fresh));
      await page.evaluate(() => Object.values(window.qaViews).forEach((view) => view.destroy()));
      check(`${label}: свой набор — без ошибок страницы и необработанных отклонений`, page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
    } catch (error) {
      check(`${label}: свой набор — сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
  {
    // Поздний отказ CSS своего набора, пока вид скрыт.
    const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
    await context.addInitScript(() => {
      Math.random = () => 0.05;
    });
    try {
      const kit = await gate(page, '**/extension/bunny.css');
      await page.goto(`${base}container`);
      await page.waitForFunction(() => window.qaReady);
      await today(['late', 'late-b'])(page);
      await mountCounted(page, 'b', 'b', 'late-b');
      await readyIn(page, 'b');
      await mountCounted(page, 'a', 'a', 'late', '/extension/bunny.css');
      await kit.held();
      await call(page, 'a', 'core.notify', 'saved', { key: 'late-1', counted: true });
      await steps(page, 4, 1000);
      kit.fail();
      await page.waitForFunction(() => !window.qaViews.a.mounted, null, { timeout: 5000 }).catch(() => {});
      const failed = { mounted: await page.evaluate(() => window.qaViews.a.mounted), status: await page.evaluate(() => window.qaViews.a.core.status), host: await page.evaluate(() => document.querySelectorAll('#a > [data-pet-view]').length), played: await played(page, 'a'), dbs: await sceneDbs(page), copy: await page.evaluate(() => localStorage.getItem('late:scene:v1')), b: await page.evaluate(() => window.qaViews.b.mounted && window.qaViews.b.core.getState().visible), told: page.qaErrors.filter((text) => text.startsWith('Питомец: стили не загрузились')) };
      check(`${label}: поздний отказ CSS своего набора, пока вид скрыт, — одно console.error, вид отключён (mounted false, ядро destroyed, элемента нет); реакции и дня сценки не было; сосед на виду`, !failed.mounted && failed.status === 'destroyed' && failed.host === 0 && failed.played.length === 0 && failed.dbs.length === 0 && failed.copy === null && failed.b && failed.told.length === 1 && /bunny\.css/.test(failed.told[0]), JSON.stringify(failed));
      await page.evaluate(() => Object.values(window.qaViews).forEach((view) => view.destroy()));
      // Ожидаемые сообщения: отказ стилей и 404 браузера для удержанного CSS набора.
      const rest = page.qaErrors.filter((text) => !text.startsWith('Питомец: стили не загрузились') && !/Failed to load resource: .*404/.test(text));
      check(`${label}: поздний отказ — других ошибок страницы и необработанных отклонений нет`, rest.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
    } catch (error) {
      check(`${label}: поздний отказ — сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
  {
    // CSS пакета удержан: вид подключён, отключён и подключён заново в тот же контейнер до конца первой загрузки.
    const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, viewInit);
    await context.addInitScript(() => {
      Math.random = () => 0.05;
    });
    try {
      const css = await gate(page, '**/pet/web/view.css');
      await page.goto(`${base}container`);
      await page.waitForFunction(() => window.qaReady);
      await today(['again'])(page);
      await mountCounted(page, 'a1', 'a', 'again');
      await css.held();
      await call(page, 'a1', 'core.notify', 'saved', { key: 'again-1', counted: true });
      await call(page, 'a1', 'destroy');
      await mountCounted(page, 'a2', 'a', 'again');
      await steps(page, 3, 1000);
      css.open();
      await readyIn(page, 'a');
      await steps(page, 3, 1000);
      const again = { old: await page.evaluate(() => [window.qaViews.a1.mounted, window.qaViews.a1.core.status]), now: await page.evaluate(() => [window.qaViews.a2.mounted, window.qaViews.a2.core.getState().visible, document.querySelectorAll('#a > [data-pet-view]').length]), played: [await played(page, 'a1'), await played(page, 'a2')], copy: await page.evaluate(() => localStorage.getItem('again:scene:v1')) };
      check(`${label}: destroy и новое подключение до конца прежней загрузки — новый вид на виду (один элемент), прежний отключён; занятие прежнего не доигрывается ни в одном`, again.old.join() === 'false,destroyed' && again.now.join() === 'true,true,1' && again.played.every((list) => list.length === 0) && again.copy === null, JSON.stringify(again));
      await call(page, 'a2', 'core.notify', 'saved', { key: 'again-2', counted: true });
      await page.clock.runFor(1600);
      await scened(page, 'a2');
      check(`${label}: новое занятие нового вида — сценка обычным путём ядра, день again:scene`, (await played(page, 'a2')).some((type) => type.endsWith(':scene')) && (await sceneRecord(page, 'again:scene'))?.day === '2026-10-11', JSON.stringify(await played(page, 'a2')));
      await page.evaluate(() => Object.values(window.qaViews).forEach((view) => view.destroy()));
      await page.clock.runFor(1000);
      const left = await resources(page);
      check(`${label}: после отключения всех — ждущих таймеров, кадров и наблюдателей модуля нет`, left.timers === 0 && left.frames === 0 && left.observers === 0, JSON.stringify(left));
      check(`${label}: повторное подключение — без ошибок страницы и необработанных отклонений`, page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0, JSON.stringify(page.qaErrors));
    } catch (error) {
      check(`${label}: повторное подключение — сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
}

export async function viewQa(browser, check, open, layout) {
  const server = await serveView();
  try {
    await basics(browser, server.base, check, open, layout);
    await together(browser, server.base, check, open);
    await cancelledMove(browser, server.base, check, open);
    await shared(browser, server.base, check, open);
    await lifecycle(browser, server.base, check, open);
    await geometry(browser, server.base, check, open);
    await keyboard(browser, server.base, check, open);
    await touchAndScale(browser, server.base, check, open, layout);
    await styles(browser, server.base, check, open);
    await ids(browser, server.base, check, open);
    await extension(browser, server.base, check, open, layout);
    await kits(browser, server.base, check, open);
    await failures(browser, server.base, check, open);
    await csp(browser, server.base, check, open);
    await labels(browser, server.base, check, open);
    await loading(browser, server.base, check, open);
  } finally {
    await server.close();
  }
}
