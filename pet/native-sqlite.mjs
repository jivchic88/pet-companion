// pet-companion/native-sqlite — хранение и резервирование дня сценки для React Native на expo-sqlite (этап PL09; README,
// «Мобильное хранение»; docs/ARCHITECTURE.md § 8.10, § 9.5, § 12.3). createSqliteStorage — координатор хранения для
// createPetCore входа pet-companion/core этой же копии; createSqliteScenes — порт scenes. Оба получают db приложения
// (openDatabaseAsync) и открывают к тому же файлу своё соединение записи (useNewConnection: true) — одно на файл в процессе,
// общее для всех namespace и резервирования; соединение приложения не используется для транзакций библиотеки, не
// закрывается и не перенастраивается. expo-sqlite — необязательный партнёр только этого входа (в «голом» React Native нужны
// модули Expo). Импорт открывает только модуль expo-sqlite: ни соединений, ни запросов до первого load()/reserve().

import { openDatabaseAsync } from 'expo-sqlite';
import { sqliteScenes, sqliteStorage } from './storage/sqlite.mjs';

// Своё соединение к файлу path (нормализованный абсолютный путь): папка и имя — как у expo-sqlite (createDatabasePath).
function open(path) {
  const at = path.lastIndexOf('/');
  return openDatabaseAsync(path.slice(at + 1), { useNewConnection: true }, path.slice(0, at) || '/');
}

// Координатор хранения: тот же объект для того же файла базы и namespace. Перед каждым новым ядром — await load() (барьер:
// ждёт принятых операций и сверяет кэш свежим чтением). Ошибка настроек — PetError invalid-options.
export const createSqliteStorage = (options) => sqliteStorage(options, open);

// Резервирование дня редкой сценки: тот же объект для того же файла и namespace; reserve(decide, show) никогда не
// отклоняется. Ошибка настроек — PetError invalid-options.
export const createSqliteScenes = (options) => sqliteScenes(options, open);
