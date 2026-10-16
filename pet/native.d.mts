// Типы входа pet-companion/native (pet/native.mjs; README, «Мобильное хранение и жизненный цикл»). Только описания:
// поведение — в pet/native/lifecycle.mjs и pet/hooks/state.mjs. Частичный вход PL09: нативного отображения (PL10) нет.
// Типы React Native не нужны.

import type { PetCore, PetSnapshot } from './core.mjs';

/**
 * Жизненный цикл приложения для ядра: `AppState` (`active` / `background`, iOS `inactive` и Android `blur` — отмена жеста)
 * и системное «уменьшить движение». `true` — начальная настройка движения известна (можно вызвать `core.start()`);
 * `null` — ничего не подключает.
 */
export declare function useNativeLifecycle(core: PetCore | null): boolean;

/** Снимок ядра для React: `null` — нет ядра, ядро отключено. */
export declare function usePetState(core: PetCore | null): PetSnapshot | null;
