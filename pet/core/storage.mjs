// Ядро: общий координатор хранения и подключения ядер (docs/ARCHITECTURE.md § 8.1–8.6, § 8.8). Координатор — один на
// хранилище и пространство имён (shared): кэш подтверждённого, очередь операций каждого ключа (общая для всех
// подключений), реестр открытых подключений. Подключение (connect) — одно на экземпляр ядра: идентичность автора операций
// и поглощение чужих изменений (watch). Операция ключа: свежее чтение внутри участка → build(current) → запись или её
// отсутствие → фиксация (сверка кэша с прочитанным, своя запись, settle автора) → следующая операция того же ключа.
// Платформенная часть — backend { async, get(key), set(key, text) }: синхронный (веб, localStorage) выполняет операцию и
// фиксацию в том же вызове write; асинхронный — обещаниями, фиксация — отдельным раундом (в серии — тестовый механизм с
// ручным подтверждением; SQLite — этап PL09).

import { nextOrder, run } from './round.mjs';

const registry = new WeakMap();

// Общий координатор: для одного хранилища (store — его идентичность) и namespace — один и тот же объект этой копии модуля.
export function shared(store, namespace, make) {
  let spaces = registry.get(store);
  if (!spaces) registry.set(store, (spaces = new Map()));
  if (!spaces.has(namespace)) spaces.set(namespace, make());
  return spaces.get(namespace);
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

  // Изменение помимо координатора (веб — событие storage другой вкладки): newValue не используется — свежее чтение и
  // сверка; key === null — все ключи пространства. Запоздалое событие после сверки ничего не меняет.
  function external(key) {
    const list = key === null ? keys : queues.has(key) ? [key] : [];
    if (!list.length) return;
    const each = () => {
      for (const name of list) enqueue(name, check(() => {}));
    };
    if (backend.async) each();
    else run(null, each);
  }

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
