// Типы входа pet-companion/web (pet/web.mjs; README, «Питомец в контейнере»). Только описания: поведение — в pet/web/**.
// Контейнерный режим (mountPetIn), веб-адаптеры ядра (createWebStorage, createWebScenes) и штатные наборы отображения.

import type { BehaviorDefinition, PetCore, PetDefinition, PetProgress, PetResult, PetSceneReserver, PetSyncStorage, PetView as PetViewKind } from './core.mjs';
import type { PetWebKit } from './pet.mjs';

export type { PetWebKit };

/** Настройки контейнера: всё необязательно. Неизвестная настройка — отказ подключения. */
export interface PetViewOptions {
  /** Пространство имён хранения (непустая строка): ключи `<namespace>:cat:v1` и т. д., база IndexedDB `<namespace>:scene`. По умолчанию `'pet'`. */
  namespace?: string;
  /** Счёт сайта; вызывается часто — быстро и без побочных действий. По умолчанию — ноль знаков. */
  progress?: (() => PetProgress) | null;
  /** Питомцы — определения формата 1; по умолчанию штатные кот и собака (`pet-companion/pets`). */
  pets?: readonly PetDefinition[];
  /** Модели поведения; по умолчанию штатная `calm` (`pet-companion/behaviors`). */
  behaviors?: readonly BehaviorDefinition[];
  /** Наборы отображения своих питомцев (у кота и собаки — штатные `catWeb`, `dogWeb`); стили набора — его `styles`. */
  kits?: readonly PetWebKit[];
  /** Куда поставить фокус, когда своего входа у питомца нет (закрытие диалога без видимого питомца, отключение с фокусом внутри). */
  home?: (() => HTMLElement | null | undefined) | null;
  /** Диалог питомца открылся (`true`) или закрылся (`false`) — только настоящие переходы; блокировку прокрутки решает сайт. */
  onOpenChange?: ((open: boolean) => void) | null;
  /** Наблюдать ввод в поля страницы (только чтение `focusin`/`focusout`) — тишина реакций; `false` — не наблюдать. По умолчанию `true`. */
  watchTyping?: boolean;
}

/**
 * Питомец в контейнере. `mounted` — подключён ли: `false` после отказа, `destroy()`, `core.destroy()` и поздней ошибки
 * загрузки стилей. `core` — ядро этого вида (`null` при отказе; после отключения — тот же отключённый экземпляр).
 */
export interface PetView {
  readonly mounted: boolean;
  readonly core: PetCore | null;
  /**
   * Открыть вид диалога: уголок, сразу «Поиграть» («Закрыть» — к странице) или «Обустроить уголок»; диалог уже открыт —
   * смена вида. Результат — команды ядра; контейнер скрыт или без размеров — `unsupported`; после отключения — `destroyed`.
   */
  open(view?: PetViewKind): PetResult<{ readonly fresh: readonly string[] }>;
  /** Закрыть диалог: фокус — на питомца в контейнере (иначе `home()`). После отключения — `destroyed`. */
  close(): PetResult;
  /** Отключить ядро и вид (элемент, слушатели, таймеры, наблюдатели, захват указателя); повторно — ничего. */
  destroy(): void;
}

/**
 * Подключить питомца в контейнер: свой элемент и открытый Shadow DOM внутри `container` (чужие дети не трогаются).
 * Синхронно, не бросает: отказ — `mounted: false`, одно `console.error`, ничего не создано и не записано.
 */
export declare function mountPetIn(container: Element, options?: PetViewOptions): PetView;

export interface PetWebAdapterOptions {
  /** Пространство имён (непустая строка). По умолчанию `'pet'`. */
  namespace?: string;
}

/**
 * Координатор хранения на `localStorage` страницы — для своего ядра (`createPetCore` из `pet-companion/core` этой же
 * копии пакета). Тот же объект для того же `namespace`; создаётся загруженным (`status` — `'ready'` или `'failed'`), перед
 * каждым новым ядром — `load()`. Ошибка настроек — `PetError`.
 */
export declare function createWebStorage(options?: PetWebAdapterOptions): PetSyncStorage;

/** Резервирование дня редкой сценки на IndexedDB (`<namespace>:scene`), общее для ядер с этим `namespace`. Ошибка настроек — `PetError`. */
export declare function createWebScenes(options?: PetWebAdapterOptions): PetSceneReserver;

/** Штатный набор отображения кота (рисунки и стили пакета). */
export declare const catWeb: PetWebKit;
/** Штатный набор отображения собаки. */
export declare const dogWeb: PetWebKit;
