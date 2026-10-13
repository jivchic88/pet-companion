// Ядро PL04.2 в Node — резервирование дня редкой сценки (docs/ARCHITECTURE.md § 9, § 5.4, § 8.8): тестовый порт с общим
// хранилищем дня и очередью на пространство имён, управляемые точки удержания без пауз (test/core-kit.mjs reserver), и
// веб-адаптер pet/web/scenes.mjs на IndexedDB в памяти (fakeIdb). Исходы shown, skip, fail, lost; исключения decide, show,
// порта и постановки записи; очередь освобождается исходом. Два ядра одного хранилища и пространства — одна сценка, разные
// пространства — независимы. Отмена в очереди, destroy до решения и после начала показа, поздний shown и lost прежнего
// ядра, lost не снимает более новую реакцию, новое ядро того же пространства видит день прежнего. Копия scene:v1 — неявная
// операция ядра: неизвестные поля и v, повреждённая копия, отказ записи, асинхронно pending и запись до destroy. Граница
// раунда: между decide, постановкой записи и началом показа — ни слушателей, ни журнала, команда порта — reentrant;
// слушатель после начала показа может выполнить команду, исключение слушателя доставку не обрывает. Отказы планировщика —
// без зависшей сценки и облака. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PHRASE_MS, REACTIONS } from '../pet/core/director.mjs';
import { createPetCore } from '../pet/core/index.mjs';
import { createWebScenes, sceneTurn } from '../pet/web/scenes.mjs';
import { calendar, DAY, fakeIdb, flush, host, journal, LEGACY_DISPLAY, life, manual, planner, reserver, sceneStore, series } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };
const playing = (L) => L.state().pose.reaction?.type ?? null;
const saved = (L, key, extra = {}) => L.core.notify('saved', { key, counted: true, ...extra });
function scened(initial = { cat: CAT }, { store = sceneStore(), ns = 'qa', port = null, counts = host(1, 1), ...parts } = {}) {
  const own = port ?? reserver(store, ns);
  const L = life(initial, { counts, display: LEGACY_DISPLAY, scenes: own.port, ...parts });
  assert.equal(L.core.start().ok, true);
  return { ...L, port: own, days: store };
}
// Занятие с выпавшей сценкой «потягивается» (реплика, шанс, вариант) и конец радости — резервирование.
async function attempt(L, key = 'K') {
  L.random.push(0, 0, 0);
  saved(L, key);
  assert.equal(L.state().scene.waiting?.type, 'stretch', 'попытка выбрана');
  L.plan.advance(REACTIONS.joy.ms);
  await flush();
}

// ---------- Ж. Исходы и ошибки ----------

test('shown: показ начат после постановки записи, день в хранилище резервирования, копия scene:v1 — неявной операцией ядра (день, метка, вариант кота); метка — random и clock', async () => {
  const L = scened({ cat: CAT, scene: { v: 2, day: '2026-10-12', cat: 'curl', future: [1] } });
  await attempt(L);
  assert.deepEqual(L.port.steps, ['enter', 'read', 'decide record', 'put', 'show', 'commit', '→ shown']);
  assert.deepEqual([playing(L), L.state().pose.reaction.scene, L.state().phrase.text], ['stretch', true, 'Марс потягивается.']);
  const record = L.days.days.get('qa');
  assert.match(record.by, /^[0-9a-z]+-[0-9a-z]+$/, 'метка вкладки: время и random в base36');
  assert.deepEqual(record, { v: 1, day: DAY, by: record.by, cat: 'stretch' });
  assert.deepEqual(L.json('scene'), { v: 2, day: DAY, cat: 'stretch', future: [1], by: record.by }, 'копия: неизвестные поля и больший v остаются');
  assert.deepEqual([L.state().scene, L.state().save.scene.status], [{ waiting: null, reserving: false }, 'saved']);
  // Тот же день: следующее занятие — без броска шанса (копия), резервирования нет.
  L.plan.advance(REACTIONS.stretch.ms);
  L.random.push(0, 0, 0);
  const taken = L.random.state.taken;
  saved(L, 'K2');
  assert.deepEqual([L.random.state.taken - taken, L.state().scene.waiting], [1, null], 'одна сценка за день — только реплика');
});

