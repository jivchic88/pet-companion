// Только проверки (test/native-*.test.mjs): SQLite для адаптера pet/storage/sqlite.mjs без expo-sqlite — узкий драйвер с теми
// методами базы expo-sqlite, которые использует адаптер (databasePath, execAsync, getFirstAsync, runAsync,
// isInTransactionAsync, closeAsync), на настоящем node:sqlite. Каждое соединение — свой поток (test/sqlite-worker.mjs) и свой
// DatabaseSync: блокировки, busy_timeout, режим журнала и откат — сам SQLite, ожидание одного соединения не останавливает
// другие. Лаборатория lab(): временная папка; open — открытие соединения записи для адаптера (как openDatabaseAsync с
// useNewConnection); other — независимое соединение «другого процесса» к тому же файлу; журнал запросов (journal: «кто
// операция SQL»); шлюзы hold — удержать подходящий запрос до release (без пауз); fail — инъекция отказа метода драйвера
// (исключение вместо запроса: это не настоящая ошибка SQLite, закрытие с отказом оставляет соединение открытым). Настоящие
// отказы SQLite воспроизводят сами проверки: занятый файл, SQLITE_FULL по max_page_count, RAISE в триггере, COMMIT при
// читателе в режиме журнала DELETE.
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const WORKER = fileURLToPath(new URL('./sqlite-worker.mjs', import.meta.url));

// Совпадение запроса: функция ({ who, op, sql }) → boolean, регулярное выражение по SQL или строка — начало SQL.
const matcher = (match) => (typeof match === 'function' ? match : match instanceof RegExp ? ({ sql }) => match.test(sql ?? '') : ({ sql }) => (sql ?? '').startsWith(match));
const brief = (sql) => (sql ?? '').replace(/\s+/g, ' ').trim();

export async function lab({ prefix = 'pet-sqlite-' } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  const workers = new Set();
  const journal = [];
  const holds = [];
  const faults = [];
  const counts = { w: 0, o: 0 };
  const self = {
    dir,
    journal,
    // Соединения, открытые адаптером (по порядку): w1, w2 — после сброса.
    writers: [],
    // Вызывается после открытия каждого соединения записи адаптера (например, PRAGMA max_page_count) — до запросов адаптера.
    onOpen: null,
    file: (name = 'pet.db') => path.join(dir, name),
    // Функция открытия для адаптера: новое соединение на каждый вызов.
    open: async (file) => {
      // Папку файла создаёт открытие, как ensureDatabasePathExistsAsync в expo-sqlite.
      await mkdir(path.dirname(file), { recursive: true });
      const db = connection(file, `w${++counts.w}`);
      self.writers.push(db);
      if (self.onOpen) await self.onOpen(db);
      return db;
    },
    other: (file) => connection(file, `o${++counts.o}`),
    // Удержать первый подходящий запрос (match, who — подпись соединения или её начало: 'w' — любое соединение записи).
    // reached — запрос дошёл до шлюза; release() — выполнить.
    hold(match, { who = '' } = {}) {
      let release;
      let reached;
      const gate = { test: matcher(match), who, open: new Promise((resolve) => (release = resolve)), arrived: new Promise((resolve) => (reached = resolve)) };
      gate.reach = reached;
      holds.push(gate);
      return { reached: gate.arrived, release: () => release() };
    },
    // Отказ метода драйвера: times подходящих вызовов бросают Error(message); op — 'exec' | 'get' | 'run' | 'inTx' | 'close'.
    // skip — сколько первых подходящих вызовов выполнить как обычно.
    fail(match, { who = '', op = null, times = 1, skip = 0, message = 'инъекция отказа драйвера' } = {}) {
      const fault = { test: matcher(match), who, op, left: times, skip, message, hits: 0 };
      faults.push(fault);
      return fault;
    },
    // Сколько запросов соединения записи адаптера выполнено (для проверки «без запросов»).
    count: (pattern) => journal.filter((line) => pattern.test(line)).length,
    async close() {
      await Promise.all([...workers].map((worker) => worker.terminate()));
      workers.clear();
    },
  };

  function connection(file, who) {
    const worker = new Worker(WORKER, { workerData: { path: file } });
    workers.add(worker);
    const waiting = new Map();
    let ids = 0;
    worker.on('message', ({ id, ok, value, error }) => {
      const call = waiting.get(id);
      waiting.delete(id);
      if (ok) call.resolve(value);
      else call.reject(Object.assign(new Error(error.message), { code: error.code, errcode: error.errcode, errstr: error.errstr }));
    });
    // Поток упал (файл не открылся): ожидающие и следующие запросы отказывают, а не висят.
    let broken = null;
    const fall = (error) => {
      broken = error;
      for (const call of waiting.values()) call.reject(error);
      waiting.clear();
    };
    worker.on('error', fall);
    worker.on('exit', () => fall(broken ?? new Error('поток соединения завершён')));
    let closed = false;
    async function send(op, sql, params) {
      const call = { who, op, sql, params };
      const gate = holds.find((item) => (!item.who || who.startsWith(item.who)) && item.test(call));
      if (gate) {
        holds.splice(holds.indexOf(gate), 1);
        gate.reach();
        await gate.open;
      }
      let fault = faults.find((item) => item.left > 0 && (!item.who || who.startsWith(item.who)) && (!item.op || item.op === op) && item.test(call));
      if (fault?.skip > 0) {
        fault.skip -= 1;
        fault = null;
      }
      journal.push(`${who} ${op}${sql ? ` ${brief(sql)}` : ''}${params?.length ? ` [${params.slice(0, 2).join(', ')}]` : ''}${fault ? ' ✗' : ''}`);
      if (fault) {
        fault.left -= 1;
        fault.hits += 1;
        throw new Error(fault.message);
      }
      if (closed) throw new Error('соединение закрыто');
      if (broken) throw broken;
      return new Promise((resolve, reject) => {
        const id = ++ids;
        waiting.set(id, { resolve, reject });
        worker.postMessage({ id, op, sql, params });
      });
    }
    return {
      who,
      databasePath: file,
      execAsync: (sql) => send('exec', sql).then(() => undefined),
      getFirstAsync: (sql, params = []) => send('get', sql, params),
      runAsync: (sql, params = []) => send('run', sql, params),
      isInTransactionAsync: () => send('inTx', ''),
      async closeAsync() {
        await send('close', '');
        closed = true;
        workers.delete(worker);
        await worker.terminate();
      },
    };
  }
  return self;
}

// Всё, что уже поставлено в потоки и очередь микрозадач, выполнено: несколько оборотов цикла событий (без таймеров ожидания).
export async function settle(times = 20) {
  for (let i = 0; i < times; i += 1) await new Promise((resolve) => setImmediate(resolve));
}
