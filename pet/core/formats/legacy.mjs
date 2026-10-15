// Ядро: форматы данных 0.1.4 (v1) ключей cat, companion, look, treat — нормализация для показа и функции записи (build
// операции ключа, docs/ARCHITECTURE.md § 8.3). Ключи cat и companion.dog по своей природе привязаны к коту и собаке.
// Хранение по ключам — README, «Хранение».

import { ACCESSORIES, STAGES } from '../stages.mjs';
import { DAY_ONLY } from '../day.mjs';
import { cleanName, coatOf, kindOf } from '../pets.mjs';

// Восемь ключей пространства имён (все загружает координатор хранения); place — предпочтение legacy-отображения.
export const STORAGE_NAMES = ['cat', 'companion', 'look', 'treat', 'place', 'presence', 'scene', 'room'];

// Ключи в пространстве имён ns (options.storage сайта); v1 — версия формата данных, а не модуля.
export const storageKeys = (ns = 'pet') => ({
  ...Object.fromEntries(STORAGE_NAMES.map((key) => [key, `${ns}:${key}:v1`])),
  db: `${ns}:scene`,
});

export const CAT_VERSION = 1;

// ---------- настройки (localStorage, отдельно на каждом устройстве) ----------

export const MOTIONS = [
  ['normal', 'Обычное'],
  ['calm', 'Спокойное'],
  ['none', 'Без анимации'],
];

export function defaultSettings() {
  return { v: CAT_VERSION, name: '', accessory: 'scarf', motion: 'normal', phrases: true, hidden: false, seenStage: -1, greetDay: '' };
}

// Увиденная ступень, понятная этой версии: -1 (ещё не отмечали) или ступень из STAGES.
export const knownStage = (value) => Number.isInteger(value) && value >= -1 && value < STAGES.length;

// В сохранённом объекте есть увиденная ступень, непонятная этой версии (больше известных — из более новой версии, не целое
// число, другой тип). Показ — -1 (вещи по знакам), но это не «ещё не отмечали»: отметка, праздник и первое включение её не
// трогают (ядро), запись её не заменяет (catRecord). Поля нет или -1 — обычное первое включение.
export const unknownStage = (raw) => isRecord(raw) && 'seenStage' in raw && !knownStage(raw.seenStage);

// Сохранённая увиденная ступень остаётся при правке patch: она непонятна этой версии или не меньше правки (ступень только
// растёт — «открытые вещи не пропадают»). Сохранённой нет или она -1 и меньше — правка пишется.
export const stageKept = (raw, patch) =>
  'seenStage' in patch && (unknownStage(raw) || (knownStage(raw?.seenStage) && raw.seenStage >= (knownStage(patch.seenStage) ? patch.seenStage : -1)));

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
    seenStage: knownStage(raw.seenStage) ? raw.seenStage : base.seenStage,
    greetDay: typeof raw.greetDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.greetDay) ? raw.greetDay : '',
  };
}

// Сохранённый текст → нормализованное значение для показа; повреждённый JSON — как пустое (значение по умолчанию).
// Показ не меняет сохранённого: запись идёт от исходного объекта (keepRecord).
export function parser(normalize) {
  return (text) => {
    try {
      return normalize(JSON.parse(text ?? 'null'));
    } catch {
      return normalize(null);
    }
  };
}

export const parseSettings = parser(normalizeSettings);

// ---------- хранение: исходная запись и правка ----------
// Чтение различает: ключа нет (getItem вернул null) — умолчания, запись разрешена; повреждено (не JSON или не объект:
// массив, строка, число, null) — умолчания, неявные записи ключ не трогают; объект — показываются понятые поля, а запись
// сохраняет всё остальное. Отказ чтения (исключение хранилища) различает вызывающий: до текста дело не доходит.

export const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function readRecord(text) {
  if (text === null || text === undefined) return { state: 'missing', raw: null };
  try {
    const raw = JSON.parse(text);
    return isRecord(raw) ? { state: 'ok', raw } : { state: 'corrupt', raw: null };
  } catch {
    return { state: 'corrupt', raw: null };
  }
}

// Номер схемы при записи: больший корректный сохранённый (совместимая более новая версия) не уменьшается.
export const keepVersion = (v, known) => (Number.isInteger(v) && v > known ? v : known);

// Запись ключа: свежее сохранённое как есть (неизвестные поля и непонятные значения известных — на своих местах) + только
// изменённые известные поля (patch), каждое — по правилам проверки normalize; поля, которых формат не знает, из patch не
// пишутся. Ключа нет или повреждён — запись только из изменённых полей.
export function keepRecord(text, version, normalize, patch) {
  const raw = readRecord(text).raw ?? {};
  const clean = normalize({ ...raw, ...patch });
  const out = { v: version, ...raw };
  for (const key of Object.keys(patch)) if (key !== 'v' && key in clean) out[key] = clean[key];
  out.v = keepVersion(raw.v, version);
  return out;
}

