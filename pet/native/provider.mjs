// Натив: PetProvider — координатор поверхностей одного ядра (этапы PL10.2.1, PL10.2.2; README, «Нативное отображение»;
// docs/ARCHITECTURE.md § 12.2). Владелец объявления отображения setDisplay этого ядра и объявлений
// скринридеру; дети — PetView (режим композиции: без своего объявления и объявлений), PetCorner (уголок) и PetPlay
// («Поиграть», вызов «по зову») — берут у него ядро и проверенный каталог наборов. Ядро, жизненный цикл
// (useNativeLifecycle) и start остаются у хоста.
//
// Объявление: { full: true, moving: false, pets — питомцы с набором, views — виды, чьи поверхности сейчас подключены
// (PetCorner — 'corner', PetPlay — 'play', PetRoom — 'room'), scenes — сценки, которые рисуют наборы (поле scenes набора, PL10.2.4;
// без него — ни резервирования дня, ни показа); playFloor, playTouch —
// пол игры, когда он измерен }. Поверхность подключается
// register(view) → отписка; подключение объявляется сразу, отключение — микрозадачей (StrictMode и пересоздание той же
// поверхности не дают промежуточного сброса), открытый вид без поверхности закрывается ядром (core.close) перед
// объявлением — ядро не считает уголок на виду без его поверхности. Повтор того же объявления не отправляется.
//
// Владение (PL10.2.1, доработка): у ядра объявляет один координатор — последний подключённый к нему. Замена координатора
// на том же ядре (другой React key, новый экран поверх прежнего) передаёт объявление новому без промежуточного сброса:
// отложенное снятие прежнего чужое объявление не трогает. Отключение владельца (размонтирование, смена ядра) возвращает
// объявление предыдущему подключённому — тот объявляет свои виды, — а без него снимает: открытый вид закрыт, views: [] —
// устаревших разрешений не остаётся. Объявления скринридеру — тоже только у владельца (одно на эффект). Неверные pets или
// kits — координатор не подключается и ничего не объявляет (поверхности показывают отказ). Состояние — на экземпляр;
// очередь координаторов — на ядро (WeakMap: ядра независимы, отключённое ядро не удерживается).
//
// «Поиграть» (PL10.2.2): поверхность PetPlay — вид 'play'; пол игры { playFloor, playTouch } — замер её сцены (place(token,
// пол | null)): объявляется пол последней измеренной поверхности этого координатора, пока она подключена; снятая
// поверхность свой пол забирает. Ядро снять пол не умеет (setDisplay принимает только прямоугольник), поэтому поверхность
// сама не принимает ввод, пока в снимке не её пол (playFloor, playTouch); новое ядро получает только свежий замер.
// Окно — одно на ядро (useWindow): iOS показывает модальное окно поверх корня, и новое не покажется, пока прежнее ещё
// уходит, — поэтому уголок и игра показывают окно по очереди (iOS — после onDismiss прежнего, Android — сразу). Входы
// поверхностей (вход уголка, вызов «по зову») — для возврата фокуса после закрытия окна (entry, focusEntry).

import { createContext, createElement as h, isValidElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { systemLog } from '../core/ports.mjs';
import { nativeCatalog, nativeScenes } from './kits.mjs';

export const PetContext = createContext(null);
export const usePetContext = () => useContext(PetContext);

const VIEW_ORDER = ['corner', 'play', 'room'];
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => item === b[i]);

// Каталог на экземпляр: пересчёт только при смене состава pets или kits (не при каждой отрисовке со встроенными массивами).
export function useCatalog(pets, kits) {
  const memo = useRef(null);
  if (!memo.current || !same(memo.current.pets, pets) || !same(memo.current.kits, kits)) memo.current = { pets, kits, catalog: nativeCatalog(pets, kits, isValidElement) };
  return memo.current.catalog;
}

// Объявления ядра — скринридеру, по одному на эффект announce; своя подписка снимается при смене ядра и размонтировании.
// mine — необязательная постоянная проверка в момент эффекта (координатор: объявляет только владелец).
export function useAnnounce(core, on, who, mine = null) {
  useEffect(() => {
    if (!core || !on) return undefined;
    return core.subscribe(
      (update) => {
        if (mine && !mine()) return;
        for (const effect of update.effects) {
          if (effect.type !== 'announce' || !effect.text) continue;
          try {
            AccessibilityInfo.announceForAccessibility(effect.text);
          } catch (error) {
            systemLog.warn(`${who}: объявление не передано`, error);
          }
        }
      },
      { initial: false },
    );
  }, [core, on, who, mine]);
}

const alive = (core) => Boolean(core) && core.status !== 'destroyed';
const quiet = (what, fn) => {
  try {
    return fn();
  } catch (error) {
    systemLog.warn(`PetProvider: ${what}`, error);
    return null;
  }
};

// Координаторы ядра по порядку подключения: ядро → [состояние координатора]; объявляет последний — владелец.
const queues = new WeakMap();
const ownerOf = (c) => queues.get(c)?.at(-1) ?? null;
const keyable = (c) => alive(c) && (typeof c === 'object' || typeof c === 'function');

