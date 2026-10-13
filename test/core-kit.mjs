// Только проверки ядра (test/core*.test.mjs): поддельные хранилища — localStorage-подобное синхронное (веб-координатор с
// подменённым area и целью событий storage) и асинхронное с ручным подтверждением каждого чтения и записи; часы, счёт
// хоста, журнал, шпион подключений координатора. Данные синтетические.
import assert from 'node:assert/strict';
import { storageKeys } from '../pet/core/formats/legacy.mjs';
import { createPetCore } from '../pet/core/index.mjs';
import { createCoordinator } from '../pet/core/storage.mjs';
import { createWebStorage } from '../pet/web/storage.mjs';

export const DAY = '2026-10-13';
export const CORE_KEYS = ['cat', 'companion', 'look', 'treat', 'presence', 'scene'];
// Объявление legacy-отображения (PL04.2, docs/ARCHITECTURE.md § 11.1): питомцы, виды и сценки 0.1.4.
export const VIEWS = ['corner', 'play', 'room'];
export const LEGACY_DISPLAY = { pets: ['cat', 'dog'], views: VIEWS, scenes: { cat: ['stretch', 'curl'], dog: ['fetch'] } };

// Уголок показан и закрыт (смысл прежнего markSeen, PL04.2): виды объявлены, уголок открыт — новая ступень увидена ядром
// (open → fresh), затем закрыт. Результат — open.
export function corner(core) {
  core.setDisplay({ views: VIEWS });
  const result = core.open('corner');
  core.close();
  return result;
}
const text = (value) => (typeof value === 'string' ? value : JSON.stringify(value));

// localStorage-подобное хранилище: отказы — регулярные выражения ключей (denyGet, denySet); журнал операций — общий
// массив (порядок).
export function area(initial = {}, journal = null) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, text(value)]));
  const self = {
    data,
    writes: [],
    denyGet: null,
    denySet: null,
    getItem(key) {
      journal?.push(`getItem ${key}`);
      if (self.denyGet?.test(key)) throw new Error(`getItem ${key}: отказ проверки`);
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      journal?.push(`setItem ${key}`);
      self.writes.push(key);
      if (self.denySet?.test(key)) throw new Error(`setItem ${key}: переполнено (проверка)`);
      data.set(key, String(value));
    },
    raw: (key) => (data.has(key) ? data.get(key) : null),
    json: (key) => JSON.parse(data.get(key) ?? 'null'),
    // Запись «другой вкладки» мимо счётчика и журнала (событие storage — отдельно, tabs().fire).
    put: (key, value) => data.set(key, text(value)),
  };
  return self;
}

// Цель событий storage: fire(key) — событие другой вкладки (newValue не передаётся — координатор его не читает).
export function tabs() {
  const target = new EventTarget();
  return { target, fire: (key, extra = {}) => target.dispatchEvent(Object.assign(new Event('storage'), { key, ...extra })) };
}

let spaces = 0;
// Синхронный веб-координатор в своём пространстве имён (реестр общий — у каждой проверки свой area).
export function web(initial = {}, { journal = null, ns = `qa${++spaces}` } = {}) {
  const keys = storageKeys(ns);
  const store = area(Object.fromEntries(Object.entries(initial).map(([name, value]) => [keys[name], value])), journal);
  const events = tabs();
  const storage = createWebStorage({ namespace: ns, area: store, events: events.target });
  return { ns, keys, store, events, storage, json: (name) => store.json(keys[name]), raw: (name) => store.raw(keys[name]), put: (name, value) => store.put(keys[name], value) };
}

export const flush = () => new Promise((resolve) => setImmediate(resolve));

// Асинхронное хранилище с ручным подтверждением: каждое get и set ждёт в очереди ожидания, проверка отпускает их по одному:
// ok — подтвердить (set пишет в данные в этот момент), fail — отклонить обещание.
export function manual(initial = {}, journal = null) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, text(value)]));
  const waiting = [];
  const backend = {
    async: true,
    get: (key) =>
      new Promise((resolve, reject) => {
        journal?.push(`get ${key}`);
        waiting.push({ op: 'get', key, ok: () => resolve(data.has(key) ? data.get(key) : null), fail: () => reject(new Error(`get ${key}: отказ проверки`)) });
      }),
    set: (key, value) =>
      new Promise((resolve, reject) => {
        journal?.push(`set ${key}`);
        waiting.push({
          op: 'set',
          key,
          value,
          ok: () => {
            data.set(key, value);
            resolve();
          },
          fail: () => reject(new Error(`set ${key}: отказ проверки`)),
        });
      }),
  };
  const storage = createCoordinator({ keys: CORE_KEYS, backend });
  const self = {
    data,
    waiting,
    backend,
    storage,
    json: (key) => JSON.parse(data.get(key) ?? 'null'),
    // Отпустить первое ожидающее (ожидается op key), дать очереди продолжить.
    async next(op, key, how = 'ok') {
      const item = waiting.shift();
      assert.ok(item, `нет ожидающего ${op} ${key}`);
      assert.deepEqual([item.op, item.key], [op, key], 'порядок операций хранилища');
      item[how]();
      await flush();
      return item;
    },
    // Подтвердить всё ожидающее (и появляющееся следом), пока очередь не опустеет.
    async drain() {
      while (waiting.length) {
        waiting.shift().ok();
        await flush();
      }
    },
    async load() {
      const done = storage.load();
      await self.drain();
      return done;
    },
  };
  return self;
}

