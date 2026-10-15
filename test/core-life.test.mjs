// Ядро PL04.1 в Node — реакции, память событий, тишина, реплики (docs/ARCHITECTURE.md § 4.4, § 6.4, § 10, § 14.1.2):
// настоящий экземпляр ядра с ручными часами, ручным планировщиком и заданной последовательностью random (test/core-kit.mjs
// life); проверяется последовательность снимков и эффектов, а не чистый request. Режиссёр: радость, поддержка, ожидание,
// продолжение «новая вещь» с примеркой и вещью рядом, кормление «ест» → «доволен», приоритеты и одна отложенная,
// продолжение против более важной отложенной, декоративные, паузы повторов, прямой отклик и смена отклика на предмет,
// снятие без зависшей примерки. Р1: память обработанных событий, причины тишины и паузы повторов переживают «Скрыть» и
// «Показать» и смену питомца; новое ядро — новая сессия. Тишина: независимые причины, одна самая важная отложенная в
// пределах 60 с, декоративное не копится, отменённая сценка не возвращается, прямой отклик в тишине — без облака на
// странице. Реплики: банк и группа, ступень, без немедленного повтора, сроки облака, выключенные реплики, реплика вида,
// named и meet с паузами, тихий свободный ввод, настройки из другого ядра и свежая сверка. С PL04.2 вид — open/close ядра,
// «по зову» — setPresence, сценка — конвейер ядра (тестовый порт резервирования), а не react отображения; прежние сигналы
// scene стали внутренними — вместо них наблюдаются начатые реакции и попытка сценки (scene.waiting). С PL04.3 прямые отклики
// — смысловые входы ядра (interact в «Поиграть» и уголке, «устроился» — arrive), поза поверхности — pose.shown. Данные
// синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { REACTIONS } from '../pet/core/director.mjs';
import { DOG_PHRASES, PHRASES, phraseList } from '../pet/core/phrases.mjs';
import { DAY, flush, host, LEGACY_DISPLAY, life, reserver } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY }; // приветствие сегодня уже было — запуск без него
const started = (initial = { cat: CAT }, parts = {}) => {
  const L = life(initial, { counts: host(1, 1), display: LEGACY_DISPLAY, ...parts });
  assert.equal(L.core.start().ok, true);
  return L;
};
const now = (L) => L.time.state.now;
const playing = (L) => L.state().pose.reaction?.type ?? null;
// Начатые реакции по порядку (новый номер реакции в обновлениях) — их типы.
const starts = (L) => {
  const out = [];
  let last = 0;
  for (const update of L.seen) {
    const reaction = update.snapshot.pose.reaction;
    if (reaction && reaction.id !== last) out.push(reaction.type);
    if (reaction) last = reaction.id;
  }
  return out;
};
const saved = (L, key, extra = {}) => L.core.notify('saved', { key, counted: true, ...extra });
// «Поиграть» с объявленным полом (единицы рисунка): предметы на исходных местах.
const FLOOR = [-50, -10, 320, 230];
const play = (L) => {
  assert.equal(L.core.open('play').ok, true);
  assert.equal(L.core.setDisplay({ playFloor: FLOOR }).ok, true);
};
// «Устроился» (arrive): сыграл ли отклик ядра.
const settled = (L) => (L.core.arrive(), playing(L) === 'settle');

// ---------- А. Реакции ----------

