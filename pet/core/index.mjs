// Ядро питомца — срезы PL03, PL04.1, PL04.2, PL04.3 и PL05 (docs/ARCHITECTURE.md § 4–6, § 8, § 9, § 14.1): экземпляр без DOM —
// своё состояние, команды, снимок и подписка, своё подключение к общему координатору хранения. Внутренний экземпляр: им
// пользуются legacy-фасад pet/pet.mjs (вместе со входами отображения setPlace, arrive, stopScene и признаками scene, pick)
// и проверки; публичный вход pet-companion/core (pet/core.mjs) и pet.core — тот же экземпляр под фасадом facade.mjs.
// Импортирует только pet/core/**.
//
// Ключи cat, companion, look, treat, presence, scene, room и place — здесь: имя, выбор кота или собаки, облик, аксессуар,
// движение, реплики, «скрыт», увиденная ступень, день приветствия, день лакомства, присутствие, копия дня сценки,
// расстановка комнаты; place — предпочтение места legacy-отображения (ядро его хранит и не толкует). Решения: счёт и
// ступени, первое включение, подтверждённое занятие, кормление, приветствие дня. С PL04.1 ядро само проигрывает реакции
// (сессия, session.mjs): режиссёр, память событий, тишина, покой, полночь, видимость, реплики, приветствие. С PL04.2 —
// присутствие и «по зову», «Скрыть» / «Показать» / вызов, открытый вид и его источник (open, close), праздник и отметка
// ступени по виду, объявление отображения (setDisplay) и редкая сценка с резервированием дня (порт scenes, § 9). С PL04.3 —
// «Поиграть» (interact, жест stroke.*, перенос предмета toy.*, лимиты, итог, позиции игрушек; play.mjs) и «Обустроить
// уголок» (room.*: черновик, перенос, сохранение, чужая расстановка; editor.mjs, геометрия — room.mjs), итоговая поза
// каждой поверхности, «устроился» (arrive). Узкий вход legacy-раскладки — stopScene (смена места, § 14.1.3).

import { describe, fail, PetError } from './errors.mjs';
import { daysBetween, isDay } from './day.mjs';
import * as Editor from './editor.mjs';
import { catRecord, companionRecord, isRecord, keepRecord, lookRecord, MOTIONS, normalizeCompanion, normalizeLook, normalizeSettings, normalizeTreat, prefRecord, readRecord, TREAT_VERSION, unknownStage } from './formats/legacy.mjs';
import { coatsOf, companionName, cleanName, KINDS, nameOffered, namePresets, profileOf } from './pets.mjs';
import { playText } from './play.mjs';
import { portProblem, systemClock, systemLog, systemRandom, systemScheduler } from './ports.mjs';
import { normalizePresence, PRESENCE_MODES, presenceRecord } from './presence.mjs';
import { arrange, feedShift, HOME as ROOM_HOME, parseRoom, roomWrite } from './room.mjs';
import * as Round from './round.mjs';
import { normalizeScene, SCENES, sceneRecord } from './scenes.mjs';
import { createSession, QUIET_REASONS, VIEW_IDS } from './session.mjs';
import { ACCESSORIES, doneOutcome, progressInfo, stageGift, STAGES, stageToCelebrate, treatState, unlockedBetween, wornAccessory } from './stages.mjs';
import { coordinatorOf } from './storage.mjs';
import { TOYS } from './toys.mjs';

export { PetError } from './errors.mjs';

// Ключи ядра и их функции записи (build операции, § 8.3): свежее сохранённое как есть + изменённые поля. Все восемь ключей
// формата 0.1.4 (PL04.3: ещё room и place).
const KEYS = ['cat', 'companion', 'look', 'treat', 'presence', 'scene', 'place', 'room'];
const RECORD = {
  cat: catRecord,
  companion: companionRecord,
  look: lookRecord,
  treat: (stored, patch) => keepRecord(stored, TREAT_VERSION, normalizeTreat, patch),
  presence: presenceRecord,
  scene: sceneRecord,
  place: prefRecord,
  room: roomWrite,
};

const OPTIONS = ['storage', 'scenes', 'progress', 'clock', 'random', 'scheduler', 'log'];
// Объявление отображения (setDisplay, § 6.4); playFloor и playTouch — «Поиграть» (PL04.3).
const DISPLAY = ['full', 'moving', 'pets', 'scenes', 'views', 'playFloor', 'playTouch'];
const ACTIONS = ['pet', 'paw', 'bowl', 'ball'];
// Ровно n конечных чисел в собственных индексах 0…n−1. Не every: он пропускает пустые индексы разреженного массива
// (new Array(2) прошёл бы и дал NaN в местах, а запись — x, y: null; по независимой проверке PL04.3).
function numbers(value, n) {
  if (!Array.isArray(value) || value.length !== n) return false;
  for (let i = 0; i < n; i += 1) if (!Object.hasOwn(value, i) || !Number.isFinite(value[i])) return false;
  return true;
}
// Точка [x, y] (единицы сцены или рисунка): room.move/drag, interact({ type: 'bowl', to }), toy.drag.
const point = (value) => numbers(value, 2);
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

// Регистрация определений (pets, behaviors, docs/ARCHITECTURE.md § 7) — следующий этап (PL06): настройки не принимаются,
// а не игнорируются молча.
const LATER = ['pets', 'behaviors'];

// Создание: синхронная проверка настроек → своё подключение к загруженному координатору → чтение подтверждённого. Без
// записи, таймеров, вызова портов и слушателей. Ошибка проверки — PetError до подключения. Внутренний экземпляр: им
// пользуются legacy-отображение (pet/pet.mjs) и проверки; публичный — вход pet/core.mjs (тот же экземпляр под фасадом
// facade.mjs: только публичные методы, поля результатов и снимка). storage — координатор: публичный (createStorage) или
// внутренний (веб-координатор, тестовый).
export function createPetCore(options) {
  if (!isRecord(options)) throw new PetError('invalid-options', 'Настройки ядра — объект.');
  for (const key of Object.keys(options)) {
    if (LATER.includes(key)) throw new PetError('invalid-options', `${key}: регистрация определений ещё не поддерживается — питомцы встроены (кот и собака), модель поведения одна.`);
    if (!OPTIONS.includes(key)) throw new PetError('invalid-options', `Неизвестная настройка: ${key}.`);
  }
  const storage = coordinatorOf(options.storage) ?? options.storage;
  if (!storage || typeof storage.connect !== 'function' || typeof storage.load !== 'function') throw new PetError('invalid-options', 'storage — координатор хранения (status, load, connect).');
  if (options.progress !== undefined && typeof options.progress !== 'function') throw new PetError('invalid-options', 'progress — функция.');
  if (options.scenes !== undefined && options.scenes !== null && !(typeof options.scenes === 'object' && typeof options.scenes.reserve === 'function')) throw new PetError('invalid-options', 'scenes — резервирование сценки (reserve(decide, show)) или null.');
  const problem = portProblem(options);
  if (problem) throw new PetError('invalid-options', problem);
  if (storage.status !== 'ready' && storage.status !== 'failed') throw new PetError('storage-not-loaded', 'Хранилище ещё не загружено: сначала storage.load().');
  return core({
    storage,
    scenes: options.scenes ?? null,
    progress: options.progress ?? (() => ({ marks: 0, today: 0 })),
    clock: options.clock ?? systemClock,
    random: options.random ?? systemRandom,
    scheduler: options.scheduler ?? systemScheduler,
    log: options.log ?? systemLog,
  });
}

