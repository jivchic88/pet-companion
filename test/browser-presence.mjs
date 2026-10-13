// Присутствие, виды и сценки на ядре (PL04.2) в Chrome: настоящий mountPet на стенде, часы — page.clock, случайность —
// подмена Math.random (порт random ядра по умолчанию), день сценки — настоящая IndexedDB с управляемым шлюзом чтения без
// пауз (транзакция остаётся открытой, решение ядра ждёт сценария). «Приходит по зову» с клавиатуры: лапка, Enter — сразу
// «Поиграть», «Уголок», Esc — к странице с фокусом на лапке; закрытый по зову ничего не играет, вызов не празднует и не
// отмечает ступень, «Уголок» после вызова — отмечает; «Скрыть» и «Показать» по зову — лапка без игры. Сценка в уголке и
// отмена редактором; отмена вводом и отключение, пока решение ждёт в открытой транзакции, — ничего не записано; две вкладки
// одного пространства — одна сценка, разных — две; синтетические более новые и повреждённые записи и повторное
// подключение; одинаковый сценарий в Chrome и в Node (ядро, веб-координатор, IndexedDB в памяти) — один логический итог.
// Компьютер 1280×900, телефон 390×844 и боком 844×390: горизонтальной прокрутки, ошибок страницы и внешних запросов нет,
// чужой ключ сайта не тронут. Запуск — в составе npm run test:browser.
import { createPetCore } from '../pet/core/index.mjs';
import { createWebScenes } from '../pet/web/scenes.mjs';
import { createWebStorage } from '../pet/web/storage.mjs';
import { area, calendar, fakeIdb, flush, host, journal, LEGACY_DISPLAY, planner, series, tabs } from './core-kit.mjs';

const DAY = '2026-10-11';
const FOREIGN = '{"keep":1}';

// Только QA: чужой ключ сайта до подключения; управляемый шлюз чтения дня сценки: window.qaRead[база] = true — результат
// get('shown') модулю отдаётся только после window.qaReadGo = true, а транзакция всё это время открыта (повторные чтения
// служебного ключа держат её активной, решение выполняется внутри её события).
function init() {
  if (!localStorage.getItem('site:other')) localStorage.setItem('site:other', '{"keep":1}');
  const open = indexedDB.open.bind(indexedDB);
  window.qaRead = {};
  window.qaReadGo = false;
  window.qaReadHeld = false;
  indexedDB.open = (name, ...rest) => {
    const request = open(name, ...rest);
    if (!window.qaRead[name]) return request;
    request.addEventListener('success', () => {
      const db = request.result;
      const transaction = db.transaction.bind(db);
      db.transaction = (...args) => {
        const tx = transaction(...args);
        const objectStore = tx.objectStore.bind(tx);
        let wrapped = null;
        tx.objectStore = (...names) => {
          const store = objectStore(...names);
          if (wrapped) return store;
          wrapped = store;
          const get = store.get.bind(store);
          store.get = (...keys) => {
            const req = get(...keys);
            let handler = null;
            Object.defineProperty(req, 'onsuccess', { configurable: true, get: () => handler, set: (fn) => (handler = fn) });
            req.addEventListener('success', (event) => {
              window.qaReadHeld = true;
              const spin = () => {
                if (window.qaReadGo) {
                  window.qaReadGo = false;
                  window.qaReadHeld = false;
                  handler?.call(req, event);
                  return;
                }
                get('qa-keepalive').onsuccess = spin;
              };
              spin();
            });
            return req;
          };
          return store;
        };
        return tx;
      };
    });
    return request;
  };
}

function watchNetwork(page, base) {
  const outside = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:')) outside.push(url);
  });
  return outside;
}

// Дождаться условия на странице без пауз: часы страницы подменены (page.clock), поэтому опрос — повторными evaluate, каждый
// отдаёт ход событиям браузера (IndexedDB); не дождались за предел — ошибка сценария.
async function until(page, fn, arg) {
  for (let i = 0; i < 5000; i += 1) if (await page.evaluate(fn, arg)) return;
  throw new Error(`условие не наступило: ${fn}`);
}

