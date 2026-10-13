// Контракт хранения PL03 (docs/ARCHITECTURE.md § 8.1–8.8): общий координатор и подключение каждого ядра — на синхронном
// веб-координаторе (подменённый localStorage, событие storage) и асинхронном с ручным подтверждением каждого чтения и
// записи. Разные поля и одно поле двумя ядрами, разные животные, отказ и следующая правка, внешняя правка при ожидании,
// подтверждение старой операции при новой, автор — только settle, остальные — поглощение; запись без изменения при
// устаревшем кэше (§ 8.7.2), совпавший кэш, отказ после свежего чтения, отказ самого чтения; событие другой вкладки
// (не newValue, key === null, запоздалое); барьер load; отключение автора до подтверждения (§ 8.7) с барьером и без;
// пространства имён; закрытое подключение; самодостаточная правка после destroy; setAppearance — results, partial, failed,
// pending, done; внутренний сбой постановки и после применения. Журнал — порядок постановки, чтения, записи, поглощения и
// settle.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPetCore } from '../pet/core/index.mjs';
import { createWebStorage } from '../pet/web/storage.mjs';
import { DAY, host, journal, make, manual, spy, web } from './core-kit.mjs';

const SEEN = { around: true };
const MARS = { v: 1, name: 'Марс', motion: 'normal', seenStage: 0, greetDay: DAY };

// Два ядра на синхронном веб-координаторе; журнал — общий (getItem/setItem и шпион подключений a, b).
function webPair(initial = { cat: MARS }) {
  const list = [];
  const site = web(initial, { journal: list });
  site.storage.load();
  const watched = spy(site.storage, list, ['a', 'b', 'c']);
  const A = make(watched);
  const B = make(watched);
  list.length = 0;
  return { list, site, watched, A, B };
}

// Два ядра на асинхронном координаторе.
async function asyncPair(initial = { cat: MARS }) {
  const list = [];
  const store = manual(initial, list);
  await store.load();
  const watched = spy(store.storage, list, ['a', 'b', 'c']);
  const A = make(watched);
  const B = make(watched);
  list.length = 0;
  return { list, store, watched, A, B };
}

test('асинхронно, независимые поля (§ 8.7): правка B ждёт в той же очереди ключа и строится по подтверждённому A — обе правки', async () => {
  const { list, store, A, B } = await asyncPair();
  const named = A.core.setName('Барсик');
  const moved = B.core.setPreferences({ motion: 'none' });
  assert.deepEqual([named.save.status, moved.save.status, store.waiting.length], ['pending', 'pending', 1], 'B1 стоит за A1, не начинается');
  assert.deepEqual([A.core.getState().name.display, A.core.getState().save.cat.status, B.core.getState().prefs.motion, B.core.getState().name.display], ['Барсик', 'pending', 'none', 'Марс']);
  await store.next('get', 'cat');
  await store.next('set', 'cat');
  assert.deepEqual([A.core.getState().save.cat.status, B.core.getState().name.display, B.core.getState().prefs.motion, B.core.getState().save.cat.status], ['saved', 'Барсик', 'none', 'pending'], 'B поглотил A1, его патч лежит поверх');
  await store.next('get', 'cat');
  await store.next('set', 'cat');
  assert.deepEqual(store.json('cat'), { ...MARS, name: 'Барсик', motion: 'none' });
  assert.deepEqual([await named.save.done, await moved.save.done], ['saved', 'saved']);
  assert.deepEqual(list, ['write a cat', 'get cat', 'queued a', 'write b cat', 'queued b', 'set cat', 'absorb b cat', 'settle a true', 'get cat', 'set cat', 'absorb a cat', 'settle b true']);
  for (const core of [A.core, B.core]) assert.deepEqual([core.getState().name.display, core.getState().prefs.motion, core.getState().save.cat.status], ['Барсик', 'none', 'saved']);
});

test('синхронно, независимые поля: каждая правка — свой вызов getItem → build → setItem; автор — settle, другой — поглощение', () => {
  const { list, site, A, B } = webPair();
  A.core.setName('Барсик');
  B.core.setPreferences({ motion: 'none' });
  const key = site.keys.cat;
  assert.deepEqual(list, ['write a cat', `getItem ${key}`, `setItem ${key}`, 'absorb b cat', 'settle a true', 'settled a', 'write b cat', `getItem ${key}`, `setItem ${key}`, 'absorb a cat', 'settle b true', 'settled b']);
  assert.deepEqual(site.json('cat'), { ...MARS, name: 'Барсик', motion: 'none' });
});