// Часы ядра: ручное время и день.
export function clock(day = DAY) {
  const state = { now: Date.parse(`${day}T10:00:00Z`), day, calls: 0 };
  return {
    state,
    port: {
      now: () => (state.calls++, state.now),
      day: () => (state.calls++, state.day),
      nextDay: (at) => at + 86_400_000,
    },
  };
}

// Счёт хоста: менять — host.set(marks, today).
export function host(marks = 0, today = 0, limit = 3) {
  const state = { marks, today, limit, calls: 0 };
  return {
    state,
    set(nextMarks, nextToday = state.today) {
      state.marks = nextMarks;
      state.today = nextToday;
    },
    progress: () => (state.calls++, { marks: state.marks, today: state.today, limit: state.limit }),
  };
}

export function journal() {
  const list = [];
  return { list, port: { warn: (message, error) => list.push(error === undefined ? message : `${message}: ${error?.message ?? error}`) } };
}

// Порты random и scheduler без хода времени: random — 0.5; планирование записывается (tasks — ещё не отменённые задачи,
// проверка может вызвать их сама). Проверки срезов PL03 и хранения: задачи PL04.1 там не срабатывают.
export function idle() {
  const calls = { random: 0, scheduler: 0 };
  const tasks = [];
  return {
    calls,
    tasks,
    random: () => (calls.random++, 0.5),
    scheduler: {
      later: (ms, task) => {
        calls.scheduler += 1;
        const run = () => task();
        tasks.push(run);
        return () => {
          const index = tasks.indexOf(run);
          if (index >= 0) tasks.splice(index, 1);
        };
      },
    },
  };
}

// Часы с местным днём (PL04.1): state.now — мс эпохи, state.offset — смещение местного времени от UTC в минутах (смена
// пояса или перевод часов — его изменение). day — местная дата момента, nextDay — начало следующего местного дня по
// текущему смещению (длина дня не предполагается: смещение могло смениться). calls — обращения к порту.
export function calendar(start = `${DAY}T10:00:00Z`, offset = 0) {
  const state = { now: Date.parse(start), offset, calls: 0 };
  const local = (at) => new Date(at + state.offset * 60_000);
  const day = (at) => local(at).toISOString().slice(0, 10);
  return {
    state,
    day,
    port: {
      now: () => (state.calls++, state.now),
      day: (at) => (state.calls++, day(at)),
      nextDay: (at) => {
        state.calls++;
        const next = Date.parse(`${day(at)}T00:00:00Z`) + 86_400_000 - state.offset * 60_000;
        return Math.max(next, at + 1000);
      },
    },
  };
}

// Ручной планировщик (PL04.1): задачи по моменту на часах time; advance(ms) — продвинуть время, срабатывают задачи до
// цели по порядку (момент, порядок постановки), каждая — в свой момент; jump(ms) — скачок часов без срабатываний (сон
// устройства, перевод часов). log — журнал «plan|cancel|run имя ms» при подписи задач (name — последняя метка, см.
// label), live() — запланированные и не отменённые.
export function planner(time) {
  const items = [];
  let order = 0;
  const self = {
    calls: 0,
    runs: 0,
    later(ms, task) {
      self.calls += 1;
      const item = { at: time.state.now + ms, ms, order: ++order, task, live: true };
      items.push(item);
      return () => {
        item.live = false;
      };
    },
    live: () => items.filter((item) => item.live).sort((a, b) => a.at - b.at || a.order - b.order),
    // Ближайшая задача: через сколько мс.
    nextIn: () => {
      const [next] = self.live();
      return next ? next.at - time.state.now : null;
    },
    advance(ms) {
      const target = time.state.now + ms;
      for (;;) {
        const [next] = self.live();
        if (!next || next.at > target) break;
        next.live = false;
        time.state.now = Math.max(time.state.now, next.at);
        self.runs += 1;
        next.task();
      }
      time.state.now = target;
    },
    jump(ms) {
      time.state.now += ms;
    },
    // Все задачи с отменёнными (all) — проверка может вызвать отменённую или устаревшую задачу сама.
    all: items,
    port: null,
  };
  self.port = { later: (ms, task) => self.later(ms, task) };
  return self;
}

