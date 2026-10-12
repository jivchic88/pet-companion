// Сцена «Поиграть» (pet/pet-play.mjs, явное действие в pet/pet-rules.mjs): порог поглаживания в CSS px — нажатие,
// удержание и дрожание его не проходят, один длинный жест не даёт откликов чаще порога; области головы и тела
// совпадают с разметкой и не включают пустые углы рамки и хвост; масштаб рисунка не меняет порог; прямое действие
// в сцене откликается и в тишине страницы, но не обходит приоритет и не копит очередь; кадры повтора движения в той
// же позе совпадают с исходными.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as G from '../pet/pet-play.mjs';
import * as R from '../pet/pet-rules.mjs';

// Путь указателя от (x, y) по шагам [dx, dy]; итог — число поглаживаний и наибольшее удаление.
function walk(points, start = [100, 100]) {
  let g = G.strokeStart(...start);
  let strokes = 0;
  let [x, y] = start;
  for (const [dx, dy] of points) {
    x += dx;
    y += dy;
    const step = G.strokeMove(g, x, y);
    g = step.g;
    if (step.stroke) strokes += 1;
  }
  return { strokes, far: g.far, g };
}

test('порог: нажатие, неподвижное удержание и дрожание — не поглаживание; направленный сдвиг на STROKE_PX — да', () => {
  assert.equal(G.STROKE_PX, 24);
  assert.ok(G.TAP_PX < G.STROKE_PX);
  assert.equal(walk([]).strokes, 0, 'нажатие без движения');
  assert.equal(walk(Array(60).fill([0, 0])).strokes, 0, 'удержание');
  // Дрожание ±3 px долго: путь большой, но от начала не уходит — порога нет.
  const jitter = walk(Array.from({ length: 200 }, (_, i) => (i % 2 ? [-3, 2] : [3, -2])));
  assert.equal(jitter.strokes, 0, 'дрожание');
  assert.ok(jitter.far < G.TAP_PX, 'дрожание — меньше порога нажатия');
  assert.equal(walk([[23, 0]]).strokes, 0, 'ниже порога');
  assert.equal(walk([[24, 0]]).strokes, 1, 'порог');
  for (const [dx, dy] of [[-30, 0], [0, 30], [0, -30], [20, 20], [-17, 18]]) assert.equal(walk([[dx, dy]]).strokes, 1, `направление ${dx},${dy}`);
  // Медленный сдвиг мелкими шагами — тоже поглаживание (порог — по удалению, а не по скорости).
  assert.equal(walk(Array(30).fill([1, 0])).strokes, 1, 'медленно');
});

test('порог: один жест — отклик на каждый новый сдвиг от прошлого отклика, а не на каждое движение', () => {
  // 100 px вправо по 2 px — 50 событий движения, но поглаживаний 4 (каждые 24 px).
  const long = walk(Array(50).fill([2, 0]));
  assert.equal(long.strokes, 4);
  // Туда-обратно на 30 px: каждый ход — новый сдвиг от опоры.
  const rub = walk([[30, 0], [-30, 0], [30, 0]]);
  assert.equal(rub.strokes, 3);
  // Вернулись к точке прошлого отклика — нового нет.
  assert.equal(walk([[24, 0], [-10, 0], [10, 0]]).strokes, 1);
});

test('порог — в CSS px окна и не зависит от размера рисунка', () => {
  const small = { left: 0, top: 0, width: 110, height: 102 };
  const big = { left: 0, top: 0, width: 440, height: 408 };
  // Точка головы в обоих масштабах — голова; сдвиг 24 px на любом размере — одно поглаживание.
  assert.equal(G.partAt('cat', small, 50, 33), 'head');
  assert.equal(G.partAt('cat', big, 200, 132), 'head');
  assert.equal(walk([[24, 0]], [50, 33]).strokes, 1);
  assert.equal(walk([[24, 0]], [200, 132]).strokes, 1);
  assert.equal(G.partAt('cat', { width: 0, height: 0, left: 0, top: 0 }, 0, 0), '', 'рамки нет — питомца нет');
});

test('области: голова и тело — питомец; пустые углы рамки, хвост и края — нет (кот и собака)', () => {
  for (const kind of ['cat', 'dog']) {
    assert.equal(G.petPart(kind, 100, 70), 'head', `${kind}: морда`);
    assert.equal(G.petPart(kind, 100, 150), 'body', `${kind}: грудь`);
    // С 2026-10-10 левая передняя лапа — своя область (касание лапы, toys.test.mjs), правая — тело.
    assert.equal(G.petPart(kind, 90, 185), 'paw', `${kind}: левая лапа`);
    assert.equal(G.petPart(kind, 116, 185), 'body', `${kind}: правая лапа`);
    for (const [u, v] of [[0, 0], [220, 0], [0, 204], [220, 204], [5, 100], [215, 100], [100, 202]]) assert.equal(G.petPart(kind, u, v), '', `${kind}: ${u},${v}`);
  }
  assert.equal(G.petPart('cat', 192, 150), '', 'кот: кончик хвоста');
  assert.equal(G.petPart('dog', 195, 135), '', 'собака: хвост');
  assert.equal(G.petPart('cat', 62, 34), 'head', 'кот: ухо');
  assert.equal(G.petPart('dog', 48, 80), 'head', 'собака: висячее ухо');
  assert.equal(G.petPart('fox', 100, 70), 'head', 'неизвестный вид — как кот');
});

