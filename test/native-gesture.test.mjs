// Распознавание жестов «Поиграть» натива и геометрия сцены PL10.2.2 (pet/native/gesture.mjs) — чистый модуль без React:
// пороги в точках экрана против веба (pet-play.mjs, pet-toys.mjs — та же семантика в CSS px), попадание в области
// определения против веб-функции petPart на сетке точек (кот и собака, поднятая лапа, свой питомец без лапы), раскладка
// сцены по размеру и рамке определения (не 220×204 кота), пол ядру и его разбор ядром (zoneOf), перевод точек экрана в
// единицы рисунка, нулевой и неизмеренный размер; автомат одного жеста: пороги поглаживания, касание без сдвига, короткое
// касание лапы и его отказы, перенос и бросок предметов, чужой палец, отмены до порога и после, ядро сняло жест само.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Web from '../pet/pet-play.mjs';
import * as WebToys from '../pet/pet-toys.mjs';
import { definePet } from '../pet/core.mjs';
import { cat, dog } from '../pet/pets.mjs';
import { SIZE, zoneOf } from '../pet/core/toys.mjs';
import * as G from '../pet/native/gesture.mjs';

// Свой питомец: другая рамка, области и линия лап, без лапы (как кролик примера расширения, но другой размер).
const tall = definePet({
  ...cat,
  id: 'test.tall',
  title: 'Жираф',
  forms: { gen: 'жирафа', acc: 'жирафа' },
  actions: { pet: { text: '{name} кивает.' }, paw: null },
  poses: cat.poses.filter((pose) => pose !== 'paw'),
  size: { width: 160, height: 300, ground: 280 },
  play: { hits: [{ part: 'neck', cx: 80, cy: 120, rx: 30, ry: 90 }], paw: null, foot: [40, 120, 298], anchor: [80, 295] },
});

test('пороги — точки экрана с теми же значениями, что CSS px веба 0.1.4; касание без сдвига (TAP) — не порог поглаживания', () => {
  assert.deepEqual(
    [G.STROKE_PT, G.TAP_PT, G.TAP_MS, G.PAW_SLOP_PT, G.PAW_MIN_PT, G.MOVE_PT, G.ROLL_PT, G.TOY_MIN_PT],
    [Web.STROKE_PX, Web.TAP_PX, Web.TAP_MS, Web.PAW_SLOP_PX, Web.PAW_MIN_PX, WebToys.MOVE_PX, WebToys.ROLL_PX, WebToys.TOY_MIN_PX],
  );
  assert.notEqual(G.TAP_PT, G.STROKE_PT);
});

test('попадание: та же часть, что у веба (petPart), на сетке точек — кот, собака (поднятая лапа в позе paw), свой питомец без лапы; радиус лапы не меньше заданного', () => {
  let checked = 0;
  for (const def of [cat, dog, tall]) {
    for (const pose of ['', 'calm', 'paw']) {
      for (const minR of [0, 15, 30]) {
        for (let u = -20; u <= def.size.width + 20; u += 4) {
          for (let v = -20; v <= def.size.height + 20; v += 4) {
            assert.equal(G.partAt(def, [u, v], pose, minR), Web.petPart(def, u, v, pose, minR), `${def.id} ${pose} ${minR} ${u},${v}`);
            checked += 1;
          }
        }
      }
    }
  }
  assert.ok(checked > 30_000, String(checked));
  // Собака в позе «Дай лапу» — область на поднятой лапе (play.paw.up), не у земли.
  const { up } = dog.play.paw;
  assert.equal(G.partAt(dog, [up.cx, up.cy], 'paw'), 'paw');
  assert.notEqual(G.partAt(dog, [dog.play.paw.cx, dog.play.paw.cy + 2], 'paw'), 'paw');
  assert.equal(G.partAt(dog, [dog.play.paw.cx, dog.play.paw.cy + 2], 'calm'), 'paw');
  // Без лапы — ни области, ни касания лапы.
  assert.equal(G.pawArea(tall, 'paw'), null);
  assert.equal(G.partAt(tall, [80, 120], 'paw'), 'neck');
});

