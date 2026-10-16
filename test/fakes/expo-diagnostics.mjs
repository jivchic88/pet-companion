// Только проверки примера Expo (test/native-example.test.mjs): замена './diagnostics.mjs' для настоящего
// examples/expo/App.js (загрузчик подставляет её только импорту из App.js). Логика примера — настоящая
// (examples/expo/diagnostics.mjs: newCore с барьером загрузки и публичным createPetCore, хост createHost — счёт занятий и
// часы со сдвигом дня, confirmed, restartCheck, имена);
// управляемы только ввод-вывод и время. База — асинхронное хранилище в памяти на внутреннем координаторе, общее для всех
// экранов (как один файл): подключения ядер считаются (box.connections), запись ключа можно удержать (box.holdWrites —
// обещание), выполненные записи — box.saved; каждое создание ядра — управляемая точка до барьера загрузки (box.manual:
// ждёт, пока проверка отпустит box.waiting[i]). Созданные ядра — box.cores по порядку. Состояние — globalThis.__petExample
// (кладёт проверка). Записи хоста (example_marks, example_clock) — box.hostWrites; отказ записи хоста — box.hostFail.
// Экрану отдаётся то же ядро через делегирующую обёртку (ядро заморожено): каждый notify записывается в box.notifies вместе
// со счётом хоста в момент вызова — так видно, что подтверждённое занятие сначала записано хостом, а затем сообщено.
// Файл примера между запусками экрана — по желанию проверки: box.disk = { days, shift, diag } — счёт и сдвиг дня хоста и
// последняя диагностическая запись переживают размонтирование, как таблицы example_marks, example_clock и example_diag
// настоящей базы, и openStore читает их, как настоящий; без box.disk — хост с нуля и без записи.
import { createCoordinator, publicStorage } from '../../pet/core/storage.mjs';
import { createHost, newCore as realNewCore } from '../../examples/expo/diagnostics.mjs';
import { CORE_KEYS } from '../core-kit.mjs';

// Остальное (confirmed, сверки, пробы, имена) — настоящее; свои openStore, newCore и remember ниже заменяют одноимённые.
export * from '../../examples/expo/diagnostics.mjs';

const box = globalThis.__petExample;
const data = new Map();
const inner = createCoordinator({
  keys: CORE_KEYS,
  backend: {
    async: true,
    async get(key) {
      await null;
      return data.has(key) ? data.get(key) : null;
    },
    async set(key, value) {
      await (box.holdWrites ?? null);
      data.set(key, value);
      box.saved += 1;
    },
  },
});
const storage = publicStorage(
  Object.freeze({
    get status() {
      return inner.status;
    },
    load: () => inner.load(),
    external: (key) => inner.external(key),
    connect() {
      const client = inner.connect();
      let open = true;
      box.connections += 1;
      return Object.freeze({
        ...client,
        close() {
          if (open) box.connections -= 1;
          open = false;
          client.close();
        },
      });
    },
  }),
);

export async function openStore() {
  box.opens += 1;
  await null;
  const disk = box.disk;
  const db = {
    async runAsync(sql, params = []) {
      await null;
      if (box.hostFail) throw new Error('запись хоста: отказ проверки');
      box.hostWrites.push(sql.split(' ').slice(0, 3).join(' '));
      if (sql.startsWith('INSERT INTO example_marks') && disk) disk.days[params[1]] = (disk.days[params[1]] ?? 0) + 1;
      if (sql.startsWith('INSERT INTO example_clock') && disk) disk.shift = params[0];
    },
  };
  return { db, expected: disk?.diag ?? null, storage, scenes: null, host: createHost(db, disk ? { days: disk.days, shift: disk.shift } : {}) };
}

function watched(core, store) {
  const view = {};
  for (const key of Object.keys(core)) if (key !== 'status') view[key] = core[key];
  Object.defineProperty(view, 'status', { get: () => core.status, enumerable: true });
  view.notify = (type, detail) => {
    box.notifies.push({ type, key: detail?.key ?? null, today: store.host.progress().today });
    return core.notify(type, detail);
  };
  return Object.freeze(view);
}

export async function newCore(store, progress) {
  if (box.manual) await new Promise((resolve, reject) => box.waiting.push({ resolve, reject }));
  const made = await realNewCore(store, progress ?? store.host.progress);
  const core = watched(made.core, store);
  box.cores.push(core);
  return { ...made, core };
}

export async function remember(db, value) {
  box.remembered += 1;
  if (box.disk) box.disk.diag = JSON.parse(JSON.stringify(value));
}
