// Комната и игра на ядре (PL04.3) в Chrome: настоящий mountPet на стенде, часы — page.clock (таймеры модуля и ядра, кадры),
// случайность — подмена Math.random, объявления — журнал области aria-live (window.qaTold), запись — журнал setItem со
// стеком и управляемый отказ (window.qaDeny). Компьютер 1280×900 (мышь, клавиатура), телефон 390×844 (палец — CDP
// Input.dispatchTouchEvent), узкий 320×740 и боком 844×390; кот и собака. Долгое поглаживание: глаза не открываются между
// откликами, у собаки движения заново (data-again), одно объявление, итог не сдвигает питомца под пальцем, отпустили —
// покой и подсказка; уход с питомца, второй палец, blur, resize и фон; лапа — короткое касание, удержание и сдвиг —
// ничего; миска — перенос и возврат, ближе — принюхивается, не кормит; мячик — касание не катит, бросок докатывается в
// пределах пола и края. Редактор: кнопки, стрелки, «Вернуть обычную», перенос мышью и пальцем, Esc при переносе — только
// перенос (черновик цел), ещё Esc — отмена редактора, «Сохранить» при переносе — перенос не дописан, новая ступень при
// переносе, две вкладки (чужая расстановка и свои предметы), неизвестные данные после записи и повторного подключения,
// отказ записи с честным сообщением. Кормление у переставленной миски у левого и правого края — питомец целиком в сцене.
// Жест снят ядром (питомец, облик и «скрыт» из другой вкладки, Esc, destroy) — захват, слушатели и кадры сняты. Каждая
// запись ключей — через веб-адаптер координатора. Тот же логический сценарий в Node — один итог. Без горизонтальной
// прокрутки, ошибок страницы и внешних запросов; чужой ключ сайта не тронут. Запуск — в составе npm run test:browser.
import { DAY as NODE_DAY, host, LEGACY_DISPLAY, life } from './core-kit.mjs';

const DAY = '2026-10-11';
const FOREIGN = '{"keep":1}';
const HINT = 'Проведи по питомцу, чтобы погладить';

// Только QA: чужой ключ сайта; журнал объявлений (#cat-live); журнал setItem со стеком и отказ записи по ключу.
function init() {
  if (!localStorage.getItem('site:other')) localStorage.setItem('site:other', '{"keep":1}');
  window.qaTold = [];
  window.qaDeny = null;
  window.qaSets = [];
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function setItem(key, value) {
    if (!window.qaSeeding) window.qaSets.push({ key: String(key), adapter: (new Error().stack ?? '').includes('/pet/web/storage.mjs') });
    if (window.qaDeny?.test(String(key))) throw new Error('QuotaExceededError (проверка)');
    return set.call(this, key, value);
  };
  new MutationObserver((list) => {
    for (const item of list) {
      const box = item.target.nodeType === 1 ? item.target : item.target.parentElement;
      if (box?.id === 'cat-live' && box.textContent) window.qaTold.push(box.textContent);
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  // Последнее событие указателя, дошедшее до страницы (на document — слушатели window считает windowListeners).
  window.qaPointer = { n: 0, type: '', x: 0, y: 0 };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
    document.addEventListener(type, (event) => Object.assign(window.qaPointer, { n: window.qaPointer.n + 1, type, x: event.clientX, y: event.clientY }), true);
  // Сдвиги пальца, дошедшие до документа (после слушателей модуля): сколько не отменено.
  window.qaMoves = { n: 0, free: 0 };
  document.addEventListener('touchmove', (event) => Object.assign(window.qaMoves, { n: window.qaMoves.n + 1, free: window.qaMoves.free + (event.defaultPrevented ? 0 : 1) }), { passive: true });
}

// Инерция браузера (fling) в трассе Chrome: начатые FlingController с начала трассы; трасса остановлена.
async function flings(browser) {
  const trace = JSON.parse(String(await browser.stopTracing()));
  return (trace.traceEvents ?? trace).filter((event) => event.name === 'FlingController::HandlingGestureFling' && ['b', 'B'].includes(event.ph)).length;
}

// Проба трассы без модуля: быстрый свайп пальцем по прокручиваемой полосе — браузер докручивает её инерцией, и трасса это
// видит. Без пробы «инерции нет» в сценарии телефона ничего бы не доказывало (другая версия Chrome, другие имена событий).
async function flingProbe(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  let tracing = false;
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><div id="strip" style="height:300px;overflow-y:scroll"><div style="height:6000px"></div></div>');
    await page.evaluate(() => document.getElementById('strip').addEventListener('scrollend', () => (window.qaScrollEnd = true)));
    await browser.startTracing(page, { categories: ['input'] });
    tracing = true;
    // Скорость броска — отметками времени событий (через 16 мс), а не временем их обработки: под нагрузкой отпускание
    // приходило позже, браузер считал палец остановившимся, и инерции не было.
    const t0 = Date.now() / 1000;
    for (const [type, y, ms] of [['touchStart', 250, 0], ['touchMove', 230, 16], ['touchMove', 150, 32], ['touchEnd', 0, 48]]) await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: y ? [{ x: 200, y, id: 1 }] : [], timestamp: t0 + ms / 1000 });
    // Прокрутка кончилась (после инерции — когда та докрутила) — её начало уже в трассе.
    await page.waitForFunction(() => window.qaScrollEnd === true);
    tracing = false;
    return await flings(browser);
  } finally {
    if (tracing) await browser.stopTracing().catch(() => {});
    await context.close();
  }
}

