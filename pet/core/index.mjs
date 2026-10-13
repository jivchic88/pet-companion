// Ядро питомца — срезы PL03 и PL04.1 (docs/ARCHITECTURE.md § 4–6, § 8, § 14.1): экземпляр без DOM — своё состояние,
// команды, снимок и подписка, своё подключение к общему координатору хранения. Внутренний вход: публичного
// pet-companion/core до PL05 нет, им пользуется legacy-фасад pet/pet.mjs и проверки. Импортирует только pet/core/**.
//
// Ключи cat, companion, look, treat — целиком здесь: имя, выбор кота или собаки, облик, аксессуар, движение, реплики,
// «скрыт», увиденная ступень, день приветствия, день лакомства. Решения: счёт и ступени, первое включение, подтверждённое
// занятие, кормление, приветствие дня. С PL04.1 ядро само проигрывает реакции (сессия, session.mjs): режиссёр, память
// событий, тишина, покой, полночь, видимость, реплики, приветствие. Присутствие, виды и выбор сценки (PL04.2), комната и
// игра (PL04.3) — пока у отображения; на границе — временные входы sight, react, stopScene, setBusy (§ 14.1.2).

import { describe, fail, PetError } from './errors.mjs';
import { daysBetween, isDay } from './day.mjs';
import { catRecord, companionRecord, isRecord, keepRecord, lookRecord, MOTIONS, normalizeCompanion, normalizeLook, normalizeSettings, normalizeTreat, readRecord, TREAT_VERSION, unknownStage } from './formats/legacy.mjs';
import { coatsOf, companionName, cleanName, KINDS, nameOffered } from './pets.mjs';
import { portProblem, systemClock, systemLog, systemRandom, systemScheduler } from './ports.mjs';
import * as Round from './round.mjs';
import { createSession, QUIET_REASONS } from './session.mjs';
import { ACCESSORIES, doneOutcome, progressInfo, stageGift, STAGES, stageToCelebrate, treatState, unlockedBetween, wornAccessory } from './stages.mjs';

export { PetError } from './errors.mjs';

// Ключи среза и их функции записи (build операции, § 8.3): свежее сохранённое как есть + изменённые поля.
const KEYS = ['cat', 'companion', 'look', 'treat'];
const RECORD = {
  cat: catRecord,
  companion: companionRecord,
  look: lookRecord,
  treat: (stored, patch) => keepRecord(stored, TREAT_VERSION, normalizeTreat, patch),
};

const OPTIONS = ['storage', 'progress', 'clock', 'random', 'scheduler', 'log'];
const VIEWS = [null, 'corner', 'play', 'room'];
// Прямые отклики отображения до PL04.2/PL04.3 (react): игра, предметы, «устроился», редкая сценка. Награды и события
// хоста сюда не входят — только notify и feed.
const DIRECT = ['pet', 'calmPet', 'paw', 'calmPaw', 'sniff', 'watch', 'ball', 'settle', 'stretch', 'curl', 'fetch'];
const DIRECT_EXTRA = ['toward', 'phrases', 'say', 'sayShort'];
// Неявная запись (первое включение, отметка ступени, праздник, приветствие) повреждённое значение не заменяет (§ 8.2).
const KEEP = Symbol('повреждённое значение неявная запись не заменяет');

