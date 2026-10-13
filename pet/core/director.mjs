// Ядро: правила реакций и покоя без DOM и без системного времени (docs/ARCHITECTURE.md § 4.4, § 10, § 13 «Режиссёр»,
// «Покой»): таблица реакций, «режиссёр» — одна текущая реакция и одна отложенная, без очереди, — тишина по независимым
// причинам, поза без реакции, интервалы моргания и одиночных движений, лимит поглаживания, режим движения. Время и
// случайность — аргументы (порты clock и random экземпляра ядра); проигрывание и задачи — session.mjs.

import { MOTIONS } from './formats/legacy.mjs';
import { profileOf } from './pets.mjs';

// Движение: системное «уменьшить движение» и выбор «Без анимации» важнее всего; выбор владельца при этом не меняется.
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
  // Редкие сценки после занятия (с 2026-10-10, pickScene в pet-rules.mjs): самые неважные — любая реакция их сменяет, сами
  // в тишине и поверх другой не начинаются и в очередь не встают. scene — поверх позы покоя, still — сколько длится
  // статичная поза без анимации.
  stretch: { pose: 'stretch', ms: 3600, still: 2400, priority: 8, phrases: '', decorative: true, scene: true },
  curl: { pose: 'curl', ms: 4600, still: 2400, priority: 8, phrases: '', decorative: true, scene: true },
  fetch: { pose: 'fetch', ms: 4200, still: 2400, priority: 8, phrases: '', decorative: true, scene: true },
};

// Отложенная (пока идёт ввод, диктовка или интервью) реакция актуальна столько.
export const PENDING_MS = 60_000;
// Отдых — после стольких минут без действий; действие пользователя пересчитывает отсчёт не чаще ACTIVITY_MS (кроме
// пробуждения).
export const REST_AFTER_MS = 3 * 60_000;
export const ACTIVITY_MS = 500;
// Зевок вместо одиночного движения — с таким шансом (только при обычном движении, вне экрана занятия и жеста).
export const YAWN_CHANCE = 0.18;
// Приветствие дня — через столько после запуска; облако реплики гаснет через PHRASE_MS; движение «заметил гостя» —
// через OPEN_MICRO_MS после открытия уголка; конец реакции — не раньше REACTION_MIN_MS.
export const GREET_MS = 900;
export const PHRASE_MS = 3200;
export const OPEN_MICRO_MS = 600;
export const REACTION_MIN_MS = 50;

// Одиночные движения — раз в 45–90 секунд (спокойное движение — реже); без анимации — нет. random — порт [0, 1).
export function microDelay(motion, random) {
  if (motion === 'none') return null;
  const [min, max] = motion === 'calm' ? [90_000, 180_000] : [45_000, 90_000];
  return Math.round(min + random() * (max - min));
}

export function blinkDelay(motion, random) {
  if (motion === 'none') return null;
  const [min, max] = motion === 'calm' ? [24_000, 48_000] : [12_000, 28_000];
  return Math.round(min + random() * (max - min));
}

export const MICRO_KINDS = ['ear', 'tail', 'look'];
export const MICRO_MS = { blink: 260, ear: 620, tail: 920, look: 1650, tilt: 1350 };
export const microKinds = (kind) => profileOf(kind).micro;

// Поглаживание без фарма: три полных реакции за минуту, затем одна реплика «хватит пока»,
// дальше — только тихий прищур. Очков и знаков поглаживание не даёт.
export function petMood(times, now) {
  const recent = (times ?? []).filter((at) => now - at < 60_000).length;
  if (recent < 3) return 'pet';
  return recent === 3 ? 'enough' : 'quiet';
}

// «Режиссёр»: одна реакция одновременно, одна отложенная (самая важная), без очереди. handled — обработанные события
// (key), quiet — причины тишины, lastAt — последний запуск типа (паузы повторов): всё это — память экземпляра ядра.
export function createDirector() {
  return { current: null, pending: null, quiet: new Set(), handled: new Set(), lastAt: {} };
}

export const playing = (d, now) => Boolean(d.current && d.current.until > now);

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
// тихие; идёт не менее важная реакция — действие пропадает, а не ждёт. Реакция на предмет (toy) сменяет идущую
// реакцию на предмет или декоративную.
export function request(d, type, { now, key = '', context = 'calm', extra = {}, explicit = false } = {}) {
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
export function finish(d, now) {
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
export function setQuiet(d, reason, on, now) {
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
