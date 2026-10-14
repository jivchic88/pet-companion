// Ядро PL04.2 в Node — резервирование дня редкой сценки (docs/ARCHITECTURE.md § 9, § 5.4, § 8.8): тестовый порт с общим
// хранилищем дня и очередью на пространство имён, управляемые точки удержания без пауз (test/core-kit.mjs reserver), и
// веб-адаптер pet/web/scenes.mjs на IndexedDB в памяти (fakeIdb). Исходы shown, skip, fail, lost; исключения decide, show,
// порта и постановки записи; очередь освобождается исходом. Два ядра одного хранилища и пространства — одна сценка, разные
// пространства — независимы. Отмена в очереди, destroy до решения и после начала показа, поздний shown и lost прежнего
// ядра, lost не снимает более новую реакцию, новое ядро того же пространства видит день прежнего. Копия scene:v1 — неявная
// операция ядра: неизвестные поля и v, повреждённая копия, отказ записи, асинхронно pending и запись до destroy. Граница
// раунда: между decide, постановкой записи и началом реакции сценки — ни слушателей, ни журнала (общий журнал порядка:
// шаги порта, задачи планировщика, журнал ядра, доставка), команда порта — reentrant; слушатель после начала показа может
// выполнить команду, исключение слушателя доставку не обрывает. Ручное действие (кормление, готовое имя, поглаживание,
// жест) — окончательная отмена до и после начала резервирования и во время показа, честный changed, отказ ok: false без
// побочных изменений. Отключение в критическом шаге: из random, peek, часов и планировщика, обычным вызовом и слушателем
// после начала показа; нарушение порта (show не в том же шаге). Отказы планировщика — без зависшей сценки и облака.
// Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PHRASE_MS, REACTIONS } from '../pet/core/director.mjs';
import { createPetCore } from '../pet/core/index.mjs';
import { SCENE_FRESH_MS } from '../pet/core/scenes.mjs';
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
  // decide дважды и show без решения или дважды — только первое действует. show без решения с записью успехом не
  // притворяется: исключение (адаптер откатывает), показа нет; повтор после начала — тот же показ.
  let second = 'не вызван';
  let early = 'не бросил';
  const twice = scened({ cat: CAT }, {
    port: {
      port: {
        reserve(decide, show) {
          try {
            show();
          } catch (error) {
            early = error.message;
          }
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
  assert.match(early, /показ сценки не начат: нет решения с записью \(шаг queued\)/);
  assert.deepEqual([second, playing(twice), new Set(ids).size, twice.json('scene').day], [null, 'stretch', 1, DAY], 'один показ, одна копия');
  // Решение отказало (день занят) — show после него бросает, сценки нет; исход skip.
  let after = 'не бросил';
  const refused = scened({ cat: CAT }, {
    port: {
      port: {
        reserve(decide, show) {
          const record = decide({ v: 1, day: DAY, by: 'другая' });
          try {
            show();
          } catch (error) {
            after = error.message;
          }
          return Promise.resolve(record ? 'shown' : 'skip');
        },
      },
    },
  });
  await attempt(refused);
  assert.match(after, /нет решения с записью \(шаг decided\)/);
  assert.deepEqual([playing(refused), refused.raw('scene')], [null, null]);
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

// Общий журнал порядка: шаги порта резервирования (enter, read, decide, put, show, commit, исход), постановка задач
// планировщика (plan <мс>: начало реакции сценки — задача её конца REACTIONS.stretch.ms, затем облако PHRASE_MS), журнал
// ядра (log …) и доставка подписчику (deliver <reason>). Начало показа (plan внутри show) и доставка — разные записи.
function ordered(parts = {}, { onPlan = () => {} } = {}) {
  const store = sceneStore();
  const port = reserver(store, 'qa');
  const steps = port.steps;
  const log = { list: steps, port: { warn: (message) => steps.push(`log ${message}`) } };
  const later = (plan) => ({
    later(ms, task) {
      steps.push(`plan ${ms}`);
      onPlan(ms);
      return plan.port.later(ms, task);
    },
  });
  const L = scened({ cat: CAT }, { port, log, store, scheduler: later, ...parts });
  L.core.subscribe((update) => steps.push(`deliver ${update.reason}`), { initial: false });
  return { ...L, steps };
}
const from = (steps, first) => steps.slice(steps.lastIndexOf(first));

test('граница раунда: decide → постановка записи → начало реакции сценки — без слушателей и журнала между ними; доставка — после начала показа, команда слушателя выполняется; исключение слушателя не обрывает доставку', async () => {
  const L = ordered();
  L.core.subscribe(() => {
    throw new Error('слушатель упал');
  }, { initial: false });
  let hid = null;
  L.core.subscribe((update) => {
    if (update.snapshot.pose.reaction?.scene && !hid) hid = L.core.setContext({ typing: true });
  }, { initial: false });
  L.port.mode.hold.add('enter');
  await attempt(L);
  await L.port.open('enter');
  await flush();
  // Ровно: вход, чтение, решение, постановка, начало реакции (задача конца сценки и облако) — и только затем доставка
  // начала показа и журнал исключения подписчика; show возвращается после доставки (свой раунд), затем запись.
  assert.deepEqual(from(L.steps, 'enter').slice(0, 8), ['enter', 'read', 'decide record', 'put', `plan ${REACTIONS.stretch.ms}`, `plan ${PHRASE_MS}`, 'deliver scene', 'log исключение подписчика — доставка продолжается'], L.steps.join(' | '));
  const tail = from(L.steps, 'put');
  const started = tail.indexOf(`plan ${REACTIONS.stretch.ms}`);
  const delivered = tail.indexOf('deliver scene');
  const returned = tail.indexOf('show');
  assert.ok(started === 1 && delivered > started && returned > delivered && tail.indexOf('commit') > returned, `начало реакции → доставка → возврат show → запись: ${tail.join(' | ')}`);
  assert.deepEqual([hid?.ok, playing(L), tail[tail.indexOf('commit') + 1], L.json('scene').day], [true, null, '→ shown', DAY], 'команда слушателя после начала показа выполнена; день подтверждён');
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

// ---------- Н. Ручное действие — окончательная отмена (§ 9.3) ----------

// Ручные действия настоящими командами и длительность их отклика: кормление (feed → fed), готовое имя (named),
// поглаживание (прямой отклик игры), жест (начало и конец — временная граница до PL04.3).
const MANUAL = [
  ['кормление', (L) => L.core.feed(), REACTIONS.feed.ms + REACTIONS.fed.ms],
  ['готовое имя', (L) => L.core.setName('Бублик', { pick: true }), REACTIONS.named.ms],
  ['поглаживание', (L) => L.core.react('pet', { explicit: true }), REACTIONS.pet.ms],
  [
    'жест: начало и конец',
    (L) => {
      const result = L.core.setBusy(true);
      assert.equal(L.core.setBusy(false).changed, false, 'конец жеста попытку не возвращает и снимка не меняет');
      return result;
    },
    0,
  ],
];

for (const [title, act, ms] of MANUAL) {
  test(`ручное действие после начала резервирования (${title}): попытка отменена сразу и окончательно — действие кончилось до решения, срок не истёк: skip, ни постановки, ни показа, ни дня, ни копии; более новая реакция не тронута`, async () => {
    const L = scened();
    L.core.open('corner');
    L.port.mode.hold.add('enter');
    const at = L.time.state.now;
    await attempt(L);
    assert.deepEqual([L.port.calls.reserve, L.state().scene], [1, { waiting: { type: 'stretch', until: at + SCENE_FRESH_MS }, reserving: true }], 'резервирование ждёт очереди');
    const seen = L.seen.length;
    const result = act(L);
    assert.deepEqual([result.ok, result.changed, L.state().scene], [true, true, { waiting: null, reserving: true }], 'отмена сразу, changed честный');
    assert.equal(L.seen.slice(seen)[0]?.snapshot.scene.waiting, null, 'обновление с отменой доставлено');
    L.plan.advance(ms);
    assert.ok(L.time.state.now - at < SCENE_FRESH_MS, 'срок 10 с ещё не истёк: skip — не из-за срока');
    // Новое занятие без сценки (шанс не выпал) — более новая реакция; поздний skip её не трогает.
    L.random.push(0, 0.9);
    saved(L, 'K2');
    await L.port.open('enter');
    await flush();
    assert.deepEqual([L.port.steps.slice(-3), L.port.calls.show, playing(L), L.days.days.size, L.raw('scene'), L.state().scene], [['read', 'decide null', '→ skip'], 0, 'joy', 0, null, { waiting: null, reserving: false }]);
  });

  test(`ручное действие до начала резервирования (${title}): попытка снята сразу; после радости и действия — ни резервирования, ни показа`, async () => {
    const L = scened();
    L.core.open('corner');
    L.random.push(0, 0, 0);
    saved(L, 'K');
    assert.equal(L.state().scene.waiting?.type, 'stretch');
    const result = act(L);
    assert.deepEqual([result.ok, result.changed, L.state().scene.waiting], [true, true, null]);
    L.plan.advance(REACTIONS.joy.ms + ms);
    await flush();
    assert.deepEqual([L.port.calls.reserve, L.state().pose.reaction?.scene ?? false, L.days.days.size, L.raw('scene')], [0, false, 0, null]);
  });

  test(`ручное действие во время показа (${title}): сценка остановлена, начатая запись не отменена — shown, день и копия; более новая реакция не тронута`, async () => {
    const L = scened();
    L.core.open('corner');
    L.port.mode.hold.add('commit');
    await attempt(L);
    assert.equal(playing(L), 'stretch');
    act(L);
    const now = playing(L);
    assert.notEqual(now, 'stretch', 'сценка остановлена');
    await L.port.open('commit');
    await flush();
    assert.deepEqual([L.port.steps.at(-1), L.days.days.get('qa').day, L.json('scene').day, playing(L)], ['→ shown', DAY, DAY, now]);
  });
}

test('ручное действие во время показа, затем lost: более новая реакция (кормление, имя) не снимается; день свободен, копии нет', async () => {
  for (const [title, act] of MANUAL.slice(0, 2)) {
    const L = scened();
    L.core.open('corner');
    L.port.mode.hold.add('commit');
    L.port.mode.abort = true;
    await attempt(L);
    act(L);
    const now = playing(L);
    await L.port.open('commit');
    assert.deepEqual([L.port.steps.at(-1), now !== null && now !== 'stretch', playing(L), L.days.days.size, L.raw('scene')], ['→ lost', true, now, 0, null], title);
  }
});

test('готовое имя то же и в паузе повтора: отклика нет, но попытка отменена — changed и обновление честные, skip; без попытки — changed false, обновления нет', async () => {
  const L = scened({ cat: { ...CAT, name: 'Бублик' } });
  L.core.open('corner');
  assert.equal(L.core.setName('Бублик', { pick: true }).reacted, true);
  L.port.mode.hold.add('enter');
  await attempt(L);
  const seen = L.seen.length;
  const result = L.core.setName('Бублик', { pick: true });
  assert.deepEqual([result.ok, result.reacted, result.changed, result.save.status, L.state().scene.waiting], [true, false, true, 'none', null]);
  assert.deepEqual(L.seen.slice(seen).map((update) => [update.reason, update.snapshot.scene.waiting]), [['setName', null]]);
  await L.port.open('enter');
  assert.deepEqual([L.port.steps.slice(-2), L.days.days.size, L.raw('scene'), L.json('cat').name], [['decide null', '→ skip'], 0, null, 'Бублик']);
  const quiet = L.seen.length;
  assert.deepEqual([L.core.setName('Бублик', { pick: true }).changed, L.seen.length - quiet], [false, 0], 'ничего не изменилось — ни changed, ни обновления');
});

test('отказ ручного входа (ok: false) — без побочных изменений: попытка цела, обновления нет, показ и день — как без него', async () => {
  for (const [title, initial, counts, act, code] of [
    ['уже угостили', { cat: CAT, treat: { v: 1, fedDay: DAY } }, host(1, 1), (L) => L.core.feed(), 'treat-fed'],
    ['ещё не было занятия', { cat: CAT }, host(1, 0), (L) => L.core.feed(), 'treat-waiting'],
    ['имя не строка', { cat: CAT }, host(1, 1), (L) => L.core.setName(5, { pick: true }), 'invalid-argument'],
    ['жест не boolean', { cat: CAT }, host(1, 1), (L) => L.core.setBusy('да'), 'invalid-argument'],
    ['неизвестный отклик', { cat: CAT }, host(1, 1), (L) => L.core.react('stretch'), 'invalid-argument'],
  ]) {
    const L = scened(initial, { counts });
    L.port.mode.hold.add('enter');
    await attempt(L);
    const snapshot = L.state();
    const seen = L.seen.length;
    const treat = L.raw('treat');
    const result = act(L);
    assert.deepEqual([result.ok, result.error?.code, L.state() === snapshot, L.seen.length - seen, L.raw('treat')], [false, code, true, 0, treat], title);
    await L.port.open('enter');
    await flush();
    assert.deepEqual([L.port.steps.at(-1), playing(L), L.days.days.get('qa')?.day, L.json('scene')?.day], ['→ shown', 'stretch', DAY, DAY], `${title}: показ`);
  }
});

test('кормление при ждущей попытке: правила лакомства прежние — отметка дня и запись до реакции, объявление, «ест» → «доволен», счёт хоста не меняется', async () => {
  const L = scened();
  L.core.open('corner');
  L.port.mode.hold.add('enter');
  await attempt(L);
  const marks = L.counts.state.marks;
  const seen = L.seen.length;
  const result = L.core.feed();
  assert.deepEqual([result.ok, result.save.status, L.json('treat').fedDay, result.reaction.type, playing(L), L.state().treat, L.counts.state.marks], [true, 'saved', DAY, 'feed', 'feed', 'fed', marks]);
  assert.ok(L.seen.slice(seen).flatMap((update) => update.effects).some((effect) => effect.type === 'announce' && effect.text.endsWith('получает лакомство. Сегодня уже угостили.')));
  L.plan.advance(REACTIONS.feed.ms);
  assert.equal(playing(L), 'fed');
  assert.deepEqual([L.core.feed().error?.code, L.state().scene.waiting], ['treat-fed', null], 'второго лакомства нет');
  await L.port.open('enter');
  assert.equal(L.port.steps.at(-1), '→ skip');
});

// ---------- О. Отключение в критическом шаге (§ 9.3, § 5.4) ----------

// Ядро с общим журналом порядка и ловушкой: arm(point) — следующий вызов порта point отключает ядро изнутри (сначала
// пробует команду — reentrant): random (метка вкладки в решении), peek (чтение копии scene через координатор), clock (часы
// в решении), scheduler (задача конца сценки — начало показа).
function trapped() {
  const box = { point: null, core: null, inner: null };
  const spring = (point) => {
    if (box.point !== point) return;
    box.point = null;
    box.inner = box.core.setName('Взлом');
    box.core.destroy();
  };
  const sequence = series();
  const random = { ...sequence, port: () => (spring('random'), sequence.port()) };
  const L = ordered({ random }, { onPlan: (ms) => ms === REACTIONS.stretch.ms && spring('scheduler') });
  box.core = L.core;
  const now = L.time.port.now;
  L.time.port.now = () => (spring('clock'), now());
  const get = L.store.getItem;
  L.store.getItem = (key) => (key === L.keys.scene && spring('peek'), get(key));
  return { ...L, box, arm: (point) => (box.point = point) };
}
// Очередь освобождена исходом: новое ядро того же хранилища и пространства решает по записи дня.
async function successor(L) {
  L.storage.load();
  const C = scened({ cat: CAT }, { store: L.days, storage: L.storage, port: reserver(L.days, 'qa') });
  await attempt(C, 'c');
  return C;
}

for (const [title, point] of [
  ['random метки вкладки', 'random'],
  ['чтение копии (peek)', 'peek'],
  ['часы в решении', 'clock'],
]) {
  test(`destroy из порта во время решения (${title}): команда порта — reentrant, отключение — в конце фазы решения (до его возврата), decide null — ни постановки, ни показа, ни дня, ни копии; очередь освобождена, новое ядро показывает`, async () => {
    const L = trapped();
    L.port.mode.hold.add('enter');
    await attempt(L);
    L.arm(point);
    await L.port.open('enter');
    await flush();
    assert.deepEqual(from(L.steps, 'enter'), ['enter', 'read', 'deliver destroyed', 'decide null', '→ skip'], L.steps.join(' | '));
    assert.deepEqual([L.box.inner?.error?.code, L.state().status, L.port.calls.show, L.days.days.size, L.raw('scene'), L.seen.some((update) => update.snapshot.pose.reaction?.scene)], ['reentrant', 'destroyed', 0, 0, null, false]);
    const C = await successor(L);
    assert.deepEqual([C.port.steps.at(-1), playing(C), C.days.days.get('qa').day], ['→ shown', 'stretch', DAY], 'день свободен');
  });
}

test('порт внутри решения подписал слушателя или вызвал поглощение чужого изменения: конец фазы не пуст — решение null, skip без записи; доставка — до возврата decide, не между постановкой и показом', async () => {
  for (const [title, inside, expected] of [
    ['подписка', (L) => L.core.subscribe(() => L.steps.push('initial из порта')), 'initial из порта'],
    [
      'событие storage другой вкладки',
      (L) => {
        L.put('cat', { ...CAT, name: 'Сосед' });
        L.events.fire(L.keys.cat);
      },
      'deliver storage',
    ],
  ]) {
    let armed = false;
    let L = null;
    const sequence = series();
    const random = { ...sequence, port: () => (armed && ((armed = false), inside(L)), sequence.port()) };
    L = ordered({ random });
    L.port.mode.hold.add('enter');
    await attempt(L);
    armed = true;
    await L.port.open('enter');
    await flush();
    assert.deepEqual(from(L.steps, 'enter').slice(0, 5), ['enter', 'read', expected, 'decide null', '→ skip'], `${title}: ${L.steps.join(' | ')}`);
    assert.deepEqual([L.port.calls.show, L.days.days.size, L.raw('scene'), L.state().status], [0, 0, null, 'running'], title);
  }
});

test('destroy обычным вызовом до решения: доставлено сразу, decide null, skip — ничего не записано; очередь освобождена, новое ядро показывает', async () => {
  const L = trapped();
  L.port.mode.hold.add('enter');
  await attempt(L);
  L.core.destroy();
  assert.equal(L.steps.at(-1), 'deliver destroyed');
  await L.port.open('enter');
  await flush();
  assert.deepEqual([from(L.steps, 'enter'), L.days.days.size, L.raw('scene')], [['enter', 'read', 'decide null', '→ skip'], 0, null]);
  const C = await successor(L);
  assert.equal(C.port.steps.at(-1), '→ shown');
});

test('destroy из порта планировщика во время начала показа: отключение раньше, чем слушатели увидели начало, — показ не начат: show бросает, запись откатывается (lost), день свободен, копии нет; новое ядро показывает', async () => {
  const L = trapped();
  L.port.mode.hold.add('enter');
  await attempt(L);
  L.arm('scheduler');
  await L.port.open('enter');
  await flush();
  assert.deepEqual(from(L.steps, 'enter'), ['enter', 'read', 'decide record', 'put', `plan ${REACTIONS.stretch.ms}`, `plan ${PHRASE_MS}`, 'deliver destroyed', 'show threw', '→ lost'], L.steps.join(' | '));
  assert.deepEqual([L.box.inner?.error?.code, L.state().status, L.state().pose.reaction, L.days.days.size, L.raw('scene'), L.seen.some((update) => update.snapshot.pose.reaction?.scene)], ['reentrant', 'destroyed', null, 0, null, false]);
  const C = await successor(L);
  assert.equal(C.port.steps.at(-1), '→ shown', 'день свободен');
});

test('destroy слушателем после настоящего начала показа: запись не отменяется — shown, день остаётся, копии нет; новое ядро того же пространства — второй сценки нет', async () => {
  const L = trapped();
  L.core.subscribe((update) => update.snapshot.pose.reaction?.scene && L.core.destroy(), { initial: false });
  L.port.mode.hold.add('enter');
  await attempt(L);
  await L.port.open('enter');
  await flush();
  assert.deepEqual(from(L.steps, 'enter'), ['enter', 'read', 'decide record', 'put', `plan ${REACTIONS.stretch.ms}`, `plan ${PHRASE_MS}`, 'deliver scene', 'deliver destroyed', 'show', 'commit', '→ shown'], L.steps.join(' | '));
  assert.deepEqual([L.state().status, L.days.days.get('qa').day, L.raw('scene')], ['destroyed', DAY, null]);
  const C = await successor(L);
  assert.deepEqual([C.port.steps.at(-1), playing(C)], ['→ skip', null], 'день занят прежним ядром');
});

test('порт вызвал show не в том же шаге (нарушение § 9.2): отмена или destroy между решением и show — show бросает, показа и копии нет', async () => {
  for (const [title, between] of [
    ['отмена вводом', (L) => L.core.setContext({ typing: true })],
    ['кормление', (L) => L.core.feed()],
    ['destroy', (L) => L.core.destroy()],
  ]) {
    let thrown = '';
    const port = {
      steps: [],
      port: {
        reserve(decide, show) {
          const record = decide(undefined);
          return Promise.resolve().then(() => {
            between(L);
            try {
              show();
              return record ? 'shown' : 'skip';
            } catch (error) {
              thrown = error.message;
              return 'lost';
            }
          });
        },
      },
    };
    const L = scened({ cat: CAT }, { port });
    await attempt(L);
    await flush();
    assert.match(thrown, /показ сценки не начат/, title);
    assert.deepEqual([playing(L) === 'stretch', L.raw('scene'), L.seen.some((update) => update.snapshot.pose.reaction?.scene)], [false, null, false], title);
  }
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
