// Ядро: общий координатор хранения и подключения ядер (docs/ARCHITECTURE.md § 8.1–8.6, § 8.8). Координатор — один на
// хранилище и пространство имён (shared): кэш подтверждённого, очередь операций каждого ключа (общая для всех
// подключений), реестр открытых подключений. Подключение (connect) — одно на экземпляр ядра: идентичность автора операций,
// поглощение чужих изменений (watch) и сверка перед решением команды (sync). Операция ключа: свежее чтение внутри
// участка → build(current) → запись или её отсутствие → фиксация (сверка кэша с прочитанным, своя запись, settle автора) →
// следующая операция того же ключа.
// Платформенная часть — backend { async, get(key), set(key, text) }: синхронный (веб, localStorage) выполняет операцию и
// фиксацию в том же вызове write; асинхронный — обещаниями, фиксация — отдельным раундом (тестовый механизм с ручным
// подтверждением, хранилище интегратора createStorage). [PL09] Асинхронная платформа может вместо пары get/set выполнять
// весь участок сама — transact(key, plan): блокировка записи до чтения, чтение, plan(current) синхронно, запись или её
// отсутствие, подтверждение (SQLite: BEGIN IMMEDIATE → SELECT → plan → INSERT/COMMIT либо ROLLBACK, pet/storage/sqlite.mjs).
// Это внутренняя возможность адаптера, не публичного backend: очередь, кэш, сверка, фиксация и settle — те же.

import { PetError } from './errors.mjs';
import { isRecord, STORAGE_NAMES, storageKeys } from './formats/legacy.mjs';
import { nextOrder, run } from './round.mjs';

const registry = new WeakMap();

// Общий координатор: для одного хранилища (store — его идентичность) и namespace — один и тот же объект этой копии модуля.
export function shared(store, namespace, make) {
  let spaces = registry.get(store);
  if (!spaces) registry.set(store, (spaces = new Map()));
  if (!spaces.has(namespace)) spaces.set(namespace, make());
  return spaces.get(namespace);
}

// ---------- публичный координатор (вход pet-companion/core, PL05; веб — pet-companion/web, PL07) ----------
// createStorage — общий координатор над хранилищем ключ-значение интегратора (Node, своё приложение, страница без
// mountPet): та же реализация, что у веба (очередь ключа, кэш, барьер load, подключения ядер, раунд), только платформенная
// часть — его backend. Наружу — непрозрачный объект { status, load() }: подключения создаёт само ядро (createPetCore),
// интегратор их не видит (docs/ARCHITECTURE.md § 8.1, § 14.1.5). Внутренний координатор — по объекту (coordinatorOf).
// Публичный фасад — один на внутренний координатор (publicStorage): веб-координатор createWebStorage входа /web (PL07) —
// тот же внутренний объект, что у mountPet и mountPetIn с тем же namespace (одна очередь ключа и реестр подключений),
// второго координатора для публичного пути нет.
const coordinators = new WeakMap();
const facades = new WeakMap();
export const coordinatorOf = (value) => ((value && typeof value === 'object') || typeof value === 'function' ? (coordinators.get(value) ?? null) : null);

// Непрозрачный фасад { status, load() } внутреннего координатора: тот же объект для того же координатора; публичный
// createPetCore этой копии модуля его принимает (coordinatorOf).
export function publicStorage(coordinator) {
  let facade = facades.get(coordinator);
  if (!facade) {
    facade = Object.freeze({
      get status() {
        return coordinator.status;
      },
      load: () => coordinator.load(),
    });
    facades.set(coordinator, facade);
    coordinators.set(facade, coordinator);
  }
  return facade;
}

const STORAGE_OPTIONS = ['backend', 'namespace'];
const thenable = (value) => Boolean(value) && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function';
// Значение хранилища — строка или «нет значения» (null, undefined); иное — отказ чтения, а не String(value).
function stored(value, what) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  throw new Error(`${what} вернул не строку`);
}

