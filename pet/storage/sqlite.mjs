// Натив: хранение и резервирование дня сценки на SQLite (docs/ARCHITECTURE.md § 8.10, § 9.4–9.5, § 12.3; этап PL09). Без
// импорта expo-sqlite: функцию открытия соединения передаёт вход pet/native-sqlite.mjs (там — openDatabaseAsync с
// useNewConnection), проверки Node — свою, на node:sqlite. Импортирует только pet/core/**: ни React Native, ни отображения.
//
// Файл базы — по пути (db.databasePath приложения, нормализованный): один на путь в этой копии модуля, общий для всех
// пространств имён, обычных записей и резервирования. У файла — одно соединение записи библиотеки (открывается при первой
// транзакции, после сброса — заново) и мьютекс: транзакции библиотеки на файле идут по одной. Соединение приложения db
// библиотека не использует, не закрывает и не перенастраивает: на нём только путь.
//
// Операция ключа (координатор pet/core/storage.mjs, участок transact): мьютекс → BEGIN IMMEDIATE (блокировка записи SQLite —
// до чтения; файл занят дольше busy_timeout — отказ без повтора) → SELECT → plan(current) синхронно → INSERT … ON CONFLICT
// и COMMIT, либо ROLLBACK, если писать нечего или build отказал. Подтверждение — выполненный COMMIT. Ошибка после BEGIN —
// ROLLBACK; не удался ROLLBACK — проверка isInTransactionAsync (ошибка проверки — «открыта»): открыта — соединение
// закрывается (SQLite откатывает и снимает блокировки), следующая транзакция откроет новое. Не закрылось — предупреждение
// журнала: блокировку может держать неисправное соединение, дальнейшие операции честно отказывают по busy_timeout.
// Предупреждения журнала — после выхода из мьютекса, а фиксация и доставка координатора — после транзакции: внешний код
// блокировку файла не держит.
//
// Резервирование дня (порт scenes ядра, § 9.5): тот же мьютекс и соединение → BEGIN IMMEDIATE → SELECT записи дня → decide
// синхронно после всех ожиданий → с записью — INSERT поставлен, обработчик отказа подключён, show() в том же синхронном шаге
// до первого await → дождаться INSERT, COMMIT → shown; без записи — ROLLBACK, skip; отказ до показа (вход, чтение,
// повреждённая запись, decide) — fail; после постановки (INSERT, show, COMMIT) — дождаться INSERT, ROLLBACK, lost. Записи нет —
// undefined, сохранённый JSON — как есть (null тоже: ядро считает его повреждённым — skip), не JSON или не строка — fail:
// повреждённое не становится свободным днём и не перезаписывается. Обещание никогда не отклоняется.
//
// Режим журнала и synchronous файла выбирает приложение: адаптер их не переключает. journal_mode читается при открытии
// соединения записи; не WAL — одно предупреждение журнала на координатор при загрузке (гарантии те же, но COMMIT в режиме
// rollback-журнала ждёт читателей, и отказ после начала показа вероятнее).

import { PetError } from '../core/errors.mjs';
import { isRecord, STORAGE_NAMES } from '../core/formats/legacy.mjs';
import { systemLog } from '../core/ports.mjs';
import { createCoordinator, publicStorage, shared } from '../core/storage.mjs';

// busy_timeout соединения записи по умолчанию, мс: обычная запись другого соединения (запись приложения, контрольная
// точка WAL) длится миллисекунды — секунды хватает с запасом; дольше — честный отказ (настройка «не сохранилось», сценки
// нет), а не долгое ожидание: пока ждёт одна транзакция, остальные операции библиотеки на этом файле стоят в мьютексе. Это
// ожидание нативного потока SQLite, не JS. Срок сценки (10 с) перепроверяет decide после ожидания. Предел настройки — 10 с.
export const BUSY_MS = 1000;
export const MAX_BUSY_MS = 10_000;

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS pet_kv (ns TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (ns, key))',
  'CREATE TABLE IF NOT EXISTS pet_scene (ns TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL)',
].join(';\n');
// Запись — UPSERT по ключу строки: меняется только value, другие столбцы строки (если приложение их добавило) остаются;
// таблица без такого ключа уникальности — честный отказ записи, а не дубли.
const SELECT_KEY = 'SELECT value FROM pet_kv WHERE ns = ? AND key = ?';
const PUT_KEY = 'INSERT INTO pet_kv (ns, key, value) VALUES (?, ?, ?) ON CONFLICT (ns, key) DO UPDATE SET value = excluded.value';
const SELECT_DAY = 'SELECT value FROM pet_scene WHERE ns = ?';
const PUT_DAY = 'INSERT INTO pet_scene (ns, value) VALUES (?, ?) ON CONFLICT (ns) DO UPDATE SET value = excluded.value';
// Ключ строки pet_kv — имя ключа с версией формата (cat:v1), как у веба без пространства имён: несовместимый формат —
// новый ключ (:v2), а не тот же.
const rowKey = (key) => `${key}:v1`;

const files = new Map();
const noop = () => {};