// Ввод доходит до страницы по её кадрам, а не по page.clock: после отправки ждём, что событие указателя дошло (номер вырос;
// для движения — в этой точке), и только потом двигаем часы и мерим.
async function sent(page, send, at = null) {
  const n = await page.evaluate(() => window.qaPointer.n);
  await send();
  await page.waitForFunction(([k, p]) => window.qaPointer.n > k && (!p || (Math.abs(window.qaPointer.x - p[0]) < 1 && Math.abs(window.qaPointer.y - p[1]) < 1)), [n, at], { timeout: 3000 });
}

function watchNetwork(page, base) {
  const outside = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:')) outside.push(url);
  });
  return outside;
}

const told = (page) => page.evaluate(() => [...window.qaTold]);
const stored = (page, key) => page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? 'null'), key);
const raw = (page, key) => page.evaluate((name) => localStorage.getItem(name), key);
const pose = (page, selector = '.cat-play .cat-art') => page.evaluate((s) => document.querySelector(s)?.dataset.pose ?? '', selector);
const hint = (page) => page.evaluate(() => document.querySelector('[data-cat-play-hint]')?.textContent ?? '');
const rect = (page, selector) => page.evaluate((s) => document.querySelector(s)?.getBoundingClientRect().toJSON() ?? null, selector);
const center = (r) => [r.x + r.width / 2, r.y + r.height / 2];
const view = (page) => page.evaluate(() => document.getElementById('cat-sheet')?.dataset.view ?? '');
const finishOpen = (page) => page.evaluate(() => Promise.all(document.querySelector('.cat-sheet').getAnimations().map((animation) => animation.finished)));

// Подключить на стенде: ключи пространства ns (синтетические), счёт сайта, Math.random задан.
async function mount(page, ns, { marks = 1, today = 1, keys = {}, random = 0.5 } = {}) {
  await page.evaluate(
    ([space, values, m, t, r]) => {
      Math.random = () => r;
      window.qaSeeding = true;
      for (const [key, value] of Object.entries(values)) localStorage.setItem(`${space}:${key}:v1`, JSON.stringify(value));
      window.qaSeeding = false;
      window.stand.mount({ storage: space });
      window.stand.set(m, t);
      window.qaTold.length = 0;
    },
    [ns, { cat: { v: 1, seenStage: 0, greetDay: DAY }, ...keys }, marks, today, random],
  );
  await page.clock.runFor(100);
}
const destroy = (page) => page.evaluate(() => window.stand.pet?.destroy());

async function openPlay(page, opener = '#cat-dock .cat-dock-btn') {
  if (!(await page.evaluate(() => document.getElementById('cat-sheet')?.open))) {
    await page.locator(opener).click();
    await finishOpen(page);
  }
  await page.locator('[data-cat-play]').click();
  await page.clock.runFor(50);
}
async function openRoom(page, opener = '#cat-dock .cat-dock-btn') {
  if (!(await page.evaluate(() => document.getElementById('cat-sheet')?.open))) {
    await page.locator(opener).click();
    await finishOpen(page);
  }
  await page.locator('[data-cat-room]').click();
  await page.clock.runFor(50);
}
// Точка рисунка «Поиграть» (единицы 220×204) на экране.
async function petPoint(page, u, v) {
  const r = await rect(page, '[data-play-pet]');
  return [r.x + (r.width * u) / 220, r.y + (r.height * v) / 204];
}
// Слушатели жеста на window (CDP): pointermove и pointercancel общего указателя сцены (grab) — снимаются с концом жеста.
// (pointerup и pointerdown после прерванного жеста — прежнее поглощение нажатия, pet-move.mjs, до следующего нажатия.)
async function windowListeners(cdp) {
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'window' });
  return (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.filter((item) => item.type === 'pointermove' || item.type === 'pointercancel').length;
}

// Долгое поглаживание мышью по голове: пороги 0,2 / 0,6 / 1,1 / 1,7 / 3,2 с (§ 6.8), отпустили в 5 с. Позы — после каждого
// шага и в концах реакций; итог; рамка питомца до и после итога.
async function longStroke(page, { touch = null } = {}) {
  const [x0, y0] = await petPoint(page, 100, 66);
  const poses = [];
  const again = [];
  const before = await rect(page, '[data-play-pet]');
  const sample = async () => {
    poses.push(await pose(page));
    again.push(await page.evaluate(() => document.querySelector('.cat-play .cat-art')?.hasAttribute('data-again') ?? false));
  };
  const down = async () => (touch ? touch('touchStart', x0, y0) : (await page.mouse.move(x0, y0), sent(page, () => page.mouse.down())));
  const move = async (x) => (touch ? touch('touchMove', x, y0) : sent(page, () => page.mouse.move(x, y0, { steps: 2 }), [x, y0]));
  const up = async () => (touch ? touch('touchEnd') : sent(page, () => page.mouse.up()));
  await down();
  let at = 0;
  let side = 1;
  for (const t of [200, 600, 1100, 1700, 3200]) {
    await page.clock.runFor(t - at);
    at = t;
    await move(x0 + side * 30);
    side = -side;
    // Итог показан (после первого отклика): ячейка подсказки зарезервирована — питомец под пальцем не сдвинулся.
    await sample();
    if (t === 1100) {
      await page.clock.runFor(1500 - at);
      at = 1500;
      await sample();
    }
  }
  await page.clock.runFor(4500 - at);
  await sample();
  const held = { hint: await hint(page), pet: await rect(page, '[data-play-pet]') };
  await page.clock.runFor(500);
  await up();
  await page.clock.runFor(100);
  return { poses, again, held, before, after: { pose: await pose(page), hint: await hint(page) } };
}