test('раскладка сцены: размер по рамке определения и месту (88 % ширины, не больше 440 точек, по высоте — с полом 20…64 и строкой реплики), по центру; пол ядру — по краям сцены, его разбирает ядро; нулевой, отрицательный, нечисловой и вырожденный размер — null', () => {
  for (const [def, box, phrase] of [
    [cat, { width: 390, height: 520 }, 42],
    [cat, { width: 844, height: 300 }, 42],
    [dog, { width: 320, height: 400 }, 0],
    [cat, { width: 1200, height: 1200 }, 42],
    [tall, { width: 390, height: 520 }, 42],
    [tall, { width: 700, height: 260 }, 20],
  ]) {
    const L = G.playLayout(box, def, phrase);
    const tag = `${def.id} ${box.width}×${box.height}`;
    assert.ok(L && L.s > 0, tag);
    assert.ok(Math.abs(L.pet.width / L.pet.height - def.size.width / def.size.height) < 1e-9, `${tag}: пропорции рамки определения`);
    assert.ok(L.pet.width <= Math.min(box.width * 0.88, 440) + 1e-9, tag);
    assert.ok(L.floor.height >= 20 - 1e-9 && L.floor.height <= 64 + 1e-9, tag);
    assert.ok(L.pet.top >= 0 && L.phrase.top + L.phrase.height <= box.height + 1e-6, `${tag}: питомец, пол и реплика внутри сцены`);
    assert.ok(Math.abs(L.pet.left + L.pet.width / 2 - box.width / 2) < 1e-9, `${tag}: по центру`);
    // Пол: края сцены с полем 8 точек, верх — верх сцены, низ — низ полосы пола (единицы рисунка).
    const [l, t, r, b] = L.playFloor;
    assert.ok(Math.abs(G.toPoints(L, [l, 0])[0] - 8) < 0.01 && Math.abs(G.toPoints(L, [r, 0])[0] - (box.width - 8)) < 0.01, tag);
    assert.ok(Math.abs(G.toPoints(L, [0, t])[1]) < 0.01 && Math.abs(G.toPoints(L, [0, b])[1] - (L.floor.top + L.floor.height)) < 0.01, tag);
    assert.ok(Math.abs(L.playTouch - 22 / L.s) < 0.001, `${tag}: радиус касания лапы — 22 точки в единицах рисунка`);
    const z = zoneOf(L.playFloor, L.playTouch, def);
    assert.ok(z.left < z.right && z.top < z.bottom && z.top === Math.max(t, def.size.ground), `${tag}: ядро разбирает пол`);
    // Точка экрана ↔ единицы рисунка — взаимно обратны.
    for (const point of [[0, 0], [box.width, box.height], [123.4, 56.7]]) {
      const back = G.toPoints(L, G.toUnits(L, point));
      assert.ok(Math.abs(back[0] - point[0]) < 1e-9 && Math.abs(back[1] - point[1]) < 1e-9, tag);
    }
  }
  // Свой питомец не обрезается и не сжимается до кота: выше рамки при той же ширине сцены.
  assert.ok(G.playLayout({ width: 390, height: 900 }, tall, 0).pet.height > G.playLayout({ width: 390, height: 900 }, cat, 0).pet.height);
  for (const box of [null, undefined, {}, { width: 0, height: 500 }, { width: 390, height: 0 }, { width: -1, height: 500 }, { width: Number.NaN, height: 500 }, { width: 390, height: Infinity }, { width: 12, height: 400 }, { width: 390, height: 20 }, { width: 85, height: 400 }, { width: 400, height: 110 }]) assert.equal(G.playLayout(box, cat, 42), null, JSON.stringify(box));
  // Переходный замер поворота (питомец уже 80 точек) — не раскладка; 80 и шире — раскладка.
  assert.ok(G.playLayout({ width: 92, height: 400 }, cat, 0).pet.width >= G.PET_MIN_PT);
  // Ключ раскладки меняется с размером, рамкой определения и строкой реплики.
  const keys = new Set([G.playLayout({ width: 390, height: 520 }, cat, 42).key, G.playLayout({ width: 391, height: 520 }, cat, 42).key, G.playLayout({ width: 390, height: 520 }, tall, 42).key, G.playLayout({ width: 390, height: 520 }, cat, 40).key]);
  assert.equal(keys.size, 4);
});

