// Ядро: сессия экземпляра (docs/ARCHITECTURE.md § 4.4–4.5, § 5.1, § 6.4, § 9, § 10; срезы PL04.1 и PL04.2) — проигрывание
// реакций и их продолжения, память обработанных событий и пауз повторов, тишина и контекст страницы, активность, покой
// (моргание, одиночные движения, зевок, дремота), местная полночь, видимость, уменьшение движения, реплики и облако,
// приветствие; с PL04.2 — открытый вид и его источник, присутствие (поверхность и «на виду»), объявление отображения
// (setDisplay) и редкая сценка: выбор, попытка, отмена и резервирование дня (порт scenes).
// Только память экземпляра: она живёт до destroy, «Скрыть» и «Показать» её не сбрасывают (исправление Р1). Время,
// случайность и задачи — порты clock, random, scheduler; хранение, счёт и решения среза PL03 — у экземпляра (index.mjs),
// который даёт чтение (sense: показанный питомец, настройки, присутствие, ступень, лакомство, копия дня сценки), пересчёт
// счёта и дня (refresh), раунд для сработавшей задачи (run) и для шагов резервирования (stage), свежую копию дня (mirror) и
// её запись (keep). Сессия сама ничего не пишет и слушателей не вызывает: эффекты (emit) и сбои оркестровки (fault) копит
// экземпляр — сбой даёт результат с degraded, эффект warning internal и журнал (§ 5.5).
//
// Отказ планировщика (later бросил или выполнил задачу внутри себя, отмена бросила) сессия не бросает дальше: остальная
// оркестровка продолжается, а то, что без своей задачи осталось бы навсегда, не показывается — реакция без задачи конца
// снята вместе с облаком, облако без задачи — не появляется. Повторного планирования нет.
//
// Временная граница до PL04.3 — простые данные, без DOM и колбэков с правилами: занятость жестом (busy; начало жеста —
// ручное действие, отменяет сценку), прямой запрос отклика игры, предметов и «устроился» (react), отмена сценки сменой
// места legacy-раскладки (stopScene). Ручные действия (manual: кормление, готовое имя, отклики игры и предметов) отменяют
// сценку окончательно — правило ядра, не оболочки.

import { ACTIVITY_MS, basePose, blinkDelay, createDirector, effectiveMotion, finish, GREET_MS, MICRO_MS, microDelay, microKinds, OPEN_MICRO_MS, PHRASE_MS, playing, REACTIONS, REACTION_MIN_MS, request, REST_AFTER_MS, setBackground, setQuiet, YAWN_CHANCE } from './director.mjs';
import { pickPhrase } from './phrases.mjs';
import { kindOf, profileOf } from './pets.mjs';
import { petAround, presenceSurface } from './presence.mjs';
import { pickScene, SCENE_FRESH_MS, sceneCommit, sceneFits, sceneOptions, sceneText, sceneWaited } from './scenes.mjs';

// Причины тишины — независимы: снятие одной не снимает другие.
export const QUIET_REASONS = ['timer', 'dictation', 'dialog', 'typing'];
// Смысловые виды: уголок, «Поиграть», «Обустроить уголок». Какие есть — объявляет отображение (setDisplay({ views })).
export const VIEW_IDS = ['corner', 'play', 'room'];
// Исходы резервирования (§ 9.1).
const OUTCOMES = ['shown', 'skip', 'fail', 'lost'];
const CLOSED = Object.freeze({ open: null, source: '' });

