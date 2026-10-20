// Публичные входы pet-companion/native-sqlite и pet-companion/native в Node (PL09; README, «Мобильное хранение и жизненный
// цикл»): пакеты expo-sqlite и react-native подменены загрузчиком (registerHooks) — test/fakes/expo-sqlite.mjs (тестовый
// драйвер на node:sqlite, та же сигнатура openDatabaseAsync) и test/fakes/react-native.mjs (подделка AppState и
// AccessibilityInfo; PL10.1 — ещё компоненты и Animated) и test/fakes/react-native-svg.mjs; react и react-dom — настоящие из devDependencies. Импорт обоих входов — без браузерных глобалов
// (ловушки), без открытия базы, запросов и подписок. native-sqlite: ровно два экспорта, непрозрачный фасад, своё
// соединение openDatabaseAsync(имя, { useNewConnection: true }, папка) только при первой загрузке, публичный createPetCore
// принимает координатор и резервирование, соединение приложения запросов не получает, PetError настроек. native: ровно
// useNativeLifecycle, usePetState, PetView, catNative и dogNative (PL10.1; отображение — test/native-view.test.mjs), PetProvider
// и PetCorner (PL10.2.1; test/native-corner.test.mjs) (тот же общий хук, что у /react); сквозной путь хранилище → load → ядро → жизненный
// цикл → start после ready; хук в настоящем React 19 (react-dom/client, StrictMode, act) с контейнером-заглушкой — хук
// ничего не рисует, DOM не нужен: двойной эффект StrictMode снимает и снова ставит слушатели, смена ядра, null, внешний
// destroy и размонтирование снимают всё. Это не React Native и не Metro: настоящий потребитель — examples/expo/ на устройстве.
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import test from 'node:test';
import { lab } from './sqlite-driver.mjs';
import { system } from './native-kit.mjs';

const TRAPS = ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'matchMedia', 'requestAnimationFrame', 'ResizeObserver', 'HTMLElement', 'customElements', 'location', 'fetch'];
const touched = [];
for (const name of TRAPS) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      touched.push(name);
      throw new Error(`обращение к ${name}`);
    },
  });
}
const L = await lab();
const rn = system();
globalThis.__petExpo = { calls: [], open: (path) => L.open(path) };
globalThis.__petRN = rn;
const FAKES = { 'expo-sqlite': new URL('./fakes/expo-sqlite.mjs', import.meta.url).href, 'react-native': new URL('./fakes/react-native.mjs', import.meta.url).href, 'react-native-svg': new URL('./fakes/react-native-svg.mjs', import.meta.url).href };
registerHooks({ resolve: (specifier, context, next) => (Object.hasOwn(FAKES, specifier) ? { url: FAKES[specifier], shortCircuit: true } : next(specifier, context)) });

const Sqlite = await import('../pet/native-sqlite.mjs');
const Native = await import('../pet/native.mjs');
const Hook = await import('../pet/hooks/state.mjs');
const Core = await import('../pet/core.mjs');
const { cat, dog } = await import('../pet/pets.mjs');
const { calm } = await import('../pet/behaviors.mjs');
const importTouched = [...touched];
const importCalls = { open: globalThis.__petExpo.calls.length, subscribe: rn.counts.add, ask: rn.counts.ask, queries: L.journal.length, animations: rn.animations.started, announced: rn.announced.length };
for (const name of TRAPS) delete globalThis[name];

test.after(() => L.close());

test('импорт входов: ровно экспорты (PL10.1: ещё PetView, catNative, dogNative; PL10.2.1: PetProvider, PetCorner; PL10.2.2: PetPlay), без браузерных глобалов, без открытия базы, запросов, подписок системы и клавиатуры, анимаций и объявлений', () => {
  assert.deepEqual(Object.keys(Sqlite).sort(), ['createSqliteScenes', 'createSqliteStorage']);
  assert.deepEqual(Object.keys(Native).sort(), ['PetCorner', 'PetPlay', 'PetProvider', 'PetRoom', 'PetView', 'catNative', 'dogNative', 'useNativeLifecycle', 'usePetState']);
  assert.deepEqual(Object.values(rn.keys).map((set) => set.size), [0, 0, 0, 0], 'импорт не слушает клавиатуру');
  assert.ok([Native.catNative, Native.dogNative].every((kit) => Object.isFrozen(kit) && typeof kit.Figure === 'function'), 'наборы — замороженные объекты с рисунком');
  assert.equal(Native.usePetState, Hook.usePetState, 'тот же общий хук, что у pet-companion/react');
  assert.deepEqual(importTouched, []);
  assert.deepEqual(importCalls, { open: 0, subscribe: 0, ask: 0, queries: 0, animations: 0, announced: 0 });
});

