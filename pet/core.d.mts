// Типы публичного входа pet-companion/core (pet/core.mjs; README, «Ядро без отображения», «Питомцы и модели поведения»).
// Только описания: поведение — в pet/core/**. Без DOM: ядро работает и в Node. Питомцы и модели поведения — определения
// формата 1 (definePet, defineBehavior), регистрируемые на экземпляр (pets, behaviors); штатные — входы
// pet-companion/pets (cat, dog) и pet-companion/behaviors (calm).

/** Версия пакета — та же, что у входа `pet-companion` и в package.json. */
export declare const VERSION: string;

/** Местная дата «ГГГГ-ММ-ДД» (часовой пояс среды) — граница лакомства и сценок; по ней хост считает `progress().today`. */
export declare function localDay(date?: Date): string;

/**
 * Коды ошибок создания: неверные настройки; хранилище ещё не загружено (`load()` не завершился); дефект определения
 * (`path` — место); повтор ID в списке регистрации; неизвестный номер формата определения.
 */
export type PetErrorCode = 'invalid-options' | 'storage-not-loaded' | 'definition-invalid' | 'duplicate-id' | 'unsupported-format';

/** Ошибка создания ядра, хранилища или определения — исключение интегратора (команды не бросают). */
export declare class PetError extends Error {
  constructor(code: PetErrorCode, message: string, details?: { path?: string });
  readonly name: 'PetError';
  readonly code: PetErrorCode;
  /** Место дефекта определения: `'scenes[0].pose'`; при регистрации — `'pets[2].scenes[0].pose'`. */
  readonly path?: string;
}

// ---------- хранение ----------

/** Синхронное хранилище ключ-значение: `get`/`set` в том же вызове; исключение — отказ операции. Обещание — тоже отказ. */
export interface PetSyncBackend {
  readonly async?: false;
  /** Полное имя ключа `<namespace>:<ключ>:v1`; нет значения — `null` (или `undefined`). */
  get(name: string): string | null | undefined;
  set(name: string, text: string): unknown;
}

/** Асинхронное хранилище: `get`/`set` — обещания; отказ или отклонение — отказ операции этого ключа. */
export interface PetAsyncBackend {
  readonly async: true;
  get(name: string): Promise<string | null | undefined>;
  set(name: string, text: string): Promise<unknown>;
}

export type PetLoadStatus = 'ready' | 'failed';

/**
 * Общий координатор хранения (очередь ключа, кэш подтверждённого, барьер загрузки): один на хранилище и пространство
 * имён, общий для ядер. Подключения создаёт само ядро. Перед каждым новым ядром — `load()` (барьер очереди).
 */
export interface PetSyncStorage {
  readonly status: 'idle' | 'loading' | PetLoadStatus;
  /** Синхронно: первая загрузка читает все ключи; повторная — сверка со свежим чтением. */
  load(): PetLoadStatus;
}

export interface PetAsyncStorage {
  readonly status: 'idle' | 'loading' | PetLoadStatus;
  /** Обещание итога; повторная — барьер: ждёт операций, стоявших в очереди, и сверяет. Никогда не отклоняется. */
  load(): Promise<PetLoadStatus>;
}

export type PetStorage = PetSyncStorage | PetAsyncStorage;

export interface PetStorageOptions<Backend> {
  backend: Backend;
  /** Пространство имён ключей (непустая строка). По умолчанию `'pet'`. */
  namespace?: string;
}

/** Координатор над хранилищем интегратора; тот же `backend` и `namespace` — тот же координатор. Ошибка — `PetError`. */
export declare function createStorage(options: PetStorageOptions<PetSyncBackend>): PetSyncStorage;
export declare function createStorage(options: PetStorageOptions<PetAsyncBackend>): PetAsyncStorage;

// ---------- порты ----------

/** Время экземпляра: `now` — мс эпохи (интервалы), `day(at)` — местная дата, `nextDay(at)` — начало следующего дня. */
export interface PetClock {
  now(): number;
  day(at: number): string;
  nextDay(at: number): number;
}
/** Случайность [0, 1). */
export type PetRandom = () => number;
/** Однократная задача; возвращает отмену. Задачу не вызывать внутри `later` и команды ядра из неё синхронно не звать. */
export interface PetScheduler {
  later(ms: number, task: () => void): () => void;
}
export interface PetLog {
  warn(message: string, error?: unknown): void;
}

