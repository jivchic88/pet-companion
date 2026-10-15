// Лапа, миска и мячик в сцене «Поиграть»: распознавание жеста — отображение (pet/pet-play.mjs, pet/pet-toys.mjs), правила
// мест в единицах рисунка — ядро (pet/core/toys.mjs, PL04.3), реакции — режиссёр ядра. Лапа важнее тела, область не меньше
// 44×44 и только у видимой лапы; пол — в границах сцены и не на питомце на всех проверяемых размерах (рамки страницы →
// единицы рисунка); исходные места не пересекаются, «подвинуть» — ближе к питомцу; мячик докатывается до края или
// питомца, кнопка катит туда, где свободнее; пороги касания, переноса и катания; жесты на имитации страницы с настоящим
// ядром: отмена возвращает предмет, второй палец и чужой жест не вмешиваются, касание без сдвига — не действие, упёршийся
// мячик — не катание; реакция на предмет не перебивает поглаживание и сменяет прежнюю без очереди; перенос миски не кормит.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Core from './legacy-toys.mjs';
import * as G from './legacy-play.mjs';
import * as T from '../pet/pet-toys.mjs';
import * as R from './legacy-rules.mjs';
import { DAY, host, LEGACY_DISPLAY, life } from './core-kit.mjs';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

// Раскладки сцены по замеру в Chrome (сцена, питомец, место под ним): кот и собака одинаковы.
const LAYOUTS = {
  '320×740': [rect(0, 106, 320, 482), rect(19, 146, 282, 261), rect(160, 411, 0, 64)],
  '390×844': [rect(0, 106, 390, 606), rect(23, 179, 343, 318), rect(195, 502, 0, 64)],
  '844×390': [rect(0, 0, 544, 390), rect(121, 16, 302, 280), rect(272, 300, 0, 0)],
  '568×320': [rect(0, 0, 268, 320), rect(29, 14, 211, 195), rect(134, 213, 0, 20)],
  '1280×760': [rect(300, 130, 680, 532), rect(420, 142, 440, 408), rect(640, 554, 0, 23)],
  '1440×900': [rect(380, 176, 680, 580), rect(500, 191, 440, 408), rect(720, 603, 0, 64)],
};
// Пол в единицах рисунка, как его объявляет отображение (рамки — относительно сцены), и зона ядра.
const unitsOf = ([stage, pet, floor]) => {
  const rel = (r) => ({ left: r.left - stage.left, top: r.top - stage.top, right: r.right - stage.left, bottom: r.bottom - stage.top, width: r.width });
  return T.floorUnits(rel(stage), rel(pet), rel(floor));
};
const zoneOf = (layout, kind = 'cat') => {
  const u = unitsOf(layout);
  return { ...Core.zoneOf(u.floor, u.touch, kind), s: u.s };
};
const boxOf = (size, [x, y]) => ({ l: x - size[0] / 2, r: x + size[0] / 2, t: y - size[1] / 2, b: y + size[1] / 2 });
const inside = (z, b) => b.l >= z.left - 0.5 && b.r <= z.right + 0.5 && b.t >= z.top - 0.5 && b.b <= z.bottom + 0.5;
const offPet = (z, b) => b.r <= z.foot.left + 0.5 || b.l >= z.foot.right - 0.5 || b.t >= z.foot.bottom - 0.5;
const meet = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const CAT = { v: 1, seenStage: 0, greetDay: DAY };

