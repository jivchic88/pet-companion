// Ядро PL04.3 в Node — интеграция комнаты и игры с прежними контрактами (docs/ARCHITECTURE.md § 4.3–4.5, § 5.2–5.5, § 8):
// полный глубоко замороженный снимок и стабильная ссылка; итоговая поза страницы, «Поиграть» и редактора — реакции,
// примерка и вещь рядом, сценка, удержание жестом, тишина и дремота; сдвиг к переставленной миске в снимке; два ядра на
// одном координаторе (автор первым, чужая расстановка у второго — отметка, свои предметы — по одному разу) и разные
// пространства имён; барьер load перед новым ядром на асинхронном координаторе; команды из портов — reentrant, destroy из
// порта — в конце фазы, из слушателя — после доставки; исключение слушателя; отказ планировщика задачи итога — degraded,
// warning internal, итог не остаётся навсегда. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { REACTIONS } from './legacy-rules.mjs';
import { createPetCore } from './core-kit.mjs';
import { feedShift } from './legacy-room.mjs';
import { calendar, DAY, flush, host, journal, LEGACY_DISPLAY, life, manual, planner, reserver, series, web } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };
const FLOOR = [-40, -10, 300, 230];
const deepFrozen = (value) => !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen));

test('снимок: play, room, place, pose.shown и hold — простые данные, глубоко заморожены; ссылка стабильна до изменения', () => {
  const L = life({ cat: CAT, room: { v: 1, cat: { bowl: { x: 300, y: 230 } } }, place: { v: 1, phone: { place: 'top' } } }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  L.core.start();
  L.core.open('play');
  L.core.setDisplay({ playFloor: FLOOR });
  L.core.stroke.start();
  L.core.stroke.step(1);
  const s = L.state();
  assert.equal(deepFrozen(s), true);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(s))), JSON.stringify(s), 'только простые данные');
  assert.deepEqual(Object.keys(s.play), ['toys', 'outcome', 'text', 'stroke', 'drag']);
  assert.deepEqual(Object.keys(s.pose), ['base', 'resting', 'hold', 'shown', 'reaction']);
  assert.deepEqual(Object.keys(s.room), ['pos', 'feedShift', 'draft']);
  assert.equal(L.state(), s, 'стабильная ссылка');
  assert.equal(L.core.stroke.step(1).changed, false);
  assert.equal(L.state(), s, 'отброшенный отклик — та же ссылка');
  assert.throws(() => {
    s.play.toys.bowl.at[0] = 1;
  }, TypeError);
  assert.deepEqual([s.room.feedShift, s.place], [feedShift({ kind: 'cat', stage: 0, pos: s.room.pos }), { v: 1, phone: { place: 'top' } }], 'сдвиг к миске — из сохраняемой расстановки');
  assert.notDeepEqual(s.room.feedShift, [0, 0], 'миска переставлена — питомец подходит к ней');
});

test('поза поверхностей: page — реакция (кроме сценки и прямого действия в тишине); play — реакция, удержание, иначе спокойная; room — спокойная', async () => {
  const counts = host(2, 1);
  const L = life({ cat: CAT }, { counts, display: LEGACY_DISPLAY, scenes: reserver().port, random: series([0, 0.9]) });
  L.core.start();
  counts.set(3, 2);
  L.core.notify('saved', { key: 'u', counted: true });
  L.plan.advance(REACTIONS.joy.ms);
  const unlock = L.state();
  assert.deepEqual([unlock.pose.reaction.type, unlock.pose.reaction.tryOn, unlock.pose.shown], ['unlock', 'plaid', { page: 'unlock', play: 'unlock', room: 'calm' }], 'примерка: поза реакции; редактор — спокойный');
  L.plan.advance(REACTIONS.unlock.ms);
  L.core.feed();
  assert.deepEqual([L.state().pose.reaction.mini, L.state().pose.shown.room, L.state().pose.shown.page], ['bowl', 'content', 'feed'], 'кормление — на странице; в редакторе — довольный покой, без реакции');
  L.plan.advance(REACTIONS.feed.ms + REACTIONS.fed.ms);
  assert.deepEqual(L.state().pose.shown, { page: 'content', play: 'content', room: 'content' }, 'довольный покой после лакомства');
  // Сценка: поверх позы покоя на странице, в «Поиграть» и редакторе — не видна.
  counts.set(4, 3);
  L.random.push(0, 0, 0);
  L.core.notify('saved', { key: 's', counted: true });
  L.plan.advance(REACTIONS.joy.ms);
  await flush();
  assert.deepEqual([L.state().pose.reaction.scene, L.state().pose.shown], [true, { page: 'content', play: 'content', room: 'content' }]);
  // Дремота и тишина: страница — rest / attentive, «Поиграть» — без тишины и дремоты.
  L.plan.advance(200_000);
  assert.deepEqual([L.state().pose.shown.page, L.state().pose.shown.play], ['rest', 'content']);
  L.core.setContext({ timer: true });
  assert.deepEqual([L.state().pose.shown.page, L.state().pose.shown.play], ['attentive', 'content']);
});