// Путь файла базы для его идентичности: databasePath соединения приложения (у expo-sqlite — папка и имя, как открыло
// приложение). file:-адрес — путь без схемы (с раскодированием); повторные «/», «.» и «..» сводятся. База в памяти и
// относительный путь — null: своё соединение открыло бы другую базу. Разные написания одного файла через символические
// ссылки не распознаются (два соединения записи — корректно, но конкурентно: занятый файл — честный отказ).
export function filePath(db) {
  let raw = isRecord(db) || typeof db === 'function' ? db.databasePath : undefined;
  if (typeof raw !== 'string' || !raw) return null;
  if (/^file:/i.test(raw)) {
    try {
      raw = decodeURIComponent(raw.replace(/^file:(\/\/(localhost)?)?/i, ''));
    } catch {
      return null;
    }
  }
  if (!raw.startsWith('/')) return null;
  const parts = [];
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.length ? `/${parts.join('/')}` : null;
}

// Для проверок и диагностики: хвост мьютекса файла (обещание конца последней поставленной транзакции) или null.
export const fileTail = (path) => files.get(path)?.tail ?? null;

// Файл базы этой копии модуля: тот же объект для того же пути. open(path) → соединение записи (новое на каждый вызов).
function fileOf(path, open, busy) {
  let file = files.get(path);
  if (!file) {
    file = { path, open, busy: busy ?? BUSY_MS, writer: null, journal: null, tail: Promise.resolve(), scenes: {} };
    files.set(path, file);
  } else if (busy !== undefined && busy !== file.busy) {
    throw new PetError('invalid-options', `busyTimeout ${busy} — у этого файла базы уже ${file.busy}: соединение записи одно на файл, его ожидание тоже.`);
  }
  return file;
}

const say = (log, message, error) => {
  try {
    log.warn(message, error);
  } catch {
    // журнал интегратора не мешает хранению
  }
};

// Мьютекс файла: task(notes) — по одной на файл, по порядку постановки; освобождается её завершением при любом исходе.
// notes — предупреждения журнала, они выдаются после выхода из мьютекса.
function locked(file, log, task) {
  const notes = [];
  const result = file.tail.then(() => task(notes));
  file.tail = result.then(noop, noop);
  return result.then((value) => {
    for (const [message, error] of notes) say(log, message, error);
    return value;
  });
}

// Соединение записи файла: открыть, задать busy_timeout, создать таблицы (только если их нет), прочитать режим журнала.
// Вызывается внутри мьютекса. Отказ — исключение (операция получает отказ, следующая попробует снова: это новая операция).
async function writer(file) {
  if (file.writer) return file.writer;
  const db = await file.open(file.path);
  try {
    await db.execAsync(`PRAGMA busy_timeout = ${file.busy}`);
    await db.execAsync(SCHEMA);
    const row = await db.getFirstAsync('PRAGMA journal_mode');
    file.journal = typeof row?.journal_mode === 'string' ? row.journal_mode.toLowerCase() : null;
  } catch (error) {
    await Promise.resolve()
      .then(() => db.closeAsync())
      .catch(noop);
    throw error;
  }
  file.writer = db;
  return db;
}

// Сброс соединения записи: следующая транзакция откроет новое. Закрытие откатывает незавершённую транзакцию и снимает
// блокировки; не закрылось — предупреждение (блокировка может остаться за неисправным соединением).
async function reset(file, db, notes) {
  if (file.writer === db) file.writer = null;
  try {
    await db.closeAsync();
  } catch (error) {
    notes.push(['соединение записи SQLite не закрылось — файл может оставаться заблокированным до завершения процесса; записи и сценки до тех пор честно отказывают', error]);
  }
}

// Транзакция могла остаться открытой (не удался ROLLBACK, BEGIN): проверка; ошибка проверки — «открыта».
async function settleState(file, db, notes) {
  let open = true;
  try {
    open = (await db.isInTransactionAsync()) !== false;
  } catch {
    open = true;
  }
  if (open) await reset(file, db, notes);
}

// Начало транзакции записи на соединении библиотеки. Отказ — исключение (BEGIN не взял блокировку: файл занят дольше
// busy_timeout, соединение не открылось); если транзакция при этом открыта — сброс соединения.
async function begin(file, notes) {
  const db = await writer(file);
  try {
    await db.execAsync('BEGIN IMMEDIATE');
  } catch (error) {
    await settleState(file, db, notes);
    throw error;
  }
  return db;
}

// Завершение без записи или после отказа — ROLLBACK; не удался — проверка и при необходимости сброс. Не бросает.
async function finish(file, db, notes) {
  try {
    await db.execAsync('ROLLBACK');
    return;
  } catch {
    // SQLite мог откатить транзакцию сам (SQLITE_FULL, прерывание) — проверка ниже
  }
  await settleState(file, db, notes);
}

