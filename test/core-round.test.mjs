// Раунд доставки PL03 (docs/ARCHITECTURE.md § 5.4, § 8.7.1): ядра A (подключение a, слушатель la) и B (b, lb) на одном
// координаторе; хост вызывает A.setName('Барсик'). Варианты: B пишет тот же ключ, другой ключ; слушатель отключает A или
// B, B — себя после своей команды; исключение слушателя до и после команды; повтор того же значения завершает раунд.
// Синхронно (веб) и асинхронно (ручное подтверждение): точный журнал постановки, чтения и записи, поглощения, settle,
// доставок и возвратов. Веб не возвращает и не доставляет pending. Команда из порта или progress() в фазе работы —
// reentrant без изменений и журнала; destroy из неё — в конце фазы работы; подписка из неё — начальный снимок в доставке.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPetCore } from '../pet/core/index.mjs';
import { DAY, host, journal, make, manual, spy, web } from './core-kit.mjs';

const SEEN = { around: true };
const MARS = { v: 1, name: 'Марс', seenStage: 0, greetDay: DAY };
const view = (update) => `${update.reason} ${update.snapshot.name.display} ${update.snapshot.save.cat.status}`;

function sync() {
  const list = [];
  const site = web({ cat: MARS }, { journal: list });
  site.storage.load();
  const watched = spy(site.storage, list, ['a', 'b']);
  const A = make(watched, { counts: host(0, 1) });
  const B = make(watched, { counts: host(0, 1) });
  A.core.start(SEEN);
  B.core.start(SEEN);
  list.length = 0;
  const key = site.keys.cat;
  return { list, site, A: A.core, B: B.core, logB: B.log, get: `getItem ${key}`, set: `setItem ${key}` };
}

async function later() {
  const list = [];
  const store = manual({ cat: MARS }, list);
  await store.load();
  const watched = spy(store.storage, list, ['a', 'b']);
  const A = make(watched, { counts: host(0, 1) });
  const B = make(watched, { counts: host(0, 1) });
  A.core.start(SEEN);
  B.core.start(SEEN);
  list.length = 0;
  return { list, store, A: A.core, B: B.core };
}

// Общее начало: фиксация A1 → закрытие (A, затем B) → доставка la, затем lb.
const opening = (s) => ['write a cat', s.get, s.set, 'absorb b cat', 'settle a true', 'settled a', 'deliver la setName Барсик saved', 'deliver lb storage Барсик saved'];

test('синхронно, вариант 1 — B пишет тот же ключ: фиксация A1, settle A1, затем B1; B.setName — окончательный итог; обновления B1 — в конец очереди', () => {
  const s = sync();
  const delivered = [];
  s.A.subscribe((update) => (delivered.push(update), s.list.push(`deliver la ${view(update)}`)), { initial: false });
  s.B.subscribe((update) => {
    delivered.push(update);
    s.list.push(`deliver lb ${view(update)}`);
    const result = s.B.setName('Пиксель');
    s.list.push(`return B ${result.changed ? result.save.status : 'без изменений'}`);
  }, { initial: false });
  const result = s.A.setName('Барсик');
  s.list.push(`return A ${result.save.status}`);
  assert.deepEqual(s.list, [
    ...opening(s),
    'write b cat', s.get, s.set, 'absorb a cat', 'settle b true', 'settled b',
    'return B saved',
    'deliver lb setName Пиксель saved',
    'return B без изменений',
    'deliver la storage Пиксель saved',
    'return A saved',
  ]);
  assert.ok(delivered.every((update) => update.snapshot.save.cat.status !== 'pending'), 'веб не доставляет pending');
  assert.equal(s.site.json('cat').name, 'Пиксель');
});

test('синхронно, вариант 2 — B пишет другой ключ (лакомство): своя очередь treat, порядок и итог cat от неё не зависят', () => {
  const s = sync();
  s.A.subscribe((update) => s.list.push(`deliver la ${update.reason} ${update.snapshot.treat}`), { initial: false });
  let once = false;
  s.B.subscribe((update) => {
    s.list.push(`deliver lb ${update.reason} ${update.snapshot.treat} ${update.effects.filter((effect) => effect.type === 'announce').length}`);
    if (once) return;
    once = true;
    s.list.push(`return B ${s.B.feed(SEEN).save.status}`);
  }, { initial: false });
  const result = s.A.setName('Барсик');
  s.list.push(`return A ${result.save.status}`);
  const treat = s.site.keys.treat;
  assert.deepEqual(s.list, [
    'write a cat', s.get, s.set, 'absorb b cat', 'settle a true', 'settled a',
    'deliver la setName ready',
    'deliver lb storage ready 0',
    'write b treat', `getItem ${treat}`, `setItem ${treat}`, 'absorb a treat', 'settle b true', 'settled b',
    'return B saved',
    'deliver lb feed fed 1',
    'deliver la storage fed',
    'return A saved',
  ]);
});

