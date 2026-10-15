// Ядро PL04.1 в Node — фон удерживает запрет проигрывания (доработка по независимой проверке 2026-10-13; docs/ARCHITECTURE.md
// § 6.4 setVisible, § 10, § 14.1.2): настоящий экземпляр ядра с ручными часами, ручным планировщиком и заданной
// случайностью (test/core-kit.mjs life). Отложенная реакция и причины тишины timer, dictation, dialog, typing (по одной и
// вместе), снятые в фоне, — ни реакции, ни облака, ни задач, ни сигнала начала сценки; возврат сразу и после 60 с ничего
// не доигрывает. Новые события в фоне: числа, праздник с отметкой ступени, лакомство, учёт key — как всегда, проигрывания и
// задач нет; прямые отклики, готовое имя, другой питомец, открытие вида — тоже; запуск в фоне. Контроли (проходят и до
// доработки): идущие реакция и сценка сняты фоном; видимая вкладка — отложенная до срока играет, явное действие «Поиграть» в
// тишине играет; фон и «Скрыть» сохраняют учтённые события, причины тишины и паузы повторов (Р1). С PL04.2 сценку
// показывает ядро (тестовый порт резервирования), вид — open ядра; «сигнал начала сценки» стал внутренним — наблюдается
// показ сценки и попытка (scene.waiting). Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { REACTIONS } from './legacy-rules.mjs';
import { QUIET_REASONS } from '../pet/core/session.mjs';
import { DAY, flush, host, LEGACY_DISPLAY, life, reserver } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY }; // приветствие сегодня уже было — запуск без него
const started = (initial = { cat: CAT }, parts = {}) => {
  const L = life(initial, { counts: host(1, 1), display: LEGACY_DISPLAY, ...parts });
  assert.equal(L.core.start().ok, true);
  return L;
};
const playing = (L) => L.state().pose.reaction?.type ?? null;
const saved = (L, key, extra = {}) => L.core.notify('saved', { key, counted: true, ...extra });
const plannedMs = (L) => L.plan.live().map((item) => item.ms);
// Обновления с отметки mark: была ли в снимках реакция или облако, сценка или её попытка, движения.
const since = (L, mark) => {
  const list = L.seen.slice(mark);
  return {
    reacted: list.some((update) => update.snapshot.pose.reaction !== null),
    phrase: list.some((update) => update.snapshot.phrase !== null),
    scene: list.some((update) => update.snapshot.pose.reaction?.scene === true || update.snapshot.scene.waiting !== null),
    micro: list.flatMap((update) => update.effects.filter((effect) => effect.type === 'micro')).length,
    warnings: list.flatMap((update) => update.effects.filter((effect) => effect.type === 'warning')).length,
  };
};
const QUIET = { reacted: false, phrase: false, scene: false, micro: 0, warnings: 0 };

// ---------- Отложенная и тишина ----------

const SETS = [...QUIET_REASONS.map((reason) => [reason]), ['timer', 'dictation'], ['dialog', 'typing'], [...QUIET_REASONS]];

for (const reasons of SETS) {
  test(`фон: отложенная при тишине ${reasons.join('+')} — причины сняты в фоне: ни реакции, ни облака, ни задач; возврат ничего не доигрывает`, () => {
    const L = started();
    L.core.setContext(Object.fromEntries(reasons.map((reason) => [reason, true])));
    const result = saved(L, 'K');
    assert.deepEqual([result.reacted, result.duplicate, playing(L)], [true, false, null], 'радость отложена тишиной');
    assert.equal(L.core.setVisible(false).ok, true);
    assert.deepEqual([L.state().visible, L.plan.live().length], [false, 0]);
    const mark = L.seen.length;
    for (const reason of reasons) {
      const off = L.core.setContext({ [reason]: false });
      assert.deepEqual([off.ok, off.degraded, playing(L), L.state().phrase, L.plan.live().length], [true, undefined, null, null, 0], `снята ${reason} в фоне`);
    }
    assert.deepEqual([L.state().context.quiet, L.state().visible, L.state().pose.shown.page], [[], false, 'calm']);
    L.plan.advance(5000);
    assert.deepEqual(since(L, mark), QUIET, 'в фоне ни реакции, ни облака, ни сигнала сценки, ни движений');
    L.core.setVisible(true);
    assert.deepEqual([playing(L), L.state().phrase], [null, null], 'возврат сразу — отменённая не доигрывается');
    assert.deepEqual(plannedMs(L).sort((a, b) => a - b), [20_000, 67_500, 180_000 - 5000, 50_400_000 - 5000], 'после возврата — только покой и полночь (дремота и полночь — от прежних отсчётов)');
    L.plan.advance(60_000);
    assert.deepEqual(since(L, mark).reacted, false, 'и позже — ничего');
    assert.equal(saved(L, 'K').duplicate, true, 'событие учтено (Р1)');
    assert.equal(saved(L, 'K2').reacted && playing(L), 'joy', 'новое событие после возврата играет');
  });
}

