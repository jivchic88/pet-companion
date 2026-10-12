// Питомец (кот или собака): правила без DOM — ступени по знакам, настройки и ключи хранения, имена, облик, лакомство дня,
// реакции и «режиссёр», редкие сценки, реплики. Знаки считает сайт; питомец не знает
// качества занятия, только подтверждённое событие. Хранение по ключам — README модуля, «Хранение».

// Ключи в пространстве имён ns (options.storage сайта); v1 — версия формата данных, а не модуля.
export const storageKeys = (ns = 'pet') => ({
  ...Object.fromEntries(['cat', 'companion', 'look', 'treat', 'place', 'presence', 'scene', 'room'].map((key) => [key, `${ns}:${key}:v1`])),
  db: `${ns}:scene`,
});

export const CAT_VERSION = 1;
export const DEFAULT_NAME = 'Марс';
export const NAME_MAX = 24;

// ---------- ступени по знакам ----------

export const STAGES = [
  { at: 0, title: 'Познакомились', gift: 'Марс и простая подушка', items: ['cushion'] },
  { at: 3, title: 'Освоился', gift: 'Клетчатый платок', items: [], accessory: 'plaid' },
  { at: 9, title: 'Наш ритуал', gift: 'Кружка и блокнот', items: ['mug', 'notebook'] },
  { at: 18, title: 'Уютный штаб', gift: 'Лежанка и лампа', items: ['bed', 'lamp'] },
  { at: 30, title: 'Сработались', gift: 'Растение, доска с заметками и бейдж', items: ['plant', 'board'], accessory: 'badge' },
];

// Вещи сцены по ступеням (номер ступени → вещи). У собаки со ступени «Наш ритуал» ещё мячик;
// пороги и вещи кота те же.
export function stageItems(index, kind = 'cat') {
  const items = STAGES[index]?.items ?? [];
  return kind === 'dog' && index === 2 ? [...items, 'ball'] : items;
}

// Подарок ступени — по животному: на первой ступени имя напарника (у собаки не «Марс»),
// у собаки на «Нашем ритуале» — ещё мячик. Названия наград кота не меняются.
export function stageGift(index, kind = 'cat', name = '') {
  const stage = STAGES[index];
  if (!stage) return '';
  if (index === 0) return `${name || PROFILES[kind]?.defaultName || DEFAULT_NAME} и простая подушка`;
  if (kind === 'dog' && index === 2) return 'Кружка, блокнот и мячик';
  return stage.gift;
}

export const ACCESSORIES = [
  { id: 'scarf', title: 'Терракотовый платок', stage: 0 },
  { id: 'plaid', title: 'Клетчатый платок', stage: 1 },
  { id: 'badge', title: 'Платок с бейджем', stage: 4 },
];

export function stageIndex(marks) {
  let index = 0;
  STAGES.forEach((stage, i) => {
    if (marks >= stage.at) index = i;
  });
  return index;
}

// Прогресс для сцены: ступень (открытые вещи не пропадают — unlocked не меньше видимой ранее),
// следующая ступень и сколько знаков до неё.
export function progressInfo(marks, seenStage = -1) {
  const computed = stageIndex(marks);
  const stage = Math.max(computed, Math.min(seenStage, STAGES.length - 1));
  const next = STAGES[stage + 1] ?? null;
  return { marks, stage, computed, current: STAGES[stage], next, toNext: next ? Math.max(0, next.at - marks) : 0 };
}

// Подтверждённое занятие (notify 'saved'): counted — дало знак (тогда до него знаков было на один меньше), hard — трудное;
// marks — знаки сейчас. Ступени до и после — по знакам.
export const doneOutcome = ({ counted = false, hard = false } = {}, marks = 0) => ({
  practice: true,
  counted: Boolean(counted),
  hard: Boolean(hard),
  stageBefore: stageIndex(marks - (counted ? 1 : 0)),
  stageAfter: stageIndex(marks),
});

// Праздновать ли новую ступень после занятия: только если её открыло это занятие и на этом
// устройстве её ещё не видели (перезагрузка и другая вкладка награду не повторяют).
export function stageToCelebrate(outcome, seenStage = -1) {
  if (!outcome?.practice || !outcome.counted) return null;
  return outcome.stageAfter > outcome.stageBefore && outcome.stageAfter > seenStage ? outcome.stageAfter : null;
}

// Что открылось между ступенями (для объявления и подсветки в сцене); kind — чьи вещи.
export function unlockedBetween(from, to, kind = 'cat') {
  const items = [];
  const accessories = [];
  for (let i = Math.max(0, from + 1); i <= to && i < STAGES.length; i += 1) {
    items.push(...stageItems(i, kind));
    if (STAGES[i].accessory) accessories.push(STAGES[i].accessory);
  }
  return { items, accessories };
}

// ---------- настройки (localStorage, отдельно на каждом устройстве) ----------

