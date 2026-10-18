// Натив: общее для рисунков штатных наборов (этап PL10.1; docs/ARCHITECTURE.md § 7.4, § 12.2). Настоящие элементы
// react-native-svg (не строка разметки и не разбор SVG во время исполнения): преобразования суставов строками SVG
// (translate, rotate с центром, scale — их разбирает сам react-native-svg), градиенты, узор клетчатого платка, бейдж и
// миска лакомства. Геометрия — та же, что у веб-рисунков cat-art.mjs и dog-art.mjs, в тех же единицах рисунка 220×204;
// позы — таблицы чисел суставов (как переменные pet.css и dog.css), а не CSS. Модуль ничего не делает при импорте.

import { createElement } from 'react';
import { Circle, Ellipse, G, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

export const h = createElement;

// Числа преобразований — без длинных хвостов дробей.
const n = (value) => Math.round(value * 1000) / 1000;
// Части преобразования: пустая строка — тождество; tf склеивает непустые. Тождество — явная строка, не undefined:
// react-native-svg (Fabric) при снятии свойства transform не сбрасывает прежнюю матрицу — сустав, вернувшийся в исходное
// положение (платок после позы «ест»), остался бы сдвинутым. Найдено в iOS Simulator (PL10.1).
export const IDENTITY = 'translate(0, 0)';
export const tf = (...parts) => parts.filter(Boolean).join(' ') || IDENTITY;
export const move = (x = 0, y = 0) => (x || y ? `translate(${n(x)}, ${n(y)})` : '');
export const turn = (angle, cx, cy) => (angle ? `rotate(${n(angle)}, ${cx}, ${cy})` : '');
export const grow = (sx, sy, cx, cy) => (sx !== 1 || sy !== 1 ? `translate(${cx}, ${cy}) scale(${n(sx)}, ${n(sy)}) translate(${-cx}, ${-cy})` : '');
export const stretchY = (sy, cx, cy) => grow(1, sy, cx, cy);

// Градиенты: stops — [смещение, цвет, непрозрачность?].
const stops = (list) => list.map(([offset, color, opacity], i) => h(Stop, { key: i, offset, stopColor: color, stopOpacity: opacity ?? 1 }));
export const linear = (id, attrs, list) => h(LinearGradient, { id, ...attrs }, stops(list));
export const radial = (id, attrs, list) => h(RadialGradient, { id, ...attrs }, stops(list));

// Платок — общий для кота и собаки и для всех обликов.
export const SCARF = Object.freeze({ scarf: '#cf6741', light: '#e58a5f', dark: '#9e4528' });

// Градиент платка, клетчатый узор и тень под лапами (id — с префиксом экземпляра рисунка).
export function sharedDefs(p) {
  return [
    linear(`${p}-scarf`, { key: 'scarf', x1: '0%', y1: '0%', x2: '40%', y2: '100%' }, [
      ['0', SCARF.light],
      ['0.55', SCARF.scarf],
      ['1', SCARF.dark],
    ]),
    h(
      Pattern,
      { key: 'plaid', id: `${p}-plaid`, patternUnits: 'userSpaceOnUse', x: 0, y: 0, width: 7, height: 7, patternTransform: 'rotate(18)' },
      h(Rect, { width: 7, height: 7, fill: SCARF.scarf }),
      h(Rect, { width: 7, height: 2, y: 2.5, fill: '#f2d6bf', opacity: 0.55 }),
      h(Rect, { width: 2, height: 7, x: 2.5, fill: '#f2d6bf', opacity: 0.55 }),
      h(Rect, { width: 7, height: 0.8, y: 6, fill: SCARF.dark, opacity: 0.7 }),
      h(Rect, { width: 0.8, height: 7, x: 6, fill: SCARF.dark, opacity: 0.7 }),
    ),
    radial(`${p}-ground`, { key: 'ground', cx: '50%', cy: '50%', r: '50%' }, [
      ['0', '#1d2024', 0.3],
      ['0.6', '#1d2024', 0.12],
      ['1', '#1d2024', 0],
    ]),
  ];
}

// Заливка платка по надетому аксессуару: клетчатый — узор, остальные — градиент.
export const scarfFill = (p, accessory) => (accessory === 'plaid' ? `url(#${p}-plaid)` : `url(#${p}-scarf)`);

// Бейдж на платке: верхний левый угол (x, y), поворот angle вокруг (cx, cy) — у кота и собаки свои места.
export function badge(x, y, angle, cx, cy) {
  const dot = (dx, dy, r) => h(Circle, { cx: n(x + dx), cy: n(y + dy), r, fill: '#c97566' });
  return h(
    G,
    { transform: tf(turn(angle, cx, cy)) },
    h(Rect, { x, y, width: 15, height: 18, rx: 2.5, fill: '#f7f1e6', stroke: '#8b6f5e', strokeWidth: 1.2 }),
    h(Rect, { x, y, width: 15, height: 5, rx: 2, fill: '#4f8a6e' }),
    h(Rect, { x: n(x + 5), y: n(y - 2.5), width: 5, height: 4, rx: 1, fill: '#b9bcc2', stroke: '#7d8189', strokeWidth: 0.8 }),
    dot(7.5, 12, 2.3),
    dot(4.1, 8.6, 1.1),
    dot(6.5, 7.4, 1.1),
    dot(9.1, 7.4, 1.1),
    dot(11.1, 8.8, 1.1),
  );
}

// Миска лакомства — рисунок миски веба (cat-art.mjs, BOWL и FOOD) в единицах сцены 400×250, на исходном месте (170, 205):
// корм — пока питомец ест (full). Уголок (room.mjs) ставит её на место из расстановки ядра.
export function bowlShape(full) {
  return [
    h(Ellipse, { key: 'shade', cx: 170, cy: 213, rx: 25, ry: 4.2, fill: '#3a2414', opacity: 0.16 }),
    h(Path, { key: 'body', d: 'M147.5 200.5Q149.5 212.5 158 213.5H182Q190.5 212.5 192.5 200.5Z', fill: '#4f8a6e', stroke: '#2f5249', strokeWidth: 2, strokeLinejoin: 'round' }),
    h(Path, { key: 'shine', d: 'M150.5 206.5Q170 210.5 189.5 206.5', fill: 'none', stroke: '#f2ead9', strokeWidth: 2, strokeLinecap: 'round', opacity: 0.55 }),
    h(Ellipse, { key: 'rim', cx: 170, cy: 200.5, rx: 22.5, ry: 5.2, fill: '#6aa58a', stroke: '#2f5249', strokeWidth: 2 }),
    h(Ellipse, { key: 'inside', cx: 170, cy: 200.8, rx: 18, ry: 3.4, fill: '#2f5249' }),
    full
      ? h(
          G,
          { key: 'food' },
          h(Path, { d: 'M153.5 200.8Q156 193.5 162 194Q166 190.5 171 192.5Q177 190 180 194.5Q185.5 195 186.5 200.8Z', fill: '#b0743f', stroke: '#7a4a22', strokeWidth: 1.4, strokeLinejoin: 'round' }),
          h(Circle, { cx: 161, cy: 196.6, r: 2.1, fill: '#d39a5e' }),
          h(Circle, { cx: 170.5, cy: 194.6, r: 2.2, fill: '#d39a5e' }),
          h(Circle, { cx: 178.6, cy: 197, r: 2, fill: '#d39a5e' }),
        )
      : null,
  ];
}

// Мячик — рисунок мячика веба (dog-art.mjs, ballArt) в единицах сцены 400×250, на исходном месте (283, 233): тень и сам
// мячик отдельно (в «Поиграть» мячик поворачивается на пройденный путь, тень — нет). Его рисуют вещь собаки в уголке
// (dog.mjs) и предмет «Поиграть» (play.mjs) — один рисунок.
export function ballShape() {
  return {
    shadow: [h(Ellipse, { key: 'shade', cx: 283, cy: 244.5, rx: 11.5, ry: 2.8, fill: '#3a2414', opacity: 0.18 })],
    body: [
      h(Circle, { key: 'ball', cx: 283, cy: 233, r: 11, fill: '#e3b94a', stroke: '#9a7420', strokeWidth: 2 }),
      h(Path, { key: 'seam', d: 'M273.8 227.4Q283 233 292.2 227.4M273.8 238.6Q283 233 292.2 238.6', fill: 'none', stroke: '#f8edd0', strokeWidth: 2.2, strokeLinecap: 'round' }),
      h(Ellipse, { key: 'shine', cx: 279, cy: 228.2, rx: 3, ry: 1.8, fill: '#ffffff', opacity: 0.45 }),
    ],
  };
}

// Окна рисунков предметов «Поиграть» (viewBox, как bowlToySvg и ballToySvg веба): миска — пустая, мячик — с тенью.
export const TOY_VIEW = Object.freeze({ bowl: '144 193 52 25', ball: '270 220 26 28' });

// Миска у передних лап отдельного рисунка (поза «ест» — с кормом, «доволен после лакомства» — пустая): та же миска в рамке
// рисунка питомца. В сцене комнаты (свойство room рисунка) миску рисует уголок — на её месте из расстановки.
export function bowl(full) {
  return h(G, { transform: 'translate(-120, -14)' }, ...bowlShape(full));
}

// Сдвиг всего рисунка: отдельно — по таблице позы (P.allX, P.allY); в сцене комнаты поза «ест» идёт к миске, как веб
// (pet.css, dog.css: --all-x = --feed-x − 30, --all-y = --feed-y + 12; feed — room.feedShift ядра в единицах рисунка).
export const ROOM_FEED = Object.freeze([-30, 12]);
export function bodyShift(P, pose, room) {
  if (!room || pose !== 'feed') return [P.allX, P.allY];
  const [x, y] = Array.isArray(room.feed) ? room.feed : [0, 0];
  return [ROOM_FEED[0] + (Number(x) || 0), ROOM_FEED[1] + (Number(y) || 0)];
}

// Префикс id внутри рисунка: только латиница, цифры и дефис (useId React даёт «:r1:» — двоеточия в url(#…) недопустимы).
export const idPrefix = (prefix, fallback) => `${String(prefix ?? '').replace(/[^a-z0-9-]/gi, '') || fallback}-${fallback}`;