const stored = (page, key) => page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? 'null'), key);
const raw = (page, key) => page.evaluate((name) => localStorage.getItem(name), key);
const sheetView = (page) => page.evaluate(() => ({ open: Boolean(document.getElementById('cat-sheet')?.open), view: document.getElementById('cat-sheet')?.dataset.view ?? '' }));
const scenes = (page) => page.evaluate(() => [...document.querySelectorAll('.cat-art[data-scene]')].map((art) => art.dataset.scene));
const focusedOn = (page, selector) => page.evaluate((s) => Boolean(document.activeElement?.matches(s)), selector);
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
const putRecord = (page, db, record) =>
  page.evaluate(
    ([name, value]) =>
      new Promise((resolve) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('scene');
        request.onsuccess = () => {
          const tx = request.result.transaction('scene', 'readwrite');
          tx.objectStore('scene').put(value, 'shown');
          tx.oncomplete = () => {
            request.result.close();
            resolve();
          };
        };
      }),
    [db, record],
  );
// Подключить на стенде с пространством ns: увиденная ступень 1, приветствие сегодня было, случайность 0 (сценка выпадает,
// вариант — первый); progress — marks, today.
async function mount(page, ns, { marks = 4, today = 1, cat = { v: 1, seenStage: 1, greetDay: DAY }, extra = {} } = {}) {
  await page.evaluate(
    ([space, value, more, m, t]) => {
      Math.random = () => 0;
      localStorage.setItem(`${space}:cat:v1`, JSON.stringify(value));
      for (const [key, item] of Object.entries(more)) localStorage.setItem(`${space}:${key}:v1`, typeof item === 'string' ? item : JSON.stringify(item));
      window.stand.mount({ storage: space });
      window.stand.set(m, t);
    },
    [ns, cat, extra, marks, today],
  );
  await page.clock.runFor(100);
}
const notify = (page, key) => page.evaluate((k) => window.stand.pet.notify('saved', { key: k, counted: true }), key);

export async function presenceQa(browser, base, check, open, layout) {
  const chrome = await desktop(browser, base, check, open, layout);
  await phone(browser, base, check, open, layout);
  await same(check, chrome);
}