// Поле правки — путь: 'name', 'dog.name' (собака в companion), 'cat' (облик кота в look). Патч функции записи — вложенный.
function toPatch(fields) {
  const patch = {};
  for (const [path, value] of Object.entries(fields)) {
    const [head, tail] = path.split('.');
    if (tail === undefined) patch[head] = value;
    else patch[head] = { ...patch[head], [tail]: value };
  }
  return patch;
}
function at(raw, path) {
  const [head, tail] = path.split('.');
  const value = raw?.[head];
  return tail === undefined ? value : isRecord(value) ? value[tail] : undefined;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
const count = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const summary = (list) => (list.includes('pending') ? 'pending' : list.every((item) => item === 'saved') ? 'saved' : list.includes('saved') ? 'partial' : 'failed');

// Создание: синхронная проверка настроек → своё подключение к загруженному координатору → чтение подтверждённого. Без
// записи, таймеров, вызова портов и слушателей. Ошибка проверки — PetError до подключения.
export function createPetCore(options) {
  if (!isRecord(options)) throw new PetError('invalid-options', 'Настройки ядра — объект.');
  for (const key of Object.keys(options)) if (!OPTIONS.includes(key)) throw new PetError('invalid-options', `Неизвестная настройка: ${key}.`);
  const { storage } = options;
  if (!storage || typeof storage.connect !== 'function' || typeof storage.load !== 'function') throw new PetError('invalid-options', 'storage — координатор хранения (status, load, connect).');
  if (options.progress !== undefined && typeof options.progress !== 'function') throw new PetError('invalid-options', 'progress — функция.');
  const problem = portProblem(options);
  if (problem) throw new PetError('invalid-options', problem);
  if (storage.status !== 'ready' && storage.status !== 'failed') throw new PetError('storage-not-loaded', 'Хранилище ещё не загружено: сначала storage.load().');
  return core({
    storage,
    progress: options.progress ?? (() => ({ marks: 0, today: 0 })),
    clock: options.clock ?? systemClock,
    random: options.random ?? systemRandom,
    scheduler: options.scheduler ?? systemScheduler,
    log: options.log ?? systemLog,
  });
}

function core({ storage, progress, clock, random, scheduler, log }) {
  const offline = storage.status === 'failed';
  const client = storage.connect();
  const order = client.order ?? Round.nextOrder();
  // Ядро в раунде доставки: порядок подключения, закрытие обновления, доставка слушателям.
  const self = { order, close, deliver };
  // Память ключа (§ 8.4): подтверждённое, свои операции (номер и поля), несохранённые поля.
  const keys = Object.fromEntries(KEYS.map((key) => [key, { confirmed: client.read(key), ops: [], unsaved: {}, n: 0 }]));
  let status = 'created';
  let host = null; // последнее чтение счёта хоста и дня: { marks, today, limit, day }
  let effects = [];
  let reason = null;
  let warnings = []; // предупреждения фиксации — в журнал после неё
  let gone = false; // обновление 'destroyed' закрыто
  let dying = false;
  const listeners = [];
  // Повреждённые значения при загрузке — эффект warning с первым закрытым обновлением (при создании слушателей нет).
  let notes = KEYS.filter((key) => readRecord(keys[key].confirmed).state === 'corrupt').map((key) => ({ type: 'warning', code: 'corrupt', key, message: `значение ${key} повреждено — показано по умолчанию; неявные записи его не заменяют` }));

  const warnQuiet = (message, error) => {
    try {
      log.warn(message, error);
    } catch {
      // журнал сам отказал — ничего не делаем
    }
  };

  // ---------- память ключей и показ ----------

  function memoryText(key) {
    const own = keys[key];
    let stored = own.confirmed;
    for (const fields of [own.unsaved, ...own.ops.map((op) => op.fields)]) if (Object.keys(fields).length) stored = JSON.stringify(RECORD[key](stored, toPatch(fields)));
    return stored;
  }

  // Память → показ: подтверждённое, поверх несохранённые поля, поверх патчи неразрешённых операций — той же функцией
  // записи, что в build (память совпадает с тем, что будет записано).
  function memory() {
    const raw = Object.fromEntries(KEYS.map((key) => [key, readRecord(memoryText(key)).raw]));
    return { raw, cat: normalizeSettings(raw.cat), companion: normalizeCompanion(raw.companion), look: normalizeLook(raw.look), treat: normalizeTreat(raw.treat), unknown: unknownStage(raw.cat) };
  }

  // Увиденная ступень для решений: непонятная этой версии — как увиденная выше всех (ничего не отмечается и не празднуется).
  const seenOf = (m) => (m.unknown ? STAGES.length : m.cat.seenStage);
  const nameOf = (value, kind) => ({ value, chosen: !nameOffered(value), display: companionName({ kind, name: value }) });

  // Что нужно сессии (реакции и время): показанный питомец, его имя и облик, «скрыт», движение и реплики владельца, ступень
  // по счёту хоста (банк реплик), довольный покой после лакомства до конца дня.
  function sense(m = memory()) {
    const kind = m.companion.kind;
    return {
      kind,
      name: companionName({ kind, name: kind === 'dog' ? m.companion.dog.name : m.cat.name }),
      hidden: m.cat.hidden,
      motion: m.cat.motion,
      phrases: m.cat.phrases,
      stage: progressInfo(host ? host.marks : 0, m.cat.seenStage).stage,
      content: host !== null && treatState(host.day, m.treat.fedDay, host.today) === 'fed',
    };
  }

  // Сессия (session.mjs): режиссёр, задачи, покой, реплики. Создание не вызывает портов; задача — своим раундом (task).
  const session = createSession({
    clock,
    random,
    scheduler,
    sense: () => sense(),
    emit: (effect) => effects.push(effect),
    warn: (message, error) => warnings.push([message, error]),
    run: (name, body) => task(name, body),
    refresh: () => hostRefresh(working ?? { applied: false, save: null }),
  });

  function saveOf(key) {
    const own = keys[key];
    const pending = [...new Set(own.ops.flatMap((op) => Object.keys(op.fields)))];
    const unsaved = Object.keys(own.unsaved);
    return { status: offline ? 'unavailable' : pending.length ? 'pending' : unsaved.length ? 'failed' : 'saved', pending, unsaved, corrupt: readRecord(own.confirmed).state === 'corrupt' };
  }

  // Снимок полей среза (§ 5.2): простые данные. Счёт и лакомство — после первого чтения хоста (start, refresh, notify,
  // feed), до него — null. PL04.1: поза и реакция, облако и реплика вида, контекст и тишина, видимость, режим движения.
  function build() {
    const m = memory();
    const life = session.state(sense(m));
    const kind = m.companion.kind;
    const stored = m.raw.companion?.kind;
    const info = progressInfo(host ? host.marks : 0, m.cat.seenStage);
    const seen = seenOf(m);
    const pets = Object.fromEntries(
      KINDS.map((id) => {
        const own = id === 'dog' ? m.companion.dog : m.cat;
        return [id, { name: nameOf(own.name, id), coat: m.look[id], accessory: own.accessory, worn: wornAccessory(own, info.stage) }];
      }),
    );
    const unseen = host !== null && info.stage > seen;
    const opened = unseen ? unlockedBetween(seen, info.stage, kind) : { items: [], accessories: [] };
    return {
      v: 1,
      status,
      storage: offline ? 'failed' : 'ready',
      pet: { id: typeof stored === 'string' && stored ? stored : kind, shown: kind, available: !(typeof stored === 'string' && stored) || KINDS.includes(stored) },
      name: pets[kind].name,
      look: { coat: pets[kind].coat, accessory: pets[kind].accessory, worn: pets[kind].worn },
      pets,
      prefs: { motion: m.cat.motion, phrases: m.cat.phrases, reducedMotion: life.reducedMotion, effectiveMotion: life.effectiveMotion },
      presence: { hidden: m.cat.hidden },
      visible: life.visible,
      context: life.context,
      pose: life.pose,
      phrase: life.phrase,
      scenePhrase: life.scenePhrase,
      progress:
        host === null
          ? null
          : {
              marks: host.marks,
              today: host.today,
              limit: host.limit,
              stage: info.stage,
              computed: info.computed,
              next: info.next ? { at: info.next.at, title: info.next.title } : null,
              toNext: info.toNext,
              seenStage: m.cat.seenStage,
              seenKnown: !m.unknown,
              unseen,
              fresh: opened.items,
              freshAccessories: opened.accessories,
              accessories: ACCESSORIES.filter((item) => item.stage <= info.stage).map((item) => item.id),
            },
      treat: host === null ? null : treatState(host.day, m.treat.fedDay, host.today),
      save: Object.fromEntries(KEYS.map((key) => [key, saveOf(key)])),
    };
  }

  let closed = freeze(build());

  // ---------- хранение: операции, результат, внешние изменения ----------

  // Несохранённые поля, которые запись всё равно не изменит (совпали с подтверждённым; ступень, которую запись не заменит),
  // забываются.
  function tidy(key) {
    const own = keys[key];
    const base = JSON.stringify(RECORD[key](own.confirmed, {}));
    for (const [path, value] of Object.entries(own.unsaved)) if (JSON.stringify(RECORD[key](own.confirmed, toPatch({ [path]: value }))) === base) delete own.unsaved[path];
  }

  // Причина обновления: команда важнее позднего результата, поздний результат — изменения хранилища.
  const RANK = { storage: 1, save: 2 };
  function mark(why) {
    const rank = (item) => RANK[item] ?? 3;
    if (!reason || rank(why) > rank(reason)) reason = why;
    Round.touch(self);
  }

  // Самодостаточная правка (§ 8.3): патч захвачен при постановке; build не читает живой экземпляр и после destroy тот же.
  function buildFor(key, fields, implicit, op) {
    const patch = toPatch(fields);
    const record = RECORD[key];
    return (stored) => {
      if (implicit && readRecord(stored).state === 'corrupt') throw KEEP;
      try {
        return JSON.stringify(record(stored, patch));
      } catch (error) {
        op.fault = error;
        throw error;
      }
    };
  }

  // Результат операции — один раз, внутри фиксации (§ 8.4). После destroy — только done.
  function settle(key, op, ok) {
    if (op.result !== 'pending') return;
    op.result = ok ? 'saved' : 'failed';
    op.resolve(op.result);
    if (status === 'destroyed') return;
    const own = keys[key];
    own.ops = own.ops.filter((item) => item !== op);
    if (!ok) {
      // Поля, не перекрытые более поздними неразрешёнными операциями, — несохранённые: действуют в памяти, уходят со
      // следующей правкой ключа; правка не откатывается, скрытых повторов нет.
      const later = new Set(own.ops.flatMap((item) => Object.keys(item.fields)));
      for (const [path, value] of Object.entries(op.fields)) if (!later.has(path)) own.unsaved[path] = value;
      if (op.fault) warnings.push([`запись ${key} не собрана`, op.fault]);
    }
    own.confirmed = client.read(key);
    tidy(key);
    effects.push({ type: 'save', key, op: op.n, result: op.result });
    op.onSettle?.(ok, op.late);
    mark('save');
  }

  // Чужое подтверждённое изменение (§ 8.6): забыть вытесненные им несохранённые поля; патчи своих неразрешённых операций не
  // трогаются (они лягут поверх). Ничего не пишет и слушателей не вызывает.
  function absorb(key, old, now) {
    const list = key === null ? KEYS : KEYS.includes(key) ? [key] : [];
    if (!list.length) return;
    try {
      for (const name of list) {
        const own = keys[name];
        const next = key === null ? client.read(name) : now;
        const was = readRecord(key === null ? own.confirmed : old).raw ?? {};
        const raw = readRecord(next).raw ?? {};
        for (const path of Object.keys(own.unsaved)) if (!same(at(was, path), at(raw, path))) delete own.unsaved[path];
        own.confirmed = next;
        tidy(name);
      }
      mark('storage');
    } catch (error) {
      warnings.push(['изменение хранилища не поглощено', error]);
    }
  }
  client.watch(absorb);

  // Шаг 5 (§ 5.5): операции ключей ставятся сразу все; несохранённые поля ключа уходят в новую операцию. Исключение
  // постановки — отказ этого ключа, остальные ключи ставятся.
  function queue(writes) {
    const entries = [];
    const refused = [];
    // Правки одного ключа в команде — одна операция (первое включение и приветствие — одна запись cat); неявная — только
    // если неявны все её правки.
    const merged = new Map();
    for (const { key, fields, implicit = false, onSettle = null } of writes) {
      const was = merged.get(key);
      merged.set(key, was ? { key, fields: { ...was.fields, ...fields }, implicit: was.implicit && implicit, onSettle: was.onSettle ?? onSettle } : { key, fields, implicit, onSettle });
    }
    for (const { key, fields, implicit, onSettle } of merged.values()) {
      const own = keys[key];
      const op = { n: ++own.n, fields: { ...own.unsaved, ...fields }, result: 'pending', onSettle, late: false, fault: null, resolve: null };
      op.done = new Promise((resolve) => (op.resolve = resolve));
      own.unsaved = {};
      own.ops.push(op);
      entries.push({ key, op });
      try {
        client.write(key, buildFor(key, op.fields, implicit, op), (ok) => settle(key, op, ok));
      } catch (error) {
        settle(key, op, false);
        refused.push([key, error]);
      }
    }
    for (const entry of entries) if (entry.op.result === 'pending') entry.op.late = true;
    return { save: report(entries), refused };
  }

  function report(entries) {
    const results = Object.fromEntries(entries.map(({ key, op }) => [key, op.result]));
    const list = Object.values(results);
    const save = { status: list.length ? summary(list) : 'none', keys: entries.map(({ key }) => key), results };
    if (save.status === 'pending') save.done = Promise.all(entries.map(({ op }) => op.done)).then(summary);
    return save;
  }

  // ---------- закрытие и доставка (§ 5.4) ----------

  function flushWarnings() {
    const list = warnings;
    warnings = [];
    for (const [message, error] of list) warnQuiet(message, error);
  }

  // Конец фазы работы: следствия изменений настроек (своей команды или поглощённого изменения другой вкладки) — до
  // снимка: другой питомец или «скрыт», движение, реплики (§ 8.6). Затем журнал и одно обновление.
  function close() {
    if (gone) return;
    if (status !== 'destroyed') {
      try {
        session.reconcile(sense());
      } catch (error) {
        warnings.push(['следствия изменения настроек не применены', error]);
      }
    }
    flushWarnings();
    if (status === 'destroyed') {
      gone = true;
      closed = freeze({ ...build(), status: 'destroyed' });
      effects = [];
      Round.drop(self);
      Round.push({ core: self, update: freeze({ snapshot: closed, effects: [], reason: 'destroyed' }) });
      return;
    }
    let next;
    try {
      next = build();
    } catch (error) {
      warnQuiet('снимок не построен', error);
      return;
    }
    const changed = !same(next, closed);
    if (!changed && !effects.length) {
      reason = null;
      return;
    }
    if (changed) closed = freeze(next);
    const list = [...notes, ...effects];
    notes = [];
    effects = [];
    Round.push({ core: self, update: freeze({ snapshot: closed, effects: list, reason: reason ?? 'update' }) });
    reason = null;
  }

  function call(record, update) {
    try {
      record.fn(update);
    } catch (error) {
      warnQuiet('исключение подписчика — доставка продолжается', error);
    }
  }

  function deliver({ update, seq }) {
    for (const record of [...listeners]) {
      if (!record.active || seq <= record.since) continue;
      // Ядро отключили во время доставки (слушателем): остальным его слушателям — только 'destroyed'.
      if (status === 'destroyed' && update.reason !== 'destroyed') break;
      call(record, update);
    }
    if (update.reason === 'destroyed') {
      for (const record of listeners) record.active = false;
      listeners.length = 0;
    }
  }

  // ---------- команды ----------

  // Порядок обработки (§ 5.5): отключён → destroyed; фаза работы другого вызова (порт, progress) → reentrant без изменений и
  // без журнала; сверка ключей среза своей фазой; проверки и бизнес-правила — без изменений; затем применение одним
  // присваиванием и операции записи. Внутренний сбой до применения — internal; после — ok с degraded и честным save.
  // Сверка (шаг 1а): решение — по подтверждённому, а не по кэшу. Изменение помимо координатора (другая вкладка, чьё
  // событие storage ещё не пришло; восстановление на этой странице) поглощается до решения — всеми подключениями, как
  // событие storage, и приходит своим обновлением 'storage', а не изменением команды; ok: false команды по-прежнему
  // значит: сама она ничего не изменила и не поставила. Фазы — одного раунда: доставка после команды.
  // Граница фаз (повторная проверка): destroy() из порта хранения в сверке выполнен в конце её фазы — после неё снова
  // шаг 1, команда не выполняется; исключение сверки — сбой до применения (internal в фазе команды), поглощённое до него
  // остаётся и доставляется.
  // Входы отображения PL04.1 (контекст, активность, вид, занятость, прямой отклик, сценка, «уменьшить движение») решают по
  // памяти сессии и не пишут: сверка им не нужна (sync: false) — те же проверки, раунд и обработка сбоя без фазы сверки.
  function act(name, body, { sync = true } = {}) {
    if (status === 'destroyed') return fail('destroyed', 'Питомец отключён.');
    if (Round.working()) return fail('reentrant', 'Команда вызвана во время обработки другого вызова (из порта или progress()).');
    return Round.hold(() => {
      let fault = null;
      try {
        if (sync) client.sync(KEYS);
      } catch (error) {
        fault = { error };
      }
      if (status === 'destroyed') return fail('destroyed', 'Питомец отключён.');
      return Round.run(order, () => {
        const step = { applied: false, save: null };
        const outer = working;
        working = step;
        mark(name);
        try {
          if (fault) throw fault.error;
          return body(step);
        } catch (error) {
          if (!step.applied) {
            warnQuiet(`сбой команды ${name}`, error);
            return fail('internal', `Внутренний сбой: ${describe(error)}`);
          }
          effects.push({ type: 'warning', code: 'internal', message: `сбой после применения: ${describe(error)}` });
          warnQuiet(`сбой команды ${name} после применения`, error);
          return { ok: true, changed: true, save: step.save ?? report([]), degraded: true };
        } finally {
          working = outer;
        }
      });
    });
  }

  // Шаг текущей фазы команды или задачи: пересчёт счёта, вызванный сессией (полночь, возврат видимости), применяется в нём.
  let working = null;

  // Задача планировщика сработала — вход извне, свой раунд (§ 5.4), как команда, но без результата для хоста. Решает по
  // памяти (изменение другой вкладки ядро поглощает своим событием); полночь пересчитывает счёт, день и лакомство, её
  // неявная запись (первое включение) — свежим build, как всегда. Сбой тела — после применения: эффект warning и журнал.
  function task(name, body) {
    act(
      name,
      (step) => {
        step.applied = true;
        body();
        return unchanged();
      },
      { sync: false },
    );
  }

  // Счёт хоста и местный день заново, первое включение молча (refresh, полночь, возврат видимости).
  function hostRefresh(step) {
    const next = readHost();
    apply(step, { next, writes: firstSwitch(next) });
  }

  // Шаг 4 — счёт хоста и день, статус, затем шаг 5 — операции; предупреждения о непоставленных записях — после постановки
  // всех ключей.
  function apply(step, { next = host, writes = [], running = false }) {
    host = next;
    if (running) status = 'running';
    step.applied = true;
    const { save, refused } = queue(writes);
    step.save = save;
    for (const [key, error] of refused) log.warn(`запись ${key} не поставлена`, error);
    return save;
  }

  const unchanged = () => ({ ok: true, changed: false, save: report([]) });

  // Счёт хоста и местный день — заново (§ 4.4). progress() быстрый, без побочных действий, команд не вызывает.
  function readHost() {
    const p = progress();
    const own = isRecord(p) ? p : {};
    const day = clock.day(clock.now());
    if (!isDay(day)) throw new Error(`clock.day вернул не местную дату ГГГГ-ММ-ДД: ${String(day)}`);
    return { marks: count(own.marks ?? 0), today: count(own.today ?? 0), limit: own.limit === undefined || own.limit === null ? null : count(own.limit), day };
  }

  // Первое включение: история учитывается молча — текущая ступень отмечается увиденной, без праздника. Непонятная этой
  // версии ступень — не «ещё не отмечали».
  function firstSwitch(next) {
    const m = memory();
    if (m.unknown || m.cat.seenStage >= 0) return [];
    return [{ key: 'cat', fields: { seenStage: progressInfo(next.marks, m.cat.seenStage).stage }, implicit: true }];
  }

  // Питомец на виду и открытый вид для решения: переданный командой (PL03) или последний setSight (PL04.1). Временный вход
  // до присутствия и видов в ядре (PL04.2).
  function sightOf(sight) {
    if (sight === undefined) return session.sight();
    if (!isRecord(sight)) return null;
    const { around = true, view = null } = sight;
    return typeof around === 'boolean' && VIEWS.includes(view) ? { around, view } : null;
  }
  const badSight = () => fail('invalid-argument', 'sight — { around: boolean, view: null | corner | play | room }.');

  // start: один раз — первое включение и приветствие дня (решение и запись), затем сессия: покой и полночь (задачи
  // scheduler), приветствие — через 0,9 с. sight.around — питомец на виду (не «по зову»).
  const start = (sight) =>
    act('start', (step) => {
      if (status !== 'created') return fail('already-started', 'Ядро уже запущено.');
      const where = sightOf(sight);
      if (!where) return badSight();
      const next = readHost();
      const writes = firstSwitch(next);
      const m = memory();
      let greet = null;
      if (!m.cat.hidden && where.around && m.cat.greetDay !== next.day) {
        greet = { day: next.day, welcome: daysBetween(m.cat.greetDay, next.day) >= 2 };
        writes.push({ key: 'cat', fields: { greetDay: next.day }, implicit: true });
      }
      apply(step, { next, writes, running: true });
      session.start(greet, sense());
      return { ok: true, changed: true, save: step.save, greet };
    });

  // refresh: перечитать счёт хоста и день; первое включение молча.
  const refresh = () =>
    act('refresh', (step) => {
      const was = build();
      hostRefresh(step);
      return { ok: true, changed: !same(was, build()), save: step.save };
    });

  // Подтверждённое занятие: счёт хоста уже включает знак. Спрятан, не на виду, до start или detail === null — только числа.
  // Иначе решение: радость или поддержка, праздник новой ступени (не в «Поиграть» и редакторе) с отметкой увиденной,
  // продолжение с новой вещью, подсказка про миску. Увиденная ступень — сверенная (act): уже увиденная или непонятная до
  // команды — без праздника. Реакцию играет сессия: повтор key в экземпляре — без реакции (duplicate). Сценку выбирает
  // отображение (PL04.2) по scene; реакции занятия — ключ события (event) для сигналов конвейеру сценки.
  const notify = (type, detail, sight) =>
    act('notify', (step) => {
      const where = sightOf(sight);
      if (type !== 'saved' && type !== 'failed') return fail('invalid-argument', 'Событие — saved или failed.');
      if (!where) return badSight();
      if (type === 'failed') {
        // Нейтральное ожидание без награды; спрятан или не на виду — ничего.
        const reacted = status === 'running' && !memory().cat.hidden && where.around;
        if (reacted) {
          const was = build();
          step.applied = true;
          session.react('wait');
          return { ok: true, changed: !same(was, build()), save: report([]), reacted, reaction: { type: 'wait' } };
        }
        return { ok: true, changed: false, save: report([]), reacted, reaction: null };
      }
      const flags = ['counted', 'hard', 'first'];
      if (detail !== null && !(isRecord(detail) && typeof detail.key === 'string' && flags.every((flag) => detail[flag] === undefined || typeof detail[flag] === 'boolean'))) {
        return fail('invalid-argument', 'detail — { key: строка, counted?, hard?, first?: boolean } или null.');
      }
      const was = build();
      const next = readHost();
      const writes = firstSwitch(next);
      const m = memory();
      const quiet = { ok: true, reacted: false, duplicate: false, celebrate: null, reaction: null, scene: null };
      if (detail === null || status !== 'running' || m.cat.hidden || !where.around) {
        apply(step, { next, writes });
        return { ...quiet, changed: !same(was, build()), save: step.save };
      }
      const kind = m.companion.kind;
      const name = companionName({ kind, name: kind === 'dog' ? m.companion.dog.name : m.cat.name });
      const seen = writes.length ? writes[0].fields.seenStage : seenOf(m);
      const outcome = doneOutcome(detail, next.marks);
      const stage = stageToCelebrate(outcome, seen);
      const celebrate = where.view === 'play' || where.view === 'room' ? null : stage;
      const told = [];
      let follow = null;
      if (celebrate !== null) {
        const { items, accessories } = unlockedBetween(Math.max(outcome.stageBefore, seen), celebrate, kind);
        writes.push({ key: 'cat', fields: { seenStage: celebrate }, implicit: true });
        const tryOn = accessories.includes('plaid') && !items.length ? 'plaid' : '';
        // Рядом с напарником — его вещь ступени (у собаки на «Нашем ритуале» — мячик).
        const mini = (items.includes('ball') ? 'ball' : '') || (items.find((item) => item !== 'cushion' && item !== 'bed') ?? (items.includes('bed') ? 'bed' : ''));
        follow = { type: 'unlock', extra: { tryOn, mini, phrases: tryOn ? 'plaid' : 'unlock' } };
        told.push({ type: 'celebrate', stage: celebrate, items, accessories }, { type: 'announce', text: `${name}: открыта ступень «${STAGES[celebrate].title}» — ${stageGift(celebrate, kind, name).toLowerCase()}.` });
      }
      // Первое занятие дня открыло лакомство — радость подсказывает про миску.
      const hint = !outcome.hard && treatState(next.day, m.treat.fedDay, next.today) === 'ready' && detail.first === true;
      const reaction = { type: outcome.hard ? 'support' : 'joy', key: `entry:${detail.key}`, extra: { ...(hint ? { phrases: 'joyTreat' } : {}), ...(follow ? { follow } : {}) } };
      apply(step, { next, writes });
      effects.push(...told);
      const { duplicate } = session.react(reaction.type, { key: reaction.key, extra: { ...reaction.extra, event: detail.key } });
      return { ok: true, changed: !same(was, build()), save: step.save, reacted: true, duplicate, celebrate, reaction, scene: { outcome, stage } };
    });

  // Кормление: день заново, отметка дня — сверенная (act): уже угостили до команды — treat-fed без записи и реакции. Отметка
  // дня в памяти и операция записи — до реакции (второго лакомства в экземпляре нет). Объявление — по известному итогу
  // записи; асинхронно — без слов о сохранности, поздний отказ — отдельным объявлением. Реакцию «ест» → «доволен» играет
  // сессия (после start).
  const feed = (sight) =>
    act('feed', (step) => {
      const where = sightOf(sight);
      if (!where) return badSight();
      const next = readHost();
      const m = memory();
      if (m.cat.hidden) return fail('hidden', 'Питомец спрятан.');
      if (!where.around) return fail('away', 'Питомец не на виду (приходит по зову).');
      const state = treatState(next.day, m.treat.fedDay, next.today);
      if (state === 'waiting') return fail('treat-waiting', 'Сегодня ещё не было занятия.');
      if (state === 'fed') return fail('treat-fed', 'Сегодня уже угостили.');
      const kind = m.companion.kind;
      const name = companionName({ kind, name: kind === 'dog' ? m.companion.dog.name : m.cat.name });
      const late = (ok, after) => {
        if (after && !ok) effects.push({ type: 'announce', text: `${name}: отметка лакомства не сохранилась в этом браузере.` });
      };
      const writes = [...firstSwitch(next), { key: 'treat', fields: { fedDay: next.day }, onSettle: late }];
      const save = apply(step, { next, writes });
      effects.push({ type: 'announce', text: `${name} получает лакомство. Сегодня уже угостили${save.results.treat === 'failed' ? ', но отметка не сохранилась в этом браузере' : ''}.` });
      const reaction = status === 'running' ? { type: 'feed', key: `feed:${next.day}`, extra: { mini: 'bowl', follow: { type: 'fed', extra: { mini: 'bowl-empty' } } } } : null;
      if (reaction) session.fed(reaction);
      return { ok: true, changed: true, save, reaction };
    });

  // Уголок виден (веб: открыт не по зову, вернулись из «Поиграть» или редактора) — новая ступень отмечается увиденной.
  // Когда уголок виден, решает веб до PL04.2; правило отметки — здесь.
  const markSeen = () =>
    act('markSeen', (step) => {
      const m = memory();
      if (m.unknown || host === null) return unchanged();
      const stage = progressInfo(host.marks, m.cat.seenStage).stage;
      if (stage <= m.cat.seenStage) return unchanged();
      apply(step, { writes: [{ key: 'cat', fields: { seenStage: stage }, implicit: true }] });
      return { ok: true, changed: true, save: step.save };
    });

  // ---------- настройки ----------

  const ownerOf = (m) => (m.companion.kind === 'dog' ? { key: 'companion', prefix: 'dog.', settings: m.companion.dog } : { key: 'cat', prefix: '', settings: m.cat });

  // Имя. options.pick — выбор готового имени (кнопка подборки, предложение, «Оставить …»): отклик named (пауза повтора 4 с),
  // и когда имя не изменилось. Свободный ввод своего имени (без pick) — тихо, как 0.1.4. Временный внутренний вход до PL05.
  const setName = (value, options) =>
    act('setName', (step) => {
      if (typeof value !== 'string') return fail('invalid-argument', 'Имя — строка.');
      if (options !== undefined && !(isRecord(options) && (options.pick === undefined || typeof options.pick === 'boolean'))) return fail('invalid-argument', 'Настройки имени — { pick?: boolean }.');
      const name = cleanName(value);
      const target = ownerOf(memory());
      const changed = target.settings.name !== name;
      if (changed) apply(step, { writes: [{ key: target.key, fields: { [`${target.prefix}name`]: name } }] });
      let reacted = false;
      if (options?.pick === true) {
        step.applied = true;
        reacted = session.react('named').played;
      }
      return changed ? { ok: true, changed: true, save: step.save, reacted } : { ...unchanged(), reacted };
    });

  // Другой питомец: прежний ничего не доигрывает (реакции, отложенная, облако, задачи — сессия), память событий, тишина и
  // паузы повторов остаются; не спрятан — приветствие meet (пауза повтора 6 с).
  const setPet = (id) =>
    act('setPet', (step) => {
      if (typeof id !== 'string') return fail('invalid-argument', 'Питомец — строка ID.');
      if (!KINDS.includes(id)) return fail('unknown-id', `Питомца «${id}» нет.`);
      if (memory().companion.kind === id) return unchanged();
      apply(step, { writes: [{ key: 'companion', fields: { kind: id } }] });
      session.reconcile(sense());
      const reacted = !memory().cat.hidden && session.react('meet').played;
      return { ok: true, changed: true, save: step.save, reacted };
    });

  // Облик и аксессуар — два независимых ключа: ставятся сразу оба, итог по ключам (возможен partial).
  const setAppearance = (look) =>
    act('setAppearance', (step) => {
      if (!isRecord(look) || (look.coat === undefined && look.accessory === undefined)) return fail('invalid-argument', 'Облик — { coat?, accessory? }.');
      if ((look.coat !== undefined && typeof look.coat !== 'string') || (look.accessory !== undefined && typeof look.accessory !== 'string')) return fail('invalid-argument', 'coat и accessory — строки.');
      const m = memory();
      const kind = m.companion.kind;
      const target = ownerOf(m);
      const writes = [];
      if (look.coat !== undefined) {
        if (!coatsOf(kind).some((item) => item.id === look.coat)) return fail('unknown-id', `Облика «${look.coat}» нет.`);
        if (m.look[kind] !== look.coat) writes.push({ key: 'look', fields: { [kind]: look.coat } });
      }
      if (look.accessory !== undefined) {
        const item = ACCESSORIES.find((accessory) => accessory.id === look.accessory);
        if (!item) return fail('unknown-id', `Аксессуара «${look.accessory}» нет.`);
        if (item.stage > progressInfo(host ? host.marks : 0, m.cat.seenStage).stage) return fail('locked', `Аксессуар «${item.title}» ещё не открыт.`);
        if (target.settings.accessory !== look.accessory) writes.push({ key: target.key, fields: { [`${target.prefix}accessory`]: look.accessory } });
      }
      if (!writes.length) return unchanged();
      apply(step, { writes });
      return { ok: true, changed: true, save: step.save };
    });

  const setPreferences = (prefs) =>
    act('setPreferences', (step) => {
      if (!isRecord(prefs) || (prefs.motion === undefined && prefs.phrases === undefined)) return fail('invalid-argument', 'Настройки — { motion?, phrases? }.');
      if (prefs.motion !== undefined && !MOTIONS.some(([id]) => id === prefs.motion)) return fail('invalid-argument', 'motion — normal, calm или none.');
      if (prefs.phrases !== undefined && typeof prefs.phrases !== 'boolean') return fail('invalid-argument', 'phrases — boolean.');
      const m = memory();
      const fields = {};
      if (prefs.motion !== undefined && prefs.motion !== m.cat.motion) fields.motion = prefs.motion;
      if (prefs.phrases !== undefined && prefs.phrases !== m.cat.phrases) fields.phrases = prefs.phrases;
      if (!Object.keys(fields).length) return unchanged();
      apply(step, { writes: [{ key: 'cat', fields }] });
      // Новое движение — сценка отменена, интервалы покоя заново; реплики выключены — облако и реплика вида исчезают.
      session.reconcile(sense());
      return { ok: true, changed: true, save: step.save };
    });

  // «Скрыть» и «Показать» — запись hidden и сессия: спрятан — реакции, облако, сценка и все задачи сняты; память событий,
  // причины тишины и паузы повторов — нет (исправление Р1). Показан — покой и полночь заново, без приветствия. Вид,
  // фокус и объявление — у отображения; полная оркестровка с присутствием — PL04.2.
  const hidden = (value) =>
    act(value ? 'hide' : 'show', (step) => {
      if (memory().cat.hidden === value) return unchanged();
      apply(step, { writes: [{ key: 'cat', fields: { hidden: value } }] });
      session.hidden(value, sense());
      return { ok: true, changed: true, save: step.save };
    });

  // ---------- входы отображения и жизненного цикла (§ 6.4; внутренние до PL05) ----------

  const bool = (value) => typeof value === 'boolean';
  const CONTEXT = ['focus', ...QUIET_REASONS];

  // Контекст страницы: focus — экран занятия; timer, dictation, dialog, typing — независимые причины тишины. Переданный
  // флаг меняется, непереданный сохраняется.
  const setContext = (flags) =>
    act(
      'setContext',
      (step) => {
        if (!isRecord(flags) || Object.entries(flags).some(([key, value]) => !CONTEXT.includes(key) || !bool(value))) return fail('invalid-argument', 'Контекст — { focus?, timer?, dictation?, dialog?, typing?: boolean }.');
        const was = build();
        step.applied = true;
        session.context(flags);
        return { ok: true, changed: !same(was, build()), save: report([]) };
      },
      { sync: false },
    );

  // Видимость приложения (веб — visibilitychange): фон снимает реакцию, облако, сценку и задачи; возврат — дремота после
  // 3 мин без действий, счёт, день и лакомство заново (со сверкой хранения), задачи заново; приветствия нет.
  const setVisible = (value) =>
    act('setVisible', (step) => {
      if (!bool(value)) return fail('invalid-argument', 'visible — boolean.');
      const was = build();
      step.applied = true;
      session.visibility(value, sense());
      return { ok: true, changed: !same(was, build()), save: step.save ?? report([]) };
    });

  // Системное «уменьшить движение»: effectiveMotion — none; выбор владельца не меняется.
  const setReducedMotion = (value) =>
    act(
      'setReducedMotion',
      (step) => {
        if (!bool(value)) return fail('invalid-argument', 'reducedMotion — boolean.');
        step.applied = true;
        return { ok: true, changed: session.setReduced(value, sense()), save: report([]) };
      },
      { sync: false },
    );

  // Действие пользователя: пробуждение, отсчёт покоя заново (не чаще раза в 500 мс, кроме пробуждения).
  const activity = () =>
    act(
      'activity',
      (step) => {
        step.applied = true;
        return { ok: true, changed: session.activity(sense()), save: report([]) };
      },
      { sync: false },
    );

  // Временные входы до PL04.2/PL04.3 (§ 14.1.2): питомец на виду и открытый вид (source открытия), занятость жестом,
  // прямой отклик отображения, остановка сценки.
  const setSight = (value) =>
    act(
      'setSight',
      (step) => {
        if (!isRecord(value) || !bool(value.around) || !VIEWS.includes(value.view ?? null) || ![undefined, 'pet', 'call'].includes(value.source)) return fail('invalid-argument', 'sight — { around: boolean, view: null | corner | play | room, source?: pet | call }.');
        const was = build();
        step.applied = true;
        session.see({ around: value.around, view: value.view ?? null }, value.source ?? 'pet', sense());
        return { ok: true, changed: !same(was, build()), save: report([]) };
      },
      { sync: false },
    );

  const setBusy = (value) =>
    act(
      'setBusy',
      (step) => {
        if (!bool(value)) return fail('invalid-argument', 'busy — boolean.');
        step.applied = true;
        session.setBusy(value);
        return unchanged();
      },
      { sync: false },
    );

  // Прямой отклик: игра и предметы (explicit — откликается и в тишине страницы, не обходит не менее важную реакцию и не
  // копится), «устроился», редкая сценка (её текст — extra.say). Лимит поглаживания и выбор сценки — пока у отображения.
  const react = (type, options = {}) =>
    act(
      'react',
      (step) => {
        if (!DIRECT.includes(type)) return fail('invalid-argument', `Прямой отклик — ${DIRECT.join(', ')}.`);
        const extra = options?.extra ?? {};
        if (!isRecord(options) || (options.explicit !== undefined && !bool(options.explicit)) || !isRecord(extra) || Object.entries(extra).some(([key, value]) => !DIRECT_EXTRA.includes(key) || typeof value !== 'string')) {
          return fail('invalid-argument', 'Отклик — { explicit?: boolean, extra?: { toward?, phrases?, say?, sayShort?: string } }.');
        }
        step.applied = true;
        const result = session.react(type, { explicit: options.explicit === true, extra: { ...extra } });
        return { ok: true, changed: result.played || result.queued, save: report([]), played: result.played, id: result.id };
      },
      { sync: false },
    );

  const stopScene = () =>
    act(
      'stopScene',
      (step) => {
        const was = build();
        step.applied = true;
        session.stopScene();
        return { ok: true, changed: !same(was, build()), save: report([]) };
      },
      { sync: false },
    );

  // ---------- состояние, подписка, отключение ----------

  const getState = () => closed;

  function subscribe(listener, { initial = true } = {}) {
    if (typeof listener !== 'function') {
      warnQuiet('subscribe: слушатель — функция');
      return () => {};
    }
    if (status === 'destroyed') {
      if (initial) Round.soon(() => call({ fn: listener }, { snapshot: closed, effects: [], reason: 'destroyed' }));
      return () => {};
    }
    const record = { fn: listener, active: true, since: Round.sequence() };
    listeners.push(record);
    if (initial) Round.soon(() => record.active && call(record, { snapshot: closed, effects: [], reason: 'initial' }));
    return () => {
      record.active = false;
      const index = listeners.indexOf(record);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  // Синхронно и идемпотентно: подключение закрыто (поставленные операции выполняются очередью, их settle разрешает только
  // done), слушатели получают последнее обновление 'destroyed'. В фазе работы — в её конце.
  function teardown() {
    if (status === 'destroyed') return;
    status = 'destroyed';
    session.destroy();
    try {
      client.close();
    } catch (error) {
      warnings.push(['подключение к хранилищу не закрылось', error]);
    }
    Round.touch(self);
  }

  function destroy() {
    if (status === 'destroyed' || dying) return;
    if (Round.working()) {
      dying = true;
      Round.defer(teardown);
      return;
    }
    Round.run(order, teardown);
  }

  return Object.freeze({
    get status() {
      return status;
    },
    start,
    destroy,
    getState,
    subscribe,
    refresh,
    notify,
    feed,
    markSeen,
    setName,
    setPet,
    setAppearance,
    setPreferences,
    hide: () => hidden(true),
    show: () => hidden(false),
    setContext,
    setVisible,
    setReducedMotion,
    activity,
    setSight,
    setBusy,
    react,
    stopScene,
  });
}
