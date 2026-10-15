// PL06, хранение расширений (docs/ARCHITECTURE.md § 7.6, § 7.7): девятый ключ ext:v1 — повреждённый, больший v,
// неизвестные поля, ID и значения; ID с точкой (example.bunny и example.bunny.big) — отдельные записи имени, аксессуара,
// облика и комнаты, подписи несохранённых полей без split('.'). Выбор питомца — цепочка companion → ext без межключевой
// транзакции: все переходы таблицы § 7.7 на синхронном вебе (порядок записей, отчёт, перезапуск, что видит вкладка 0.1.4),
// отказы шагов (failed + skipped, partial), досылка и её исключение (companion.kind, оживляющий устаревшую запись), на
// асинхронном координаторе — оба ключа pending с команды, второй шаг ставится только после результата первого, новый
// выбор ждёт поставленного шага и снимает запланированные, destroy между шагами, done не отклоняется; независимая запись
// другого ядра между шагами; вкладка 0.1.4 по фикстуре (mergeCompanion(parseCompanion(…), { kind })); сценарий
// кролик → собака → кролик и предел A → B → A. По независимой проверке PL06 — новый выбор, пока своя операция выбора не
// разрешена: шаги по подтверждённому после её успеха или отказа (порядок записей, без промежуточного оживления, итог и
// повторное подключение), соседние переходы, унесённые поля выбора, перевыбор, destroy, другое ядро, публичный вход и
// синхронный веб. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { calm } from '../pet/defs/calm.mjs';
import { cat } from '../pet/defs/cat.mjs';
import { dog } from '../pet/defs/dog.mjs';
import { createPetCore as publicCore, createStorage, definePet } from '../pet/core.mjs';
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

// ---------- асинхронно: новый выбор после результата своей операции выбора (по независимой проверке PL06) ----------
// Пока своя операция с полем выбора (шаг прежнего выбора или правка, унёсшая несохранённое поле выбора) не разрешена,
// новый выбор ждёт её и строит шаги по подтверждённому после её успеха или отказа. trail — подтверждённые записи по
// порядку и что после каждой покажут новые клиенты при перезапуске: промежуточного оживления спящей записи нет.

async function confirmAll(store) {
  const trail = [];
  while (store.waiting.length) {
    const { op, key } = store.waiting[0];
    await store.next(op, key);
    if (op === 'set') trail.push([key, await restart(store)]);
  }
  return trail;
}
const SAVED = { status: 'saved', pending: [], unsaved: [], corrupt: false };
const CAT = { id: 'cat', shown: 'cat', available: true };
// Сохранено: собака, спящая запись кролика (over = кот) — показана собака.
const SLEEPING = { companion: { v: 1, kind: 'dog' }, ext: { v: 1, pet: BUNNY_CAT } };

for (const failure of ['get', 'set']) {
  test(`асинхронно: отказ ${failure} поставленной записи кролика — новый выбор кота: сначала снята спящая запись, затем kind; saved и кот, а не кролик`, async () => {
    const store = await slow(SLEEPING);
    const A = tab(store.storage);
    assert.equal(A.state().pet.shown, 'dog', 'запись кролика спит');
    const first = A.core.setPet('example.bunny');
    const latest = A.core.setPet('cat');
    // Сразу после команды: кот в памяти, оба ключа pending; шаги нового выбора ещё не поставлены — ждут записи ext.
    assert.deepEqual([A.state().pet, A.state().save.companion.status, A.state().save.ext.status], [CAT, 'pending', 'pending']);
    assert.deepEqual([latest.save.status, latest.save.keys, latest.save.results, waits(store)], ['pending', ['companion', 'ext'], { companion: 'pending', ext: 'pending' }, ['get ext']]);
    if (failure === 'get') await store.next('get', 'ext', 'fail');
    else {
      await store.next('get', 'ext');
      await store.next('set', 'ext', 'fail');
    }
    assert.deepEqual([A.state().pet, A.state().save.ext.status, waits(store)], [CAT, 'pending', ['get ext']], 'после отказа — кот; первый шаг нового выбора — очистка ext');
    const trail = await confirmAll(store);
    assert.deepEqual(trail, [['ext', 'dog'], ['companion', 'cat']], 'kind = cat — только после снятия записи кролика с over = cat');
    assert.deepEqual([await first.save.done, await latest.save.done], ['failed', 'saved']);
    assert.deepEqual([store.json('companion').kind, store.json('ext')], ['cat', { v: 1 }]);
    assert.deepEqual([A.state().pet, A.state().save.companion, A.state().save.ext], [CAT, SAVED, SAVED]);
    assert.deepEqual([await restart(store), oldSees(store.data.get('companion'))], ['cat', 'cat'], 'повторное подключение и вкладка 0.1.4 — кот');
    A.core.destroy();
  });
}

