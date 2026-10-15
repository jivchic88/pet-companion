// Реакции и время на ядре (PL04.1) в Chrome: настоящий mountPet на стенде, часы — page.clock, случайность — подмена
// Math.random (порт random ядра по умолчанию). Р1 настоящими кнопками «Скрыть» (настройки уголка) и «Показать …» (у логотипа
// и в меню сайта на телефоне): повтор события, причины тишины сайта и пауза повтора ожидания переживают скрытие —
// регрессия падает на прежнем коде (новый режиссёр при «Скрыть»). Приветствие через 0,9 с; облако реплики и его срок;
// тишина таймера и диктовки с отложенной реакцией; фон и возврат (реакция и облако сняты, дремота после долгого
// отсутствия, без приветствия; таймер или диктовка сайта, кончившиеся в фоне, не запускают отложенную ни в фоне, ни при
// возврате — регрессия падает на коде до доработки PL04.1); пробуждение действием; системное «уменьшить движение» на ходу (выбор владельца не
// меняется); моргание по заданной случайности; местная полночь (карточка лакомства открытого уголка); готовое имя — named,
// выбор собаки — meet; «Приходит по зову» — закрыт ничего не играет. Чужой ключ localStorage, внешние запросы, ошибки
// страницы, горизонтальная прокрутка — на компьютере 1280×900 и телефоне 390×844. Запуск — в составе npm run test:browser.
// Банки реплик — через pet-rules.mjs (реэкспорт ядра; тот же вход и у кода до PL04.1 — для проверки регрессии на нём).
import { PHRASES } from './legacy-rules.mjs';

// Только QA: чужой ключ сайта до подключения (модуль его не трогает).
function foreignKey() {
  if (!localStorage.getItem('site:other')) localStorage.setItem('site:other', '{"keep":1}');
}

const pose = (page, selector) => page.evaluate((s) => document.querySelector(s)?.dataset.pose ?? '', selector);
const bubble = (page) => page.evaluate(() => ({ on: Boolean(document.querySelector('#cat-dock .cat-dock-say.is-saying')), text: document.querySelector('#cat-dock .cat-bubble')?.textContent ?? '' }));
const stored = (page, ns, name) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), `${ns}:${name}:v1`);
// Все рисунки питомца и облако на любом месте (боковая панель, док, плавающее).
const arts = (page) => page.evaluate(() => ({ poses: [...document.querySelectorAll('.cat-art[data-cat-managed]')].map((el) => el.dataset.pose), saying: document.querySelectorAll('.is-saying').length > 0 }));
const calmArts = (shot) => shot.poses.length > 0 && !shot.poses.includes('joy') && !shot.saying;
const notify = (page, type, detail = null) => page.evaluate(([t, d]) => window.stand.pet.notify(t, d), [type, detail]);
const DOCK = '#cat-dock .cat-art';

// Видимость вкладки — как у браузера: document.hidden и событие visibilitychange.
const tab = (page, hidden) =>
  page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

async function hideShowDesktop(page) {
  await page.locator('#cat-dock .cat-dock-btn').click();
  await page.locator('.cat-settings > summary').click();
  await page.locator('[data-cat-hide]').click();
  await page.clock.runFor(100);
  await page.locator('#cat-side [data-cat-return]').click();
  await page.clock.runFor(100);
}

function watchNetwork(page, base) {
  const outside = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:')) outside.push(url);
  });
  return outside;
}