test('радость, поддержка, ожидание: поза, реплика группы, срок; ожидание — пауза повтора 10 с', () => {
  const L = started();
  L.random.push(0); // реплика радости — первая в банке
  const joy = saved(L, 'a');
  assert.deepEqual([joy.reacted, joy.duplicate, playing(L), L.state().pose.shown.page], [true, false, 'joy', 'joy']);
  assert.equal(L.state().phrase.text, PHRASES.joy[0]);
  assert.equal(L.state().pose.reaction.until, now(L) + REACTIONS.joy.ms);
  L.plan.advance(REACTIONS.joy.ms - 1);
  assert.equal(playing(L), 'joy', 'до срока — играет');
  L.plan.advance(1);
  assert.deepEqual([playing(L), L.state().pose.shown.page], [null, 'calm'], 'срок — поза покоя');
  saved(L, 'b', { hard: true });
  assert.equal(playing(L), 'support');
  L.plan.advance(REACTIONS.support.ms);
  L.core.notify('failed', null);
  assert.deepEqual([playing(L), L.state().phrase], ['wait', L.state().phrase], 'ожидание без реплики');
  L.plan.advance(REACTIONS.wait.ms);
  assert.equal(L.core.notify('failed', null).reacted, true);
  assert.equal(playing(L), null, 'повтор раньше 10 с — без реакции (пауза повтора)');
  L.plan.advance(REACTIONS.wait.cooldown);
  L.core.notify('failed', null);
  assert.equal(playing(L), 'wait');
});

test('радость и поддержка → новая вещь: примерка платка, вещь рядом; у собаки на «Нашем ритуале» — мячик', () => {
  const counts = host(2, 1);
  const L = started({ cat: CAT }, { counts });
  counts.set(3, 2);
  saved(L, 'p');
  assert.deepEqual([playing(L), L.state().pose.reaction.tryOn], ['joy', ''], 'радость — без примерки');
  L.plan.advance(REACTIONS.joy.ms);
  assert.deepEqual([playing(L), L.state().pose.reaction.tryOn, L.state().pose.reaction.mini], ['unlock', 'plaid', '']);
  assert.ok(PHRASES.plaid.includes(L.state().phrase.text), 'реплика примерки');
  L.plan.advance(REACTIONS.unlock.ms);
  assert.equal(L.state().pose.reaction, null, 'примерка снята вместе с реакцией');
  const dogCounts = host(8, 1);
  const D = started({ cat: CAT, companion: { v: 1, kind: 'dog' } }, { counts: dogCounts });
  dogCounts.set(9, 2);
  saved(D, 'd', { hard: true });
  assert.equal(playing(D), 'support', 'трудное — поддержка, затем то же продолжение');
  D.plan.advance(REACTIONS.support.ms);
  assert.deepEqual([playing(D), D.state().pose.reaction.mini, D.state().pose.reaction.tryOn], ['unlock', 'ball', '']);
  assert.ok(phraseList('unlock', 2, 'dog').includes(D.state().phrase.text), 'банк собаки');
});

test('кормление: «ест» с полной миской → «доволен» с пустой; довольный покой до конца дня', () => {
  const L = started();
  assert.equal(L.core.feed().ok, true);
  assert.deepEqual([playing(L), L.state().pose.reaction.mini, L.state().phrase], ['feed', 'bowl', null], 'ест молча');
  L.plan.advance(REACTIONS.feed.ms);
  assert.deepEqual([playing(L), L.state().pose.reaction.mini], ['fed', 'bowl-empty']);
  assert.ok(PHRASES.fed.includes(L.state().phrase.text));
  L.plan.advance(REACTIONS.fed.ms);
  assert.deepEqual([playing(L), L.state().pose.base, L.state().pose.shown.room, L.state().pose.shown.play], [null, 'content', 'content', 'content']);
  assert.equal(L.core.feed().error.code, 'treat-fed', 'второго лакомства нет');
});

test('приоритеты: более важная сменяет сразу, равная ждёт — одна отложенная, очередь не копится', () => {
  const L = started();
  assert.equal(L.core.interact({ type: 'pet' }).outcome, 'pet', 'кнопка уголка — обычный запрос');
  saved(L, 'a');
  assert.equal(playing(L), 'joy', 'радость важнее поглаживания — сразу');
  saved(L, 'b');
  saved(L, 'c', { hard: true });
  assert.equal(playing(L), 'joy', 'равные — ждут');
  L.plan.advance(REACTIONS.joy.ms);
  assert.deepEqual(starts(L), ['pet', 'joy', 'joy'], 'отложенная — первая из равных (поддержка c не сменила радость b)');
  assert.equal(playing(L), 'joy');
  L.plan.advance(REACTIONS.joy.ms);
  assert.equal(playing(L), null, 'c не сыграна — очереди нет');
  assert.deepEqual(starts(L), ['pet', 'joy', 'joy'], 'c не сыграна и позже');
});