test('синхронно, вариант 3а — lb отключает A: A получает только destroyed; хост получает итог A1 (saved); дальше — destroyed', () => {
  const s = sync();
  s.A.subscribe((update) => s.list.push(`deliver la ${update.reason}`), { initial: false });
  s.B.subscribe((update) => {
    s.list.push(`deliver lb ${update.reason}`);
    s.A.destroy();
  }, { initial: false });
  const result = s.A.setName('Барсик');
  s.list.push(`return A ${result.save.status}`);
  assert.deepEqual(s.list.slice(-4), ['deliver la setName', 'deliver lb storage', 'deliver la destroyed', 'return A saved']);
  assert.equal(s.A.setName('Пиксель').error.code, 'destroyed');
});

test('синхронно, вариант 3б — la отключает B до доставки U_B1: недоставленное снято, lb получает только destroyed', () => {
  const s = sync();
  s.A.subscribe((update) => {
    s.list.push(`deliver la ${update.reason}`);
    s.B.destroy();
  }, { initial: false });
  s.B.subscribe((update) => s.list.push(`deliver lb ${update.reason} ${update.snapshot.status}`), { initial: false });
  const result = s.A.setName('Барсик');
  s.list.push(`return A ${result.save.status}`);
  assert.deepEqual(s.list.slice(-3), ['deliver la setName', 'deliver lb destroyed destroyed', 'return A saved']);
  assert.equal(s.site.json('cat').name, 'Барсик', 'подтверждённое не меняется — B его только поглощал');
});

test('синхронно, вариант 3в — lb пишет, затем отключает своё B: U_B2 снято, U_A2 доставлено, остальные слушатели B получают только destroyed', () => {
  const s = sync();
  s.A.subscribe((update) => s.list.push(`deliver la ${view(update)}`), { initial: false });
  s.B.subscribe((update) => {
    s.list.push(`deliver lb ${update.reason}`);
    if (update.reason === 'destroyed') return;
    s.B.setName('Пиксель');
    s.B.destroy();
  }, { initial: false });
  s.B.subscribe((update) => s.list.push(`deliver lb2 ${update.reason}`), { initial: false });
  const result = s.A.setName('Барсик');
  s.list.push(`return A ${result.save.status}`);
  assert.deepEqual(s.list.slice(8), [
    'write b cat', s.get, s.set, 'absorb a cat', 'settle b true', 'settled b',
    'deliver la storage Пиксель saved',
    'deliver lb destroyed',
    'deliver lb2 destroyed',
    'return A saved',
  ]);
  assert.deepEqual(s.list.slice(0, 8), [...opening(s).slice(0, 7), 'deliver lb storage']);
  assert.equal(s.site.json('cat').name, 'Пиксель', 'фиксация B1 прошла до отключения');
});

test('синхронно, вариант 4 — слушатель бросает до и после своей команды: журнал, остальные получают, команда не откатывается', () => {
  const s = sync();
  let calls = 0;
  s.A.subscribe((update) => s.list.push(`deliver la ${view(update)}`), { initial: false });
  s.B.subscribe(() => {
    calls += 1;
    if (calls === 1) {
      s.B.setName('Пиксель');
      throw new Error('после команды');
    }
    throw new Error('до команды');
  }, { initial: false });
  s.B.subscribe((update) => s.list.push(`deliver lb2 ${view(update)}`), { initial: false });
  const result = s.A.setName('Барсик');
  s.list.push(`return A ${result.save.status}`);
  assert.deepEqual(s.list.filter((line) => line.startsWith('deliver') || line.startsWith('return')), ['deliver la setName Барсик saved', 'deliver lb2 storage Барсик saved', 'deliver lb2 setName Пиксель saved', 'deliver la storage Пиксель saved', 'return A saved']);
  assert.deepEqual(s.logB.list, ['исключение подписчика — доставка продолжается: после команды', 'исключение подписчика — доставка продолжается: до команды']);
  assert.equal(s.site.json('cat').name, 'Пиксель');
});

test('синхронно: снимок, переданный слушателю, старше getState() после команды другого слушателя; повтор того же значения раунд завершает', () => {
  const s = sync();
  const seen = [];
  const off = s.B.subscribe(() => s.B.setName('Пиксель'), { initial: false });
  s.B.subscribe((update) => seen.push(`${update.snapshot.name.display}/${s.B.getState().name.display}`), { initial: false });
  s.A.setName('Барсик');
  assert.deepEqual(seen, ['Барсик/Пиксель', 'Пиксель/Пиксель']);
  off();
  // Слушатель, который на каждое обновление ставит одно и то же значение: второе — без изменений, обновления нет, раунд
  // кончается. (Два слушателя, ставящие разные значения, зациклили бы раунд, как любые наблюдатели, — ядро это не
  // ограничивает, § 5.4.)
  const loop = [];
  s.A.subscribe((update) => {
    loop.push(update.reason);
    s.A.setName('Дымок');
  }, { initial: false });
  s.A.setName('Дымок');
  assert.deepEqual(loop, ['setName']);
});

