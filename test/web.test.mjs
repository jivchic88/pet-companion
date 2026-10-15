// Вход pet-companion/web (PL07) без браузера: импорт не трогает браузерные глобалы (ловушки); поверхность — ровно
// mountPetIn, createWebStorage, createWebScenes, catWeb, dogWeb; mountPetIn вне браузера — отказ без исключения; проверка
// контейнера, настроек, определений и наборов — до любых действий (ни создания элементов, ни вставки в контейнер, ни
// хранилища); createWebStorage — непрозрачный загруженный фасад того же внутреннего координатора, что у mountPet и
// mountPetIn с этим namespace (одна очередь ключа и реестр подключений), публичный createPetCore его принимает, ядра на
// нём видят правки друг друга; createWebScenes — общее резервирование на IndexedDB и namespace; ошибки настроек — PetError.
// Отдельный процесс node --test.
import assert from 'node:assert/strict';
import test from 'node:test';

const TRAPS = ['window', 'document', 'navigator', 'localStorage', 'indexedDB', 'matchMedia', 'crypto', 'fetch', 'requestAnimationFrame', 'ResizeObserver', 'HTMLElement', 'customElements', 'location'];
const touched = [];
const trap = () => {
  for (const name of TRAPS) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        touched.push(name);
        throw new Error(`обращение к ${name}`);
      },
    });
  }
};
const untrap = () => {
  for (const name of TRAPS) delete globalThis[name];
};

let Web;
let Core;
let pets;
let behaviors;
let kit;

test('импорт pet-companion/web не трогает браузерные глобалы; поверхность — ровно mountPetIn, createWebStorage, createWebScenes, catWeb, dogWeb', async () => {
  trap();
  try {
    Web = await import('../pet/web.mjs');
    Core = await import('../pet/core.mjs');
    pets = await import('../pet/pets.mjs');
    behaviors = await import('../pet/behaviors.mjs');
    assert.deepEqual(touched, [], 'импорт');
  } finally {
    untrap();
  }
  kit = await import('./core-kit.mjs');
  assert.deepEqual(Object.keys(Web).sort(), ['catWeb', 'createWebScenes', 'createWebStorage', 'dogWeb', 'mountPetIn']);
  assert.equal(Web.catWeb.pet, 'cat');
  assert.equal(Web.dogWeb.pet, 'dog');
  assert.ok(Object.isFrozen(Web.catWeb) && Object.isFrozen(Web.dogWeb), 'штатные наборы неизменяемы');
});

test('mountPetIn вне браузера — отказ без исключения: mounted false, core null, open/close — destroyed, destroy безопасен; одно console.error', () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  let view;
  try {
    view = Web.mountPetIn({}, { namespace: 'node' });
  } finally {
    console.error = original;
  }
  assert.equal(view.mounted, false);
  assert.equal(view.core, null);
  assert.equal(view.open().error.code, 'destroyed');
  assert.equal(view.close().error.code, 'destroyed');
  assert.equal(view.destroy(), undefined);
  view.destroy();
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^Питомец не подключён: нет document/);
  assert.ok(Object.isFrozen(view));
});

// Поддельные document и контейнер: любое действие с DOM записывается — до проверки настроек его быть не должно.
function fakePage() {
  const actions = [];
  const document = {
    createElement: (tag) => {
      actions.push(`createElement ${tag}`);
      throw new Error('создание элемента до проверки');
    },
    get body() {
      actions.push('body');
      return null;
    },
  };
  const container = {
    nodeType: 1,
    isConnected: true,
    ownerDocument: document,
    children: [],
    append: () => actions.push('append'),
    appendChild: () => actions.push('appendChild'),
  };
  return { document, container, actions };
}

