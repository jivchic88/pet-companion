// Миска и мячик на полу сцены «Поиграть» (с 2026-10-10): правила без DOM (пол, пороги, куда докатится мячик, ближе
// ли миска) и жесты на странице; реакцию, итог и кнопки ведёт pet.mjs. Ничего не хранит.
//
// Пол — полоса сцены от линии лап до низа места под питомцем ([data-play-floor]) без краёв сцены; питомец (тело,
// хвост, область лапы) — запретный прямоугольник: предмет стоит сбоку или перед лапами. Место — в единицах рисунка
// питомца (viewBox 220×204): после изменения окна — то же относительно питомца. Миска едет за указателем после
// сдвига на MOVE_PX, с той же точкой захвата; мячик тоже, а отпущенный после сдвига на ROLL_PX влево или вправо
// докатывается (без анимации — нет). Без сдвига и при отмене — на месте до жеста. Указатель — общий со всей сценой
// (grab в pet-play.mjs): один жест одновременно.

import { grab, pawBottom, release } from './pet-play.mjs';

export const MOVE_PX = 6;
export const ROLL_PX = 16;
export const TOY_MIN_PX = 44;
// Видимый предмет в единицах рисунка питомца: ширина и высота (пропорции — viewBox предмета, pet.mjs).
export const SIZE = { bowl: [48, 23], ball: [22, 24] };
const EDGE = 8; // поле до края сцены, px
const FLOOR = 176; // линия пола у лап
const FOOT = [34, 202, 197]; // питомец на полу: слева, справа, низ (не выше низа области лапы)
export const ANCHOR = [100, 190]; // где стоит питомец: от этой точки миска ближе или дальше
export const HOME = { bowl: [-60, 214], ball: [280, 214] };
export const NEAR = { bowl: [60, 214] };
const ROLL = [30, 90, 80]; // докатывается: не меньше, не больше; кнопкой — столько (единицы рисунка)

// Пол в CSS px по рамкам сцены, питомца и места под ним; pawEdge — низ области лапы. На странице — в координатах сцены
// (сдвиг окна без изменения размера мест не меняет).
export function floorZone(stage, pet, floor, pawEdge = 0) {
  const s = pet.width / 220;
  return {
    s,
    pet: { left: pet.left, top: pet.top },
    left: stage.left + EDGE,
    right: stage.right - EDGE,
    top: pet.top + FLOOR * s,
    bottom: Math.max(pet.bottom, floor?.bottom ?? 0),
    foot: { left: pet.left + FOOT[0] * s, right: pet.left + FOOT[1] * s, bottom: Math.max(pet.top + FOOT[2] * s, pawEdge) },
  };
}

export const toPx = (z, [u, v]) => [z.pet.left + u * z.s, z.pet.top + v * z.s];
export const toUnits = (z, [x, y]) => [(x - z.pet.left) / z.s, (y - z.pet.top) / z.s];
const half = (z, [w, h]) => [(w * z.s) / 2, (h * z.s) / 2];
const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));

// Центр предмета размера size, ближайший к (x, y): на полу и не на питомце — перед лапами, слева или справа от него.
export function placeToy(z, size, x, y) {
  const [hw, hh] = half(z, size);
  x = clamp(x, z.left + hw, z.right - hw);
  y = clamp(y, z.top + hh, z.bottom - hh);
  const f = z.foot;
  if (x + hw <= f.left || x - hw >= f.right || y - hh >= f.bottom) return [x, y];
  const ways = [
    [x, f.bottom + hh],
    [f.left - hw, y],
    [f.right + hw, y],
  ].filter(([a, b]) => a - hw >= z.left - 0.5 && a + hw <= z.right + 0.5 && b + hh <= z.bottom + 0.5);
  if (!ways.length) return [x, z.bottom - hh];
  return ways.reduce((best, p) => (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(best[0] - x, best[1] - y) ? p : best));
}

// Куда докатится предмет из (x, y) в сторону dir (−1 / 1) на dist px: до края пола или — сбоку от питомца — до него.
export function rollEnd(z, size, x, y, dir, dist) {
  const [hw, hh] = half(z, size);
  const f = z.foot;
  let lo = z.left + hw;
  let hi = z.right - hw;
  if (y - hh < f.bottom - 0.5) {
    if (x < (f.left + f.right) / 2) hi = Math.min(hi, f.left - hw);
    else lo = Math.max(lo, f.right + hw);
  }
  return clamp(x + dir * dist, lo, Math.max(lo, hi));
}

// Кнопка «Катнуть мячик»: туда, где свободнее (повторное нажатие катит обратно).
export function rollWay(z, size, x, y) {
  const left = x - rollEnd(z, size, x, y, -1, Infinity);
  const right = rollEnd(z, size, x, y, 1, Infinity) - x;
  const dir = right >= left ? 1 : -1;
  return { dir, to: rollEnd(z, size, x, y, dir, ROLL[2] * z.s) };
}

// Отпустили мячик со сдвигом dx: докатится на столько (px).
export const rollDist = (z, dx) => clamp(Math.abs(dx), ROLL[0] * z.s, ROLL[1] * z.s);

