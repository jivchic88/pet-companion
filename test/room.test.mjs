// «Обустроить уголок» — геометрия и формат комнаты в ядре (pet/core/room.mjs, PL04.3; веб pet/pet-room.mjs — рисование и
// области нажатия): чтение и запись расстановки (ключ, повреждённые значения, поля будущих версий, кот и собака отдельно,
// запись поверх свежей записи другой вкладки), предметы по ступеням, место отдыха — подушка и лежанка, пол, края,
// перекрытия, ближайшее допустимое место, шаг кнопками по тем же правилам, выбор предмета под пальцем, сдвиг позы «ест» к
// миске; точность записи и повторного чтения у препятствий.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Room from './legacy-room.mjs';
import * as Web from '../pet/pet-room.mjs';
import * as R from './legacy-rules.mjs';
import { ropeArt } from '../pet/dog-art.mjs';
import { bowlArt, sceneCatBox, sceneSvg, yarnArt } from '../pet/cat-art.mjs';

const K = R.storageKeys('site');

const KINDS = ['cat', 'dog'];
const STAGES = [0, 1, 2, 3, 4];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const area = ([l, t, r, b]) => Math.max(0, r - l) * Math.max(0, b - t);
const overlap = (a, b) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]) / Math.min(area(a), area(b));
// Раскладка целиком допустима: каждый предмет на своём месте допустим среди остальных.
const valid = (layout) => Object.entries(layout.pos).every(([id, p]) => Room.fits(layout, id, p));
// Детерминированная «случайность» для свойств.
const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
// Точность записи — 0,1 единицы сцены.
const grid = (p) => p.map((v) => Math.round(v * 10) / 10);
// Сохранить и прочитать, как вкладка после «Сохранить» и перезагрузки.
const reread = (kind, stage, pos, stored = null) => {
  const text = JSON.stringify(Room.roomRecord(stored, kind, pos));
  return { text, layout: Room.arrange(kind, stage, Room.parseRoom(text)[kind]) };
};

test('ключ отдельный от прежних ключей напарника; предметы по животному и ступени, мячик — с прежней ступени', () => {
  assert.equal(K.room, 'site:room:v1');
  assert.ok(![K.cat, K.companion, K.look, K.treat, K.scene, K.place, K.presence].includes(K.room));
  for (const stage of STAGES) {
    assert.deepEqual(Room.roomItems('cat', stage), ['rest', 'bowl', 'yarn'], `кот, ступень ${stage}`);
    const ball = R.STAGES.some((_, index) => index <= stage && R.stageItems(index, 'dog').includes('ball'));
    assert.deepEqual(Room.roomItems('dog', stage), ['rest', 'bowl', 'rope', ...(ball ? ['ball'] : [])], `собака, ступень ${stage}: мячик — тот же порог, что у вещи ступени`);
    assert.equal(Room.seatOf(stage), R.STAGES.some((_, index) => index <= stage && R.stageItems(index).includes('bed')) ? 'bed' : 'cushion', `лежанка — со ступени «Уютный штаб» (${stage})`);
    assert.equal(Room.itemTitle('rest', stage), Room.seatOf(stage) === 'bed' ? 'Лежанка' : 'Подушка');
  }
  assert.deepEqual(['bowl', 'yarn', 'rope', 'ball'].map((id) => Room.itemTitle(id, 0)), ['Миска', 'Клубок', 'Канат', 'Мячик']);
});

test('чтение: нет ключа, повреждённый JSON, неверная структура — исходные места; неизвестная версия — известные поля', () => {
  for (const text of [null, '', '{bad', '[]', '"room"', '42', 'null', '{"cat":[]}', '{"cat":"x","dog":7}']) {
    assert.deepEqual(Room.parseRoom(text), { cat: {}, dog: {} }, String(text));
  }
  const future = Room.parseRoom(JSON.stringify({ v: 99, theme: 'night', cat: { bowl: { x: 120, y: 230, tilt: 3 }, sofa: { x: 1, y: 2 } } }));
  assert.deepEqual(future, { cat: { bowl: [120, 230] }, dog: {} }, 'известный предмет прочитан, неизвестные — не в раскладке');
});

