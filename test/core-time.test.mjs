// Ядро PL04.1 в Node — время и жизненный цикл (docs/ARCHITECTURE.md § 4.1, § 4.4–4.5, § 5.4, § 6.4, § 10): ручные часы
// с местным днём и сменой пояса, ручной планировщик, заданный random (test/core-kit.mjs). Планировщик: именованная замена,
// отмена, поздний вызов, один start, до start ни задач, ни реакций, destroy до срабатывания, задачи прежнего поколения и
// другого ядра, ошибки и повторный вход из clock, random, scheduler, log, отсутствие утечек. Покой: моргание, движения и
// зевок по заданной случайности; normal, calm, none и «уменьшить движение»; дремота через 3 мин, пробуждение, предел
// activity 500 мс; запреты при тишине, реакции, фоне, «скрыт» и жесте; поза покоя. Календарь: задача местной полуночи по
// clock.nextDay (смена пояса — не 24 ч), новый день лакомства, скачок часов, фон через полночь, пересчёт дня командами;
// приветствие через 0,9 с один раз за день, welcome после паузы, спрятан, «по зову», фон, повторный start, без второй записи
// дня и без приветствия при «Показать» и возврате. Доставка: те же входы на синхронном и асинхронном координаторе,
// команды и исключения подписчиков, destroy в доставке, два ядра, сверка перед решением, поставленная запись после destroy.
// Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { REACTIONS } from '../pet/core/director.mjs';
import { createPetCore } from '../pet/core/index.mjs';
import { PHRASES } from '../pet/core/phrases.mjs';
import { calendar, DAY, host, journal, life, manual, planner } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };
const started = (initial = { cat: CAT }, parts = {}) => {
  const L = life(initial, { counts: host(1, 1), ...parts });
  assert.equal(L.core.start().ok, true);
  return L;
};
const playing = (L) => L.state().pose.reaction?.type ?? null;
const micros = (L) => L.effects('micro').map((effect) => `${effect.kind} ${effect.ms}`);
const plannedMs = (L) => L.plan.live().map((item) => item.ms);
const saved = (L, key, extra = {}) => L.core.notify('saved', { key, counted: true, ...extra });
const DAY_MS = 86_400_000;

// ---------- Г. Планировщик и жизненный цикл ----------

test('задачи: повторное планирование того же имени отменяет прежнее; отменённая, сработав поздно, ничего не делает', () => {
  const L = started();
  L.core.react('pet', { explicit: true });
  const first = L.state().phrase;
  L.plan.advance(2000);
  L.core.react('paw', { explicit: true });
  const second = L.state().phrase;
  assert.notEqual(second.text, '');
  const stale = L.plan.all.filter((item) => !item.live && item.ms === 3200);
  assert.equal(stale.length, 1, 'облако первой реплики — заменено');
  L.plan.advance(first.until - L.time.state.now + 100);
  assert.deepEqual(L.state().phrase, second, 'срок прежнего облака прошёл — новое на месте');
  const updates = L.seen.length;
  stale[0].task();
  assert.deepEqual([L.state().phrase, L.seen.length], [second, updates], 'поздний вызов отменённой — без изменений и обновлений');
  L.plan.advance(second.until - L.time.state.now);
  assert.equal(L.state().phrase, null);
});

test('до start ни задач, ни случайности, ни реакций; start — один раз', () => {
  const L = life({ cat: CAT }, { counts: host(1, 1) });
  L.core.setContext({ typing: true, focus: true });
  L.core.setContext({ typing: false });
  L.core.setSight({ around: true, view: 'corner' });
  L.core.activity();
  L.core.setVisible(false);
  L.core.setVisible(true);
  L.core.setReducedMotion(true);
  assert.deepEqual([L.core.react('pet', { explicit: true }).played, saved(L, 'k').reacted, L.core.notify('failed', null).reacted], [false, false, false]);
  assert.deepEqual([L.plan.calls, L.random.state.taken, playing(L), L.effects('scene')], [0, 0, null, []]);
  assert.equal(L.state().context.focus, true, 'контекст до start запомнен');
  assert.equal(L.core.start().ok, true);
  const calls = L.plan.calls;
  assert.ok(calls > 0);
  assert.equal(L.core.start().error.code, 'already-started');
  assert.equal(L.plan.calls, calls, 'повторный start ничего не планирует');
  assert.equal(saved(L, 'k').duplicate, false, 'событие до start не учитывалось');
});

