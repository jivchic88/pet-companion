// Кролик в Chrome (0.4.0): настоящий mountPet на проверочном стенде с явным подключением кролика — pets: [cat, dog, bunny],
// kits: [bunnyWeb], стили pet-companion/bunny.css на странице (вход /pet/bunny.mjs, как видит сайт). Сценарий — кнопками
// самого питомца: выбор «Кролик» в уголке (рисунок набора в шапке и в сцене, выбор — только ext:v1 поверх кота, companion
// не записан; облики, ленточки и имена — из определения; образцы ленточек раскрашены bunny.css, правое ухо отогнуто —
// стили набора действуют), «Поиграть» (области голова, тело и лапка; «Коснуться лапы» без «Дай лапу»; поглаживание мышью и
// пальцем — «шевелит носом», касание лапки — «тянется лапкой», мячик — поза ball рисунком кролика), «Обустроить уголок»
// (морковка — сразу, сено — только со ступени «Наш ритуал»), объявленные сценки hop и wash, кормление (поза feed со сдвигом
// к миске), отдых (лежащее тело), смена на собаку и обратно — имя и ленточка кролика целы. Компьютер 1280×900 (мышь,
// клавиатура), телефон 390×844 (касания, CDP). Без ошибок страницы, предупреждений журнала и горизонтальной прокрутки.
// Часы — page.clock. Запуск — в составе npm run test:browser.

const NS = 'bunny-qa';
const key = (name) => `${NS}:${name}:v1`;

// В странице: подключение кролика явно — определения и наборы из модулей стенда (/pet/…), стили набора — <link> страницы
// (как у mountPet на сайте); stand.options — места и счёт стенда.
async function mountBunny(page, base, { marks = 0, today = 0 } = {}) {
  await page.evaluate(
    async ([ns, href, count]) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      const loaded = new Promise((resolve) => link.addEventListener('load', resolve, { once: true }));
      document.head.append(link);
      await loaded;
      const [{ mountPet }, { bunny, bunnyWeb }, { cat, dog }, { calm }] = await Promise.all([import('/pet/pet.mjs'), import('/pet/bunny.mjs'), import('/pet/pets.mjs'), import('/pet/behaviors.mjs')]);
      window.qaCounts = count;
      window.qaBunny = mountPet(window.stand.options({ storage: ns, pets: [cat, dog, bunny], behaviors: [calm], kits: [bunnyWeb], progress: () => ({ marks: window.qaCounts.marks, today: window.qaCounts.today, limit: 3 }) }));
      return window.qaBunny.mounted;
    },
    [NS, `${base}pet/bunny.css`, { marks, today }],
  );
}

const info = (page) =>
  page.evaluate(() => {
    const s = window.qaBunny.getState();
    const seen = [...document.querySelectorAll('.cat-art')].filter((el) => !el.closest('#cat-sheet') && el.getBoundingClientRect().width > 0);
    return {
      pet: s.pet,
      pets: Object.keys(s.pets),
      name: s.name.display,
      coat: s.look.coat,
      accessory: s.look.accessory,
      reaction: s.pose.reaction?.type ?? null,
      kinds: [...new Set(seen.map((el) => el.dataset.kind ?? 'cat'))],
      coats: [...new Set(seen.map((el) => el.dataset.coat))],
      accs: [...new Set(seen.map((el) => el.dataset.acc))],
      poses: seen.map((el) => el.dataset.pose),
      scenes: s.display.scenes,
      stage: s.stage?.index ?? s.stage,
    };
  });