test('лапа: важнее тела, жест с неё — касание; порог касания меньше порога поглаживания', () => {
  assert.equal(G.PAW_SLOP_PX, 10);
  assert.ok(G.PAW_SLOP_PX < G.STROKE_PX, 'сдвиг с лапы дальше порога касания ещё не поглаживание по порогу');
  assert.equal(G.TAP_MS, 500);
  for (const kind of ['cat', 'dog']) {
    const p = G.PAW[kind];
    assert.equal(G.petPart(kind, p.cx, p.cy), 'paw', `${kind}: центр лапы`);
    assert.equal(G.petPart(kind, 90.5, 185), 'paw', `${kind}: стопа`);
    // Лапа лежит на теле: та же точка без лапы — тело.
    const body = G.HIT[kind].find((e) => e.part === 'body');
    assert.ok(((p.cx - body.cx) / body.rx) ** 2 + ((p.cy - body.cy) / body.ry) ** 2 <= 1, `${kind}: лапа внутри тела — нужен приоритет`);
    assert.equal(G.petPart(kind, 100, 140), 'body', `${kind}: грудь — по-прежнему тело`);
    assert.equal(G.petPart(kind, 100, 70), 'head', `${kind}: голова`);
    assert.equal(G.petPart(kind, 140, 170), 'body', `${kind}: живот сбоку — тело, не лапа`);
  }
});

test('лапа: область не меньше 44×44 CSS px на маленьком питомце и не больше лапы на крупном; поднятая — только в позе', () => {
  // Маленький (568×320: 211 px) — радиус 22 px; крупный (440 px) — по рисунку.
  for (const width of [211, 282, 343, 440]) {
    const box = rect(0, 0, width, (width * 204) / 220);
    const s = width / 220;
    const [cx, cy] = [G.PAW.cat.cx * s, G.PAW.cat.cy * s];
    const r = Math.max(G.PAW.cat.r * s, G.PAW_MIN_PX);
    assert.equal(G.partAt('cat', box, cx + r - 1, cy), 'paw', `${width}: край области`);
    assert.notEqual(G.partAt('cat', box, cx + r + 2, cy), 'paw', `${width}: за краем — не лапа`);
    assert.ok(2 * r >= 44, `${width}: ${2 * r} px`);
    assert.ok(r <= Math.max(G.PAW.cat.r * s, 22) + 0.01);
  }
  // Собака: в позе «Дай лапу» опущенной лапы не видно — область на поднятой; в других позах поднятой лапы нет.
  const up = G.PAW.dog.up;
  assert.equal(G.petPart('dog', up.cx, up.cy, 'paw'), 'paw', 'поднятая лапа в позе «Дай лапу»');
  assert.equal(G.petPart('dog', up.cx, up.cy, 'calm'), 'body', 'невидимая поднятая лапа — не лапа');
  assert.equal(G.petPart('dog', 90.5, 185, 'paw'), 'body', 'опущенная лапа в позе «Дай лапу» не видна — не лапа');
  assert.equal(G.petPart('cat', up.cx, up.cy, 'paw'), 'body', 'у кота поднятой лапы нет');
  // Разметка: та же область, что у правила.
  for (const kind of ['cat', 'dog']) {
    const html = G.hitsHtml(kind);
    assert.match(html, /data-play-hit="paw"[^>]*aria-hidden="true"/);
    const vars = Object.fromEntries([...html.matchAll(/--(\w+):([\d.]+)%/g)].map(([, key, value]) => [key, Number(value)]));
    assert.ok(Math.abs(vars.x - (G.PAW[kind].cx / 220) * 100) < 0.01 && Math.abs(vars.y - (G.PAW[kind].cy / 204) * 100) < 0.01, kind);
    assert.ok(Math.abs(vars.rx - (G.PAW[kind].r / 220) * 100) < 0.01);
    if (kind === 'dog') assert.ok(Math.abs(vars.ux - (up.cx / 220) * 100) < 0.01 && Math.abs(vars.uy - (up.cy / 204) * 100) < 0.01);
  }
});

test('пол: предмет в границах сцены и не на питомце (не закрывает тело, хвост и лапу) на всех размерах', () => {
  for (const [label, layout] of Object.entries(LAYOUTS)) {
    for (const kind of ['cat', 'dog']) {
      const z = zoneOf(layout, kind);
      const s = z.s;
      // Низ питомца на полу — не выше низа области лапы на экране (22 CSS px): та же величина, что у pawBottom.
      assert.ok(layout[1].top + z.foot.bottom * s >= G.pawBottom(kind, layout[1]) - 0.01, `${label}: низ питомца — не выше низа лапы`);
      // Пол — у лап, не выше: голова и текст недостижимы; низ — в сцене.
      assert.ok(z.top >= 170, label);
      assert.ok(layout[1].top + z.bottom * s <= layout[0].bottom + 0.01, label);
      for (const toy of ['bowl', 'ball']) {
        const bad = [];
        for (let x = -250; x <= 450; x += 7) {
          for (let y = -150; y <= 400; y += 9) {
            const b = boxOf(Core.SIZE[toy], Core.placeToy(z, Core.SIZE[toy], [x, y]));
            if (!inside(z, b) || !offPet(z, b)) bad.push(`${x},${y}`);
          }
        }
        assert.deepEqual(bad.slice(0, 3), [], `${label} ${kind} ${toy}: вне пола или на питомце`);
      }
    }
  }
});

