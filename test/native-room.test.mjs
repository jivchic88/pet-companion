// «Обустроить уголок» на нативе PL10.2.3 (README, «Нативное отображение»; docs/ARCHITECTURE.md § 6.4, § 6.8, § 12.2): PetRoom
// внутри PetProvider вместе с PetCorner в настоящем React 19 — react-native и react-native-svg подменены загрузчиком
// (test/fakes/react-native.mjs), ядро — публичный createPetCore на асинхронном хранилище с ручными часами. Ввод — кнопки и
// обработчики ответчика сцены с событиями формы React Native (identifier, locationX/Y, touches, changedTouches); точки — из
// мест черновика и hitBox ядра по масштабу сцены, который дал onLayout окна. Проверяется контракт: вид 'room' объявлен
// только с PetRoom, кнопка уголка и окно по view снимка (iOS — после onDismiss уголка), выбор и шаги — команды ядра, упор,
// перенос пальцем (порог, точка захвата, отпускание, касание без сдвига), «Сохранить» с записью и холодным перезапуском,
// «Отмена» и Android «Назад», отказ записи (окно открыто, черновик цел), перенос снимают фон, поворот и смена питомца —
// черновик не записывается. Это Node и подделки — не React Native и не устройство.
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import test from 'node:test';
import { calendar, host as counter, journal, planner, reserver } from './core-kit.mjs';
import { nodeRoot, system } from './native-kit.mjs';

const rn = system();
globalThis.__petRN = rn;
const FAKES = { 'react-native': new URL('./fakes/react-native.mjs', import.meta.url).href, 'react-native-svg': new URL('./fakes/react-native-svg.mjs', import.meta.url).href };
registerHooks({ resolve: (specifier, context, next) => (Object.hasOwn(FAKES, specifier) ? { url: FAKES[specifier], shortCircuit: true } : next(specifier, context)) });
const Native = await import('../pet/native.mjs');
const { createPetCore, createStorage } = await import('../pet/core.mjs');
const { cat, dog } = await import('../pet/pets.mjs');
const { calm } = await import('../pet/behaviors.mjs');
const { hitBox, roomModel } = await import('../pet/core/room.mjs');
const { MOVE_PT } = await import('../pet/native/gesture.mjs');
const { Screen, screen } = await import('./fakes/expo-screen.mjs');
const require = createRequire(import.meta.url);
const React = require('react');

const { PetCorner, PetProvider, PetRoom, catNative, dogNative } = Native;
const h = React.createElement;
const COMMANDS = ['getState', 'setDisplay', 'activity', 'open', 'close', 'setPet', 'setPreferences'];

async function lab({ data = new Map(), failRoom = null } = {}) {
  const storage = createStorage({
    backend: {
      async: true,
      get: async (key) => data.get(key) ?? null,
      set: async (key, value) => {
        if (failRoom?.on && key.includes('room')) throw new Error('диск полон');
        data.set(key, value);
      },
    },
  });
  assert.equal(await storage.load(), 'ready');
  const time = calendar();
  const core = createPetCore({ storage, pets: [cat, dog], behaviors: [calm], progress: counter(0, 0).progress, clock: time.port, scheduler: planner(time).port, log: journal().port, scenes: reserver().port });
  const list = [];
  const spy = { get status() { return core.status; }, subscribe: (listener, options) => core.subscribe(listener, options) };
  for (const name of COMMANDS) spy[name] = (...args) => (name !== 'getState' && list.push([name, ...args]), core[name](...args));
  spy.room = Object.fromEntries(Object.keys(core.room).map((name) => [name, (...args) => (list.push([`room.${name}`, ...args]), core.room[name](...args))]));
  return { core, spy, data, list, names: () => list.map(([name]) => name) };
}

