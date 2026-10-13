// Ядро PL04.1 в Node — отказ планировщика (доработка по независимой проверке 2026-10-13; docs/ARCHITECTURE.md § 4.3,
// § 4.5, § 5.5, § 14.1.2): порт scheduler поверх ручного отказывает выбранным задачам — бросает, выполняет задачу внутри
// later (§ 4.3) или бросает при отмене; задачи ядра различаются длительностью. Отказ задачи конца реакции, облака,
// продолжения и отложенной (в команде, при снятии тишины и в задаче), отмена при перепланировании, запуск и возврат
// (задачи покоя, clock.nextDay), перепланирование моргания: команда после применения — ok, честный save, degraded, эффект
// warning internal и журнал, принятая запись не откатывается; задача — warning в своём обновлении; реакция, примерка и
// облако без своей задачи не остаются; повторного планирования нет. Контроли PL03: сбой до применения — internal без
// правки, асинхронная запись, сверка перед решением, destroy в доставке, поздние вызовы. С PL04.2 ждущая сценка — попытка
// ядра (scene.waiting, тестовый порт резервирования), а не сигнал отображению. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PHRASE_MS, REACTIONS } from '../pet/core/director.mjs';
import { calendar, DAY, host, LEGACY_DISPLAY, life, manual, reserver } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };
const started = (initial = { cat: CAT }, parts = {}) => {
  const L = life(initial, { counts: host(1, 1), display: LEGACY_DISPLAY, ...parts });
  assert.equal(L.core.start().ok, true);
  return L;
};
const playing = (L) => L.state().pose.reaction?.type ?? null;
const saved = (L, key, extra = {}) => L.core.notify('saved', { key, counted: true, ...extra });
// Предупреждения эффектами в обновлениях с причиной reason (без reason — во всех).
const warned = (L, reason) => L.seen.filter((update) => !reason || update.reason === reason).flatMap((update) => update.effects.filter((effect) => effect.type === 'warning').map((effect) => `${effect.code} ${effect.message}`));
const lasting = (L) => L.plan.live().filter((item) => item.ms === PHRASE_MS || Object.values(REACTIONS).some((reaction) => reaction.ms === item.ms));

// Планировщик поверх ручного: rule(ms) — 'throw' (later бросает), 'inline' (выполняет задачу внутри later) или '' (обычная
// задача); undo(ms) — отмена бросает.
function gate() {
  const self = { rule: () => '', undo: () => false };
  self.port = (plan) => ({
    later(ms, task) {
      const how = self.rule(ms);
      if (how === 'throw') throw new Error(`планировщик отказал (${ms} мс)`);
      if (how === 'inline') {
        task();
        return () => {};
      }
      const cancel = plan.later(ms, task);
      return () => {
        if (self.undo(ms)) throw new Error(`отмена отказала (${ms} мс)`);
        cancel();
      };
    },
  });
  return self;
}
const refuse = (ms, how = 'throw') => (value) => (value === ms ? how : '');

// ---------- Команда после применения ----------

test('отказ задачи конца реакции: ok, честный save, degraded, warning internal и журнал; праздник записан; реакция и облако сняты, не зависают', () => {
  const G = gate();
  const counts = host(2, 1);
  const L = started({ cat: CAT }, { counts, scheduler: G.port });
  counts.set(3, 2);
  G.rule = refuse(REACTIONS.joy.ms);
  const result = saved(L, 'K');
  assert.deepEqual([result.ok, result.changed, result.degraded, result.reacted, result.duplicate, result.celebrate, result.save.status, result.save.results], [true, true, true, true, false, 1, 'saved', { cat: 'saved' }]);
  assert.deepEqual([L.json('cat').seenStage, L.state().progress.seenStage, L.state().save.cat.status], [1, 1, 'saved'], 'принятая запись не откатывается');
  assert.deepEqual(warned(L), ['internal задача reaction не запланирована: планировщик отказал (1500 мс)'], 'эффект — в обновлении notify');
  assert.deepEqual(warned(L, 'notify').length, 1);
  assert.ok(L.log.list.includes('задача reaction не запланирована: планировщик отказал (1500 мс)'), L.log.list.join(' | '));
  assert.deepEqual([playing(L), L.state().pose.page, L.state().phrase, lasting(L), L.state().scene.waiting], [null, 'calm', null, [], null], 'реакции, облака и их задач нет; сценки нет');
  L.plan.advance(10_000);
  assert.deepEqual([playing(L), L.state().phrase, warned(L).length], [null, null, 1], 'через 10 с — ничего не висит, повторных попыток нет');
  G.rule = () => '';
  assert.equal(saved(L, 'K').duplicate, true, 'событие учтено');
  saved(L, 'K2');
  assert.equal(playing(L), 'joy', 'исправный планировщик — обычная реакция');
  L.plan.advance(REACTIONS.joy.ms);
  assert.equal(playing(L), null);
});