test('чтение точки: строки, null, NaN, Infinity — нет точки (только этот предмет); далёкие значения — ограничены, но читаются', () => {
  for (const raw of [null, undefined, 5, 'x', [], { x: '10', y: 200 }, { x: 10 }, { x: null, y: 2 }, { x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: -Infinity, y: 0 }]) {
    assert.equal(Room.readPoint(raw), null, JSON.stringify(raw) ?? 'undefined');
  }
  assert.deepEqual(Room.readPoint({ x: 12.345, y: 200.06 }), [12.3, 200.1]);
  assert.deepEqual(Room.readPoint({ x: 1e300, y: -1e300 }), [1e4, -1e4]);
  // Один повреждённый предмет не сбрасывает остальные.
  const room = Room.parseRoom(JSON.stringify({ v: 1, cat: { rest: { x: 'a', y: 1 }, bowl: { x: 300, y: 230 }, yarn: null } }));
  assert.deepEqual(room.cat, { bowl: [300, 230] });
  const layout = Room.arrange('cat', 0, room.cat);
  assert.deepEqual(layout.pos.rest, Room.HOME.rest, 'повреждённое место отдыха — исходное');
  assert.deepEqual(layout.pos.yarn, Room.HOME.yarn);
  assert.deepEqual(layout.pos.bowl, [300, 230], 'верная точка миски сохранена');
});

test('обычная расстановка допустима у кота и собаки на всех ступенях и совпадает с прежним рисунком', () => {
  for (const kind of KINDS) {
    for (const stage of STAGES) {
      const layout = Room.arrange(kind, stage, {});
      for (const [id, p] of Object.entries(layout.pos)) assert.deepEqual(p, Room.HOME[id], `${kind}/${stage}/${id}`);
      assert.ok(valid(layout), `${kind}/${stage}`);
    }
  }
  // Исходные места — там, где вещи были нарисованы до обустройства: подушка (200, 206), миска, мячик собаки.
  const scene = sceneSvg({ stage: 2, extra: bowlArt() });
  assert.match(scene, /data-item="cushion" data-room="rest"/);
  assert.match(bowlArt(), /cx="170" cy="213"/);
  assert.deepEqual(Room.HOME.ball, [283, 234]);
});

test('пределы: предмет целиком в сцене и на полу; лежанка шире подушки; любые точки — на допустимом месте', () => {
  const random = rng(7);
  for (const kind of KINDS) {
    for (const stage of STAGES) {
      const base = Room.arrange(kind, stage, {});
      for (const id of Object.keys(base.pos)) {
        for (let i = 0; i < 60; i += 1) {
          const want = [random() * 1200 - 400, random() * 900 - 300];
          const p = Room.settle(base, id, want);
          assert.ok(Room.fits(base, id, p), `${kind}/${stage}/${id} ${JSON.stringify(want.map(Math.round))}`);
          const { box } = Room.frames(base, id, p);
          assert.ok(box[0] >= 0 && box[2] <= 400 && box[3] <= 250, `${id}: в сцене ${JSON.stringify(box)}`);
          const top = id === 'rest' ? Room.frames(base, id, p).seat[1] : box[1];
          assert.ok(top >= 176 - 0.01, `${id}: на полу, не на стене (${top})`);
        }
      }
    }
  }
  const cushion = Room.range({ kind: 'cat', stage: 0, pos: {} }, 'rest');
  const bed = Room.range({ kind: 'cat', stage: 3, pos: {} }, 'rest');
  assert.ok(bed.x[0] > cushion.x[0] && bed.x[1] < cushion.x[1], 'лежанка шире — её пределы уже');
  assert.ok(cushion.x[1] - cushion.x[0] > 150, 'перестановка заметная');
});

test('подушка заменяется лежанкой: то же логическое место с поправкой на размер, без записи', () => {
  const saved = { rest: [92, 220] };
  const before = Room.arrange('dog', 2, saved);
  assert.deepEqual(before.pos.rest, [92, 220], 'подушка — у левого края');
  const after = Room.arrange('dog', 3, saved);
  const bed = Room.range(after, 'rest');
  assert.deepEqual(after.pos.rest, [bed.x[0], bed.y[1]], 'лежанка — ближайшее к тому же месту допустимое');
  assert.ok(dist(after.pos.rest, saved.rest) < 20, 'не прыгает через комнату');
  assert.deepEqual(saved, { rest: [92, 220] }, 'сохранённое не меняется');
  // Обратно (меньший прогресс в старой вкладке) — снова то место, что сохранено.
  assert.deepEqual(Room.arrange('dog', 2, saved).pos.rest, [92, 220]);
});