test('более важная отложенная опережает продолжение того же события', () => {
  const counts = host(2, 1);
  const L = started({ cat: CAT }, { counts });
  counts.set(3, 2);
  saved(L, 'stage');
  saved(L, 'next');
  L.plan.advance(REACTIONS.joy.ms);
  assert.deepEqual([playing(L), starts(L)], ['joy', ['joy', 'joy']], 'радость (4) важнее новой вещи (5)');
  L.plan.advance(REACTIONS.joy.ms);
  assert.equal(playing(L), null, 'продолжение не доигрывается позже');
});

test('декоративные: «устроился» не копится и не играет поверх; пауза повтора 1,5 с; сценка без анимации — статичная поза', async () => {
  const L = started({ cat: CAT }, { scenes: reserver().port });
  saved(L, 'a');
  assert.deepEqual([L.core.arrive().arrived, playing(L)], [true, 'joy'], 'поверх радости — нет (эффект arrive — отображению)');
  L.plan.advance(REACTIONS.joy.ms);
  assert.equal(playing(L), null, 'и после — нет: не отложена');
  assert.equal(settled(L), true);
  L.plan.advance(REACTIONS.settle.ms);
  assert.equal(settled(L), false, 'пауза повтора');
  L.plan.advance(REACTIONS.settle.cooldown);
  assert.equal(settled(L), true);
  L.plan.advance(REACTIONS.settle.ms);
  L.core.setReducedMotion(true);
  // Сценку показывает ядро: занятие (реплика радости, шанс, вариант «клубок»), конец радости — резервирование и показ.
  L.random.push(0, 0, 0.6);
  saved(L, 'scene');
  L.plan.advance(REACTIONS.joy.ms);
  await flush();
  const reaction = L.state().pose.reaction;
  assert.deepEqual([reaction.type, reaction.scene, reaction.until - now(L), L.state().pose.shown.page], ['curl', true, REACTIONS.curl.still, 'calm'], 'сценка — поверх позы покоя, без анимации — still');
  assert.deepEqual([L.state().phrase.text, L.state().phrase.short], ['Марс сворачивается клубком.', 'Сворачивается клубком.']);
});

test('прямой отклик: в тишине — в сцене без облака страницы; не обходит не менее важную и не копится; предмет сменяет предмет и декоративное', () => {
  const L = started();
  play(L);
  L.core.setContext({ timer: true });
  assert.equal(L.core.interact({ type: 'pet' }).outcome, 'pet');
  const state = L.state();
  assert.deepEqual([state.pose.reaction.pose, state.pose.reaction.explicit, state.pose.shown.page, state.pose.shown.play, state.phrase], ['pet', true, 'attentive', 'pet', null], 'страница тиха, облака нет; в сцене — отклик');
  assert.ok(PHRASES.pet.includes(state.scenePhrase), 'реплика — в сцене');
  L.core.setContext({ timer: false });
  L.plan.advance(REACTIONS.pet.ms);
  saved(L, 'a');
  assert.deepEqual([L.core.interact({ type: 'paw' }).outcome, L.core.interact({ type: 'ball', to: 40 }).outcome, playing(L)], [null, 'moved', 'joy'], 'радость важнее — прямые отклики пропали (мячик прокатился)');
  L.plan.advance(REACTIONS.joy.ms);
  assert.equal(playing(L), null, 'и не отложены');
  assert.deepEqual([L.core.interact({ type: 'bowl', to: 'near' }).outcome, L.state().pose.reaction.toward], ['sniff', 'left']);
  assert.equal(L.core.interact({ type: 'ball', to: -40 }).outcome, 'ball', 'предмет сменяет предмет');
  assert.equal(L.state().pose.reaction.toward, 'left');
  assert.equal(L.core.interact({ type: 'bowl', to: 'home' }).outcome, 'look');
  assert.equal(L.core.interact({ type: 'pet' }).outcome, 'pet', 'поглаживание важнее предмета');
  assert.deepEqual([L.core.interact({ type: 'bowl', to: 'near' }).outcome, playing(L)], ['moved', 'pet'], 'предмет не сменяет поглаживание');
  L.plan.advance(REACTIONS.pet.ms);
  assert.equal(settled(L), true);
  assert.deepEqual([L.core.interact({ type: 'bowl', to: 'home' }).outcome, playing(L)], ['look', 'watch'], 'предмет сменяет декоративное');
});

