// Типы входа pet-companion/native (pet/native.mjs; README, «Мобильное хранение и жизненный цикл», «Нативное отображение»).
// Только описания: поведение — в pet/native/lifecycle.mjs, view.mjs, provider.mjs, corner.mjs, play.mjs (распознавание —
// gesture.mjs), наборы — pet/native/cat.mjs и dog.mjs, хук снимка — pet/hooks/state.mjs. Типы элементов — из react (@types/react проекта, как у входа /react); типы
// React Native и react-native-svg не нужны: стиль контейнера — свой структурный тип. Имя компонента PetView здесь —
// значение; тип вида ядра `PetView` ('corner' | 'play' | 'room') входа pet-companion/core от него не зависит.

import type { ReactElement, ReactNode } from 'react';
import type { PetAccessory, PetCoat, PetCore, PetDefinition, PetPoint, PetPose, PetSnapshot } from './core.mjs';

/**
 * Жизненный цикл приложения для ядра: `AppState` (`active` / `background`, iOS `inactive` и Android `blur` — отмена жеста)
 * и системное «уменьшить движение». `true` — начальная настройка движения известна текущей привязке (можно вызвать
 * `core.start()`); с другим `core` (в том числе снова тем же после `null`) — `false` уже в этой отрисовке, до свежего
 * ответа системы; после внешнего `core.destroy()` — `false`. `null` — ничего не подключает. Один владелец на ядро.
 */
export declare function useNativeLifecycle(core: PetCore | null): boolean;

/** Снимок ядра для React: `null` — нет ядра, ядро отключено. */
export declare function usePetState(core: PetCore | null): PetSnapshot | null;

/**
 * Что получает рисунок набора: поза (уже решённая ядром), облик, надетый аксессуар (`''` — без), сторона предмета, префикс
 * id. `room` (PL10.2.1, только у набора с `room: true`) — рисунок в сцене комнаты уголка: миску рисует уголок, поза `feed`
 * идёт к ней со сдвигом `feed` (`room.feedShift` снимка, единицы рисунка). Без `room` — отдельный рисунок, как в PL10.1.
 */
export interface NativeFigureProps {
  readonly pose: PetPose;
  readonly coat: PetCoat;
  readonly accessory: PetAccessory | '';
  readonly toward: '' | 'left' | 'right';
  /** Префикс id градиентов и масок экземпляра (латиница, цифры, дефис). */
  readonly prefix: string;
  readonly room?: { readonly feed: PetPoint };
}

/** Что получает рисунок своей вещи уголка: её ID и префикс id экземпляра. */
export interface NativeItemProps {
  readonly id: string;
  readonly prefix: string;
}

/**
 * Нативный набор отображения одного питомца: чем рисовать позы, облики и аксессуары его определения. Figure — чистая
 * функция без хуков: элементы react-native-svg в единицах рисунка определения (`size`, у штатных 220×204) без корневого
 * `<Svg>`; не строка разметки. Обязательные позы (по роли, с `poseFallback` определения), лапа (если есть `actions.paw`),
 * облики и аксессуары определения — нарисованы; `substitutes` — явные замены необязательных поз (декоративные `yawn`,
 * `settle`, позы сценок). **Ресурсы уголка** (PL10.2.1; необязательные, их предъявляет только PetCorner): `room: true` —
 * Figure рисует и в сцене комнаты (`NativeFigureProps.room`); `items` и `Item` — свои вещи комнаты (игрушки определения и
 * вещи ступеней вне общего уголка — подушки, лежанки, кружки, блокнота, лампы, растения, доски) в единицах сцены 400×250 на
 * исходном месте. Набор PL10.1 без них подходит PetView; уголок с ним отказывает. **Ресурсы игры** (PL10.2.2;
 * необязательное, предъявляет только PetPlay): `play: true` — рисунок совпадает с областями `play` определения (голова и
 * тело `hits`, лапа `paw`, поднятая — `paw.up`): по ним распознаются поглаживание и касание лапы; позы предметов — с
 * поворотом `toward`. Без него PetView и уголок работают, игра отказывает (вид `'play'` не объявляется). Сценок набор не
 * рисует (PL10.2.4); миску и мячик игры рисует сцена натива.
 */
export interface NativePetKit {
  readonly pet: string;
  readonly poses: readonly string[];
  readonly coats: readonly string[];
  readonly accessories: readonly string[];
  readonly substitutes?: { readonly [pose: string]: string };
  readonly Figure: (props: NativeFigureProps) => ReactElement;
  readonly room?: true;
  readonly items?: readonly string[];
  readonly Item?: (props: NativeItemProps) => ReactElement;
  readonly play?: true;
  /**
   * PL10.2.4, необязательное: ID сценок определения, которые набор рисует (поза сценки — среди poses). Координатор и PetView
   * объявляют их ядру (setDisplay.scenes); показ — PetFigure фазами поверх позы покоя. Без поля сценок нет — ни показа, ни
   * резервирования дня.
   */
  readonly scenes?: readonly string[];
}