export async function lifeQa(browser, base, check, open, layout) {
  const label = 'реакции и время 1280×900';
  const ns = 'life1';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, foreignKey);
  const outside = watchNetwork(page, base);
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    await page.evaluate((storage) => window.stand.mount({ storage }), ns);
    // Приветствие дня — задача ядра через 0,9 с.
    await page.clock.runFor(800);
    const early = await pose(page, DOCK);
    await page.clock.runFor(200);
    const greet = { pose: await pose(page, DOCK), bubble: await bubble(page) };
    check(`${label}: приветствие — через 0,9 с, поза и облако из банка «привет»`, early === 'calm' && greet.pose === 'greet' && greet.bubble.on && PHRASES.greet.includes(greet.bubble.text), JSON.stringify({ early, greet }));
    check(`${label}: день приветствия записан один раз (ядро)`, (await stored(page, ns, 'cat'))?.greetDay === '2026-10-11');
    await page.clock.runFor(3500);
    check(`${label}: облако гаснет через 3,2 с`, !(await bubble(page)).on);

    // Занятие K — радость; доиграла.
    await page.evaluate(() => window.stand.set(1, 1));
    await notify(page, 'saved', { key: 'K', counted: true });
    const joy = { pose: await pose(page, DOCK), bubble: await bubble(page) };
    check(`${label}: занятие — радость и реплика радости`, joy.pose === 'joy' && joy.bubble.on && [...PHRASES.joy, ...PHRASES.joyTreat].includes(joy.bubble.text), JSON.stringify(joy));
    await page.clock.runFor(1600);
    check(`${label}: радость доиграла — покой`, (await pose(page, DOCK)) === 'calm');
    await page.clock.runFor(3000);

    // Новая ступень: радость → новая вещь; «Освоился» — примерка платка (data-acc), «Наш ритуал» — кружка рядом.
    const extras = () => page.evaluate(() => ({ pose: document.querySelector('#cat-dock .cat-art').dataset.pose, acc: document.querySelector('#cat-dock .cat-art').dataset.acc, mini: document.querySelector('#cat-dock .cat-dock-mini')?.classList.contains('is-on') ?? false, item: document.querySelector('#cat-dock .cat-dock-mini svg') ? 'svg' : '' }));
    await page.evaluate(() => window.stand.set(3, 2));
    await notify(page, 'saved', { key: 'S1', counted: true });
    await page.clock.runFor(1600);
    const plaid = await extras();
    await page.clock.runFor(2500);
    const worn = await extras();
    await page.evaluate(() => window.stand.set(9, 3));
    await notify(page, 'saved', { key: 'S2', counted: true });
    await page.clock.runFor(1600);
    const mug = await extras();
    await page.clock.runFor(2500);
    const gone = await extras();
    check(`${label}: новая вещь — примерка платка и вещь рядом на время реакции ядра, затем сняты`, plaid.pose === 'unlock' && plaid.acc === 'plaid' && !plaid.mini && worn.pose === 'calm' && worn.acc === 'scarf' && mug.pose === 'unlock' && mug.mini && mug.item === 'svg' && !gone.mini, JSON.stringify({ plaid, worn, mug, gone }));
    await page.clock.runFor(3000);

    // Р1: «Скрыть» и «Показать» настоящими кнопками — тот же K второй раз не играет, новый K2 — играет.
    await hideShowDesktop(page);
    const back = await page.evaluate(() => ({ dock: Boolean(document.querySelector('#cat-dock .cat-dock-btn')), focus: document.activeElement?.className ?? '' }));
    check(`${label}: «Скрыть» → «Показать …» у логотипа — питомец снова в боковой панели`, back.dock && (await stored(page, ns, 'cat'))?.hidden === false, JSON.stringify(back));
    await notify(page, 'saved', { key: 'K', counted: true });
    await page.clock.runFor(100);
    const repeat = { pose: await pose(page, DOCK), bubble: await bubble(page) };
    check(`${label}: Р1 — тот же K после «Скрыть»/«Показать» реакции не даёт (прежде — радость снова)`, repeat.pose === 'calm' && !repeat.bubble.on, JSON.stringify(repeat));
    await notify(page, 'saved', { key: 'K2', counted: true });
    check(`${label}: новый K2 — радость`, (await pose(page, DOCK)) === 'joy');
    await page.clock.runFor(5000);

    // Р1: тишина таймера сайта переживает «Скрыть»/«Показать».
    await page.evaluate(() => window.stand.pet.update({ timer: true }));
    await hideShowDesktop(page);
    await notify(page, 'saved', { key: 'K3', counted: true });
    const quiet = await pose(page, DOCK);
    await page.evaluate(() => window.stand.pet.update({ timer: false }));
    const after = await pose(page, DOCK);
    check(`${label}: Р1 — таймер сайта до «Скрыть» действует после «Показать»: внимание, затем отложенная радость`, quiet === 'attentive' && after === 'joy', `${quiet} → ${after}`);
    await page.clock.runFor(5000);

    // Р1: пауза повтора ожидания (10 с) переживает «Скрыть»/«Показать».
    await notify(page, 'failed');
    const wait = await pose(page, DOCK);
    await page.clock.runFor(1100);
    await hideShowDesktop(page);
    await notify(page, 'failed');
    const again = await pose(page, DOCK);
    check(`${label}: Р1 — пауза повтора ожидания помнится`, wait === 'wait' && again === 'calm', `${wait} → ${again}`);
    await page.clock.runFor(10_000);

    // Диктовка: две причины тишины сайта независимы.
    await page.evaluate(() => window.stand.pet.update({ dictation: true, timer: true }));
    await notify(page, 'saved', { key: 'K4', counted: true });
    await page.evaluate(() => window.stand.pet.update({ timer: false }));
    const still = await pose(page, DOCK);
    await page.evaluate(() => window.stand.pet.update({ dictation: false }));
    check(`${label}: снятие таймера не снимает диктовку; снята последняя — отложенная радость`, still === 'attentive' && (await pose(page, DOCK)) === 'joy', still);

    // Фон: реакция и облако сняты, ничего не доигрывается; возврат после 3+ мин — дремота, без приветствия.
    await tab(page, true);
    const paused = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('cat-paused'), pose: document.querySelector('#cat-dock .cat-art').dataset.pose, saying: Boolean(document.querySelector('.cat-dock-say.is-saying')) }));
    check(`${label}: фон — реакция и облако сняты`, paused.cls && paused.pose === 'calm' && !paused.saying, JSON.stringify(paused));
    await page.clock.runFor(200_000);
    await tab(page, false);
    const returned = await pose(page, DOCK);
    await page.clock.runFor(1000);
    check(`${label}: возврат после 3+ мин — дремота, без приветствия`, returned === 'rest' && (await pose(page, DOCK)) === 'rest', returned);
    await page.locator('#site-main').click({ position: { x: 5, y: 5 } });
    check(`${label}: действие пользователя будит`, (await pose(page, DOCK)) === 'calm');

    // Фон удерживает запрет (доработка по независимой проверке): радость ждёт таймера сайта, таймер кончился, пока вкладка
    // в фоне, — ни реакции, ни облака в фоне, при возврате и через 60 с (прежде — радость); новое событие после — радость.
    await page.evaluate(() => window.stand.pet.update({ timer: true }));
    await notify(page, 'saved', { key: 'B1', counted: true });
    const held = await arts(page);
    await tab(page, true);
    await page.evaluate(() => window.stand.pet.update({ timer: false }));
    const away = await arts(page);
    await tab(page, false);
    const home = await arts(page);
    await page.clock.runFor(61_000);
    const late = await arts(page);
    await notify(page, 'saved', { key: 'B2', counted: true });
    const fresh = await pose(page, DOCK);
    check(`${label}: фон — таймер сайта кончился в фоне: отложенная радость не играет ни в фоне, ни при возврате, ни через 60 с; новое событие — радость`, held.poses.every((p) => p === 'attentive') && [away, home, late].every(calmArts) && fresh === 'joy', JSON.stringify({ held, away, home, late, fresh }));
    await page.clock.runFor(5000);

    // Системное «уменьшить движение» на ходу: режим ядра none, выбор владельца не меняется; снятие — моргание по заданной
    // случайности (Math.random = 0 → 12 с).
    // Событие change медиазапроса браузер шлёт на шаге отрисовки — ждём его итог (условие, а не пауза).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.documentElement.dataset.catMotion === 'none').catch(() => {});
    const reduced = await page.evaluate(() => ({ html: document.documentElement.dataset.catMotion, art: document.querySelector('#cat-dock .cat-art').dataset.motion }));
    check(`${label}: «уменьшить движение» на ходу — без анимации, настройка владельца прежняя`, reduced.html === 'none' && reduced.art === 'none' && (await stored(page, ns, 'cat'))?.motion === undefined, JSON.stringify(reduced));
    await page.evaluate(() => {
      window.qaRandom = Math.random;
      Math.random = () => 0;
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.documentElement.dataset.catMotion === 'normal').catch(() => {});
    await page.clock.runFor(11_990);
    const before = await page.evaluate(() => document.querySelector('#cat-dock .cat-art').dataset.micro ?? '');
    await page.clock.runFor(20);
    const blink = await page.evaluate(() => document.querySelector('#cat-dock .cat-art').dataset.micro ?? '');
    await page.clock.runFor(300);
    const done = await page.evaluate(() => document.querySelector('#cat-dock .cat-art').dataset.micro ?? '');
    await page.evaluate(() => (Math.random = window.qaRandom));
    check(`${label}: снято — обычное движение; моргание через 12 с (random 0) на 260 мс`, before === '' && blink === 'blink' && done === '', JSON.stringify({ before, blink, done }));

    // Местная полночь: уголок открыт, лакомство дня съедено; у сайта новый день — карточка снова ждёт занятия.
    await page.evaluate(() => window.stand.set(5, 2));
    await page.locator('#cat-dock .cat-dock-btn').click();
    await page.locator('[data-cat-feed]').click();
    const fed = await page.evaluate(() => document.querySelector('[data-cat-treat]')?.dataset.state);
    // У сайта к полуночи — новый день без занятий (progress стенда читает его счёт); в тот же день лакомство остаётся
    // съеденным.
    await page.evaluate(() => window.stand.set(5, 0));
    const stillFed = await page.evaluate(() => document.querySelector('[data-cat-treat]')?.dataset.state);
    const ms = await page.evaluate(() => new Date(2026, 9, 12).getTime() - Date.now());
    await page.clock.fastForward(ms + 1000);
    const night = await page.evaluate(() => document.querySelector('[data-cat-treat]')?.dataset.state);
    check(`${label}: местная полночь — карточка лакомства открытого уголка снова ждёт занятия`, fed === 'fed' && stillFed === 'fed' && night === 'waiting', JSON.stringify({ fed, stillFed, night }));

    // Готовое имя — named; выбор собаки — meet; реплики — под сценой уголка.
    await page.clock.runFor(5000);
    await page.locator('[data-cat-names] [data-cat-name-pick]').first().click();
    const named = await page.evaluate(() => ({ pose: document.querySelector('#cat-dock .cat-art').dataset.pose, said: document.querySelector('.cat-stage-wrap [data-cat-phrase] span')?.textContent ?? '' }));
    check(`${label}: готовое имя — отклик named, реплика под сценой`, named.pose === 'greet' && PHRASES.named.includes(named.said), JSON.stringify(named));
    await page.clock.runFor(2000);
    await page.locator('.cat-kind-option:has(input[value="dog"])').click();
    const met = await page.evaluate(() => ({ kind: document.querySelector('#cat-dock .cat-art').dataset.kind, pose: document.querySelector('#cat-dock .cat-art').dataset.pose }));
    check(`${label}: выбор собаки — meet`, met.kind === 'dog' && met.pose === 'greet', JSON.stringify(met));
    await page.keyboard.press('Escape');
    await page.clock.runFor(3000);

    check(`${label}: чужой ключ localStorage не тронут`, (await page.evaluate(() => localStorage.getItem('site:other'))) === '{"keep":1}');
    check(`${label}: без внешних сетевых запросов`, outside.length === 0, outside.join(', '));
    await layout(page, label);
    check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }

  // Телефон: «Показать кота» в меню сайта; Р1 — повтор и диктовка; «Приходит по зову» — закрыт ничего не играет.
  const phone = 'реакции и время 390×844';
  const mobile = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, foreignKey);
  const away = watchNetwork(mobile.page, base);
  const m = mobile.page;
  try {
    await m.goto(`${base}?manual`);
    await m.waitForFunction(() => Boolean(window.stand));
    await m.evaluate(() => window.stand.mount({ storage: 'life2' }));
    await m.clock.runFor(4000);
    await m.evaluate(() => window.stand.set(1, 1));
    await notify(m, 'saved', { key: 'P', counted: true });
    const joy = await pose(m, '.cat-face .cat-art');
    await m.clock.runFor(2000);
    await m.evaluate(() => window.stand.pet.update({ dictation: true }));
    const hideShow = async () => {
      await m.locator('.cat-face').tap();
      await m.locator('.cat-settings summary').tap();
      await m.locator('[data-cat-hide]').tap();
      await m.clock.runFor(100);
      await m.locator('#site-menu').tap();
      await m.evaluate(() => {
        window.qaMenuClosed = new Promise((resolve) => document.getElementById('site-dialog').addEventListener('close', resolve, { once: true }));
      });
      await m.locator('.cat-sections-return button').tap();
      await m.evaluate(() => window.qaMenuClosed);
      await m.clock.runFor(50);
    };
    await hideShow();
    await notify(m, 'saved', { key: 'P', counted: true });
    const repeat = await pose(m, '.cat-face .cat-art');
    await notify(m, 'saved', { key: 'P2', counted: true });
    const held = await pose(m, '.cat-face .cat-art');
    await m.evaluate(() => window.stand.pet.update({ dictation: false }));
    const played = await pose(m, '.cat-face .cat-art');
    check(`${phone}: Р1 — «Показать кота» из меню сайта: тот же P без реакции, диктовка действует, P2 — после неё`, joy === 'joy' && repeat === 'attentive' && held === 'attentive' && played === 'joy', JSON.stringify({ joy, repeat, held, played }));
    await m.clock.runFor(3000);
    // Фон удерживает запрет: диктовка кончилась, пока вкладка в фоне, — отложенная радость не играет ни в фоне, ни при
    // возврате, ни через 60 с (прежде — радость).
    await m.evaluate(() => window.stand.pet.update({ dictation: true }));
    await notify(m, 'saved', { key: 'PB', counted: true });
    const waiting = await arts(m);
    await tab(m, true);
    await m.evaluate(() => window.stand.pet.update({ dictation: false }));
    const inBackground = await arts(m);
    await tab(m, false);
    const onReturn = await arts(m);
    await m.clock.runFor(61_000);
    const minuteLater = await arts(m);
    check(`${phone}: фон — диктовка кончилась в фоне: отложенная радость не играет ни в фоне, ни при возврате, ни через 60 с`, waiting.poses.every((p) => p === 'attentive') && [inBackground, onReturn, minuteLater].every(calmArts), JSON.stringify({ waiting, inBackground, onReturn, minuteLater }));
    // «Приходит по зову»: закрыт — событие без реакции, вызов — сразу «Поиграть», закрыли — ничего не доигрывает.
    await m.locator('.cat-face').tap();
    await m.locator('.cat-presence label:has(input[value="on-call"])').tap();
    await m.keyboard.press('Escape');
    await m.clock.runFor(100);
    await notify(m, 'saved', { key: 'C', counted: true });
    const call = await m.evaluate(() => ({ call: document.documentElement.hasAttribute('data-pet-call'), arts: document.querySelectorAll('.cat-art[data-cat-managed]').length }));
    await m.locator('.cat-face').tap();
    await m.locator('[data-cat-play-pet]').tap();
    const stroke = await pose(m, '.cat-play .cat-art');
    await m.locator('[data-cat-play-close]').tap();
    await m.clock.runFor(60_000);
    const closed = await m.evaluate(() => ({ open: document.getElementById('cat-sheet').open, arts: document.querySelectorAll('.cat-art[data-cat-managed]').length }));
    check(`${phone}: «по зову» — закрыт без рисунка и реакции, вызван — поглаживание в «Поиграть», закрыли — ничего`, call.call && call.arts === 0 && stroke === 'pet' && !closed.open && closed.arts === 0, JSON.stringify({ call, stroke, closed }));
    check(`${phone}: чужой ключ localStorage не тронут`, (await m.evaluate(() => localStorage.getItem('site:other'))) === '{"keep":1}');
    check(`${phone}: без внешних сетевых запросов`, away.length === 0, away.join(', '));
    await layout(m, phone);
    check(`${phone}: ошибок страницы и предупреждений модуля нет`, m.qaErrors.length === 0, m.qaErrors.join(' | '));
  } catch (error) {
    check(`${phone}: сценарий выполнен`, false, error.stack);
  } finally {
    await mobile.context.close();
  }
}