test('одно поле двумя ядрами: побеждает поставленная позже; её отказ — несохранённое у B, следующая внешняя правка его заменяет', async () => {
  const { store, A, B } = await asyncPair();
  A.core.setName('Барсик');
  const late = B.core.setName('Пиксель');
  await store.next('get', 'cat');
  await store.next('set', 'cat');
  assert.deepEqual([A.core.getState().name.display, B.core.getState().name.display, B.core.getState().save.cat.status], ['Барсик', 'Пиксель', 'pending']);
  await store.next('get', 'cat');
  await store.next('set', 'cat', 'fail');
  assert.equal(await late.save.done, 'failed');
  assert.deepEqual([A.core.getState().name.display, B.core.getState().name.display, B.core.getState().save.cat.unsaved], ['Барсик', 'Пиксель', ['name']]);
  A.core.setName('Дымок');
  await store.drain();
  assert.deepEqual([B.core.getState().name.display, B.core.getState().save.cat.status], ['Дымок', 'saved'], 'подтверждённая чужая правка новее несохранённой');
});

test('разные животные в одном ключе look; отказ, затем правка — несохранённое уходит со следующей операцией ключа', async () => {
  const { store, A, B } = await asyncPair();
  // B выбрал собаку (ещё не подтверждено: в памяти B — собака, A по-прежнему показывает кота).
  B.core.setPet('dog');
  const cat = A.core.setAppearance({ coat: 'ginger' });
  const dog = B.core.setAppearance({ coat: 'spotted' });
  assert.deepEqual([A.core.getState().pet.shown, B.core.getState().pet.shown, cat.save.keys, dog.save.keys], ['cat', 'dog', ['look'], ['look']]);
  await store.drain();
  assert.deepEqual(store.json('look'), { v: 1, cat: 'ginger', dog: 'spotted' }, 'патчи { cat } и { dog } не пересекаются');
  assert.deepEqual([A.core.getState().pet.shown, A.core.getState().pets.cat.coat, A.core.getState().pets.dog.coat], ['dog', 'ginger', 'spotted']);
  A.core.setPet('cat');
  await store.drain();
  const failed = A.core.setName('Барсик');
  await store.next('get', 'cat');
  await store.next('set', 'cat', 'fail');
  assert.equal(await failed.save.done, 'failed');
  assert.deepEqual(A.core.getState().save.cat, { status: 'failed', pending: [], unsaved: ['name'], corrupt: false });
  const next = A.core.setPreferences({ motion: 'calm' });
  assert.deepEqual(next.save.status, 'pending');
  assert.deepEqual(A.core.getState().save.cat.pending, ['name', 'motion'], 'несохранённое перешло в новую операцию');
  await store.drain();
  assert.deepEqual([await next.save.done, store.json('cat').name, store.json('cat').motion, A.core.getState().save.cat.status], ['saved', 'Барсик', 'calm', 'saved']);
});

test('внешняя правка перед своей операцией: B поглощает её, его патч лежит поверх; подтверждение старой правки не сохраняет новую', async () => {
  const { store, A, B } = await asyncPair();
  A.core.setPreferences({ motion: 'calm' });
  B.core.setPreferences({ motion: 'none' });
  await store.next('get', 'cat');
  await store.next('set', 'cat');
  assert.deepEqual([B.core.getState().prefs.motion, B.core.getState().save.cat.status], ['none', 'pending']);
  await store.drain();
  assert.equal(store.json('cat').motion, 'none');
  // Две правки одного ядра: подтверждена первая — статус ещё pending, в памяти — вторая.
  const first = A.core.setName('Барсик');
  const second = A.core.setName('Пиксель');
  await store.next('get', 'cat');
  await store.next('set', 'cat');
  assert.deepEqual([await first.save.done, A.core.getState().name.display, A.core.getState().save.cat.status], ['saved', 'Пиксель', 'pending']);
  await store.drain();
  assert.deepEqual([await second.save.done, A.core.getState().save.cat.status, store.json('cat').name], ['saved', 'saved', 'Пиксель']);
});