// backend — { async?: boolean, get(name), set(name, text) }; name — полное имя ключа «<namespace>:<ключ>:v1» (те же имена и
// форматы v1, что у веба). Синхронный (async не задан или false): get и set выполняются в том же вызове; обещание от них —
// отказ операции (для обещаний нужен async: true), без необработанных отклонений. Асинхронный: get и set — обещания;
// отказ (исключение или отклонённое обещание) — отказ операции этого ключа. Тот же backend и namespace — тот же
// координатор. Ошибка настроек — PetError invalid-options до создания.
export function createStorage(options) {
  if (!isRecord(options)) throw new PetError('invalid-options', 'Настройки хранилища — объект { backend, namespace? }.');
  for (const key of Object.keys(options)) if (!STORAGE_OPTIONS.includes(key)) throw new PetError('invalid-options', `Неизвестная настройка хранилища: ${key}.`);
  const { backend, namespace = 'pet' } = options;
  if (typeof namespace !== 'string' || !namespace) throw new PetError('invalid-options', 'namespace — непустая строка.');
  if (!backend || (typeof backend !== 'object' && typeof backend !== 'function') || typeof backend.get !== 'function' || typeof backend.set !== 'function') throw new PetError('invalid-options', 'backend — объект с get(name) и set(name, text).');
  if (backend.async !== undefined && typeof backend.async !== 'boolean') throw new PetError('invalid-options', 'backend.async — boolean.');
  return shared(backend, namespace, () => {
    const names = storageKeys(namespace);
    const async = backend.async === true;
    const platform = async
      ? {
          async: true,
          get: async (key) => stored(await backend.get(names[key]), 'backend.get'),
          set: async (key, value) => {
            await backend.set(names[key], value);
          },
        }
      : {
          async: false,
          get: (key) => {
            const value = backend.get(names[key]);
            if (thenable(value)) {
              value.then(undefined, () => {});
              throw new Error('backend.get вернул обещание — для асинхронного хранилища нужен async: true');
            }
            return stored(value, 'backend.get');
          },
          set: (key, value) => {
            const done = backend.set(names[key], value);
            if (thenable(done)) {
              done.then(undefined, () => {});
              throw new Error('backend.set вернул обещание — для асинхронного хранилища нужен async: true');
            }
          },
        };
    return publicStorage(createCoordinator({ keys: STORAGE_NAMES, backend: platform }));
  });
}

const text = (value) => (value === null || value === undefined ? null : String(value));