/** Исход резервирования дня редкой сценки; обещание никогда не отклоняется. */
export type PetSceneOutcome = 'shown' | 'skip' | 'fail' | 'lost';
/**
 * Резервирование дня редкой сценки (одна на местный день в хранилище): атомарно — запись читается и ставится под общей
 * блокировкой; `decide` — синхронное решение ядра по сохранённой записи (`undefined` — записи нет), запись или `null`;
 * при записи — поставить её и сразу вызвать `show()` в том же шаге; держать блокировку до подтверждения.
 */
export interface PetSceneReserver {
  reserve(decide: (stored: unknown) => object | null, show: () => void): Promise<PetSceneOutcome>;
}

/** Счёт хоста: знаков всего, за сегодня (`localDay`), предел дня (только подпись). Быстро и без побочных действий. */
export interface PetProgress {
  marks?: number;
  today?: number;
  limit?: number | null;
}

export interface PetCoreOptions {
  /** Координатор из `createStorage`, загруженный (`status` — `'ready'` или `'failed'`). */
  storage: PetStorage;
  /** Питомцы экземпляра — непустой список определений (ID уникальны); первый — запасной показ. Штатные — `pet-companion/pets`. */
  pets: readonly PetDefinition[];
  /** Модели поведения — непустой список (ID уникальны); первая — по умолчанию. Штатная — `pet-companion/behaviors`. */
  behaviors: readonly BehaviorDefinition[];
  /** Резервирование дня сценки; без него (`null`) сценок нет. */
  scenes?: PetSceneReserver | null;
  progress?: () => PetProgress;
  clock?: PetClock;
  random?: PetRandom;
  scheduler?: PetScheduler;
  log?: PetLog;
}

// ---------- идентификаторы ----------

/** Штатные питомцы (форматы 0.1.4 знают только их). */
export type PetBuiltinId = 'cat' | 'dog';
/** Сторонний ID — с точкой: `example.bunny` (шаблон `^[a-z0-9-]+(\.[a-z0-9-]+)+$`). */
export type PetExtensionId = `${string}.${string}`;
export type PetId = PetBuiltinId | PetExtensionId;
/** Модель поведения: штатная `calm` или сторонняя с точкой. */
export type BehaviorId = 'calm' | PetExtensionId;
/** Облик — ID облика определения питомца (штатные — подсказки). */
export type PetCoat = 'smoke' | 'ginger' | 'tuxedo' | 'caramel' | 'spotted' | 'blacktan' | (string & {});
/** Аксессуар — ID аксессуара определения питомца (штатные — подсказки). */
export type PetAccessory = 'scarf' | 'plaid' | 'badge' | (string & {});
export type PetMotion = 'normal' | 'calm' | 'none';
export type PetPresence = 'always' | 'on-call';
export type PetView = 'corner' | 'play' | 'room';
export type PetQuietReason = 'timer' | 'dictation' | 'dialog' | 'typing';
/** Сценка — ID сценки определения показанного питомца (штатные — подсказки). */
export type PetSceneType = 'stretch' | 'curl' | 'fetch' | (string & {});
export type PetBasePose = 'calm' | 'attentive' | 'rest' | 'content';
/** Поза словаря формата 1 (§ 7.1.1): обязательные, лапа (возможность питомца), декоративные. */
export type PetVocabularyPose = PetBasePose | 'wait' | 'joy' | 'support' | 'unlock' | 'greet' | 'pet' | 'paw' | 'sniff' | 'watch' | 'ball' | 'feed' | 'fed' | 'yawn' | 'settle';
/** Нарисованная поза: словаря (или её замена) либо своя поза сценки. */
export type PetPose = PetVocabularyPose | PetSceneType;
export type PetRequiredReaction = 'wait' | 'joy' | 'support' | 'unlock' | 'greet' | 'meet' | 'named' | 'pet' | 'calmPet' | 'feed' | 'fed' | 'sniff' | 'watch' | 'ball';
export type PetPawReaction = 'paw' | 'calmPaw';
export type PetOptionalReaction = 'yawn' | 'settle';
export type PetModelReaction = PetRequiredReaction | PetPawReaction | PetOptionalReaction;
/** Тип реакции: модели или сценка питомца (её ID). */
export type PetReactionType = PetModelReaction | PetSceneType;
/** Одиночное движение покоя: словаря или своё у стороннего питомца. */
export type PetMicro = 'blink' | 'ear' | 'tail' | 'look' | 'tilt' | (string & {});
/** Девять ключей пространства имён (`place` — предпочтение места legacy-отображения `mountPet`, `ext` — расширения, PL06). */
export type PetStorageKey = 'cat' | 'companion' | 'look' | 'treat' | 'presence' | 'scene' | 'place' | 'room' | 'ext';
export type PetToy = 'bowl' | 'ball';
/** Точка `[x, y]`: в единицах сцены 400×250 (комната) или рисунка 220×204 («Поиграть»). */
export type PetPoint = readonly [number, number];
export type PetDirection = 'left' | 'right' | 'up' | 'down';

