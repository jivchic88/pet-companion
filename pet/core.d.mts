// Типы публичного входа pet-companion/core (pet/core.mjs; README, «Ядро без отображения»). Только описания: поведение — в
// pet/core/**. Без DOM: ядро работает и в Node. Питомцы — встроенные кот и собака; регистрация определений (definePet,
// defineBehavior, настройки pets и behaviors) — следующий этап, её здесь нет.

/** Версия пакета — та же, что у входа `pet-companion` и в package.json. */
export declare const VERSION: string;

/** Местная дата «ГГГГ-ММ-ДД» (часовой пояс среды) — граница лакомства и сценок; по ней хост считает `progress().today`. */
export declare function localDay(date?: Date): string;

/** Коды ошибок создания: неверные настройки; хранилище ещё не загружено (`load()` не завершился). */
export type PetErrorCode = 'invalid-options' | 'storage-not-loaded';

/** Ошибка создания ядра или хранилища — исключение интегратора (команды не бросают). */
export declare class PetError extends Error {
  constructor(code: PetErrorCode, message: string);
  readonly name: 'PetError';
  readonly code: PetErrorCode;
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
  /** Резервирование дня сценки; без него (`null`) сценок нет. */
  scenes?: PetSceneReserver | null;
  progress?: () => PetProgress;
  clock?: PetClock;
  random?: PetRandom;
  scheduler?: PetScheduler;
  log?: PetLog;
}

// ---------- идентификаторы ----------

export type PetId = 'cat' | 'dog';
export type PetCoat = 'smoke' | 'ginger' | 'tuxedo' | 'caramel' | 'spotted' | 'blacktan';
export type PetAccessory = 'scarf' | 'plaid' | 'badge';
export type PetMotion = 'normal' | 'calm' | 'none';
export type PetPresence = 'always' | 'on-call';
export type PetView = 'corner' | 'play' | 'room';
export type PetQuietReason = 'timer' | 'dictation' | 'dialog' | 'typing';
export type PetSceneType = 'stretch' | 'curl' | 'fetch';
export type PetBasePose = 'calm' | 'attentive' | 'rest' | 'content';
export type PetPose = PetBasePose | 'wait' | 'joy' | 'support' | 'unlock' | 'greet' | 'pet' | 'paw' | 'sniff' | 'watch' | 'ball' | 'feed' | 'fed' | 'yawn' | 'settle' | PetSceneType;
export type PetReactionType = 'wait' | 'joy' | 'support' | 'unlock' | 'greet' | 'pet' | 'calmPet' | 'paw' | 'calmPaw' | 'sniff' | 'watch' | 'ball' | 'meet' | 'named' | 'feed' | 'fed' | 'yawn' | 'settle' | PetSceneType;
export type PetMicro = 'blink' | 'ear' | 'tail' | 'look' | 'tilt';
/** Восемь ключей пространства имён (`place` — предпочтение места legacy-отображения `mountPet`). */
export type PetStorageKey = 'cat' | 'companion' | 'look' | 'treat' | 'presence' | 'scene' | 'place' | 'room';
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
  /** `id` — выбранный (сохранённый, в том числе неизвестный этой версии), `shown` — показанный. */
  readonly pet: { readonly id: string; readonly shown: PetId; readonly available: boolean };
  readonly name: PetName;
  readonly look: { readonly coat: PetCoat; readonly accessory: PetAccessory; readonly worn: PetAccessory };
  readonly pets: { readonly [P in PetId]: { readonly name: PetName; readonly coat: PetCoat; readonly accessory: PetAccessory; readonly worn: PetAccessory } };
  readonly prefs: { readonly motion: PetMotion; readonly phrases: boolean; readonly reducedMotion: boolean; readonly effectiveMotion: PetMotion };
  readonly presence: { readonly mode: PetPresence; readonly hidden: boolean; readonly surface: 'pet' | 'call' | 'none'; readonly around: boolean };
  readonly view: { readonly open: null | PetView; readonly source: '' | 'pet' | 'call' };
  readonly display: {
    readonly full: boolean;
    readonly moving: boolean;
    readonly pets: readonly PetId[] | null;
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
    readonly shown: { readonly page: PetPose; readonly play: PetPose; readonly room: 'calm' | 'content' };
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
  /** Показанный питомец; уже показанный — `changed: false`, `reacted: false`, без записи и реакции. */
  setPet(id: PetId): PetResult<{ readonly reacted: boolean }>;
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
