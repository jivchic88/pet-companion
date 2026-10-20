'use client';
// pet-companion/character-react — персонаж в контейнере для React (минимальный режим, U01; README, «Персонаж: минимальный
// режим»). <Character> рендерит один пустой <div> одинаково на сервере и при первом клиентском рендере; персонажа
// подключает клиентский эффект (mountCharacterIn входа pet-companion/character-web). Ядро приходит через onCore; снимок —
// useCharacterState(core) (тот же хук, что usePetState: null на сервере, при гидратации и после отключения). Импорт ничего
// не делает; 'use client' — граница клиентских компонентов. Зависимость — react (необязательный партнёр пакета).

import { createElement, useEffect, useInsertionEffect, useRef, useState } from 'react';
import { mountCharacterIn } from './character/view.mjs';

export { usePetState as useCharacterState } from './hooks/state.mjs';

// Свойства самой обёртки; остальное — настройки mountCharacterIn как есть (неизвестное — отказ подключения с причиной).
const OWN = ['onCore', 'className'];
// Живые свойства: подпись (строка или функция) и действие читаются через ref при каждом вызове и передаются виду заново
// при смене (view.update) — новая функция, новая строка, появление или снятие действия персонажа не пересоздают.
const LIVE = ['onActivate', 'label'];

// <Character character kit name label onActivate watchTyping className onCore />: настройки подключения — character, kit,
// watchTyping (смена — прежний вид отключается, новый подключается); name — начальное имя, его смена — core.setName без
// пересоздания; onCore(core) — после подключения, onCore(null) — до отключения и при отказе.
export function Character(props) {
  const box = useRef(null);
  const latest = useRef(props);
  useInsertionEffect(() => {
    latest.current = props;
  });
  const { character, kit, watchTyping, name, label, onActivate } = props;
  const [core, keepCore] = useState(null);
  const held = useRef(null);
  // Обёртки живых свойств — одни на всё время жизни компонента: подпись — последняя строка или результат последней функции,
  // действие — последняя функция.
  const wraps = useRef(null);
  if (!wraps.current)
    wraps.current = {
      label: (state) => {
        const value = latest.current.label;
        return typeof value === 'function' ? value(state) : value;
      },
      onActivate: (view) => {
        const fn = latest.current.onActivate;
        return typeof fn === 'function' ? fn(view) : undefined;
      },
    };
  const liveOptions = () => ({ label: latest.current.label == null ? undefined : wraps.current.label, onActivate: typeof latest.current.onActivate === 'function' ? wraps.current.onActivate : null });

  useEffect(() => {
    const own = latest.current;
    const options = {};
    for (const key of Object.keys(own)) if (!OWN.includes(key) && !LIVE.includes(key)) options[key] = own[key];
    for (const [key, value] of Object.entries({ character, kit, watchTyping })) if (value !== undefined) options[key] = value;
    for (const [key, value] of Object.entries(liveOptions())) if (value !== undefined) options[key] = value;
    const report = (next) => {
      try {
        latest.current.onCore?.(next);
      } catch (error) {
        console.error('Персонаж: onCore бросил исключение —', error);
      }
    };
    const view = mountCharacterIn(box.current, options);
    held.current = view.mounted ? view : null;
    let told = null;
    let off = null;
    if (view.mounted) {
      told = view.core;
      off = told.subscribe(
        (update) => {
          if (update.reason !== 'destroyed' || told === null) return;
          told = null;
          keepCore(null);
          report(null);
        },
        { initial: false },
      );
      keepCore(told);
      report(told);
    } else report(null);
    return () => {
      const was = told;
      told = null;
      off?.();
      off = null;
      held.current = null;
      keepCore(null);
      if (was) report(null);
      view.destroy();
    };
  }, [character, kit, watchTyping]);

  // Смена подписи (строка, функция, снятие) или появление/снятие действия — живому виду, без пересоздания.
  const hasActivate = typeof onActivate === 'function';
  useEffect(() => {
    held.current?.update(liveOptions());
  }, [label, hasActivate]);

  // Имя — командой живого экземпляра, без пересоздания (начальное имя уходит в подключение).
  useEffect(() => {
    if (core && typeof name === 'string' && core.status !== 'destroyed') core.setName(name);
  }, [core, name]);

  return createElement('div', { ref: box, className: props.className });
}
