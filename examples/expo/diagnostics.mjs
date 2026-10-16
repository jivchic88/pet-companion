// Логика мобильного примера без интерфейса (PL09, PL10.1): своя тестовая база и namespace, загрузка координатора перед
// каждым новым ядром, счёт хоста, сверка подтверждённого после перезапуска, пробы резервирования дня и занятого файла.
// Только публичные входы пакета и expo-sqlite; данные синтетические. Экран — App.js; та же логика проверяется в Node на
// установленном архиве (test:package, expo-sqlite — замена на node:sqlite) — это не заменяет запуск на устройстве.
//
// Хост (createHost) владеет своим счётом: подтверждённое занятие сначала записывается в его таблицу example_marks (ключ и
// местный день), и только после записи progress() его видит — затем приложение вызывает notify('saved'). Отказ записи —
// знака нет, приложение вызывает notify('failed'). Правил лакомства и ступеней здесь нет: progress() отдаёт только числа
// (всего, сегодня по местному дню часов хоста), решает ядро. Проверочный сдвиг дня («Следующий день») — порт clock
// публичного createPetCore: день хоста и ядра один, сдвиг сохраняется в таблице example_clock и переживает перезапуск.
import { openDatabaseAsync } from 'expo-sqlite';
import { calm } from 'pet-companion/behaviors';
import { createPetCore, localDay } from 'pet-companion/core';
import { createSqliteScenes, createSqliteStorage } from 'pet-companion/native-sqlite';
import { cat, dog } from 'pet-companion/pets';

export const FILE = 'pet-companion-example.db';
export const NAMESPACE = 'expo-example';
export const NAMES = ['Барсик', 'Пиксель', 'Дымок'];
export const MOTIONS = ['normal', 'calm', 'none'];
export const PETS = Object.freeze([cat, dog]);
const DAY_MS = 86_400_000;

// База примера (своя, отдельный файл): ожидание занятого файла и WAL для своего соединения — выбор приложения, не
// библиотеки; example_diag — последнее подтверждённое для сверки после перезапуска; example_marks и example_clock — хост.
export async function openStore(open = openDatabaseAsync) {
  const db = await open(FILE);
  await db.execAsync('PRAGMA busy_timeout = 2000');
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('CREATE TABLE IF NOT EXISTS example_diag (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL)');
  await db.execAsync('CREATE TABLE IF NOT EXISTS example_marks (key TEXT PRIMARY KEY, day TEXT NOT NULL)');
  await db.execAsync('CREATE TABLE IF NOT EXISTS example_clock (id INTEGER PRIMARY KEY CHECK (id = 1), shift INTEGER NOT NULL)');
  const row = await db.getFirstAsync('SELECT value FROM example_diag WHERE id = 1');
  const days = await db.getFirstAsync('SELECT json_group_object(day, n) AS days FROM (SELECT day, COUNT(*) AS n FROM example_marks GROUP BY day)');
  const clock = await db.getFirstAsync('SELECT shift FROM example_clock WHERE id = 1');
  return {
    db,
    expected: row ? JSON.parse(row.value) : null,
    storage: createSqliteStorage({ db, namespace: NAMESPACE }),
    scenes: createSqliteScenes({ db, namespace: `${NAMESPACE}-probe` }),
    host: createHost(db, { days: JSON.parse(days?.days ?? '{}'), shift: clock?.shift ?? 0 }),
  };
}

// Хост: счёт подтверждённых занятий по местным дням (в памяти — после записи в базу) и часы со сдвигом дня.
export function createHost(db, { days = {}, shift = 0 } = {}) {
  const state = { days: { ...days }, shift };
  const clock = Object.freeze({
    now: () => Date.now() + state.shift * DAY_MS,
    day: (at) => localDay(new Date(at)),
    nextDay: (at) => {
      const next = new Date(at);
      next.setHours(24, 0, 0, 0);
      return next.getTime();
    },
  });
  const today = () => clock.day(clock.now());
  return {
    clock,
    today,
    get shift() {
      return state.shift;
    },
    total: () => Object.values(state.days).reduce((sum, n) => sum + n, 0),
    // Счёт для ядра: быстро и без побочных действий.
    progress: () => ({ marks: Object.values(state.days).reduce((sum, n) => sum + n, 0), today: state.days[today()] ?? 0, limit: null }),
    // Подтвердить занятие: запись в базу хоста; только после неё — в счёте. fail — проверочный отказ хоста до записи.
    async save(key, { fail = false } = {}) {
      if (fail) throw new Error('проверочный отказ хоста: занятие не записано');
      const day = today();
      await db.runAsync('INSERT INTO example_marks (key, day) VALUES (?, ?)', [key, day]);
      state.days = { ...state.days, [day]: (state.days[day] ?? 0) + 1 };
      return { key, day };
    },
    // Проверочный сдвиг дня: сохраняется до перезапуска; ядро с этими часами создаётся заново.
    async shiftDay(by = 1) {
      const next = state.shift + by;
      await db.runAsync('INSERT INTO example_clock (id, shift) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET shift = excluded.shift', [next]);
      state.shift = next;
      return next;
    },
  };
}

