// pet-companion/native — React Native (этап PL09, частичный вход; README, «Мобильное хранение и жизненный цикл»;
// docs/ARCHITECTURE.md § 6.1, § 12.2): жизненный цикл приложения для ядра (useNativeLifecycle) и снимок для React
// (usePetState — тот же общий хук, что у pet-companion/react, без веб-оболочки). Нативного отображения (PetView, PetCorner,
// наборы) в PL09 нет — PL10. Импортирует react, react-native, pet/hooks/** и pet/native/**: ни DOM, ни CSS, ни веба. Импорт
// ничего не делает: подписки — только в эффекте хука.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { bindLifecycle } from './native/lifecycle.mjs';

export { usePetState } from './hooks/state.mjs';

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
