// Сцена «Поиграть»: поглаживание и касание лапы пальцем, мышью и пером (Pointer Events) — правила жеста без DOM и сам
// жест; разметку, реакцию и фокус ведёт pet.mjs. Ничего не хранит. Жест начинается на голове, теле или лапе
// (data-play-hit) основным указателем; поглаживание — сдвиг не меньше STROKE_PX от начала или прошлого отклика; касание
// лапы — короткое (TAP_MS, PAW_SLOP_PX), на отпускание. Ушёл с питомца, отпущен, отменён, потерял захват, скрыта вкладка,
// изменилось окно — жест кончается; нажатие после него ничего не нажимает (pet-move.mjs).

import { swallowClick } from './pet-move.mjs';

export const STROKE_PX = 24;
export const TAP_PX = 4;
export const PAW_SLOP_PX = 10;
export const TAP_MS = 500;
export const PAW_MIN_PX = 22; // наименьший радиус области лапы (44×44)

// Рисунок — viewBox 0 0 220 204 (общий у кота и собаки, земля — y = 188): голова с ушами и тело с лапами, эллипсами.
// Хвост и пустые углы рамки — не питомец.
export const PET_BOX = { width: 220, height: 204 };
export const HIT = {
  cat: [
    { part: 'head', cx: 100, cy: 66, rx: 58, ry: 52 },
    { part: 'body', cx: 100, cy: 150, rx: 64, ry: 46 },
  ],
  dog: [
    { part: 'head', cx: 100, cy: 72, rx: 64, ry: 52 },
    { part: 'body', cx: 100, cy: 150, rx: 64, ry: 46 },
  ],
};

// Левая (на экране) передняя лапа — круг; up — поднятая лапа собаки в позе «Дай лапу».
export const PAW = {
  cat: { cx: 90, cy: 176, r: 15 },
  dog: { cx: 90, cy: 176, r: 15, up: { cx: 72, cy: 137, r: 15 } },
};

const hitsOf = (kind) => HIT[kind] ?? HIT.cat;
const pawOf = (kind, pose) => (kind === 'dog' && pose === 'paw' ? PAW.dog.up : (PAW[kind] ?? PAW.cat));

// Часть питомца в точке рисунка (u, v — координаты viewBox): 'paw', 'head', 'body' или ''. Лапа — первой; minR —
// наименьший радиус её области в единицах рисунка.
export function petPart(kind, u, v, pose = '', minR = 0) {
  const p = pawOf(kind, pose);
  if (Math.hypot(u - p.cx, v - p.cy) <= Math.max(p.r, minR)) return 'paw';
  return hitsOf(kind).find((e) => ((u - e.cx) / e.rx) ** 2 + ((v - e.cy) / e.ry) ** 2 <= 1)?.part ?? '';
}

// Точка окна → часть питомца по рамке рисунка на экране (rect — getBoundingClientRect, пропорции viewBox).
export function partAt(kind, rect, x, y, pose = '') {
  if (!rect?.width || !rect?.height) return '';
  const s = rect.width / PET_BOX.width;
  return petPart(kind, (x - rect.left) / s, ((y - rect.top) / rect.height) * PET_BOX.height, pose, PAW_MIN_PX / s);
}

// Низ области лапы в окне (px) — предметы на полу её не закрывают (pet-toys.mjs).
export function pawBottom(kind, rect, pose = '') {
  const p = pawOf(kind, pose);
  const s = rect.width / PET_BOX.width;
  return rect.top + p.cy * s + Math.max(p.r * s, PAW_MIN_PX);
}

const pct = (value, total) => `${Math.round((value / total) * 10000) / 100}%`;

// Области нажатия — в процентах рамки рисунка (разметка сцены; совпадают с petPart).
export function hitStyle(e) {
  return `left:${pct(e.cx - e.rx, PET_BOX.width)};top:${pct(e.cy - e.ry, PET_BOX.height)};width:${pct(2 * e.rx, PET_BOX.width)};height:${pct(2 * e.ry, PET_BOX.height)}`;
}

// Лапа — круг не меньше PAW_MIN_PX по радиусу: центр (--ux, --uy — поднятой лапы) и радиус в процентах рамки,
// остальное — pet.css.
export function pawStyle(p) {
  const up = p.up ? `;--ux:${pct(p.up.cx, PET_BOX.width)};--uy:${pct(p.up.cy, PET_BOX.height)}` : '';
  return `--x:${pct(p.cx, PET_BOX.width)};--y:${pct(p.cy, PET_BOX.height)};--rx:${pct(p.r, PET_BOX.width)};--ry:${pct(p.r, PET_BOX.height)}${up}`;
}