test('skip: день уже занят в записи резервирования, в копии (старая вкладка) или запись повреждена — без показа и записи; повреждённая не заменяется', async () => {
  for (const [title, setup, kept] of [
    ['день в записи', (store) => store.days.set('qa', { v: 1, day: DAY, by: 'другая' }), { v: 1, day: DAY, by: 'другая' }],
    ['повреждена: null', (store) => store.days.set('qa', null), null],
    ['повреждена: строка', (store) => store.days.set('qa', 'день'), 'день'],
    ['повреждена: массив', (store) => store.days.set('qa', [DAY]), [DAY]],
  ]) {
    const store = sceneStore();
    setup(store);
    const L = scened({ cat: CAT }, { store });
    await attempt(L);
    assert.deepEqual([L.port.steps.at(-1), L.port.calls.show, playing(L), L.raw('scene')], ['→ skip', 0, null, null], title);
    assert.deepEqual(store.days.get('qa'), kept, `${title}: не заменена`);
  }
  // Копия дня занята прежним кодом другой вкладки; событие storage не приходило — решение по свежей копии через координатор.
  const L = scened();
  L.random.push(0, 0, 0);
  saved(L, 'K');
  L.put('scene', { v: 1, day: DAY, by: 'старая вкладка', cat: '' });
  L.plan.advance(REACTIONS.joy.ms);
  await flush();
  assert.deepEqual([L.port.steps.at(-1), L.days.days.size, L.raw('scene')], ['→ skip', 0, JSON.stringify({ v: 1, day: DAY, by: 'старая вкладка', cat: '' })]);
});

test('fail: блокировка не взята, постановка записи бросила, чтение копии отказало (decide бросил) — ничего не показано, день свободен, повтора нет; очередь освобождена', async () => {
  for (const [title, setup] of [
    ['блокировка', (L) => (L.port.mode.failEnter = true)],
    ['постановка записи', (L) => (L.port.mode.throwPut = true)],
    ['чтение копии', () => {}],
  ]) {
    const L = scened();
    setup(L);
    if (title === 'чтение копии') {
      L.random.push(0, 0, 0);
      saved(L, 'K');
      L.store.denyGet = new RegExp(L.keys.scene);
      L.plan.advance(REACTIONS.joy.ms);
      await flush();
      L.store.denyGet = null;
    } else await attempt(L);
    assert.deepEqual([L.port.steps.at(-1), L.port.calls.show, playing(L), L.days.days.size, L.raw('scene')], ['→ fail', 0, null, 0, null], title);
    assert.deepEqual(L.state().scene, { waiting: null, reserving: false });
    L.port.mode.failEnter = false;
    L.port.mode.throwPut = false;
    // Очередь освобождена исходом: другое ядро того же хранилища показывает.
    const next = scened({ cat: CAT }, { store: L.days, port: reserver(L.days, 'qa') });
    await attempt(next);
    assert.equal(next.port.steps.at(-1), '→ shown', `${title}: очередь свободна`);
  }
});

test('lost: запись откатилась после начала показа — своя ещё текущая сценка остановлена, день свободен, копии нет', async () => {
  const L = scened();
  L.port.mode.abort = true;
  await attempt(L);
  assert.deepEqual([L.port.steps.slice(-3), playing(L), L.state().phrase, L.days.days.size, L.raw('scene')], [['show', 'abort', '→ lost'], null, null, 0, null]);
});

