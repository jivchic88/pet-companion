// Ядро без браузера (PL03, docs/ARCHITECTURE.md § 3.1): браузерные глобалы — ловушки, которые бросают и записывают
// обращение, до импорта ядра, веб-адаптеров хранения и резервирования (с подменёнными area, целью событий и IndexedDB) и
// асинхронного координатора. Импорт и все действия срезов PL03, PL04.1 и PL04.2 — создание, запуск, команды, контекст,
// видимость, присутствие, виды, объявление отображения, прямой отклик, сработавшие задачи (реакция, облако, покой,
// полночь), редкая сценка с резервированием дня и копией, подписка, событие другой вкладки, асинхронная запись,
// отключение — ни одного обращения; порты при загрузке модулей и при создании не вызываются, работа PL04.1 пользуется
// random и scheduler. Метка вкладки дня сценки — без crypto. PL04.3: «Поиграть» с полом в единицах рисунка (прямые
// действия, жест поглаживания с удержанием, перенос предмета и бросок мячика, сброс итога задачей), «Обустроить уголок»
// (выбор, шаг, перенос, отмена переноса, обычная расстановка, сохранение и отмена), чужая расстановка и место из другой
// вкладки, место legacy-раскладки (setPlace), «устроился» (arrive), асинхронное сохранение комнаты — тоже без браузерных
// глобалов. PL05: публичный вход pet/core.mjs — импорт, хранилище на Map (синхронно и асинхронно), команды, жест, перенос
// предмета, комната, подписка и отключение — тоже. Отдельный процесс node --test.
import assert from 'node:assert/strict';
import test from 'node:test';

const TRAPS = ['window', 'document', 'navigator', 'localStorage', 'indexedDB', 'matchMedia', 'crypto', 'fetch'];
const touched = [];
for (const name of TRAPS) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      touched.push(name);
      throw new Error(`ядро обратилось к ${name}`);
    },
  });
}