export async function playQa(browser, base, check, open, layout) {
  const chrome = await desktop(browser, base, check, open, layout);
  await phone(browser, base, check, open, layout);
  await narrow(browser, base, check, open, layout, { width: 320, height: 740 }, 'игра и комната 320×740', 'cat');
  await narrow(browser, base, check, open, layout, { width: 844, height: 390 }, 'игра и комната боком 844×390', 'dog');
  same(check, chrome);
}

async function desktop(browser, base, check, open, layout) {
  const label = 'игра и комната 1280×900';
  const { context, page, cdp } = await open(browser, { viewport: { width: 1280, height: 900 } }, init);
  const outside = watchNetwork(page, base);
  const chrome = {};
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    const baseline = await windowListeners(cdp);

    // ---- Долгое поглаживание мышью (§ 6.8) ----
    await mount(page, 'ga');
    await openPlay(page);
    const stroke = await longStroke(page);
    const strokeTold = (await told(page)).filter((text) => text.startsWith('Марс'));
    check(`${label}: долгое поглаживание мышью — поза «pet» на всех порогах и между откликами (глаза не открываются)`, stroke.poses.every((p) => p === 'pet'), JSON.stringify(stroke.poses));
    check(`${label}: итог «мурлычет» держится, пока гладят; питомец под указателем не сдвинулся`, stroke.held.hint === 'Марс мурлычет.' && Math.abs(stroke.held.pet.y - stroke.before.y) < 0.5 && Math.abs(stroke.held.pet.x - stroke.before.x) < 0.5, JSON.stringify(stroke.held));
    check(`${label}: одно объявление на жест; отпустили — покой и подсказка`, JSON.stringify(strokeTold) === JSON.stringify(['Марс мурлычет.']) && stroke.after.pose === 'calm' && stroke.after.hint === HINT, JSON.stringify({ strokeTold, after: stroke.after }));
    chrome.stroke = { told: strokeTold, pose: stroke.after.pose, hint: stroke.after.hint };
    check(`${label}: после жеста захват и слушатели окна сняты`, (await windowListeners(cdp)) === baseline, `${await windowListeners(cdp)} vs ${baseline}`);
    // Лимит: следующая кнопка — «пока хватит» (отброшенные пороги в лимит не вошли).
    await page.locator('[data-cat-play-pet]').click();
    await page.clock.runFor(100);
    check(`${label}: «Погладить» после трёх откликов — «пока хватит»`, (await hint(page)) === 'Марс: пока хватит.', await hint(page));
    await page.clock.runFor(2000);

    // ---- Уход с питомца и отмена: отклик доигрывает, затем покой ----
    await page.clock.runFor(60_000);
    const [hx, hy] = await petPoint(page, 100, 66);
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.clock.runFor(200);
    await page.mouse.move(hx + 30, hy, { steps: 2 });
    await page.mouse.move(hx + 30, hy - 300, { steps: 2 });
    const left = { pose: await pose(page), stroking: await page.evaluate(() => document.querySelector('[data-play-pet]').hasAttribute('data-stroking')) };
    await page.mouse.up();
    await page.clock.runFor(1500);
    check(`${label}: ушёл с питомца — жест снят, отклик доигрывает, затем покой`, left.pose === 'pet' && !left.stroking && (await pose(page)) === 'calm' && (await hint(page)) === HINT, JSON.stringify(left));

    // ---- Лапа: короткое касание; удержание и сдвиг — ничего ----
    await page.clock.runFor(60_000);
    const [px, py] = await petPoint(page, 90, 176);
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.clock.runFor(100);
    await page.mouse.up();
    await page.clock.runFor(100);
    const paw = await hint(page);
    await page.clock.runFor(2000);
    await page.mouse.down();
    await page.clock.runFor(700);
    await page.mouse.up();
    await page.mouse.down();
    await page.mouse.move(px + 30, py - 40, { steps: 3 });
    await page.mouse.up();
    await page.clock.runFor(100);
    check(`${label}: лапа — короткое касание «касается твоей руки лапой»; удержание и сдвиг — без ложной лапы`, paw === 'Марс касается твоей руки лапой.' && (await told(page)).filter((text) => text.includes('лапой')).length === 1, JSON.stringify(await told(page)));

    // ---- Миска: перенос мышью, недостаточный сдвиг — на месте; ближе — принюхивается; не кормит; «Вернуть миску» ----
    await page.clock.runFor(60_000);
    const bowl0 = center(await rect(page, '[data-play-toy="bowl"]'));
    await page.mouse.move(...bowl0);
    await page.mouse.down();
    await page.mouse.move(bowl0[0] + 4, bowl0[1]);
    await page.mouse.up();
    const still = center(await rect(page, '[data-play-toy="bowl"]'));
    await page.mouse.move(...bowl0);
    await page.mouse.down();
    await page.mouse.move(bowl0[0] + 40, bowl0[1], { steps: 4 });
    await page.mouse.move(bowl0[0] + 90, bowl0[1], { steps: 4 });
    const under = center(await rect(page, '[data-play-toy="bowl"]'));
    await page.mouse.up();
    await page.clock.runFor(100);
    const bowlHint = await hint(page);
    const label1 = await page.locator('[data-cat-play-bowl]').textContent();
    check(`${label}: миска — сдвиг меньше порога на месте; перенос без скачка под указателем; ближе — «принюхивается»`, Math.abs(still[0] - bowl0[0]) < 1 && Math.abs(under[0] - (bowl0[0] + 90)) < 1.5 && bowlHint === 'Марс принюхивается к миске.' && label1 === 'Вернуть миску', JSON.stringify({ bowl0, still, under, bowlHint, label1 }));
    check(`${label}: миска не кормит — лакомство не отмечено`, (await raw(page, 'ga:treat:v1')) === null);
    await page.locator('[data-cat-play-bowl]').click();
    await page.clock.runFor(1000);
    const back = center(await rect(page, '[data-play-toy="bowl"]'));
    check(`${label}: «Вернуть миску» — на исходном месте`, Math.abs(back[0] - bowl0[0]) < 1 && Math.abs(back[1] - bowl0[1]) < 1 && (await page.locator('[data-cat-play-bowl]').textContent()) === 'Подвинуть миску', JSON.stringify({ back, bowl0 }));

    // ---- Мячик: касание не катит; бросок влево докатывается в пределах сцены; у края вправо — не катание ----
    await page.clock.runFor(2000);
    const ball0 = center(await rect(page, '[data-play-toy="ball"]'));
    await page.mouse.move(...ball0);
    await page.mouse.down();
    await page.mouse.up();
    await page.clock.runFor(1000);
    const tapped = center(await rect(page, '[data-play-toy="ball"]'));
    await page.mouse.move(...ball0);
    await page.mouse.down();
    await page.mouse.move(ball0[0] + 60, ball0[1], { steps: 4 });
    await page.mouse.up();
    await page.clock.runFor(1000);
    const edge = center(await rect(page, '[data-play-toy="ball"]'));
    await page.mouse.move(...ball0);
    await page.mouse.down();
    await page.mouse.move(ball0[0] - 60, ball0[1], { steps: 4 });
    await page.mouse.up();
    await page.clock.runFor(100);
    const ballHint = await hint(page);
    await page.clock.runFor(1400);
    const rolled = await rect(page, '[data-play-toy="ball"]');
    const stage = await rect(page, '[data-play-stage]');
    check(`${label}: мячик — касание не катит; у края вправо — не катание; бросок влево докатывается дальше точки отпускания и в пределах сцены`, Math.abs(tapped[0] - ball0[0]) < 1 && Math.abs(edge[0] - ball0[0]) < 1 && center(rolled)[0] < ball0[0] - 61 && rolled.x >= stage.x && ballHint === 'Марс следит за мячиком.', JSON.stringify({ ball0, tapped, edge, rolled: center(rolled), stage, ballHint }));
    await layout(page, `${label}, «Поиграть»`);

    // ---- Жест снят ядром: питомец и облик из другой вкладки, Esc, destroy — захват и слушатели сняты ----
    const other = await context.newPage();
    await other.goto(`${base}?manual`);
    const interrupted = [];
    for (const [name, act] of [
      ['другой питомец (другая вкладка)', () => other.evaluate(() => localStorage.setItem('ga:companion:v1', JSON.stringify({ v: 1, kind: localStorage.getItem('ga:companion:v1')?.includes('dog') ? 'cat' : 'dog' })))],
      ['облик (другая вкладка)', () => other.evaluate(() => localStorage.setItem('ga:look:v1', JSON.stringify({ v: 1, cat: 'ginger', dog: 'spotted' })))],
      ['Esc', () => page.keyboard.press('Escape')],
    ]) {
      if ((await view(page)) !== 'play') await openPlay(page);
      await page.clock.runFor(60_000);
      const [sx, sy] = await petPoint(page, 100, 66);
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await page.clock.runFor(200);
      await page.mouse.move(sx + 30, sy, { steps: 2 });
      await act();
      await page.clock.runFor(100);
      const state = { listeners: await windowListeners(cdp), stroking: await page.evaluate(() => Boolean(document.querySelector('[data-play-pet][data-stroking]'))), view: await view(page) };
      await page.mouse.up();
      interrupted.push([name, state]);
    }
    check(`${label}: жест снят ядром (питомец и облик другой вкладки, Esc) — захват и слушатели окна сняты`, interrupted.every(([, state]) => state.listeners === baseline && !state.stroking), JSON.stringify(interrupted));
    await other.close();
    await openPlay(page);
    const [dx, dy] = await petPoint(page, 100, 66);
    await page.mouse.move(dx, dy);
    await page.mouse.down();
    await page.mouse.move(dx + 30, dy, { steps: 2 });
    await destroy(page);
    await page.mouse.up();
    await page.clock.runFor(2000);
    check(`${label}: destroy во время жеста — захват, слушатели и кадры сняты, ошибок нет`, (await windowListeners(cdp)) === baseline && (await page.evaluate(() => document.querySelectorAll('[id^="cat-"]').length)) === 0 && page.qaErrors.length === 0, page.qaErrors.join(' | '));

    // ---- Редактор (§ 6.8): кнопки, перенос мышью, Esc при переносе — только перенос, «Сохранить» при переносе ----
    await mount(page, 'gb', { keys: { room: { v: 2, theme: 'night', cat: { yarn: { x: 60, y: 230, glow: 1 }, sofa: { x: 1, y: 2 } }, 'example.bunny': { carrot: { x: 5, y: 6 } } } } });
    await openRoom(page);
    await page.locator('[data-room-pick="yarn"]').click();
    await page.locator('[data-room-move="right"]').click();
    await page.clock.runFor(100);
    const stepTold = (await told(page)).at(-1);
    const bowlHit = center(await rect(page, '[data-room-hit="bowl"]'));
    await page.mouse.move(...bowlHit);
    await page.mouse.down();
    await page.mouse.move(bowlHit[0] + 60, bowlHit[1], { steps: 4 });
    const moving = await page.evaluate(() => document.querySelector('[data-room-stage]').hasAttribute('data-moving'));
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.clock.runFor(100);
    const afterEsc = { view: await view(page), state: await page.locator('[data-room-state]').textContent(), moving: await page.evaluate(() => document.querySelector('[data-room-stage]').hasAttribute('data-moving')), bowl: center(await rect(page, '[data-room-hit="bowl"]')) };
    check(`${label}: редактор — шаг кнопкой «Клубок правее.»; перенос мышью; Esc при переносе — только перенос: редактор открыт, клубок не сохранён, миска на месте`, stepTold === 'Клубок правее.' && moving && afterEsc.view === 'room' && afterEsc.state === 'Не сохранено: клубок' && !afterEsc.moving && Math.abs(afterEsc.bowl[0] - bowlHit[0]) < 1, JSON.stringify({ stepTold, moving, afterEsc }));
    // «Сохранить» при идущем переносе: перенос не дописан, записан только клубок; неизвестное — на месте.
    await page.mouse.move(...bowlHit);
    await page.mouse.down();
    await page.mouse.move(bowlHit[0] + 60, bowlHit[1], { steps: 4 });
    await page.evaluate(() => document.querySelector('[data-room-save]').click());
    await page.mouse.up();
    await page.clock.runFor(100);
    const room1 = await stored(page, 'gb:room:v1');
    const expected = { v: 2, theme: 'night', cat: { yarn: { glow: 1, x: 70, y: 230 }, sofa: { x: 1, y: 2 } }, 'example.bunny': { carrot: { x: 5, y: 6 } } };
    check(`${label}: «Сохранить» при переносе — записан только клубок; theme, v 2, sofa, третье животное и поле точки целы`, JSON.stringify(room1) === JSON.stringify(expected) && (await view(page)) === '' && (await told(page)).at(-1) === 'Расстановка сохранена.', JSON.stringify(room1));
    chrome.room = room1.cat.yarn;
    // Стрелки клавиатуры и Esc редактора — отмена всего.
    await page.locator('[data-cat-room]').click();
    await page.clock.runFor(50);
    await page.locator('[data-room-pick="yarn"]').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowLeft');
    await page.clock.runFor(100);
    const arrow = (await told(page)).at(-1);
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    check(`${label}: стрелка — «Клубок левее.»; Esc без переноса — отмена редактора, запись прежняя, фокус на входе`, arrow === 'Клубок левее.' && (await view(page)) === '' && (await told(page)).at(-1) === 'Отменено: расстановка прежняя.' && JSON.stringify(await stored(page, 'gb:room:v1')) === JSON.stringify(room1) && (await page.evaluate(() => document.activeElement?.matches('[data-cat-room]'))), arrow);
    // Повторное подключение: ничего не пишется, расстановка та же; «Вернуть обычную» — координаты сняты, поля остались.
    await destroy(page);
    const sets0 = (await page.evaluate(() => window.qaSets.length));
    await page.evaluate(() => window.stand.mount({ storage: 'gb' }));
    await page.clock.runFor(100);
    await openRoom(page);
    const reread = { sets: await page.evaluate((n) => window.qaSets.slice(n).filter((item) => item.key === 'gb:room:v1').length, sets0), state: await page.locator('[data-room-state]').textContent() };
    await page.locator('[data-room-reset]').click();
    await page.locator('[data-room-save]').click();
    await page.clock.runFor(100);
    check(`${label}: повторное подключение — без записи; «Вернуть обычную расстановку» и «Сохранить» — координаты клубка сняты, glow и чужое целы`, reread.sets === 0 && reread.state === 'Изменений нет' && JSON.stringify((await stored(page, 'gb:room:v1')).cat) === JSON.stringify({ yarn: { glow: 1 }, sofa: { x: 1, y: 2 } }), JSON.stringify(reread));
    await destroy(page);

    // ---- Новая ступень во время редактора и переноса: перенос отменён, лежанка, без записи и отметки ----
    await mount(page, 'gc', { marks: 9, today: 1, keys: { cat: { v: 1, seenStage: 2, greetDay: DAY } } });
    await openRoom(page);
    const rest = center(await rect(page, '[data-room-hit="rest"]'));
    await page.mouse.move(...rest);
    await page.mouse.down();
    await page.mouse.move(rest[0] - 40, rest[1], { steps: 4 });
    await page.evaluate(() => {
      window.stand.set(18, 2);
      window.stand.pet.notify('saved', { key: 'gc1', counted: true });
    });
    await page.clock.runFor(100);
    const restage = { moving: await page.evaluate(() => document.querySelector('[data-room-stage]').hasAttribute('data-moving')), bed: await page.evaluate(() => Boolean(document.querySelector('.cat-room [data-item="bed"]'))), listeners: await windowListeners(cdp) };
    await page.mouse.up();
    await page.clock.runFor(100);
    check(`${label}: новая ступень при переносе — перенос отменён (захват снят), лежанка в редакторе; ни записи комнаты, ни отметки ступени`, !restage.moving && restage.bed && restage.listeners === baseline && (await raw(page, 'gc:room:v1')) === null && (await stored(page, 'gc:cat:v1')).seenStage === 2, JSON.stringify(restage));
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    check(`${label}: выход из редактора — ступень увидена в уголке`, (await stored(page, 'gc:cat:v1')).seenStage === 3);
    await destroy(page);

    // ---- Две вкладки: чужая расстановка — отметка, черновик цел; своё «Сохранить» — только свои предметы ----
    await mount(page, 'gd');
    await openRoom(page);
    await page.locator('[data-room-pick="yarn"]').click();
    await page.locator('[data-room-move="right"]').click();
    const tab = await context.newPage();
    await tab.goto(`${base}?manual`);
    await tab.waitForFunction(() => Boolean(window.stand));
    await tab.evaluate(() => {
      window.stand.mount({ storage: 'gd' });
      window.stand.set(1, 1);
    });
    await tab.locator('#cat-dock .cat-dock-btn').click();
    await tab.evaluate(() => Promise.all(document.querySelector('.cat-sheet').getAnimations().map((animation) => animation.finished)));
    await tab.locator('[data-cat-room]').click();
    await tab.locator('[data-room-pick="bowl"]').click();
    await tab.locator('[data-room-move="right"]').click();
    await tab.locator('[data-room-save]').click();
    await page.clock.runFor(100);
    const foreign = { other: await page.evaluate(() => !document.querySelector('[data-room-other]').hidden), told: (await told(page)).at(-1), state: await page.locator('[data-room-state]').textContent() };
    await page.locator('[data-room-save]').click();
    const both = await stored(page, 'gd:room:v1');
    // PL11.2, D2: до 0.2.2 ожидалось «миска другой вкладки цела» (180), хотя редактор показывал «Не сохранено: миска» — своё
    // «Сохранить» побеждает для показанного питомца (как 0.1.4): миска черновика на исходном месте, координаты сняты.
    check(`${label}: две вкладки — чужая расстановка отмечена и объявлена, черновик цел; своё «Сохранить» — видимый черновик: клубок и миска на исходном месте`, foreign.other && foreign.told.startsWith('В другой вкладке сохранена новая расстановка') && foreign.state === 'Не сохранено: миска, клубок' && both.cat.bowl === undefined && both.cat.yarn?.x === 46, JSON.stringify({ foreign, both }));
    await tab.close();
    // Место legacy-раскладки — команда ядра setPlace (запись через подключение ядра); «устроился» — эффект arrive ядра,
    // появление — отображение (уголок открыт после «Сохранить»).
    await page.locator('.cat-place-option:has(input[value="logo"])').click();
    await page.clock.runFor(100);
    const placed = { at: await page.evaluate(() => document.documentElement.dataset.petAt), arriving: await page.evaluate(() => document.getElementById('cat-side')?.classList.contains('is-arriving') ?? false), saved: (await stored(page, 'gd:place:v1'))?.desktop?.place, told: (await told(page)).at(-1) };
    check(`${label}: место «У логотипа» — запись ключа place ядром, питомец появляется (arrive), объявление места`, placed.at === 'logo' && placed.arriving && placed.saved === 'logo' && placed.told === 'Место: у логотипа.', JSON.stringify(placed));
    await page.keyboard.press('Escape');
    await destroy(page);

    // ---- Отказ записи: редактор открыт, честное сообщение; отмена — честно ----
    await mount(page, 'ge');
    await page.evaluate(() => (window.qaDeny = /^ge:room/));
    await openRoom(page);
    await page.locator('[data-room-pick="yarn"]').click();
    await page.locator('[data-room-move="right"]').click();
    await page.locator('[data-room-save]').click();
    await page.clock.runFor(100);
    const failed = { error: await page.evaluate(() => !document.querySelector('[data-room-error]').hidden), view: await view(page), told: (await told(page)).at(-1), state: await page.locator('[data-room-state]').textContent() };
    await page.locator('[data-room-cancel]').click();
    await page.clock.runFor(100);
    check(`${label}: отказ записи — редактор открыт, «Не удалось сохранить…», черновик не сохранён; отмена — «не сохранилась… до перезагрузки»`, failed.error && failed.view === 'room' && failed.told === 'Не удалось сохранить расстановку. Попробуй ещё раз.' && failed.state === 'Не сохранено: клубок' && (await told(page)).at(-1).includes('не сохранилась') && (await raw(page, 'ge:room:v1')) === null, JSON.stringify(failed));
    await page.evaluate(() => (window.qaDeny = null));
    await destroy(page);

    // ---- Кормление у переставленной миски у левого и правого края — питомец целиком в сцене ----
    chrome.feed = await feedEdges(page, 'gf', label, check);

    // ---- Записи ключей — только через веб-адаптер координатора ----
    const sets = await page.evaluate(() => window.qaSets.filter((item) => /^g[a-f]\w*:/.test(item.key)));
    check(`${label}: каждая запись ключей (${sets.length}) — через веб-адаптер координатора, из оболочки — ни одной (в том числе room и place)`, sets.some((item) => item.key.endsWith(':room:v1')) && sets.some((item) => item.key.endsWith(':place:v1')) && sets.every((item) => item.adapter), JSON.stringify(sets));
    check(`${label}: чужой ключ сайта не тронут, внешних запросов нет`, (await raw(page, 'site:other')) === FOREIGN && outside.length === 0, outside.join(', '));
    await layout(page, label);
    check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
  return chrome;
}

