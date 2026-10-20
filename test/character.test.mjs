// Персонаж (минимальный режим, U01; README, «Персонаж: минимальный режим»; docs/ARCHITECTURE.md § 19) в Node: описание
// формата персонажа 1 (defineCharacter — принятие, копия, пути дефектов, формат, неизвестные поля — в том числе любое поле
// полного режима: room, play, coats…; описание питомца — не персонаж, персонаж — не питомец формата 1) и экземпляр
// (createCharacter): настройки и порты, запуск, реакции продукта по правилам режиссёра (приоритет, пауза повтора, повтор
// key, отложенная в тишине, фон), реплики (группа с {name} без повтора, текст продукта, объявление), тишина по независимым
// причинам, поза внимания и дремота, покой (моргание, движения, уменьшение движения, «Без анимации»), видимость, имя,
// снимок (одна ссылка), подписка и раунд (команда из слушателя, исключение слушателя), отказ планировщика (warning, ничего
// не зависает), reentrant из порта, два экземпляра независимы, destroy снимает задачи, команды — destroyed. Часы,
// планировщик и случайность — ручные (test/core-kit.mjs), пауз нет.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCharacter, defineCharacter, PetError } from '../pet/character.mjs';
import { definePet } from '../pet/core.mjs';
import { cat } from '../pet/pets.mjs';
import { calendar, journal, planner, series } from './core-kit.mjs';

const ROBOT = {
  format: 1,
  id: 'example.robot',
  title: 'Робот',
  poses: ['calm', 'attentive', 'rest', 'happy', 'think', 'wave'],
  reactions: {
    done: { pose: 'happy', ms: 1500, priority: 4, phrases: 'done', announce: true },
    oops: { pose: 'think', ms: 1200, priority: 5, cooldown: 5000, phrases: 'oops' },
    wave: { pose: 'wave', ms: 1000, priority: 6 },
    alarm: { pose: 'think', ms: 800, priority: 3, phrases: '' },
  },
  phrases: { done: ['Готово!', '{name} отметил: сделано.'], oops: ['Бывает.'] },
  micro: ['antenna'],
  timings: { phrase: 2000 },
};
const MINIMAL = { format: 1, id: 'x.min', title: 'Минимум', poses: ['calm'], reactions: {} };

// Экземпляр на ручных портах: time — часы, plan — планировщик, log — журнал; подписка пишет reason:pose:phrase:effects.
function make(def = ROBOT, { name = 'Бип', random = series([], 0.5).port, start = true } = {}) {
  const time = calendar('2026-10-20T10:00:00Z');
  const plan = planner(time);
  const log = journal();
  const hero = createCharacter({ character: def, name, clock: time.port, random, scheduler: plan.port, log: log.port });
  const seen = [];
  hero.subscribe(({ snapshot, effects, reason }) => seen.push(`${reason}:${snapshot.pose.shown}:${snapshot.phrase?.text ?? ''}${effects.length ? `:${effects.map((e) => e.type + (e.kind ? `/${e.kind}` : '')).join(',')}` : ''}`), { initial: false });
  if (start) hero.start();
  return { hero, time, plan, log, seen };
}
const code = (error) => error instanceof PetError && error.code;

test('defineCharacter: принятие, собственная глубоко замороженная копия, тот же объект повторно; минимальное описание — только позы и пустой словарь реакций', () => {
  const copy = defineCharacter(ROBOT);
  assert.notEqual(copy, ROBOT);
  assert.ok(Object.isFrozen(copy) && Object.isFrozen(copy.reactions.done) && Object.isFrozen(copy.poses));
  assert.deepEqual(copy, ROBOT);
  assert.equal(defineCharacter(copy), copy);
  const min = defineCharacter(MINIMAL);
  assert.deepEqual(min, MINIMAL);
  assert.equal(Object.hasOwn(min, 'room'), false);
});