test('перекрытия: миска и игрушки не закрывают лицо и тело питомца, друг друга и вещи ступеней больше чем на четверть', () => {
  const layout = Room.arrange('cat', 4, {});
  const face = Room.frames(layout, 'rest', layout.pos.rest).core;
  const onFace = [(face[0] + face[2]) / 2, (face[1] + face[3]) / 2 + 40];
  assert.equal(Room.fits(layout, 'bowl', [onFace[0], 200]), false, 'миска на теле питомца');
  const yarnOnBowl = Room.settle(layout, 'yarn', layout.pos.bowl);
  assert.ok(overlap(Room.frames(layout, 'yarn', yarnOnBowl).box, Room.frames(layout, 'bowl', layout.pos.bowl).box) <= Room.OVERLAP + 1e-9, 'клубок не на миске');
  assert.ok(dist(yarnOnBowl, layout.pos.bowl) < 40, 'клубок — рядом, а не через комнату');
  // Неподвижные вещи: блокнот (ступень 2) — миску на него не поставить; на ступени 0 блокнота нет.
  const notebook = [93, 222];
  assert.equal(Room.fits(Room.arrange('cat', 2, {}), 'bowl', notebook), false);
  assert.equal(Room.fits({ ...Room.arrange('cat', 0, {}), pos: { rest: Room.HOME.rest } }, 'bowl', notebook), true);
  // Место отдыха не уводит питомца на растение и лампу (ступень 4), но двигается заметно.
  const left = Room.settle(layout, 'rest', [0, 206]);
  const right = Room.settle(layout, 'rest', [400, 206]);
  assert.ok(right[0] - left[0] > 120, JSON.stringify({ left, right }));
  // Место отдыха не садится питомцем на миску (ступень 0 — слева свободно).
  const bowlLeft = Room.arrange('cat', 0, { bowl: [80, 205] });
  assert.deepEqual(bowlLeft.pos.bowl, [80, 205], 'миска слева допустима');
  const rest = Room.settle(bowlLeft, 'rest', [100, 206]);
  assert.ok(overlap(Room.frames(bowlLeft, 'rest', rest).core, Room.frames(bowlLeft, 'bowl', [80, 205]).box) <= Room.OVERLAP + 1e-9);
});

test('ближайшее допустимое место — предсказуемо: то же для того же, рядом с желаемым, а не через комнату', () => {
  const layout = Room.arrange('dog', 4, {});
  const want = [layout.pos.rest[0], 150];
  const a = Room.settle(layout, 'bowl', want);
  assert.deepEqual(Room.settle(layout, 'bowl', want), a, 'детерминированно');
  const random = rng(11);
  for (let i = 0; i < 200; i += 1) {
    const w = [20 + random() * 360, 180 + random() * 70];
    const p = Room.settle(layout, 'rope', w);
    assert.ok(Room.fits(layout, 'rope', p));
    assert.deepEqual(p, grid(p), 'место — на сетке записи');
    if (Room.fits(layout, 'rope', grid(w))) assert.deepEqual(p, grid(w), 'допустимое — без изменений (с точностью записи 0,1)');
    else assert.ok(dist(p, w) <= 130, `скачок ${dist(p, w).toFixed(1)} у ${JSON.stringify(w.map(Math.round))}`);
  }
});