export const MOTIONS = [
  ['normal', 'Обычное'],
  ['calm', 'Спокойное'],
  ['none', 'Без анимации'],
];

export function defaultSettings() {
  return { v: CAT_VERSION, name: '', accessory: 'scarf', motion: 'normal', phrases: true, hidden: false, seenStage: -1, greetDay: '' };
}

// Имя: без управляющих символов и лишних пробелов, не длиннее NAME_MAX; пустое — имя по умолчанию.
export function cleanName(value) {
  // Управляющие символы и угловые скобки убираются (имя попадает в разметку и подписи).
  const unsafe = (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === '<' || char === '>';
  return String(value ?? '')
    .replace(/[\s\S]/g, (char) => (unsafe(char) ? '' : char))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

export const catName = (settings) => settings?.name || DEFAULT_NAME;

// Любое сохранённое значение → корректные настройки. Повреждённое — по умолчанию; старая версия
// и версия из более новой вкладки — понятные поля сохраняются, остальное по умолчанию.
export function normalizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  return {
    v: CAT_VERSION,
    name: typeof raw.name === 'string' ? cleanName(raw.name) : '',
    accessory: ACCESSORIES.some((item) => item.id === raw.accessory) ? raw.accessory : base.accessory,
    motion: MOTIONS.some(([id]) => id === raw.motion) ? raw.motion : base.motion,
    phrases: typeof raw.phrases === 'boolean' ? raw.phrases : base.phrases,
    hidden: raw.hidden === true,
    seenStage: Number.isInteger(raw.seenStage) && raw.seenStage >= -1 && raw.seenStage < STAGES.length ? raw.seenStage : base.seenStage,
    greetDay: typeof raw.greetDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.greetDay) ? raw.greetDay : '',
  };
}

// Сохранённый текст → нормализованное значение; повреждённый JSON — как пустое (значение по умолчанию).
function parser(normalize) {
  return (text) => {
    try {
      return normalize(JSON.parse(text ?? 'null'));
    } catch {
      return normalize(null);
    }
  };
}

export const parseSettings = parser(normalizeSettings);

// ---------- выбор напарника ----------
// Ключ cat — общие настройки (движение, реплики, скрыт, увиденная ступень, день приветствия), имя и аксессуар кота; выбор
// животного и собака — в своём ключе companion: вкладка старого кода переписывает cat только понятными ей полями.

export const COMPANION_VERSION = 1;
export const KINDS = ['cat', 'dog'];

// Профиль животного: подписи, имя по умолчанию, одиночные движения покоя и особенности.
export const PROFILES = {
  cat: { kind: 'cat', title: 'Кот', defaultName: DEFAULT_NAME, gen: 'кота', acc: 'кота', micro: ['ear', 'tail', 'look'], open: ['ear', 'blink'], paw: false },
  // Пёс чаще наклоняет голову, двигает ушами и виляет хвостом.
  dog: { kind: 'dog', title: 'Собака', defaultName: 'Тоби', gen: 'собаки', acc: 'собаку', micro: ['tilt', 'ear', 'tail', 'tilt', 'ear', 'look'], open: ['tilt', 'ear'], paw: true },
};

export const kindOf = (value) => (KINDS.includes(value) ? value : 'cat');
export const profileOf = (kind) => PROFILES[kindOf(kind)];

export function defaultCompanion() {
  return { v: COMPANION_VERSION, kind: 'cat', dog: { name: '', accessory: 'scarf' } };
}

// Повреждённое, чужое или неизвестное значение → по умолчанию (кот); понятные поля сохраняются.
export function normalizeCompanion(raw) {
  const base = defaultCompanion();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const dog = raw.dog && typeof raw.dog === 'object' && !Array.isArray(raw.dog) ? raw.dog : {};
  return {
    v: COMPANION_VERSION,
    kind: kindOf(raw.kind),
    dog: {
      name: typeof dog.name === 'string' ? cleanName(dog.name) : '',
      accessory: ACCESSORIES.some((item) => item.id === dog.accessory) ? dog.accessory : base.dog.accessory,
    },
  };
}

export const parseCompanion = parser(normalizeCompanion);

// Настройки показанного напарника: общие поля — из ключа cat, имя и аксессуар — свои.
export function companionView(cat, companion, kind = companion?.kind) {
  const k = kindOf(kind);
  const own = k === 'dog' ? normalizeCompanion(companion).dog : cat;
  return { ...normalizeSettings(cat), kind: k, name: own.name, accessory: own.accessory };
}

// Изменение настроек → куда писать: выбор животного и имя с аксессуаром собаки — в companion,
// остальное (общие поля, имя и аксессуар кота) — в cat. kind — показанное сейчас животное.
export function splitUpdate(kind, fields = {}) {
  const cat = {};
  const companion = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'kind') companion.kind = value;
    else if ((key === 'name' || key === 'accessory') && kindOf(kind) === 'dog') companion.dog = { ...companion.dog, [key]: value };
    else cat[key] = value;
  }
  return { cat, companion };
}