async function desktop(browser, base, check, open, layout) {
  const label = 'присутствие, виды и сценки 1280×900';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, init);
  const outside = watchNetwork(page, base);
  let chrome = null;
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));

    // ---- Тот же сценарий, что в Node (same): увиденная ступень 1, 4 → 5 знаков, random 0, уголок закрыт ----
    await mount(page, 'nr');
    await page.evaluate(() => window.stand.set(5, 2));
    await notify(page, 'b1');
    await page.clock.runFor(1600);
    await until(page, () => document.querySelectorAll('.cat-art[data-scene]').length > 0);
    await page.clock.runFor(10);
    const record = await sceneRecord(page, 'nr:scene');
    const copy = await stored(page, 'nr:scene:v1');
    chrome = { scene: (await scenes(page))[0] ?? '', record: { day: record?.day, cat: record?.cat }, copy: { day: copy?.day, cat: copy?.cat }, seen: (await stored(page, 'nr:cat:v1')).seenStage };
    await page.evaluate(() => window.stand.pet.destroy());

    // ---- «Приходит по зову» с клавиатуры ----
    await mount(page, 'pa', { marks: 2, today: 1, cat: { v: 1, seenStage: 0, greetDay: DAY } });
    await page.locator('#cat-dock .cat-dock-btn').focus();
    await page.keyboard.press('Enter');
    await page.locator('.cat-presence .cat-place-option:has(input[value="on-call"])').click();
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    const lapka = await page.evaluate(() => ({ call: document.documentElement.hasAttribute('data-pet-call'), arts: document.querySelectorAll('.cat-art[data-cat-managed]').length, focus: document.activeElement?.matches('.cat-call') ?? false }));
    check(`${label}: «Приходит по зову» — лапка, без рисунка на странице, фокус на лапке`, lapka.call && lapka.arts === 0 && lapka.focus && (await stored(page, 'pa:presence:v1'))?.mode === 'on-call', JSON.stringify(lapka));
    // Закрытый по зову: занятие открывает ступень — ни реакции, ни праздника, ни отметки, ни сценки.
    await page.evaluate(() => window.stand.set(3, 2));
    await notify(page, 'p1');
    await page.clock.runFor(2000);
    const away = { seen: (await stored(page, 'pa:cat:v1')).seenStage, arts: await page.evaluate(() => document.querySelectorAll('.cat-art[data-cat-managed]').length), copy: await raw(page, 'pa:scene:v1') };
    check(`${label}: по зову и закрыт — ни реакции, ни праздника и отметки ступени, ни сценки`, away.seen === 0 && away.arts === 0 && away.copy === null, JSON.stringify(away));
    // Enter на лапке — сразу «Поиграть» (без вспышки уголка), фокус на «Закрыть»; вызов не отмечает ступень.
    await page.keyboard.press('Enter');
    const call = { ...(await sheetView(page)), focus: await focusedOn(page, '[data-cat-play-close]'), seen: (await stored(page, 'pa:cat:v1')).seenStage };
    check(`${label}: Enter на лапке — сразу «Поиграть», фокус на «Закрыть», ступень не отмечена`, call.open && call.view === 'play' && call.focus && call.seen === 0, JSON.stringify(call));
    // Shift+Tab — «Уголок»; Enter — уголок с «Новым», ступень увидена, фокус на «Поиграть».
    await page.keyboard.press('Shift+Tab');
    const cornerFocus = await focusedOn(page, '[data-cat-play-corner]');
    await page.keyboard.press('Enter');
    const corner = { ...(await sheetView(page)), fresh: await page.evaluate(() => (document.querySelector('[data-cat-fresh]')?.hidden ? '' : document.querySelector('[data-cat-fresh]')?.textContent ?? '')), seen: (await stored(page, 'pa:cat:v1')).seenStage, focus: await focusedOn(page, '[data-cat-play]') };
    check(`${label}: «Уголок» после вызова — уголок, «Новое в уголке», ступень увидена, фокус на «Поиграть»`, cornerFocus && corner.open && corner.view === '' && corner.fresh.startsWith('Новое') && corner.seen === 1 && corner.focus, JSON.stringify(corner));
    // Esc — диалог закрыт (вызван — к странице), фокус на лапке.
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    check(`${label}: Esc — к странице, фокус снова на лапке`, !(await sheetView(page)).open && (await focusedOn(page, '.cat-call')));
    // «Скрыть» и «Показать» по зову: лапка возвращается, игра сама не открывается.
    await page.keyboard.press('Enter');
    await page.locator('[data-cat-play-corner]').click();
    await page.locator('.cat-settings > summary').click();
    await page.locator('[data-cat-hide]').click();
    await page.clock.runFor(100);
    const hidden = await page.evaluate(() => ({ call: document.documentElement.hasAttribute('data-pet-call'), open: document.getElementById('cat-sheet').open }));
    await page.locator('#cat-side [data-cat-return]').click();
    await page.clock.runFor(100);
    const back = { ...(await sheetView(page)), call: await page.evaluate(() => document.documentElement.hasAttribute('data-pet-call')), focus: await focusedOn(page, '.cat-call') };
    check(`${label}: «Скрыть» и «Показать» по зову — лапка с фокусом, игра не открыта`, !hidden.call && !hidden.open && back.call && !back.open && back.focus, JSON.stringify({ hidden, back }));
    // Снова «Всегда рядом»: питомец на месте, без приветствия.
    await page.keyboard.press('Enter');
    await page.locator('[data-cat-play-corner]').click();
    await page.locator('.cat-presence .cat-place-option:has(input[value="always"])').click();
    await page.keyboard.press('Escape');
    await page.clock.runFor(1500);
    const always = await page.evaluate(() => ({ call: document.documentElement.hasAttribute('data-pet-call'), pose: document.querySelector('#cat-dock .cat-art')?.dataset.pose ?? '' }));
    check(`${label}: «Всегда рядом» — питомец в боковой панели, без приветствия`, !always.call && always.pose === 'calm' && (await stored(page, 'pa:presence:v1'))?.mode === 'always', JSON.stringify(always));
    await layout(page, `${label}, по зову`);
    await page.evaluate(() => window.stand.pet.destroy());

    // ---- Сценка в уголке; редактор её отменяет ----
    await mount(page, 'pb');
    await page.locator('#cat-dock .cat-dock-btn').click();
    await page.evaluate(() => window.stand.set(5, 2));
    await notify(page, 'b1');
    await page.clock.runFor(1600);
    await until(page, () => document.querySelectorAll('.cat-art[data-scene]').length > 0);
    const inCorner = { scenes: await scenes(page), day: (await sceneRecord(page, 'pb:scene'))?.day, copy: (await stored(page, 'pb:scene:v1'))?.day };
    check(`${label}: сценка в открытом уголке — день в базе pb:scene и копия pb:scene:v1`, inCorner.scenes.includes('stretch') && inCorner.day === DAY && inCorner.copy === DAY, JSON.stringify(inCorner));
    await page.locator('[data-cat-room]').click();
    const room = { scenes: await scenes(page), view: (await sheetView(page)).view };
    await page.keyboard.press('Escape');
    const leave = { view: (await sheetView(page)).view, focus: await focusedOn(page, '[data-cat-room]') };
    check(`${label}: «Обустроить уголок» — сценка остановлена; Esc — в уголок, фокус на входе`, room.scenes.length === 0 && room.view === 'room' && leave.view === '' && leave.focus, JSON.stringify({ room, leave }));
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    await page.evaluate(() => window.stand.pet.destroy());

    // ---- Решение ждёт в открытой транзакции: ввод отменяет попытку; отключение — тоже; ничего не записано ----
    for (const [ns, title, interrupt] of [
      ['pc', 'ввод в поле сайта', () => page.locator('#site-input').focus()],
      ['pd', 'отключение', () => page.evaluate(() => window.stand.pet.destroy())],
    ]) {
      await page.evaluate((name) => (window.qaRead[name] = true), `${ns}:scene`);
      await mount(page, ns);
      await page.evaluate(() => window.stand.set(5, 2));
      await notify(page, `${ns}1`);
      await page.clock.runFor(1600);
      await until(page, () => window.qaReadHeld);
      await interrupt();
      await page.evaluate(() => (window.qaReadGo = true));
      await until(page, () => !window.qaReadHeld);
      // Шлюз снят до проверки: своё чтение записи сценарий не задерживает.
      await page.evaluate((name) => delete window.qaRead[name], `${ns}:scene`);
      const after = { scenes: await scenes(page), day: (await sceneRecord(page, `${ns}:scene`))?.day ?? '', copy: await raw(page, `${ns}:scene:v1`) };
      check(`${label}: ${title}, пока решение ждёт в транзакции, — skip: ни показа, ни дня, ни копии`, after.scenes.length === 0 && after.day === '' && after.copy === null, JSON.stringify(after));
      await page.evaluate(() => window.stand.pet?.mounted && window.stand.pet.destroy());
      await page.locator('#site-check').focus();
    }

    // ---- Две вкладки: одно пространство — одна сценка; разные — две ----
    const second = await context.newPage();
    second.on('pageerror', (error) => page.qaErrors.push(`вторая вкладка: ${error.message}`));
    await second.goto(`${base}?manual`);
    await second.waitForFunction(() => Boolean(window.stand));
    for (const [nsA, nsB, expected] of [
      ['pe', 'pe', 1],
      ['pf', 'pg', 2],
    ]) {
      await mount(page, nsA);
      await mount(second, nsB);
      await page.evaluate(() => window.stand.set(5, 2));
      await second.evaluate(() => window.stand.set(5, 2));
      await notify(page, 'a');
      await notify(second, 'b');
      await Promise.all([page.clock.runFor(1600), second.clock.runFor(1600)]);
      await until(page, async (a) => {
        const read = (name) =>
          new Promise((resolve) => {
            const request = indexedDB.open(name, 1);
            request.onupgradeneeded = () => request.result.createObjectStore('scene');
            request.onsuccess = () => {
              const get = request.result.transaction('scene').objectStore('scene').get('shown');
              get.onsuccess = () => (request.result.close(), resolve(get.result));
            };
          });
        return Boolean(await read(`${a}:scene`));
      }, nsA);
      await sceneRecord(second, `${nsB}:scene`);
      await page.clock.runFor(10);
      // Сценка рисуется на всех местах вкладки, где читается, — считаются вкладки со сценкой.
      const shown = Number((await scenes(page)).length > 0) + Number((await scenes(second)).length > 0);
      check(`${label}: две вкладки, пространства ${nsA} и ${nsB} — вкладок со сценкой ${expected}`, shown === expected, String(shown));
      await page.evaluate(() => window.stand.pet.destroy());
      await second.evaluate(() => window.stand.pet.destroy());
    }
    await second.close();

    // ---- Синтетические записи: более новая и повреждённая; повторное подключение ----
    // Прошлый вариант кота — в копии scene:v1 (как 0.1.4); запись дня в базе — более новой версии с неизвестным полем.
    await putRecord(page, 'ph:scene', { v: 3, day: '2026-10-10', cat: 'stretch', future: { a: [1] } });
    await mount(page, 'ph', { extra: { presence: { v: 2, mode: 'always', extra: 1 }, scene: { v: 1, day: '2026-10-10', cat: 'stretch' } } });
    await page.evaluate(() => window.stand.set(5, 2));
    await notify(page, 'h1');
    await page.clock.runFor(1600);
    await until(page, () => document.querySelectorAll('.cat-art[data-scene]').length > 0);
    const newer = { scenes: await scenes(page), record: await sceneRecord(page, 'ph:scene'), copy: await stored(page, 'ph:scene:v1') };
    check(`${label}: более новая запись дня — v и неизвестные поля сохранены; прошлый stretch (копия) — теперь curl`, newer.scenes.includes('curl') && newer.record.v === 3 && newer.record.future?.a?.[0] === 1 && newer.record.day === DAY && newer.record.cat === 'curl' && newer.copy?.cat === 'curl', JSON.stringify(newer));
    await page.locator('#cat-dock .cat-dock-btn').click();
    await page.locator('.cat-presence .cat-place-option:has(input[value="on-call"])').click();
    await page.keyboard.press('Escape');
    check(`${label}: более новая запись присутствия — режим записан, поля и v сохранены`, JSON.stringify(await stored(page, 'ph:presence:v1')) === JSON.stringify({ v: 2, mode: 'on-call', extra: 1 }), await raw(page, 'ph:presence:v1'));
    // Повторное подключение того же пространства: день занят — второй сценки нет.
    await page.evaluate(() => window.stand.pet.destroy());
    await mount(page, 'ph', { extra: { presence: { v: 2, mode: 'always', extra: 1 } } });
    await page.evaluate(() => window.stand.set(6, 3));
    await notify(page, 'h2');
    await page.clock.runFor(1600);
    await sceneRecord(page, 'ph:scene');
    check(`${label}: повторное подключение — день прежнего подключения, второй сценки нет`, (await scenes(page)).length === 0);
    await page.evaluate(() => window.stand.pet.destroy());
    await putRecord(page, 'pi:scene', 'испорчено');
    await mount(page, 'pi');
    await page.evaluate(() => window.stand.set(5, 2));
    await notify(page, 'i1');
    await page.clock.runFor(1600);
    await sceneRecord(page, 'pi:scene');
    await page.clock.runFor(10);
    check(`${label}: повреждённая запись дня — не свободный день: сценки нет, запись не заменена`, (await scenes(page)).length === 0 && (await sceneRecord(page, 'pi:scene')) === 'испорчено' && (await raw(page, 'pi:scene:v1')) === null);
    await page.evaluate(() => window.stand.pet.destroy());

    check(`${label}: чужой ключ сайта не тронут`, (await raw(page, 'site:other')) === FOREIGN);
    check(`${label}: внешних запросов нет`, outside.length === 0, outside.join(', '));
    await layout(page, label);
    check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
  return chrome;
}

