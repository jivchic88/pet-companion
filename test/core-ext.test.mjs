// PL06, хранение расширений (docs/ARCHITECTURE.md § 7.6, § 7.7): девятый ключ ext:v1 — повреждённый, больший v,
// неизвестные поля, ID и значения; ID с точкой (example.bunny и example.bunny.big) — отдельные записи имени, аксессуара,
// облика и комнаты, подписи несохранённых полей без split('.'). Выбор питомца — цепочка companion → ext без межключевой
// транзакции: все переходы таблицы § 7.7 на синхронном вебе (порядок записей, отчёт, перезапуск, что видит вкладка 0.1.4),
// отказы шагов (failed + skipped, partial), досылка и её исключение (companion.kind, оживляющий устаревшую запись), на
// асинхронном координаторе — оба ключа pending с команды, второй шаг ставится только после результата первого, новый
// выбор ждёт поставленного шага и снимает запланированные, destroy между шагами, done не отклоняется; независимая запись
// другого ядра между шагами; вкладка 0.1.4 по фикстуре (mergeCompanion(parseCompanion(…), { kind })); сценарий
// кролик → собака → кролик и предел A → B → A. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { calm } from '../pet/defs/calm.mjs';
import { cat } from '../pet/defs/cat.mjs';
import { dog } from '../pet/defs/dog.mjs';
import { definePet } from '../pet/core.mjs';
import { bunny } from '../examples/extension/bunny.mjs';
import { lively } from '../examples/extension/lively.mjs';
import * as old from './fixtures/pet-0.1.4/pet-rules.mjs';
import { CORE_KEYS, DAY, VIEWS, clock, createPetCore, host, idle, journal, manual, web } from './core-kit.mjs';

const big = definePet({ ...JSON.parse(JSON.stringify(bunny)), id: 'example.bunny.big', title: 'Большой кролик' });
const DEFS = { pets: [cat, dog, bunny, big], behaviors: [calm, lively] };
const COMMON = { v: 1, seenStage: 1, greetDay: DAY };
const BUNNY_CAT = { id: 'example.bunny', over: 'cat' };

// Ядро на загруженном координаторе (синхронном или асинхронном) с определениями примера.
function tab(storage, defs = DEFS) {
  const log = journal();
  const quiet = idle();
  const core = createPetCore({ storage, progress: host(4, 1).progress, clock: clock().port, log: log.port, random: quiet.random, scheduler: quiet.scheduler, ...defs });
  return { core, log, state: () => core.getState() };
}
function site(initial, list = null) {
  const s = web({ cat: COMMON, ...initial }, { journal: list });
  assert.equal(s.storage.load(), 'ready');
  return s;
}
// Что покажут новые клиенты после перезапуска (новый координатор, свежее чтение всех ключей) и что — вкладка 0.1.4 (по её
// же нормализации companion).
const shownBy = (storage) => {
  const A = tab(storage);
  const shown = A.state().pet.shown;
  A.core.destroy();
  return shown;
};
const fresh = (s) => shownBy(site(Object.fromEntries(Object.entries(s.keys).flatMap(([name, full]) => (s.store.raw(full) === null ? [] : [[name, s.store.raw(full)]])))).storage);
async function restart(store) {
  const again = manual(Object.fromEntries(store.data));
  await again.load();
  return shownBy(again.storage);
}
const oldSees = (raw) => old.parseCompanion(raw).kind;
// Вкладка 0.1.4 выбирает питомца: её запись companion и событие storage.
function oldPick(s, kind) {
  s.put('companion', JSON.stringify(old.mergeCompanion(old.parseCompanion(s.raw('companion')), { kind })));
  s.events.fire(s.keys.companion);
}
const writes = (list) => list.filter((line) => line.startsWith('setItem')).map((line) => line.split(':').at(-2));
const waits = (store) => store.waiting.map((item) => `${item.op} ${item.key}`);

// ---------- ключ ext ----------

