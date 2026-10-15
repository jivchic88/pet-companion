// Команды и события (PL05) в Chrome: настоящий mountPet на стенде, хост управляет питомцем публичными методами pet.* и
// pet.core (page.evaluate — код сайта), без нажатий на кнопки питомца; интерфейс догоняет прямую команду тем же путём, что
// кнопку (подписка оболочки на ядро): имя, облик, аксессуар, движение и реплики, кормление, счёт, «Новое в уголке» и
// новый день, другой питомец, «Скрыть» / «Показать», присутствие и вызов, открытие и смена вида, «Поиграть» (прямое
// действие и снятие жеста ядром — захват и слушатели окна отпущены), редактор (выбор, шаг, «Сохранить» — итог над
// сценой, запись и перезагрузка); фокус, Esc, блокировка прокрутки и её снятие с возвратом позиции; pet.core.destroy() —
// снимает всё, как pet.destroy() (элементы, отметки html, слушатели document и window, таймеры, захват), и из слушателя;
// повторное подключение — прежние pet.*, pet.core и фасад нового не трогают; кнопка уголка и прямая команда — одно
// обновление для подписчика pet.core. Компьютер 1280×900 (мышь, клавиатура), телефон 390×844 (касания, CDP), узкий
// 320×740, боком 844×390; кот и собака. Только свои ключи, неизвестные поля, v и другие животные целы; без ошибок страницы,
// необработанных отклонений, горизонтальной прокрутки и внешних запросов. Часы — page.clock. Запуск — в составе
// npm run test:browser.

const DAY = '2026-10-11';
const FOREIGN = '{"keep":1}';

// Только QA: чужой ключ сайта, журнал объявлений (#cat-live), необработанные отклонения, последнее событие указателя.
function init() {
  if (!localStorage.getItem('site:other')) localStorage.setItem('site:other', '{"keep":1}');
  window.qaTold = [];
  window.qaRejections = [];
  window.addEventListener('unhandledrejection', (event) => window.qaRejections.push(String(event.reason)));
  new MutationObserver((list) => {
    for (const item of list) {
      const box = item.target.nodeType === 1 ? item.target : item.target.parentElement;
      if (box?.id === 'cat-live' && box.textContent) window.qaTold.push(box.textContent);
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  window.qaPointer = { n: 0, x: 0, y: 0 };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) document.addEventListener(type, (event) => Object.assign(window.qaPointer, { n: window.qaPointer.n + 1, x: event.clientX, y: event.clientY }), true);
}

const MODULE = '.cat-dock, .cat-side, .cat-face, .cat-fold, .cat-float, .cat-bar, .cat-sheet, .cat-sections-return, .pet-zones, .pet-ghost, [id^="cat-"]';
const nodes = (page) => page.evaluate((selector) => document.querySelectorAll(selector).length, MODULE);
const marks = (page) =>
  page.evaluate(() => {
    const html = document.documentElement;
    return [...html.classList].filter((name) => /^(cat|pet)-/.test(name)).concat(Object.keys(html.dataset).filter((name) => /^(cat|pet)[A-Z]/.test(name)), html.hasAttribute('data-pet-call') ? ['data-pet-call'] : []);
  });
const told = (page) => page.evaluate(() => [...window.qaTold]);
const stored = (page, key) => page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? 'null'), key);
const keys = (page) => page.evaluate(() => Object.keys(localStorage).sort());
const text = (page, selector) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, selector);
const attr = (page, selector, name) => page.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [selector, name]);
const checked = (page, name) => page.evaluate((n) => document.querySelector(`input[name="${n}"]:checked`)?.value ?? null, name);
const focusOn = (page, selector) => page.evaluate((s) => Boolean(document.activeElement?.matches(s)), selector);
const view = (page) => page.evaluate(() => ({ open: Boolean(document.getElementById('cat-sheet')?.open), view: document.getElementById('cat-sheet')?.dataset.view ?? '', lock: document.documentElement.classList.contains('cat-open') }));
const finishOpen = (page) => page.evaluate(() => Promise.all((document.querySelector('.cat-sheet')?.getAnimations() ?? []).map((animation) => animation.finished)));
const rect = (page, selector) => page.evaluate((s) => document.querySelector(s)?.getBoundingClientRect().toJSON() ?? null, selector);
// Команда хоста: метод pet.* или pet.core (путь через точку), аргументы — простые данные; результат — простые данные.
const call = (page, path, ...args) =>
  page.evaluate(
    ([where, list]) => {
      const parts = where.split('.');
      const fn = parts.reduce((object, part) => object?.[part], window.stand.pet);
      const result = fn(...list);
      return result === undefined ? null : JSON.parse(JSON.stringify(result));
    },
    [path, args],
  );

