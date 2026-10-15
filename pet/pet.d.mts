// Типы публичного интерфейса pet/pet.mjs (README, «Интерфейс»). Только описания: поведение — в pet.mjs. Команды, снимок и
// подписка ядра — pet/core.d.mts (вход pet-companion/core).

import type { BehaviorDefinition, PetCommands, PetCore, PetDefinition, PetSnapshot } from './core.mjs';

/** Версия модуля — та же, что у пакета (package.json) и у входа `pet-companion/core`. */
export declare const VERSION: string;

/**
 * Местная дата «ГГГГ-ММ-ДД» (часовой пояс браузера) — граница дня, по которой модуль открывает лакомство и считает
 * сценки. Сайт считает по ней `progress().today`.
 */
export declare function localDay(date?: Date): string;

/** Ставит элемент питомца в разметку сайта (например, `(el) => header.append(el)`). Возвращаемое значение не используется. */
export type PetPlace = (element: HTMLElement) => unknown;

/** Места сайта (README, «Места»). `logo` и `top` обязательны; остальные — функция или нет. */
export interface PetPlaces {
  /** Компьютер: портрет в шапке, запасное место; здесь же «Показать …» после «Скрыть». */
  logo: PetPlace;
  /** Телефон (до 860 px): кнопка в шапке, запасное место; без `restore` здесь же «Показать …». */
  top: PetPlace;
  /** Компьютер: боковая панель. */
  sidebar?: PetPlace | null;
  /** Компьютер: правый нижний угол окна. */
  float?: PetPlace | null;
  /** Телефон: нижняя панель. */
  bar?: PetPlace | null;
  /** Телефон: «Показать …» в разметке сайта (например, в меню). */
  restore?: PetPlace | null;
}

/** Счёт сайта: знаков всего, за сегодня (`localDay`) и предел дня (только для подписи). Недостающие поля — 0 и без предела. */
export interface PetProgress {
  marks?: number;
  today?: number;
  limit?: number;
}

/** Следующий шаг на сайте — карточка в уголке. */
export interface PetStep {
  /** Вид шага — значение атрибута `data-type` карточки. */
  type: string;
  /** Подпись вида («Урок»). */
  kind: string;
  title: string;
  /** Текст ссылки. */
  action: string;
  href: string;
}

