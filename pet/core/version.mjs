// Версия пакета — одна на все входы (pet-companion и pet-companion/core): та же, что в package.json. Меняет её только
// npm version (scripts/sync-version.mjs); README и CHANGELOG сверяет test/package-shape.test.mjs. Версии форматов данных —
// v1 в ключах хранения, формат снимка — поле v снимка; они отдельно.
export const VERSION = '0.2.3';