test('асинхронно: отказ записи, отклонённое чтение и неявная правка поверх повреждённого — одна фиксация, done не отклоняется', async () => {
  const { store, A } = await asyncPair({ cat: MARS, treat: '{' });
  const rejected = A.core.setName('Барсик');
  await store.next('get', 'cat', 'fail');
  assert.equal(await rejected.save.done, 'failed');
  assert.deepEqual([A.core.getState().save.cat.unsaved, store.waiting.length], [['name'], 0], 'отказ чтения — без записи');
  const refused = A.core.setPreferences({ phrases: false });
  await store.next('get', 'cat');
  await store.next('set', 'cat', 'fail');
  assert.equal(await refused.save.done, 'failed');
  assert.deepEqual(A.core.getState().save.cat.unsaved, ['name', 'phrases']);
  // Синхронное исключение адаптера тоже превращается в отказ.
  const broken = manual({ cat: MARS });
  await broken.load();
  broken.backend.get = () => {
    throw new Error('адаптер упал');
  };
  const core = make(broken.storage).core;
  const thrown = core.setName('Пух');
  assert.equal(await thrown.save.done, 'failed');
});

test('синхронно: успех и отказ — окончательные в том же вызове; веб не доставляет pending', () => {
  const { site, A } = webPair();
  const seen = [];
  A.core.subscribe((update) => seen.push(update.snapshot.save.cat.status), { initial: false });
  const ok = A.core.setName('Барсик');
  site.store.denySet = new RegExp(site.keys.cat);
  const failed = A.core.setName('Пиксель');
  assert.deepEqual([ok.save, failed.save], [{ status: 'saved', keys: ['cat'], results: { cat: 'saved' } }, { status: 'failed', keys: ['cat'], results: { cat: 'failed' } }]);
  assert.ok(!('done' in ok.save) && !('done' in failed.save));
  assert.deepEqual(seen, ['saved', 'failed']);
});

test('§ 8.7.2 на веб-координаторе: другая вкладка уже записала то же значение, события ещё нет — без записи, сверка поглощена всеми до settle', () => {
  const { list, site, watched, A, B } = webPair({ cat: { v: 1, name: 'Марс' } });
  const got = { a: [], b: [] };
  A.core.subscribe((update) => got.a.push(`${update.reason} ${update.snapshot.name.display} ${update.snapshot.save.cat.status}`), { initial: false });
  B.core.subscribe((update) => got.b.push(`${update.reason} ${update.snapshot.name.display}`), { initial: false });
  site.put('cat', { v: 1, name: 'Барсик' });
  const result = A.core.setName('Барсик');
  const key = site.keys.cat;
  assert.deepEqual(list, ['write a cat', `getItem ${key}`, 'absorb a cat', 'absorb b cat', 'settle a true', 'settled a'], 'next === current — setItem нет; автор поглощает сверку до своего settle');
  assert.deepEqual([result.save.status, got.a, got.b], ['saved', ['setName Барсик saved'], ['storage Барсик']]);
  assert.equal(site.store.writes.length, 0);
  // Новое ядро после барьера видит Барсик; запоздалое событие storage — без второго обновления.
  site.storage.load();
  assert.equal(make(watched).core.getState().name.display, 'Барсик');
  site.events.fire(key);
  assert.deepEqual([got.a.length, got.b.length], [1, 1]);
});

test('§ 8.7.2: кэш уже совпадал — других ядер не уведомляют; чужое имя и своя правка движения — обе, одно обновление каждого ядра', () => {
  const { list, site, watched, A, B } = webPair({ cat: { v: 1, name: 'Марс' } });
  const got = { a: [], b: [] };
  A.core.subscribe((update) => got.a.push(`${update.snapshot.name.display} ${update.snapshot.prefs.motion}`), { initial: false });
  B.core.subscribe((update) => got.b.push(`${update.snapshot.name.display} ${update.snapshot.prefs.motion}`), { initial: false });
  // Операция без изменения при совпавшем кэше (подключение напрямую): ни поглощений, ни обновлений.
  const client = watched.connect();
  let settled = null;
  assert.equal(client.write('cat', (current) => current, (ok) => (settled = ok)), 'settled');
  assert.deepEqual([settled, got.a, got.b, list.includes('absorb a cat')], [true, [], [], false]);
  client.close();
  site.put('cat', { v: 1, name: 'Барсик' });
  A.core.setPreferences({ motion: 'none' });
  assert.deepEqual(site.json('cat'), { v: 1, name: 'Барсик', motion: 'none' });
  assert.deepEqual([got.a, got.b], [['Барсик none'], ['Барсик none']], 'сверка и своя запись — одно обновление у каждого');
});

