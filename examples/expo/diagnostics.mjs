// Диагностика мобильного примера без интерфейса (PL09): своя тестовая база и namespace, загрузка координатора перед каждым
// новым ядром, сверка подтверждённого после перезапуска, пробы резервирования дня и занятого файла. Только публичные входы
// пакета и expo-sqlite; данные синтетические. Экран — App.js; та же логика проверяется в Node на установленном архиве
// (test:package, expo-sqlite — замена на node:sqlite) — это не заменяет запуск на устройстве.
import { openDatabaseAsync } from 'expo-sqlite';
import { calm } from 'pet-companion/behaviors';
import { createPetCore, localDay } from 'pet-companion/core';
import { createSqliteScenes, createSqliteStorage } from 'pet-companion/native-sqlite';
import { cat, dog } from 'pet-companion/pets';

export const FILE = 'pet-companion-example.db';
export const NAMESPACE = 'expo-example';
export const NAMES = ['Барсик', 'Пиксель', 'Дымок'];
export const MOTIONS = ['normal', 'calm', 'none'];

// База примера (своя, отдельный файл): ожидание занятого файла и WAL для своего соединения — выбор приложения, не
// библиотеки; таблица диагностики хранит последнее подтверждённое для сверки после перезапуска.
export async function openStore(open = openDatabaseAsync) {
  const db = await open(FILE);
  await db.execAsync('PRAGMA busy_timeout = 2000');
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('CREATE TABLE IF NOT EXISTS example_diag (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL)');
  const row = await db.getFirstAsync('SELECT value FROM example_diag WHERE id = 1');
  return {
    db,
    expected: row ? JSON.parse(row.value) : null,
    storage: createSqliteStorage({ db, namespace: NAMESPACE }),
    scenes: createSqliteScenes({ db, namespace: `${NAMESPACE}-probe` }),
  };
}

// Новое ядро — только после барьера загрузки: ждёт принятых операций прежнего ядра и сверяет кэш.
export async function newCore(store, progress) {
  const status = await store.storage.load();
  return { status, core: createPetCore({ storage: store.storage, pets: [cat, dog], behaviors: [calm], progress }) };
}

// Подтверждённые имя и движение (ключ cat без своих неразрешённых и несохранённых правок) или null.
export const confirmed = (snapshot) => (snapshot && snapshot.save.cat.status === 'saved' ? { name: snapshot.name.display, motion: snapshot.prefs.motion } : null);

export const remember = (db, value) => db.runAsync('INSERT INTO example_diag (id, value) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET value = excluded.value', [JSON.stringify(value)]);

// Сверка после перезапуска: загруженное ядром — то, что было подтверждено до завершения процесса.
export function restartCheck(expected, snapshot) {
  if (!expected) return { ok: null, text: 'первый запуск: сверять не с чем' };
  const got = { name: snapshot.name.display, motion: snapshot.prefs.motion };
  const ok = got.name === expected.name && got.motion === expected.motion;
  return { ok, text: `${ok ? 'восстановлено' : 'НЕ совпало'}: подтверждено ${expected.name} / ${expected.motion}, загружено ${got.name} / ${got.motion}` };
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