// Снять объявление с ядра c: открытый вид закрыт, видов нет.
function withdraw(c) {
  if (!alive(c)) return;
  const open = quiet('снимок не прочитан', () => c.getState().view.open);
  if (open && VIEW_ORDER.includes(open)) quiet('вид не закрыт', () => c.close());
  quiet('объявление не снято', () => c.setDisplay({ views: [] }));
}

// Координатор b покидает своё ядро. Его объявление действовало — оно переходит к предыдущему подключённому (тот
// объявляет свои виды), а без него снимается. Не действовало (b ждал в очереди или его заменили) — ядро не трогается.
function leave(b) {
  const c = b.core;
  const owned = b.declared !== null;
  b.core = null;
  b.declared = null;
  const queue = queues.get(c);
  if (!queue) return;
  const at = queue.indexOf(b);
  if (at >= 0) queue.splice(at, 1);
  if (!queue.length) queues.delete(c);
  if (!owned) return;
  const next = queue.at(-1);
  if (next) {
    next.declared = null;
    next.sync();
    if (next.core === c && next.declared !== null) return;
  }
  withdraw(c);
}

// Подключить координатор b к ядру c (null — ни к какому): прежнее он покидает, в очередь нового встаёт последним.
function seat(b, c) {
  if (b.core === c) return;
  if (b.core) leave(b);
  if (!keyable(c)) return;
  b.core = c;
  const queue = queues.get(c) ?? [];
  queues.set(c, queue);
  queue.push(b);
}

// Пол игры для объявления: последний замер подключённой поверхности (Map хранит порядок: свежий — в конце) или null.
const floorOf = (floors) => [...floors.values()].at(-1) ?? null;

// Состояние координатора (на экземпляр): подключённые поверхности по виду, ядро, к которому он подключён, ключ его
// действующего объявления (declared — пока владелец), подключён ли сам (live), ядро и каталог последней отрисовки, замеры
// пола поверхностей игры (floors: поверхность → { playFloor, playTouch }) и входы для возврата фокуса (entries).
function coordinator() {
  const b = { views: new Map(), core: null, declared: null, live: false, latest: { core: null, ids: [] }, floors: new Map(), entries: new Map() };
  // Владелец ли объявления своего ядра (объявления скринридеру — только у него).
  b.owns = () => b.core !== null && ownerOf(b.core) === b;
  // Объявить текущее (без повтора того же): ядро и каталог — последней отрисовки, виды — подключённых поверхностей;
  // открытый вид без поверхности — закрыт до объявления. Не владелец (ждёт в очереди) — ничего.
  b.sync = () => {
    if (!b.live) return;
    const { core: c, ids: list, scenes = {} } = b.latest;
    seat(b, alive(c) && list.length ? c : null);
    if (!b.owns()) return;
    const views = VIEW_ORDER.filter((view) => (b.views.get(view) ?? 0) > 0);
    const floor = views.includes('play') ? floorOf(b.floors) : null;
    const key = `${list.join('\n')}|${views.join(',')}|${JSON.stringify(scenes)}|${floor ? `${floor.playFloor.join(',')}/${floor.playTouch}` : ''}`;
    if (b.declared === key) return;
    const open = quiet('снимок не прочитан', () => c.getState().view.open);
    if (open && VIEW_ORDER.includes(open) && !views.includes(open)) quiet('вид не закрыт', () => c.close());
    const display = { full: true, moving: false, pets: list, views, scenes };
    if (floor) Object.assign(display, { playFloor: [...floor.playFloor], playTouch: floor.playTouch });
    const result = quiet('объявление отображения не принято', () => c.setDisplay(display));
    if (result?.ok) {
      for (const other of queues.get(c) ?? []) other.declared = null;
      b.declared = key;
    } else if (result) systemLog.warn(`PetProvider: объявление отображения не принято (${result.error?.code})`);
  };
  // Поверхность вида view подключена: объявить сразу; отписка — микрозадачей (повторное подключение той же поверхности
  // в этом такте отменяет снятие), затем объявление без вида (открытый вид без поверхности закрыт).
  b.register = (view) => {
    b.views.set(view, (b.views.get(view) ?? 0) + 1);
    b.sync();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      b.views.set(view, (b.views.get(view) ?? 1) - 1);
      queueMicrotask(() => {
        if (b.live && (b.views.get(view) ?? 0) === 0) b.sync();
      });
    };
  };
  // Замер пола поверхности игры token (null — замера нет: снята, скрыта, нулевой размер, другое ядро). Объявляется только
  // новый замер: снять пол ядро не умеет, а снятие поверхности объявит её уход само (register, микрозадачей) — объявление
  // здесь, в очистке эффектов, видело бы временно пустые виды и закрыло бы открытый вид.
  b.place = (token, floor) => {
    const was = floorOf(b.floors);
    b.floors.delete(token);
    if (floor) b.floors.set(token, { playFloor: [...floor.playFloor], playTouch: floor.playTouch });
    const now = floorOf(b.floors);
    if (!now || (was && was.playTouch === now.playTouch && was.playFloor.join() === now.playFloor.join())) return;
    b.sync();
  };
  // Вход поверхности kind ('corner' — вход уголка, 'call' — вызов «по зову»): функция, переводящая на него фокус.
  b.entry = (kind, focus) => {
    b.entries.set(kind, focus);
    return () => {
      if (b.entries.get(kind) === focus) b.entries.delete(kind);
    };
  };
  b.focusEntry = (kind) => {
    const focus = b.entries.get(kind);
    if (!focus) return false;
    quiet('фокус не перенесён', focus);
    return true;
  };
  return b;
}

