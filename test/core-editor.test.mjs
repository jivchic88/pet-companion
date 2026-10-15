// Ядро PL04.3 в Node — «Обустроить уголок» (docs/ARCHITECTURE.md § 5.2 room, § 6.4 «Комната», сценарий § 6.8, § 8):
// настоящий экземпляр ядра на синхронном веб-координаторе (подменённое хранилище) и на асинхронном с ручным
// подтверждением. Команды room.* — аргументы, отказы, no-op, changed и объявления; черновик отдельно от переноса; drop,
// dragCancel, смена предмета; сценарий § 6.8 (dragCancel сохраняет клубок, save при переносе пишет только клубок, cancel
// отбрасывает всё); select и nudge при переносе; reset, пустое save, close и cancel; новая ступень при открытом редакторе и
// переносе; чужая расстановка без потери черновика; запись только передвинутых здесь предметов с неизвестными точками,
// полями, животными и большим v; синхронный отказ (несохранённое, честные сообщения, повтор следующей правкой, без скрытых
// повторов); асинхронно — выход сразу, pending, поздний успех и отказ, поздний исход не трогает новый редактор и новое ядро.
// Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ROOM_TEXT } from '../pet/core/editor.mjs';
import { arrange, HOME, nudge, roomItems, STEP } from '../pet/core/room.mjs';
import { DAY, host, LEGACY_DISPLAY, life, manual } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };
const saved = (L, key, extra = {}) => L.core.notify('saved', { key, counted: true, ...extra });
function editor(initial = { cat: CAT }, parts = {}) {
  const L = life(initial, { counts: host(1, 1), display: LEGACY_DISPLAY, ...parts });
  assert.equal(L.core.start().ok, true);
  assert.equal(L.core.open('corner').ok, true);
  assert.equal(L.core.open('room').ok, true);
  return L;
}
const draft = (L) => L.state().room.draft;
const told = (L) => L.effects('announce').map((effect) => effect.text);
const roomWrites = (L) => L.store.writes.filter((key) => key === L.keys.room).length;