/** Рамка места для переноса — px окна. */
export interface PetZone {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type PetDevice = 'desktop' | 'phone';
/** Места, между которыми переносят питомца: компьютер — `logo`, `sidebar`, `bottom`; телефон — `top`, `bottom`. */
export type PetZoneId = 'logo' | 'sidebar' | 'bottom' | 'top';

/** Классы кнопок и служебных элементов сайта (по умолчанию — `pet-*` из pet-base.css). */
export interface PetClasses {
  btn?: string;
  alt?: string;
  small?: string;
  link?: string;
  close?: string;
  sr?: string;
  muted?: string;
}

/** Тексты, зависящие от сайта. */
export interface PetTexts {
  /** Лакомство до занятия. */
  wait?: string;
  /** Абзацы «Как появляются знаки и лакомство». */
  rules?: string[];
  /** Откуда знаки — в «Настройках». */
  origin?: string;
  /** Где «Показать …» после «Скрыть» (продолжение фразы). */
  back?: string;
  /** Где лапка вызова (продолжение фразы). */
  call?: string;
}

/**
 * Набор отображения legacy-веба для питомца (PL06): код рисования, отдельно от определения и модели — рисует по снимку и
 * решений не принимает. Обязан покрыть позы по их роли: конечную позу (после замен `poseFallback`) каждой обязательной
 * позы словаря и лапы, если она есть у питомца, — даже если её использует сценка и даже если это своя поза сценки или
 * `yawn`/`settle`; необязательные сценки и позы может не рисовать. Ещё облики, аксессуары и свои вещи (игрушки комнаты и
 * вещи ступеней вне общего уголка); нарисованные сценки перечисляет сам (объявляются те, что есть в определении, — с
 * нарисованной позой). Стили набора страница подключает сама (своим файлом CSS). У кота и собаки — штатные наборы; они
 * проверяются тем же правилом против переданного определения `cat`/`dog`.
 */
export interface PetWebKit {
  /** ID определения питомца из `pets`. */
  readonly pet: string;
  readonly poses: readonly string[];
  readonly scenes: readonly string[];
  readonly coats: readonly string[];
  readonly accessories: readonly string[];
  readonly items: readonly string[];
  /**
   * Рисунок: строка `<svg class="cat-art" data-kind data-view data-coat data-pose="calm" data-acc …>`; `view` — целиком или
   * портрет, `box` — место во вложенной сцене комнаты, `accessory` — надетый (портреты выбора).
   */
  art(options: { id: string; view: 'full' | 'portrait'; coat: string; className?: string; box?: { x: number; y: number; width: number; height: number } | null; accessory?: string }): string;
  /** Своя вещь или игрушка комнаты: строка `<g data-room="id">…</g>` в единицах сцены 400×250. */
  item?(id: string, options: { fresh: boolean }): string;
  /** Маленькая своя вещь рядом с питомцем (празднование ступени); `''` — общая. */
  mini?(id: string): string;
  /**
   * Стили набора (PL07) — абсолютные адреса CSS, обычно `new URL('./my.css', import.meta.url)`: контейнер
   * (`pet-companion/web`, `mountPetIn`) подключает их в своё теневое дерево. Legacy `mountPet` их не загружает — CSS набора
   * страница подключает сама.
   */
  readonly styles?: readonly (string | URL)[];
}

export interface PetOptions {
  /** Пространство имён хранения (непустая строка): ключи `<storage>:cat:v1` и т. д. По умолчанию `'pet'`. */
  storage?: string;
  places: PetPlaces;
  /** Вызывается часто — быстро и без побочных действий. */
  progress?: (() => PetProgress) | null;
  /** Следующий шаг или `null` — без карточки. */
  step?: (() => PetStep | null) | null;
  /** Переход к шагу (уголок закрыт без возврата фокуса); без неё — обычная ссылка. */
  go?: ((href: string) => unknown) | null;
  /** Рамка места для переноса или `null`; без неё перенос выключен. */
  zone?: ((device: PetDevice, id: PetZoneId) => PetZone | null | undefined) | null;
  /** Куда поставить фокус без своего входа: `panel` — открытый диалог сайта, в котором была кнопка питомца. */
  home?: ((panel?: HTMLDialogElement) => HTMLElement | null | undefined) | null;
  classes?: PetClasses;
  texts?: PetTexts;
  /** Питомцы (PL06): определения формата 1; по умолчанию — штатные кот и собака (`pet-companion/pets`). */
  pets?: readonly PetDefinition[];
  /** Модели поведения (PL06); по умолчанию — штатная `calm` (`pet-companion/behaviors`). */
  behaviors?: readonly BehaviorDefinition[];
  /**
   * Наборы отображения сторонних питомцев (у кота и собаки — штатные, свой набор их заменяет). Без набора питомец не
   * рисуется (показ — запасной). Каждый выбранный набор, штатный тоже, проверяется до подключения против своего
   * определения: неполный — отказ подключения.
   */
  kits?: readonly PetWebKit[];
}

/** Состояние страницы: экран занятия и тишина. */
export interface PetPageState {
  focus?: boolean;
  timer?: boolean;
  dictation?: boolean;
  dialog?: boolean;
}

/** Подтверждённое сайтом занятие. `progress().marks` в момент вызова уже включает его знак. */
export interface PetSaved {
  /** Постоянный id события: повтор в этом подключении не играет реакцию дважды. */
  key: string;
  /** Действие дало знак. */
  counted?: boolean;
  /** Трудное действие: поддержка вместо радости. */
  hard?: boolean;
  /** Первое занятие дня: радость подсказывает про миску. */
  first?: boolean;
}

/**
 * Экземпляр подключения. Legacy-методы `update`, `notify`, `open`, `close`, `destroy` — прежние сигнатуры, `undefined`.
 * Остальные методы — команды ядра этого подключения (те же, что у `pet.core`; результат — `PetResult`); при отказе
 * подключения — `{ ok: false, error: { code: 'destroyed' } }`, `getState()` — `null`, `subscribe` — без вызовов.
 */
export interface Pet extends Omit<PetCommands, 'getState'> {
  readonly version: string;
  /** Подключён ли этот экземпляр: `false` после отказа, `destroy()` или замены новым подключением. */
  readonly mounted: boolean;
  /** Открыт ли диалог питомца. */
  readonly opened: boolean;
  /**
   * Ядро этого подключения (`pet-companion/core`): `null` при отказе подключения; после отключения — тот же отключённый
   * экземпляр (`status: 'destroyed'`). `pet.core.destroy()` отключает всё, как `pet.destroy()`.
   */
  readonly core: PetCore | null;
  /** Снимок ядра; `null` при отказе подключения. */
  getState(): PetSnapshot | null;
  /** Без аргумента — перечитать `progress()` и `step()`; с объектом — состояние страницы. */
  update(state?: PetPageState): void;
  /** `detail = null` — сохранённое действие не занятие: только перечитать числа. */
  notify(type: 'saved', detail: PetSaved | null): void;
  notify(type: 'failed'): void;
  open(view?: 'corner' | 'play'): void;
  close(options?: { restore?: boolean }): void;
  /** Полное отключение; повторный вызов ничего не делает. */
  destroy(): void;
}

/** Подключить питомца. Не бросает исключений: при отказе — `console.error` и экземпляр с `mounted === false`. */
export declare function mountPet(options: PetOptions): Pet;
