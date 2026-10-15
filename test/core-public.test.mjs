// Публичный вход ядра pet-companion/core (этап PL05; docs/ARCHITECTURE.md § 4–6, § 14.1.5) — только через pet/core.mjs:
// поверхность входа, хранилища и экземпляра (ровно публичные методы, внутренних входов legacy нет); создание — проверка
// настроек до подключения, регистрация определений не принимается, хранилище — только createStorage и загруженное; при
// создании ни записи, ни задач, ни слушателей; жизненный цикл; результаты команд — точные поля, честный changed, коды
// отказов без изменений и обновлений; обязательный непустой key события, failed без подробностей, внутренние признаки
// (scene, pick) — не параметры; готовые имена; отчёт сохранения — синхронный успех и отказ, partial двух ключей,
// асинхронные pending → done (успех, отказ, partial, после destroy), статус старой операции не снимает pending новой;
// снимок — глубоко замороженный, стабильная ссылка, без place и функций, чужие объекты не заморожены; подписка и раунд —
// начальная доставка, порядок автора и остальных, FIFO, команда из слушателя, отписка и подписка во время доставки,
// исключение слушателя, destroy в доставке, после destroy; принятые гарантии PL03–PL04 через публичный вход (сверка
// перед решением, ручная отмена сценки, «Сохранить» после позднего отказа, свой ID предмета, точка из двух конечных
// чисел, перенос предмета toy.*). Данные синтетические; хранилища — свои (Map и ручное асинхронное).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Core from '../pet/core.mjs';
import { calendar, DAY, flush, planner, series } from './core-kit.mjs';

const { createPetCore, createStorage, PetError, VERSION, localDay } = Core;
const VIEWS = ['corner', 'play', 'room'];
const FLOOR = [-40, -10, 300, 230];
const CAT = { v: 1, seenStage: 0, greetDay: DAY };
let spaces = 0;

// Синхронное хранилище на Map: журнал get/set, отказ записи по регулярному выражению имени.
function syncBackend(initial = {}) {
  const data = new Map(Object.entries(initial).map(([name, value]) => [name, typeof value === 'string' ? value : JSON.stringify(value)]));
  const self = { data, log: [], deny: null, denyGet: null };
  self.backend = {
    get: (name) => {
      self.log.push(`get ${name}`);
      if (self.denyGet?.test(name)) throw new Error(`get ${name}`);
      return data.has(name) ? data.get(name) : null;
    },
    set: (name, text) => {
      self.log.push(`set ${name}`);
      if (self.deny?.test(name)) throw new Error(`set ${name}: переполнено (проверка)`);
      data.set(name, text);
    },
  };
  self.writes = () => self.log.filter((line) => line.startsWith('set '));
  return self;
}

// Асинхронное хранилище с ручным подтверждением каждого get и set (обещания ждут в очереди проверки).
function asyncBackend(initial = {}) {
  const data = new Map(Object.entries(initial).map(([name, value]) => [name, typeof value === 'string' ? value : JSON.stringify(value)]));
  const waiting = [];
  const self = { data, waiting };
  self.backend = {
    async: true,
    get: (name) => new Promise((ok, no) => waiting.push({ op: 'get', name, ok: () => ok(data.has(name) ? data.get(name) : null), fail: () => no(new Error(`get ${name}`)) })),
    set: (name, text) =>
      new Promise((ok, no) =>
        waiting.push({
          op: 'set',
          name,
          ok: () => {
            data.set(name, text);
            ok();
          },
          fail: () => no(new Error(`set ${name}`)),
        }),
      ),
  };
  self.next = async (how = 'ok') => {
    const item = waiting.shift();
    assert.ok(item, 'нет ожидающей операции хранилища');
    item[how]();
    await flush();
    return item;
  };
  self.drain = async () => {
    while (waiting.length) await self.next();
  };
  return self;
}

// Экземпляр через публичный вход: своё пространство имён, ручные часы, планировщик и случайность, журнал, слушатель.
function make({ initial = {}, backend = null, counts = { marks: 0, today: 0 }, random = series(), ns = `pub${++spaces}`, scenes = null } = {}) {
  const store = backend ?? syncBackend(Object.fromEntries(Object.entries(initial).map(([key, value]) => [`${ns}:${key}:v1`, value])));
  const storage = createStorage({ namespace: ns, backend: store.backend });
  const time = calendar();
  const plan = planner(time);
  const log = [];
  const opts = { storage, progress: () => counts, clock: time.port, random: random.port, scheduler: plan.port, log: { warn: (message) => log.push(message) } };
  if (scenes) opts.scenes = scenes;
  const self = { ns, store, storage, time, plan, log, counts, opts, seen: [] };
  self.name = (key) => `${ns}:${key}:v1`;
  self.json = (key) => JSON.parse(store.data.get(self.name(key)) ?? 'null');
  self.ready = () => {
    assert.equal(storage.load(), 'ready');
    self.core = createPetCore(opts);
    self.core.subscribe((update) => self.seen.push(update), { initial: false });
    return self;
  };
  return backend ? self : self.ready();
}
const state = (L) => L.core.getState();

test('вход: ровно createPetCore, createStorage, PetError, localDay, VERSION; localDay и VERSION — те же, что у legacy-входа', async () => {
  assert.deepEqual(Object.keys(Core).sort(), ['PetError', 'VERSION', 'createPetCore', 'createStorage', 'localDay']);
  const legacy = await import('../pet/pet.mjs');
  assert.equal(VERSION, legacy.VERSION);
  assert.equal(localDay, legacy.localDay);
  assert.equal(localDay(new Date(2026, 9, 15, 23, 59)), '2026-10-15');
  const error = new PetError('invalid-options', 'x');
  assert.deepEqual([error instanceof Error, error.name, error.code, error.message], [true, 'PetError', 'invalid-options', 'x']);
});

