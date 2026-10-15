// Ядро: комната уголка — геометрия и формат ключа room:v1 (docs/ARCHITECTURE.md § 6.4, § 13 «Геометрия комнаты»,
// «Формат комнаты», «Кормление у переставленной миски»; срез PL04.3). Перенесено из pet-room.mjs без изменения правил:
// место отдыха с питомцем, миска и игрушки — по животному и ступени; подушка и лежанка — одно логическое место (лежанка —
// с поправкой на размер, без записи). Координаты — единицы сцены 400×250, не CSS px: расстановка одна для любого экрана;
// точность 0,1 — одна в расчёте, показе, записи и чтении (сохранение не сдвигает). Предмет на полу, целиком в сцене и не
// закрывает больше четверти другого; недопустимое место — ближайшее допустимое (порядок поиска постоянный). Без DOM и без
// импорта рисунков: масштаб питомца — данные рисунка (figure.mjs). Редактор (черновик, перенос, сохранение) — editor.mjs;
// рисование и указатель — веб (pet-room.mjs).

import { PET_BOX, SCENE_PET } from './figure.mjs';

export const ROOM_VERSION = 1;
export const STEP = 10; // шаг кнопок и стрелок
export const OVERLAP = 0.25; // наибольшая доля меньшей рамки под другой
export const SCENE = [400, 250];
const FLOOR = 176; // линия пола
const EDGE = 4; // поле до края сцены сбоку; снизу — 2
const BED = 3; // ступень «Уютный штаб»: вместо подушки — лежанка, питомец на ней на 4 ниже
const BALL = 2; // «Наш ритуал»: мячик собаки

export const HOME = { rest: [200, 206], bowl: [170, 205], yarn: [36, 231], rope: [36, 233], ball: [283, 234] };
// Видимая рамка от точки предмета: [слева, сверху, справа, снизу] (замер рисунков).
const BOX = { bowl: [-25, -13, 25, 12], yarn: [-13, -11, 17, 14], rope: [-26, -8, 26, 10], ball: [-12, -12, 12, 14] };
const SEAT = { cushion: [-82, -24, 82, 26], bed: [-98, -30, 98, 34] };
// Питомец на подушке: весь рисунок и лицо с телом (без хвоста и низа лап — перед лапами можно ставить вещи).
const PET = { cat: { all: [-63, -154, 67, -9], core: [-60, -154, 32, -16] }, dog: { all: [-66, -145, 71, -6], core: [-64, -145, 28, -14] } };
// Поза «ест» без сдвига к миске: весь рисунок вместе с покачиванием головы, хвостом и кадрами перехода (замер в Chrome).
export const FEED = { cat: [-88, -114, 49, 0], dog: [-90, -102, 50, 0] };
// Масштаб питомца в сцене: рисунок 220×204 вписан в свою рамку сцены (176×160) целиком — по высоте (160 / 204).
export const PET_SCALE = Math.min(SCENE_PET.width / PET_BOX.width, SCENE_PET.height / PET_BOX.height);
// Неподвижные вещи ступеней: блокнот, кружка, лампа на столике, растение.
const FIXED = [
  [2, [58, 204, 129, 241]],
  [2, [306, 196, 346, 238]],
  [3, [304, 92, 386, 194]],
  [4, [26, 96, 94, 196]],
];
const TITLES = { bowl: 'Миска', yarn: 'Клубок', rope: 'Канат', ball: 'Мячик' };
export const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export const seatOf = (stage) => (stage >= BED ? 'bed' : 'cushion');
export const itemTitle = (id, stage) => (id === 'rest' ? (stage >= BED ? 'Лежанка' : 'Подушка') : TITLES[id]);

// Предметы по животному и ступени — снизу вверх по слоям.
export function roomItems(kind, stage) {
  return kind === 'dog' ? ['rest', 'bowl', 'rope', ...(stage >= BALL ? ['ball'] : [])] : ['rest', 'bowl', 'yarn'];
}

