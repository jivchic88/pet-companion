// Пример расширения в Chrome (PL06): страница examples/extension/index.html как есть — третий питомец кролик (свой набор
// отображения bunny-web.mjs и стили bunny.css) и вторая модель «живая» подключены к legacy-вебу mountPet только публичными
// входами; свой мини-сервер отдаёт папку примера (/extension/) и файлы пакета по адресу установленного архива
// (/node_modules/pet-companion/pet/…) — то, что видит сайт после npm install. Сценарий — кнопками сайта (мышь, клавиатура,
// касание): выбор кролика, имя, облик, аксессуар, занятие, кормление, уголок, «Поиграть» (поглаживание мышью и пальцем,
// лапы нет — ни кнопки, ни области, команда — unsupported), «Обустроить уголок» (морковка, запись), смена модели и
// питомца, «Без кролика» (запасной показ, данные целы, выбор кролика — unknown-id) и «С кроликом» (тот же кролик). Ключи —
// только своё пространство extension-demo (localStorage и IndexedDB); выбор кролика — ext:v1, companion не тронут (вкладки
// 0.1.4 видят прежнего штатного). Компьютер 1280×900 (мышь, клавиатура), телефон 390×844 (касания, CDP), узкий 320×740,
// боком 844×390. Без ошибок страницы, необработанных отклонений, горизонтальной прокрутки и внешних запросов. Часы —
// page.clock. Запуск — в составе npm run test:browser.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const NS = 'extension-demo';
const BUNNY = { id: 'example.bunny', over: 'cat' };

// Мини-сервер примера: /extension/ — index.html, /extension/<файл> — файлы примера, /node_modules/pet-companion/pet/… —
// файлы пакета (вложенные папки core/, web/, defs/); остальное — 404.
function serve() {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://stand');
    if (pathname === '/favicon.ico') return res.writeHead(204).end();
    const own = /^\/extension\/([\w-]+\.(mjs|css|html))?$/.exec(pathname);
    const pkg = /^\/node_modules\/pet-companion\/pet\/((?:[\w-]+\/)*[\w-]+\.(mjs|css))$/.exec(pathname);
    const file = own ? path.join(root, 'examples', 'extension', own[1] ?? 'index.html') : pkg ? path.join(root, 'pet', pkg[1]) : '';
    try {
      if (!file) throw new Error('нет');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)], 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((done) => server.close(done)) })));
}

// Только QA: случайность задана (реплики и сценки предсказуемы), необработанные отклонения, последнее событие указателя.
function init() {
  Math.random = () => 0.5;
  window.qaRejections = [];
  window.addEventListener('unhandledrejection', (event) => window.qaRejections.push(String(event.reason)));
  window.qaPointer = { n: 0, x: 0, y: 0 };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) document.addEventListener(type, (event) => Object.assign(window.qaPointer, { n: window.qaPointer.n + 1, x: event.clientX, y: event.clientY }), true);
}

function watchNetwork(page, base) {
  const outside = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:')) outside.push(url);
  });
  return outside;
}

// Снимок и видимые рисунки вне диалога (шапка, лапка): питомец рисунка — по классу набора (кролик) или data-kind.
const info = (page) =>
  page.evaluate(() => {
    const s = window.demoPet.getState();
    const seen = [...document.querySelectorAll('.cat-art')].filter((el) => !el.closest('#cat-sheet') && el.getBoundingClientRect().width > 0);
    const kind = (el) => (el.classList.contains('bunny-art') ? 'example.bunny' : el.dataset.kind || 'cat');
    return { pet: s.pet, behavior: s.behavior, pets: Object.keys(s.pets), name: s.name.display, coat: s.look.coat, accessory: s.look.accessory, reaction: s.pose.reaction?.type ?? null, kinds: [...new Set(seen.map(kind))], coats: [...new Set(seen.map((el) => el.dataset.coat))], accs: [...new Set(seen.map((el) => el.dataset.acc))], poses: seen.map((el) => el.dataset.pose), status: document.getElementById('status').textContent };
  });