test('createStorage: настройки проверяются (PetError invalid-options); тот же backend и namespace — тот же координатор; наружу только status и load', () => {
  const store = syncBackend();
  for (const bad of [undefined, null, 5, [], { backend: store.backend, extra: 1 }, { backend: store.backend, namespace: '' }, { backend: store.backend, namespace: 5 }, { backend: null }, { backend: { get() {} } }, { backend: { get() {}, set() {}, async: 'yes' } }]) {
    assert.throws(() => createStorage(bad), (error) => error instanceof PetError && error.code === 'invalid-options', JSON.stringify(bad));
  }
  const a = createStorage({ namespace: 'same', backend: store.backend });
  assert.equal(createStorage({ namespace: 'same', backend: store.backend }), a, 'тот же объект');
  assert.notEqual(createStorage({ namespace: 'other', backend: store.backend }), a, 'другое пространство — другой координатор');
  assert.deepEqual(Object.keys(a).sort(), ['load', 'status']);
  assert.equal(Object.isFrozen(a), true);
  assert.equal(a.status, 'idle');
  assert.equal(store.log.length, 0, 'создание не читает хранилище');
  assert.equal(a.load(), 'ready');
  assert.deepEqual(
    store.log,
    ['cat', 'companion', 'look', 'treat', 'place', 'presence', 'scene', 'room'].map((key) => `get same:${key}:v1`),
    'загрузка — восемь ключей пространства с прежними именами v1',
  );
  const broken = syncBackend();
  broken.denyGet = /:look:/;
  assert.equal(createStorage({ backend: broken.backend }).load(), 'failed', 'отказ чтения любого ключа — failed');
  // Синхронный backend, вернувший обещание, — отказ чтения (для обещаний нужен async: true), без необработанного отклонения.
  const wrong = createStorage({ backend: { get: () => Promise.reject(new Error('async')), set() {} } });
  assert.equal(wrong.load(), 'failed');
  const odd = createStorage({ backend: { get: () => 42, set() {} } });
  assert.equal(odd.load(), 'failed', 'не строка — отказ, а не String(value)');
});

test('createStorage асинхронно: load — обещание итога (барьер очереди), отказ чтения — failed; ядро — только после загрузки (storage-not-loaded)', async () => {
  const store = asyncBackend();
  const storage = createStorage({ namespace: 'async-a', backend: store.backend });
  const loading = storage.load();
  assert.equal(storage.status, 'loading');
  assert.ok(loading instanceof Promise);
  assert.throws(() => createPetCore({ storage }), (error) => error.code === 'storage-not-loaded');
  await store.drain();
  assert.equal(await loading, 'ready');
  const core = createPetCore({ storage });
  assert.equal(core.status, 'created');
  core.destroy();
  const failing = asyncBackend();
  const second = createStorage({ namespace: 'async-b', backend: failing.backend });
  const done = second.load();
  await failing.next('fail');
  await failing.drain();
  assert.equal(await done, 'failed');
  const offline = createPetCore({ storage: second });
  assert.deepEqual([offline.getState().storage, offline.getState().save.cat.status], ['failed', 'unavailable'], 'отказ загрузки — без записей');
  offline.destroy();
});

test('createPetCore: проверка до подключения; pets и behaviors не принимаются (регистрация — следующий этап); storage — только загруженный координатор createStorage', () => {
  const store = syncBackend();
  const storage = createStorage({ namespace: 'opts', backend: store.backend });
  storage.load();
  const reads = store.log.length;
  const bad = [
    [undefined, 'invalid-options'],
    [null, 'invalid-options'],
    [{ storage, extra: 1 }, 'invalid-options'],
    [{ storage, pets: [] }, 'invalid-options'],
    [{ storage, behaviors: [] }, 'invalid-options'],
    [{}, 'invalid-options'],
    [{ storage: { status: 'ready', load: () => 'ready', connect: () => ({}) } }, 'invalid-options'],
    [{ storage, progress: 5 }, 'invalid-options'],
    [{ storage, scenes: {} }, 'invalid-options'],
    [{ storage, clock: { now: () => 0 } }, 'invalid-options'],
    [{ storage, random: 0.5 }, 'invalid-options'],
    [{ storage, scheduler: {} }, 'invalid-options'],
    [{ storage, log: console.log }, 'invalid-options'],
  ];
  for (const [options, code] of bad) assert.throws(() => createPetCore(options), (error) => error instanceof PetError && error.code === code, JSON.stringify(options));
  assert.match((() => {
    try {
      createPetCore({ storage, pets: [] });
    } catch (error) {
      return error.message;
    }
  })(), /регистрация определений ещё не поддерживается/);
  assert.equal(store.log.length, reads, 'отказ создания хранилище не трогает');
  const fresh = createStorage({ namespace: 'opts-not-loaded', backend: store.backend });
  assert.throws(() => createPetCore({ storage: fresh }), (error) => error.code === 'storage-not-loaded');
});

test('экземпляр: ровно публичные методы и свойства, вложенные stroke, toy, room; входов legacy-отображения нет; заморожен; version, status', () => {
  const L = make();
  const core = L.core;
  assert.deepEqual(Object.keys(core).sort(), ['activity', 'close', 'destroy', 'feed', 'getState', 'hide', 'interact', 'notify', 'open', 'refresh', 'room', 'setAppearance', 'setContext', 'setDisplay', 'setName', 'setPet', 'setPreferences', 'setPresence', 'setReducedMotion', 'setVisible', 'show', 'start', 'status', 'stroke', 'subscribe', 'toy', 'version']);
  assert.deepEqual(Object.keys(core.stroke).sort(), ['cancel', 'end', 'start', 'step']);
  assert.deepEqual(Object.keys(core.toy).sort(), ['cancel', 'drag', 'drop']);
  assert.deepEqual(Object.keys(core.room).sort(), ['cancel', 'drag', 'dragCancel', 'drop', 'move', 'nudge', 'reset', 'save', 'select']);
  for (const internal of ['setPlace', 'arrive', 'stopScene', 'react', 'setBusy', 'setSight', 'markSeen']) assert.equal(internal in core, false, internal);
  for (const part of [core, core.stroke, core.toy, core.room]) assert.equal(Object.isFrozen(part), true);
  assert.deepEqual([core.version, core.status], [VERSION, 'created']);
  assert.deepEqual(core.start(), { ok: true, changed: true, save: { status: 'saved', keys: ['cat'], results: { cat: 'saved' } } }, 'первое включение — неявная запись cat; решение приветствия наружу не выдаётся');
  assert.equal(core.status, 'running');
  assert.deepEqual(core.start(), { ok: false, error: { code: 'already-started', message: 'Ядро уже запущено.' } });
  assert.equal(core.destroy(), undefined);
  assert.equal(core.status, 'destroyed');
  assert.equal(core.destroy(), undefined, 'повторно — ничего');
});

test('создание: ни записи, ни задач, ни случайности, ни слушателей; своё подключение у каждого ядра — правка одного приходит другому обновлением storage', () => {
  const random = series();
  const L = make({ random, initial: { cat: CAT } });
  const calls = { later: L.plan.calls, random: random.state.taken };
  const writes = L.store.writes().length;
  assert.deepEqual([L.plan.calls, random.state.taken, writes, L.seen.length], [0, 0, 0, 0]);
  assert.equal(L.core.getState().status, 'created');
  // До start команды меняют состояние без реакций и задач.
  const named = L.core.setName('Барсик');
  assert.deepEqual([named.ok, named.changed, named.reacted, L.plan.calls, L.json('cat').name], [true, true, false, calls.later, 'Барсик']);
  const B = createPetCore({ ...L.opts });
  const toB = [];
  B.subscribe((update) => toB.push(update.reason), { initial: false });
  L.core.setPreferences({ motion: 'calm' });
  assert.deepEqual([B.getState().prefs.motion, toB], ['calm', ['storage']], 'автор — settle, другое ядро — поглощение');
  B.destroy();
  L.core.destroy();
});