test('проверка до любых действий: контейнер, настройки, определения и наборы — отказ без элементов, вставки и хранилища', () => {
  const page = fakePage();
  globalThis.document = page.document;
  globalThis.window = {};
  const storage = [];
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      storage.push('localStorage');
      throw new Error('хранилище до проверки');
    },
  });
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  const bunny = { ...Web.catWeb, pet: 'cat', poses: Web.catWeb.poses.filter((pose) => pose !== 'calm') };
  const cases = [
    [() => Web.mountPetIn(null), /контейнер — элемент/],
    [() => Web.mountPetIn({ nodeType: 3 }), /контейнер — элемент/],
    [() => Web.mountPetIn({ ...page.container, isConnected: false }), /не в документе/],
    [() => Web.mountPetIn({ ...page.container, ownerDocument: {} }), /не в документе/],
    [() => Web.mountPetIn(page.container, 'opts'), /настройки — объект/],
    [() => Web.mountPetIn(page.container, { places: {} }), /неизвестная настройка: places/],
    [() => Web.mountPetIn(page.container, { storage: 'x' }), /неизвестная настройка: storage/],
    [() => Web.mountPetIn(page.container, { namespace: '' }), /namespace — непустая строка/],
    [() => Web.mountPetIn(page.container, { progress: 3 }), /progress — не функция/],
    [() => Web.mountPetIn(page.container, { home: 'x' }), /home — не функция/],
    [() => Web.mountPetIn(page.container, { onOpenChange: {} }), /onOpenChange — не функция/],
    [() => Web.mountPetIn(page.container, { watchTyping: 'no' }), /watchTyping — boolean/],
    [() => Web.mountPetIn(page.container, { pets: [] }), /invalid-options/],
    [() => Web.mountPetIn(page.container, { kits: [bunny] }), /не нарисовано \(poses\): calm/],
    [() => Web.mountPetIn(page.container, { kits: [{ ...Web.catWeb, styles: ['./relative.css'] }] }), /styles — плотный массив абсолютных адресов/],
    [() => Web.mountPetIn({ ...page.container, children: [{ hasAttribute: (name) => name === 'data-pet-view' }] }), /в контейнере уже есть питомец/],
  ];
  try {
    for (const [mount, why] of cases) {
      const view = mount();
      assert.equal(view.mounted, false);
      assert.equal(view.core, null);
      assert.match(errors.at(-1), why);
    }
  } finally {
    console.error = original;
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.localStorage;
  }
  assert.equal(errors.length, cases.length, 'по одному сообщению на отказ');
  assert.deepEqual(page.actions, [], 'ни одного действия с DOM');
  assert.deepEqual(storage, [], 'ни одного обращения к хранилищу');
});

test('createWebStorage: ошибки настроек — PetError; тот же загруженный непрозрачный фасад для namespace; тот же внутренний координатор, что у mountPet и mountPetIn', async () => {
  for (const bad of ['x', [], { namespace: '' }, { namespace: 3 }, { namespace: 'a', area: {} }, { backend: {} }]) {
    assert.throws(() => Web.createWebStorage(bad), (error) => error instanceof Core.PetError && error.code === 'invalid-options', JSON.stringify(bad));
  }
  const store = kit.area();
  globalThis.localStorage = store;
  try {
    const a = Web.createWebStorage({ namespace: 'pub' });
    assert.equal(a.status, 'ready', 'создаётся загруженным');
    assert.equal(Web.createWebStorage({ namespace: 'pub' }), a, 'тот же объект');
    assert.notEqual(Web.createWebStorage({ namespace: 'other' }), a, 'другой namespace — другой');
    assert.equal(Web.createWebStorage(), Web.createWebStorage({ namespace: 'pet' }), 'по умолчанию — pet');
    assert.ok(Object.isFrozen(a));
    assert.deepEqual(Object.keys(a).sort(), ['load', 'status'], 'наружу — только status и load');
    assert.equal(a.connect, undefined, 'подключения создаёт ядро');
    assert.equal(a.load(), 'ready', 'load — синхронный барьер');
    // Тот же внутренний координатор: веб-адаптер legacy и контейнера с тем же namespace.
    const { createWebStorage: inner } = await import('../pet/web/storage.mjs');
    const { coordinatorOf } = await import('../pet/core/storage.mjs');
    assert.equal(coordinatorOf(a), inner({ namespace: 'pub' }), 'один координатор — не второй backend и не вторая очередь');
  } finally {
    delete globalThis.localStorage;
  }
});