test('кнопки и стрелки — те же правила: шаг STEP, у края — сколько можно, дальше — нельзя; раскладка остаётся допустимой', () => {
  const layout = Room.arrange('cat', 0, {});
  const right = Room.nudge(layout, 'bowl', 'right');
  assert.ok(right && Math.abs(right[0] - layout.pos.bowl[0] - Room.STEP) < 0.01 && right[1] === layout.pos.bowl[1], 'шаг вправо на STEP');
  // У стены: «Выше» у лежанки нет, у подушки — меньше шага.
  assert.equal(Room.nudge(Room.arrange('cat', 3, {}), 'rest', 'up'), null);
  const up = Room.nudge(layout, 'rest', 'up');
  assert.ok(up && layout.pos.rest[1] - up[1] > 0 && layout.pos.rest[1] - up[1] <= Room.STEP);
  // Много шагов в одну сторону: доходит до предела и останавливается, не выходя за сцену.
  for (const kind of KINDS) {
    for (const stage of [0, 4]) {
      for (const dir of ['left', 'right', 'up', 'down']) {
        for (const id of Room.roomItems(kind, stage)) {
          const l = Room.arrange(kind, stage, {});
          let steps = 0;
          for (let p = Room.nudge(l, id, dir); p && steps < 80; p = Room.nudge(l, id, dir), steps += 1) l.pos = { ...l.pos, [id]: p };
          assert.ok(steps < 80, `${kind}/${stage}/${id}/${dir}: остановился`);
          assert.ok(valid(l), `${kind}/${stage}/${id}/${dir}: допустимо`);
        }
      }
    }
  }
  // Случайные шаги и переносы вперемешку — раскладка всегда допустима (одни правила у жеста и кнопок).
  const random = rng(3);
  const l = Room.arrange('dog', 2, {});
  for (let i = 0; i < 300; i += 1) {
    const id = Room.roomItems('dog', 2)[Math.floor(random() * 4)];
    const p = random() < 0.5 ? Room.nudge(l, id, ['left', 'right', 'up', 'down'][Math.floor(random() * 4)]) : Room.settle(l, id, [random() * 400, random() * 250]);
    if (p) l.pos = { ...l.pos, [id]: p };
    assert.ok(valid(l), `шаг ${i}`);
  }
});

test('запись: только предметы этого животного в комнате, на исходном месте — без точки; другое животное и чужие поля — как есть', () => {
  const stored = JSON.stringify({ v: 1, theme: 'x', dog: { rest: { x: 150, y: 210 }, ball: { x: 40, y: 230 }, future: true }, cat: { sofa: { x: 1, y: 1 }, ball: { x: 300, y: 220 } } });
  const layout = Room.arrange('cat', 0, Room.parseRoom(stored).cat);
  const pos = { ...layout.pos, bowl: [320.04, 230] };
  const record = Room.roomRecord(stored, 'cat', pos);
  assert.deepEqual(record, {
    v: 1,
    theme: 'x',
    dog: { rest: { x: 150, y: 210 }, ball: { x: 40, y: 230 }, future: true },
    cat: { sofa: { x: 1, y: 1 }, ball: { x: 300, y: 220 }, bowl: { x: 320, y: 230 } },
  });
  // Сброс в обычную расстановку: точки этого животного убираются, остальное — как было.
  const reset = Room.roomRecord(JSON.stringify(record), 'cat', Room.arrange('cat', 0, {}).pos);
  assert.deepEqual(reset.cat, { sofa: { x: 1, y: 1 }, ball: { x: 300, y: 220 } });
  assert.deepEqual(reset.dog, record.dog);
  // Повреждённое значение ключа — новая запись только с этим животным.
  assert.deepEqual(Room.roomRecord('{bad', 'dog', { rest: [150, 210] }), { v: 1, dog: { rest: { x: 150, y: 210 } } });
  assert.deepEqual(Room.roomRecord(null, 'dog', Room.arrange('dog', 0, {}).pos), { v: 1, dog: {} });
});

test('две вкладки: запись своего животного поверх свежей записи другой вкладки не стирает её животное', () => {
  let storage = null;
  // Вкладка A открыла редактор кота, вкладка B сохранила собаку, затем A сохраняет кота — по свежему значению.
  const catDraft = { ...Room.arrange('cat', 2, {}).pos, rest: [150, 210] };
  storage = JSON.stringify(Room.roomRecord(storage, 'dog', { ...Room.arrange('dog', 2, {}).pos, rope: [330, 240] }));
  storage = JSON.stringify(Room.roomRecord(storage, 'cat', catDraft));
  const room = Room.parseRoom(storage);
  assert.deepEqual(room.dog, { rope: [330, 240] });
  assert.deepEqual(room.cat, { rest: [150, 210] });
  // Обе вкладки сохраняют кота: побеждает последняя запись (явное «Сохранить»), собака не тронута.
  storage = JSON.stringify(Room.roomRecord(storage, 'cat', { ...catDraft, rest: [260, 212] }));
  assert.deepEqual(Room.parseRoom(storage), { cat: { rest: [260, 212] }, dog: { rope: [330, 240] } });
  // Вещь не открытой здесь ступени (мячик) сохраняется, хотя в комнате её нет.
  storage = JSON.stringify(Room.roomRecord(JSON.stringify({ v: 1, dog: { ball: { x: 60, y: 230 } } }), 'dog', Room.arrange('dog', 1, {}).pos));
  assert.deepEqual(Room.parseRoom(storage).dog, { ball: [60, 230] });
});

