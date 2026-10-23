// Веб: резервирование дня редкой сценки на IndexedDB (docs/ARCHITECTURE.md § 9.1–9.4; PL04.2 — из sceneTurn 0.1.4).
// Порт ядра scenes: reserve(decide, show) → Promise<'shown' | 'skip' | 'fail' | 'lost'>, никогда не отклоняется. Один
// объект на хранилище (фабрика IndexedDB страницы) и пространство имён в этой копии модуля — общий для всех ядер; своей
// очереди JS нет и она не нужна: блокировка — readwrite-транзакция хранилища scene базы <ns>:scene, браузер выполняет такие
// транзакции по очереди для всех вкладок и экземпляров источника, и следующая видит запись предыдущей.
//
// Порядок одной попытки: транзакция (вход в защищённый участок) → get('shown') внутри неё (записи нет — undefined, как
// get.result) → синхронный decide → с записью — put(record, 'shown') и сразу show() в том же синхронном шаге → транзакция
// держится до oncomplete (shown) или onabort (lost, если показ начат; иначе fail). Исключение decide — откат, fail; show
// бросил после постановки записи — откат, lost; put бросил — откат, fail. Нет IndexedDB, отказ open, transaction, get —
// fail, без необработанных ошибок; база закрывается при любом исходе.

const registry = new WeakMap();
const PAGE = {};

function pageIdb() {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

// Попытка показа — одна readwrite-транзакция IndexedDB (idb — фабрика indexedDB или null, name — база).
export function sceneTurn(idb, name, decide, show) {
  return new Promise((resolve) => {
    let shown = false;
    let db = null;
    const end = (result) => {
      try {
        db?.close();
      } catch {
        // база уже закрыта
      }
      resolve(result);
    };
    const fail = () => end(shown ? 'lost' : 'fail');
    try {
      const open = idb.open(name, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('scene');
      open.onerror = (event) => {
        event?.preventDefault?.();
        fail();
      };
      open.onsuccess = () => {
        db = open.result;
        let tx;
        try {
          tx = db.transaction('scene', 'readwrite');
        } catch {
          fail();
          return;
        }
        const abort = () => {
          try {
            tx.abort();
          } catch {
            // транзакция уже завершилась — её исход придёт событием
          }
        };
        // Сорванная запись (в том числе поздний отказ put) не гасится: транзакция откатывается — onabort.
        tx.oncomplete = () => end(shown ? 'shown' : 'skip');
        tx.onabort = fail;
        try {
          // Одно хранилище объектов на транзакцию — и для чтения, и для записи.
          const store = tx.objectStore('scene');
          const get = store.get('shown');
          get.onsuccess = () => {
            try {
              const record = decide(get.result);
              if (!record) return;
              store.put(record, 'shown');
              shown = true;
              show();
            } catch {
              abort();
            }
          };
          get.onerror = (event) => {
            event?.preventDefault?.();
            abort();
          };
        } catch {
          abort();
        }
      };
    } catch {
      fail();
    }
  });
}

// Резервирование для пространства имён namespace: тот же объект для той же фабрики IndexedDB и namespace. idb — для
// проверок без браузера (по умолчанию — indexedDB страницы; недоступна — каждая попытка fail).
export function createWebScenes({ namespace = 'pet', idb = null } = {}) {
  const store = idb ?? pageIdb();
  const key = store ?? PAGE;
  let spaces = registry.get(key);
  if (!spaces) registry.set(key, (spaces = new Map()));
  if (!spaces.has(namespace)) {
    const name = `${namespace}:scene`;
    spaces.set(
      namespace,
      Object.freeze({
        name,
        reserve: (decide, show) => (store ? sceneTurn(store, name, decide, show) : Promise.resolve('fail')).catch(() => 'fail'),
      }),
    );
  }
  return spaces.get(namespace);
}