// Заданная последовательность random — очередь: значения по порядку, затем fallback; push — следующие значения (после уже
// взятых); taken — сколько взято всего.
export function series(values = [], fallback = 0.5) {
  const queue = [...values];
  const state = { taken: 0 };
  return {
    state,
    port: () => {
      state.taken += 1;
      return queue.length ? queue.shift() : fallback;
    },
    push: (...more) => queue.push(...more),
  };
}

// Ядро с ручными портами; parts — { storage, host, clock, log, idle } (недостающее — по умолчанию проверки).
export function make(storage, { counts = host(), time = clock(), log = journal(), quiet = idle() } = {}) {
  const core = createPetCore({ storage, progress: counts.progress, clock: time.port, log: log.port, random: quiet.random, scheduler: quiet.scheduler });
  return { core, counts, time, log, quiet };
}

// Ядро PL04.1 с ручным временем: часы calendar, ручной планировщик, заданный random; журнал обновлений (seen) и эффектов.
// storage — уже загруженный координатор (по умолчанию — свой веб в отдельном пространстве с initial); scheduler(plan) —
// порт планировщика поверх ручного (например, отказывающий), по умолчанию — сам ручной. PL04.2: scenes — порт
// резервирования сценки (по умолчанию нет), display — объявление отображения до start (по умолчанию не объявлено).
export function life(initial = {}, { storage = null, counts = host(0, 0), time = calendar(), random = series(), log = journal(), scheduler = (plan) => plan.port, scenes = null, display = null } = {}) {
  const site = storage ? null : web(initial);
  if (site) assert.equal(site.storage.load(), 'ready');
  const plan = planner(time);
  const core = createPetCore({ storage: storage ?? site.storage, scenes, progress: counts.progress, clock: time.port, random: random.port, scheduler: scheduler(plan), log: log.port });
  const seen = [];
  core.subscribe((update) => seen.push(update), { initial: false });
  // Отображение подписывается, затем объявляет возможности (как legacy до start).
  if (display) assert.equal(core.setDisplay(display).ok, true);
  const effects = (type) => seen.flatMap((update) => update.effects.filter((effect) => !type || effect.type === type));
  return { ...(site ?? {}), core, counts, time, plan, random, log, seen, effects, state: () => core.getState() };
}

// ---------- резервирование дня сценки (PL04.2, docs/ARCHITECTURE.md § 9) ----------

// Хранилище дня для проверок: записи по пространствам имён (days: ns → запись как есть; нет ключа — записи нет) и очередь
// на пространство (как readwrite-транзакции IndexedDB: следующая попытка начинается после исхода предыдущей и видит её
// запись; очередь освобождается исходом, а не жизнью ядра).
export function sceneStore() {
  return { days: new Map(), tails: new Map() };
}

// Порт резервирования (§ 9.1) на sceneStore: reserve(decide, show) → Promise<'shown' | 'skip' | 'fail' | 'lost'>, никогда
// не отклоняется. mode — поведение, которое проверка меняет: hold — точки удержания без пауз ('enter' — до входа в участок,
// 'commit' — после постановки записи и начала показа), открывает их open(point); failEnter — блокировка не взята (fail до
// чтения); throwPut — постановка записи бросила (fail, показа нет); abort — запись откатилась после начала показа (lost).
// steps — журнал шагов (enter, read, decide, put, show, commit/abort и исход) для проверки порядка.
export function reserver(store = sceneStore(), ns = 'qa') {
  const mode = { hold: new Set(), failEnter: false, throwPut: false, abort: false };
  const calls = { reserve: 0, decide: 0, show: 0 };
  const steps = [];
  const waiting = [];
  const gate = (point) => (mode.hold.has(point) ? new Promise((open) => waiting.push({ point, open })) : null);
  const port = {
    reserve(decide, show) {
      calls.reserve += 1;
      const run = async () => {
        await gate('enter');
        steps.push('enter');
        if (mode.failEnter) return 'fail';
        const stored = store.days.has(ns) ? structuredClone(store.days.get(ns)) : undefined;
        steps.push('read');
        let record;
        try {
          calls.decide += 1;
          record = decide(stored);
          steps.push(record ? 'decide record' : 'decide null');
        } catch {
          steps.push('decide threw');
          return 'fail';
        }
        if (!record) return 'skip';
        let put;
        try {
          if (mode.throwPut) throw new Error('quota (проверка)');
          put = structuredClone(record);
          steps.push('put');
        } catch {
          return 'fail';
        }
        try {
          calls.show += 1;
          show();
          steps.push('show');
        } catch {
          steps.push('show threw');
          return 'lost';
        }
        await gate('commit');
        if (mode.abort) {
          steps.push('abort');
          return 'lost';
        }
        store.days.set(ns, put);
        steps.push('commit');
        return 'shown';
      };
      const before = store.tails.get(ns) ?? Promise.resolve();
      const result = before.then(run).catch(() => 'fail');
      store.tails.set(
        ns,
        result.then(() => {}),
      );
      return result.then((outcome) => (steps.push(`→ ${outcome}`), outcome));
    },
  };
  return {
    port,
    mode,
    calls,
    steps,
    waiting,
    // Открыть первую ожидающую точку point и дать очереди продолжить.
    async open(point) {
      const index = waiting.findIndex((item) => item.point === point);
      assert.ok(index >= 0, `нет ожидания ${point}`);
      waiting.splice(index, 1)[0].open();
      await flush();
    },
  };
}