test('destroy до срабатывания: все задачи сняты; поздние вызовы прежнего ядра не трогают ни его, ни новое ядро того же хранилища', () => {
  const A = started();
  saved(A, 'a');
  const tasks = A.plan.live();
  assert.ok(tasks.length >= 5);
  const writes = A.store.writes.length;
  A.core.destroy();
  assert.deepEqual([A.plan.live().length, A.state().status], [0, 'destroyed']);
  const seen = A.seen.length;
  for (const item of tasks) item.task();
  assert.deepEqual([A.seen.length, A.store.writes.length, A.state().status], [seen, writes, 'destroyed'], 'поздние вызовы — без обновлений и записей');
  const B = life({}, { storage: A.storage, counts: host(1, 1) });
  B.core.start();
  const state = B.state();
  const bSeen = B.seen.length;
  for (const item of tasks) item.task();
  assert.deepEqual([B.state(), B.seen.length], [state, bSeen], 'новое ядро не затронуто');
  assert.equal(saved(B, 'a').duplicate, false);
});

test('нет утечек задач: «Скрыть», фон, по зову и destroy снимают; «Показать» и возврат планируют заново', () => {
  const L = started();
  assert.deepEqual(plannedMs(L).sort((a, b) => a - b), [20_000, 67_500, 180_000, 50_400_000], 'моргание, движение, дремота, полночь');
  L.core.hide();
  assert.equal(L.plan.live().length, 0, 'спрятан — ни одной (и полночи)');
  L.core.show();
  assert.equal(L.plan.live().length, 4);
  L.core.setVisible(false);
  assert.equal(L.plan.live().length, 0, 'фон');
  L.core.setVisible(true);
  assert.equal(L.plan.live().length, 4);
  L.core.setSight({ around: false, view: null });
  assert.deepEqual(plannedMs(L), [50_400_000], 'по зову и не вызван — только полночь');
  L.core.setSight({ around: true, view: 'play', source: 'call' });
  assert.equal(L.plan.live().length, 4, 'вызван — покой заново');
  L.core.destroy();
  assert.equal(L.plan.live().length, 0);
});

test('ошибки портов: scheduler, random, clock.nextDay бросают — хост исключения не получает, журнал и warning; повторный вход — reentrant без изменений', () => {
  const failing = (parts) => {
    const site = life({ cat: CAT }, { counts: host(1, 1) });
    const log = journal();
    const time = calendar();
    const core = createPetCore({ storage: site.storage, progress: () => ({ marks: 1, today: 1 }), clock: time.port, random: () => 0.5, scheduler: { later: () => () => {} }, log: log.port, ...parts(time) });
    const warnings = [];
    core.subscribe((update) => warnings.push(...update.effects.filter((effect) => effect.type === 'warning').map((effect) => effect.code)), { initial: false });
    return { core, log, warnings };
  };
  const scheduler = failing(() => ({ scheduler: { later: () => {
    throw new Error('планировщик упал');
  } } }));
  const placed = scheduler.core.start();
  assert.deepEqual([placed.ok, placed.degraded, scheduler.core.getState().status, [...new Set(scheduler.warnings)]], [true, true, 'running', ['internal']], 'отказ планировщика — тоже честный degraded (подробно — core-scheduler.test.mjs)');
  assert.ok(scheduler.log.list.some((line) => line.includes('не запланирована: планировщик упал')), scheduler.log.list.join(' | '));
  const random = failing(() => ({ random: () => {
    throw new Error('random упал');
  } }));
  const start = random.core.start();
  assert.deepEqual([start.ok, start.degraded, random.core.getState().status, random.warnings], [true, true, 'running', ['internal']], 'сбой после применения — честный degraded');
  assert.equal(random.core.setName('Пух').ok, true, 'ядро работает дальше');
  const nextDay = failing((time) => ({ clock: { ...time.port, nextDay: () => {
    throw new Error('nextDay упал');
  } } }));
  const day = nextDay.core.start();
  assert.deepEqual([day.ok, day.degraded, nextDay.warnings, nextDay.log.list.some((line) => line.includes('nextDay упал'))], [true, true, ['internal'], true]);
  // Повторный вход: порты вызывают команды ядра в фазе работы — reentrant, ничего не изменено, журнал не зацикливается.
  let core = null;
  const inside = [];
  const time = calendar();
  const plan = planner(time);
  const site = life({ cat: CAT });
  const log = { warn: (message) => inside.push(`log ${message} ${core.setName('Журнал').error?.code}`) };
  core = createPetCore({
    storage: site.storage,
    progress: () => ({ marks: 1, today: 1 }),
    clock: { ...time.port, now: () => (inside.push(core.setName('Часы').error?.code ?? 'ok'), time.state.now) },
    random: () => (inside.push(core.activity().error?.code ?? 'ok'), 0.5),
    scheduler: {
      later: (ms, task) => {
        inside.push(core.setContext({ timer: true }).error?.code ?? 'ok');
        if (ms === 3200) throw new Error('облако не запланировано');
        return plan.later(ms, task);
      },
    },
    log,
  });
  core.start();
  core.react('pet', { explicit: true });
  assert.ok(inside.length > 5 && inside.filter((line) => !line.startsWith('log')).every((code) => code === 'reentrant'), inside.join(','));
  assert.ok(inside.some((line) => line.startsWith('log') && line.endsWith('reentrant')), 'команда из журнала — тоже reentrant');
  assert.deepEqual([core.getState().name.display, core.getState().context.quiet], ['Марс', []], 'ничего не изменено');
});