export function createSession({ clock, random, scheduler, sense, emit, fault, run, refresh, scenes = null, mirror = () => null, keep = () => {}, stage = () => false, guard = (fn) => fn(), intact = () => true, warn = () => {} }) {
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
  // Открытый вид и источник открытия (pet — уголок или кнопка питомца, call — вызов «по зову»); источник — до закрытия.
  let view = CLOSED;
  // Объявление отображения (§ 6.4, setDisplay): full — показ целиком (иначе портрет), moving — идёт перенос, pets —
  // нарисованные питомцы (null — не объявлено: все зарегистрированные), views — виды (не объявлено — ни одного), scenes —
  // объявленные сценки { petId: [sceneId, …] } (null — не объявлено: ни одной; это разрешение, а не ограничение).
  let display = { full: true, moving: false, pets: null, views: [], scenes: null };
  let attempt = null; // попытка сценки: { type, key, day, at, until, kind } — до решения резервирования, отмены или срока
  // Идущее резервирование: { attempt, step, id, patch, type, cancelled, settled }; step — queued → decided (решение
  // отклонено или ещё идёт) → reserved (решение дало запись) → shown (реакция сценки началась). cancelled — отменено до
  // начала показа (решение и показ отклоняются окончательно), settled — исход уже получен.
  let inflight = null;
  const checked = new Set(); // события, для которых сценку уже выбирали (одна попытка на событие), — до destroy
  let resting = false;
  let lastActivity = 0;
  let phrase = null; // облако на странице: { text, short, until }
  let scenePhrase = ''; // реплика открытого уголка и «Поиграть»
  let lastPhrase = '';
  let seq = 0; // номер реакции — отличить новую реакцию с той же позой и показ сценки
  let applied = null; // последнее согласованное: питомец, «скрыт», движение, реплики, присутствие, облик

  const now = () => clock.now();
  const quiet = () => d.quiet.size > 0;
  const motionOf = (s) => effectiveMotion(s, reduced);
  // Питомец на виду: не спрятан и рядом («Всегда рядом») либо вызван (открыт вид). Видимость вкладки — отдельно (visible).
  const around = (s) => petAround({ mode: s.mode, hidden: s.hidden, open: view.open !== null });
  // Полночь — служебная (питомец не спрятан, вкладка видна); декоративное — только пока питомец на виду.
  const live = (s) => started && alive && !s.hidden && visible;
  const active = (s) => live(s) && around(s);
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
    if (view.open !== null) scenePhrase = text;
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
  // отменена), а сбой после её постановки (реплика) не оставляет реакцию навсегда. Реакция занятия (event) началась —
  // ждала тишины дольше перехода: ждущая сценка этого события отменяется, а не переносится (sceneWaited). Возвращает, идёт
  // ли реакция.
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
      if (r.event !== undefined) attempt = null;
      return false;
    }
    if (r.event !== undefined && attempt?.key === r.event && sceneWaited(attempt, now())) attempt = null;
    const s = sense();
    const group = r.phrases ?? REACTIONS[r.type].phrases;
    if (r.say) say(s, r.say, r.sayShort ?? '');
    else if (group) say(s, pickPhrase(group, { last: lastPhrase, stage: s.stage, kind: s.kind, random }));
    return true;
  }

  // Конец реакции: продолжение того же события или отложенная; иначе — покой и, если реакция была реакцией занятия с
  // выбранной сценкой, её показ (если всё ещё уместна).
  function end(r) {
    const next = finish(d, now());
    if (next.action === 'play') begin(next);
    scheduleRest(sense());
    if (next.action !== 'play' && r.event !== undefined) sceneSoon(r.event);
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

  // Отмена сценки (а не откладывание), окончательная и сразу: ждущая попытка снята, идущее резервирование, ещё не начавшее
  // показ, помечено отменённым — его решение и показ отклоняются (skip), что бы ни случилось потом (действие кончилось,
  // тишина снята); идущая сценка останавливается — прерванная не возобновляется. Начатый показ и его запись дня при этом не
  // отменяются: исход shown запишет копию (§ 9.3).
  function cancelScene() {
    attempt = null;
    if (inflight && inflight.step !== 'shown') inflight.cancelled = true;
    if (!started) return;
    if (playing(d, now()) && REACTIONS[d.current.type].scene) {
      d.current = null;
      stop();
    }
  }

  // Ручное действие владельца (кормление, готовое имя, прямой отклик игры и предметов): сначала окончательная отмена сценки
  // (и тогда, когда отклик не сыгран — пауза повтора, не менее важная реакция), затем отклик. Лимиты, паузы повторов и
  // приоритеты — прежние; наград у ручных действий нет.
  function manual(type, options) {
    cancelScene();
    return react(type, options);
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
  // меняется, непереданное сохраняется. Ввод в поле (typing: true) отменяет сценку и тогда, когда тишина ввода уже идёт.
  function context(flags) {
    if (flags.typing === true) cancelScene();
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
  // облако, сценка; тишина, обработанные события и паузы повторов остаются.
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
  // GREET_MS, пока вкладка видна. Спрятан — ни задач, ни приветствия; «по зову» и не вызван — только полночь.
  function start(greet, s) {
    started = true;
    lastActivity = now();
    applied = shape(s);
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

  // «Скрыть»: вид закрыт; реакция и отложенная, облако, сценка и все задачи (вместе с полуночью) сняты; память событий,
  // тишина и паузы повторов остаются. «Показать»: отсчёт покоя, задачи покоя и полуночи заново (по зову и не вызван —
  // только полночь); вид не открывается, приветствия нет.
  function hidden(value, s) {
    if (value) view = CLOSED;
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
    applied = shape(s);
  }

  // Открыт вид (проверенный: поддерживается, не спрятан). Из закрытого (source — pet или call; источник — до закрытия):
  // реплика вида по позе до пробуждения, пробуждение, задачи (вызванный по зову — все), движение «заметил гостя» (не при
  // вызове). Смена вида: «Поиграть» и редактор будят. Любое открытие и смена вида отменяют сценку.
  function openView(next, source, s) {
    const was = view;
    const before = around(s);
    view = { open: next, source: was.open === null ? source : was.source };
    cancelScene();
    if (!started) return;
    if (was.open === null) {
      scenePhrase = s.phrases ? pickPhrase(resting ? 'rest' : 'scene', { last: lastPhrase, stage: s.stage, kind: s.kind, random }) : '';
      lastPhrase = scenePhrase || lastPhrase;
      resting = false;
      lastActivity = now();
      if (!before) scheduleIdle(s);
      else scheduleRest(s);
      if (source !== 'call' && visible)
        later('open-micro', OPEN_MICRO_MS, () => {
          const t = sense();
          micro(t, profileOf(t.kind).open[random() < 0.5 ? 0 : 1]);
        });
      return;
    }
    if ((next === 'play' || next === 'room') && next !== was.open) {
      resting = false;
      lastActivity = now();
    }
  }

  // Вид закрыт: сценка отменена; «по зову» — питомец ушёл и ничего не доигрывает, остаётся полночь.
  function closeView(s) {
    const before = around(s);
    view = CLOSED;
    cancelScene();
    if (!started) return;
    if (before && !around(s)) {
      drop();
      scheduleMidnight(s);
    }
  }

  // Временная граница до PL04.3: начало жеста указателем — ручное действие, сценка отменена окончательно; конец жеста
  // ничего не возвращает.
  function setBusy(on) {
    if (on) cancelScene();
    busy = on;
  }

  function setReduced(on, s) {
    if (reduced === on) return false;
    reduced = on;
    if (started) restartIdle(s);
    return true;
  }

  // Объявление отображения (проверенное, нормализованное ядром): переданное свойство заменяет прежнее целиком, не
  // переданное сохраняется. Изменение full, объявления scenes и начало переноса (moving) отменяют сценку и попытку.
  function setDisplay(next) {
    const was = display;
    display = { ...display, ...next };
    const cancelled = ('full' in next && next.full !== was.full) || ('scenes' in next && JSON.stringify(next.scenes) !== JSON.stringify(was.scenes)) || (next.moving === true && !was.moving);
    if (cancelled) cancelScene();
    return JSON.stringify(display) !== JSON.stringify(was);
  }

  const shape = (s) => ({ kind: s.kind, hidden: s.hidden, motion: s.motion, phrases: s.phrases, mode: s.mode, coat: s.coat, accessory: s.accessory });

  // Согласование с настройками (своя команда или изменение другой вкладки, поглощённое ядром): другой питомец или
  // «скрыт» — прежний ничего не доигрывает, вид закрыт (спрятан), реплика вида — нового (спрятан — без неё), задачи заново;
  // другое присутствие — сценка отменена, поверхность меняется тихо: «по зову» и не вызван — ушёл (остаётся полночь), снова
  // рядом — задачи заново, без приветствия, открытый вид и источник остаются; другой облик или аксессуар — сценка отменена;
  // новое движение — restartIdle; реплики выключены — облако и реплика вида исчезают.
  function reconcile(s) {
    const was = applied;
    const next = shape(s);
    if (next.hidden) view = CLOSED;
    if (!started || !alive) return;
    applied = next;
    if (!was) return;
    if (was.hidden !== next.hidden || was.kind !== next.kind) {
      drop();
      scenePhrase = was.hidden === next.hidden && view.open !== null && next.phrases ? pickPhrase('scene', { last: lastPhrase, stage: s.stage, kind: s.kind, random }) : '';
      if (!next.hidden) scheduleIdle(s);
      return;
    }
    if (was.mode !== next.mode) {
      cancelScene();
      const before = petAround({ mode: was.mode, hidden: was.hidden, open: view.open !== null });
      const after = around(s);
      if (before && !after) {
        drop();
        scheduleMidnight(s);
      } else if (!before && after) scheduleIdle(s);
    }
    if (was.coat !== next.coat || was.accessory !== next.accessory) cancelScene();
    if (was.motion !== next.motion) restartIdle(s);
    if (was.phrases && !next.phrases) {
      hush();
      scenePhrase = '';
    }
  }

  // Подтверждённое лакомство — ручное действие владельца: сценка отменена окончательно, проснулся, отсчёт заново, реакция
  // «ест» → «доволен».
  function fed(reaction) {
    lastActivity = now();
    resting = false;
    return manual(reaction.type, { key: reaction.key, context: 'calm', extra: reaction.extra });
  }

  // ---------- редкие сценки (§ 7.1.1, § 9) ----------
  // Выбор, реальный допуск и резервирование — разные шаги. Выбор — при подтверждённом занятии с реакцией (одна попытка на
  // событие); попытка ждёт конца реакции этого события; уместность — перед резервированием и ещё раз в decide, после всех
  // ожиданий, по часам в момент решения. Отмена между шагами попытку не переносит.

  // Показ целиком: объявлен отображением (место страницы) или открыт вид (уголок рисует питомца целиком).
  const fullNow = () => display.full || view.open !== null;
  // Допустимые сценки показанного питомца сейчас (пересечение § 7.1.1); нет резервирования — ни одной.
  const optionsOf = (s) => (scenes ? sceneOptions(kindOf(s.kind), display.scenes, fullNow()) : []);

  // Подтверждённое занятие с реакцией (не в тишине «спрятан» и не «по зову» закрытым): одна попытка на событие — шанс и
  // вариант по random только среди допустимых (пусто — без броска, попытка всё равно использована); без counted и при
  // празднике (stage — ступень к празднику без учёта вида) — сценки нет. Новое событие заменяет прежнюю попытку. Реакции
  // этого события нет — не идёт и не отложена (фон, отказ планировщика, пропущена) — попытки нет: её конец не наступит;
  // бросок при этом тот же (порядок random 0.1.4).
  function choose({ key, outcome, stage, day, at }, s) {
    if (!started || !alive) return;
    const type = pickScene({ key, checked, outcome, celebrate: stage, day, record: s.scene, kind: s.kind, available: optionsOf(s), random });
    const waits = d.current?.event === key || d.pending?.event === key;
    attempt = type && waits ? { type, key, day, at, until: at + SCENE_FRESH_MS, kind: s.kind } : null;
  }

  // Уместна ли попытка сейчас: тот же питомец, тот же местный день, не позже срока, питомец на виду и вкладка видна,
  // тишины нет, ничего не играет, «Поиграть» и редактор закрыты, переноса и жеста нет, вариант допустим.
  function fits(next, s) {
    const t = now();
    return (
      next.kind === s.kind &&
      next.day === clock.day(t) &&
      !busy &&
      sceneFits(next, { now: t, shown: active(s), quiet: quiet(), playing: playing(d, t), play: view.open === 'play' || view.open === 'room', moving: display.moving, kind: s.kind, full: fullNow(), available: optionsOf(s) })
    );
  }

  // Реакция события key доиграла и ничего не продолжилось: если сценка этого события всё ещё уместна — резервирование.
  function sceneSoon(key) {
    const next = attempt;
    if (next?.key !== key) return;
    if (inflight || !fits(next, sense())) {
      attempt = null;
      return;
    }
    reserve(next);
  }

  // Порт резервирования (§ 9.1): reserve(decide, show) → Promise<'shown' | 'skip' | 'fail' | 'lost'>, никогда не
  // отклоняется. decide и show — синхронные функции ядра. Нарушение порта (бросил, отклонил, вернул не исход, вызвал
  // decide или show не по порядку) — диагностика и безопасный исход, без необработанных ошибок.
  function reserve(next) {
    const token = { attempt: next, step: 'queued', id: null, patch: null, type: next.type, cancelled: false, settled: false };
    inflight = token;
    let pending;
    try {
      pending = scenes.reserve(
        (stored) => decide(token, stored),
        () => show(token),
      );
    } catch (error) {
      pending = Promise.reject(error);
    }
    Promise.resolve(pending)
      .then(
        (result) => (OUTCOMES.includes(result) ? { result } : { result: 'fail', broken: [`резервирование сценки вернуло не исход: ${String(result)}`] }),
        (error) => ({ result: 'fail', broken: ['резервирование сценки отказало (порт бросил или отклонил обещание)', error] }),
      )
      .then((outcome) => done(token, outcome));
  }

  // Шаг 3 (§ 9.2) — внутри защищённого участка, после всех ожиданий, синхронно: решение одно на резервирование (повторный
  // вызов — null). Решение — критическая фаза раунда (guard): экземпляр жив, попытка та же и не отменена (иначе skip);
  // попытка использована — дальше только этот исход; заново уместность по часам сейчас (срок, местный день, тишина,
  // видимость, присутствие, вид, перенос, жест, вариант и объявление); день не занят ни в записи резервирования (stored:
  // undefined — записи нет, не объект — повреждена: не свободный день), ни в свежей копии scene (через координатор:
  // mirror). Метка вкладки by — по random и clock. Отказ чтения копии или порта — исключение: адаптер отвечает fail.
  // Команда, вызванная портом изнутри, — reentrant (§ 5.4); destroy из порта — в конце фазы, и решение тогда null: запись
  // годна, только если конец фазы пуст (ни destroy, ни слушателей, ни журнала) и экземпляр после неё жив, а попытка не
  // отменена. Только тогда шаг — reserved: адаптер ставит запись и сразу вызывает show.
  function decide(token, stored) {
    if (token.step !== 'queued') return null;
    token.step = 'decided';
    const decision = guard(() => judge(token, stored));
    if (!decision || !alive || token.cancelled) return null;
    token.patch = decision.patch;
    token.step = 'reserved';
    return decision.record;
  }

  function judge(token, stored) {
    if (!alive || token.cancelled || token.settled || attempt !== token.attempt) return null;
    attempt = null;
    const next = token.attempt;
    const s = sense();
    if (!fits(next, s)) return null;
    const copy = mirror();
    const terms = { day: next.day, today: clock.day(now()), by: '-', kind: s.kind, type: next.type, fits: true };
    if (!sceneCommit(stored, copy, terms)) return null;
    const record = sceneCommit(stored, copy, { ...terms, by: `${now().toString(36)}-${Math.floor(random() * 0x100000000).toString(36)}` });
    return { record, patch: { day: record.day, by: record.by, ...(kindOf(s.kind) === 'cat' ? { cat: record.cat } : {}) } };
  }

  // Шаг 4 — сразу после постановки записи, в том же синхронном шаге, что decide: начало показа — реакция сценки
  // единственного режиссёра (без анимации — статичная поза still), своим раундом: слушатели получают её после начала
  // показа. Показ начат (step shown) — только когда реакция началась и экземпляр не отключается; иначе исключение, и адаптер
  // откатывает уже поставленную запись (lost): решения с записью нет или исход уже получен, попытку отменили, экземпляр
  // отключён (stage не выполнился), режиссёр или планировщик отказали, destroy запрошен портом во время начала (выполнится
  // в конце этой фазы — слушатели начала показа не увидят). Повторный вызов после начала — тот же показ.
  function show(token) {
    if (token.step === 'shown') return;
    if (token.step !== 'reserved' || token.cancelled || token.settled) throw new Error(`показ сценки не начат: нет решения с записью (шаг ${token.step}${token.cancelled ? ', отменено' : ''})`);
    const ran = stage('scene', () => {
      const s = sense();
      const result = react(token.type, { extra: { say: sceneText(token.type, s.name), sayShort: sceneText(token.type) } });
      if (!result.played) throw new Error('сценка не началась');
      if (!intact()) {
        d.current = null;
        stop();
        throw new Error('показ сценки не начат: экземпляр отключается');
      }
      token.id = result.id;
      token.step = 'shown';
    });
    if (!ran) throw new Error('показ сценки не начат: экземпляр отключён');
  }

  // Шаг 6 — исход только живому экземпляру и только этой попытке, своим раундом: shown — копия дня scene обычной неявной
  // операцией хранения (прерванный показ день не освобождает); lost — остановить только ещё свою текущую реакцию этой
  // попытки; skip, fail — ничего. После destroy — ничего (нарушение порта — в журнал).
  function done(token, { result, broken = null }) {
    token.settled = true;
    if (inflight === token) inflight = null;
    let issue = broken;
    if (!issue && result === 'shown' && token.step !== 'shown') issue = [`резервирование сценки: исход shown без показа (шаг ${token.step})`];
    if (!issue && result !== 'shown' && result !== 'lost' && token.step === 'shown') issue = [`резервирование сценки: исход ${result} после начала показа`];
    const ran = stage('scene', () => {
      if (issue) warn(...issue);
      if (attempt === token.attempt) attempt = null;
      if (result === 'shown' && token.patch) keep(token.patch);
      else if (result !== 'shown' && token.step === 'shown' && token.id !== null && d.current?.id === token.id) {
        d.current = null;
        stop();
        scheduleRest(sense());
      }
    });
    if (!ran && issue) warn(...issue);
  }

  function destroy() {
    alive = false;
    generation += 1;
    attempt = null;
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
      presence: { mode: s.mode, hidden: s.hidden, surface: presenceSurface(s.mode, s.hidden), around: around(s) },
      view: { ...view },
      display: {
        full: display.full,
        moving: display.moving,
        pets: display.pets ? [...display.pets] : null,
        views: [...display.views],
        scenes: display.scenes ? Object.fromEntries(Object.entries(display.scenes).map(([id, list]) => [id, [...list]])) : null,
      },
      scene: { waiting: attempt ? { type: attempt.type, until: attempt.until } : null, reserving: inflight !== null },
    };
  }

  return {
    start,
    react,
    manual,
    fed,
    handled: (key) => d.handled.has(key),
    view: () => view,
    display: () => display,
    around,
    context,
    activity,
    visibility,
    hidden,
    openView,
    closeView,
    setBusy,
    setReduced,
    setDisplay,
    reconcile,
    choose,
    cancelScene,
    state,
    destroy,
  };
}