const stored = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, JSON.parse(localStorage.getItem(key))])));
const sheet = (page) => page.evaluate(() => ({ open: Boolean(document.getElementById('cat-sheet')?.open), view: document.getElementById('cat-sheet')?.dataset.view ?? '' }));
const finishOpen = (page) => page.evaluate(() => Promise.all((document.querySelector('.cat-sheet')?.getAnimations() ?? []).map((animation) => animation.finished)));
const hint = (page) => page.evaluate(() => document.querySelector('[data-cat-play-hint]')?.textContent ?? '');
const playPose = (page) => page.evaluate(() => document.querySelector('.cat-play .cat-art')?.dataset.pose ?? '');
const rect = (page, selector) => page.evaluate((s) => document.querySelector(s)?.getBoundingClientRect().toJSON() ?? null, selector);
// Вычисленные стили частей рисунка в шапке: отогнутое правое ухо и образец ленточки — доказательство, что bunny.css действует.
const styled = (page) =>
  page.evaluate(() => {
    const art = [...document.querySelectorAll('.cat-art[data-kind="bunny"]')].find((el) => !el.closest('#cat-sheet') && el.getBoundingClientRect().width > 0);
    const ear = art?.querySelector('.bunny-ear-r');
    const swatch = document.querySelector('#cat-sheet .cat-swatch-ribbon');
    return {
      ear: ear ? getComputedStyle(ear).transform : '',
      pose: art?.dataset.pose ?? '',
      swatch: swatch ? getComputedStyle(swatch).backgroundColor : '',
      sheets: [...document.styleSheets].map((sheet) => sheet.href ?? '').filter((href) => href.includes('bunny.css')).length,
    };
  });
async function petPoint(page, u, v) {
  const r = await rect(page, '[data-play-pet]');
  return [r.x + (r.width * u) / 220, r.y + (r.height * v) / 204];
}
async function sent(page, send, at = null) {
  const n = await page.evaluate(() => window.qaPointer.n);
  await send();
  await page.waitForFunction(([k, p]) => window.qaPointer.n > k && (!p || (Math.abs(window.qaPointer.x - p[0]) < 1 && Math.abs(window.qaPointer.y - p[1]) < 1)), [n, at], { timeout: 3000 });
}
// Поглаживание головы кролика (100, 72): вниз, три сдвига по 30 px с паузами, отпустить; позы между сдвигами.
async function stroke(page, { touch = null } = {}) {
  const [x0, y0] = await petPoint(page, 100, 72);
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
async function shut(page) {
  for (let i = 0; i < 3 && (await sheet(page)).open; i += 1) {
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);
  }
}
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
async function clean(page, outside, check, label) {
  const errors = { page: page.qaErrors, rejections: await page.evaluate(() => window.qaRejections), outside };
  check(`${label}: без ошибок страницы, предупреждений журнала, необработанных отклонений и внешних запросов`, !errors.page.length && !errors.rejections.length && !errors.outside.length, JSON.stringify(errors));
}
// Выбор питомца в уголке: радиокнопка .cat-kind-option.
async function choose(page, kind, { tap = false } = {}) {
  const option = page.locator(`.cat-kind-option:has(input[value="${kind}"])`);
  if (tap) await option.tap();
  else await option.click();
  await page.clock.runFor(100);
}

export async function bunnyQa(browser, base, check, open, layout) {
  await desktop(browser, base, check, open, layout);
  await phone(browser, base, check, open, layout);
}