test('отказ записи после свежего чтения — сверка всё равно; отказ самого чтения — не «ключа нет», кэш прежний', () => {
  const { site, A, B } = webPair({ cat: { v: 1, name: 'Марс' } });
  site.put('cat', { v: 1, name: 'Барсик' });
  site.store.denySet = new RegExp(site.keys.cat);
  const failed = A.core.setPreferences({ motion: 'none' });
  assert.deepEqual([failed.save.status, A.core.getState().name.display, B.core.getState().name.display, A.core.getState().save.cat.unsaved], ['failed', 'Барсик', 'Барсик', ['motion']]);
  site.store.denySet = null;
  site.store.denyGet = new RegExp(site.keys.cat);
  site.put('cat', { v: 1, name: 'Пиксель' });
  const unread = A.core.setName('Дымок');
  assert.deepEqual([unread.save.status, B.core.getState().name.display, site.json('cat').name], ['failed', 'Барсик', 'Пиксель'], 'чтение не удалось — сверки нет, записи нет');
  assert.deepEqual(A.core.getState().save.cat.unsaved, ['motion', 'name']);
});

test('событие storage другой вкладки: перечитывается факт (не newValue); key === null — все ключи; запоздалое не откатывает', () => {
  const { site, B } = webPair({ cat: { v: 1, name: 'Марс' }, look: { v: 1, cat: 'smoke' } });
  const got = [];
  B.core.subscribe((update) => got.push(`${update.reason} ${update.snapshot.name.display} ${update.snapshot.look.coat}`), { initial: false });
  site.put('cat', { v: 1, name: 'Пиксель' });
  site.events.fire(site.keys.cat, { newValue: JSON.stringify({ v: 1, name: 'Ложь' }) });
  site.put('cat', { v: 1, name: 'Дымок' });
  site.put('look', { v: 1, cat: 'ginger' });
  site.events.fire(null);
  site.events.fire(site.keys.cat); // запоздалое событие о «Пикселе»
  site.events.fire('чужой:ключ');
  assert.deepEqual(got, ['storage Пиксель smoke', 'storage Дымок ginger']);
});

test('барьер load (асинхронно): ждёт операций, стоявших перед ним, сверяет и ничего не пишет; позже поставленное новое ядро поглощает', async () => {
  const { store, watched, A } = await asyncPair();
  A.core.setName('Барсик');
  const loading = store.storage.load();
  assert.equal(store.storage.status, 'loading');
  assert.throws(() => createPetCore({ storage: watched }), { code: 'storage-not-loaded' });
  store.data.set('look', JSON.stringify({ v: 1, cat: 'tuxedo' })); // другой процесс
  await store.drain();
  assert.equal(await loading, 'ready');
  const sets = [...store.data.keys()];
  const C = make(watched).core;
  assert.deepEqual([C.getState().name.display, C.getState().look.coat, A.core.getState().look.coat], ['Барсик', 'tuxedo', 'tuxedo'], 'барьер сверил кэш и раздал изменение');
  assert.deepEqual(sets.sort(), ['cat', 'look'], 'барьер ничего не записал');
  A.core.setPreferences({ motion: 'none' });
  await store.drain();
  assert.equal(C.getState().prefs.motion, 'none');
});

test('§ 8.7: A отключён до подтверждения — A1 не отменяется и строится без A; B поглощает её, B1 строится по ней; после барьера C видит обе', async () => {
  const { list, store, watched, A, B } = await asyncPair();
  const named = A.core.setName('Барсик');
  const moved = B.core.setPreferences({ motion: 'none' });
  const deadState = (() => {
    A.core.destroy();
    return A.core.getState();
  })();
  await store.next('get', 'cat');
  await store.next('set', 'cat');
  assert.equal(await named.save.done, 'saved', 'done A — действительный итог');
  assert.equal(A.core.getState(), deadState, 'отключённый A не меняется');
  assert.deepEqual([B.core.getState().name.display, B.core.getState().prefs.motion, B.core.getState().save.cat.status], ['Барсик', 'none', 'pending']);
  const barrier = store.storage.load();
  await store.drain();
  assert.equal(await barrier, 'ready');
  assert.equal(await moved.save.done, 'saved');
  const C = make(watched).core;
  assert.deepEqual([C.getState().name.display, C.getState().prefs.motion], ['Барсик', 'none']);
  assert.ok(!list.includes('absorb a cat'), 'закрытое подключение ничего не поглощает');
  assert.ok(list.indexOf('settle a true') > list.indexOf('absorb b cat'));
});

