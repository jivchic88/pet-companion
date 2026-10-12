// Типы публичного интерфейса pet/pet.mjs (README, «Интерфейс»). Только описания: поведение — в pet.mjs.

/** Версия модуля — та же, что у пакета (package.json). */
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

export interface Pet {
  readonly version: string;
  /** Подключён ли этот экземпляр: `false` после отказа, `destroy()` или замены новым подключением. */
  readonly mounted: boolean;
  /** Открыт ли диалог питомца. */
  readonly opened: boolean;
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