// IndexedDB на память — по контракту браузера (для веб-адаптера pet/web/scenes.mjs без браузера): readwrite-транзакции
// одного хранилища идут строго по очереди (следующая начинается после конца предыдущей и видит её запись), события —
// асинхронно; транзакция завершается сама, когда запросов больше нет; исключение в обработчике или сорванная запись —
// откат, ничего не записано. Общая база для «вкладок»: tab({ name, gate }) — результат чтения этой вкладки отдаётся только
// после шлюза gate, а её транзакция всё это время открыта; started — чьи транзакции начались, по порядку. db — имя базы.
export function fakeIdb(db) {
  const data = new Map();
  const started = [];
  const turn = () => new Promise((resolve) => setImmediate(resolve));
  let created = false;
  let queue = Promise.resolve();
  const connection = (own) => ({
    createObjectStore: (store) => assert.equal(store, 'scene'),
    close() {},
    transaction(store, mode) {
      assert.deepEqual([store, mode], ['scene', 'readwrite']);
      const writes = new Map();
      let pending = 0;
      let failed = false;
      const tx = {
        abort() {
          failed = true;
        },
      };
      let begin;
      let end;
      const running = new Promise((resolve) => (begin = resolve));
      const ended = new Promise((resolve) => (end = resolve));
      queue = queue.then(() => {
        started.push(own.name);
        begin();
        return ended;
      });
      const settle = () =>
        turn().then(() => {
          if (pending) return;
          if (failed || (own.failPut && writes.size)) tx.onabort?.();
          else {
            for (const [key, value] of writes) data.set(key, value);
            tx.oncomplete?.();
          }
          end();
        });
      tx.objectStore = (name) => {
        assert.equal(name, 'scene');
        return {
          get(key) {
            const request = {};
            pending += 1;
            void running.then(async () => {
              if (own.gate) await own.gate;
              request.result = structuredClone(writes.has(key) ? writes.get(key) : data.get(key));
              try {
                request.onsuccess?.();
              } catch {
                failed = true;
              }
              pending -= 1;
              void settle();
            });
            return request;
          },
          put(value, key) {
            if (own.throwPut) throw new Error('QuotaExceededError');
            writes.set(key, structuredClone(value));
            return {};
          },
        };
      };
      return tx;
    },
  });
  return {
    data,
    started,
    tab: (own = {}) => ({
      open(name, version) {
        if (own.deny) throw new Error('SecurityError');
        assert.deepEqual([name, version], [db, 1]);
        const request = {};
        void turn().then(() => {
          if (own.openError) return request.onerror?.();
          request.result = connection(own);
          if (!created) {
            created = true;
            request.onupgradeneeded?.();
          }
          request.onsuccess?.();
        });
        return request;
      },
    }),
  };
}

// Слушатель с журналом: name — подпись; record(update) → строка журнала.
export function listen(core, list, name, record = (update) => `${update.reason}`) {
  return core.subscribe((update) => list.push(`deliver ${name} ${record(update)}`), { initial: false });
}

// Шпион координатора: журнал сверки перед командой, постановки, settle, поглощения; имена подключений — по порядку connect.
export function spy(storage, list, names = []) {
  let index = 0;
  return {
    get status() {
      return storage.status;
    },
    load: () => storage.load(),
    connect() {
      const client = storage.connect();
      const who = names[index++] ?? client.id;
      list.push(`connect ${who}`);
      return {
        id: client.id,
        order: client.order,
        read: (key) => client.read(key),
        write(key, build, settle) {
          list.push(`write ${who} ${key}`);
          const how = client.write(key, build, (ok) => {
            list.push(`settle ${who} ${ok}`);
            settle(ok);
          });
          list.push(`${how} ${who}`);
          return how;
        },
        sync(keys) {
          list.push(`sync ${who}`);
          client.sync(keys);
        },
        peek: (key) => client.peek(key),
        watch: (absorb) =>
          client.watch((key, old, now) => {
            list.push(`absorb ${who} ${key}`);
            absorb(key, old, now);
          }),
        close: () => client.close(),
      };
    },
  };
}