// keys — ключи пространства имён (загрузка читает все); opened / closed — первое подключение открыто, последнее закрыто
// (веб вешает и снимает слушатель storage).
export function createCoordinator({ keys, backend, opened = () => {}, closed = () => {} }) {
  const cache = new Map();
  const queues = new Map(keys.map((key) => [key, []]));
  const clients = []; // открытые подключения в порядке подключения
  let status = 'idle';
  let ids = 0;

  // Поглощение изменения открытыми подключениями (кроме except), в порядке подключения; только пересчёт памяти ядра.
  function absorbAll(key, old, now, except) {
    for (const client of [...clients]) if (client !== except && !client.offline && client.absorb) client.absorb(key, old, now);
  }

  // Шаг 4а: прочитанное внутри участка уже подтверждено; изменилось помимо координатора (другая вкладка, процесс,
  // запись с неизвестным исходом) — кэш и поглощение всеми открытыми подключениями, включая автора текущей операции.
  function reconcile(key, current) {
    const known = cache.has(key);
    const old = known ? cache.get(key) : null;
    if (known && old === current) return;
    cache.set(key, current);
    if (old !== current) absorbAll(key, old, current, null);
  }

  // Шаг 4 — фиксация: синхронно, только код библиотеки (кэш, поглощение, settle). Слушатели — позже, в доставке раунда.
  function fix(key, op, outcome) {
    if (outcome.read) reconcile(key, outcome.current);
    if (outcome.wrote) {
      cache.set(key, outcome.next);
      absorbAll(key, outcome.current, outcome.next, op.client);
    }
    op.settle(outcome.ok);
  }

  // Шаги 1–3. Отказ чтения — без сверки; исключение build, отказ записи — сверка по прочитанному всё равно.
  function step(key, op) {
    let current;
    try {
      current = text(backend.get(key));
    } catch {
      return { read: false, ok: false };
    }
    return attempt(op, current, (next) => backend.set(key, next));
  }

  async function stepAsync(key, op) {
    if (backend.transact) return transactAsync(key, op);
    let current;
    try {
      current = text(await backend.get(key));
    } catch {
      return { read: false, ok: false };
    }
    const plan = attempt(op, current, null);
    if (!plan.pending) return plan;
    try {
      await backend.set(key, plan.next);
      return { read: true, current, next: plan.next, wrote: true, ok: true };
    } catch {
      return { read: true, current, ok: false };
    }
  }

  // [PL09] Участок целиком у платформы (§ 8.3, § 8.10): plan(current) она вызывает ровно один раз — после своего чтения
  // внутри блокировки записи — и получает строку для записи либо null (писать нечего или build отказал); итог
  // transact — true, только если поставленная запись подтверждена (COMMIT). Решение об исходе — здесь, тем же attempt, что
  // у пары get/set: plan не вызван — ничего не прочитано (без сверки, отказ); без записи — подтверждено прочитанным даже при
  // ошибке завершения транзакции (успех), а исключение build — отказ; запись — успех только с подтверждением. Прочитанное
  // сверяется при любом исходе. Отклонение transact — как false.
  async function transactAsync(key, op) {
    let plan = null;
    let current = null;
    let committed = false;
    try {
      committed =
        (await backend.transact(key, (value) => {
          if (plan) throw new Error('участок вызвал plan повторно');
          current = text(value);
          plan = attempt(op, current, null);
          return plan.pending ? plan.next : null;
        })) === true;
    } catch {
      committed = false;
    }
    if (!plan) return { read: false, ok: false };
    if (!plan.pending) return plan;
    return committed ? { read: true, current, next: plan.next, wrote: true, ok: true } : { read: true, current, ok: false };
  }

  // build — сразу после чтения; next === current — писать нечего, подтверждено прочитанным (§ 8.3, шаг 3).
  function attempt(op, current, set) {
    let next;
    try {
      next = op.build(current);
    } catch {
      return { read: true, current, ok: false };
    }
    if (next === current) return { read: true, current, ok: true };
    if (typeof next !== 'string') return { read: true, current, ok: false };
    if (!set) return { pending: true, next };
    try {
      set(next);
    } catch {
      return { read: true, current, ok: false };
    }
    return { read: true, current, next, wrote: true, ok: true };
  }

  function enqueue(key, op) {
    const queue = queues.get(key);
    queue.push(op);
    if (queue.length === 1) drain(key);
  }

  // Операции ключа — строго по порядку постановки, по одной; очередь освобождается результатом операции, а не жизнью автора.
  function drain(key) {
    const queue = queues.get(key);
    while (queue.length) {
      const op = queue[0];
      if (!backend.async) {
        const outcome = step(key, op);
        run(op.author, () => fix(key, op, outcome));
        queue.shift();
        continue;
      }
      stepAsync(key, op).then((outcome) => {
        try {
          run(op.author, () => fix(key, op, outcome));
        } finally {
          queue.shift();
          drain(key);
        }
      });
      return;
    }
  }

  // Операция без изменения: сверка ключа со свежим чтением (барьер load, событие другой вкладки).
  const check = (done) => ({ build: (current) => current, settle: done, client: null, author: null });

  // Первая загрузка читает все ключи пространства в кэш; следующая — барьер: операции, стоявшие в очередях, разрешены, кэш
  // сверен со свежим чтением, ничего не пишется. Отказ чтения любого ключа — 'failed': новые подключения работают без записи.
  function load() {
    status = 'loading';
    if (!backend.async) {
      run(null, () => {
        let ok = true;
        for (const key of keys) enqueue(key, check((good) => (ok = ok && good)));
        status = ok ? 'ready' : 'failed';
      });
      return status;
    }
    const all = keys.map((key) => new Promise((resolve) => enqueue(key, check(resolve))));
    return Promise.all(all).then((results) => (status = results.every(Boolean) ? 'ready' : 'failed'));
  }

  // Сверка ключей свежим чтением через их очереди, без записи: изменённое помимо координатора становится подтверждённым и
  // поглощается всеми открытыми подключениями (шаг 4а). Синхронный — своей фазой работы, в том же вызове.
  function verify(list) {
    const own = list.filter((key) => queues.has(key));
    if (!own.length) return;
    const each = () => {
      for (const name of own) enqueue(name, check(() => {}));
    };
    if (backend.async) each();
    else run(null, each);
  }

  // Изменение помимо координатора (веб — событие storage другой вкладки): newValue не используется — свежее чтение и
  // сверка; key === null — все ключи пространства. Запоздалое событие после сверки ничего не меняет.
  const external = (key) => verify(key === null ? keys : [key]);

  function connect() {
    // Подключение при отказе загрузки — без записей и чтения хранилища до следующего подключения (§ 8.2).
    const client = { id: `c${++ids}`, order: nextOrder(), offline: status !== 'ready', open: true, absorb: null };
    clients.push(client);
    if (clients.length === 1) opened();
    return Object.freeze({
      id: client.id,
      order: client.order,
      read: (key) => (client.offline || !cache.has(key) ? null : cache.get(key)),
      // settle — ровно один раз и только внутри фиксации; 'settled' — уже вызван до возврата.
      write(key, build, settle) {
        let once = false;
        const op = {
          build,
          client,
          author: client.order,
          settled: false,
          settle(ok) {
            if (once) return;
            once = true;
            op.settled = true;
            settle(ok);
          },
        };
        if (!client.open || client.offline || !queues.has(key)) {
          op.settle(false);
          return 'settled';
        }
        if (backend.async) enqueue(key, op);
        else run(client.order, () => enqueue(key, op));
        return op.settled ? 'settled' : 'queued';
      },
      // Сверка перед решением команды ядра (§ 5.5, шаг 1а): синхронный координатор перечитывает ключи в том же вызове —
      // изменение другой вкладки, чьё событие storage ещё не пришло, или восстановление на этой странице поглощают все
      // открытые подключения, включая это, как событие storage. Отказ чтения — кэш прежний (не «пусто»), записи нет.
      // Асинхронный синхронного чтения не имеет — ничего: решение по подтверждённому в процессе (§ 8.9). Закрытое и
      // созданное при отказе загрузки — ничего не читают.
      sync(list) {
        if (!backend.async && client.open && !client.offline) verify(list);
      },
      // [PL04.2] Свежее значение ключа для решения вне раунда (резервирование сценки, § 9.2, шаг 3): синхронный координатор
      // читает хранилище сейчас — без фиксации, поглощения и слушателей (кэш сверит следующая операция или сверка этого
      // ключа); асинхронный синхронного чтения не имеет — подтверждённое (кэш, § 8.9). Отказ чтения — исключение.
      // Закрытое и созданное при отказе загрузки подключения хранилище не читают.
      peek(key) {
        if (!client.open || client.offline || !queues.has(key) || backend.async) return client.offline || !cache.has(key) ? null : cache.get(key);
        return text(backend.get(key));
      },
      watch(absorb) {
        client.absorb = absorb;
        return () => {
          if (client.absorb === absorb) client.absorb = null;
        };
      },
      // Поставленные операции не отменяются: выполняются очередью, settle закрытого только разрешает его результат.
      close() {
        if (!client.open) return;
        client.open = false;
        client.absorb = null;
        clients.splice(clients.indexOf(client), 1);
        if (!clients.length) closed();
      },
    });
  }

  return Object.freeze({
    get status() {
      return status;
    },
    load,
    connect,
    external,
  });
}
