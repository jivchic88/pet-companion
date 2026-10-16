// Только проверки мобильного слоя (test/native-*.test.mjs): стенды хранения с одинаковым интерфейсом для общих смысловых
// сценариев — асинхронное хранилище координатора (get/set обещаниями, как createStorage({ backend: { async: true } })) и
// настоящий SQLite (pet/storage/sqlite.mjs на node:sqlite через test/sqlite-driver.mjs: соединение записи адаптера и
// независимое соединение приложения к тому же файлу). Интерфейс стенда: storage (загруженный координатор), core() — ядро
// проверок, put(key, value) — запись мимо координатора (другой процесс, соединение или вкладка), raw(key) / json(key) —
// сохранённое, failRead(key) / failWrite(key) — следующий отказ чтения или записи ключа, idle() — все принятые операции
// выполнены, close(). Подделка React Native — system(): AppState и AccessibilityInfo с ручными событиями. Данные синтетические.
import { coordinatorOf, createCoordinator } from '../pet/core/storage.mjs';
import { fileTail, sqliteScenes, sqliteStorage } from '../pet/storage/sqlite.mjs';
import { CORE_KEYS, journal, make } from './core-kit.mjs';
import { lab } from './sqlite-driver.mjs';

const text = (value) => (typeof value === 'string' ? value : JSON.stringify(value));
const turn = () => new Promise((resolve) => setImmediate(resolve));
export const SCHEMA = 'CREATE TABLE IF NOT EXISTS pet_kv (ns TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (ns, key)); CREATE TABLE IF NOT EXISTS pet_scene (ns TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL)';

// Асинхронное хранилище координатора: каждое get/set — через оборот цикла событий; отказы — правила по операции и ключу.
export async function asyncSite(initial = {}, { load = true } = {}) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, text(value)]));
  const rules = [];
  let inflight = 0;
  const hit = (op, key) => {
    const rule = rules.find((item) => item.op === op && item.key === key && item.left > 0);
    if (!rule) return false;
    if (rule.skip > 0) {
      rule.skip -= 1;
      return false;
    }
    rule.left -= 1;
    return true;
  };
  const backend = {
    async: true,
    async get(key) {
      inflight += 1;
      try {
        await turn();
        if (hit('get', key)) throw new Error(`get ${key}: отказ проверки`);
        return data.has(key) ? data.get(key) : null;
      } finally {
        inflight -= 1;
      }
    },
    async set(key, value) {
      inflight += 1;
      try {
        await turn();
        if (hit('set', key)) throw new Error(`set ${key}: отказ проверки`);
        data.set(key, value);
      } finally {
        inflight -= 1;
      }
    },
  };
  const storage = createCoordinator({ keys: CORE_KEYS, backend });
  const self = {
    kind: 'async',
    storage,
    data,
    core: (parts) => make(storage, parts),
    put: async (key, value) => void data.set(key, text(value)),
    raw: async (key) => (data.has(key) ? data.get(key) : null),
    json: async (key) => JSON.parse((await self.raw(key)) ?? 'null'),
    failRead: (key, { times = 1, skip = 0 } = {}) => rules.push({ op: 'get', key, left: times, skip }),
    failWrite: (key, { times = 1, skip = 0 } = {}) => rules.push({ op: 'set', key, left: times, skip }),
    // Свои записи стенда: сколько было set (асинхронно — записи хранилища, SQLite — INSERT соединения записи).
    writes: () => writes,
    async idle() {
      do {
        for (let i = 0; i < 5; i += 1) await turn();
      } while (inflight);
    },
    close: async () => {},
  };
  let writes = 0;
  const set = backend.set;
  backend.set = (key, value) => ((writes += 1), set(key, value));
  if (load && (await storage.load()) !== 'ready') throw new Error('асинхронный стенд не загрузился');
  return self;
}