// Кормление у краёв: миска [30, 240] и [371, 236], без анимации (поза статична) — рисунок позы «ест» внутри сцены.
async function feedEdges(page, ns, label, check, opener = '#cat-dock .cat-dock-btn') {
  const out = [];
  for (const [side, bowl] of [
    ['слева', { x: 30, y: 240 }],
    ['справа', { x: 371, y: 236 }],
  ]) {
    await mount(page, `${ns}${side === 'слева' ? 'l' : 'r'}`, { marks: 1, today: 1, keys: { cat: { v: 1, seenStage: 0, greetDay: DAY, motion: 'none' }, room: { v: 1, cat: { bowl } } } });
    await page.locator(opener).click();
    await finishOpen(page);
    await page.locator('[data-cat-feed]').click();
    await page.clock.runFor(300);
    const box = await page.evaluate(() => {
      const scene = document.querySelector('.cat-stage-wrap > .cat-scene-art');
      const art = scene.querySelector('.cat-art');
      const all = art.querySelector('.cat-all') ?? art;
      return { pose: art.dataset.pose, scene: scene.getBoundingClientRect().toJSON(), pet: all.getBoundingClientRect().toJSON() };
    });
    const inside = box.pet.left >= box.scene.left - 1 && box.pet.right <= box.scene.right + 1 && box.pet.top >= box.scene.top - 1 && box.pet.bottom <= box.scene.bottom + 1;
    check(`${label}: кормление у миски ${side} — поза «ест», питомец целиком в сцене (уши, лапы, хвост не срезаны)`, box.pose === 'feed' && inside, JSON.stringify(box));
    out.push(box.pose);
    await page.keyboard.press('Escape');
    await destroy(page);
  }
  return out;
}

