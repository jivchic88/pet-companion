// Типы входа pet-companion/character-web (pet/character-web.mjs; README, «Персонаж: минимальный режим»). Только описания:
// поведение — в pet/character/view.mjs.

import type { Character, CharacterDefinition, CharacterSnapshot } from './character.mjs';

/**
 * Набор отображения персонажа: `character` — ID описания; `poses` — что нарисовано (все позы описания обязательны);
 * `art({ id })` — строка `<svg …>` (позу, одиночное движение и режим движения показывают атрибуты `data-pose`,
 * `data-micro`, `data-motion`, которые ставит вид); `styles` — абсолютные адреса CSS набора (`new URL('./my.css', import.meta.url).href`).
 */
export interface CharacterKit {
  readonly character: string;
  readonly poses: readonly string[];
  art(options: { readonly id: string }): string;
  readonly styles?: readonly (string | URL)[];
}

export interface CharacterViewOptions {
  character: CharacterDefinition;
  kit: CharacterKit;
  /** Начальное имя; дальше — `view.core.setName`. */
  name?: string;
  /** Доступное имя рисунка (строка или функция от снимка); по умолчанию «Имя — название» или название. */
  label?: string | ((state: CharacterSnapshot) => string);
  /** Есть — рисунок становится кнопкой (клавиатура, фокус), нажатие вызывает функцию продукта. */
  onActivate?: ((view: CharacterView) => void) | null;
  /** Наблюдать ввод в поля страницы (тишина реакций). По умолчанию `true`. */
  watchTyping?: boolean;
}

export interface CharacterView {
  /** Подключён ли: `false` после отказа, `destroy()`, `core.destroy()` и поздней ошибки загрузки стилей. */
  readonly mounted: boolean;
  /** Экземпляр персонажа (`null` при отказе; после отключения — тот же отключённый). */
  readonly core: Character | null;
  /** Отключить экземпляр и вид (элемент, слушатели, таймеры, наблюдатели); повторно — ничего. */
  destroy(): void;
}

/**
 * Подключить персонажа в контейнер: свой элемент и открытый Shadow DOM внутри `container`. Синхронно, не бросает: отказ —
 * `mounted: false`, одно `console.error`, ничего не создано.
 */
export declare function mountCharacterIn(container: Element, options: CharacterViewOptions): CharacterView;