async function phone(browser, base, check, open, layout) {
  for (const [label, viewport] of [
    ['присутствие и сценки 390×844', { width: 390, height: 844 }],
    ['присутствие и сценки боком 844×390', { width: 844, height: 390 }],
  ]) {
    const { context, page } = await open(browser, { viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, init);
    const outside = watchNetwork(page, base);
    try {
      await page.goto(`${base}?manual`);
      await page.waitForFunction(() => Boolean(window.stand));
      // Сценка у портрета в верхней панели: клубок там не читается — «потягивается».
      await mount(page, 'qa', { cat: { v: 1, seenStage: 1, greetDay: DAY }, extra: { scene: { v: 1, day: '2026-10-10', cat: 'curl' } } });
      await page.evaluate(() => window.stand.set(5, 2));
      await notify(page, 'q1');
      await page.clock.runFor(1600);
      await until(page, () => document.querySelectorAll('.cat-art[data-scene]').length > 0);
      const top = await page.evaluate(() => ({ scene: document.querySelector('.cat-face .cat-art')?.dataset.scene ?? '', view: document.querySelector('.cat-face')?.dataset.view ?? '' }));
      check(`${label}: сценка у портрета наверху — «потягивается»`, top.scene === 'stretch', JSON.stringify(top));
      await page.clock.runFor(5000);
      // По зову: лапка в шапке, касание — сразу «Поиграть», «Уголок»; «Скрыть» в уголке и «Показать» из меню — снова лапка.
      await page.locator('.cat-face').tap();
      await page.locator('.cat-presence .cat-place-option:has(input[value="on-call"])').tap();
      await page.locator('[data-cat-close]').first().tap();
      await page.clock.runFor(100);
      await page.locator('.cat-face').tap();
      const play = await sheetView(page);
      await page.locator('[data-cat-play-corner]').tap();
      const corner = await sheetView(page);
      await page.locator('.cat-settings > summary').tap();
      await page.locator('[data-cat-hide]').tap();
      await page.clock.runFor(200);
      const hiddenFace = await page.locator('.cat-face').count();
      await page.locator('#site-menu').tap();
      await page.evaluate(() => {
        window.qaMenuClosed = new Promise((resolve) => document.getElementById('site-dialog').addEventListener('close', resolve, { once: true }));
      });
      await page.locator('.cat-sections-return button').tap();
      await page.evaluate(() => window.qaMenuClosed);
      await page.clock.runFor(50);
      const back = await page.evaluate(() => ({ call: document.querySelector('.cat-face')?.hasAttribute('data-cat-call') ?? false, open: document.getElementById('cat-sheet').open, focus: document.activeElement?.classList.contains('cat-face') ?? false }));
      check(`${label}: по зову — касание лапки сразу «Поиграть», «Уголок»; «Скрыть» и «Показать» — снова лапка с фокусом, игра не открыта`, play.open && play.view === 'play' && corner.view === '' && hiddenFace === 0 && back.call && !back.open && back.focus, JSON.stringify({ play, corner, hiddenFace, back }));
      await page.locator('.cat-face').tap();
      await layout(page, `${label}, «Поиграть» по зову`);
      await page.locator('[data-cat-play-close]').tap();
      check(`${label}: чужой ключ сайта не тронут, внешних запросов нет`, (await raw(page, 'site:other')) === FOREIGN && outside.length === 0, outside.join(', '));
      await layout(page, label);
      check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
    } catch (error) {
      check(`${label}: сценарий выполнен`, false, error.stack);
    } finally {
      await context.close();
    }
  }
}

// Тот же сценарий в Node (ядро, веб-координатор на подменённом localStorage, веб-адаптер на IndexedDB в памяти): занятие,
// конец радости, сценка, копия. Итог сравнивается с Chrome по смыслу: вариант, день и вариант в записи и копии, ступень.
async function same(check, chrome) {
  const label = 'присутствие, виды и сценки: Chrome и Node — один итог';
  try {
    const node = await nodeRun();
    const expected = { scene: 'stretch', record: { day: DAY, cat: 'stretch' }, copy: { day: DAY, cat: 'stretch' }, seen: 1 };
    check(`${label}: сценка, день и вариант в записи и копии, ступень — одинаково (Chrome ${JSON.stringify(chrome)})`, JSON.stringify(node) === JSON.stringify(expected) && JSON.stringify(chrome) === JSON.stringify(expected), JSON.stringify({ node, chrome }));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  }
}

// Сценарий Chrome «pb» без уголка: увиденная ступень 1, 4 → 5 знаков, random 0.
async function nodeRun() {
  const store = area({ 'nr:cat:v1': JSON.stringify({ v: 1, seenStage: 1, greetDay: DAY }) });
  const storage = createWebStorage({ namespace: 'nr', area: store, events: tabs().target });
  storage.load();
  const time = calendar(`${DAY}T10:00:00Z`);
  const plan = planner(time);
  const idb = fakeIdb('nr:scene');
  const counts = host(4, 1);
  const core = createPetCore({ storage, scenes: createWebScenes({ namespace: 'nr', idb: idb.tab() }), progress: counts.progress, clock: time.port, random: series([], 0).port, scheduler: plan.port, log: journal().port });
  core.setDisplay({ ...LEGACY_DISPLAY, full: true });
  core.start();
  counts.set(5, 2);
  core.refresh();
  core.notify('saved', { key: 'b1', counted: true });
  plan.advance(1600);
  for (let i = 0; i < 4; i += 1) await flush();
  const record = idb.data.get('shown');
  const copy = JSON.parse(store.getItem('nr:scene:v1'));
  const result = { scene: core.getState().pose.reaction?.type ?? '', record: { day: record.day, cat: record.cat }, copy: { day: copy.day, cat: copy.cat }, seen: JSON.parse(store.getItem('nr:cat:v1')).seenStage };
  core.destroy();
  return result;
}