// Телефон: собака, палец (CDP). Долгое поглаживание с вторым пальцем, лапа, перенос миски и предмета редактора пальцем;
// blur, resize и фон снимают жест. Сдвиги пальца в жестах отменены: браузер не запускает инерцию (fling), а Chrome на
// Android и Linux иначе глотает касание, которое её останавливает (PL11.1: «Закрыть» после миски, «Сохранить» после
// каната); на Mac Chrome не глотает, поэтому инерцию проверяет трасса, а не только нажатие.
async function phone(browser, base, check, open, layout) {
  const label = 'игра и комната 390×844 (палец)';
  const probe = await flingProbe(browser).catch((error) => error.message);
  const { context, page, cdp } = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, init);
  let tracing = false;
  const outside = watchNetwork(page, base);
  // Палец 1 (и второй — extra); движение без сдвига события не даёт — его не ждём.
  let last = null;
  const touch = async (type, x, y, extra = []) => {
    const points = type === 'touchEnd' ? [] : [{ x, y, id: 1 }, ...extra];
    const still = type === 'touchMove' && last?.[0] === x && last?.[1] === y;
    last = type === 'touchEnd' ? null : [x, y];
    const send = () => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    if (still) await send();
    else await sent(page, send, type === 'touchMove' ? [x, y] : null);
  };
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    const baseline = await windowListeners(cdp);
    await browser.startTracing(page, { categories: ['input'] });
    tracing = true;
    await mount(page, 'ha', { keys: { companion: { v: 1, kind: 'dog' } } });
    await page.locator('.cat-face').tap();
    await finishOpen(page);
    await page.locator('[data-cat-play]').tap();
    await page.clock.runFor(50);
    const stroke = await longStroke(page, { touch });
    const toggles = stroke.again.reduce((n, value, i) => n + (i && value !== stroke.again[i - 1] ? 1 : 0), 0);
    const dogTold = (await told(page)).filter((text) => text.startsWith('Тоби'));
    check(`${label}: долгое поглаживание пальцем — «pet» между откликами, собака виляет заново, одно объявление; отпустили — покой`, stroke.poses.every((p) => p === 'pet') && toggles >= 2 && JSON.stringify(dogTold) === JSON.stringify(['Тоби виляет хвостом.']) && stroke.after.pose === 'calm', JSON.stringify({ poses: stroke.poses, again: stroke.again, dogTold, after: stroke.after }));
    check(`${label}: итог не сдвинул питомца под пальцем`, Math.abs(stroke.held.pet.y - stroke.before.y) < 0.5, JSON.stringify({ before: stroke.before.y, held: stroke.held.pet.y }));
    // Второй палец не кончает жест; blur, resize и фон — кончают (захват снят).
    await page.clock.runFor(60_000);
    const [x0, y0] = await petPoint(page, 100, 66);
    const ends = [];
    for (const [name, stop] of [
      ['blur', () => page.evaluate(() => window.dispatchEvent(new Event('blur')))],
      ['resize', () => page.evaluate(() => window.dispatchEvent(new Event('resize')))],
      [
        'фон',
        () =>
          page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            document.dispatchEvent(new Event('visibilitychange'));
          }),
      ],
    ]) {
      await touch('touchStart', x0, y0);
      await page.clock.runFor(200);
      await touch('touchMove', x0 + 30, y0);
      await touch('touchStart', x0 + 30, y0, [{ x: x0 - 60, y: y0 + 40, id: 2 }]);
      await touch('touchMove', x0 + 30, y0);
      const second = await page.evaluate(() => document.querySelector('[data-play-pet]').hasAttribute('data-stroking'));
      await stop();
      await page.clock.runFor(50);
      ends.push({ name, second, stroking: await page.evaluate(() => document.querySelector('[data-play-pet]').hasAttribute('data-stroking')), listeners: await windowListeners(cdp) });
      await touch('touchEnd');
      if (name === 'фон')
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
          document.dispatchEvent(new Event('visibilitychange'));
        });
      await page.clock.runFor(2000);
    }
    check(`${label}: второй палец не кончает жест; blur, resize и фон — кончают, захват снят`, ends.every((item) => item.second && !item.stroking && item.listeners === baseline), JSON.stringify(ends));
    // Лапа собаки — короткое касание.
    if ((await view(page)) !== 'play') {
      await page.locator('[data-cat-play]').tap();
      await page.clock.runFor(50);
    }
    await page.clock.runFor(60_000);
    const [px, py] = await petPoint(page, 90, 176);
    await page.touchscreen.tap(px, py);
    await page.clock.runFor(100);
    check(`${label}: короткое касание лапы — «Тоби даёт лапу.»`, (await hint(page)) === 'Тоби даёт лапу.', await hint(page));
    // Миска пальцем.
    await page.clock.runFor(2000);
    const bowl0 = center(await rect(page, '[data-play-toy="bowl"]'));
    await touch('touchStart', ...bowl0);
    await touch('touchMove', bowl0[0] + 20, bowl0[1]);
    await touch('touchMove', bowl0[0] + 60, bowl0[1]);
    await page.clock.runFor(30);
    const under = center(await rect(page, '[data-play-toy="bowl"]'));
    await touch('touchEnd');
    await page.clock.runFor(100);
    check(`${label}: миска пальцем — под пальцем без скачка, на новом месте`, Math.abs(under[0] - (bowl0[0] + 60)) < 1.5 && ['Тоби принюхивается к миске.', 'Тоби смотрит на миску.'].includes(await hint(page)), JSON.stringify({ bowl0, under, hint: await hint(page) }));
    await layout(page, `${label}, «Поиграть»`);
    // Редактор: канат пальцем, «Сохранить».
    await page.locator('[data-cat-play-close]').tap();
    await page.clock.runFor(50);
    await page.locator('[data-cat-room]').tap();
    await page.clock.runFor(50);
    const rope = center(await rect(page, '[data-room-hit="rope"]'));
    await touch('touchStart', ...rope);
    await touch('touchMove', rope[0] + 15, rope[1]);
    await touch('touchMove', rope[0] + 60, rope[1]);
    await page.clock.runFor(30);
    await touch('touchEnd');
    await page.clock.runFor(100);
    const state = await page.locator('[data-room-state]').textContent();
    await page.locator('[data-room-save]').tap();
    await page.clock.runFor(100);
    const saved = await stored(page, 'ha:room:v1');
    check(`${label}: канат пальцем — «Не сохранено: канат»; «Сохранить» — записан канат собаки`, state === 'Не сохранено: канат' && saved?.dog?.rope?.x > 36 && !saved.cat, JSON.stringify({ state, saved }));
    tracing = false;
    const thrown = { probe, flings: await flings(browser), moves: await page.evaluate(() => window.qaMoves) };
    check(`${label}: сдвиги пальца в жестах (поглаживание, второй палец, миска, канат) отменены — инерции браузера после быстрого отпускания нет, касание следующей кнопки не глотается (проба: инерция без модуля видна в трассе)`, thrown.probe >= 1 && thrown.flings === 0 && thrown.moves.n > 0 && thrown.moves.free === 0, JSON.stringify(thrown));
    await layout(page, `${label}, уголок`);
    check(`${label}: чужой ключ сайта не тронут, внешних запросов нет`, (await raw(page, 'site:other')) === FOREIGN && outside.length === 0, outside.join(', '));
    check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    if (tracing) await browser.stopTracing().catch(() => {});
    await context.close();
  }
}

