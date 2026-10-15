// Сцена «Поиграть»: поглаживание и касание лапы пальцем, мышью и пером (Pointer Events) — распознавание жеста на странице;
// разметку, итог и фокус ведёт pet.mjs, смысл — ядро. Ничего не хранит. Жест начинается на голове, теле или лапе
// (data-play-hit) основным указателем: ядру — stroke.start; поглаживание — сдвиг не меньше STROKE_PX от начала или
// прошлого отклика (ядру — stroke.step на каждый порог); касание лапы — короткое (TAP_MS, PAW_SLOP_PX), на отпускание
// (ядру — interact({ type: 'paw' })). Отпустили — stroke.end; ушёл с питомца, отменён, потерял захват, скрыта вкладка,
// изменилось окно, сдвиг с лапы — stroke.cancel; ядро сняло жест само (play.stroke пуст) — указатель отпускается. Лимит,
// удержание позы, итог и объявления — ядро (core/play.mjs, PL04.3). Нажатие после жеста ничего не нажимает (pet-move.mjs).

import { swallowClick } from './pet-move.mjs';

export const STROKE_PX = 24;
export const TAP_PX = 4;
export const PAW_SLOP_PX = 10;
export const TAP_MS = 500;
export const PAW_MIN_PX = 22; // наименьший радиус области лапы (44×44)

// Рисунок — рамка определения питомца (size: у кота и собаки viewBox 0 0 220 204, земля — y = 188): голова с ушами и тело
// с лапами — эллипсы play.hits, лапа — круг play.paw (у поднятой в позе paw — play.paw.up; у питомца без лапы — null:
// области и касания лапы нет). Данные — определение (PL06), здесь — перевод в рамку на экране. def — определение питомца.

const pawOf = (def, pose) => (pose === 'paw' && def.play.paw?.up ? def.play.paw.up : def.play.paw);

// Часть питомца в точке рисунка (u, v — координаты viewBox): 'paw', 'head', 'body' (части определения) или ''. Лапа —
// первой; minR — наименьший радиус её области в единицах рисунка.
export function petPart(def, u, v, pose = '', minR = 0) {
  const p = pawOf(def, pose);
  if (p && Math.hypot(u - p.cx, v - p.cy) <= Math.max(p.r, minR)) return 'paw';
  return def.play.hits.find((e) => ((u - e.cx) / e.rx) ** 2 + ((v - e.cy) / e.ry) ** 2 <= 1)?.part ?? '';
}

// Точка окна → часть питомца по рамке рисунка на экране (rect — getBoundingClientRect, пропорции viewBox).
export function partAt(def, rect, x, y, pose = '') {
  if (!rect?.width || !rect?.height) return '';
  const s = rect.width / def.size.width;
  return petPart(def, (x - rect.left) / s, ((y - rect.top) / rect.height) * def.size.height, pose, PAW_MIN_PX / s);
}

// Низ области лапы в окне (px) — предметы на полу её не закрывают (pet-toys.mjs); без лапы — низ рисунка.
export function pawBottom(def, rect, pose = '') {
  const p = pawOf(def, pose);
  const s = rect.width / def.size.width;
  return p ? rect.top + p.cy * s + Math.max(p.r * s, PAW_MIN_PX) : rect.top + rect.height;
}

const pct = (value, total) => `${Math.round((value / total) * 10000) / 100}%`;

// Области нажатия — в процентах рамки рисунка (разметка сцены; совпадают с petPart).
export function hitStyle(e, size) {
  return `left:${pct(e.cx - e.rx, size.width)};top:${pct(e.cy - e.ry, size.height)};width:${pct(2 * e.rx, size.width)};height:${pct(2 * e.ry, size.height)}`;
}

// Лапа — круг не меньше PAW_MIN_PX по радиусу: центр (--ux, --uy — поднятой лапы) и радиус в процентах рамки,
// остальное — pet.css.
export function pawStyle(p, size) {
  const up = p.up ? `;--ux:${pct(p.up.cx, size.width)};--uy:${pct(p.up.cy, size.height)}` : '';
  return `--x:${pct(p.cx, size.width)};--y:${pct(p.cy, size.height)};--rx:${pct(p.r, size.width)};--ry:${pct(p.r, size.height)}${up}`;
}

