// pet-companion/native — React Native (README, «Мобильное хранение и жизненный цикл», «Нативное отображение»;
// docs/ARCHITECTURE.md § 6.1, § 12.2): жизненный цикл приложения для ядра (useNativeLifecycle, PL09), снимок для React
// (usePetState — тот же общий хук, что у pet-companion/react, без веб-оболочки), нативное отображение PL10.1 — компонент
// PetView и штатные наборы catNative, dogNative (рисунки react-native-svg) — и PL10.2.1: координатор поверхностей
// PetProvider (один владелец объявления отображения ядра) и уголок PetCorner. «Поиграть», «Обустроить уголок» и сценки —
// PL10.2.2–PL10.2.4, этим входом пока не обещаны. Импортирует react, react-native, react-native-svg, pet/hooks/**,
// pet/native/** и ядро: ни DOM, ни CSS, ни веба. Импорт ничего не делает: подписки — только в эффектах.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { bindLifecycle } from './native/lifecycle.mjs';

export { usePetState } from './hooks/state.mjs';
export { PetView } from './native/view.mjs';
export { PetProvider } from './native/provider.mjs';
export { PetCorner } from './native/corner.mjs';
export { catNative } from './native/cat.mjs';
export { dogNative } from './native/dog.mjs';

// useNativeLifecycle(core | null) → boolean: AppState и системное «уменьшить движение» → ядро, пока компонент подключён и
// ядро то же; true — начальная настройка движения известна текущей привязке (можно звать core.start()). Смена core,
// размонтирование, StrictMode и внешний core.destroy() снимают слушатели прежней привязки; её поздние ответы ничего не меняют.
//
// Готовность принадлежит привязке, а не ядру. Отрисовка с другим core (в том числе A → null → A и A → B → A) сбрасывает её
// сразу, сменой состояния во время отрисовки: эффекты этого commit (start хоста) уже видят false, а не прежнее true, пока
// новая привязка не узнает настройку заново. Снятая привязка (cleanup, внешний destroy) готовность тоже снимает (ended).
export function useNativeLifecycle(core) {
  const [bound, setBound] = useState({ core, ready: false });
  let current = bound;
  if (bound.core !== core) {
    current = { core, ready: false };
    setBound(current);
  }
  useEffect(() => {
    if (!core) return undefined;
    let live = true;
    const settle = (ready) => setBound((now) => (now.core === core && now.ready !== ready ? { core, ready } : now));
    const binding = bindLifecycle(core, { AppState, AccessibilityInfo }, { ready: () => live && settle(true), ended: () => settle(false) });
    return () => {
      live = false;
      binding.stop();
    };
  }, [core]);
  return Boolean(core) && current.ready;
}