const roots = [];
test.afterEach(async () => {
  for (const R of roots.splice(0)) await R.unmount();
  rn.platform = 'ios';
  rn.AppState.currentState = 'active';
});
const turn = () => new Promise((resolve) => setTimeout(resolve, 5));
function mount(name, tree) {
  const R = nodeRoot();
  roots.push(R);
  const own = screen(name);
  const node = (id) => own.nodes.get(id)?.props ?? null;
  return { act: R.act, render: (next = tree) => R.render(h(Screen.Provider, { value: name }, next)), node, has: (id) => own.nodes.has(id), press: (id) => R.act(() => node(id).onPress()), fire: (id, prop, ...args) => R.act(() => node(id)[prop](...args)), text: (id) => String(node(id)?.children ?? '') };
}
const layout = (width, height) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
const tree = (L, { room = true } = {}) => h(PetProvider, { core: L.spy, pets: [cat, dog], kits: [catNative, dogNative] }, h(PetCorner, null), room ? h(PetRoom, null) : null);
const touch = (id, [x, y], phase = {}) => ({ nativeEvent: { identifier: id, locationX: x, locationY: y, timestamp: Date.now(), touches: phase.end ? [] : [{ identifier: id, locationX: x, locationY: y }], changedTouches: [{ identifier: id, locationX: x, locationY: y }] } });

// Окно редактора: уголок → «Обустроить уголок» → iOS: окно уголка ушло → окно редактора; раскладка 390×844 (сцена 358 точек).
async function openRoom(V, L) {
  await L.core.storage?.load?.();
  await V.act(() => L.spy.open('corner'));
  await V.press('corner-arrange');
  assert.equal(L.core.getState().view.open, 'room');
  await V.fire('corner-modal', 'onDismiss');
  assert.equal(V.node('room-modal').visible, true);
  await V.fire('room-sheet', 'onLayout', layout(390, 844));
  return 358 / 400;
}
// Центр области предмета id (точки сцены) по черновику ядра.
function pointOf(L, id, k) {
  const s = L.core.getState();
  const model = roomModel(s.pet.shown === 'dog' ? dog : cat);
  const [l, t, r, b] = hitBox({ model, stage: s.progress.stage, pos: s.room.draft.pos }, id);
  return [((l + r) / 2) * k, ((t + b) / 2) * k];
}

test('вид room объявлен только с PetRoom; кнопка «Обустроить уголок» уголка — по объявлению; окно — по view снимка, по очереди с уголком (iOS — после onDismiss)', async () => {
  const L = await lab();
  const V = mount('room-declare', tree(L, { room: false }));
  await V.render();
  await turn();
  assert.deepEqual(L.core.getState().display.views, ['corner']);
  await V.act(() => L.spy.open('corner'));
  assert.equal(V.has('corner-arrange'), false, 'без PetRoom кнопки нет');
  await V.render(tree(L));
  await turn();
  assert.deepEqual(L.core.getState().display.views, ['corner', 'room']);
  await V.press('corner-arrange');
  assert.equal(V.node('corner-modal').visible, false);
  assert.equal(V.node('room-modal').visible, false, 'iOS: окно редактора ждёт ухода окна уголка');
  await V.fire('corner-modal', 'onDismiss');
  assert.equal(V.node('room-modal').visible, true);
  await V.fire('room-sheet', 'onLayout', layout(390, 844));
  assert.equal(V.text('room-title'), 'Обустроить уголок');
  assert.equal(V.text('room-state'), 'Изменений нет');
  assert.equal(V.text('room-chosen'), 'Передвинуть: подушка');
  assert.ok(V.has('room-pick-rest') && V.has('room-pick-bowl'));
});

