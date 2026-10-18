// Натив: PetProvider — координатор поверхностей одного ядра (этап PL10.2.1; README, «Нативное отображение»;
// docs/ARCHITECTURE.md § 12.2). Единственный владелец объявления отображения setDisplay этого ядра и объявлений
// скринридеру; дети — PetView (режим композиции: без своего объявления и объявлений) и PetCorner (уголок) — берут у него
// ядро и проверенный каталог наборов. Ядро, жизненный цикл (useNativeLifecycle) и start остаются у хоста.
//
// Объявление: { full: true, moving: false, pets — питомцы с набором, views — виды, чьи поверхности сейчас подключены
// (PetCorner — 'corner'), scenes: {} — сценок нет: ни резервирования дня, ни показа }. Поверхность подключается
// register(view) → отписка; подключение объявляется сразу, отключение — микрозадачей (StrictMode и пересоздание той же
// поверхности не дают промежуточного сброса), открытый вид отключённой поверхности закрывается ядром (core.close) — ядро
// не считает уголок на виду без его поверхности. Повтор того же объявления не отправляется. Смена ядра и размонтирование
// координатора снимают его объявление с прежнего ядра: открытый вид закрыт, views: [] — устаревших разрешений не остаётся.
// Неверные pets или kits — ничего не объявляется (поверхности показывают отказ). Всё состояние — на экземпляр.

import { createContext, createElement as h, isValidElement, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
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
export function useAnnounce(core, on, who) {
  useEffect(() => {
    if (!core || !on) return undefined;
    return core.subscribe(
      (update) => {
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
  }, [core, on, who]);
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

export function PetProvider({ core = null, pets, kits, announce = true, children = null }) {
  const catalog = useCatalog(pets, kits);
  const usable = catalog.problem ? null : core;
  const ids = catalog.ids.join('\n');
  // Состояние координатора: подключённые поверхности по виду, последнее объявление { core, key }, подключён ли сам.
  const book = useRef(null);
  if (!book.current) book.current = { views: new Map(), declared: null, live: false, latest: { core: null, ids: [] } };

  // Снять своё объявление с ядра c: открытый вид его поверхностей закрыт, видов нет.
  const withdraw = useCallback((c) => {
    if (!alive(c)) return;
    const open = quiet('снимок не прочитан', () => c.getState().view.open);
    if (open && VIEW_ORDER.includes(open)) quiet('вид не закрыт', () => c.close());
    quiet('объявление не снято', () => c.setDisplay({ views: [] }));
  }, []);

  // Объявить текущее (без повтора того же): ядро и каталог — последней отрисовки, виды — подключённых поверхностей.
  const sync = useCallback(() => {
    const b = book.current;
    if (!b.live) return;
    const { core: c, ids: list } = b.latest;
    if (b.declared && b.declared.core !== c) {
      withdraw(b.declared.core);
      b.declared = null;
    }
    if (!alive(c) || !list.length) return;
    const views = VIEW_ORDER.filter((view) => (b.views.get(view) ?? 0) > 0);
    const key = `${list.join('\n')}|${views.join(',')}`;
    if (b.declared?.core === c && b.declared.key === key) return;
    const result = quiet('объявление отображения не принято', () => c.setDisplay({ full: true, moving: false, pets: list, views, scenes: {} }));
    if (result?.ok) b.declared = { core: c, key };
    else if (result) systemLog.warn(`PetProvider: объявление отображения не принято (${result.error?.code})`);
  }, [withdraw]);

  // Поверхность вида view подключена: объявить сразу; отписка — микрозадачей (повторное подключение той же поверхности
  // в этом такте отменяет снятие), открытый вид без поверхности закрывается.
  const register = useCallback(
    (view) => {
      const b = book.current;
      b.views.set(view, (b.views.get(view) ?? 0) + 1);
      sync();
      let done = false;
      return () => {
        if (done) return;
        done = true;
        b.views.set(view, (b.views.get(view) ?? 1) - 1);
        queueMicrotask(() => {
          if (!b.live || (b.views.get(view) ?? 0) > 0) return;
          const c = b.latest.core;
          if (alive(c) && quiet('снимок не прочитан', () => c.getState().view.open) === view) quiet('вид не закрыт', () => c.close());
          sync();
        });
      };
    },
    [sync],
  );

  // Последние ядро и каталог — до эффектов детей (их подключение объявляет уже текущее).
  useLayoutEffect(() => {
    book.current.latest = { core: usable, ids: catalog.ids };
  });

  // Подключение координатора и смена ядра или каталога — объявление; размонтирование — снятие микрозадачей (StrictMode
  // подключает снова в том же такте — без промежуточного сброса).
  useEffect(() => {
    const b = book.current;
    b.live = true;
    sync();
    return () => {
      b.live = false;
      queueMicrotask(() => {
        if (b.live || !b.declared) return;
        withdraw(b.declared.core);
        b.declared = null;
      });
    };
  }, [usable, ids, sync, withdraw]);

  useEffect(() => {
    if (catalog.problem && core) systemLog.warn(`PetProvider: ${catalog.problem}`);
  }, [catalog.problem, core]);

  useAnnounce(usable, announce, 'PetProvider');

  const value = useMemo(() => ({ core, usable, catalog, register }), [core, usable, catalog, register]);
  return h(PetContext.Provider, { value }, children);
}