test('§ 8.7, варианты: отказ A1 после destroy; C создан до B1 без барьера — читает подтверждённое и поглощает B1', async () => {
  const first = await asyncPair();
  const named = first.A.core.setName('Барсик');
  first.B.core.setPreferences({ motion: 'none' });
  first.A.core.destroy();
  await first.store.next('get', 'cat');
  await first.store.next('set', 'cat', 'fail');
  assert.equal(await named.save.done, 'failed');
  await first.store.drain();
  assert.deepEqual(first.store.json('cat'), { ...MARS, motion: 'none' }, 'B1 легла на Марс; правка A потеряна, как перезагрузка');
  const second = await asyncPair();
  second.A.core.setName('Барсик');
  second.B.core.setPreferences({ motion: 'none' });
  second.A.core.destroy();
  await second.store.next('get', 'cat');
  await second.store.next('set', 'cat');
  const C = make(second.watched).core;
  assert.deepEqual([C.getState().name.display, C.getState().prefs.motion], ['Барсик', 'normal'], 'только подтверждённое');
  await second.store.drain();
  assert.equal(C.getState().prefs.motion, 'none', 'B1 поглощена');
});

test('пространства имён и реестр: тот же namespace — тот же координатор и очередь, другой — независимый; закрытое подключение не ставит запись', () => {
  const store = web().store;
  const one = createWebStorage({ namespace: 'n1', area: store });
  assert.equal(createWebStorage({ namespace: 'n1', area: store }), one);
  const two = createWebStorage({ namespace: 'n2', area: store });
  assert.notEqual(two, one);
  one.load();
  two.load();
  const a = make(one).core;
  const b = make(two).core;
  a.setName('Барсик');
  assert.deepEqual([b.getState().name.display, store.json('n1:cat:v1').name, store.raw('n2:cat:v1')], ['Марс', 'Барсик', null]);
  const client = one.connect();
  client.close();
  client.close();
  let result = null;
  assert.equal(client.write('cat', () => 'x', (ok) => (result = ok)), 'settled');
  assert.equal(result, false);
  assert.equal(store.json('n1:cat:v1').name, 'Барсик', 'без постановки');
});

test('setAppearance: два ключа ставятся сразу оба — results по ключам, partial, failed; асинхронно — pending и done', async () => {
  const { site, A } = webPair({ cat: { ...MARS, seenStage: 1 } });
  A.core.refresh();
  site.store.denySet = new RegExp(site.keys.look);
  const partial = A.core.setAppearance({ coat: 'ginger', accessory: 'plaid' });
  assert.deepEqual(partial.save, { status: 'partial', keys: ['look', 'cat'], results: { look: 'failed', cat: 'saved' } });
  assert.deepEqual([A.core.getState().look.coat, A.core.getState().look.accessory], ['ginger', 'plaid'], 'правка в памяти не откатывается');
  site.store.denySet = /./;
  const failed = A.core.setAppearance({ coat: 'tuxedo', accessory: 'scarf' });
  assert.deepEqual([failed.ok, failed.save.status, failed.save.results], [true, 'failed', { look: 'failed', cat: 'failed' }]);
  const { store, A: async } = await asyncPair({ cat: { ...MARS, seenStage: 1 } });
  const pending = async.core.setAppearance({ coat: 'ginger', accessory: 'plaid' });
  assert.deepEqual([pending.save.status, pending.save.results], ['pending', { look: 'pending', cat: 'pending' }]);
  assert.deepEqual(store.waiting.map((item) => `${item.op} ${item.key}`), ['get look', 'get cat'], 'независимые ключи — сразу оба');
  await store.next('get', 'look');
  await store.next('get', 'cat');
  await store.next('set', 'look', 'fail');
  await store.next('set', 'cat');
  assert.equal(await pending.save.done, 'partial');
});