test('что под пальцем: мячик поверх миски, область предмета не меньше 44 точек при мелком масштабе, затем лапа, голова, тело; пустое место — ничего; предмет без места не ловится', () => {
  const L = G.playLayout({ width: 200, height: 220 }, cat, 0);
  assert.ok(L.s * SIZE.bowl[0] < 44, 'мелкий масштаб: рисунок миски меньше 44 точек');
  const bowl = [-30, 214];
  const box = G.toyBox(L, 'bowl', bowl);
  assert.deepEqual([box.w, box.h], SIZE.bowl.map((value) => value * L.s));
  assert.ok(box.width === 44 && box.height === 44);
  const [x, y] = G.toPoints(L, bowl);
  assert.deepEqual(G.targetAt(L, cat, 'calm', [x + 21, y - 21], { bowl, ball: null }), { kind: 'toy', toy: 'bowl', at: bowl }, 'край области 44×44');
  assert.equal(G.targetAt(L, cat, 'calm', [x + 21, y - 21], { bowl: null, ball: null }), null, 'без места — не предмет');
  assert.equal(G.targetAt(L, cat, 'calm', [x + 21, y - 21], null), null, 'предметы не разрешены (пол не объявлен)');
  assert.equal(G.targetAt(L, cat, 'calm', [x, y], { bowl, ball: bowl }).toy, 'ball', 'мячик нарисован поверх');
  assert.deepEqual(G.targetAt(L, cat, 'calm', G.toPoints(L, [100, 60]), null), { kind: 'pet', part: 'head' });
  assert.deepEqual(G.targetAt(L, cat, 'calm', G.toPoints(L, [100, 150]), null), { kind: 'pet', part: 'body' });
  assert.deepEqual(G.targetAt(L, cat, 'calm', G.toPoints(L, [cat.play.paw.cx, cat.play.paw.cy]), null), { kind: 'pet', part: 'paw' });
  assert.equal(G.targetAt(L, cat, 'calm', [2, 2], null), null, 'пустой угол');
  // Лапа — не меньше 22 точек радиусом и при мелком масштабе.
  const paw = G.toPoints(L, [cat.play.paw.cx, cat.play.paw.cy]);
  assert.equal(G.targetAt(L, cat, 'calm', [paw[0], paw[1] + 21], null)?.part, 'paw');
});

// Автомат с записью вызовов ядра; id — номер жеста ядра (null — ядро отказало), drag — ответ переноса.
function rec({ id = 7, drag = true, moved = true } = {}) {
  const calls = [];
  const hooks = {
    start: () => (calls.push(['start']), id),
    step: (n) => calls.push(['step', n]),
    end: (n) => calls.push(['end', n]),
    cancel: (n) => calls.push(['cancel', n]),
    paw: () => calls.push(['paw']),
    drag: (toy, at) => (calls.push(['drag', toy, at.map((value) => Math.round(value * 100) / 100)]), drag),
    drop: (roll) => calls.push(roll === undefined ? ['drop'] : ['drop', Math.round(roll * 100) / 100]),
    toyCancel: () => calls.push(['toyCancel']),
    moved: () => moved,
    nudge: () => calls.push(['nudge']),
  };
  return { g: G.createGesture(hooks), calls };
}
const pet = (part = 'head') => ({ kind: 'pet', part });
const on = () => 'head';
const off = () => '';