test('кнопки: выбор и шаги — команды ядра, упор (draft.can) — кнопка не командует; «Вернуть обычную»; «Сохранить» пишет ключ room и выходит в уголок; холодный перезапуск — та же расстановка', async () => {
  const L = await lab();
  const V = mount('room-buttons', tree(L));
  await V.render();
  await turn();
  await openRoom(V, L);
  await V.press('room-pick-bowl');
  assert.equal(L.core.getState().room.draft.pick, 'bowl');
  const before = L.core.getState().room.draft.pos.bowl;
  await V.press('room-move-left');
  const after = L.core.getState().room.draft.pos.bowl;
  assert.ok(after[0] < before[0], `${before} → ${after}`);
  assert.match(V.text('room-state'), /^Не сохранено: миска/);
  for (let i = 0; i < 60 && L.core.getState().room.draft.can.includes('left'); i += 1) await V.press('room-move-left');
  assert.equal(L.core.getState().room.draft.can.includes('left'), false);
  assert.equal(V.node('room-move-left').accessibilityState.disabled, true);
  const stuck = L.names().length;
  assert.equal(V.node('room-move-left').onPress, undefined, 'у упора нет обработчика');
  assert.equal(L.names().length, stuck);
  await V.press('room-reset');
  assert.deepEqual(L.core.getState().room.draft.pos.bowl, roomModel(cat).home.bowl.map(Number));
  await V.press('room-move-right');
  const saved = L.core.getState().room.draft.pos.bowl;
  await V.press('room-save');
  await turn();
  assert.equal(L.core.getState().view.open, 'corner');
  assert.deepEqual(L.core.getState().room.pos.bowl, saved);
  assert.ok([...L.data.keys()].some((key) => key.includes('room')), 'ключ room записан');
  const cold = await lab({ data: L.data });
  assert.deepEqual(cold.core.getState().room.pos.bowl, saved, 'после перезапуска — сохранённая расстановка');
});

test('перенос пальцем: нажатие на предмете — room.drag с его места, сдвиг меньше порога — ничего, больше — та же точка захвата, отпускание — room.drop; касание без сдвига — выбор и dragCancel', async () => {
  const L = await lab();
  const V = mount('room-drag', tree(L));
  await V.render();
  await turn();
  const k = await openRoom(V, L);
  const at = pointOf(L, 'bowl', k);
  const from = L.core.getState().room.draft.pos.bowl;
  assert.equal(V.node('room-stage').onStartShouldSetResponder(touch(1, at)), true);
  await V.fire('room-stage', 'onResponderGrant', touch(1, at));
  assert.deepEqual(L.list.at(-1), ['room.drag', 'bowl', from]);
  const count = L.list.length;
  await V.fire('room-stage', 'onResponderMove', touch(1, [at[0] + MOVE_PT / 2, at[1]]));
  assert.equal(L.list.length, count, 'до порога — ничего');
  await V.fire('room-stage', 'onResponderMove', touch(1, [at[0] - 40, at[1]]));
  const [name, id, point] = L.list.at(-1);
  assert.equal(name, 'room.drag');
  assert.equal(id, 'bowl');
  assert.ok(Math.abs(point[0] - (from[0] - 40 / k)) < 1e-9 && point[1] === from[1], `${point}`);
  // Чужой палец ничего не двигает.
  const other = L.list.length;
  await V.fire('room-stage', 'onResponderMove', touch(2, [at[0] - 90, at[1]]));
  assert.equal(L.list.length, other);
  await V.fire('room-stage', 'onResponderRelease', touch(1, [at[0] - 40, at[1]], { end: true }));
  assert.equal(L.list.at(-1)[0], 'room.drop');
  const moved = L.core.getState().room.draft.pos.bowl;
  assert.ok(moved[0] < from[0], `${from} → ${moved}`);
  assert.equal(L.core.getState().room.draft.drag, null);
  // Касание без сдвига — выбор (ядро) и отмена переноса, места прежние.
  const rest = pointOf(L, 'rest', k);
  await V.fire('room-stage', 'onResponderGrant', touch(3, rest));
  await V.fire('room-stage', 'onResponderRelease', touch(3, rest, { end: true }));
  assert.equal(L.list.at(-1)[0], 'room.dragCancel');
  assert.equal(L.core.getState().room.draft.pick, 'rest');
  assert.deepEqual(L.core.getState().room.draft.pos.bowl, moved);
  assert.equal(V.text('room-chosen'), 'Передвинуть: подушка');
  // Мимо предметов — ответчиком сцена не становится.
  assert.equal(V.node('room-stage').onStartShouldSetResponder(touch(4, [2, 2])), false);
});

