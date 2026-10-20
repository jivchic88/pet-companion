// Персонаж (минимальный режим, U01; docs/ARCHITECTURE.md § 19): экземпляр без DOM и без хранения — реакции продукта,
// реплики, тишина и контекст страницы, видимость, уменьшение движения, покой (моргание, одиночные движения, дремота),
// отключение. Правила — те же модули, что у полного ядра: режиссёр (core/director.mjs: одна реакция и одна отложенная,
// приоритеты, паузы повторов, тишина по независимым причинам, фон), выбор реплик (core/phrases.mjs), порты часов,
// случайности, планировщика и журнала (core/ports.mjs) и общий раунд доставки копии модуля (core/round.mjs: команда из
// слушателя выполняется сразу, слушатели получают обновления после фазы работы, не больше одного на фазу). Чего здесь нет
// — ступеней, лакомства, комнаты, игры, присутствия, сценок и девяти ключей хранения: имя и награды — у продукта.
//
// Команды — те же формы, что у pet-companion/core: успех { ok: true, changed, …поля }, отказ { ok: false, error: { code,
// message } } без изменений (invalid-argument, unknown-id, already-started, reentrant, destroyed, internal); исключений
// команды не бросают. Снимок — глубоко замороженный, одна ссылка до изменения. Отказ планировщика — эффект warning и
// журнал, ничего не зависает: реакция без задачи конца снимается сразу, облако без задачи гашения не появляется.

import { ACTIVITY_MS, blinkDelay, createDirector, finish, MICRO_DEFAULT_MS, MICRO_MS, microDelay, playing, REACTION_MIN_MS, request, REST_AFTER_MS, setBackground, setQuiet } from '../core/director.mjs';
import { describe, fail, PetError } from '../core/errors.mjs';
import { cleanName } from '../core/pets.mjs';
import { pickPhrase } from '../core/phrases.mjs';
import { portProblem, systemClock, systemLog, systemRandom, systemScheduler } from '../core/ports.mjs';
import * as Round from '../core/round.mjs';
import { ATTENTIVE_POSE, CALM_POSE, characterModel, defineCharacter, REST_POSE } from './define.mjs';

const OPTIONS = ['character', 'name', 'clock', 'random', 'scheduler', 'log'];
// Причины тишины — независимы (как у полного ядра): ввод в поле, диктовка, таймер, важный диалог продукта.
export const QUIET_REASONS = Object.freeze(['timer', 'dictation', 'dialog', 'typing']);
export const MOTIONS = Object.freeze(['normal', 'calm', 'none']);
const TEXT_MAX = 200;
const CONTROL = /[\u0000-\u001f\u007f]/;

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

// Создание — синхронно, без таймеров, записи и вызовов слушателей; неверные настройки или описание — исключение PetError
// (invalid-options; definition-invalid с path, unsupported-format — от defineCharacter).
export function createCharacter(options) {
  if (!isRecord(options)) throw new PetError('invalid-options', 'Настройки персонажа — объект.');
  for (const key of Object.keys(options)) if (!OPTIONS.includes(key)) throw new PetError('invalid-options', `Неизвестная настройка: ${key}.`);
  if (!Object.hasOwn(options, 'character')) throw new PetError('invalid-options', 'character — описание персонажа (defineCharacter).');
  const def = defineCharacter(options.character);
  if (options.name !== undefined && typeof options.name !== 'string') throw new PetError('invalid-options', 'name — строка.');
  const problem = portProblem(options);
  if (problem) throw new PetError('invalid-options', problem);
  return instance({
    model: characterModel(def),
    name: cleanName(options.name ?? ''),
    clock: options.clock ?? systemClock,
    random: options.random ?? systemRandom,
    scheduler: options.scheduler ?? systemScheduler,
    log: options.log ?? systemLog,
  });
}