// Слушатели document и window (CDP): после отключения — как до подключения.
async function listeners(cdp) {
  const count = async (expression) => {
    const { result } = await cdp.send('Runtime.evaluate', { expression });
    return (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.length;
  };
  return { document: await count('document'), window: await count('window') };
}
// Ввод доходит до страницы по кадрам: ждём, что событие указателя дошло (номер вырос), и только потом двигаем часы.
async function sent(page, send) {
  const n = await page.evaluate(() => window.qaPointer.n);
  await send();
  await page.waitForFunction((k) => window.qaPointer.n > k, n, { timeout: 3000 });
}
function watchNetwork(page, base) {
  const outside = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:')) outside.push(url);
  });
  return outside;
}

// Подключить на стенде: ключи пространства ns (синтетические, с неизвестными полями), счёт сайта — window.qaCounts (хост
// меняет его без update() и сам вызывает pet.core.refresh / notify), Math.random задан.
// seed — записать ключи перед подключением (по умолчанию — только cat с увиденной ступенью 0); null — подключить к уже
// записанному (перезагрузка, повторное подключение).
async function mount(page, ns, { marks: m = 1, today = 1, seed = {} } = {}) {
  await page.evaluate(
    ([space, values, total, day]) => {
      Math.random = () => 0.5;
      window.qaCounts = { marks: total, today: day, limit: 3 };
      for (const [key, value] of Object.entries(values ?? {})) localStorage.setItem(`${space}:${key}:v1`, JSON.stringify(value));
      window.stand.mount({ storage: space, progress: () => window.qaCounts });
      window.qaTold.length = 0;
    },
    [ns, seed === null ? null : { cat: { v: 1, seenStage: 0, greetDay: DAY }, ...seed }, m, today],
  );
  await page.clock.runFor(100);
}
// Слушатели общего указателя жеста на window (pointermove, pointercancel) — снимаются с концом жеста; поглощение нажатия
// после прерванного жеста (pointerup, pointerdown) — прежнее, до следующего нажатия.
async function gestureListeners(cdp) {
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'window' });
  return (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.filter((item) => item.type === 'pointermove' || item.type === 'pointercancel').length;
}

export async function commandsQa(browser, base, check, open, layout) {
  await desktop(browser, base, check, open, layout);
  await phone(browser, base, check, open, layout);
  await narrow(browser, base, check, open, layout, { width: 320, height: 740 }, 'команды 320×740', 'cat');
  await narrow(browser, base, check, open, layout, { width: 844, height: 390 }, 'команды боком 844×390', 'dog');
}