test('девять ключей: ext — `<ns>:ext:v1`, в снимке save.ext; без записи ext ничего не пишется при создании', () => {
  const list = [];
  const s = site({}, list);
  assert.equal(s.keys.ext, `${s.ns}:ext:v1`);
  const A = tab(s.storage);
  A.core.start();
  assert.deepEqual(Object.keys(A.state().save), CORE_KEYS);
  assert.deepEqual([A.state().save.ext, s.raw('ext')], [{ status: 'saved', pending: [], unsaved: [], corrupt: false }, null]);
  assert.deepEqual([A.state().pet, A.state().behavior], [{ id: 'cat', shown: 'cat', available: true }, { id: 'calm', shown: 'calm', available: true }]);
  A.core.destroy();
});

test('ext повреждён: показ по умолчанию, предупреждение corrupt, неявные и чужие правки его не трогают; явная команда заменяет', () => {
  const s = site({ companion: { v: 1, kind: 'dog' }, ext: '{' });
  const A = tab(s.storage);
  const effects = [];
  A.core.subscribe((update) => effects.push(...update.effects), { initial: false });
  A.core.start();
  assert.deepEqual([A.state().pet.shown, A.state().behavior.shown, A.state().save.ext.corrupt], ['dog', 'calm', true]);
  assert.ok(effects.some((effect) => effect.type === 'warning' && effect.code === 'corrupt' && effect.key === 'ext'));
  A.core.setName('Бобик');
  A.core.notify('saved', { key: 'x', counted: true });
  assert.equal(s.raw('ext'), '{', 'имя собаки — в companion; ext не тронут');
  assert.deepEqual(A.core.setBehavior('example.lively').save.keys, ['ext']);
  assert.deepEqual([s.json('ext'), A.state().save.ext.corrupt], [{ v: 1, behavior: 'example.lively' }, false]);
  A.core.destroy();
});

test('ext: больший v, неизвестные поля, ID и значения сохраняются; pets[id] не объект — заменяется правкой; неизвестная модель — показ первой, выбор цел', () => {
  const ext = { v: 3, pet: { ...BUNNY_CAT, mood: 'sleepy' }, behavior: 'example.zen', pets: { 'example.bunny': 'старое', 'example.fox': { name: 'Лис', tail: 2 } }, future: [1, { a: 2 }] };
  const s = site({ ext });
  const A = tab(s.storage);
  assert.deepEqual([A.state().pet, A.state().behavior, A.state().name.display], [{ id: 'example.bunny', shown: 'example.bunny', available: true }, { id: 'example.zen', shown: 'calm', available: false }, 'Пух']);
  A.core.setName('Морковкин');
  A.core.setAppearance({ accessory: 'bow' });
  assert.deepEqual(s.json('ext'), { ...ext, pets: { 'example.bunny': { name: 'Морковкин', accessory: 'bow' }, 'example.fox': { name: 'Лис', tail: 2 } } });
  A.core.setPet('example.bunny.big');
  assert.deepEqual(s.json('ext').pet, { mood: 'sleepy', id: 'example.bunny.big', over: 'cat' }, 'неизвестные поля записи выбора — как есть');
  A.core.setBehavior('example.lively');
  assert.deepEqual([s.json('ext').v, s.json('ext').behavior, s.json('ext').future], [3, 'example.lively', [1, { a: 2 }]]);
  A.core.destroy();
});

