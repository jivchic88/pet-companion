// Пример минимального режима в Chrome (U01): страница examples/character/index.html как есть — два робота в контейнерах
// стороннего продукта только публичными входами pet-companion/character и /character-web; свой мини-сервер отдаёт папку
// примера (/character/) и файлы пакета по адресу установленного архива (/node_modules/pet-companion/pet/…). Сценарий —
// кнопками продукта: подтверждённое событие обоим роботам (реакция, реплика продукта, объявление скринридеру), нажатие на
// робота-кнопку с клавиатуры (Enter), тишина при вводе в поле страницы и отложенная реакция после ухода из поля, имя от
// продукта, «уменьшить движение» (эмуляция медиазапроса), вкладка в фоне, отключение робота А (элемент, слушатели,
// команды — destroyed; робот Б живёт) и повторное подключение, отказ неполного набора и неизвестной настройки до любых
// действий. Структурно: сервер не отдал ни одного файла полного режима (экземпляр ядра, хранение, комната, игра, оболочка
// уголка, стили кота и собаки) — комната персонажу не нужна и не грузится; ни localStorage, ни IndexedDB. Компьютер
// 1280×900 и узкий экран 320×740 (без горизонтальной прокрутки). Часы — page.clock. Запуск — в составе npm run test:browser.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
// Файлы полного режима, которых минимальный режим не грузит.
export const FULL_ONLY = ['core/index.mjs', 'core/session.mjs', 'core/storage.mjs', 'core/room.mjs', 'core/play.mjs', 'core/editor.mjs', 'core/toys.mjs', 'core/scenes.mjs', 'core/presence.mjs', 'core/catalog.mjs', 'core/facade.mjs', 'web/shell.mjs', 'web/view.mjs', 'web/kits.mjs', 'web/storage.mjs', 'web/scenes.mjs', 'pet.mjs', 'web.mjs', 'cat-art.mjs', 'dog-art.mjs', 'pet.css', 'dog.css', 'pet-base.css', 'web/view.css'];
export const CHARACTER_FILES = ['character.mjs', 'character-web.mjs', 'character/core.mjs', 'character/define.mjs', 'character/view.mjs', 'character/view.css', 'core/director.mjs', 'core/phrases.mjs', 'core/ports.mjs', 'core/round.mjs', 'core/define.mjs', 'web/parts.mjs'];

function serve() {
  const served = [];
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://stand');
    if (pathname === '/favicon.ico') return res.writeHead(204).end();
    const own = /^\/character\/([\w-]+\.(mjs|css|html))?$/.exec(pathname);
    const pkg = /^\/node_modules\/pet-companion\/pet\/((?:[\w-]+\/)*[\w-]+\.(mjs|css))$/.exec(pathname);
    const file = own ? path.join(root, 'examples', 'character', own[1] ?? 'index.html') : pkg ? path.join(root, 'pet', pkg[1]) : '';
    try {
      if (!file) throw new Error('нет');
      const body = await readFile(file);
      served.push(pkg ? pkg[1] : `character/${own[1] ?? 'index.html'}`);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)], 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ base: `http://127.0.0.1:${server.address().port}/`, served, close: () => new Promise((done) => server.close(done)) })));
}

// Только QA: случайность задана (реплики предсказуемы), необработанные отклонения.
function init() {
  Math.random = () => 0.5;
  window.qaRejections = [];
  window.addEventListener('unhandledrejection', (event) => window.qaRejections.push(String(event.reason)));
}

function watchNetwork(page, base) {
  const outside = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:')) outside.push(url);
  });
  return outside;
}

