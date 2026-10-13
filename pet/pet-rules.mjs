// Питомец (кот или собака): правила веб-оболочки без DOM — редкие сценки (выбор, уместность, решение дня и транзакция
// IndexedDB — до PL04.2). Правила ядра (pet/core/**: ступени по знакам, форматы и записи ключей cat, companion, look, treat,
// имена, облик, лакомство дня, местный день; с PL04.1 — реакции и «режиссёр», тишина, покой, движение, реплики) — здесь же
// реэкспортом для оставшегося веб-кода и проверок: вторая реализация не заводится. Хранение по ключам — README модуля,
// «Хранение».

import { DAY_ONLY } from './core/day.mjs';
import { isRecord, keepRecord, keepVersion, readRecord } from './core/formats/legacy.mjs';
import { kindOf } from './core/pets.mjs';

export * from './core/pets.mjs';
export * from './core/stages.mjs';
export * from './core/day.mjs';
export * from './core/formats/legacy.mjs';
export * from './core/director.mjs';
export * from './core/phrases.mjs';

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

export const parseScene = (text) => normalizeScene(readRecord(text).raw);
// Копия дня: свежее сохранённое как есть + изменённые поля ({ day?, by?, cat? }).
export const sceneRecord = (text, patch = {}) => keepRecord(text, SCENE_VERSION, normalizeScene, patch);

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

// Решение в транзакции: запись дня (показать) или null. stored — запись в базе как есть (undefined — записи нет; не
// объект — повреждена: это не свободный день, неявно её не заменяем — сценки нет), mirror — копия scene (её мог занять
// прежний код другой вкладки), day — день занятия, today — день сейчас (полночь между ними — без сценки). Запись — та же
// запись базы с днём и меткой (и вариантом у кота): неизвестные поля и больший v остаются; собака прошлый вариант кота не
// меняет (непонятный этой версии — тоже), пустой — берёт из копии.
export function sceneCommit(stored, mirror, { day = '', today = '', by = '', kind = 'cat', type = '', fits = false } = {}) {
  if (stored !== undefined && !isRecord(stored)) return null;
  const raw = stored ?? {};
  const last = normalizeScene(raw);
  const copy = normalizeScene(mirror);
  if (!fits || !by || !DAY_ONLY.test(day) || day !== today || last.day === day || copy.day === day) return null;
  const cat = kindOf(kind) === 'cat' ? type : raw.cat === undefined || raw.cat === '' ? copy.cat : raw.cat;
  return { ...raw, v: keepVersion(raw.v, SCENE_VERSION), day, by, cat };
}

// Попытка показа — одна транзакция readwrite IndexedDB (idb — indexedDB, name — база): прочитать запись, decide → запись
// или null, с записью — show() (начало показа). decide получает запись как есть: undefined — записи нет. Такие транзакции
// браузер выполняет по очереди для всех вкладок, и следующая видит запись предыдущей: проверка и фиксация исключительны.
// Итог: 'shown' — записано; 'skip' — не показывали, ничего не записано; 'fail' — базы нет или сбой до показа; 'lost' —
// показ начался, запись откатилась.
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
              const record = decide(get.result);
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