test('ID с точкой: example.bunny и example.bunny.big — свои имя, аксессуар, облик и комната; подписи несохранённого — ["…"]', () => {
  const s = site({ ext: { v: 1, pet: { id: 'example.bunny.big', over: 'cat' } } });
  const A = tab(s.storage);
  A.core.setDisplay({ views: VIEWS });
  const place = (x) => {
    A.core.open('room');
    assert.equal(A.core.room.move('carrot', [x, 232]).ok, true);
    assert.equal(A.core.room.save().ok, true);
    A.core.close();
  };
  A.core.setName('Сугроб');
  A.core.setAppearance({ coat: 'grey', accessory: 'bow' });
  place(80);
  A.core.setPet('example.bunny');
  A.core.setName('Зефир');
  A.core.setAppearance({ coat: 'spot' });
  place(120);
  assert.deepEqual(s.json('ext').pets, { 'example.bunny.big': { name: 'Сугроб', accessory: 'bow' }, 'example.bunny': { name: 'Зефир' } });
  assert.deepEqual(s.json('look'), { v: 1, 'example.bunny.big': 'grey', 'example.bunny': 'spot' });
  assert.deepEqual(Object.keys(s.json('room')).sort(), ['example.bunny', 'example.bunny.big', 'v']);
  assert.notDeepEqual(s.json('room')['example.bunny'], s.json('room')['example.bunny.big']);
  // Показ каждого — своё; вложенных полей example → bunny нет.
  assert.deepEqual([A.state().pets['example.bunny.big'].name.display, A.state().pets['example.bunny.big'].coat, A.state().pets['example.bunny'].coat], ['Сугроб', 'grey', 'spot']);
  assert.equal('example' in s.json('look') || 'example' in s.json('ext').pets || 'example' in s.json('room'), false);
  // Отказ записи — подписи несохранённых полей с ID в скобках.
  s.store.denySet = /:(ext|look):/;
  A.core.setName('Хрустик');
  A.core.setAppearance({ coat: 'snow' });
  assert.deepEqual([A.state().save.ext.unsaved, A.state().save.look.unsaved], [['pets["example.bunny"].name'], ['["example.bunny"]']]);
  A.core.destroy();
});

// ---------- выбор питомца: переходы § 7.7 (синхронный веб) ----------

const TRANSITIONS = [
  // [подпись, сохранено до, цель, ключи по порядку записей, companion.kind после, ext.pet после, новые / 0.1.4]
  ['штатный → расширение: только ext.pet, over — подтверждённый kind', { companion: { v: 1, kind: 'dog' } }, 'example.bunny', ['ext'], 'dog', { id: 'example.bunny', over: 'dog' }, ['example.bunny', 'dog']],
  ['расширение → расширение: только ext.pet', { ext: { v: 1, pet: BUNNY_CAT } }, 'example.bunny.big', ['ext'], null, { id: 'example.bunny.big', over: 'cat' }, ['example.bunny.big', 'cat']],
  ['расширение (over O) → O: ext без pet, безусловно', { companion: { v: 1, kind: 'dog' }, ext: { v: 1, pet: { id: 'example.bunny', over: 'dog' }, behavior: 'example.lively' } }, 'dog', ['ext'], 'dog', undefined, ['dog', 'dog']],
  ['расширение (over O) → X ≠ O: kind, затем условная очистка', { ext: { v: 1, pet: BUNNY_CAT } }, 'dog', ['companion', 'ext'], 'dog', undefined, ['dog', 'dog']],
  ['штатный Y при устаревшей записи (over X) → X: условная очистка, затем kind', { companion: { v: 1, kind: 'dog' }, ext: { v: 1, pet: BUNNY_CAT } }, 'cat', ['ext', 'companion'], 'cat', undefined, ['cat', 'cat']],
  ['штатный → штатный без записи расширения: только kind', {}, 'dog', ['companion'], 'dog', undefined, ['dog', 'dog']],
  ['штатный → штатный при устаревшей записи с другим over: только kind, запись спит', { ext: { v: 1, pet: { id: 'example.bunny', over: 'unicorn' } } }, 'dog', ['companion'], 'dog', { id: 'example.bunny', over: 'unicorn' }, ['dog', 'dog']],
];

