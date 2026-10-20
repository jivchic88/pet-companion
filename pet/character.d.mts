// Типы входа pet-companion/character (pet/character.mjs; README, «Персонаж: минимальный режим»). Только описания:
// поведение — в pet/character/**. Без DOM и без хранения: персонаж работает и в Node; имя и награды — у продукта.

import type { PetClock, PetError as PetErrorClass, PetLog, PetMotion, PetRandom, PetScheduler, PetSubscribeOptions } from './core.mjs';

export type { PetClock, PetLog, PetMotion, PetRandom, PetScheduler, PetSubscribeOptions };

/** Та же ошибка, что у `pet-companion/core` (один класс): исключение создания и описания. */
export type PetError = PetErrorClass;
export declare const PetError: typeof PetErrorClass;

/** Версия пакета — та же, что у входа `pet-companion`. */
export declare const VERSION: string;

// ---------- описание персонажа (формат персонажа 1) ----------

/** Реакция продукта: поза из `poses`, длительность (200…4600 мс), приоритет (3 — важнее … 7), по желанию пауза повтора, группа реплик и объявление скринридеру. */
export interface CharacterReaction {
  readonly pose: string;
  readonly ms: number;
  readonly priority: number;
  /** Пауза до повтора того же типа, мс (0…сутки). */
  readonly cooldown?: number;
  /** Группа из `phrases` или `''` — без реплики. */
  readonly phrases?: string;
  /** Объявлять реплику в области `aria-live` (по умолчанию нет). */
  readonly announce?: boolean;
}

/**
 * Описание персонажа — только данные (формат персонажа 1; формат питомца 1 — другой, и у него другие поля). Обязательны
 * ID с точкой, название, позы (среди них `calm`; `attentive` — тишина и экран дела, `rest` — дремота: необязательны) и
 * словарь реакций (может быть пустым). Комнаты, игры, кормления, обликов, аксессуаров, вещей и ступеней в формате нет.
 */
export interface CharacterDefinition {
  readonly format: 1;
  /** Сторонний ID: строчные латинские буквы, цифры и дефис с точкой (`example.robot`). */
  readonly id: string;
  readonly title: string;
  /** Позы (локальные ID, до 40); `calm` обязательна. */
  readonly poses: readonly string[];
  /** Реакции продукта по своим ID (до 32). */
  readonly reactions: { readonly [id: string]: CharacterReaction };
  /** Группы реплик (до 32 групп по 1…32 строк до 120 знаков); `{name}` — имя персонажа или название. */
  readonly phrases?: { readonly [group: string]: readonly string[] };
  /** Одиночные движения покоя (`data-micro` рисунка), до 12; по умолчанию только моргание. */
  readonly micro?: readonly string[];
  /** Интервалы покоя `[min, max]` мс (моргание — от 12 с, движения — от 45 с; до 10 мин) и длительность облака (1000…3200). */
  readonly timings?: { readonly blink?: readonly [number, number]; readonly micro?: readonly [number, number]; readonly phrase?: number };
}

/** Проверить описание персонажа: собственная глубоко неизменяемая копия; дефект — `PetError` (`definition-invalid` с `path`, `unsupported-format`). */
export declare function defineCharacter(def: CharacterDefinition): CharacterDefinition;

// ---------- экземпляр ----------

export interface CharacterOptions {
  /** Описание (из `defineCharacter` или те же данные — проверяются здесь). */
  character: CharacterDefinition;
  /** Начальное имя (до 24 знаков, без управляющих символов и `<>`); пустое — название. */
  name?: string;
  clock?: PetClock;
  random?: PetRandom;
  scheduler?: PetScheduler;
  log?: PetLog;
}

export type CharacterErrorKind = 'invalid-argument' | 'unknown-id' | 'already-started' | 'reentrant' | 'destroyed' | 'internal';

export interface CharacterFailure {
  readonly ok: false;
  readonly error: { readonly code: CharacterErrorKind; readonly message: string };
}
export type CharacterSuccess<Extra = {}> = { readonly ok: true; readonly changed: boolean } & Extra;
export type CharacterResult<Extra = {}> = CharacterSuccess<Extra> | CharacterFailure;

