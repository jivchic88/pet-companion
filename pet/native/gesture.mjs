// Натив: распознавание жестов «Поиграть» и геометрия сцены (этап PL10.2.2; README, «Нативное отображение»;
// docs/ARCHITECTURE.md § 6.4 «Жест поглаживания — граница», § 12.2). Без React и React Native: чистые функции и автомат
// одного жеста — их проверяют напрямую. Смысл жестов — ядро (stroke.*, interact({ type: 'paw' }), toy.*): лимиты, удержание
// позы, итог, места предметов, докат и близость миски; здесь — только пороги в точках экрана, попадание в области
// определения и перевод точек экрана в единицы рисунка и обратно. Та же семантика, что у веба (pet-play.mjs, pet-toys.mjs),
// в точках экрана React Native вместо CSS px; веб-модули натив не импортирует.
//
// Пороги (точки экрана RN — не физические пиксели и не единицы рисунка; значения — как CSS px веба 0.1.4):
//   STROKE_PT — сдвиг от начала жеста или прошлого отклика до следующего stroke.step;
//   TAP_PT — касание питомца без сдвига (только подсказка «проведи», не поглаживание; к порогу поглаживания не относится);
//   TAP_MS, PAW_SLOP_PT — короткое касание лапы: не дольше и не дальше; PAW_MIN_PT — наименьший радиус области лапы (44×44);
//   MOVE_PT — начало заметного переноса предмета; ROLL_PT — бросок мячика влево или вправо; TOY_MIN_PT — область предмета;
//   EDGE_PT — поле пола до края сцены.
//
// Геометрия (playLayout): сцена — прямоугольник, измеренный onLayout; питомец — рамка определения (size), по ширине сцены и
// свободной высоте (88 % ширины, не больше 440 точек — как веб), под ним полоса пола (20…64 точки) и строка реплики;
// пол ядру — [l, t, r, b] в единицах рисунка (рамка питомца — начало координат) и радиус касания лапы в тех же единицах.
// Нулевой, скрытый или неизмеренный размер — null: ни пола, ни ввода по прежней геометрии.

import { SIZE } from '../core/toys.mjs';

export const STROKE_PT = 24;
export const TAP_PT = 4;
export const TAP_MS = 500;
export const PAW_SLOP_PT = 10;
export const PAW_MIN_PT = 22;
export const MOVE_PT = 6;
export const ROLL_PT = 16;
export const TOY_MIN_PT = 44;
export const EDGE_PT = 8;
const FLOOR = [20, 64];
const PET_SHARE = 0.88;
const PET_MAX = 440;
const GAP = 4;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const r3 = (value) => Math.round(value * 1000) / 1000;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Геометрия сцены по её размеру box ({ width, height } в точках), определению показанного питомца def (size) и высоте
// строки реплики phrase. Возвращает null, если размер не измерен, нулевой или пол вырождается (l ≥ r, t ≥ b).
export function playLayout(box, def, phrase = 0) {
  const width = box?.width;
  const height = box?.height;
  const line = finite(phrase) && phrase > 0 ? phrase : 0;
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0) return null;
  const { width: dw, height: dh } = def.size;
  const room = height - line - GAP;
  const wide = Math.min(width * PET_SHARE, PET_MAX);
  const floor = Math.min(FLOOR[1], Math.max(FLOOR[0], room - (wide * dh) / dw));
  const w = Math.min(wide, ((room - floor) * dw) / dh);
  if (!finite(w) || w <= 0) return null;
  const h = (w * dh) / dw;
  const s = w / dw;
  const top = Math.max(0, (height - (h + floor + GAP + line)) / 2);
  const left = (width - w) / 2;
  const playFloor = [(EDGE_PT - left) / s, -top / s, (width - EDGE_PT - left) / s, (h + floor) / s].map(r3);
  const playTouch = r3(PAW_MIN_PT / s);
  if (!playFloor.every(finite) || !(playFloor[0] < playFloor[2]) || !(playFloor[1] < playFloor[3]) || !finite(playTouch) || !(s > 0)) return null;
  return Object.freeze({
    width,
    height,
    s,
    pet: Object.freeze({ left, top, width: w, height: h }),
    floor: Object.freeze({ top: top + h, height: floor }),
    phrase: Object.freeze({ top: top + h + floor + GAP, height: line }),
    playFloor: Object.freeze(playFloor),
    playTouch,
    key: [width, height, line, dw, dh].map(r3).join(','),
  });
}