const stored = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, JSON.parse(localStorage.getItem(key))])));
const key = (name) => `${NS}:${name}:v1`;
const sheet = (page) => page.evaluate(() => ({ open: Boolean(document.getElementById('cat-sheet')?.open), view: document.getElementById('cat-sheet')?.dataset.view ?? '' }));
const finishOpen = (page) => page.evaluate(() => Promise.all((document.querySelector('.cat-sheet')?.getAnimations() ?? []).map((animation) => animation.finished)));
const hint = (page) => page.evaluate(() => document.querySelector('[data-cat-play-hint]')?.textContent ?? '');
const playPose = (page) => page.evaluate(() => document.querySelector('.cat-play .cat-art')?.dataset.pose ?? '');
const rect = (page, selector) => page.evaluate((s) => document.querySelector(s)?.getBoundingClientRect().toJSON() ?? null, selector);
// Точка рисунка в «Поиграть» в единицах рисунка 220×204.
async function petPoint(page, u, v) {
  const r = await rect(page, '[data-play-pet]');
  return [r.x + (r.width * u) / 220, r.y + (r.height * v) / 204];
}
// Событие указателя дошло до страницы (ввод доставляется по кадрам Chrome).
async function sent(page, send, at = null) {
  const n = await page.evaluate(() => window.qaPointer.n);
  await send();
  await page.waitForFunction(([k, p]) => window.qaPointer.n > k && (!p || (Math.abs(window.qaPointer.x - p[0]) < 1 && Math.abs(window.qaPointer.y - p[1]) < 1)), [n, at], { timeout: 3000 });
}
// Поглаживание головы кролика (104, 70): вниз, три сдвига по 30 px с паузами, отпустить; позы между сдвигами.
async function stroke(page, { touch = null } = {}) {
  const [x0, y0] = await petPoint(page, 104, 70);
  const down = async () => (touch ? touch('touchStart', x0, y0) : (await page.mouse.move(x0, y0), sent(page, () => page.mouse.down())));
  const move = async (x) => (touch ? touch('touchMove', x, y0) : sent(page, () => page.mouse.move(x, y0, { steps: 2 }), [x, y0]));
  const up = async () => (touch ? touch('touchEnd') : sent(page, () => page.mouse.up()));
  const poses = [];
  await down();
  let side = 1;
  for (const ms of [200, 400, 500]) {
    await page.clock.runFor(ms);
    await move(x0 + side * 30);
    side = -side;
    poses.push(await playPose(page));
  }
  const held = await hint(page);
  await page.clock.runFor(300);
  await up();
  await page.clock.runFor(100);
  return { poses, held };
}
// Ключи только своего пространства; базы IndexedDB — тоже.
async function ownSpace(page) {
  const keys = await page.evaluate(() => Object.keys(localStorage));
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));
  return { keys, dbs, ok: keys.every((name) => name.startsWith(`${'extension-demo'}:`)) && dbs.every((name) => name.includes('extension-demo')) };
}
// Закрыть диалог клавишей Esc (из «Поиграть» и редактора Esc сначала возвращает в уголок).
async function shut(page) {
  for (let i = 0; i < 3 && (await sheet(page)).open; i += 1) {
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
  }
}
// expected — ожидаемые предупреждения модуля «Питомец: …» (журнал log.warn), каждое ровно один раз.
async function clean(page, outside, check, label, expected = []) {
  const warned = page.qaErrors.filter((text) => expected.includes(text));
  const errors = { page: page.qaErrors.filter((text) => !expected.includes(text)), rejections: await page.evaluate(() => window.qaRejections), outside, missing: expected.length === warned.length ? [] : expected };
  if (expected.length) check(`${label}: ожидаемое предупреждение журнала — ровно один раз`, warned.length === expected.length && expected.every((text) => warned.includes(text)), JSON.stringify(warned));
  check(`${label}: без ошибок страницы, необработанных отклонений и внешних запросов`, !errors.page.length && !errors.rejections.length && !errors.outside.length, JSON.stringify(errors));
}

