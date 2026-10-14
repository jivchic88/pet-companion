// Ядро PL04.2 в Node — выбор редкой сценки и её попытка (docs/ARCHITECTURE.md § 6.4 setDisplay, § 7.1.1, § 9.2–9.3, § 10):
// настоящий экземпляр ядра с ручными часами, ручным планировщиком, заданной последовательностью random и тестовым портом
// резервирования (test/core-kit.mjs reserver). Объявление сценок — разрешение: без объявления, {}, без ключа питомца,
// пустой список, часть питомцев, неизвестные ссылки (журнал на ссылку), неверное — invalid-argument с прежним объявлением,
// непереданное свойство сохраняется, пустое пересечение — ни random, ни reserve, ни show, попытка использована. Выбор: шанс
// 25 % с точной границей, порядок random (реплика, шанс, вариант только при двух), портрет и уголок целиком, прошлый вариант
// кота, собака, без counted и при празднике — нет, одна попытка на событие. Попытка: старт реакции позже 500 мс — отмена,
// срок 10 с, полночь, отмены тишиной, вводом, фоном, «Скрыть», ручным действием (отклик игры, кормление, готовое имя,
// начало жеста), видом, питомцем, обликом, присутствием,
// движением, full, scenes, переносом и сменой места — отменяют, а не откладывают. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { REACTIONS } from '../pet/core/director.mjs';
import { SCENE_FRESH_MS, SCENE_GRACE_MS } from '../pet/core/scenes.mjs';
import { calendar, DAY, flush, host, LEGACY_DISPLAY, life, reserver, sceneStore } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };
// Ступень «Освоился» уже увидена (аксессуар «платок» открыт), занятия на ней — без праздника.
const SEEN1 = { v: 1, seenStage: 1, greetDay: DAY };
const DOG = { v: 1, kind: 'dog' };
// Ядро с портом резервирования; display — объявление (по умолчанию legacy), store и ns — хранилище дня.
function scened(initial = { cat: CAT }, { display = LEGACY_DISPLAY, store = sceneStore(), ns = 'qa', counts = host(1, 1), ...parts } = {}) {
  const port = reserver(store, ns);
  const L = life(initial, { counts, display, scenes: port.port, ...parts });
  assert.equal(L.core.start().ok, true);
  return { ...L, port, days: store };
}
const playing = (L) => L.state().pose.reaction?.type ?? null;
const saved = (L, key, extra = {}) => L.core.notify('saved', { key, counted: true, ...extra });
// Занятие со случайностью: реплика радости (0), затем значения выбора сценки.
function lucky(L, key, values, extra = {}) {
  L.random.push(0, ...values);
  const before = L.random.state.taken;
  const result = saved(L, key, extra);
  return { result, taken: L.random.state.taken - before };
}
// Конец радости и исход резервирования.
async function finish(L) {
  L.plan.advance(REACTIONS.joy.ms);
  await flush();
}

// ---------- Г. Объявление сценок — разрешение ----------

const NONE = [
  ['не объявлено', null],
  ['{}', { scenes: {} }],
  ['нет ключа питомца', { scenes: { dog: ['fetch'] } }],
  ['пустой список', { scenes: { cat: [] } }],
];

for (const [title, display] of NONE) {
  test(`объявление сценок: ${title} — у кота ни random шанса, ни reserve, ни show; день и копия не меняются; попытка использована`, async () => {
    const L = scened({ cat: CAT }, { display: display ? { views: ['corner'], ...display } : { views: ['corner'] } });
    const { result, taken } = lucky(L, 'K', [0, 0]);
    assert.deepEqual([result.reacted, taken, L.state().scene.waiting], [true, 1, null], 'только реплика радости — ни шанса, ни варианта');
    await finish(L);
    assert.deepEqual([L.port.calls, L.days.days.size, L.raw('scene'), playing(L)], [{ reserve: 0, decide: 0, show: 0 }, 0, null, null]);
    // Объявили — тот же K: попытка уже использована (повтор события — без броска).
    L.core.setDisplay(LEGACY_DISPLAY);
    const again = lucky(L, 'K', []);
    assert.deepEqual([again.result.duplicate, again.taken, L.state().scene.waiting], [true, 0, null]);
  });
}