test('асинхронно: контроль — поставленная запись кролика подтверждена: новый выбор кота — kind, затем условная очистка этой записи; saved', async () => {
  const store = await slow(SLEEPING);
  const A = tab(store.storage);
  const first = A.core.setPet('example.bunny');
  const latest = A.core.setPet('cat');
  assert.deepEqual([A.state().pet, latest.save.keys, waits(store)], [CAT, ['companion', 'ext'], ['get ext']]);
  const trail = await confirmAll(store);
  assert.deepEqual(trail, [['ext', 'example.bunny'], ['companion', 'cat'], ['ext', 'cat']], 'прежний выбор (кролик поверх собаки), затем kind, затем очистка');
  assert.deepEqual([await first.save.done, await latest.save.done, store.json('companion').kind, store.json('ext')], ['saved', 'saved', 'cat', { v: 1 }]);
  assert.deepEqual([A.state().pet, A.state().save.ext, await restart(store)], [CAT, SAVED, 'cat']);
  A.core.destroy();
});

test('асинхронно: отказ поставленной очистки прежнего выбора — выбор over этой записи сначала снимает её, затем kind (без оживления)', async () => {
  // Кролик поверх кота → собака: kind = dog подтверждён, очистка записи стоит в очереди. Новый выбор — кот (over записи).
  const store = await slow({ ext: { v: 1, pet: BUNNY_CAT } });
  const A = tab(store.storage);
  const first = A.core.setPet('dog');
  await store.next('get', 'companion');
  await store.next('set', 'companion');
  assert.deepEqual(waits(store), ['get ext']);
  const latest = A.core.setPet('cat');
  assert.deepEqual([A.state().pet, A.state().save.companion.status, A.state().save.ext.status, latest.save.keys], [CAT, 'pending', 'pending', ['companion', 'ext']]);
  await store.next('get', 'ext', 'fail');
  const trail = await confirmAll(store);
  assert.deepEqual(trail, [['ext', 'dog'], ['companion', 'cat']], 'по памяти хватило бы kind = cat — он оживил бы кролика');
  assert.deepEqual([await first.save.done, await latest.save.done, store.json('companion').kind, store.json('ext')], ['partial', 'saved', 'cat', { v: 1 }]);
  assert.deepEqual([A.state().pet, await restart(store)], [CAT, 'cat']);
  A.core.destroy();
});