test('глобалы-ловушки: импорт ядра и веб-адаптера и все действия среза — без window, document, navigator, localStorage, indexedDB, matchMedia, crypto, fetch', async () => {
  assert.throws(() => globalThis.localStorage, /ядро обратилось/, 'ловушка действует');
  touched.length = 0;
  const kit = await import('./core-kit.mjs');
  const { createPetCore } = await import('../pet/core/index.mjs');
  const { createWebScenes } = await import('../pet/web/scenes.mjs');
  assert.deepEqual(touched, [], 'импорт');

  // Синхронный веб-координатор (подменённые хранилище и цель событий).
  const site = kit.web({ cat: { v: 3, name: 'Марс', future: 1 } });
  assert.equal(site.storage.load(), 'ready');
  const time = kit.clock();
  const counts = kit.host(3, 1);
  const quiet = kit.idle();
  const log = kit.journal();
  const before = { clock: time.state.calls, progress: counts.state.calls };
  const a = createPetCore({ storage: site.storage, progress: counts.progress, clock: time.port, random: quiet.random, scheduler: quiet.scheduler, log: log.port });
  const b = createPetCore({ storage: site.storage, progress: counts.progress, clock: time.port, random: quiet.random, scheduler: quiet.scheduler, log: log.port });
  assert.deepEqual({ clock: time.state.calls, progress: counts.state.calls, ...quiet.calls }, { ...before, random: 0, scheduler: 0 }, 'создание не вызывает порты и счёт хоста');
  const seen = [];
  b.subscribe((update) => seen.push(update.snapshot.name.display));
  assert.equal(a.setDisplay(kit.LEGACY_DISPLAY).ok, true);
  assert.equal(a.start().ok, true);
  assert.equal(a.setName('Барсик').save.status, 'saved');
  assert.equal(a.setAppearance({ coat: 'ginger' }).save.status, 'saved');
  assert.equal(a.feed().save.status, 'saved');
  assert.equal(a.notify('saved', { key: 'k1', counted: true, first: true }).reacted, true);
  // PL04.1: контекст, видимость, вид, прямой отклик и сработавшие задачи — без браузера.
  assert.equal(a.setContext({ typing: true, focus: true }).ok, true);
  assert.equal(a.setContext({ typing: false }).ok, true);
  // PL04.2: присутствие, вызов, виды, «Скрыть» и «Показать».
  assert.equal(a.setPresence('on-call').save.status, 'saved');
  assert.equal(a.open('play', { source: 'call' }).ok, true);
  assert.equal(a.interact({ type: 'pet' }).ok, true);
  assert.equal(a.open('corner').ok, true);
  assert.equal(a.close().ok, true);
  assert.equal(a.setPresence('always').save.status, 'saved');
  assert.equal(a.hide().ok, true);
  assert.equal(a.show().ok, true);
  assert.equal(a.setDisplay({ full: false, moving: true }).ok, true);
  assert.equal(a.setDisplay({ moving: false }).ok, true);
  assert.equal(a.setVisible(false).ok, true);
  assert.equal(a.setVisible(true).ok, true);
  assert.equal(a.setReducedMotion(true).ok, true);
  assert.equal(a.activity().ok, true);
  for (const run of quiet.tasks.splice(0)) run();
  site.put('cat', { ...site.json('cat'), name: 'Пиксель' });
  site.events.fire(site.keys.cat);
  assert.equal(b.getState().name.display, 'Пиксель', 'событие другой вкладки — сверка и поглощение');
  a.destroy();
  b.destroy();
  assert.equal(site.json('cat').future, 1);

  // Асинхронный координатор с ручным подтверждением.
  const store = kit.manual();
  assert.equal(await store.load(), 'ready');
  const c = createPetCore({ storage: store.storage, progress: counts.progress, clock: time.port, random: quiet.random, scheduler: quiet.scheduler, log: log.port });
  c.start();
  const named = c.setName('Пух');
  await store.drain();
  assert.equal(await named.save.done, 'saved');
  c.destroy();

  // Системные порты по умолчанию (Date, Math.random, setTimeout, console) — тоже без браузерных глобалов.
  const d = createPetCore({ storage: site.storage });
  d.start();
  d.destroy();

  // Редкая сценка до конца: выбор (заданная случайность), резервирование тестовым портом и веб-адаптером IndexedDB на
  // памяти (подменённая фабрика), показ, копия дня через координатор; метка вкладки — random и clock, без crypto.
  for (const make of [(ns) => kit.reserver(kit.sceneStore(), ns).port, (ns) => createWebScenes({ namespace: ns, idb: kit.fakeIdb(`${ns}:scene`).tab() })]) {
    const L = kit.life({ cat: { v: 1, seenStage: 1, greetDay: kit.DAY } }, { counts: kit.host(4, 1), random: kit.series([], 0), display: kit.LEGACY_DISPLAY, scenes: make('globals') });
    L.core.start();
    L.counts.set(5, 2);
    L.core.notify('saved', { key: 'g1', counted: true });
    L.plan.advance(1600);
    await kit.flush();
    await kit.flush();
    assert.equal(L.state().pose.reaction?.scene, true, 'сценка показана');
    assert.equal(L.json('scene').day, kit.DAY, 'копия дня записана');
    L.core.destroy();
  }

  // PL04.3: игра, жест, предметы, редактор комнаты, место legacy-раскладки, «устроился» — ручные часы и планировщик.
  const P = kit.life({ cat: { v: 1, seenStage: 2, greetDay: kit.DAY } }, { counts: kit.host(9, 1), display: kit.LEGACY_DISPLAY });
  P.core.start();
  assert.equal(P.core.open('play').ok, true);
  assert.equal(P.core.setDisplay({ playFloor: [-40, -10, 300, 230], playTouch: 14 }).ok, true);
  const { id } = P.core.stroke.start();
  P.plan.advance(200);
  assert.equal(P.core.stroke.step(id).outcome, 'pet');
  P.plan.advance(1500);
  assert.equal(P.state().pose.hold, 'pet');
  assert.equal(P.core.stroke.end(id).ok, true);
  assert.deepEqual([P.core.interact({ type: 'paw' }).outcome, P.core.stroke.cancel(id).changed], ['paw', false]);
  P.plan.advance(2000);
  assert.equal(P.core.toy.drag('bowl', P.state().play.toys.bowl.at).ok, true);
  assert.equal(P.core.toy.drag('bowl', [70, 214]).ok, true);
  assert.equal(P.core.toy.drop().outcome, 'sniff');
  P.plan.advance(2000);
  P.core.toy.drag('ball', P.state().play.toys.ball.at);
  P.core.toy.drag('ball', [240, 214]);
  assert.equal(P.core.toy.drop({ roll: -40 }).outcome, 'ball');
  P.core.toy.drag('bowl', P.state().play.toys.bowl.at);
  assert.equal(P.core.toy.cancel().changed, true);
  assert.equal(P.core.interact({ type: 'ball', to: 'roll' }).ok, true);
  P.plan.advance(5000);
  assert.equal(P.state().play.outcome, '', 'итог сброшен задачей ядра');
  assert.equal(P.core.open('room').ok, true);
  P.core.room.select('yarn');
  assert.equal(P.core.room.nudge('right').changed, true);
  P.core.room.drag('bowl', P.state().room.draft.pos.bowl);
  P.core.room.drag('bowl', [250, 230]);
  assert.equal(P.core.room.dragCancel().changed, true);
  P.core.room.drag('rest', P.state().room.draft.pos.rest);
  P.core.room.drag('rest', [150, 210]);
  P.core.room.drop();
  P.core.room.move('bowl', [300, 230]);
  assert.equal(P.core.room.save().save.status, 'saved');
  P.core.open('room');
  P.core.room.reset();
  P.core.room.cancel();
  P.put('room', { v: 1, dog: { rope: { x: 330, y: 240 } }, cat: P.json('room').cat });
  P.events.fire(P.keys.room);
  P.put('place', { v: 1, desktop: { place: 'logo' } });
  P.events.fire(P.keys.place);
  assert.equal(P.state().place.desktop.place, 'logo', 'место из другой вкладки — поглощение');
  assert.equal(P.core.setPlace({ phone: { view: 'full' } }).save.status, 'saved');
  P.core.close();
  P.core.arrive();
  P.core.destroy();
  assert.deepEqual([P.json('place').phone.view, P.json('room').dog.rope.x, P.log.list], ['full', 330, []]);
  // Асинхронное сохранение комнаты: выход сразу, pending, поздний успех.
  const slow = kit.manual();
  assert.equal(await slow.load(), 'ready');
  const Q = kit.life({}, { storage: slow.storage, counts: kit.host(1, 1), display: kit.LEGACY_DISPLAY });
  Q.core.start();
  await slow.drain();
  Q.core.open('room');
  Q.core.room.select('yarn');
  Q.core.room.nudge('right');
  const late = Q.core.room.save();
  assert.equal(late.save.status, 'pending');
  await slow.drain();
  assert.equal(await late.save.done, 'saved');
  Q.core.destroy();

  assert.deepEqual(touched, [], 'действия ядра');
  assert.ok(quiet.calls.random > 0 && quiet.calls.scheduler > 0, `работа PL04.1 пользуется random и scheduler: ${JSON.stringify(quiet.calls)}`);
  assert.deepEqual(log.list, []);
  assert.ok(seen.includes('Барсик') && seen.includes('Пиксель'), seen.join(','));
});

