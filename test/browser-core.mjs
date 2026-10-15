// Веб-оболочка на ядре (PL03) в Chrome: настоящий mountPet на стенде и второе ядро той же копии модуля на том же
// координаторе пространства имён (импорт /pet/core/index.mjs и /pet/web/storage.mjs — только проверка, входа пакета нет).
// Каждая запись ключей cat, companion, look, treat идёт через веб-адаптер координатора (стек setItem), а не из оболочки;
// правки уголка второе ядро поглощает; правки второго ядра оболочка показывает (имя, напарник, облик, «скрыт»); кормление
// и подтверждённое занятие — решение ядра, синхронный итог в объявлении; событие без key — как 0.1.4; у экземпляра нет
// новых публичных свойств. Решение по подтверждённому (freshQa): запись этой страницы без события storage до «Покормить»
// и notify('saved'). Запуск — в составе npm run test:browser (test/browser.mjs).

// Только QA: стек каждого setItem (ключ и файл, из которого запись).
function setHooks() {
  const set = Storage.prototype.setItem;
  window.qaSets = [];
  Storage.prototype.setItem = function setItem(key, value) {
    window.qaSets.push({ key: String(key), stack: new Error().stack ?? '' });
    return set.call(this, key, value);
  };
}

const CORE_KEYS = ['cat', 'companion', 'look', 'treat'];

// Второе ядро на координаторе пространства ns (та же копия модуля, что у стенда): window.qaCore, обновления — qaSeen.
const observe = (page, ns) =>
  page.evaluate(async (space) => {
    const { createPetCore } = await import('/pet/core/index.mjs');
    const { createWebStorage } = await import('/pet/web/storage.mjs');
    const storage = createWebStorage({ namespace: space });
    const status = storage.status;
    window.qaSeen = [];
    window.qaCore = createPetCore({ storage, progress: () => window.stand.options().progress() });
    window.qaCore.subscribe((update) => window.qaSeen.push(`${update.reason} ${update.snapshot.name.display}`), { initial: false });
    window.qaCore.start({ around: true });
    return status;
  }, ns);

const state = (page) => page.evaluate(() => ({ ...window.qaCore.getState() }));
const dock = (page) => page.evaluate(() => ({ kind: document.querySelector('#cat-dock .cat-art') ? (document.querySelector('#cat-dock .cat-art').dataset.kind ?? 'cat') : '', coat: document.querySelector('#cat-dock .cat-art')?.dataset.coat ?? '', name: document.querySelector('#cat-dock [data-cat-name]')?.textContent ?? '', hidden: !document.querySelector('#cat-dock .cat-dock-btn') }));
const live = (page) => page.evaluate(() => document.getElementById('cat-live')?.textContent ?? '');