// ---------- Д. Покой ----------

test('покой normal: моргание 12–28 с, движение 45–90 с, зевок 18 % (случайность — заданная), кот — свои движения', () => {
  const L = life({ cat: CAT }, { counts: host(1, 1) });
  L.random.push(0, 0);
  L.core.start();
  assert.deepEqual(plannedMs(L).slice(0, 2), [12_000, 45_000]);
  L.random.push(1);
  L.plan.advance(12_000);
  assert.deepEqual(micros(L), ['blink 260']);
  assert.equal(L.plan.nextIn(), 28_000, 'следующее моргание — 28 с (random 1)');
  L.random.push(0.17, 0); // зевок (0,17 < 0,18), следующее движение — через 45 с
  L.plan.advance(33_000);
  assert.deepEqual([playing(L), L.state().pose.page], ['yawn', 'yawn']);
  L.plan.advance(REACTIONS.yawn.ms);
  L.random.push(0.17); // зевок снова выпал, но пауза повтора 6 мин — ничего (как 0.1.4: и движения нет)
  L.plan.advance(45_000 - REACTIONS.yawn.ms);
  assert.equal(playing(L), null);
  assert.ok(micros(L).every((micro) => micro === 'blink 260'), `только моргания: ${micros(L).join(',')}`);
  L.random.push(0.5, 0.4); // не зевок; движение — ear/tail/look[floor(0,4 · 3)] = tail
  L.plan.advance(L.plan.live().find((item) => item.ms !== 3200 && item.at - L.time.state.now > 0 && item.ms >= 45_000 && item.ms <= 90_000).at - L.time.state.now);
  assert.ok(micros(L).includes('tail 920'), micros(L).join(','));
  // Собака: моргания в 20 и 40 с берут свои интервалы, затем движение 45 с — не зевок (0,5), вид — look (0,99 · 6 → 5).
  const D = life({ cat: CAT, companion: { v: 1, kind: 'dog' } }, { counts: host(1, 1) });
  D.random.push(0.5, 0, 0.5, 0.5, 0.5, 0.99);
  D.core.start();
  D.plan.advance(45_000);
  assert.deepEqual(micros(D), ['blink 260', 'blink 260', 'look 1650'], 'собака — свои движения');
});