// Новое ядро — только после барьера загрузки: ждёт принятых операций прежнего ядра и сверяет кэш. Часы и счёт — хоста.
export async function newCore(store, progress = store.host?.progress) {
  const status = await store.storage.load();
  const clock = store.host?.clock;
  return { status, core: createPetCore({ storage: store.storage, pets: PETS, behaviors: [calm], progress, ...(clock ? { clock } : {}) }) };
}

// Подтверждённое (ключи cat, companion, look и treat без своих неразрешённых и несохранённых правок; счёт уже прочитан —
// ядро запущено) или null: питомец, имя, движение, облик, аксессуар, лакомство дня.
const KEYS = ['cat', 'companion', 'look', 'treat'];
export const confirmed = (snapshot) =>
  snapshot && snapshot.treat !== null && KEYS.every((key) => snapshot.save[key].status === 'saved')
    ? { v: 2, pet: snapshot.pet.shown, name: snapshot.name.display, motion: snapshot.prefs.motion, coat: snapshot.look.coat, accessory: snapshot.look.accessory, treat: snapshot.treat }
    : null;

export const remember = (db, value) => db.runAsync('INSERT INTO example_diag (id, value) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET value = excluded.value', [JSON.stringify(value)]);

const FIELDS = ['pet', 'name', 'motion', 'coat', 'accessory', 'treat'];
const show = (value, fields) => fields.map((field) => value[field]).join(' / ');
// Совпадают ли два подтверждённых по полям fields (по умолчанию все).
export const same = (a, b, fields = FIELDS) => Boolean(a && b) && fields.every((field) => a[field] === b[field]);

// Сверка после перезапуска: загруженное и запущенное ядро — то, что было подтверждено до завершения процесса. Запись
// прежнего формата PL09 (только имя и движение) сверяется по своим полям.
export function restartCheck(expected, snapshot) {
  if (!expected) return { ok: null, text: 'первый запуск: сверять не с чем' };
  const fields = expected.v === 2 ? FIELDS : ['name', 'motion'];
  const got = { pet: snapshot.pet.shown, name: snapshot.name.display, motion: snapshot.prefs.motion, coat: snapshot.look.coat, accessory: snapshot.look.accessory, treat: snapshot.treat };
  const ok = same(expected, got, fields);
  return { ok, text: `${ok ? 'восстановлено' : 'НЕ совпало'}: подтверждено ${show(expected, fields)}, загружено ${show(got, fields)}` };
}

// Резервирование дня (диагностика, своё пространство): две попытки подряд — не больше одного показа за день.
export async function reserveProbe(scenes, day = localDay()) {
  let shown = 0;
  const decide = (stored) => (stored && typeof stored === 'object' && stored.day === day ? null : { v: 1, day, by: 'expo-example' });
  const first = await scenes.reserve(decide, () => (shown += 1));
  const second = await scenes.reserve(decide, () => (shown += 1));
  const ok = ['shown', 'skip'].includes(first) && second === 'skip' && shown === (first === 'shown' ? 1 : 0);
  return { ok, first, second, shown };
}

// Занятый файл: соединение приложения держит транзакцию записи — правка библиотеки честно отказывает после её ожидания
// (по умолчанию 1000 мс), без повтора; после ROLLBACK приложения несохранённое уходит со следующей правкой.
export async function busyProbe(db, core, name) {
  await db.execAsync('BEGIN IMMEDIATE');
  const start = Date.now();
  let done = null;
  try {
    const result = core.setName(name);
    done = result.ok ? (result.save.done ? await result.save.done : result.save.status) : result.error.code;
  } finally {
    await db.execAsync('ROLLBACK');
  }
  return { ok: done === 'failed', done, ms: Date.now() - start };
}
