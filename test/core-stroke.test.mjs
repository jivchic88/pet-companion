// Ядро PL04.3 в Node — жест поглаживания stroke.start/step/end/cancel (docs/ARCHITECTURE.md § 5.2 pose.hold и play, § 6.4,
// сценарии § 6.8): настоящий экземпляр ядра с ручными часами и планировщиком (test/core-kit.mjs life), «Поиграть» открыта,
// пол объявлен. Время — от stroke.start. Долгое поглаживание: первый отклик в 0,2 с, отброшенные 0,6 и 1,1 с не идут в
// лимит, конец реакции в 1,5 с — удержание pet, отклики 1,7 и 3,2 с без повторного объявления, end — покой и подсказка
// сразу. Исчерпание лимита: enough, затем quiet, без повторов; одиночная кнопка — объявляется снова. Отмена до конца
// отклика — доигрывает без объявления; палец лежит — удержание и итог до end; фон снимает реакцию и жест, поздние end и
// cancel безвредны, step — no-gesture. Ядро само снимает жест: питомец, облик, «Скрыть», закрытие и другой вид, destroy.
// Своего таймера конца реакции у игры нет: итог гаснет задачей конца реакции сессии (запас до 900 мс — отдельная задача
// только у коротких откликов). Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { REACTIONS } from '../pet/core/director.mjs';
import { DAY, host, LEGACY_DISPLAY, life } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };
const FLOOR = [-40, -10, 300, 230];
// «Поиграть» открыта, пол объявлен, часы — на начале жеста (t = 0).
function inPlay(initial = { cat: CAT }, parts = {}) {
  const L = life(initial, { counts: host(1, 1), display: LEGACY_DISPLAY, ...parts });
  assert.equal(L.core.start().ok, true);
  assert.equal(L.core.open('play').ok, true);
  assert.equal(L.core.setDisplay({ playFloor: FLOOR }).ok, true);
  L.plan.advance(1000); // «заметил гостя» — до жеста
  return L;
}
const at = (L, ms) => L.plan.advance(ms - (L.time.state.now - L.t0));
const begin = (L) => {
  L.t0 = L.time.state.now;
  return L.core.stroke.start();
};
const told = (L) => L.effects('announce').map((effect) => effect.text);
const view = (L) => {
  const s = L.state();
  return { reaction: s.pose.reaction?.type ?? null, hold: s.pose.hold, play: s.pose.shown.play, outcome: s.play?.outcome ?? null, stroke: s.play?.stroke ?? null };
};

test('§ 6.8 долгое поглаживание: первый отклик, отброшенные не в лимите, удержание между откликами, одно объявление, end — покой', () => {
  const L = inPlay();
  const before = told(L).length;
  const start = begin(L);
  assert.deepEqual([start.ok, start.id, view(L)], [true, 1, { reaction: null, hold: null, play: 'calm', outcome: '', stroke: { id: 1, held: false, told: '' } }], '0 с: жест, удержания и отклика нет');
  at(L, 200);
  assert.deepEqual(L.core.stroke.step(1), { ok: true, changed: true, save: { status: 'none', keys: [], results: {} }, outcome: 'pet', announced: true });
  assert.deepEqual(view(L), { reaction: 'pet', hold: 'pet', play: 'pet', outcome: 'pet', stroke: { id: 1, held: true, told: 'pet' } }, '0,2 с: отклик pet, удержание');
  assert.equal(L.state().pose.reaction.until - L.t0, 200 + REACTIONS.pet.ms, 'отклик до 1,5 с');
  for (const ms of [600, 1100]) {
    at(L, ms);
    const snapshot = L.state();
    assert.deepEqual([L.core.stroke.step(1).outcome, L.core.stroke.step(1).announced, L.state() === snapshot], [null, false, true], `${ms} мс: идёт pet с тем же приоритетом — отброшено, снимок прежний`);
  }
  at(L, 1500);
  assert.deepEqual(view(L), { reaction: null, hold: 'pet', play: 'pet', outcome: 'pet', stroke: { id: 1, held: true, told: 'pet' } }, '1,5 с: реакция кончилась — удержание и итог');
  at(L, 1700);
  assert.deepEqual([L.core.stroke.step(1).outcome, L.state().play.stroke.told], ['pet', 'pet'], '1,7 с: второй отклик');
  at(L, 3200);
  const third = L.core.stroke.step(1);
  assert.deepEqual([third.outcome, third.announced], ['pet', false], '3,2 с: третий, без объявления');
  at(L, 5000);
  assert.deepEqual([L.core.stroke.end(1).changed, view(L)], [true, { reaction: null, hold: null, play: 'calm', outcome: '', stroke: null }], '5 с: end — покой и подсказка сразу');
  assert.deepEqual(told(L).slice(before), ['Марс мурлычет.'], 'одно объявление на жест');
  // В лимите три полных отклика (0,2; 1,7; 3,2), отброшенные не учтены: следующая кнопка — «пока хватит».
  assert.equal(L.core.interact({ type: 'pet' }).outcome, 'enough');
  assert.deepEqual([L.state().progress.marks, L.state().treat], [1, 'ready'], 'знаков и лакомства игра не меняет');
});

