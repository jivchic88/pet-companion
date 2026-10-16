// Типы входа pet-companion/native (pet/native.mjs; README, «Мобильное хранение и жизненный цикл», «Нативное отображение»).
// Только описания: поведение — в pet/native/lifecycle.mjs, pet/native/view.mjs, наборы — pet/native/cat.mjs и dog.mjs,
// хук снимка — pet/hooks/state.mjs. Типы элементов — из react (@types/react проекта, как у входа /react); типы React
// Native и react-native-svg не нужны: стиль контейнера — свой структурный тип. Имя компонента PetView здесь — значение;
// тип вида ядра `PetView` ('corner' | 'play' | 'room') входа pet-companion/core от него не зависит.

import type { ReactElement } from 'react';
import type { PetAccessory, PetCoat, PetCore, PetDefinition, PetPose, PetSnapshot } from './core.mjs';

/**
 * Жизненный цикл приложения для ядра: `AppState` (`active` / `background`, iOS `inactive` и Android `blur` — отмена жеста)
 * и системное «уменьшить движение». `true` — начальная настройка движения известна текущей привязке (можно вызвать
 * `core.start()`); с другим `core` (в том числе снова тем же после `null`) — `false` уже в этой отрисовке, до свежего
 * ответа системы; после внешнего `core.destroy()` — `false`. `null` — ничего не подключает. Один владелец на ядро.
 */
export declare function useNativeLifecycle(core: PetCore | null): boolean;

/** Снимок ядра для React: `null` — нет ядра, ядро отключено. */
export declare function usePetState(core: PetCore | null): PetSnapshot | null;

/** Что получает рисунок набора: поза (уже решённая ядром), облик, надетый аксессуар (`''` — без), сторона предмета, префикс id. */
export interface NativeFigureProps {
  readonly pose: PetPose;
  readonly coat: PetCoat;
  readonly accessory: PetAccessory | '';
  readonly toward: '' | 'left' | 'right';
  /** Префикс id градиентов и масок экземпляра (латиница, цифры, дефис). */
  readonly prefix: string;
}

/**
 * Нативный набор отображения одного питомца (PL10.1): чем рисовать позы, облики и аксессуары его определения. Figure —
 * чистая функция без хуков: элементы react-native-svg в единицах рисунка определения (`size`, у штатных 220×204) без
 * корневого `<Svg>`; не строка разметки. Обязательные позы (по роли, с `poseFallback` определения), лапа (если есть
 * `actions.paw`), облики и аксессуары определения — нарисованы; `substitutes` — явные замены необязательных поз
 * (декоративные `yawn`, `settle`, позы сценок). Сценок, вещей уголка и предметов игры набор PL10.1 не рисует.
 */
export interface NativePetKit {
  readonly pet: string;
  readonly poses: readonly string[];
  readonly coats: readonly string[];
  readonly accessories: readonly string[];
  readonly substitutes?: { readonly [pose: string]: string };
  readonly Figure: (props: NativeFigureProps) => ReactElement;
}

/** Штатный набор кота: все позы словаря (settle — замена content), три облика, три платка. */
export declare const catNative: NativePetKit;
/** Штатный набор собаки: все позы словаря с поднятой лапой (settle — замена content), три облика, три платка. */
export declare const dogNative: NativePetKit;

/** Стиль контейнера (`style` View React Native): объект стиля, зарегистрированный стиль, ложное значение или их список. */
export type PetViewStyle = object | number | false | null | undefined | readonly PetViewStyle[];

/** Свойства PetView. `pets` — те же определения, что у `createPetCore`; `kits` — нативные наборы (хотя бы один). */
export interface PetViewProps {
  /** Ядро хоста (`createPetCore`); `null` — ничего не рисует. Создаёт, запускает и уничтожает его хост. */
  readonly core: PetCore | null;
  readonly pets: readonly PetDefinition[];
  readonly kits: readonly NativePetKit[];
  /** Ширина рисунка в точках экрана (по умолчанию 180); высота — по пропорции рисунка. */
  readonly size?: number;
  readonly style?: PetViewStyle;
  /** Доступное имя кнопки питомца (по умолчанию «<имя>, <вид>»). */
  readonly label?: string;
  /** Подсказка доступности касания (по умолчанию «Погладить»). */
  readonly hint?: string;
  /** Объявлять эффекты `announce` ядра скринридеру (по умолчанию true; у второго PetView того же ядра — false). */
  readonly announce?: boolean;
  /** Касание питомца — `interact({ type: 'pet' })` (по умолчанию true). */
  readonly touch?: boolean;
  /** Префикс testID узлов (по умолчанию 'pet'): корень, '-touch', '-motion', '-art', '-phrase', '-problem'. */
  readonly testID?: string;
}

/** Питомец на экране приложения: рисует снимок ядра нативным набором; касание — `interact({ type: 'pet' })`. */
export declare function PetView(props: PetViewProps): ReactElement | null;