test('области в разметке совпадают с правилом попадания: центр — своя часть, угол рамки области — не питомец', () => {
  for (const kind of ['cat', 'dog']) {
    const html = G.hitsHtml(kind);
    assert.equal((html.match(/data-play-hit=/g) ?? []).length, G.HIT[kind].length + 1, 'голова, тело и лапа');
    assert.match(html, /aria-hidden="true"/);
    assert.doesNotMatch(html, /tabindex|<button|role=/, 'области не фокусируются и не дублируют кнопки');
    for (const e of G.HIT[kind]) {
      const style = Object.fromEntries(G.hitStyle(e).split(';').map((pair) => pair.split(':')).map(([key, value]) => [key, parseFloat(value) / 100]));
      const box = { left: 0, top: 0, width: 220, height: 204 };
      const left = style.left * 220;
      const top = style.top * 204;
      const width = style.width * 220;
      const height = style.height * 204;
      assert.equal(G.partAt(kind, box, left + width / 2, top + height / 2), e.part, `${kind}/${e.part}: центр`);
      assert.ok(Math.abs(width - 2 * e.rx) < 0.1 && Math.abs(height - 2 * e.ry) < 0.1, `${kind}/${e.part}: размер`);
      assert.ok(left >= 0 && top >= 0 && left + width <= 220 && top + height <= 204, `${kind}/${e.part}: внутри рамки`);
    }
  }
});

test('прямое действие в сцене: в тишине страницы — отклик в сцене, обычная просьба — ждёт', () => {
  const d = R.createDirector();
  R.setQuiet(d, 'timer', true, 0);
  assert.equal(R.request(d, 'pet', { now: 10 }).action, 'queue', 'кнопка уголка в тишине — как раньше');
  d.pending = null;
  const result = R.request(d, 'pet', { now: 20, explicit: true });
  assert.equal(result.action, 'play');
  assert.equal(result.reaction.explicit, true, 'отклик помечен — страница остаётся тихой');
  assert.equal(d.quiet.has('timer'), true, 'тишина не отключается');
  // Тишина началась во время отклика — он останавливается, как любая реакция.
  assert.equal(R.setQuiet(d, 'typing', true, 30).action, 'none', 'тишина уже была');
  const e = R.createDirector();
  R.request(e, 'pet', { now: 0, explicit: true });
  assert.equal(R.setQuiet(e, 'dictation', true, 100).action, 'stop');
});

test('прямое действие в сцене: не обходит более важную реакцию и не копит очередь', () => {
  const d = R.createDirector();
  R.request(d, 'feed', { now: 0 });
  assert.equal(R.request(d, 'pet', { now: 100, explicit: true }).action, 'drop', 'ест — поглаживание не перебивает');
  assert.equal(d.pending, null, 'и не ждёт');
  R.finish(d, 3000);
  assert.equal(R.request(d, 'pet', { now: 3000, explicit: true }).action, 'play');
  for (let i = 1; i <= 20; i += 1) assert.equal(R.request(d, 'pet', { now: 3000 + i * 30, explicit: true }).action, 'drop', 'пока идёт отклик — новых нет');
  assert.equal(d.pending, null, 'очереди нет');
  // Декоративное «устроился» прямое действие перебивает.
  const s = R.createDirector();
  R.request(s, 'settle', { now: 0 });
  assert.equal(R.request(s, 'paw', { now: 100, explicit: true }).action, 'play');
  // Лимит частоты — прежний: три отклика в минуту, затем «хватит», дальше тихо.
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => R.petMood(Array.from({ length: n }, (_, i) => i * 1000), 5000)), ['pet', 'pet', 'pet', 'enough', 'quiet']);
});

test('поглаживание: повтор движения в той же позе — кадры-копии совпадают с исходными (перезапуск сменой имени)', async () => {
  const frames = (css, name) => css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1];
  for (const [file, name] of [['pet/pet.css', 'cat-tail-sway'], ['pet/dog.css', 'dog-pat']]) {
    const css = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(frames(css, name), `${name}: кадры найдены`);
    assert.equal(frames(css, `${name}-again`), frames(css, name), `${name}-again — те же кадры`);
    assert.match(css, new RegExp(`\\[data-pose='pet'\\]\\[data-again\\] \\.(cat-t2|dog-tail) \\{\\s*animation-name: ${name}-again;`), `${name}: data-again включает копию`);
  }
});

