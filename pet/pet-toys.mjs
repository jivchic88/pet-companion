// Миска и мячик на полу сцены «Поиграть» (с 2026-10-10) — отображение: замер пола, рисование мест из снимка ядра, анимация
// и распознавание жеста; реакцию, итог и кнопки ведёт pet.mjs. Ничего не хранит. Правила мест (пол, питомец, ближе ли
// миска, куда докатится мячик) — ядро (core/toys.mjs, PL04.3): здесь — перевод CSS px в единицы рисунка и обратно,
// пороги распознавания и кадры.
//
// Пол — полоса сцены от линии лап до низа места под питомцем ([data-play-floor]) без краёв сцены: отображение меряет края и
// низ, переводит в единицы рисунка питомца (рамка size определения, у кота и собаки — viewBox 220×204) и объявляет ядру (setDisplay({ playFloor, playTouch })); после
// изменения окна места те же относительно питомца. Миска едет за указателем после сдвига на MOVE_PX — с той же точкой
// захвата, место под указателем выбирает ядро (toy.drag); отпущенная после заметного сдвига — на новом месте (toy.drop),
// иначе — на месте до жеста (toy.cancel). Мячик так же, а отпущенный после сдвига на ROLL_PX влево или вправо — бросок:
// докатывается туда, куда скажет ядро (без анимации — остаётся, где отпустили). Указатель — общий со всей сценой (grab в
// pet-play.mjs): один жест одновременно.

import { HOME, SIZE } from './core/toys.mjs';
import { grab, release } from './pet-play.mjs';

export { HOME, NEAR, SIZE, TOY_STEP, closer, placeToy, rollDist, rollEnd, rollWay, sideOf, zoneOf } from './core/toys.mjs';

export const MOVE_PX = 6;
export const ROLL_PX = 16;
export const TOY_MIN_PX = 44;
const EDGE = 8; // поле до края сцены, px
const PAW_MIN_PX = 22; // наименьший радиус области касания лапы (pet-play.mjs)

// Рамки страницы → пол в единицах рисунка: stage, pet, floor — рамки сцены, питомца и места под ним (координаты сцены),
// width — ширина рамки рисунка питомца (size.width определения). Возвращает { s, pet, floor: [l, t, r, b], touch } (s — CSS
// px на единицу рисунка; touch — 22 CSS px области касания лапы в единицах рисунка: предметы её не закрывают).
export function floorUnits(stage, pet, floor, width = 220) {
  const s = pet.width / width;
  const u = (x, origin) => (x - origin) / s;
  const bottom = Math.max(pet.bottom, floor?.bottom ?? 0);
  return { s, pet: { left: pet.left, top: pet.top }, floor: [u(stage.left + EDGE, pet.left), u(stage.top, pet.top), u(stage.right - EDGE, pet.left), u(bottom, pet.top)], touch: PAW_MIN_PX / s };
}

export const toPx = (z, [u, v]) => [z.pet.left + u * z.s, z.pet.top + v * z.s];
export const toUnits = (z, [x, y]) => [(x - z.pet.left) / z.s, (y - z.pet.top) / z.s];

// ---------- предметы на странице ----------

// hooks = { play() → снимок play ядра | null, drag(toy, [u, v]), drop(roll?), cancel(), floor(floor, touch), motion() →
// 'normal' | 'calm' | 'none', width() → ширина рамки рисунка показанного питомца (size.width) }.
const st = { hooks: null, box: null, toys: {}, drag: null, ro: null, key: '', z: null, relayout: false, roll: '' };

export function initToys(hooks) {
  st.hooks = hooks;
}

// Нажатия внутри box (сцена «Поиграть», постоянный контейнер) — возможное начало жеста с предметом.
export function watchToys(box) {
  box.addEventListener('pointerdown', onDown);
}