// Точка сцены (точки экрана) → единицы рисунка и обратно.
export const toUnits = (L, [x, y]) => [(x - L.pet.left) / L.s, (y - L.pet.top) / L.s];
export const toPoints = (L, [u, v]) => [L.pet.left + u * L.s, L.pet.top + v * L.s];

// Область лапы показанной позы: у поднятой (поза paw и play.paw.up определения) — поднятая; без лапы — null.
export const pawArea = (def, pose) => (pose === 'paw' && def.play.paw?.up ? def.play.paw.up : def.play.paw);

// Часть питомца в точке рисунка [u, v]: 'paw' (первой; радиус не меньше minR единиц), 'head', 'body' — части play.hits
// определения, или ''.
export function partAt(def, [u, v], pose = '', minR = 0) {
  const paw = pawArea(def, pose);
  if (paw && Math.hypot(u - paw.cx, v - paw.cy) <= Math.max(paw.r, minR)) return 'paw';
  return def.play.hits.find((e) => ((u - e.cx) / e.rx) ** 2 + ((v - e.cy) / e.ry) ** 2 <= 1)?.part ?? '';
}

// Рамка предмета toy с центром at (единицы рисунка): рисунок w × h и область касания не меньше TOY_MIN_PT (точки сцены).
export function toyBox(L, toy, at) {
  const [w, h] = SIZE[toy].map((value) => value * L.s);
  const [x, y] = toPoints(L, at);
  const width = Math.max(w, TOY_MIN_PT);
  const height = Math.max(h, TOY_MIN_PT);
  return { x, y, w, h, left: x - width / 2, top: y - height / 2, width, height };
}
const inside = (box, [x, y]) => x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height;

// Что под точкой сцены: предмет (мячик над миской — он нарисован поверх), иначе часть питомца, иначе null. drawn — где
// предметы нарисованы сейчас ({ bowl, ball } в единицах рисунка или null), pose — нарисованная поза.
export function targetAt(L, def, pose, point, drawn) {
  for (const toy of ['ball', 'bowl']) {
    const at = drawn?.[toy];
    if (at && inside(toyBox(L, toy, at), point)) return { kind: 'toy', toy, at: [...at] };
  }
  const part = partAt(def, toUnits(L, point), pose, PAW_MIN_PT / L.s);
  return part ? { kind: 'pet', part } : null;
}

