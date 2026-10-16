// Типы входа pet-companion/native-sqlite (pet/native-sqlite.mjs; README, «Мобильное хранение»). Только описания: поведение —
// в pet/storage/sqlite.mjs. Типы expo-sqlite не нужны: от базы приложения адаптеру нужен только путь файла.

import type { PetAsyncStorage, PetLog, PetSceneReserver } from './core.mjs';

/** База приложения из `openDatabaseAsync` (expo-sqlite): адаптер берёт только путь файла и открывает к нему своё соединение. */
export interface PetSqliteDatabase {
  /** Путь файла базы (папка и имя); база в памяти (`:memory:`) не подходит. */
  readonly databasePath: string;
}

export interface PetSqliteOptions {
  /** База приложения; адаптер не выполняет на ней запросов, не закрывает и не перенастраивает её. */
  db: PetSqliteDatabase;
  /** Пространство имён (непустая строка): строки `pet_kv`/`pet_scene` с этим `ns`. По умолчанию `'pet'`. */
  namespace?: string;
  /** `PRAGMA busy_timeout` соединения записи библиотеки, мс (0…10000; по умолчанию 1000) — одно на файл базы. */
  busyTimeout?: number;
  /** Предупреждения адаптера (режим журнала не WAL, соединение не закрылось). По умолчанию — `console.warn('Питомец: …')`. */
  log?: PetLog;
}

/**
 * Координатор хранения на SQLite для `createPetCore` (`pet-companion/core`): тот же объект для того же файла и `namespace`.
 * Перед каждым новым ядром — `await storage.load()`. Ошибка настроек — `PetError` (`invalid-options`).
 */
export declare function createSqliteStorage(options: PetSqliteOptions): PetAsyncStorage;

/** Резервирование дня редкой сценки на том же файле: тот же объект для того же файла и `namespace`. */
export declare function createSqliteScenes(options: PetSqliteOptions): PetSceneReserver;