// ---------- хранение: { v, cat: { rest: { x, y }, … }, dog: { … } } ----------

const isObj = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const round = (v) => Math.round(v * 10) / 10;
export const grid = ([x, y]) => [round(x), round(y)];
// Та же точка сетки (0,1): то, что запишется и прочитается одинаково.
export const same = (a, b) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;

function readJson(text) {
  try {
    return JSON.parse(text ?? 'null');
  } catch {
    return null;
  }
}

// Точка (сетка 0,1): два конечных числа, иначе нет (предмет на исходном месте); далёкая — встанет на допустимое место.
export function readPoint(raw) {
  if (!isObj(raw) || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  return grid([Math.min(Math.max(raw.x, -1e4), 1e4), Math.min(Math.max(raw.y, -1e4), 1e4)]);
}

// Точки кота и собаки — только известные предметы (при любой версии ключа); остальное запись сохраняет как было.
export function parseRoom(text) {
  const raw = readJson(text);
  const room = { cat: {}, dog: {} };
  for (const kind of Object.keys(room)) {
    const own = isObj(raw?.[kind]) ? raw[kind] : {};
    for (const id of Object.keys(HOME)) {
      const p = readPoint(own[id]);
      if (p) room[kind][id] = p;
    }
  }
  return room;
}

// Запись: свежее сохранённое как есть (другое животное, чужие поля, вещи не открытых ступеней, неизвестные предметы,
// больший v) + новые места передвинутых предметов этого животного (moved — { id: [x, y] }). У точки меняются только x и y,
// остальные её поля остаются; на исходном месте у точки нет координат (только прочие поля, а пустая — удаляется). Точка не
// объект или kind не объект (непонятное значение) — передвинутый предмет заменяет его объектом.
export function roomRecord(text, kind, moved) {
  const raw = readJson(text);
  const keep = isObj(raw) ? raw : {};
  const own = isObj(keep[kind]) ? { ...keep[kind] } : {};
  for (const [id, p] of Object.entries(moved)) {
    const [x, y] = grid(p);
    const rest = isObj(own[id]) ? { ...own[id] } : {};
    delete rest.x;
    delete rest.y;
    if (!same([x, y], HOME[id])) own[id] = { ...rest, x, y };
    else if (Object.keys(rest).length) own[id] = rest;
    else delete own[id];
  }
  const out = { v: ROOM_VERSION, ...keep, [kind]: own };
  out.v = Number.isInteger(keep.v) && keep.v > ROOM_VERSION ? keep.v : ROOM_VERSION;
  return out;
}

// Функция записи ключа room в памяти ключа ядра (build операции, § 8.3): patch — { [kind]: { [id]: [x, y] } } (поля
// правки — пути 'cat.yarn'). Предмет, чьё место совпадает с сохранённым (та же точка сетки; без точки — исходное место),
// запись не трогает; животное без изменений — тоже. Остальное — roomRecord по каждому животному: неизвестные предметы,
// поля точек, другие животные и больший v остаются.
export function roomWrite(text, patch = {}) {
  const base = readJson(text);
  let current = text;
  let out = null;
  for (const [kind, moved] of Object.entries(isObj(patch) ? patch : {})) {
    const stored = isObj(base) && isObj(base[kind]) ? base[kind] : {};
    const changed = Object.fromEntries(
      Object.entries(isObj(moved) ? moved : {}).filter(([id, p]) => {
        if (!Object.hasOwn(HOME, id) || !Array.isArray(p)) return false;
        const was = readPoint(stored[id]);
        return was ? !same(grid(p), was) : !same(grid(p), HOME[id]) || stored[id] !== undefined;
      }),
    );
    if (!Object.keys(changed).length) continue;
    out = roomRecord(current, kind, changed);
    current = JSON.stringify(out);
  }
  if (out) return out;
  const keep = isObj(base) ? base : {};
  const kept = { v: ROOM_VERSION, ...keep };
  kept.v = Number.isInteger(keep.v) && keep.v > ROOM_VERSION ? keep.v : ROOM_VERSION;
  return kept;
}

// Что писать при «Сохранить»: предметы, которые передвигали в редакторе (ids), если их место отличается от сохранённого
// (saved — свежая расстановка). Остальные точки запись не трогает: место, показанное вместо непонятного значения, — не правка.
export function movedItems(pos, saved, ids = Object.keys(pos)) {
  return Object.fromEntries(ids.filter((id) => pos[id] && !(saved[id] && same(pos[id], saved[id]))).map((id) => [id, pos[id]]));
}

// ---------- геометрия ----------

const shift = ([l, t, r, b], [x, y]) => [l + x, t + y, r + x, b + y];
const area = ([l, t, r, b]) => Math.max(0, r - l) * Math.max(0, b - t);
const covers = (a, b) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]) > OVERLAP * Math.min(area(a), area(b));
const clampTo = (v, [lo, hi]) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));

