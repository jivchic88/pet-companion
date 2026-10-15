// Ядро PL04.3 в Node — «Поиграть»: interact и предметы (docs/ARCHITECTURE.md § 5.2 play, § 6.4 interact, setDisplay
// playFloor, § 10 «Лимит», «Перемещение миски не кормит»): настоящий экземпляр ядра с ручными часами и планировщиком.
// Поглаживание и лапа — итоги и тексты кота и собаки, общий лимит три в минуту → «пока хватит» → тихо, истечение минуты;
// у предметов свой счёт; не менее важная реакция — отклик пропадает и в лимит не идёт; тишина страницы — отклик в сцене;
// кнопки уголка — обычный запрос без итога; лапа кота вне «Поиграть» — unsupported. Миска: near / home / точка, ближе —
// принюхивается, дальше — смотрит, «Вернуть миску», не кормит; мячик: бросок числом и «катнуть», упор в край — dropped.
// Пол: строгая проверка объявления целиком, непереданное сохраняется, копия без внешней мутации, новый пол ограничивает
// места. Перенос предмета (toy.drag/drop/cancel): место под указателем — ядро, катившийся мячик — где взяли, отмена — на
// месте до жеста, мячик без броска не катится, без анимации — где отпустили. Знаков и наград игра не даёт. Точка предмета
// — ровно два конечных числа: разреженная (пустой индекс), неконечная или неверной длины — invalid-argument до изменения
// (по независимой проверке PL04.3); разреженный пол отказывает и раньше — контроль. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { REACTIONS } from './legacy-rules.mjs';
import { playTexts } from './legacy-rules.mjs';
import { HOME, NEAR, placeToy, SIZE, zoneOf } from './legacy-toys.mjs';
import { badPoints, DAY, host, LEGACY_DISPLAY, life } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };
const DOG = { v: 1, kind: 'dog' };
const FLOOR = [-40, -10, 300, 230];
function inPlay(initial = { cat: CAT }, parts = {}) {
  const L = life(initial, { counts: host(1, 1), display: LEGACY_DISPLAY, ...parts });
  assert.equal(L.core.start().ok, true);
  assert.equal(L.core.open('play').ok, true);
  assert.equal(L.core.setDisplay({ playFloor: FLOOR }).ok, true);
  L.plan.advance(1000);
  return L;
}
const playing = (L) => L.state().pose.reaction?.type ?? null;
const toys = (L) => L.state().play.toys;

test('поглаживание и лапа: итоги и тексты кота и собаки; лимит три в минуту → «пока хватит» → тихо; минута прошла — снова', () => {
  const L = inPlay();
  const results = [];
  for (let i = 0; i < 6; i += 1) {
    const r = L.core.interact({ type: i % 2 ? 'paw' : 'pet' });
    results.push([r.outcome, r.text, playing(L)]);
    L.plan.advance(2000);
  }
  assert.deepEqual(results, [
    ['pet', 'Марс мурлычет.', 'pet'],
    ['paw', 'Марс касается твоей руки лапой.', 'paw'],
    ['pet', 'Марс мурлычет.', 'pet'],
    ['enough', 'Марс: пока хватит.', 'paw'],
    ['quiet', 'Марс жмурится.', 'calmPet'],
    ['paw', 'Марс касается твоей руки лапой.', 'calmPaw'],
  ], 'лапа и поглаживание — один лимит; лапа и в «тихо» — свой текст (как 0.1.4)');
  L.plan.advance(60_000);
  assert.equal(L.core.interact({ type: 'pet' }).outcome, 'pet', 'минута прошла — снова полный отклик');
  const D = inPlay({ cat: CAT, companion: DOG });
  assert.deepEqual([D.core.interact({ type: 'pet' }).text, (D.plan.advance(2000), D.core.interact({ type: 'paw' })).text], ['Тоби виляет хвостом.', 'Тоби даёт лапу.']);
  assert.deepEqual(Object.keys(playTexts('cat', 'Марс')), ['enough', 'paw', 'quiet', 'pet', 'sniff', 'look', 'ball', 'bowlMoved', 'ballMoved'], 'все итоги — для места под ними');
});

