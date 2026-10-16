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
// ядро то же; true — начальная настройка движения известна (можно звать core.start()). Смена core, размонтирование,
// StrictMode и внешний core.destroy() снимают слушатели прежней привязки; её поздние ответы ничего не меняют.
export function useNativeLifecycle(core) {
  const [ready, setReady] = useState(null);
  useEffect(() => {
    if (!core) return undefined;
    const bound = bindLifecycle(core, { AppState, AccessibilityInfo }, { ready: () => setReady(core) });
    return bound.stop;
  }, [core]);
  return Boolean(core) && ready === core;
}