test('§ 6.8 исчерпание лимита в том же жесте: enough, затем quiet — по разу; кнопка в ту же минуту — объявление снова', () => {
  const L = inPlay();
  const before = told(L).length;
  begin(L);
  for (const ms of [200, 1700, 3200]) {
    at(L, ms);
    assert.equal(L.core.stroke.step(1).outcome, 'pet', `${ms} мс`);
  }
  at(L, 4600);
  const enough = L.core.stroke.step(1);
  assert.deepEqual([enough.outcome, enough.announced, L.state().pose.reaction.pose, L.state().play.outcome], ['enough', true, 'pet', 'enough'], '4,6 с: «пока хватит» (поза pet)');
  at(L, 5900);
  const quiet = L.core.stroke.step(1);
  assert.deepEqual([quiet.outcome, quiet.announced, L.state().pose.reaction.type], ['quiet', true, 'calmPet'], '5,9 с: «жмурится»');
  at(L, 7000);
  assert.deepEqual([L.core.stroke.step(1).outcome, L.state().play.stroke.told], ['quiet', 'quiet'], '7 с: снова quiet');
  assert.deepEqual(told(L).slice(before), ['Марс мурлычет.', 'Марс: пока хватит.', 'Марс жмурится.'], 'каждый новый итог — по разу');
  at(L, 7100);
  L.core.stroke.end(1);
  at(L, 8000);
  const button = L.core.interact({ type: 'pet' });
  assert.deepEqual([button.outcome, button.text, told(L).at(-1)], ['quiet', 'Марс жмурится.', 'Марс жмурится.'], 'одиночное действие объявляется всегда');
  assert.equal(L.state().progress.marks, 1, 'награды нет');
});

test('§ 6.8 отмена до конца отклика: реакция доигрывает, нового объявления нет, отклик в лимите; затем покой и подсказка', () => {
  const L = inPlay();
  const before = told(L).length;
  begin(L);
  at(L, 200);
  L.core.stroke.step(1);
  at(L, 800);
  assert.deepEqual([L.core.stroke.cancel(1).changed, view(L)], [true, { reaction: 'pet', hold: null, play: 'pet', outcome: 'pet', stroke: null }], '0,8 с: удержание снято, отклик доигрывает');
  at(L, 1499);
  assert.equal(view(L).outcome, 'pet', 'итог — пока идёт реакция');
  at(L, 1500);
  assert.deepEqual(view(L), { reaction: null, hold: null, play: 'calm', outcome: '', stroke: null }, '1,5 с: покой и подсказка');
  assert.deepEqual(told(L).slice(before), ['Марс мурлычет.']);
  assert.deepEqual([L.core.stroke.end(1), L.core.stroke.step(1).error.code], [{ ok: true, changed: false, save: { status: 'none', keys: [], results: {} } }, 'no-gesture'], 'устаревший id: end безвреден, step — no-gesture');
});

test('§ 6.8 фон во время жеста: реакция и жест сняты ядром; поздние end и cancel безвредны, step — no-gesture', () => {
  const L = inPlay();
  begin(L);
  at(L, 200);
  L.core.stroke.step(1);
  at(L, 800);
  L.core.setVisible(false);
  assert.deepEqual(view(L), { reaction: null, hold: null, play: 'calm', outcome: '', stroke: null }, 'фон: stroke null');
  assert.deepEqual([L.core.stroke.cancel(1).changed, L.core.stroke.end(1).changed, L.core.stroke.step(1).error.code], [false, false, 'no-gesture']);
  L.core.setVisible(true);
  assert.equal(L.state().play.stroke, null, 'возврат жест не возвращает');
});

test('§ 6.8 реакция кончилась до отпускания: палец лежит — удержание и итог держатся; end — сразу покой и подсказка', () => {
  const L = inPlay();
  begin(L);
  at(L, 200);
  L.core.stroke.step(1);
  at(L, 4000);
  assert.deepEqual(view(L), { reaction: null, hold: 'pet', play: 'pet', outcome: 'pet', stroke: { id: 1, held: true, told: 'pet' } }, '4 с: «мурлычет» и довольная поза');
  L.core.stroke.end(1);
  assert.deepEqual(view(L), { reaction: null, hold: null, play: 'calm', outcome: '', stroke: null });
});