test('методы не зависят от this: переданные отдельно работают', () => {
  const L = make({ initial: { cat: CAT } });
  const { start, setName, getState, subscribe, destroy } = L.core;
  const { start: strokeStart } = L.core.stroke;
  const { save } = L.core.room;
  const seen = [];
  const off = subscribe((update) => seen.push(update.reason));
  assert.equal(start().ok, true);
  assert.equal(setName('Пух').ok, true);
  assert.equal(getState().name.value, 'Пух');
  assert.equal(strokeStart().error.code, 'not-open');
  assert.equal(save().error.code, 'not-open');
  off();
  destroy();
  assert.deepEqual(seen, ['initial', 'start', 'setName']);
});

test('отказы команд: точный код, ничего не изменено, ни записи, ни обновления, ни эффекта', () => {
  const L = make({ initial: { cat: CAT }, counts: { marks: 1, today: 0 } });
  L.core.start();
  const cases = [
    ['notify без подробностей', () => L.core.notify('saved'), 'invalid-argument'],
    ['notify неизвестный тип', () => L.core.notify('done', { key: 'k' }), 'invalid-argument'],
    ['setName не строка', () => L.core.setName(5), 'invalid-argument'],
    ['setPet не строка', () => L.core.setPet(null), 'invalid-argument'],
    ['setPet неизвестный', () => L.core.setPet('fox'), 'unknown-id'],
    ['облик неизвестный', () => L.core.setAppearance({ coat: 'zebra' }), 'unknown-id'],
    ['облик чужого питомца', () => L.core.setAppearance({ coat: 'caramel' }), 'unknown-id'],
    ['аксессуар неизвестный', () => L.core.setAppearance({ accessory: 'crown' }), 'unknown-id'],
    ['аксессуар закрыт', () => L.core.setAppearance({ accessory: 'badge' }), 'locked'],
    ['облик пустой', () => L.core.setAppearance({}), 'invalid-argument'],
    ['настройки неверные', () => L.core.setPreferences({ motion: 'fast' }), 'invalid-argument'],
    ['присутствие неверное', () => L.core.setPresence('sometimes'), 'invalid-argument'],
    ['кормление до занятия', () => L.core.feed(), 'treat-waiting'],
    ['вид не объявлен', () => L.core.open('corner'), 'unsupported'],
    ['вид неверный', () => L.core.open('garden'), 'invalid-argument'],
    ['вызов не в «Поиграть»', () => L.core.open('corner', { source: 'call' }), 'invalid-argument'],
    ['контекст неверный', () => L.core.setContext({ timer: 1 }), 'invalid-argument'],
    ['видимость не boolean', () => L.core.setVisible('нет'), 'invalid-argument'],
    ['уменьшить движение не boolean', () => L.core.setReducedMotion(1), 'invalid-argument'],
    ['отображение неверное', () => L.core.setDisplay({ scenes: { cat: 'stretch' } }), 'invalid-argument'],
    ['отображение неизвестное свойство', () => L.core.setDisplay({ theme: 'dark' }), 'invalid-argument'],
    ['действие неверное', () => L.core.interact({ type: 'jump' }), 'invalid-argument'],
    ['лапа кота вне «Поиграть»', () => L.core.interact({ type: 'paw' }), 'unsupported'],
    ['миска вне «Поиграть»', () => L.core.interact({ type: 'bowl', to: 'near' }), 'not-open'],
    ['жест вне «Поиграть»', () => L.core.stroke.start(), 'not-open'],
    ['шаг чужого жеста', () => L.core.stroke.step(99), 'no-gesture'],
    ['id жеста неверный', () => L.core.stroke.end('1'), 'invalid-argument'],
    ['перенос предмета вне «Поиграть»', () => L.core.toy.drag('bowl', [1, 1]), 'not-open'],
    ['комната вне редактора', () => L.core.room.select('rest'), 'not-open'],
    ['сохранение вне редактора', () => L.core.room.save(), 'not-open'],
  ];
  for (const [title, call, code] of cases) {
    const before = state(L);
    const seen = L.seen.length;
    const writes = L.store.writes().length;
    const result = call();
    assert.deepEqual([result.ok, result.error?.code, typeof result.error?.message, Object.keys(result).sort()], [false, code, 'string', ['error', 'ok']], title);
    assert.deepEqual([state(L) === before, L.seen.length - seen, L.store.writes().length - writes], [true, 0, 0], `${title}: без изменений`);
  }
  // Бизнес-отказы при спрятанном и «по зову».
  L.core.setDisplay({ views: VIEWS });
  L.core.hide();
  for (const [title, call, code] of [
    ['кормление — спрятан', () => L.core.feed(), 'hidden'],
    ['открыть — спрятан', () => L.core.open('corner'), 'hidden'],
    ['погладить — спрятан', () => L.core.interact({ type: 'pet' }), 'hidden'],
  ]) {
    const before = state(L);
    assert.deepEqual([call().error.code, state(L) === before], [code, true], title);
  }
  L.core.show();
  L.core.setPresence('on-call');
  L.counts.today = 1;
  assert.equal(L.core.feed().error.code, 'away', '«по зову» и не вызван');
  assert.equal(L.core.interact({ type: 'pet' }).error.code, 'away');
  L.core.destroy();
  for (const call of [() => L.core.setName('x'), () => L.core.feed(), () => L.core.notify('saved', null), () => L.core.open('corner'), () => L.core.room.save(), () => L.core.stroke.start(), () => L.core.toy.cancel(), () => L.core.setDisplay({ full: true }), () => L.core.start()]) {
    assert.deepEqual(call(), { ok: false, error: { code: 'destroyed', message: 'Питомец отключён.' } });
  }
});

test('reentrant: команда из порта (progress, clock) в фазе работы не выполняется, ничего не изменено; журнал не зацикливается', () => {
  const inner = [];
  const L = make({ initial: { cat: CAT } });
  L.counts = null;
  const store = L.store;
  const storage = createStorage({ namespace: 'reent', backend: store.backend });
  storage.load();
  let core = null;
  core = createPetCore({ storage, progress: () => (inner.push(core.setName('Изнутри')), { marks: 0, today: 0 }), log: { warn: () => inner.push(core.setName('Журнал')) } });
  const result = core.refresh();
  assert.equal(result.ok, true);
  assert.deepEqual(inner.map((item) => item.error?.code), ['reentrant']);
  assert.equal(core.getState().name.value, '');
  core.destroy();
});

