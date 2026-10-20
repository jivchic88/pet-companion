// Нативное отображение PL10.1 (README, «Нативное отображение»; docs/ARCHITECTURE.md § 12.2): PetView и штатные наборы
// catNative, dogNative в настоящем React 19 (react-dom/client с контейнером-заглушкой) — react-native и react-native-svg
// подменены загрузчиком (test/fakes/react-native.mjs, test/fakes/react-native-svg.mjs: узлы записывают свои свойства по
// testID; Svg записывает рисунок набора, проверка отрисовывает его react-dom/server в настоящую разметку SVG; Animated —
// учёт запущенных, снятых и идущих анимаций). Ядро — публичный createPetCore на асинхронном хранилище с ручными часами,
// планировщиком и случайностью (test/core-kit.mjs). Проверяется контракт: объявление отображения (только нарисованное, без
// видов и сценок), рисунок по снимку (питомец, имя, облик, аксессуар, поза реакции), касание — interact({ type: 'pet' })
// без награды, движение реакции и его снятие (конец реакции, уменьшение движения, фон, смена ядра, размонтирование),
// объявления announce по одному, отказ неверного набора без побочных действий, два экземпляра, внешний destroy.
// Это Node и подделки — не React Native и не устройство (examples/expo/ на устройстве — README примера).
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import test from 'node:test';
import { calendar, host as counter, journal, planner, series } from './core-kit.mjs';
import { nodeRoot, system } from './native-kit.mjs';

const rn = system();
globalThis.__petRN = rn;
const FAKES = { 'react-native': new URL('./fakes/react-native.mjs', import.meta.url).href, 'react-native-svg': new URL('./fakes/react-native-svg.mjs', import.meta.url).href };
registerHooks({ resolve: (specifier, context, next) => (Object.hasOwn(FAKES, specifier) ? { url: FAKES[specifier], shortCircuit: true } : next(specifier, context)) });
const Native = await import('../pet/native.mjs');
const { createPetCore, createStorage, definePet } = await import('../pet/core.mjs');
const { cat, dog } = await import('../pet/pets.mjs');
const { calm } = await import('../pet/behaviors.mjs');
const Kits = await import('../pet/native/kits.mjs');
const { Screen, screen } = await import('./fakes/expo-screen.mjs');
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { PetView, catNative, dogNative } = Native;
const PETS = [cat, dog];
const KITS = [catNative, dogNative];

// Ядро проверки: асинхронное хранилище в памяти, ручные часы и планировщик, счёт хоста; spy — тот же PetCore для PetView с
// учётом обращений (подписки и отписки, объявления отображения, касания).
async function lab({ data = new Map() } = {}) {
  const storage = createStorage({ backend: { async: true, get: async (key) => data.get(key) ?? null, set: async (key, value) => void data.set(key, value) } });
  assert.equal(await storage.load(), 'ready');
  const time = calendar();
  const plan = planner(time);
  const counts = counter(0, 0);
  const log = journal();
  const core = createPetCore({ storage, pets: PETS, behaviors: [calm], progress: counts.progress, clock: time.port, random: series().port, scheduler: plan.port, log: log.port });
  const calls = { subscribe: 0, unsubscribe: 0, setDisplay: [], interact: [], activity: 0 };
  const spy = {
    get status() {
      return core.status;
    },
    getState: () => core.getState(),
    subscribe(listener, options) {
      calls.subscribe += 1;
      const off = core.subscribe(listener, options);
      return () => {
        calls.unsubscribe += 1;
        off();
      };
    },
    setDisplay: (display) => (calls.setDisplay.push(display), core.setDisplay(display)),
    activity: () => ((calls.activity += 1), core.activity()),
    interact: (action) => (calls.interact.push(action), core.interact(action)),
  };
  return { core, spy, calls, time, plan, counts, log, data, live: () => calls.subscribe - calls.unsubscribe };
}

