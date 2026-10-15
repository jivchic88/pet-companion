// Ядро: комната уголка — геометрия и формат ключа room:v1 (docs/ARCHITECTURE.md § 6.4, § 7.1 «room», § 13 «Геометрия
// комнаты», «Формат комнаты», «Кормление у переставленной миски»; срезы PL04.3, PL06). Правила 0.1.4 без изменений: место
// отдыха с питомцем, миска и игрушки — по питомцу и ступени; место отдыха — одно логическое место (с ступени места
// побольше — оно, с поправкой по высоте, без записи). Данные — у определения питомца (room: общая мебель уголка,
// pet/defs/room.mjs, и его рамки и игрушки; масштаб — по size): здесь только правила над ними (model — roomModel).
// Координаты — единицы сцены 400×250, не CSS px: расстановка одна для любого экрана; точность 0,1 — одна в расчёте,
// показе, записи и чтении (сохранение не сдвигает). Предмет на полу, целиком в сцене и не закрывает больше четверти
// другого; недопустимое место — ближайшее допустимое (порядок поиска постоянный). Без DOM и без импорта рисунков.
// Редактор (черновик, перенос, сохранение) — editor.mjs; рисование и указатель — веб (pet-room.mjs).

export const ROOM_VERSION = 1;
export const STEP = 10; // шаг кнопок и стрелок
export const OVERLAP = 0.25; // наибольшая доля меньшей рамки под другой
export const SCENE = [400, 250];
const EDGE = 4; // поле до края сцены сбоку; снизу — 2
export const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

// Модель комнаты питомца из определения (def — PetDefinition): общая мебель, рамки питомца и позы «ест», свои игрушки,
// масштаб рисунка в сцене (рамка room.frame вмещает size целиком) и исходные места предметов.
export function roomModel(def) {
  const room = def.room;
  const scale = Math.min(room.frame[0] / def.size.width, room.frame[1] / def.size.height);
  const toys = room.toys;
  return Object.freeze({
    pet: def.id,
    room,
    scale,
    toys,
    home: Object.freeze({ rest: room.rest, bowl: room.bowl.home, ...Object.fromEntries(toys.map((toy) => [toy.id, toy.home])) }),
    box: Object.freeze({ bowl: room.bowl.box, ...Object.fromEntries(toys.map((toy) => [toy.id, toy.box])) }),
  });
}

// Место отдыха на ступени: последнее из room.seats, открытое ступенью.
export const seatOf = (model, stage) => [...model.room.seats].reverse().find((seat) => seat.stage <= stage) ?? model.room.seats[0];
export function itemTitle(model, id, stage) {
  if (id === 'rest') return seatOf(model, stage).title;
  if (id === 'bowl') return model.room.bowl.title;
  return model.toys.find((toy) => toy.id === id)?.title ?? '';
}

// Предметы питомца на ступени — снизу вверх по слоям: место отдыха, миска, свои игрушки открытых ступеней.
export const roomItems = (model, stage) => ['rest', 'bowl', ...model.toys.filter((toy) => toy.stage <= stage).map((toy) => toy.id)];

// ---------- хранение: { v, [petId]: { rest: { x, y }, … } } ----------

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

// Точки питомцев models ({ [petId]: roomModel }) — только известные им предметы (при любой версии ключа); остальное запись
// сохраняет как было. Поле питомца — собственное поле объекта (ID с точкой — одно поле).
export function parseRoom(text, models) {
  const raw = readJson(text);
  const room = {};
  for (const [pet, model] of Object.entries(models)) {
    room[pet] = {};
    const own = isObj(raw) && Object.hasOwn(raw, pet) && isObj(raw[pet]) ? raw[pet] : {};
    for (const id of Object.keys(model.home)) {
      const p = Object.hasOwn(own, id) ? readPoint(own[id]) : null;
      if (p) room[pet][id] = p;
    }
  }
  return room;
}

// Запись: свежее сохранённое как есть (другие питомцы, чужие поля, вещи не открытых ступеней, неизвестные предметы,
// больший v) + новые места передвинутых предметов питомца pet (moved — { id: [x, y] }); home — его исходные места. У точки
// меняются только x и y, остальные её поля остаются; на исходном месте у точки нет координат (только прочие поля, а пустая
// — удаляется). Точка не объект или поле питомца не объект (непонятное значение) — передвинутый предмет заменяет его
// объектом.
export function roomRecord(text, pet, moved, home) {
  const raw = readJson(text);
  const keep = isObj(raw) ? raw : {};
  const own = Object.hasOwn(keep, pet) && isObj(keep[pet]) ? { ...keep[pet] } : {};
  for (const [id, p] of Object.entries(moved)) {
    const [x, y] = grid(p);
    const rest = Object.hasOwn(own, id) && isObj(own[id]) ? { ...own[id] } : {};
    delete rest.x;
    delete rest.y;
    if (!(Object.hasOwn(home, id) && same([x, y], home[id]))) own[id] = { ...rest, x, y };
    else if (Object.keys(rest).length) own[id] = rest;
    else delete own[id];
  }
  const out = { v: ROOM_VERSION, ...keep };
  Object.defineProperty(out, pet, { value: own, enumerable: true, writable: true, configurable: true });
  out.v = Number.isInteger(keep.v) && keep.v > ROOM_VERSION ? keep.v : ROOM_VERSION;
  return out;
}

