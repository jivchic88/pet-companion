// Натив: общий уголок (этап PL10.2.1; docs/ARCHITECTURE.md § 7.4, § 12.2) — сцена комнаты в единицах 400×250 элементами
// react-native-svg: стена, окно, пол, коврик, место отдыха (подушка, с «Уютного штаба» — лежанка) и вещи ступеней штатного
// уголка (кружка, блокнот, лампа, растение, доска), миска лакомства. Рисунки — те же, что у общей сцены веба (cat-art.mjs:
// sceneSvg, seat, bowlArt; цвета светлой темы pet.css), не строка разметки. Своих правил нет: какие вещи открыты — по
// определению питомца (items.list, room.seats) и ступени снимка; места предметов — расстановка ядра (room.pos), сдвиг к
// миске — room.feedShift; геометрия — чистые функции ядра (core/room.mjs: seatOf). Свои вещи и игрушки питомца рисует его
// набор (Item), питомца — Figure набора; уголок (corner.mjs) кладёт их слоями: задний план, питомец, передний план.
// Модуль ничего не делает при импорте.

import { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { seatOf } from '../core/room.mjs';
import { SHARED_ROOM } from './kits.mjs';
import { bowlShape, h, move, tf } from './svg.mjs';

export const SCENE = Object.freeze([400, 250]);

// Цвета сцены — светлая тема pet.css (--cat-wall-top, --cat-wall, --cat-floor, …).
const C = Object.freeze({ wallTop: '#f3ece1', wall: '#ece2d3', floor: '#dccbb4', boardLine: '#cbb79c', rug: '#e6d7c2', rugEdge: '#d6c3a8', sky: '#dbe9ef', skyDot: '#f6d77f', skyHill: '#b9d0b1', frame: '#f8f4ed', steam: '#b3a99c' });

const round = (v) => Math.round(v * 10) / 10;

// Сдвиг предмета id от исходного места модели комнаты до места в расстановке pos (единицы сцены); нет места — 0.
export function itemShift(model, id, pos) {
  const home = Object.hasOwn(model.home, id) ? model.home[id] : null;
  const p = pos && Object.hasOwn(pos, id) ? pos[id] : null;
  return home && p ? [round(p[0] - home[0]), round(p[1] - home[1])] : [0, 0];
}

// Рамка рисунка питомца в сцене (единицы 400×250): место веба (sceneCatBox: x 114 = 200 − 176/2 + 2, y 46 = 206 − 160,
// с лежанкой — на lift ниже) от места отдыха расстановки, рисунок определения (size) вписан в рамку room.frame с сохранением
// пропорций по центру — масштаб model.scale ядра (roomModel). Не размеры кота: рамка, size и масштаб — из определения.
export function petBox(model, size, stage, pos) {
  const [fw, fh] = model.room.frame;
  const [dx, dy] = itemShift(model, 'rest', pos);
  const { width, height } = size;
  const w = width * model.scale;
  const ht = height * model.scale;
  const x = model.home.rest[0] - fw / 2 + 2 + dx + (fw - w) / 2;
  const y = model.home.rest[1] - fh + seatOf(model, stage).lift + dy + (fh - ht) / 2;
  return { x: round(x), y: round(y), width: round(w), height: round(ht), scale: model.scale };
}

// Вещи общего уголка, открытые на ступени stage, — по определению питомца (items.list).
export const sharedItems = (def, stage) => def.items.list.filter((item) => SHARED_ROOM.includes(item.id) && item.stage <= stage).map((item) => item.id);

// Рамки подсветки новой вещи общего уголка (единицы сцены).
const SHARED_BOX = Object.freeze({
  cushion: [114, 178, 286, 236],
  bed: [98, 172, 302, 244],
  mug: [300, 168, 350, 240],
  notebook: [54, 200, 132, 244],
  lamp: [300, 88, 390, 198],
  board: [276, 22, 376, 94],
  plant: [22, 94, 96, 198],
});

// Мягкая подсветка новой вещи (статичная — без анимации: смысл «новое» несёт и текст «Новое в уголке»).
export function freshGlow(key, box) {
  if (!box) return null;
  const [l, t, r, b] = box;
  return h(Ellipse, { key: `fresh-${key}`, cx: round((l + r) / 2), cy: round((t + b) / 2), rx: round((r - l) / 2 + 8), ry: round((b - t) / 2 + 6), fill: '#ffd98a', opacity: 0.42 });
}
export const sharedFreshBox = (id) => (Object.hasOwn(SHARED_BOX, id) ? SHARED_BOX[id] : null);

const ITEM_ART = {
  // Окно на стене (cat-art.mjs, ITEM_ART.window).
  pane: () =>
    h(
      G,
      { key: 'pane' },
      h(Rect, { x: 34, y: 24, width: 84, height: 74, rx: 8, strokeWidth: 5, fill: C.sky, stroke: C.frame }),
      h(Path, { d: 'M76 26V96M36 61H116', strokeWidth: 3.5, stroke: C.frame, fill: 'none' }),
      h(Circle, { cx: 98, cy: 40, r: 6, fill: C.skyDot }),
      h(Path, { d: 'M40 92Q58 82 74 90', fill: 'none', strokeWidth: 5, strokeLinecap: 'round', stroke: C.skyHill }),
      h(Rect, { x: 28, y: 96, width: 96, height: 7, rx: 3, fill: C.frame }),
    ),
  board: () =>
    h(
      G,
      { key: 'board' },
      h(Rect, { x: 280, y: 26, width: 92, height: 64, rx: 6, fill: '#c9a77c', stroke: '#8b6a47', strokeWidth: 3 }),
      h(Path, { d: 'M311 30V86M341 30V86', stroke: '#8b6a47', strokeWidth: 1.4, opacity: 0.6 }),
      h(Rect, { x: 287, y: 34, width: 17, height: 14, rx: 1.5, fill: '#f2d16b', transform: 'rotate(-4, 295, 41)' }),
      h(Rect, { x: 287, y: 53, width: 17, height: 14, rx: 1.5, fill: '#9fd0b6', transform: 'rotate(3, 295, 60)' }),
      h(Rect, { x: 317, y: 36, width: 17, height: 14, rx: 1.5, fill: '#f4a988', transform: 'rotate(5, 325, 43)' }),
      h(Rect, { x: 347, y: 35, width: 17, height: 14, rx: 1.5, fill: '#9fd0b6', transform: 'rotate(-3, 355, 42)' }),
      h(Rect, { x: 347, y: 54, width: 17, height: 14, rx: 1.5, fill: '#f2d16b', transform: 'rotate(4, 355, 61)' }),
      h(Path, { d: 'M350 61l3 3 6-7', fill: 'none', stroke: '#4d7a5a', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h(Circle, { cx: 295, cy: 35, r: 1.6, fill: '#b24a3a' }),
      h(Circle, { cx: 325, cy: 37, r: 1.6, fill: '#b24a3a' }),
      h(Circle, { cx: 355, cy: 36, r: 1.6, fill: '#b24a3a' }),
    ),
  plant: () =>
    h(
      G,
      { key: 'plant' },
      h(Path, { d: 'M50 150Q34 128 26 112Q44 118 54 140Z', fill: '#5f8f5a' }),
      h(Path, { d: 'M56 148Q52 118 60 96Q70 120 62 148Z', fill: '#6da266' }),
      h(Path, { d: 'M60 150Q78 126 94 120Q88 140 66 152Z', fill: '#4f7d4b' }),
      h(Path, { d: 'M54 150Q40 140 30 142Q42 152 56 154Z', fill: '#7cae6f' }),
      h(Path, { d: 'M60 148Q60 124 60 104M58 150Q46 132 34 118M62 151Q76 136 88 126', fill: 'none', stroke: '#3f6a3d', strokeWidth: 1.2, opacity: 0.7 }),
      h(Path, { d: 'M38 150H82L77 190Q76 196 70 196H50Q44 196 43 190Z', fill: '#c4683f', stroke: '#8f4527', strokeWidth: 2, strokeLinejoin: 'round' }),
      h(Rect, { x: 35, y: 147, width: 50, height: 9, rx: 3, fill: '#d67b51', stroke: '#8f4527', strokeWidth: 2 }),
    ),
  lamp: () =>
    h(
      G,
      { key: 'lamp' },
      h(Rect, { x: 304, y: 182, width: 82, height: 12, rx: 2.5, fill: '#4f7d72', stroke: '#2f5249', strokeWidth: 1.6 }),
      h(Rect, { x: 310, y: 170, width: 70, height: 12, rx: 2.5, fill: '#c9a26a', stroke: '#8b6a47', strokeWidth: 1.6 }),
      h(Path, { d: 'M316 176H374M310 188H380', stroke: '#ffffff', strokeWidth: 1, opacity: 0.35 }),
      h(Ellipse, { cx: 356, cy: 168, rx: 16, ry: 4, fill: '#3b3f46' }),
      h(Path, { d: 'M356 166L346 122L330 108', fill: 'none', stroke: '#3b3f46', strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h(Circle, { cx: 346, cy: 122, r: 3.4, fill: '#3b3f46' }),
      h(Path, { d: 'M318 92L342 110Q338 122 324 126L306 116Q308 100 318 92Z', fill: '#d9a441', stroke: '#9c6e1f', strokeWidth: 1.8, strokeLinejoin: 'round' }),
      h(Ellipse, { cx: 315, cy: 121, rx: 10, ry: 4.5, transform: 'rotate(32, 315, 121)', fill: '#fff4cf' }),
    ),
  notebook: () =>
    h(
      G,
      { key: 'notebook' },
      h(Path, { d: 'M58 214L112 204L128 226L72 237Z', fill: '#3f6b62', stroke: '#244640', strokeWidth: 2, strokeLinejoin: 'round' }),
      h(Path, { d: 'M72 237L128 226L128.5 229.5L73 240.5Z', fill: '#efe6d6', stroke: '#b9a991', strokeWidth: 1.2 }),
      h(Path, { d: 'M100 206.5L116 229', stroke: '#cf6741', strokeWidth: 2.6 }),
      h(Path, { d: 'M76 210L118 231', stroke: '#e5c37a', strokeWidth: 3, strokeLinecap: 'round' }),
      h(Path, { d: 'M76 210L72 207.6', stroke: '#3b3f46', strokeWidth: 3, strokeLinecap: 'round' }),
      h(Path, { d: 'M118 231L121 232.6', stroke: '#f0b9a5', strokeWidth: 3, strokeLinecap: 'round' }),
    ),
  mug: () =>
    h(
      G,
      { key: 'mug' },
      h(G, { fill: 'none', strokeWidth: 2, strokeLinecap: 'round', stroke: C.steam }, h(Path, { d: 'M316 196q-5-7 0-13t0-12' }), h(Path, { d: 'M326 198q-5-7 0-13t0-11' })),
      h(Path, { d: 'M306 204H336L333.5 232Q333 238 327 238H315Q309 238 308.5 232Z', fill: '#f2ead9', stroke: '#8b7b67', strokeWidth: 2, strokeLinejoin: 'round' }),
      h(Path, { d: 'M335 209Q346 209 346 218Q346 227 333.6 227', fill: 'none', stroke: '#8b7b67', strokeWidth: 3.2 }),
      h(Path, { d: 'M307.5 214H335', stroke: '#4f8a6e', strokeWidth: 4 }),
      h(Ellipse, { cx: 321, cy: 204.5, rx: 15, ry: 3, fill: '#7a5537' }),
    ),
};

// Место отдыха: задняя часть (под питомцем) и передняя (перед ним, у лежанки).
function seatArt(id) {
  if (id === 'bed') {
    return {
      back: [
        h(Ellipse, { key: 'b1', cx: 200, cy: 208, rx: 98, ry: 32, fill: '#b98a5a', stroke: '#7d5733', strokeWidth: 2.4 }),
        h(Ellipse, { key: 'b2', cx: 200, cy: 201, rx: 84, ry: 22, fill: '#efe3d0' }),
        h(Ellipse, { key: 'b3', cx: 200, cy: 204, rx: 72, ry: 16, fill: '#e2d2bb' }),
      ],
      front: [
        h(Path, { key: 'f1', d: 'M102 208Q104 236 200 240Q296 236 298 208Q284 228 200 230Q116 228 102 208Z', fill: '#c99863', stroke: '#7d5733', strokeWidth: 2.4, strokeLinejoin: 'round' }),
        h(Path, { key: 'f2', d: 'M122 220l10 8M146 226l8 7M172 229l6 8M200 231v8M228 229l-6 8M254 226l-8 7M278 220l-10 8', stroke: '#8d6340', strokeWidth: 2, strokeLinecap: 'round', opacity: 0.7 }),
        h(Path, { key: 'f3', d: 'M110 212Q200 236 290 212', fill: 'none', stroke: '#e2b98a', strokeWidth: 2, opacity: 0.6 }),
      ],
    };
  }
  return {
    back: [
      h(Path, { key: 'c1', d: 'M118 206C118 188 158 182 200 182C242 182 282 188 282 206C282 224 242 232 200 232C158 232 118 224 118 206Z', fill: '#8ea787', stroke: '#5c7558', strokeWidth: 2.4 }),
      h(Path, { key: 'c2', d: 'M126 204C130 192 164 188 200 188C236 188 270 192 274 204', fill: 'none', stroke: '#b6c8ae', strokeWidth: 2.4, opacity: 0.7 }),
      h(Path, { key: 'c3', d: 'M120 210Q200 236 280 210', fill: 'none', stroke: '#6f8a69', strokeWidth: 2, opacity: 0.7 }),
    ],
    front: [],
  };
}

// Задний план сцены (до питомца): стена, пол, окно, свет лампы, вещи у стены, коврик, место отдыха. room — { model, stage,
// pos, shared: открытые вещи общего уголка, fresh: новые вещи (подсветка), prefix }.
export function roomBack({ model, stage, pos, shared, fresh, prefix }) {
  const p = prefix;
  const has = (id) => shared.includes(id);
  const seat = seatOf(model, stage);
  const art = seatArt(seat.id);
  const [sx, sy] = itemShift(model, 'rest', pos);
  const glow = (id) => (fresh.includes(id) ? freshGlow(id, sharedFreshBox(id)) : null);
  return h(
    G,
    null,
    h(
      Defs,
      { key: 'defs' },
      h(
        LinearGradient,
        { id: `${p}-wall`, x1: '0', y1: '0', x2: '0', y2: '1' },
        h(Stop, { offset: '0', stopColor: C.wallTop }),
        h(Stop, { offset: '1', stopColor: C.wall }),
      ),
      h(
        RadialGradient,
        { id: `${p}-glow`, cx: '0.5', cy: '0.5', r: '0.5' },
        h(Stop, { offset: '0', stopColor: '#ffd98a', stopOpacity: 0.42 }),
        h(Stop, { offset: '0.45', stopColor: '#ffd98a', stopOpacity: 0.16 }),
        h(Stop, { offset: '1', stopColor: '#ffd98a', stopOpacity: 0 }),
      ),
      h(
        RadialGradient,
        { id: `${p}-rug`, cx: '0.5', cy: '0.5', r: '0.5' },
        h(Stop, { offset: '0', stopColor: C.rug }),
        h(Stop, { offset: '0.85', stopColor: C.rug }),
        h(Stop, { offset: '1', stopColor: C.rugEdge }),
      ),
    ),
    h(Rect, { key: 'wall', width: 400, height: 250, fill: `url(#${p}-wall)` }),
    h(Path, { key: 'floor', d: 'M0 176H400V250H0Z', fill: C.floor }),
    h(Path, { key: 'floor-line', d: 'M0 176H400', strokeWidth: 3, stroke: C.boardLine }),
    ITEM_ART.pane(),
    has('lamp') ? h(Ellipse, { key: 'lamp-glow', cx: 300, cy: 138, rx: 190, ry: 128, fill: `url(#${p}-glow)` }) : null,
    ...['board', 'plant', 'lamp'].filter(has).flatMap((id) => [glow(id), ITEM_ART[id]()]),
    h(Ellipse, { key: 'rug', cx: 200, cy: 216, rx: 150, ry: 26, fill: `url(#${p}-rug)` }),
    h(G, { key: 'seat', transform: tf(move(sx, sy)) }, glow(seat.id), ...art.back),
  );
}

// Передний план (после питомца): передний край лежанки, вещи на полу, миска (в уголке — когда можно угостить и после;
// корм — пока питомец ест), свои вещи набора по расстановке (own — [{ id, element }]).
export function roomFront({ model, stage, pos, shared, fresh, bowl, own }) {
  const seat = seatOf(model, stage);
  const art = seatArt(seat.id);
  const [sx, sy] = itemShift(model, 'rest', pos);
  const [bx, by] = itemShift(model, 'bowl', pos);
  const glow = (id) => (fresh.includes(id) ? freshGlow(id, sharedFreshBox(id)) : null);
  return h(
    G,
    null,
    art.front.length ? h(G, { key: 'seat-front', transform: tf(move(sx, sy)) }, ...art.front) : null,
    ...['notebook', 'mug'].filter((id) => shared.includes(id)).flatMap((id) => [glow(id), ITEM_ART[id]()]),
    bowl.shown ? h(G, { key: 'bowl', transform: tf(move(bx, by)) }, ...bowlShape(bowl.full)) : null,
    ...own.map(({ id, element }) => {
      const [dx, dy] = itemShift(model, id, pos);
      const box = model.box[id];
      return h(G, { key: `own-${id}`, transform: tf(move(dx, dy)) }, fresh.includes(id) && box ? freshGlow(id, [box[0] + model.home[id][0], box[1] + model.home[id][1], box[2] + model.home[id][0], box[3] + model.home[id][1]]) : null, element);
    }),
  );
}