test('покой calm, none и «уменьшить движение»: интервалы, без анимации — ни моргания, ни движений; выбор владельца не меняется', () => {
  const C = life({ cat: { ...CAT, motion: 'calm' } }, { counts: host(1, 1) });
  C.random.push(0, 0);
  C.core.start();
  assert.deepEqual(plannedMs(C).slice(0, 2), [24_000, 90_000], 'calm — реже');
  C.random.push(0, 0.5, 0.5);
  C.plan.advance(90_000);
  assert.equal(playing(C), null, 'calm — без зевка (только обычное движение)');
  const N = life({ cat: { ...CAT, motion: 'none' } }, { counts: host(1, 1) });
  N.core.start();
  assert.deepEqual(plannedMs(N).sort((a, b) => a - b), [180_000, 50_400_000], 'без анимации — только дремота и полночь');
  const R = started();
  R.core.setReducedMotion(true);
  assert.deepEqual([R.state().prefs.motion, R.state().prefs.effectiveMotion, R.state().prefs.reducedMotion], ['normal', 'none', true]);
  assert.deepEqual(plannedMs(R).sort((a, b) => a - b), [180_000, 50_400_000], 'моргание и движения сняты');
  R.plan.advance(200_000);
  assert.deepEqual(micros(R), []);
  assert.equal(R.state().pose.resting, true, 'статичная поза дремоты — есть');
  R.core.setReducedMotion(false);
  assert.equal(plannedMs(R).length >= 3, true, 'снято — интервалы заново');
});

test('дремота через 3 мин без действий; activity — не чаще раза в 500 мс; пробуждение — всегда', () => {
  const L = started();
  L.plan.advance(1000);
  L.core.activity();
  L.plan.advance(400);
  assert.equal(L.core.activity().changed, false, 'через 400 мс — отсчёт не пересчитан');
  L.plan.advance(180_000 - 400 - 1);
  assert.equal(L.state().pose.resting, false);
  L.plan.advance(1);
  assert.deepEqual([L.state().pose.resting, L.state().pose.base, L.state().pose.page], [true, 'rest', 'rest'], 'дремота от первого действия, не от второго');
  assert.equal(L.core.activity().changed, true, 'пробуждение');
  assert.deepEqual([L.state().pose.resting, L.state().pose.base], [false, 'calm']);
  L.core.setContext({ typing: true });
  L.plan.advance(200_000);
  assert.equal(L.state().pose.resting, false, 'в тишине не засыпает');
  L.core.setContext({ typing: false });
  saved(L, 'a');
  L.plan.advance(1000);
  assert.equal(L.state().pose.resting, false, 'идёт реакция — позже');
  L.plan.advance(REACTIONS.joy.ms - 1000 + 999);
  assert.equal(L.state().pose.resting, false, 'конец реакции — проверка через секунду');
  L.plan.advance(1);
  assert.equal(L.state().pose.resting, true);
});

test('запреты движений покоя: тишина, реакция, жест, фон, «скрыт»; экран занятия — без зевка, движения есть', () => {
  const L = life({ cat: CAT }, { counts: host(1, 1) });
  L.random.push(0, 0.5);
  L.core.start();
  L.core.setContext({ timer: true });
  L.random.push(0);
  L.plan.advance(12_000);
  assert.deepEqual(micros(L), [], 'тишина — без моргания');
  L.core.setContext({ timer: false });
  L.plan.advance(11_500);
  L.core.react('settle'); // до 24 700 мс — моргание в 24 000 мс попадает на реакцию
  L.random.push(0);
  L.plan.advance(500);
  assert.equal(micros(L).length, 0, 'идёт реакция — без моргания');
  L.plan.advance(REACTIONS.settle.ms);
  L.core.setBusy(true);
  const taken = L.random.state.taken;
  L.plan.advance(L.plan.live().find((item) => item.ms >= 45_000 && item.ms <= 90_000).at - L.time.state.now);
  assert.deepEqual([micros(L).length, playing(L), L.random.state.taken - taken >= 2], [0, null, true], 'жест — ни движения, ни зевка (шанс не тянется)');
  L.core.setBusy(false);
  // Экран занятия: шанс зевка не тянется, движение есть (моргание в 26,4 с — 0,5; движение в 45 с — вид 0 → ear).
  const F = life({ cat: CAT }, { counts: host(1, 1) });
  F.random.push(0.9, 0);
  F.core.start();
  F.core.setContext({ focus: true });
  F.random.push(0.5, 0);
  F.plan.advance(45_000);
  assert.deepEqual([playing(F), micros(F)], [null, ['blink 260', 'ear 620']], 'экран занятия — движение без зевка');
  F.core.setVisible(false);
  F.plan.advance(DAY_MS);
  F.core.setVisible(true);
  F.core.hide();
  F.plan.advance(DAY_MS);
  assert.deepEqual(micros(F), ['blink 260', 'ear 620'], 'фон и «скрыт» — задач нет');
});

