// Ядро: форматы данных (v1) ключей пространства имён — нормализация для показа и функции записи (build операции ключа,
// docs/ARCHITECTURE.md § 8.3). Единственный модуль ядра, который знает штатных кота и собаку: по своей природе к ним
// привязаны форматы 0.1.4 — ключ cat (общие настройки, имя и аксессуар кота), companion (выбор штатного питомца, имя и
// аксессуар собаки), поле варианта сценки кота в scene. С PL06 — ключ расширений ext:v1 (§ 7.7): выбор питомца-расширения
// поверх companion (pet: { id, over }), модель поведения, имена и аксессуары сторонних питомцев. Хранение по ключам —
// README, «Хранение».

import { STAGES } from '../stages.mjs';
import { DAY_ONLY } from '../day.mjs';
import { cleanName } from '../pets.mjs';

// Штатные питомцы форматов 0.1.4: companion.kind знает только их; сторонний питомец выбирается в ext:v1 поверх них.
export const LEGACY_KINDS = Object.freeze(['cat', 'dog']);
export const legacyKind = (value) => (LEGACY_KINDS.includes(value) ? value : 'cat');
// Ключ общих настроек (движение, реплики, «скрыт», увиденная ступень, день приветствия) — ключ кота 0.1.4.
export const SETTINGS = 'cat';

// Девять ключей пространства имён (все загружает координатор хранения); place — предпочтение legacy-отображения, ext —
// данные расширений (PL06).
export const STORAGE_NAMES = Object.freeze(['cat', 'companion', 'look', 'treat', 'place', 'presence', 'scene', 'room', 'ext']);

// Ключи в пространстве имён ns (options.storage сайта); v1 — версия формата данных, а не модуля.
export const storageKeys = (ns = 'pet') => ({
  ...Object.fromEntries(STORAGE_NAMES.map((key) => [key, `${ns}:${key}:v1`])),
  db: `${ns}:scene`,
});

// Где живут имя и аксессуар питомца: кот — в ключе cat, собака — companion.dog, сторонний — ext.pets[id] (§ 7.6).
// Путь — массив сегментов: ID с точкой (example.bunny) — один сегмент.
export function ownHome(petId) {
  if (petId === 'cat') return { key: 'cat', path: [] };
  if (petId === 'dog') return { key: 'companion', path: ['dog'] };
  return { key: 'ext', path: ['pets', petId] };
}

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

// Строка-ID (облик, аксессуар): понятность конкретному питомцу проверяет ядро по его определению; формат хранит строку.
const idOf = (value) => (typeof value === 'string' && value ? value : '');

// Любое сохранённое значение → корректные настройки. Повреждённое — по умолчанию; старая версия
// и версия из более новой вкладки — понятные поля сохраняются, остальное по умолчанию.
export function normalizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  return {
    v: CAT_VERSION,
    name: typeof raw.name === 'string' ? cleanName(raw.name) : '',
    accessory: idOf(raw.accessory) || base.accessory,
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

// ---------- выбор штатного питомца ----------
// Ключ cat — общие настройки (движение, реплики, скрыт, увиденная ступень, день приветствия), имя и аксессуар кота; выбор
// штатного животного и собака — в своём ключе companion: вкладка старого кода переписывает cat только понятными ей полями.

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
    kind: legacyKind(raw.kind),
    dog: {
      name: typeof dog.name === 'string' ? cleanName(dog.name) : '',
      accessory: idOf(dog.accessory) || base.dog.accessory,
    },
  };
}

export const parseCompanion = parser(normalizeCompanion);

// Сохранённый выбор штатного питомца как есть: строка (в том числе неизвестная этой версии) или кот, если выбора нет.
export const storedKind = (raw) => (isRecord(raw) && typeof raw.kind === 'string' && raw.kind ? raw.kind : 'cat');