function instance({ model, name: initialName, clock, random, scheduler, log }) {
  const d = createDirector(model.table);
  const order = Round.nextOrder();
  const self = { order, close, deliver };
  let status = 'created';
  let alive = true;
  let generation = 0; // destroy увеличивает: поздний вызов прежней задачи ничего не делает
  const tasks = new Map(); // имя → { gen, undo, placing, early }
  let name = initialName;
  const prefs = { motion: 'normal', phrases: true };
  let reduced = false;
  let visible = true;
  let focus = false;
  let resting = false;
  let lastActivity = 0;
  let phrase = null; // { text, until }
  let lastPhrase = '';
  let seq = 0;
  let effects = [];
  let reason = null;
  let gone = false;
  let dying = false;
  const listeners = [];

  const now = () => clock.now();
  const quiet = () => d.quiet.size > 0;
  const motion = () => (reduced ? 'none' : prefs.motion);
  const active = () => status === 'started' && alive && visible;
  const display = () => name || model.def.title;
  const fill = (text) => text.replaceAll('{name}', display());

  const warnQuiet = (message, error) => {
    try {
      log.warn(message, error);
    } catch {
      // журнал сам отказал — ничего не делаем
    }
  };
  // Сбой оркестровки (планировщик, порт): эффект warning и журнал; изменение остаётся.
  function fault(message, error) {
    effects.push({ type: 'warning', code: 'internal', message });
    warnQuiet(message, error);
  }

  // ---------- задачи (порт scheduler) ----------

  function later(key, ms, body) {
    cancel(key);
    if (ms === null || ms === undefined || !alive) return true;
    const token = { gen: generation, undo: null, placing: true, early: false };
    tasks.set(key, token);
    let undo;
    try {
      undo = scheduler.later(ms, () => fire(key, token, body));
    } catch (error) {
      if (tasks.get(key) === token) tasks.delete(key);
      fault(`задача ${key} не запланирована`, error);
      return false;
    } finally {
      token.placing = false;
    }
    token.undo = typeof undo === 'function' ? undo : null;
    if (!token.early) return true;
    cancel(key);
    fault(`задача ${key} не запланирована: планировщик выполнил её внутри later`);
    return false;
  }

  function fire(key, token, body) {
    if (!alive || token.gen !== generation || tasks.get(key) !== token) return;
    if (token.placing) {
      token.early = true;
      return;
    }
    tasks.delete(key);
    Round.run(order, () => {
      reason = key;
      try {
        body();
      } catch (error) {
        fault(`задача ${key} не выполнена`, error);
      }
      Round.touch(self);
    });
  }

  function cancel(key) {
    const token = tasks.get(key);
    if (!token) return;
    tasks.delete(key);
    try {
      token.undo?.();
    } catch (error) {
      fault(`задача ${key} не отменена`, error);
    }
  }

  function cancelAll() {
    for (const key of [...tasks.keys()]) cancel(key);
  }

  // ---------- реплики и реакции ----------

  function hush() {
    phrase = null;
    cancel('phrase');
  }

  // Облако — если не тихо и реплики включены; без задачи гашения облака нет.
  function say(text) {
    if (!text || !prefs.phrases || quiet()) return;
    const ms = model.timings.phrase;
    phrase = { text, until: now() + ms };
    if (!later('phrase', ms, () => hush())) phrase = null;
  }

  function stop() {
    cancel('reaction');
    hush();
  }

  // Итог режиссёра: play — реакция началась (задача конца ставится первой: без неё реакция снята сразу), stop —
  // остановлена. Реплика — текст продукта (text) или группа реакции; объявление скринридеру — по реакции (announce).
  function begin(result) {
    if (result.action === 'stop') {
      stop();
      return false;
    }
    if (result.action !== 'play') return false;
    const r = d.current;
    r.id = ++seq;
    resting = false;
    if (!later('reaction', Math.max(REACTION_MIN_MS, r.until - now()), end)) {
      d.current = null;
      hush();
      return false;
    }
    const row = model.table[r.type];
    let text = r.text ?? '';
    if (!text && row.phrases) {
      const raw = pickPhrase(model.bank, row.phrases, { last: lastPhrase, random });
      lastPhrase = raw;
      text = fill(raw);
    }
    say(text);
    if (row.announce && text) effects.push({ type: 'announce', text });
    return true;
  }

  function end() {
    const next = finish(d, now());
    if (next.action === 'play') begin(next);
    scheduleRest();
  }

  function quietOn(key, on) {
    if (d.quiet.has(key) === on) return;
    const result = setQuiet(d, key, on, now());
    if (on) hush();
    begin(result);
  }

  // ---------- покой ----------

  function micro(kind) {
    if (!active() || motion() === 'none' || quiet() || playing(d, now()) || resting) return;
    effects.push({ type: 'micro', kind, ms: Object.hasOwn(MICRO_MS, kind) ? MICRO_MS[kind] : MICRO_DEFAULT_MS });
  }

  function scheduleBlink() {
    if (active())
      later('blink', blinkDelay(motion(), random, model.timings), () => {
        micro('blink');
        scheduleBlink();
      });
  }

  function scheduleMicro() {
    if (active() && model.micro.length)
      later('micro', microDelay(motion(), random, model.timings), () => {
        micro(model.micro[Math.min(model.micro.length - 1, Math.floor(random() * model.micro.length))]);
        scheduleMicro();
      });
  }

  // Дремота — после REST_AFTER_MS без действий (только если у персонажа есть поза rest), если тихо не стало и ничего не играет.
  function scheduleRest() {
    if (!active() || resting || !model.rest) return;
    const left = REST_AFTER_MS - (now() - lastActivity);
    later('rest', Math.max(1000, left), () => {
      if (now() - lastActivity >= REST_AFTER_MS && !quiet() && !playing(d, now())) resting = true;
      else scheduleRest();
    });
  }

  function scheduleIdle() {
    scheduleBlink();
    scheduleMicro();
    scheduleRest();
  }

  function visibility(on) {
    if (visible === on) return false;
    visible = on;
    setBackground(d, !on);
    if (status !== 'started') return true;
    if (!on) {
      cancelAll();
      hush();
      return true;
    }
    if (model.rest && now() - lastActivity >= REST_AFTER_MS && !quiet()) resting = true;
    scheduleIdle();
    return true;
  }

  // ---------- снимок, закрытие и доставка (раунд копии модуля) ----------

  function build() {
    const r = d.current;
    const q = quiet();
    const base = resting && !q && model.rest ? REST_POSE : (q || focus) && model.attentive ? ATTENTIVE_POSE : CALM_POSE;
    const reaction = r ? { id: r.id ?? 0, type: r.type, pose: r.pose, until: r.until } : null;
    return {
      status,
      character: { id: model.def.id, title: model.def.title },
      name: { value: name, display: display() },
      prefs: { motion: prefs.motion, phrases: prefs.phrases, reducedMotion: reduced, effectiveMotion: motion() },
      context: { focus, quiet: QUIET_REASONS.filter((key) => d.quiet.has(key)) },
      visible,
      resting,
      pose: { base, shown: reaction ? reaction.pose : base, reaction },
      phrase: phrase ? { ...phrase } : null,
    };
  }

  let closed = freeze(build());

  function close() {
    if (gone) return;
    if (status === 'destroyed') {
      gone = true;
      closed = freeze(build());
      effects = [];
      Round.drop(self);
      Round.push({ core: self, update: freeze({ snapshot: closed, effects: [], reason: 'destroyed' }) });
      return;
    }
    const next = build();
    const changed = !same(next, closed);
    if (!changed && !effects.length) {
      reason = null;
      return;
    }
    if (changed) closed = freeze(next);
    const list = effects;
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

  function deliver({ update, seq: n }) {
    for (const record of [...listeners]) {
      if (!record.active || n <= record.since) continue;
      if (status === 'destroyed' && update.reason !== 'destroyed') break;
      call(record, update);
    }
    if (update.reason === 'destroyed') {
      for (const record of listeners) record.active = false;
      listeners.length = 0;
    }
  }

  // ---------- команды ----------

  // Отключён → destroyed; фаза работы другого вызова (порт) → reentrant без изменений; иначе своя фаза работы: тело,
  // отметка изменения, доставка после возврата. Исключение тела — internal (изменения тела, если были, остаются в снимке).
  function command(label, body) {
    if (status === 'destroyed') return fail('destroyed', 'Персонаж отключён.');
    if (Round.working()) return fail('reentrant', 'Команда вызвана во время обработки другого вызова (из порта).');
    return Round.run(order, () => {
      reason = label;
      const before = build();
      let result;
      try {
        result = body();
      } catch (error) {
        warnQuiet(`${label}: внутренний сбой`, error);
        Round.touch(self);
        return fail('internal', `Внутренний сбой: ${describe(error)}.`);
      }
      Round.touch(self);
      if (!result.ok) return result;
      return { ...result, changed: !same(before, build()) };
    });
  }

  const argument = (message) => fail('invalid-argument', message);
  const flagsOf = (value, allowed, what) => {
    if (!isRecord(value)) return `${what} — объект`;
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) return `${what}: неизвестное поле ${key}`;
      if (typeof value[key] !== 'boolean') return `${what}.${key} — true или false`;
    }
    return '';
  };

  const start = () =>
    command('start', () => {
      if (status !== 'created') return fail('already-started', 'Персонаж уже запущен.');
      status = 'started';
      lastActivity = now();
      scheduleIdle();
      return { ok: true };
    });

  // Реакция продукта: id — из словаря описания; key — постоянный id события (повтор в этом экземпляре не играет дважды);
  // text — реплика этого случая вместо группы (только текст: без разметки, до 200 знаков). До start реакции не играют.
  const react = (type, options) =>
    command('react', () => {
      if (typeof type !== 'string' || !Object.hasOwn(model.table, type)) return fail('unknown-id', `Реакции «${String(type)}» нет в описании персонажа.`);
      if (options !== undefined && !isRecord(options)) return argument('Настройки реакции — объект { key?, text? }.');
      const o = options ?? {};
      for (const key of Object.keys(o)) if (key !== 'key' && key !== 'text') return argument(`Настройки реакции: неизвестное поле ${key}.`);
      if (o.key !== undefined && (typeof o.key !== 'string' || !o.key)) return argument('key — непустая строка.');
      if (o.text !== undefined && (typeof o.text !== 'string' || o.text.length > TEXT_MAX || CONTROL.test(o.text))) return argument(`text — строка до ${TEXT_MAX} знаков без управляющих символов.`);
      const text = (o.text ?? '').trim();
      if (status !== 'started') return { ok: true, played: false, queued: false, duplicate: false };
      const key = o.key ?? '';
      const duplicate = Boolean(key) && d.handled.has(key);
      const result = request(d, type, { now: now(), key, context: focus ? 'focus' : 'calm', extra: text ? { text } : {} });
      const played = begin(result);
      return { ok: true, played, queued: result.action === 'queue', duplicate };
    });

  const setName = (value) =>
    command('setName', () => {
      if (typeof value !== 'string') return argument('Имя — строка.');
      name = cleanName(value);
      return { ok: true, name: display() };
    });

  const setContext = (flags) =>
    command('setContext', () => {
      const problem = flagsOf(flags, ['focus', ...QUIET_REASONS], 'Контекст');
      if (problem) return argument(problem);
      if ('focus' in flags) focus = flags.focus;
      for (const key of QUIET_REASONS) if (key in flags) quietOn(key, flags[key]);
      return { ok: true };
    });

  const setPreferences = (value) =>
    command('setPreferences', () => {
      if (!isRecord(value)) return argument('Настройки — объект { motion?, phrases? }.');
      for (const key of Object.keys(value)) if (key !== 'motion' && key !== 'phrases') return argument(`Настройки: неизвестное поле ${key}.`);
      if (value.motion !== undefined && !MOTIONS.includes(value.motion)) return argument(`motion — ${MOTIONS.join(', ')}.`);
      if (value.phrases !== undefined && typeof value.phrases !== 'boolean') return argument('phrases — true или false.');
      const was = motion();
      if (value.motion !== undefined) prefs.motion = value.motion;
      if (value.phrases !== undefined) prefs.phrases = value.phrases;
      if (!prefs.phrases) hush();
      if (motion() !== was) scheduleIdle();
      return { ok: true };
    });

  const setVisible = (on) =>
    command('setVisible', () => {
      if (typeof on !== 'boolean') return argument('setVisible — true или false.');
      visibility(on);
      return { ok: true };
    });

  const setReducedMotion = (on) =>
    command('setReducedMotion', () => {
      if (typeof on !== 'boolean') return argument('setReducedMotion — true или false.');
      if (reduced !== on) {
        reduced = on;
        scheduleIdle();
      }
      return { ok: true };
    });

  // Действие пользователя: пробуждение и отсчёт покоя заново — не чаще ACTIVITY_MS, кроме пробуждения.
  const activity = () =>
    command('activity', () => {
      const t = now();
      if (t - lastActivity < ACTIVITY_MS && !resting) return { ok: true, woke: false };
      lastActivity = t;
      const woke = resting;
      resting = false;
      if (active()) scheduleRest();
      return { ok: true, woke };
    });

  const getState = () => closed;

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

  function teardown() {
    if (status === 'destroyed') return;
    status = 'destroyed';
    alive = false;
    generation += 1;
    cancelAll();
    d.current = null;
    d.pending = null;
    phrase = null;
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
    react,
    setName,
    setContext,
    setPreferences,
    setVisible,
    setReducedMotion,
    activity,
  });
}