// ---------- результат команды ----------

export type PetErrorKind =
  | 'invalid-argument'
  | 'unknown-id'
  | 'unsupported'
  | 'locked'
  | 'hidden'
  | 'away'
  | 'not-open'
  | 'no-gesture'
  | 'treat-waiting'
  | 'treat-fed'
  | 'already-started'
  | 'reentrant'
  | 'destroyed'
  | 'internal';

/** Итог ключа. `skipped` — шаг цепочки не выполнялся; в этой версии цепочек нет, исход недостижим. */
export type PetKeyResult = 'saved' | 'pending' | 'failed' | 'skipped';
export type PetSaveTotal = 'saved' | 'failed' | 'partial';

/**
 * Судьба записи команды: `none` — писать нечего; синхронное хранилище — сразу окончательно (`saved`, `failed`, `partial`);
 * асинхронное — `pending` с `done` (никогда не отклоняется; после `destroy` тоже разрешается). Транзакции между ключами
 * нет: `partial` — часть ключей подтверждена, часть нет. Повторов нет.
 */
export type PetSaveReport =
  | { readonly status: 'none'; readonly keys: readonly []; readonly results: { readonly [key: string]: never } }
  | { readonly status: PetSaveTotal; readonly keys: readonly PetStorageKey[]; readonly results: Readonly<Partial<Record<PetStorageKey, Exclude<PetKeyResult, 'pending'>>>> }
  | { readonly status: 'pending'; readonly keys: readonly PetStorageKey[]; readonly results: Readonly<Partial<Record<PetStorageKey, PetKeyResult>>>; readonly done: Promise<PetSaveTotal> };

/** Отказ: команда ничего не изменила и не поставила. */
export interface PetFailure {
  readonly ok: false;
  readonly error: { readonly code: PetErrorKind; readonly message: string };
}
/**
 * Успех: изменение действует в памяти; `degraded` — сбой оркестровки после применения (изменение и запись остались).
 * Дополнительные поля команды (`Extra`) — на каждом успехе: и без изменений (`changed: false`), и при `degraded`.
 */
export type PetSuccess<Extra = {}> = {
  readonly ok: true;
  readonly changed: boolean;
  readonly save: PetSaveReport;
  readonly degraded?: true;
} & Extra;
export type PetResult<Extra = {}> = PetSuccess<Extra> | PetFailure;

/** Итог прямого действия «Поиграть». `null` — отклик не сыгран (идёт не менее важная реакция). */
export type PetOutcome = 'pet' | 'paw' | 'enough' | 'quiet' | 'sniff' | 'look' | 'ball' | 'moved' | 'dropped';
export interface PetOutcomeExtra {
  readonly outcome: PetOutcome | null;
  readonly text: string;
}

/** Подтверждённое хостом занятие: `progress().marks` уже включает его знак. */
export interface PetSavedDetail {
  /** Постоянный непустой ID события: повтор в этом экземпляре реакцию не играет (`duplicate`). */
  key: string;
  counted?: boolean;
  hard?: boolean;
  first?: boolean;
}

export interface PetSavedExtra {
  /** Решение с реакцией (питомец на виду, ядро запущено, событие не `null`). */
  readonly reacted: boolean;
  readonly duplicate: boolean;
  /** Открытая ступень (праздник) или `null`. */
  readonly celebrate: number | null;
  /** Вещи ступени, ставшей увиденной при открытом уголке (без праздника). */
  readonly fresh: readonly string[];
}

export type PetPlayAction = { type: 'pet' } | { type: 'paw' } | { type: 'bowl'; to: 'near' | 'home' | PetPoint } | { type: 'ball'; to: 'roll' | number };

