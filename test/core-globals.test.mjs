// Ядро без браузера (PL03, docs/ARCHITECTURE.md § 3.1): браузерные глобалы — ловушки, которые бросают и записывают
// обращение, до импорта ядра, веб-адаптера хранения (с подменённым area и целью событий) и асинхронного координатора.
// Импорт и все действия срезов PL03 и PL04.1 — создание, запуск, команды, контекст, видимость, вид, прямой отклик,
// сработавшие задачи (реакция, облако, покой, полночь), подписка, событие другой вкладки, асинхронная запись, отключение — ни одного
// обращения; порты при загрузке модулей и при создании не вызываются, работа PL04.1 пользуется random и scheduler.
// Отдельный процесс node --test.
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
  assert.equal(a.start({ around: true }).ok, true);
  assert.equal(a.setName('Барсик').save.status, 'saved');
  assert.equal(a.setAppearance({ coat: 'ginger' }).save.status, 'saved');
  assert.equal(a.feed({ around: true }).save.status, 'saved');
  assert.equal(a.notify('saved', { key: 'k1', counted: true, first: true }).reacted, true);
  // PL04.1: контекст, видимость, вид, прямой отклик и сработавшие задачи — без браузера.
  assert.equal(a.setContext({ typing: true, focus: true }).ok, true);
  assert.equal(a.setContext({ typing: false }).ok, true);
  assert.equal(a.setSight({ around: true, view: 'corner' }).ok, true);
  assert.equal(a.react('pet', { explicit: true }).ok, true);
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
  c.start({ around: true });
  const named = c.setName('Пух');
  await store.drain();
  assert.equal(await named.save.done, 'saved');
  c.destroy();

  // Системные порты по умолчанию (Date, Math.random, setTimeout, console) — тоже без браузерных глобалов.
  const d = createPetCore({ storage: site.storage });
  d.start({ around: true });
  d.destroy();

  assert.deepEqual(touched, [], 'действия ядра');
  assert.ok(quiet.calls.random > 0 && quiet.calls.scheduler > 0, `работа PL04.1 пользуется random и scheduler: ${JSON.stringify(quiet.calls)}`);
  assert.deepEqual(log.list, []);
  assert.ok(seen.includes('Барсик') && seen.includes('Пиксель'), seen.join(','));
});