// Запись общих настроек и кота: изменённые поля ({ name?, accessory?, motion?, … }). Увиденная ступень правки — по свежему
// сохранённому (stageKept): непонятную этой версии и не меньшую она не заменяет — ни первым включением, ни отметкой, ни
// праздником, ни вместе с явной правкой из памяти страницы после отказа записи или повреждения.
export function catRecord(text, patch = {}) {
  const own = stageKept(readRecord(text).raw, patch) ? Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'seenStage')) : patch;
  return keepRecord(text, CAT_VERSION, normalizeSettings, own);
}

// ---------- выбор напарника ----------
// Ключ cat — общие настройки (движение, реплики, скрыт, увиденная ступень, день приветствия), имя и аксессуар кота; выбор
// животного и собака — в своём ключе companion: вкладка старого кода переписывает cat только понятными ей полями.

export const COMPANION_VERSION = 1;

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

// Показ: свежие сохранённые значения + изменённые поля (остальные поля не откатываются к устаревшим).
export function mergeCompanion(current, patch = {}) {
  const now = normalizeCompanion(current);
  return normalizeCompanion({ ...now, ...patch, dog: { ...now.dog, ...patch.dog } });
}

// Запись: свежее сохранённое как есть + изменённые поля ({ kind?, dog?: { name?, accessory? } }). Неизвестный вид в kind
// (показывается котом) остаётся, пока не выберут известного; поля других животных и неизвестные поля dog — тоже. dog не
// объект (непонятное значение) — правка имени или аксессуара собаки заменяет его объектом с изменёнными полями.
export function companionRecord(text, patch = {}) {
  const raw = readRecord(text).raw ?? {};
  const out = { v: COMPANION_VERSION, ...raw };
  if ('kind' in patch) out.kind = kindOf(patch.kind);
  const dog = isRecord(patch.dog) ? patch.dog : {};
  const fields = ['name', 'accessory'].filter((key) => key in dog);
  if (fields.length) {
    const was = isRecord(raw.dog) ? raw.dog : {};
    const clean = normalizeCompanion({ dog: { ...was, ...dog } }).dog;
    out.dog = { ...was, ...Object.fromEntries(fields.map((key) => [key, clean[key]])) };
  }
  out.v = keepVersion(raw.v, COMPANION_VERSION);
  return out;
}

// ---------- ежедневное лакомство ----------
// Одно кормление в день: открывает первое занятие дня (его считает сайт), остальное — косметика. Отметка «сегодня уже
// угостили» — в своём ключе treat. Ни здоровья, ни голода, ни долгов за пропуски.

export const TREAT_VERSION = 1;

export function defaultTreat() {
  return { v: TREAT_VERSION, fedDay: '' };
}

export function normalizeTreat(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultTreat();
  return { v: TREAT_VERSION, fedDay: typeof raw.fedDay === 'string' && DAY_ONLY.test(raw.fedDay) ? raw.fedDay : '' };
}

export const parseTreat = parser(normalizeTreat);

// Запись отметки: свежее сохранённое + день кормления.
export const treatRecord = (text, fedDay) => keepRecord(text, TREAT_VERSION, normalizeTreat, { fedDay });

// ---------- облик ----------
// Облик кота и собаки пишутся независимо, чужие поля ключа сохраняются.

export const LOOK_VERSION = 1;

export function defaultLook() {
  return { v: LOOK_VERSION, cat: coatOf('cat'), dog: coatOf('dog') };
}

export function normalizeLook(raw) {
  const own = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { v: LOOK_VERSION, cat: coatOf('cat', own.cat), dog: coatOf('dog', own.dog) };
}

export const parseLook = parser(normalizeLook);

// Запись: свежее сохранённое + изменённые облики ({ cat?, dog? }); облик другого животного, в том числе непонятный этой
// версии, и облики неизвестных животных остаются как были.
export const lookRecord = (text, patch = {}) => keepRecord(text, LOOK_VERSION, normalizeLook, patch);

// ---------- предпочтение отображения (ключ place) ----------
// Место и вид legacy-отображения у телефона и компьютера (place:v1): формат, места, вид и правила раскладки — у отображения
// (pet-place.mjs, PLACE_MEDIA); ядро ключ хранит (память ключа, сверка, поглощение, запись через своё подключение) и не
// толкует. Запись: свежее сохранённое как есть + изменённые поля разделов ({ desktop?: { place?, view? }, phone?: … } —
// строки, проверенные отображением); остальное — как было, включая поля и значения будущих версий и больший v.
export const PLACE_VERSION = 1;
export function prefRecord(text, patch = {}) {
  const keep = readRecord(text).raw ?? {};
  const out = { ...keep, v: keepVersion(keep.v, PLACE_VERSION) };
  for (const [section, fields] of Object.entries(isRecord(patch) ? patch : {})) {
    if (!isRecord(fields) || !Object.keys(fields).length) continue;
    out[section] = { ...(isRecord(keep[section]) ? keep[section] : {}), ...fields };
  }
  return out;
}