/**
 * Объявление отображения: переданное свойство заменяет прежнее целиком. Массивы — плотные, строка в каждом индексе
 * (пустой индекс, `undefined`, `null` — `invalid-argument`, объявление прежнее).
 */
export interface PetDisplay {
  /** Показ целиком (иначе портрет). */
  full?: boolean;
  /** Идёт перенос (сценок нет). */
  moving?: boolean;
  /** Какие питомцы нарисованы: ограничение (не объявлено — все). */
  pets?: readonly string[];
  /** Какие сценки рисует отображение — разрешение: показываются только объявленные. */
  scenes?: { readonly [pet: string]: readonly string[] };
  views?: readonly PetView[];
  /** Пол «Поиграть» `[l, t, r, b]` в единицах рисунка; без него предметов нет. */
  playFloor?: readonly [number, number, number, number];
  /** Наименьший радиус касания лапы в единицах рисунка (≥ 0). */
  playTouch?: number;
}

export interface PetContext {
  focus?: boolean;
  timer?: boolean;
  dictation?: boolean;
  dialog?: boolean;
  typing?: boolean;
}

// ---------- снимок ----------

export interface PetName {
  readonly value: string;
  /** `false` — имя ещё не выбирали (показывается имя по умолчанию). */
  readonly chosen: boolean;
  readonly display: string;
}

export interface PetReaction {
  readonly id: number;
  readonly type: PetReactionType;
  readonly pose: PetPose;
  readonly until: number;
  readonly explicit: boolean;
  /** Реакция — редкая сценка (рисуется поверх позы покоя там, где читается). */
  readonly scene: boolean;
  /** Куда смотрит на предмет в «Поиграть» (сторона сцены); `''` — прямо. */
  readonly toward: '' | 'left' | 'right';
  readonly mini: string;
  readonly tryOn: '' | PetAccessory;
}

export interface PetPlayState {
  readonly toys: { readonly [T in PetToy]: { readonly at: PetPoint | null; readonly home: boolean } };
  /** Итог под сценой; `''` — подсказка. */
  readonly outcome: '' | Exclude<PetOutcome, 'dropped'>;
  readonly text: string;
  readonly stroke: null | { readonly id: number; readonly held: boolean; readonly told: string };
  readonly drag: null | { readonly toy: PetToy; readonly at: PetPoint; readonly from: PetPoint };
}

export interface PetRoomDraft {
  readonly pos: { readonly [item: string]: PetPoint };
  readonly pick: string;
  readonly changed: readonly string[];
  readonly other: boolean;
  readonly failed: boolean;
  readonly saving: boolean;
  readonly drag: null | { readonly id: string; readonly at: PetPoint; readonly from: PetPoint };
  readonly can: readonly PetDirection[];
}

export interface PetKeySave {
  readonly status: 'saved' | 'pending' | 'failed' | 'unavailable';
  readonly pending: readonly string[];
  readonly unsaved: readonly string[];
  readonly corrupt: boolean;
}

export interface PetProgressState {
  readonly marks: number;
  readonly today: number;
  readonly limit: number | null;
  readonly stage: number;
  /** Ступень только по знакам (без учёта увиденной). */
  readonly computed: number;
  readonly next: null | { readonly at: number; readonly title: string };
  readonly toNext: number;
  readonly seenStage: number;
  /** `false` — сохранённая ступень непонятна этой версии (ничего не празднуется и не отмечается). */
  readonly seenKnown: boolean;
  readonly unseen: boolean;
  readonly fresh: readonly string[];
  readonly freshAccessories: readonly string[];
  readonly accessories: readonly PetAccessory[];
}