test('асинхронно: соседние переходы двух ключей — ожидаемый шаг kind или безусловная очистка, успех и отказ: шаги по действительному состоянию, ненужный ключ без записи', async () => {
  // [начало, первый выбор (его шаг ждёт), новый выбор, исход ожидаемого чтения, keys нового, trail, done обоих, ext после]
  const CASES = [
    // Кролик поверх кота → собака (kind ждёт) → кот. Отказ: кролик действителен — безусловная очистка, kind уже кот.
    [{ ext: { v: 1, pet: BUNNY_CAT } }, 'dog', 'cat', 'fail', ['ext', 'companion'], [['ext', 'cat']], ['failed', 'saved'], { v: 1 }],
    // Успех: kind = dog, запись спит с over = кот — сначала её очистка, затем kind = кот.
    [{ ext: { v: 1, pet: BUNNY_CAT } }, 'dog', 'cat', 'ok', ['ext', 'companion'], [['companion', 'dog'], ['ext', 'dog'], ['companion', 'cat']], ['partial', 'saved'], { v: 1 }],
    // Кролик поверх собаки → собака (безусловная очистка ждёт) → кот. Отказ: кролик действителен — kind, затем его очистка.
    [{ companion: { v: 1, kind: 'dog' }, ext: { v: 1, pet: { id: 'example.bunny', over: 'dog' } } }, 'dog', 'cat', 'fail', ['companion', 'ext'], [['companion', 'cat'], ['ext', 'cat']], ['failed', 'saved'], { v: 1 }],
    // Успех: записи нет — только kind; ext — без записи (saved).
    [{ companion: { v: 1, kind: 'dog' }, ext: { v: 1, pet: { id: 'example.bunny', over: 'dog' } } }, 'dog', 'cat', 'ok', ['companion', 'ext'], [['ext', 'dog'], ['companion', 'cat']], ['saved', 'saved'], { v: 1 }],
    // Кролик поверх кота → собака (kind ждёт) → свой питомец: over — подтверждённый kind после ожидания.
    [{ ext: { v: 1, pet: BUNNY_CAT } }, 'dog', 'example.bunny.big', 'fail', ['ext'], [['ext', 'example.bunny.big']], ['failed', 'saved'], { v: 1, pet: { id: 'example.bunny.big', over: 'cat' } }],
  ];
  for (const [initial, before, target, outcome, keys, trail, done, ext] of CASES) {
    const label = JSON.stringify({ initial, before, target, outcome });
    const store = await slow(initial);
    const A = tab(store.storage);
    const first = A.core.setPet(before);
    const latest = A.core.setPet(target);
    assert.deepEqual([A.state().pet.shown, latest.save.keys, Object.values(latest.save.results)], [target, keys, keys.map(() => 'pending')], label);
    const head = store.waiting[0];
    if (outcome === 'fail') await store.next(head.op, head.key, 'fail');
    assert.deepEqual(await confirmAll(store), trail, label);
    assert.deepEqual([await first.save.done, await latest.save.done, store.json('ext')], [...done, ext], label);
    assert.deepEqual([A.state().pet.shown, await restart(store), A.state().save.companion.status, A.state().save.ext.status], [target, target, 'saved', 'saved'], label);
    A.core.destroy();
  }
});

