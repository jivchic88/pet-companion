// Натив: PetProvider — координатор поверхностей одного ядра (этап PL10.2.1; README, «Нативное отображение»;
// docs/ARCHITECTURE.md § 12.2). Владелец объявления отображения setDisplay этого ядра и объявлений
// скринридеру; дети — PetView (режим композиции: без своего объявления и объявлений) и PetCorner (уголок) — берут у него
// ядро и проверенный каталог наборов. Ядро, жизненный цикл (useNativeLifecycle) и start остаются у хоста.
//
// Объявление: { full: true, moving: false, pets — питомцы с набором, views — виды, чьи поверхности сейчас подключены
// (PetCorner — 'corner'), scenes: {} — сценок нет: ни резервирования дня, ни показа }. Поверхность подключается
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

import { createContext, createElement as h, isValidElement, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import { systemLog } from '../core/ports.mjs';
import { nativeCatalog } from './kits.mjs';

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

// Состояние координатора (на экземпляр): подключённые поверхности по виду, ядро, к которому он подключён, ключ его
// действующего объявления (declared — пока владелец), подключён ли сам (live), ядро и каталог последней отрисовки.
function coordinator() {
  const b = { views: new Map(), core: null, declared: null, live: false, latest: { core: null, ids: [] } };
  // Владелец ли объявления своего ядра (объявления скринридеру — только у него).
  b.owns = () => b.core !== null && ownerOf(b.core) === b;
  // Объявить текущее (без повтора того же): ядро и каталог — последней отрисовки, виды — подключённых поверхностей;
  // открытый вид без поверхности — закрыт до объявления. Не владелец (ждёт в очереди) — ничего.
  b.sync = () => {
    if (!b.live) return;
    const { core: c, ids: list } = b.latest;
    seat(b, alive(c) && list.length ? c : null);
    if (!b.owns()) return;
    const views = VIEW_ORDER.filter((view) => (b.views.get(view) ?? 0) > 0);
    const key = `${list.join('\n')}|${views.join(',')}`;
    if (b.declared === key) return;
    const open = quiet('снимок не прочитан', () => c.getState().view.open);
    if (open && VIEW_ORDER.includes(open) && !views.includes(open)) quiet('вид не закрыт', () => c.close());
    const result = quiet('объявление отображения не принято', () => c.setDisplay({ full: true, moving: false, pets: list, views, scenes: {} }));
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
  return b;
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
    b.latest = { core: usable, ids: catalog.ids };
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

  const value = useMemo(() => ({ core, usable, catalog, register: b.register }), [core, usable, catalog, b]);
  return h(PetContext.Provider, { value }, children);
}