test('отказ задачи облака: реакция идёт и кончается в срок, облака нет; degraded и warning internal', () => {
  const G = gate();
  const port = reserver();
  port.mode.hold.add('enter');
  const L = started({ cat: CAT }, { scheduler: G.port, scenes: port.port });
  G.rule = refuse(PHRASE_MS);
  L.random.push(0, 0, 0);
  const result = saved(L, 'K');
  assert.deepEqual([result.ok, result.degraded, playing(L), L.state().phrase], [true, true, 'joy', null], 'без задачи облака облака нет');
  assert.deepEqual(warned(L, 'notify'), ['internal задача phrase не запланирована: планировщик отказал (3200 мс)']);
  L.plan.advance(REACTIONS.joy.ms);
  assert.deepEqual([playing(L), L.state().phrase, port.calls.reserve], [null, null, 1], 'реакция кончилась своей задачей — и только тогда попытка сценки события K');
  L.plan.advance(10_000);
  assert.equal(L.state().phrase, null);
});

test('отказ продолжения в задаче: «новая вещь» без задачи конца снята — примерка и облако не зависают; warning в обновлении задачи', () => {
  const G = gate();
  const counts = host(2, 1);
  const L = started({ cat: CAT }, { counts, scheduler: G.port });
  counts.set(3, 2);
  assert.equal(saved(L, 'P').degraded, undefined);
  G.rule = refuse(REACTIONS.unlock.ms);
  L.plan.advance(REACTIONS.joy.ms);
  assert.deepEqual([playing(L), L.state().phrase, lasting(L)], [null, null, []], 'примерки платка нет, облако радости снято');
  assert.deepEqual(warned(L, 'reaction'), ['internal задача reaction не запланирована: планировщик отказал (2400 мс)']);
  assert.ok(L.log.list.some((line) => line.includes('(2400 мс)')));
  L.plan.advance(10_000);
  assert.equal(playing(L), null);
});

test('отказ отложенной: при снятии тишины — setContext degraded; из конца реакции — warning задачи; ждущая сценка отменена', () => {
  const G = gate();
  const port = reserver();
  const L = started({ cat: CAT }, { scheduler: G.port, scenes: port.port });
  L.core.setContext({ timer: true });
  L.random.push(0, 0);
  saved(L, 'K');
  assert.equal(L.state().scene.waiting?.type, 'stretch', 'попытка сценки K ждёт её реакции');
  G.rule = refuse(REACTIONS.joy.ms);
  const off = L.core.setContext({ timer: false });
  assert.deepEqual([off.ok, off.degraded, playing(L), L.state().context.quiet, L.state().scene.waiting], [true, true, null, [], null]);
  assert.deepEqual(warned(L, 'setContext'), ['internal задача reaction не запланирована: планировщик отказал (1500 мс)']);
  G.rule = () => '';
  L.random.push(0.9, 0.9, 0, 0);
  saved(L, 'A');
  saved(L, 'B');
  assert.deepEqual([playing(L), L.state().scene.waiting?.type], ['joy', 'stretch'], 'радость A; у B — попытка');
  G.rule = refuse(REACTIONS.joy.ms);
  L.plan.advance(REACTIONS.joy.ms);
  assert.deepEqual([playing(L), lasting(L)], [null, []], 'отложенная B без задачи конца не играет');
  assert.deepEqual([L.state().scene.waiting, port.calls.reserve, warned(L, 'reaction').length], [null, 0, 1], 'попытка B отменена, резервирования нет');
  L.plan.advance(10_000);
  assert.equal(playing(L), null);
});