async function desktop(browser, base, check, open, layout) {
  const label = 'кролик 1280×900';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, init);
  const outside = watchNetwork(page, base);
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    await mountBunny(page, base);
    const start = await info(page);
    check(`${label}: подключение с кроликом явно (pets, kits, bunny.css) — три питомца, показан кот; сценки кролика объявлены отображению`, start.pet.shown === 'cat' && start.pets.join() === 'cat,dog,bunny' && start.kinds.join() === 'cat' && JSON.stringify(start.scenes.bunny) === JSON.stringify(['hop', 'wash']), JSON.stringify(start));
    await page.clock.runFor(8000);

    // ---- Уголок: выбор кролика; облики, ленточки, имена и рисунки — из определения и набора ----
    await page.locator('#cat-dock .cat-dock-btn').click();
    await finishOpen(page);
    const options = await page.evaluate(() => [...document.querySelectorAll('input[name="cat-kind"]')].map((input) => input.value));
    check(`${label}: в уголке три питомца на выбор`, options.join() === 'cat,dog,bunny', options.join());
    await choose(page, 'bunny');
    const chosen = { ...(await info(page)), stored: await stored(page), ...(await styled(page)) };
    check(`${label}: «Кролик» — рисунок набора кролика в шапке; выбор — только ext:v1 { pet: { id: 'bunny', over: 'cat' } }, companion не записан`, chosen.pet.shown === 'bunny' && chosen.kinds.join() === 'bunny' && JSON.stringify(chosen.stored[key('ext')]?.pet) === JSON.stringify({ id: 'bunny', over: 'cat' }) && !(key('companion') in chosen.stored), JSON.stringify({ pet: chosen.pet, kinds: chosen.kinds, stored: chosen.stored }));
    check(`${label}: bunny.css действует — правое ухо отогнуто (transform), образец голубой ленточки раскрашен`, chosen.sheets === 1 && chosen.ear !== 'none' && chosen.ear !== '' && chosen.swatch === 'rgb(106, 167, 216)', JSON.stringify({ ear: chosen.ear, swatch: chosen.swatch, sheets: chosen.sheets }));
    const corner = await page.evaluate(() => ({
      coats: [...document.querySelectorAll('input[name="cat-coat"]')].map((input) => input.value),
      accs: [...document.querySelectorAll('input[name="cat-acc"]')].map((input) => [input.value, input.disabled]),
      chips: [...document.querySelectorAll('[data-cat-name-pick]')].map((chip) => chip.dataset.catNamePick),
      stage: Boolean(document.querySelector('#cat-sheet .cat-scene-art .cat-art[data-kind="bunny"]')),
      carrot: Boolean(document.querySelector('#cat-sheet [data-room="carrot"]')),
      hay: Boolean(document.querySelector('#cat-sheet [data-room="hay"]')),
      pickers: [...document.querySelectorAll('.cat-coat-face .cat-art')].every((art) => art.dataset.kind === 'bunny'),
      title: document.getElementById('cat-sheet-title')?.textContent ?? '',
    }));
    check(`${label}: уголок кролика — облики fawn/snow/spot, ленточки (бантик и клевер пока закрыты), имена, сцена с кроликом и морковкой без сена`, corner.coats.join() === 'fawn,snow,spot' && JSON.stringify(corner.accs) === JSON.stringify([['ribbon', false], ['bow', true], ['clover', true]]) && corner.chips.includes('Ушастик') && corner.stage && corner.carrot && !corner.hay && corner.pickers && corner.title === 'Пух', JSON.stringify(corner));
    await layout(page, `${label}, уголок кролика`);
    // Имя готовым словом, облик — белый: записи кролика в ext.pets.bunny и look.bunny.
    await page.locator('[data-cat-name-pick="Ушастик"]').click();
    await page.clock.runFor(100);
    await page.locator('.cat-coat-option:has(input[value="snow"])').click();
    await page.clock.runFor(100);
    const named = { ...(await info(page)), stored: await stored(page) };
    check(`${label}: имя и облик кролика — в его записях (ext.pets.bunny, look.bunny); рисунки — белый`, named.name === 'Ушастик' && named.coat === 'snow' && named.coats.join() === 'snow' && named.stored[key('ext')].pets?.bunny?.name === 'Ушастик' && named.stored[key('look')]?.bunny === 'snow', JSON.stringify({ name: named.name, coat: named.coat, coats: named.coats, ext: named.stored[key('ext')], look: named.stored[key('look')] }));

    // ---- «Поиграть»: области, лапка, поглаживание, мячик (отклик на имя доигран) ----
    await page.clock.runFor(5000);
    await page.locator('[data-cat-play]').click();
    await finishOpen(page);
    const play = await page.evaluate(() => ({
      hits: [...document.querySelectorAll('[data-play-hit]')].map((el) => el.dataset.playHit),
      paw: document.querySelector('[data-cat-play-paw]')?.textContent ?? null,
      art: document.querySelector('.cat-play .cat-art')?.dataset.kind ?? '',
    }));
    check(`${label}: «Поиграть» — рисунок кролика, области голова, тело и лапка; кнопка «Коснуться лапы» (без «Дай лапу»)`, (await sheet(page)).view === 'play' && play.art === 'bunny' && play.hits.join() === 'head,body,paw' && play.paw === 'Коснуться лапы', JSON.stringify(play));
    const petted = await stroke(page);
    check(`${label}: поглаживание мышью — поза «pet», итог «Ушастик шевелит носом.»`, petted.poses.every((pose) => pose === 'pet') && petted.held === 'Ушастик шевелит носом.', JSON.stringify(petted));
    await page.clock.runFor(60_000);
    const [px, py] = await petPoint(page, 90, 176);
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.clock.runFor(100);
    await page.mouse.up();
    await page.clock.runFor(100);
    const paw = { hint: await hint(page), pose: await playPose(page) };
    check(`${label}: касание лапки — поза «paw», итог «Ушастик тянется к твоей руке лапкой.»`, paw.pose === 'paw' && paw.hint === 'Ушастик тянется к твоей руке лапкой.', JSON.stringify(paw));
    await page.clock.runFor(3000);
    await page.locator('[data-cat-play-ball]').click();
    const poses = [];
    for (let i = 0; i < 6; i += 1) {
      poses.push(await playPose(page));
      await page.clock.runFor(400);
    }
    check(`${label}: «Катнуть мячик» — поза ball рисунком кролика (своя поза, без замены)`, poses.includes('ball') && poses.every((pose) => ['calm', 'attentive', 'watch', 'ball', 'content'].includes(pose)), JSON.stringify(poses));
    await layout(page, `${label}, «Поиграть» кролика`);
    await page.keyboard.press('Escape');
    await page.clock.runFor(100);

    // ---- «Обустроить уголок»: морковка на месте, сена нет; сдвиг морковки и запись ----
    await page.locator('[data-cat-room]').click();
    await finishOpen(page);
    const picks = await page.evaluate(() => [...document.querySelectorAll('[data-room-pick]')].map((button) => button.dataset.roomPick));
    check(`${label}: редактор уголка — место отдыха, миска и морковка (сено откроет ступень «Наш ритуал»)`, (await sheet(page)).view === 'room' && picks.join() === 'rest,bowl,carrot', picks.join());
    await page.locator('[data-room-pick="carrot"]').click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.clock.runFor(100);
    await page.locator('[data-room-save]').click();
    await page.clock.runFor(200);
    const room = (await stored(page))[key('room')];
    check(`${label}: морковка сдвинута вправо и сохранена в room.bunny.carrot`, room?.bunny?.carrot?.x > 40, JSON.stringify(room));
    await shut(page);

    // ---- Занятия до ступени «Наш ритуал»: бантик и сено ----
    for (let i = 0; i < 9; i += 1) {
      await page.evaluate((n) => {
        window.qaCounts = { marks: n, today: Math.min(n, 3) };
        return window.qaBunny.notify('saved', { key: `lesson-${n}`, counted: true });
      }, i + 1);
      await page.clock.runFor(6000);
    }
    await page.clock.runFor(10_000);
    await page.locator('#cat-dock .cat-dock-btn').click();
    await finishOpen(page);
    await page.locator('.cat-acc-option:has(input[value="bow"])').click();
    await page.clock.runFor(100);
    const ritual = { ...(await info(page)), hay: await page.evaluate(() => Boolean(document.querySelector('#cat-sheet [data-room="hay"]'))), stored: await stored(page) };
    check(`${label}: на ступени «Наш ритуал» — бантик надет (ext.pets.bunny.accessory) и в сцене пучок сена`, ritual.accessory === 'bow' && ritual.accs.join() === 'bow' && ritual.stored[key('ext')].pets.bunny.accessory === 'bow' && ritual.hay, JSON.stringify({ accessory: ritual.accessory, accs: ritual.accs, hay: ritual.hay }));

    // ---- Кормление: поза feed (сдвиг к миске) ----
    await page.locator('[data-cat-feed]').click();
    await page.clock.runFor(100);
    const fed = { ...(await info(page)), shift: await page.evaluate(() => getComputedStyle(document.querySelector('#cat-sheet .cat-scene-art .cat-art[data-kind="bunny"] .bunny-all')).transform), stored: await stored(page) };
    check(`${label}: «Покормить» — кролик ест: поза feed, рисунок в сцене сдвинут к миске, treat записан`, fed.reaction === 'feed' && fed.shift !== 'none' && Boolean(fed.stored[key('treat')]?.fedDay), JSON.stringify({ reaction: fed.reaction, shift: fed.shift, treat: fed.stored[key('treat')] }));
    await shut(page);
    await page.clock.runFor(15_000);

    // ---- Собака и обратно: данные кролика целы ----
    await page.locator('#cat-dock .cat-dock-btn').click();
    await finishOpen(page);
    await choose(page, 'dog');
    const dog = await info(page);
    await choose(page, 'bunny');
    const back = { ...(await info(page)), stored: await stored(page) };
    check(`${label}: собака — рисунок собаки, затем снова кролик — имя, облик и бантик кролика целы; companion.kind = dog (вкладки 0.1.4 видят собаку)`, dog.kinds.join() === 'dog' && back.kinds.join() === 'bunny' && back.name === 'Ушастик' && back.coat === 'snow' && back.accessory === 'bow' && back.stored[key('companion')]?.kind === 'dog' && JSON.stringify(back.stored[key('ext')].pet) === JSON.stringify({ id: 'bunny', over: 'dog' }), JSON.stringify({ dog: dog.kinds, back: { name: back.name, coat: back.coat, accessory: back.accessory, companion: back.stored[key('companion')], ext: back.stored[key('ext')].pet } }));
    await shut(page);
    await layout(page, label);
    await clean(page, outside, check, label);
  } finally {
    await context.close();
  }
}