test('внутренний сбой: исключение постановки — отказ ключа, команда продолжается; исключение после применения — ok, degraded, честный save', () => {
  const site = web({ cat: { ...MARS, seenStage: 1 } });
  site.storage.load();
  // Координатор, у подключения которого постановка записи look бросает (нарушение контракта адаптера).
  const faulty = {
    get status() {
      return site.storage.status;
    },
    load: () => site.storage.load(),
    connect() {
      const client = site.storage.connect();
      return { id: client.id, order: client.order, read: client.read, watch: client.watch, close: client.close, write: (key, build, settle) => (key === 'look' ? (() => { throw new Error('постановка look упала'); })() : client.write(key, build, settle)) };
    },
  };
  const log = journal();
  const core = createPetCore({ storage: faulty, progress: () => ({ marks: 3, today: 1 }), log: log.port });
  core.refresh();
  const one = core.setAppearance({ coat: 'ginger', accessory: 'plaid' });
  assert.deepEqual([one.ok, one.degraded, one.save.status, one.save.results], [true, undefined, 'partial', { look: 'failed', cat: 'saved' }]);
  assert.deepEqual(log.list, ['запись look не поставлена: постановка look упала']);
  // Журнал сам бросает при этом предупреждении — сбой после применения правки.
  const throwing = { warn: () => {
    throw new Error('журнал упал');
  } };
  const updates = [];
  const other = createPetCore({ storage: faulty, progress: () => ({ marks: 3, today: 1 }), log: throwing });
  other.refresh();
  other.subscribe((update) => updates.push(...update.effects.filter((effect) => effect.type === 'warning').map((effect) => effect.code)), { initial: false });
  const two = other.setAppearance({ coat: 'tuxedo', accessory: 'scarf' });
  assert.deepEqual([two.ok, two.changed, two.degraded, two.save.status, two.save.results], [true, true, true, 'partial', { look: 'failed', cat: 'saved' }]);
  assert.deepEqual([other.getState().look.coat, site.json('cat').accessory, updates], ['tuxedo', 'scarf', ['internal']], 'правка применена, поставленная запись выполнена');
});

test('асинхронное лакомство: без слов о сохранности сразу; поздний отказ — отдельное объявление; внешнее подтверждение — тихо у второго ядра', async () => {
  const { store, B } = await asyncPair();
  const counts = host(1, 1);
  const feeder = make(store.storage, { counts }).core;
  B.core.refresh();
  const said = [];
  feeder.subscribe((update) => said.push(...update.effects.filter((effect) => effect.type === 'announce').map((effect) => `${update.reason}: ${effect.text}`)), { initial: false });
  const fed = feeder.feed(SEEN);
  assert.deepEqual([fed.save.status, feeder.getState().treat, feeder.getState().save.treat.status], ['pending', 'fed', 'pending']);
  assert.deepEqual(said, ['feed: Марс получает лакомство. Сегодня уже угостили.']);
  await store.next('get', 'treat');
  await store.next('set', 'treat', 'fail');
  assert.equal(await fed.save.done, 'failed');
  assert.deepEqual(said.at(-1), 'save: Марс: отметка лакомства не сохранилась в этом браузере.');
  assert.equal(feeder.feed(SEEN).error.code, 'treat-fed', 'второго лакомства в экземпляре нет');
  // Другой процесс подтвердил отметку дня: второе ядро узнаёт её сверкой барьера — тихо, без объявлений и записи.
  const quiet = [];
  B.core.subscribe((update) => quiet.push(`${update.reason} ${update.snapshot.treat} ${update.effects.length}`), { initial: false });
  assert.equal(B.core.getState().treat, 'waiting');
  store.data.set('treat', JSON.stringify({ v: 1, fedDay: DAY }));
  const barrier = store.storage.load();
  await store.drain();
  assert.equal(await barrier, 'ready');
  assert.deepEqual(quiet, ['storage fed 0'], 'лакомство общее: у B — «сегодня уже угостили»');
  assert.deepEqual([feeder.getState().treat, feeder.getState().save.treat.status], ['fed', 'saved'], 'несохранённая отметка вытеснена подтверждённой');
});