// Ближе ли к питомцу точка b, чем a (px).
export function closer(z, a, b) {
  const [ax, ay] = toPx(z, ANCHOR);
  return Math.hypot(b[0] - ax, b[1] - ay) < Math.hypot(a[0] - ax, a[1] - ay);
}

// С какой стороны от питомца точка: 'left' | 'right'.
export const sideOf = (z, x) => (x < toPx(z, ANCHOR)[0] ? 'left' : 'right');

// ---------- предметы на странице ----------

const st = { hooks: null, box: null, toys: {}, drag: null, ro: null, key: '' };

// Один раз: hooks = { done({ toy, closer, toward }) — миска на новом месте или мячик покатился; motion() →
// 'normal' | 'calm' | 'none' }.
export function initToys(hooks) {
  st.hooks = hooks;
}

// Нажатия внутри box (сцена «Поиграть», постоянный контейнер) — возможное начало жеста с предметом.
export function watchToys(box) {
  box.addEventListener('pointerdown', onDown);
}

// Новая сцена: предметы на своих местах.
export function resetToys() {
  for (const t of Object.values(st.toys)) t.pos = null;
}

// Разметка сцены нарисована (вход, другой питомец или облик): предметы — на прежних местах.
export function mountToys(view) {
  unmountToys();
  st.box = view;
  for (const el of view.querySelectorAll('[data-play-toy]')) {
    const name = el.dataset.playToy;
    st.toys[name] = { pos: st.toys[name]?.pos ?? null, el, spin: el.querySelector('.cat-play-spin'), x: 0, y: 0, r: 0, turn: 0, frame: 0, goal: null };
  }
  layout();
  st.ro = new ResizeObserver(() => {
    if (keyOf() !== st.key) layout();
  });
  for (const el of [view.querySelector('[data-play-stage]'), view.querySelector('[data-play-pet]')]) if (el) st.ro.observe(el);
}

// Сцена закрыта или будет нарисована заново: жест отменён, движения доведены до конца, наблюдение снято.
export function unmountToys(reason = 'close') {
  if (st.drag) release(reason);
  st.ro?.disconnect();
  st.ro = null;
  for (const t of Object.values(st.toys)) {
    stopAnim(t, true);
    t.el = null;
    t.spin = null;
  }
  st.box = null;
}

function zone() {
  const stage = st.box?.querySelector('[data-play-stage]')?.getBoundingClientRect();
  const pet = st.box?.querySelector('[data-play-pet]');
  const rect = pet?.getBoundingClientRect();
  if (!stage || !rect?.width) return null;
  const rel = (r) => r && { left: r.left - stage.left, top: r.top - stage.top, right: r.right - stage.left, bottom: r.bottom - stage.top, width: r.width };
  const floor = st.box.querySelector('[data-play-floor]')?.getBoundingClientRect();
  return floorZone(rel(stage), rel(rect), rel(floor), pawBottom(pet.dataset.kind ?? 'cat', rect) - stage.top);
}

const keyOf = (z = zone()) => (z ? [z.left, z.right, z.top, z.bottom, z.s].map(Math.round).join() : '');

// Предметы — по рамкам: размер области нажатия (не меньше 44×44) и место на полу.
function layout() {
  const z = zone();
  st.key = keyOf(z);
  if (!z) return;
  for (const [name, t] of Object.entries(st.toys)) {
    if (!t.el || st.drag?.name === name) continue;
    stopAnim(t, true);
    const [w, h] = SIZE[name].map((value) => value * z.s);
    t.w = Math.max(w, TOY_MIN_PX);
    t.h = Math.max(h, TOY_MIN_PX);
    Object.assign(t.el.style, { width: `${t.w}px`, height: `${t.h}px` });
    t.el.style.setProperty('--toy-w', `${w}px`);
    t.el.style.setProperty('--toy-h', `${h}px`);
    put(t, placeToy(z, SIZE[name], ...toPx(z, t.pos ?? HOME[name])));
    t.r = w * 0.45; // радиус мячика: первая расстановка — без поворота
    if (t.pos) t.pos = toUnits(z, [t.x, t.y]);
  }
}

// Предмет — центром в (x, y) сцены; мячик поворачивается на пройденный путь.
function put(t, [x, y]) {
  if (!t.el) return;
  if (t.spin && t.r) {
    t.turn += ((x - t.x) / t.r) * 57.3;
    t.spin.style.transform = `rotate(${Math.round(t.turn)}deg)`;
  }
  t.x = x;
  t.y = y;
  t.el.style.transform = `translate(${Math.round(x - t.w / 2)}px, ${Math.round(y - t.h / 2)}px)`;
}

// Плавно (с замедлением) к goal за ms; без анимации и в скрытой вкладке — сразу.
function glide(t, goal, ms) {
  stopAnim(t);
  if (st.hooks.motion() === 'none' || document.hidden) {
    put(t, goal);
    return;
  }
  const [x0, y0] = [t.x, t.y];
  const start = performance.now();
  t.goal = goal;
  t.el.dataset.moving = '';
  const step = (time) => {
    const k = Math.min(1, (time - start) / ms);
    const e = 1 - (1 - k) ** 3;
    put(t, [x0 + (goal[0] - x0) * e, y0 + (goal[1] - y0) * e]);
    if (k < 1) t.frame = requestAnimationFrame(step);
    else stopAnim(t);
  };
  t.frame = requestAnimationFrame(step);
}