/** Штатный набор кота: все позы словаря (settle — замена content), три облика, три платка; уголок — рисунок в комнате и клубок; игра — по областям определения кота. */
export declare const catNative: NativePetKit;
/** Штатный набор собаки: все позы словаря с поднятой лапой (settle — замена content), три облика, три платка; уголок — рисунок в комнате, канат и мячик; игра — по областям определения собаки (поднятая лапа — `play.paw.up`). */
export declare const dogNative: NativePetKit;

/** Стиль контейнера (`style` View React Native): объект стиля, зарегистрированный стиль, ложное значение или их список. */
export type PetViewStyle = object | number | false | null | undefined | readonly PetViewStyle[];

/** Свойства PetView отдельно (PL10.1). `pets` — те же определения, что у `createPetCore`; `kits` — нативные наборы (хотя бы один). */
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

/**
 * Свойства PetView внутри PetProvider (PL10.2.1): ядро и наборы — координатора, объявление отображения и объявления
 * скринридеру — тоже у него (`announce` здесь не действует).
 */
export interface PetViewComposedProps extends Omit<PetViewProps, 'core' | 'pets' | 'kits' | 'announce'> {
  readonly core?: undefined;
  readonly pets?: undefined;
  readonly kits?: undefined;
  readonly announce?: undefined;
}

/** Питомец на экране приложения: рисует снимок ядра нативным набором; касание — `interact({ type: 'pet' })`. */
export declare function PetView(props: PetViewProps | PetViewComposedProps): ReactElement | null;

/** Свойства PetProvider — координатора поверхностей одного ядра. */
export interface PetProviderProps {
  /** Ядро хоста (`createPetCore`); `null` — поверхности ничего не рисуют. Создаёт, запускает и уничтожает его хост. */
  readonly core: PetCore | null;
  readonly pets: readonly PetDefinition[];
  readonly kits: readonly NativePetKit[];
  /** Объявлять эффекты `announce` ядра скринридеру — один раз на эффект для всех поверхностей (по умолчанию true). */
  readonly announce?: boolean;
  readonly children?: ReactNode;
}

/**
 * Координатор поверхностей одного ядра (PL10.2.1, PL10.2.2): владелец `setDisplay` — `{ full: true, moving: false, pets
 * (питомцы с набором), views (подключённые поверхности: PetCorner — 'corner', PetPlay — 'play', PetRoom — 'room'), scenes — сценки наборов (PL10.2.4), playFloor и
 * playTouch — замер сцены игры, когда он есть }` — и объявлений скринридеру. Окно — одно на ядро: уголок и игра показывают
 * его по очереди. Внутри — PetView (без `core`, `pets`, `kits`), PetCorner и PetPlay. Объявляет последний подключённый к ядру координатор: замена
 * (другой React key, новый экран) передаёт объявление без сброса, его отключение возвращает объявление предыдущему, а
 * последнего — снимает с ядра (открытый вид закрыт, `views: []`); смена ядра — так же для прежнего. Жизненный цикл и
 * `start` — у хоста.
 */
export declare function PetProvider(props: PetProviderProps): ReactElement;

/** Отступы безопасной области в точках экрана (например, `useSafeAreaInsets()` из react-native-safe-area-context). */
export interface PetInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Свойства PetCorner (только внутри PetProvider). */
export interface PetCornerProps {
  /** Отступы безопасной области от хоста; без них окно оставляет системные отступы (Android — без сквозного режима). */
  readonly insets?: PetInsets;
  /** Показать вход «Уголок …» (по умолчанию true); без него хост открывает `core.open('corner')` сам. */
  readonly entry?: boolean;
  /** Доступное имя входа (по умолчанию «<имя> — уголок <кого>[, есть новая вещь]»). */
  readonly label?: string;
  /** Подсказка доступности входа (по умолчанию «Открыть уголок»). */
  readonly hint?: string;
  /** Куда вернуть фокус после закрытия (по умолчанию — вход). */
  readonly returnFocus?: { readonly current: unknown };
  /** Префикс testID узлов (по умолчанию 'corner'): '-open', '-modal', '-sheet', '-close', '-title', '-scene', '-feed', … */
  readonly testID?: string;
  readonly style?: PetViewStyle;
}