export type CharacterStatus = 'created' | 'started' | 'destroyed';
export type CharacterQuietReason = 'timer' | 'dictation' | 'dialog' | 'typing';

/** Снимок — глубоко замороженный объект простых данных; тот же объект, пока ничего не изменилось. */
export interface CharacterSnapshot {
  readonly status: CharacterStatus;
  readonly character: { readonly id: string; readonly title: string };
  /** `value` — имя продукта (`''` — не задано), `display` — имя или название. */
  readonly name: { readonly value: string; readonly display: string };
  readonly prefs: { readonly motion: PetMotion; readonly phrases: boolean; readonly reducedMotion: boolean; readonly effectiveMotion: PetMotion };
  readonly context: { readonly focus: boolean; readonly quiet: readonly CharacterQuietReason[] };
  /** Вкладка или контейнер на виду (вход отображения `setVisible`). */
  readonly visible: boolean;
  readonly resting: boolean;
  /** `base` — поза покоя по контексту (`calm`, `attentive`, `rest`), `shown` — что рисовать (поза реакции или `base`). */
  readonly pose: { readonly base: string; readonly shown: string; readonly reaction: { readonly id: number; readonly type: string; readonly pose: string; readonly until: number } | null };
  /** Облако реплики или `null`. */
  readonly phrase: { readonly text: string; readonly until: number } | null;
}

export type CharacterEffect =
  | { readonly type: 'announce'; readonly text: string }
  | { readonly type: 'micro'; readonly kind: string; readonly ms: number }
  | { readonly type: 'warning'; readonly code: 'internal'; readonly message: string };

export interface CharacterUpdate {
  readonly snapshot: CharacterSnapshot;
  readonly effects: readonly CharacterEffect[];
  /** Имя команды, задачи (`reaction`, `phrase`, `blink`, `micro`, `rest`), `initial`, `update`, `destroyed` — последнее. */
  readonly reason: string;
}

export interface CharacterReactOptions {
  /** Постоянный id события продукта: повтор того же `key` в этом экземпляре не играет дважды. */
  key?: string;
  /** Реплика этого случая вместо группы реакции — только текст (до 200 знаков, без управляющих символов). */
  text?: string;
}

/** Экземпляр персонажа: команды не бросают исключений; после `destroy()` отвечают `destroyed`. */
export interface Character {
  readonly status: CharacterStatus;
  /** Запуск (один раз): отсчёт покоя и его задачи. До запуска реакции не играют. */
  start(): CharacterResult;
  /** Отключение: задачи и реакция сняты, слушатели получают последнее `destroyed`; повторно — ничего. */
  destroy(): void;
  getState(): CharacterSnapshot;
  subscribe(listener: (update: CharacterUpdate) => void, options?: PetSubscribeOptions): () => void;
  /** Подтверждённое событие продукта: `played` — реакция началась, `queued` — отложена (тишина, более важная реакция), `duplicate` — `key` уже учтён. */
  react(type: string, options?: CharacterReactOptions): CharacterResult<{ readonly played: boolean; readonly queued: boolean; readonly duplicate: boolean }>;
  setName(name: string): CharacterResult<{ readonly name: string }>;
  /** Контекст страницы: `focus` — экран дела (поза внимания); остальное — независимые причины тишины. Переданное меняется, непереданное сохраняется. */
  setContext(flags: { focus?: boolean; timer?: boolean; dictation?: boolean; dialog?: boolean; typing?: boolean }): CharacterResult;
  setPreferences(prefs: { motion?: PetMotion; phrases?: boolean }): CharacterResult;
  /** Вход отображения: вкладка или контейнер на виду. В фоне ничего не начинается и не откладывается. */
  setVisible(visible: boolean): CharacterResult;
  /** Вход отображения: системное «уменьшить движение» (важнее настройки `motion`). */
  setReducedMotion(reduced: boolean): CharacterResult;
  /** Действие пользователя: пробуждение из дремоты, отсчёт покоя заново. */
  activity(): CharacterResult<{ readonly woke: boolean }>;
}

/** Создать экземпляр: синхронно, без таймеров и слушателей; неверные настройки или описание — исключение `PetError`. */
export declare function createCharacter(options: CharacterOptions): Character;