test('поза покоя: внимание на экране занятия и в тишине, дремота не в тишине, довольный после лакомства', () => {
  const L = started();
  assert.equal(L.state().pose.base, 'calm');
  L.core.setContext({ focus: true });
  assert.equal(L.state().pose.base, 'attentive');
  L.core.setContext({ focus: false });
  L.core.feed();
  L.plan.advance(REACTIONS.feed.ms + REACTIONS.fed.ms);
  assert.deepEqual([L.state().pose.base, L.state().pose.page], ['content', 'content']);
  L.plan.advance(180_000);
  assert.equal(L.state().pose.base, 'rest');
  L.core.setContext({ dialog: true });
  assert.equal(L.state().pose.base, 'attentive', 'тишина важнее дремоты');
});

// ---------- Е. Календарь и приветствие ----------

test('местная полночь: задача до начала следующего местного дня; новый день — лакомство ждёт, покой обычный; следующая граница', () => {
  const counts = host(1, 1);
  const L = started({ cat: CAT }, { counts });
  L.core.feed();
  L.plan.advance(REACTIONS.feed.ms + REACTIONS.fed.ms);
  assert.deepEqual([L.state().treat, L.state().pose.base], ['fed', 'content']);
  assert.ok(plannedMs(L).includes(14 * 3_600_000), '10:00 → полночь через 14 ч');
  counts.set(1, 0); // у сайта новый день — занятий ещё нет
  L.plan.advance(14 * 3_600_000 - REACTIONS.feed.ms - REACTIONS.fed.ms);
  assert.deepEqual([L.state().treat, L.state().pose.base], ['waiting', 'rest'], 'лакомство ждёт; довольство кончилось (дремота — после 3 мин)');
  assert.ok(plannedMs(L).includes(DAY_MS), 'следующая граница — по nextDay');
  assert.equal(L.effects('scene').some((effect) => effect.step === 'start'), false, 'полночь не приветствует');
});

test('полночь по смене пояса: следующая граница — по clock.nextDay, не 24 ч', () => {
  const time = calendar(`${DAY}T22:00:00Z`, 0);
  const L = started({ cat: CAT }, { time });
  assert.ok(plannedMs(L).includes(2 * 3_600_000));
  time.state.offset = 180; // перевели часы / сменили пояс: местное время UTC+3
  L.plan.advance(2 * 3_600_000);
  const next = L.plan.live().find((item) => item.ms > 3_600_000 * 12);
  assert.equal(next.ms, 21 * 3_600_000, 'до местной полуночи UTC+3 — 21 ч');
});

test('скачок часов: feed, notify и refresh пересчитывают день сразу, без задачи полуночи', () => {
  const counts = host(1, 1);
  const L = started({ cat: CAT }, { counts });
  L.core.feed();
  L.plan.advance(REACTIONS.feed.ms + REACTIONS.fed.ms);
  assert.equal(L.core.feed().error.code, 'treat-fed');
  L.plan.jump(2 * DAY_MS); // сон устройства: задачи не сработали
  assert.equal(L.state().treat, 'fed', 'до команды — прежний показ');
  const fed = L.core.feed();
  assert.deepEqual([fed.ok, fed.reaction.key, L.json('treat').fedDay], [true, 'feed:2026-10-15', '2026-10-15']);
  L.plan.jump(DAY_MS);
  counts.set(2, 0);
  L.core.refresh();
  assert.equal(L.state().treat, 'waiting', 'refresh — новый день');
  L.plan.jump(DAY_MS);
  counts.set(3, 1);
  saved(L, 'j', { first: true });
  assert.equal(L.state().treat, 'ready', 'notify — новый день');
});