test('глобалы-ловушки (PL05): публичный вход pet-companion/core — импорт, createStorage на Map (синхронно и асинхронно), команды, подписка, отключение — без браузерных глобалов', async () => {
  touched.length = 0;
  const { createPetCore, createStorage, localDay, VERSION } = await import('../pet/core.mjs');
  assert.deepEqual(touched, [], 'импорт входа ядра');
  const map = new Map();
  const storage = createStorage({ namespace: 'globals-public', backend: { get: (name) => map.get(name) ?? null, set: (name, text) => void map.set(name, text) } });
  assert.equal(storage.load(), 'ready');
  let now = Date.parse('2026-10-15T10:00:00Z');
  const clock = { now: () => now, day: () => '2026-10-15', nextDay: (at) => at + 86_400_000 };
  const scheduler = { later: () => () => {} };
  const pet = createPetCore({ storage, progress: () => ({ marks: 3, today: 1 }), clock, scheduler, random: () => 0.5 });
  const seen = [];
  pet.subscribe((update) => seen.push(update.reason));
  pet.start();
  pet.setName('Пиксель');
  pet.notify('saved', { key: 'g1', counted: true });
  pet.feed();
  pet.setDisplay({ views: ['corner', 'play', 'room'], playFloor: [-40, -10, 300, 230] });
  pet.open('play');
  const id = pet.stroke.start().id;
  pet.stroke.step(id);
  pet.stroke.end(id);
  pet.toy.drag('ball', [120, 214]);
  pet.toy.drop({ roll: 20 });
  pet.open('room');
  pet.room.move('bowl', [120, 230]);
  pet.room.save();
  pet.close();
  pet.destroy();
  const slow = [];
  const remote = createStorage({ namespace: 'globals-async', backend: { async: true, get: () => new Promise((resolve) => slow.push(() => resolve(null))), set: () => new Promise((resolve) => slow.push(resolve)) } });
  const loading = remote.load();
  while (slow.length) {
    slow.shift()();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(await loading, 'ready');
  const late = createPetCore({ storage: remote, clock, scheduler, random: () => 0.5 });
  const named = late.setName('Кекс');
  late.destroy();
  while (slow.length) {
    slow.shift()();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(await named.save.done, 'saved');
  assert.deepEqual([touched, typeof localDay(new Date(now)), VERSION.length > 0, seen[0], seen.at(-1)], [[], 'string', true, 'initial', 'destroyed']);
  now += 1;
});