test('выбор под пальцем: видимый предмет — верхний; увеличенные области — выбранный, затем ближайший; пусто — ничего', () => {
  const layout = Room.arrange('dog', 2, {});
  assert.equal(Room.pickAt(layout, Room.HOME.bowl, 'rest'), 'bowl', 'миска над подушкой');
  assert.equal(Room.pickAt(layout, [200, 120], ''), 'rest', 'питомец — место отдыха');
  assert.equal(Room.pickAt(layout, [200, 30], 'bowl', 60), '', 'стена над питомцем');
  const near = [Room.HOME.ball[0] + 16, Room.HOME.ball[1] - 16];
  assert.equal(Room.pickAt(layout, near, '', 0), '', 'без увеличения — мимо');
  assert.equal(Room.pickAt(layout, near, '', 60), 'ball', 'увеличенная область');
  // Точка между канатом и миской, ни на одном рисунке, но в обеих увеличенных областях; ближе к канату.
  const both = { ...layout, pos: { ...layout.pos, rope: [60, 234], bowl: [120, 238] } };
  const p = [88, 238];
  assert.equal(Room.pickAt(both, p, '', 70), 'rope', 'без выбора — ближайший');
  assert.equal(Room.pickAt(both, p, 'bowl', 70), 'bowl', 'выбранный получает приоритет');
  assert.equal(Room.pickAt(both, p, 'rope', 70), 'rope');
  const hit = Room.hitBox(both, 'bowl', 60);
  assert.ok(hit[2] - hit[0] >= 60 && hit[3] - hit[1] >= 60, 'не меньше заданного');
  assert.match(Web.hitStyle(layout, 'bowl'), /^--x:42.5;--y:81.8;--w:12.5;--h:10$/);
});

// Поза «ест» в сцене: замер рисунка (FEED) от места отдыха со сдвигом к миске (на лежанке питомец на 4 ниже) и куда
// смотрит голова (на исходных местах — над миской: место отдыха правее миски на 30, ниже на 1).
const feedAt = (layout) => {
  const [fx, fy] = Room.feedShift(layout);
  const x = layout.pos.rest[0] + fx * Room.PET_SCALE;
  const y = layout.pos.rest[1] + fy * Room.PET_SCALE;
  const [l, t, r, b] = Room.FEED[layout.kind];
  const lift = layout.stage >= 3 ? 4 : 0;
  return { box: [x + l, y + t + lift, x + r, y + b + lift], aim: [x - (Room.HOME.rest[0] - Room.HOME.bowl[0]), y - (Room.HOME.rest[1] - Room.HOME.bowl[1])] };
};
const inScene = ([l, t, r, b]) => l >= 4 - 0.1 && r <= 396 + 0.1 && t >= 0 && b <= 248 + 0.1;

test('лакомство: на исходных местах сдвига нет; голова — над переставленной миской, если поза «ест» помещается целиком', () => {
  for (const kind of KINDS) for (const stage of STAGES) assert.deepEqual(Room.feedShift(Room.arrange(kind, stage, {})), [0, 0], `${kind}/${stage}`);
  // Настоящий масштаб питомца: viewBox 220×204 в рамке 176×160 вписан по высоте (а не 176/220).
  assert.equal(Room.PET_SCALE, 160 / 204);
  const layout = Room.arrange('cat', 0, {});
  const right = { ...layout, pos: { ...layout.pos, bowl: [300, 225] } };
  assert.deepEqual(Room.feedShift(right), [165.8, 25.5]);
  assert.ok(dist(feedAt(right).aim, [300, 225]) < 0.1, 'голова над миской');
  // Свойство: любые места отдыха и миски у кота и собаки на всех ступенях — поза «ест» целиком в сцене; голова над
  // миской, кроме упора в край сцены (тогда рисунок у самого края — подходит, насколько позволяет сцена); расстановка та же.
  const random = rng(5);
  for (const kind of KINDS) {
    for (const stage of STAGES) {
      for (let i = 0; i < 80; i += 1) {
        const l = Room.arrange(kind, stage, { rest: [random() * 400, 200 + random() * 30], bowl: [random() * 400, 180 + random() * 70] });
        const before = JSON.stringify(l);
        const { box, aim } = feedAt(l);
        assert.ok(inScene(box), `${kind}/${stage}: ${JSON.stringify({ pos: l.pos, box })}`);
        const edge = box[0] <= 4.1 || box[2] >= 395.9;
        assert.ok(edge || Math.abs(aim[0] - l.pos.bowl[0]) < 0.1, `${kind}/${stage}: голова над миской ${JSON.stringify({ pos: l.pos, aim })}`);
        assert.equal(JSON.stringify(l), before, 'feedShift не меняет расстановку');
      }
    }
  }
});