test('прерывание и окончание без зависших примерки, вещи и облака: тишина, фон, отмена сценки', async () => {
  const counts = host(2, 1);
  const L = started({ cat: CAT }, { counts, scenes: reserver().port });
  counts.set(3, 2);
  saved(L, 'p');
  L.plan.advance(REACTIONS.joy.ms);
  assert.equal(L.state().pose.reaction.tryOn, 'plaid');
  L.core.setContext({ dialog: true });
  assert.deepEqual([L.state().pose.reaction, L.state().phrase], [null, null], 'тишина — реакция и облако сняты');
  L.core.setContext({ dialog: false });
  assert.equal(playing(L), null, 'прерванная не возобновляется');
  L.core.feed();
  L.core.setVisible(false);
  assert.deepEqual([L.state().pose.reaction, L.state().phrase, L.plan.live().length], [null, null, 0], 'фон — реакция, облако и задачи сняты');
  L.core.setVisible(true);
  assert.equal(playing(L), null, 'в фоне ничего не доиграно');
  L.plan.advance(REACTIONS.fed.ms);
  counts.set(4, 3);
  L.random.push(0, 0, 0);
  saved(L, 'scene');
  L.plan.advance(REACTIONS.joy.ms);
  await flush();
  assert.equal(playing(L), 'stretch');
  L.core.stopScene();
  assert.deepEqual([playing(L), L.state().phrase, L.state().scene.waiting], [null, null, null]);
});

// ---------- Б. Дедупликация и Р1 ----------

test('Р1: занятие K доиграло → «Скрыть» → «Показать» → тот же K — второй реакции нет; новый K2 — есть', () => {
  const L = started();
  saved(L, 'K');
  L.plan.advance(REACTIONS.joy.ms);
  assert.equal(playing(L), null);
  assert.equal(L.core.hide().ok, true);
  assert.equal(L.core.show().ok, true);
  const before = L.seen.length;
  const again = saved(L, 'K');
  assert.deepEqual([again.reacted, again.duplicate, playing(L), L.state().phrase], [true, true, null, null], 'повтор K — без реакции и облака (0.1.4 играл радость снова)');
  assert.deepEqual(L.seen.slice(before).flatMap((update) => update.effects), [], 'ни сигнала сценки, ни эффектов');
  const fresh = saved(L, 'K2');
  assert.deepEqual([fresh.duplicate, playing(L)], [false, 'joy']);
});

test('Р1: память событий переживает смену питомца; новое ядро — новая сессия', () => {
  const L = started();
  saved(L, 'K');
  L.plan.advance(REACTIONS.joy.ms);
  L.core.setPet('dog');
  L.plan.advance(REACTIONS.meet.ms);
  assert.equal(saved(L, 'K').duplicate, true, 'собака не повторяет занятие кота');
  assert.equal(playing(L), null);
  L.core.destroy();
  const next = life({}, { storage: L.storage, counts: host(1, 1) });
  next.core.start();
  assert.deepEqual([saved(next, 'K').duplicate, playing(next)], [false, 'joy'], 'новое ядро на том же хранилище — новая сессия');
});

for (const reason of ['timer', 'dictation', 'dialog', 'typing']) {
  test(`Р1: причина тишины ${reason} до и во время скрытия действует после «Показать»; снята — новый ключ играет`, () => {
    const L = started();
    L.core.setContext({ [reason]: true });
    L.core.hide();
    L.core.show();
    saved(L, 'k1');
    assert.deepEqual([playing(L), L.state().pose.shown.page, L.state().context.quiet], [null, 'attentive', [reason]], 'тишина прежняя — радость ждёт (0.1.4 играл сразу)');
    L.core.setContext({ [reason]: false });
    assert.equal(playing(L), 'joy', 'тишина снята — отложенная');
    L.plan.advance(REACTIONS.joy.ms);
    L.core.hide();
    L.core.setContext({ [reason]: true });
    L.core.show();
    saved(L, 'k2');
    assert.equal(playing(L), null, 'причина, полученная во время скрытия, тоже действует');
    L.core.setContext({ [reason]: false });
    assert.equal(playing(L), 'joy');
  });
}