async function phone(browser, base, check, open, layout) {
  const label = 'кролик 390×844';
  const { context, page, cdp } = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, init);
  const outside = watchNetwork(page, base);
  let last = null;
  const touch = async (type, x, y) => {
    const points = type === 'touchEnd' ? [] : [{ x, y, id: 1 }];
    last = type === 'touchEnd' ? null : [x, y];
    await sent(page, () => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points }), type === 'touchMove' ? last : null);
  };
  try {
    await context.addInitScript(
      ([ext, look]) => {
        if (!localStorage.getItem(ext[0])) {
          localStorage.setItem(ext[0], JSON.stringify(ext[1]));
          localStorage.setItem(look[0], JSON.stringify(look[1]));
        }
      },
      [[key('ext'), { v: 1, pet: { id: 'bunny', over: 'cat' }, pets: { bunny: { name: 'Зефир' } }, future: 1 }], [key('look'), { v: 1, bunny: 'spot' }]],
    );
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    await mountBunny(page, base);
    const seeded = await info(page);
    check(`${label}: сохранённый кролик — имя, облик и рисунок (портрет в шапке) из своих записей`, seeded.pet.shown === 'bunny' && seeded.name === 'Зефир' && seeded.coats.join() === 'spot' && seeded.kinds.join() === 'bunny', JSON.stringify(seeded));
    await page.clock.runFor(8000);
    await page.locator('.cat-face').tap();
    await finishOpen(page);
    check(`${label}: уголок кролика открыт касанием, сцена с кроликом`, (await sheet(page)).open && (await page.evaluate(() => Boolean(document.querySelector('#cat-sheet .cat-scene-art .cat-art[data-kind="bunny"]')))), JSON.stringify(await sheet(page)));
    await layout(page, `${label}, уголок кролика`);
    await page.locator('[data-cat-play]').tap();
    await finishOpen(page);
    const petted = await stroke(page, { touch });
    check(`${label}: поглаживание пальцем — поза «pet», итог «Зефир шевелит носом.»; область лапки есть`, petted.poses.every((pose) => pose === 'pet') && petted.held === 'Зефир шевелит носом.' && (await page.evaluate(() => Boolean(document.querySelector('[data-play-hit="paw"]')))), JSON.stringify(petted));
    await layout(page, `${label}, «Поиграть» кролика`);
    await page.locator('[data-cat-play-close]').tap();
    await page.clock.runFor(500);
    const back = await sheet(page);
    await page.locator('[data-cat-close]').tap();
    await page.clock.runFor(500);
    check(`${label}: «Закрыть» игры касанием — уголок, его «Закрыть» — диалог закрыт`, back.open && back.view === '' && !(await sheet(page)).open, JSON.stringify({ back, after: await sheet(page) }));
    const ext = (await stored(page))[key('ext')];
    check(`${label}: неизвестные поля ext сохраняются`, ext.future === 1 && ext.pets.bunny.name === 'Зефир', JSON.stringify(ext));
    await layout(page, label);
    await clean(page, outside, check, label);
  } finally {
    await context.close();
  }
}
