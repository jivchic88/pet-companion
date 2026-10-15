// Наборы отображения в Chrome (PL06, по независимой проверке): настоящий mountPet на проверочном стенде. Отказ подключения
// до любых действий — свой набор без обязательной calm, которую использует сценка; штатный набор против изменённого
// определения своего ID: поза через замену (wait → своя поза сценки roll), облик purple, аксессуар, вещь. Каждый отказ —
// ровно одно сообщение «Питомец не подключён: …»; работающий питомец остаётся тем же подключением, разметка страницы,
// ключи localStorage с их значениями, базы IndexedDB и снимок — без изменений. Контроли подключаются и рисуют: полный свой
// набор с purple (облик purple на рисунках), набор без необязательных сценок и декоративных поз, определение без сценки,
// которую рисует штатный набор (не объявлена — без предупреждений журнала). 1280×900 и 390×844 (эмуляция ширины и
// касаний в Chrome, не телефон). Без ошибок страницы. Запуск — в составе npm run test:browser.

const REFUSED = 'Питомец не подключён: ';

// В странице: определения и наборы случаев (модули стенда /pet/…), попытка подключения с настройками стенда.
function cases() {
  return Promise.all([import('/pet/pet.mjs'), import('/pet/core.mjs'), import('/pet/pets.mjs'), import('/pet/behaviors.mjs'), import('/pet/web/kits.mjs')]).then(([{ mountPet }, { definePet }, { cat, dog }, { calm }, { catWeb }]) => {
    const without = (list, ...ids) => list.filter((id) => !ids.includes(id));
    const ROLL = { id: 'roll', pose: 'roll', needs: 'any', ms: 2000, still: 1000, text: 'катается' };
    const purple = definePet({ ...cat, coats: [...cat.coats, { id: 'purple', title: 'Фиолетовый' }] });
    // Полный свой набор для purple: рисунок кота, облик purple отмечен на рисунке (свой CSS сайта его раскрасил бы).
    const purpleArt = (options) => (options.coat === 'purple' ? catWeb.art({ ...options, coat: 'smoke' }).replace('data-coat="smoke"', 'data-coat="purple"') : catWeb.art(options));
    const BUILD = {
      calmScene: () => ({ pets: [definePet({ ...cat, poses: without(cat.poses, 'stretch', 'curl'), scenes: [{ ...cat.scenes[0], pose: 'calm' }] }), dog], kits: [{ ...catWeb, poses: without(catWeb.poses, 'calm'), scenes: [] }] }),
      fallbackPose: () => ({ pets: [definePet({ ...cat, poses: [...without(cat.poses, 'wait'), 'roll'], poseFallback: { wait: 'roll' }, scenes: [...cat.scenes, ROLL] }), dog] }),
      stockCoat: () => ({ pets: [purple, dog] }),
      stockAccessory: () => ({ pets: [definePet({ ...cat, accessories: [...cat.accessories, { id: 'bow', title: 'Бантик', stage: 2 }] }), dog] }),
      stockItem: () => ({ pets: [definePet({ ...cat, items: { ...cat.items, list: [...cat.items.list, { id: 'feather', title: 'Перо', stage: 2 }] } }), dog] }),
      override: () => ({ pets: [purple, dog], kits: [{ ...catWeb, coats: [...catWeb.coats, 'purple'], art: purpleArt }] }),
      optional: () => ({ pets: [cat, dog], kits: [{ ...catWeb, poses: without(catWeb.poses, 'yawn', 'settle', 'stretch', 'curl'), scenes: [] }] }),
      noCurl: () => ({ pets: [definePet({ ...cat, poses: without(cat.poses, 'curl'), scenes: cat.scenes.filter((scene) => scene.id !== 'curl') }), dog] }),
    };
    window.qaKits = (name) => mountPet(window.stand.options({ behaviors: [calm], ...BUILD[name]() }));
  });
}

// Всё, что отказ не должен тронуть.
const snapshot = (page) =>
  page.evaluate(async () => ({
    html: document.documentElement.outerHTML,
    stored: JSON.stringify(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
    dbs: (await indexedDB.databases()).map((db) => db.name).sort().join(),
    state: JSON.stringify(window.stand.pet.getState()),
    owner: globalThis[Symbol.for('pet-module')]?.destroy !== undefined,
  }));
// Видимые рисунки питомца вне диалога: облики.
const coats = (page) => page.evaluate(() => [...document.querySelectorAll('.cat-art')].filter((el) => !el.closest('#cat-sheet') && el.getBoundingClientRect().width > 0).map((el) => el.dataset.coat));

export async function kitsQa(browser, base, check, open) {
  for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) await round(browser, base, check, open, size);
}

