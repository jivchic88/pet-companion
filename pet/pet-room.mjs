// «Обустроить уголок» (с 2026-10-10) на странице: рисование расстановки на svg сцены и перенос предмета указателем. Правила
// комнаты (пол, края, перекрытия, ближайшее допустимое место, выбор под точкой, сдвиг к миске, запись) — ядро
// (core/room.mjs), черновик и перенос — ядро (core/editor.mjs, команды room.*): здесь — перевод CSS px в единицы сцены,
// порог начала переноса и захват указателя (общий указатель отображения — web/pointer.mjs). Координаты — единицы сцены
// (viewBox 400×250). Правила ядра реэкспортом — для оставшегося веб-кода и проверок; второй реализации нет. Состояние
// переноса — на экземпляр отображения (createRoomDrag, PL07).

import { sceneCatBox } from './cat-art.mjs';
import { frames, pickAt, SCENE } from './core/room.mjs';

export * from './core/room.mjs';

// Порог начала переноса — CSS px (как у миски «Поиграть»).
export const MOVE_PX = 6;

const round = (v) => Math.round(v * 10) / 10;

// Раскладка на svg сцены: место отдыха и питомец (вложенный svg — x, y) вместе, остальное — сдвигом от исходного места
// (layout.model.home — модель комнаты питомца, его определение); shift — сдвиг позы «ест» к миске из снимка ядра
// (room.feedShift).
export function paintRoom(svg, layout, shift = [0, 0]) {
  const base = sceneCatBox(layout.stage);
  for (const el of svg?.querySelectorAll('[data-room]') ?? []) {
    const id = el.dataset.room;
    const p = layout.pos[id];
    const home = Object.hasOwn(layout.model.home, id) ? layout.model.home[id] : null;
    if (!p || !home) continue;
    const dx = round(p[0] - home[0]);
    const dy = round(p[1] - home[1]);
    if (el.classList.contains('cat-art')) {
      el.setAttribute('x', round(base.x + dx));
      el.setAttribute('y', round(base.y + dy));
      el.style.setProperty('--feed-x', `${round(shift[0])}px`);
      el.style.setProperty('--feed-y', `${round(shift[1])}px`);
    } else el.setAttribute('transform', `translate(${dx} ${dy})`);
  }
}

// Область нажатия в процентах сцены (не меньше 44×44 — pet.css): свойства для CSSOM и прежняя строка (проверки).
export function hitVars(layout, id) {
  const [l, t, r, b] = frames(layout, id, layout.pos[id]).box;
  const pct = (v, total) => `${round((v / total) * 1000) / 10}`;
  return { '--x': pct((l + r) / 2, SCENE[0]), '--y': pct((t + b) / 2, SCENE[1]), '--w': pct(r - l, SCENE[0]), '--h': pct(b - t, SCENE[1]) };
}

export const hitStyle = (layout, id) =>
  Object.entries(hitVars(layout, id))
    .map(([key, value]) => `${key}:${value}`)
    .join(';');

// Область на элементе — через CSSOM (без атрибута style в разметке — строгий CSP, PL07).
export function paintHit(el, layout, id) {
  for (const [key, value] of Object.entries(hitVars(layout, id))) el.style.setProperty(key, value);
}

// Перенос одного отображения: pointer — общий указатель отображения; hooks = { layout() → { model, stage, pos, pick }
// черновика (модель комнаты питомца и снимок ядра), drag(id, point) — room.drag, drop() — room.drop, cancel() —
// room.dragCancel }; signal снимает слушатели нажатий при отключении.
export function createRoomDrag(pointer, hooks, signal) {
  const st = { drag: null };

  // Нажатие: предмет под точкой — правило ядра (pickAt: видимый — верхний, увеличенные до 44 CSS px области —
  // выбранный, затем ближайший); ядру — начало переноса с его места (выбор, ручное действие). Сцена без размеров —
  // переноса нет.
  function onDown(event) {
    const stage = event.target.closest?.('[data-room-stage]');
    const rect = stage?.querySelector('svg')?.getBoundingClientRect();
    if (!rect?.width || !rect.height || !event.target.closest('[data-room-hit]')) return;
    const k = SCENE[0] / rect.width;
    const layout = hooks.layout();
    if (!layout) return;
    const id = pickAt(layout, [(event.clientX - rect.left) * k, (event.clientY - rect.top) * k], layout.pick, 44 * k);
    if (!id || !pointer.grab(event, stage, { move: onMove, end: onEnd })) return;
    st.drag = { id, k, stage, x0: event.clientX, y0: event.clientY, from: layout.pos[id], on: false };
    hooks.drag(id, st.drag.from);
  }

  // Сдвиг: после порога — точка с той же точкой захвата; допустимое место выбирает ядро. Масштаб — текущий: сцену могли
  // перерисовать или изменить её размер во время переноса (без размеров — перенос отменён).
  function onMove(event) {
    const d = st.drag;
    const dx = event.clientX - d.x0;
    const dy = event.clientY - d.y0;
    if (!d.on && Math.hypot(dx, dy) < MOVE_PX) return;
    const width = d.stage.querySelector('svg')?.getBoundingClientRect().width;
    if (!width) {
      pointer.release('resize');
      return;
    }
    d.k = SCENE[0] / width;
    d.on = true;
    hooks.drag(d.id, [d.from[0] + dx * d.k, d.from[1] + dy * d.k]);
  }

  // Конец жеста (release указателя; вернуть — был ли сдвиг): отпустили после сдвига — room.drop, иначе (касание только
  // выбирает, отмена указателя, потеря захвата, Esc) — room.dragCancel.
  function onEnd(reason) {
    const d = st.drag;
    st.drag = null;
    if (reason === 'up' && d.on) hooks.drop();
    else hooks.cancel();
    return d.on;
  }

  return Object.freeze({
    // Нажатия внутри box (постоянный контейнер редактора) — выбор и перенос.
    watch(box) {
      box.addEventListener('pointerdown', onDown, { signal });
    },
    // Прервать перенос снаружи (Esc, сохранение, выход) или ядро уже сняло его (новая ступень, облик, фон): указатель
    // отпущен; поздний room.dragCancel ядру безвреден.
    cancel(reason = 'cancel') {
      if (st.drag) pointer.release(reason);
    },
    // Указатель нажат на предмете (идёт перенос — у ядра он начат тем же нажатием): кнопки и стрелки ждут конца.
    arranging: () => Boolean(st.drag),
    // Сдвиг дошёл до порога — предмет едет за указателем (сцена помечена data-moving).
    moving: () => Boolean(st.drag?.on),
  });
}