test('порт нарушает контракт: бросил при вызове, отклонил обещание, вернул не исход, shown без показа, decide и show не по порядку — безопасный исход, журнал, без необработанных ошибок', async () => {
  // shown без показа: день, по словам порта, подтверждён — копия отражает его; показа нет. Остальные — день свободен.
  const bad = [
    ['бросил', () => ({ reserve: () => { throw new Error('порт упал'); } }), 'резервирование сценки отказало', null],
    ['отклонил', () => ({ reserve: () => Promise.reject(new Error('отказ')) }), 'резервирование сценки отказало', null],
    ['не исход', () => ({ reserve: () => Promise.resolve('yes') }), 'вернуло не исход: yes', null],
    ['shown без показа', () => ({ reserve: (decide) => (decide(undefined), Promise.resolve('shown')) }), 'исход shown без показа', DAY],
    ['fail после показа', () => ({ reserve: (decide, show) => (decide(undefined), show(), Promise.resolve('fail')) }), 'исход fail после начала показа', null],
  ];
  for (const [title, make, warning, copy] of bad) {
    const L = scened({ cat: CAT }, { port: { port: make(), steps: [] } });
    await attempt(L);
    assert.ok(L.log.list.some((line) => line.includes(warning)), `${title}: ${L.log.list.join(' | ')}`);
    assert.deepEqual([playing(L) === 'stretch', L.json('scene')?.day ?? null, L.state().scene.reserving], [false, copy, false], `${title}: без зависшей сценки`);
  }
  // decide дважды и show без решения или дважды — только первое действует.
  let second = 'не вызван';
  const twice = scened({ cat: CAT }, {
    port: {
      port: {
        reserve(decide, show) {
          show();
          const record = decide(undefined);
          second = decide(undefined);
          show();
          show();
          return Promise.resolve(record ? 'shown' : 'skip');
        },
      },
    },
  });
  const ids = [];
  twice.core.subscribe((update) => update.snapshot.pose.reaction?.scene && ids.push(update.snapshot.pose.reaction.id), { initial: false });
  await attempt(twice);
  assert.deepEqual([second, playing(twice), new Set(ids).size, twice.json('scene').day], [null, 'stretch', 1, DAY], 'один показ, одна копия');
});

// ---------- З. Два ядра, пространства имён ----------

test('два ядра одного хранилища и пространства: обе попытки в очереди — одна сценка (второе ядро видит день первого); разные пространства — независимы', async () => {
  const store = sceneStore();
  const A = scened({ cat: CAT }, { store, ns: 'qa' });
  const B = scened({ cat: CAT }, { store, ns: 'qa', port: reserver(store, 'qa') });
  A.port.mode.hold.add('enter');
  await attempt(A, 'a');
  await attempt(B, 'b');
  assert.deepEqual([A.port.calls.reserve, B.port.calls.reserve, B.port.calls.decide], [1, 1, 0], 'B ждёт очереди A');
  await A.port.open('enter');
  await flush();
  assert.deepEqual([A.port.steps.at(-1), B.port.steps.at(-1), playing(A), playing(B)], ['→ shown', '→ skip', 'stretch', null]);
  const other = scened({ cat: CAT }, { store, ns: 'другое' });
  await attempt(other);
  assert.deepEqual([other.port.steps.at(-1), store.days.get('другое').day], ['→ shown', DAY], 'другое пространство — своя сценка');
});

// ---------- И. Отмена, destroy, поздние исходы ----------

test('отмена, пока попытка ждёт очереди, — skip без записи; destroy до решения — skip; новое ядро того же пространства не наследует попытку', async () => {
  const L = scened();
  L.port.mode.hold.add('enter');
  await attempt(L);
  assert.deepEqual([L.port.calls.reserve, L.state().scene.reserving], [1, true]);
  L.core.setContext({ typing: true });
  await L.port.open('enter');
  assert.deepEqual([L.port.steps.slice(-2), L.days.days.size, L.raw('scene'), L.state().scene.reserving], [['decide null', '→ skip'], 0, null, false]);
  const D = scened();
  D.port.mode.hold.add('enter');
  await attempt(D);
  D.core.destroy();
  await D.port.open('enter');
  assert.deepEqual([D.port.steps.slice(-2), D.days.days.size, D.raw('scene')], [['decide null', '→ skip'], 0, null], 'destroy до решения');
});

test('destroy после начала показа: запись не отменяется — день остаётся; поздний shown ничего не пишет; новое ядро того же пространства — второй сценки нет, другого — независимо', async () => {
  const store = sceneStore();
  const A = scened({ cat: CAT }, { store });
  A.port.mode.hold.add('commit');
  await attempt(A);
  assert.equal(playing(A), 'stretch');
  const dead = A.state();
  A.core.destroy();
  await A.port.open('commit');
  assert.deepEqual([A.port.steps.at(-1), store.days.get('qa').day, A.raw('scene'), A.core.getState().status], ['→ shown', DAY, null, 'destroyed']);
  assert.notEqual(dead, A.core.getState());
  // Новое ядро того же хранилища и пространства: день в записи резервирования — skip (копии нет, но запись решает).
  A.storage.load();
  const C = scened({ cat: CAT }, { store, storage: A.storage, port: reserver(store, 'qa') });
  await attempt(C, 'c');
  assert.deepEqual([C.port.steps.at(-1), playing(C), A.raw('scene')], ['→ skip', null, null]);
  const other = scened({ cat: CAT }, { store, ns: 'b', storage: A.storage, port: reserver(store, 'b') });
  await attempt(other, 'o');
  assert.equal(other.port.steps.at(-1), '→ shown', 'другое пространство не затронуто');
});

