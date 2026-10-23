// Определения: общая комната уголка (docs/ARCHITECTURE.md § 7.1 «room», § 13 «Геометрия комнаты»; этап PL06) — данные,
// одинаковые для питомцев, живущих в штатном уголке: рамка питомца в сцене 400×250, линия пола, место отдыха (подушка, с
// «Уютного штаба» — лежанка на 4 единицы ниже), миска и неподвижные вещи ступеней (блокнот, кружка, лампа на столике,
// растение). Значения — замеры рисунков 0.1.4. Питомец добавляет свои рамки (pet, feed) и игрушки: room: { ...corner,
// pet, feed, toys }. Публично — corner входа pet-companion/pets: сторонний питомец может жить в том же уголке.

export const corner = Object.freeze({
  // Питомец в сцене: рисунок вписан в эту рамку целиком (масштаб комнаты — по size определения).
  frame: Object.freeze([176, 160]),
  floor: 176,
  rest: Object.freeze([200, 206]),
  seats: Object.freeze([
    Object.freeze({ id: 'cushion', title: 'Подушка', box: Object.freeze([-82, -24, 82, 26]), stage: 0, lift: 0 }),
    Object.freeze({ id: 'bed', title: 'Лежанка', box: Object.freeze([-98, -30, 98, 34]), stage: 3, lift: 4 }),
  ]),
  bowl: Object.freeze({ title: 'Миска', home: Object.freeze([170, 205]), box: Object.freeze([-25, -13, 25, 12]) }),
  fixed: Object.freeze([
    Object.freeze({ stage: 2, box: Object.freeze([58, 204, 129, 241]) }),
    Object.freeze({ stage: 2, box: Object.freeze([306, 196, 346, 238]) }),
    Object.freeze({ stage: 3, box: Object.freeze([304, 92, 386, 194]) }),
    Object.freeze({ stage: 4, box: Object.freeze([26, 96, 94, 196]) }),
  ]),
});

// Вещи ступеней штатного уголка (их рисует общая сцена веб-отображения) и подписи; mini — порядок вещи рядом с питомцем
// при празднике (меньше — раньше; без mini — не показывается).
export const cornerItems = Object.freeze([
  Object.freeze({ id: 'cushion', title: 'Подушка', stage: 0 }),
  Object.freeze({ id: 'mug', title: 'Кружка', stage: 2, mini: 1 }),
  Object.freeze({ id: 'notebook', title: 'Блокнот', stage: 2, mini: 1 }),
  Object.freeze({ id: 'bed', title: 'Лежанка', stage: 3, mini: 2 }),
  Object.freeze({ id: 'lamp', title: 'Лампа', stage: 3, mini: 1 }),
  Object.freeze({ id: 'plant', title: 'Растение', stage: 4, mini: 1 }),
  Object.freeze({ id: 'board', title: 'Доска с заметками', stage: 4, mini: 1 }),
]);