test('перенос снимают фон, поворот (новая раскладка), смена питомца, ответчик отнят — ядру room.dragCancel; черновик не записывается; кнопки во время переноса не командуют', async () => {
  const L = await lab();
  const V = mount('room-cancel', tree(L));
  await V.render();
  await turn();
  const k = await openRoom(V, L);
  const keys = () => [...L.data.entries()].filter(([key]) => key.includes('room')).map(([key, value]) => `${key}=${value}`).join();
  const stored = keys();
  const drag = async (dx = -30) => {
    const at = pointOf(L, 'bowl', k);
    await V.fire('room-stage', 'onResponderGrant', touch(1, at));
    await V.fire('room-stage', 'onResponderMove', touch(1, [at[0] + dx, at[1]]));
    assert.ok(L.core.getState().room.draft.drag, 'перенос идёт');
  };
  await drag();
  const before = L.list.length;
  await V.press('room-move-up');
  await V.press('room-save');
  assert.equal(L.list.length, before, 'кнопки ждут конца переноса');
  await V.act(() => rn.emit('change', 'background'));
  assert.equal(L.list.at(-1)[0], 'room.dragCancel');
  assert.equal(L.core.getState().room.draft.drag, null);
  await V.act(() => rn.emit('change', 'active'));
  await drag();
  await V.fire('room-sheet', 'onLayout', layout(844, 390));
  assert.equal(L.list.at(-1)[0], 'room.dragCancel', 'поворот — перенос снят');
  await V.fire('room-sheet', 'onLayout', layout(390, 844));
  await drag();
  await V.fire('room-stage', 'onResponderTerminate', touch(1, [0, 0]));
  assert.equal(L.list.at(-1)[0], 'room.dragCancel');
  assert.equal(keys(), stored, 'ничего не записано');
  assert.equal(L.core.getState().view.open, 'room', 'окно открыто, черновик жив');
});

test('«Отмена» и Android «Назад»: идущий перенос — dragCancel, иначе room.cancel — черновик отброшен, уголок; отказ записи — окно открыто, черновик цел, сообщение ядра; повтор после отказа записывает', async () => {
  const fail = { on: false };
  const L = await lab({ failRoom: fail });
  const V = mount('room-back', tree(L));
  await V.render();
  await turn();
  const k = await openRoom(V, L);
  rn.platform = 'android';
  const at = pointOf(L, 'bowl', k);
  await V.fire('room-stage', 'onResponderGrant', touch(1, at));
  await V.fire('room-stage', 'onResponderMove', touch(1, [at[0] - 30, at[1]]));
  await V.fire('room-modal', 'onRequestClose');
  assert.equal(L.list.at(-1)[0], 'room.dragCancel');
  assert.equal(L.core.getState().view.open, 'room');
  // Выбрана миска (её взял отменённый перенос): шаг двигает её в черновике.
  assert.equal(L.core.getState().room.draft.pick, 'bowl');
  await V.press('room-move-right');
  const moved = L.core.getState().room.draft.pos.bowl;
  await V.fire('room-modal', 'onRequestClose');
  assert.equal(L.list.at(-1)[0], 'room.cancel');
  assert.equal(L.core.getState().view.open, 'corner');
  assert.notDeepEqual(L.core.getState().room.pos.bowl, moved, 'черновик отброшен');
  // Отказ записи на асинхронном хранилище (натив): по контракту ядра выход в уголок сразу, расстановка действует в памяти,
  // итог — поздним объявлением; уголок показывает «Не всё сохранилось»; «Обустроить уголок» снова — подушка «Не сохранено»,
  // «Сохранить» записывает её.
  await V.press('corner-arrange');
  await V.press('room-pick-rest');
  await V.press('room-move-right');
  const wanted = L.core.getState().room.draft.pos.rest;
  fail.on = true;
  const heard = [];
  const off = L.core.subscribe(({ effects }) => heard.push(...effects.filter((e) => e.type === 'announce').map((e) => e.text)), { initial: false });
  await V.press('room-save');
  await turn();
  off();
  assert.equal(L.core.getState().view.open, 'corner');
  assert.deepEqual(L.core.getState().room.pos.rest, wanted, 'действует в памяти');
  assert.ok(heard.some((text) => /не сохранилась/.test(text)), heard.join(' | '));
  assert.match(V.text('corner-save'), /Не всё сохранилось/);
  assert.equal([...L.data.keys()].some((key) => key.includes('room')), false, 'на диске нет');
  fail.on = false;
  await V.press('corner-arrange');
  assert.match(V.text('room-state'), /^Не сохранено: подушка/);
  await V.press('room-save');
  await turn();
  assert.equal(L.core.getState().view.open, 'corner');
  const cold = await lab({ data: L.data });
  assert.deepEqual(cold.core.getState().room.pos.rest, wanted, 'после повтора — на диске');
});