test('поздний lost прежнего ядра не трогает новое ядро; lost не снимает более новую реакцию своего ядра', async () => {
  const store = sceneStore();
  const A = scened({ cat: CAT }, { store });
  A.port.mode.hold.add('commit');
  A.port.mode.abort = true;
  await attempt(A);
  A.core.destroy();
  A.storage.load();
  const C = scened({ cat: CAT }, { storage: A.storage });
  saved(C, 'fresh');
  assert.equal(playing(C), 'joy');
  await A.port.open('commit');
  assert.deepEqual([A.port.steps.at(-1), playing(C), A.raw('scene')], ['→ lost', 'joy', null], 'новое ядро не остановлено, копии нет');
  // Своё ядро: сценка показана, затем радость нового занятия её сменила — поздний lost радость не снимает.
  const L = scened();
  L.port.mode.hold.add('commit');
  L.port.mode.abort = true;
  await attempt(L);
  saved(L, 'newer');
  assert.equal(playing(L), 'joy');
  await L.port.open('commit');
  assert.deepEqual([L.port.steps.at(-1), playing(L)], ['→ lost', 'joy']);
});

test('прерванный показ день не освобождает: сценку остановили вводом — shown, копия записана, второй сценки в этот день нет', async () => {
  const L = scened();
  L.port.mode.hold.add('commit');
  await attempt(L);
  L.core.setContext({ typing: true });
  assert.equal(playing(L), null, 'остановлена');
  await L.port.open('commit');
  assert.deepEqual([L.port.steps.at(-1), L.json('scene').day, L.days.days.get('qa').day], ['→ shown', DAY, DAY], 'день подтверждён, копия — исход начатой записи');
});

// ---------- К. Копия scene через координатор ----------

test('копия scene: повреждённая — неявная запись не заменяет (failed, unsaved); отказ записи — failed без отката показа; чужая копия — сверкой без события', async () => {
  const broken = scened({ cat: CAT, scene: '{' });
  assert.deepEqual(broken.effects('warning').map((effect) => effect.key), ['scene']);
  await attempt(broken);
  assert.deepEqual([broken.port.steps.at(-1), playing(broken), broken.raw('scene'), broken.state().save.scene.status], ['→ shown', 'stretch', '{', 'failed'], 'повреждённую копию неявно не трогаем');
  const refused = scened();
  refused.store.denySet = new RegExp(refused.keys.scene);
  await attempt(refused);
  assert.deepEqual([refused.port.steps.at(-1), playing(refused), refused.raw('scene'), refused.state().save.scene.unsaved], ['→ shown', 'stretch', null, ['day', 'by', 'cat']]);
  // Другая вкладка записала копию сегодня (события storage ещё нет) — выбор по сверенной копии: без броска.
  const L = scened();
  L.put('scene', { v: 1, day: DAY, by: 'там', cat: 'curl' });
  L.random.push(0, 0, 0);
  const taken = L.random.state.taken;
  saved(L, 'K');
  assert.deepEqual([L.random.state.taken - taken, L.state().scene.waiting], [1, null]);
});