// Свежие сохранённые значения + изменённые поля (остальные поля не откатываются к устаревшим).
export function mergeCompanion(current, patch = {}) {
  const now = normalizeCompanion(current);
  return normalizeCompanion({ ...now, ...patch, dog: { ...now.dog, ...patch.dog } });
}

export const companionName = (view) => view?.name || profileOf(view?.kind).defaultName;

// ---------- имена: готовые варианты ----------
// Имя — name кота в cat, dog.name в companion. Пустое сохранённое имя — «ещё не выбирали»: имя по умолчанию (Марс, Тоби)
// и предложение смешного варианта; «Оставить» пишет имя по умолчанию явно.

export const NAME_PRESETS = {
  cat: ['Котлетыч', 'Пельмень', 'Бублик', 'Мурджер', 'Сеньор Мур', 'Марс', 'Сырник', 'Бэклог', 'Пиксель', 'Тимлидыч', 'Коржик', 'Профитроль'],
  dog: ['Барклий', 'Лапыч', 'Батон', 'Спринт', 'Шашлычок', 'Тоби', 'Пончик', 'Стендап', 'Чебурек', 'Релиз', 'Пряник', 'Гавриил'],
};
// Стартовое предложение для знакомства (без выбора — только предложение, не переименование).
export const NAME_OFFER = { cat: 'Котлетыч', dog: 'Барклий' };
export const NAMES_PER_PAGE = 4;

export const namePresets = (kind) => NAME_PRESETS[kindOf(kind)];
export const namePageCount = (kind) => Math.ceil(namePresets(kind).length / NAMES_PER_PAGE);

// Страница подборки, где есть имя (иначе первая); номер — по кругу.
export function namePageOf(kind, name = '') {
  const index = namePresets(kind).indexOf(name);
  return index < 0 ? 0 : Math.floor(index / NAMES_PER_PAGE);
}

export function namePage(kind, page = 0) {
  const count = namePageCount(kind);
  const at = (((Math.trunc(page) || 0) % count) + count) % count;
  return namePresets(kind).slice(at * NAMES_PER_PAGE, (at + 1) * NAMES_PER_PAGE);
}

// Предлагать ли смешной вариант: имя ещё не выбирали (сохранено пустое).
export const nameOffered = (storedName) => !cleanName(storedName);

// ---------- ежедневное лакомство ----------
// Одно кормление в день: открывает первое занятие дня (его считает сайт), остальное — косметика. Отметка «сегодня уже
// угостили» — в своём ключе treat. Ни здоровья, ни голода, ни долгов за пропуски.

export const TREAT_VERSION = 1;
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function defaultTreat() {
  return { v: TREAT_VERSION, fedDay: '' };
}

export function normalizeTreat(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultTreat();
  return { v: TREAT_VERSION, fedDay: typeof raw.fedDay === 'string' && DAY_ONLY.test(raw.fedDay) ? raw.fedDay : '' };
}

export const parseTreat = parser(normalizeTreat);

// Запись ключа: свежее сохранённое (с полями будущих версий) + изменённые поля, нормализованные.
function keepRecord(text, normalize, patch) {
  let raw = null;
  try {
    raw = JSON.parse(text ?? 'null');
  } catch {
    raw = null;
  }
  const keep = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { ...keep, ...normalize({ ...keep, ...patch }) };
}

// Запись отметки: свежее сохранённое + день кормления.
export const treatRecord = (text, fedDay) => keepRecord(text, normalizeTreat, { fedDay });

// Состояние ритуала на день today: 'fed' — сегодня уже угостили; 'ready' — сегодня есть занятие (count — знаков за
// сегодня от сайта), можно угостить; 'waiting' — занятия сегодня ещё не было.
export function treatState(today = '', fedDay = '', count = 0) {
  if (fedDay && fedDay === today) return 'fed';
  return count > 0 ? 'ready' : 'waiting';
}