test('поглаживание: stroke.step — на каждые 24 точки от начала или прошлого отклика; уход с питомца — stroke.cancel, дальше ничего; касание без сдвига — не поглаживание (подсказка), со сдвигом меньше порога — только end', () => {
  const A = rec();
  assert.equal(A.g.begin({ touch: 1, point: [100, 100], time: 0, target: pet() }), true);
  assert.equal(A.g.begin({ touch: 2, point: [100, 100], time: 0, target: pet() }), false, 'второй жест не начинается');
  A.g.move({ touch: 1, point: [123, 100], hit: on });
  A.g.move({ touch: 1, point: [124, 100], hit: on });
  A.g.move({ touch: 1, point: [140, 100], hit: on });
  A.g.move({ touch: 1, point: [148, 100], hit: on });
  A.g.move({ touch: 2, point: [400, 100], hit: on });
  assert.equal(A.g.end({ touch: 2, point: [400, 100], time: 50, hit: on }), null, 'чужой палец ничего не завершает');
  assert.equal(A.g.end({ touch: 1, point: [148, 100], time: 900, hit: on }), 'end');
  assert.deepEqual(A.calls, [['start'], ['step', 7], ['step', 7], ['end', 7]]);
  // Уход с питомца.
  const B = rec();
  B.g.begin({ touch: 1, point: [100, 100], time: 0, target: pet() });
  B.g.move({ touch: 1, point: [130, 100], hit: on });
  assert.equal(B.g.move({ touch: 1, point: [160, 100], hit: off }), 'leave');
  B.g.move({ touch: 1, point: [190, 100], hit: on });
  assert.equal(B.g.end({ touch: 1, point: [190, 100], time: 900, hit: on }), 'dead');
  assert.deepEqual(B.calls, [['start'], ['step', 7], ['cancel', 7]]);
  assert.equal(B.g.active(), false);
  // Касание без сдвига — подсказка; сдвиг 3 точки — тоже; 5 точек — без подсказки и без отклика.
  for (const [dx, result] of [[0, 'tap'], [3, 'tap'], [5, 'end']]) {
    const C = rec();
    C.g.begin({ touch: 1, point: [100, 100], time: 0, target: pet('body') });
    C.g.move({ touch: 1, point: [100 + dx, 100], hit: on });
    assert.equal(C.g.end({ touch: 1, point: [100 + dx, 100], time: 80, hit: on }), result);
    assert.deepEqual(C.calls, result === 'tap' ? [['start'], ['end', 7], ['nudge']] : [['start'], ['end', 7]]);
  }
  // Ядро отказало в начале (id null): ни step, ни end, но и касания лапы без лапы нет.
  const D = rec({ id: null });
  D.g.begin({ touch: 1, point: [100, 100], time: 0, target: pet() });
  D.g.move({ touch: 1, point: [140, 100], hit: on });
  D.g.end({ touch: 1, point: [140, 100], time: 50, hit: on });
  assert.deepEqual(D.calls, [['start']]);
});

test('касание лапы: только короткое (≤ 500 мс), на месте (≤ 10 точек) и на лапе при отпускании — interact paw после stroke.end; удержание, сдвиг, уход с лапы — нет; поглаживания с лапы нет', () => {
  const tap = (moves, end, time, hit = () => 'paw') => {
    const R = rec();
    R.g.begin({ touch: 3, point: [50, 50], time: 1000, target: pet('paw') });
    for (const point of moves) R.g.move({ touch: 3, point, hit });
    const result = R.g.end({ touch: 3, point: end, time, hit });
    return [result, R.calls];
  };
  assert.deepEqual(tap([[55, 50]], [55, 50], 1500), ['paw', [['start'], ['end', 7], ['paw']]]);
  assert.deepEqual(tap([], [50, 50], 1501), ['end', [['start'], ['end', 7]]], 'дольше 500 мс');
  assert.deepEqual(tap([[61, 50]], [61, 50], 1100), ['dead', [['start'], ['cancel', 7]]], 'сдвиг дальше 10 — отмена');
  assert.deepEqual(tap([[58, 50], [80, 50], [50, 50]], [50, 50], 1100), ['dead', [['start'], ['cancel', 7]]], 'возврат после сдвига — уже не касание');
  assert.deepEqual(tap([], [50, 50], 1100, () => 'body'), ['end', [['start'], ['end', 7]]], 'отпустили не на лапе (поза сменилась)');
  // Поглаживание с лапы не идёт: сдвиг в пределах допуска — без step.
  assert.deepEqual(tap([[59, 50]], [59, 50], 1100)[1].filter(([name]) => name === 'step'), []);
});