test('пол: исходные места не пересекаются, «подвинуть» — заметно ближе к питомцу, мячику есть куда катиться', () => {
  for (const [label, layout] of Object.entries(LAYOUTS)) {
    const z = zoneOf(layout);
    const home = Object.fromEntries(['bowl', 'ball'].map((toy) => [toy, Core.placeToy(z, Core.SIZE[toy], Core.HOME[toy])]));
    const near = Core.placeToy(z, Core.SIZE.bowl, Core.NEAR.bowl);
    assert.ok(!meet(boxOf(Core.SIZE.bowl, home.bowl), boxOf(Core.SIZE.ball, home.ball)), `${label}: миска и мячик не пересекаются`);
    assert.ok(Core.closer(home.bowl, near), `${label}: «подвинуть» ближе`);
    assert.ok(Math.hypot(near[0] - home.bowl[0], near[1] - home.bowl[1]) * z.s >= 30, `${label}: сдвиг заметный (CSS px)`);
    assert.equal(Core.sideOf(home.bowl[0]), 'left');
    assert.equal(Core.sideOf(home.ball[0]), 'right');
    // Кнопка «Катнуть мячик» четыре раза подряд — каждый раз заметный сдвиг, туда и обратно.
    let p = home.ball;
    const dirs = [];
    for (let i = 0; i < 4; i += 1) {
      const way = Core.rollWay(z, Core.SIZE.ball, p);
      assert.ok(Math.abs(way.to - p[0]) * z.s >= T.ROLL_PX * 2, `${label}: нажатие ${i + 1} — ${Math.round((way.to - p[0]) * z.s)} px`);
      const b = boxOf(Core.SIZE.ball, [way.to, p[1]]);
      assert.ok(inside(z, b) && offPet(z, b), `${label}: в пределах пола`);
      dirs.push(way.dir);
      p = [way.to, p[1]];
    }
    assert.equal(new Set(dirs).size, 2, `${label}: катится в обе стороны`);
  }
});

test('мячик: докатывается до края пола или до питомца, перед лапами — свободно; путь — в разумных пределах', () => {
  const z = zoneOf(LAYOUTS['1280×760']);
  const [hw, hh] = Core.SIZE.ball.map((value) => value / 2);
  const beside = z.foot.bottom - hh - 1;
  // Сбоку справа от питомца: влево — до питомца, вправо — до края.
  assert.equal(Core.rollEnd(z, Core.SIZE.ball, [z.right - hw - 50, beside], -1, 1000), z.foot.right + hw);
  assert.equal(Core.rollEnd(z, Core.SIZE.ball, [z.foot.right + hw + 10, beside], 1, 1000), z.right - hw);
  assert.equal(Core.rollEnd(z, Core.SIZE.ball, [z.right - hw, beside], 1, 50), z.right - hw, 'у края — некуда');
  // Перед лапами (телефон) — через всю сцену.
  const p = zoneOf(LAYOUTS['390×844']);
  const front = p.foot.bottom + hh + 1;
  assert.equal(Core.rollEnd(p, Core.SIZE.ball, [p.right - hw, front], -1, 10_000), p.left + hw);
  assert.equal(Core.rollDist(4), 30, 'короткий бросок — не меньше');
  assert.equal(Core.rollDist(-5000), 90, 'длинный — не больше');
  assert.equal(T.MOVE_PX, 6);
  assert.equal(T.ROLL_PX, 16);
});

