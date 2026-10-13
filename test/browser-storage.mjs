// Сохранность данных (PL02) в браузере: настоящий mountPet на стенде (test/stand.html), действия интерфейса, затем
// localStorage и IndexedDB как есть и повторное подключение или перезагрузка. Неизвестные поля, вложенные данные,
// неизвестные ID и значения, данные другого животного и больший v после записи на месте; четыре случая чтения (нет ключа,
// повреждено, отказ чтения, более новая схема) — неявные записи повреждённого не трогают, после отказа загрузки экземпляр
// ничего не пишет (счётчик setItem), отказ записи и переполнение — честно и без потери прочитанного; день сценки в
// IndexedDB и её копия; две вкладки, пространства имён и смешанные версии — настоящая 0.1.4 из неизменяемой фикстуры
// (/old14/, test/fixtures/pet-0.1.4/) фиксирует предел, а не маскирует его. Отказы — управляемые обёртки Storage, без пауз.
// Запуск — в составе npm run test:browser (test/browser.mjs).
import { isDeepStrictEqual } from 'node:util';
import { storageKeys } from '../pet/pet-rules.mjs';

const DAY = '2026-10-11';
const STORED = ['cat', 'companion', 'look', 'treat', 'place', 'presence', 'scene', 'room'];

// Только QA: счётчик записей localStorage и управляемые отказы. qaStore.denyGet / denySet — регулярное выражение ключей:
// getItem бросает SecurityError, setItem — QuotaExceededError; denyAll — бросает сам доступ к localStorage. qaRaw — чтение
// и запись сценария мимо счётчика и отказов.
function storageHooks() {
  const proto = Storage.prototype;
  const get = proto.getItem;
  const set = proto.setItem;
  const real = window.localStorage;
  const store = (window.qaStore = { writes: [], denyGet: '', denySet: '', denyAll: false });
  window.qaRaw = { get: (key) => get.call(real, key), set: (key, value) => set.call(real, key, value), keys: () => Object.keys(real).sort() };
  proto.getItem = function getItem(key) {
    if (store.denyGet && new RegExp(store.denyGet).test(key)) throw new DOMException('чтение запрещено проверкой', 'SecurityError');
    return get.call(this, key);
  };
  proto.setItem = function setItem(key, value) {
    store.writes.push(String(key));
    if (store.denySet && new RegExp(store.denySet).test(key)) throw new DOMException('хранилище переполнено (проверка)', 'QuotaExceededError');
    return set.call(this, key, value);
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      if (store.denyAll) throw new DOMException('хранилище запрещено проверкой', 'SecurityError');
      return real;
    },
  });
}

const text = (value) => (typeof value === 'string' ? value : JSON.stringify(value));
const seed = (page, entries) => page.evaluate((list) => list.forEach(([key, value]) => window.qaRaw.set(key, value)), Object.entries(entries).map(([key, value]) => [key, text(value)]));
const raw = (page, key) => page.evaluate((k) => window.qaRaw.get(k), key);
const rawAll = (page, keys) => page.evaluate((list) => list.map((key) => window.qaRaw.get(key)), keys);
const json = async (page, key) => JSON.parse(await raw(page, key));
const writes = (page, pattern) => page.evaluate((p) => window.qaStore.writes.filter((key) => new RegExp(p).test(key)).length, pattern);
const setQa = (page, patch) => page.evaluate((p) => Object.assign(window.qaStore, p), patch);
const keysOf = (ns) => STORED.map((name) => storageKeys(ns)[name]);
const same = (a, b) => isDeepStrictEqual(a, b);
// Показанный питомец в боковой панели (у рисунка кота нет data-kind, у собаки — 'dog').
const dock = (page) => page.evaluate(() => ({ kind: document.querySelector('#cat-dock .cat-art') ? (document.querySelector('#cat-dock .cat-art').dataset.kind ?? 'cat') : '', coat: document.querySelector('#cat-dock .cat-art')?.dataset.coat ?? '', name: document.querySelector('#cat-dock [data-cat-name]')?.textContent ?? '', scene: document.querySelector('#cat-dock .cat-art')?.dataset.scene ?? '' }));
const note = (page, selector) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', selector);

// Подключить на стенде копию модуля src (по умолчанию — текущая; /old14/pet.mjs — прежняя 0.1.4).
const mount = (page, ns, src = '/pet/pet.mjs') =>
  page.evaluate(
    async ([storage, from]) => {
      const { mountPet } = await import(from);
      window.stand.mount({ storage }, mountPet);
    },
    [ns, src],
  );

async function fresh(page, base) {
  await page.goto(`${base}?manual`);
  await page.waitForFunction(() => Boolean(window.stand));
}

async function tab(context, base) {
  const page = await context.newPage();
  page.qaErrors = [];
  page.on('pageerror', (error) => page.qaErrors.push(error.message));
  page.on('console', (message) => (message.type() === 'error' || message.text().startsWith('Питомец:')) && page.qaErrors.push(message.text()));
  await fresh(page, base);
  return page;
}