test('changed честный: повтор того же значения — changed false, save none, снимок прежний, обновления нет', () => {
  const L = make({ initial: { cat: { ...CAT, name: 'Пух' } } });
  L.core.start();
  const before = state(L);
  const seen = L.seen.length;
  for (const result of [L.core.setName('Пух'), L.core.setName('  Пух '), L.core.setPreferences({ motion: 'normal' }), L.core.setPet('cat'), L.core.setAppearance({ coat: 'smoke' }), L.core.setPresence('always'), L.core.show(), L.core.close(), L.core.setContext({ timer: false })]) {
    assert.deepEqual([result.ok, result.changed, result.save], [true, false, { status: 'none', keys: [], results: {} }]);
  }
  assert.deepEqual([state(L) === before, L.seen.length - seen], [true, 0]);
});

test('notify: публичный saved требует непустой key и только известные поля; failed — без подробностей; null — только счёт; признак scene — не параметр', () => {
  const L = make({ initial: { cat: CAT }, counts: { marks: 0, today: 0 } });
  L.core.start();
  for (const detail of [undefined, {}, { key: '' }, { key: 5 }, { key: null }, { key: 'k', counted: 'да' }, { key: 'k', hard: 1 }, { key: 'k', first: null }, { key: 'k', extra: true }, 'k', ['k']]) {
    assert.equal(L.core.notify('saved', detail).error?.code, 'invalid-argument', JSON.stringify(detail));
  }
  assert.equal(L.core.notify('saved', { key: '' }, { scene: false }).error?.code, 'invalid-argument', 'внутренняя граница legacy (scene: false) публично не действует');
  for (const detail of [{}, { key: 'k' }, 'x', 0]) assert.equal(L.core.notify('failed', detail).error?.code, 'invalid-argument', JSON.stringify(detail));
  assert.deepEqual(Object.keys(L.core.notify('failed')).sort(), ['changed', 'ok', 'reacted', 'save']);
  assert.deepEqual(Object.keys(L.core.notify('failed', null)).sort(), ['changed', 'ok', 'reacted', 'save']);
  L.counts.marks = 1;
  L.counts.today = 1;
  const quiet = L.core.notify('saved', null);
  assert.deepEqual([quiet.ok, quiet.reacted, state(L).progress.marks], [true, false, 1], 'null — только счёт');
  const first = L.core.notify('saved', { key: 'lesson-1', counted: true, first: true });
  assert.deepEqual(Object.keys(first).sort(), ['celebrate', 'changed', 'duplicate', 'fresh', 'ok', 'reacted', 'save']);
  assert.deepEqual([first.reacted, first.duplicate, first.celebrate], [true, false, null]);
  const again = L.core.notify('saved', { key: 'lesson-1', counted: true });
  assert.deepEqual([again.reacted, again.duplicate], [true, true], 'повтор key — без реакции');
  L.counts.marks = 3;
  const stage = L.core.notify('saved', { key: 'lesson-3', counted: true });
  assert.equal(stage.celebrate, 1, 'новая ступень — праздник');
  assert.equal(L.json('cat').seenStage, 1);
  assert.ok(L.seen.at(-1).effects.some((effect) => effect.type === 'celebrate' && effect.stage === 1));
});

test('setName: готовое имя показанного питомца — отклик named и объявление «Имя: …»; своё — тихо; второй аргумент не параметр; очистка строки', () => {
  const L = make({ initial: { cat: CAT } });
  L.core.start();
  L.plan.advance(5000);
  const announce = () => L.seen.at(-1).effects.filter((effect) => effect.type === 'announce').map((effect) => effect.text);
  const own = L.core.setName('Барсик', { pick: true });
  assert.deepEqual([own.reacted, state(L).pose.reaction, announce()], [false, null, []], 'своё имя — тихо, pick не действует');
  const preset = L.core.setName('Пиксель');
  assert.deepEqual([preset.reacted, state(L).pose.reaction?.type, announce()], [true, 'named', ['Имя: Пиксель.']]);
  assert.deepEqual([L.core.setName(' <b>Сыр\u0007ник</b> ').ok, L.json('cat').name], [true, 'bСырник/b'], 'без управляющих символов и <>');
  assert.equal(state(L).name.chosen, true);
  assert.deepEqual([L.core.setName('').ok, state(L).name.value, state(L).name.chosen, state(L).name.display], [true, '', false, 'Марс'], "'' — «ещё не выбирали»");
  assert.equal(L.core.setName('Ш'.repeat(40)).ok, true);
  assert.equal(L.json('cat').name.length, 24);
  // Собака: готовые имена — свои.
  L.core.setPet('dog');
  L.plan.advance(7000);
  assert.deepEqual([L.core.setName('Пиксель').reacted, L.core.setName('Батон').reacted], [false, true]);
  // Спрятан — имя меняется тихо.
  L.core.hide();
  const hidden = L.core.setName('Тоби');
  assert.deepEqual([hidden.ok, hidden.reacted, L.json('companion').dog.name], [true, false, 'Тоби']);
});

test('SaveReport синхронно: успех и отказ в том же вызове (без pending), поля несохранённые, без скрытого повтора; partial двух ключей setAppearance', () => {
  const L = make({ initial: { cat: CAT }, counts: { marks: 30, today: 1 } });
  L.core.start();
  L.store.deny = /:cat:/;
  const failed = L.core.setName('Барсик');
  assert.deepEqual([failed.ok, failed.changed, failed.save], [true, true, { status: 'failed', keys: ['cat'], results: { cat: 'failed' } }]);
  assert.deepEqual([state(L).name.value, state(L).save.cat.status, state(L).save.cat.unsaved], ['Барсик', 'failed', ['name']], 'правка действует, не сохранена');
  const sets = L.store.writes().length;
  L.plan.advance(60_000);
  assert.equal(L.store.writes().length, sets, 'скрытых повторов нет');
  for (const update of L.seen) assert.notEqual(update.snapshot.save.cat.status, 'pending', 'синхронно pending не доставляется');
  // partial: облик (look) записан, аксессуар (cat) — нет.
  const both = L.core.setAppearance({ coat: 'ginger', accessory: 'plaid' });
  assert.deepEqual(both.save, { status: 'partial', keys: ['look', 'cat'], results: { look: 'saved', cat: 'failed' } });
  assert.deepEqual([L.json('look').cat, state(L).look.accessory, [...state(L).save.cat.unsaved].sort()], ['ginger', 'plaid', ['accessory', 'name']]);
  L.store.deny = null;
  const next = L.core.setPreferences({ phrases: false });
  assert.deepEqual([next.save.status, L.json('cat').name, L.json('cat').accessory, state(L).save.cat.status], ['saved', 'Барсик', 'plaid', 'saved'], 'несохранённое уходит со следующей правкой ключа');
});