test('Р1: несколько причин — снятие одной не выводит из тишины, и после «Скрыть» / «Показать»', () => {
  const L = started();
  L.core.setContext({ timer: true, typing: true });
  L.core.hide();
  L.core.show();
  L.core.setContext({ timer: false });
  saved(L, 'k');
  assert.deepEqual([playing(L), L.state().context.quiet], [null, ['typing']], 'снятие timer не снимает typing');
  L.core.setContext({ dictation: true });
  L.core.setContext({ typing: false });
  assert.equal(playing(L), null, 'диктовка ещё идёт');
  L.core.setContext({ dictation: false });
  assert.equal(playing(L), 'joy', 'последняя причина снята');
  L.plan.advance(REACTIONS.joy.ms);
  assert.deepEqual([saved(L, 'new').duplicate, playing(L)], [false, 'joy'], 'новый ключ работает');
});

test('Р1: паузы повторов (ожидание 10 с, имя 4 с) переживают «Скрыть» / «Показать»', () => {
  const L = started();
  L.core.open('corner');
  L.core.notify('failed', null);
  assert.equal(playing(L), 'wait');
  L.core.hide();
  L.core.show();
  L.core.notify('failed', null);
  assert.equal(playing(L), null, 'пауза ожидания помнится (0.1.4: новый режиссёр — играл снова)');
  L.plan.advance(REACTIONS.wait.cooldown);
  assert.equal(L.core.setName('Сырник', { pick: true }).reacted, true);
  L.core.hide();
  L.core.show();
  L.core.open('corner');
  assert.equal(L.core.setName('Бублик', { pick: true }).reacted, false, 'пауза named помнится');
  L.plan.advance(REACTIONS.named.cooldown);
  assert.equal(L.core.setName('Бублик', { pick: true }).reacted, true, 'и после неё — снова, имя то же');
});

test('спрятан или не на виду — событие не учитывается: после «Показать» тот же K играет (прежний момент учёта key)', () => {
  const L = started();
  L.core.hide();
  assert.deepEqual([saved(L, 'K').reacted, playing(L)], [false, null], 'спрятан — только числа');
  L.core.show();
  assert.deepEqual([saved(L, 'K').duplicate, playing(L)], [false, 'joy'], 'ключ не был учтён');
  L.plan.advance(REACTIONS.joy.ms);
  L.core.setPresence('on-call');
  assert.equal(saved(L, 'J').reacted, false, '«по зову» и не вызван — без реакции');
  L.core.open('play', { source: 'call' });
  assert.equal(saved(L, 'J').duplicate, false);
});

test('событие без key — legacy String(undefined): одно на экземпляр, как 0.1.4', () => {
  const L = started();
  assert.equal(saved(L, 'undefined').duplicate, false);
  L.plan.advance(REACTIONS.joy.ms);
  assert.deepEqual([saved(L, 'undefined').duplicate, playing(L)], [true, null]);
});

// ---------- В. Тишина ----------

test('тишина: начало снимает реакцию и облако и отменяет сценку (попытку); одна самая важная отложенная', () => {
  const L = started({ cat: CAT }, { scenes: reserver().port });
  L.random.push(0, 0, 0);
  saved(L, 'a');
  assert.equal(L.state().scene.waiting?.type, 'stretch', 'попытка сценки ждёт конца радости');
  L.core.setContext({ typing: true });
  assert.deepEqual([playing(L), L.state().phrase, L.state().scene.waiting], [null, null, null]);
  saved(L, 'b');
  L.core.notify('failed', null); // ожидание важнее радости — заменяет отложенную
  saved(L, 'c', { hard: true });
  L.core.setContext({ typing: false });
  assert.equal(playing(L), 'wait');
  L.plan.advance(REACTIONS.wait.ms);
  assert.equal(playing(L), null, 'остальные не накопились');
});