test('фон: возврат при прежней тишине и её снятие после возврата — отменённая отложенная не воскресает; после 60 с — тоже', () => {
  for (const wait of [0, 61_000]) {
    const L = started();
    L.core.setContext({ timer: true });
    saved(L, 'K');
    L.core.setVisible(false);
    L.plan.advance(wait);
    L.core.setVisible(true);
    assert.deepEqual([playing(L), L.state().context.quiet], [null, ['timer']], `${wait} мс: таймер сайта ещё идёт`);
    const mark = L.seen.length;
    L.core.setContext({ timer: false });
    assert.equal(playing(L), null, `${wait} мс: таймер снят после возврата — радость, отменённая фоном, не играет`);
    L.plan.advance(5000);
    assert.equal(since(L, mark).reacted, false);
    L.core.setContext({ timer: true });
    saved(L, 'K2');
    L.core.setContext({ timer: false });
    assert.equal(playing(L), 'joy', `${wait} мс: новая отложенная после возврата работает`);
  }
});

test('контроль: идущие реакция и сценка сняты фоном — возврат их не доигрывает (попытка отменена, задач нет), как до доработки', async () => {
  const L = started({ cat: CAT }, { scenes: reserver().port });
  L.random.push(0, 0, 0);
  saved(L, 'S');
  L.plan.advance(REACTIONS.joy.ms);
  await flush();
  assert.equal(playing(L), 'stretch');
  L.core.setVisible(false);
  assert.deepEqual([playing(L), L.state().phrase, L.plan.live().length], [null, null, 0]);
  L.core.setVisible(true);
  L.plan.advance(REACTIONS.stretch.ms + 1000);
  assert.equal(playing(L), null, 'сценка не возобновилась');
  // Другой экземпляр, свой день: попытка ждёт конца радости, фон её отменяет — прерванная радость не доиграна, резервирования нет.
  const port = reserver();
  const J = started({ cat: CAT }, { scenes: port.port });
  J.random.push(0, 0, 0);
  saved(J, 'J');
  assert.equal(J.state().scene.waiting?.type, 'stretch');
  J.core.setVisible(false);
  J.core.setVisible(true);
  J.plan.advance(REACTIONS.joy.ms);
  await flush();
  assert.deepEqual([playing(J), J.state().scene.waiting, port.calls.reserve], [null, null, 0], 'прерванная радость не доиграна — сценка не пробует');
});

test('фон: событие с выпавшей сценкой — бросок как 0.1.4 (шанс и вариант), но попытки нет: снимок без scene.waiting, возврат ничего не резервирует', async () => {
  const port = reserver();
  const L = started({ cat: CAT }, { scenes: port.port });
  L.core.setVisible(false);
  L.random.push(0, 0, 0);
  const before = L.random.state.taken;
  const mark = L.seen.length;
  assert.equal(saved(L, 'B').reacted, true, 'решение занятия то же');
  assert.deepEqual([L.random.state.taken - before, L.state().scene.waiting, since(L, mark).scene], [2, null, false], 'бросок — шанс и вариант, попытки нет');
  L.core.setVisible(true);
  L.plan.advance(REACTIONS.joy.ms + 20_000);
  await flush();
  assert.deepEqual([playing(L), L.state().scene.waiting, port.calls.reserve], [null, null, 0], 'возврат — ни сценки, ни резервирования');
  // Видимая вкладка — та же попытка ждёт конца радости.
  L.random.push(0, 0, 0);
  saved(L, 'V');
  assert.equal(L.state().scene.waiting?.type, 'stretch');
});

// ---------- Новые события и входы в фоне ----------

test('фон: saved — числа, праздник с отметкой ступени, учёт key как всегда; реакции, облака и задач нет', () => {
  const counts = host(2, 1);
  const L = started({ cat: CAT }, { counts });
  L.core.setVisible(false);
  counts.set(3, 2);
  const mark = L.seen.length;
  const result = saved(L, 'S', { first: true });
  assert.deepEqual([result.ok, result.reacted, result.duplicate, result.celebrate, result.degraded], [true, true, false, 1, undefined], 'решение — как в видимой вкладке');
  assert.deepEqual([L.state().progress.marks, L.state().progress.stage, L.state().progress.seenStage, L.json('cat').seenStage, L.state().save.cat.status], [3, 1, 1, 1, 'saved'], 'числа и отметка ступени записаны');
  assert.deepEqual([playing(L), L.state().phrase, L.plan.live().length], [null, null, 0], 'праздничная реакция и примерка не играют');
  assert.deepEqual(L.effects().slice(-2).map((effect) => effect.type), ['celebrate', 'announce'], 'праздник и объявление — эффекты решения');
  assert.deepEqual(since(L, mark), QUIET);
  L.core.setVisible(true);
  L.plan.advance(10_000);
  assert.deepEqual([since(L, mark).reacted, saved(L, 'S').duplicate], [false, true], 'возврат ничего не доигрывает; событие учтено (как запрос 0.1.4)');
});