test('SaveReport асинхронно: принятие в очередь — pending с done; done — итог (saved, failed, partial), никогда не отклоняется; старая операция не снимает pending новой', async () => {
  const store = asyncBackend();
  const L = make({ backend: store, counts: { marks: 30, today: 1 } });
  const loading = L.storage.load();
  await store.drain();
  assert.equal(await loading, 'ready');
  L.core = createPetCore(L.opts);
  L.core.subscribe((update) => L.seen.push(update), { initial: false });
  L.core.start();
  await store.drain();
  const first = L.core.setName('Барсик');
  assert.deepEqual([first.save.status, first.save.keys, first.save.results, first.save.done instanceof Promise], ['pending', ['cat'], { cat: 'pending' }, true]);
  const second = L.core.setPreferences({ motion: 'calm' });
  assert.equal(second.save.status, 'pending');
  await store.next(); // get cat (первая операция)
  await store.next(); // set cat
  assert.equal(await first.save.done, 'saved');
  assert.deepEqual([state(L).save.cat.status, state(L).save.cat.pending], ['pending', ['motion']], 'итог старой операции не снимает pending новой');
  await store.next(); // get cat (вторая)
  await store.next('fail'); // set cat — отказ
  assert.equal(await second.save.done, 'failed');
  assert.deepEqual([state(L).save.cat.status, state(L).save.cat.unsaved], ['failed', ['motion']]);
  assert.ok(L.seen.some((update) => update.reason === 'save' && update.effects.some((effect) => effect.type === 'save' && effect.result === 'failed')), 'поздний итог — обновление save с эффектом');
  const both = L.core.setAppearance({ coat: 'ginger', accessory: 'plaid' });
  assert.deepEqual([both.save.status, both.save.keys], ['pending', ['look', 'cat']]);
  // Очереди ключей независимы: look и cat. Подтвердить look, отклонить cat.
  const order = [];
  while (store.waiting.length) {
    const item = store.waiting[0];
    order.push(`${item.op} ${item.name.split(':')[1]}`);
    await store.next(item.op === 'set' && item.name.includes(':cat:') ? 'fail' : 'ok');
  }
  assert.equal(await both.save.done, 'partial');
  assert.deepEqual([state(L).look.coat, state(L).save.look.status, state(L).save.cat.status], ['ginger', 'saved', 'failed']);
  L.core.destroy();
});

test('done после destroy: операция в очереди выполняется, done — действительный итог; отключённое ядро не меняется и обновлений не шлёт; новое ядро после барьера видит записанное', async () => {
  const store = asyncBackend();
  const L = make({ backend: store });
  const loading = L.storage.load();
  await store.drain();
  await loading;
  L.core = createPetCore(L.opts);
  const seen = [];
  L.core.subscribe((update) => seen.push(update.reason), { initial: false });
  const named = L.core.setName('Барсик');
  L.core.destroy();
  const after = L.core.getState();
  assert.deepEqual([seen, after.status], [['setName', 'destroyed'], 'destroyed']);
  await store.drain();
  assert.equal(await named.save.done, 'saved');
  assert.deepEqual([seen, L.core.getState() === after], [['setName', 'destroyed'], true], 'после destroy — ни обновлений, ни изменений');
  const barrier = L.storage.load();
  await store.drain();
  assert.equal(await barrier, 'ready');
  const next = createPetCore(L.opts);
  assert.equal(next.getState().name.value, 'Барсик');
  next.destroy();
});

test('снимок: глубоко заморожен, простые данные без place и функций; та же ссылка без изменений, новая — при изменении; прежний не меняется; чужие объекты не замораживаются', () => {
  const L = make({ initial: { cat: CAT, place: { v: 1, phone: { place: 'top' } } }, counts: { marks: 3, today: 1 } });
  const counts = L.counts;
  L.core.start();
  const a = state(L);
  assert.equal('place' in a, false, 'внутреннее предпочтение места legacy не входит в публичный снимок');
  assert.deepEqual(Object.keys(a).sort(), ['context', 'display', 'look', 'name', 'pet', 'pets', 'phrase', 'play', 'pose', 'prefs', 'presence', 'progress', 'room', 'save', 'scene', 'scenePhrase', 'status', 'storage', 'treat', 'v', 'view', 'visible']);
  const frozen = (value) => value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(frozen));
  assert.equal(frozen(a), true, 'глубоко заморожен');
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'только простые данные');
  assert.throws(() => {
    'use strict';
    a.pets.cat.name.value = 'x';
  }, TypeError);
  assert.equal(state(L), a, 'без изменений — та же ссылка');
  L.core.activity();
  L.core.setName('Пух');
  const b = state(L);
  assert.notEqual(b, a);
  assert.deepEqual([a.name.value, b.name.value], ['', 'Пух'], 'прежний снимок прежний');
  const display = { views: ['corner'], playFloor: [-10, -10, 200, 230] };
  L.core.setDisplay(display);
  const detail = { key: 'k', counted: true };
  L.core.notify('saved', detail);
  assert.deepEqual([Object.isFrozen(display), Object.isFrozen(display.views), Object.isFrozen(detail), Object.isFrozen(counts)], [false, false, false, false], 'свои копии, а не чужие объекты');
  display.views.push('play');
  assert.deepEqual(state(L).display.views, ['corner'], 'изменение чужого объекта снимок не меняет');
});

test('подписка: начальная доставка синхронна (initial), initial: false — без неё; неверные настройки — журнал, подписки нет; обновление — замороженное, тот же снимок, что getState()', () => {
  const L = make({ initial: { cat: CAT } });
  const calls = [];
  L.core.subscribe((update) => calls.push(update));
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].reason, calls[0].effects, calls[0].snapshot === state(L), Object.isFrozen(calls[0]), Object.isFrozen(calls[0].effects)], ['initial', [], true, true, true]);
  const quiet = [];
  L.core.subscribe((update) => quiet.push(update.reason), { initial: false });
  assert.equal(quiet.length, 0);
  for (const options of [null, { initial: 'yes' }, { once: true }, 5]) {
    const got = [];
    const off = L.core.subscribe((update) => got.push(update), options);
    L.core.setName(`x${got.length}`);
    assert.deepEqual([typeof off, got.length], ['function', 0], JSON.stringify(options));
  }
  assert.ok(L.log.some((message) => message.includes('subscribe')));
  const off = L.core.subscribe('нет');
  assert.equal(typeof off, 'function');
  L.core.setName('Пух');
  const last = calls.at(-1);
  assert.deepEqual([last.reason, last.snapshot === state(L), Object.isFrozen(last), 'place' in last.snapshot], ['setName', true, true, false]);
});