// ---------- жесты на имитации страницы ----------

function fakePage() {
  const handlers = new Map();
  const on = (target) => {
    target.listeners = {};
    target.addEventListener = (type, fn) => (target.listeners[type] ??= new Set()).add(fn);
    target.removeEventListener = (type, fn) => target.listeners[type]?.delete(fn);
    target.fire = (type, event) => [...(target.listeners[type] ?? [])].forEach((fn) => fn(event));
    return target;
  };
  const frames = [];
  globalThis.window = on({});
  globalThis.document = on({ hidden: false });
  globalThis.requestAnimationFrame = (fn) => frames.push(fn);
  globalThis.cancelAnimationFrame = () => {};
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  const el = (r, attrs = {}) =>
    on({
      r,
      dataset: { ...attrs },
      style: { setProperty() {} },
      captured: new Set(),
      getBoundingClientRect: () => r,
      setPointerCapture(id) {
        this.captured.add(id);
      },
      hasPointerCapture(id) {
        return this.captured.has(id);
      },
      releasePointerCapture(id) {
        this.captured.delete(id);
      },
      closest(selector) {
        return selector === '[data-play-toy]' && this.dataset.playToy ? this : selector === '[data-play-hit]' && this.dataset.playHit ? this : selector === '[data-play-pet]' ? pet : null;
      },
      querySelector: () => null,
    });
  const [stageRect, petRect, floorRect] = LAYOUTS['390×844'];
  const stage = el(stageRect);
  const pet = el(petRect, { kind: 'cat' });
  const art = { dataset: { pose: 'calm' } };
  pet.querySelector = (selector) => (selector === '.cat-art' ? art : null);
  const floor = el(floorRect);
  const toys = { bowl: el(rect(0, 0, 0, 0), { playToy: 'bowl' }), ball: el(rect(0, 0, 0, 0), { playToy: 'ball' }) };
  const view = el(stageRect);
  view.querySelector = (selector) => ({ '[data-play-stage]': stage, '[data-play-pet]': pet, '[data-play-floor]': floor })[selector] ?? null;
  view.querySelectorAll = (selector) => (selector === '[data-play-toy]' ? Object.values(toys) : []);
  const paw = el(petRect, { playHit: 'paw' });
  const pointer = (type, target, x, y, extra = {}) => {
    const event = { type, target, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType: 'touch', timeStamp: extra.timeStamp ?? 0, preventDefault() {}, ...extra };
    if (type === 'pointerdown') view.fire('pointerdown', event);
    else window.fire(type, event);
  };
  const center = (name) => {
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(toys[name].style.transform);
    return [Number(m[1]) + stageRect.left + Number.parseFloat(toys[name].style.width) / 2, Number(m[2]) + stageRect.top + Number.parseFloat(toys[name].style.height) / 2];
  };
  return { view, toys, paw, pet, art, pointer, center, frames, handlers };
}