test('defineCharacter: дефекты с путём — формат, ID, позы, реакции (поза, границы, пауза, группа, объявление), реплики, движения, интервалы; неизвестное поле — любое поле полного режима; определение питомца — не персонаж; персонаж — не питомец формата 1', () => {
  const bad = (def, path, kind = 'definition-invalid') => {
    assert.throws(() => defineCharacter(def), (error) => code(error) === kind && error.path === path, `${path}: ${JSON.stringify(def).slice(0, 80)}`);
  };
  bad({ ...ROBOT, format: 2 }, 'format', 'unsupported-format');
  bad({ ...ROBOT, format: '1' }, 'format');
  bad({ ...ROBOT, id: 'robot' }, 'id');
  bad({ ...ROBOT, id: 'cat' }, 'id');
  bad({ ...ROBOT, title: '' }, 'title');
  bad({ ...ROBOT, poses: ['attentive'] }, 'poses');
  bad({ ...ROBOT, poses: ['calm', 'calm'] }, 'poses[1]');
  bad({ ...ROBOT, poses: ['calm', 'Big'] }, 'poses[1]');
  bad({ ...ROBOT, reactions: { done: { ...ROBOT.reactions.done, pose: 'fly' } } }, 'reactions.done.pose');
  bad({ ...ROBOT, reactions: { done: { ...ROBOT.reactions.done, ms: 100 } } }, 'reactions.done.ms');
  bad({ ...ROBOT, reactions: { done: { ...ROBOT.reactions.done, ms: 5000 } } }, 'reactions.done.ms');
  bad({ ...ROBOT, reactions: { done: { ...ROBOT.reactions.done, priority: 2 } } }, 'reactions.done.priority');
  bad({ ...ROBOT, reactions: { done: { ...ROBOT.reactions.done, cooldown: -1 } } }, 'reactions.done.cooldown');
  bad({ ...ROBOT, reactions: { done: { ...ROBOT.reactions.done, phrases: 'nope' } } }, 'reactions.done.phrases');
  bad({ ...ROBOT, reactions: { done: { ...ROBOT.reactions.done, announce: 1 } } }, 'reactions.done.announce');
  bad({ ...ROBOT, reactions: { done: { ...ROBOT.reactions.done, scene: true } } }, 'reactions.done.scene');
  bad({ ...ROBOT, reactions: { Done: ROBOT.reactions.done } }, 'reactions.Done');
  bad({ ...ROBOT, phrases: { done: [] } }, 'phrases.done');
  bad({ ...ROBOT, phrases: { Done: ['x'] } }, 'phrases.Done');
  bad({ ...ROBOT, phrases: { done: ['x'.repeat(121)] } }, 'phrases.done[0]');
  bad({ ...ROBOT, micro: ['Ear'] }, 'micro[0]');
  bad({ ...ROBOT, timings: { blink: [5000, 9000] } }, 'timings.blink[0]');
  bad({ ...ROBOT, timings: { micro: [50_000, 40_000] } }, 'timings.micro[1]');
  bad({ ...ROBOT, timings: { phrase: 500 } }, 'timings.phrase');
  bad({ ...ROBOT, timings: { yawn: 0.1 } }, 'timings.yawn');
  for (const field of ['room', 'play', 'coats', 'accessories', 'items', 'names', 'fallback', 'forms', 'size', 'scenes', 'limits']) bad({ ...ROBOT, [field]: {} }, field);
  bad({ ...ROBOT, reactions: { done: ROBOT.reactions.done }, extra: () => 1 }, 'extra');
  assert.throws(() => defineCharacter(null), (error) => code(error) === 'definition-invalid');
  assert.throws(() => defineCharacter(cat), (error) => code(error) === 'definition-invalid' && error.path === 'forms');
  // Формат 1 питомца не ослаблен: описание персонажа — не питомец.
  assert.throws(() => definePet(ROBOT), (error) => code(error) === 'definition-invalid');
  assert.throws(() => definePet(MINIMAL), (error) => code(error) === 'definition-invalid');
});