// Ошибки страницы: ожидаемые предупреждения (по началу текста) есть, других нет.
function errorsOk(check, label, pages, expected = []) {
  const all = pages.flatMap((page) => page.qaErrors);
  const other = all.filter((message) => !expected.some((prefix) => message.startsWith(prefix)));
  const missing = expected.filter((prefix) => !all.some((message) => message.startsWith(prefix)));
  check(`${label}: ожидаемые предупреждения есть (${expected.length}), других ошибок страницы нет`, other.length === 0 && missing.length === 0, JSON.stringify({ other, missing }));
}

const openCorner = (page) => page.locator('#cat-dock .cat-dock-btn').click();
const openSettings = async (page) => {
  if (!(await page.evaluate(() => document.querySelector('#cat-sheet .cat-settings')?.open))) await page.locator('#cat-sheet .cat-settings > summary').click();
};
const corrupt = (key) => `Питомец: значение ${key} повреждено`;
const OFFLINE = 'Питомец: хранилище недоступно';

// IndexedDB <ns>:scene, запись shown: положить и прочитать как есть ('<нет>' — записи нет).
const idbPut = (page, name, value) =>
  page.evaluate(
    ([db, record]) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open(db, 1);
        open.onupgradeneeded = () => open.result.createObjectStore('scene');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('scene', 'readwrite');
          tx.objectStore('scene').put(record, 'shown');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onabort = () => reject(tx.error);
        };
      }),
    [name, value],
  );
const idbGet = (page, name) =>
  page.evaluate(
    (db) =>
      new Promise((resolve) => {
        const open = indexedDB.open(db, 1);
        open.onupgradeneeded = () => open.result.createObjectStore('scene');
        open.onsuccess = () => {
          const get = open.result.transaction('scene').objectStore('scene').get('shown');
          get.onsuccess = () => {
            open.result.close();
            resolve(get.result === undefined ? '<нет>' : get.result);
          };
        };
      }),
    name,
  );