// Разметка сцены нарисована (вход, другой питомец или облик): предметы — на местах из снимка.
export function mountToys(view) {
  unmountToys();
  st.box = view;
  for (const el of view.querySelectorAll('[data-play-toy]')) {
    const name = el.dataset.playToy;
    st.toys[name] = { el, spin: el.querySelector('.cat-play-spin'), x: 0, y: 0, r: 0, turn: 0, frame: 0, goal: null, shown: null, w: 0, h: 0 };
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
  for (const t of Object.values(st.toys)) stopAnim(t, true);
  st.toys = {};
  st.box = null;
  st.z = null;
}

function zone() {
  const stage = st.box?.querySelector('[data-play-stage]')?.getBoundingClientRect();
  const pet = st.box?.querySelector('[data-play-pet]');
  const rect = pet?.getBoundingClientRect();
  if (!stage || !rect?.width) return null;
  const rel = (r) => r && { left: r.left - stage.left, top: r.top - stage.top, right: r.right - stage.left, bottom: r.bottom - stage.top, width: r.width };
  const floor = st.box.querySelector('[data-play-floor]')?.getBoundingClientRect();
  return floorUnits(rel(stage), rel(rect), rel(floor), st.hooks.width?.() ?? 220);
}

const keyOf = (z = zone()) => (z ? [...z.floor, z.s, z.pet.left, z.pet.top].map((value) => Math.round(value * 10)).join() : '');

// Пол — ядру (места предметов оно ограничит само); предметы — по рамкам: размер области нажатия (не меньше 44×44) и место.
function layout() {
  const z = zone();
  st.key = keyOf(z);
  st.z = z;
  if (!z) return;
  for (const [name, t] of Object.entries(st.toys)) {
    const [w, h] = SIZE[name].map((value) => value * z.s);
    t.w = Math.max(w, TOY_MIN_PX);
    t.h = Math.max(h, TOY_MIN_PX);
    Object.assign(t.el.style, { width: `${t.w}px`, height: `${t.h}px` });
    t.el.style.setProperty('--toy-w', `${w}px`);
    t.el.style.setProperty('--toy-h', `${h}px`);
    t.r = w * 0.45; // радиус мячика: поворот на пройденный путь
  }
  st.relayout = true;
  try {
    st.hooks.floor(z.floor, z.touch);
  } finally {
    st.relayout = false;
  }
  draw({ relayout: true });
}

// Места из снимка: идущий перенос — под указателем сразу; конец переноса без броска (отмена, недостаточный сдвиг) — сразу
// на место до жеста; сдвиг действием (кнопка, бросок мячика) — плавно; изменение окна — сразу. Перерисовка без изменения
// места ничего не делает.
export function draw({ relayout = st.relayout } = {}) {
  const play = st.hooks?.play();
  const z = st.z;
  if (!play || !z) return;
  for (const [name, t] of Object.entries(st.toys)) {
    if (!t.el) continue;
    const dragged = play.drag?.toy === name;
    const ended = t.dragged && !dragged;
    t.dragged = dragged;
    const at = dragged ? play.drag.at : play.toys[name]?.at;
    if (!at) continue;
    const goal = toPx(z, at);
    const same = t.shown && Math.abs(t.shown[0] - at[0]) < 0.01 && Math.abs(t.shown[1] - at[1]) < 0.01;
    t.shown = at;
    if (same && !relayout) continue;
    if (relayout || dragged || !t.placed || (ended && st.roll !== name)) {
      stopAnim(t, false);
      put(t, goal);
      t.placed = true;
      continue;
    }
    glide(t, goal, name === 'ball' ? Math.min(900, 300 + Math.abs(goal[0] - t.x) * 3) : 300);
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

function onDown(event) {
  const el = event.target.closest?.('[data-play-toy]');
  const name = el?.dataset.playToy;
  const t = st.toys[name];
  const z = t?.el === el ? st.z : null;
  if (!z || !grab(event, el, { move: onMove, end: finish })) return;
  // Мячик катится — останавливается под пальцем (ядро: место — где взяли).
  stopAnim(t);
  st.drag = { name, x0: event.clientX, y0: event.clientY, from: [t.x, t.y], dx: 0, on: false };
  st.hooks.drag(name, toUnits(z, [t.x, t.y]));
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
  st.hooks.drag(d.name, toUnits(st.z, [d.from[0] + dx, d.from[1] + dy]));
}

// Конец жеста (release в pet-play.mjs; вернуть — был ли сдвиг). Отпустили после заметного сдвига — миска на новом месте,
// мячик брошен, если сдвиг влево или вправо заметный; иначе и при отмене — на месте до жеста.
function finish(reason) {
  const d = st.drag;
  const t = st.toys[d.name];
  st.drag = null;
  if (t?.el) delete t.el.dataset.dragging;
  const up = reason === 'up' && d.on;
  if (up && d.name === 'bowl' && t && Math.hypot(t.x - d.from[0], t.y - d.from[1]) >= MOVE_PX) st.hooks.drop();
  else if (up && d.name === 'ball' && Math.abs(d.dx) >= ROLL_PX && st.z) {
    st.roll = 'ball';
    try {
      st.hooks.drop(d.dx / st.z.s);
    } finally {
      st.roll = '';
    }
  } else st.hooks.cancel();
  return d.on;
}

// Ядро сняло перенос предмета (вид, питомец, фон): указатель отпущен, предмет — по снимку.
export function toyLost() {
  if (st.drag) release('lost');
}

export const toyDragging = () => st.drag?.name ?? '';

// Исходные места в единицах рисунка (для проверок): HOME реэкспортом.
export const TOY_HOME = HOME;