// Автомат одного жеста экземпляра. hooks: start() → id жеста ядра или null; step(id); end(id); cancel(id); paw() — касание
// лапы; drag(toy, [u, v]) → начат ли перенос; drop(roll?) — отпустили после заметного сдвига; toyCancel(); moved() — миска
// под пальцем сдвинулась не меньше MOVE_PT; nudge() — касание питомца без сдвига (подсказка). Палец — номер касания
// (identifier): чужие пальцы ничего не меняют. Снятый жест (cancel, ядро сняло сам — lost) «мёртв» до отпускания своего
// пальца: позднее движение и отпускание ничего не вызывают. Всё — синхронно, без таймеров.
export function createGesture(hooks) {
  let g = null;

  function begin({ touch, point, time, target, scale }) {
    if (g || !target) return false;
    if (target.kind === 'toy') {
      g = { touch, kind: 'toy', toy: target.toy, p0: point, from: target.at, scale, on: false, d: [0, 0], dead: false, starting: true };
      let ok = false;
      try {
        ok = hooks.drag(target.toy, target.at) === true;
      } finally {
        g.starting = false;
      }
      if (!ok) g.dead = true;
      return true;
    }
    g = { touch, kind: target.part === 'paw' ? 'paw' : 'pet', p0: point, anchor: point, far: 0, t0: time, id: null, dead: false, starting: true };
    try {
      g.id = hooks.start() ?? null;
    } finally {
      g.starting = false;
    }
    return true;
  }

  // Движение своего пальца. hit(point) — часть питомца под точкой (текущая геометрия и поза); scale — текущий масштаб.
  function move({ touch, point, hit, scale }) {
    if (!g || g.touch !== touch || g.dead) return null;
    if (g.kind === 'toy') {
      g.d = [point[0] - g.p0[0], point[1] - g.p0[1]];
      if (!g.on && Math.hypot(g.d[0], g.d[1]) < MOVE_PT) return null;
      g.on = true;
      const k = scale ?? g.scale;
      hooks.drag(g.toy, [g.from[0] + g.d[0] / k, g.from[1] + g.d[1] / k]);
      return 'drag';
    }
    // С лапы — касание: сдвиг дальше допуска — ни касание, ни поглаживание.
    if (g.kind === 'paw') {
      if (dist(point, g.p0) > PAW_SLOP_PT) return cancel('slop');
      return null;
    }
    if (!hit(point)) return cancel('leave');
    g.far = Math.max(g.far, dist(point, g.p0));
    if (dist(point, g.anchor) < STROKE_PT) return null;
    g.anchor = point;
    if (g.id !== null) hooks.step(g.id);
    return 'step';
  }

  // Отпустили свой палец. Возвращает итог распознавания (для журнала и проверок).
  function end({ touch, point, time, hit }) {
    if (!g || g.touch !== touch) return null;
    const was = g;
    g = null;
    if (was.dead) return 'dead';
    if (was.kind === 'toy') {
      if (was.on && was.toy === 'bowl' && hooks.moved()) {
        hooks.drop();
        return 'drop';
      }
      if (was.on && was.toy === 'ball' && Math.abs(was.d[0]) >= ROLL_PT) {
        hooks.drop(was.d[0] / was.scale);
        return 'roll';
      }
      hooks.toyCancel();
      return 'cancel';
    }
    const tap = was.kind === 'paw' && time - was.t0 <= TAP_MS && dist(point, was.p0) <= PAW_SLOP_PT && hit(point) === 'paw';
    if (was.id !== null) hooks.end(was.id);
    if (tap) {
      hooks.paw();
      return 'paw';
    }
    if (was.kind === 'pet' && was.far < TAP_PT) {
      hooks.nudge();
      return 'tap';
    }
    return 'end';
  }

  // Отмена отображением (уход с питомца, сдвиг с лапы, система, раскладка, вид, отключение): ядру — отмена своего жеста;
  // жест мёртв до отпускания пальца. Повтор — ничего.
  function cancel(reason = 'cancel') {
    if (!g || g.dead) return null;
    g.dead = true;
    if (g.kind === 'toy') hooks.toyCancel();
    else if (g.id !== null) hooks.cancel(g.id);
    return reason;
  }

  // Ядро сняло жест само (снимок play: нет своего stroke или drag) — без команд ядру; во время начала — ничего.
  function sync(play) {
    if (!g || g.dead || g.starting) return false;
    const lost = g.kind === 'toy' ? play?.drag?.toy !== g.toy : g.id !== null && play?.stroke?.id !== g.id;
    if (lost) g.dead = true;
    return lost;
  }

  // Сменилось то, при чём ядро снимает жест само (питомец, облик, вид, присутствие, видимость, отключение): мёртв без команд.
  function abort() {
    if (!g || g.dead || g.starting) return false;
    g.dead = true;
    return true;
  }

  // Ядро недоступно или палец ушёл без отпускания (система забрала касание после cancel): забыть без команд.
  function forget() {
    g = null;
  }

  return Object.freeze({
    begin,
    move,
    end,
    cancel,
    sync,
    abort,
    forget,
    active: () => g !== null,
    live: () => g !== null && !g.dead,
    touch: () => g?.touch ?? null,
    kind: () => g?.kind ?? '',
    id: () => g?.id ?? null,
  });
}