test('объявление сценок: часть питомцев — собака объявлена, кот нет; неизвестные ссылки пропущены с журналом на ссылку; неверное — invalid-argument, объявление прежнее; непереданное сохраняется', async () => {
  const L = scened({ cat: CAT }, { display: { views: ['corner'], scenes: { dog: ['fetch'] } } });
  assert.equal(lucky(L, 'c', [0]).taken, 1, 'кот — без броска');
  const declared = L.core.setDisplay({ scenes: { cat: ['stretch', 'jump'], 'example.fox': ['run'], dog: ['fetch', 'fetch'] } });
  assert.equal(declared.ok, true);
  assert.deepEqual(L.state().display.scenes, { cat: ['stretch'], dog: ['fetch'] }, 'известные — по одному разу');
  assert.deepEqual(L.log.list.filter((line) => line.startsWith('setDisplay')), ['setDisplay: cat/jump — нет у зарегистрированных питомцев, пропущено', 'setDisplay: example.fox — нет у зарегистрированных питомцев, пропущено'], 'одно предупреждение на ссылку');
  const state = L.state();
  for (const bad of [{ scenes: { cat: 'stretch' } }, { scenes: [] }, { scenes: { cat: [1] } }, { scenes: null }, { views: ['kitchen'] }, { pets: 'cat' }, { full: 1 }, { moving: 'да' }, { scenes: { cat: ['curl'] }, playFloor: [] }, null, 'full']) {
    assert.equal(L.core.setDisplay(bad).error.code, 'invalid-argument', JSON.stringify(bad));
  }
  assert.equal(L.state(), state, 'объявление прежнее, ничего не изменилось');
  L.core.setDisplay({ full: false });
  assert.deepEqual([L.state().display.scenes, L.state().display.full, L.state().display.views], [{ cat: ['stretch'], dog: ['fetch'] }, false, ['corner']], 'непереданное сохраняется');
  // Кот целиком объявлен только «потягивается» — один вариант: шанс без броска варианта.
  L.plan.advance(REACTIONS.joy.ms);
  assert.equal(lucky(L, 'd', [0]).taken, 2, 'реплика и шанс; вариант один — без броска');
  await finish(L);
  assert.deepEqual([playing(L), L.port.calls.show], ['stretch', 1]);
});

test('пустое пересечение: портретный показ и объявлен только «клубок» — без броска; уголок открыт — целиком, клубок допустим', async () => {
  const L = scened({ cat: CAT }, { display: { views: ['corner', 'play', 'room'], full: false, scenes: { cat: ['curl'] } } });
  assert.equal(lucky(L, 'p', [0, 0]).taken, 1, 'портрет: клубок не читается — пересечение пусто');
  L.plan.advance(REACTIONS.joy.ms);
  L.core.open('corner');
  const { taken } = lucky(L, 'q', [0]);
  assert.deepEqual([taken, L.state().scene.waiting?.type], [2, 'curl'], 'уголок — целиком: шанс, вариант один');
  await finish(L);
  assert.equal(playing(L), 'curl');
});

// ---------- Д. Выбор: шанс, порядок random, варианты ----------

test('шанс 25 %: random 0.2499999 — сценка, 0.25 — нет; порядок: реплика, шанс, вариант (у кота целиком — два варианта)', async () => {
  const yes = scened();
  const hit = lucky(yes, 'a', [0.2499999, 0.6]);
  assert.deepEqual([hit.taken, yes.state().scene.waiting?.type], [3, 'curl'], 'реплика, шанс, вариант');
  const no = scened();
  const miss = lucky(no, 'a', [0.25, 0.6]);
  assert.deepEqual([miss.taken, no.state().scene.waiting], [2, null], 'шанс не выпал — без броска варианта');
  await finish(no);
  assert.equal(no.port.calls.reserve, 0);
});

test('варианты: кот не повторяет прошлый (копия scene.cat), портрет — только «потягивается» без броска варианта; собака — «приносит мячик» без броска и не меняет вариант кота', async () => {
  const last = scened({ cat: CAT, scene: { v: 1, day: '2026-10-12', cat: 'stretch' } });
  assert.deepEqual([lucky(last, 'a', [0, 0]).taken, last.state().scene.waiting?.type], [2, 'curl'], 'прошлый — stretch: остаётся curl, без броска варианта');
  const portrait = scened({ cat: CAT, scene: { v: 1, day: '2026-10-12', cat: 'stretch' } }, { display: { ...LEGACY_DISPLAY, full: false } });
  assert.deepEqual([lucky(portrait, 'a', [0, 0.9]).taken, portrait.state().scene.waiting?.type], [2, 'stretch'], 'портрет — тот же вариант, если другого нет');
  const dog = scened({ cat: CAT, companion: DOG, scene: { v: 1, day: '2026-10-12', cat: 'curl', future: 1 } });
  assert.deepEqual([lucky(dog, 'a', [0, 0.9]).taken, dog.state().scene.waiting?.type], [2, 'fetch']);
  await finish(dog);
  assert.equal(playing(dog), 'fetch');
  assert.deepEqual(dog.json('scene').cat, 'curl', 'собака не меняет вариант кота');
  assert.equal(dog.json('scene').future, 1, 'неизвестное поле копии сохранено');
});

