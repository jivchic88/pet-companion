// Веб-оболочка на ядре (PL03) в Chrome: настоящий mountPet на стенде и второе ядро той же копии модуля на том же
// координаторе пространства имён (импорт /pet/core/index.mjs и /pet/web/storage.mjs — только проверка, входа пакета нет).
// Каждая запись ключей cat, companion, look, treat идёт через веб-адаптер координатора (стек setItem), а не из оболочки;
// правки уголка второе ядро поглощает; правки второго ядра оболочка показывает (имя, напарник, облик, «скрыт»); кормление
// и подтверждённое занятие — решение ядра, синхронный итог в объявлении; событие без key — как 0.1.4; у экземпляра нет
// новых публичных свойств. Запуск — в составе npm run test:browser (test/browser.mjs).

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
    check(`${label}: у экземпляра прежние свойства — без pet.core и новых методов до PL05`, pet === 'close,destroy,mounted,notify,open,opened,update,version', pet);
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

    // Все записи ключей ядра — через веб-адаптер координатора; ключей оболочки — из неё.
    const sets = await page.evaluate(() => window.qaSets.map(({ key, stack }) => ({ key, adapter: stack.includes('/pet/web/storage.mjs'), shell: stack.includes('/pet/pet.mjs') })));
    const coreSets = sets.filter((item) => CORE_KEYS.some((name) => item.key === `core1:${name}:v1`));
    const shellSets = sets.filter((item) => item.key.startsWith('core1:') && !coreSets.includes(item));
    check(`${label}: каждая запись cat, companion, look, treat — через веб-адаптер координатора (${coreSets.length})`, coreSets.length >= 8 && coreSets.every((item) => item.adapter), JSON.stringify(coreSets.filter((item) => !item.adapter)));
    check(`${label}: ключи оболочки до PL04 (place, presence, room, scene) — мимо координатора`, shellSets.every((item) => !item.adapter && item.shell), JSON.stringify(shellSets));

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