test('лакомство у края (замечание аудита): миска слева [30, 240] и справа [371, 236] — кот и собака целиком в сцене', () => {
  for (const kind of KINDS) {
    for (const stage of STAGES) {
      for (const { side, bowl } of [{ side: 'слева', bowl: [30, 240] }, { side: 'справа', bowl: [371, 236] }]) {
        const l = Room.arrange(kind, stage, { bowl });
        assert.ok(dist(l.pos.bowl, bowl) <= 4, `${kind}/${stage}: миска ${side} допустима (${l.pos.bowl})`);
        const { box, aim } = feedAt(l);
        assert.ok(inScene(box), `${kind}/${stage} ${side}: ${JSON.stringify(box)}`);
        // Упор в край: рисунок у самого поля сцены, голова — ближе к миске, чем место отдыха.
        assert.ok(side === 'слева' ? box[0] < 4.1 : box[2] > 395.9, `${kind}/${stage} ${side}: подходит до края ${JSON.stringify(box)}`);
        assert.ok(Math.abs(aim[0] - l.pos.bowl[0]) < Math.abs(l.pos.rest[0] - 30 - l.pos.bowl[0]), `${kind}/${stage} ${side}: ближе к миске`);
      }
    }
  }
  // Прежний расчёт уводил рисунок за край: кот слева −24 … справа 414 единиц (замер Chrome в аудите).
  const cat = Room.arrange('cat', 0, { bowl: [30, 240] });
  assert.ok(feedAt(cat).box[0] >= 3.9);
});

// Точка у самой границы допустимого — как упор в соседнюю вещь при переносе: между допустимой и недопустимой.
const edgeOf = (layout, id, from, into) => {
  let [a, b] = [from, into];
  for (let k = 0; k < 40; k += 1) {
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (Room.fits(layout, id, m)) a = m;
    else b = m;
  }
  return a;
};

test('сохранение не сдвигает расстановку: клубок у лампы с дробными координатами (пример аудита), ступени 3 и 4', () => {
  const want = [303.48827193304896, 193.64931128080934];
  for (const stage of [3, 4]) {
    const layout = Room.arrange('cat', stage, {});
    assert.ok(Room.fits(layout, 'yarn', want) && !Room.fits(layout, 'yarn', grid(want)), 'точка допустима, её округление — нет (условие дефекта)');
    layout.pos.yarn = Room.settle(layout, 'yarn', want);
    assert.ok(Room.fits(layout, 'yarn', layout.pos.yarn));
    assert.deepEqual(layout.pos.yarn, grid(layout.pos.yarn), 'место — на сетке записи');
    assert.ok(dist(layout.pos.yarn, want) < 0.2, `у самой лампы, без шага поиска: ${layout.pos.yarn}`);
    const first = reread('cat', stage, layout.pos);
    assert.deepEqual(JSON.parse(first.text).cat.yarn, { x: layout.pos.yarn[0], y: layout.pos.yarn[1] }, 'в записи — та же точка');
    assert.deepEqual(first.layout.pos, layout.pos, `ступень ${stage}: после записи и чтения — та же расстановка`);
    const second = reread('cat', stage, first.layout.pos, first.text);
    assert.equal(second.text, first.text, 'повторное сохранение — та же запись');
    assert.deepEqual(second.layout.pos, layout.pos);
    // Запись прежней версии (округлена через границу): ближайшая точка сетки рядом, а не шаг поиска 2 (было 301,5).
    const old = Room.arrange('cat', stage, Room.parseRoom(JSON.stringify({ v: 1, cat: { yarn: { x: 303.5, y: 193.6 } } })).cat);
    assert.ok(dist(old.pos.yarn, [303.5, 193.6]) <= 0.15, `прежняя запись: ${old.pos.yarn}`);
    assert.deepEqual(reread('cat', stage, old.pos).layout.pos, old.pos, 'дальше — устойчиво');
  }
});