test('без counted, праздник ступени, повтор события — сценки нет; одна попытка на событие, в том числе не выпавший шанс', async () => {
  const L = scened({ cat: CAT }, { counts: host(2, 1) });
  L.random.push(0);
  const before = L.random.state.taken;
  L.core.notify('saved', { key: 'u' });
  assert.deepEqual([L.state().scene.waiting, L.random.state.taken - before], [null, 1], 'не counted — без броска');
  L.plan.advance(REACTIONS.joy.ms);
  L.counts.set(3, 2);
  const stage = lucky(L, 'stage', []);
  assert.deepEqual([stage.result.celebrate, stage.taken, L.state().scene.waiting], [1, 1, null], 'праздник важнее — без броска');
  L.plan.advance(REACTIONS.joy.ms + REACTIONS.unlock.ms);
  const miss = lucky(L, 'm', [0.9]);
  assert.deepEqual([miss.taken, L.state().scene.waiting], [2, null]);
  L.plan.advance(REACTIONS.joy.ms);
  const again = lucky(L, 'm', [0, 0]);
  assert.deepEqual([again.result.duplicate, again.taken, L.state().scene.waiting], [true, 0, null], 'повтор — без нового броска');
});

// ---------- Е. Сроки и отмена попытки ----------

test('задержка старта: реакция занятия началась через 500 мс — сценка возможна; через 501 мс — отменена, а не перенесена', async () => {
  for (const [delay, expected] of [
    [SCENE_GRACE_MS, 'stretch'],
    [SCENE_GRACE_MS + 1, null],
  ]) {
    const L = scened();
    L.core.setContext({ typing: true });
    L.random.push(0, 0);
    saved(L, 'K');
    assert.equal(L.state().scene.waiting?.type, 'stretch', 'попытка ждёт');
    L.plan.advance(delay);
    L.random.push(0);
    L.core.setContext({ typing: false });
    assert.equal(playing(L), 'joy');
    assert.equal(L.state().scene.waiting?.type ?? null, expected, `${delay} мс`);
    await finish(L);
    assert.deepEqual([playing(L), L.port.calls.reserve], [expected, expected ? 1 : 0]);
  }
});

test('срок 10 с: конец реакции ровно в срок — показ; позже (устройство спало) — без резервирования; удержание в очереди дольше срока — skip', async () => {
  for (const [late, expected] of [
    [SCENE_FRESH_MS, 'stretch'],
    [SCENE_FRESH_MS + 1, null],
  ]) {
    const L = scened();
    lucky(L, 'K', [0, 0]);
    L.plan.jump(late);
    L.plan.advance(0);
    await flush();
    assert.deepEqual([playing(L), L.port.calls.reserve], [expected, expected ? 1 : 0], `${late} мс`);
  }
  const held = scened();
  held.port.mode.hold.add('enter');
  lucky(held, 'K', [0, 0]);
  await finish(held);
  assert.equal(held.port.calls.reserve, 1);
  held.plan.advance(SCENE_FRESH_MS);
  await held.port.open('enter');
  assert.deepEqual([held.port.steps.at(-1), playing(held), held.days.days.size, held.raw('scene')], ['→ skip', null, 0, null], 'срок прошёл, пока ждали очереди');
});

test('полночь между занятием и показом: до резервирования — без него; во время ожидания очереди — skip', async () => {
  const time = calendar(`${DAY}T23:59:59.000Z`);
  const L = scened({ cat: CAT }, { time });
  lucky(L, 'K', [0, 0]);
  await finish(L);
  assert.deepEqual([L.port.calls.reserve, playing(L)], [0, null], 'день сменился до конца радости');
  const near = scened({ cat: CAT }, { time: calendar(`${DAY}T23:59:57.000Z`) });
  near.port.mode.hold.add('enter');
  lucky(near, 'K', [0, 0]);
  await finish(near);
  near.plan.advance(2000);
  await near.port.open('enter');
  assert.deepEqual([near.port.steps.at(-1), near.days.days.size], ['→ skip', 0], 'полночь в очереди');
});