// Дней между двумя днями 'ГГГГ-ММ-ДД' (неверный день — null): пауза перед приветствием.
export function daysBetween(from, to) {
  if (!DAY_ONLY.test(String(from)) || !DAY_ONLY.test(String(to))) return null;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// Миллисекунды до следующей местной полуночи (смена дня ритуала в открытой вкладке).
export function msToMidnight(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return Math.max(1000, next.getTime() - date.getTime());
}

// ---------- облик ----------
// Три окраса у каждого животного; первый — прежний облик и значение по умолчанию. Только косметика. Ключ look; облик кота
// и собаки пишутся независимо, чужие поля ключа сохраняются.

export const LOOK_VERSION = 1;

export const COATS = {
  cat: [
    { id: 'smoke', title: 'Дымчатый' },
    { id: 'ginger', title: 'Рыжий' },
    { id: 'tuxedo', title: 'Чёрно-белый' },
  ],
  dog: [
    { id: 'caramel', title: 'Карамельный' },
    // Неразрывный пробел после «с»: в узкой карточке предлог не остаётся в конце строки.
    { id: 'spotted', title: 'Белый с пятном' },
    { id: 'blacktan', title: 'Чёрный с подпалом' },
  ],
};

export const coatsOf = (kind) => COATS[kindOf(kind)];
// Известный облик животного; неизвестный, чужой или пустой — облик по умолчанию.
export const coatOf = (kind, value) => (coatsOf(kind).some((coat) => coat.id === value) ? value : coatsOf(kind)[0].id);
export const coatTitle = (kind, value) => coatsOf(kind).find((coat) => coat.id === coatOf(kind, value)).title;

export function defaultLook() {
  return { v: LOOK_VERSION, cat: coatOf('cat'), dog: coatOf('dog') };
}

export function normalizeLook(raw) {
  const own = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { v: LOOK_VERSION, cat: coatOf('cat', own.cat), dog: coatOf('dog', own.dog) };
}

export const parseLook = parser(normalizeLook);

// Запись: свежее сохранённое + изменённые облики ({ cat?, dog? }).
export const lookRecord = (text, patch = {}) => keepRecord(text, normalizeLook, patch);

// Движение: системное «уменьшить движение» и выбор «Без анимации» важнее всего.
export function effectiveMotion(settings, reducedMotion) {
  if (reducedMotion) return 'none';
  return MOTIONS.some(([id]) => id === settings?.motion) ? settings.motion : 'normal';
}

// Надетый аксессуар: выбранный, если его ступень открыта; иначе — обычный платок.
export function wornAccessory(settings, stage) {
  const item = ACCESSORIES.find((accessory) => accessory.id === settings?.accessory);
  return item && item.stage <= stage ? item.id : 'scarf';
}

// ---------- реакции ----------

// Приоритет: меньше — важнее (1–2 — отключение и тихий режим — работают как запрет, не как реакции).
// ms — длительность, cooldown — пауза до повтора того же типа, calmOnly — только в спокойном
// контексте (не на экранах практики), decorative — не ждёт в очереди, а пропадает.
export const REACTIONS = {
  wait: { pose: 'wait', ms: 1000, priority: 3, phrases: '', cooldown: 10_000 },
  joy: { pose: 'joy', ms: 1500, priority: 4, phrases: 'joy' },
  support: { pose: 'support', ms: 1800, priority: 4, phrases: 'support' },
  unlock: { pose: 'unlock', ms: 2400, priority: 5, phrases: 'unlock' },
  greet: { pose: 'greet', ms: 1700, priority: 6, phrases: 'greet' },
  pet: { pose: 'pet', ms: 1300, priority: 6, phrases: 'pet' },
  calmPet: { pose: 'pet', ms: 700, priority: 6, phrases: '' },
  // Лапа: собака — «Дай лапу», кот (с 2026-10-10, только в сцене «Поиграть») — касается руки лапой; тот же лимит
  // частоты, что у поглаживания; без очков и знаков.
  paw: { pose: 'paw', ms: 1500, priority: 6, phrases: 'paw' },
  calmPaw: { pose: 'paw', ms: 800, priority: 6, phrases: '' },
  // Предметы сцены «Поиграть» (с 2026-10-10): миску придвинули — принюхивается (sniff), отодвинули или после лимита —
  // смотрит (watch), мячик — следит (ball). Важнее только декоративных: поглаживание и лапа их перебивают, а новая
  // реакция на предмет сменяет прежнюю (toy) — без очереди.
  sniff: { pose: 'sniff', ms: 1400, priority: 7, phrases: 'sniff', toy: true },
  watch: { pose: 'watch', ms: 900, priority: 7, phrases: '', toy: true },
  ball: { pose: 'ball', ms: 1300, priority: 7, phrases: 'ball', toy: true },
  // Выбрали напарника в уголке — он здоровается (редко: не чаще раза в 6 секунд).
  meet: { pose: 'greet', ms: 1500, priority: 6, phrases: 'greet', cooldown: 6000 },
  // Выбрали готовое имя — короткий отклик (не чаще раза в 4 секунды; ввод своего имени молчит).
  named: { pose: 'greet', ms: 1400, priority: 6, phrases: 'named', cooldown: 4000 },
  // Лакомство: подходит к миске и ест (feed), затем — довольный (fed, продолжение того же события).
  feed: { pose: 'feed', ms: 2800, priority: 4, phrases: '' },
  fed: { pose: 'fed', ms: 2200, priority: 4, phrases: 'fed' },
  yawn: { pose: 'yawn', ms: 1900, priority: 7, phrases: '', decorative: true, calmOnly: true, cooldown: 6 * 60_000 },
  // Устроился на новом месте или раскрылся целиком (с 2026-10-09): наклон головы и лёгкое потягивание, без
  // слов; декоративная — в тишине и поверх другой реакции не играет.
  settle: { pose: 'settle', ms: 1200, priority: 7, phrases: '', decorative: true, cooldown: 1500 },
  // Редкие сценки после занятия (с 2026-10-10, pickScene ниже): самые неважные — любая реакция их сменяет, сами в тишине
  // и поверх другой не начинаются и в очередь не встают. scene — поверх позы покоя (data-scene), still — сколько длится
  // статичная поза без анимации.
  stretch: { pose: 'stretch', ms: 3600, still: 2400, priority: 8, phrases: '', decorative: true, scene: true },
  curl: { pose: 'curl', ms: 4600, still: 2400, priority: 8, phrases: '', decorative: true, scene: true },
  fetch: { pose: 'fetch', ms: 4200, still: 2400, priority: 8, phrases: '', decorative: true, scene: true },
};

// Отложенная (пока идёт ввод, диктовка или интервью) реакция актуальна столько.
export const PENDING_MS = 60_000;
// Отдых — после стольких минут без действий; одиночные движения — раз в 45–90 секунд.
export const REST_AFTER_MS = 3 * 60_000;

export function microDelay(motion, random = Math.random) {
  if (motion === 'none') return null;
  const [min, max] = motion === 'calm' ? [90_000, 180_000] : [45_000, 90_000];
  return Math.round(min + random() * (max - min));
}

export function blinkDelay(motion, random = Math.random) {
  if (motion === 'none') return null;
  const [min, max] = motion === 'calm' ? [24_000, 48_000] : [12_000, 28_000];
  return Math.round(min + random() * (max - min));
}

export const MICRO_KINDS = ['ear', 'tail', 'look'];
export const MICRO_MS = { blink: 260, ear: 620, tail: 920, look: 1650, tilt: 1350 };
export const microKinds = (kind) => profileOf(kind).micro;

// Поглаживание без фарма: три полных реакции за минуту, затем одна реплика «хватит пока»,
// дальше — только тихий прищур. Очков и знаков поглаживание не даёт.
export function petMood(times = [], now = Date.now()) {
  const recent = times.filter((at) => now - at < 60_000).length;
  if (recent < 3) return 'pet';
  return recent === 3 ? 'enough' : 'quiet';
}

// «Режиссёр»: одна реакция одновременно, одна отложенная (самая важная), без очереди.
export function createDirector() {
  return { current: null, pending: null, quiet: new Set(), handled: new Set(), lastAt: {} };
}

const playing = (d, now) => d.current && d.current.until > now;

function start(d, type, now, extra = {}) {
  const reaction = REACTIONS[type];
  d.current = { type, pose: reaction.pose, priority: reaction.priority, until: now + reaction.ms, ...extra };
  d.lastAt[type] = now;
  return { action: 'play', reaction: d.current };
}

function hold(d, type, now, extra) {
  const priority = REACTIONS[type].priority;
  if (!d.pending || d.pending.expires <= now || priority < d.pending.priority) {
    d.pending = { type, priority, expires: now + PENDING_MS, ...extra };
  }
  return { action: 'queue' };
}

// type — из REACTIONS; key — id события: повторная доставка не играет дважды; context — 'calm' или 'focus' (экран
// занятия); extra — данные для показа, extra.follow — продолжение того же события ({ type, extra }), extra.until — свой срок.
// explicit — прямое действие в сцене «Поиграть»: тишина его не откладывает — отклик идёт в сцене, рисунки на странице
// тихие (pet.mjs); идёт не менее важная реакция — действие пропадает, а не ждёт. Реакция на предмет (toy) сменяет идущую
// реакцию на предмет или декоративную.
export function request(d, type, { now = Date.now(), key = '', context = 'calm', extra = {}, explicit = false } = {}) {
  const reaction = REACTIONS[type];
  if (!reaction) return { action: 'drop' };
  if (key) {
    if (d.handled.has(key)) return { action: 'drop' };
    d.handled.add(key);
  }
  if (reaction.cooldown && now - (d.lastAt[type] ?? -Infinity) < reaction.cooldown) return { action: 'drop' };
  if (reaction.decorative) {
    if (d.quiet.size || playing(d, now) || (reaction.calmOnly && context !== 'calm')) return { action: 'drop' };
    return start(d, type, now, extra);
  }
  if (explicit) {
    const swap = reaction.toy && (REACTIONS[d.current?.type]?.toy || REACTIONS[d.current?.type]?.decorative);
    if (playing(d, now) && reaction.priority >= d.current.priority && !swap) return { action: 'drop' };
    return start(d, type, now, { ...extra, explicit: true });
  }
  if (d.quiet.size) return hold(d, type, now, extra);
  if (playing(d, now) && reaction.priority >= d.current.priority) return hold(d, type, now, extra);
  return start(d, type, now, extra);
}

// Реакция доиграла. Продолжение того же события (follow: радость → новая вещь) идёт следом, если
// отложенная не важнее; иначе — отложенная, если ещё актуальна и тихо не стало. Очередь не копится.
export function finish(d, now = Date.now()) {
  const follow = d.current?.follow;
  d.current = null;
  const pending = d.pending && d.pending.expires > now ? d.pending : null;
  if (follow && REACTIONS[follow.type] && !d.quiet.size && !(pending && pending.priority < REACTIONS[follow.type].priority)) {
    return start(d, follow.type, now, follow.extra ?? {});
  }
  return takePending(d, now);
}

function takePending(d, now) {
  const next = d.pending;
  if (!next || d.quiet.size || playing(d, now)) return { action: 'none' };
  d.pending = null;
  if (next.expires <= now) return { action: 'none' };
  const { type, priority: _priority, expires: _expires, ...extra } = next;
  return start(d, type, now, extra);
}

// Тихий режим: ввод, диктовка, таймер интервью, чужой диалог. Начало — текущая реакция
// останавливается; конец — одна отложенная реакция, если ещё актуальна.
export function setQuiet(d, reason, on, now = Date.now()) {
  const was = d.quiet.size > 0;
  if (on) d.quiet.add(reason);
  else d.quiet.delete(reason);
  const is = d.quiet.size > 0;
  if (!was && is && playing(d, now)) {
    d.current = null;
    return { action: 'stop' };
  }
  if (was && !is) return takePending(d, now);
  return { action: 'none' };
}

// Поза без реакции: отдых, внимание (экран практики или тихий режим) или покой; после лакомства
// покой — довольный (content), до конца дня.
export function basePose({ quiet = false, focus = false, resting = false, content = false } = {}) {
  if (resting && !quiet) return 'rest';
  if (quiet || focus) return 'attentive';
  return content ? 'content' : 'calm';
}

// ---------- редкие сценки после занятия ----------
// После занятия этой вкладки, давшего знак, иногда — сценка: кот потягивается или сворачивается клубком, собака приносит
// мячик. Шанс 25%, одна попытка на событие, одна показанная за местный день в браузере; праздник ступени важнее. День
// показа — в IndexedDB (ключ db, sceneTurn); ключ scene — его копия (день, метка вкладки, прошлый вариант кота).

export const SCENE_VERSION = 1;
export const SCENE_CHANCE = 0.25;
export const SCENE_FRESH_MS = 10_000; // позже стольких мс от сохранения не начинается
// Реакция сохранения началась позже — ждала ввода, диктовки или таймера: сценки не будет. Запас над снятием тишины
// ввода (250 мс после ухода из отправленного поля), а не ожидание конца занятия.
export const SCENE_GRACE_MS = 500;
export const SCENES = { cat: ['stretch', 'curl'], dog: ['fetch'] };
// В портрете видна только голова: клубок там не читается.
export const PORTRAIT_SCENES = ['stretch', 'fetch'];
const SCENE_TEXT = { stretch: 'потягивается', curl: 'сворачивается клубком', fetch: 'приносит мячик' };

// Имя не склоняется: «Марс потягивается.»; без имени — «Потягивается.» (узкое облако, длинное имя).
export const sceneText = (type, name = '') => {
  const text = SCENE_TEXT[type];
  if (!text) return '';
  return name ? `${name} ${text}.` : `${text[0].toUpperCase()}${text.slice(1)}.`;
};

// Что читается там, где питомец виден: целиком — всё, в портрете — без клубка.
export const sceneTypes = (kind, full) => SCENES[kindOf(kind)].filter((type) => full || PORTRAIT_SCENES.includes(type));

export function normalizeScene(raw) {
  const own = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    v: SCENE_VERSION,
    day: typeof own.day === 'string' && DAY_ONLY.test(own.day) ? own.day : '',
    by: typeof own.by === 'string' ? own.by.slice(0, 32) : '',
    cat: SCENES.cat.includes(own.cat) ? own.cat : '',
  };
}