test('копия scene асинхронно: pending до подтверждения; поставленная до destroy — выполняется; собака не меняет вариант кота', async () => {
  const store = manual({ scene: JSON.stringify({ v: 1, day: '2026-10-12', cat: 'curl' }) });
  assert.equal(await store.load(), 'ready');
  const time = calendar();
  const plan = planner(time);
  const random = series([], 0);
  const days = sceneStore();
  const port = reserver(days, 'qa');
  const core = createPetCore({ storage: store.storage, scenes: port.port, clock: time.port, random: random.port, scheduler: plan.port, log: journal().port, progress: () => ({ marks: 1, today: 1 }) });
  core.setDisplay(LEGACY_DISPLAY);
  core.start();
  await store.drain();
  core.setPet('dog');
  await store.drain();
  core.notify('saved', { key: 'K', counted: true });
  plan.advance(REACTIONS.joy.ms + REACTIONS.meet.ms);
  await flush();
  assert.deepEqual([port.steps.at(-1), core.getState().pose.reaction?.type, core.getState().save.scene.status], ['→ shown', 'fetch', 'pending']);
  core.destroy();
  await store.drain();
  assert.deepEqual(store.json('scene'), { v: 1, day: DAY, cat: 'curl', by: days.days.get('qa').by }, 'запись до destroy выполнена, вариант кота прежний');
});

// ---------- Л. Граница раунда ----------

test('граница раунда: между decide, постановкой записи и началом показа — ни слушателей, ни журнала; слушатель — после начала показа, его команда выполняется; исключение слушателя не обрывает доставку', async () => {
  const store = sceneStore();
  const port = reserver(store, 'qa');
  const log = { list: port.steps, port: { warn: (message) => port.steps.push(`log ${message}`) } };
  const L = scened({ cat: CAT }, { port, log });
  L.core.subscribe(() => {
    throw new Error('слушатель упал');
  }, { initial: false });
  let hid = null;
  L.core.subscribe((update) => {
    port.steps.push(`deliver ${update.reason}`);
    if (update.snapshot.pose.reaction?.scene && !hid) hid = L.core.setContext({ typing: true });
  }, { initial: false });
  await attempt(L);
  const steps = port.steps;
  const decided = steps.indexOf('decide record');
  assert.deepEqual(steps.slice(decided, decided + 2), ['decide record', 'put'], 'сразу постановка записи');
  const shown = steps.indexOf('show', decided);
  assert.ok(steps.slice(decided, shown).every((step) => !step.startsWith('log') && !step.startsWith('deliver')) || steps.slice(decided + 2, shown).every((step) => step.startsWith('deliver') || step.startsWith('log слушатель') || step.startsWith('log исключение')), steps.join(' | '));
  assert.ok(steps.slice(decided + 2, shown).includes('deliver scene'), 'обновление начала показа доставлено слушателям уже после постановки записи (в самом show)');
  assert.ok(steps.slice(decided, decided + 2).every((step) => !step.startsWith('log')), 'журнал — не между решением и постановкой');
  assert.deepEqual([hid?.ok, playing(L), steps.includes('→ shown'), L.json('scene').day], [true, null, true, DAY], 'команда слушателя после начала показа выполнена; день подтверждён');
  assert.ok(steps.some((step) => step.startsWith('log исключение подписчика')), 'исключение слушателя — журнал, доставка продолжена');
});

test('граница раунда: команда, вызванная портом изнутри решения (random метки вкладки), — reentrant без изменений', async () => {
  let inner = null;
  let core = null;
  let armed = false;
  const queue = [];
  const random = {
    state: { taken: 0 },
    push: (...values) => queue.push(...values),
    port: () => {
      random.state.taken += 1;
      if (armed && core) {
        armed = false;
        inner = core.setName('Взлом');
      }
      return queue.length ? queue.shift() : 0;
    },
  };
  const L = scened({ cat: CAT }, { random });
  core = L.core;
  L.random.push(0, 0, 0);
  saved(L, 'K');
  armed = true;
  L.plan.advance(REACTIONS.joy.ms);
  await flush();
  assert.deepEqual([inner?.error?.code, L.state().name.display, L.port.steps.at(-1)], ['reentrant', 'Марс', '→ shown']);
});

// ---------- М. Отказы планировщика ----------

