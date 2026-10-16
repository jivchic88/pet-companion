// Только проверки примера Expo (test/native-example.test.mjs): замена './diagnostics.mjs' для настоящего
// examples/expo/App.js (загрузчик подставляет её только импорту из App.js). Логика примера — настоящая
// (examples/expo/diagnostics.mjs: newCore с барьером загрузки и публичным createPetCore, confirmed, restartCheck, имена);
// управляемы только ввод-вывод и время. База — асинхронное хранилище в памяти на внутреннем координаторе, общее для всех
// экранов (как один файл): подключения ядер считаются (box.connections), запись ключа можно удержать (box.holdWrites —
// обещание), выполненные записи — box.saved; каждое создание ядра — управляемая точка до барьера загрузки (box.manual:
// ждёт, пока проверка отпустит box.waiting[i]). Созданные ядра — box.cores по порядку. Состояние — globalThis.__petExample
// (кладёт проверка).
import { createCoordinator, publicStorage } from '../../pet/core/storage.mjs';
import { newCore as realNewCore } from '../../examples/expo/diagnostics.mjs';
import { CORE_KEYS } from '../core-kit.mjs';

export { busyProbe, confirmed, MOTIONS, NAMES, reserveProbe, restartCheck } from '../../examples/expo/diagnostics.mjs';

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
  return { db: {}, expected: null, storage, scenes: null };
}

export async function newCore(store, progress) {
  if (box.manual) await new Promise((resolve, reject) => box.waiting.push({ resolve, reject }));
  const made = await realNewCore(store, progress);
  box.cores.push(made.core);
  return made;
}

export async function remember() {
  box.remembered += 1;
}