test('публичный createPetCore на createWebStorage и createWebScenes (штатные определения): команды, подписка; соседнее ядро на том же координаторе видит правку, другое namespace — нет', async () => {
  const store = kit.area();
  globalThis.localStorage = store;
  globalThis.indexedDB = kit.fakeIdb('shared:scene').tab();
  try {
    const storage = Web.createWebStorage({ namespace: 'shared' });
    const scenes = Web.createWebScenes({ namespace: 'shared' });
    assert.equal(Web.createWebScenes({ namespace: 'shared' }), scenes, 'резервирование — общее для namespace');
    assert.deepEqual(Object.keys(scenes), ['reserve'], 'наружу — только reserve');
    assert.ok(Object.isFrozen(scenes));
    const make = () => Core.createPetCore({ storage, scenes, pets: [pets.cat, pets.dog], behaviors: [behaviors.calm], progress: () => ({ marks: 1, today: 1 }) });
    const a = make();
    const b = make();
    // Соседнее ядро через внутренний путь веба (как mountPetIn) — тот же координатор.
    const { createPetCore: inner } = await import('../pet/core/index.mjs');
    const { createWebStorage: innerStorage } = await import('../pet/web/storage.mjs');
    const c = inner({ storage: innerStorage({ namespace: 'shared' }), pets: [pets.cat, pets.dog], behaviors: [behaviors.calm] });
    const other = Core.createPetCore({ storage: Web.createWebStorage({ namespace: 'apart' }), pets: [pets.cat], behaviors: [behaviors.calm] });
    const seen = { b: [], c: [], other: [] };
    b.subscribe((update) => seen.b.push([update.reason, update.snapshot.name.display]), { initial: false });
    c.subscribe((update) => seen.c.push([update.reason, update.snapshot.name.display]), { initial: false });
    other.subscribe((update) => seen.other.push(update.reason), { initial: false });
    for (const core of [a, b, c, other]) assert.equal(core.start().ok, true);
    seen.b.length = seen.c.length = seen.other.length = 0;
    const named = a.setName('Пиксель');
    assert.deepEqual([named.ok, named.save.status], [true, 'saved'], 'запись синхронно, без pending');
    assert.equal(JSON.parse(store.getItem('shared:cat:v1')).name, 'Пиксель');
    assert.deepEqual(seen.b, [['storage', 'Пиксель']], 'соседнее ядро — обновлением storage');
    assert.deepEqual(seen.c, [['storage', 'Пиксель']], 'ядро внутреннего пути — тоже');
    assert.deepEqual(seen.other, [], 'другое namespace — независимо');
    assert.equal(store.getItem('apart:cat:v1') === null || JSON.parse(store.getItem('apart:cat:v1')).name !== 'Пиксель', true);
    // Независимые поля разных ядер не теряются: облик у b, имя у a.
    assert.equal(b.setAppearance({ coat: 'ginger' }).save.status, 'saved');
    assert.deepEqual([JSON.parse(store.getItem('shared:cat:v1')).name, JSON.parse(store.getItem('shared:look:v1')).cat], ['Пиксель', 'ginger']);
    // Одно лакомство в день на всех ядрах namespace.
    assert.equal(a.feed().ok, true);
    assert.equal(b.feed().error.code, 'treat-fed', 'второе ядро — уже угостили');
    // Отключение одного не трогает соседей и общую очередь.
    a.destroy();
    assert.equal(b.setName('Барсик').save.status, 'saved');
    assert.equal(c.getState().name.display, 'Барсик');
    for (const core of [b, c, other]) core.destroy();
  } finally {
    delete globalThis.localStorage;
    delete globalThis.indexedDB;
  }
});

test('createWebScenes: ошибки настроек — PetError; без IndexedDB — fail (сценок нет), обещание не отклоняется; с IndexedDB — общий день', async () => {
  for (const bad of ['x', { namespace: '' }, { namespace: 'a', idb: {} }]) {
    assert.throws(() => Web.createWebScenes(bad), (error) => error instanceof Core.PetError && error.code === 'invalid-options', JSON.stringify(bad));
  }
  const none = Web.createWebScenes({ namespace: 'no-idb' });
  assert.equal(await none.reserve(() => ({ day: 'x' }), () => {}), 'fail');
  const db = kit.fakeIdb('days:scene');
  globalThis.indexedDB = db.tab();
  try {
    const scenes = Web.createWebScenes({ namespace: 'days' });
    let shown = 0;
    assert.equal(await scenes.reserve(() => ({ day: '2026-10-15', by: 'a' }), () => (shown += 1)), 'shown');
    assert.equal(await scenes.reserve((stored) => (stored ? null : { day: '2026-10-15', by: 'b' }), () => (shown += 1)), 'skip', 'день уже занят — второй показ не ставится');
    assert.equal(shown, 1);
    assert.deepEqual(db.data.get('shown'), { day: '2026-10-15', by: 'a' });
  } finally {
    delete globalThis.indexedDB;
  }
});