// Окно ядра (одно на ядро): кто его держит и кто ждёт. holder — поверхность, чьё окно показано или ещё уходит (iOS — до
// onDismiss); освобождение будит ждущих.
const stages = new WeakMap();
function stageOf(c) {
  if (!keyable(c)) return null;
  let stage = stages.get(c);
  if (!stage) {
    stage = { holder: null, waiting: new Set() };
    stages.set(c, stage);
  }
  return stage;
}
function free(stage, token) {
  if (stage.holder !== token) return;
  stage.holder = null;
  for (const wake of [...stage.waiting]) wake();
}
// Запасной срок освобождения окна на iOS, если onDismiss не пришёл (окно снято вместе с деревом и т. п.).
const DISMISS_MS = 900;

// useWindow(core, want) → { visible, holding, dismissed }: показать окно поверхности, когда она хочет (want — её вид открыт)
// и окно ядра свободно или уже её. Хотела и больше не хочет: Android — освобождает сразу после фиксации, iOS — по
// dismissed() (onDismiss окна) или по запасному сроку. Размонтирование и смена ядра освобождают окно. holding — окно
// держит эта поверхность (показано или ещё уходит) на момент отрисовки: она и возвращает фокус, когда всё закрыто.
export function useWindow(core, want) {
  const token = useRef(null);
  if (!token.current) token.current = {};
  const me = token.current;
  const [, wake] = useState(0);
  const stage = stageOf(core);
  const visible = Boolean(stage && want && (stage.holder === null || stage.holder === me));
  // Запасной срок iOS — один на уход окна (новые отрисовки его не продлевают).
  const late = useRef(null);
  const settle = () => {
    clearTimeout(late.current);
    late.current = null;
  };
  // Ждать и освобождать — в эффектах раскладки: снятая поверхность (замена React key, другой экран) освобождает окно до
  // эффектов новой — та берёт его в той же фиксации, без промежуточного «окна нет».
  useLayoutEffect(() => {
    if (!stage) return undefined;
    const bump = () => wake((n) => n + 1);
    stage.waiting.add(bump);
    return () => {
      stage.waiting.delete(bump);
      settle();
      free(stage, me);
    };
  }, [stage, me]);
  useLayoutEffect(() => {
    if (!stage) return;
    if (want) {
      settle();
      if (stage.holder === null) {
        stage.holder = me;
        // Окно освободилось после отрисовки — показать.
        if (!visible) wake((n) => n + 1);
      } else if (stage.holder !== me && visible) wake((n) => n + 1); // другая поверхность взяла окно в этой фиксации
      return;
    }
    if (stage.holder !== me) return;
    if (Platform.OS !== 'ios') free(stage, me);
    else if (!late.current) late.current = setTimeout(() => ((late.current = null), free(stage, me)), DISMISS_MS);
  });
  return {
    visible,
    holding: Boolean(stage && (stage.holder === me || (visible && stage.holder === null))),
    dismissed: () => {
      if (want || !stage) return;
      settle();
      free(stage, me);
    },
  };
}

export function PetProvider({ core = null, pets, kits, announce = true, children = null }) {
  const catalog = useCatalog(pets, kits);
  const usable = catalog.problem ? null : core;
  const ids = catalog.ids.join('\n');
  const book = useRef(null);
  if (!book.current) book.current = coordinator();
  const b = book.current;

  // Последние ядро и каталог — до эффектов детей (их подключение объявляет уже текущее).
  useLayoutEffect(() => {
    b.latest = { core: usable, ids: catalog.ids, scenes: nativeScenes(catalog) };
  });

  // Подключение координатора и смена ядра или каталога — объявление; размонтирование — уход от ядра микрозадачей (StrictMode
  // подключает снова в том же такте — без промежуточного сброса; заменивший координатор к этому времени уже владелец).
  useEffect(() => {
    b.live = true;
    b.sync();
    return () => {
      b.live = false;
      queueMicrotask(() => {
        if (!b.live && b.core) leave(b);
      });
    };
  }, [b, usable, ids]);

  useEffect(() => {
    if (catalog.problem && core) systemLog.warn(`PetProvider: ${catalog.problem}`);
  }, [catalog.problem, core]);

  useAnnounce(usable, announce, 'PetProvider', b.owns);

  const value = useMemo(() => ({ core, usable, catalog, register: b.register, place: b.place, entry: b.entry, focusEntry: b.focusEntry }), [core, usable, catalog, b]);
  return h(PetContext.Provider, { value }, children);
}