test('отмены до порога: касание лапы и предмета, снятое до отпускания (система, раскладка, кнопка), — позднее отпускание ничего не вызывает; ядро сняло жест само — без команд ядру; смена того, при чём ядро снимает жест (abort), — без команд', () => {
  const paw = rec();
  paw.g.begin({ touch: 1, point: [50, 50], time: 0, target: pet('paw') });
  assert.equal(paw.g.cancel('system'), 'system');
  assert.equal(paw.g.cancel('system'), null, 'повтор — ничего');
  assert.equal(paw.g.end({ touch: 1, point: [50, 50], time: 100, hit: () => 'paw' }), 'dead');
  assert.deepEqual(paw.calls, [['start'], ['cancel', 7]], 'лапы после отмены нет');
  // Предмет до порога сдвига: ядро уже ведёт перенос с места предмета — отмена ядру, отпускание — не drop.
  const toy = rec();
  toy.g.begin({ touch: 1, point: [10, 10], time: 0, target: { kind: 'toy', toy: 'ball', at: [280, 214] }, scale: 2 });
  toy.g.move({ touch: 1, point: [13, 10] });
  toy.g.cancel('blur');
  toy.g.move({ touch: 1, point: [60, 10] });
  assert.equal(toy.g.end({ touch: 1, point: [60, 10], time: 100 }), 'dead');
  assert.deepEqual(toy.calls, [['drag', 'ball', [280, 214]], ['toyCancel']]);
  // Ядро сняло жест само (снимок без своего stroke): дальше — без команд.
  const lost = rec();
  lost.g.begin({ touch: 1, point: [100, 100], time: 0, target: pet() });
  assert.equal(lost.g.sync({ stroke: { id: 7 }, drag: null }), false);
  assert.equal(lost.g.sync({ stroke: { id: 8 }, drag: null }), true, 'другой жест ядра — свой снят');
  lost.g.move({ touch: 1, point: [200, 100], hit: on });
  assert.equal(lost.g.end({ touch: 1, point: [200, 100], time: 900, hit: on }), 'dead');
  assert.deepEqual(lost.calls, [['start']]);
  const lostToy = rec();
  lostToy.g.begin({ touch: 1, point: [10, 10], time: 0, target: { kind: 'toy', toy: 'bowl', at: [-60, 214] }, scale: 1 });
  assert.equal(lostToy.g.sync({ stroke: null, drag: { toy: 'bowl' } }), false);
  assert.equal(lostToy.g.sync({ stroke: null, drag: null }), true);
  lostToy.g.end({ touch: 1, point: [90, 10], time: 100 });
  assert.deepEqual(lostToy.calls, [['drag', 'bowl', [-60, 214]]], 'ни drop, ни cancel');
  // abort — питомец, облик, вид сменились: ядро жест уже сняло.
  const ab = rec({ id: null });
  ab.g.begin({ touch: 1, point: [50, 50], time: 0, target: pet('paw') });
  assert.equal(ab.g.abort(), true);
  ab.g.end({ touch: 1, point: [50, 50], time: 100, hit: () => 'paw' });
  assert.deepEqual(ab.calls, [['start']], 'касания лапы нет и при отказе начала');
  // Перенос, который ядро не начало, — мёртв сразу.
  const refused = rec({ drag: false });
  refused.g.begin({ touch: 1, point: [10, 10], time: 0, target: { kind: 'toy', toy: 'bowl', at: [-60, 214] }, scale: 1 });
  refused.g.move({ touch: 1, point: [60, 10] });
  refused.g.end({ touch: 1, point: [60, 10], time: 100 });
  assert.deepEqual(refused.calls, [['drag', 'bowl', [-60, 214]]]);
  // forget — палец забран системой: следующий жест начинается заново.
  const gone = rec();
  gone.g.begin({ touch: 1, point: [0, 0], time: 0, target: pet() });
  gone.g.cancel('terminate');
  gone.g.forget();
  assert.equal(gone.g.active(), false);
  assert.equal(gone.g.begin({ touch: 2, point: [0, 0], time: 0, target: pet() }), true);
});