test('фон через полночь и возврат: день и лакомство заново, дремота после долгого отсутствия, задачи заново, без приветствия', () => {
  const counts = host(1, 1);
  const L = started({ cat: CAT }, { counts });
  L.core.feed();
  L.plan.advance(REACTIONS.feed.ms + REACTIONS.fed.ms);
  L.core.setVisible(false);
  assert.equal(L.plan.live().length, 0);
  L.plan.jump(DAY_MS);
  counts.set(1, 0);
  const writes = L.store.writes.length;
  L.core.setVisible(true);
  const state = L.state();
  assert.deepEqual([state.treat, state.pose.resting, state.pose.base, state.visible], ['waiting', true, 'rest', true]);
  assert.equal(L.plan.live().length, 3, 'моргание, движение, полночь (дремлет — проверки отдыха нет, как 0.1.4)');
  L.plan.advance(1000);
  assert.deepEqual([playing(L), L.store.writes.length, L.json('cat').greetDay], [null, writes, DAY], 'приветствие только при запуске; день приветствия не пишется');
});

test('приветствие: через 0,9 с, раз в местный день; после паузы ≥ 2 дней — welcome; ключ greet:<день>', () => {
  const L = started({ cat: { v: 1, seenStage: 0, greetDay: '2026-10-12' } });
  assert.equal(L.json('cat').greetDay, DAY, 'день записан при запуске');
  L.plan.advance(899);
  assert.equal(playing(L), null);
  L.plan.advance(1);
  assert.equal(playing(L), 'greet');
  assert.ok(PHRASES.greet.includes(L.state().phrase.text));
  const W = started({ cat: { v: 1, seenStage: 0, greetDay: '2026-10-11' } });
  W.plan.advance(900);
  assert.ok(PHRASES.welcome.includes(W.state().phrase.text), 'после паузы в два дня — «рад, что ты здесь»');
  const again = life({}, { storage: L.storage, counts: host(1, 1) });
  assert.equal(again.core.start().greet, null, 'тот же день — нет');
  again.plan.advance(1000);
  assert.equal(playing(again), null);
});

test('приветствие: спрятан, «по зову», фон при запуске — без проигрывания; повторный start — нет; «Показать» и возврат — нет', () => {
  const hidden = started({ cat: { v: 1, seenStage: 0, hidden: true } });
  assert.deepEqual([hidden.plan.live().length, hidden.json('cat').greetDay], [0, undefined], 'спрятан — ни задач, ни дня');
  const away = life({ cat: { v: 1, seenStage: 0 } }, { counts: host(1, 1) });
  away.core.setSight({ around: false, view: null });
  assert.equal(away.core.start().greet, null);
  assert.deepEqual(plannedMs(away), [50_400_000], '«по зову» — только полночь');
  const background = life({ cat: { v: 1, seenStage: 0 } }, { counts: host(1, 1) });
  background.core.setVisible(false);
  assert.notEqual(background.core.start().greet, null, 'решение дня и запись — при запуске (PL03)');
  background.core.setVisible(true);
  background.plan.advance(1000);
  assert.equal(playing(background), null, 'запущено в фоне — не проигрывается и при возврате');
  const shown = started({ cat: { v: 1, seenStage: 0 } });
  shown.core.hide();
  shown.core.show();
  shown.plan.advance(1000);
  assert.equal(playing(shown), null, 'спрятали до 0,9 с — приветствие снято, «Показать» его не возвращает');
  assert.equal(shown.core.start().error.code, 'already-started');
});

// ---------- З. Доставка и хранение ----------

async function scenario(L, drain = async () => {}) {
  const trace = [];
  const look = () => {
    const s = L.state();
    return `${s.pose.reaction?.type ?? '-'}|${s.pose.reaction?.tryOn ?? ''}|${s.pose.reaction?.mini ?? ''}|${s.phrase?.text ?? ''}`;
  };
  L.random.push(0.3, 0.6);
  assert.equal(L.core.start().ok, true);
  L.counts.set(3, 2);
  trace.push(L.core.notify('saved', { key: 's', counted: true }).celebrate);
  await drain();
  trace.push(look());
  L.plan.advance(REACTIONS.joy.ms);
  trace.push(look());
  L.plan.advance(REACTIONS.unlock.ms);
  const fed = L.core.feed();
  trace.push(look(), fed.save.status);
  await drain();
  trace.push(L.state().save.treat.status);
  L.plan.advance(REACTIONS.feed.ms);
  trace.push(look());
  return trace;
}