test('вне PetProvider — ничего и предупреждение; смена питомца во время переноса — dragCancel и черновик другого питомца', async () => {
  const lone = mount('room-alone', h(PetRoom, null));
  await lone.render();
  assert.equal(lone.has('room-modal'), false);
  const L = await lab();
  const V = mount('room-pet', tree(L));
  await V.render();
  await turn();
  const k = await openRoom(V, L);
  const at = pointOf(L, 'bowl', k);
  await V.fire('room-stage', 'onResponderGrant', touch(1, at));
  await V.fire('room-stage', 'onResponderMove', touch(1, [at[0] - 30, at[1]]));
  await V.act(() => L.spy.setPet('dog'));
  assert.ok(L.names().includes('room.dragCancel') || L.core.getState().room.draft?.drag == null);
  assert.equal(L.core.getState().room.draft?.drag ?? null, null);
});

test('поздние события прежнего касания (по проверке Codex): move и terminate старше начала нового переноса — не ведут и не снимают его', async () => {
  const L = await lab();
  const V = mount('room-late', tree(L));
  await V.render();
  await turn();
  const k = await openRoom(V, L);
  const event = (x, y, t, end = false) => {
    const e = touch(1, [x, y], { end });
    e.nativeEvent.timestamp = t;
    return e;
  };
  const at = pointOf(L, 'bowl', k);
  await V.fire('room-stage', 'onResponderGrant', event(...at, 1000));
  await V.fire('room-stage', 'onResponderMove', event(at[0] - 30, at[1], 1100));
  await V.act(() => rn.emit('change', 'background'));
  await V.act(() => rn.emit('change', 'active'));
  const at2 = pointOf(L, 'bowl', k);
  await V.fire('room-stage', 'onResponderGrant', event(...at2, 2000));
  await V.fire('room-stage', 'onResponderMove', event(at2[0] + 40, at2[1], 2100));
  const before = structuredClone(L.core.getState().room.draft);
  const count = L.list.length;
  await V.fire('room-stage', 'onResponderMove', event(at[0] - 90, at[1], 1150));
  await V.fire('room-stage', 'onResponderTerminate', event(0, 0, 1180));
  assert.equal(L.list.length, count, 'ни одной команды от поздних событий');
  assert.deepEqual(L.core.getState().room.draft, before);
  await V.fire('room-stage', 'onResponderRelease', event(at2[0] + 40, at2[1], 2200, true));
  assert.equal(L.list.at(-1)[0], 'room.drop', 'свой release завершает новый перенос');
});