test('раунд: одно обновление на ядро за фазу; автор первым, затем другие по порядку подключения; FIFO и порядок слушателей; команда из слушателя — сразу, её обновления — тем же раундом; getState в слушателе новее переданного', () => {
  const A = make({ initial: { cat: CAT } });
  const B = createPetCore(A.opts);
  const journal = [];
  A.core.subscribe((update) => journal.push(`A1 ${update.reason} ${update.snapshot.name.value}`), { initial: false });
  A.core.subscribe((update) => journal.push(`A2 ${update.reason}`), { initial: false });
  let inside = null;
  let newer = null;
  B.subscribe(
    (update) => {
      journal.push(`B ${update.reason} ${update.snapshot.name.value}`);
      if (update.snapshot.name.value === 'Барсик' && !inside) {
        inside = B.setName('Пиксель');
        newer = B.getState().name.value;
        journal.push(`B вызвал → ${inside.save.status}`);
      }
    },
    { initial: false },
  );
  const result = A.core.setName('Барсик');
  journal.push(`A вернул ${result.save.status}`);
  assert.deepEqual(journal, ['A1 setName Барсик', 'A2 setName', 'B storage Барсик', 'B вызвал → saved', 'B setName Пиксель', 'A1 storage Пиксель', 'A2 storage', 'A вернул saved']);
  assert.equal(newer, 'Пиксель', 'getState() внутри слушателя новее переданного снимка');
  // Одно обновление на ядро за фазу: setPet меняет питомца, позу и записывает — одно обновление.
  A.core.start();
  const count = A.seen.length;
  A.core.setPet('dog');
  assert.equal(A.seen.length - count, 1);
  B.destroy();
});

test('подписка во время доставки, немедленная отписка, исключение слушателя, destroy в доставке', () => {
  const L = make({ initial: { cat: CAT } });
  const journal = [];
  let offB = null;
  let late = null;
  L.core.subscribe(
    (update) => {
      journal.push(`A ${update.reason}`);
      if (update.reason === 'setName' && !late) {
        offB();
        late = L.core.subscribe((next) => journal.push(`C ${next.reason}`));
      }
    },
    { initial: false },
  );
  offB = L.core.subscribe((update) => journal.push(`B ${update.reason}`), { initial: false });
  L.core.setName('Пух');
  L.core.setName('Кекс');
  assert.deepEqual(journal, ['A setName', 'C initial', 'A setName', 'C setName'], 'отписанный не получает, подписанный в доставке — начальный и следующие');
  // Исключение слушателя: журнал, остальные получают, бросивший остаётся подписан.
  const M = make({ initial: { cat: CAT } });
  const got = [];
  M.core.subscribe(() => {
    throw new Error('слушатель');
  }, { initial: false });
  M.core.subscribe((update) => got.push(update.reason), { initial: false });
  assert.equal(M.core.setName('Пух').ok, true, 'исключение до хоста не доходит');
  M.core.setName('Кекс');
  assert.deepEqual([got, M.log.filter((message) => message.includes('подписчик')).length], [['setName', 'setName'], 2]);
  // destroy в доставке (§ 8.7.1, вариант 3б): P — автор, его обновление доставляется первым; слушатель P отключает N, у
  // которого в очереди ещё обновление storage, — оно снято, 'destroyed' встаёт в конец и доставляется всем слушателям N;
  // затем подписки N сняты. Подтверждённое не меняется: N его только поглощал.
  const N = make({ initial: { cat: CAT } });
  const P = createPetCore(N.opts);
  const order = [];
  N.core.subscribe((update) => order.push(`N1 ${update.reason}`), { initial: false });
  P.subscribe(
    (update) => {
      order.push(`P ${update.reason}`);
      if (update.reason === 'setName') order.push(`P → N.destroy ${String(N.core.destroy())}`);
    },
    { initial: false },
  );
  N.core.subscribe((update) => order.push(`N2 ${update.reason}`), { initial: false });
  assert.equal(P.setName('Пух').save.status, 'saved');
  assert.deepEqual(order, ['P setName', 'P → N.destroy undefined', 'N1 destroyed', 'N2 destroyed']);
  P.setName('Кекс');
  assert.deepEqual(order.slice(4), ['P setName', 'P → N.destroy undefined'], 'повторный destroy — ничего; слушатели N больше ничего не получают');
  assert.equal(N.json('cat').name, 'Кекс');
  P.destroy();
});

test('после destroy: getState — тот же замороженный снимок destroyed; subscribe с initial — один вызов destroyed, без initial — ничего; последнее обновление destroyed, затем подписки сняты', () => {
  const L = make({ initial: { cat: CAT } });
  const seen = [];
  L.core.subscribe((update) => seen.push(update.reason), { initial: false });
  L.core.destroy();
  assert.deepEqual(seen, ['destroyed']);
  const a = state(L);
  assert.deepEqual([a.status, state(L) === a, Object.isFrozen(a)], ['destroyed', true, true]);
  const once = [];
  const off = L.core.subscribe((update) => once.push([update.reason, update.snapshot === a]));
  const none = [];
  L.core.subscribe((update) => none.push(update), { initial: false });
  assert.deepEqual([once, none, typeof off], [[['destroyed', true]], [], 'function']);
  L.core.setName('Пух');
  assert.deepEqual(seen, ['destroyed'], 'больше ничего');
});

