// Ядро: правила реакций и покоя без DOM и без системного времени (docs/ARCHITECTURE.md § 4.4, § 10, § 13 «Режиссёр»,
// «Покой»): «режиссёр» — одна текущая реакция и одна отложенная (самая важная), без очереди, — тишина по независимым
// причинам, поза без реакции, интервалы моргания и одиночных движений, лимит поглаживания, режим движения. Таблица
// реакций — пары «питомец + модель поведения» (PL06, catalog.mjs: длительности, приоритеты, реплики и паузы — модель, позы —
// питомец, сценки — питомец); здесь правила над ней. Время и случайность — аргументы (порты clock и random экземпляра);
// проигрывание и задачи — session.mjs.

import { MOTIONS } from './formats/legacy.mjs';

// Движение: системное «уменьшить движение» и выбор «Без анимации» важнее всего; выбор владельца при этом не меняется.
export function effectiveMotion(settings, reducedMotion) {
  if (reducedMotion) return 'none';
  return MOTIONS.some(([id]) => id === settings?.motion) ? settings.motion : 'normal';
}

// ---------- реакции ----------
// Приоритет: меньше — важнее (1–2 — отключение и тихий режим — работают как запрет, не как реакции; 8 — сценки).
// Строка таблицы: pose — поза питомца (с заменой), ms — длительность, cooldown — пауза до повтора того же типа, calmOnly —
// только в спокойном контексте (не на экранах практики), decorative — не ждёт в очереди, а пропадает, toy — реакция на
// предмет «Поиграть» (сменяет прежнюю на предмет), scene — редкая сценка (still — статичная поза без анимации).

// Отложенная (пока идёт ввод, диктовка или интервью) реакция актуальна столько.
export const PENDING_MS = 60_000;
// Отдых — после стольких минут без действий; действие пользователя пересчитывает отсчёт не чаще ACTIVITY_MS (кроме
// пробуждения).
export const REST_AFTER_MS = 3 * 60_000;
export const ACTIVITY_MS = 500;
// Приветствие дня — через столько после запуска; движение «заметил гостя» — через OPEN_MICRO_MS после открытия уголка;
// конец реакции — не раньше REACTION_MIN_MS. Длительность облака реплики — модель (timings.phrase).
export const GREET_MS = 900;
export const OPEN_MICRO_MS = 600;
export const REACTION_MIN_MS = 50;

// Интервал по режиму движения: [min, max] модели (timings.blink или timings.micro); без анимации — нет. random — порт [0, 1).
function interval(motion, random, ranges) {
  if (motion === 'none') return null;
  const [min, max] = motion === 'calm' ? ranges.calm : ranges.normal;
  return Math.round(min + random() * (max - min));
}
// Одиночные движения — раз в 45–90 секунд (calm: спокойное движение — реже); моргание — 12–28 с.
export const microDelay = (motion, random, timings) => interval(motion, random, timings.micro);
export const blinkDelay = (motion, random, timings) => interval(motion, random, timings.blink);

// Длительности одиночных движений покоя; неизвестное питомцу движение (своё у стороннего) — MICRO_DEFAULT_MS.
export const MICRO_MS = { blink: 260, ear: 620, tail: 920, look: 1650, tilt: 1350 };
export const MICRO_DEFAULT_MS = 600;

// Поглаживание без фарма: limit полных реакций за минуту (модель: ≤ 3), затем одна реплика «хватит пока», дальше — только
// тихий прищур. Очков и знаков поглаживание не даёт.
export function petMood(times, now, limit = 3) {
  const recent = (times ?? []).filter((at) => now - at < 60_000).length;
  if (recent < limit) return 'pet';
  return recent === limit ? 'enough' : 'quiet';
}

// «Режиссёр»: одна реакция одновременно, одна отложенная (самая важная), без очереди. table — таблица реакций показанной
// пары (меняется со сменой питомца или модели, setTable); handled — обработанные события (key), quiet — причины тишины,
// lastAt — последний запуск типа (паузы повторов): всё это — память экземпляра ядра и сменой пары не сбрасывается.
// background — фон (вкладка или приложение не видны, setBackground).
export function createDirector(table = {}) {
  return { table, current: null, pending: null, quiet: new Set(), handled: new Set(), lastAt: {}, background: false };
}

