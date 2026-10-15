// pet-companion/pets — штатные питомцы как определения формата 1 (этап PL06; docs/ARCHITECTURE.md § 7.1, § 7.9): кот и
// собака (данные 0.1.4) и общий уголок — мебель ступеней и её места (corner, cornerItems), чтобы сторонний питомец мог
// жить в том же уголке: room: { ...corner, pet, feed, toys }. Только данные: импортирует определения pet/defs/** (они —
// только проверку определений ядра), без отображения, DOM, рисунков, стилей и сети.

export { cat } from './defs/cat.mjs';
export { dog } from './defs/dog.mjs';
export { corner, cornerItems } from './defs/room.mjs';