for (const [label, initial, target, keys, kind, pet, [shown, legacy]] of TRANSITIONS) {
  test(`переход § 7.7: ${label}`, () => {
    const list = [];
    const s = site(initial, list);
    const A = tab(s.storage);
    const companion = s.raw('companion');
    list.length = 0;
    const result = A.core.setPet(target);
    assert.deepEqual([result.ok, result.save.status, result.save.keys, result.save.results], [true, 'saved', keys, Object.fromEntries(keys.map((key) => [key, 'saved']))]);
    assert.deepEqual(writes(list), keys, 'порядок записей');
    if (kind === null) assert.equal(s.raw('companion'), companion, 'companion не тронут');
    else assert.equal(s.json('companion').kind, kind);
    assert.deepEqual(s.json('ext')?.pet, pet);
    if (initial.ext?.behavior) assert.equal(s.json('ext').behavior, initial.ext.behavior, 'остальное ext — как было');
    assert.deepEqual([A.state().pet.shown, fresh(s), oldSees(s.raw('companion'))], [target, shown, legacy]);
    assert.deepEqual([A.state().save.companion.status, A.state().save.ext.status], ['saved', 'saved']);
    A.core.destroy();
  });
}

test('шаг 1 отказал: failed, шаг 2 skipped; память — новый выбор до перезапуска; kind досылается со следующей правкой companion, очистка — с правкой ext', () => {
  const s = site({ ext: { v: 1, pet: BUNNY_CAT } });
  const A = tab(s.storage);
  s.store.denySet = /:companion:/;
  const result = A.core.setPet('dog');
  assert.deepEqual([result.save.status, result.save.keys, result.save.results], ['failed', ['companion', 'ext'], { companion: 'failed', ext: 'skipped' }]);
  assert.deepEqual([A.state().pet.shown, A.state().save.companion.unsaved, A.state().save.ext.unsaved], ['dog', ['kind'], ['pet']]);
  assert.deepEqual([fresh(s), oldSees(s.raw('companion'))], ['example.bunny', 'cat'], 'сохранённое — прежний выбор');
  s.store.denySet = null;
  // Имя собаки — правка companion: несохранённый kind уходит с ней (over записи — cat, оживления нет).
  A.core.setName('Бобик');
  assert.deepEqual([s.json('companion').kind, s.json('companion').dog.name, A.state().save.companion.unsaved], ['dog', 'Бобик', []]);
  assert.deepEqual([fresh(s), s.json('ext').pet], ['dog', BUNNY_CAT], 'запись кролика устарела, но ещё лежит');
  A.core.setBehavior('example.lively');
  assert.deepEqual(s.json('ext'), { v: 1, behavior: 'example.lively' }, 'условная очистка ушла с правкой ext');
  A.core.destroy();
});

test('шаг 1 подтверждён, шаг 2 отказал: partial; сохранённое — новый выбор; устаревшая запись остаётся до следующей правки ext', () => {
  const s = site({ ext: { v: 1, pet: BUNNY_CAT } });
  const A = tab(s.storage);
  s.store.denySet = /:ext:/;
  const result = A.core.setPet('dog');
  assert.deepEqual([result.save.status, result.save.results], ['partial', { companion: 'saved', ext: 'failed' }]);
  assert.deepEqual([fresh(s), oldSees(s.raw('companion')), s.json('ext').pet, A.state().save.ext.unsaved], ['dog', 'dog', BUNNY_CAT, ['pet']]);
  s.store.denySet = null;
  A.core.setBehavior('example.lively');
  assert.deepEqual(s.json('ext'), { v: 1, behavior: 'example.lively' });
  A.core.destroy();
});