test('createCharacter: настройки — объект, только известные, character обязателен, name — строка, порты по контракту; создание — без задач, вызовов портов и слушателей; снимок до запуска', () => {
  assert.throws(() => createCharacter(), (error) => code(error) === 'invalid-options');
  assert.throws(() => createCharacter({}), (error) => code(error) === 'invalid-options');
  assert.throws(() => createCharacter({ character: ROBOT, storage: {} }), (error) => code(error) === 'invalid-options');
  assert.throws(() => createCharacter({ character: ROBOT, name: 1 }), (error) => code(error) === 'invalid-options');
  assert.throws(() => createCharacter({ character: ROBOT, clock: {} }), (error) => code(error) === 'invalid-options');
  assert.throws(() => createCharacter({ character: { ...ROBOT, room: {} } }), (error) => code(error) === 'definition-invalid' && error.path === 'room');
  const time = calendar();
  const plan = planner(time);
  const log = journal();
  const random = series();
  const hero = createCharacter({ character: ROBOT, name: ' Бип  <b> ', clock: time.port, random: random.port, scheduler: plan.port, log: log.port });
  assert.equal(hero.status, 'created');
  assert.equal(plan.calls, 0);
  assert.equal(random.state.taken, 0);
  assert.equal(log.list.length, 0);
  const snap = hero.getState();
  assert.ok(Object.isFrozen(snap) && Object.isFrozen(snap.pose));
  assert.deepEqual(snap, { status: 'created', character: { id: 'example.robot', title: 'Робот' }, name: { value: 'Бип b', display: 'Бип b' }, prefs: { motion: 'normal', phrases: true, reducedMotion: false, effectiveMotion: 'normal' }, context: { focus: false, quiet: [] }, visible: true, resting: false, pose: { base: 'calm', shown: 'calm', reaction: null }, phrase: null });
  assert.equal(hero.getState(), snap, 'одна ссылка, пока ничего не изменилось');
  // До запуска реакции не играют, команды настроек работают.
  assert.deepEqual(hero.react('done', { key: 'a' }), { ok: true, changed: false, played: false, queued: false, duplicate: false });
  assert.equal(hero.setName('Зум').name, 'Зум');
  assert.equal(hero.getState().name.display, 'Зум');
  assert.equal(createCharacter({ character: MINIMAL }).getState().name.display, 'Минимум', 'без имени — название');
});

test('start: один раз; задачи покоя (моргание, движение, дремота) только у запущенного и на виду; react — реакция по описанию: поза, срок, реплика группы с {name} без повтора только что сказанной, объявление; конец — покой; снимок меняется только по событиям', () => {
  const { hero, plan, seen, time } = make();
  assert.equal(hero.start().error.code, 'already-started');
  assert.deepEqual(plan.live().map((item) => item.ms).sort((a, b) => a - b), [20_000, 67_500, 180_000], 'моргание 12–28 с, движение 45–90 с (random 0.5), дремота через 3 мин');
  const first = hero.react('done', { key: 'task-1' });
  assert.deepEqual(first, { ok: true, changed: true, played: true, queued: false, duplicate: false });
  let snap = hero.getState();
  assert.equal(snap.pose.shown, 'happy');
  assert.deepEqual(snap.pose.reaction, { id: 1, type: 'done', pose: 'happy', until: time.state.now + 1500 });
  assert.equal(snap.phrase.text, 'Бип отметил: сделано.');
  assert.equal(seen.at(-1), 'react:happy:Бип отметил: сделано.:announce');
  plan.advance(1500);
  snap = hero.getState();
  assert.equal(snap.pose.shown, 'calm');
  assert.equal(snap.pose.reaction, null);
  assert.equal(snap.phrase.text, 'Бип отметил: сделано.', 'облако живёт timings.phrase');
  plan.advance(500);
  assert.equal(hero.getState().phrase, null);
  // Та же группа — не та же реплика; текст продукта — вместо группы, без объявления у реакции без announce.
  hero.react('done', { key: 'task-2' });
  assert.equal(hero.getState().phrase.text, 'Готово!');
  plan.advance(4000);
  const own = hero.react('wave', { text: '  Привет, мир  ' });
  assert.equal(own.played, true);
  assert.equal(hero.getState().phrase.text, 'Привет, мир');
  assert.equal(seen.at(-1), 'react:wave:Привет, мир');
  plan.advance(4000);
  // Реакция без реплики (phrases: '') — без облака.
  hero.react('alarm');
  assert.equal(hero.getState().phrase, null);
  assert.equal(hero.getState().pose.shown, 'think');
});