// Узкий экран и телефон боком: «Поиграть» и редактор помещаются, предметы на полу сцены, кормление у краёв.
async function narrow(browser, base, check, open, layout, viewport, label, kind) {
  const { context, page } = await open(browser, { viewport, hasTouch: true, isMobile: true }, init);
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    await mount(page, 'na', { keys: kind === 'dog' ? { companion: { v: 1, kind: 'dog' } } : {} });
    await page.locator('.cat-face').tap();
    await finishOpen(page);
    await page.locator('[data-cat-play]').tap();
    await page.clock.runFor(100);
    const boxes = await page.evaluate(() => ({ stage: document.querySelector('[data-play-stage]').getBoundingClientRect().toJSON(), toys: [...document.querySelectorAll('[data-play-toy]')].map((el) => el.getBoundingClientRect().toJSON()) }));
    const inside = boxes.toys.every((r) => r.left >= boxes.stage.left - 1 && r.right <= boxes.stage.right + 1);
    await page.locator('[data-cat-play-ball]').tap();
    await page.clock.runFor(1500);
    const ball = await rect(page, '[data-play-toy="ball"]');
    check(`${label}: «Поиграть» — миска и мячик в пределах сцены; «Катнуть мячик» — докатился, не за край`, inside && ball.left >= boxes.stage.left - 1 && ball.right <= boxes.stage.right + 1, JSON.stringify({ boxes, ball }));
    await layout(page, `${label}, «Поиграть»`);
    await page.locator('[data-cat-play-close]').tap();
    await page.clock.runFor(50);
    await page.locator('[data-cat-room]').tap();
    await page.clock.runFor(50);
    await layout(page, `${label}, редактор`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
    await destroy(page);
    await feedEdges(page, 'nf', label, check, '.cat-face');
    check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// Тот же логический сценарий в Node: долгое поглаживание (§ 6.8) и «Сохранить» при переносе — один итог.
function same(check, chrome) {
  const L = life({ cat: { v: 1, seenStage: 0, greetDay: NODE_DAY } }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  L.core.start();
  L.core.open('play');
  L.core.setDisplay({ playFloor: [-40, -10, 300, 230] });
  const { id } = L.core.stroke.start();
  let at = 0;
  for (const t of [200, 600, 1100, 1700, 3200]) {
    L.plan.advance(t - at);
    at = t;
    L.core.stroke.step(id);
  }
  L.plan.advance(5000 - at);
  L.core.stroke.end(id);
  const node = { told: L.effects('announce').map((effect) => effect.text), pose: L.state().pose.shown.play, outcome: L.state().play.outcome };
  const R = life({ cat: { v: 1, seenStage: 0, greetDay: NODE_DAY }, room: { v: 2, cat: { yarn: { x: 60, y: 230, glow: 1 } } } }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  R.core.start();
  R.core.open('room');
  R.core.room.select('yarn');
  R.core.room.nudge('right');
  R.core.room.drag('bowl', R.state().room.draft.pos.bowl);
  R.core.room.drag('bowl', [240, 230]);
  R.core.room.save();
  check(
    'игра и комната: Chrome и Node — один итог: объявления и поза долгого поглаживания, запись «Сохранить» при переносе',
    JSON.stringify(chrome.stroke?.told) === JSON.stringify(node.told) && chrome.stroke?.pose === node.pose && chrome.stroke?.hint === HINT && node.outcome === '' && JSON.stringify(chrome.room) === JSON.stringify(R.json('room').cat.yarn),
    JSON.stringify({ chrome, node, room: R.json('room') }),
  );
}