// Настройки показанного штатного напарника: общие поля — из ключа cat, имя и аксессуар — свои.
export function companionView(cat, companion, kind = companion?.kind) {
  const k = legacyKind(kind);
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
    else if ((key === 'name' || key === 'accessory') && legacyKind(kind) === 'dog') companion.dog = { ...companion.dog, [key]: value };
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
  if ('kind' in patch) out.kind = legacyKind(patch.kind);
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
// Облик каждого питомца — поле верхнего уровня с его ID (look.cat, look.dog, look['example.bunny']): облики пишутся
// независимо, чужие поля ключа сохраняются (вкладка 0.1.4 их тоже сохраняет).

export const LOOK_VERSION = 1;

// Сохранённые облики как есть (строки по ID питомца); понятность облика конкретному питомцу проверяет ядро.
export function normalizeLook(raw) {
  const own = isRecord(raw) ? raw : {};
  return Object.fromEntries([['v', LOOK_VERSION], ...Object.entries(own).filter(([id, coat]) => id !== 'v' && typeof coat === 'string' && coat)]);
}

export const parseLook = parser(normalizeLook);

// Запись: свежее сохранённое + изменённые облики ({ [petId]: coat }); облик другого питомца, в том числе непонятный этой
// версии, и облики неизвестных питомцев остаются как были.
export function lookRecord(text, patch = {}) {
  const raw = readRecord(text).raw ?? {};
  const out = { v: LOOK_VERSION, ...raw };
  for (const [id, coat] of Object.entries(patch)) if (id !== 'v' && typeof coat === 'string' && coat) out[id] = coat;
  out.v = keepVersion(raw.v, LOOK_VERSION);
  return out;
}

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

// ---------- вариант редкой сценки (ключ scene и запись дня резервирования) ----------
// Прошлый вариант — чтобы fresh-модель не повторяла его. Запись сценки (scene:v1 и запись дня резервирования) — формат
// 0.1.4: { v, day, by, cat } и неизвестное как есть; новых полей в ней нет (PL11.2, D5: новые поля — не в старые ключи).
// Кот — поле cat этой записи; собака — нигде, как 0.1.4 (у неё один вариант); остальные питомцы — ext:v1 scenes[petId]
// (отдельный ключ с 0.2.0, его вкладки 0.1.4 не знают). variants[petId] записи сценки (так писали 0.2.0–0.2.1) только
// читается: личные данные не переносятся.

// Где помнить вариант питомца: { key, path } или null (не помнить).
export const variantPlace = (petId) => (petId === 'cat' ? { key: 'scene', path: ['cat'] } : petId === 'dog' ? null : { key: 'ext', path: ['scenes', petId] });

// Прошлый вариант питомца petId (как есть) или '': raw — запись сценки, ext — запись ext:v1.
export function lastVariant(raw, petId, ext = null) {
  if (petId === 'cat') return isRecord(raw) && typeof raw.cat === 'string' ? raw.cat : '';
  const own = isRecord(ext) && isRecord(ext.scenes) ? ext.scenes[petId] : undefined;
  if (typeof own === 'string') return own;
  const old = isRecord(raw) && isRecord(raw.variants) ? raw.variants[petId] : undefined;
  return typeof old === 'string' ? old : '';
}

// Поле варианта копии дня из записи дня (record — та, что ставится резервированием): как 0.1.4, где копия и запись были
// одной записью { v, day, by, cat }, — cat копии всегда, когда в записи это строка (у кота — показанный вариант, у другого
// питомца — прежний вариант кота или ''). Нестроковое cat записи в копию не идёт: прежнее cat копии остаётся.
export const copyVariant = (record) => (isRecord(record) && typeof record.cat === 'string' ? [[['cat'], record.cat]] : []);

// Поля варианта для записи дня: у кота поле cat — показанный type; у другого питомца — как 0.1.4: своё сохранённое cat,
// пустое — из копии (mirror). Вариант другого питомца в запись не идёт (variantPlace).
export function variantFields(raw, mirror, petId, type) {
  const own = isRecord(raw) ? raw : {};
  const copy = isRecord(mirror) ? mirror : {};
  if (petId === 'cat') return { cat: type };
  return { cat: own.cat === undefined || own.cat === '' ? (typeof copy.cat === 'string' ? copy.cat : '') : own.cat };
}

// Поля варианта из правки копии дня (патч путей variantPath): кот — cat (строка), остальные — variants, слитые с
// сохранённым; непонятное сохранённое значение variants (не объект) не заменяется.
export function variantPatch(raw, patch = {}) {
  const out = {};
  if ('cat' in patch && typeof patch.cat === 'string') out.cat = patch.cat;
  if (isRecord(patch.variants) && (raw.variants === undefined || isRecord(raw.variants))) out.variants = { ...(isRecord(raw.variants) ? raw.variants : {}), ...patch.variants };
  return out;
}

// ---------- расширения (ext:v1, § 7.7) ----------
// { v: 1, pet?: { id, over }, behavior?: string, pets?: { [id]: { name, accessory } }, scenes?: { [id]: string } } (scenes —
// прошлый вариант редкой сценки питомцев кроме кота и собаки, с 0.2.2). pet — выбор питомца-расширения:
// действителен, пока подтверждённый companion.kind === over (over — штатный, которого при выборе показывал companion;
// его и видят вкладки 0.1.4). Новые данные — в новом ключе: вкладки 0.1.4 нормализуют cat и companion и отбросили бы их.

export const EXT_VERSION = 1;

// Очистка выбора расширения: безусловная (ext без pet) или условная — только если там всё ещё эта запись (id и over).
const CLEAR = Symbol('очистка ext.pet');
export const clearPet = (only = null) => Object.freeze({ [CLEAR]: true, only: only ? Object.freeze({ id: only.id, over: only.over }) : null });
export const isClear = (value) => Boolean(value) && typeof value === 'object' && value[CLEAR] === true;

// Действительная по форме запись выбора: { id, over } — непустые строки.
export const extPet = (raw) => (isRecord(raw) && typeof raw.id === 'string' && raw.id && typeof raw.over === 'string' && raw.over ? { id: raw.id, over: raw.over } : null);

// Показ: выбор расширения (по форме), модель, свои имя и аксессуар сторонних питомцев — как есть; понятность значений
// проверяет ядро по определениям.
export function normalizeExt(raw) {
  const own = isRecord(raw) ? raw : {};
  return { v: EXT_VERSION, pet: extPet(own.pet), behavior: typeof own.behavior === 'string' ? own.behavior : '', pets: isRecord(own.pets) ? own.pets : {} };
}

// Запись: свежее сохранённое как есть (неизвестные поля, ID и значения, вложенные поля pets[id], больший v) + правка:
// patch.pet — { id, over } (выбор) или clearPet(…) (снять: безусловно или только ту же запись); patch.behavior — ID модели;
// patch.pets — { [id]: { name?, accessory? } }: pets[id] не объект (непонятное значение) — заменяется объектом правки, как
// companion.dog (PL02).
export function extRecord(text, patch = {}) {
  const raw = readRecord(text).raw ?? {};
  const out = { v: EXT_VERSION, ...raw };
  if ('pet' in patch) {
    const value = patch.pet;
    if (isClear(value)) {
      const was = extPet(raw.pet);
      if (!value.only || (was && was.id === value.only.id && was.over === value.only.over)) delete out.pet;
    } else if (extPet(value)) out.pet = { ...(isRecord(raw.pet) ? raw.pet : {}), id: value.id, over: value.over };
  }
  if ('behavior' in patch && typeof patch.behavior === 'string' && patch.behavior) out.behavior = patch.behavior;
  if (isRecord(patch.pets)) {
    const pets = isRecord(raw.pets) ? { ...raw.pets } : {};
    for (const [id, fields] of Object.entries(patch.pets)) {
      if (!isRecord(fields)) continue;
      const was = isRecord(pets[id]) ? pets[id] : {};
      const next = { ...was };
      if ('name' in fields) next.name = typeof fields.name === 'string' ? cleanName(fields.name) : '';
      if ('accessory' in fields && idOf(fields.accessory)) next.accessory = fields.accessory;
      pets[id] = next;
    }
    out.pets = pets;
  }
  // Прошлый вариант сценки: слияние с сохранённым; непонятное сохранённое (не объект) не заменяется.
  if (isRecord(patch.scenes) && (raw.scenes === undefined || isRecord(raw.scenes))) {
    const scenes = { ...(isRecord(raw.scenes) ? raw.scenes : {}) };
    for (const [id, type] of Object.entries(patch.scenes)) if (typeof type === 'string' && type) scenes[id] = type;
    out.scenes = scenes;
  }
  out.v = keepVersion(raw.v, EXT_VERSION);
  return out;
}