test('предметы: первая точка — нарисованное место (сдвиг пальца — относительно него, без скачка); меньше 6 точек — ни переноса, ни drop (toy.cancel); миска — drop после заметного сдвига; мячик — бросок от 16 точек по горизонтали в единицах рисунка, меньше — отмена', () => {
  const bowl = rec();
  bowl.g.begin({ touch: 1, point: [300, 400], time: 0, target: { kind: 'toy', toy: 'bowl', at: [-60, 214] }, scale: 2 });
  bowl.g.move({ touch: 1, point: [304, 403] });
  bowl.g.move({ touch: 1, point: [340, 410] });
  assert.equal(bowl.g.end({ touch: 1, point: [340, 410], time: 300 }), 'drop');
  assert.deepEqual(bowl.calls, [['drag', 'bowl', [-60, 214]], ['drag', 'bowl', [-40, 219]], ['drop']]);
  const still = rec();
  still.g.begin({ touch: 1, point: [300, 400], time: 0, target: { kind: 'toy', toy: 'ball', at: [280, 214] }, scale: 2 });
  still.g.move({ touch: 1, point: [305, 400] });
  assert.equal(still.g.end({ touch: 1, point: [305, 400], time: 200 }), 'cancel', 'простое касание мячика не катит');
  assert.deepEqual(still.calls, [['drag', 'ball', [280, 214]], ['toyCancel']]);
  const roll = rec();
  roll.g.begin({ touch: 1, point: [300, 400], time: 0, target: { kind: 'toy', toy: 'ball', at: [280, 214] }, scale: 2 });
  roll.g.move({ touch: 1, point: [240, 420] });
  assert.equal(roll.g.end({ touch: 1, point: [240, 420], time: 200 }), 'roll');
  assert.deepEqual(roll.calls.at(-1), ['drop', -30], 'бросок в единицах рисунка, знак — направление');
  const short = rec();
  short.g.begin({ touch: 1, point: [300, 400], time: 0, target: { kind: 'toy', toy: 'ball', at: [280, 214] }, scale: 2 });
  short.g.move({ touch: 1, point: [310, 440] });
  assert.equal(short.g.end({ touch: 1, point: [310, 440], time: 200 }), 'cancel', 'вертикальный перенос мячика — не бросок');
  const back = rec({ moved: false });
  back.g.begin({ touch: 1, point: [300, 400], time: 0, target: { kind: 'toy', toy: 'bowl', at: [-60, 214] }, scale: 2 });
  back.g.move({ touch: 1, point: [320, 400] });
  assert.equal(back.g.end({ touch: 1, point: [320, 400], time: 200 }), 'cancel', 'миска упёрлась — на месте до жеста');
});

