// Ядро: редкие сценки после занятия (docs/ARCHITECTURE.md § 7.1.1, § 9, § 10; срез PL04.2) — штатные сценки кота и собаки
// (варианты и где читаются), копия дня scene:v1, правила выбора, уместности и решения дня. Время и случайность —
// аргументы (порты экземпляра), день показа резервирует порт scenes (веб — pet/web/scenes.mjs, IndexedDB); попытку ведёт
// сессия (session.mjs). Без IndexedDB, localStorage, системного времени и случайности.
//
// После занятия, давшего знак, иногда — сценка: кот потягивается или сворачивается клубком, собака приносит мячик. Шанс
// 25 %, одна попытка на событие, одна показанная за местный день в области хранения; праздник ступени важнее. Показываются
// только сценки, которые объявило отображение (setDisplay({ scenes })): пересечение — до шанса.

import { DAY_ONLY } from './day.mjs';
import { isRecord, keepRecord, keepVersion, readRecord } from './formats/legacy.mjs';
import { kindOf } from './pets.mjs';

export const SCENE_VERSION = 1;
export const SCENE_CHANCE = 0.25;
export const SCENE_FRESH_MS = 10_000; // позже стольких мс от сохранения не начинается
// Реакция сохранения началась позже — ждала ввода, диктовки или таймера: сценки не будет. Запас над снятием тишины
// ввода (250 мс после ухода из отправленного поля), а не ожидание конца занятия.
export const SCENE_GRACE_MS = 500;

// Сценки штатных питомцев: needs — где вариант читается (any — и в портрете, full — только целиком: в портрете видна
// только голова, клубок там не читается). Длительности и статичная поза — REACTIONS (director.mjs). С PL06 — у
// определений питомцев.
export const PET_SCENES = {
  cat: [
    { id: 'stretch', needs: 'any' },
    { id: 'curl', needs: 'full' },
  ],
  dog: [{ id: 'fetch', needs: 'any' }],
};
export const SCENES = Object.fromEntries(Object.entries(PET_SCENES).map(([kind, list]) => [kind, list.map((item) => item.id)]));
export const PORTRAIT_SCENES = Object.values(PET_SCENES)
  .flat()
  .filter((item) => item.needs === 'any')
  .map((item) => item.id);
const SCENE_TEXT = { stretch: 'потягивается', curl: 'сворачивается клубком', fetch: 'приносит мячик' };

// Имя не склоняется: «Марс потягивается.»; без имени — «Потягивается.» (узкое облако, длинное имя).
export const sceneText = (type, name = '') => {
  const text = SCENE_TEXT[type];
  if (!text) return '';
  return name ? `${name} ${text}.` : `${text[0].toUpperCase()}${text.slice(1)}.`;
};

// Что читается там, где питомец виден: целиком — всё, в портрете — только needs: 'any'.
export const sceneTypes = (kind, full) =>
  PET_SCENES[kindOf(kind)].filter((item) => full || item.needs === 'any').map((item) => item.id);

// Допустимые сценки питомца сейчас — пересечение (§ 7.1.1): его сценки, объявленные отображением (declared —
// { petId: [sceneId, …] } или null, «не объявлено»), читаемые в текущем показе. Нет объявления, нет ключа питомца,
// пустой список — ни одной.
export function sceneOptions(kind, declared, full) {
  const own = isRecord(declared) && Array.isArray(declared[kind]) ? declared[kind] : [];
  return KNOWN.has(kind) ? sceneTypes(kind, full).filter((id) => own.includes(id)) : [];
}
const KNOWN = new Set(Object.keys(PET_SCENES));

export function normalizeScene(raw) {
  const own = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    v: SCENE_VERSION,
    day: typeof own.day === 'string' && DAY_ONLY.test(own.day) ? own.day : '',
    by: typeof own.by === 'string' ? own.by.slice(0, 32) : '',
    cat: SCENES.cat.includes(own.cat) ? own.cat : '',
  };
}

export const parseScene = (text) => normalizeScene(readRecord(text).raw);
// Копия дня: свежее сохранённое как есть + изменённые поля ({ day?, by?, cat? }).
export const sceneRecord = (text, patch = {}) => keepRecord(text, SCENE_VERSION, normalizeScene, patch);

// Сценка этого занятия или ''. key — id события (checked — проверенные: одна попытка), outcome — doneOutcome,
// celebrate — stageToCelebrate, record — копия scene, available — допустимые сценки (sceneOptions; пусто — без броска).
// random — порт случайности: сначала шанс, затем вариант, если вариантов больше одного. У кота — не прошлый вариант, если
// доступны оба.
export function pickScene({ key = '', checked = new Set(), outcome = null, celebrate = null, day = '', record = null, kind = 'cat', available = SCENES[kindOf(kind)], random } = {}) {
  if (!key || checked.has(key)) return '';
  checked.add(key);
  if (!outcome?.practice || !outcome.counted || celebrate !== null) return '';
  const last = normalizeScene(record);
  if (!DAY_ONLY.test(day) || last.day === day) return '';
  const list = SCENES[kindOf(kind)].filter((type) => available.includes(type));
  // Пересечение пусто — попытка использована, случайность не тратится, резервирования и показа нет.
  if (!list.length) return '';
  if (!(random() < SCENE_CHANCE)) return '';
  const fresh = list.filter((type) => type !== last.cat);
  const from = fresh.length ? fresh : list;
  return from.length > 1 ? from[Math.min(from.length - 1, Math.floor(random() * from.length))] : from[0];
}

// Уместна ли сейчас (next — { type, until }): не позже срока, напарник и вкладка видны, тишины нет, ничего не играет,
// «Поиграть» и редактор закрыты, питомца не переносят, вариант допустим там, где он виден (available — sceneOptions;
// по умолчанию — читаемые в этом показе).
export function sceneFits(next, { now, shown = true, quiet = false, playing = false, play = false, moving = false, kind = 'cat', full = true, available = sceneTypes(kind, full) } = {}) {
  return Boolean(next) && now <= next.until && shown && !quiet && !playing && !play && !moving && available.includes(next.type);
}

// Реакция сохранения (next — попытка: { at — время сохранения }) началась в started позже перехода: сценка отменяется.
export const sceneWaited = (next, started) => !next || started > next.at + SCENE_GRACE_MS;

// Решение в защищённом участке: запись дня (показать) или null. stored — запись резервирования как есть (undefined —
// записи нет; не объект, в том числе null, — повреждена: это не свободный день, неявно её не заменяем — сценки нет),
// mirror — копия scene (её мог занять прежний код другой вкладки), day — день занятия, today — день сейчас (полночь между
// ними — без сценки). Запись — та же запись с днём и меткой (и вариантом у кота): неизвестные поля и больший v остаются;
// собака прошлый вариант кота не меняет (непонятный этой версии — тоже), пустой — берёт из копии.
export function sceneCommit(stored, mirror, { day = '', today = '', by = '', kind = 'cat', type = '', fits = false } = {}) {
  if (stored !== undefined && !isRecord(stored)) return null;
  const raw = stored ?? {};
  const last = normalizeScene(raw);
  const copy = normalizeScene(mirror);
  if (!fits || !by || !DAY_ONLY.test(day) || day !== today || last.day === day || copy.day === day) return null;
  const cat = kindOf(kind) === 'cat' ? type : raw.cat === undefined || raw.cat === '' ? copy.cat : raw.cat;
  return { ...raw, v: keepVersion(raw.v, SCENE_VERSION), day, by, cat };
}
