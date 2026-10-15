// Ядро PL04.3 в Node — «Обустроить уголок» (docs/ARCHITECTURE.md § 5.2 room, § 6.4 «Комната», сценарий § 6.8, § 8):
// настоящий экземпляр ядра на синхронном веб-координаторе (подменённое хранилище) и на асинхронном с ручным
// подтверждением. Команды room.* — аргументы, отказы, no-op, changed и объявления; черновик отдельно от переноса; drop,
// dragCancel, смена предмета; сценарий § 6.8 (dragCancel сохраняет клубок, save при переносе пишет только клубок, cancel
// отбрасывает всё); select и nudge при переносе; reset, пустое save, close и cancel; новая ступень при открытом редакторе и
// переносе; чужая расстановка без потери черновика; запись только передвинутых здесь предметов с неизвестными точками,
// полями, животными и большим v; синхронный отказ (несохранённое, честные сообщения, повтор следующей правкой, без скрытых
// повторов); асинхронно — выход сразу, pending, поздний успех и отказ, поздний исход не трогает новый редактор и новое ядро.
// По независимой проверке PL04.3: поздний отказ при снова открытом редакторе — «Сохранить» пишет несохранённый предмет (и
// после «Вернуть обычную расстановку» — место черновика, а не прежнее несохранённое), не трогая нетронутое другой вкладки;
// ID предмета — только свой (унаследованные constructor, toString, __proto__ — unknown-id без порчи черновика); точка —
// ровно два конечных числа (разреженный массив — invalid-argument, а не NaN и запись null). Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ROOM_TEXT } from '../pet/core/editor.mjs';
import { arrange, HOME, nudge, roomItems, STEP } from './legacy-room.mjs';
import { badPoints, DAY, host, LEGACY_DISPLAY, life, manual } from './core-kit.mjs';

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

// Асинхронный координатор: клубок передвинут, «Сохранить» — pending (выход в уголок), редактор снова открыт, пока запись
// идёт: несохранённого ещё нет, клубок — из памяти ключа.
async function pendingAgain(initial = { cat: CAT }) {
  const store = manual(initial);
  assert.equal(await store.load(), 'ready');
  const L = life({}, { storage: store.storage, counts: host(1, 1), display: LEGACY_DISPLAY });
  L.core.start();
  await store.drain();
  L.core.open('room');
  L.core.room.move('yarn', [250, 234]);
  const first = L.core.room.save();
  assert.deepEqual([first.save.status, L.state().view.open], ['pending', 'corner']);
  assert.equal(L.core.open('room').ok, true);
  assert.deepEqual([draft(L).saving, draft(L).changed, draft(L).pos.yarn, L.state().save.room.unsaved], [true, [], [250, 234], []]);
  return { store, L, first };
}
async function lateFail(store, first) {
  await store.next('get', 'room');
  await store.next('set', 'room', 'fail');
  assert.equal(await first.save.done, 'failed');
}

test('поздний отказ при снова открытом редакторе: «Сохранить» ставит несохранённый клубок — честный pending, затем saved; повторов нет; destroy — только done', async () => {
  for (const end of ['доставка', 'destroy']) {
    const { store, L, first } = await pendingAgain();
    await lateFail(store, first);
    assert.deepEqual([draft(L).changed, L.state().save.room.status, L.state().save.room.unsaved, store.waiting.length, told(L).at(-1)], [['yarn'], 'failed', ['cat.yarn'], 0, ROOM_TEXT.late], 'отказ: «Не сохранено», несохранённое, без скрытого повтора');
    const retry = L.core.room.save();
    assert.deepEqual([retry.ok, retry.closed, retry.text, retry.save.status, retry.save.keys, L.state().view.open, L.state().save.room.status, L.state().room.pos.yarn], [true, true, '', 'pending', ['room'], 'corner', 'pending', [250, 234]], `${end}: явное «Сохранить» — операция room, выход сразу`);
    if (end === 'destroy') {
      const announced = told(L).length;
      L.core.destroy();
      await store.drain();
      assert.deepEqual([await retry.save.done, told(L).length, store.json('room')], ['saved', announced, { v: 1, cat: { yarn: { x: 250, y: 234 } } }], 'после destroy — только done; запись выполнена');
      continue;
    }
    await store.drain();
    assert.deepEqual([await retry.save.done, store.json('room'), L.state().save.room, told(L).at(-1)], ['saved', { v: 1, cat: { yarn: { x: 250, y: 234 } } }, { status: 'saved', pending: [], unsaved: [], corrupt: false }, ROOM_TEXT.saved]);
    L.core.destroy();
  }
});