// Что видно у робота: контейнер → свой элемент → теневое дерево.
const info = (page) =>
  page.evaluate(() => {
    const look = (id) => {
      const host = document.querySelector(`#${id} [data-pet-character]`);
      const shadow = host?.shadowRoot;
      const box = shadow?.querySelector('.pet-character');
      const figure = shadow?.querySelector('.pet-character-figure');
      const art = shadow?.querySelector('svg');
      return host
        ? {
            hosts: document.querySelectorAll(`#${id} [data-pet-character]`).length,
            hidden: Boolean(box?.hidden),
            tag: figure?.tagName.toLowerCase() ?? '',
            role: figure?.getAttribute('role') ?? '',
            label: figure?.getAttribute('aria-label') ?? '',
            pose: art?.dataset.pose ?? '',
            micro: art?.dataset.micro ?? '',
            motion: host.getAttribute('data-pet-motion'),
            paused: host.hasAttribute('data-pet-paused'),
            bubble: shadow.querySelector('.pet-character-say')?.hidden ? '' : (shadow.querySelector('.pet-character-bubble')?.textContent ?? ''),
            live: shadow.querySelector('.pet-character-live')?.textContent ?? '',
            links: [...shadow.querySelectorAll('link')].map((link) => new URL(link.href).pathname),
            width: art?.getBoundingClientRect().width ?? 0,
            boxWidth: host.parentElement.getBoundingClientRect().width,
          }
        : { hosts: 0 };
    };
    const a = window.demoCharacters?.a.view;
    const b = window.demoCharacters?.b;
    const snap = (core) => (core ? { status: core.status, pose: core.getState().pose.shown, base: core.getState().pose.base, name: core.getState().name.display, motion: core.getState().prefs.effectiveMotion, visible: core.getState().visible, quiet: core.getState().context.quiet } : null);
    return { a: { ...look('robot-a'), mounted: Boolean(a?.mounted), core: snap(a?.core) }, b: { ...look('robot-b'), mounted: Boolean(b?.mounted), core: snap(b?.core) }, status: document.getElementById('status').textContent, score: document.getElementById('score').textContent, keys: Object.keys(localStorage) };
  });

const ready = (page) => page.waitForFunction(() => window.demoCharacters?.b.core && ['robot-a', 'robot-b'].every((id) => document.querySelector(`#${id} [data-pet-character]`)?.shadowRoot?.querySelector('.pet-character')?.hidden === false));
const CHROME_FOCUS = 'document.querySelector("#robot-a [data-pet-character]").shadowRoot.querySelector("button")';