// Настоящий SQLite: файл во временной папке, соединение приложения (other, режим журнала — mode), адаптер со своим
// соединением записи. ns — пространство имён; busyTimeout — ожидание занятого файла соединением записи; L — общая
// лаборатория (второй стенд на том же или другом файле), file — путь. busyTimeout: 'default' — не передавать (значение
// адаптера по умолчанию).
export async function sqliteSite(initial = {}, { ns = 'qa', mode = 'wal', busyTimeout: wait = 200, L = null, file = null, load = true } = {}) {
  const busyTimeout = wait === 'default' ? undefined : wait;
  const own = L ?? (await lab());
  const path = file ?? own.file();
  const app = own.other(path);
  // Соединение приложения ждёт занятый файл само (его настройка, не адаптера): запись «другого процесса» во время
  // транзакции библиотеки ждёт её конца, а не отказывает сразу.
  await app.execAsync('PRAGMA busy_timeout = 5000');
  await app.execAsync(`PRAGMA journal_mode = ${mode}`);
  await app.execAsync(SCHEMA);
  for (const [key, value] of Object.entries(initial)) await app.runAsync('INSERT OR REPLACE INTO pet_kv (ns, key, value) VALUES (?, ?, ?)', [ns, `${key}:v1`, text(value)]);
  const log = journal();
  // Наружу адаптер отдаёт непрозрачный фасад; проверкам (шпион подключений, прямое подключение) нужен сам координатор.
  const facade = sqliteStorage({ db: app, namespace: ns, busyTimeout, log: log.port }, own.open);
  const storage = coordinatorOf(facade);
  const scenes = sqliteScenes({ db: app, namespace: ns, busyTimeout, log: log.port }, own.open);
  const select = (key) => app.getFirstAsync('SELECT value FROM pet_kv WHERE ns = ? AND key = ?', [ns, `${key}:v1`]);
  const self = {
    kind: 'sqlite',
    lab: own,
    app,
    path,
    ns,
    log,
    storage,
    facade,
    scenes,
    core: (parts) => make(storage, parts),
    // Запись «другого процесса» — своей транзакцией на соединении приложения.
    async put(key, value) {
      await app.execAsync('BEGIN IMMEDIATE');
      await app.runAsync('INSERT OR REPLACE INTO pet_kv (ns, key, value) VALUES (?, ?, ?)', [ns, `${key}:v1`, text(value)]);
      await app.execAsync('COMMIT');
    },
    raw: async (key) => (await select(key))?.value ?? null,
    json: async (key) => JSON.parse((await self.raw(key)) ?? 'null'),
    day: async () => {
      const row = await app.getFirstAsync('SELECT value FROM pet_scene WHERE ns = ?', [ns]);
      return row ? row.value : undefined;
    },
    // Инъекции отказа метода драйвера на соединении записи адаптера (не настоящая ошибка SQLite).
    failRead: (key, { times = 1, skip = 0 } = {}) => own.fail(({ sql, params }) => sql.startsWith('SELECT value FROM pet_kv') && params?.[0] === ns && params?.[1] === `${key}:v1`, { who: 'w', op: 'get', times, skip, message: `SELECT ${key}: инъекция отказа` }),
    failWrite: (key, { times = 1, skip = 0 } = {}) => own.fail(({ sql, params }) => sql.startsWith('INSERT INTO pet_kv') && params?.[0] === ns && params?.[1] === `${key}:v1`, { who: 'w', op: 'run', times, skip, message: `INSERT ${key}: инъекция отказа` }),
    writes: () => own.journal.filter((line) => /^w\d+ run INSERT INTO pet_kv/.test(line) && line.includes(`[${ns},`) && !line.endsWith('✗')).length,
    // Мьютекс файла пуст: идущих и поставленных транзакций нет (новую транзакцию ставит фиксация предыдущей сразу).
    async idle() {
      for (;;) {
        const tail = fileTail(path);
        await tail;
        for (let i = 0; i < 5; i += 1) await turn();
        if (fileTail(path) === tail) return;
      }
    },
    close: () => (L ? Promise.resolve() : own.close()),
  };
  if (load && (await storage.load()) !== 'ready') throw new Error('SQLite-стенд не загрузился');
  return self;
}

// Подделка React Native: AppState (currentState, change, blur) и AccessibilityInfo (isReduceMotionEnabled — ручное
// обещание, reduceMotionChanged). Счётчики подписок и снятий; emit — событие всем текущим слушателям.
export function system({ state = 'active' } = {}) {
  const listeners = { change: new Set(), blur: new Set(), reduceMotionChanged: new Set() };
  const counts = { add: 0, remove: 0, ask: 0 };
  const asks = [];
  const target = (names) => ({
    addEventListener(event, handler) {
      if (!names.includes(event)) throw new Error(`нет события ${event}`);
      counts.add += 1;
      listeners[event].add(handler);
      let removed = false;
      return {
        remove() {
          if (removed) return;
          removed = true;
          counts.remove += 1;
          listeners[event].delete(handler);
        },
      };
    },
  });
  const AppState = Object.assign(target(['change', 'blur']), { currentState: state });
  const AccessibilityInfo = Object.assign(target(['reduceMotionChanged']), {
    isReduceMotionEnabled() {
      counts.ask += 1;
      return new Promise((resolve, reject) => asks.push({ resolve, reject }));
    },
  });
  return {
    AppState,
    AccessibilityInfo,
    counts,
    asks,
    listeners,
    live: () => Object.values(listeners).reduce((sum, set) => sum + set.size, 0),
    emit(event, value) {
      if (event === 'change') AppState.currentState = value;
      for (const handler of [...listeners[event]]) handler(value);
    },
  };
}