test('поздний отказ при снова открытом редакторе и правке другого предмета: пишутся клубок и миска; миска возвращена на место — клубок всё равно', async () => {
  for (const variant of ['миска передвинута', 'миска возвращена на место']) {
    const { store, L, first } = await pendingAgain();
    const H = draft(L).pos.bowl;
    L.core.room.move('bowl', [300, 230]);
    if (variant === 'миска возвращена на место') L.core.room.move('bowl', H);
    await lateFail(store, first);
    const retry = L.core.room.save();
    assert.equal(retry.save.status, 'pending', variant);
    await store.drain();
    const cat = variant === 'миска передвинута' ? { yarn: { x: 250, y: 234 }, bowl: { x: 300, y: 230 } } : { yarn: { x: 250, y: 234 } };
    assert.deepEqual([await retry.save.done, store.json('room'), L.state().save.room.unsaved, store.waiting.length], ['saved', { v: 1, cat }, [], 0], variant);
    L.core.destroy();
  }
});

test('поздний успех при снова открытом редакторе: «Сохранить» без правок — выход без лишней записи', async () => {
  const { store, L, first } = await pendingAgain();
  await store.drain();
  assert.equal(await first.save.done, 'saved');
  assert.deepEqual([draft(L).changed, draft(L).saving, L.state().save.room.unsaved], [[], false, []]);
  const same = L.core.room.save();
  assert.deepEqual([same.save.status, same.closed, same.text, store.waiting.length, told(L).at(-1)], ['none', true, ROOM_TEXT.same, 0, ROOM_TEXT.same]);
  L.core.destroy();
});

test('поздний отказ и чужая расстановка: «Сохранить» пишет только свой несохранённый клубок — подушка другой вкладки, миска, собака, неизвестное и больший v целы', async () => {
  const stored = { v: 3, theme: 'night', cat: { rest: { x: 150, y: 210, tilt: 3 }, bowl: { x: 300, y: 230, keep: 'unknown' } }, dog: { rope: { x: 330, y: 240 } }, 'example.bunny': { carrot: { x: 5, y: 6 } } };
  const { store, L, first } = await pendingAgain({ cat: CAT, room: stored });
  // Другая вкладка — до чтения операции: подушка кота и канат собаки (свежее чтение участка — чужое, § 8.3, шаг 4а).
  const other = { ...stored, cat: { ...stored.cat, rest: { x: 160, y: 210, tilt: 3 } }, dog: { rope: { x: 40, y: 233 } } };
  store.data.set('room', JSON.stringify(other));
  await lateFail(store, first);
  const d = draft(L);
  assert.deepEqual([d.other, d.pos.rest, d.changed, L.state().save.room.unsaved], [true, [150, 210], ['rest', 'yarn'], ['cat.yarn']], 'черновик не затёрт, other; несохранённый — только клубок');
  const retry = L.core.room.save();
  assert.equal(retry.save.status, 'pending');
  await store.drain();
  assert.deepEqual([await retry.save.done, store.json('room')], ['saved', { ...other, cat: { ...other.cat, yarn: { x: 250, y: 234 } } }], 'только клубок: подушка другой вкладки, миска, собака, неизвестное и v 3 — как были');
  L.core.destroy();
});

test('после отказа записи «Вернуть обычную расстановку» или клубок на прежнее место — «Сохранить» пишет место черновика, а не прежнее несохранённое', () => {
  for (const variant of ['reset', 'клубок на прежнее место']) {
    const L = editor({ cat: CAT, room: { v: 1, cat: { bowl: { x: 300, y: 230 } } } });
    L.store.denySet = /room/;
    L.core.room.move('yarn', [120, 234]);
    assert.equal(L.core.room.save().save.status, 'failed');
    assert.equal(L.core.room.cancel().text, ROOM_TEXT.kept);
    L.store.denySet = null;
    L.core.open('room');
    assert.deepEqual([draft(L).pos.yarn, draft(L).changed, L.state().room.pos.yarn], [[120, 234], ['yarn'], [120, 234]]);
    if (variant === 'reset') L.core.room.reset();
    else L.core.room.move('yarn', HOME.yarn);
    const r = L.core.room.save();
    const cat = variant === 'reset' ? {} : { bowl: { x: 300, y: 230 } };
    assert.deepEqual([r.save.status, r.closed, r.text, L.json('room'), L.state().save.room.unsaved, L.state().room.pos.yarn, L.state().room.pos.bowl], ['saved', true, ROOM_TEXT.saved, { v: 1, cat }, [], HOME.yarn, variant === 'reset' ? HOME.bowl : [300, 230]], `${variant}: уголок — как в черновике`);
  }
});