test('исключение досылки: несохранённый companion.kind, который оживил бы устаревшую запись, не уходит попутно; после её снятия — уходит', () => {
  // Показан кот; устаревшая запись кролика с over = dog. Выбор собаки: 1) условная очистка ext — отказ; 2) kind — skipped.
  const s = site({ ext: { v: 1, pet: { id: 'example.bunny', over: 'dog' } } });
  const A = tab(s.storage);
  s.store.denySet = /:ext:/;
  const result = A.core.setPet('dog');
  assert.deepEqual([result.save.status, result.save.keys, result.save.results], ['failed', ['ext', 'companion'], { ext: 'failed', companion: 'skipped' }]);
  assert.deepEqual([A.state().pet.shown, A.state().save.companion.unsaved, A.state().save.ext.unsaved], ['dog', ['kind'], ['pet']]);
  // Имя собаки — правка companion; kind = dog оживил бы кролика (over = dog) — не отправлен.
  A.core.setName('Бобик');
  assert.deepEqual([s.json('companion').kind, s.json('companion').dog.name, A.state().save.companion.unsaved], [undefined, 'Бобик', ['kind']]);
  assert.equal(fresh(s), 'cat', 'не кролик');
  // Очистка ушла с правкой ext — теперь kind досылается со следующей правкой companion.
  s.store.denySet = null;
  A.core.setBehavior('example.lively');
  assert.equal(s.json('ext').pet, undefined);
  A.core.setName('Шарик');
  assert.deepEqual([s.json('companion').kind, A.state().save.companion.unsaved, fresh(s)], ['dog', [], 'dog']);
  A.core.destroy();
});

// ---------- асинхронный координатор: порядок шагов ----------

async function slow(initial) {
  const store = manual(Object.fromEntries(Object.entries({ cat: COMMON, ...initial }).map(([key, value]) => [key, JSON.stringify(value)])));
  await store.load();
  return store;
}

test('асинхронно: оба ключа pending с команды; второй шаг ставится только после подтверждения первого; done → saved', async () => {
  const store = await slow({ ext: { v: 1, pet: BUNNY_CAT } });
  const A = tab(store.storage);
  const result = A.core.setPet('dog');
  assert.deepEqual([result.save.status, result.save.keys, result.save.results], ['pending', ['companion', 'ext'], { companion: 'pending', ext: 'pending' }]);
  assert.deepEqual([A.state().pet.shown, A.state().save.companion.status, A.state().save.ext.status], ['dog', 'pending', 'pending']);
  assert.deepEqual(waits(store), ['get companion'], 'шаг 2 ещё не поставлен');
  await store.next('get', 'companion');
  assert.deepEqual(waits(store), ['set companion']);
  await store.next('set', 'companion');
  assert.deepEqual(waits(store), ['get ext'], 'шаг 2 поставлен после результата шага 1');
  await store.next('get', 'ext');
  await store.next('set', 'ext');
  assert.deepEqual([await result.save.done, store.json('companion').kind, store.json('ext').pet, A.state().save.ext.status], ['saved', 'dog', undefined, 'saved']);
  A.core.destroy();
});

test('асинхронно: отказ шага 1 — шаг 2 не ставится, done → failed (не отклоняется)', async () => {
  const store = await slow({ ext: { v: 1, pet: BUNNY_CAT } });
  const A = tab(store.storage);
  const result = A.core.setPet('dog');
  await store.next('get', 'companion');
  await store.next('set', 'companion', 'fail');
  assert.deepEqual([waits(store), await result.save.done, A.state().pet.shown, A.state().save.ext.status], [[], 'failed', 'dog', 'failed']);
  A.core.destroy();
});

test('асинхронно: новый выбор, пока шаг 1 стоит в очереди, ждёт его результата; запланированный шаг прежнего выбора снят без досылки', async () => {
  const store = await slow({ ext: { v: 1, pet: BUNNY_CAT } });
  const A = tab(store.storage);
  const first = A.core.setPet('dog');
  const second = A.core.setPet('example.bunny.big');
  assert.deepEqual([A.state().pet.shown, second.save.keys, waits(store)], ['example.bunny.big', ['ext'], ['get companion']], 'новый шаг ждёт поставленного');
  await store.next('get', 'companion');
  await store.next('set', 'companion');
  assert.deepEqual(waits(store), ['get ext']);
  await store.drain();
  assert.deepEqual([await first.save.done, await second.save.done], ['partial', 'saved']);
  // over — подтверждённый kind в момент постановки (собака после шага 1 прежнего выбора).
  assert.deepEqual([store.json('companion').kind, store.json('ext').pet, A.state().save.ext.unsaved], ['dog', { id: 'example.bunny.big', over: 'dog' }, []]);
  assert.equal(A.state().pet.shown, 'example.bunny.big');
  A.core.destroy();
});