// Функция записи ключа room в памяти ключа ядра (build операции, § 8.3): patch — { [petId]: { [id]: [x, y] } } (поля
// правки — пути [petId, id]); homes — { [petId]: исходные места } зарегистрированных питомцев. Предмет, чьё место
// совпадает с сохранённым (та же точка сетки; без точки — исходное место), запись не трогает; питомец без изменений —
// тоже. Остальное — roomRecord по каждому питомцу: неизвестные предметы, поля точек, другие питомцы и больший v остаются.
export function roomWrite(text, patch, homes) {
  const base = readJson(text);
  let current = text;
  let out = null;
  for (const [pet, moved] of Object.entries(isObj(patch) ? patch : {})) {
    const home = Object.hasOwn(homes, pet) ? homes[pet] : null;
    if (!home) continue;
    const stored = isObj(base) && Object.hasOwn(base, pet) && isObj(base[pet]) ? base[pet] : {};
    const changed = Object.fromEntries(
      Object.entries(isObj(moved) ? moved : {}).filter(([id, p]) => {
        if (!Object.hasOwn(home, id) || !Array.isArray(p)) return false;
        const was = Object.hasOwn(stored, id) ? readPoint(stored[id]) : null;
        return was ? !same(grid(p), was) : !same(grid(p), home[id]) || (Object.hasOwn(stored, id) && stored[id] !== undefined);
      }),
    );
    if (!Object.keys(changed).length) continue;
    out = roomRecord(current, pet, changed, home);
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
// layout — { model, stage, pos }: модель комнаты питомца, ступень и места предметов.

const shift = ([l, t, r, b], [x, y]) => [l + x, t + y, r + x, b + y];
const area = ([l, t, r, b]) => Math.max(0, r - l) * Math.max(0, b - t);
const covers = (a, b) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]) > OVERLAP * Math.min(area(a), area(b));
const clampTo = (v, [lo, hi]) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));

// Рамки предмета в точке p: видимая (box) и незакрываемая (core; у места отдыха — лицо и тело питомца).
export function frames(layout, id, p) {
  const { model } = layout;
  if (id !== 'rest') {
    const box = shift(model.box[id], p);
    return { box, core: box };
  }
  const seat = seatOf(model, layout.stage);
  const q = [p[0], p[1] + seat.lift];
  const place = shift(seat.box, p);
  const all = shift(model.room.pet.all, q);
  return { seat: place, all, box: [Math.min(place[0], all[0]), all[1], Math.max(place[2], all[2]), place[3]], core: shift(model.room.pet.core, q) };
}

// Пределы точки: целиком в сцене, на полу (у места отдыха — его место).
export function range(layout, id) {
  const [l, , r] = frames(layout, id, [0, 0]).box;
  const [, t, , b] = id === 'rest' ? seatOf(layout.model, layout.stage).box : layout.model.box[id];
  return { x: [EDGE - l, SCENE[0] - EDGE - r], y: [layout.model.room.floor - t, SCENE[1] - 2 - b] };
}

// Допустимо ли место p предмета id среди остальных.
export function fits(layout, id, p) {
  const { x, y } = range(layout, id);
  if (p[0] < x[0] - 0.01 || p[0] > x[1] + 0.01 || p[1] < y[0] - 0.01 || p[1] > y[1] + 0.01) return false;
  const { core } = frames(layout, id, p);
  if (layout.model.room.fixed.some((item) => layout.stage >= item.stage && covers(core, item.box))) return false;
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
export function arrange(model, stage, saved = {}) {
  const layout = { model, stage, pos: {} };
  for (const id of roomItems(model, stage)) layout.pos[id] = settle(layout, id, (Object.hasOwn(saved, id) ? saved[id] : null) ?? model.home[id]);
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

// Сдвиг позы «ест» к миске (единицы рисунка питомца, model.scale): голова — над миской, как на исходных местах (там сдвиг
// 0); весь рисунок позы (room.feed) остаётся в сцене с полем EDGE — у самого края питомец подходит, насколько позволяет
// сцена; почти не сходит с пола. Расстановку не меняет.
export function feedShift(layout) {
  const { model } = layout;
  const bowl = layout.pos.bowl ?? model.home.bowl;
  const rest = layout.pos.rest ?? model.home.rest;
  const [l, t, r, b] = model.room.feed;
  const lift = seatOf(model, layout.stage).lift;
  const x = clampTo(bowl[0] - model.home.bowl[0] + model.home.rest[0], [EDGE - l, SCENE[0] - EDGE - r]);
  const y = clampTo(bowl[1] - model.home.bowl[1] + model.home.rest[1], [Math.max(rest[1] - 20, EDGE - t - lift), Math.min(rest[1] + 36, SCENE[1] - 2 - b - lift)]);
  return [round((x - rest[0]) / model.scale), round((y - rest[1]) / model.scale)];
}