test('тишина: отложенная актуальна до 60 с — снята в 59 999 мс играет, в 60 000 мс — нет', () => {
  for (const [wait, expected] of [
    [59_999, 'joy'],
    [60_000, null],
  ]) {
    const L = started();
    L.core.setContext({ timer: true });
    saved(L, 'k');
    L.plan.advance(wait);
    L.core.setContext({ timer: false });
    assert.equal(playing(L), expected, `${wait} мс`);
  }
});

test('тишина: декоративное не копится, отменённая сценка не воскресает, явное — в сцене без облака страницы', async () => {
  const L = started({ cat: CAT }, { scenes: reserver().port });
  L.random.push(0, 0, 0);
  saved(L, 'a');
  L.plan.advance(REACTIONS.joy.ms);
  await flush();
  assert.equal(playing(L), 'stretch');
  L.core.setContext({ dictation: true });
  assert.equal(playing(L), null);
  assert.equal(settled(L), false);
  assert.equal(typeof L.core.react, 'undefined', 'сценку и отклики отображение не запускает — только смысловые входы ядра');
  L.core.setContext({ dictation: false });
  assert.equal(playing(L), null, 'ни сценка, ни «устроился» не отложены');
  play(L);
  L.core.setContext({ timer: true });
  assert.equal(L.core.interact({ type: 'paw' }).outcome, 'paw');
  assert.deepEqual([playing(L), L.state().phrase, L.state().pose.shown.page, L.state().pose.shown.play], ['paw', null, 'attentive', 'paw']);
  assert.ok(PHRASES.paw.includes(L.state().scenePhrase));
});

test('контекст: переданный флаг меняется, непереданный сохраняется; неверный — invalid-argument без изменений', () => {
  const L = started();
  L.core.setContext({ focus: true, timer: true });
  L.core.setContext({ timer: false });
  assert.deepEqual([L.state().context, L.state().pose.base], [{ focus: true, quiet: [] }, 'attentive'], 'focus сохранился');
  const state = L.state();
  for (const flags of [null, { focus: 1 }, { noise: true }, 'timer']) assert.equal(L.core.setContext(flags).error.code, 'invalid-argument');
  assert.equal(L.state(), state);
});

// ---------- Ж. Реплики, имя, питомец, настройки ----------

test('реплики: заданный random — реплика банка и группы; без немедленного повтора; кот и собака — свои банки', () => {
  const L = started();
  L.random.push(0.99, 0.99);
  saved(L, 'a');
  assert.equal(L.state().phrase.text, PHRASES.joy.at(-1));
  L.plan.advance(REACTIONS.joy.ms);
  saved(L, 'b');
  assert.equal(L.state().phrase.text, PHRASES.joy.at(-2), 'та же случайность — не та же реплика');
  const D = started({ cat: CAT, companion: { v: 1, kind: 'dog' } });
  D.random.push(0);
  saved(D, 'a');
  assert.equal(D.state().phrase.text, DOG_PHRASES.joy[0]);
});

test('реплики: облако 3,2 с; выключены — облака и реплики вида нет, случайность та же; реплика уголка — по ступени, во сне — «отдых»', () => {
  const L = started();
  saved(L, 'a');
  const at = now(L);
  assert.equal(L.state().phrase.until, at + 3200);
  L.plan.advance(3199);
  assert.notEqual(L.state().phrase, null);
  L.plan.advance(1);
  assert.equal(L.state().phrase, null, 'облако гаснет');
  L.core.open('corner');
  const scene = L.state().scenePhrase;
  assert.ok(phraseList('scene', 0).includes(scene) && !phraseList('scene', 4).filter((text) => !phraseList('scene', 0).includes(text)).includes(scene), 'реплика уголка — без вещей будущих ступеней');
  L.core.setPreferences({ phrases: false });
  assert.deepEqual([L.state().phrase, L.state().scenePhrase], [null, '']);
  const taken = L.random.state.taken;
  saved(L, 'b');
  assert.deepEqual([playing(L), L.state().phrase, L.state().scenePhrase], ['joy', null, '']);
  assert.equal(L.random.state.taken, taken + 1, 'реплика выбирается и при выключенных (последовательность random 0.1.4)');
  L.core.setPreferences({ phrases: true });
  L.core.close();
  L.plan.advance(180_000);
  assert.equal(L.state().pose.resting, true);
  L.core.open('corner');
  assert.ok(PHRASES.rest.includes(L.state().scenePhrase), 'дремал — реплика отдыха');
  assert.equal(L.state().pose.resting, false, 'открыли — проснулся');
});