test('асинхронно: правка, унёсшая несохранённый kind, — новый выбор своего питомца ждёт её: over по её результату; её kind не досылается, имя собаки — досылается', async () => {
  for (const outcome of ['ok', 'fail']) {
    const store = await slow({});
    const A = tab(store.storage);
    const refused = A.core.setPet('dog');
    await store.next('get', 'companion');
    await store.next('set', 'companion', 'fail');
    assert.deepEqual([await refused.save.done, A.state().save.companion.unsaved], ['failed', ['kind']]);
    // Имя собаки — правка companion: несохранённый kind уходит с ней (оживлять нечего).
    const named = A.core.setName('Бобик');
    const latest = A.core.setPet('example.bunny');
    assert.deepEqual([A.state().pet.shown, latest.save.keys, waits(store)], ['example.bunny', ['ext'], ['get companion']], 'запись ext ждёт правку с kind');
    if (outcome === 'fail') await store.next('get', 'companion', 'fail');
    const trail = await confirmAll(store);
    const over = outcome === 'ok' ? 'dog' : 'cat';
    assert.deepEqual(trail.at(-1), ['ext', 'example.bunny'], outcome);
    assert.deepEqual([await named.save.done, await latest.save.done, store.json('ext').pet], [outcome === 'ok' ? 'saved' : 'failed', 'saved', { id: 'example.bunny', over }], outcome);
    // Отказ правки: kind выбора заменён новым выбором (не несохранённый), имя собаки — несохранённое.
    assert.deepEqual([A.state().pet.shown, A.state().save.companion.unsaved, await restart(store)], ['example.bunny', outcome === 'ok' ? [] : ['dog.name'], 'example.bunny'], outcome);
    A.core.destroy();
  }
  // Унесённый ext.pet: отказ записи кролика, модель уносит его; выбор собаки ждёт эту правку. Модель — независимое поле.
  for (const outcome of ['ok', 'fail']) {
    const store = await slow({});
    const A = tab(store.storage);
    const refused = A.core.setPet('example.bunny');
    await store.next('get', 'ext');
    await store.next('set', 'ext', 'fail');
    assert.deepEqual([await refused.save.done, A.state().save.ext.unsaved], ['failed', ['pet']]);
    const model = A.core.setBehavior('example.lively');
    const latest = A.core.setPet('dog');
    assert.deepEqual([A.state().pet.shown, latest.save.keys, waits(store)], ['dog', ['companion', 'ext'], ['get ext']], 'шаги ждут правку с ext.pet');
    if (outcome === 'fail') await store.next('get', 'ext', 'fail');
    await confirmAll(store);
    assert.deepEqual([await model.save.done, await latest.save.done, store.json('companion').kind, store.json('ext')?.pet], [outcome === 'ok' ? 'saved' : 'failed', 'saved', 'dog', undefined], outcome);
    // Отказ правки: поле выбора не досылается, модель — несохранённая и уйдёт со следующей правкой ext.
    assert.deepEqual([A.state().pet.shown, A.state().behavior.shown, A.state().save.ext.unsaved, await restart(store)], ['dog', 'example.lively', outcome === 'ok' ? [] : ['behavior'], 'dog'], outcome);
    A.core.destroy();
  }
});

test('асинхронно: перевыбор, пока выбор ждёт, — ждущий снят (skipped, failed), новейший строится после ожидания; destroy ждущего — ничего не пишет', async () => {
  for (const outcome of ['ok', 'fail']) {
    const store = await slow(SLEEPING);
    const A = tab(store.storage);
    const first = A.core.setPet('example.bunny');
    const second = A.core.setPet('cat');
    const third = A.core.setPet('dog');
    assert.deepEqual([A.state().pet.shown, await second.save.done, waits(store)], ['dog', 'failed', ['get ext']], 'шаги ждущего сняты до постановки');
    if (outcome === 'fail') await store.next('get', 'ext', 'fail');
    const trail = await confirmAll(store);
    // Отказ: собака и спящая запись (over = кот) — переход «только kind», kind уже dog: записей нет, запись спит.
    assert.deepEqual(trail, outcome === 'ok' ? [['ext', 'example.bunny'], ['ext', 'dog']] : [], outcome);
    assert.deepEqual([await first.save.done, await second.save.done, await third.save.done], [outcome === 'ok' ? 'saved' : 'failed', 'failed', 'saved'], outcome);
    assert.deepEqual([store.json('companion').kind, store.json('ext').pet, A.state().pet.shown, await restart(store)], ['dog', outcome === 'ok' ? undefined : BUNNY_CAT, 'dog', 'dog'], outcome);
    A.core.destroy();
  }
  const store = await slow(SLEEPING);
  const A = tab(store.storage);
  const first = A.core.setPet('example.bunny');
  const latest = A.core.setPet('cat');
  A.core.destroy();
  await store.next('get', 'ext', 'fail');
  assert.deepEqual([waits(store), await first.save.done, await latest.save.done, store.json('companion').kind, store.json('ext').pet], [[], 'failed', 'failed', 'dog', BUNNY_CAT], 'после destroy шаги ждущего выбора не ставятся');
});