/** Глубоко замороженный снимок из простых данных; тот же объект, пока состояние не изменилось. */
export interface PetSnapshot {
  readonly v: 1;
  readonly status: 'created' | 'running' | 'destroyed';
  readonly storage: 'ready' | 'failed';
  /**
   * Питомец: `id` — выбранный (сохранённый, в том числе неизвестный этому экземпляру), `shown` — показанный, `available` —
   * определение `id` зарегистрировано. `shown ≠ id` — запасной показ: определения нет (штатный `over` записи ext или
   * первый в `pets`) либо отображение его не рисует (`fallback` определения).
   */
  readonly pet: { readonly id: string; readonly shown: PetId; readonly available: boolean };
  /** Модель поведения: выбранная (`ext.behavior`; без выбора — первая в `behaviors`), показанная и зарегистрирована ли. */
  readonly behavior: { readonly id: string; readonly shown: BehaviorId; readonly available: boolean };
  readonly name: PetName;
  readonly look: { readonly coat: PetCoat; readonly accessory: PetAccessory; readonly worn: PetAccessory };
  /** Все зарегистрированные питомцы: своё имя, облик, аксессуар и надетый аксессуар (для выбора напарника). */
  readonly pets: { readonly [pet: string]: { readonly name: PetName; readonly coat: PetCoat; readonly accessory: PetAccessory; readonly worn: PetAccessory } };
  readonly prefs: { readonly motion: PetMotion; readonly phrases: boolean; readonly reducedMotion: boolean; readonly effectiveMotion: PetMotion };
  readonly presence: { readonly mode: PetPresence; readonly hidden: boolean; readonly surface: 'pet' | 'call' | 'none'; readonly around: boolean };
  readonly view: { readonly open: null | PetView; readonly source: '' | 'pet' | 'call' };
  readonly display: {
    readonly full: boolean;
    readonly moving: boolean;
    readonly pets: readonly string[] | null;
    readonly views: readonly PetView[];
    readonly scenes: { readonly [pet: string]: readonly PetSceneType[] } | null;
    readonly playFloor: readonly [number, number, number, number] | null;
    readonly playTouch: number;
  };
  readonly scene: { readonly waiting: null | { readonly type: PetSceneType; readonly until: number }; readonly reserving: boolean };
  readonly visible: boolean;
  readonly context: { readonly focus: boolean; readonly quiet: readonly PetQuietReason[] };
  readonly pose: {
    readonly base: PetBasePose;
    readonly resting: boolean;
    readonly hold: null | 'pet';
    readonly shown: { readonly page: PetPose; readonly play: PetPose; readonly room: PetPose };
    readonly reaction: null | PetReaction;
  };
  readonly phrase: null | { readonly text: string; readonly short: string; readonly until: number };
  readonly scenePhrase: string;
  readonly play: null | PetPlayState;
  readonly room: { readonly pos: { readonly [item: string]: PetPoint }; readonly feedShift: PetPoint; readonly draft: null | PetRoomDraft };
  /** `null` до первого чтения счёта хоста (`start`, `refresh`, `notify`, открытие вида). */
  readonly progress: null | PetProgressState;
  readonly treat: null | 'waiting' | 'ready' | 'fed';
  readonly save: { readonly [K in PetStorageKey]: PetKeySave };
}

// ---------- эффекты и подписка ----------

export type PetEffect =
  | { readonly type: 'announce'; readonly text: string }
  | { readonly type: 'celebrate'; readonly stage: number; readonly items: readonly string[]; readonly accessories: readonly string[] }
  /** Новая ступень отмечена увиденной без праздника (уголок на виду): вещи для «Новое в уголке». */
  | { readonly type: 'seen'; readonly stage: number; readonly items: readonly string[]; readonly accessories: readonly string[] }
  | { readonly type: 'micro'; readonly kind: PetMicro; readonly ms: number }
  | { readonly type: 'arrive' }
  | { readonly type: 'save'; readonly key: PetStorageKey; readonly op: number; readonly result: 'saved' | 'failed' }
  | { readonly type: 'warning'; readonly code: 'corrupt'; readonly key: PetStorageKey; readonly message: string }
  | { readonly type: 'warning'; readonly code: 'internal'; readonly message: string };

/** Причина обновления: команда (её имя), задача ядра, поздний результат записи, изменение хранилища, начало и конец. */
export type PetUpdateReason =
  | 'initial'
  | 'destroyed'
  | 'storage'
  | 'save'
  | 'update'
  | 'scene'
  | 'reaction'
  | 'phrase'
  | 'blink'
  | 'micro'
  | 'rest'
  | 'midnight'
  | 'greet'
  | 'open-micro'
  | 'play-outcome'
  | 'start'
  | 'refresh'
  | 'notify'
  | 'feed'
  | 'open'
  | 'close'
  | 'setPresence'
  | 'setName'
  | 'setPet'
  | 'setBehavior'
  | 'setAppearance'
  | 'setPreferences'
  | 'hide'
  | 'show'
  | 'setContext'
  | 'setVisible'
  | 'setReducedMotion'
  | 'activity'
  | 'setDisplay'
  | 'interact'
  | 'stroke.start'
  | 'stroke.step'
  | 'stroke.end'
  | 'stroke.cancel'
  | 'toy.drag'
  | 'toy.drop'
  | 'toy.cancel'
  | 'room.select'
  | 'room.move'
  | 'room.nudge'
  | 'room.reset'
  | 'room.drag'
  | 'room.drop'
  | 'room.dragCancel'
  | 'room.save'
  | 'room.cancel'
  /** Входы legacy-отображения `mountPet` (у ядра из `pet.core`). */
  | 'setPlace'
  | 'arrive'
  | 'stopScene';