test('отпускания может не быть (доработка PL10.2.2): retire — ядру отмена живого жеста, жест забыт сразу, новый палец начинает новый; поздние движение и отпускание прежнего касания ничего не вызывают — жеста нет, палец другой или событие старше начала нового (timestamp), в том числе с тем же identifier; ядро сняло жест само — без повторной отмены; без отметок времени — прежние правила', () => {
  // Поглаживание прервано системой без отпускания.
  const A = rec();
  A.g.begin({ touch: 1, point: [100, 100], time: 0, stamp: 0, target: pet() });
  A.g.move({ touch: 1, point: [130, 100], stamp: 30, hit: on });
  assert.equal(A.g.retire('system'), 'system');
  assert.equal(A.g.active(), false, 'жест забыт сразу, не ждёт отпускания');
  assert.equal(A.g.retire('system'), null, 'повтор — ничего');
  assert.equal(A.g.move({ touch: 1, point: [160, 100], stamp: 60, hit: on }), null, 'позднее движение — некуда');
  assert.equal(A.g.end({ touch: 1, point: [160, 100], time: 90, stamp: 90, hit: on }), null, 'позднее отпускание — некуда');
  // Новый жест тем же номером пальца (система выдаёт номера снова): события старше его начала — от прежнего касания.
  assert.equal(A.g.begin({ touch: 1, point: [100, 100], time: 1000, stamp: 1000, target: pet() }), true);
  assert.deepEqual([A.g.stale(500), A.g.stale(1000), A.g.stale(undefined)], [true, false, false]);
  assert.equal(A.g.move({ touch: 1, point: [160, 100], stamp: 500, hit: on }), null, 'старое движение не гладит');
  assert.equal(A.g.end({ touch: 1, point: [160, 100], time: 500, stamp: 500, hit: on }), null, 'старое отпускание не завершает');
  assert.equal(A.g.live(), true);
  assert.equal(A.g.move({ touch: 1, point: [130, 100], stamp: 1030, hit: on }), 'step');
  assert.equal(A.g.end({ touch: 1, point: [130, 100], time: 1100, stamp: 1100, hit: on }), 'end');
  assert.deepEqual(A.calls, [['start'], ['step', 7], ['cancel', 7], ['start'], ['step', 7], ['end', 7]]);
  // Касание лапы до отпускания: ни лапы, ни end.
  const paw = rec();
  paw.g.begin({ touch: 2, point: [50, 50], time: 0, stamp: 0, target: pet('paw') });
  paw.g.retire('blur');
  assert.equal(paw.g.end({ touch: 2, point: [50, 50], time: 100, stamp: 100, hit: () => 'paw' }), null);
  assert.deepEqual(paw.calls, [['start'], ['cancel', 7]]);
  // Ядро сняло жест само (мёртв): retire забывает без повторной отмены.
  const lost = rec();
  lost.g.begin({ touch: 1, point: [0, 0], time: 0, target: pet() });
  lost.g.sync({ stroke: null, drag: null });
  lost.g.retire('system');
  assert.deepEqual([lost.calls, lost.g.active()], [[['start']], false]);
  // Предмет до порога: перенос у ядра снят; позднее отпускание — не drop. Новый перенос тем же пальцем: старое отпускание
  // его не бросает, своё — drop.
  const toy = rec();
  toy.g.begin({ touch: 1, point: [10, 10], time: 0, stamp: 0, target: { kind: 'toy', toy: 'ball', at: [280, 214] }, scale: 2 });
  toy.g.move({ touch: 1, point: [13, 10], stamp: 10 });
  toy.g.retire('system');
  assert.equal(toy.g.end({ touch: 1, point: [80, 10], time: 100, stamp: 100 }), null);
  assert.deepEqual(toy.calls, [['drag', 'ball', [280, 214]], ['toyCancel']]);
  toy.g.begin({ touch: 1, point: [10, 10], time: 200, stamp: 200, target: { kind: 'toy', toy: 'bowl', at: [-60, 214] }, scale: 2 });
  toy.g.move({ touch: 1, point: [60, 10], stamp: 210 });
  assert.equal(toy.g.end({ touch: 1, point: [60, 10], time: 150, stamp: 150 }), null);
  assert.equal(toy.g.end({ touch: 1, point: [60, 10], time: 260, stamp: 260 }), 'drop');
  assert.deepEqual(toy.calls.slice(2), [['drag', 'bowl', [-60, 214]], ['drag', 'bowl', [-35, 214]], ['drop']]);
  // Без отметки времени у начала — сравнивать не с чем: события своего пальца действуют, как прежде.
  const plain = rec();
  plain.g.begin({ touch: 1, point: [100, 100], time: 0, target: pet() });
  assert.equal(plain.g.stale(-5), false);
  assert.equal(plain.g.move({ touch: 1, point: [130, 100], stamp: -5, hit: on }), 'step');
  assert.equal(plain.g.end({ touch: 1, point: [130, 100], time: 50, hit: on }), 'end');
});