test('react: unknown-id, неверные настройки, повтор key, пауза повтора, приоритеты (важнее — сменяет, не важнее — откладывается и играет после), отложенная устаревает через минуту', () => {
  const { hero, plan } = make();
  assert.equal(hero.react('nope').error.code, 'unknown-id');
  assert.equal(hero.react(1).error.code, 'unknown-id');
  for (const options of [1, { key: '' }, { key: 2 }, { text: 'x'.repeat(201) }, { text: 'a\u0000' }, { extra: 1 }]) assert.equal(hero.react('done', options).error.code, 'invalid-argument', JSON.stringify(options));
  assert.equal(hero.react('done', { key: 'k' }).played, true);
  assert.deepEqual(hero.react('done', { key: 'k' }), { ok: true, changed: false, played: false, queued: false, duplicate: true });
  plan.advance(2000);
  assert.equal(hero.react('oops').played, true);
  plan.advance(1200);
  assert.equal(hero.react('oops').played, false, 'пауза повтора 5 с');
  plan.advance(4000);
  assert.equal(hero.react('oops').played, true);
  plan.advance(1200);
  // Идёт wave (6): done (4) важнее — сменяет; oops (5) при done — откладывается и играет после конца done.
  hero.react('wave');
  assert.equal(hero.getState().pose.shown, 'wave');
  assert.equal(hero.react('done').played, true);
  assert.equal(hero.getState().pose.shown, 'happy');
  plan.advance(5100);
  assert.equal(hero.react('done').played, true);
  const later = hero.react('oops');
  assert.deepEqual([later.played, later.queued], [false, true]);
  plan.advance(1500);
  assert.equal(hero.getState().pose.shown, 'think', 'отложенная играет после конца');
  plan.advance(2000);
  // Отложенная старше минуты — не играет.
  hero.react('done');
  plan.advance(5100);
  hero.react('done');
  hero.react('wave');
  plan.jump(61_000);
  plan.advance(1500);
  assert.equal(hero.getState().pose.shown, 'calm');
});

test('тишина по независимым причинам: реакция остановлена и облако снято, события откладываются, снятие одной причины ничего не запускает, снятие последней — отложенная играет; поза внимания в тишине и на экране дела; дремота через 3 мин без действий и пробуждение activity', () => {
  const { hero, plan, seen } = make();
  hero.react('done');
  assert.equal(hero.setContext({ typing: true, dialog: true }).ok, true);
  let snap = hero.getState();
  assert.deepEqual([snap.pose.shown, snap.pose.reaction, snap.phrase, snap.context.quiet], ['attentive', null, null, ['dialog', 'typing']]);
  assert.equal(hero.react('oops').queued, true);
  hero.setContext({ typing: false });
  assert.equal(hero.getState().pose.shown, 'attentive');
  hero.setContext({ dialog: false });
  snap = hero.getState();
  assert.equal(snap.pose.shown, 'think');
  assert.equal(seen.at(-1), 'setContext:think:Бывает.');
  plan.advance(1200);
  assert.equal(hero.setContext({ bad: true }).error.code, 'invalid-argument');
  assert.equal(hero.setContext({ focus: 'yes' }).error.code, 'invalid-argument');
  assert.equal(hero.setContext('x').error.code, 'invalid-argument');
  hero.setContext({ focus: true });
  assert.equal(hero.getState().pose.base, 'attentive');
  hero.setContext({ focus: false });
  // Дремота: 3 минуты без действий — поза rest; activity будит и снова через 3 минуты.
  plan.advance(180_000);
  snap = hero.getState();
  assert.deepEqual([snap.resting, snap.pose.shown], [true, 'rest']);
  assert.deepEqual(hero.activity(), { ok: true, changed: true, woke: true });
  assert.equal(hero.getState().pose.shown, 'calm');
  assert.deepEqual(hero.activity(), { ok: true, changed: false, woke: false }, 'не чаще 500 мс');
  // В дремоте событие продукта будит: реакция играет, resting снят.
  plan.advance(180_000);
  assert.equal(hero.getState().resting, true);
  hero.react('done');
  assert.deepEqual([hero.getState().resting, hero.getState().pose.shown], [false, 'happy']);
});