export const parseScene = (text) => normalizeScene(keepRecord(text, (raw) => raw, {}));
export const sceneRecord = (text, patch = {}) => keepRecord(text, normalizeScene, patch);

// Сценка этого занятия или ''. key — id события (checked — проверенные: одна попытка), outcome — doneOutcome,
// celebrate — stageToCelebrate, record — копия scene, available — sceneTypes. У кота — не прошлый вариант, если доступны оба.
export function pickScene({ key = '', checked = new Set(), outcome = null, celebrate = null, day = '', record = null, kind = 'cat', available = SCENES[kindOf(kind)], random = Math.random } = {}) {
  if (!key || checked.has(key)) return '';
  checked.add(key);
  if (!outcome?.practice || !outcome.counted || celebrate !== null) return '';
  const last = normalizeScene(record);
  if (!DAY_ONLY.test(day) || last.day === day) return '';
  if (!(random() < SCENE_CHANCE)) return '';
  const list = SCENES[kindOf(kind)].filter((type) => available.includes(type));
  const fresh = list.filter((type) => type !== last.cat);
  const from = fresh.length ? fresh : list;
  return from.length > 1 ? from[Math.min(from.length - 1, Math.floor(random() * from.length))] : (from[0] ?? '');
}

// Уместна ли сейчас (next — { type, until }): не позже срока, напарник и вкладка видны, тишины нет, ничего не играет,
// «Поиграть» закрыта, питомца не переносят, вариант читается там, где он виден.
export function sceneFits(next, { now = Date.now(), shown = true, quiet = false, playing = false, play = false, moving = false, kind = 'cat', full = true } = {}) {
  return Boolean(next) && now <= next.until && shown && !quiet && !playing && !play && !moving && sceneTypes(kind, full).includes(next.type);
}