// A–C, E: неизвестное в cat, companion, look, treat, place, presence, scene после реальных действий уголка.
async function keep(browser, base, check, open) {
  const label = 'хранение: действия уголка';
  const k = storageKeys('keep');
  const seeds = {
    [k.cat]: { v: 3, name: 'Барсик', accessory: 'crown', motion: 'normal', phrases: true, hidden: false, future: { deep: { list: [1, 2] } }, hat: 'cap' },
    [k.companion]: { v: 2, kind: 'example.bunny', dog: { name: 'Рекс', accessory: 'crown', bow: { color: 'red' } }, pets: { 'example.bunny': { name: 'Пух' } }, extra: 1 },
    [k.look]: { v: 2, cat: 'calico', dog: 'merle', bunny: 'snow', more: { a: 1 } },
    [k.treat]: { v: 2, fedDay: '2026-10-01', streak: { n: 2 } },
    [k.place]: { v: 2, theme: { dark: true }, desktop: { place: 'sidebar', view: 'auto', x: 1 }, phone: { place: 'pip', view: 'huge', pose: 'nap' } },
    [k.presence]: { v: 2, mode: 'always', when: { from: '22:00' } },
    [k.scene]: { v: 2, day: '2026-10-01', by: 'old', cat: 'jump', x: [1] },
    'site:answers': ['42'],
  };
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, storageHooks);
  try {
    await fresh(page, base);
    await seed(page, seeds);
    await mount(page, 'keep');
    await page.clock.runFor(3000);
    const cat = await json(page, k.cat);
    check(`${label}: подключение — первое включение и приветствие дописали seenStage и greetDay, неизвестное, accessory 'crown' и v 3 в cat на месте`, same(cat, { ...seeds[k.cat], seenStage: 0, greetDay: DAY }), JSON.stringify(cat));
    const rest = [k.companion, k.look, k.treat, k.place, k.presence, k.scene];
    check(`${label}: подключение не переписывает companion, look, treat, place, presence, scene`, same(await rawAll(page, rest), rest.map((key) => text(seeds[key]))));
    const shown = await dock(page);
    check(`${label}: неизвестный вид и облик показаны безопасно — кот в облике по умолчанию`, shown.kind === 'cat' && shown.coat === 'smoke', JSON.stringify(shown));

    // Лакомство: занятие сегодня есть — «Покормить»; второе кормление недоступно.
    await openCorner(page);
    await page.evaluate(() => window.stand.set(3, 1));
    await page.clock.runFor(500);
    await page.locator('[data-cat-feed]').click();
    const treat = await json(page, k.treat);
    check(`${label}: кормление — fedDay сегодня, streak и v 2 на месте; повторно «Покормить» нет`, same(treat, { ...seeds[k.treat], fedDay: DAY }) && (await page.locator('[data-cat-feed]').count()) === 0, JSON.stringify(treat));

    // Имя кота, аксессуар (ступень «Освоился» открыта, seenStage отмечен неявно), движение.
    await page.locator('input[name="cat-name"]').fill('Дымок');
    await page.locator('.cat-acc-option:has(input[value="plaid"])').click();
    const companionBefore = await raw(page, k.companion);
    await openSettings(page);
    await page.locator('label:has(> input[name="cat-motion"][value="calm"])').click();
    const named = await json(page, k.cat);
    check(`${label}: имя, аксессуар и движение кота — только эти поля; неизвестное и v 3 на месте`, same(named, { ...seeds[k.cat], seenStage: 1, greetDay: DAY, name: 'Дымок', accessory: 'plaid', motion: 'calm' }), JSON.stringify(named));
    check(`${label}: движение — общее поле cat, companion не тронут`, (await raw(page, k.companion)) === companionBefore);

    // Вид компьютера: только desktop.view.
    await page.locator('label:has(> input[name="cat-view"][value="full"])').click();
    const place = await json(page, k.place);
    check(`${label}: вид — только desktop.view; desktop.place, x, phone с непонятными значениями, theme и v 2 на месте`, same(place, { ...seeds[k.place], desktop: { ...seeds[k.place].desktop, view: 'full' } }), JSON.stringify(place));

    // Присутствие: только mode, остальные ключи не меняются.
    const others = [k.cat, k.companion, k.look, k.treat, k.place, k.scene];
    const before = await rawAll(page, others);
    await page.locator('.cat-presence .cat-place-option:has(input[value="on-call"])').click();
    const presence = await json(page, k.presence);
    check(`${label}: присутствие — только mode; when и v 2 на месте; другие ключи не тронуты`, same(presence, { ...seeds[k.presence], mode: 'on-call' }) && same(await rawAll(page, others), before), JSON.stringify(presence));
    await page.locator('.cat-presence .cat-place-option:has(input[value="always"])').click();

    // Явный выбор собаки: kind меняется, данные собаки, третьего животного и неизвестное — на месте.
    await page.locator('.cat-kind-option:has(input[value="dog"])').click();
    await page.clock.runFor(100);
    const chosen = await json(page, k.companion);
    check(`${label}: явный выбор собаки — kind 'dog', dog, pets третьего животного, extra и v 2 на месте`, same(chosen, { ...seeds[k.companion], kind: 'dog' }), JSON.stringify(chosen));
    // Облик собаки: непонятный облик кота и облики неизвестных животных — на месте.
    await page.locator('.cat-coat-option:has(input[value="spotted"])').click();
    const look = await json(page, k.look);
    check(`${label}: облик собаки — только dog; непонятный облик кота 'calico', bunny, more и v 2 на месте`, same(look, { ...seeds[k.look], dog: 'spotted' }), JSON.stringify(look));
    // Имя собаки: аксессуар собаки (непонятный) и её вложенные поля — на месте; имя кота — своё.
    await page.locator('input[name="cat-name"]').fill('Барклий');
    const dog = await json(page, k.companion);
    check(`${label}: имя собаки — только dog.name; dog.accessory 'crown', bow, pets на месте; имя кота в cat прежнее`, same(dog, { ...seeds[k.companion], kind: 'dog', dog: { ...seeds[k.companion].dog, name: 'Барклий' } }) && (await json(page, k.cat)).name === 'Дымок', JSON.stringify(dog));

    // Симметрично: другая (более новая) вкладка записала непонятный облик собаки; меняем облик кота.
    await seed(page, { [k.look]: { ...look, dog: 'merle' } });
    await page.locator('.cat-kind-option:has(input[value="cat"])').click();
    await page.clock.runFor(100);
    await page.locator('.cat-coat-option:has(input[value="ginger"])').click();
    const symmetric = await json(page, k.look);
    check(`${label}: облик кота — только cat; непонятный облик собаки 'merle' на месте (запись по свежему значению)`, same(symmetric, { ...seeds[k.look], cat: 'ginger', dog: 'merle' }), JSON.stringify(symmetric));
    await page.keyboard.press('Escape');
    await page.clock.runFor(3000);

    // Перезагрузка: подключение ничего не пишет, показ — сохранённое; неизвестное и данные сайта на месте.
    const all = keysOf('keep');
    const saved = await rawAll(page, [...all, 'site:answers']);
    await fresh(page, base);
    await mount(page, 'keep');
    await page.clock.runFor(3000);
    const again = await dock(page);
    check(`${label}: после перезагрузки — ничего не записано, кот Дымок в облике «Рыжий»`, (await writes(page, '^keep:')) === 0 && same(await rawAll(page, [...all, 'site:answers']), saved) && again.name === 'Дымок' && again.coat === 'ginger', JSON.stringify(again));
    check(`${label}: ключ сайта не тронут, чужих ключей нет`, (await raw(page, 'site:answers')) === '["42"]' && (await page.evaluate(() => window.qaRaw.keys())).every((key) => key.startsWith('keep:') || key === 'site:answers'));
    errorsOk(check, label, [page]);
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// D: точки комнаты с полями, неизвестные предметы и животные; сохранение, возврат домой, отмена и Esc.
async function room(browser, base, check, open) {
  const label = 'хранение: комната';
  const k = storageKeys('room');
  const seeds = {
    [k.cat]: { v: 1, seenStage: 0, greetDay: DAY },
    [k.room]: {
      v: 2,
      theme: 'night',
      cat: { rest: { x: 150, y: 210, tilt: 3 }, bowl: { x: 'край', y: 230, mark: 'b' }, yarn: { x: 60, y: 230, glow: { on: true } }, sofa: { x: 1, y: 2 } },
      dog: { rope: { x: 330, y: 240 }, ball: { x: 300, y: 235, z: 1 } },
      'example.bunny': { carrot: { x: 5, y: 6 } },
    },
  };
  const was = seeds[k.room];
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, storageHooks);
  const editor = async () => {
    await openCorner(page);
    await page.locator('[data-cat-room]').click();
  };
  try {
    await fresh(page, base);
    await seed(page, seeds);
    await mount(page, 'room');
    await page.clock.runFor(1500);
    await editor();
    await page.locator('[data-room-pick="yarn"]').click();
    await page.locator('[data-room-move="right"]').click();
    await page.locator('[data-room-save]').click();
    const saved = await json(page, k.room);
    const yarn = saved.cat?.yarn ?? {};
    check(`${label}: передвинули клубок — у точки новые x, y и прежнее поле glow`, yarn.x > 60 && yarn.y === 230 && same(yarn.glow, { on: true }), JSON.stringify(yarn));
    check(`${label}: остальное как было — подушка с tilt, непонятная миска, неизвестный предмет, собака с закрытым мячиком, третье животное, theme, v 2`, same({ ...saved, cat: { ...saved.cat, yarn: was.cat.yarn } }, was), JSON.stringify(saved));
    await page.keyboard.press('Escape');

    // Перезагрузка: чтение ничего не пишет.
    await fresh(page, base);
    await mount(page, 'room');
    await page.clock.runFor(1500);
    check(`${label}: после перезагрузки расстановка не переписана`, (await writes(page, '^room:room')) === 0 && same(await json(page, k.room), saved));

    // «Отмена» и Esc ничего не пишут.
    await editor();
    await page.locator('[data-room-pick="rest"]').click();
    await page.locator('[data-room-move="left"]').click();
    await page.locator('[data-room-cancel]').click();
    await page.locator('[data-cat-room]').click();
    await page.locator('[data-room-pick="rest"]').click();
    await page.locator('[data-room-move="left"]').click();
    await page.keyboard.press('Escape');
    check(`${label}: «Отмена» и Esc — записи нет`, (await writes(page, '^room:room')) === 0 && same(await json(page, k.room), saved) && (await page.evaluate(() => document.getElementById('cat-sheet')?.open)));

    // «Вернуть обычную расстановку» и «Сохранить»: у точек сняты только координаты; непонятная миска не тронута.
    await page.locator('[data-cat-room]').click();
    await page.locator('[data-room-reset]').click();
    await page.locator('[data-room-save]').click();
    const reset = await json(page, k.room);
    check(`${label}: обычная расстановка — подушка { tilt }, клубок { glow }: поля точек на месте, координаты сняты`, same(reset.cat.rest, { tilt: 3 }) && same(reset.cat.yarn, { glow: { on: true } }), JSON.stringify(reset.cat));
    check(`${label}: обычная расстановка — непонятная миска, sofa, собака, третье животное, theme и v 2 не тронуты`, same(reset.cat.bowl, was.cat.bowl) && same(reset.cat.sofa, was.cat.sofa) && same(reset.dog, was.dog) && same(reset['example.bunny'], was['example.bunny']) && reset.theme === 'night' && reset.v === 2, JSON.stringify(reset));
    errorsOk(check, label, [page]);
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// F: день сценки в IndexedDB и копия scene:v1 — неизвестное на месте, повреждённое не заменяется; отключение; две вкладки.
async function scenes(browser, base, check, open) {
  const label = 'хранение: сценка';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, storageHooks);
  // Занятие, дающее знак (ступень уже увидена), и время на радость и начало сценки.
  const practice = async (target, key) => {
    await target.evaluate((entry) => {
      Math.random = () => 0;
      window.stand.set(4, 1);
      window.stand.set(5, 2);
      window.stand.pet.notify('saved', { key: entry, counted: true });
    }, key);
    await target.clock.runFor(1700);
  };
  const start = async (ns, entries) => {
    await fresh(page, base);
    await seed(page, { [storageKeys(ns).cat]: { v: 1, seenStage: 1, greetDay: DAY }, ...entries });
    await mount(page, ns);
  };
  try {
    // Кот: неизвестное в записи базы и копии, больший v.
    let k = storageKeys('sa');
    await fresh(page, base);
    await idbPut(page, k.db, { v: 3, day: '2026-10-01', by: 'old', cat: 'jump', mood: { calm: [1] } });
    await start('sa', { [k.scene]: { v: 2, day: '2026-10-01', by: 'old', cat: 'jump', x: [1] } });
    await practice(page, 'sa-1');
    await page.waitForFunction(() => Boolean(document.querySelector('#cat-dock .cat-art')?.dataset.scene));
    let shown = await idbGet(page, k.db);
    let copy = await json(page, k.scene);
    check(`${label}: кот — запись базы: день, метка и вариант; mood и v 3 на месте`, same({ ...shown, by: '' }, { v: 3, day: DAY, by: '', cat: 'stretch', mood: { calm: [1] } }) && shown.by !== 'old', JSON.stringify(shown));
    check(`${label}: кот — копия scene:v1: день, метка и вариант; x и v 2 на месте`, same(copy, { v: 2, day: DAY, by: shown.by, cat: 'stretch', x: [1] }), JSON.stringify(copy));
    await page.clock.runFor(6000);

    // Собака: непонятный вариант кота в базе и копии не нормализуется.
    k = storageKeys('sb');
    await fresh(page, base);
    await idbPut(page, k.db, { v: 1, day: '2026-10-01', by: 'old', cat: 'jump' });
    await start('sb', { [k.companion]: { v: 1, kind: 'dog' }, [k.scene]: { v: 1, day: '2026-10-01', by: 'old', cat: 'jump' } });
    await practice(page, 'sb-1');
    await page.waitForFunction(() => document.querySelector('#cat-dock .cat-art')?.dataset.scene === 'fetch');
    shown = await idbGet(page, k.db);
    copy = await json(page, k.scene);
    check(`${label}: собака — вариант кота 'jump' в базе и копии на месте, день записан`, shown.cat === 'jump' && copy.cat === 'jump' && shown.day === DAY && copy.day === DAY, JSON.stringify({ shown, copy }));
    await page.clock.runFor(6000);

    // Повреждённая запись дня в базе — не свободный день: сценки нет, запись и копия не тронуты.
    k = storageKeys('sc');
    await fresh(page, base);
    await idbPut(page, k.db, 'испорчено');
    await start('sc', {});
    await practice(page, 'sc-1');
    shown = await idbGet(page, k.db);
    check(`${label}: повреждённая запись дня — сценки нет, запись базы прежняя, копии нет`, shown === 'испорчено' && (await dock(page)).scene === '' && (await raw(page, k.scene)) === null, JSON.stringify(shown));
    await page.clock.runFor(6000);

    // Повреждённая копия scene:v1 — день решает база; неявная запись копию не заменяет.
    k = storageKeys('sd');
    await start('sd', { [k.scene]: '{' });
    await practice(page, 'sd-1');
    await page.waitForFunction(() => Boolean(document.querySelector('#cat-dock .cat-art')?.dataset.scene));
    shown = await idbGet(page, k.db);
    check(`${label}: повреждённая копия — сценка по базе, копия байт в байт прежняя`, shown.day === DAY && (await raw(page, k.scene)) === '{', JSON.stringify(shown));
    await page.clock.runFor(6000);

    // Отключение до решения: ни записи дня, ни копии.
    k = storageKeys('se');
    await start('se', {});
    await page.evaluate(() => {
      Math.random = () => 0;
      window.stand.set(4, 1);
      window.stand.set(5, 2);
      window.stand.pet.notify('saved', { key: 'se-1', counted: true });
    });
    await page.clock.runFor(500);
    await page.evaluate(() => window.stand.pet.destroy());
    await page.clock.runFor(3000);
    check(`${label}: отключение до решения — дня в базе и копии нет`, (await idbGet(page, k.db)) === '<нет>' && (await raw(page, k.scene)) === null);

    // Две вкладки одного пространства: сценка одна за день.
    k = storageKeys('sf');
    await start('sf', {});
    const other = await tab(context, base);
    await mount(other, 'sf');
    await practice(page, 'sf-a');
    await page.waitForFunction(() => Boolean(document.querySelector('#cat-dock .cat-art')?.dataset.scene));
    const first = await idbGet(page, k.db);
    await practice(other, 'sf-b');
    await idbGet(other, k.db);
    check(`${label}: две вкладки — вторая сценку не показывает, запись дня первой не тронута`, (await dock(other)).scene === '' && same(await idbGet(other, k.db), first), JSON.stringify(first));
    errorsOk(check, label, [page, other], [corrupt(storageKeys('sd').scene)]);
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// G: нет ключа, повреждено, отказ чтения при загрузке и перед записью, запрет доступа, отказ записи и переполнение.
async function cases(browser, base, check, open) {
  const label = 'хранение: четыре случая';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, storageHooks);
  const expected = [];
  try {
    // Ключа нет: умолчания, запись разрешена (первое включение и приветствие).
    await fresh(page, base);
    await mount(page, 'gm');
    await page.clock.runFor(3000);
    check(`${label}: ключа нет — приветствие и первое включение записаны`, same(await json(page, storageKeys('gm').cat), { v: 1, seenStage: 0, greetDay: DAY }));

    // Повреждено ('', не JSON, массив, строка, число, JSON null — во всех ключах): неявное ничего не пишет.
    const bad = ['', '{', '[1]', '"текст"', '42', 'null'];
    for (const [i, value] of bad.entries()) {
      const ns = `gc${i}`;
      const all = keysOf(ns);
      await fresh(page, base);
      await seed(page, Object.fromEntries(all.map((key) => [key, value])));
      await mount(page, ns);
      await page.clock.runFor(1500);
      await page.evaluate(() => window.stand.set(3, 1));
      await page.evaluate((key) => window.stand.pet.notify('saved', { key, counted: true }), `${ns}-1`);
      await page.clock.runFor(3000);
      await openCorner(page);
      await page.evaluate(() => window.stand.pet.update());
      const told = await note(page, '[data-cat-store]');
      await page.keyboard.press('Escape');
      await page.clock.runFor(3000);
      expected.push(...all.map(corrupt));
      check(`${label}: повреждено ${JSON.stringify(value)} — подключение, приветствие, ступень после занятия и при открытии ничего не пишут, ключи байт в байт`, (await writes(page, `^${ns}:`)) === 0 && (await rawAll(page, all)).every((item) => item === value), told);
      check(`${label}: повреждено ${JSON.stringify(value)} — подсказка «повреждены», а не «сохранено»`, told.includes('повреждены'), told);
    }

    // Явная правка заменяет повреждённое значение только в своём ключе.
    const ns = 'gc5';
    const k = storageKeys(ns);
    await mount(page, ns);
    await page.clock.runFor(1500);
    await openCorner(page);
    await page.locator('input[name="cat-name"]').fill('Мурзик');
    const cat = await json(page, k.cat);
    const restKeys = keysOf(ns).filter((key) => key !== k.cat);
    check(`${label}: явное имя заменяет повреждённый cat (с неявными полями из памяти), остальные повреждённые — байт в байт`, same(cat, { v: 1, seenStage: 1, greetDay: DAY, name: 'Мурзик' }) && (await rawAll(page, restKeys)).every((item) => item === 'null'), JSON.stringify(cat));
    await page.locator('.cat-coat-option:has(input[value="ginger"])').click();
    check(`${label}: явный облик заменяет только look — { v: 1, cat: 'ginger' }`, same(await json(page, k.look), { v: 1, cat: 'ginger' }) && (await raw(page, k.companion)) === 'null' && (await raw(page, k.scene)) === 'null');
    await page.keyboard.press('Escape');
    await page.clock.runFor(3000);

    // Отказ чтения при загрузке: умолчания, ни одной записи; восстановление в той же сессии не делает загрузку удачной.
    const f = storageKeys('gf');
    await fresh(page, base);
    await seed(page, { [f.cat]: { v: 1, name: 'Барсик', seenStage: 0, greetDay: '2026-10-01' }, [f.look]: { v: 1, cat: 'tuxedo' } });
    const original = await rawAll(page, keysOf('gf'));
    await setQa(page, { denyGet: '^gf:' });
    await mount(page, 'gf');
    await page.clock.runFor(3000);
    expected.push(OFFLINE);
    const offline = await dock(page);
    await openCorner(page);
    const offlineNote = await note(page, '[data-cat-store]');
    await page.locator('input[name="cat-name"]').fill('Дымок');
    await page.locator('.cat-coat-option:has(input[value="ginger"])').click();
    const coatNote = await note(page, '[data-cat-coat-note]');
    await page.locator('.cat-presence .cat-place-option:has(input[value="on-call"])').click();
    await page.locator('.cat-presence .cat-place-option:has(input[value="always"])').click();
    await page.keyboard.press('Escape');
    await practice(page, 'gf-1');
    await setQa(page, { denyGet: '' });
    await openCorner(page);
    await page.locator('input[name="cat-name"]').fill('Пельмень');
    await page.keyboard.press('Escape');
    await page.clock.runFor(3000);
    check(`${label}: отказ чтения при загрузке — показ по умолчанию (Марс), подсказки «недоступно» и «не сохранился»`, offline.name === 'Марс' && offlineNote.includes('недоступно') && coatNote.includes('не сохранился'), JSON.stringify({ offline, offlineNote, coatNote }));
    check(`${label}: отказ чтения при загрузке — ни одного setItem (и после восстановления чтения в той же сессии), сценки нет, данные байт в байт`, (await writes(page, '^gf:')) === 0 && same(await rawAll(page, keysOf('gf')), original) && (await idbGet(page, f.db)) === '<нет>');
    await page.evaluate(() => window.stand.pet.destroy());
    await mount(page, 'gf');
    await page.clock.runFor(3000);
    check(`${label}: новое подключение после восстановления — настоящий оригинал (Барсик), облик «Чёрно-белый»`, same(await dock(page), { kind: 'cat', coat: 'tuxedo', name: 'Барсик', scene: '' }), JSON.stringify(await dock(page)));

    // Отказ свежего чтения перед записью: запись не делается, правка — в памяти; после восстановления уходит со следующей.
    const g = storageKeys('gr');
    await fresh(page, base);
    await seed(page, { [g.cat]: { v: 2, name: 'Барсик', seenStage: 0, greetDay: DAY, future: 1 } });
    await mount(page, 'gr');
    await page.clock.runFor(1500);
    await setQa(page, { denyGet: `^${g.cat}$` });
    await openCorner(page);
    await page.locator('input[name="cat-name"]').fill('Дымок');
    const readNote = await note(page, '[data-cat-store]');
    const blocked = await writes(page, `^${g.cat}$`);
    await setQa(page, { denyGet: '' });
    await openSettings(page);
    await page.locator('label:has(> input[name="cat-motion"][value="calm"])').click();
    check(`${label}: отказ чтения перед записью — setItem нет, подсказка «не получается», имя в памяти`, blocked === 0 && readNote.includes('не получается') && (await dock(page)).name === 'Дымок', readNote);
    check(`${label}: после восстановления следующая правка уносит и имя из памяти; future и v 2 на месте`, same(await json(page, g.cat), { v: 2, name: 'Дымок', seenStage: 0, greetDay: DAY, future: 1, motion: 'calm' }), await raw(page, g.cat));
    await page.keyboard.press('Escape');
    await page.clock.runFor(3000);

    // Доступ к localStorage бросает: подключение работает в памяти, без сбоев.
    await fresh(page, base);
    await setQa(page, { denyAll: true });
    await mount(page, 'gd');
    await page.clock.runFor(3000);
    await openCorner(page);
    await page.locator('input[name="cat-name"]').fill('Дымок');
    const denied = await dock(page);
    await page.keyboard.press('Escape');
    await setQa(page, { denyAll: false });
    check(`${label}: доступ к localStorage запрещён — питомец работает в памяти, ничего не записано`, denied.name === 'Дымок' && (await page.evaluate(() => window.qaRaw.keys())).every((key) => !key.startsWith('gd:')), JSON.stringify(denied));
    await page.clock.runFor(3000);

    // Отказ записи и переполнение: прочитанное не уничтожено, правки в памяти, подсказки честные; после — согласованно.
    const q = storageKeys('gq');
    await fresh(page, base);
    const stored = { [q.cat]: { v: 2, name: 'Барсик', seenStage: 0, greetDay: '2026-10-01', future: 1 }, [q.look]: { v: 1, cat: 'smoke', x: 1 }, [q.room]: { v: 1, cat: { yarn: { x: 60, y: 230, glow: 1 } } } };
    await seed(page, stored);
    await setQa(page, { denySet: '^gq:' });
    await mount(page, 'gq');
    await page.clock.runFor(3000);
    await openCorner(page);
    await page.evaluate(() => window.stand.set(3, 1));
    await page.clock.runFor(500);
    await page.locator('[data-cat-feed]').click();
    const treatNote = await note(page, '[data-cat-treat-note]');
    await page.locator('input[name="cat-name"]').fill('Дымок');
    const quotaNote = await note(page, '[data-cat-store]');
    await page.locator('.cat-coat-option:has(input[value="ginger"])').click();
    const quotaCoat = await note(page, '[data-cat-coat-note]');
    await page.locator('[data-cat-room]').click();
    await page.locator('[data-room-pick="yarn"]').click();
    await page.locator('[data-room-move="right"]').click();
    await page.locator('[data-room-save]').click();
    const roomError = await page.evaluate(() => !document.querySelector('[data-room-error]')?.hidden);
    await page.locator('[data-room-cancel]').click();
    check(`${label}: переполнение — подсказки «не сохранилась», «не получается», «не сохранился», ошибка расстановки`, treatNote.includes('не сохранилась') && quotaNote.includes('не получается') && quotaCoat.includes('не сохранился') && roomError, JSON.stringify({ treatNote, quotaNote, quotaCoat, roomError }));
    check(`${label}: переполнение — прочитанное байт в байт (setItem пытался, но не записал)`, (await writes(page, '^gq:')) > 0 && same(await rawAll(page, Object.keys(stored)), Object.values(stored).map(text)));
    await setQa(page, { denySet: '' });
    await openSettings(page);
    await page.locator('label:has(> input[name="cat-motion"][value="calm"])').click();
    check(`${label}: после переполнения следующая правка уносит память (имя, приветствие, ступень); future и v 2 на месте`, same(await json(page, q.cat), { v: 2, name: 'Дымок', seenStage: 1, greetDay: DAY, future: 1, motion: 'calm' }), await raw(page, q.cat));
    await page.keyboard.press('Escape');
    errorsOk(check, label, [page], expected);
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }

  async function practice(target, key) {
    await target.evaluate((entry) => {
      Math.random = () => 0;
      window.stand.set(4, 1);
      window.stand.set(5, 2);
      window.stand.pet.notify('saved', { key: entry, counted: true });
    }, key);
    await target.clock.runFor(3000);
  }
}

// H: две вкладки (по свежему чтению), пространства имён, смешанные версии с настоящей 0.1.4.
async function tabs(browser, base, check, open) {
  const label = 'хранение: вкладки и версии';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, storageHooks);
  try {
    const k = storageKeys('ht');
    const other = storageKeys('hu');
    await fresh(page, base);
    await seed(page, { [k.cat]: { v: 2, name: 'Марс', seenStage: 0, greetDay: DAY, future: { a: 1 } }, [other.cat]: { v: 1, name: 'Чужой' }, 'site:answers': ['42'] });
    const second = await tab(context, base);
    await mount(page, 'ht');
    await mount(second, 'ht');
    await page.clock.runFor(1500);
    // A меняет имя, затем B — движение: запись B по свежему значению сохраняет имя A.
    await openCorner(page);
    await page.locator('input[name="cat-name"]').fill('Барсик');
    await openCorner(second);
    await openSettings(second);
    await second.locator('label:has(> input[name="cat-motion"][value="none"])').click();
    check(`${label}: правки разных полей двумя вкладками — обе на месте, future и v 2 тоже`, same(await json(page, k.cat), { v: 2, name: 'Барсик', seenStage: 0, greetDay: DAY, future: { a: 1 }, motion: 'none' }), await raw(page, k.cat));
    // Конфликт одного поля — последняя запись.
    await openSettings(page);
    await page.locator('label:has(> input[name="cat-motion"][value="calm"])').click();
    check(`${label}: одно поле двумя вкладками — последняя запись`, (await json(page, k.cat)).motion === 'calm');
    check(`${label}: другое пространство имён и ключ сайта не тронуты`, same(await json(page, other.cat), { v: 1, name: 'Чужой' }) && (await raw(page, 'site:answers')) === '["42"]' && (await writes(page, '^hu:')) + (await writes(second, '^hu:')) === 0);
    await page.keyboard.press('Escape');
    await second.keyboard.press('Escape');
    await second.close();

    // Смешанные версии: вкладка настоящей 0.1.4 (фикстура) и текущая на одном хранилище.
    const m = storageKeys('mix');
    await fresh(page, base);
    await seed(page, { [m.cat]: { v: 3, name: 'Марс', seenStage: 0, greetDay: DAY, future: { a: 1 } }, [m.look]: { v: 2, cat: 'smoke', dog: 'merle' } });
    const old = await tab(context, base);
    await mount(old, 'mix', '/old14/pet.mjs');
    check(`${label}: на старой вкладке работает 0.1.4 из фикстуры`, (await old.evaluate(() => window.stand.pet.version)) === '0.1.4');
    await old.clock.runFor(1500);
    await openCorner(old);
    await old.locator('input[name="cat-name"]').fill('Барсик');
    const lost = await json(page, m.cat);
    check(`${label}: предел — запись прежней 0.1.4 отбрасывает неизвестное cat и понижает v (новая версия её не исправляет)`, lost.name === 'Барсик' && !('future' in lost) && lost.v === 1, JSON.stringify(lost));
    await old.locator('.cat-coat-option:has(input[value="ginger"])').click();
    const oldLook = await json(page, m.look);
    check(`${label}: предел — облик кота из 0.1.4 заменяет непонятный облик собаки умолчанием`, same(oldLook, { v: 1, cat: 'ginger', dog: 'caramel' }), JSON.stringify(oldLook));
    await old.keyboard.press('Escape');
    // Текущая после записи прежней: сохраняет то, что осталось; новые данные от неё — тоже.
    await mount(page, 'mix');
    await page.clock.runFor(1500);
    await seed(page, { [m.cat]: { ...lost, future: { b: 2 } } });
    await openCorner(page);
    await openSettings(page);
    await page.locator('label:has(> input[name="cat-motion"][value="calm"])').click();
    const kept = await json(page, m.cat);
    check(`${label}: текущая после прежней — имя от 0.1.4 и новые неизвестные поля на месте`, same(kept, { ...lost, future: { b: 2 }, motion: 'calm' }), JSON.stringify(kept));
    await page.keyboard.press('Escape');
    errorsOk(check, label, [page, old]);
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

export async function storageQa(browser, base, check, open) {
  await keep(browser, base, check, open);
  await room(browser, base, check, open);
  await scenes(browser, base, check, open);
  await cases(browser, base, check, open);
  await tabs(browser, base, check, open);
}