// Отмена попытки (ждёт конца радости): после отмены — ни резервирования, ни показа; отменённая не переносится.
const CANCELS = [
  ['ввод (typing)', (L) => L.core.setContext({ typing: true })],
  ['ввод при уже идущей тишине ввода', (L) => L.core.setContext({ typing: true }), (L) => L.core.setContext({ typing: true })],
  ['таймер сайта', (L) => L.core.setContext({ timer: true })],
  ['фон', (L) => L.core.setVisible(false)],
  ['«Скрыть»', (L) => L.core.hide()],
  ['ручное действие', (L) => L.core.react('pet')],
  ['кормление', (L) => L.core.feed()],
  ['готовое имя', (L) => L.core.setName('Бублик', { pick: true })],
  ['начало жеста', (L) => L.core.setBusy(true)],
  ['открыт уголок', (L) => L.core.open('corner')],
  ['«Поиграть»', (L) => L.core.open('play')],
  ['другой питомец', (L) => L.core.setPet('dog')],
  ['облик', (L) => L.core.setAppearance({ coat: 'ginger' })],
  ['аксессуар', (L) => L.core.setAppearance({ accessory: 'plaid' })],
  ['движение', (L) => L.core.setPreferences({ motion: 'calm' })],
  ['«уменьшить движение»', (L) => L.core.setReducedMotion(true)],
  ['присутствие', (L) => L.core.setPresence('on-call')],
  ['full', (L) => L.core.setDisplay({ full: false })],
  ['объявление scenes', (L) => L.core.setDisplay({ scenes: { cat: ['stretch'], dog: ['fetch'] } })],
  ['перенос', (L) => L.core.setDisplay({ moving: true })],
  ['смена места legacy (stopScene)', (L) => L.core.stopScene()],
];

for (const [title, ...steps] of CANCELS) {
  test(`отмена попытки: ${title} — сценка отменена, а не отложена`, async () => {
    const L = scened({ cat: SEEN1 }, { counts: host(4, 1) });
    lucky(L, 'K', [0, 0]);
    assert.equal(L.state().scene.waiting?.type, 'stretch');
    if (title === 'ввод при уже идущей тишине ввода') {
      steps[0](L);
      L.core.setContext({ typing: false });
      L.plan.advance(REACTIONS.joy.ms);
      L.core.setContext({ typing: true });
      L.random.push(0, 0);
      saved(L, 'K2');
      assert.equal(L.state().scene.waiting?.type, 'stretch', 'попытка K2 ждёт при идущей тишине ввода');
      steps[1](L);
    } else for (const step of steps) step(L);
    assert.equal(L.state().scene.waiting, null);
    for (const off of [() => L.core.setContext({ typing: false, timer: false }), () => L.core.setVisible(true), () => L.core.show(), () => L.core.close(), () => L.core.setDisplay({ moving: false }), () => L.core.setBusy(false)]) off();
    L.plan.advance(5000);
    await flush();
    assert.deepEqual([L.port.calls.reserve, L.state().pose.reaction?.scene ?? false], [0, false], 'ни резервирования, ни показа');
  });
}

test('сценка идёт: те же входы её останавливают — прерванная не возобновляется; день остаётся занятым', async () => {
  for (const [title, step] of CANCELS.map(([name, first]) => [name, first])) {
    const L = scened({ cat: SEEN1 }, { counts: host(4, 1) });
    lucky(L, 'K', [0, 0]);
    await finish(L);
    assert.equal(playing(L), 'stretch', title);
    step(L);
    assert.notEqual(playing(L), 'stretch', `${title}: остановлена`);
    assert.equal(L.days.days.get('qa')?.day, DAY, `${title}: день занят`);
  }
});

test('экземпляры независимы: память попыток (checked) и попытка — свои у каждого ядра; новое ядро — новая память', async () => {
  const store = sceneStore();
  const A = scened({ cat: CAT }, { store, ns: 'a' });
  const B = scened({ cat: CAT }, { store, ns: 'b' });
  lucky(A, 'K', [0, 0]);
  assert.deepEqual([A.state().scene.waiting?.type, B.state().scene.waiting], ['stretch', null]);
  assert.equal(lucky(B, 'K', [0.9]).taken, 2, 'K у B — своя попытка');
  A.core.destroy();
  const C = scened({ cat: CAT }, { store, ns: 'a', storage: A.storage });
  assert.equal(lucky(C, 'K', [0.9]).taken, 2, 'новое ядро — новая память событий и попыток');
});