test('асинхронно: destroy между шагами — поставленный шаг выполняется очередью, следующий не ставится; done → partial', async () => {
  const store = await slow({ ext: { v: 1, pet: BUNNY_CAT } });
  const A = tab(store.storage);
  const result = A.core.setPet('dog');
  A.core.destroy();
  await store.next('get', 'companion');
  await store.next('set', 'companion');
  assert.deepEqual([waits(store), await result.save.done], [[], 'partial']);
  assert.deepEqual([store.json('companion').kind, store.json('ext').pet], ['dog', BUNNY_CAT], 'сохранённое — как после шага 1: собака, запись спит');
  // Отказ поставленного шага после destroy — failed, тоже без исключения.
  const B = tab(store.storage);
  const again = B.core.setPet('example.bunny');
  B.core.destroy();
  await store.next('get', 'ext');
  await store.next('set', 'ext', 'fail');
  assert.equal(await again.save.done, 'failed');
});

test('асинхронно: независимая запись другого ядра в ext между шагами — шаг 2 строится по ней (модель сохранена, запись кролика снята)', async () => {
  const store = await slow({ ext: { v: 1, pet: BUNNY_CAT } });
  const A = tab(store.storage);
  const B = tab(store.storage);
  const pick = A.core.setPet('dog');
  const model = B.core.setBehavior('example.lively');
  await store.drain();
  assert.deepEqual([await pick.save.done, await model.save.done, store.json('ext')], ['saved', 'saved', { v: 1, behavior: 'example.lively' }]);
  for (const X of [A, B]) assert.deepEqual([X.state().pet.shown, X.state().behavior.shown], ['dog', 'example.lively']);
  A.core.destroy();
  B.core.destroy();
});

test('асинхронно: условная очистка не стирает запись другого экземпляра, поставленную между шагами (она остаётся спящей)', async () => {
  const store = await slow({ ext: { v: 1, pet: BUNNY_CAT } });
  const A = tab(store.storage);
  const B = tab(store.storage);
  const pick = A.core.setPet('dog');
  const other = B.core.setPet('example.bunny.big');
  assert.deepEqual(waits(store), ['get companion', 'get ext']);
  // Запись B (over — его подтверждённый kind: кот) подтверждена раньше шага 1 A.
  store.waiting.push(store.waiting.shift());
  await store.next('get', 'ext');
  await store.next('get', 'companion');
  await store.next('set', 'ext');
  await store.next('set', 'companion');
  assert.deepEqual(waits(store), ['get ext'], 'шаг 2 A — после результата шага 1');
  await store.drain();
  assert.deepEqual([await pick.save.done, await other.save.done], ['saved', 'saved']);
  assert.deepEqual([store.json('companion').kind, store.json('ext').pet], ['dog', { id: 'example.bunny.big', over: 'cat' }], 'запись B не снята условной очисткой A');
  assert.deepEqual([A.state().pet.shown, B.state().pet.shown], ['dog', 'dog'], 'запись B устарела после шага 1 A — оба видят собаку');
  A.core.destroy();
  B.core.destroy();
});

// ---------- вкладка 0.1.4 ----------

test('вкладка 0.1.4: её выбор другого штатного делает запись расширения устаревшей; правка имени собаки без kind выбор не трогает', () => {
  const s = site({ ext: { v: 1, pet: BUNNY_CAT } });
  const A = tab(s.storage);
  assert.equal(A.state().pet.shown, 'example.bunny');
  s.put('companion', JSON.stringify(old.mergeCompanion(old.parseCompanion(s.raw('companion')), { dog: { name: 'Шарик' } })));
  s.events.fire(s.keys.companion);
  assert.equal(A.state().pet.shown, 'example.bunny', 'имя собаки — выбор прежний');
  oldPick(s, 'dog');
  assert.deepEqual([A.state().pet.shown, s.json('ext').pet, oldSees(s.raw('companion'))], ['dog', BUNNY_CAT, 'dog']);
  A.core.destroy();
});