test('принятые гарантии через публичный вход: сверка перед решением (запись другой вкладки до команды), ручная отмена ждущей сценки кормлением, свой ID предмета, точка из двух конечных чисел, перенос предмета toy.*', async () => {
  // Сверка: другая вкладка уже угостила (запись мимо координатора, события нет) — кормление отказывает без записи.
  const L = make({ initial: { cat: CAT }, counts: { marks: 1, today: 1 } });
  L.core.start();
  L.store.data.set(L.name('treat'), JSON.stringify({ v: 1, fedDay: DAY }));
  const writes = L.store.writes().length;
  const fed = L.core.feed();
  assert.deepEqual([fed.error?.code, L.store.writes().length, state(L).treat], ['treat-fed', writes, 'fed'], 'решение по подтверждённому, обновление storage');
  // Ручная отмена: ждущая попытка сценки снята кормлением (окончательно).
  const days = new Map();
  const reserver = { calls: 0, reserve: (decide, show) => Promise.resolve().then(() => { reserver.calls += 1; const record = decide(days.get('d')); if (!record) return 'skip'; days.set('d', record); show(); return 'shown'; }) };
  const random = series();
  const S = make({ initial: { cat: CAT }, counts: { marks: 1, today: 1 }, random, scenes: reserver });
  S.core.setDisplay({ views: VIEWS, scenes: { cat: ['stretch', 'curl'], dog: ['fetch'] } });
  S.core.start();
  S.plan.advance(5000);
  // Порядок случайности 0.1.4: реплика, шанс сценки (< 0,25), вариант.
  random.push(0.5, 0.1, 0.5);
  S.core.notify('saved', { key: 'k1', counted: true });
  assert.notEqual(state(S).scene.waiting, null, 'попытка ждёт конца реакции события');
  S.core.feed();
  assert.equal(state(S).scene.waiting, null, 'кормление отменило попытку');
  S.plan.advance(30_000);
  await flush();
  assert.deepEqual([reserver.calls, days.size], [0, 0], 'день не занят');
  // Редактор: свой ID предмета, неверные точки — без порчи черновика.
  const R = make({ initial: { cat: CAT }, counts: { marks: 1, today: 1 } });
  R.core.setDisplay({ views: VIEWS, playFloor: FLOOR });
  R.core.start();
  assert.equal(R.core.open('room').ok, true);
  const draft = state(R).room.draft;
  for (const [call, code] of [
    [() => R.core.room.select('constructor'), 'unknown-id'],
    [() => R.core.room.move('__proto__', [10, 10]), 'unknown-id'],
    [() => R.core.room.move('bowl', new Array(2)), 'invalid-argument'],
    [() => R.core.room.drag('bowl', [Number.NaN, 230]), 'invalid-argument'],
    [() => R.core.room.move('bowl', [300]), 'invalid-argument'],
  ]) {
    assert.equal(call().error.code, code);
    assert.equal(state(R).room.draft, draft, 'черновик прежний');
  }
  assert.equal(R.core.room.move('bowl', [120, 230]).ok, true);
  const saved = R.core.room.save();
  assert.deepEqual([saved.ok, saved.closed, saved.text, saved.save.status, state(R).view.open, Object.keys(saved).sort()], [true, true, 'Расстановка сохранена.', 'saved', 'corner', ['changed', 'closed', 'fresh', 'ok', 'save', 'text']]);
  // «Поиграть»: перенос предмета toy.* — публичная граница жеста (решение PL05), неверная точка — отказ.
  assert.equal(R.core.open('play').ok, true);
  assert.equal(R.core.toy.drag('bowl', new Array(2)).error.code, 'invalid-argument');
  assert.equal(R.core.toy.drag('chair', [10, 10]).error.code, 'invalid-argument');
  const drag = R.core.toy.drag('bowl', [100, 214]);
  assert.deepEqual([drag.ok, state(R).play.drag?.toy], [true, 'bowl']);
  const drop = R.core.toy.drop();
  assert.deepEqual([drop.ok, Object.keys(drop).sort(), state(R).play.drag], [true, ['changed', 'ok', 'outcome', 'save', 'text'], null]);
  assert.equal(R.core.toy.cancel().changed, false, 'нет переноса — ничего');
  R.core.destroy();
});

test('«Сохранить» после позднего отказа при снова открытом редакторе — через публичный вход: честный pending, затем итог; повторов нет', async () => {
  const store = asyncBackend();
  const L = make({ backend: store, counts: { marks: 1, today: 1 } });
  const loading = L.storage.load();
  await store.drain();
  await loading;
  L.core = createPetCore(L.opts);
  L.core.setDisplay({ views: VIEWS });
  L.core.start();
  await store.drain();
  L.core.open('room');
  L.core.room.move('yarn', [60, 230]);
  const first = L.core.room.save();
  assert.deepEqual([first.save.status, first.closed, state(L).view.open], ['pending', true, 'corner']);
  L.core.open('room');
  await store.next(); // get room
  await store.next('fail'); // set room — поздний отказ
  assert.equal(await first.save.done, 'failed');
  const again = L.core.room.save();
  assert.deepEqual([again.save.status, again.save.keys], ['pending', ['room']], 'не «Расстановка не изменилась»');
  await store.drain();
  assert.equal(await again.save.done, 'saved');
  assert.deepEqual(JSON.parse(store.data.get(L.name('room'))).cat.yarn, { x: 60, y: 230 });
  L.core.destroy();
});

test('сбои через публичный вход: до применения — internal без правки и записи; после применения (отказ планировщика) — ok, degraded и warning internal; исключение журнала не ломает доставку', () => {
  const store = syncBackend();
  const storage = createStorage({ namespace: 'fault', backend: store.backend });
  storage.load();
  let boom = false;
  const warned = [];
  const core = createPetCore({
    storage,
    progress: () => {
      if (boom) throw new Error('progress сайта');
      return { marks: 1, today: 1 };
    },
    log: {
      warn: (message) => {
        warned.push(message);
        throw new Error('журнал сам отказал');
      },
    },
  });
  const seen = [];
  core.subscribe((update) => seen.push(update.reason), { initial: false });
  core.start();
  boom = true;
  const writes = store.writes().length;
  const before = core.getState();
  const fed = core.feed();
  assert.deepEqual([fed.ok, fed.error?.code, store.writes().length - writes, core.getState() === before], [false, 'internal', 0, true], 'сбой до применения — ничего не изменено');
  assert.ok(warned.some((message) => message.includes('feed')), 'журнал вызван, его исключение не вышло');
  boom = false;
  assert.equal(core.setName('Пух').ok, true, 'ядро работает дальше');
  core.destroy();
  // Отказ планировщика при запуске: изменение и запись остались — ok, degraded, warning internal в обновлении.
  const L = make({ initial: { cat: CAT } });
  const spare = createStorage({ namespace: 'fault2', backend: syncBackend().backend });
  spare.load();
  const broken = createPetCore({ ...L.opts, storage: spare, scheduler: { later: () => { throw new Error('нет таймеров'); } } });
  const updates = [];
  broken.subscribe((update) => updates.push(update), { initial: false });
  const started = broken.start();
  assert.deepEqual([started.ok, started.changed, started.degraded, broken.status], [true, true, true, 'running']);
  assert.ok(updates.at(-1).effects.some((effect) => effect.type === 'warning' && effect.code === 'internal'));
  assert.equal('degraded' in L.core.start(), false, 'без сбоя поля degraded нет');
  broken.destroy();
  L.core.destroy();
});

test('входы отображения публично: setVisible, setReducedMotion, activity, setDisplay — честный changed; объявление заменяет переданное и хранит прочее', () => {
  const L = make({ initial: { cat: CAT } });
  L.core.start();
  assert.deepEqual([L.core.setVisible(false).changed, L.core.setVisible(false).changed, state(L).visible], [true, false, false]);
  assert.equal(L.core.setVisible(true).changed, true);
  assert.deepEqual([L.core.setReducedMotion(true).changed, state(L).prefs.effectiveMotion, state(L).prefs.motion], [true, 'none', 'normal']);
  assert.equal(L.core.setReducedMotion(true).changed, false);
  assert.equal(L.core.activity().ok, true);
  assert.equal(L.core.setDisplay({ views: ['corner'], pets: ['cat'] }).changed, true);
  assert.equal(L.core.setDisplay({ full: false }).changed, true);
  assert.deepEqual([state(L).display.views, state(L).display.pets, state(L).display.full, state(L).display.scenes], [['corner'], ['cat'], false, null], 'непереданное сохранено; сценки не объявлены — ни одной');
  assert.equal(L.core.setPet('dog').error.code, 'unsupported', 'отображение собаку не рисует');
  assert.equal(L.core.open('play').error.code, 'unsupported', 'вид не объявлен');
  L.core.destroy();
});