test('фон: failed, лакомство, прямые отклики, готовое имя, другой питомец, открытие вида — без реакций и задач; данные пишутся', () => {
  const L = started();
  L.core.setVisible(false);
  const mark = L.seen.length;
  const failed = L.core.notify('failed', null);
  assert.deepEqual([failed.ok, failed.reacted, playing(L)], [true, true, null], 'ожидание не играет');
  const fed = L.core.feed();
  assert.deepEqual([fed.ok, fed.reaction.type, fed.save.status, L.json('treat').fedDay, L.state().treat], [true, 'feed', 'saved', DAY, 'fed'], 'лакомство дня отмечено и записано');
  assert.equal(L.effects('announce').at(-1).text, 'Марс получает лакомство. Сегодня уже угостили.');
  assert.deepEqual([L.core.interact({ type: 'pet' }).outcome, L.core.arrive().arrived, playing(L)], [null, true, null], 'поглаживание и «устроился» не играют');
  L.core.open('corner');
  assert.deepEqual([L.core.setName('Сырник', { pick: true }).reacted, L.json('cat').name], [false, 'Сырник']);
  assert.deepEqual([L.core.setPet('dog').reacted, L.state().pet.shown], [false, 'dog']);
  L.core.setContext({ typing: true });
  saved(L, 'T');
  L.core.setContext({ typing: false });
  assert.deepEqual([playing(L), L.state().phrase, L.plan.live().length], [null, null, 0], 'ни одной задачи (и «заметил гостя» при открытии уголка)');
  L.plan.advance(10_000);
  assert.deepEqual(since(L, mark), QUIET);
  L.core.setVisible(true);
  L.plan.advance(10_000);
  assert.equal(since(L, mark).reacted, false, 'возврат ничего не доигрывает');
  L.core.notify('failed', null);
  assert.equal(playing(L), 'wait', 'ожидание в фоне не запускалось — пауза повтора не начата');
});

test('запуск в фоне: до возврата ни задач, ни реакций; возврат — покой и полночь, приветствия нет', () => {
  const L = life({ cat: { v: 1, seenStage: 0 } }, { counts: host(1, 1) });
  L.core.setVisible(false);
  assert.equal(L.core.start().ok, true);
  L.core.setContext({ timer: true });
  saved(L, 'K');
  L.core.setContext({ timer: false });
  assert.deepEqual([playing(L), L.plan.live().length], [null, 0]);
  L.core.setVisible(true);
  L.plan.advance(1000);
  assert.deepEqual([playing(L), plannedMs(L).length], [null, 4]);
});

// ---------- Контроли ----------

test('контроль: в видимой вкладке снятие последней причины запускает отложенную до срока; явное действие «Поиграть» в тишине играет', () => {
  const L = started();
  L.core.setContext({ dialog: true, typing: true });
  saved(L, 'K');
  L.plan.advance(59_000);
  L.core.setContext({ dialog: false });
  assert.equal(playing(L), null, 'осталась typing');
  L.core.setContext({ typing: false });
  assert.deepEqual([playing(L), L.state().phrase !== null, plannedMs(L).includes(REACTIONS.joy.ms)], ['joy', true, true]);
  L.plan.advance(REACTIONS.joy.ms);
  L.core.open('play');
  L.core.setContext({ timer: true });
  assert.deepEqual([L.core.interact({ type: 'pet' }).outcome, playing(L), L.state().phrase], ['pet', 'pet', null], 'тишина и фон — разные запреты');
});

test('контроль Р1: фон, возврат, «Скрыть» и «Показать» сохраняют учтённые события, причины тишины и паузы повторов', () => {
  const L = started();
  saved(L, 'K');
  L.plan.advance(REACTIONS.joy.ms);
  L.core.notify('failed', null);
  assert.equal(playing(L), 'wait');
  L.core.setContext({ dialog: true, timer: true });
  L.core.setVisible(false);
  L.core.setVisible(true);
  L.core.hide();
  L.core.show();
  L.core.setVisible(false);
  L.core.setContext({ timer: false });
  L.core.setVisible(true);
  assert.deepEqual(L.state().context.quiet, ['dialog'], 'причина, снятая в фоне, снята; другая осталась');
  assert.equal(saved(L, 'K').duplicate, true, 'учтённое событие помнится');
  saved(L, 'K2');
  assert.equal(playing(L), null, 'тишина действует');
  L.core.setContext({ dialog: false });
  assert.equal(playing(L), 'joy', 'отложенная, полученная после возврата, играет');
  L.plan.advance(REACTIONS.joy.ms);
  L.core.notify('failed', null);
  assert.equal(playing(L), null, 'пауза повтора ожидания (10 с) помнится');
  L.plan.advance(REACTIONS.wait.cooldown);
  L.core.notify('failed', null);
  assert.equal(playing(L), 'wait');
});