test('ID предмета — только свой предмет черновика: унаследованные имена — unknown-id без изменений; дальше обычные команды работают', () => {
  const calls = { select: (L, id) => L.core.room.select(id), move: (L, id) => L.core.room.move(id, [300, 230]), drag: (L, id) => L.core.room.drag(id, [300, 230]) };
  let round = 0;
  for (const [method, call] of Object.entries(calls)) {
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      for (const dragging of [false, true]) {
        const label = `${method}('${id}')${dragging ? ' при переносе' : ''}`;
        const L = editor({ cat: CAT, room: { v: 1, cat: { yarn: { x: 60, y: 230 } } } });
        L.core.room.select('yarn');
        L.core.room.nudge('right');
        if (dragging) L.core.room.drag('bowl', [260, 230]);
        const before = L.state();
        const updates = L.seen.length;
        const r = call(L, id);
        assert.deepEqual([r.ok, r.error?.code, L.state() === before, L.seen.length, roomWrites(L)], [false, 'unknown-id', true, updates, 0], `${label}: отказ до изменения — снимок, черновик и перенос прежние, без обновления и записи`);
        if (dragging) assert.equal(L.core.room.dragCancel().changed, true, label);
        assert.deepEqual([L.core.room.select('rest').changed, L.core.room.select('bowl').changed, L.core.room.nudge('left').changed, draft(L).pick], [true, true, true, 'bowl'], `${label}: select и nudge работают`);
        const bowl = draft(L).pos.bowl;
        if (round++ % 2) {
          assert.deepEqual([L.core.room.cancel().text, L.state().room.pos.yarn, roomWrites(L)], [ROOM_TEXT.cancelled, [60, 230], 0], `${label}: cancel`);
        } else {
          const saved = L.core.room.save();
          assert.deepEqual([saved.save.status, L.json('room')], ['saved', { v: 1, cat: { yarn: { x: 70, y: 230 }, bowl: { x: bowl[0], y: bowl[1] } } }], `${label}: save`);
        }
      }
    }
  }
  // Контроли: обычный неизвестный, предмет собаки, предмет другой ступени, не строка; свои предметы — работают.
  const L = editor();
  for (const [id, code] of [['future-item', 'unknown-id'], ['rope', 'unknown-id'], ['ball', 'unknown-id'], [5, 'invalid-argument'], [null, 'invalid-argument']]) {
    for (const [method, call] of Object.entries(calls)) assert.equal(call(L, id).error.code, code, `${method}(${id})`);
  }
  for (const id of ['rest', 'bowl', 'yarn']) assert.equal(L.core.room.select(id).ok, true, id);
});

test('точка — ровно два конечных числа: разреженные, неконечные, неверной длины — invalid-argument до изменения; перенос и данные целы; save не пишет null', () => {
  const stored = { v: 3, cat: { bowl: { x: 300, y: 230, keep: 'unknown' } } };
  // Сценарий проверки: move('bowl', new Array(2)), затем save — без изменений и записи.
  const S = editor({ cat: CAT, room: stored });
  const refused = S.core.room.move('bowl', new Array(2));
  assert.deepEqual([refused.ok, refused.error?.code, S.state().room.draft.pos.bowl], [false, 'invalid-argument', [300, 230]]);
  const same = S.core.room.save();
  assert.deepEqual([same.save.status, same.text, S.json('room'), roomWrites(S)], ['none', ROOM_TEXT.same, stored, 0]);
  // Каждая неверная точка в move и drag: ни черновик, ни идущий перенос не меняются.
  const L = editor({ cat: CAT, room: stored });
  L.core.room.move('yarn', [120, 234]);
  L.core.room.drag('bowl', [310, 228]);
  const before = L.state();
  const updates = L.seen.length;
  for (const [label, bad] of badPoints()) {
    for (const method of ['move', 'drag']) {
      const r = L.core.room[method]('bowl', bad);
      assert.deepEqual([r.ok, r.error?.code, L.state() === before, L.seen.length, roomWrites(L)], [false, 'invalid-argument', true, updates, 0], `${method}(bowl, ${label})`);
    }
  }
  assert.deepEqual([draft(L).drag.id, draft(L).pos.bowl, draft(L).pos.yarn], ['bowl', [300, 230], [120, 234]], 'идущий перенос и черновик — прежние');
  // После отказов — обычное сохранение: без null и NaN, прежние координаты и неизвестное поле миски целы.
  assert.equal(L.core.room.dragCancel().changed, true);
  assert.equal(L.core.room.save().save.status, 'saved');
  assert.deepEqual(L.json('room'), { v: 3, cat: { bowl: { x: 300, y: 230, keep: 'unknown' }, yarn: { x: 120, y: 234 } } });
  // Конечные точки — работают (контроль).
  L.core.open('room');
  assert.deepEqual([L.core.room.drag('bowl', [320, 232]).ok, L.core.room.drop().ok, L.core.room.move('yarn', [140, 234]).ok], [true, true, true]);
  assert.equal(L.core.room.save().save.status, 'saved');
  const out = L.json('room');
  assert.deepEqual([out.v, out.cat.bowl.keep, [out.cat.bowl.x, out.cat.bowl.y].every(Number.isFinite), out.cat.yarn, L.raw('room').includes('null')], [3, 'unknown', true, { x: 140, y: 234 }, false]);
});