test('start завершает прежний жест как отмену; жест без отклика удержания не даёт; проверки входа', () => {
  const L = inPlay();
  begin(L);
  at(L, 200);
  L.core.stroke.step(1);
  assert.equal(L.core.stroke.start().id, 2);
  assert.deepEqual(view(L), { reaction: 'pet', hold: null, play: 'pet', outcome: 'pet', stroke: { id: 2, held: false, told: '' } }, 'прежний — как отмена, отклик доигрывает');
  assert.equal(L.core.stroke.step(1).error.code, 'no-gesture');
  for (const bad of ['1', 0, -1, 1.5, null]) assert.equal(L.core.stroke.step(bad).error.code, 'invalid-argument', String(bad));
  assert.equal(L.core.stroke.end('x').error.code, 'invalid-argument');
  // Не в «Поиграть», спрятан, не на виду.
  const C = life({ cat: CAT }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  C.core.start();
  assert.equal(C.core.stroke.start().error.code, 'not-open');
  C.core.open('corner');
  assert.equal(C.core.stroke.start().error.code, 'not-open');
  C.core.hide();
  assert.equal(C.core.stroke.start().error.code, 'hidden');
  C.core.show();
  C.core.setPresence('on-call');
  assert.equal(C.core.stroke.start().error.code, 'away');
  const seen = C.seen.length;
  assert.equal(C.core.stroke.step(1).error.code, 'no-gesture');
  assert.equal(C.seen.length, seen, 'отказ — без обновлений');
});

test('ядро само снимает жест: другой питомец, облик, аксессуар, «Скрыть», закрытие, другой вид, destroy; поздние вызовы безвредны', () => {
  const cases = [
    ['другой питомец', (L) => L.core.setPet('dog'), 'play'],
    ['облик', (L) => L.core.setAppearance({ coat: 'ginger' }), 'play'],
    ['аксессуар', (L) => L.core.setAppearance({ accessory: 'plaid' }), 'play'],
    ['«Скрыть»', (L) => L.core.hide(), null],
    ['закрытие', (L) => L.core.close(), null],
    ['уголок', (L) => L.core.open('corner'), 'corner'],
    ['редактор', (L) => L.core.open('room'), 'room'],
    ['вид из другой вкладки: спрятан', (L) => (L.put('cat', { ...L.json('cat'), hidden: true }), L.events.fire(L.keys.cat)), null],
  ];
  for (const [title, act, open] of cases) {
    const L = inPlay({ cat: { ...CAT, seenStage: 1 } });
    begin(L);
    at(L, 200);
    L.core.stroke.step(1);
    act(L);
    const s = L.state();
    assert.deepEqual([s.view.open, s.play?.stroke ?? null, s.pose.hold], [open, null, null], title);
    assert.deepEqual([L.core.stroke.end(1).changed, L.core.stroke.cancel(1).changed], [false, false], `${title}: поздние end и cancel`);
  }
  const D = inPlay();
  begin(D);
  at(D, 200);
  D.core.stroke.step(1);
  D.core.destroy();
  const gone = D.seen.at(-1);
  assert.deepEqual([gone.reason, gone.snapshot.play?.stroke ?? null, gone.snapshot.pose.hold], ['destroyed', null, null], 'destroy — снимок без жеста');
  assert.equal(D.core.stroke.end(1).error.code, 'destroyed');
});

test('итог гаснет с концом реакции — задачей сессии, без второго таймера; короткий отклик — не раньше 900 мс; тишина страницы', () => {
  const L = inPlay();
  L.t0 = L.time.state.now;
  assert.equal(L.core.interact({ type: 'pet' }).outcome, 'pet');
  const until = L.state().pose.reaction.until;
  const ends = L.plan.live().filter((item) => item.at === until);
  assert.equal(ends.length, 1, 'на момент конца реакции — одна задача (конец реакции сессии)');
  at(L, REACTIONS.pet.ms - 1);
  assert.equal(L.state().play.outcome, 'pet');
  at(L, REACTIONS.pet.ms);
  assert.deepEqual([L.state().play.outcome, L.state().pose.shown.play], ['', 'calm'], 'конец реакции — подсказка');
  // Отклик, отброшенный из-за идущего, лимит не расходует; три полных — затем «пока хватит» (1,3 с), затем «жмурится»
  // (calmPet 0,7 с) — итог держится до 900 мс.
  at(L, 2000);
  assert.deepEqual([L.core.interact({ type: 'pet' }).outcome, L.core.interact({ type: 'pet' }).outcome], ['pet', null]);
  at(L, 3500);
  assert.equal(L.core.interact({ type: 'pet' }).outcome, 'pet');
  at(L, 5000);
  assert.equal(L.core.interact({ type: 'pet' }).outcome, 'enough');
  at(L, 7000);
  L.t0 = L.time.state.now;
  assert.equal(L.core.interact({ type: 'pet' }).outcome, 'quiet');
  at(L, REACTIONS.calmPet.ms);
  assert.deepEqual([L.state().pose.reaction, L.state().play.outcome], [null, 'quiet'], 'реакция кончилась, итог ещё держится');
  at(L, 899);
  assert.equal(L.state().play.outcome, 'quiet');
  at(L, 900);
  assert.equal(L.state().play.outcome, '', '900 мс');
  // Тишина страницы: прямое действие в сцене откликается, страница тиха.
  L.core.setContext({ typing: true });
  at(L, 70_000);
  const quiet = L.core.interact({ type: 'pet' });
  assert.deepEqual([quiet.outcome, L.state().pose.shown.play, L.state().pose.shown.page, L.state().phrase], ['pet', 'pet', 'attentive', null]);
});