test('устойчивость записи: дробные места вплотную к питомцу, вещам и неподвижным предметам — после записи, чтения и повторного сохранения те же', () => {
  const random = rng(29);
  const obstacles = [[93, 222], [326, 217], [345, 190], [60, 190]]; // блокнот, кружка, низ лампы, низ растения
  let tight = 0;
  let crossing = 0;
  for (const kind of KINDS) {
    for (const stage of STAGES) {
      for (let i = 0; i < 40; i += 1) {
        const layout = Room.arrange(kind, stage, {});
        // Несколько упоров подряд: предмет ведут к соседнему или к неподвижному, пока можно (дробная точка у границы).
        for (let j = 0; j < 3; j += 1) {
          const ids = Object.keys(layout.pos);
          const id = ids[Math.floor(random() * ids.length)];
          const targets = [...ids.filter((other) => other !== id).map((other) => layout.pos[other]), ...obstacles];
          const into = targets[Math.floor(random() * targets.length)];
          const from = layout.pos[id];
          if (Room.fits(layout, id, into)) continue;
          const edge = edgeOf(layout, id, from, [into[0] + random() * 6 - 3, into[1] + random() * 6 - 3]);
          if (!Room.fits(layout, id, grid(edge))) crossing += 1;
          layout.pos = { ...layout.pos, [id]: Room.settle(layout, id, edge) };
          if (dist(layout.pos[id], edge) < 1) tight += 1;
          // И шаг кнопкой от упора.
          const step = Room.nudge(layout, id, ['left', 'right', 'up', 'down'][Math.floor(random() * 4)]);
          if (step && random() < 0.5) layout.pos = { ...layout.pos, [id]: step };
        }
        assert.ok(valid(layout), `${kind}/${stage}/${i}`);
        const first = reread(kind, stage, layout.pos);
        assert.deepEqual(first.layout.pos, layout.pos, `${kind}/${stage}/${i}: видимая расстановка после сохранения та же`);
        const second = reread(kind, stage, first.layout.pos, first.text);
        assert.equal(second.text, first.text, `${kind}/${stage}/${i}: повторное сохранение — та же запись`);
        assert.equal(Room.samePlaces(second.layout.pos, layout.pos), true);
      }
    }
  }
  assert.ok(tight > 300, `упоров вплотную (меньше единицы до границы): ${tight}`);
  assert.ok(crossing > 50, `точек, где прежнее округление пересекало границу: ${crossing}`);
});

test('та же точка сетки: «Не сохранено» и запись исходного места — без допуска в полединицы', () => {
  const home = Room.arrange('dog', 0, {}).pos;
  const moved = { ...home, bowl: [home.bowl[0] + 0.3, home.bowl[1]] };
  assert.equal(Room.samePlaces(moved, home), false, 'сдвиг 0,3 — изменение');
  assert.equal(Room.samePlaces({ ...home }, home), true);
  assert.deepEqual(Room.roomRecord(null, 'dog', moved).dog, { bowl: { x: 170.3, y: 205 } }, 'рядом с исходным — точкой, а не исходное место');
  assert.deepEqual(Room.roomRecord(null, 'dog', home).dog, {});
});

test('рисунок: клубок и канат — простые SVG без внешних ресурсов; переставляемые вещи помечены; питомец — в той же рамке', () => {
  for (const art of [yarnArt(), ropeArt()]) {
    assert.match(art, /^<g class="cat-item" data-item="(yarn|rope)" data-room="(yarn|rope)">/);
    assert.doesNotMatch(art, /https?:|\.png|\.jpg|<image/);
  }
  assert.match(sceneSvg({ stage: 3 }), /data-item="bed" data-room="rest"[\s\S]*data-item="bed-front" data-room="rest"/);
  assert.match(bowlArt({ state: 'waiting' }), /data-cat-bowl data-state="waiting" data-room="bowl"/);
  assert.deepEqual(sceneCatBox(0), { x: 114, y: 46, width: 176, height: 160 });
});