async function desktop(browser, base, check, open, layout) {
  const label = 'команды 1280×900';
  const { context, page, cdp } = await open(browser, { viewport: { width: 1280, height: 900 } }, init);
  const outside = watchNetwork(page, base);
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    // Длинная страница — проверить блокировку прокрутки и возврат позиции.
    await page.addStyleTag({ content: 'body { min-height: 3200px; }' });
    const baseline = await listeners(cdp);
    const seed = {
      cat: { v: 3, seenStage: 0, greetDay: DAY, glow: 7 },
      companion: { v: 1, kind: 'cat', future: 1, dog: { name: '', extra: 'x' } },
      look: { v: 1, cat: 'smoke', 'example.bunny': 'white' },
      room: { v: 2, theme: 'night', 'example.bunny': { carrot: { x: 5, y: 6 } } },
    };
    await mount(page, 'ca', { marks: 3, today: 1, seed });
    const surface = await page.evaluate(() => ({ core: Boolean(window.stand.pet.core), status: window.stand.pet.core.status, version: window.stand.pet.core.version === window.stand.VERSION, place: 'place' in window.stand.pet.getState() }));
    check(`${label}: pet.core — публичный экземпляр запущенного ядра той же версии, снимок без внутреннего place`, surface.core && surface.status === 'running' && surface.version && !surface.place, JSON.stringify(surface));

    // ---- Имя: готовое — отклик и объявление ядра; подпись в боковой панели и доступное имя кнопки ----
    const named = await call(page, 'setName', 'Пиксель');
    await page.clock.runFor(100);
    const nameShown = { dock: await text(page, '#cat-dock [data-cat-name]'), label: await attr(page, '#cat-dock .cat-dock-btn', 'aria-label'), stored: await stored(page, 'ca:cat:v1') };
    check(`${label}: pet.setName('Пиксель') — имя в боковой панели и подписи кнопки без клика; запись с неизвестными полями; объявление «Имя: Пиксель.»`, named.ok && named.reacted && nameShown.dock === 'Пиксель' && nameShown.label.startsWith('Пиксель') && nameShown.stored.name === 'Пиксель' && nameShown.stored.v === 3 && nameShown.stored.glow === 7 && (await told(page)).includes('Имя: Пиксель.'), JSON.stringify({ named, nameShown, told: await told(page) }));

    // ---- Открыть уголок прямой командой: диалог, фокус, блокировка прокрутки, «Новое в уголке» ----
    await page.evaluate(() => window.scrollTo(0, 400));
    const opened = await call(page, 'core.open', 'corner');
    await finishOpen(page);
    const corner = { ...(await view(page)), title: await text(page, '#cat-sheet-title'), field: await page.evaluate(() => document.querySelector('input[name="cat-name"]')?.value), chip: await attr(page, '[data-cat-names] [data-cat-name-pick="Пиксель"]', 'aria-pressed'), fresh: await text(page, '[data-cat-fresh]'), expanded: await attr(page, '#cat-dock .cat-dock-btn', 'aria-expanded') };
    // Ступень 1 кота открывает только аксессуар: увидена при открытии (запись seenStage), вещей «Новое в уголке» нет — как 0.1.4.
    check(`${label}: pet.core.open('corner') — диалог открыт, фокус на «Закрыть», прокрутка страницы заблокирована, имя и подборка — по снимку, ступень увидена`, opened.ok && opened.save.keys.includes('cat') && corner.open && corner.view === '' && corner.lock && corner.title === 'Пиксель' && corner.field === 'Пиксель' && corner.chip === 'true' && corner.expanded === 'true' && (await focusOn(page, '[data-cat-close]')) && (await stored(page, 'ca:cat:v1')).seenStage === 1, JSON.stringify({ opened, corner }));
    await layout(page, `${label}, уголок по команде`);

    // ---- Облик, аксессуар, движение и реплики — в открытом уголке, без клика ----
    await call(page, 'setAppearance', { coat: 'ginger' });
    await call(page, 'setAppearance', { accessory: 'plaid' });
    await call(page, 'setPreferences', { motion: 'calm', phrases: false });
    const looks = await page.evaluate(() => ({
      coat: document.querySelector('input[name="cat-coat"]:checked')?.value,
      acc: document.querySelector('input[name="cat-acc"]:checked')?.value,
      scene: document.querySelector('.cat-stage-wrap .cat-art')?.dataset.coat,
      dock: document.querySelector('#cat-dock .cat-art')?.dataset.coat,
      worn: [...document.querySelectorAll('.cat-art[data-cat-managed]')].every((art) => art.dataset.acc === 'plaid'),
      pickers: [...document.querySelectorAll('.cat-coat-face .cat-art')].every((art) => art.dataset.acc === 'plaid'),
      motion: document.querySelector('input[name="cat-motion"]:checked')?.value,
      phrases: document.querySelector('input[name="cat-phrases"]')?.checked,
      html: document.documentElement.dataset.catMotion,
    }));
    check(`${label}: облик, аксессуар, движение и реплики прямыми командами — переключатели, рисунки и портреты выбора, режим страницы`, looks.coat === 'ginger' && looks.acc === 'plaid' && looks.scene === 'ginger' && looks.dock === 'ginger' && looks.worn && looks.pickers && looks.motion === 'calm' && looks.phrases === false && looks.html === 'calm', JSON.stringify(looks));

    // ---- Кормление, счёт хоста, новый день и «Новое в уголке» без update() ----
    await page.evaluate(() => window.qaTold.splice(0));
    const fed = await call(page, 'feed');
    await page.clock.runFor(100);
    const card = { state: await attr(page, '[data-cat-treat]', 'data-state'), done: Boolean(await text(page, '[data-cat-treat-done]')), stored: await stored(page, 'ca:treat:v1') };
    check(`${label}: pet.feed() — карточка «Угостили», запись дня, объявление ядра`, fed.ok && card.state === 'fed' && card.done && card.stored?.fedDay === DAY && (await told(page)).some((line) => line.startsWith('Пиксель получает лакомство')), JSON.stringify({ fed, card, told: await told(page) }));
    await page.evaluate(() => (window.qaCounts.marks = 9));
    const refreshed = await call(page, 'core.refresh');
    const lines = { line: await text(page, '[data-cat-line]'), sub: await text(page, '[data-cat-sub]'), fresh: await text(page, '[data-cat-fresh]') };
    await page.evaluate(() => (window.qaCounts.marks = 10));
    const savedEvent = await call(page, 'core.notify', 'saved', { key: 'cmd-1', counted: true });
    const after = await text(page, '[data-cat-line]');
    check(`${label}: pet.core.refresh() и pet.core.notify — знаки, ступень и «Новое в уголке» открытого уголка без update() и клика`, refreshed.ok && refreshed.fresh.length > 0 && lines.line.includes('9 знаков практики') && lines.sub === 'Ступень «Наш ритуал»' && lines.fresh.startsWith('Новое в уголке') && savedEvent.ok && savedEvent.reacted && after.includes('10 знаков практики'), JSON.stringify({ refreshed, lines, savedEvent, after }));

    // ---- Другой питомец при открытом уголке ----
    const dog = await call(page, 'setPet', 'dog');
    await page.clock.runFor(100);
    const switched = { title: await text(page, '#cat-sheet-title'), kind: await checked(page, 'cat-kind'), dock: await attr(page, '#cat-dock .cat-art', 'data-kind'), stored: await stored(page, 'ca:companion:v1') };
    check(`${label}: pet.setPet('dog') — уголок, переключатель и рисунки собаки; запись kind, неизвестные поля и данные собаки целы`, dog.ok && switched.title === 'Тоби' && switched.kind === 'dog' && switched.dock === 'dog' && switched.stored.kind === 'dog' && switched.stored.future === 1 && switched.stored.dog.extra === 'x', JSON.stringify({ dog, switched }));

    // ---- «Поиграть» прямой командой: прямое действие, жест мышью снят ядром по команде облика ----
    const play = await call(page, 'core.open', 'play');
    // Приветствие нового питомца доиграло — прямое действие не сменяет не менее важную реакцию.
    await page.clock.runFor(7000);
    const pet = await call(page, 'interact', { type: 'pet' });
    await page.clock.runFor(50);
    check(`${label}: pet.core.open('play') — сцена «Поиграть», фокус на «Закрыть»; pet.interact — итог под сценой`, play.ok && (await view(page)).view === 'play' && (await focusOn(page, '[data-cat-play-close]')) && pet.outcome === 'pet' && (await text(page, '[data-cat-play-hint]')) === 'Тоби виляет хвостом.', JSON.stringify({ play, pet, hint: await text(page, '[data-cat-play-hint]') }));
    await page.clock.runFor(61_000);
    const box = await rect(page, '[data-play-pet]');
    const [sx, sy] = [box.x + (box.width * 100) / 220, box.y + (box.height * 66) / 204];
    const quietWindow = await gestureListeners(cdp);
    await page.mouse.move(sx, sy);
    await sent(page, () => page.mouse.down());
    await page.clock.runFor(200);
    await sent(page, () => page.mouse.move(sx + 30, sy, { steps: 2 }));
    const stroking = await page.evaluate(() => Boolean(document.querySelector('[data-play-pet][data-stroking]')));
    await call(page, 'setAppearance', { coat: 'spotted' });
    await page.clock.runFor(50);
    const lost = { stroking: await page.evaluate(() => Boolean(document.querySelector('[data-play-pet][data-stroking]'))), gesture: await gestureListeners(cdp), coat: await attr(page, '.cat-play .cat-art', 'data-coat') };
    await sent(page, () => page.mouse.up());
    check(`${label}: жест мышью, затем pet.setAppearance — ядро сняло жест: захват и слушатели окна отпущены, рисунок в новом облике`, stroking && !lost.stroking && lost.gesture === quietWindow && lost.coat === 'spotted', JSON.stringify({ stroking, lost, quietWindow }));
    await call(page, 'core.open', 'corner');
    await page.clock.runFor(50);
    check(`${label}: pet.core.open('corner') из «Поиграть» — назад в уголок, фокус на «Поиграть»`, (await view(page)).view === '' && (await focusOn(page, '[data-cat-play]')));
    const closed = await call(page, 'core.close');
    await page.clock.runFor(50);
    const back = { ...(await view(page)), scroll: await page.evaluate(() => window.scrollY), expanded: await attr(page, '#cat-dock .cat-dock-btn', 'aria-expanded') };
    check(`${label}: pet.core.close() — диалог закрыт, блокировка прокрутки снята, прежняя позиция страницы, фокус на питомце`, closed.ok && !back.open && !back.lock && back.scroll === 400 && back.expanded === 'false' && (await focusOn(page, '#cat-dock .cat-dock-btn')), JSON.stringify({ closed, back }));

    // ---- Редактор прямой командой из закрытого: выбор, шаг, «Сохранить» — итог над сценой, запись ----
    const room = await call(page, 'core.open', 'room');
    await finishOpen(page);
    const roomOpen = { ...(await view(page)), focus: await focusOn(page, '[data-room-pick="rest"]') };
    await call(page, 'room.select', 'bowl');
    const nudged = await call(page, 'room.nudge', 'left');
    const draft = { pick: await attr(page, '[data-room-pick="bowl"]', 'aria-pressed'), state: await text(page, '[data-room-state]') };
    check(`${label}: pet.core.open('room') из закрытого — редактор, фокус на месте отдыха; pet.room.select и nudge — выбор и «Не сохранено» без клика`, room.ok && roomOpen.open && roomOpen.view === 'room' && roomOpen.focus && nudged.ok && draft.pick === 'true' && draft.state === 'Не сохранено: миска', JSON.stringify({ room, roomOpen, draft }));
    // Перенос командами: идёт — предмет под «указателем», черновик прежний; отмена переноса — на месте; перенос и отпускание — в черновике.
    const hitBefore = await attr(page, '[data-room-hit="rope"]', 'style');
    await call(page, 'room.drag', 'rope', [300, 232]);
    const moving = { hit: await attr(page, '[data-room-hit="rope"]', 'style'), pick: await attr(page, '[data-room-pick="rope"]', 'aria-pressed'), state: await text(page, '[data-room-state]') };
    await call(page, 'room.dragCancel');
    const cancelled = await attr(page, '[data-room-hit="rope"]', 'style');
    await call(page, 'room.drag', 'rope', [300, 232]);
    const dropped = await call(page, 'room.drop');
    const afterDrop = await text(page, '[data-room-state]');
    check(`${label}: pet.room.drag, dragCancel и drop — предмет движется на рисунке, отмена переноса возвращает его, отпускание — в черновик`, moving.hit !== hitBefore && moving.pick === 'true' && moving.state === 'Не сохранено: миска' && cancelled === hitBefore && dropped.ok && afterDrop === 'Не сохранено: миска, канат', JSON.stringify({ hitBefore, moving, cancelled, afterDrop }));
    const saved = await call(page, 'room.save');
    await page.clock.runFor(100);
    const done = { ...(await view(page)), text: await text(page, '[data-cat-room-done]'), hidden: await page.evaluate(() => document.querySelector('[data-cat-room-done]')?.hidden), stored: await stored(page, 'ca:room:v1'), focus: await focusOn(page, '[data-cat-room]') };
    check(`${label}: pet.room.save() — уголок с итогом «Расстановка сохранена.» над сценой, фокус на входе в редактор; запись собаки, чужие данные комнаты целы`, saved.ok && saved.closed && done.open && done.view === '' && done.text === 'Расстановка сохранена.' && done.hidden === false && done.focus && done.stored.dog?.bowl?.x < 170 && done.stored.theme === 'night' && done.stored['example.bunny']?.carrot?.x === 5 && done.stored.v === 2, JSON.stringify({ saved, done }));
    // Esc после прямого открытия — как кнопкой: уголок закрыт, фокус на питомце.
    await page.keyboard.press('Escape');
    await page.clock.runFor(50);
    check(`${label}: Esc в уголке, открытом командой, — закрыт, фокус на питомце`, !(await view(page)).open && (await focusOn(page, '#cat-dock .cat-dock-btn')));

    // ---- Кнопка уголка и прямая команда — один путь для подписчика pet.core ----
    await page.clock.runFor(61_000);
    await page.evaluate(() => {
      window.qaUpdates = [];
      window.qaOff = window.stand.pet.core.subscribe((update) => window.qaUpdates.push(update.reason), { initial: false });
    });
    await page.locator('#cat-dock .cat-dock-btn').click();
    await finishOpen(page);
    await page.locator('[data-cat-pet]').click();
    await page.clock.runFor(2000);
    await call(page, 'interact', { type: 'pet' });
    const reasons = await page.evaluate(() => window.qaUpdates.filter((reason) => ['open', 'interact'].includes(reason)));
    check(`${label}: кнопки уголка и прямые команды — те же обновления ядра для подписчика pet.core (open, interact)`, JSON.stringify(reasons) === JSON.stringify(['open', 'interact', 'interact']), JSON.stringify(reasons));

    // ---- «Скрыть» и «Показать», присутствие и вызов — прямыми командами при открытом уголке ----
    await call(page, 'hide');
    await page.clock.runFor(100);
    const hidden = { ...(await view(page)), back: await page.evaluate(() => Boolean(document.querySelector('#site-head [data-cat-return]')?.getClientRects().length)), at: await page.evaluate(() => document.documentElement.dataset.petAt ?? ''), stored: await stored(page, 'ca:cat:v1'), focus: await focusOn(page, '[data-cat-return]') };
    check(`${label}: pet.hide() при открытом уголке — диалог закрыт, «Показать …» на месте, фокус на ней, запись hidden`, !hidden.open && !hidden.lock && hidden.back && hidden.at === '' && hidden.stored.hidden === true && hidden.focus, JSON.stringify(hidden));
    await call(page, 'show');
    await page.clock.runFor(100);
    const shownAgain = await page.evaluate(() => ({ at: document.documentElement.dataset.petAt ?? '', face: Boolean(document.querySelector('#cat-dock .cat-dock-btn, #site-head .cat-side-face')) }));
    await call(page, 'setPresence', 'on-call');
    await page.clock.runFor(100);
    const onCall = await page.evaluate(() => ({ call: document.documentElement.hasAttribute('data-pet-call'), button: Boolean(document.querySelector('[data-cat-call]')) }));
    const summoned = await call(page, 'core.open', 'play', { source: 'call' });
    await page.clock.runFor(100);
    const summon = { ...(await view(page)), corner: Boolean(await page.$('[data-cat-play-corner]')) };
    await call(page, 'core.close');
    await page.clock.runFor(50);
    await call(page, 'setPresence', 'always');
    await page.clock.runFor(50);
    check(`${label}: pet.show(), pet.setPresence('on-call'), вызов pet.core.open('play', { source: 'call' }) и pet.core.close() — места, лапка, «Поиграть» с «Уголок» и закрытие`, shownAgain.at !== '' && shownAgain.face && onCall.call && onCall.button && summoned.ok && summon.open && summon.view === 'play' && summon.corner && !(await view(page)).open && !(await page.evaluate(() => document.documentElement.hasAttribute('data-pet-call'))), JSON.stringify({ shownAgain, onCall, summoned, summon }));
    await layout(page, `${label}, после команд`);

    // ---- Перезагрузка: записанное прямыми командами — на месте ----
    await page.reload();
    await page.waitForFunction(() => Boolean(window.stand));
    await page.addStyleTag({ content: 'body { min-height: 3200px; }' });
    await mount(page, 'ca', { marks: 10, today: 1, seed: null });
    const reloaded = await page.evaluate(() => {
      const s = window.stand.pet.getState();
      return { pet: s.pet.shown, name: s.pets.cat.name.value, coat: s.pets.dog.coat, acc: s.pets.cat.accessory, motion: s.prefs.motion, phrases: s.prefs.phrases, treat: s.treat, bowl: s.room.pos.bowl, art: document.querySelector('#cat-dock .cat-art')?.dataset.kind };
    });
    check(`${label}: перезагрузка — питомец, имя, облик, аксессуар, движение, лакомство и расстановка, заданные командами`, reloaded.pet === 'dog' && reloaded.name === 'Пиксель' && reloaded.coat === 'spotted' && reloaded.acc === 'plaid' && reloaded.motion === 'calm' && reloaded.phrases === false && reloaded.treat === 'fed' && reloaded.bowl[0] < 170 && reloaded.art === 'dog', JSON.stringify(reloaded));

    // ---- pet.core.destroy() во время жеста мышью: всё снято, как pet.destroy() ----
    const gestureBase = await gestureListeners(cdp);
    await call(page, 'core.open', 'play');
    await page.clock.runFor(61_000);
    const big = await rect(page, '[data-play-pet]');
    const [gx, gy] = [big.x + (big.width * 100) / 220, big.y + (big.height * 66) / 204];
    await page.mouse.move(gx, gy);
    await sent(page, () => page.mouse.down());
    await page.clock.runFor(200);
    await sent(page, () => page.mouse.move(gx + 30, gy, { steps: 2 }));
    const during = { stroking: await page.evaluate(() => Boolean(document.querySelector('[data-play-pet][data-stroking]'))), gesture: await gestureListeners(cdp) };
    const firedBefore = await page.evaluate(() => window.qaPetFired);
    const result = await page.evaluate(() => {
      const pet = window.stand.pet;
      window.qaOld = pet;
      return { value: pet.core.destroy() === undefined, mounted: pet.mounted, status: pet.core.status, snapshot: pet.getState().status, again: pet.setName('Ещё').error?.code };
    });
    await page.mouse.up();
    await page.clock.runFor(60_000);
    const gone = { nodes: await nodes(page), marks: await marks(page), listeners: await listeners(cdp), gesture: await gestureListeners(cdp), fired: (await page.evaluate(() => window.qaPetFired)) - firedBefore, lock: (await view(page)).lock };
    check(`${label}: pet.core.destroy() во время жеста мышью — элементы, отметки html, блокировка прокрутки, захват и слушатели document и window, таймеры сняты; pet.mounted false, ядро destroyed, команды — destroyed`, during.stroking && during.gesture > gestureBase && result.value && !result.mounted && result.status === 'destroyed' && result.snapshot === 'destroyed' && result.again === 'destroyed' && gone.nodes === 0 && gone.marks.length === 0 && !gone.lock && gone.gesture === gestureBase && gone.listeners.document === baseline.document && gone.listeners.window === baseline.window && gone.fired === 0 && page.qaErrors.length === 0, JSON.stringify({ during, result, gone, baseline, gestureBase, errors: page.qaErrors }));

    // ---- Повторное подключение: прежние pet.*, pet.core и фасад нового не трогают ----
    await mount(page, 'ca', { marks: 10, today: 1, seed: null });
    const old = await page.evaluate(() => {
      const before = window.stand.pet.getState();
      const late = [];
      const off = window.qaOld.subscribe((update) => late.push(update.reason));
      const results = {
        setName: window.qaOld.setName('Чужой').error?.code,
        feed: window.qaOld.feed().error?.code,
        room: window.qaOld.room.save().error?.code,
        stroke: window.qaOld.stroke.start().error?.code,
        notify: window.qaOld.notify('saved', { key: 'old' }) === undefined,
        destroy: window.qaOld.core.destroy() === undefined,
        legacyDestroy: window.qaOld.destroy() === undefined,
        close: window.qaOld.close() === undefined,
      };
      off();
      return { results, late, same: window.stand.pet.getState() === before, mounted: window.stand.pet.mounted, name: window.stand.pet.getState().pets.cat.name.value };
    });
    await page.clock.runFor(100);
    check(`${label}: после нового подключения прежние методы и pet.core отвечают destroyed, legacy — undefined, новый экземпляр не тронут`, Object.values(old.results).every((value) => value === 'destroyed' || value === true) && JSON.stringify(old.late) === '["destroyed"]' && old.same && old.mounted && old.name === 'Пиксель' && (await nodes(page)) > 0, JSON.stringify(old));
    // Из слушателя pet.core — тоже полное отключение, без повторного входа.
    const inListener = await page.evaluate(() => {
      const pet = window.stand.pet;
      pet.core.subscribe((update) => update.reason === 'setPreferences' && pet.core.destroy(), { initial: false });
      const set = pet.setPreferences({ phrases: !pet.getState().prefs.phrases });
      return { ok: set.ok, mounted: pet.mounted, status: pet.core.status };
    });
    check(`${label}: pet.core.destroy() из слушателя pet.core — команда завершена, затем всё снято`, inListener.ok && !inListener.mounted && inListener.status === 'destroyed' && (await nodes(page)) === 0 && (await marks(page)).length === 0, JSON.stringify(inListener));
    // Legacy-событие без key (Р2) — по-прежнему принимается фасадом; публичный notify ядра требует key.
    await mount(page, 'cb', { marks: 1, today: 1 });
    const legacy = await page.evaluate(() => {
      const pet = window.stand.pet;
      return { old: pet.notify('saved', {}) === undefined, strict: pet.core.notify('saved', {}).error?.code, empty: pet.core.notify('saved', { key: '' }).error?.code };
    });
    await page.clock.runFor(100);
    check(`${label}: pet.notify('saved', {}) — как 0.1.4 (Р2); pet.core.notify без key — invalid-argument`, legacy.old && legacy.strict === 'invalid-argument' && legacy.empty === 'invalid-argument' && (await page.evaluate(() => document.querySelector('#cat-dock .cat-art')?.dataset.pose)) === 'joy', JSON.stringify(legacy));
    await page.evaluate(() => window.stand.pet.destroy());
    const look = await stored(page, 'ca:look:v1');
    check(`${label}: облик неизвестного животного в look цел после команд облика`, look['example.bunny'] === 'white' && look.dog === 'spotted' && look.cat === 'ginger', JSON.stringify(look));
    const own = (await keys(page)).every((key) => key === 'site:other' || key.startsWith('ca:') || key.startsWith('cb:'));
    check(`${label}: только свои ключи, чужой ключ сайта цел; ошибок страницы, отклонений и внешних запросов нет`, own && (await page.evaluate(() => localStorage.getItem('site:other'))) === FOREIGN && page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0 && outside.length === 0, JSON.stringify({ keys: await keys(page), errors: page.qaErrors, outside }));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

async function phone(browser, base, check, open, layout) {
  const label = 'команды 390×844';
  const { context, page, cdp } = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, init);
  const outside = watchNetwork(page, base);
  const touch = async (type, x, y) => {
    const send = () => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await sent(page, send);
  };
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    const baseline = await listeners(cdp);
    const gestureBase = await gestureListeners(cdp);
    await mount(page, 'cp', { marks: 1, today: 1, seed: { companion: { v: 1, kind: 'dog' } } });
    await call(page, 'setName', 'Батон');
    await page.clock.runFor(100);
    check(`${label}: pet.setName('Батон') — доступное имя кнопки в шапке без касания`, (await attr(page, '.cat-face', 'aria-label'))?.startsWith('Батон'), await attr(page, '.cat-face', 'aria-label'));
    await call(page, 'core.open', 'corner');
    await finishOpen(page);
    check(`${label}: pet.core.open('corner') — уголок, блокировка прокрутки`, (await view(page)).open && (await view(page)).lock);
    await layout(page, `${label}, уголок по команде`);
    await page.locator('[data-cat-play]').tap();
    // Отклик на имя доиграл — прямое действие не сменяет не менее важную реакцию.
    await page.clock.runFor(7000);
    const paw = await call(page, 'interact', { type: 'paw' });
    await page.clock.runFor(50);
    check(`${label}: «Поиграть» касанием, pet.interact({ type: 'paw' }) — «Батон даёт лапу.»`, paw.ok && paw.outcome === 'paw' && (await text(page, '[data-cat-play-hint]')) === 'Батон даёт лапу.', JSON.stringify(paw));
    await layout(page, `${label}, «Поиграть»`);
    await page.clock.runFor(61_000);
    const box = await rect(page, '[data-play-pet]');
    const [x, y] = [box.x + (box.width * 100) / 220, box.y + (box.height * 66) / 204];
    await touch('touchStart', x, y);
    await page.clock.runFor(200);
    await touch('touchMove', x + 30, y);
    const stroking = await page.evaluate(() => Boolean(document.querySelector('[data-play-pet][data-stroking]')));
    await call(page, 'hide');
    await page.clock.runFor(50);
    const hidden = { ...(await view(page)), stroking: await page.evaluate(() => Boolean(document.querySelector('[data-play-pet][data-stroking]'))), gesture: await gestureListeners(cdp), face: await page.locator('.cat-face').count() };
    await touch('touchEnd');
    check(`${label}: палец гладит, затем pet.hide() — жест снят ядром (захват и слушатели окна отпущены), диалог закрыт, питомца в шапке нет`, stroking && !hidden.open && !hidden.lock && !hidden.stroking && hidden.gesture === gestureBase && hidden.face === 0, JSON.stringify(hidden));
    await call(page, 'show');
    await call(page, 'setPresence', 'on-call');
    await page.clock.runFor(100);
    const lapka = await page.evaluate(() => document.querySelector('.cat-face')?.hasAttribute('data-cat-call') ?? false);
    await page.locator('.cat-face').tap();
    await page.clock.runFor(50);
    const called = await view(page);
    await call(page, 'core.close');
    await page.clock.runFor(50);
    check(`${label}: pet.setPresence('on-call') — лапка в шапке; касание — «Поиграть»; pet.core.close() — закрыто`, lapka && called.open && called.view === 'play' && !(await view(page)).open, JSON.stringify({ lapka, called }));
    await call(page, 'setPresence', 'always');
    await call(page, 'core.open', 'room');
    await finishOpen(page);
    await layout(page, `${label}, редактор по команде`);
    const cancelled = await call(page, 'room.cancel');
    await page.clock.runFor(50);
    check(`${label}: pet.core.open('room'), pet.room.cancel() — уголок, фокус на входе в редактор`, cancelled.ok && (await view(page)).view === '' && (await focusOn(page, '[data-cat-room]')), JSON.stringify(cancelled));
    await call(page, 'core.destroy');
    await page.clock.runFor(1000);
    const gone = { nodes: await nodes(page), marks: await marks(page), listeners: await listeners(cdp) };
    check(`${label}: pet.core.destroy() — ничего не осталось, слушатели как до подключения; ошибок и внешних запросов нет`, gone.nodes === 0 && gone.marks.length === 0 && gone.listeners.document === baseline.document && gone.listeners.window === baseline.window && page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0 && outside.length === 0, JSON.stringify({ gone, baseline, errors: page.qaErrors, outside }));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

async function narrow(browser, base, check, open, layout, viewport, label, kind) {
  const { context, page } = await open(browser, { viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, init);
  const outside = watchNetwork(page, base);
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    await mount(page, `cn${viewport.width}`, { marks: 1, today: 1, seed: kind === 'dog' ? { companion: { v: 1, kind: 'dog' } } : {} });
    const long = 'Ш'.repeat(24);
    await call(page, 'setName', long);
    const play = await call(page, 'core.open', 'play');
    await finishOpen(page);
    await page.clock.runFor(50);
    const head = await page.evaluate(() => ({ name: document.querySelector('[data-cat-play-name]')?.textContent, width: document.querySelector('.cat-play-head')?.scrollWidth - document.querySelector('.cat-play-head')?.clientWidth }));
    check(`${label}: длинное имя прямой командой, pet.core.open('play') из закрытого — заголовок сцены с именем без переполнения`, play.ok && head.name === long && head.width <= 0 && (await view(page)).view === 'play', JSON.stringify({ play, head }));
    // Долгое поглаживание командами: удержание довольной позы и итог; конец — покой и подсказка.
    await page.clock.runFor(61_000);
    const stroke = await call(page, 'stroke.start');
    const stepped = await call(page, 'stroke.step', stroke.id);
    await page.clock.runFor(1500);
    const held = { pose: await attr(page, '.cat-play .cat-art', 'data-pose'), hint: await text(page, '[data-cat-play-hint]') };
    await call(page, 'stroke.end', stroke.id);
    await page.clock.runFor(1000);
    const calm = { pose: await attr(page, '.cat-play .cat-art', 'data-pose'), hint: await text(page, '[data-cat-play-hint]') };
    const late = await call(page, 'stroke.step', stroke.id);
    check(`${label}: pet.stroke.start/step/end — поза «pet» держится после отклика, итог под сценой; конец — покой и подсказка; поздний шаг — no-gesture`, stroke.ok && stepped.outcome === 'pet' && stepped.announced && held.pose === 'pet' && held.hint.endsWith(kind === 'dog' ? 'виляет хвостом.' : 'мурлычет.') && calm.pose !== 'pet' && calm.hint === 'Проведи по питомцу, чтобы погладить' && late.error?.code === 'no-gesture', JSON.stringify({ stroke, stepped, held, calm, late }));
    await layout(page, `${label}, «Поиграть» по команде`);
    await call(page, 'core.open', 'room');
    await page.clock.runFor(50);
    await call(page, 'room.select', kind === 'dog' ? 'rope' : 'yarn');
    const step = await call(page, 'room.nudge', 'right');
    await layout(page, `${label}, редактор по команде`);
    const saved = await call(page, 'room.save');
    await page.clock.runFor(100);
    check(`${label}: из «Поиграть» в редактор, шаг и «Сохранить» командами — уголок с итогом`, step.ok && saved.ok && saved.closed && (await text(page, '[data-cat-room-done]')) === 'Расстановка сохранена.' && (await view(page)).view === '', JSON.stringify({ step, saved }));
    await call(page, 'core.destroy');
    check(`${label}: pet.core.destroy() — ничего не осталось; ошибок и внешних запросов нет`, (await nodes(page)) === 0 && (await marks(page)).length === 0 && page.qaErrors.length === 0 && (await page.evaluate(() => window.qaRejections.length)) === 0 && outside.length === 0, JSON.stringify({ errors: page.qaErrors, outside }));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}