test('покой: моргание и движения — эффекты micro по интервалам описания (random), не в тишине, не при реакции, не в дремоте; «Без анимации» и системное «уменьшить движение» — задач покоя нет; calm — реже; без позы rest дремоты нет', () => {
  const { hero, plan, seen } = make();
  plan.advance(20_000);
  assert.equal(seen.at(-1), 'blink:calm::micro/blink');
  plan.advance(47_500);
  assert.equal(seen.at(-1), 'micro:calm::micro/antenna');
  hero.setContext({ timer: true });
  plan.advance(20_000);
  assert.ok(!seen.slice(-1)[0].includes('micro/'), 'в тишине без движений');
  hero.setContext({ timer: false });
  assert.equal(hero.setPreferences({ motion: 'calm' }).ok, true);
  const calmTasks = plan.live().map((item) => item.ms);
  assert.ok(calmTasks.includes(40_000) && calmTasks.includes(135_000), `calm — интервалы вдвое реже: ${calmTasks}`);
  hero.setReducedMotion(true);
  assert.equal(plan.live().length, 1, 'уменьшить движение — ни моргания, ни движений; остаётся только дремота по времени');
  assert.equal(hero.getState().prefs.effectiveMotion, 'none');
  assert.equal(hero.getState().prefs.motion, 'calm', 'выбор владельца не меняется');
  hero.setReducedMotion(false);
  assert.equal(hero.getState().prefs.effectiveMotion, 'calm');
  hero.setPreferences({ motion: 'none' });
  assert.equal(plan.live().length, 1);
  assert.equal(hero.setPreferences({ motion: 'fast' }).error.code, 'invalid-argument');
  assert.equal(hero.setPreferences({ volume: 1 }).error.code, 'invalid-argument');
  assert.equal(hero.setReducedMotion('x').error.code, 'invalid-argument');
  // Реплики выключены — облака нет; включены — снова есть.
  hero.setPreferences({ motion: 'normal', phrases: false });
  hero.react('done');
  assert.equal(hero.getState().phrase, null);
  plan.advance(1500);
  hero.setPreferences({ phrases: true });
  hero.react('done');
  assert.ok(hero.getState().phrase);
  // Персонаж без позы rest и без micro: дремоты нет, задача движений не ставится, моргание есть.
  const min = make({ ...MINIMAL, poses: ['calm', 'happy'], reactions: { done: { pose: 'happy', ms: 500, priority: 4 } } });
  assert.deepEqual(min.plan.live().map((item) => item.ms), [20_000]);
  min.plan.advance(400_000);
  assert.deepEqual([min.hero.getState().resting, min.hero.getState().pose.shown], [false, 'calm']);
  min.hero.setContext({ typing: true });
  assert.equal(min.hero.getState().pose.shown, 'calm', 'без позы attentive — calm');
});

test('видимость: в фоне реакция, облако и задачи сняты, события учитываются (key), но не играют и не доигрываются после возврата; возврат — задачи заново; дремота по времени отсутствия', () => {
  const { hero, plan } = make();
  hero.react('done', { key: 'a' });
  assert.equal(hero.setVisible(false).changed, true);
  let snap = hero.getState();
  assert.deepEqual([snap.visible, snap.pose.shown, snap.phrase, plan.live().length], [false, 'calm', null, 0]);
  assert.deepEqual(hero.react('done', { key: 'b' }), { ok: true, changed: false, played: false, queued: false, duplicate: false });
  assert.equal(hero.setVisible(false).changed, false);
  plan.jump(200_000);
  hero.setVisible(true);
  snap = hero.getState();
  assert.deepEqual([snap.visible, snap.pose.shown, snap.resting, snap.pose.reaction], [true, 'rest', true, null], 'возврат после долгого отсутствия — дремота, прежнее не доигрывает');
  assert.ok(plan.live().length >= 2, 'задачи покоя заново');
  assert.equal(hero.react('done', { key: 'b' }).duplicate, true, 'событие в фоне учтено');
  assert.equal(hero.setVisible(1).error.code, 'invalid-argument');
});

test('подписка и раунд: initial — текущий снимок; обновление — одно на команду, только при изменении или эффекте; команда из слушателя — сразу, её обновление следом; исключение слушателя не мешает остальным; снимок — та же ссылка без изменений; неверный слушатель — журнал', () => {
  const { hero, log } = make();
  const got = [];
  const off = hero.subscribe((update) => got.push(update.reason));
  assert.deepEqual(got, ['initial']);
  const nested = [];
  hero.subscribe(
    ({ reason }) => {
      nested.push(reason);
      if (reason === 'setName') assert.equal(hero.setPreferences({ phrases: false }).ok, true, 'команда из слушателя');
    },
    { initial: false },
  );
  hero.subscribe(() => {
    throw new Error('плохой слушатель');
  }, { initial: false });
  const before = hero.getState();
  hero.setName('Бип');
  assert.equal(hero.getState(), before, 'без изменений — та же ссылка, без обновления');
  assert.deepEqual(got, ['initial']);
  hero.setName('Зум');
  assert.deepEqual(got, ['initial', 'setName', 'setPreferences']);
  assert.deepEqual(nested, ['setName', 'setPreferences']);
  assert.ok(log.list.some((line) => line.startsWith('исключение подписчика')));
  off();
  hero.setName('Бип');
  assert.deepEqual(got, ['initial', 'setName', 'setPreferences']);
  assert.equal(typeof hero.subscribe(1), 'function');
  assert.ok(log.list.some((line) => line.startsWith('subscribe:')));
});