// Реакция сохранения (next — попытка: { at — время сохранения }) началась в started позже перехода: сценка отменяется.
export const sceneWaited = (next, started) => !next || started > next.at + SCENE_GRACE_MS;

// Решение в транзакции: запись дня (показать) или null. stored — день в базе, mirror — копия scene (её мог занять прежний
// код другой вкладки), day — день занятия, today — день сейчас (полночь между ними — без сценки).
export function sceneCommit(stored, mirror, { day = '', today = '', by = '', kind = 'cat', type = '', fits = false } = {}) {
  const last = normalizeScene(stored);
  const copy = normalizeScene(mirror);
  if (!fits || !by || !DAY_ONLY.test(day) || day !== today || last.day === day || copy.day === day) return null;
  return normalizeScene({ day, by, cat: kindOf(kind) === 'cat' ? type : last.cat || copy.cat });
}

// Попытка показа — одна транзакция readwrite IndexedDB (idb — indexedDB, name — база): прочитать день, decide → запись
// или null, с записью — show() (начало показа). Такие транзакции браузер выполняет по очереди для всех вкладок, и
// следующая видит запись предыдущей: проверка и фиксация исключительны. Итог: 'shown' — записано; 'skip' — не
// показывали, ничего не записано; 'fail' — базы нет или сбой до показа; 'lost' — показ начался, запись откатилась.
export function sceneTurn(idb, name, decide, show) {
  return new Promise((resolve) => {
    let shown = false;
    const fail = (db) => {
      db?.close();
      resolve(shown ? 'lost' : 'fail');
    };
    try {
      const open = idb.open(name, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('scene');
      open.onerror = () => fail();
      open.onsuccess = () => {
        const db = open.result;
        try {
          const tx = db.transaction('scene', 'readwrite');
          const store = tx.objectStore('scene');
          const get = store.get('shown');
          get.onsuccess = () => {
            try {
              const record = decide(get.result ?? null);
              if (!record) return;
              store.put(record, 'shown');
              shown = true;
              show();
            } catch {
              tx.abort();
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve(shown ? 'shown' : 'skip');
          };
          tx.onabort = () => fail(db);
        } catch {
          fail(db);
        }
      };
    } catch {
      fail();
    }
  });
}

// ---------- реплики ----------
// Одна мысль, обычно 3–9 слов. Без оценки ответа, личности и готовности; без упрёков за паузы.

export const PHRASES = {
  greet: ['Я рядом. Разберём по одному.', 'О, ты здесь. Я тоже.', 'Привет. Я занял тёплое место.', 'Начнём с малого?'],
  joy: [
    'Ответ сохранён. Можно выдохнуть.',
    'Записано. Я проследил.',
    'Маленький шаг тоже считается.',
    'Готово. Хвост доволен.',
    'Сделано. Остальное подождёт.',
    'Ещё один кирпичик в копилку.',
  ],
  support: [
    'Этот кейс был с когтями.',
    'Сложное позади. Посидим минутку.',
    'Вернулись к трудному — это и есть работа.',
    'Сначала факты. Потом героизм.',
  ],
  unlock: ['Сегодня уютнее, чем вчера.', 'Смотри, что у нас появилось.', 'Обживаемся понемногу.'],
  plaid: ['Примерил новый платок. Мне идёт.'],
  pet: ['Мрр. Это было своевременно.', 'Вот это я понимаю — процесс.', 'Ладно, ещё немного можно.', 'Мрр. Я слежу за качеством.'],
  petEnough: ['Хватит пока. Я сыт вниманием.'],
  // С 2026-10-10 — сцена «Поиграть»: лапа, миска, мячик.
  paw: ['Лапа мягкая. Когти дома.', 'Тык. Это я так здороваюсь.', 'Лапой — значит, доверяю.'],
  sniff: ['Нюх. Миска на месте.', 'Проверил миску. Порядок.'],
  ball: ['Катится. Я слежу.', 'Мячик. Интересно.'],
  scene: [
    'Мой вклад — лежать стратегически.',
    'Я держу эту подушку под контролем.',
    'Слушаю. Ушами, в основном.',
    'Тишина — тоже часть подготовки.',
    { text: 'Кружка не моя. Но я рядом.', stage: 2 },
    { text: 'Лампа — лучшее решение квартала.', stage: 3 },
    { text: 'Доска на стене. Всё по канбану.', stage: 4 },
  ],
  rest: ['Я не сплю. Я планирую.', 'Пауза — это тоже план.'],
  // С 2026-10-08: лакомство, подсказка после первого занятия дня, имя, возвращение после паузы.
  fed: ['Приемлемо. Даже вкусно.', 'Сытый кот — спокойный кот.', 'Хрум. Ты работай, я посижу.', 'Вкусно. Теперь можно и вздремнуть.'],
  joyTreat: ['Записано. Миска, кстати, в уголке.', 'Сохранено. Теперь можно и угостить.'],
  named: ['Новое имя. Мне идёт.', 'Принято. Буду откликаться. Иногда.', 'Звучит солидно. Почти как я.'],
  welcome: ['Привет. Я держал тебе место.', 'О, ты здесь. Начнём с малого?', 'Без спешки. Одно занятие — уже хорошо.'],
};

// Собака — свой банк: доброжелательный, внимательный, немного любопытный; без кошачьих деталей.
// Те же группы событий, что у кота, плюс «лапа».
export const DOG_PHRASES = {
  greet: ['Я рядом. Начнём с одного шага.', 'Привет. Хвост уже виляет.', 'О, ты здесь. Пойдём по шагу.', 'Я тут. Выбирай, с чего начнём.'],
  joy: [
    'Ответ сохранён. Можно выдохнуть.',
    'Записано. Хвост одобряет.',
    'Шаг сделан. Я отметил.',
    'Сохранено. Идём в своём темпе.',
    'Готово. Можно перевести дух.',
  ],
  support: ['Вернулись к сложному. Шаг сделан.', 'Трудный был кусок. Посидим рядом.', 'Сложное — по шагу за раз.', 'Непростой блок позади. Я рядом.'],
  unlock: ['В нашем уголке стало уютнее.', 'Нюхаю новинку. Одобряю.', 'Обустраиваемся понемногу.'],
  plaid: ['Новый платок. Мне нравится.'],
  pet: ['Вот так. Теперь хорошо.', 'Ещё чуть-чуть за ухом.', 'Хвост сам виляет.', 'Спасибо. Я рядом.'],
  petEnough: ['Пока хватит. Хвост доволен.'],
  paw: ['Договорились. Лапа.', 'Вот лапа. По рукам.', 'Лапа есть. Работаем дальше.'],
  sniff: ['Нюх-нюх. Миска рядом.', 'Миску проверил. Всё в порядке.'],
  ball: ['Мячик! Вижу-вижу.', 'Катится! Я слежу.'],
  scene: [
    'Я посторожу этот коврик.',
    'Слушаю внимательно. Уши на месте.',
    'Можно не спешить. Я рядом.',
    'Нюхаю обстановку. Всё спокойно.',
    { text: 'Мячик подождёт. Сначала дело.', stage: 2 },
    { text: 'Под лампой лежится лучше.', stage: 3 },
    { text: 'Доска с заметками. Всё по плану.', stage: 4 },
  ],
  rest: ['Я прилёг. Но слушаю.', 'Отдых тоже по плану.'],
  fed: ['Ням! Спасибо-спасибо!', 'Вкусно! Хвост в восторге.', 'Лучшее лакомство дня!', 'Сыт и счастлив. Работаем!'],
  joyTreat: ['Сохранено! А в уголке — миска.', 'Записано! Можно угостить.'],
  named: ['Хорошее имя! Я запомнил.', 'Ура, новое имя! Хвост одобряет.', 'Звучит! Буду бегать на него.'],
  welcome: ['Ты здесь! Хвост сразу завилял.', 'Привет! Начнём с одного шага.', 'Как хорошо, что ты здесь.'],
};

const PHRASE_BANKS = { cat: PHRASES, dog: DOG_PHRASES };

export function phraseList(group, stage = 0, kind = 'cat') {
  return (PHRASE_BANKS[kindOf(kind)][group] ?? []).filter((item) => typeof item === 'string' || item.stage <= stage).map((item) => (typeof item === 'string' ? item : item.text));
}

// Случайная реплика группы (из банка животного kind), но не та же, что была только что.
export function pickPhrase(group, { last = '', stage = 0, kind = 'cat', random = Math.random } = {}) {
  const list = phraseList(group, stage, kind);
  const pool = list.filter((text) => text !== last);
  const from = pool.length ? pool : list;
  return from.length ? from[Math.min(from.length - 1, Math.floor(random() * from.length))] : '';
}

// Местная дата — для «первого открытия за день», лакомства и сценок.
export function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Склонение «знак практики».
export function marksText(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const form = mod10 === 1 && mod100 !== 11 ? 'знак' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'знака' : 'знаков';
  return `${n} ${form}`;
}