export async function extensionQa(browser, check, open, layout) {
  const server = await serve();
  try {
    await desktop(browser, server.base, check, open, layout);
    await phone(browser, server.base, check, open, layout);
    await narrow(browser, server.base, check, open, layout);
    await side(browser, server.base, check, open, layout);
  } finally {
    await server.close();
  }
}

async function desktop(browser, base, check, open, layout) {
  const label = 'расширение 1280×900';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, init);
  const outside = watchNetwork(page, base);
  try {
    await page.goto(`${base}extension/`);
    await page.waitForFunction(() => Boolean(window.demoPet?.getState()));
    const start = await info(page);
    check(`${label}: страница примера подключила три питомца и две модели только публичными входами — показан кот, модель calm`, start.pet.shown === 'cat' && start.behavior.shown === 'calm' && start.pets.join() === 'cat,dog,example.bunny' && start.kinds.join() === 'cat', JSON.stringify(start));

    // ---- Кролик: выбор, имя, облик, занятие, аксессуар — кнопками сайта (мышь) ----
    await page.click('#bunny');
    await page.clock.runFor(100);
    const chosen = { ...(await info(page)), stored: await stored(page) };
    check(`${label}: «Кролик» — рисунок набора кролика в шапке; выбор — только ext:v1 { pet: { id, over: 'cat' } }, companion не записан`, chosen.pet.shown === 'example.bunny' && chosen.kinds.join() === 'example.bunny' && JSON.stringify(chosen.stored[key('ext')]) === JSON.stringify({ v: 1, pet: BUNNY }) && !(key('companion') in chosen.stored), JSON.stringify(chosen));
    await page.clock.runFor(5000);
    await page.click('#name');
    await page.click('#coat');
    await page.clock.runFor(100);
    const named = { ...(await info(page)), stored: await stored(page) };
    check(`${label}: имя и облик кролика — в его записях (ext.pets["example.bunny"], look["example.bunny"]), рисунки — новый облик`, named.name === 'Морковкин' && named.status.includes('имя: Морковкин') && named.coat === 'grey' && named.coats.join() === 'grey' && named.stored[key('ext')].pets['example.bunny'].name === 'Морковкин' && named.stored[key('look')]['example.bunny'] === 'grey', JSON.stringify(named));
    await page.click('#lesson');
    await page.clock.runFor(100);
    const joy = await info(page);
    check(`${label}: «Урок пройден» — реакция радости рисунком кролика (data-pose="joy")`, joy.reaction === 'joy' && joy.poses.includes('joy'), JSON.stringify(joy));
    // Ещё два занятия — третий знак открывает ступень 1 (бантик).
    for (let i = 0; i < 2; i += 1) {
      await page.clock.runFor(5000);
      await page.click('#lesson');
    }
    await page.clock.runFor(8000);
    await page.click('#bow');
    await page.clock.runFor(100);
    const bow = { ...(await info(page)), stored: await stored(page) };
    check(`${label}: «Бантик» — аксессуар кролика открыт ступенью, надет на всех рисунках, запись ext.pets`, bow.accessory === 'bow' && bow.accs.join() === 'bow' && bow.stored[key('ext')].pets['example.bunny'].accessory === 'bow', JSON.stringify(bow));

    // ---- Уголок клавиатурой: облики, аксессуары и имена кролика; Esc ----
    await page.focus('#corner');
    await page.keyboard.press('Enter');
    await finishOpen(page);
    const corner = await page.evaluate(() => ({
      coats: [...document.querySelectorAll('input[name="cat-coat"]')].map((input) => input.value),
      accs: [...document.querySelectorAll('input[name="cat-acc"]')].map((input) => input.value),
      chips: [...document.querySelectorAll('[data-cat-name-pick]')].map((chip) => chip.dataset.catNamePick),
      stage: Boolean(document.querySelector('#cat-sheet .bunny-art')),
      pickers: [...document.querySelectorAll('.cat-coat-face .cat-art')].every((art) => art.classList.contains('bunny-art')),
      focus: Boolean(document.activeElement?.matches('[data-cat-close]')),
      title: document.getElementById('cat-sheet-title')?.textContent ?? '',
    }));
    check(`${label}: «Уголок» с клавиатуры — фокус на «Закрыть»; облики, аксессуары, имена и рисунки — из определения и набора кролика`, (await sheet(page)).open && corner.focus && corner.stage && corner.pickers && corner.coats.join() === 'snow,grey,spot' && corner.accs.join() === 'ribbon,bow,clover' && corner.chips.includes('Ушастик') && corner.title === 'Морковкин', JSON.stringify(corner));
    await layout(page, `${label}, уголок кролика`);
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => Boolean(document.activeElement?.closest('#cat-sheet')));
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    const closed = { ...(await sheet(page)), focus: await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName) };
    check(`${label}: Tab — фокус внутри диалога; Esc — диалог закрыт, фокус не потерян`, inside && !closed.open && closed.focus !== 'BODY', JSON.stringify({ inside, closed }));

    // ---- Кормление ----
    await page.click('#feed');
    await page.clock.runFor(100);
    const fed = { ...(await info(page)), stored: await stored(page) };
    check(`${label}: «Покормить» — кролик ест (общее лакомство дня в treat)`, !fed.status.startsWith('Отказ') && fed.reaction === 'feed' && Boolean(fed.stored[key('treat')]?.fedDay), JSON.stringify(fed));
    await page.clock.runFor(10_000);

    // ---- «Поиграть»: поглаживание мышью, лапы нет ----
    await page.click('#play');
    await finishOpen(page);
    const play = await page.evaluate(() => ({
      hits: [...document.querySelectorAll('[data-play-hit]')].map((el) => el.dataset.playHit),
      pawButton: Boolean(document.querySelector('[data-cat-play-paw]')),
      art: Boolean(document.querySelector('.cat-play .bunny-art')),
    }));
    check(`${label}: «Поиграть» — рисунок кролика и его области (голова, тело), ни кнопки, ни области лапы`, (await sheet(page)).view === 'play' && play.art && play.hits.join() === 'head,body' && !play.pawButton, JSON.stringify(play));
    const before = await page.evaluate(() => JSON.stringify(window.demoPet.getState()));
    const paw = await page.evaluate(() => JSON.parse(JSON.stringify(window.demoPet.interact({ type: 'paw' }))));
    const after = await page.evaluate(() => JSON.stringify(window.demoPet.getState()));
    check(`${label}: команда лапы у кролика — unsupported без изменения снимка`, !paw.ok && paw.error.code === 'unsupported' && before === after, JSON.stringify(paw));
    const petted = await stroke(page);
    check(`${label}: поглаживание мышью — поза «pet», итог «Морковкин шевелит носом.»`, petted.poses.every((pose) => pose === 'pet') && petted.held === 'Морковкин шевелит носом.', JSON.stringify(petted));
    await page.clock.runFor(3000);
    await page.click('[data-cat-play-ball]');
    const poses = [];
    for (let i = 0; i < 6; i += 1) {
      poses.push(await playPose(page));
      await page.clock.runFor(400);
    }
    check(`${label}: «Катнуть мячик» — позы мячика у кролика — его замены (attentive), рисунок не получает позы, которой нет у кролика`, poses.every((pose) => ['calm', 'attentive', 'rest', 'content', 'joy', 'pet', 'feed', 'sniff', 'hop'].includes(pose)) && poses.includes('attentive'), JSON.stringify(poses));
    await layout(page, `${label}, «Поиграть» кролика`);
    await shut(page);
    await page.clock.runFor(3000);

    // ---- Комната: морковка правее и запись; модель ----
    await page.click('#room');
    await page.clock.runFor(100);
    const room = { ...(await sheet(page)), stored: (await stored(page))[key('room')] };
    check(`${label}: «Обустроить уголок» — морковка кролика сдвинута и сохранена в room["example.bunny"]`, room.stored?.['example.bunny']?.carrot?.x === 60, JSON.stringify(room));
    await shut(page);
    await page.click('#lively');
    await page.clock.runFor(100);
    const model = { ...(await info(page)), stored: await stored(page) };
    check(`${label}: «Живая модель» — ext.behavior, показ модели; выбор кролика прежний`, model.behavior.shown === 'example.lively' && model.stored[key('ext')].behavior === 'example.lively' && model.pet.shown === 'example.bunny', JSON.stringify(model));
    await page.click('#paw');
    check(`${label}: кнопка сайта «Дай лапу» у кролика — отказ unsupported`, (await info(page)).status === 'Отказ: unsupported', (await info(page)).status);

    // ---- Без кролика и с кроликом: данные целы, без дублей ----
    const ext = (await stored(page))[key('ext')];
    await page.click('#without');
    await page.clock.runFor(100);
    const without = { ...(await info(page)), stored: await stored(page) };
    check(`${label}: «Без кролика» — запасной показ: кот (over), выбор example.bunny недоступен, данные кролика не тронуты`, without.pet.id === 'example.bunny' && without.pet.shown === 'cat' && !without.pet.available && without.kinds.join() === 'cat' && without.status.includes('нет определения') && JSON.stringify(without.stored[key('ext')]) === JSON.stringify(ext), JSON.stringify(without));
    await page.click('#bunny');
    check(`${label}: без определения выбрать кролика нельзя — unknown-id`, (await info(page)).status === 'Отказ: unknown-id', (await info(page)).status);
    await page.click('#with');
    await page.clock.runFor(100);
    const back = { ...(await info(page)), nodes: await page.evaluate(() => ({ sheet: document.querySelectorAll('#cat-sheet').length, live: document.querySelectorAll('#cat-live').length })) };
    check(`${label}: «С кроликом» — тот же кролик: имя, облик, аксессуар, модель; одно подключение (без дублей)`, back.pet.shown === 'example.bunny' && back.name === 'Морковкин' && back.coat === 'grey' && back.accessory === 'bow' && back.behavior.shown === 'example.lively' && back.kinds.join() === 'example.bunny' && back.nodes.sheet <= 1 && back.nodes.live === 1, JSON.stringify(back));
    const space = await ownSpace(page);
    check(`${label}: только своё пространство extension-demo — ключи localStorage и базы IndexedDB`, space.ok, JSON.stringify(space));
    await layout(page, label);
    // «Без кролика»: модель «живая» ссылается на реплики кролика, которого в этом подключении нет — слабая ссылка (§ 7.3):
    // подключение проходит, журнал предупреждает.
    await clean(page, outside, check, label, ['Питомец: behaviors[1].phrases.byPet["example.bunny"]: питомца «example.bunny» нет в этом экземпляре — замены реплик не используются']);
  } finally {
    await context.close();
  }
}