test('приоритет: не менее важная реакция — отклик пропадает и в лимит не идёт; не копится; тишина страницы — отклик в сцене', () => {
  const L = inPlay();
  L.core.notify('saved', { key: 'a', counted: true });
  assert.equal(playing(L), 'joy');
  for (let i = 0; i < 5; i += 1) assert.equal(L.core.interact({ type: 'pet' }).outcome, null, 'радость важнее — отклик пропал');
  L.plan.advance(REACTIONS.joy.ms);
  assert.equal(playing(L), null, 'не отложен');
  for (const expected of ['pet', 'pet', 'pet', 'enough']) {
    assert.equal(L.core.interact({ type: 'pet' }).outcome, expected, 'пропавшие в лимит не вошли');
    L.plan.advance(2000);
  }
  L.core.setContext({ timer: true });
  const quiet = L.core.interact({ type: 'pet' });
  assert.deepEqual([quiet.outcome, L.state().pose.shown.page, L.state().pose.shown.play, L.state().phrase, L.state().context.quiet], ['quiet', 'attentive', 'pet', null, ['timer']], 'в тишине — в сцене, страница тиха');
});

test('кнопки уголка: обычный запрос без итога под сценой и объявления; лапа кота вне «Поиграть» — unsupported; проверки', () => {
  const L = life({ cat: CAT }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  L.core.start();
  L.core.open('corner');
  const announced = L.effects('announce').length;
  assert.deepEqual([L.core.interact({ type: 'pet' }).outcome, L.state().play, L.effects('announce').length], ['pet', null, announced], 'отклик без итога');
  L.core.setContext({ typing: true });
  assert.deepEqual([L.core.interact({ type: 'pet' }).outcome, playing(L)], [null, null], 'тишина — запрос ждёт (обычный)');
  L.core.setContext({ typing: false });
  assert.equal(playing(L), 'pet', 'отложенный отклик сыгран после тишины');
  const paw = L.core.interact({ type: 'paw' });
  assert.deepEqual([paw.ok, paw.error.code], [false, 'unsupported'], 'у кота нет «Дай лапу» вне «Поиграть»');
  const D = life({ cat: CAT, companion: DOG }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  D.core.start();
  assert.equal(D.core.interact({ type: 'paw' }).outcome, 'paw', '«Дай лапу» собаки в уголке');
  for (const [action, code] of [
    [null, 'invalid-argument'],
    [{ type: 'stroke' }, 'invalid-argument'],
    [{ type: 'pet', to: 'near' }, 'invalid-argument'],
    [{ type: 'bowl' }, 'invalid-argument'],
    [{ type: 'bowl', to: [1] }, 'invalid-argument'],
    [{ type: 'bowl', to: [1, Infinity] }, 'invalid-argument'],
    [{ type: 'ball', to: 0 }, 'invalid-argument'],
    [{ type: 'ball', to: 'left' }, 'invalid-argument'],
    [{ type: 'bowl', to: 'near' }, 'not-open'],
    [{ type: 'ball', to: 'roll' }, 'not-open'],
  ]) {
    const before = L.state();
    const r = L.core.interact(action);
    assert.deepEqual([r.ok, r.error.code, L.state() === before], [false, code, true], JSON.stringify(action));
  }
  L.core.hide();
  assert.equal(L.core.interact({ type: 'pet' }).error.code, 'hidden');
  L.core.show();
  L.core.setPresence('on-call');
  assert.equal(L.core.interact({ type: 'pet' }).error.code, 'away');
  // «Поиграть» без объявленного пола — предметов нет.
  L.core.open('play', { source: 'call' });
  assert.equal(L.core.interact({ type: 'bowl', to: 'near' }).error.code, 'unsupported');
  L.core.destroy();
  assert.equal(L.core.interact({ type: 'pet' }).error.code, 'destroyed');
});

test('миска: ближе — принюхивается, дальше — смотрит; «Вернуть миску»; свой счёт; не кормит; итог про миску, если питомец занят', () => {
  const L = inPlay();
  const z = zoneOf(FLOOR, 0, 'cat');
  assert.deepEqual(toys(L), { bowl: { at: placeToy(z, SIZE.bowl, HOME.bowl), home: true }, ball: { at: placeToy(z, SIZE.ball, HOME.ball), home: true } }, 'исходные места на объявленном полу');
  const near = L.core.interact({ type: 'bowl', to: 'near' });
  assert.deepEqual([near.outcome, near.text, playing(L), L.state().pose.reaction.toward, toys(L).bowl], ['sniff', 'Марс принюхивается к миске.', 'sniff', 'left', { at: placeToy(z, SIZE.bowl, NEAR.bowl), home: false }]);
  L.plan.advance(2000);
  assert.deepEqual([L.core.interact({ type: 'bowl', to: 'home' }).outcome, toys(L).bowl.home], ['look', true], 'дальше — смотрит; на исходном месте');
  L.plan.advance(2000);
  assert.equal(L.core.interact({ type: 'bowl', to: [250, 214] }).outcome, 'look', 'точка дальше от питомца');
  L.plan.advance(2000);
  // Свой счёт: три полных реакции на предметы в минуту, затем только смотрит — и ближе тоже.
  assert.deepEqual([L.core.interact({ type: 'bowl', to: 'near' }).outcome, playing(L)], ['look', 'watch'], 'после трёх — только смотрит');
  L.plan.advance(60_000);
  assert.equal(L.core.interact({ type: 'bowl', to: [95, 214] }).outcome, 'sniff', 'минута прошла; точка ближе — перед лапами');
  assert.equal(L.core.interact({ type: 'bowl', to: toys(L).bowl.at }).outcome, 'dropped', 'то же место — ничего');
  L.plan.advance(2000);
  assert.equal(L.core.interact({ type: 'pet' }).outcome, 'pet', 'лимит поглаживания — свой');
  // Питомец занят не менее важным: миска двигается, итог — про миску.
  const busy = L.core.interact({ type: 'bowl', to: 'near' });
  assert.deepEqual([busy.outcome, busy.text, playing(L)], ['moved', 'Миска на новом месте.', 'pet']);
  assert.deepEqual([L.state().treat, L.state().progress.marks, L.json('treat')], ['ready', 1, null], 'миска не кормит, знаков нет');
});

test('мячик: бросок числом и «катнуть» — докатывается до края или питомца; упор — dropped; направление взгляда', () => {
  const L = inPlay();
  const z = zoneOf(FLOOR, 0, 'cat');
  const home = toys(L).ball.at;
  const right = L.core.interact({ type: 'ball', to: 500 });
  assert.deepEqual([right.outcome, toys(L).ball.at[0], L.state().pose.reaction.toward], ['ball', z.right - SIZE.ball[0] / 2, 'right'], 'до края пола');
  L.plan.advance(2000);
  assert.equal(L.core.interact({ type: 'ball', to: 40 }).outcome, 'dropped', 'у края — некуда');
  const left = L.core.interact({ type: 'ball', to: -500 });
  assert.equal(left.outcome, 'ball');
  assert.ok(toys(L).ball.at[0] < home[0] - 29 && toys(L).ball.at[0] >= home[0] - 90, `бросок не дальше 90 единиц: ${toys(L).ball.at[0]}`);
  L.plan.advance(2000);
  const roll = L.core.interact({ type: 'ball', to: 'roll' });
  assert.deepEqual([roll.outcome, L.state().pose.reaction.toward], ['ball', 'left'], 'кнопка — туда, где свободнее (слева 228, справа 90)');
  assert.equal(L.state().pose.reaction.type, 'ball');
});

test('пол: строгая проверка целиком, непереданное сохраняется, копия; новый пол ограничивает места (предметы — по нему)', () => {
  const L = inPlay();
  L.core.interact({ type: 'ball', to: -500 });
  const before = L.state();
  for (const bad of [{ playFloor: [0, 0, 1] }, { playFloor: [0, 0, 1, NaN] }, { playFloor: [5, 0, 1, 1] }, { playFloor: [0, 9, 1, 1] }, { playFloor: 'пол' }, { playTouch: -1 }, { playTouch: '22' }, { playFloor: [0, 0, 300, 230], playTouch: Infinity }]) {
    const r = L.core.setDisplay(bad);
    assert.deepEqual([r.ok, r.error.code, L.state() === before], [false, 'invalid-argument', true], JSON.stringify(bad));
  }
  const floor = [-10, -10, 200, 230];
  assert.equal(L.core.setDisplay({ playFloor: floor, playTouch: 30 }).ok, true);
  floor[0] = -1000;
  assert.deepEqual([L.state().display.playFloor, L.state().display.playTouch], [[-10, -10, 200, 230], 30], 'копия, без внешней мутации');
  assert.equal(L.core.setDisplay({ full: false }).ok, true);
  assert.deepEqual(L.state().display.playFloor, [-10, -10, 200, 230], 'непереданное сохраняется');
  const z = zoneOf([-10, -10, 200, 230], 30, 'cat');
  assert.equal(z.foot.bottom, 176 + 30, 'область касания лапы — не меньше playTouch');
  for (const toy of ['bowl', 'ball']) {
    const [x, y] = toys(L)[toy].at;
    const [w, h] = SIZE[toy];
    assert.ok(x - w / 2 >= z.left - 0.5 && x + w / 2 <= z.right + 0.5 && y + h / 2 <= z.bottom + 0.5, `${toy}: в новом полу`);
    assert.ok(x + w / 2 <= z.foot.left + 0.5 || x - w / 2 >= z.foot.right - 0.5 || y - h / 2 >= z.foot.bottom - 0.5, `${toy}: не на питомце`);
  }
  assert.equal(Object.isFrozen(L.state().display.playFloor), true);
});

test('перенос предмета: место под указателем — ядро; отмена — на месте до жеста; мячик — бросок от места под указателем', () => {
  const L = inPlay();
  const home = toys(L).bowl.at;
  assert.deepEqual([L.core.toy.drop().changed, L.core.toy.cancel().changed], [false, false], 'без переноса — ничего');
  L.core.toy.drag('bowl', home);
  L.core.toy.drag('bowl', [500, 500]);
  const drag = L.state().play.drag;
  const z = zoneOf(FLOOR, 0, 'cat');
  assert.deepEqual([drag.toy, drag.from, drag.at], ['bowl', home, placeToy(z, SIZE.bowl, [500, 500])], 'ближайшее допустимое под указателем');
  assert.deepEqual(toys(L).bowl.at, home, 'место — до drop прежнее');
  assert.equal(L.core.toy.cancel().changed, true);
  assert.deepEqual([L.state().play.drag, toys(L).bowl.at, L.effects('announce').length], [null, home, 0], 'отмена — на месте, без итога');
  // Другой предмет сначала отменяет перенос прежнего.
  L.core.toy.drag('bowl', home);
  L.core.toy.drag('bowl', [40, 214]);
  L.core.toy.drag('ball', toys(L).ball.at);
  assert.deepEqual([L.state().play.drag.toy, toys(L).bowl.at], ['ball', home]);
  // Мячик: отпустили без броска — не катится; бросок — от места под указателем.
  assert.equal(L.core.toy.drop().outcome, 'dropped');
  const ball = toys(L).ball.at;
  L.core.toy.drag('ball', ball);
  L.core.toy.drag('ball', [ball[0] - 30, ball[1]]);
  const thrown = L.core.toy.drop({ roll: -40 });
  assert.deepEqual([thrown.outcome, toys(L).ball.at[0]], ['ball', ball[0] - 30 - 40], 'докатился от места под указателем');
  // Без анимации — остаётся, где отпустили.
  L.plan.advance(2000);
  L.core.setReducedMotion(true);
  const still = toys(L).ball.at;
  L.core.toy.drag('ball', still);
  L.core.toy.drag('ball', [still[0] + 20, still[1]]);
  L.core.toy.drop({ roll: 60 });
  assert.equal(toys(L).ball.at[0], still[0] + 20, 'без анимации — где отпустили');
  // Миска: отпустили на новом месте — итог; мячик, взятый на ходу (катится у отображения), — место там, где взяли.
  L.plan.advance(2000);
  L.core.toy.drag('bowl', toys(L).bowl.at);
  L.core.toy.drag('bowl', [40, 214]);
  assert.equal(L.core.toy.drop().outcome, 'sniff');
  L.core.toy.drag('ball', [150, 214]);
  assert.deepEqual([L.state().play.drag.from, toys(L).ball.at], [placeToy(z, SIZE.ball, [150, 214]), placeToy(z, SIZE.ball, [150, 214])], 'взят на ходу — остановлен там');
  L.core.toy.cancel();
  // Проверки входа.
  for (const [call, code] of [
    [() => L.core.toy.drag('yarn', [0, 0]), 'invalid-argument'],
    [() => L.core.toy.drag('bowl', [0]), 'invalid-argument'],
    [() => L.core.toy.drop({ roll: 'left' }), 'invalid-argument'],
    [() => L.core.toy.drop({ throw: 1 }), 'invalid-argument'],
  ])
    assert.equal(call().error.code, code);
  L.core.close();
  assert.equal(L.core.toy.drag('bowl', [0, 214]).error.code, 'not-open');
});

test('снова «Поиграть» — предметы на исходных местах; сменили питомца в игре — места те же, жест и перенос сняты', () => {
  const L = inPlay({ cat: { ...CAT, seenStage: 1 } });
  L.core.interact({ type: 'bowl', to: 'near' });
  L.core.toy.drag('ball', toys(L).ball.at);
  L.core.setPet('dog');
  assert.deepEqual([L.state().view.open, L.state().play.drag, toys(L).bowl.home], ['play', null, false], 'места те же');
  L.core.open('corner');
  L.core.open('play');
  assert.deepEqual([toys(L).bowl.home, toys(L).ball.home, L.state().play.outcome], [true, true, ''], 'снова — исходные места');
});

test('точки предметов — ровно два конечных числа: неверные — invalid-argument до изменения; перенос и места целы; разреженный пол — тоже отказ (контроль)', () => {
  const L = inPlay();
  assert.equal(L.core.interact({ type: 'bowl', to: [40, 214] }).ok, true);
  L.plan.advance(2000);
  assert.equal(L.core.toy.drag('ball', toys(L).ball.at).ok, true);
  const before = L.state();
  const updates = L.seen.length;
  for (const [label, bad] of badPoints()) {
    for (const [name, call] of [['interact bowl', () => L.core.interact({ type: 'bowl', to: bad })], ['toy.drag bowl', () => L.core.toy.drag('bowl', bad)], ['toy.drag ball', () => L.core.toy.drag('ball', bad)]]) {
      const r = call();
      assert.deepEqual([r.ok, r.error?.code, L.state() === before, L.seen.length], [false, 'invalid-argument', true, updates], `${name}: ${label}`);
    }
  }
  for (const [label, floor] of [['new Array(4)', new Array(4)], ['[-40, пусто, 300, 230]', Object.assign(new Array(4), { 0: -40, 2: 300, 3: 230 })], ['[пусто, -10, 300, 230]', Object.assign(new Array(4), { 1: -10, 2: 300, 3: 230 })], ['[-40, -10, 300, пусто]', Object.assign(new Array(4), { 0: -40, 1: -10, 2: 300 })], ['[-40, -10, NaN, 230]', [-40, -10, NaN, 230]]]) {
    const r = L.core.setDisplay({ playFloor: floor });
    assert.deepEqual([r.ok, r.error?.code, L.state() === before], [false, 'invalid-argument', true], `playFloor ${label}`);
  }
  assert.deepEqual([L.state().play.drag.toy, toys(L).bowl.home, L.state().display.playFloor], ['ball', false, FLOOR], 'перенос мячика, место миски и пол — прежние');
  for (const toy of ['bowl', 'ball']) assert.ok(toys(L)[toy].at.every(Number.isFinite), toy);
  // Конечные точки — работают (контроль).
  L.core.toy.cancel();
  assert.deepEqual([L.core.toy.drag('bowl', toys(L).bowl.at).ok, L.core.toy.drag('bowl', [60, 214]).ok, L.core.toy.drop().ok], [true, true, true]);
  L.plan.advance(2000);
  assert.equal(L.core.interact({ type: 'bowl', to: [80, 214] }).ok, true);
  for (const toy of ['bowl', 'ball']) assert.ok(toys(L)[toy].at.every(Number.isFinite), `${toy}: после конечных точек`);
});