// Рамки предмета в точке p: видимая (box) и незакрываемая (core; у места отдыха — лицо и тело питомца).
export function frames(layout, id, p) {
  if (id !== 'rest') {
    const box = shift(BOX[id], p);
    return { box, core: box };
  }
  const pet = PET[layout.kind] ?? PET.cat;
  const q = [p[0], p[1] + (layout.stage >= BED ? 4 : 0)];
  const seat = shift(SEAT[seatOf(layout.stage)], p);
  const all = shift(pet.all, q);
  return { seat, all, box: [Math.min(seat[0], all[0]), all[1], Math.max(seat[2], all[2]), seat[3]], core: shift(pet.core, q) };
}

// Пределы точки: целиком в сцене, на полу (у места отдыха — подушка или лежанка).
export function range(layout, id) {
  const [l, , r] = frames(layout, id, [0, 0]).box;
  const [, t, , b] = id === 'rest' ? SEAT[seatOf(layout.stage)] : BOX[id];
  return { x: [EDGE - l, SCENE[0] - EDGE - r], y: [FLOOR - t, SCENE[1] - 2 - b] };
}

// Допустимо ли место p предмета id среди остальных.
export function fits(layout, id, p) {
  const { x, y } = range(layout, id);
  if (p[0] < x[0] - 0.01 || p[0] > x[1] + 0.01 || p[1] < y[0] - 0.01 || p[1] > y[1] + 0.01) return false;
  const { core } = frames(layout, id, p);
  if (FIXED.some(([stage, box]) => layout.stage >= stage && covers(core, box))) return false;
  return Object.entries(layout.pos).every(([other, q]) => other === id || !covers(core, frames(layout, other, q).core));
}

// Ближайшее к want допустимое место — точка сетки 0,1, проверенная как есть (запись и чтение её не сдвигают): в пределах,
// затем рядом с шагом 0,1 (до 1 единицы: упор в соседний предмет, прежние записи у границы), затем кольца с шагом 2.
export function settle(layout, id, want) {
  const { x, y } = range(layout, id);
  const p = grid([clampTo(want[0], x), clampTo(want[1], y)]);
  if (fits(layout, id, p)) return p;
  return around(layout, id, p, 0.1, 10) ?? around(layout, id, p, 2, SCENE[0] / 2) ?? p;
}

// Кольца вокруг p с шагом step (rings колец, порядок постоянный): ближайшая допустимая точка сетки или null.
function around(layout, id, p, step, rings) {
  const { x, y } = range(layout, id);
  let best = null;
  let bestD = Infinity;
  const consider = (i, j) => {
    const q = grid([p[0] + i * step, p[1] + j * step]);
    const d = step * Math.hypot(i, j);
    if (d < bestD && q[0] >= x[0] && q[0] <= x[1] && q[1] >= y[0] && q[1] <= y[1] && fits(layout, id, q)) {
      best = q;
      bestD = d;
    }
  };
  for (let n = 1; n <= rings && n * step < bestD; n += 1) {
    for (let k = -n; k <= n; k += 1) {
      consider(k, -n);
      consider(k, n);
    }
    for (let k = -n + 1; k <= n - 1; k += 1) {
      consider(-n, k);
      consider(n, k);
    }
  }
  return best;
}

