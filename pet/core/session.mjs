// Ядро: сессия экземпляра (docs/ARCHITECTURE.md § 4.4–4.5, § 5.1, § 6.4, § 10; срез PL04.1) — проигрывание реакций и их
// продолжения, память обработанных событий и пауз повторов, тишина и контекст страницы, активность, покой (моргание,
// одиночные движения, зевок, дремота), местная полночь, видимость, уменьшение движения, реплики и облако, приветствие.
// Только память экземпляра: она живёт до destroy, «Скрыть» и «Показать» её не сбрасывают (исправление Р1). Время,
// случайность и задачи — порты clock, random, scheduler; хранение, счёт и решения среза PL03 — у экземпляра (index.mjs),
// который даёт чтение (sense: показанный питомец, настройки, ступень, лакомство), пересчёт счёта и дня (refresh) и раунд
// для сработавшей задачи (run). Сессия ничего не пишет и слушателей не вызывает: эффекты (emit) и сбои оркестровки (fault)
// копит экземпляр — сбой даёт результат с degraded, эффект warning internal и журнал (§ 5.5).
//
// Отказ планировщика (later бросил или выполнил задачу внутри себя, отмена бросила) сессия не бросает дальше: остальная
// оркестровка продолжается, а то, что без своей задачи осталось бы навсегда, не показывается — реакция без задачи конца
// снята вместе с облаком, облако без задачи — не появляется. Повторного планирования нет.
//
// Временная граница до PL04.2/PL04.3 — простые данные, без DOM и колбэков с правилами: sight = { around, view } (питомец на
// виду и открытый вид — пока присутствие и виды у отображения), source открытия ('pet' | 'call'), занятость жестом (busy),
// прямой запрос отклика игры, предметов, «устроился» и сценки (react), остановка сценки (stopScene); эффекты
// { type: 'scene', step: 'cancel' | 'start' | 'end', key } — сигналы оставшемуся у отображения конвейеру редкой сценки.

import { ACTIVITY_MS, basePose, blinkDelay, createDirector, effectiveMotion, finish, GREET_MS, MICRO_MS, microDelay, microKinds, OPEN_MICRO_MS, PHRASE_MS, playing, REACTIONS, REACTION_MIN_MS, request, REST_AFTER_MS, setBackground, setQuiet, YAWN_CHANCE } from './director.mjs';
import { pickPhrase } from './phrases.mjs';
import { profileOf } from './pets.mjs';

// Причины тишины — независимы: снятие одной не снимает другие.
export const QUIET_REASONS = ['timer', 'dictation', 'dialog', 'typing'];