// Слушатели document и window (CDP) — у страницы с двумя роботами и после отключения одного.
async function listeners(cdp) {
  const count = async (expression) => {
    const { result } = await cdp.send('Runtime.evaluate', { expression });
    return result.objectId ? (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners.length : 0;
  };
  return { document: await count('document'), window: await count('window') };
}

export async function characterQa(browser, check, open, layout) {
  const server = await serve();
  try {
    await desktop(browser, server, check, open, layout);
    await narrow(browser, server, check, open, layout);
  } finally {
    await server.close();
  }
}

async function desktop(browser, server, check, open, layout) {
  const label = 'персонаж 1280×900';
  const { base } = server;
  const { context, page, cdp } = await open(browser, { viewport: { width: 1280, height: 900 } }, init);
  const outside = watchNetwork(page, base);
  try {
    await page.goto(`${base}character/`);
    await ready(page);
    const start = await info(page);
    check(`${label}: два робота в контейнерах — рисунки набора в теневых деревьях, покой calm, А — кнопка с подписью продукта, Б — рисунок с именем и названием; стили вида и набора — в теневом дереве`, start.a.hosts === 1 && start.b.hosts === 1 && start.a.pose === 'calm' && start.b.pose === 'calm' && start.a.tag === 'button' && start.a.label === 'Бип: нажмите, чтобы поздороваться' && start.b.tag === 'div' && start.b.role === 'img' && start.b.label === 'Боб — Робот' && start.a.links.some((href) => href.endsWith('/pet/character/view.css')) && start.a.links.some((href) => href.endsWith('/character/robot.css')) && start.a.motion === 'normal' && !start.a.paused && start.a.core.visible === true, JSON.stringify(start));
    const served = server.served.slice();
    check(`${label}: загружены только файлы минимального режима (входы character, character-web и их граф) — ни одного файла полного режима: экземпляра ядра, хранения, комнаты, игры, оболочки уголка, рисунков и стилей кота и собаки`, CHARACTER_FILES.every((file) => served.includes(file)) && FULL_ONLY.every((file) => !served.includes(file)), served.join(', '));
    const before = await listeners(cdp);

    // ---- Подтверждённое событие продукта — обоим роботам ----
    await page.click('#done');
    await page.clock.runFor(100);
    const done = await info(page);
    check(`${label}: «Задача выполнена» — продукт посчитал очки сам, оба робота в позе happy; реплика А — из группы с именем продукта, Б — текст продукта этого случая; объявление скринридеру — в своей области aria-live`, done.score === '10' && done.a.pose === 'happy' && done.b.pose === 'happy' && done.a.bubble === 'Бип отметил: сделано.' && done.b.bubble === 'Задача 1 — есть!' && done.a.live === 'Бип отметил: сделано.' && done.b.live === 'Задача 1 — есть!' && done.status === 'done: А играет, Б играет', JSON.stringify(done));
    await page.clock.runFor(1700);
    const after = await info(page);
    await page.clock.runFor(600);
    const faded = await info(page);
    check(`${label}: через 1,6 с — снова calm, облако держится 2,2 с (timings.phrase описания) и гаснет`, after.a.pose === 'calm' && after.b.pose === 'calm' && after.a.bubble === 'Бип отметил: сделано.' && faded.a.bubble === '' && faded.b.bubble === '', JSON.stringify({ after, faded }));

    // ---- Клавиатура: робот А — кнопка, Enter — действие продукта (приветствие) ----
    await page.evaluate((expr) => eval(expr).focus(), CHROME_FOCUS);
    const focusedA = await page.evaluate((expr) => document.activeElement?.shadowRoot?.activeElement === eval(expr), CHROME_FOCUS);
    await page.keyboard.press('Enter');
    await page.clock.runFor(100);
    const wave = await info(page);
    check(`${label}: фокус на роботе А с клавиатуры, Enter — поза wave и реплика приветствия; робот Б не тронут`, focusedA && wave.a.pose === 'wave' && wave.a.bubble === 'Бип на связи.' && wave.b.pose === 'calm' && wave.b.bubble === '', JSON.stringify({ focusedA, wave }));
    await page.clock.runFor(1500);

    // ---- Тишина при вводе на странице: реакция отложена, играет после ухода из поля ----
    await page.click('#note');
    await page.keyboard.type('план');
    await page.clock.runFor(50);
    const typing = await info(page);
    await page.click('#done');
    await page.clock.runFor(100);
    const held = await info(page);
    await page.click('#score');
    await page.clock.runFor(400);
    const released = await info(page);
    check(`${label}: ввод в поле страницы — оба робота в позе внимания, тишина typing; событие продукта отложено (статус «отложено»); уход из поля — отложенная реакция играет у обоих`, typing.a.pose === 'attentive' && typing.b.pose === 'attentive' && typing.a.core.quiet.join() === 'typing' && held.a.pose === 'attentive' && held.status === 'done: А отложено, Б отложено' && released.a.pose === 'happy' && released.b.pose === 'happy' && released.a.core.quiet.length === 0, JSON.stringify({ typing, held, released }));
    await page.clock.runFor(2500);

    // ---- Имя от продукта: подпись и реплика ----
    await page.fill('#name', 'Зум');
    await page.click('#score');
    await page.clock.runFor(300);
    // Выбор реплики не повторяет только что сказанную: два подтверждения подряд — вторая реплика снова с именем.
    await page.click('#done');
    await page.clock.runFor(100);
    const renamed = await info(page);
    await page.clock.runFor(2500);
    await page.click('#done');
    await page.clock.runFor(100);
    const named = await info(page);
    const DONE = ['Готово!', 'Зум отметил: сделано.', 'Ещё один шаг.'];
    check(`${label}: имя от продукта — подпись кнопки и реплики с новым именем (без повтора только что сказанной), без пересоздания робота`, renamed.a.core.name === 'Зум' && renamed.a.label === 'Зум: нажмите, чтобы поздороваться' && DONE.includes(renamed.a.bubble) && DONE.includes(named.a.bubble) && named.a.bubble !== renamed.a.bubble && [renamed.a.bubble, named.a.bubble].includes('Зум отметил: сделано.') && named.a.hosts === 1, JSON.stringify({ renamed, named }));
    await page.clock.runFor(2500);

    // ---- Уменьшить движение (система) ----
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('#robot-b [data-pet-character]').getAttribute('data-pet-motion') === 'none');
    const reduced = await info(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelector('#robot-b [data-pet-character]').getAttribute('data-pet-motion') === 'normal');
    const restored = await info(page);
    check(`${label}: «уменьшить движение» — у обоих роботов motion none (атрибут своего элемента и снимок), возврат — normal`, reduced.a.motion === 'none' && reduced.b.motion === 'none' && reduced.a.core.motion === 'none' && restored.a.motion === 'normal' && restored.b.core.motion === 'normal', JSON.stringify({ reduced, restored }));

    // ---- Вкладка в фоне: не на виду, анимации стоят; возврат ----
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(50);
    const hidden = await info(page);
    await page.click('#done');
    await page.clock.runFor(100);
    const inBackground = await info(page);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(50);
    const back = await info(page);
    check(`${label}: вкладка в фоне — роботы не на виду (visible false, пауза анимаций), событие в фоне не играет и не доигрывается после возврата; возврат — снова на виду`, hidden.a.core.visible === false && hidden.a.paused && inBackground.a.pose === 'calm' && inBackground.status === 'done: А нет, Б нет' && back.a.core.visible === true && !back.a.paused && back.a.pose === 'calm', JSON.stringify({ hidden, inBackground, back }));

    // ---- Отключение робота А: элемент, слушатели, команды; Б живёт; повторное подключение ----
    await page.click('#off');
    await page.clock.runFor(50);
    const off = await info(page);
    const afterOff = await listeners(cdp);
    const reactOff = await page.evaluate(() => window.demoCharacters.a.view.core.react('done'));
    await page.click('#hello');
    await page.clock.runFor(100);
    const helloB = await info(page);
    check(`${label}: «Отключить А» — свой элемент убран, mounted false, команды — destroyed, слушателей document и window меньше; робот Б живёт («Поздороваться (Б)» — wave)`, off.a.hosts === 0 && off.a.mounted === false && off.a.core.status === 'destroyed' && reactOff.ok === false && reactOff.error.code === 'destroyed' && afterOff.document < before.document && helloB.b.pose === 'wave' && helloB.b.mounted, JSON.stringify({ off, afterOff, before, reactOff, helloB }));
    await page.clock.runFor(1500);
    await page.click('#on');
    await ready(page);
    const afterOn = await listeners(cdp);
    await page.click('#done');
    await page.clock.runFor(100);
    const again = await info(page);
    check(`${label}: «Подключить А» — новый экземпляр с именем продукта, слушатели как у двух роботов, событие играет у обоих`, again.a.hosts === 1 && again.a.mounted && again.a.core.name === 'Зум' && again.a.pose === 'happy' && again.b.pose === 'happy' && afterOn.document === before.document && afterOn.window === before.window, JSON.stringify({ again, afterOn, before }));
    await page.clock.runFor(2500);

    // ---- Отказы до действий: неполный набор, неизвестная настройка ----
    const refusals = await page.evaluate(async () => {
      const { mountCharacterIn } = await import('/node_modules/pet-companion/pet/character-web.mjs');
      const { robot } = await import('/character/robot.mjs');
      const { robotWeb } = await import('/character/robot-web.mjs');
      const box = document.createElement('div');
      document.body.append(box);
      const errors = [];
      const original = console.error;
      console.error = (...args) => errors.push(args.map(String).join(' '));
      try {
        const partial = mountCharacterIn(box, { character: robot, kit: { ...robotWeb, poses: ['calm'] } });
        const unknown = mountCharacterIn(box, { character: robot, kit: robotWeb, zone: 1 });
        const noRoomFormat = mountCharacterIn(box, { character: { ...robot, room: {} }, kit: robotWeb });
        return { partial: partial.mounted, unknown: unknown.mounted, noRoomFormat: noRoomFormat.mounted, core: [partial.core, unknown.core, noRoomFormat.core], children: box.children.length, errors };
      } finally {
        console.error = original;
        box.remove();
      }
    });
    check(`${label}: неполный набор, неизвестная настройка и описание с полем room — отказ до действий (mounted false, core null, контейнер пуст, одно console.error на отказ)`, refusals.partial === false && refusals.unknown === false && refusals.noRoomFormat === false && refusals.core.every((core) => core === null) && refusals.children === 0 && refusals.errors.length === 3 && refusals.errors.every((text) => text.startsWith('Персонаж не подключён:')) && refusals.errors[0].includes('не нарисовано (poses)') && refusals.errors[1].includes('zone') && refusals.errors[2].includes('room'), JSON.stringify(refusals));

    // ---- По независимой проверке Codex: объявление не переживает тишину и фон; подпись и действие — по последним значениям ----
    const hushed = await page.evaluate(() => {
      const core = window.demoCharacters.b.core;
      core.react('done', { key: 'announce-quiet' });
      core.setContext({ dialog: true });
      return core.getState().context.quiet;
    });
    await page.clock.runFor(200);
    const quietLive = await info(page);
    await page.evaluate(() => window.demoCharacters.b.core.setContext({ dialog: false }));
    await page.clock.runFor(1600);
    await page.evaluate(() => window.demoCharacters.b.core.react('done', { key: 'announce-after' }));
    await page.clock.runFor(200);
    const afterLive = await info(page);
    await page.evaluate(() => {
      window.demoCharacters.b.core.react('done', { key: 'announce-bg' });
      window.demoCharacters.b.core.setVisible(false);
    });
    await page.clock.runFor(200);
    const bgLive = await info(page);
    await page.evaluate(() => window.demoCharacters.b.core.setVisible(true));
    check(`${label}: реакция, остановленная тишиной сразу после начала, не объявляется (aria-live пуст); после снятия тишины новая реакция объявляется; уход в фон тоже снимает ждущее объявление`, hushed.join() === 'dialog' && quietLive.b.live === '' && quietLive.b.bubble === '' && afterLive.b.live !== '' && bgLive.b.live === '', JSON.stringify({ hushed, quietLive: quietLive.b, afterLive: afterLive.b, bgLive: bgLive.b }));
    await page.clock.runFor(2500);
    const updated = await page.evaluate(() => {
      const view = window.demoCharacters.b;
      const host = document.querySelector('#robot-b [data-pet-character]');
      const figure = () => host.shadowRoot.querySelector('.pet-character-figure');
      const out = {};
      view.update({ label: 'Второй робот' });
      out.string = [figure().tagName, figure().getAttribute('aria-label'), figure().getAttribute('role')];
      view.update({ label: (state) => `${state.name.display}: нажми` });
      out.fn = figure().getAttribute('aria-label');
      view.core.setName('Зум-2');
      out.renamed = figure().getAttribute('aria-label');
      view.update({ label: null });
      out.reset = figure().getAttribute('aria-label');
      window.qaActivated = 0;
      view.update({ onActivate: () => (window.qaActivated += 1) });
      const button = figure();
      button.focus();
      out.button = [button.tagName, button.getAttribute('type'), button.getAttribute('role'), host.shadowRoot.activeElement === button, Boolean(button.querySelector('svg'))];
      button.click();
      out.clicked = window.qaActivated;
      view.update({ onActivate: () => (window.qaActivated += 10) });
      figure().click();
      out.replaced = [figure() === button, window.qaActivated];
      view.update({ onActivate: null });
      out.plain = [figure().tagName, figure().getAttribute('role'), host.shadowRoot.activeElement === figure(), Boolean(figure().querySelector('svg')), host.shadowRoot.querySelectorAll('.pet-character-figure').length, host.shadowRoot.querySelectorAll('svg').length];
      figure().click();
      out.plainClick = window.qaActivated;
      return out;
    });
    check(`${label}: view.update — строка подписи, функция (и после setName), сброс к умолчанию; появление onActivate — рисунок стал кнопкой с тем же SVG и фокусом, нажатие вызывает действие; замена функции — тот же элемент; снятие — снова рисунок с ролью img (не фокусируемый), один рисунок, нажатие ничего не вызывает`, updated.string.join('|') === 'DIV|Второй робот|img' && updated.fn === 'Боб: нажми' && updated.renamed === 'Зум-2: нажми' && updated.reset === 'Зум-2 — Робот' && updated.button.join('|') === 'BUTTON|button||true|true' && updated.clicked === 1 && updated.replaced.join('|') === 'true|11' && updated.plain.join('|') === 'DIV|img|false|true|1|1' && updated.plainClick === 11, JSON.stringify(updated));
    await page.evaluate(() => window.demoCharacters.b.update({ onActivate: () => window.demoCharacters.b.core.react('wave', { key: `kb-${Date.now()}` }) }));
    await page.evaluate(() => document.querySelector('#robot-b [data-pet-character]').shadowRoot.querySelector('button').focus());
    await page.keyboard.press('Enter');
    await page.clock.runFor(100);
    const kb = await info(page);
    check(`${label}: кнопка, появившаяся через update, работает с клавиатуры (Enter — реакция wave)`, kb.b.pose === 'wave', JSON.stringify(kb.b));
    await page.clock.runFor(1500);

    const stored = await page.evaluate(async () => ({ keys: Object.keys(localStorage), dbs: (await indexedDB.databases()).map((db) => db.name), rejections: window.qaRejections }));
    const errors = page.qaErrors.filter((text) => !text.startsWith('Персонаж не подключён:'));
    check(`${label}: ни localStorage, ни IndexedDB; внешних запросов, ошибок страницы и необработанных отклонений нет`, stored.keys.length === 0 && stored.dbs.length === 0 && stored.rejections.length === 0 && outside.length === 0 && errors.length === 0, JSON.stringify({ stored, outside, errors }));
    await layout(page, label);
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

async function narrow(browser, server, check, open, layout) {
  const label = 'персонаж 320×740';
  const { base } = server;
  const { context, page } = await open(browser, { viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true }, init);
  try {
    await page.goto(`${base}character/`);
    await ready(page);
    const start = await info(page);
    await page.tap('#done');
    await page.clock.runFor(100);
    const done = await info(page);
    check(`${label}: оба робота по ширине своих контейнеров (не шире), касание «Задача выполнена» — реакция у обоих`, start.a.width > 0 && start.a.width <= start.a.boxWidth + 1 && start.b.width <= start.b.boxWidth + 1 && done.a.pose === 'happy' && done.b.pose === 'happy', JSON.stringify({ start, done }));
    await layout(page, label);
    check(`${label}: ошибок страницы нет`, page.qaErrors.length === 0, page.qaErrors.join('; '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}