// Другая пара «питомец + модель»: новая таблица. Идущую и отложенную реакцию прежней снимает вызывающий (сессия).
export function setTable(d, table) {
  d.table = table;
}

const row = (d, type) => (type && Object.hasOwn(d.table, type) ? d.table[type] : null);

// Фон: идущая и отложенная реакции сняты; пока фон, ничего не начинается и не откладывается — запрос учитывает key и
// пропадает, снятие тишины и конец реакции ничего не запускают, поэтому возврат ничего не доигрывает. Причины тишины,
// учтённые события и паузы повторов остаются.
export function setBackground(d, on) {
  d.background = on;
  if (on) {
    d.current = null;
    d.pending = null;
  }
}

export const playing = (d, now) => Boolean(d.current && d.current.until > now);

function start(d, type, now, extra = {}) {
  const reaction = row(d, type);
  d.current = { type, pose: reaction.pose, priority: reaction.priority, until: now + reaction.ms, ...extra };
  d.lastAt[type] = now;
  return { action: 'play', reaction: d.current };
}

function hold(d, type, now, extra) {
  const priority = row(d, type).priority;
  if (!d.pending || d.pending.expires <= now || priority < d.pending.priority) {
    d.pending = { type, priority, expires: now + PENDING_MS, ...extra };
  }
  return { action: 'queue' };
}

// type — тип реакции таблицы; нет в таблице (модель не задала, у питомца нет позы или возможности) — не играет. key — id
// события: повторная доставка не играет дважды; context — 'calm' или 'focus' (экран занятия); extra — данные для показа,
// extra.follow — продолжение того же события ({ type, extra }), extra.until — свой срок. explicit — прямое действие в
// сцене «Поиграть»: тишина его не откладывает — отклик идёт в сцене, рисунки на странице тихие; идёт не менее важная
// реакция — действие пропадает, а не ждёт. Реакция на предмет (toy) сменяет идущую реакцию на предмет или декоративную.
export function request(d, type, { now, key = '', context = 'calm', extra = {}, explicit = false } = {}) {
  const reaction = row(d, type);
  if (!reaction) return { action: 'drop' };
  if (key) {
    if (d.handled.has(key)) return { action: 'drop' };
    d.handled.add(key);
  }
  // Фон: событие учтено (как в 0.1.4 — запросом), но не играет и не откладывается.
  if (d.background) return { action: 'drop' };
  if (reaction.cooldown && now - (d.lastAt[type] ?? -Infinity) < reaction.cooldown) return { action: 'drop' };
  if (reaction.decorative) {
    if (d.quiet.size || playing(d, now) || (reaction.calmOnly && context !== 'calm')) return { action: 'drop' };
    return start(d, type, now, extra);
  }
  if (explicit) {
    const shown = row(d, d.current?.type);
    const swap = reaction.toy && (shown?.toy || shown?.decorative);
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
  if (d.background) return { action: 'none' };
  const pending = d.pending && d.pending.expires > now ? d.pending : null;
  const next = row(d, follow?.type);
  if (next && !d.quiet.size && !(pending && pending.priority < next.priority)) {
    return start(d, follow.type, now, follow.extra ?? {});
  }
  return takePending(d, now);
}

function takePending(d, now) {
  const next = d.pending;
  if (!next || d.background || d.quiet.size || playing(d, now)) return { action: 'none' };
  d.pending = null;
  if (next.expires <= now || !row(d, next.type)) return { action: 'none' };
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

// Поза без реакции (смысл словаря формата 1): отдых, внимание (экран практики или тихий режим) или покой; после
// лакомства покой — довольный (content), до конца дня. Рисунок питомца — его поза или замена (catalog.mjs).
export function basePose({ quiet = false, focus = false, resting = false, content = false } = {}) {
  if (resting && !quiet) return 'rest';
  if (quiet || focus) return 'attentive';
  return content ? 'content' : 'calm';
}