test('отказ планировщика: later бросил — реакция снята сразу, эффект warning и журнал; реакция без задачи конца не зависает; планировщик выполнил задачу внутри later — тоже отказ', () => {
  const time = calendar();
  const log = journal();
  let broken = false;
  let inline = false;
  const scheduler = {
    later(ms, task) {
      if (broken) throw new Error('нет таймеров');
      if (inline) {
        task();
        return () => {};
      }
      return () => {};
    },
  };
  const hero = createCharacter({ character: ROBOT, clock: time.port, random: () => 0.5, scheduler, log: log.port });
  const effects = [];
  hero.subscribe(({ effects: list }) => effects.push(...list.map((e) => e.type)), { initial: false });
  hero.start();
  broken = true;
  const result = hero.react('done');
  assert.deepEqual([result.ok, result.played, hero.getState().pose.shown, hero.getState().phrase], [true, false, 'calm', null]);
  assert.ok(effects.includes('warning') && log.list.some((line) => line.includes('задача reaction не запланирована')));
  broken = false;
  inline = true;
  assert.equal(hero.react('wave').played, false);
  assert.ok(log.list.some((line) => line.includes('внутри later')));
});

test('reentrant: команда из порта во время обработки — отказ без изменений; команда из задачи планировщика — своя фаза работы (обновление слушателям после)', () => {
  const time = calendar();
  const plan = planner(time);
  const log = journal();
  let hero;
  const random = () => {
    const inner = hero.setName('из порта');
    assert.equal(inner.error.code, 'reentrant');
    return 0.5;
  };
  hero = createCharacter({ character: ROBOT, name: 'Бип', clock: time.port, random, scheduler: plan.port, log: log.port });
  hero.start();
  assert.equal(hero.react('done').played, true, 'реплика выбирается random — порт вызвал команду');
  assert.equal(hero.getState().name.display, 'Бип');
});

test('два экземпляра независимы: реакции, тишина, имя, отключение одного; destroy — задачи сняты, последнее обновление destroyed, команды — destroyed, снимок — тот же, subscribe с initial — один вызов destroyed', () => {
  const a = make(ROBOT, { name: 'А' });
  const b = make(ROBOT, { name: 'Б' });
  a.hero.react('done');
  b.hero.setContext({ typing: true });
  assert.deepEqual([a.hero.getState().pose.shown, b.hero.getState().pose.shown, b.hero.getState().context.quiet], ['happy', 'attentive', ['typing']]);
  assert.deepEqual(a.hero.getState().context.quiet, []);
  a.hero.destroy();
  assert.equal(a.hero.status, 'destroyed');
  assert.equal(a.plan.live().length, 0, 'задачи сняты');
  assert.equal(a.seen.at(-1), 'destroyed:calm:');
  assert.deepEqual(a.hero.react('done'), { ok: false, error: { code: 'destroyed', message: 'Персонаж отключён.' } });
  assert.equal(a.hero.setName('x').error.code, 'destroyed');
  const snap = a.hero.getState();
  assert.equal(snap.status, 'destroyed');
  assert.equal(a.hero.getState(), snap);
  const late = [];
  a.hero.subscribe(({ reason }) => late.push(reason));
  assert.deepEqual(late, ['destroyed']);
  a.hero.destroy();
  // Поздний вызов отменённой задачи прежнего экземпляра ничего не делает.
  for (const item of a.plan.all) item.task();
  assert.equal(a.hero.getState(), snap);
  // Б живёт и реагирует.
  b.hero.setContext({ typing: false });
  assert.equal(b.hero.react('done').played, true);
  assert.equal(b.hero.getState().name.display, 'Б');
  // destroy из слушателя — в конце фазы, без исключений.
  const c = make();
  c.hero.subscribe(({ reason }) => reason === 'react' && c.hero.destroy(), { initial: false });
  assert.equal(c.hero.react('done').ok, true);
  assert.equal(c.hero.status, 'destroyed');
});