test('отказ планировщика при показе: конец сценки не запланирован — show бросает, запись откатывается (lost), сценки и облака нет, warning internal; отказ облака — сценка без облака, shown', async () => {
  const refusing = (ms) => (plan) => ({ later: (delay, task) => (delay === ms ? (() => { throw new Error(`отказ ${ms}`); })() : plan.port.later(delay, task)) });
  const L = scened({ cat: CAT }, { scheduler: refusing(REACTIONS.stretch.ms) });
  await attempt(L);
  assert.deepEqual([L.port.steps.slice(-3), playing(L), L.state().phrase, L.days.days.size, L.raw('scene')], [['put', 'show threw', '→ lost'], null, null, 0, null]);
  assert.ok(L.seen.filter((update) => update.reason === 'scene').flatMap((update) => update.effects).some((effect) => effect.type === 'warning' && effect.code === 'internal'), 'warning internal в обновлении показа');
  L.plan.advance(10_000);
  assert.equal(playing(L), null, 'ничего не висит');
  const cloud = scened({ cat: CAT }, { scheduler: refusing(PHRASE_MS) });
  cloud.random.push(0, 0, 0);
  saved(cloud, 'K');
  cloud.plan.advance(REACTIONS.joy.ms);
  await flush();
  assert.deepEqual([cloud.port.steps.at(-1), playing(cloud), cloud.state().phrase], ['→ shown', 'stretch', null]);
  cloud.plan.advance(REACTIONS.stretch.ms);
  assert.equal(playing(cloud), null, 'сценка кончилась своей задачей');
});

// ---------- Веб-адаптер IndexedDB (без браузера) ----------

test('веб-адаптер: один объект на фабрику IndexedDB и пространство; нет IndexedDB — fail без решения; записи нет — undefined, не объект — как есть (повреждена)', async () => {
  const idb = fakeIdb('w1:scene').tab();
  assert.equal(createWebScenes({ namespace: 'w1', idb }), createWebScenes({ namespace: 'w1', idb }));
  assert.notEqual(createWebScenes({ namespace: 'w1', idb }), createWebScenes({ namespace: 'w2', idb }));
  const none = createWebScenes({ namespace: 'w3', idb: { open: () => { throw new Error('SecurityError'); } } });
  assert.equal(await none.reserve(() => assert.fail('решения нет'), () => assert.fail('показа нет')), 'fail');
  const db = fakeIdb('w4:scene');
  const seen = [];
  assert.equal(await sceneTurn(db.tab(), 'w4:scene', (stored) => (seen.push(stored), null), () => {}), 'skip');
  db.data.set('shown', null);
  assert.equal(await sceneTurn(db.tab(), 'w4:scene', (stored) => (seen.push(stored), null), () => {}), 'skip');
  assert.deepEqual(seen, [undefined, null]);
  // Исключения не выходят наружу: decide бросил — fail; show бросил — lost; запись не остаётся.
  const thrown = fakeIdb('w5:scene');
  assert.equal(await sceneTurn(thrown.tab(), 'w5:scene', () => { throw new Error('decide'); }, () => {}), 'fail');
  assert.equal(await sceneTurn(thrown.tab(), 'w5:scene', () => ({ v: 1, day: DAY }), () => { throw new Error('show'); }), 'lost');
  assert.equal(thrown.data.has('shown'), false);
});

test('веб-адаптер с ядром: показ и копия; два ядра на одной базе и пространстве — одна сценка; неизвестные поля и больший v записи сохраняются', async () => {
  const db = fakeIdb('wa:scene');
  db.data.set('shown', { v: 3, day: '2026-10-12', cat: 'curl', future: { a: 1 } });
  const site = scened({ cat: CAT }, { port: { port: createWebScenes({ namespace: 'wa', idb: db.tab({ name: 'A' }) }) } });
  const other = life({}, { storage: site.storage, counts: host(1, 1), display: LEGACY_DISPLAY, scenes: createWebScenes({ namespace: 'wa', idb: db.tab({ name: 'A' }) }) });
  other.core.start();
  site.random.push(0, 0, 0);
  other.random.push(0, 0, 0);
  saved(site, 'a');
  saved(other, 'b');
  site.plan.advance(REACTIONS.joy.ms);
  other.plan.advance(REACTIONS.joy.ms);
  for (let i = 0; i < 6; i += 1) await flush();
  const shows = [playing(site), playing(other)].filter((type) => type === 'stretch' || type === 'curl');
  assert.equal(shows.length, 1, `одна сценка: ${[playing(site), playing(other)]}`);
  const record = db.data.get('shown');
  assert.deepEqual({ ...record, by: '' }, { v: 3, day: DAY, cat: 'stretch', future: { a: 1 }, by: '' }, 'запись: неизвестное и v остаются; прошлый curl — значит stretch');
  assert.equal(site.json('scene').day, DAY, 'копия дня');
});