// Раскладка: сохранённые точки (или исходные) по слоям, каждая — на допустимом месте среди уже расставленных.
export function arrange(kind, stage, saved = {}) {
  const layout = { kind, stage, pos: {} };
  for (const id of roomItems(kind, stage)) layout.pos[id] = settle(layout, id, saved[id] ?? HOME[id]);
  return layout;
}

// Шаг кнопкой или стрелкой: на STEP в сторону dir, у преграды — сколько можно; некуда — null.
export function nudge(layout, id, dir) {
  const [dx, dy] = DIRS[dir];
  const p = layout.pos[id];
  const { x, y } = range(layout, id);
  for (let t = STEP; t >= 1; t -= 1) {
    const q = grid([clampTo(p[0] + dx * t, x), clampTo(p[1] + dy * t, y)]);
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= 0.5 && fits(layout, id, q)) return q;
  }
  return null;
}

// Те же предметы на тех же местах (та же точка сетки).
export const samePlaces = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([id, p]) => b[id] && same(p, b[id]));

// Область нажатия: видимая рамка не меньше min (единицы сцены; веб — 44 CSS px, переведённые по ширине сцены).
export function hitBox(layout, id, min = 0) {
  const [l, t, r, b] = frames(layout, id, layout.pos[id]).box;
  const w = Math.max(r - l, min) / 2;
  const h = Math.max(b - t, min) / 2;
  return [(l + r) / 2 - w, (t + b) / 2 - h, (l + r) / 2 + w, (t + b) / 2 + h];
}

// Предмет под точкой p: видимый рисунок — верхний по слоям; иначе увеличенные области — выбранный, затем ближайший.
export function pickAt(layout, p, selected = '', min = 0) {
  const ids = Object.keys(layout.pos);
  const inside = ([l, t, r, b]) => p[0] >= l && p[0] <= r && p[1] >= t && p[1] <= b;
  const visible = (id) => {
    const f = frames(layout, id, layout.pos[id]);
    return id === 'rest' ? inside(f.seat) || inside(f.all) : inside(f.box);
  };
  const seen = [...ids].reverse().find(visible);
  if (seen) return seen;
  const hits = ids.filter((id) => inside(hitBox(layout, id, min)));
  if (hits.includes(selected)) return selected;
  const dist = (id) => {
    const [l, t, r, b] = hitBox(layout, id);
    return Math.hypot(p[0] - (l + r) / 2, p[1] - (t + b) / 2);
  };
  return hits.sort((a, b) => dist(a) - dist(b))[0] ?? '';
}

// Сдвиг позы «ест» к миске (единицы рисунка питомца, PET_SCALE): голова — над миской, как на исходных местах (там сдвиг
// 0); весь рисунок позы (FEED) остаётся в сцене с полем EDGE — у самого края питомец подходит, насколько позволяет сцена;
// почти не сходит с пола. Расстановку не меняет.
export function feedShift(layout) {
  const bowl = layout.pos.bowl ?? HOME.bowl;
  const rest = layout.pos.rest ?? HOME.rest;
  const [l, t, r, b] = FEED[layout.kind] ?? FEED.cat;
  const lift = layout.stage >= BED ? 4 : 0;
  const x = clampTo(bowl[0] - HOME.bowl[0] + HOME.rest[0], [EDGE - l, SCENE[0] - EDGE - r]);
  const y = clampTo(bowl[1] - HOME.bowl[1] + HOME.rest[1], [Math.max(rest[1] - 20, EDGE - t - lift), Math.min(rest[1] + 36, SCENE[1] - 2 - b - lift)]);
  return [round((x - rest[0]) / PET_SCALE), round((y - rest[1]) / PET_SCALE)];
}
