// Только проверки (test/native-entry.test.mjs): подмена пакета react-native загрузчиком Node (registerHooks) — AppState и
// AccessibilityInfo подделки system() из test/native-kit.mjs, которую проверка кладёт в globalThis.__petRN до импорта.
const system = globalThis.__petRN;
export const AppState = system.AppState;
export const AccessibilityInfo = system.AccessibilityInfo;