const roots = [];
test.afterEach(async () => {
  for (const R of roots.splice(0)) await R.unmount();
  rn.animations.live.clear();
});
// PetView в своём корне под меткой экрана name; props можно менять повторной отрисовкой.
function view(name, props, { strict = false } = {}) {
  const R = nodeRoot();
  roots.push(R);
  const own = screen(name);
  const element = (next) => {
    let tree = React.createElement(Screen.Provider, { value: name }, React.createElement(PetView, next));
    if (strict) tree = React.createElement(React.StrictMode, null, tree);
    return tree;
  };
  return {
    own,
    act: R.act,
    render: (next = props) => R.render(element(next)),
    unmount: () => R.unmount(),
    node: (id) => own.nodes.get(id)?.props ?? null,
    // Рисунок, переданный корневому Svg: элемент набора и его разметка (react-dom/server).
    figure() {
      const art = own.nodes.get('pet-art')?.props;
      if (!art) return null;
      return { element: art.children, svg: renderToStaticMarkup(React.createElement('svg', { viewBox: art.viewBox }, art.children)), width: art.width, height: art.height };
    },
  };
}
// Запуск ядра и конец приветствия дня (реакция при запуске на виду).
async function started(L, V) {
  await V.act(() => L.core.start());
  await V.act(() => L.plan.advance(8000));
}
const markupOf = (kit, props) => renderToStaticMarkup(React.createElement('svg', null, kit.Figure({ prefix: 'q', coat: kit.coats[0], accessory: 'scarf', toward: '', ...props })));
const TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'pattern']);


const { life, reserver, sceneStore, DAY, flush, host } = await import('./core-kit.mjs');
function sceneLab() {
 const days=sceneStore(), port=reserver(days, 'qa');
 const L=life({cat:{v:1,seenStage:0,greetDay:DAY}}, {counts:host(1,1), scenes:port.port});
 return {...L,days,port};
}
async function reward(L, V, key) {
 await V.act(() => L.core.start());
 await V.act(() => L.plan.advance(8000));
 L.random.push(0,0,0);
 await V.act(() => L.core.notify('saved',{key,counted:true}));
 await V.act(() => L.plan.advance(8000));
 await V.act(() => flush());
 console.log('EVIDENCE',key,JSON.stringify({calls:L.port.calls,days:L.days.days.size,display:L.state().display,reaction:L.state().pose.reaction}));
}

test('Codex: после ухода PetView со сценками оставшийся PetView без сценок не расходует день', async () => {
 const L=sceneLab(), R=nodeRoot();roots.push(R);
 const bare=KITS.map(k=>({...k,scenes:[]}));
 const tree=(full)=>React.createElement(React.Fragment,null,
  React.createElement(PetView,{key:'bare',core:L.core,pets:PETS,kits:bare}),
  full?React.createElement(PetView,{key:'full',core:L.core,pets:PETS,kits:KITS}):null);
 await R.render(tree(true));await R.render(tree(false));await R.act(()=>flush());
 await reward(L,R,'remaining-view-has-no-scenes');
 assert.equal(L.days.days.size,0,'оставшийся рисунок сценок не поддерживает: день не расходуется');L.core.destroy();
});
test('Codex: после ухода PetView без сценок оставшийся PetView со сценками возвращает свои возможности', async () => {
 const L=sceneLab(), R=nodeRoot();roots.push(R);
 const bare=KITS.map(k=>({...k,scenes:[]}));
 const tree=(last)=>React.createElement(React.Fragment,null,
  React.createElement(PetView,{key:'full',core:L.core,pets:PETS,kits:KITS}),
  last?React.createElement(PetView,{key:'bare',core:L.core,pets:PETS,kits:bare}):null);
 await R.render(tree(true));await R.render(tree(false));await R.act(()=>flush());
 console.log('EVIDENCE full-view-remains',JSON.stringify(L.state().display));
 assert.deepEqual(L.state().display.scenes,{cat:['stretch','curl'],dog:['fetch']},'должны действовать возможности оставшегося рисунка');L.core.destroy();
});
test('Codex: PetView с собственными kits без сценок в композиции не разрешает невидимую сценку', async () => {
 const L=sceneLab(), R=nodeRoot();roots.push(R);
 const bare=KITS.map(k=>({...k,scenes:[]}));
 await R.render(React.createElement(Native.PetProvider,{core:L.core,pets:PETS,kits:KITS},
   React.createElement(PetView,{kits:bare,pets:PETS})));
 await reward(L,R,'composed-own-kits-without-scenes');
 assert.equal(L.days.days.size,0,'сценка недоступна единственному рисунку композиции: день не расходуется');L.core.destroy();
});