test('те же входы на синхронном и асинхронном координаторе — те же позы, вещи и реплики; сохранение — честно по-разному', async () => {
  const sync = await scenario(life({ cat: { v: 1, seenStage: 0, greetDay: DAY } }, { counts: host(2, 1) }));
  const store = manual({ cat: { v: 1, seenStage: 0, greetDay: DAY } });
  assert.equal(await store.load(), 'ready');
  const async = await scenario(life({}, { storage: store.storage, counts: host(2, 1) }), () => store.drain());
  const strip = (trace) => trace.filter((item) => typeof item !== 'string' || item.includes('|'));
  assert.deepEqual(strip(async), strip(sync), 'позы, примерка, вещь рядом и реплики совпадают');
  assert.deepEqual([sync[4], sync[5], async[4], async[5]], ['saved', 'saved', 'pending', 'saved'], 'синхронно — сразу, асинхронно — pending, затем подтверждено');
});

test('подписчики: команда из слушателя — сразу, тем же раундом; исключение — остальным доставляется; destroy в доставке задачи — одно destroyed, задач нет', () => {
  const L = started();
  const order = [];
  L.core.subscribe((update) => {
    if (!order.length && update.snapshot.pose.reaction?.type === 'joy') {
      order.push('тишина из слушателя');
      L.core.setContext({ typing: true });
    }
  }, { initial: false });
  L.core.subscribe(() => {
    throw new Error('слушатель упал');
  }, { initial: false });
  const after = [];
  L.core.subscribe((update) => after.push(update.reason), { initial: false });
  const result = saved(L, 'a');
  assert.deepEqual([result.ok, playing(L), order], [true, null, ['тишина из слушателя']], 'результат — до доставки, реакция снята командой слушателя');
  assert.deepEqual(after, ['notify', 'setContext']);
  assert.ok(L.log.list.some((line) => line.startsWith('исключение подписчика')));
  L.core.setContext({ typing: false });
  saved(L, 'b');
  const reasons = [];
  L.core.subscribe((update) => {
    reasons.push(update.reason);
    if (update.reason === 'reaction') L.core.destroy();
  }, { initial: false });
  L.plan.advance(REACTIONS.joy.ms);
  assert.deepEqual([reasons, L.plan.live().length], [['reaction', 'destroyed'], 0]);
  L.plan.advance(DAY_MS);
  assert.deepEqual(reasons, ['reaction', 'destroyed'], 'после destroy — ничего');
});

test('два ядра: на одном хранилище и на разных — память событий, тишина и покой свои', () => {
  const A = started();
  const B = life({}, { storage: A.storage, counts: host(1, 1) });
  B.core.start();
  A.core.setContext({ timer: true });
  saved(A, 'K');
  saved(B, 'K');
  assert.deepEqual([playing(A), playing(B)], [null, 'joy'], 'тишина A не действует на B');
  assert.equal(saved(B, 'K').duplicate, true);
  A.core.setContext({ timer: false });
  assert.equal(playing(A), 'joy', 'у A своя отложенная');
  const other = started();
  assert.equal(saved(other, 'K').duplicate, false, 'другое пространство — своя сессия');
  B.plan.advance(180_000);
  assert.deepEqual([B.state().pose.resting, A.state().pose.resting], [true, false], 'покой — по своим часам и действиям');
});

test('сверка перед решением с реакцией: «уже угостили» в другой вкладке — без реакции «ест»; асинхронная запись, поставленная до destroy, выполняется', async () => {
  const L = started();
  L.put('treat', { v: 1, fedDay: DAY, note: 'другая вкладка' });
  assert.equal(L.core.feed().error.code, 'treat-fed');
  assert.equal(playing(L), null);
  const store = manual({ cat: { v: 2, seenStage: 0, greetDay: DAY, future: 1 } });
  await store.load();
  const A = life({}, { storage: store.storage, counts: host(1, 1) });
  A.core.start();
  const fed = A.core.feed();
  assert.deepEqual([fed.save.status, playing(A)], ['pending', 'feed'], 'асинхронно: правка и реакция сразу, запись — позже');
  A.core.destroy();
  assert.equal(A.plan.live().length, 0);
  await store.drain();
  assert.equal(await fed.save.done, 'saved', 'поставленная до destroy запись выполнена');
  assert.deepEqual([store.json('treat').fedDay, store.json('cat').future], [DAY, 1], 'raw сохранён');
});
