// Только проверки ядра (test/core*.test.mjs): поддельные хранилища — localStorage-подобное синхронное (веб-координатор с
// подменённым area и целью событий storage) и асинхронное с ручным подтверждением каждого чтения и записи; часы, счёт
// хоста, журнал, шпион подключений координатора. Данные синтетические.
import assert from 'node:assert/strict';
import { storageKeys } from '../pet/core/formats/legacy.mjs';
import { createPetCore } from '../pet/core/index.mjs';
import { createCoordinator } from '../pet/core/storage.mjs';
import { createWebStorage } from '../pet/web/storage.mjs';

export const DAY = '2026-10-13';
export const CORE_KEYS = ['cat', 'companion', 'look', 'treat'];
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

// Порты, которые срез PL03 вызывать не должен (реакций, покоя и полуночи в ядре ещё нет).
export function idle() {
  const calls = { random: 0, scheduler: 0 };
  return {
    calls,
    random: () => (calls.random++, 0.5),
    scheduler: {
      later: () => {
        calls.scheduler += 1;
        return () => {};
      },
    },
  };
}

// Ядро с ручными портами; parts — { storage, host, clock, log, idle } (недостающее — по умолчанию проверки).
export function make(storage, { counts = host(), time = clock(), log = journal(), quiet = idle() } = {}) {
  const core = createPetCore({ storage, progress: counts.progress, clock: time.port, log: log.port, random: quiet.random, scheduler: quiet.scheduler });
  return { core, counts, time, log, quiet };
}

// Слушатель с журналом: name — подпись; record(update) → строка журнала.
export function listen(core, list, name, record = (update) => `${update.reason}`) {
  return core.subscribe((update) => list.push(`deliver ${name} ${record(update)}`), { initial: false });
}

// Шпион координатора: журнал постановки, settle, поглощения; имена подключений — по порядку connect.
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