// Настоящее ядро в «Поиграть» с этим отображением предметов: пол объявляет pet-toys.mjs, места — снимок ядра.
function playCore() {
  const L = life({ cat: CAT }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  assert.equal(L.core.start().ok, true);
  assert.equal(L.core.open('play').ok, true);
  T.initToys({
    play: () => L.state().play,
    drag: (toy, at) => L.core.toy.drag(toy, at),
    drop: (roll) => L.core.toy.drop(roll === undefined ? undefined : { roll }),
    cancel: () => L.core.toy.cancel(),
    floor: (floor, touch) => L.core.setDisplay({ playFloor: floor, playTouch: touch }),
    motion: () => 'none',
  });
  L.core.subscribe(() => T.draw(), { initial: false });
  return L;
}

test('жест с предметом: перенос миски, отмена, касание без сдвига, второй палец, чужой жест; мячик — порог катания; места — ядро', () => {
  const page = fakePage();
  const L = playCore();
  T.watchToys(page.view);
  T.mountToys(page.view);
  const told = () => L.effects('announce').length;
  const { pointer, toys, center } = page;
  assert.ok(L.state().display.playFloor, 'пол объявлен отображением в единицах рисунка');
  const home = center('bowl');
  assert.equal(L.state().play.toys.bowl.home, true);
  // Касание без сдвига и сдвиг ниже порога — миска не прыгает, действия нет.
  pointer('pointerdown', toys.bowl, ...home);
  pointer('pointermove', toys.bowl, home[0] + 4, home[1]);
  assert.deepEqual(center('bowl'), home, 'до порога — на месте');
  pointer('pointerup', toys.bowl, home[0] + 4, home[1]);
  assert.deepEqual([told(), G.gesturing(), L.state().play.drag], [0, false, null]);
  // Перенос: точка захвата сохраняется (предмет сдвинут ровно на сдвиг указателя), отпустили — стоит там.
  pointer('pointerdown', toys.bowl, home[0] + 10, home[1]);
  pointer('pointermove', toys.bowl, home[0] + 70, home[1]);
  assert.deepEqual(center('bowl').map(Math.round), [Math.round(home[0] + 60), Math.round(home[1])], 'без скачка центром под палец');
  assert.deepEqual([G.gesturing(), L.state().play.drag?.toy], [true, 'bowl'], 'перенос — у ядра');
  // Второй палец и чужой жест не начинают и не кончают перенос.
  pointer('pointerdown', toys.ball, ...center('ball'), { pointerId: 2, isPrimary: false });
  pointer('pointerup', toys.ball, 0, 0, { pointerId: 2 });
  pointer('pointercancel', toys.ball, 0, 0, { pointerId: 2 });
  assert.equal(G.gesturing(), true, 'второй палец не завершает');
  pointer('pointerup', toys.bowl, home[0] + 70, home[1]);
  assert.deepEqual([told(), L.state().play.outcome, L.state().play.toys.bowl.home], [1, 'sniff', false], 'к питомцу — принюхивается; миска не на исходном месте');
  assert.equal(L.state().treat, 'ready', 'миска не кормит');
  const placed = center('bowl');
  // Отмена (pointercancel, потеря захвата, закрытие) — на место до этого жеста, без итога.
  const lost = () => {
    toys.bowl.captured.delete(1);
    toys.bowl.fire('lostpointercapture', { pointerId: 1 });
  };
  for (const stop of [() => pointer('pointercancel', toys.bowl, 0, 0), lost, () => G.release('close')]) {
    pointer('pointerdown', toys.bowl, ...placed);
    pointer('pointermove', toys.bowl, placed[0] + 40, placed[1]);
    assert.notDeepEqual(center('bowl'), placed);
    stop();
    assert.deepEqual(center('bowl'), placed, 'вернулась на место до жеста');
    assert.deepEqual([G.gesturing(), L.state().play.drag], [false, null]);
  }
  assert.equal(told(), 1, 'отмена — без итога');
  // Идёт другой жест сцены (поглаживание другим указателем) — предмет не берётся, жест не перехватывается.
  const other = { addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, hasPointerCapture: () => false };
  let otherEnd = 0;
  assert.equal(G.grab({ pointerId: 7, isPrimary: true, button: 0, preventDefault() {} }, other, { move() {}, end: () => (otherEnd += 1) && false }), true);
  pointer('pointerdown', toys.bowl, ...placed, { pointerType: 'mouse' });
  pointer('pointermove', toys.bowl, placed[0] + 40, placed[1], { pointerType: 'mouse' });
  pointer('pointerup', toys.bowl, placed[0] + 40, placed[1], { pointerType: 'mouse' });
  assert.deepEqual(center('bowl'), placed, 'миска не сдвинулась');
  assert.equal(otherEnd, 0, 'чужой жест не кончился');
  G.release('cancel');
  assert.equal(otherEnd, 1);
  // Мышь: основную кнопку отпустили, держа другую, — как отпустили.
  pointer('pointerdown', toys.bowl, ...placed, { pointerType: 'mouse' });
  pointer('pointermove', toys.bowl, placed[0] - 30, placed[1], { pointerType: 'mouse' });
  pointer('pointermove', toys.bowl, placed[0] - 40, placed[1], { pointerType: 'mouse', buttons: 2 });
  assert.deepEqual([G.gesturing(), told()], [false, 2]);
  // Не основная кнопка мыши — не жест.
  pointer('pointerdown', toys.ball, ...center('ball'), { pointerType: 'mouse', button: 2 });
  assert.equal(G.gesturing(), false);
  // Мячик: сдвиг меньше ROLL_PX — не катание, назад; заметный — катится (без анимации — остаётся, где отпустили).
  const ball = center('ball');
  pointer('pointerdown', toys.ball, ...ball);
  pointer('pointermove', toys.ball, ball[0] - (T.ROLL_PX - 2), ball[1]);
  pointer('pointerup', toys.ball, ball[0] - (T.ROLL_PX - 2), ball[1]);
  assert.deepEqual([center('ball'), told()], [ball, 2], 'дрожание и короткий сдвиг — назад');
  // Мячик у правого края, тянут вправо — двигаться некуда: не катание.
  pointer('pointerdown', toys.ball, ...ball);
  pointer('pointermove', toys.ball, ball[0] + 60, ball[1]);
  pointer('pointerup', toys.ball, ball[0] + 60, ball[1]);
  assert.deepEqual([center('ball'), told()], [ball, 2], 'упёрся в край — не катание');
  pointer('pointerdown', toys.ball, ...ball);
  pointer('pointermove', toys.ball, ball[0] - 60, ball[1]);
  pointer('pointerup', toys.ball, ball[0] - 60, ball[1]);
  assert.deepEqual([told(), L.state().play.outcome, L.state().pose.reaction.toward], [3, 'ball', 'left']);
  assert.ok(center('ball')[0] <= ball[0] - 59, 'без анимации — где отпустили');
  // Кнопки — те же правила ядра (interact).
  assert.equal(L.core.interact({ type: 'bowl', to: 'home' }).ok, true);
  assert.equal(L.state().play.toys.bowl.home, true, '«Вернуть миску»');
  assert.deepEqual(center('bowl'), home, 'на исходном месте');
  assert.notEqual(L.core.interact({ type: 'ball', to: 'roll' }).outcome, 'dropped');
  T.unmountToys();
});

test('касание лапы: короткое на лапе — одно действие на отпускание; удержание, сдвиг, уход и второй палец — ничего; жест — ядру', () => {
  const page = fakePage();
  let paws = 0;
  let steps = 0;
  const calls = [];
  let ids = 0;
  G.initPlay({ start: () => (calls.push('start'), ++ids), step: () => (steps += 1), end: (id) => calls.push(`end ${id}`), cancel: (id) => calls.push(`cancel ${id}`), paw: () => (paws += 1), motion: () => 'none' });
  G.watchStroke(page.view);
  const { pointer, paw } = page;
  const s = 343 / 220;
  const at = [23 + G.PAW.cat.cx * s, 179 + G.PAW.cat.cy * s];
  pointer('pointerdown', paw, ...at, { timeStamp: 0 });
  assert.equal(paws, 0, 'не на нажатие');
  pointer('pointerup', paw, at[0] + 3, at[1], { timeStamp: 120 });
  assert.equal(paws, 1, 'на отпускание');
  assert.deepEqual(calls, ['start', 'end 1'], 'жест с лапы — тоже жест ядра: начало и конец, затем касание');
  // Удержание дольше TAP_MS.
  pointer('pointerdown', paw, ...at, { timeStamp: 1000 });
  pointer('pointerup', paw, ...at, { timeStamp: 1000 + G.TAP_MS + 50 });
  // Сдвиг за порог касания — не касание и не поглаживание, даже если провести по телу.
  pointer('pointerdown', paw, ...at, { timeStamp: 2000 });
  pointer('pointermove', paw, at[0], at[1] - G.PAW_SLOP_PX - 2);
  pointer('pointermove', paw, at[0] + 30, at[1] - 80);
  pointer('pointerup', paw, ...at, { timeStamp: 2100 });
  assert.equal(calls.at(-1), 'cancel 3', 'сдвиг с лапы — отмена жеста');
  // Отпустили вне лапы.
  pointer('pointerdown', paw, ...at, { timeStamp: 3000 });
  pointer('pointerup', paw, at[0], at[1] - 60, { timeStamp: 3050 });
  // Отмена браузером.
  pointer('pointerdown', paw, ...at, { timeStamp: 4000 });
  pointer('pointercancel', paw, ...at);
  pointer('pointerup', paw, ...at, { timeStamp: 4050 });
  assert.equal(calls.at(-1), 'cancel 5');
  // Второй палец и идущий жест с предметом (общий указатель сцены занят).
  pointer('pointerdown', paw, ...at, { isPrimary: false, pointerId: 2, timeStamp: 5000 });
  pointer('pointerup', paw, ...at, { pointerId: 2, timeStamp: 5050 });
  const other = { addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, hasPointerCapture: () => false };
  G.grab({ pointerId: 7, isPrimary: true, button: 0, preventDefault() {} }, other, { move() {}, end: () => false });
  pointer('pointerdown', paw, ...at, { pointerType: 'mouse', timeStamp: 6000 });
  pointer('pointerup', paw, ...at, { pointerType: 'mouse', timeStamp: 6050 });
  G.release('cancel');
  assert.equal(paws, 1, 'больше откликов нет');
  assert.equal(steps, 0, 'жест с лапы не гладит');
  assert.equal(G.stroking(), false);
  // Ядро сняло жест само: указатель отпущен (отмена), поздний конец безвреден.
  pointer('pointerdown', paw, ...at, { timeStamp: 6500 });
  G.strokeLost(null);
  assert.deepEqual([G.stroking(), calls.at(-1)], [false, `cancel ${ids}`]);
  // Следующее обычное касание работает.
  pointer('pointerdown', paw, ...at, { timeStamp: 7000 });
  pointer('pointerup', paw, ...at, { timeStamp: 7100 });
  assert.equal(paws, 2);
});

test('реакции на предметы: поглаживание и лапа их перебивают, сами — не перебивают; новая сменяет прежнюю без очереди', () => {
  for (const type of ['sniff', 'watch', 'ball']) {
    assert.equal(R.REACTIONS[type].toy, true);
    assert.ok(R.REACTIONS[type].priority > R.REACTIONS.pet.priority, `${type}: менее важна, чем поглаживание`);
    assert.ok(R.REACTIONS[type].ms <= 1500, `${type}: короткая`);
  }
  const d = R.createDirector();
  assert.equal(R.request(d, 'ball', { now: 0, explicit: true }).action, 'play');
  assert.equal(R.request(d, 'ball', { now: 100, explicit: true, extra: { toward: 'right' } }).action, 'play', 'новый бросок сменяет прежний');
  assert.equal(d.current.toward, 'right');
  assert.equal(R.request(d, 'sniff', { now: 200, explicit: true }).action, 'play', 'миска сменяет мячик');
  assert.equal(R.request(d, 'pet', { now: 300, explicit: true }).action, 'play', 'поглаживание перебивает предмет');
  assert.equal(R.request(d, 'ball', { now: 400, explicit: true }).action, 'drop', 'предмет не перебивает поглаживание');
  assert.equal(d.pending, null, 'и не ждёт — не сыграет неожиданно позже');
  R.finish(d, 2000);
  R.request(d, 'settle', { now: 2000 });
  assert.equal(R.request(d, 'watch', { now: 2100, explicit: true }).action, 'play', 'декоративное «устроился» сменяется');
  // Тишина страницы (таймер): отклик только в сцене (explicit), тишина не снимается.
  const q = R.createDirector();
  R.setQuiet(q, 'timer', true, 0);
  const result = R.request(q, 'ball', { now: 10, explicit: true });
  assert.equal(result.action, 'play');
  assert.equal(result.reaction.explicit, true);
  assert.equal(q.quiet.has('timer'), true);
  // Реплики — у кота и собаки, у кота есть и «лапа».
  for (const kind of ['cat', 'dog']) for (const group of ['paw', 'sniff', 'ball']) assert.ok(R.phraseList(group, 0, kind).length >= 2, `${kind}/${group}`);
});

