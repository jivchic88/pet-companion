// Миска и мячик на полу сцены «Поиграть» (с 2026-10-10) — отображение: замер пола, рисование мест из снимка ядра, анимация
// и распознавание жеста; реакцию, итог и кнопки ведёт отображение (web/shell.mjs). Ничего не хранит. Правила мест (пол,
// питомец, ближе ли миска, куда докатится мячик) — ядро (core/toys.mjs, PL04.3): здесь — перевод CSS px в единицы рисунка
// и обратно, пороги распознавания и кадры. Состояние — на экземпляр отображения (createToys, PL07): наблюдатель размеров,
// кадры анимации и перенос одного отображения не трогают другое.
//
// Пол — полоса сцены от линии лап до низа места под питомцем ([data-play-floor]) без краёв сцены: отображение меряет края и
// низ, переводит в единицы рисунка питомца (рамка size определения, у кота и собаки — viewBox 220×204) и объявляет ядру
// (setDisplay({ playFloor, playTouch })); после изменения окна места те же относительно питомца. Сцена без размеров (скрыта,
// нулевая ширина) пол не объявляет — замер откладывается до появления размеров. Миска едет за указателем после сдвига на
// MOVE_PX — с той же точкой захвата, место под указателем выбирает ядро (toy.drag); отпущенная после заметного сдвига — на
// новом месте (toy.drop), иначе — на месте до жеста (toy.cancel). Мячик так же, а отпущенный после сдвига на ROLL_PX влево
// или вправо — бросок: докатывается туда, куда скажет ядро (без анимации — остаётся, где отпустили). Указатель — общий со
// всей сценой отображения (web/pointer.mjs): один жест одновременно. Изменение рамок сцены во время переноса — пересчёт:
// начало переноса — в единицах рисунка, сдвиг указателя — текущим масштабом; сцена без размеров — перенос отменён.

import { HOME, SIZE } from './core/toys.mjs';

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

// Пол годен для ядра: четыре конечных числа, l < r, t < b, масштаб конечный и положительный (иначе — не объявлять).
const usable = (z) => Boolean(z) && Number.isFinite(z.s) && z.s > 0 && Number.isFinite(z.touch) && z.floor.every(Number.isFinite) && z.floor[0] < z.floor[2] && z.floor[1] < z.floor[3];

// ---------- предметы на странице (на экземпляр отображения) ----------