export function hitsHtml(def) {
  const paw = def.play.paw;
  return (
    def.play.hits.map((e) => `<span class="cat-play-hit" data-play-hit="${e.part}" style="${hitStyle(e, def.size)}" aria-hidden="true"></span>`).join('') +
    (paw ? `<span class="cat-play-hit cat-play-paw" data-play-hit="paw" style="${pawStyle(paw, def.size)}" aria-hidden="true"></span>` : '')
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
// Потеря захвата — только своя: запоздалое событие прежнего захвата (тот же указатель снова захвачен той же областью)
// новый жест не снимает.
const lost = (event) => mine(event) && !(one.el?.hasPointerCapture?.(event.pointerId) ?? false);

function onMove(event) {
  if (!mine(event)) return;
  // Основную кнопку мыши или пера отпустили, держа другую (pointerup не приходит), — жест кончился.
  if (event.pointerType !== 'touch' && !(event.buttons & 1)) release('up', event);
  else one.on.move(event);
}

const onUp = (event) => mine(event) && release('up', event);
const onCancel = (event) => mine(event) && release('pointercancel', event);
// Захват потерян самой областью нажатия, пока указатель нажат (после pointerup жест уже закончен).
const onLost = (event) => lost(event) && release('lost', event);

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
  const moved = on.end(reason, event);
  if (reason === 'up') {
    if (moved) swallowClick();
  } else if (reason !== 'pointercancel') swallowClick(id);
}

const st = { hooks: null, g: null, pet: null, def: null, rect: null, x: 0, y: 0, frame: 0, starting: false };

export const stroking = () => Boolean(st.g);

// При подключении: hooks = { start() → id жеста ядра или null, step(id), end(id), cancel(id), paw() — касание лапы,
// motion(), figure(petId) → определение питомца (области и рамка) }; signal снимает слушатели при отключении. Скрытая вкладка, изменение окна, уход со страницы — конец любого
// жеста сцены.
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

// Жест прерван снаружи (закрытие сцены, Esc, смена или скрытие питомца, смена облика) или ядро уже сняло его.
export function cancelStroke(reason = 'cancel') {
  if (st.g) release(reason);
}

// Ядро сняло жест само (play.stroke пуст или другой): указатель отпускается; поздний stroke.cancel(id) ядру безвреден.
export function strokeLost(id) {
  if (st.g && !st.starting && st.g.id !== id) release('lost');
}

const poseOf = (pet) => pet?.querySelector('.cat-art')?.dataset.pose ?? '';

function onDown(event) {
  const hit = event.target.closest?.('[data-play-hit]');
  if (!hit) return;
  const pet = hit.closest('[data-play-pet]');
  const rect = pet?.getBoundingClientRect();
  const def = pet ? st.hooks.figure?.(pet.dataset.kind) : null;
  const part = def ? partAt(def, rect, event.clientX, event.clientY, poseOf(pet)) : '';
  if (!part || !grab(event, hit, { move: strokeOn, end: strokeEnd })) return;
  st.g = { ...strokeStart(event.clientX, event.clientY), paw: part === 'paw', t0: event.timeStamp, id: null };
  Object.assign(st, { pet, def, rect, x: event.clientX, y: event.clientY });
  pet.dataset.stroking = '';
  // Начало жеста — ядру (ручное действие: сценка отменена; отклика и удержания ещё нет). Пока ядро его начинает, снимок
  // без этого жеста указатель не отпускает.
  st.starting = true;
  try {
    st.g.id = st.hooks.start?.() ?? null;
  } finally {
    st.starting = false;
  }
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
  if (!partAt(st.def, st.rect, x, y)) {
    release('leave');
    return;
  }
  const { g, stroke } = strokeMove(st.g, x, y);
  st.g = g;
  st.x = x;
  st.y = y;
  if (g.far >= TAP_PX) touchLater();
  if (stroke && g.id !== null) st.hooks.step(g.id);
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

// Конец жеста: подсветка снята; ядру — stroke.end (отпустили) или stroke.cancel (прерван). Касание лапы — на отпускание:
// коротко, на месте и на лапе (рамка и поза — текущие), после конца жеста.
function strokeEnd(reason, event) {
  const { g, pet, def } = st;
  const tap =
    g.paw &&
    event?.type === 'pointerup' &&
    event.timeStamp - g.t0 <= TAP_MS &&
    Math.hypot(event.clientX - g.x0, event.clientY - g.y0) <= PAW_SLOP_PX &&
    partAt(def, pet.getBoundingClientRect(), event.clientX, event.clientY, poseOf(pet)) === 'paw';
  cancelAnimationFrame(st.frame);
  st.frame = 0;
  delete pet.dataset.stroking;
  const touch = pet.closest('[data-play-stage]')?.querySelector('[data-play-touch]');
  if (touch) delete touch.dataset.on;
  Object.assign(st, { g: null, pet: null, def: null, rect: null });
  if (g.id !== null) (reason === 'up' ? st.hooks.end : st.hooks.cancel)?.(g.id);
  if (tap) st.hooks.paw?.();
  return g.far >= TAP_PX || g.paw;
}