test('асинхронно, тот же сценарий: A1 — queued и pending; R2 — фиксация A1, settle, U_A и U_B; B1 из lb встаёт за ней; R3 — фиксация B1', async () => {
  const s = await later();
  s.A.subscribe((update) => s.list.push(`deliver la ${view(update)}`), { initial: false });
  s.B.subscribe((update) => {
    s.list.push(`deliver lb ${view(update)}`);
    if (update.snapshot.name.display !== 'Барсик') return;
    const result = s.B.setName('Пиксель');
    s.list.push(`return B ${result.save.status}`);
  }, { initial: false });
  const result = s.A.setName('Барсик');
  s.list.push(`return A ${result.save.status}`);
  assert.deepEqual(s.list, ['write a cat', 'get cat', 'queued a', 'deliver la setName Барсик pending', 'return A pending']);
  s.list.length = 0;
  await s.store.next('get', 'cat');
  await s.store.next('set', 'cat');
  assert.deepEqual(s.list, [
    'set cat',
    'absorb b cat', 'settle a true',
    'deliver la save Барсик saved',
    'deliver lb storage Барсик saved',
    'write b cat', 'queued b', 'return B pending',
    'deliver lb setName Пиксель pending',
    'get cat',
  ]);
  s.list.length = 0;
  await s.store.next('get', 'cat');
  await s.store.next('set', 'cat');
  assert.deepEqual(s.list, ['set cat', 'absorb a cat', 'settle b true', 'deliver lb save Пиксель saved', 'deliver la storage Пиксель saved']);
  assert.equal(await result.save.done, 'saved');
});

test('асинхронно, варианты 2–4: другой ключ, отключение A и B, исключение — с pending до своей фиксации', async () => {
  // Другой ключ: lb кормит — treat в своей очереди, pending до своей фиксации.
  const two = await later();
  const said = [];
  two.B.subscribe((update) => {
    said.push(`${update.reason} ${update.snapshot.treat} ${update.snapshot.save.treat.status}`);
    if (update.reason === 'storage' && update.snapshot.name.display === 'Барсик') two.B.feed(SEEN);
  }, { initial: false });
  two.A.setName('Барсик');
  await two.store.drain();
  assert.deepEqual(said, ['storage ready saved', 'feed fed pending', 'save fed saved']);
  // lb отключает A после фиксации A1 (A1 уже подтверждена); la отключает B.
  const three = await later();
  const got = [];
  three.A.subscribe((update) => got.push(`la ${update.reason}`), { initial: false });
  three.B.subscribe((update) => {
    got.push(`lb ${update.reason}`);
    if (update.reason === 'storage') three.A.destroy();
  }, { initial: false });
  const named = three.A.setName('Барсик');
  await three.store.drain();
  assert.deepEqual([got, await named.save.done], [['la setName', 'la save', 'lb storage', 'la destroyed'], 'saved']);
  const four = await later();
  const thrown = [];
  four.B.subscribe(() => {
    throw new Error('слушатель упал');
  }, { initial: false });
  four.B.subscribe((update) => thrown.push(update.reason), { initial: false });
  four.A.setName('Барсик');
  await four.store.drain();
  assert.deepEqual(thrown, ['storage'], 'остальные слушатели B получили обновление');
});

test('повторный вход в фазе работы: команда из progress() или порта часов — reentrant без изменений и журнала; destroy — в конце фазы; подписка — в доставке', () => {
  const site = web({ cat: MARS });
  site.storage.load();
  const log = journal();
  let core = null;
  let inside = null;
  let mode = '';
  const list = [];
  const progress = () => {
    if (mode === 'command') inside = core.setName('Изнутри');
    if (mode === 'destroy') core.destroy();
    if (mode === 'subscribe') core.subscribe((update) => list.push(`изнутри ${update.reason}`));
    return { marks: 0, today: 1 };
  };
  core = createPetCore({ storage: site.storage, progress, log: log.port });
  core.start(SEEN);
  core.subscribe((update) => list.push(`снаружи ${update.reason}`), { initial: false });
  mode = 'command';
  const state = core.getState();
  core.refresh();
  assert.deepEqual([inside.ok, inside.error.code, core.getState(), site.json('cat').name, log.list], [false, 'reentrant', state, 'Марс', []]);
  mode = 'subscribe';
  site.put('cat', { ...MARS, motion: 'calm' });
  core.refresh();
  assert.deepEqual(list, ['изнутри initial'], 'начальный снимок подписки из порта — в доставке этого раунда');
  const clockCore = createPetCore({ storage: site.storage, clock: { now: () => 0, day: () => (clockCore.setName('Часы').error.code === 'reentrant' ? DAY : 'нет'), nextDay: (at) => at + 1 } });
  assert.equal(clockCore.start(SEEN).ok, true);
  mode = 'destroy';
  const result = core.refresh();
  assert.deepEqual([result.ok, core.status, list.at(-1)], [true, 'destroyed', 'изнутри destroyed']);
});
