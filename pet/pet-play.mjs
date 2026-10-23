// Сцена «Поиграть»: поглаживание и касание лапы пальцем, мышью и пером (Pointer Events) — распознавание жеста на странице;
// разметку, итог и фокус ведёт отображение (web/shell.mjs), смысл — ядро. Ничего не хранит. Жест начинается на голове,
// теле или лапе (data-play-hit) основным указателем: ядру — stroke.start; поглаживание — сдвиг не меньше STROKE_PX от
// начала или прошлого отклика (ядру — stroke.step на каждый порог); касание лапы — короткое (TAP_MS, PAW_SLOP_PX), на
// отпускание (ядру — interact({ type: 'paw' })). Отпустили — stroke.end; ушёл с питомца, отменён, потерял захват, скрыта
// вкладка, изменилось окно, прокрутилась сцена, сдвиг с лапы — stroke.cancel; ядро сняло жест само (play.stroke пуст) —
// указатель отпускается. Лимит, удержание позы, итог и объявления — ядро (core/play.mjs, PL04.3). Указатель — общий
// указатель отображения (web/pointer.mjs): один жест на сцену, с предметами и редактором; состояние жеста — на экземпляр
// отображения (createStroke, PL07).

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

// Области нажатия — в процентах рамки рисунка (совпадают с petPart): свойства для CSSOM (без атрибута style в разметке —
// строгий CSP, PL07) и прежняя строка для проверок.
export function hitVars(e, size) {
  return { left: pct(e.cx - e.rx, size.width), top: pct(e.cy - e.ry, size.height), width: pct(2 * e.rx, size.width), height: pct(2 * e.ry, size.height) };
}

// Лапа — круг не меньше PAW_MIN_PX по радиусу: центр (--ux, --uy — поднятой лапы) и радиус в процентах рамки,
// остальное — pet.css.
export function pawVars(p, size) {
  const vars = { '--x': pct(p.cx, size.width), '--y': pct(p.cy, size.height), '--rx': pct(p.r, size.width), '--ry': pct(p.r, size.height) };
  if (p.up) Object.assign(vars, { '--ux': pct(p.up.cx, size.width), '--uy': pct(p.up.cy, size.height) });
  return vars;
}

const line = (vars) =>
  Object.entries(vars)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
export const hitStyle = (e, size) => line(hitVars(e, size));
export const pawStyle = (p, size) => line(pawVars(p, size));

// Разметка областей — без размеров (их ставит paintHits через CSSOM после вставки).
export function hitsHtml(def) {
  return (
    def.play.hits.map((e, i) => `<span class="cat-play-hit" data-play-hit="${e.part}" data-hit="${i}" aria-hidden="true"></span>`).join('') +
    (def.play.paw ? `<span class="cat-play-hit cat-play-paw" data-play-hit="paw" aria-hidden="true"></span>` : '')
  );
}

// Размеры и места областей разметки hitsHtml внутри box — через CSSOM (element.style.setProperty).
export function paintHits(box, def) {
  for (const el of box?.querySelectorAll('[data-play-hit]') ?? []) {
    const vars = el.dataset.playHit === 'paw' ? (def.play.paw ? pawVars(def.play.paw, def.size) : null) : def.play.hits[Number(el.dataset.hit)] ? hitVars(def.play.hits[Number(el.dataset.hit)], def.size) : null;
    for (const [key, value] of Object.entries(vars ?? {})) el.style.setProperty(key, value);
  }
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

// ---------- жест на странице (на экземпляр отображения) ----------

const poseOf = (pet) => pet?.querySelector('.cat-art')?.dataset.pose ?? '';

// Жест поглаживания и касания лапы одного отображения. pointer — общий указатель отображения (web/pointer.mjs); hooks =
// { start() → id жеста ядра или null, step(id), end(id), cancel(id), paw() — касание лапы, motion(), figure(petId) →
// определение питомца (области и рамка) }; signal снимает слушатели нажатий при отключении.
export function createStroke(pointer, hooks, signal) {
  const st = { g: null, pet: null, def: null, rect: null, x: 0, y: 0, frame: 0, starting: false };

  function onDown(event) {
    const hit = event.target.closest?.('[data-play-hit]');
    if (!hit) return;
    const pet = hit.closest('[data-play-pet]');
    const rect = pet?.getBoundingClientRect();
    const def = pet ? hooks.figure?.(pet.dataset.kind) : null;
    const part = def ? partAt(def, rect, event.clientX, event.clientY, poseOf(pet)) : '';
    if (!part || !pointer.grab(event, hit, { move: strokeOn, end: strokeEnd })) return;
    st.g = { ...strokeStart(event.clientX, event.clientY), paw: part === 'paw', t0: event.timeStamp, id: null };
    Object.assign(st, { pet, def, rect, x: event.clientX, y: event.clientY });
    pet.dataset.stroking = '';
    // Начало жеста — ядру (ручное действие: сценка отменена; отклика и удержания ещё нет). Пока ядро его начинает, снимок
    // без этого жеста указатель не отпускает.
    st.starting = true;
    try {
      st.g.id = hooks.start?.() ?? null;
    } finally {
      st.starting = false;
    }
  }

  function strokeOn(event) {
    const { clientX: x, clientY: y } = event;
    // Жест с лапы — касание: сдвинули дальше порога — не касание и не поглаживание.
    if (st.g.paw) {
      if (Math.hypot(x - st.g.x0, y - st.g.y0) > PAW_SLOP_PX) pointer.release('slop');
      return;
    }
    // Рамка — текущая: сцена могла сдвинуть питомца (итог вместо подсказки, реплика), окно — нет (тогда жест отменён).
    st.rect = st.pet.getBoundingClientRect();
    if (!partAt(st.def, st.rect, x, y)) {
      pointer.release('leave');
      return;
    }
    const { g, stroke } = strokeMove(st.g, x, y);
    st.g = g;
    st.x = x;
    st.y = y;
    if (g.far >= TAP_PX) touchLater();
    if (stroke && g.id !== null) hooks.step(g.id);
  }

  // Подсветка касания — мягкое пятно под указателем, раз в кадр (не на каждое движение); без анимации её нет.
  function touchLater() {
    if (st.frame || hooks.motion() === 'none') return;
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

  // Конец жеста: подсветка снята; ядру — stroke.end (отпустили) или stroke.cancel (прерван). Касание лапы — на
  // отпускание: коротко, на месте и на лапе (рамка и поза — текущие), после конца жеста.
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
    if (g.id !== null) (reason === 'up' ? hooks.end : hooks.cancel)?.(g.id);
    if (tap) hooks.paw?.();
    return g.far >= TAP_PX || g.paw;
  }

  return Object.freeze({
    // Нажатия внутри box (сцена «Поиграть», постоянный контейнер) — возможное начало поглаживания или касания лапы.
    watch(box) {
      box.addEventListener('pointerdown', onDown, { signal });
    },
    // Жест прерван снаружи (закрытие сцены, Esc, смена или скрытие питомца, смена облика) или ядро уже сняло его.
    cancel(reason = 'cancel') {
      if (st.g) pointer.release(reason);
    },
    // Ядро сняло жест само (play.stroke пуст или другой): указатель отпускается; поздний stroke.cancel(id) ядру безвреден.
    lost(id) {
      if (st.g && !st.starting && st.g.id !== id) pointer.release('lost');
    },
    stroking: () => Boolean(st.g),
  });
}