export function hitsHtml(kind) {
  const paw = PAW[kind] ?? PAW.cat;
  return (
    hitsOf(kind)
      .map((e) => `<span class="cat-play-hit" data-play-hit="${e.part}" style="${hitStyle(e)}" aria-hidden="true"></span>`)
      .join('') + `<span class="cat-play-hit cat-play-paw" data-play-hit="paw" style="${pawStyle(paw)}" aria-hidden="true"></span>`
  );
}

// Жест: начало (x0, y0), опора (ax, ay — начало или прошлый отклик), наибольшее удаление от начала и число
// поглаживаний. Всё — в CSS px окна.
export function strokeStart(x, y) {
  return { x0: x, y0: y, ax: x, ay: y, far: 0, strokes: 0 };
}

// Следующая точка жеста на питомце: stroke — сдвиг от опоры дошёл до порога (опора — сюда).
export function strokeMove(g, x, y) {
  const far = Math.max(g.far, Math.hypot(x - g.x0, y - g.y0));
  if (Math.hypot(x - g.ax, y - g.ay) < STROKE_PX) return { g: { ...g, far }, stroke: false };
  return { g: { ...g, far, ax: x, ay: y, strokes: g.strokes + 1 }, stroke: true };
}

// ---------- жест на странице ----------
// Один жест на всю сцену — с питомцем, лапой или предметом (pet-toys.mjs): общий указатель, его захват и слушатели
// окна. Конец — отпустили (у мыши и пера — основную кнопку), pointercancel, потеря захвата или причина снаружи.
// Нажатие (click) после сдвига или прерванного жеста ничего не нажимает (pet-move.mjs). Второй палец и другие кнопки
// жест не начинают и не кончают.

const one = { id: null, el: null, on: null };

export const gesturing = () => one.id !== null;

// Начать жест указателем event на el: on = { move(event), end(reason, event) → был ли сдвиг (поглотить нажатие) }.
export function grab(event, el, on) {
  if (one.id !== null || !event.isPrimary || event.button !== 0) return false;
  // Без выделения текста и перетаскивания картинки; у пальца и пера — без совместимых событий мыши: фокус не уходит с
  // кнопки и не переезжает на страницу, если сцену закрыли, пока палец на месте (click касания при этом приходит).
  // Страницу пальцем не прокручивает touch-action области.
  event.preventDefault();
  Object.assign(one, { id: event.pointerId, el, on });
  st.hooks?.busy?.(true);
  try {
    el.setPointerCapture(event.pointerId);
  } catch {
    // указатель уже отпущен — дальше решит pointerup
  }
  el.addEventListener('lostpointercapture', onLost);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onCancel, true);
  return true;
}

const mine = (event) => one.id !== null && event.pointerId === one.id;

function onMove(event) {
  if (!mine(event)) return;
  // Основную кнопку мыши или пера отпустили, держа другую (pointerup не приходит), — жест кончился.
  if (event.pointerType !== 'touch' && !(event.buttons & 1)) release('up', event);
  else one.on.move(event);
}

const onUp = (event) => mine(event) && release('up', event);
const onCancel = (event) => mine(event) && release('pointercancel', event);
// Захват потерян самой областью нажатия, пока указатель нажат (после pointerup жест уже закончен).
const onLost = (event) => mine(event) && release('lost', event);

// Конец жеста: слушатели и захват — всегда. Отпустили после сдвига — нажатие поглощается; прерван, а указатель ещё
// нажат — сначала ждём его отпускания; pointercancel — браузер сам нажатия не пришлёт.
export function release(reason = 'cancel', event = null) {
  const { id, el, on } = one;
  if (id === null) return;
  window.removeEventListener('pointermove', onMove, true);
  window.removeEventListener('pointerup', onUp, true);
  window.removeEventListener('pointercancel', onCancel, true);
  el.removeEventListener('lostpointercapture', onLost);
  try {
    if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
  } catch {
    // захвата уже нет
  }
  Object.assign(one, { id: null, el: null, on: null });
  st.hooks?.busy?.(false);
  const moved = on.end(reason, event);
  if (reason === 'up') {
    if (moved) swallowClick();
  } else if (reason !== 'pointercancel') swallowClick(id);
}

const st = { hooks: null, g: null, pet: null, kind: 'cat', rect: null, x: 0, y: 0, frame: 0 };