async function phone(browser, base, check, open, layout) {
  const label = 'расширение 390×844';
  const { context, page, cdp } = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, init);
  const outside = watchNetwork(page, base);
  let last = null;
  const touch = async (type, x, y) => {
    const points = type === 'touchEnd' ? [] : [{ x, y, id: 1 }];
    last = type === 'touchEnd' ? null : [x, y];
    await sent(page, () => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points }), type === 'touchMove' ? last : null);
  };
  try {
    await page.goto(`${base}extension/`);
    await page.waitForFunction(() => Boolean(window.demoPet?.getState()));
    await page.tap('#bunny');
    await page.clock.runFor(100);
    const chosen = await info(page);
    check(`${label}: касание «Кролик» — кролик на странице`, chosen.pet.shown === 'example.bunny' && chosen.kinds.join() === 'example.bunny', JSON.stringify(chosen));
    await page.clock.runFor(5000);
    await page.tap('#play');
    await finishOpen(page);
    const petted = await stroke(page, { touch });
    check(`${label}: поглаживание пальцем — поза «pet», итог «Пух шевелит носом.»; лапы нет`, petted.poses.every((pose) => pose === 'pet') && petted.held === 'Пух шевелит носом.' && !(await page.evaluate(() => Boolean(document.querySelector('[data-cat-play-paw], [data-play-hit="paw"]')))), JSON.stringify(petted));
    await layout(page, `${label}, «Поиграть» кролика`);
    await page.tap('[data-cat-play-close]');
    await page.clock.runFor(500);
    const back = await sheet(page);
    await page.tap('[data-cat-close]');
    await page.clock.runFor(500);
    check(`${label}: «Закрыть» игры касанием — уголок, его «Закрыть» — диалог закрыт`, back.open && back.view === '' && !(await sheet(page)).open, JSON.stringify({ back, after: await sheet(page) }));
    await layout(page, label);
    await clean(page, outside, check, label);
  } finally {
    await context.close();
  }
}