test('имя: готовое — named (пауза 4 с), и то же имя; свой ввод — тихо; meet при смене питомца (пауза 6 с, помнится при смене)', () => {
  const L = started();
  L.core.open('corner');
  assert.equal(L.core.setName('Сырник', { pick: true }).reacted, true);
  assert.equal(playing(L), 'named');
  assert.ok(PHRASES.named.includes(L.state().scenePhrase));
  L.plan.advance(REACTIONS.named.ms);
  assert.deepEqual([L.core.setName('Пух').reacted, playing(L)], [false, null], 'свой ввод — тихо');
  assert.equal(L.core.setName('Марс', { pick: true }).reacted, false, 'раньше 4 с — нет');
  L.plan.advance(REACTIONS.named.cooldown);
  assert.equal(L.core.setName('Марс', { pick: true }).reacted, true, '«Оставить» то же имя — отклик');
  assert.equal(L.core.setName('x', { pick: 'да' }).error.code, 'invalid-argument');
  L.plan.advance(REACTIONS.named.ms);
  saved(L, 'a');
  assert.equal(L.core.setPet('dog').reacted, true);
  assert.deepEqual(playing(L), 'meet', 'радость кота не доигрывается, собака здоровается');
  assert.ok(DOG_PHRASES.greet.includes(L.state().phrase.text));
  L.plan.advance(REACTIONS.meet.ms);
  assert.equal(L.core.setPet('cat').reacted, false, 'раньше 6 с — без meet, пауза общая');
  L.plan.advance(REACTIONS.meet.cooldown);
  L.core.hide();
  assert.deepEqual([L.core.setPet('dog').reacted, playing(L)], [false, null], 'спрятан — без meet');
});

test('смена питомца и настроек в другом ядре: прежний не доигрывает, реплика вида — нового, реплики выключены — облака нет; свежая сверка — тоже', () => {
  const one = started();
  const two = life({}, { storage: one.storage, counts: host(1, 1), display: LEGACY_DISPLAY });
  assert.equal(two.core.start().ok, true);
  two.core.open('corner');
  saved(two, 'x');
  assert.equal(playing(two), 'joy');
  one.core.setPet('dog');
  assert.deepEqual([playing(two), two.state().pet.shown], [null, 'dog'], 'радость кота во втором ядре не доигрывается');
  assert.ok(phraseList('scene', 0, 'dog').includes(two.state().scenePhrase), 'реплика вида — собаки');
  saved(two, 'y');
  one.core.setPreferences({ phrases: false });
  assert.deepEqual([two.state().phrase, two.state().scenePhrase, playing(two)], [null, '', 'joy'], 'облако и реплика вида исчезли, реакция идёт');
  // Свежая сверка: значение изменено помимо координатора (событие storage ещё не пришло) — следствия до решения команды.
  one.put('cat', { ...one.json('cat'), motion: 'none' });
  two.core.refresh();
  assert.deepEqual([two.state().prefs.motion, two.state().prefs.effectiveMotion], ['none', 'none']);
  two.plan.advance(200_000);
  assert.deepEqual(two.effects('micro'), [], 'без анимации — ни моргания, ни движений');
  one.put('cat', { ...one.json('cat'), hidden: true });
  saved(two, 'z');
  assert.deepEqual([playing(two), two.plan.live().length], [null, 0], 'спрятан в другой вкладке: сверка перед решением — без реакции, задачи сняты');
});
