// Ядро: миска и мячик в «Поиграть» — правила положения в единицах рисунка питомца (docs/ARCHITECTURE.md § 6.4 interact,
// § 7.1 «size», «play», § 13 «Игрушки — правила»; срезы PL04.3, PL06). Правила 0.1.4 без изменений, в единицах рисунка
// (рамка питомца — начало координат, масштаб 1).
//
// Пол — полоса от линии лап до низа места под питомцем, без краёв сцены: его края и низ в единицах рисунка объявляет
// отображение (setDisplay({ playFloor: [l, t, r, b] })), линию лап (size.ground) и питомца — определение (play.foot — где
// он стоит, play.paw — лапа, play.anchor — от этой точки миска ближе или дальше). Питомец (тело, хвост, область лапы) —
// запретный прямоугольник: предмет стоит сбоку или перед лапами; область лапы не меньше радиуса касания отображения
// (playTouch). Пороги распознавания жеста (сдвиг, бросок), CSS px и кадры — у отображения.

export const TOYS = ['bowl', 'ball'];
// Видимый предмет: ширина и высота (пропорции — рисунок предмета у отображения).
export const SIZE = { bowl: [48, 23], ball: [22, 24] };
export const HOME = { bowl: [-60, 214], ball: [280, 214] };
export const NEAR = { bowl: [60, 214] };
const ROLL = [30, 90, 80]; // докатывается: не меньше, не больше; кнопкой — столько
// Наименьший заметный путь предмета (мячик, упёршийся в край или питомца, — не катание; миска рядом с исходным местом —
// на исходном месте). Прежде — 16 и 6 CSS px; в единицах рисунка порог один для любого экрана.
export const TOY_STEP = 8;
const TOL = 0.5; // допуск сравнения с краями пола

const half = ([w, h]) => [w / 2, h / 2];
const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));

// Пол по объявлению отображения: [l, t, r, b] — края и низ полосы пола (верх — не выше линии лап, низ — не выше низа
// рисунка), touch — наименьший радиус области касания лапы (единицы рисунка), def — определение питомца (size, play).
export function zoneOf([l, t, r, b], touch, def) {
  const [left, right, bottom] = def.play.foot;
  const paw = def.play.paw;
  return {
    left: l,
    right: r,
    top: Math.max(t, def.size.ground),
    bottom: Math.max(b, def.size.height),
    foot: { left, right, bottom: paw ? Math.max(bottom, paw.cy + Math.max(paw.r, touch)) : bottom },
    anchor: def.play.anchor,
  };
}

// Центр предмета размера size, ближайший к [x, y]: на полу и не на питомце — перед лапами, слева или справа от него.
export function placeToy(z, size, [x, y]) {
  const [hw, hh] = half(size);
  x = clamp(x, z.left + hw, z.right - hw);
  y = clamp(y, z.top + hh, z.bottom - hh);
  const f = z.foot;
  if (x + hw <= f.left || x - hw >= f.right || y - hh >= f.bottom) return [x, y];
  const ways = [
    [x, f.bottom + hh],
    [f.left - hw, y],
    [f.right + hw, y],
  ].filter(([a, b]) => a - hw >= z.left - TOL && a + hw <= z.right + TOL && b + hh <= z.bottom + TOL);
  if (!ways.length) return [x, z.bottom - hh];
  return ways.reduce((best, p) => (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(best[0] - x, best[1] - y) ? p : best));
}

// Куда докатится предмет из [x, y] в сторону dir (−1 / 1) на dist: до края пола или — сбоку от питомца — до него.
export function rollEnd(z, size, [x, y], dir, dist) {
  const [hw, hh] = half(size);
  const f = z.foot;
  let lo = z.left + hw;
  let hi = z.right - hw;
  if (y - hh < f.bottom - TOL) {
    if (x < (f.left + f.right) / 2) hi = Math.min(hi, f.left - hw);
    else lo = Math.max(lo, f.right + hw);
  }
  return clamp(x + dir * dist, lo, Math.max(lo, hi));
}

// «Катнуть мячик» без направления: туда, где свободнее (повторное нажатие катит обратно).
export function rollWay(z, size, p) {
  const left = p[0] - rollEnd(z, size, p, -1, Infinity);
  const right = rollEnd(z, size, p, 1, Infinity) - p[0];
  const dir = right >= left ? 1 : -1;
  return { dir, to: rollEnd(z, size, p, dir, ROLL[2]) };
}

// Бросок на dx (знак — направление): докатится на столько.
export const rollDist = (dx) => clamp(Math.abs(dx), ROLL[0], ROLL[1]);

// Ближе ли к питомцу (anchor — где он стоит) точка b, чем a.
export const closer = (a, b, anchor) => Math.hypot(b[0] - anchor[0], b[1] - anchor[1]) < Math.hypot(a[0] - anchor[0], a[1] - anchor[1]);

// С какой стороны от питомца точка: 'left' | 'right'.
export const sideOf = (x, anchor) => (x < anchor[0] ? 'left' : 'right');