// pointer — общий указатель отображения; hooks = { play() → снимок play ядра | null, drag(toy, [u, v]), drop(roll?),
// cancel(), floor(floor, touch), motion() → 'normal' | 'calm' | 'none', width() → ширина рамки рисунка показанного
// питомца (size.width) }; signal снимает слушатели нажатий при отключении.
export function createToys(pointer, hooks, signal) {
  const st = { box: null, toys: {}, drag: null, ro: null, key: '', z: null, relayout: false, roll: '' };

  function zone() {
    const stage = st.box?.querySelector('[data-play-stage]')?.getBoundingClientRect();
    const pet = st.box?.querySelector('[data-play-pet]');
    const rect = pet?.getBoundingClientRect();
    if (!stage || !rect?.width || !rect.height || !stage.width) return null;
    const rel = (r) => r && { left: r.left - stage.left, top: r.top - stage.top, right: r.right - stage.left, bottom: r.bottom - stage.top, width: r.width };
    const floor = st.box.querySelector('[data-play-floor]')?.getBoundingClientRect();
    const z = floorUnits(rel(stage), rel(rect), rel(floor), hooks.width?.() ?? 220);
    return usable(z) ? z : null;
  }

  const keyOf = (z = zone()) => (z ? [...z.floor, z.s, z.pet.left, z.pet.top].map((value) => Math.round(value * 10)).join() : '');

  // Пол — ядру (места предметов оно ограничит само); предметы — по рамкам: размер области нажатия (не меньше 44×44) и
  // место. Без размеров — ничего (замер — при появлении размеров, наблюдателем).
  function layout() {
    const z = zone();
    st.key = keyOf(z);
    st.z = z;
    // Сцену скрыли или сжали до нуля во время переноса — переносить некуда: перенос отменён (предмет — на месте до жеста).
    if (!z) {
      if (st.drag) pointer.release('resize');
      return;
    }
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
      hooks.floor(z.floor, z.touch);
    } finally {
      st.relayout = false;
    }
    draw({ relayout: true });
  }

  // Места из снимка: идущий перенос — под указателем сразу; конец переноса без броска (отмена, недостаточный сдвиг) —
  // сразу на место до жеста; сдвиг действием (кнопка, бросок мячика) — плавно; изменение окна — сразу. Перерисовка без
  // изменения места ничего не делает.
  function draw({ relayout = st.relayout } = {}) {
    const play = hooks.play();
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
    if (hooks.motion() === 'none' || document.hidden) {
      put(t, goal);
      return;
    }
    const [x0, y0] = [t.x, t.y];
    const start = performance.now();
    t.goal = goal;
    t.el.dataset.moving = '';
    const step = (time) => {
      t.frame = 0;
      if (!t.el) return;
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
    if (!z || !pointer.grab(event, el, { move: onMove, end: finish })) return;
    // Мячик катится — останавливается под пальцем (ядро: место — где взяли). Начало — в единицах рисунка: сдвиг указателя
    // переводится текущим масштабом, поэтому изменение рамок сцены во время переноса не оставляет прежнего масштаба.
    stopAnim(t);
    const from = toUnits(z, [t.x, t.y]);
    st.drag = { name, x0: event.clientX, y0: event.clientY, from: [t.x, t.y], fromU: from, dx: 0, on: false };
    hooks.drag(name, from);
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
    hooks.drag(d.name, [d.fromU[0] + dx / st.z.s, d.fromU[1] + dy / st.z.s]);
  }

  // Конец жеста (release указателя; вернуть — был ли сдвиг). Отпустили после заметного сдвига — миска на новом месте,
  // мячик брошен, если сдвиг влево или вправо заметный; иначе и при отмене — на месте до жеста.
  function finish(reason) {
    const d = st.drag;
    const t = st.toys[d.name];
    st.drag = null;
    if (t?.el) delete t.el.dataset.dragging;
    const up = reason === 'up' && d.on;
    if (up && d.name === 'bowl' && t && Math.hypot(t.x - d.from[0], t.y - d.from[1]) >= MOVE_PX) hooks.drop();
    else if (up && d.name === 'ball' && Math.abs(d.dx) >= ROLL_PX && st.z) {
      st.roll = 'ball';
      try {
        hooks.drop(d.dx / st.z.s);
      } finally {
        st.roll = '';
      }
    } else hooks.cancel();
    return d.on;
  }

  // Сцена закрыта или будет нарисована заново: жест отменён, движения доведены до конца, наблюдение снято.
  function unmount(reason = 'close') {
    if (st.drag) pointer.release(reason);
    st.ro?.disconnect();
    st.ro = null;
    for (const t of Object.values(st.toys)) stopAnim(t, true);
    st.toys = {};
    st.box = null;
    st.z = null;
    st.key = '';
  }

  return Object.freeze({
    // Нажатия внутри box (сцена «Поиграть», постоянный контейнер) — возможное начало жеста с предметом.
    watch(box) {
      box.addEventListener('pointerdown', onDown, { signal });
    },
    // Разметка сцены нарисована (вход, другой питомец или облик): предметы — на местах из снимка. Наблюдатель — только за
    // сценой этого отображения; замер — когда сменились рамки (без цикла: замер не меняет размеров сцены).
    mount(view) {
      unmount();
      st.box = view;
      for (const el of view.querySelectorAll('[data-play-toy]')) {
        const name = el.dataset.playToy;
        st.toys[name] = { el, spin: el.querySelector('.cat-play-spin'), x: 0, y: 0, r: 0, turn: 0, frame: 0, goal: null, shown: null, w: 0, h: 0 };
      }
      layout();
      st.ro = new ResizeObserver(() => {
        if (st.box && keyOf() !== st.key) layout();
      });
      for (const el of [view.querySelector('[data-play-stage]'), view.querySelector('[data-play-pet]')]) if (el) st.ro.observe(el);
    },
    unmount,
    draw,
    // Ядро сняло перенос предмета (вид, питомец, фон): указатель отпущен, предмет — по снимку.
    lost() {
      if (st.drag) pointer.release('lost');
    },
    dragging: () => st.drag?.name ?? '',
  });
}

// Исходные места в единицах рисунка (для проверок): HOME реэкспортом.
export const TOY_HOME = HOME;
