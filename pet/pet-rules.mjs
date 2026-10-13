// Питомец (кот или собака): правила веб-оболочки без DOM — реакции и «режиссёр», редкие сценки, реплики, движение.
// Правила ядра (pet/core/**: ступени по знакам, форматы и записи ключей cat, companion, look, treat, имена, облик, лакомство
// дня, местный день) — здесь же реэкспортом для оставшегося веб-кода и проверок: вторая реализация не заводится.
// Хранение по ключам — README модуля, «Хранение».

import { DAY_ONLY } from './core/day.mjs';
import { isRecord, keepRecord, keepVersion, MOTIONS, readRecord } from './core/formats/legacy.mjs';
import { kindOf, profileOf } from './core/pets.mjs';

export * from './core/pets.mjs';
export * from './core/stages.mjs';
export * from './core/day.mjs';
export * from './core/formats/legacy.mjs';

// Движение: системное «уменьшить движение» и выбор «Без анимации» важнее всего.
export function effectiveMotion(settings, reducedMotion) {
  if (reducedMotion) return 'none';
  return MOTIONS.some(([id]) => id === settings?.motion) ? settings.motion : 'normal';
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
