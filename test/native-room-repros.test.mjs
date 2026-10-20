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


test('Codex: поздний release старого жеста после inactive/active не завершает новый жест того же пальца', async () => {
 const L=await lab();const V=mount('codex-room-retired',tree(L));await V.render();await turn();const k=await openRoom(V,L);
 const event=(x,y,t,end=false)=>{const e=touch(1,[x,y],{end});e.nativeEvent.timestamp=t;return e;};
 const at=pointOf(L,'bowl',k);
 await V.fire('room-stage','onResponderGrant',event(...at,1000));await V.fire('room-stage','onResponderMove',event(at[0]-30,at[1],1100));
 await V.act(()=>rn.emit('change','inactive'));assert.equal(L.core.getState().room.draft.drag,null);await V.act(()=>rn.emit('change','active'));
 const at2=pointOf(L,'bowl',k);await V.fire('room-stage','onResponderGrant',event(...at2,2000));await V.fire('room-stage','onResponderMove',event(at2[0]-40,at2[1],2100));
 assert.ok(L.core.getState().room.draft.drag,'новый перенос начался');const before=structuredClone(L.core.getState().room.draft);
 await V.fire('room-stage','onResponderRelease',event(at[0]-30,at[1],1200,true));
 assert.ok(L.core.getState().room.draft.drag,'старый release должен быть проигнорирован');assert.deepEqual(L.core.getState().room.draft,before);
});
test('Codex: terminate обработчика прежнего ядра не отменяет перенос нового ядра', async () => {
 const A=await lab(),B=await lab();const V=mount('codex-room-oldcore',tree(A));await V.render();await turn();const k=await openRoom(V,A);
 const old=V.node('room-stage').onResponderTerminate;const dismissed=V.node('room-modal').onDismiss;await V.render(tree(B));await turn();await V.act(()=>B.spy.open('room'));if(!V.node('room-modal').visible){await V.act(()=>dismissed());await turn();}assert.equal(V.node('room-modal').visible,true,'новое окно должно быть действительно показано');await V.fire('room-sheet','onLayout',layout(390,844));
 const at=pointOf(B,'bowl',k);await V.fire('room-stage','onResponderGrant',touch(1,at));await V.fire('room-stage','onResponderMove',touch(1,[at[0]-40,at[1]]));assert.ok(B.core.getState().room.draft.drag,'новый перенос начался');
 await V.act(()=>old(touch(1,[0,0])));assert.ok(B.core.getState().room.draft.drag,'terminate прежнего ядра должен быть проигнорирован');
});