export function createSession({ clock, random, scheduler, sense, emit, fault, run, refresh }) {
  const d = createDirector();
  let started = false;
  let alive = true;
  // Поколение задач: destroy увеличивает — поздний вызов прежней задачи ничего не делает, даже если планировщик её не снял.
  let generation = 0;
  const tasks = new Map(); // имя → { gen, undo }
  let focus = false;
  let visible = true;
  let reduced = false;
  let busy = false; // идёт жест указателем (поглаживание, предмет, перенос в редакторе) — временный вход до PL04.3
  let sight = { around: true, view: null };
  let resting = false;
  let lastActivity = 0;
  let phrase = null; // облако на странице: { text, short, until }
  let scenePhrase = ''; // реплика открытого уголка и «Поиграть»
  let lastPhrase = '';
  let seq = 0; // номер реакции — отличить новую реакцию с той же позой и показ сценки
  let applied = null; // последнее согласованное: питомец, «скрыт», движение, реплики

  const now = () => clock.now();
  const quiet = () => d.quiet.size > 0;
  const motionOf = (s) => effectiveMotion(s, reduced);
  // Полночь — служебная (питомец не спрятан, вкладка видна); декоративное — только пока питомец на виду.
  const live = (s) => started && alive && !s.hidden && visible;
  const active = (s) => live(s) && sight.around;
  const contextNow = () => (focus ? 'focus' : 'calm');

  // ---------- задачи ----------

  // Именованная задача: новое планирование того же имени отменяет прежнее; ms === null — только отмена. Возвращает false,
  // если планировщик отказал: later бросил или выполнил задачу внутри себя (§ 4.3) — задачи нет, сбой отмечен.
  function later(name, ms, body) {
    cancel(name);
    if (ms === null || ms === undefined || !alive) return true;
    const token = { gen: generation, undo: null, placing: true, early: false };
    tasks.set(name, token);
    let undo;
    try {
      undo = scheduler.later(ms, () => fire(name, token, body));
    } catch (error) {
      if (tasks.get(name) === token) tasks.delete(name);
      fault(`задача ${name} не запланирована`, error);
      return false;
    } finally {
      token.placing = false;
    }
    token.undo = typeof undo === 'function' ? undo : null;
    if (!token.early) return true;
    cancel(name);
    fault(`задача ${name} не запланирована: планировщик выполнил её внутри later`);
    return false;
  }

  // Сработала: только своя (не отменённая, не заменённая) задача живого экземпляра того же поколения — своим раундом.
  // Вызов изнутри later — не срабатывание, а отказ постановки (later его отметит).
  function fire(name, token, body) {
    if (!alive || token.gen !== generation || tasks.get(name) !== token) return;
    if (token.placing) {
      token.early = true;
      return;
    }
    tasks.delete(name);
    run(name, body);
  }

  // Отмена: задача снята до вызова отмены планировщика — если та бросила, поздний вызов ничего не сделает (fire), сбой
  // отмечен.
  function cancel(name) {
    const token = tasks.get(name);
    if (!token) return;
    tasks.delete(name);
    try {
      token.undo?.();
    } catch (error) {
      fault(`задача ${name} не отменена`, error);
    }
  }

  function cancelAll() {
    for (const name of tasks.keys()) cancel(name);
  }

  // ---------- реплики ----------

  function hush() {
    phrase = null;
    cancel('phrase');
  }

  // Облако — на странице, если не тихо (явный отклик в тишине — только реплика открытого вида); реплики выключены — ничего.
  // Без задачи PHRASE_MS облака нет (оно не осталось бы навсегда); реплика вида остаётся до следующей, как всегда.
  function say(s, text, short = '') {
    if (!text || !s.phrases) return;
    lastPhrase = text;
    if (!quiet()) phrase = { text, short, until: now() + PHRASE_MS };
    if (sight.view !== null) scenePhrase = text;
    const placed = later('phrase', PHRASE_MS, () => {
      phrase = null;
    });
    if (!placed) phrase = null;
  }

  // ---------- реакции ----------

  function stop() {
    cancel('reaction');
    hush();
  }

  // Итог режиссёра: play — реакция началась (поза, примерка и вещь — её поля, реплика, срок), stop — остановлена.
  // Конец — задача reaction, она ставится первой: без неё реакция снята сразу (вместе с облаком; ждущая сценка события
  // отменена), а сбой после её постановки (реплика) не оставляет реакцию навсегда. В конце — продолжение того же события
  // или отложенная; иначе — сигнал конвейеру сценки. Возвращает, идёт ли реакция.
  function begin(result) {
    if (result.action === 'stop') {
      stop();
      return false;
    }
    if (result.action !== 'play') return false;
    const r = d.current;
    r.id = ++seq;
    resting = false;
    if (!later('reaction', Math.max(REACTION_MIN_MS, r.until - now()), () => end(r))) {
      d.current = null;
      hush();
      if (r.event !== undefined) emit({ type: 'scene', step: 'cancel' });
      return false;
    }
    if (r.event !== undefined) emit({ type: 'scene', step: 'start', key: r.event });
    const s = sense();
    const group = r.phrases ?? REACTIONS[r.type].phrases;
    if (r.say) say(s, r.say, r.sayShort ?? '');
    else if (group) say(s, pickPhrase(group, { last: lastPhrase, stage: s.stage, kind: s.kind, random }));
    return true;
  }

  function end(r) {
    const next = finish(d, now());
    if (next.action === 'play') begin(next);
    else if (r.event !== undefined) emit({ type: 'scene', step: 'end', key: r.event });
    scheduleRest(sense());
  }

  // Запрос режиссёру (до start реакций нет). Сценка без анимации — статичная поза своей длительности (still).
  function react(type, { key = '', context = contextNow(), extra = {}, explicit = false } = {}) {
    if (!started || !alive) return { played: false, duplicate: false, queued: false, id: null };
    const t = now();
    const own = REACTIONS[type]?.scene && motionOf(sense()) === 'none' ? { ...extra, until: t + REACTIONS[type].still } : extra;
    const duplicate = Boolean(key) && d.handled.has(key);
    const result = request(d, type, { now: t, key, context, extra: own, explicit });
    const played = begin(result);
    return { played, duplicate, queued: result.action === 'queue', id: played ? d.current.id : null };
  }

  // Отмена сценки: ждущая у отображения не начнётся (эффект), идущая останавливается — прерванная не возобновляется.
  function cancelScene() {
    if (!started) return;
    emit({ type: 'scene', step: 'cancel' });
    if (playing(d, now()) && REACTIONS[d.current.type].scene) {
      d.current = null;
      stop();
    }
  }

  // ---------- тишина и контекст ----------

  function quietOn(reason, on) {
    if (d.quiet.has(reason) === on) return;
    if (on) cancelScene();
    const result = setQuiet(d, reason, on, now());
    if (on) hush();
    begin(result);
  }

  // flags — проверенные булевы: focus — экран занятия (поза внимания), остальные — независимые причины тишины. Переданное
  // меняется, непереданное сохраняется.
  function context(flags) {
    if ('focus' in flags) focus = flags.focus;
    for (const reason of QUIET_REASONS) if (reason in flags) quietOn(reason, flags[reason]);
  }

  // ---------- покой ----------

  function micro(s, kind) {
    if (!active(s) || motionOf(s) === 'none' || quiet() || playing(d, now()) || resting || busy) return;
    emit({ type: 'micro', kind, ms: MICRO_MS[kind] ?? 600 });
  }

  function scheduleBlink(s) {
    if (active(s))
      later('blink', blinkDelay(motionOf(s), random), () => {
        micro(sense(), 'blink');
        scheduleBlink(sense());
      });
  }

  // Одиночное движение или (обычное движение, не экран занятия, не жест, 18 %) зевок.
  function scheduleMicro(s) {
    if (active(s))
      later('micro', microDelay(motionOf(s), random), () => {
        const t = sense();
        const kinds = microKinds(t.kind);
        if (motionOf(t) === 'normal' && !focus && !busy && random() < YAWN_CHANCE) begin(request(d, 'yawn', { now: now(), context: 'calm' }));
        else micro(t, kinds[Math.floor(random() * kinds.length)]);
        scheduleMicro(sense());
      });
  }

  // Дремота — после REST_AFTER_MS без действий, если тихо не стало и ничего не играет; иначе проверка позже.
  function scheduleRest(s) {
    if (!active(s) || resting) return;
    const left = REST_AFTER_MS - (now() - lastActivity);
    later('rest', Math.max(1000, left), () => {
      if (now() - lastActivity >= REST_AFTER_MS && !quiet() && !playing(d, now())) resting = true;
      else scheduleRest(sense());
    });
  }

  // Местная полночь: интервал — до начала следующего местного дня по clock.nextDay (а не 24 часа); следующая граница —
  // сразу (сбой счёта хоста её не обрывает), затем счёт, день и лакомство заново (refresh). Приветствия полночь не создаёт.
  // Отказ clock.nextDay — сбой оркестровки: полночь не запланирована, остальное (приветствие, пересчёт дня) идёт; день всё
  // равно пересчитывают команды и возврат.
  function scheduleMidnight(s) {
    if (!live(s)) return;
    const t = now();
    let left;
    try {
      left = clock.nextDay(t) - t;
    } catch (error) {
      fault('полночь не запланирована', error);
      return;
    }
    if (!Number.isFinite(left)) {
      fault('полночь не запланирована: clock.nextDay вернул не момент времени');
      return;
    }
    later('midnight', Math.max(1000, left), () => {
      scheduleMidnight(sense());
      refresh();
    });
  }

  function scheduleIdle(s) {
    scheduleBlink(s);
    scheduleMicro(s);
    scheduleRest(s);
    scheduleMidnight(s);
  }

  // Новый режим движения (настройка, системное «уменьшить движение», другая вкладка): сценка отменяется, интервалы покоя
  // заново. Реакция и облако доигрывают.
  function restartIdle(s) {
    cancelScene();
    scheduleIdle(s);
  }

  // Питомец больше не на виду или сменился показанный: прежний ничего не доигрывает — задачи, реакция и отложенная,
  // облако; тишина, обработанные события и паузы повторов остаются.
  function drop() {
    cancelAll();
    d.current = null;
    d.pending = null;
    cancelScene();
    hush();
    resting = false;
    lastActivity = now();
    lastPhrase = '';
  }

  // ---------- входы ----------

  // Запуск (один раз): отсчёт покоя, задачи покоя и полуночи; приветствие дня (решение и запись — index.mjs) — через
  // GREET_MS, пока вкладка видна. Спрятан — ни задач, ни приветствия.
  function start(greet, s) {
    started = true;
    lastActivity = now();
    applied = view(s);
    if (s.hidden) return;
    scheduleIdle(s);
    if (greet && visible)
      later('greet', GREET_MS, () => {
        begin(request(d, 'greet', { now: now(), key: `greet:${greet.day}`, context: contextNow(), extra: greet.welcome ? { phrases: 'welcome' } : {} }));
      });
  }

  // Действие пользователя: пробуждение и отсчёт покоя заново — не чаще ACTIVITY_MS, кроме пробуждения.
  function activity(s) {
    const t = now();
    if (t - lastActivity < ACTIVITY_MS && !resting) return false;
    lastActivity = t;
    const woke = resting;
    resting = false;
    if (active(s)) scheduleRest(s);
    return woke;
  }

  // Фон: реакция и отложенная, облако и все задачи сняты, сценка отменена; пока фон, режиссёр ничего не начинает и не
  // откладывает (setBackground) — ни событием, ни снятием тишины, ни прямым откликом, — и задач не ставится, поэтому
  // возврат ничего не доигрывает. Память событий, причины тишины и паузы повторов остаются. Возврат (не спрятан): дремота
  // после REST_AFTER_MS без действий, счёт, день и лакомство заново, задачи заново; без приветствия.
  function visibility(on, s) {
    if (visible === on) return false;
    visible = on;
    setBackground(d, !on);
    if (!started) return true;
    if (!on) {
      cancelAll();
      hush();
      cancelScene();
      return true;
    }
    if (s.hidden) return true;
    if (now() - lastActivity >= REST_AFTER_MS && !quiet()) resting = true;
    refresh();
    scheduleIdle(sense());
    return true;
  }

  // «Скрыть»: реакция и отложенная, облако, сценка и все задачи (вместе с полуночью) сняты; память событий, тишина и паузы
  // повторов остаются. «Показать»: отсчёт покоя, задачи покоя и полуночи заново; приветствия нет.
  function hidden(value, s) {
    if (started) {
      if (value) {
        cancelAll();
        d.current = null;
        d.pending = null;
        cancelScene();
        hush();
        resting = false;
      } else {
        lastActivity = now();
        scheduleIdle(s);
      }
    }
    applied = view(s);
  }

  // Питомец на виду и открытый вид (временный вход). Ушёл (по зову закрыли) — ничего не доигрывает, остаётся полночь.
  // Открыли (source 'pet' — уголок; 'call' — вызов сразу в «Поиграть»): реплика вида — по позе до пробуждения, пробуждение,
  // задачи (по зову — все), движение «заметил гостя» (не при вызове). «Поиграть» и редактор будят.
  function see(next, source, s) {
    const was = sight;
    sight = next;
    if (!started) return;
    if (was.around && !next.around) {
      drop();
      scheduleMidnight(s);
      return;
    }
    if (was.view === null && next.view !== null) {
      scenePhrase = s.phrases ? pickPhrase(resting ? 'rest' : 'scene', { last: lastPhrase, stage: s.stage, kind: s.kind, random }) : '';
      lastPhrase = scenePhrase || lastPhrase;
      resting = false;
      lastActivity = now();
      if (!was.around) scheduleIdle(s);
      else scheduleRest(s);
      if (source !== 'call' && visible)
        later('open-micro', OPEN_MICRO_MS, () => {
          const t = sense();
          micro(t, profileOf(t.kind).open[random() < 0.5 ? 0 : 1]);
        });
      return;
    }
    if ((next.view === 'play' || next.view === 'room') && next.view !== was.view) {
      resting = false;
      lastActivity = now();
    }
    if (!was.around && next.around) scheduleIdle(s);
  }

  function setBusy(on) {
    busy = on;
  }

  function setReduced(on, s) {
    if (reduced === on) return false;
    reduced = on;
    if (started) restartIdle(s);
    return true;
  }

  const view = (s) => ({ kind: s.kind, hidden: s.hidden, motion: s.motion, phrases: s.phrases });

  // Согласование с настройками (своя команда или изменение другой вкладки, поглощённое ядром): другой питомец или
  // «скрыт» — прежний ничего не доигрывает, реплика вида — нового (спрятан — без неё), задачи заново; новое движение —
  // restartIdle; реплики выключены — облако и реплика вида исчезают.
  function reconcile(s) {
    if (!started || !alive) return;
    const was = applied;
    const next = view(s);
    applied = next;
    if (!was) return;
    if (was.hidden !== next.hidden || was.kind !== next.kind) {
      drop();
      scenePhrase = was.hidden === next.hidden && sight.view !== null && next.phrases ? pickPhrase('scene', { last: lastPhrase, stage: s.stage, kind: s.kind, random }) : '';
      if (!next.hidden) scheduleIdle(s);
      return;
    }
    if (was.motion !== next.motion) restartIdle(s);
    if (was.phrases && !next.phrases) {
      hush();
      scenePhrase = '';
    }
  }

  // Подтверждённое лакомство — действие владельца: проснулся, отсчёт заново, реакция «ест» → «доволен».
  function fed(reaction) {
    lastActivity = now();
    resting = false;
    return react(reaction.type, { key: reaction.key, context: 'calm', extra: reaction.extra });
  }

  function destroy() {
    alive = false;
    generation += 1;
    cancelAll();
  }

  // Часть снимка (простые данные). page — итоговая поза страницы (правило paint 0.1.4: поза реакции, кроме сценки и прямого
  // действия «Поиграть» в тишине, иначе base); still — спокойная или довольная без тишины и дремоты.
  function state(s) {
    const r = d.current;
    const q = quiet();
    const base = basePose({ quiet: q, focus, resting, content: s.content });
    const reaction = r
      ? { id: r.id ?? 0, type: r.type, pose: r.pose, until: r.until, explicit: Boolean(r.explicit), scene: Boolean(REACTIONS[r.type]?.scene), toward: r.toward ?? '', mini: r.mini ?? '', tryOn: r.tryOn ?? '' }
      : null;
    return {
      pose: { base, still: basePose({ content: s.content }), page: reaction && !reaction.scene && !(reaction.explicit && q) ? reaction.pose : base, resting, reaction },
      phrase: phrase ? { ...phrase } : null,
      scenePhrase,
      context: { focus, quiet: QUIET_REASONS.filter((reason) => d.quiet.has(reason)) },
      visible,
      reducedMotion: reduced,
      effectiveMotion: motionOf(s),
    };
  }

  return {
    start,
    react,
    fed,
    handled: (key) => d.handled.has(key),
    sight: () => ({ ...sight }),
    context,
    activity,
    visibility,
    hidden,
    see,
    setBusy,
    setReduced,
    reconcile,
    stopScene: cancelScene,
    state,
    destroy,
  };
}