test('два ядра на одном координаторе: автор первым, второе — чужая расстановка (other), каждый пишет свои предметы; разные namespace — независимы', () => {
  const site = web({ cat: CAT });
  assert.equal(site.storage.load(), 'ready');
  const A = life({}, { storage: site.storage, counts: host(1, 1), display: LEGACY_DISPLAY });
  const B = life({}, { storage: site.storage, counts: host(1, 1), display: LEGACY_DISPLAY });
  A.core.start();
  B.core.start();
  A.core.open('room');
  B.core.open('room');
  const order = [];
  A.core.subscribe((update) => order.push(`A ${update.reason}`), { initial: false });
  B.core.subscribe((update) => order.push(`B ${update.reason}`), { initial: false });
  A.core.room.move('yarn', [250, 234]);
  B.core.room.move('bowl', [300, 230]);
  order.length = 0;
  B.core.room.save();
  assert.deepEqual(order, ['B room.save', 'A storage'], 'автор первым, затем поглотившее');
  assert.deepEqual([A.state().room.draft.other, A.state().room.draft.pos.yarn, A.state().room.draft.pos.bowl], [true, [250, 234], [170, 205]], 'черновик A цел: миска B — только в сохраняемой');
  assert.deepEqual(A.state().room.pos.bowl, [300, 230]);
  A.core.room.save();
  assert.deepEqual(site.json('room'), { v: 1, cat: { bowl: { x: 300, y: 230 }, yarn: { x: 250, y: 234 } } }, 'по одному разу: миска B, клубок A');
  // Другое пространство имён — свой координатор.
  const other = web({ cat: CAT });
  assert.equal(other.storage.load(), 'ready');
  const C = life({}, { storage: other.storage, counts: host(1, 1), display: LEGACY_DISPLAY });
  C.core.start();
  assert.deepEqual([C.state().room.pos.yarn, other.raw('room')], [[36, 231], null]);
});

test('асинхронный координатор: барьер load перед новым ядром — расстановка и место подтверждены; поздний результат прежнего ядра — только done', async () => {
  const store = manual();
  assert.equal(await store.load(), 'ready');
  const A = life({}, { storage: store.storage, counts: host(1, 1), display: LEGACY_DISPLAY });
  A.core.start();
  await store.drain();
  A.core.open('room');
  A.core.room.move('yarn', [250, 234]);
  const saved = A.core.room.save();
  const placed = A.core.setPlace({ desktop: { place: 'logo' } });
  A.core.destroy();
  const barrier = store.storage.load();
  await store.drain();
  assert.equal(await barrier, 'ready');
  const B = life({}, { storage: store.storage, counts: host(1, 1), display: LEGACY_DISPLAY });
  B.core.start();
  assert.deepEqual([await saved.save.done, await placed.save.done, B.state().room.pos.yarn, B.state().place.desktop.place], ['saved', 'saved', [250, 234], 'logo']);
});