test('редактор: черновик из сохраняемой расстановки; команды — только в открытом редакторе; аргументы и предметы ступени', () => {
  const C = life({ cat: CAT }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  C.core.start();
  for (const call of [() => C.core.room.select('rest'), () => C.core.room.nudge('left'), () => C.core.room.save(), () => C.core.room.cancel(), () => C.core.room.reset(), () => C.core.room.drag('rest', [1, 1]), () => C.core.room.drop(), () => C.core.room.dragCancel(), () => C.core.room.move('rest', [1, 1])]) assert.equal(call().error.code, 'not-open');
  const L = editor({ cat: CAT, room: { v: 1, cat: { yarn: { x: 60, y: 230 } } } });
  const d = draft(L);
  assert.deepEqual(d, { pos: { rest: HOME.rest, bowl: HOME.bowl, yarn: [60, 230] }, pick: 'rest', changed: [], other: false, failed: false, saving: false, drag: null, can: ['left', 'right', 'up', 'down'] });
  assert.deepEqual(L.state().room.pos, d.pos, 'сохраняемая расстановка — та же');
  assert.equal(Object.isFrozen(d.pos.rest), true);
  for (const [call, code] of [
    [() => L.core.room.select('rope'), 'unknown-id'],
    [() => L.core.room.select(5), 'invalid-argument'],
    [() => L.core.room.drag('ball', [1, 1]), 'unknown-id'],
    [() => L.core.room.drag('bowl', [1]), 'invalid-argument'],
    [() => L.core.room.move('bowl', 'там'), 'invalid-argument'],
    [() => L.core.room.nudge('north'), 'invalid-argument'],
  ]) {
    const before = L.state();
    assert.deepEqual([call().error.code, L.state() === before], [code, true]);
  }
  assert.deepEqual([L.core.room.select('rest').changed, L.core.room.drop().changed, L.core.room.dragCancel().changed], [false, false, false], 'то же и без переноса — ничего');
  // Собака: канат, на «Нашем ритуале» — мячик.
  const D = editor({ cat: { ...CAT, seenStage: 2 }, companion: { v: 1, kind: 'dog' } }, { counts: host(9, 1) });
  assert.deepEqual(Object.keys(draft(D).pos), roomItems('dog', 2));
});

test('§ 6.8 отмена одного переноса при изменённом черновике: dragCancel сохраняет клубок; save при переносе — только клубок; cancel — всё', () => {
  const A = [60, 230];
  for (const variant of ['dragCancel, затем save', 'save при идущем переносе', 'dragCancel, затем Esc — cancel']) {
    const L = editor({ cat: CAT, room: { v: 1, cat: { yarn: { x: A[0], y: A[1] } } } });
    const H = draft(L).pos.bowl;
    assert.equal(L.core.room.select('yarn').changed, true);
    assert.equal(L.core.room.nudge('right').changed, true);
    const B = [A[0] + STEP, A[1]];
    assert.deepEqual([draft(L).pos.yarn, draft(L).changed, told(L).at(-1)], [B, ['yarn'], 'Клубок правее.']);
    L.core.room.drag('bowl', [H[0] + 40, H[1] + 10]);
    const first = draft(L);
    assert.deepEqual([first.drag.id, first.drag.from, first.pick, first.pos.bowl, told(L).at(-1)], ['bowl', H, 'bowl', H, 'Выбрано: миска.'], 'первый drag — перенос и выбор, черновик прежний');
    L.core.room.drag('bowl', [H[0] + 80, H[1] + 20]);
    assert.notDeepEqual(draft(L).drag.at, first.drag.at, 'следующий — двигает');
    assert.deepEqual([L.core.room.select('rest').changed, L.core.room.nudge('left').changed, draft(L).pick], [false, false, 'bowl'], 'во время переноса select и nudge — ничего');
    if (variant !== 'save при идущем переносе') {
      const before = told(L).length;
      assert.equal(L.core.room.dragCancel().changed, true);
      assert.deepEqual([draft(L).drag, draft(L).pos.yarn, draft(L).pos.bowl, draft(L).changed, L.state().view.open, told(L).length], [null, B, H, ['yarn'], 'room', before], 'dragCancel: черновик прежний, редактор открыт, без объявления');
    }
    if (variant === 'dragCancel, затем Esc — cancel') {
      const result = L.core.room.cancel();
      assert.deepEqual([result.ok, result.text, L.state().view.open, L.state().room.draft, L.state().room.pos.yarn, roomWrites(L), told(L).at(-1)], [true, ROOM_TEXT.cancelled, 'corner', null, A, 0, 'Отменено: расстановка прежняя.']);
      continue;
    }
    const result = L.core.room.save();
    assert.deepEqual([result.ok, result.closed, result.save.status, result.text, L.state().view.open, L.state().room.draft], [true, true, 'saved', ROOM_TEXT.saved, 'corner', null], variant);
    assert.deepEqual(L.json('room'), { v: 1, cat: { yarn: { x: B[0], y: B[1] } } }, `${variant}: в room — клубок B, перенос миски не дописан`);
    assert.deepEqual([L.state().room.pos.yarn, L.state().room.pos.bowl, told(L).at(-1)], [B, H, 'Расстановка сохранена.']);
  }
});

test('перенос: drop переносит место в черновик (объявление — если место изменилось), другой предмет отменяет прежний перенос, move — drag + drop', () => {
  const L = editor();
  const pos = draft(L).pos;
  L.core.room.drag('bowl', pos.bowl);
  assert.deepEqual([L.core.room.drop().changed, draft(L).changed, told(L).filter((text) => text.includes('на новом месте')).length], [true, [], 0], 'отпустили на том же месте — без объявления');
  L.core.room.drag('yarn', pos.yarn);
  L.core.room.drag('yarn', [120, 235]);
  L.core.room.drag('bowl', pos.bowl);
  assert.deepEqual([draft(L).drag.id, draft(L).pos.yarn, draft(L).pick], ['bowl', pos.yarn, 'bowl'], 'перенос клубка отменён, начат перенос миски');
  L.core.room.drag('bowl', [320, 230]);
  L.core.room.drop();
  assert.deepEqual([draft(L).pos.bowl, draft(L).changed, told(L).at(-1)], [[320, 230], ['bowl'], 'Миска на новом месте.']);
  const moved = L.core.room.move('yarn', [250, 234]);
  assert.deepEqual([moved.changed, draft(L).pick, draft(L).pos.yarn, draft(L).changed, told(L).at(-1)], [true, 'yarn', [250, 234], ['bowl', 'yarn'], 'Клубок на новом месте.']);
  // Недопустимое место — ближайшее допустимое (правило ядра, как у шага кнопками).
  L.core.room.move('bowl', [200, 120]);
  assert.ok(draft(L).pos.bowl[1] >= 176 + 13 - 0.01, 'миска — на полу, не на стене');
});

test('шаг кнопками: STEP, у преграды — сколько можно; некуда — changed: false и объявление упора; can — куда можно', () => {
  const L = editor({ cat: { ...CAT, seenStage: 3 } }, { counts: host(18, 1) });
  assert.equal(draft(L).can.includes('up'), false, 'лежанка у стены — выше нельзя');
  const r = L.core.room.nudge('up');
  assert.deepEqual([r.ok, r.changed, told(L).at(-1)], [true, false, 'Лежанка: дальше выше нельзя.']);
  L.core.room.select('bowl');
  const before = draft(L).pos.bowl;
  L.core.room.nudge('down');
  const layout = { kind: 'cat', stage: 3, pos: { ...draft(L).pos, bowl: before } };
  assert.deepEqual([draft(L).pos.bowl, told(L).at(-1)], [nudge(layout, 'bowl', 'down'), 'Миска ниже.']);
});

test('«Вернуть обычную расстановку» — в черновик, перенос отменён; постоянная — после save; пустое save и close — без записи', () => {
  const L = editor({ cat: CAT, room: { v: 1, cat: { bowl: { x: 300, y: 230 }, yarn: { x: 60, y: 230 } } } });
  L.core.room.drag('bowl', draft(L).pos.bowl);
  L.core.room.reset();
  assert.deepEqual([draft(L).drag, draft(L).pos, draft(L).changed, told(L).at(-1), roomWrites(L)], [null, arrange('cat', 0, {}).pos, ['bowl', 'yarn'], ROOM_TEXT.reset, 0]);
  L.core.room.save();
  assert.deepEqual([L.json('room'), L.state().room.pos], [{ v: 1, cat: {} }, arrange('cat', 0, {}).pos], 'обычная расстановка записана — точек нет');
  L.core.open('room');
  const same = L.core.room.save();
  assert.deepEqual([same.closed, same.save.status, same.text, roomWrites(L), told(L).at(-1)], [true, 'none', ROOM_TEXT.same, 1, 'Расстановка не изменилась.'], 'без изменений — выход без записи');
  L.core.open('room');
  L.core.room.move('yarn', [250, 234]);
  const announced = told(L).length;
  L.core.close();
  assert.deepEqual([L.state().view.open, L.state().room.draft, L.state().room.pos.yarn, roomWrites(L), told(L).length], [null, null, HOME.yarn, 1, announced], 'close — черновик отброшен без объявления');
});

test('новая ступень при открытом редакторе: перенос отменён, черновик пересчитан (лежанка, мячик), сделанное остаётся; записи и отметки нет', () => {
  const counts = host(8, 1);
  const L = editor({ cat: { ...CAT, seenStage: 1 }, companion: { v: 1, kind: 'dog' } }, { counts });
  L.core.room.move('rope', [300, 238]);
  L.core.room.drag('bowl', draft(L).pos.bowl);
  L.core.room.drag('bowl', [260, 230]);
  counts.set(9, 2);
  const result = saved(L, 'stage');
  const d = draft(L);
  assert.deepEqual([result.celebrate, d.drag, d.pos.rope, Object.keys(d.pos), d.pos.bowl, L.state().progress.stage], [null, null, [300, 238], roomItems('dog', 2), HOME.bowl, 2], 'новая ступень: мячик добавлен, перенос миски отменён, канат на месте');
  assert.deepEqual([roomWrites(L), L.json('cat').seenStage, L.state().view.open], [0, 1, 'room'], 'в редакторе не пишется и не отмечается');
  counts.set(18, 3);
  saved(L, 'bed');
  assert.deepEqual([draft(L).pos.rest, draft(L).pos.rope], [arrange('dog', 3, {}).pos.rest, [300, 238]], 'подушка → лежанка, без записи');
  const out = L.core.room.cancel();
  assert.deepEqual([out.fresh.length > 0, L.json('cat').seenStage, roomWrites(L)], [true, 3, 0], 'выход в уголок — ступень увидена');
});

test('чужая расстановка: постоянная часть — тихо, черновик не затирается, other и одно объявление; save пишет только передвинутые здесь', () => {
  const L = editor({ cat: CAT, room: { v: 1, cat: { yarn: { x: 60, y: 230 } } } });
  L.core.room.move('bowl', [300, 230]);
  // Другая вкладка: кот — подушка и клубок, собака — канат.
  L.put('room', { v: 1, cat: { rest: { x: 150, y: 210 }, yarn: { x: 120, y: 235 } }, dog: { rope: { x: 330, y: 240 } } });
  L.events.fire(L.keys.room);
  const d = draft(L);
  assert.deepEqual([d.other, d.pos.bowl, d.pos.rest, d.pos.yarn, L.state().room.pos.rest, told(L).at(-1)], [true, [300, 230], HOME.rest, [60, 230], [150, 210], 'В другой вкладке сохранена новая расстановка. Здесь останутся твои изменения.']);
  assert.deepEqual(d.changed, ['rest', 'bowl', 'yarn'], '«Не сохранено» — относительно новой сохранённой');
  L.put('room', { ...L.json('room'), cat: { ...L.json('room').cat, rest: { x: 160, y: 210 } } });
  L.events.fire(L.keys.room);
  assert.equal(told(L).filter((text) => text.startsWith('В другой вкладке')).length, 1, 'объявление — одно');
  L.core.room.save();
  assert.deepEqual(L.json('room'), { v: 1, cat: { rest: { x: 160, y: 210 }, yarn: { x: 120, y: 235 }, bowl: { x: 300, y: 230 } }, dog: { rope: { x: 330, y: 240 } } }, 'записана только миска: подушка и клубок другой вкладки и собака целы');
  // Чужая запись другого животного — не отметка.
  L.core.open('room');
  L.put('room', { ...L.json('room'), dog: { rope: { x: 40, y: 233 } } });
  L.events.fire(L.keys.room);
  assert.equal(draft(L).other, false, 'расстановка этого питомца та же');
  // Сверка перед решением: запись без события storage находится save.
  L.core.room.move('yarn', [250, 234]);
  L.put('room', { ...L.json('room'), cat: { ...L.json('room').cat, rest: { x: 250, y: 212 } } });
  L.core.room.save();
  assert.deepEqual([L.json('room').cat.rest, L.json('room').cat.yarn], [{ x: 250, y: 212 }, { x: 250, y: 234 }], 'свежее — перед решением, своё — поверх');
});

test('запись: только передвинутые предметы; неизвестные точки, поля точек, предметы, животные и больший v сохраняются', () => {
  const stored = { v: 3, theme: 'night', cat: { rest: { x: 150, y: 210, tilt: 3 }, bowl: { x: 'край', y: 230, mark: 'b' }, yarn: { x: 60, y: 230, glow: { on: true } }, sofa: { x: 1, y: 2 } }, 'example.bunny': { carrot: { x: 5, y: 6 } } };
  const L = editor({ cat: CAT, room: stored });
  L.core.room.select('yarn');
  L.core.room.nudge('right');
  L.core.room.save();
  const out = L.json('room');
  assert.deepEqual(out, { ...stored, cat: { ...stored.cat, yarn: { x: 70, y: 230, glow: { on: true } } } }, 'только x, y клубка; остальное как было');
  // Повторное подключение: ничего не пишется, расстановка та же.
  const next = life({}, { storage: L.storage, counts: host(1, 1), display: LEGACY_DISPLAY });
  next.core.start();
  assert.deepEqual([next.state().room.pos.yarn, roomWrites(L)], [[70, 230], 1]);
  // Обычная расстановка: у точек сняты только координаты, непонятная миска не тронута.
  next.core.open('room');
  next.core.room.reset();
  next.core.room.save();
  const reset = L.json('room');
  assert.deepEqual([reset.cat.rest, reset.cat.yarn, reset.cat.bowl, reset.cat.sofa, reset['example.bunny'], reset.v, reset.theme], [{ tilt: 3 }, { glow: { on: true } }, stored.cat.bowl, stored.cat.sofa, stored['example.bunny'], 3, 'night']);
});

test('синхронный отказ записи: редактор открыт, черновик цел, failed и сообщение; поля несохранённые; без скрытых повторов; следующая правка уносит', () => {
  const L = editor({ cat: CAT, room: { v: 1, cat: { yarn: { x: 60, y: 230 } } } });
  L.store.denySet = /room/;
  L.core.room.select('yarn');
  L.core.room.nudge('right');
  const result = L.core.room.save();
  assert.deepEqual([result.ok, result.closed, result.save.status, result.text, L.state().view.open], [true, false, 'failed', 'Не удалось сохранить расстановку. Попробуй ещё раз.', 'room']);
  const d = draft(L);
  assert.deepEqual([d.failed, d.pos.yarn, d.changed, told(L).at(-1)], [true, [70, 230], ['yarn'], 'Не удалось сохранить расстановку. Попробуй ещё раз.'], 'черновик цел, «Не сохранено» честно');
  assert.deepEqual([L.state().save.room.status, L.state().save.room.unsaved, L.state().room.pos.yarn], ['failed', ['cat.yarn'], [70, 230]], 'память ключа: несохранённое действует до перезагрузки');
  const writes = L.store.writes.length;
  L.plan.advance(60_000);
  assert.equal(L.store.writes.length, writes, 'скрытых повторов нет');
  // Отмена — честно: несохранённая расстановка действует до перезагрузки.
  assert.equal(L.core.room.cancel().text, ROOM_TEXT.kept);
  // Снова редактор: несохранённое — «Не сохранено», save его уносит.
  L.store.denySet = null;
  L.core.open('room');
  assert.deepEqual(draft(L).changed, ['yarn']);
  assert.equal(L.core.room.save().save.status, 'saved');
  assert.deepEqual([L.json('room').cat.yarn, L.state().save.room.status], [{ x: 70, y: 230 }, 'saved']);
  // Отказ загрузки хранилища — ни одной записи, failed, unavailable.
  const off = life({}, { counts: host(1, 1), display: LEGACY_DISPLAY });
  off.store.denyGet = /./;
  assert.equal(off.storage.load(), 'failed');
  const O = life({}, { storage: off.storage, counts: host(1, 1), display: LEGACY_DISPLAY });
  O.core.start();
  O.core.open('room');
  O.core.room.move('yarn', [250, 234]);
  assert.deepEqual([O.core.room.save().closed, O.state().save.room.status, off.store.writes.length], [false, 'unavailable', 0]);
});

test('асинхронно: выход сразу, pending, поздний успех и отказ — объявления; поздний исход не трогает новый редактор и новое ядро', async () => {
  const store = manual();
  assert.equal(await store.load(), 'ready');
  const L = life({}, { storage: store.storage, counts: host(1, 1), display: LEGACY_DISPLAY });
  L.core.start();
  await store.drain();
  L.core.open('room');
  L.core.room.move('yarn', [250, 234]);
  const first = L.core.room.save();
  assert.deepEqual([first.closed, first.save.status, first.text, L.state().view.open, L.state().room.pos.yarn, L.state().save.room.status], [true, 'pending', '', 'corner', [250, 234], 'pending'], 'выход сразу, расстановка действует, pending');
  // Новый редактор, пока запись идёт: saving честный.
  L.core.open('room');
  assert.equal(draft(L).saving, true);
  L.core.room.move('bowl', [300, 230]);
  await store.drain();
  assert.equal(await first.save.done, 'saved');
  assert.deepEqual([draft(L).saving, draft(L).pos.bowl, draft(L).other, told(L).at(-1)], [false, [300, 230], false, 'Расстановка сохранена.'], 'поздний успех — объявление; новый редактор цел');
  // Поздний отказ.
  const second = L.core.room.save();
  await store.next('get', 'room');
  await store.next('set', 'room', 'fail');
  assert.deepEqual([await second.save.done, L.state().save.room.unsaved, told(L).at(-1)], ['failed', ['cat.bowl'], ROOM_TEXT.late], 'поздний отказ — объявление, несохранённое');
  // Поздний исход после destroy — только done.
  L.core.open('room');
  L.core.room.move('yarn', [120, 235]);
  const third = L.core.room.save();
  const announced = told(L).length;
  L.core.destroy();
  const next = life({}, { storage: store.storage, counts: host(1, 1), display: LEGACY_DISPLAY });
  next.core.start();
  next.core.open('room');
  await store.drain();
  assert.deepEqual([await third.save.done, told(L).length, next.state().room.draft.other], ['saved', announced, true], 'прежнему — только done; новое ядро поглотило чужую запись');
  assert.equal(next.state().room.pos.yarn[0], 120);
});