async function round(browser, base, check, open, size) {
  const label = `наборы ${size.width}×${size.height}`;
  const phone = size.width < 500;
  const { context, page } = await open(browser, { viewport: size, ...(phone ? { hasTouch: true, isMobile: true } : {}) });
  const told = (from) => page.qaErrors.slice(from);
  try {
    await page.goto(base);
    await page.waitForFunction(() => Boolean(window.stand?.pet?.mounted));
    await page.clock.runFor(3000);
    await page.evaluate(() => window.stand.pet.setName('Барсик'));
    await page.evaluate(cases);
    const BAD = [
      ['свой набор без обязательной calm, которую использует сценка', 'calmScene', 'kits[0]: набор «cat»: не нарисовано (poses): calm'],
      ['штатный набор: замена wait → своя поза сценки roll, которой нет в наборе', 'fallbackPose', 'штатный набор «cat»: не нарисовано (poses): roll'],
      ['штатный набор: облик purple определения', 'stockCoat', 'штатный набор «cat»: не нарисовано (coats): purple'],
      ['штатный набор: аксессуар bow определения', 'stockAccessory', 'штатный набор «cat»: не нарисовано (accessories): bow'],
      ['штатный набор: вещь feather определения', 'stockItem', 'штатный набор «cat»: не нарисовано (items): feather'],
    ];
    for (const [title, name, message] of BAD) {
      const before = await snapshot(page);
      const from = page.qaErrors.length;
      const result = await page.evaluate((name) => {
        const pet = window.qaKits(name);
        return { mounted: pet.mounted, state: pet.getState(), core: pet.core, working: window.stand.pet.mounted };
      }, name);
      const after = await snapshot(page);
      const lines = told(from);
      check(`${label}: ${title} — отказ до подключения, одно сообщение`, !result.mounted && result.state === null && result.core === null && lines.length === 1 && lines[0].startsWith(REFUSED) && lines[0].includes(message), JSON.stringify({ result, lines }));
      check(`${label}: ${title} — прежний питомец подключён, разметка, хранилище, базы и снимок без изменений`, result.working && after.owner && after.html === before.html && after.stored === before.stored && after.dbs === before.dbs && after.state === before.state, JSON.stringify({ working: result.working, html: after.html === before.html, stored: after.stored === before.stored, dbs: [before.dbs, after.dbs], state: after.state === before.state }));
    }

    // Контроли: подключение проходит (заменяет прежнего питомца) и рисует.
    let from = page.qaErrors.length;
    const override = await page.evaluate(() => {
      window.stand.pet = window.qaKits('override');
      const save = window.stand.pet.setAppearance({ coat: 'purple' });
      return { mounted: window.stand.pet.mounted, ok: save.ok, status: save.save.status, coat: window.stand.pet.getState().look.coat };
    });
    const drawn = await coats(page);
    check(`${label}: полный свой набор с purple — подключён, облик purple сохранён и на рисунках`, override.mounted && override.ok && override.status === 'saved' && override.coat === 'purple' && drawn.length > 0 && drawn.every((coat) => coat === 'purple'), JSON.stringify({ override, drawn }));
    for (const [title, name] of [
      ['набор без необязательных сценок и декоративных поз', 'optional'],
      ['определение без сценки curl при штатном наборе (не объявлена)', 'noCurl'],
    ]) {
      const result = await page.evaluate((name) => {
        window.stand.pet = window.qaKits(name);
        return { mounted: window.stand.pet.mounted, shown: window.stand.pet.getState().pet.shown, pose: document.querySelector('.cat-art')?.dataset.pose ?? '' };
      }, name);
      check(`${label}: ${title} — подключён, кот рисуется, предупреждений журнала нет`, result.mounted && result.shown === 'cat' && result.pose !== '' && told(from).length === 0, JSON.stringify({ result, lines: told(from) }));
      from = page.qaErrors.length;
    }
    await page.evaluate(() => window.stand.pet.destroy());
    const unexpected = page.qaErrors.filter((text) => !text.startsWith(REFUSED));
    check(`${label}: без ошибок страницы и других сообщений, кроме ожидаемых отказов`, unexpected.length === 0, unexpected.join(' | '));
  } catch (error) {
    check(`${label}: сценарий выполнен`, false, error.stack);
  } finally {
    await context.close();
  }
}