test('перепланирование: отмена прежней задачи бросает — degraded и warning; прежняя задача, сработав, ничего не делает', () => {
  const G = gate();
  const L = started({ cat: CAT }, { scheduler: G.port });
  G.undo = (ms) => ms === REACTIONS.pet.ms;
  assert.equal(L.core.react('pet', { explicit: true }).played, true);
  const result = saved(L, 'K');
  assert.deepEqual([result.ok, result.degraded, playing(L)], [true, true, 'joy'], 'радость сменила поглаживание');
  assert.deepEqual(warned(L, 'notify'), ['internal задача reaction не отменена: отмена отказала (1300 мс)']);
  const mark = L.seen.length;
  L.plan.advance(REACTIONS.pet.ms);
  assert.deepEqual([playing(L), L.seen.length], ['joy', mark], 'не отменённый планировщиком конец поглаживания сработал — без изменений и обновлений');
  L.plan.advance(REACTIONS.joy.ms - REACTIONS.pet.ms);
  assert.equal(playing(L), null, 'радость кончилась в свой срок');
});

test('планировщик выполнил задачу внутри later (§ 4.3) — отказ постановки: реакция не зависает, degraded', () => {
  const G = gate();
  const L = started({ cat: CAT }, { scheduler: G.port });
  G.rule = refuse(REACTIONS.joy.ms, 'inline');
  const result = saved(L, 'K');
  assert.deepEqual([result.ok, result.degraded, playing(L), L.state().phrase], [true, true, null, null]);
  assert.deepEqual(warned(L, 'notify'), ['internal задача reaction не запланирована: планировщик выполнил её внутри later']);
  L.plan.advance(10_000);
  assert.equal(playing(L), null);
});

// ---------- Запуск, возврат, задачи ----------

test('запуск и возврат: отказ задач покоя и clock.nextDay — degraded и warning по каждой; приветствие и пересчёт дня идут', () => {
  const G = gate();
  const time = calendar();
  time.port = {
    ...time.port,
    nextDay: () => {
      throw new Error('nextDay отказал');
    },
  };
  const counts = host(1, 1);
  const L = life({ cat: { v: 1, seenStage: 0 } }, { counts, time, scheduler: G.port });
  G.rule = (ms) => (ms === 20_000 || ms === 67_500 || ms === 180_000 ? 'throw' : '');
  const start = L.core.start();
  assert.deepEqual([start.ok, start.degraded, start.greet?.day, L.state().status], [true, true, DAY, 'running']);
  assert.deepEqual(warned(L, 'start').map((line) => line.split(':')[0]), ['internal задача blink не запланирована', 'internal задача micro не запланирована', 'internal задача rest не запланирована', 'internal полночь не запланирована']);
  L.plan.advance(900);
  assert.equal(playing(L), 'greet', 'сбой полуночи не отменил приветствие');
  L.plan.advance(REACTIONS.greet.ms);
  L.core.setVisible(false);
  counts.set(4, 2);
  G.rule = () => 'throw';
  const back = L.core.setVisible(true);
  assert.deepEqual([back.ok, back.degraded, L.state().visible, L.state().progress.marks, L.state().progress.today], [true, true, true, 4, 2], 'возврат: счёт и день пересчитаны');
  assert.ok(warned(L, 'setVisible').length >= 3);
  assert.equal(L.plan.live().length, 0, 'задач нет — и повторных попыток тоже');
});

test('задача: отказ перепланирования моргания — warning в обновлении blink, журнал; ядро работает дальше', () => {
  const G = gate();
  const L = started({ cat: CAT }, { scheduler: G.port });
  G.rule = refuse(20_000);
  L.plan.advance(20_000);
  assert.deepEqual(L.effects('micro').map((effect) => effect.kind), ['blink']);
  assert.deepEqual(warned(L, 'blink'), ['internal задача blink не запланирована: планировщик отказал (20000 мс)']);
  assert.ok(L.log.list.includes('задача blink не запланирована: планировщик отказал (20000 мс)'));
  L.plan.advance(100_000);
  assert.equal(L.effects('micro').filter((effect) => effect.kind === 'blink').length, 1, 'моргания больше нет; повторов планирования нет');
  assert.equal(warned(L, 'blink').length, 1);
  saved(L, 'K');
  assert.equal(playing(L), 'joy');
});