// Узкий: кролик выбран заранее (сохранённые ключи), уголок касанием.
async function narrow(browser, base, check, open, layout) {
  const label = 'расширение 320×740';
  const { context, page } = await open(browser, { viewport: { width: 320, height: 740 }, hasTouch: true, isMobile: true }, init);
  const outside = watchNetwork(page, base);
  try {
    await context.addInitScript((entries) => {
      if (!localStorage.getItem('extension-demo:ext:v1')) for (const [name, value] of entries) localStorage.setItem(name, JSON.stringify(value));
    }, [[key('ext'), { v: 1, pet: BUNNY, pets: { 'example.bunny': { name: 'Зефир' } }, future: 1 }], [key('look'), { v: 1, 'example.bunny': 'spot' }]]);
    await page.goto(`${base}extension/`);
    await page.waitForFunction(() => Boolean(window.demoPet?.getState()));
    const seeded = await info(page);
    check(`${label}: сохранённый кролик — имя, облик и рисунок из своих записей`, seeded.pet.shown === 'example.bunny' && seeded.name === 'Зефир' && seeded.coats.join() === 'spot' && seeded.kinds.join() === 'example.bunny', JSON.stringify(seeded));
    await page.tap('#corner');
    await finishOpen(page);
    check(`${label}: уголок кролика открыт касанием`, (await sheet(page)).open && (await page.evaluate(() => Boolean(document.querySelector('#cat-sheet .bunny-art')))), JSON.stringify(await sheet(page)));
    await layout(page, `${label}, уголок кролика`);
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    const ext = (await stored(page))[key('ext')];
    check(`${label}: неизвестные поля ext сохраняются`, ext.future === 1 && ext.pets['example.bunny'].name === 'Зефир', JSON.stringify(ext));
    await clean(page, outside, check, label);
  } finally {
    await context.close();
  }
}