test('вкладка 0.1.4 выбрала over между шагами 1 и 2: запись на миг оживает, условная очистка её снимает — побеждает выбор вкладки', async () => {
  const store = await slow({ ext: { v: 1, pet: BUNNY_CAT } });
  const A = tab(store.storage);
  const result = A.core.setPet('dog');
  await store.next('get', 'companion');
  await store.next('set', 'companion');
  store.data.set('companion', JSON.stringify(old.mergeCompanion(old.parseCompanion(store.data.get('companion')), { kind: 'cat' })));
  await store.drain();
  assert.equal(await result.save.done, 'saved');
  assert.deepEqual([store.json('companion').kind, store.json('ext').pet, await restart(store), oldSees(store.data.get('companion'))], ['cat', undefined, 'cat', 'cat']);
  A.core.destroy();
});

test('предел A → B → A (§ 7.7): очистка отказала, затем вкладка 0.1.4 выбрала over — новые клиенты снова видят расширение, вкладка — штатного', () => {
  const s = site({ ext: { v: 1, pet: BUNNY_CAT } });
  const A = tab(s.storage);
  s.store.denySet = /:ext:/;
  assert.equal(A.core.setPet('dog').save.status, 'partial');
  s.store.denySet = null;
  A.core.destroy();
  oldPick(s, 'cat');
  assert.deepEqual([fresh(s), oldSees(s.raw('companion'))], ['example.bunny', 'cat'], 'известный предел без транзакции между ключами');
});

test('сценарий кролик → собака → кролик: успех и отказ второго выбора; после отказа шага 1 повторный выбор кролика — без записи, kind не досылается', () => {
  // Оба шага успешны, затем кролик: один ключ, over — собака.
  let s = site({ ext: { v: 1, pet: BUNNY_CAT } });
  let A = tab(s.storage);
  A.core.setPet('dog');
  const back = A.core.setPet('example.bunny');
  assert.deepEqual([back.save.keys, back.save.status, s.json('ext').pet, fresh(s), oldSees(s.raw('companion'))], [['ext'], 'saved', { id: 'example.bunny', over: 'dog' }, 'example.bunny', 'dog']);
  // Отказ второго выбора: память — кролик, сохранённое — собака / собака.
  A.core.setPet('dog');
  s.store.denySet = /:ext:/;
  const refused = A.core.setPet('example.bunny');
  assert.deepEqual([refused.save.status, A.state().pet.shown, fresh(s), oldSees(s.raw('companion'))], ['failed', 'example.bunny', 'dog', 'dog']);
  A.core.destroy();
  // Отказ шага 1, затем снова кролик: несохранённый kind заменён новым выбором, ext.pet совпал с сохранённым — записи нет.
  const list = [];
  s = site({ ext: { v: 1, pet: BUNNY_CAT } }, list);
  A = tab(s.storage);
  s.store.denySet = /:companion:/;
  A.core.setPet('dog');
  s.store.denySet = null;
  list.length = 0;
  const again = A.core.setPet('example.bunny');
  assert.deepEqual([again.save.status, again.save.keys, writes(list)], ['saved', ['ext'], []]);
  assert.deepEqual([A.state().pet.shown, A.state().save.companion.unsaved, A.state().save.ext.unsaved, fresh(s), oldSees(s.raw('companion'))], ['example.bunny', [], [], 'example.bunny', 'cat']);
  A.core.setAppearance({ coat: 'grey' });
  assert.equal(s.raw('companion'), null, 'kind не досылается и позже');
  A.core.destroy();
});
