// Типы входа pet-companion/react (pet/react.mjs; README, «React и серверный рендер»). Только описания: поведение — в
// pet/react.mjs и pet/hooks/state.mjs. Нужны типы React проекта сайта (@types/react 18.3 или 19).

import type { ReactElement } from 'react';
import type { BehaviorDefinition, PetCore, PetDefinition, PetProgress, PetSnapshot } from './core.mjs';
import type { PetWebKit } from './pet.mjs';

/**
 * Свойства `<PetCompanion>`. Настройки подключения — `namespace`, `pets`, `behaviors`, `kits`, `watchTyping`: их смена
 * отключает прежний вид и подключает новый (горячей замены нет; новый массив того же состава — та же настройка). Функции
 * сайта — `progress`, `home`, `onOpenChange`, `onCore`: вызываются последние переданные, без пересоздания питомца. Других
 * свойств нет: детей контейнера рисует библиотека, неизвестное свойство — отказ подключения.
 */
export interface PetCompanionProps {
  /** Пространство имён хранения (непустая строка), как у `mountPetIn`. По умолчанию `'pet'`. */
  namespace?: string;
  /** Питомцы — определения формата 1; по умолчанию штатные кот и собака. */
  pets?: readonly PetDefinition[];
  /** Модели поведения; по умолчанию штатная `calm`. */
  behaviors?: readonly BehaviorDefinition[];
  /** Наборы отображения своих питомцев (стили набора — его `styles`). */
  kits?: readonly PetWebKit[];
  /** Наблюдать ввод в поля страницы (тишина реакций). По умолчанию `true`. */
  watchTyping?: boolean;
  /** Счёт сайта; вызывается часто — быстро и без побочных действий. Новая функция действует со следующего чтения (`core.refresh()`, событие). */
  progress?: (() => PetProgress) | null;
  /** Куда поставить фокус, когда своего входа у питомца нет. */
  home?: (() => HTMLElement | null | undefined) | null;
  /** Диалог питомца открылся или закрылся — блокировку прокрутки решает сайт. */
  onOpenChange?: ((open: boolean) => void) | null;
  /** Ядро после подключения; `null` — до отключения, при отказе подключения и после постороннего отключения ядра. */
  onCore?: ((core: PetCore | null) => void) | null;
  /** Класс контейнера: его размер выбирает вид «целиком» или «портрет». */
  className?: string;
}

/** Питомец в контейнере: пустой `<div>` на сервере и при гидратации, питомец — после клиентского эффекта. */
export declare function PetCompanion(props: PetCompanionProps): ReactElement;

/** Снимок ядра для React: `null` — нет ядра, сервер и гидратация, ядро отключено. */
export declare function usePetState(core: PetCore | null): PetSnapshot | null;