test('порты и слушатели: команды из портов — reentrant; destroy из порта — в конце фазы; из слушателя — после доставки; исключение слушателя', () => {
  const site = web({ cat: CAT });
  assert.equal(site.storage.load(), 'ready');
  const time = calendar();
  const plan = planner(time);
  const log = journal();
  let core = null;
  const inside = [];
  let armed = false;
  const core0 = createPetCore({
    storage: site.storage,
    progress: () => ({ marks: 1, today: 1 }),
    clock: time.port,
    log: log.port,
    scheduler: plan.port,
    random: () => {
      if (armed) inside.push(core.room.select('bowl').error?.code ?? 'ok', core.interact({ type: 'pet' }).error?.code ?? 'ok', core.stroke.step(1).error?.code ?? 'ok', core.toy.cancel().error?.code ?? 'ok', core.setPlace({ phone: { view: 'full' } }).error?.code ?? 'ok', core.arrive().error?.code ?? 'ok');
      return 0.5;
    },
  });
  core = core0;
  core.setDisplay(LEGACY_DISPLAY);
  core.start();
  core.open('play');
  core.setDisplay({ playFloor: FLOOR });
  const { id } = core.stroke.start();
  armed = true;
  assert.equal(core.stroke.step(id).outcome, 'pet', 'команда идёт, реплика тянет random');
  armed = false;
  assert.deepEqual([...new Set(inside)], ['reentrant'], 'все команды из порта — reentrant, без изменений');
  assert.equal(site.raw('place'), null);
  // Исключение слушателя: доставка продолжается, команда не откатывается.
  const got = [];
  core.subscribe(() => {
    throw new Error('слушатель упал');
  }, { initial: false });
  core.subscribe((update) => got.push(update.reason), { initial: false });
  assert.equal(core.stroke.end(id).ok, true);
  assert.deepEqual([got, log.list.some((line) => line.includes('исключение подписчика'))], [['stroke.end'], true]);
  // destroy из слушателя: команда завершена, слушателям — destroyed, дальше — destroyed.
  let done = null;
  core.subscribe((update) => {
    if (update.reason === 'interact') done = core.destroy();
  }, { initial: false });
  plan.advance(2000);
  const result = core.interact({ type: 'paw' });
  assert.deepEqual([result.ok, result.outcome, core.status, got.at(-1), done], [true, 'paw', 'destroyed', 'destroyed', undefined]);
  assert.equal(core.stroke.start().error.code, 'destroyed');
  // destroy из порта внутри команды — в конце её фазы: результат команды, затем destroyed.
  const L = life({ cat: CAT }, { counts: host(1, 1), display: LEGACY_DISPLAY, random: { port: () => (L.armed && L.core.destroy(), 0.5), state: { taken: 0 } } });
  L.core.start();
  L.core.open('play');
  L.armed = true;
  const pet = L.core.interact({ type: 'pet' });
  const gone = L.seen.at(-1).snapshot;
  assert.deepEqual([pet.ok, pet.outcome, L.core.status, L.seen.at(-1).reason, gone.play.stroke, gone.play.drag, gone.pose.hold], [true, 'pet', 'destroyed', 'destroyed', null, null, null]);
});

test('отказ планировщика задачи итога: итог не остаётся навсегда — подсказка сразу; degraded, warning internal и журнал', () => {
  let refuse = false;
  const L = life({ cat: CAT }, { counts: host(1, 1), display: LEGACY_DISPLAY, scheduler: (plan) => ({ later: (ms, task) => (refuse && ms > 0 && ms < 900 && ms !== REACTIONS.calmPet.ms ? (() => { throw new Error('нет таймера'); })() : plan.later(ms, task)) }) });
  L.core.start();
  L.core.open('play');
  for (let i = 0; i < 4; i += 1) {
    L.core.interact({ type: 'pet' });
    L.plan.advance(2000);
  }
  refuse = true;
  assert.equal(L.core.interact({ type: 'pet' }).outcome, 'quiet', 'calmPet 700 мс');
  L.plan.advance(REACTIONS.calmPet.ms);
  const last = L.seen.at(-1);
  assert.deepEqual([L.state().play.outcome, last.reason, last.effects.some((effect) => effect.type === 'warning' && effect.code === 'internal')], ['', 'reaction', true], 'задача запаса не поставлена — подсказка сразу, warning в обновлении задачи');
  assert.ok(L.log.list.some((line) => line.includes('play-outcome')), L.log.list.join(' | '));
});
