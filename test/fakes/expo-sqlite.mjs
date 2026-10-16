// Только проверки (test/native-entry.test.mjs): подмена пакета expo-sqlite загрузчиком Node (registerHooks) — та же
// сигнатура openDatabaseAsync(databaseName, options, directory), что у expo-sqlite 58: путь — папка + '/' + имя
// (createDatabasePath), соединение — тестовый драйвер на node:sqlite (globalThis.__petExpo.open). Вызовы записываются.
export function openDatabaseAsync(databaseName, options, directory) {
  const box = globalThis.__petExpo;
  box.calls.push({ databaseName, options, directory });
  const path = `${String(directory).replace(/\/*$/, '')}/${String(databaseName).replace(/^\/+/, '')}`;
  return box.open(path);
}