// Объединения строк из pet/core.d.mts (export type X = 'a' | 'b' | Y;) — с подстановкой упомянутых типов.
async function declared() {
  const { readFile } = await import('node:fs/promises');
  const text = (await readFile(new URL('../pet/core.d.mts', import.meta.url), 'utf8')).replace(/\/\*\*[\s\S]*?\*\//g, '');
  const types = new Map([...text.matchAll(/^export type (\w+) =([\s\S]*?);$/gm)].map(([, name, body]) => [name, body]));
  const resolve = (name, seen = new Set()) => {
    if (seen.has(name) || !types.has(name)) return [];
    seen.add(name);
    const body = types.get(name);
    return [...[...body.matchAll(/'([^']*)'/g)].map((match) => match[1]), ...[...body.matchAll(/\b(Pet\w+)\b/g)].flatMap((match) => resolve(match[1], seen))];
  };
  return (name) => new Set(resolve(name));
}

test('типы соответствуют исполнению: позы, реакции, движения покоя, причины обновлений, эффекты, ключи, коды отказов и исходы «Поиграть» из сценариев — в объединениях pet/core.d.mts', async () => {
  const union = await declared();
  const seen = { pose: new Set(), reaction: new Set(), micro: new Set(), reason: new Set(), effect: new Set(), key: new Set(), code: new Set(), outcome: new Set(), toward: new Set(), quiet: new Set() };
  const take = (result) => {
    if (result && result.ok === false) seen.code.add(result.error.code);
    if (result?.outcome) seen.outcome.add(result.outcome);
    return result;
  };
  const days = new Map();
  const scenes = { reserve: (decide, show) => Promise.resolve().then(() => { const record = decide(days.get('d')); if (!record) return 'skip'; days.set('d', record); show(); return 'shown'; }) };
  const random = series([], 0.1);
  const L = make({ initial: { cat: CAT }, counts: { marks: 1, today: 1 }, random, scenes });
  L.core.subscribe((update) => {
    seen.reason.add(update.reason);
    const { pose, context } = update.snapshot;
    for (const value of [pose.base, pose.shown.page, pose.shown.play, pose.shown.room, pose.reaction?.pose]) if (value) seen.pose.add(value);
    if (pose.reaction) {
      seen.reaction.add(pose.reaction.type);
      seen.toward.add(pose.reaction.toward);
    }
    for (const reason of context.quiet) seen.quiet.add(reason);
    for (const effect of update.effects) {
      seen.effect.add(effect.type);
      if (effect.type === 'micro') seen.micro.add(effect.kind);
      if (effect.key) seen.key.add(effect.key);
    }
  });
  const core = L.core;
  core.setDisplay({ views: VIEWS, scenes: { cat: ['stretch', 'curl'], dog: ['fetch'] }, playFloor: FLOOR, playTouch: 2 });
  core.start();
  L.plan.advance(600_000);
  L.counts.marks = 3;
  take(core.notify('saved', { key: 'a', counted: true, first: true }));
  L.plan.advance(30_000);
  await flush();
  take(core.feed());
  take(core.feed());
  core.setContext({ timer: true, typing: true, dictation: true, dialog: true, focus: true });
  take(core.notify('failed'));
  core.setContext({ timer: false, typing: false, dictation: false, dialog: false, focus: false });
  L.plan.advance(30_000);
  L.counts.marks = 9;
  core.open('corner');
  core.open('play');
  L.plan.advance(10_000);
  const stroke = take(core.stroke.start());
  for (let i = 0; i < 5; i += 1) {
    take(core.stroke.step(stroke.id));
    L.plan.advance(1500);
  }
  core.stroke.end(stroke.id);
  take(core.stroke.step(stroke.id));
  for (const action of [{ type: 'paw' }, { type: 'bowl', to: 'near' }, { type: 'ball', to: 'roll' }, { type: 'bowl', to: 'home' }, { type: 'pet' }]) {
    L.plan.advance(2000);
    take(core.interact(action));
  }
  core.toy.drag('ball', [150, 214]);
  take(core.toy.drop({ roll: -40 }));
  core.open('room');
  take(core.room.select('sofa'));
  take(core.room.nudge('north'));
  core.room.move('bowl', [120, 230]);
  core.room.save();
  core.setPet('dog');
  L.plan.advance(10_000);
  core.setAppearance({ coat: 'spotted' });
  take(core.setAppearance({ accessory: 'badge' }));
  core.setPreferences({ motion: 'calm' });
  core.setReducedMotion(true);
  core.setVisible(false);
  core.setVisible(true);
  core.setPresence('on-call');
  take(core.feed());
  core.setPresence('always');
  core.hide();
  take(core.open('corner'));
  core.show();
  take(core.start());
  L.plan.advance(86_400_000);
  core.destroy();
  take(core.setName('x'));
  for (const [what, type] of [['pose', 'PetPose'], ['reaction', 'PetReactionType'], ['micro', 'PetMicro'], ['reason', 'PetUpdateReason'], ['key', 'PetStorageKey'], ['code', 'PetErrorKind'], ['outcome', 'PetOutcome'], ['quiet', 'PetQuietReason']]) {
    const allowed = union(type);
    assert.ok(allowed.size > 0, `${type} объявлен`);
    for (const value of seen[what]) assert.ok(allowed.has(value), `${what}: «${value}» нет в ${type}`);
  }
  for (const value of seen.toward) assert.ok(['', 'left', 'right'].includes(value), `toward: ${value}`);
  const effects = new Set([...(await import('node:fs/promises').then((fs) => fs.readFile(new URL('../pet/core.d.mts', import.meta.url), 'utf8'))).matchAll(/\{ readonly type: '([a-z]+)'/g)].map((match) => match[1]));
  for (const value of seen.effect) assert.ok(effects.has(value), `эффект ${value} не объявлен в PetEffect`);
  // Сценарий действительно прошёл по широкому кругу значений (а не пустые множества).
  assert.ok(seen.reason.size >= 20 && seen.pose.size >= 8 && seen.reaction.size >= 8 && seen.micro.size >= 2 && seen.code.size >= 6 && seen.effect.size >= 5, JSON.stringify(Object.fromEntries(Object.entries(seen).map(([key, set]) => [key, [...set]]))));
});