/**
 * Уголок питомца (PL10.2.1): вход — `core.open('corner')`, окно открыто, пока в снимке `view.open === 'corner'`; закрытие
 * — `core.close()` (кнопка, Android «Назад», жест VoiceOver). Внутри — комната 400×250 и питомец, вещи ступени, имя, облик,
 * аксессуары, движение и реплики, «Погладить», «Дай лапу», кормление, счёт, ступени, праздник и «Новое в уголке» — по
 * снимку и эффектам ядра. Черновик имени и «Новое в уголке» принадлежат паре «ядро и показанный питомец»: смена питомца
 * или ядра их снимает. Наборы координатора обязаны иметь ресурсы уголка (`room`, `items`, `Item`), иначе — отказ.
 * PL10.2.2: «Поиграть» (`core.open('play')`) — только когда вид `'play'` объявлен (подключён PetPlay); присутствие
 * «Всегда рядом» / «Приходит по зову» (`setPresence`), «Скрыть …» (`hide`); спрятан — вместо входа «Показать …» (`show`).
 */
export declare function PetCorner(props: PetCornerProps): ReactElement | null;

/** Свойства PetPlay (только внутри PetProvider). */
export interface PetPlayProps {
  /** Отступы безопасной области от хоста; без них окно оставляет системные отступы (Android — без сквозного режима). */
  readonly insets?: PetInsets;
  /** Показать вход «Позвать …», когда питомец приходит по зову (по умолчанию true); без него хост зовёт `core.open('play', { source: 'call' })` сам. */
  readonly entry?: boolean;
  /** Доступное имя входа вызова (по умолчанию «Позвать питомца: <имя>»). */
  readonly label?: string;
  /** Подсказка доступности входа вызова (по умолчанию «Открыть игру»). */
  readonly hint?: string;
  /** Куда вернуть фокус после закрытия окна целиком (по умолчанию — вход вызова или вход уголка). */
  readonly returnFocus?: { readonly current: unknown };
  /** Префикс testID узлов (по умолчанию 'play'): '-call', '-modal', '-sheet', '-close', '-corner', '-title', '-hint', '-stage', '-toy-bowl', '-toy-ball', '-stroke', '-paw', '-bowl', '-ball', '-note', … */
  readonly testID?: string;
  readonly style?: PetViewStyle;
}

/**
 * «Поиграть» и вызов «по зову» (PL10.2.2): окно открыто, пока в снимке `view.open === 'play'` (кнопка «Поиграть» уголка,
 * вход «Позвать …» — `core.open('play', { source: 'call' })`, прямая команда). Назад («Закрыть», Android «Назад», жест
 * VoiceOver): открыта из уголка — `core.open('corner')`, вызвана или уголка нет — `core.close()`. Сцена — питомец
 * (`pose.shown.play`), миска и мячик (`play.toys`, `play.drag`), итог (`play.outcome`, `play.text`) — по снимку; касания —
 * `stroke.*`, `interact({ type: 'paw' })`, `toy.*` (пороги — точки экрана); кнопки — `interact()`. Пол игры объявляет
 * координатор по замеру сцены. Наборы координатора обязаны иметь ресурсы игры (`play: true`), иначе — отказ.
 */
export declare function PetPlay(props: PetPlayProps): ReactElement | null;

/** Свойства PetRoom (только внутри PetProvider). */
export interface PetRoomProps {
  /** Отступы безопасной области от хоста; без них окно оставляет системные отступы. */
  readonly insets?: PetInsets;
  /** Префикс testID узлов (по умолчанию 'room'): '-modal', '-sheet', '-title', '-stage', '-pick-frame', '-pick-<id>', '-chosen', '-move-left|right|up|down', '-reset', '-bowl', '-other', '-failed', '-note', '-state', '-cancel', '-save'. */
  readonly testID?: string;
}

/**
 * «Обустроить уголок» (PL10.2.3): окно открыто, пока в снимке `view.open === 'room'` и есть черновик (`room.draft`) —
 * кнопка «Обустроить уголок» уголка (видна, когда подключён PetRoom) или `core.open('room')`. Черновик, выбор, шаги, упоры,
 * обычная расстановка, «Сохранить» (`room.save`), «Отмена» (`room.cancel`), другая запись и отказ — ядро; перенос пальцем —
 * `room.drag` / `room.drop` / `room.dragCancel` (порог — точки экрана). Назад (Android «Назад», жест VoiceOver): идущий
 * перенос — `room.dragCancel`, иначе `room.cancel()`. Фон, закрытие и поворот ничего не сохраняют. Наборы координатора
 * обязаны иметь ресурсы уголка, иначе — отказ.
 */
export declare function PetRoom(props: PetRoomProps): ReactElement | null;