function core({ storage, scenes, progress, clock, random, scheduler, log }) {
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
  let faults = []; // сбои оркестровки сессии (отказ планировщика, clock.nextDay) — noteFaults
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

  // base — подтверждённое (по умолчанию) или свежее значение хранилища, поверх которого ложатся свои правки; unsaved: false
  // — без несохранённых полей (подтверждённое и уже поставленное в запись).
  function memoryText(key, base = keys[key].confirmed, { unsaved = true } = {}) {
    const own = keys[key];
    let stored = base;
    for (const fields of [unsaved ? own.unsaved : {}, ...own.ops.map((op) => op.fields)]) if (Object.keys(fields).length) stored = JSON.stringify(RECORD[key](stored, toPatch(fields)));
    return stored;
  }

  // Память → показ: подтверждённое, поверх несохранённые поля, поверх патчи неразрешённых операций — той же функцией
  // записи, что в build (память совпадает с тем, что будет записано).
  function memory() {
    const texts = Object.fromEntries(KEYS.map((key) => [key, memoryText(key)]));
    const raw = Object.fromEntries(KEYS.map((key) => [key, readRecord(texts[key]).raw]));
    return {
      raw,
      cat: normalizeSettings(raw.cat),
      companion: normalizeCompanion(raw.companion),
      look: normalizeLook(raw.look),
      treat: normalizeTreat(raw.treat),
      presence: normalizePresence(raw.presence),
      scene: normalizeScene(raw.scene),
      room: parseRoom(texts.room),
      unknown: unknownStage(raw.cat),
    };
  }

  // Ступень, по которой расставлена комната и показан уголок (как в снимке progress.stage).
  const stageOf = (m) => progressInfo(host ? host.marks : 0, m.cat.seenStage).stage;
  // Расстановка комнаты показанного питомца: по памяти ключа room (с несохранёнными правками) или — committed — по
  // подтверждённому и уже поставленному в запись (что писать при «Сохранить», что показывать «Не сохранено»).
  function roomPos(kind, stage, { committed = false, m = null } = {}) {
    const saved = committed ? parseRoom(memoryText('room', keys.room.confirmed, { unsaved: false })) : (m ?? memory()).room;
    return arrange(kind, stage, saved[kind]).pos;
  }
  // Предметы питомца с несохранёнными точками (их пишет следующее «Сохранить»).
  const roomUnsaved = (kind) => Object.keys(keys.room.unsaved).filter((path) => path.startsWith(`${kind}.`)).map((path) => path.slice(kind.length + 1)).filter((id) => Object.hasOwn(ROOM_HOME, id));

  // Увиденная ступень для решений: непонятная этой версии — как увиденная выше всех (ничего не отмечается и не празднуется).
  const seenOf = (m) => (m.unknown ? STAGES.length : m.cat.seenStage);
  const nameOf = (value, kind) => ({ value, chosen: !nameOffered(value), display: companionName({ kind, name: value }) });

  // Что нужно сессии (реакции, время, вид, сценки): показанный питомец, его имя, облик и аксессуар, «скрыт», присутствие,
  // движение и реплики владельца, ступень по счёту хоста (банк реплик), довольный покой после лакомства до конца дня,
  // копия дня сценки (память ключа scene).
  function sense(m = memory()) {
    const kind = m.companion.kind;
    const own = kind === 'dog' ? m.companion.dog : m.cat;
    return {
      kind,
      name: companionName({ kind, name: own.name }),
      hidden: m.cat.hidden,
      mode: m.presence.mode,
      coat: m.look[kind],
      accessory: own.accessory,
      motion: m.cat.motion,
      phrases: m.cat.phrases,
      stage: progressInfo(host ? host.marks : 0, m.cat.seenStage).stage,
      content: host !== null && treatState(host.day, m.treat.fedDay, host.today) === 'fed',
      scene: m.scene,
    };
  }

  // Сессия (session.mjs): режиссёр, задачи, покой, реплики, вид, сценки. Создание не вызывает портов; задача — своим
  // раундом (task); шаги резервирования сценки — раундом stage. Отказ загрузки хранилища — без сценок (день записывать
  // нельзя).
  const session = createSession({
    clock,
    random,
    scheduler,
    sense: () => sense(),
    emit: (effect) => effects.push(effect),
    fault: (message, error) => faults.push([message, error]),
    run: (name, body) => task(name, body),
    refresh: () => hostRefresh(working ?? { applied: false, save: null }),
    scenes: offline ? null : scenes,
    // Свежая копия дня для решения резервирования (§ 9.2, шаг 3): значение хранилища сейчас через координатор (без
    // фиксации и слушателей; асинхронный — подтверждённое) и поверх него свои ещё не подтверждённые правки.
    mirror: () => normalizeScene(readRecord(memoryText('scene', client.peek('scene'))).raw),
    // Копия дня после shown — неявная операция ключа scene в текущем шаге (повреждённое не заменяет).
    keep: (fields) => apply(working, { writes: [{ key: 'scene', fields, implicit: true }] }),
    stage: (name, body) => stage(name, body),
    // Решение — критическая фаза раунда (§ 5.4, § 9.2): годится, только если её конец пуст и ядро не отключается. Порт,
    // отключивший ядро изнутри решения (random метки, чтение копии, часы), — destroy в конце фазы, доставка 'destroyed',
    // решение null (skip): записи дня нет. Подписка или изменение ядра из порта — тоже null: между проверкой, постановкой
    // записи и началом показа не вызываются ни слушатели, ни журнал.
    guard: (fn) => {
      const { value, quiet } = Round.critical(order, fn);
      return quiet && !dying && status !== 'destroyed' ? value : null;
    },
    // Ядро живо и не отключается (destroy, отложенный до конца идущей фазы, — уже отключается).
    intact: () => status !== 'destroyed' && !dying,
    warn: (message, error) => (status !== 'destroyed' && Round.working() ? warnings.push([message, error]) : warnQuiet(message, error)),
    // Идёт перенос в редакторе комнаты — тоже жест указателем (без движений покоя и сценки).
    gesture: () => Boolean(draft?.drag),
    // Жест снят ядром (другой питомец, облик или аксессуар, «Скрыть», фон): перенос в редакторе отменён, черновик цел.
    interrupt: () => {
      if (draft) draft.drag = null;
    },
  });
  // Черновик редактора комнаты (editor.mjs) — пока открыт вид room; roomForeign — в фазе поглощено чужое изменение room.
  let draft = null;
  let roomForeign = false;

  // Сбои оркестровки, отмеченные сессией (она их не бросает и уже сняла то, что без задачи зависло бы): эффект warning
  // internal и журнал после фиксации; отключённое ядро — только журнал. Возвращает, были ли сбои.
  function noteFaults() {
    if (!faults.length) return false;
    const list = faults;
    faults = [];
    for (const [message, error] of list) {
      if (status !== 'destroyed') effects.push({ type: 'warning', code: 'internal', message: error === undefined ? message : `${message}: ${describe(error)}` });
      warnings.push([message, error]);
    }
    return true;
  }

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
      presence: life.presence,
      view: life.view,
      display: life.display,
      scene: life.scene,
      visible: life.visible,
      context: life.context,
      pose: life.pose,
      phrase: life.phrase,
      scenePhrase: life.scenePhrase,
      play: life.play,
      room: roomState(m, kind, info.stage),
      // Предпочтение места legacy-отображения (ключ place как есть, с правками этого экземпляра): ядро его не толкует.
      place: isRecord(m.raw.place) ? m.raw.place : {},
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

  // Комната в снимке (§ 5.2): сохраняемая расстановка показанного питомца на его ступени (память ключа room), сдвиг позы
  // «ест» к миске и черновик редактора (пока открыт).
  function roomState(m, kind, stage) {
    const pos = roomPos(kind, stage, { m });
    return { pos, feedShift: feedShift({ kind, stage, pos }), draft: draft ? Editor.draftState(draft, saveOf('room').status === 'pending') : null };
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
        if (name === 'room') roomForeign = true;
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
    return { entries, refused };
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
  // снимка: другой питомец или «скрыт», движение, реплики (§ 8.6). Их сбой и сбои оркестровки, отмеченные после результата
  // команды (здесь, в отключении), — эффектом warning internal этого обновления и журналом. Затем журнал и одно обновление.
  function close() {
    if (gone) return;
    if (status !== 'destroyed') {
      try {
        session.reconcile(sense());
      } catch (error) {
        faults.push(['следствия изменения настроек не применены', error]);
      }
      try {
        editorSync();
      } catch (error) {
        faults.push(['черновик комнаты не согласован', error]);
      }
    }
    roomForeign = false;
    noteFaults();
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

  // Конец фазы работы: черновик редактора согласован с видом, питомцем, ступенью и расстановкой (§ 6.4). Вид не room —
  // черновика нет. Другой питомец (своя команда или другая вкладка) — черновик без сохранения, вид — уголок (ступень
  // отметит следующее обновление счёта при открытом уголке; поглощение ничего не пишет). Новая ступень — перенос отменён,
  // черновик пересчитан на ней, записи нет. Сохраняемая расстановка сменилась: чужая (поглощение другой вкладки или ядра) —
  // отметка other и одно объявление, черновик не затирается; исход своей записи — тихо.
  function editorSync() {
    if (!draft) return;
    if (session.view().open !== 'room') {
      draft = null;
      return;
    }
    const m = memory();
    const kind = m.companion.kind;
    if (draft.kind !== kind) {
      draft = null;
      session.openView('corner', 'pet', sense(m));
      return;
    }
    const stage = stageOf(m);
    const baseline = roomPos(kind, stage, { committed: true });
    if (stage !== draft.stage) Editor.restage(draft, stage, roomPos(kind, stage, { m }), baseline);
    else for (const text of Editor.rebase(draft, baseline, roomForeign)) effects.push({ type: 'announce', text });
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
          const result = body(step);
          // Сбой оркестровки после применения (отказ планировщика): изменение и запись остаются, результат — честный.
          return noteFaults() && result.ok ? { ...result, degraded: true } : result;
        } catch (error) {
          noteFaults();
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

  // Шаг резервирования сценки (начало показа, исход, § 9.2): свой раунд — или часть уже идущей фазы работы, если адаптер
  // вызвал его синхронно изнутри неё; поздний после destroy или уже запрошенного (отложенного) destroy — ничего (false).
  // Исключение тела проходит к вызвавшему (show — адаптеру: запись откатывается), сбои оркестровки — эффектом warning
  // internal и журналом.
  function stage(name, body) {
    if (status === 'destroyed' || dying) return false;
    Round.run(order, () => {
      const outer = working;
      working = { applied: true, save: null };
      mark(name);
      try {
        body();
      } finally {
        noteFaults();
        working = outer;
      }
    });
    return true;
  }

  // Счёт хоста и местный день заново, первое включение молча (refresh, полночь, возврат видимости).
  function hostRefresh(step) {
    const next = readHost();
    apply(step, { next, writes: firstSwitch(next) });
  }

  // Шаг 4 — счёт хоста и день, статус, затем шаг 5 — операции; предупреждения о непоставленных записях — после постановки
  // всех ключей. Несколько применений в одном шаге (запись комнаты, затем выход в уголок с отметкой ступени) — один итог
  // по всем ключам шага.
  function apply(step, { next = host, writes = [], running = false }) {
    host = next;
    if (running) status = 'running';
    step.applied = true;
    const { entries, refused } = queue(writes);
    step.entries = [...(step.entries ?? []), ...entries];
    step.save = report(step.entries);
    for (const [key, error] of refused) log.warn(`запись ${key} не поставлена`, error);
    return step.save;
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

  // Уголок виден (открыт не вызовом, возврат из «Поиграть» или редактора, новые знаки при открытом уголке) — новая
  // ступень отмечается увиденной: неявная запись cat.seenStage (повреждённое не заменяет), без праздника; непонятная этой
  // версии ступень не отмечается. writes — правки команды (первое включение уже в них). Возвращает отметку { stage, items,
  // accessories } — вещи и аксессуары, ставшие увиденными (для «Новое в уголке»), или null; эффект seen — saw() после
  // применения (PL05: прямая команда показывает «Новое» тем же путём, что кнопка).
  function seeStage(next, writes, m) {
    if (m.unknown || !next) return null;
    const first = writes.find((write) => write.key === 'cat' && 'seenStage' in write.fields);
    const seen = first ? first.fields.seenStage : m.cat.seenStage;
    const stage = progressInfo(next.marks, seen).stage;
    if (stage <= seen) return null;
    writes.push({ key: 'cat', fields: { seenStage: stage }, implicit: true });
    const { items, accessories } = unlockedBetween(seen, stage, m.companion.kind);
    return { stage, items, accessories };
  }
  // Отметка уже применена: эффект seen; результат команды — вещи (fresh).
  function saw(mark) {
    if (!mark) return [];
    effects.push({ type: 'seen', stage: mark.stage, items: [...mark.items], accessories: [...mark.accessories] });
    return mark.items;
  }

  // Питомец на виду (присутствие, «скрыт», открытый вид) и открытый вид — решение ядра (§ 6.4).
  const sight = () => ({ around: session.around(sense()), view: session.view().open });

  // start: один раз — первое включение и приветствие дня (решение и запись), затем сессия: покой и полночь (задачи
  // scheduler), приветствие — через 0,9 с. Спрятан или «по зову» и не вызван — без приветствия.
  const start = () =>
    act('start', (step) => {
      if (status !== 'created') return fail('already-started', 'Ядро уже запущено.');
      const where = sight();
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

  // refresh: перечитать счёт хоста и день; первое включение молча; открыт уголок — новая ступень увидена (fresh — вещи,
  // ставшие увиденными).
  const refresh = () =>
    act('refresh', (step) => {
      const was = build();
      const next = readHost();
      const writes = firstSwitch(next);
      const mark = session.view().open === 'corner' ? seeStage(next, writes, memory()) : null;
      apply(step, { next, writes });
      const fresh = saw(mark);
      return { ok: true, changed: !same(was, build()), save: step.save, fresh };
    });

  // Подтверждённое занятие: счёт хоста уже включает знак. Спрятан, не на виду, до start или detail === null — только числа.
  // Иначе решение: радость или поддержка, праздник новой ступени (не в «Поиграть» и редакторе) с отметкой увиденной,
  // продолжение с новой вещью, подсказка про миску; уголок открыт, а ступень поднялась без праздника (занятие без знака,
  // счёт сайта вырос без refresh) — увидена, как при refresh (fresh — эти вещи; syncSheet 0.1.4). Увиденная ступень —
  // сверенная (act): уже увиденная или непонятная до команды — без праздника. Реакцию играет сессия: повтор key в
  // экземпляре — без реакции (duplicate); в фоне решение то же
  // (числа, праздник с отметкой ступени, учёт key), но реакция не играет и не откладывается. «На виду» и открытый вид —
  // ядра (присутствие, «скрыт», view). После реакции — попытка редкой сценки (одна на событие, session.choose): ждёт конца
  // реакции этого события. options.scene === false — без попытки (legacy-событие без key, Р2: в 0.1.4 у него сценки нет) —
  // внутренняя граница legacy-фасада: только с ней key может быть пустым ('undefined', '' — String(detail.key) фасада).
  // Публичное событие (PL05, фасад facade.mjs вызывает без options): detail — null или { key: непустая строка, counted?,
  // hard?, first?: boolean } без других полей; failed — без подробностей. Любой ввод в строку не превращается.
  const notify = (type, detail, options) =>
    act('notify', (step) => {
      if (type !== 'saved' && type !== 'failed') return fail('invalid-argument', 'Событие — saved или failed.');
      if (options !== undefined && !(isRecord(options) && Object.keys(options).every((key) => key === 'scene') && (options.scene === undefined || typeof options.scene === 'boolean'))) {
        return fail('invalid-argument', 'Настройки события — { scene?: boolean }.');
      }
      if (type === 'failed' && detail !== undefined && detail !== null) return fail('invalid-argument', "notify('failed') — без подробностей.");
      const at = clock.now();
      const where = sight();
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
      const legacy = options?.scene === false;
      const known = (key) => key === 'key' || flags.includes(key);
      if (detail !== null && !(isRecord(detail) && Object.keys(detail).every(known) && typeof detail.key === 'string' && (legacy || detail.key.length > 0) && flags.every((flag) => detail[flag] === undefined || typeof detail[flag] === 'boolean'))) {
        return fail('invalid-argument', 'detail — { key: непустая строка, counted?, hard?, first?: boolean } или null.');
      }
      const was = build();
      const next = readHost();
      const writes = firstSwitch(next);
      const m = memory();
      const quiet = { ok: true, reacted: false, duplicate: false, celebrate: null, reaction: null, scene: null, fresh: [] };
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
      const mark = celebrate === null && where.view === 'corner' ? seeStage(next, writes, m) : null;
      // Первое занятие дня открыло лакомство — радость подсказывает про миску.
      const hint = !outcome.hard && treatState(next.day, m.treat.fedDay, next.today) === 'ready' && detail.first === true;
      const reaction = { type: outcome.hard ? 'support' : 'joy', key: `entry:${detail.key}`, extra: { ...(hint ? { phrases: 'joyTreat' } : {}), ...(follow ? { follow } : {}) } };
      apply(step, { next, writes });
      effects.push(...told);
      const fresh = saw(mark);
      const { duplicate } = session.react(reaction.type, { key: reaction.key, extra: { ...reaction.extra, event: detail.key } });
      // Выбор сценки — после реакции (порядок random как 0.1.4: реплика, затем шанс и вариант).
      session.choose({ key: options?.scene === false ? '' : detail.key, outcome, stage, day: next.day, at }, sense());
      return { ok: true, changed: !same(was, build()), save: step.save, reacted: true, duplicate, celebrate, reaction, scene: { outcome, stage }, fresh };
    });

  // Кормление: день заново, отметка дня — сверенная (act): уже угостили до команды — treat-fed без записи и реакции. Отметка
  // дня в памяти и операция записи — до реакции (второго лакомства в экземпляре нет). Объявление — по известному итогу
  // записи; асинхронно — без слов о сохранности, поздний отказ — отдельным объявлением. Реакцию «ест» → «доволен» играет
  // сессия (после start); успешное кормление — ручное действие: перед реакцией сценка отменена окончательно (ждущая
  // попытка и идущее резервирование — skip). Бизнес-отказ (ok: false) ничего не меняет — и попытку тоже.
  const feed = () =>
    act('feed', (step) => {
      const where = sight();
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

  // ---------- виды и присутствие (§ 6.4) ----------

  // Открыть вид: corner, play или room — если отображение его объявило (иначе unsupported); спрятан — hidden. Из закрытого:
  // облик и счёт перечитаны (сверка и progress()), source — pet или call («по зову»: только сразу «Поиграть», без отметки
  // ступени и движения «заметил гостя»); источник — до закрытия, смена вида его не меняет (переданный source тогда не
  // действует). Уголок виден — новая ступень увидена (fresh — эти вещи, для «Новое в уголке»), в том числе при возврате из
  // «Поиграть» или редактора, и после вызова тоже. Открытие и смена вида отменяют сценку.
  const open = (target, options) =>
    act('open', (step) => {
      if (!VIEW_IDS.includes(target)) return fail('invalid-argument', 'Вид — corner, play или room.');
      if (options !== undefined && !(isRecord(options) && Object.keys(options).every((key) => key === 'source') && [undefined, 'pet', 'call'].includes(options.source))) {
        return fail('invalid-argument', 'Настройки открытия — { source?: pet | call }.');
      }
      const source = options?.source ?? 'pet';
      if (source === 'call' && target !== 'play') return fail('invalid-argument', 'Вызов «по зову» открывает сразу «Поиграть».');
      if (!session.display().views.includes(target)) return fail('unsupported', `Вид «${target}» отображение не объявило.`);
      const m = memory();
      if (m.cat.hidden) return fail('hidden', 'Питомец спрятан.');
      const was = session.view().open;
      if (was === target) return { ...unchanged(), fresh: [] };
      const next = was === null ? readHost() : host;
      const writes = was === null ? firstSwitch(next) : [];
      const mark = target === 'corner' ? seeStage(next, writes, m) : null;
      apply(step, { next, writes });
      const fresh = saw(mark);
      // Редактор: черновик — из сохраняемой расстановки (выбрано место отдыха); уход из редактора отбрасывает черновик и
      // перенос без объявления.
      draft = null;
      session.openView(target, source, sense());
      if (target === 'room') draft = openEditor();
      return { ok: true, changed: true, save: step.save, fresh };
    });

  function openEditor() {
    const m = memory();
    const kind = m.companion.kind;
    const stage = stageOf(m);
    return Editor.openDraft({ kind, stage, saved: roomPos(kind, stage, { m }), baseline: roomPos(kind, stage, { committed: true }), unsaved: roomUnsaved(kind) });
  }

  // Выход из редактора в уголок (room.save, room.cancel): как open('corner') из редактора — уголок виден, новая ступень
  // увидена (неявная запись того же шага; fresh — её вещи); черновик и перенос отброшены.
  function toCorner(step) {
    const writes = [];
    const mark = seeStage(host, writes, memory());
    if (writes.length) apply(step, { writes });
    draft = null;
    session.openView('corner', 'pet', sense());
    return saw(mark);
  }

  // Закрыть вид: «Поиграть» и редактор закрываются без сохранения, сценка отменена; «по зову» — питомец уходит и ничего
  // не доигрывает (остаётся полночь). Фокус, прокрутка и restore — у отображения.
  const shut = () =>
    act(
      'close',
      (step) => {
        if (session.view().open === null) return unchanged();
        step.applied = true;
        draft = null;
        session.closeView(sense());
        return { ok: true, changed: true, save: report([]) };
      },
      { sync: false },
    );

  // Присутствие «Всегда рядом» / «Приходит по зову» (ключ presence): поверхность меняется тихо, сценка отменяется; «по
  // зову» и не вызван — ушёл и ничего не доигрывает; открытый вид и его источник остаются. Без приветствия.
  const setPresence = (mode) =>
    act('setPresence', (step) => {
      if (!PRESENCE_MODES.includes(mode)) return fail('invalid-argument', 'Присутствие — always или on-call.');
      if (memory().presence.mode === mode) return unchanged();
      apply(step, { writes: [{ key: 'presence', fields: { mode } }] });
      session.reconcile(sense());
      return { ok: true, changed: true, save: step.save };
    });

  // ---------- настройки ----------

  const ownerOf = (m) => (m.companion.kind === 'dog' ? { key: 'companion', prefix: 'dog.', settings: m.companion.dog } : { key: 'cat', prefix: '', settings: m.cat });

  // Имя (очистка cleanName; '' — «ещё не выбирали»). Выбор готового имени показанного питомца (подборка, предложение,
  // «Оставить …»): ручное действие — сценка отменена окончательно (ждущая попытка и идущее резервирование — skip, и когда
  // отклик не сыгран: пауза повтора), затем отклик named (пауза повтора 4 с) и объявление «Имя: …» (эффект announce), и
  // когда имя не изменилось. Свободный ввод своего имени — тихо, как 0.1.4 (сценку отменяет ввод в поле, setContext).
  // options.pick — внутренняя граница, не публичный параметр: 'preset' — публичное правило (фасад, кнопки отображения):
  // готовое ли имя, решает ядро по списку показанного питомца; false (и без options) — свободный ввод в поле; true —
  // выбор готового без проверки списка (проверки ядра). changed — имя или снимок изменились (отмена попытки, отклик).
  const PICKS = [undefined, true, false, 'preset'];
  const setName = (value, options) =>
    act('setName', (step) => {
      if (typeof value !== 'string') return fail('invalid-argument', 'Имя — строка.');
      if (options !== undefined && !(isRecord(options) && Object.keys(options).every((key) => key === 'pick') && PICKS.includes(options.pick))) return fail('invalid-argument', "Настройки имени — { pick?: boolean | 'preset' }.");
      const was = build();
      const name = cleanName(value);
      const m = memory();
      const kind = m.companion.kind;
      const target = ownerOf(m);
      const renamed = target.settings.name !== name;
      const picked = options?.pick === true || (options?.pick === 'preset' && name !== '' && namePresets(kind).includes(name));
      if (renamed) apply(step, { writes: [{ key: target.key, fields: { [`${target.prefix}name`]: name } }] });
      let reacted = false;
      // Отклик и объявление — только пока питомец на виду (как событие занятия): спрятанный или «по зову» и не вызванный
      // (прямая команда хоста) получает имя тихо.
      if (picked && session.around(sense())) {
        step.applied = true;
        reacted = session.manual('named').played;
        effects.push({ type: 'announce', text: `Имя: ${companionName({ kind, name })}.` });
      }
      return renamed ? { ok: true, changed: true, save: step.save, reacted } : { ...unchanged(), changed: !same(was, build()), reacted };
    });

  // Другой питомец: прежний ничего не доигрывает (реакции, отложенная, облако, задачи — сессия), память событий, тишина и
  // паузы повторов остаются; на виду (не спрятан; «по зову» — вызван) — приветствие meet (пауза повтора 6 с).
  const setPet = (id) =>
    act('setPet', (step) => {
      if (typeof id !== 'string') return fail('invalid-argument', 'Питомец — строка ID.');
      if (!KINDS.includes(id)) return fail('unknown-id', `Питомца «${id}» нет.`);
      const drawn = session.display().pets;
      if (drawn && !drawn.includes(id)) return fail('unsupported', `Питомца «${id}» отображение не рисует.`);
      if (memory().companion.kind === id) return unchanged();
      apply(step, { writes: [{ key: 'companion', fields: { kind: id } }] });
      session.reconcile(sense());
      const reacted = session.around(sense()) && session.react('meet').played;
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
      // Другой облик или аксессуар — сценка отменена (перерисовка, как applyCoat 0.1.4).
      session.reconcile(sense());
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

  // «Скрыть» и «Показать» — запись hidden и сессия: спрятан — вид закрыт, реакции, облако, сценка и все задачи (с
  // полуночью) сняты; память событий, причины тишины и паузы повторов — нет (исправление Р1). Показан — поверхность по
  // присутствию (по зову — лапка, вид не открывается), покой и полночь заново, без приветствия. Фокус, места и текст
  // объявления (называет кнопки legacy-отображения и texts.back сайта) — у отображения.
  const hidden = (value) =>
    act(value ? 'hide' : 'show', (step) => {
      if (memory().cat.hidden === value) return unchanged();
      apply(step, { writes: [{ key: 'cat', fields: { hidden: value } }] });
      session.hidden(value, sense());
      return { ok: true, changed: true, save: step.save };
    });

  // ---------- входы отображения и жизненного цикла (§ 6.4; публичные с PL05) ----------

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

  // Видимость приложения (веб — visibilitychange): фон снимает реакцию и отложенную, облако, сценку и задачи; пока фон,
  // реакции не начинаются и не откладываются (события, снятие тишины, прямые отклики), задачи не ставятся — решения,
  // числа и записи идут как всегда. Возврат — дремота после 3 мин без действий, счёт, день и лакомство заново (со сверкой
  // хранения), задачи заново; ничего не доигрывается, приветствия нет.
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

  // Что умеет и показывает отображение (§ 6.4, § 7.1.1): full — целиком (иначе портрет), moving — идёт перенос, pets —
  // нарисованные питомцы, views — виды, scenes — объявленные сценки { petId: [sceneId, …] } (разрешение: без объявления,
  // {}, без ключа или пустой список — ни одной). Переданное свойство заменяет прежнее целиком, не переданное сохраняется;
  // всё проверяется до применения (неверное — invalid-argument, объявление прежнее). Незарегистрированный питомец или
  // сценка, которой у питомца нет, пропускаются — одно предупреждение журнала на ссылку. Изменение full, scenes и начало
  // переноса отменяют сценку и попытку. playFloor — пол «Поиграть» [l, t, r, b] в единицах рисунка, playTouch — наименьший
  // радиус области касания лапы (PL04.3): новый пол ограничивает места предметов.
  const setDisplay = (value) =>
    act(
      'setDisplay',
      (step) => {
        const parsed = displayOf(value);
        if (parsed.error) return fail('invalid-argument', parsed.error);
        const was = build();
        step.applied = true;
        session.setDisplay(parsed.patch);
        for (const ref of parsed.unknown) warnings.push([`setDisplay: ${ref} — нет у зарегистрированных питомцев, пропущено`]);
        return { ok: true, changed: !same(was, build()), save: report([]) };
      },
      { sync: false },
    );

  // Проверка объявления целиком до применения: { patch, unknown } или { error }.
  function displayOf(value) {
    const shape = 'Отображение — { full?, moving?: boolean, pets?: string[], views?: (corner | play | room)[], scenes?: { petId: string[] }, playFloor?: [l, t, r, b], playTouch?: число ≥ 0 }.';
    if (!isRecord(value) || Object.keys(value).some((key) => !DISPLAY.includes(key))) return { error: shape };
    const strings = (list) => Array.isArray(list) && list.every((item) => typeof item === 'string');
    const patch = {};
    const unknown = [];
    for (const key of ['full', 'moving']) {
      if (!(key in value)) continue;
      if (!bool(value[key])) return { error: `${key} — boolean.` };
      patch[key] = value[key];
    }
    if ('views' in value) {
      if (!strings(value.views) || value.views.some((id) => !VIEW_IDS.includes(id))) return { error: 'views — массив из corner, play, room.' };
      patch.views = [...new Set(value.views)];
    }
    if ('pets' in value) {
      if (!strings(value.pets)) return { error: 'pets — массив строк ID.' };
      for (const id of value.pets) if (!KINDS.includes(id)) unknown.push(id);
      patch.pets = [...new Set(value.pets.filter((id) => KINDS.includes(id)))];
    }
    if ('scenes' in value) {
      if (!isRecord(value.scenes) || Object.values(value.scenes).some((list) => !strings(list))) return { error: 'scenes — объект { petId: [sceneId, …] }, где каждое значение — массив строк.' };
      patch.scenes = {};
      for (const [id, list] of Object.entries(value.scenes)) {
        if (!KINDS.includes(id)) {
          unknown.push(id);
          continue;
        }
        for (const scene of list) if (!SCENES[id].includes(scene)) unknown.push(`${id}/${scene}`);
        patch.scenes[id] = [...new Set(list.filter((scene) => SCENES[id].includes(scene)))];
      }
    }
    // Пол «Поиграть» — четыре конечных числа в единицах рисунка, l < r и t < b; радиус касания лапы — конечное число ≥ 0.
    if ('playFloor' in value) {
      const floor = value.playFloor;
      if (!(numbers(floor, 4) && floor[0] < floor[2] && floor[1] < floor[3])) return { error: 'playFloor — [l, t, r, b]: четыре конечных числа единиц рисунка, l < r, t < b.' };
      patch.playFloor = [...floor];
    }
    if ('playTouch' in value) {
      if (!(Number.isFinite(value.playTouch) && value.playTouch >= 0)) return { error: 'playTouch — конечное число единиц рисунка ≥ 0.' };
      patch.playTouch = value.playTouch;
    }
    return { patch, unknown: [...new Set(unknown)] };
  }

  // ---------- «Поиграть»: прямые действия, жест, предметы (§ 6.4, § 6.8; play.mjs) ----------

  // Проверки входа с питомцем: спрятан — hidden, не на виду — away (вызывающий проверяет вид).
  function nearby() {
    const m = memory();
    if (m.cat.hidden) return fail('hidden', 'Питомец спрятан.');
    if (!session.around(sense(m))) return fail('away', 'Питомец не на виду (приходит по зову).');
    return null;
  }

  // Взаимодействие: { type: 'pet' } — одно поглаживание без жеста; { type: 'paw' } — лапа (вне «Поиграть» — только у
  // питомца с командой «Дай лапу», иначе unsupported); { type: 'bowl', to: 'near' | 'home' | [u, v] } и { type: 'ball', to:
  // 'roll' | число } — предметы, только в открытой «Поиграть» (not-open) и по объявленному полу (unsupported). В «Поиграть»
  // — прямое действие: откликается и в тишине страницы, не обходит не менее важную реакцию, не копится; каждый сыгранный
  // отклик — итог под сценой и объявление. Вне «Поиграть» (кнопки уголка) — обычный запрос без итога, как 0.1.4. Лимит —
  // ядро (play.mjs); знаков и наград нет, миска не кормит. Ручное действие — сценка отменена окончательно; бизнес-отказ
  // (ok: false) ничего не меняет и сценку не трогает. Результат: outcome — pet, paw, enough, quiet, sniff, look, ball, moved
  // (предмет сдвинулся, питомец занят), dropped (предмет не сдвинулся) или null (отклик не сыгран), text — его текст.
  const interact = (action) =>
    act('interact', (step) => {
      const shape = 'Действие — { type: pet | paw }, { type: bowl, to: near | home | [u, v] } или { type: ball, to: roll | число ≠ 0 }.';
      if (!isRecord(action) || !ACTIONS.includes(action.type)) return fail('invalid-argument', shape);
      const toy = TOYS.includes(action.type);
      if (Object.keys(action).some((key) => key !== 'type' && !(toy && key === 'to'))) return fail('invalid-argument', shape);
      if (action.type === 'bowl' && !(action.to === 'near' || action.to === 'home' || point(action.to))) return fail('invalid-argument', shape);
      if (action.type === 'ball' && !(action.to === 'roll' || (Number.isFinite(action.to) && action.to !== 0))) return fail('invalid-argument', shape);
      const refused = nearby();
      if (refused) return refused;
      const view = session.view().open;
      const s = sense();
      if (action.type === 'paw' && view !== 'play' && !profileOf(s.kind).paw) return fail('unsupported', 'У питомца нет команды «Дай лапу» вне «Поиграть».');
      if (toy && view !== 'play') return fail('not-open', 'Предметы — только в открытой «Поиграть».');
      if (toy && !session.play.floored()) return fail('unsupported', 'Пол «Поиграть» не объявлен отображением (setDisplay({ playFloor })).');
      const was = build();
      step.applied = true;
      const outcome = toy ? session.play[action.type](action.to) : session.play.touch(action.type, view === 'play');
      const text = outcome && outcome !== 'dropped' ? playText(outcome, action.type, s.kind, s.name) : '';
      return { ok: true, changed: !same(was, build()), save: report([]), outcome: outcome ?? null, text };
    });

  // Жест поглаживания (§ 6.4, сценарии § 6.8). Отображение распознаёт попадание и пороги и вызывает start → step на каждый
  // пройденный порог → end (отпустили) или cancel (прерван); ядро — лимит и приоритет, удержание позы, объявления без
  // повторов, итог и его сброс. Ядро само снимает жест: фон, другой питомец или облик, «Скрыть», закрытие или смена вида,
  // destroy (play.stroke → null; поздние end/cancel безвредны, step — no-gesture).
  const gestureId = (id) => (Number.isSafeInteger(id) && id > 0 ? null : fail('invalid-argument', 'id жеста — целое положительное число.'));
  const stroke = Object.freeze({
    start: () =>
      act('stroke.start', (step) => {
        const refused = nearby();
        if (refused) return refused;
        if (session.view().open !== 'play') return fail('not-open', 'Жест поглаживания — только в открытой «Поиграть».');
        step.applied = true;
        return { ok: true, changed: true, save: report([]), id: session.play.strokeStart() };
      }),
    step: (id) =>
      act(
        'stroke.step',
        (step) => {
          const bad = gestureId(id);
          if (bad) return bad;
          if (!session.play.stroking(id)) return fail('no-gesture', 'Жест с этим id не идёт (завершён, отменён или устарел).');
          const was = build();
          step.applied = true;
          const result = session.play.strokeStep(id);
          return { ok: true, changed: !same(was, build()), save: report([]), outcome: result.outcome, announced: result.announced };
        },
        { sync: false },
      ),
    end: (id) => strokeStop('stroke.end', id),
    cancel: (id) => strokeStop('stroke.cancel', id),
  });

  // Конец (отпустили) и отмена (прерван) жеста — в формате 1 одинаковы: удержание снято, новых откликов и объявлений нет;
  // реакция доигрывает, затем покой и подсказка. Чужой или устаревший id — ok, без изменений.
  function strokeStop(name, id) {
    return act(
      name,
      (step) => {
        const bad = gestureId(id);
        if (bad) return bad;
        const was = build();
        step.applied = true;
        if (!session.play.strokeStop(id)) return { ok: true, changed: false, save: report([]) };
        return { ok: true, changed: !same(was, build()), save: report([]) };
      },
      { sync: false },
    );
  }

  // Перенос предмета указателем — узкий внутренний вход границы жеста (как room.drag): drag(toy, [u, v]) — где предмет был
  // бы под указателем (единицы рисунка; первый вызов — где он нарисован сейчас: катившийся мячик останавливается там);
  // drop({ roll }) — отпустили после заметного сдвига (порог — у отображения; roll — бросок мячика в единицах, знак —
  // направление); cancel() — отмена (предмет на месте до жеста). Место и докат — ядро.
  const inPlay = () => {
    if (session.view().open !== 'play') return fail('not-open', 'Предметы — только в открытой «Поиграть».');
    if (!session.play.floored()) return fail('unsupported', 'Пол «Поиграть» не объявлен отображением (setDisplay({ playFloor })).');
    return null;
  };
  const toyAct = (name, body) =>
    act(
      `toy.${name}`,
      (step) => {
        const was = build();
        const result = body(step);
        return result.ok === false ? result : { ok: true, changed: !same(was, build()), save: report([]), ...result };
      },
      { sync: false },
    );
  const toy = Object.freeze({
    drag: (id, at) =>
      toyAct('drag', (step) => {
        if (!TOYS.includes(id) || !point(at)) return fail('invalid-argument', 'Перенос предмета — drag(bowl | ball, [u, v]).');
        const refused = nearby() ?? inPlay();
        if (refused) return refused;
        step.applied = true;
        session.play.dragTo(id, at);
        return {};
      }),
    drop: (options) =>
      toyAct('drop', (step) => {
        if (options !== undefined && !(isRecord(options) && Object.keys(options).every((key) => key === 'roll') && (options.roll === undefined || Number.isFinite(options.roll)))) return fail('invalid-argument', 'Отпустили — { roll?: число }.');
        if (!session.play.dragging()) return { changed: false, outcome: null, text: '' };
        step.applied = true;
        const s = sense();
        const item = session.play.dragging();
        const outcome = session.play.drop(options ?? {});
        return { outcome, text: outcome && outcome !== 'dropped' ? playText(outcome, item, s.kind, s.name) : '' };
      }),
    cancel: () =>
      toyAct('cancel', (step) => {
        step.applied = true;
        return session.play.dragCancel() ? {} : { changed: false };
      }),
  });

  // ---------- «Обустроить уголок» (§ 6.4, сценарий § 6.8; editor.mjs) ----------

  // Только в открытом редакторе (not-open); предмет — доступный показанному питомцу на этой ступени (unknown-id); точка —
  // [x, y] единиц сцены 400×250. Предмет — собственный ключ черновика, а не in: унаследованные constructor, toString,
  // __proto__ — unknown-id до изменения выбора, черновика и переноса (по независимой проверке PL04.3).
  const roomAct = (name, body, { sync = false } = {}) =>
    act(
      `room.${name}`,
      (step) => {
        if (session.view().open !== 'room' || !draft) return fail('not-open', 'Редактор комнаты не открыт.');
        const was = build();
        const result = body(step);
        return result.ok === false ? result : { ok: true, changed: !same(was, build()), save: step.save ?? report([]), ...result };
      },
      { sync },
    );
  const itemOf = (id) => (typeof id !== 'string' ? fail('invalid-argument', 'Предмет — строка ID.') : Object.hasOwn(draft.pos, id) ? null : fail('unknown-id', `Предмета «${id}» нет в этой комнате.`));
  const told = (list) => {
    for (const text of list) effects.push({ type: 'announce', text });
  };
  const room = Object.freeze({
    // Выбрать предмет для шага кнопками; во время переноса — ничего.
    select: (id) =>
      roomAct('select', (step) => {
        const bad = itemOf(id);
        if (bad) return bad;
        step.applied = true;
        Editor.select(draft, id);
        return {};
      }),
    // Одним шагом в черновик — то же, что drag + drop (программное размещение).
    move: (id, at) =>
      roomAct('move', (step) => {
        const bad = itemOf(id) ?? (point(at) ? null : fail('invalid-argument', 'Точка — [x, y] единиц сцены.'));
        if (bad) return bad;
        step.applied = true;
        told(Editor.move(draft, id, at));
        return {};
      }),
    // Шаг 10 единиц выбранным, у преграды — сколько можно; некуда — changed: false и объявление упора; во время переноса —
    // ничего.
    nudge: (dir) =>
      roomAct('nudge', (step) => {
        if (!Editor.ROOM_DIRS.includes(dir)) return fail('invalid-argument', 'Направление — left, right, up или down.');
        step.applied = true;
        const result = Editor.step(draft, dir);
        told(result.told);
        return result.moved ? {} : { changed: false };
      }),
    // Обычная расстановка в черновик (перенос сначала отменён); постоянная — после save.
    reset: () =>
      roomAct('reset', (step) => {
        step.applied = true;
        told(Editor.reset(draft));
        return {};
      }),
    // Перенос: первый вызов начинает его и выбирает предмет (ручное действие), следующие двигают; другой предмет сначала
    // отменяет прежний перенос. Черновик не меняется до drop.
    drag: (id, at) =>
      roomAct('drag', (step) => {
        const bad = itemOf(id) ?? (point(at) ? null : fail('invalid-argument', 'Точка — [x, y] единиц сцены.'));
        if (bad) return bad;
        step.applied = true;
        if (!draft.drag) session.cancelScene();
        told(Editor.drag(draft, id, at));
        return {};
      }),
    drop: () =>
      roomAct('drop', (step) => {
        step.applied = true;
        const result = Editor.drop(draft);
        if (!result) return { changed: false };
        told(result);
        return {};
      }),
    // Отмена только текущего переноса: черновик с прежними правками остаётся, редактор открыт, без объявления.
    dragCancel: () =>
      roomAct('dragCancel', (step) => {
        step.applied = true;
        return Editor.dragCancel(draft) ? {} : { changed: false };
      }),
    // «Сохранить»: идущий перенос отменяется, а не дописывается; пишутся только передвинутые здесь предметы показанного
    // питомца, отличные от подтверждённого (сверено перед решением), и его предметы, несохранённые сейчас — после отказа
    // записи, в том числе позднего, пришедшего уже при открытом редакторе (по независимой проверке PL04.3: иначе такой
    // предмет «Не сохранено» в черновике, а save — «не изменилась» без записи). Без изменений — выход без записи.
    // Синхронно: успех — выход; отказ — редактор открыт, черновик цел, failed, поля несохранённые (память ключа, § 8.4).
    // Асинхронно — выход сразу, расстановка действует в памяти (pending), итог — поздним объявлением. Скрытых повторов нет.
    save: () =>
      roomAct(
        'save',
        (step) => {
          step.applied = true;
          const { kind, stage } = draft;
          const moved = Editor.prepare(draft, roomPos(kind, stage, { committed: true }), roomUnsaved(kind));
          if (!Object.keys(moved).length) {
            const fresh = toCorner(step);
            told([Editor.ROOM_TEXT.same]);
            return { closed: true, text: Editor.ROOM_TEXT.same, fresh };
          }
          const late = (ok, after) => {
            if (after) effects.push({ type: 'announce', text: ok ? Editor.ROOM_TEXT.saved : Editor.ROOM_TEXT.late });
          };
          const fields = Object.fromEntries(Object.entries(moved).map(([id, p]) => [`${kind}.${id}`, [...p]]));
          apply(step, { writes: [{ key: 'room', fields, onSettle: late }] });
          const result = step.save.results.room;
          if (result === 'failed') {
            draft.failed = true;
            told([`${Editor.ROOM_TEXT.failed}.`]);
            return { closed: false, text: `${Editor.ROOM_TEXT.failed}.`, fresh: [] };
          }
          const text = result === 'saved' ? Editor.ROOM_TEXT.saved : '';
          const fresh = toCorner(step);
          if (text) told([text]);
          return { closed: true, text, fresh };
        },
        { sync: true },
      ),
    // Отменить весь редактор: перенос и черновик отброшены, вид — уголок. Объявление честное: несохранённая прежде
    // расстановка (отказ записи) действует до перезагрузки.
    cancel: () =>
      roomAct(
        'cancel',
        (step) => {
          step.applied = true;
          const text = roomUnsaved(draft.kind).length ? Editor.ROOM_TEXT.kept : Editor.ROOM_TEXT.cancelled;
          const fresh = toCorner(step);
          told([text]);
          return { text, fresh };
        },
        { sync: true },
      ),
  });

  // ---------- место legacy-отображения и «устроился» ----------

  // Место и вид legacy-отображения (ключ place): правка — простые данные { раздел: { поле: строка } }, проверенные
  // отображением (места, вид, PLACE_MEDIA и раскладка — у него); запись — операцией ключа ядра через его подключение,
  // память ключа (несохранённое, поглощение другой вкладки) — ядро. Совпало с памятью — без записи.
  const setPlace = (patch) =>
    act('setPlace', (step) => {
      const shape = 'Место — { раздел: { поле: строка } }.';
      if (!isRecord(patch) || !Object.keys(patch).length || Object.values(patch).some((fields) => !isRecord(fields) || !Object.keys(fields).length || Object.values(fields).some((value) => typeof value !== 'string'))) return fail('invalid-argument', shape);
      const raw = memory().raw.place;
      const fields = {};
      for (const [section, own] of Object.entries(patch)) for (const [field, value] of Object.entries(own)) if (at(raw, `${section}.${field}`) !== value) fields[`${section}.${field}`] = value;
      if (!Object.keys(fields).length) return unchanged();
      apply(step, { writes: [{ key: 'place', fields }] });
      return { ok: true, changed: true, save: step.save };
    });

  // Питомец устроился на новом месте или виде по действию владельца (раскладка — legacy-отображение): без анимации — ничего;
  // иначе эффект arrive (анимацию появления делает отображение) и декоративный отклик «устроился» (в тишине и поверх другой
  // реакции не играет, пауза повтора — режиссёр).
  const arrive = () =>
    act(
      'arrive',
      (step) => {
        const s = sense();
        if (status !== 'running' || s.hidden || session.motion(s) === 'none') return { ok: true, changed: false, save: report([]), arrived: false };
        const was = build();
        step.applied = true;
        effects.push({ type: 'arrive' });
        session.react('settle');
        return { ok: true, changed: !same(was, build()), save: report([]), arrived: true };
      },
      { sync: false },
    );

  // Узкий вход legacy-раскладки (остаётся и после PL04.3, § 11.1, § 14.1.3): смена места страницы без смены вида — сценка и
  // попытка отменяются. Места и их раскладка (PLACE_MEDIA, окно) — у legacy-отображения и в ядро не переходят, смену вида
  // целиком/портрет ядро узнаёт само по setDisplay({ full }); контейнер PL07 мест не имеет. Это не общая отмена: виды,
  // жесты, питомец, облик и присутствие отменяют сценку своими командами.
  const stopScene = () =>
    act(
      'stopScene',
      (step) => {
        const was = build();
        step.applied = true;
        session.cancelScene();
        return { ok: true, changed: !same(was, build()), save: report([]) };
      },
      { sync: false },
    );

  // ---------- состояние, подписка, отключение ----------

  const getState = () => closed;

  // Неверный слушатель или настройки — журнал и пустая отписка (подписки нет), без исключения.
  function subscribe(listener, options) {
    if (typeof listener !== 'function') {
      warnQuiet('subscribe: слушатель — функция');
      return () => {};
    }
    if (options !== undefined && !(isRecord(options) && Object.keys(options).every((key) => key === 'initial') && (options.initial === undefined || typeof options.initial === 'boolean'))) {
      warnQuiet('subscribe: настройки — { initial?: boolean }');
      return () => {};
    }
    const initial = options?.initial ?? true;
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
    draft = null;
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
    open,
    close: shut,
    setPresence,
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
    setDisplay,
    interact,
    stroke,
    toy,
    room,
    setPlace,
    arrive,
    stopScene,
  });
}
