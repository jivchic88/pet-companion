// Ядро: редкие сценки после занятия (docs/ARCHITECTURE.md § 7.1.1, § 9, § 10; срезы PL04.2, PL06) — копия дня scene:v1,
// правила выбора, уместности и решения дня. Варианты (поза, где читаются, длительности, текст) — у определения питомца,
// шанс, порядок и skip — у модели поведения (PL06); время и случайность — аргументы (порты экземпляра), день показа
// резервирует порт scenes (веб — pet/web/scenes.mjs, IndexedDB); попытку ведёт сессия (session.mjs). Без IndexedDB,
// localStorage, системного времени и случайности.
//
// После занятия, давшего знак, иногда — сценка. Одна попытка на событие, одна показанная за местный день в области
// хранения (общая для питомцев и моделей); праздник ступени важнее. Допустимые сценки — пересечение: сценки показанного
// питомца без skip модели, объявленные отображением (setDisplay({ scenes })) и читаемые в текущем показе; пересечение — до
// шанса.

import { DAY_ONLY } from './day.mjs';
import { isRecord, keepVersion, lastVariant, readRecord, variantFields, variantPatch } from './formats/legacy.mjs';

export const SCENE_VERSION = 1;
export const SCENE_FRESH_MS = 10_000; // позже стольких мс от сохранения не начинается
// Реакция сохранения началась позже — ждала ввода, диктовки или таймера: сценки не будет. Запас над снятием тишины
// ввода (250 мс после ухода из отправленного поля), а не ожидание конца занятия.
export const SCENE_GRACE_MS = 500;

// Имя не склоняется: «Марс потягивается.»; без имени — «Потягивается.» (узкое облако, длинное имя). scene — сценка
// определения ({ text } — то, что идёт после имени).
export const sceneText = (scene, name = '') => {
  const text = scene?.text ?? '';
  if (!text) return '';
  return name ? `${name} ${text}.` : `${text[0].toUpperCase()}${text.slice(1)}.`;
};

// Что читается там, где питомец виден: целиком — всё, в портрете — только needs: 'any'. scenes — сценки питомца пары.
export const sceneTypes = (scenes, full) => scenes.filter((item) => full || item.needs === 'any').map((item) => item.id);

// Допустимые сценки питомца petId сейчас — пересечение (§ 7.1.1): scenes — его сценки без skip модели, declared —
// объявление отображения ({ petId: [sceneId, …] } или null, «не объявлено»), full — показ целиком. Нет объявления, нет
// ключа питомца, пустой список — ни одной.
export function sceneOptions(petId, scenes, declared, full) {
  const own = isRecord(declared) && Object.hasOwn(declared, petId) && Array.isArray(declared[petId]) ? declared[petId] : [];
  return sceneTypes(scenes, full).filter((id) => own.includes(id));
}

// Копия дня для показа: день, метка вкладки и запись как есть (raw — для прошлого варианта питомца, lastVariant).
export function normalizeScene(raw) {
  const own = isRecord(raw) ? raw : {};
  return {
    v: SCENE_VERSION,
    day: typeof own.day === 'string' && DAY_ONLY.test(own.day) ? own.day : '',
    by: typeof own.by === 'string' ? own.by.slice(0, 32) : '',
    raw: own,
  };
}

export const parseScene = (text) => normalizeScene(readRecord(text).raw);

// Копия дня: свежее сохранённое как есть + изменённые поля ({ day?, by? } и вариант питомца по пути variantPath — поля
// варианта и их слияние с сохранённым — формат 0.1.4 и PL06, variantPatch).
export function sceneRecord(text, patch = {}) {
  const raw = readRecord(text).raw ?? {};
  const out = { v: SCENE_VERSION, ...raw };
  if ('day' in patch) out.day = typeof patch.day === 'string' && DAY_ONLY.test(patch.day) ? patch.day : '';
  if ('by' in patch) out.by = typeof patch.by === 'string' ? patch.by.slice(0, 32) : '';
  Object.assign(out, variantPatch(raw, patch));
  out.v = keepVersion(raw.v, SCENE_VERSION);
  return out;
}

// Сценка этого занятия или ''. key — id события (checked — проверенные: одна попытка), outcome — doneOutcome,
// celebrate — stageToCelebrate, record — копия scene (как есть), pet — ID показанного питомца, available — допустимые
// сценки (sceneOptions; пусто — без броска), chance и order — политика модели. random — порт случайности: сначала шанс,
// затем вариант, если вариантов больше одного. fresh — не прошлый вариант этого питомца, если доступны другие.
export function pickScene({ key = '', checked = new Set(), outcome = null, celebrate = null, day = '', record = null, pet = '', available = [], chance = 0, order = 'fresh', random } = {}) {
  if (!key || checked.has(key)) return '';
  checked.add(key);
  if (!outcome?.practice || !outcome.counted || celebrate !== null) return '';
  const last = normalizeScene(record);
  if (!DAY_ONLY.test(day) || last.day === day) return '';
  // Пересечение пусто или шанс 0 — попытка использована, случайность не тратится, резервирования и показа нет.
  if (!available.length || !(chance > 0)) return '';
  if (!(random() < chance)) return '';
  const was = lastVariant(last.raw, pet);
  const fresh = order === 'fresh' ? available.filter((type) => type !== was) : available;
  const from = fresh.length ? fresh : available;
  return from.length > 1 ? from[Math.min(from.length - 1, Math.floor(random() * from.length))] : from[0];
}

// Уместна ли сейчас (next — { type, until }): не позже срока, напарник и вкладка видны, тишины нет, ничего не играет,
// «Поиграть» и редактор закрыты, питомца не переносят, вариант допустим там, где он виден (available — sceneOptions).
export function sceneFits(next, { now, shown = true, quiet = false, playing = false, play = false, moving = false, available = [] } = {}) {
  return Boolean(next) && now <= next.until && shown && !quiet && !playing && !play && !moving && available.includes(next.type);
}

// Реакция сохранения (next — попытка: { at — время сохранения }) началась в started позже перехода: сценка отменяется.
export const sceneWaited = (next, started) => !next || started > next.at + SCENE_GRACE_MS;

// Решение в защищённом участке: запись дня (показать) или null. stored — запись резервирования как есть (undefined —
// записи нет; не объект, в том числе null, — повреждена: это не свободный день, неявно её не заменяем — сценки нет),
// mirror — копия scene как есть (её мог занять прежний код другой вкладки), day — день занятия, today — день сейчас
// (полночь между ними — без сценки). Запись — та же запись с днём, меткой и вариантом показанного питомца (variantFields:
// кот — поле cat, остальные — variants[petId]): неизвестные поля, варианты других питомцев и больший v остаются.
export function sceneCommit(stored, mirror, { day = '', today = '', by = '', pet = '', type = '', fits = false } = {}) {
  if (stored !== undefined && !isRecord(stored)) return null;
  const raw = stored ?? {};
  const last = normalizeScene(raw);
  const copy = normalizeScene(mirror);
  if (!fits || !by || !DAY_ONLY.test(day) || day !== today || last.day === day || copy.day === day) return null;
  return { ...raw, ...variantFields(raw, copy.raw, pet, type), v: keepVersion(raw.v, SCENE_VERSION), day, by };
}