export const stroking = () => Boolean(st.g);

// При подключении: hooks = { stroke({ first }) → отклик, paw() — касание лапы, end() — жест кончился, motion(), busy(on) —
// жест указателем начат или кончился (поглаживание, предмет, перенос в редакторе: покой без движений) }; signal
// снимает слушатели при отключении. Скрытая вкладка, изменение окна, уход со страницы — конец любого жеста сцены.
export function initPlay(hooks, signal) {
  st.hooks = hooks;
  document.addEventListener('visibilitychange', () => document.hidden && release('hidden'), { signal });
  window.addEventListener('resize', () => release('resize'), { signal });
  window.addEventListener('blur', () => release('blur'), { signal });
}

// Нажатия внутри box (сцена «Поиграть», постоянный контейнер) — возможное начало поглаживания или касания лапы.
export function watchStroke(box) {
  box.addEventListener('pointerdown', onDown);
}

// Жест прерван снаружи (закрытие сцены, Esc, смена или скрытие питомца, смена облика).
export function cancelStroke(reason = 'cancel') {
  if (st.g) release(reason);
}

const poseOf = (pet) => pet?.querySelector('.cat-art')?.dataset.pose ?? '';

function onDown(event) {
  const hit = event.target.closest?.('[data-play-hit]');
  if (!hit) return;
  const pet = hit.closest('[data-play-pet]');
  const rect = pet?.getBoundingClientRect();
  const kind = pet?.dataset.kind ?? 'cat';
  const part = partAt(kind, rect, event.clientX, event.clientY, poseOf(pet));
  if (!part || !grab(event, hit, { move: strokeOn, end: strokeEnd })) return;
  st.g = { ...strokeStart(event.clientX, event.clientY), paw: part === 'paw', t0: event.timeStamp };
  Object.assign(st, { pet, kind, rect, x: event.clientX, y: event.clientY });
  pet.dataset.stroking = '';
}

function strokeOn(event) {
  const { clientX: x, clientY: y } = event;
  // Жест с лапы — касание: сдвинули дальше порога — не касание и не поглаживание.
  if (st.g.paw) {
    if (Math.hypot(x - st.g.x0, y - st.g.y0) > PAW_SLOP_PX) release('slop');
    return;
  }
  // Рамка — текущая: сцена могла сдвинуть питомца (итог вместо подсказки, реплика), окно — нет (тогда жест отменён).
  st.rect = st.pet.getBoundingClientRect();
  if (!partAt(st.kind, st.rect, x, y)) {
    release('leave');
    return;
  }
  const { g, stroke } = strokeMove(st.g, x, y);
  st.g = g;
  st.x = x;
  st.y = y;
  if (g.far >= TAP_PX) touchLater();
  if (stroke) st.hooks.stroke({ first: g.strokes === 1 });
}

// Подсветка касания — мягкое пятно под указателем, раз в кадр (не на каждое движение); без анимации её нет.
function touchLater() {
  if (st.frame || st.hooks.motion() === 'none') return;
  st.frame = requestAnimationFrame(() => {
    st.frame = 0;
    const stage = st.pet?.closest('[data-play-stage]');
    const touch = stage?.querySelector('[data-play-touch]');
    if (!st.g || !touch) return;
    const box = stage.getBoundingClientRect();
    touch.style.transform = `translate(${Math.round(st.x - box.left)}px, ${Math.round(st.y - box.top)}px)`;
    touch.dataset.on = '';
  });
}

// Конец поглаживания: подсветка снята. Касание лапы — на отпускание: коротко, на месте и на лапе (рамка и поза —
// текущие).
function strokeEnd(reason, event) {
  const { g, pet, kind } = st;
  const tap =
    g.paw &&
    event?.type === 'pointerup' &&
    event.timeStamp - g.t0 <= TAP_MS &&
    Math.hypot(event.clientX - g.x0, event.clientY - g.y0) <= PAW_SLOP_PX &&
    partAt(kind, pet.getBoundingClientRect(), event.clientX, event.clientY, poseOf(pet)) === 'paw';
  cancelAnimationFrame(st.frame);
  st.frame = 0;
  delete pet.dataset.stroking;
  const touch = pet.closest('[data-play-stage]')?.querySelector('[data-play-touch]');
  if (touch) delete touch.dataset.on;
  Object.assign(st, { g: null, pet: null, rect: null });
  st.hooks.end?.();
  if (tap) st.hooks.paw?.();
  return g.far >= TAP_PX || g.paw;
}