// Боком: собака и живая модель, затем кролик — over = собака (вкладки 0.1.4 видят собаку).
async function side(browser, base, check, open, layout) {
  const label = 'расширение боком 844×390';
  const { context, page } = await open(browser, { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }, init);
  const outside = watchNetwork(page, base);
  try {
    await page.goto(`${base}extension/`);
    await page.waitForFunction(() => Boolean(window.demoPet?.getState()));
    await page.tap('#dog');
    await page.clock.runFor(5000);
    await page.tap('#lively');
    await page.tap('#lesson');
    await page.clock.runFor(100);
    const dog = await info(page);
    check(`${label}: собака с живой моделью — радость рисунком собаки`, dog.pet.shown === 'dog' && dog.behavior.shown === 'example.lively' && dog.reaction === 'joy' && dog.kinds.join() === 'dog', JSON.stringify(dog));
    await page.clock.runFor(5000);
    await page.tap('#bunny');
    await page.clock.runFor(100);
    const all = await stored(page);
    check(`${label}: кролик поверх собаки — ext.pet.over = dog, companion.kind = dog (вкладки 0.1.4 — собака)`, all[key('companion')]?.kind === 'dog' && JSON.stringify(all[key('ext')].pet) === JSON.stringify({ id: 'example.bunny', over: 'dog' }) && (await info(page)).kinds.join() === 'example.bunny', JSON.stringify(all));
    await layout(page, label);
    await clean(page, outside, check, label);
  } finally {
    await context.close();
  }
}