export interface PetUpdate {
  readonly snapshot: PetSnapshot;
  readonly effects: readonly PetEffect[];
  readonly reason: PetUpdateReason;
}

export interface PetSubscribeOptions {
  /** `true` (по умолчанию) — сразу текущий снимок с `reason: 'initial'`. */
  initial?: boolean;
}

// ---------- определения формата 1 (PL06) ----------

/** Ступень 0…4 (пороги 0, 3, 9, 18, 30 знаков). */
export type PetStageIndex = 0 | 1 | 2 | 3 | 4;
/** Рамка `[l, t, r, b]` (l < r, t < b). */
export type PetBox = readonly [number, number, number, number];
export interface PetCircle {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** Своя сценка питомца: поза — из его `poses`; `needs: 'full'` — только целиком; `ms` ≤ 4600, `still` ≤ `ms`; `text` — после имени («потягивается»). */
export interface PetSceneDefinition {
  readonly id: string;
  readonly pose: string;
  readonly needs: 'any' | 'full';
  readonly ms: number;
  readonly still: number;
  readonly text: string;
}

/** Комната уголка: общая мебель (`corner` входа `pet-companion/pets`) + рамки питомца и свои игрушки (единицы сцены 400×250). */
export interface PetRoomDefinition {
  readonly frame: readonly [number, number];
  readonly floor: number;
  readonly rest: PetPoint;
  readonly seats: readonly { readonly id: string; readonly title: string; readonly box: PetBox; readonly stage: PetStageIndex; readonly lift: number }[];
  readonly bowl: { readonly title: string; readonly home: PetPoint; readonly box: PetBox };
  readonly fixed: readonly { readonly stage: PetStageIndex; readonly box: PetBox }[];
  readonly pet: { readonly all: PetBox; readonly core: PetBox };
  readonly feed: PetBox;
  readonly toys: readonly { readonly id: string; readonly title: string; readonly home: PetPoint; readonly box: PetBox; readonly stage: PetStageIndex }[];
}

/**
 * Питомец (формат 1): кто это и как выглядит — только данные. Обязательные позы (`calm`, `attentive`, `rest`, `content`,
 * `wait`, `joy`, `support`, `unlock`, `greet`, `pet`, `feed`, `fed`, `sniff`, `watch`, `ball`) — в `poses` или через
 * `poseFallback` (`calm` — только в `poses`); `paw` — только у питомца с `actions.paw`; `yawn`, `settle` — необязательные.
 */
export interface PetDefinition {
  readonly format: 1;
  readonly id: PetId;
  readonly title: string;
  /** Формы слова: родительный («кота»), винительный («кота»). */
  readonly forms: { readonly gen: string; readonly acc: string };
  /** Имя по умолчанию, готовые имена, предложение для знакомства (одно из готовых). */
  readonly names: { readonly default: string; readonly presets: readonly string[]; readonly offer: string };
  /** Облики; первый — по умолчанию. */
  readonly coats: readonly { readonly id: string; readonly title: string }[];
  /** Аксессуары, открываемые ступенью; первый — по умолчанию (ступень 0). `short` — в перечне нового. */
  readonly accessories: readonly { readonly id: string; readonly title: string; readonly stage: PetStageIndex; readonly short?: string }[];
  /** Вещи по ступеням (`mini` — порядок вещи рядом при празднике) и подарки ступеней (`{name}` — имя). */
  readonly items: {
    readonly list: readonly { readonly id: string; readonly title: string; readonly stage: PetStageIndex; readonly mini?: number }[];
    readonly gifts: readonly [string, string, string, string, string];
  };
  readonly poses: readonly (PetVocabularyPose | (string & {}))[];
  /** Замена недостающей позы словаря другой позой (по цепочке, без циклов). */
  readonly poseFallback?: { readonly [P in PetVocabularyPose]?: string };
  readonly micro: readonly string[];
  readonly openMicro: readonly string[];
  /** Тексты итогов (`{name}` — имя); `paw: null` — лапы нет (`interact({ type: 'paw' })` — `unsupported`); `ask` — команда «Дай лапу». */
  readonly actions: { readonly pet: { readonly text: string }; readonly paw: null | { readonly text: string; readonly ask: boolean } };
  readonly scenes: readonly PetSceneDefinition[];
  /** Рамка рисунка (единицы игры) и линия пола у лап. */
  readonly size: { readonly width: number; readonly height: number; readonly ground: number };
  /** Области попадания (единицы рисунка); лапа (`up` — поднятая в позе paw) или `null`; где стоит: `foot` — [слева, справа, низ], `anchor`. */
  readonly play: {
    readonly hits: readonly { readonly part: string; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number }[];
    readonly paw: null | (PetCircle & { readonly up?: PetCircle });
    readonly foot: readonly [number, number, number];
    readonly anchor: PetPoint;
  };
  readonly room: PetRoomDefinition;
  /** Штатный питомец, которого показывают отображения без набора этого и вкладки прежних версий. */
  readonly fallback: PetBuiltinId;
}

/** Реакция модели: поза словаря, длительность (не больше 0.1.4), приоритет 3…7 (декоративные — 7), группа реплик, пауза повтора. */
export interface PetReactionDefinition {
  readonly pose: PetVocabularyPose;
  readonly ms: number;
  readonly priority: number;
  readonly phrases?: string;
  readonly cooldown?: number;
  readonly calmOnly?: boolean;
  readonly decorative?: boolean;
  readonly toy?: boolean;
}

/** Реплика: строка (≤ 120 знаков) или реплика с какой ступени. */
export type PetPhraseEntry = string | { readonly text: string; readonly stage: PetStageIndex };
export type PetPhraseBank = { readonly [group: string]: readonly PetPhraseEntry[] };

/** Модель поведения (формат 1): как себя ведёт — только данные; любая корректная модель совместима с любым корректным питомцем. */
export interface BehaviorDefinition {
  readonly format: 1;
  readonly id: BehaviorId;
  readonly title: string;
  /** Обязательные и реакции лапы — всегда; `yawn`, `settle` — по желанию (нет — не играют). */
  readonly reactions: { readonly [T in PetRequiredReaction | PetPawReaction]: PetReactionDefinition } & { readonly [T in PetOptionalReaction]?: PetReactionDefinition };
  /** Интервалы покоя по режиму движения (не чаще 0.1.4), шанс зевка (≤ 0,18), облако реплики (≤ 3200 мс). */
  readonly timings: {
    readonly blink: { readonly normal: readonly [number, number]; readonly calm: readonly [number, number] };
    readonly micro: { readonly normal: readonly [number, number]; readonly calm: readonly [number, number] };
    readonly yawn: number;
    readonly phrase: number;
  };
  /** Полных откликов поглаживания в минуту (1…3). */
  readonly limits: { readonly pet: number };
  /** Политика сценок: шанс (0…0,25), порядок, `skip` — `'petId/sceneId'`, которые модель не показывает. */
  readonly scenes: { readonly chance: number; readonly order: 'fresh' | 'random'; readonly skip?: readonly `${string}/${string}`[] };
  /** `default` — без признаков вида, покрывает группы реакций и ядра; `byPet[petId]` — замены групп для питомца. */
  readonly phrases: { readonly default: PetPhraseBank; readonly byPet?: { readonly [pet: string]: PetPhraseBank } };
}

/** Проверить определение питомца: собственная глубоко неизменяемая копия; дефект — `PetError` (`definition-invalid` с `path`, `unsupported-format`). */
export declare function definePet(def: PetDefinition): PetDefinition;
/** Проверить определение модели поведения: собственная глубоко неизменяемая копия; дефект — `PetError`. */
export declare function defineBehavior(def: BehaviorDefinition): BehaviorDefinition;

// ---------- экземпляр ----------

export interface PetStroke {
  /** Начать жест поглаживания (только в открытой «Поиграть»). */
  start(): PetResult<{ readonly id: number }>;
  /** Один пройденный порог жеста `id`; не идёт — `no-gesture`. */
  step(id: number): PetResult<{ readonly outcome: 'pet' | 'enough' | 'quiet' | null; readonly announced: boolean }>;
  end(id: number): PetResult;
  cancel(id: number): PetResult;
}

export interface PetToyDrag {
  /** Перенос предмета указателем: где предмет был бы под указателем (единицы рисунка). */
  drag(id: PetToy, at: PetPoint): PetResult;
  /** Отпустили после заметного сдвига; `roll` — бросок мячика (единицы, знак — направление). */
  drop(options?: { roll?: number }): PetResult<PetOutcomeExtra>;
  cancel(): PetResult;
}

export interface PetRoomCommands {
  select(id: string): PetResult;
  move(id: string, at: PetPoint): PetResult;
  nudge(dir: PetDirection): PetResult;
  reset(): PetResult;
  drag(id: string, at: PetPoint): PetResult;
  drop(): PetResult;
  dragCancel(): PetResult;
  save(): PetResult<{ readonly closed: boolean; readonly text: string; readonly fresh: readonly string[] }>;
  cancel(): PetResult<{ readonly text: string; readonly fresh: readonly string[] }>;
}

/** Команды хоста и отображения — общие для `PetCore` и `pet.*` legacy-подключения. Методы не зависят от `this`. */
export interface PetCommands {
  /** Перечитать счёт хоста; открыт уголок — новая ступень увидена. */
  refresh(): PetResult<{ readonly fresh: readonly string[] }>;
  setContext(flags: PetContext): PetResult;
  /** Имя (очистка: без управляющих символов и `<>`, ≤ 24 знаков); `''` — «ещё не выбирали». Готовое — отклик и объявление. */
  setName(name: string): PetResult<{ readonly reacted: boolean }>;
  /**
   * Питомец (зарегистрированный; если отображение объявило своих — из них). Уже выбранный и показанный — `changed: false`,
   * `reacted: false`, без записи и реакции. Запись — `companion` и/или `ext` цепочкой шагов без межключевой транзакции:
   * `save.keys` — в порядке шагов, `results` — по ключам (`skipped` — шаг не выполнялся), `partial` — часть подтверждена.
   */
  setPet(id: PetId): PetResult<{ readonly reacted: boolean }>;
  /** Модель поведения (зарегистрированная): `ext.behavior`; реакции, сценка, жест и задачи покоя прежней сняты. */
  setBehavior(id: BehaviorId): PetResult;
  setAppearance(look: { coat?: PetCoat; accessory?: PetAccessory }): PetResult;
  setPreferences(prefs: { motion?: PetMotion; phrases?: boolean }): PetResult;
  setPresence(mode: PetPresence): PetResult;
  hide(): PetResult;
  show(): PetResult;
  feed(): PetResult;
  interact(action: PetPlayAction): PetResult<PetOutcomeExtra>;
  readonly stroke: PetStroke;
  readonly toy: PetToyDrag;
  readonly room: PetRoomCommands;
  getState(): PetSnapshot;
  /** Подписка: слушатель получает обновления в фазе доставки; возвращает отписку. */
  subscribe(listener: (update: PetUpdate) => void, options?: PetSubscribeOptions): () => void;
}

/** Экземпляр ядра: `created` → `start()` → `running` → `destroy()` → `destroyed`. */
export interface PetCore extends PetCommands {
  readonly version: string;
  readonly status: 'created' | 'running' | 'destroyed';
  /** Один раз: первое включение, приветствие дня, покой и полночь; повторно — `already-started`. */
  start(): PetResult;
  /** Синхронно и идемпотентно: задачи, жесты, переносы, черновик, подписки и подключение сняты. */
  destroy(): void;
  /** Подтверждённое занятие (`null` — только перечитать счёт). */
  notify(type: 'saved', detail: PetSavedDetail | null): PetResult<PetSavedExtra>;
  /** Занятие не сохранилось: нейтральное ожидание без награды. */
  notify(type: 'failed'): PetResult<{ readonly reacted: boolean }>;
  /** Открыть вид (объявленный отображением); `source: 'call'` — вызов «по зову», только `'play'`. */
  open(view: PetView, options?: { source?: 'pet' | 'call' }): PetResult<{ readonly fresh: readonly string[] }>;
  close(): PetResult;
  setVisible(visible: boolean): PetResult;
  setReducedMotion(on: boolean): PetResult;
  activity(): PetResult;
  setDisplay(display: PetDisplay): PetResult;
}

/** Экземпляр ядра; проверка настроек — до подключения к хранилищу. Ошибка — `PetError`. */
export declare function createPetCore(options: PetCoreOptions): PetCore;
