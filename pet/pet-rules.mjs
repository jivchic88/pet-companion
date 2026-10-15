// Питомец: правила без DOM для оставшегося веб-кода и проверок. Правила ядра (pet/core/**: ступени по знакам, форматы и
// записи ключей, имена, лакомство дня, местный день; с PL04.1 — реакции и «режиссёр», тишина, покой, движение, реплики; с
// PL04.2 — редкие сценки: копия дня scene:v1, выбор, уместность и решение дня; с PL06 — правила над определениями
// формата 1) — здесь реэкспортом; транзакция дня сценки IndexedDB (sceneTurn) — веб-адаптер pet/web/scenes.mjs, тоже
// реэкспортом. Данные питомцев и моделей — определения (pet/defs/**, входы pet-companion/pets и /behaviors), а не таблицы
// этого модуля. Вторая реализация не заводится. Хранение по ключам — README модуля, «Хранение».

export * from './core/pets.mjs';
export * from './core/stages.mjs';
export * from './core/day.mjs';
export * from './core/formats/legacy.mjs';
export * from './core/director.mjs';
export * from './core/phrases.mjs';
export * from './core/scenes.mjs';
export { sceneTurn } from './web/scenes.mjs';