test('асинхронно: выбор другого ядра и независимые поля, пока выбор ждёт: модель записана, условная очистка не стирает более новую запись другого ядра', async () => {
  const store = await slow(SLEEPING);
  const A = tab(store.storage);
  const B = tab(store.storage);
  const first = A.core.setPet('example.bunny');
  const model = A.core.setBehavior('example.lively');
  const latest = A.core.setPet('cat');
  const other = B.core.setPet('example.bunny.big');
  assert.deepEqual(waits(store), ['get ext'], 'очередь ext: запись A, модель A, выбор B');
  await store.next('get', 'ext', 'fail');
  // Шаги A — после ожидания и за записью B; очистка A записи не меняет (там запись B) — записи нет; kind — последним.
  assert.deepEqual(await confirmAll(store), [['ext', 'dog'], ['ext', 'example.bunny.big'], ['companion', 'cat']], 'без промежуточного оживления кролика');
  assert.deepEqual([await first.save.done, await model.save.done, await latest.save.done, await other.save.done], ['failed', 'saved', 'saved', 'saved']);
  // Шаги A поставлены после ожидания — за записью B; очистка A снимает только запись, которую видела (кролик, over = кот).
  assert.deepEqual([store.json('companion').kind, store.json('ext')], ['cat', { v: 1, behavior: 'example.lively', pet: { id: 'example.bunny.big', over: 'dog' } }]);
  assert.deepEqual([A.state().pet.shown, B.state().pet.shown, A.state().behavior.shown, await restart(store)], ['cat', 'cat', 'example.lively', 'cat'], 'запись B устарела после kind = cat и спит');
  A.core.destroy();
  B.core.destroy();
});

test('публичный вход: createStorage + createPetCore — отказ get и set прежней записи ext, новый выбор кота — saved и кот', async () => {
  for (const failure of ['get', 'set']) {
    const store = manual({ 'review:cat:v1': COMMON, 'review:companion:v1': { v: 1, kind: 'dog' }, 'review:ext:v1': { v: 1, pet: BUNNY_CAT } });
    const storage = createStorage({ backend: store.backend, namespace: 'review' });
    const loaded = storage.load();
    await store.drain();
    assert.equal(await loaded, 'ready');
    const quiet = idle();
    const pet = publicCore({ storage, pets: [cat, dog, bunny], behaviors: [calm], clock: clock().port, random: quiet.random, scheduler: quiet.scheduler, progress: host(4, 1).progress });
    const first = pet.setPet('example.bunny');
    const latest = pet.setPet('cat');
    assert.deepEqual(pet.getState().pet, CAT);
    if (failure === 'get') await store.next('get', 'review:ext:v1', 'fail');
    else {
      await store.next('get', 'review:ext:v1');
      await store.next('set', 'review:ext:v1', 'fail');
    }
    await store.drain();
    assert.deepEqual([await first.save.done, await latest.save.done, pet.getState().pet, store.json('review:companion:v1'), store.json('review:ext:v1')], ['failed', 'saved', CAT, { v: 1, kind: 'cat' }, { v: 1 }], failure);
    pet.destroy();
  }
});

test('синхронный веб: отказ записи кролика, затем кот — без ожидания и видимого pending: очистка спящей записи, затем kind', () => {
  const list = [];
  const s = site(SLEEPING, list);
  const A = tab(s.storage);
  const seen = [];
  A.core.subscribe((update) => seen.push(update.snapshot.save.companion.status, update.snapshot.save.ext.status), { initial: false });
  s.store.denySet = /:ext:/;
  const first = A.core.setPet('example.bunny');
  s.store.denySet = null;
  list.length = 0;
  const latest = A.core.setPet('cat');
  assert.deepEqual([first.save.status, latest.save.status, latest.save.keys, writes(list)], ['failed', 'saved', ['ext', 'companion'], ['ext', 'companion']]);
  assert.deepEqual([seen.includes('pending'), 'done' in latest.save, A.state().pet, fresh(s), oldSees(s.raw('companion'))], [false, false, CAT, 'cat', 'cat']);
  A.core.destroy();
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