export async function coreQa(browser, base, check, open) {
  const label = 'ядро: веб-оболочка';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, setHooks);
  try {
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    await page.evaluate(() => window.stand.mount({ storage: 'core1' }));
    await page.clock.runFor(3000);
    const pet = await page.evaluate(() => Object.keys(window.stand.pet).sort().join(','));
    // PL05: прежние свойства и legacy-методы на месте; добавлены pet.core и команды ядра (без входов отображения setVisible,
    // setReducedMotion, activity, setDisplay и без start — их ведёт legacy-отображение).
    check(`${label}: у экземпляра прежние свойства и методы плюс pet.core и команды ядра PL05 — ровно этот набор`, pet === 'close,core,destroy,feed,getState,hide,interact,mounted,notify,open,opened,refresh,room,setAppearance,setContext,setName,setPet,setPreferences,setPresence,show,stroke,subscribe,toy,update,version', pet);
    const status = await observe(page, 'core1');
    check(`${label}: второе ядро получает тот же координатор пространства — уже загруженный фасадом`, status === 'ready', status);

    // Правки уголка — команды ядра оболочки: второе ядро поглощает каждую.
    await page.locator('#cat-dock .cat-dock-btn').click();
    await page.locator('[data-cat-names] [data-cat-name-pick="Бэклог"]').click();
    await page.locator('.cat-coat-option:has(input[value="ginger"])').click();
    await page.locator('.cat-settings > summary').click();
    await page.locator('label:has(> input[name="cat-motion"][value="calm"])').click();
    await page.locator('input[name="cat-phrases"]').uncheck();
    const absorbed = await state(page);
    check(`${label}: имя, облик, движение и реплики уголка — у второго ядра поглощением`, absorbed.name.display === 'Бэклог' && absorbed.look.coat === 'ginger' && absorbed.prefs.motion === 'calm' && absorbed.prefs.phrases === false, JSON.stringify({ name: absorbed.name, look: absorbed.look, prefs: absorbed.prefs }));
    await page.locator('.cat-kind-option:has(input[value="dog"])').click();
    await page.clock.runFor(100);
    await page.locator('input[name="cat-name"]').fill('Барклий');
    const dog = await state(page);
    check(`${label}: выбор собаки и её имя — у второго ядра`, dog.pet.shown === 'dog' && dog.name.display === 'Барклий', JSON.stringify(dog.pet));
    await page.keyboard.press('Escape');

    // Обратно: правки второго ядра оболочка показывает тихо (как изменение другой вкладки).
    await page.evaluate(() => window.qaCore.setPet('cat'));
    await page.evaluate(() => window.qaCore.setName('Сырник'));
    await page.evaluate(() => window.qaCore.setAppearance({ coat: 'tuxedo' }));
    await page.clock.runFor(100);
    const shown = await dock(page);
    check(`${label}: правки второго ядра — кот Сырник в облике «Чёрно-белый» в боковой панели`, shown.kind === 'cat' && shown.name === 'Сырник' && shown.coat === 'tuxedo', JSON.stringify(shown));
    await page.evaluate(() => window.qaCore.hide());
    await page.clock.runFor(100);
    const hidden = await dock(page);
    await page.evaluate(() => window.qaCore.show());
    await page.clock.runFor(100);
    const back = await dock(page);
    check(`${label}: «скрыт» из второго ядра — питомец спрятан и возвращён`, hidden.hidden && !back.hidden && back.name === 'Сырник', JSON.stringify({ hidden, back }));

    // Подтверждённое занятие и кормление — решение ядра; синхронный итог — в объявлении того же действия.
    await page.evaluate(() => window.stand.set(3, 1));
    await page.evaluate(() => window.stand.pet.notify('saved', { key: 'c1', counted: true, first: true }));
    await page.clock.runFor(200);
    const told = await live(page);
    const marked = await page.evaluate(() => JSON.parse(localStorage.getItem('core1:cat:v1')).seenStage);
    check(`${label}: занятие — праздник «Освоился» объявлен, увиденная ступень записана ядром`, told.includes('открыта ступень «Освоился»') && marked === 1, JSON.stringify({ told, marked }));
    await page.clock.runFor(5000);
    await page.locator('#cat-dock .cat-dock-btn').click();
    await page.locator('[data-cat-feed]').click();
    await page.clock.runFor(200);
    const fed = { told: await live(page), note: await page.evaluate(() => document.querySelector('[data-cat-treat-note]')?.textContent ?? '') };
    await page.evaluate(() => window.qaCore.refresh());
    const second = await page.evaluate(() => window.qaCore.feed({ around: true }).error?.code ?? 'ok');
    check(`${label}: «Покормить» — «Сырник получает лакомство. Сегодня уже угостили.»; второе ядро — treat-fed (одно в день)`, fed.told === 'Сырник получает лакомство. Сегодня уже угостили.' && fed.note.startsWith('Сегодня уже угостили') && second === 'treat-fed', JSON.stringify({ ...fed, second }));
    await page.keyboard.press('Escape');
    await page.clock.runFor(6000);

    // Событие без key — как 0.1.4 (ключ entry:undefined): второе такое событие реакцию не играет.
    const pose = () => page.evaluate(() => document.querySelector('#cat-dock .cat-art')?.dataset.pose ?? '');
    await page.evaluate(() => window.stand.pet.notify('saved', {}));
    const first = await pose();
    await page.clock.runFor(4000);
    await page.evaluate(() => window.stand.pet.notify('saved', {}));
    const repeat = await pose();
    check(`${label}: notify('saved', {}) — как 0.1.4: первое — радость, повтор без key — без реакции`, first === 'joy' && repeat !== 'joy', `${first} → ${repeat}`);

    // Все записи ключей — через веб-адаптер координатора (с PL04.3 и place, room: оболочка ключей не пишет).
    const sets = await page.evaluate(() => window.qaSets.map(({ key, stack }) => ({ key, adapter: stack.includes('/pet/web/storage.mjs'), shell: stack.includes('/pet/pet.mjs') })));
    const coreSets = sets.filter((item) => CORE_KEYS.some((name) => item.key === `core1:${name}:v1`));
    const otherSets = sets.filter((item) => item.key.startsWith('core1:') && !coreSets.includes(item));
    check(`${label}: каждая запись cat, companion, look, treat — через веб-адаптер координатора (${coreSets.length})`, coreSets.length >= 8 && coreSets.every((item) => item.adapter), JSON.stringify(coreSets.filter((item) => !item.adapter)));
    check(`${label}: остальные ключи (place, presence, room, scene) — тоже только через веб-адаптер, не из оболочки`, otherSets.every((item) => item.adapter), JSON.stringify(otherSets));

    // Отключение: подключение ядра оболочки закрыто — второе ядро продолжает получать изменения другой вкладки.
    await page.evaluate(() => window.stand.pet.destroy());
    const other = await context.newPage();
    await other.goto(`${base}?manual`);
    await other.evaluate(() => localStorage.setItem('core1:cat:v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('core1:cat:v1')), name: 'Бублик' })));
    await other.close();
    await page.clock.runFor(100);
    const after = await page.evaluate(() => ({ name: window.qaCore.getState().name.display, seen: window.qaSeen.at(-1), nodes: document.querySelectorAll('[id^="cat-"]').length }));
    check(`${label}: после destroy оболочки — элементов нет; второе ядро получило событие другой вкладки`, after.name === 'Бублик' && after.seen === 'storage Бублик' && after.nodes === 0, JSON.stringify(after));
    await page.evaluate(() => window.qaCore.destroy());
    check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}

// ---------- сверка перед решением (независимая проверка PL03, docs/ARCHITECTURE.md § 5.5, шаг 1а) ----------
// Значение записано в localStorage этой же страницы (как восстановление сайтом; события storage нет) до нажатия
// «Покормить» или notify('saved'). Наблюдаются позы и аксессуар рисунков, объявления, кнопка и карточка лакомства, точка
// «новое», фактическое хранилище и второе ядро на том же координаторе; затем запоздалое событие storage.

// Подключение на стенде: '@today' в значениях — местный день страницы; второе ядро той же копии модуля — window.qaOther.
async function mountFresh(page, base, ns, seed, marks, today) {
  await page.goto(`${base}?manual`);
  await page.waitForFunction(() => Boolean(window.stand));
  await page.evaluate(
    async ({ space, values, counts }) => {
      const { localDay } = await import('/pet/pet.mjs');
      const day = (window.qaDay = localDay());
      window.qaCounts = { ...counts, limit: 3 };
      for (const [name, value] of Object.entries(values)) localStorage.setItem(`${space}:${name}:v1`, JSON.stringify(value).replaceAll('"@today"', JSON.stringify(day)));
      window.stand.mount({ storage: space, progress: () => window.qaCounts });
      const { createPetCore } = await import('/pet/core/index.mjs');
      const { createWebStorage } = await import('/pet/web/storage.mjs');
      window.qaOther = createPetCore({ storage: createWebStorage({ namespace: space }), progress: () => window.qaCounts });
      window.qaOther.start({ around: true });
    },
    { space: ns, values: seed, counts: { marks, today } },
  );
  await page.clock.runFor(3000);
}

// Только QA: позы и аксессуар рисунков (примерка), тексты объявлений — с этого момента.
const watchFx = (page) =>
  page.evaluate(() => {
    const fx = (window.qaFx = { poses: [], accs: [], live: [] });
    // Область объявлений модуль создаёт при подключении — наблюдение может начаться раньше.
    new MutationObserver((list) => {
      for (const change of list) {
        const target = change.target.nodeType === 1 ? change.target : change.target.parentElement;
        const live = document.getElementById('cat-live');
        if (live?.contains(target)) fx.live.push(live.textContent);
        else if (change.attributeName === 'data-pose') fx.poses.push(target.dataset.pose);
        else if (change.attributeName === 'data-acc') fx.accs.push(target.dataset.acc);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-pose', 'data-acc'] });
  });
const fx = (page) => page.evaluate(() => ({ ...window.qaFx, live: window.qaFx.live.filter(Boolean) }));
// Запись этой страницы мимо модуля (события storage нет); возвращает записанный текст.
const putRaw = (page, key, value) => page.evaluate(({ k, v }) => (localStorage.setItem(k, JSON.stringify(v).replaceAll('"@today"', JSON.stringify(window.qaDay))), localStorage.getItem(k)), { k: key, v: value });
const lateStorage = (page, key) => page.evaluate((k) => window.dispatchEvent(new StorageEvent('storage', { key: k, newValue: localStorage.getItem(k) })), key);
const setsOf = (page, key) => page.evaluate((k) => window.qaSets.filter((item) => item.key === k).length, key);

export async function freshQa(browser, base, check, open) {
  const label = 'ядро: решение по подтверждённому';
  const { context, page } = await open(browser, { viewport: { width: 1280, height: 900 } }, setHooks);
  try {
    // Кормление: день уже отмечен до нажатия.
    const fed = 'fresh-fed';
    await mountFresh(page, base, fed, { cat: { v: 1, seenStage: 0, greetDay: '@today' }, treat: { v: 1, fedDay: '' } }, 1, 1);
    await page.locator('#cat-dock .cat-dock-btn').click();
    await page.clock.runFor(400);
    const offered = await page.locator('[data-cat-feed]').count();
    await watchFx(page);
    const raw = await putRaw(page, `${fed}:treat:v1`, { v: 1, fedDay: '@today' });
    const sets = await setsOf(page, `${fed}:treat:v1`);
    if (offered === 1) await page.locator('[data-cat-feed]').click();
    await page.clock.runFor(3500);
    await lateStorage(page, `${fed}:treat:v1`);
    await page.clock.runFor(1000);
    const after = await page.evaluate((k) => ({ raw: localStorage.getItem(k), button: document.querySelectorAll('[data-cat-feed]').length, card: document.querySelector('[data-cat-treat]')?.dataset.state ?? '', note: document.querySelector('[data-cat-treat-note]')?.textContent ?? '', other: window.qaOther.getState().treat }), `${fed}:treat:v1`);
    const seenFed = await fx(page);
    const writesFed = (await setsOf(page, `${fed}:treat:v1`)) - sets;
    check(
      `${label}: «Покормить» — день уже отмечен до нажатия (события storage нет): второго кормления, позы еды и объявления нет; карточка «уже угостили», запись как есть; второе ядро — fed; запоздалое storage — без эффектов`,
      offered === 1 && after.raw === raw && writesFed === 0 && after.button === 0 && after.card === 'fed' && after.note.startsWith('Сегодня уже угостили') && after.other === 'fed' && !seenFed.poses.some((pose) => pose === 'feed' || pose === 'fed') && !seenFed.live.some((text) => text.includes('получает лакомство')),
      JSON.stringify({ offered, after, writesFed, seenFed }),
    );
    await page.keyboard.press('Escape');

    // Обратно: день лакомства сброшен (восстановление прежней копии) — кнопка снова есть, кормление обычное.
    const back = 'fresh-back';
    await mountFresh(page, base, back, { cat: { v: 1, seenStage: 0, greetDay: '@today' }, treat: { v: 1, fedDay: '@today' } }, 1, 1);
    await page.locator('#cat-dock .cat-dock-btn').click();
    await page.clock.runFor(400);
    const hidden = await page.locator('[data-cat-feed]').count();
    await page.keyboard.press('Escape');
    await putRaw(page, `${back}:treat:v1`, { v: 2, fedDay: '2026-10-09', note: 'копия' });
    await page.locator('#cat-dock .cat-dock-btn').click();
    await page.clock.runFor(400);
    const shown = await page.locator('[data-cat-feed]').count();
    await watchFx(page);
    if (shown === 1) await page.locator('[data-cat-feed]').click();
    await page.clock.runFor(3500);
    const seenBack = await fx(page);
    const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), `${back}:treat:v1`);
    const otherBack = await page.evaluate(() => window.qaOther.getState().treat);
    const today = await page.evaluate(() => window.qaDay);
    check(
      `${label}: обратно — день сброшен до открытия уголка (события нет): «Покормить» снова есть; кормление, поза еды и объявление; запись по свежему с неизвестным полем`,
      hidden === 0 && shown === 1 && seenBack.poses.includes('feed') && seenBack.live.includes('Марс получает лакомство. Сегодня уже угостили.') && JSON.stringify(stored) === JSON.stringify({ v: 2, fedDay: today, note: 'копия' }) && otherBack === 'fed',
      JSON.stringify({ hidden, shown, seenBack, stored, otherBack }),
    );
    await page.keyboard.press('Escape');

    // Праздник: до занятия сохранена уже увиденная или непонятная ступень (v 3, future).
    for (const [i, odd] of [1, 'future-stage', 8].entries()) {
      const ns = `fresh-stage${i}`;
      const known = odd === 1;
      await mountFresh(page, base, ns, { cat: { v: 1, seenStage: 0, greetDay: '@today' } }, 2, 1);
      await watchFx(page);
      const kept = await putRaw(page, `${ns}:cat:v1`, { v: 3, seenStage: odd, greetDay: '@today', future: 42 });
      const before = await setsOf(page, `${ns}:cat:v1`);
      await page.evaluate(() => {
        window.qaCounts.marks = 3;
        window.stand.pet.notify('saved', { key: 'one', counted: true });
      });
      await page.clock.runFor(4500);
      await lateStorage(page, `${ns}:cat:v1`);
      await page.clock.runFor(1000);
      const dot = await page.evaluate(() => document.querySelector('#cat-dock .cat-dot')?.hidden ?? true);
      await page.locator('#cat-dock .cat-dock-btn').click();
      await page.clock.runFor(400);
      await page.keyboard.press('Escape');
      const seenStage = await fx(page);
      const state = await page.evaluate((k) => ({ raw: localStorage.getItem(k), other: window.qaOther.getState().progress }), `${ns}:cat:v1`);
      const writes = (await setsOf(page, `${ns}:cat:v1`)) - before;
      check(
        `${label}: занятие — до него сохранено seenStage ${JSON.stringify(odd)} (события нет): без праздника, «unlock», примерки платка и объявления ступени; обычная радость; без точки «новое»; raw с v 3 и future как есть, записей нет; второе ядро — seenKnown ${known}; запоздалое storage — без эффектов`,
        seenStage.poses.includes('joy') && !seenStage.poses.includes('unlock') && !seenStage.accs.includes('plaid') && !seenStage.live.some((text) => text.includes('открыта ступень')) && dot && state.raw === kept && writes === 0 && state.other.seenKnown === known && state.other.unseen === false,
        JSON.stringify({ seenStage, dot, state, writes }),
      );
    }

    // Подключение: сайт восстановил значение в своём месте подключения — после загрузки хранилища, до запуска ядра. Запуск
    // решает по нему: сегодня уже здоровались — без приветствия; имя — восстановленное.
    const restored = 'fresh-mount';
    await page.goto(`${base}?manual`);
    await page.waitForFunction(() => Boolean(window.stand));
    await watchFx(page);
    await page.evaluate(async (space) => {
      const { localDay } = await import('/pet/pet.mjs');
      const day = localDay();
      localStorage.setItem(`${space}:cat:v1`, JSON.stringify({ v: 1, name: 'Марс', seenStage: 0, greetDay: '2026-10-01' }));
      const places = window.stand.places();
      window.stand.mount({
        storage: space,
        places: { ...places, logo: (el) => (places.logo(el), localStorage.setItem(`${space}:cat:v1`, JSON.stringify({ v: 1, name: 'Пух', seenStage: 0, greetDay: day, future: 5 }))) },
      });
    }, restored);
    await page.clock.runFor(3000);
    const mounted = await page.evaluate((k) => ({ name: document.querySelector('#cat-dock [data-cat-name]')?.textContent ?? '', raw: JSON.parse(localStorage.getItem(k)) }), `${restored}:cat:v1`);
    const seenMount = await fx(page);
    check(
      `${label}: подключение — сайт восстановил значение до запуска (события нет): без повторного приветствия, имя восстановленное, запись как есть`,
      !seenMount.poses.includes('greet') && mounted.name === 'Пух' && mounted.raw.future === 5 && mounted.raw.name === 'Пух',
      JSON.stringify({ mounted, seenMount }),
    );
    await page.evaluate(() => window.stand.pet.destroy());

    // Контроль: без внешней записи новая ступень «Освоился» — праздник, примерка платка, объявление и отметка.
    const plain = 'fresh-stage-ok';
    await mountFresh(page, base, plain, { cat: { v: 1, seenStage: 0, greetDay: '@today' } }, 2, 1);
    await watchFx(page);
    await page.evaluate(() => {
      window.qaCounts.marks = 3;
      window.stand.pet.notify('saved', { key: 'one', counted: true });
    });
    await page.clock.runFor(4500);
    const seenPlain = await fx(page);
    const marked = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).seenStage, `${plain}:cat:v1`);
    check(
      `${label}: контроль — обычное открытие ступени: праздник, «unlock» с примеркой платка, объявление «Освоился», отметка 1`,
      seenPlain.poses.includes('joy') && seenPlain.poses.includes('unlock') && seenPlain.accs.includes('plaid') && seenPlain.live.some((text) => text.includes('открыта ступень «Освоился»')) && marked === 1,
      JSON.stringify({ seenPlain, marked }),
    );
    check(`${label}: ошибок страницы и предупреждений модуля нет`, page.qaErrors.length === 0, page.qaErrors.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}