test('native-sqlite: непрозрачный фасад; своё соединение — только при загрузке, openDatabaseAsync(имя, { useNewConnection: true }, папка); публичный createPetCore и резервирование; соединение приложения запросов не получает; PetError настроек', async () => {
  const path = L.file('app.db');
  const app = L.other(path);
  await app.execAsync('PRAGMA journal_mode = WAL');
  const storage = Sqlite.createSqliteStorage({ db: app, namespace: 'app' });
  const scenes = Sqlite.createSqliteScenes({ db: app, namespace: 'app' });
  assert.equal(Sqlite.createSqliteStorage({ db: app, namespace: 'app' }), storage);
  assert.equal(Sqlite.createSqliteScenes({ db: app, namespace: 'app' }), scenes);
  assert.deepEqual([Object.keys(storage), storage.status, typeof storage.connect, Object.keys(scenes)], [['status', 'load'], 'idle', 'undefined', ['reserve']]);
  assert.equal(globalThis.__petExpo.calls.length, 0, 'до load соединения нет');
  assert.throws(() => Core.createPetCore({ storage, scenes, pets: [cat, dog], behaviors: [calm] }), { code: 'storage-not-loaded' });
  assert.equal(await storage.load(), 'ready');
  assert.deepEqual(globalThis.__petExpo.calls, [{ databaseName: 'app.db', options: { useNewConnection: true }, directory: L.dir }]);
  const core = Core.createPetCore({ storage, scenes, pets: [cat, dog], behaviors: [calm] });
  assert.equal(await core.setName('Барсик').save.done, 'saved');
  assert.equal(await scenes.reserve(() => null, () => {}), 'skip');
  assert.equal(JSON.parse((await app.getFirstAsync("SELECT value FROM pet_kv WHERE ns = 'app' AND key = 'cat:v1'")).value).name, 'Барсик');
  assert.deepEqual(L.journal.filter((line) => line.startsWith('o1 ')).map((line) => line.split(' ').slice(1, 3).join(' ')), ['exec PRAGMA', 'get SELECT'], 'на соединении приложения — только запросы проверки');
  core.destroy();
  for (const bad of [undefined, {}, { db: app, namespace: 1 }, { db: { databasePath: ':memory:' } }, { db: app, extra: 1 }]) {
    assert.throws(() => Sqlite.createSqliteStorage(bad), (error) => error instanceof Core.PetError && error.code === 'invalid-options');
    assert.throws(() => Sqlite.createSqliteScenes(bad), (error) => error instanceof Core.PetError && error.code === 'invalid-options');
  }
});

// Настоящий React 19 в Node: react-dom/client с контейнером-заглушкой (хук и проба ничего не рисуют, DOM не нужен).
const require = createRequire(import.meta.url);
function reactRoot() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const view = { event: undefined, HTMLIFrameElement: class {} };
  globalThis.window = view;
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const doc = { nodeType: 9, addEventListener() {}, removeEventListener() {}, defaultView: view, activeElement: null };
  const root = createRoot({ nodeType: 1, nodeName: 'DIV', tagName: 'DIV', ownerDocument: doc, addEventListener() {}, removeEventListener() {}, childNodes: [], firstChild: null, textContent: '' });
  const seen = [];
  function Probe({ core }) {
    const ready = Native.useNativeLifecycle(core);
    const pet = Native.usePetState(core);
    seen.push({ ready, name: pet?.name.display ?? null });
    return null;
  }
  const render = (core) => React.act(() => root.render(React.createElement(React.StrictMode, null, React.createElement(Probe, { core }))));
  return { React, root, seen, render, unmount: () => React.act(() => root.unmount()) };
}

test('native: сквозной путь — createSqliteStorage → load → createPetCore → useNativeLifecycle (StrictMode) → start после ready; смена ядра, null, внешний destroy и размонтирование снимают слушатели', async () => {
  const app = L.other(L.file('hook.db'));
  const storage = Sqlite.createSqliteStorage({ db: app, namespace: 'hook' });
  assert.equal(await storage.load(), 'ready');
  const core = Core.createPetCore({ storage, pets: [cat, dog], behaviors: [calm] });
  const R = reactRoot();
  const before = { ...rn.counts };
  await R.render(core);
  assert.deepEqual([rn.counts.add - before.add, rn.counts.remove - before.remove, rn.live()], [6, 3, 3], 'StrictMode: эффект, снятие, снова эффект — слушателей ровно одной привязки');
  assert.equal(rn.counts.ask - before.ask, 2, 'начальное чтение — у каждой привязки');
  assert.deepEqual(R.seen.at(-1), { ready: false, name: 'Марс' });
  rn.asks.at(-2).resolve(true);
  await R.React.act(async () => rn.asks.at(-1).resolve(false));
  assert.deepEqual([R.seen.at(-1), core.getState().prefs.reducedMotion], [{ ready: true, name: 'Марс' }, false], 'ответ снятой привязки (true) проигнорирован; ready — по ответу живой');
  assert.equal(core.start().ok, true, 'хост запускает ядро после ready');
  await R.React.act(async () => rn.emit('change', 'background'));
  assert.equal(core.getState().visible, false);
  await R.React.act(async () => rn.emit('change', 'active'));
  // Смена ядра: прежние слушатели сняты, ready нового — заново.
  const next = Core.createPetCore({ storage, pets: [cat, dog], behaviors: [calm] });
  await R.render(next);
  assert.equal(rn.live(), 3);
  assert.deepEqual(R.seen.at(-1), { ready: false, name: 'Марс' });
  await R.React.act(async () => rn.emit('change', 'background'));
  assert.deepEqual([core.getState().visible, next.getState().visible], [true, false], 'событие — только новому ядру');
  await R.React.act(async () => rn.emit('change', 'active'));
  await R.render(null);
  assert.deepEqual([rn.live(), R.seen.at(-1)], [0, { ready: false, name: null }], 'null — ничего не подключено');
  await R.render(next);
  assert.equal(rn.live(), 3);
  await R.React.act(async () => next.destroy());
  assert.deepEqual([rn.live(), R.seen.at(-1).name], [0, null], 'внешний destroy снял слушатели, снимок null');
  await R.render(core);
  assert.equal(rn.live(), 3);
  await R.unmount();
  assert.equal(rn.live(), 0, 'размонтирование снимает всё');
  core.destroy();
  delete globalThis.window;
});