// Участок операции ключа для координатора (transact): true — поставленная запись подтверждена COMMIT. plan не вызван —
// ничего не прочитано (BEGIN или SELECT отказали, значение не строка).
async function keyStep(file, ns, key, plan, notes) {
  let db;
  try {
    db = await begin(file, notes);
  } catch {
    return false;
  }
  let next;
  try {
    const row = await db.getFirstAsync(SELECT_KEY, [ns, rowKey(key)]);
    if (row && typeof row.value !== 'string') throw new Error('значение pet_kv — не строка');
    next = plan(row ? row.value : null);
  } catch {
    await finish(file, db, notes);
    return false;
  }
  if (typeof next !== 'string') {
    await finish(file, db, notes);
    return false;
  }
  try {
    await db.runAsync(PUT_KEY, [ns, rowKey(key), next]);
    await db.execAsync('COMMIT');
    return true;
  } catch {
    await finish(file, db, notes);
    return false;
  }
}

// Резервирование дня (§ 9.5): исход 'shown' | 'skip' | 'fail' | 'lost'; не бросает.
async function dayStep(file, ns, decide, show, notes) {
  let db;
  try {
    db = await begin(file, notes);
  } catch {
    return 'fail';
  }
  let put = null;
  try {
    const row = await db.getFirstAsync(SELECT_DAY, [ns]);
    if (row && typeof row.value !== 'string') throw new Error('запись дня — не строка');
    const record = decide(row ? JSON.parse(row.value) : undefined);
    if (!record) {
      await finish(file, db, notes);
      return 'skip';
    }
    const text = JSON.stringify(record);
    put = Promise.resolve(db.runAsync(PUT_DAY, [ns, text]));
    put.catch(noop);
    show();
    await put;
    await db.execAsync('COMMIT');
    return 'shown';
  } catch {
    if (put) await put.catch(noop);
    await finish(file, db, notes);
    return put ? 'lost' : 'fail';
  }
}

const OPTIONS = ['db', 'namespace', 'busyTimeout', 'log'];

// Настройки входа: { db, namespace = 'pet', busyTimeout?, log? }; ошибка — PetError invalid-options до создания.
function settings(options, what, open) {
  const shape = `Настройки ${what} SQLite — объект { db, namespace?, busyTimeout?, log? }.`;
  if (!isRecord(options)) throw new PetError('invalid-options', shape);
  for (const key of Object.keys(options)) if (!OPTIONS.includes(key)) throw new PetError('invalid-options', `Неизвестная настройка ${what} SQLite: ${key}.`);
  const { db, namespace = 'pet', busyTimeout, log } = options;
  if (!isRecord(db)) throw new PetError('invalid-options', 'db — база приложения (openDatabaseAsync из expo-sqlite).');
  const path = filePath(db);
  if (!path) throw new PetError('invalid-options', 'db.databasePath — путь файла базы (не :memory:): библиотека открывает к тому же файлу своё соединение записи.');
  if (typeof namespace !== 'string' || !namespace) throw new PetError('invalid-options', 'namespace — непустая строка.');
  if (busyTimeout !== undefined && !(Number.isInteger(busyTimeout) && busyTimeout >= 0 && busyTimeout <= MAX_BUSY_MS)) throw new PetError('invalid-options', `busyTimeout — целое число мс от 0 до ${MAX_BUSY_MS}.`);
  if (log !== undefined && log !== null && !((isRecord(log) || typeof log === 'function') && typeof log.warn === 'function')) throw new PetError('invalid-options', 'log — объект с warn(message, error?).');
  return { file: fileOf(path, open, busyTimeout), namespace, log: log ?? systemLog };
}

// Координатор хранения на SQLite (вход createSqliteStorage): тот же объект для того же файла и namespace в этой копии
// модуля — общая очередь ключа, кэш и подключения ядер; наружу — непрозрачный фасад { status, load() } (load — обещание).
export function sqliteStorage(options, open) {
  const { file, namespace, log } = settings(options, 'хранилища', open);
  return shared(file, namespace, () => {
    let told = false;
    // Режим журнала — после первой своей транзакции (соединение уже открыто), вне мьютекса; одно предупреждение.
    const notice = () => {
      if (told || !file.journal || file.journal === 'wal') return;
      told = true;
      say(log, `режим журнала SQLite файла базы — ${file.journal}, не WAL: гарантии те же, но COMMIT ждёт читателей других соединений (README, «Мобильное хранение»)`);
    };
    const refuse = () => Promise.reject(new Error('SQLite: только участок transact'));
    const transact = (key, plan) => {
      const done = locked(file, log, (notes) => keyStep(file, namespace, key, plan, notes));
      return done.then((ok) => (notice(), ok));
    };
    return publicStorage(createCoordinator({ keys: STORAGE_NAMES, backend: { async: true, transact, get: refuse, set: refuse } }));
  });
}

// Резервирование дня сценки на SQLite (вход createSqliteScenes): тот же объект для того же файла и namespace; то же
// соединение записи и мьютекс файла, что у координатора.
export function sqliteScenes(options, open) {
  const { file, namespace, log } = settings(options, 'сценок', open);
  return shared(file.scenes, namespace, () =>
    Object.freeze({
      reserve: (decide, show) => locked(file, log, (notes) => dayStep(file, namespace, decide, show, notes)).catch(() => 'fail'),
    }),
  );
}
