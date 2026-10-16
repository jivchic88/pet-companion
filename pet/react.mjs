'use client';
// pet-companion/react — питомец в контейнере для React (этап PL08; README, «React и серверный рендер»; docs/ARCHITECTURE.md
// § 11.3). PetCompanion рендерит один пустой <div> — одинаково на сервере и при первом клиентском рендере (гидратация без
// расхождений); питомца подключает только клиентский эффект (mountPetIn, тот же контейнерный режим, что у входа
// pet-companion/web). Содержимым контейнера управляет библиотека; заглушку на время загрузки сайт рисует рядом — по
// usePetState(core) === null. Импорт ничего не делает: ни DOM, ни хранилища, ни браузерных глобалов (вход безопасен для
// серверного рендера); 'use client' — граница клиентских компонентов для сред с серверными компонентами. Зависимость —
// react (необязательный партнёр пакета): остальные входы пакета React не требуют.

import { createElement, useEffect, useInsertionEffect, useRef, useState } from 'react';
import { mountPetIn } from './web/view.mjs';

export { usePetState } from './hooks/state.mjs';

// Свойства самой обёртки. Остальные — настройки mountPetIn как есть: неизвестное свойство (в том числе children) — отказ
// подключения с причиной, как у mountPetIn.
const OWN = ['onCore', 'className'];
// Функции сайта читаются через ref при каждом вызове: новая функция при новом рендере не пересоздаёт питомца.
const LIVE = ['progress', 'home', 'onOpenChange'];

// Тот же состав — те же элементы в том же порядке.
function sameList(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (!Object.hasOwn(a, i) || !Object.hasOwn(b, i) || a[i] !== b[i]) return false;
  return true;
}

// Список определений или наборов как настройка подключения: новый массив того же состава (pets={[cat, dog]} в разметке)
// — та же ссылка, питомец не пересоздаётся; другой состав — новое подключение.
function useList(list) {
  const [kept, keep] = useState(() => list);
  const same = sameList(kept, list);
  if (!same) keep(() => list);
  return same ? kept : list;
}

// <PetCompanion namespace progress onCore … />: настройки подключения — namespace, pets, behaviors, kits, watchTyping
// (смена — прежний вид отключается, новый подключается, как при смене namespace; горячей замены нет); функции сайта —
// progress, home, onOpenChange, onCore (последние, без пересоздания); className — класс контейнера (его размер задаёт вид
// «целиком» или «портрет»). onCore(core) — после подключения; onCore(null) — до отключения (размонтирование, смена
// настроек, StrictMode), при отказе подключения и когда ядро отключили помимо обёртки (core.destroy(), поздняя ошибка
// стилей) — питомец тогда сам не оживает.
export function PetCompanion(props) {
  const box = useRef(null);
  const latest = useRef(props);
  // Последние свойства — до эффектов этого же рендера и до любых вызовов питомца после него.
  useInsertionEffect(() => {
    latest.current = props;
  });
  const pets = useList(props.pets);
  const behaviors = useList(props.behaviors);
  const kits = useList(props.kits);
  const { namespace, watchTyping } = props;

  useEffect(() => {
    const own = latest.current;
    const options = {};
    for (const key of Object.keys(own)) if (!OWN.includes(key)) options[key] = own[key];
    for (const [key, value] of Object.entries({ namespace, watchTyping, pets, behaviors, kits })) if (value !== undefined) options[key] = value;
    for (const key of LIVE) {
      const value = own[key];
      // Не функция — как есть: mountPetIn откажет с причиной.
      options[key] =
        value == null || typeof value === 'function'
          ? (...args) => {
              const fn = latest.current[key];
              return typeof fn === 'function' ? fn(...args) : undefined;
            }
          : value;
    }
    // Исключение onCore — журнал браузера, как у функций сайта в mountPetIn: наружу не выходит.
    const report = (core) => {
      try {
        latest.current.onCore?.(core);
      } catch (error) {
        console.error('Питомец: onCore бросил исключение —', error);
      }
    };
    const view = mountPetIn(box.current, options);
    // Ядро, о котором сказано сайту; null — сказано «нет» (или ещё ничего).
    let told = null;
    let off = null;
    if (view.mounted) {
      told = view.core;
      off = told.subscribe(
        (update) => {
          if (update.reason !== 'destroyed' || told === null) return;
          told = null;
          report(null);
        },
        { initial: false },
      );
      report(told);
    } else report(null);
    // Один раз и только своё: сначала сайту null (ядро ещё живо), затем отключение вида. Повторный вызов и вызов после
    // постороннего отключения ничего не говорят; следующее подключение (новый эффект) не затрагивается.
    return () => {
      const was = told;
      told = null;
      off?.();
      off = null;
      if (was) report(null);
      view.destroy();
    };
  }, [namespace, watchTyping, pets, behaviors, kits]);

  return createElement('div', { ref: box, className: props.className });
}