// Движение остановлено: там, где сейчас (новый жест сменяет прежний), или сразу в конце (finish).
function stopAnim(t, finish = false) {
  cancelAnimationFrame(t.frame);
  t.frame = 0;
  if (finish && t.goal && t.el) put(t, t.goal);
  t.goal = null;
  if (t.el) delete t.el.dataset.moving;
}

const remember = (z, t) => (t.pos = toUnits(z, [t.x, t.y]));

function onDown(event) {
  const el = event.target.closest?.('[data-play-toy]');
  const t = st.toys[el?.dataset.playToy];
  const z = t?.el === el ? zone() : null;
  if (!z || !grab(event, el, { move: onMove, end: finish })) return;
  // Мячик катится — останавливается под пальцем.
  if (t.frame) {
    stopAnim(t);
    remember(z, t);
  }
  st.drag = { name: el.dataset.playToy, z, x0: event.clientX, y0: event.clientY, from: [t.x, t.y], dx: 0, on: false };
}

function onMove(event) {
  const d = st.drag;
  const dx = event.clientX - d.x0;
  const dy = event.clientY - d.y0;
  if (!d.on) {
    if (Math.hypot(dx, dy) < MOVE_PX) return;
    d.on = true;
    st.toys[d.name].el.dataset.dragging = '';
  }
  d.dx = dx;
  put(st.toys[d.name], placeToy(d.z, SIZE[d.name], d.from[0] + dx, d.from[1] + dy));
}

// Конец жеста (release в pet-play.mjs; вернуть — был ли сдвиг). Отпустили после сдвига — миска на новом месте,
// мячик катится, если сдвиг заметный; иначе и при отмене — на месте до жеста.
function finish(reason) {
  const d = st.drag;
  const t = st.toys[d.name];
  const z = d.z;
  st.drag = null;
  if (t.el) delete t.el.dataset.dragging;
  if (reason === 'up' && d.on && d.name === 'bowl' && Math.hypot(t.x - d.from[0], t.y - d.from[1]) >= MOVE_PX) {
    remember(z, t);
    st.hooks.done({ toy: 'bowl', closer: closer(z, d.from, [t.x, t.y]), toward: sideOf(z, t.x) });
    return true;
  }
  // Мячик: катание — сдвиг влево или вправо; упёрся в край или питомца без заметного движения — не катание.
  const dir = Math.sign(d.dx);
  const to = reason !== 'up' || d.name !== 'ball' || Math.abs(d.dx) < ROLL_PX ? d.from[0] : st.hooks.motion() === 'none' ? t.x : rollEnd(z, SIZE.ball, t.x, t.y, dir, rollDist(z, d.dx));
  if (Math.abs(to - d.from[0]) < ROLL_PX) {
    if (d.on) put(t, d.from);
    return d.on;
  }
  roll(z, t, to);
  st.hooks.done({ toy: 'ball', toward: dir < 0 ? 'left' : 'right' });
  return true;
}

function roll(z, t, to) {
  t.pos = toUnits(z, [to, t.y]);
  glide(t, [to, t.y], Math.min(900, 300 + Math.abs(to - t.x) * 3));
}

// Миска на исходном месте (кнопка — «Подвинуть миску», иначе «Вернуть миску»).
export function bowlHome() {
  const t = st.toys.bowl;
  const z = zone();
  if (!t?.el || !z || !t.pos) return true;
  const [x, y] = placeToy(z, SIZE.bowl, ...toPx(z, HOME.bowl));
  return Math.hypot((t.goal ?? [t.x, t.y])[0] - x, (t.goal ?? [t.x, t.y])[1] - y) < MOVE_PX;
}

// «Подвинуть миску» — к питомцу, «Вернуть миску» — на место; тот же итог, что у жеста.
export function moveBowl() {
  const t = st.toys.bowl;
  const z = zone();
  if (!t?.el || !z || st.drag) return false;
  const home = bowlHome();
  stopAnim(t, true);
  const from = [t.x, t.y];
  const goal = placeToy(z, SIZE.bowl, ...toPx(z, home ? NEAR.bowl : HOME.bowl));
  t.pos = home ? toUnits(z, goal) : null;
  glide(t, goal, 300);
  st.hooks.done({ toy: 'bowl', closer: closer(z, from, goal), toward: sideOf(z, goal[0]) });
  return true;
}

// «Катнуть мячик» — туда, где свободнее; места нет — ничего (false).
export function rollBall() {
  const t = st.toys.ball;
  const z = zone();
  if (!t?.el || !z || st.drag) return false;
  stopAnim(t, true);
  const { dir, to } = rollWay(z, SIZE.ball, t.x, t.y);
  if (Math.abs(to - t.x) < ROLL_PX) return false;
  roll(z, t, to);
  st.hooks.done({ toy: 'ball', toward: dir < 0 ? 'left' : 'right' });
  return true;
}