// ---------- Контроли PL03 ----------

test('сбой до применения при отказывающем планировщике — internal без правки, записи и эффектов; неверный аргумент — invalid-argument', () => {
  const G = gate();
  const counts = host(1, 1);
  const read = counts.progress;
  let broken = false;
  counts.progress = () => {
    if (broken) throw new Error('progress отказал');
    return read();
  };
  const L = started({ cat: CAT }, { counts, scheduler: G.port });
  G.rule = () => 'throw';
  const state = L.state();
  const writes = L.store.writes.length;
  const seen = L.seen.length;
  broken = true;
  const result = saved(L, 'K');
  assert.deepEqual([result.ok, result.error.code], [false, 'internal']);
  assert.deepEqual([L.state(), L.store.writes.length, L.seen.length, warned(L)], [state, writes, seen, []], 'ничего не изменено, эффектов нет');
  assert.ok(L.log.list.some((line) => line.startsWith('сбой команды notify: progress отказал')), L.log.list.join(' | '));
  broken = false;
  assert.equal(L.core.setContext({ timer: 1 }).error.code, 'invalid-argument');
  assert.equal(L.seen.length, seen);
  G.rule = () => '';
  assert.deepEqual([saved(L, 'K').duplicate, playing(L)], [false, 'joy'], 'событие отказом не учтено');
});

test('асинхронная запись при отказе задачи реакции: pending и degraded сразу, done — saved; destroy снимает задачи, поздние вызовы ничего не делают', async () => {
  const store = manual({ cat: CAT });
  assert.equal(await store.load(), 'ready');
  const G = gate();
  const A = life({}, { storage: store.storage, counts: host(1, 1), scheduler: G.port });
  A.core.start();
  G.rule = refuse(REACTIONS.feed.ms);
  const fed = A.core.feed();
  assert.deepEqual([fed.ok, fed.changed, fed.degraded, fed.save.status, fed.reaction.type, playing(A)], [true, true, true, 'pending', 'feed', null]);
  assert.deepEqual(warned(A, 'feed'), ['internal задача reaction не запланирована: планировщик отказал (2800 мс)']);
  assert.equal(A.effects('announce').at(-1).text, 'Марс получает лакомство. Сегодня уже угостили.', 'объявление — без слов о сохранности');
  const stale = A.plan.all.slice();
  A.core.destroy();
  assert.equal(A.plan.live().length, 0);
  await store.drain();
  assert.equal(await fed.save.done, 'saved', 'поставленная запись выполнена');
  assert.equal(store.json('treat').fedDay, DAY);
  const seen = A.seen.length;
  for (const item of stale) item.task();
  assert.deepEqual([A.seen.length, A.state().status], [seen, 'destroyed']);
});

test('сверка перед решением и destroy в доставке при отказе: изменение другой вкладки — своим обновлением без warning; degraded — у команды; одно destroyed', () => {
  const G = gate();
  const L = started({ cat: CAT }, { scheduler: G.port });
  L.put('cat', { ...L.json('cat'), motion: 'calm', note: 'другая вкладка' });
  G.rule = refuse(REACTIONS.joy.ms);
  const reasons = [];
  L.core.subscribe((update) => {
    reasons.push(update.reason);
    if (update.reason === 'notify') L.core.destroy();
  }, { initial: false });
  const result = saved(L, 'K');
  assert.deepEqual([result.ok, result.degraded, reasons], [true, true, ['storage', 'notify', 'destroyed']]);
  assert.deepEqual([warned(L, 'storage'), warned(L, 'notify').length], [[], 1], 'чужое изменение — не сбой команды');
  assert.deepEqual([L.state().status, L.state().prefs.motion, L.json('cat').note, L.plan.live().length], ['destroyed', 'calm', 'другая вкладка', 0]);
});
