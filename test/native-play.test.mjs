// «Поиграть», присутствие «по зову» и игровые жесты PL10.2.2 (README, «Нативное отображение»; docs/ARCHITECTURE.md § 6.4,
// § 6.8, § 12.2): PetPlay внутри PetProvider вместе с PetCorner и PetView в настоящем React 19 (react-dom/client с
// контейнером-заглушкой) — react-native и react-native-svg подменены загрузчиком (test/fakes/react-native.mjs: узлы
// записывают свойства по testID, Modal — дети только пока visible, AppState с ручными событиями, Platform). Ядро — публичный
// createPetCore на асинхронном хранилище с ручными часами, планировщиком и случайностью и тестовым портом резервирования
// сценок (счётчик). Ввод — обработчики ответчика сцены (onStartShouldSetResponder, onResponderGrant, …) с событиями формы
// React Native (identifier, locationX/Y, timestamp, touches, changedTouches); точки — по раскладке playLayout из размеров,
// которые отдал onLayout. Проверяется контракт: ресурсы игры наборов и честный отказ, объявление вида и пола одним
// владельцем, окно по view снимка и по очереди с уголком (iOS — после onDismiss), назад и фокус, «по зову», «Скрыть» и
// «Показать», холодный перезапуск, поглаживание (пороги, удержание, лимит — ядро), лапа, миска и мячик (с места, где
// нарисованы), один жест и чужой палец, отмены (система, ядро, раскладка, смена ядра, кнопка, размонтирование), кнопки,
// своё определение другого размера без лапы, постоянная строка итога, уменьшение движения, ни знаков, ни лакомства, ни
// резервирования дня. Это Node и подделки — не React Native и не устройство.
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import test from 'node:test';
import { calendar, host as counter, journal, planner, reserver, series } from './core-kit.mjs';
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
const G = await import('../pet/native/gesture.mjs');
const { PLAY_HINT } = await import('../pet/native/play.mjs');
const { Screen, screen } = await import('./fakes/expo-screen.mjs');
const require = createRequire(import.meta.url);
const React = require('react');

const { PetCorner, PetPlay, PetProvider, PetView, catNative, dogNative } = Native;
const h = React.createElement;
const isEl = React.isValidElement;
const { play: _play, ...CORNER_ONLY } = catNative;
const MINIMAL = { pet: 'cat', poses: catNative.poses, substitutes: catNative.substitutes, coats: catNative.coats, accessories: catNative.accessories, Figure: catNative.Figure };

// Свой питомец другой рамки, областей и линии лап, без лапы; свой набор — простой рисунок, ресурсы игры и уголка.
const tall = definePet({
  ...cat,
  id: 'test.tall',
  title: 'Жираф',
  forms: { gen: 'жирафа', acc: 'жирафа' },
  names: { ...cat.names, default: 'Шея', offer: 'Пятнышко', presets: ['Шея', 'Пятнышко', 'Рыжик', 'Длинный'] },
  actions: { pet: { text: '{name} кивает.' }, paw: null },
  poses: cat.poses.filter((pose) => pose !== 'paw'),
  size: { width: 160, height: 300, ground: 280 },
  play: { hits: [{ part: 'neck', cx: 80, cy: 120, rx: 30, ry: 90 }], paw: null, foot: [40, 120, 298], anchor: [80, 295] },
});
const TallFigure = ({ pose, coat, accessory, prefix }) => h('g', { 'data-pose': pose, 'data-coat': coat, 'data-acc': accessory, id: prefix }, h('ellipse', { cx: 80, cy: 150, rx: 40, ry: 140 }));
const tallNative = Object.freeze({ pet: tall.id, poses: tall.poses.filter((pose) => pose !== 'stretch' && pose !== 'curl'), coats: tall.coats.map((c) => c.id), accessories: tall.accessories.map((a) => a.id), Figure: TallFigure, room: true, items: catNative.items, Item: catNative.Item, play: true });

const COMMANDS = ['getState', 'setDisplay', 'activity', 'interact', 'open', 'close', 'setContext', 'setName', 'setPet', 'setAppearance', 'setPreferences', 'setPresence', 'hide', 'show', 'feed', 'refresh', 'setVisible', 'setReducedMotion', 'setBehavior', 'notify'];

// Ядро проверки: асинхронное хранилище в памяти (data — его содержимое между ядрами: холодный перезапуск), ручные часы и
// планировщик, счёт хоста, порт резервирования сценок со счётчиком; spy — тот же PetCore для отображения с учётом
// подписок и команд (вложенные stroke.* и toy.* — тоже).
async function lab({ data = new Map(), pets = [cat, dog], random = [] } = {}) {
  const storage = createStorage({ backend: { async: true, get: async (key) => data.get(key) ?? null, set: async (key, value) => void data.set(key, value) } });
  assert.equal(await storage.load(), 'ready');
  const time = calendar();
  const plan = planner(time);
  const counts = counter(0, 0);
  const scenes = reserver();
  const rand = series(random);
  const core = createPetCore({ storage, pets, behaviors: [calm], progress: counts.progress, clock: time.port, random: rand.port, scheduler: plan.port, log: journal().port, scenes: scenes.port });
  const calls = { subscribe: 0, unsubscribe: 0, list: [] };
  const spy = {
    get status() {
      return core.status;
    },
    subscribe(listener, options) {
      calls.subscribe += 1;
      const off = core.subscribe(listener, options);
      return () => {
        calls.unsubscribe += 1;
        off();
      };
    },
  };
  for (const name of COMMANDS) spy[name] = (...args) => (name !== 'getState' && calls.list.push([name, ...args]), core[name](...args));
  for (const group of ['stroke', 'toy']) spy[group] = Object.fromEntries(Object.keys(core[group]).map((name) => [name, (...args) => (calls.list.push([`${group}.${name}`, ...args]), core[group][name](...args))]));
  const effects = [];
  core.subscribe(({ effects: list }) => effects.push(...list), { initial: false });
  return { core, spy, calls, time, plan, counts, data, scenes, rand, effects, of: (name) => calls.list.filter(([command]) => command === name).map(([, ...args]) => args), names: () => calls.list.map(([name]) => name), live: () => calls.subscribe - calls.unsubscribe };
}

const roots = [];
test.afterEach(async () => {
  for (const R of roots.splice(0)) await R.unmount();
  rn.animations.live.clear();
  rn.platform = 'ios';
  rn.focused.length = 0;
  rn.announced.length = 0;
  // Окно игры начинает с текущего AppState (неактивно — ввод приостановлен до 'active'): каждая проверка — с активного.
  rn.AppState.currentState = 'active';
});
const turn = () => new Promise((resolve) => setTimeout(resolve, 5));

function mount(name, tree, { strict = false } = {}) {
  const R = nodeRoot();
  roots.push(R);
  const own = screen(name);
  const wrap = (next) => {
    let element = h(Screen.Provider, { value: name }, next);
    if (strict) element = h(React.StrictMode, null, element);
    return element;
  };
  const node = (id) => own.nodes.get(id)?.props ?? null;
  return { own, act: R.act, render: (next = tree) => R.render(wrap(next)), unmount: () => R.unmount(), node, has: (id) => own.nodes.has(id), press: (id) => R.act(() => node(id).onPress()), fire: (id, prop, ...args) => R.act(() => node(id)[prop](...args)), text: (id) => String(node(id)?.children ?? '') };
}
const layout = (width, height) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
const PETS = [cat, dog];
const KITS = [catNative, dogNative];
const tree = (L, { corner = true, play = true, view = true, pets = PETS, kits = KITS, insets, key, playProps = {} } = {}) => h(PetProvider, { key, core: L.spy, pets, kits }, view ? h(PetView, { size: 200 }) : null, corner ? h(PetCorner, { insets }) : null, play ? h(PetPlay, { insets, ...playProps }) : null);
const DISPLAY = (views, extra = {}) => ({ full: true, moving: false, pets: ['cat', 'dog'], views, scenes: { cat: ['stretch', 'curl'], dog: ['fetch'] }, ...extra });

async function started(L, V) {
  await V.act(() => L.core.start());
  await V.act(() => L.plan.advance(8000));
}
// Окно игры показано — измерить (лист, строка реплики, строки итога, место сцены). Возвращает раскладку, как её считает
// отображение (playLayout), и определение рисунка.
const BOX = { width: 390, height: 520 };
// Ждать условия оборотами таймеров (пол объявляется, когда замер устоялся — 80 мс): не дольше 100 оборотов по 5 мс.
async function until(V, ok) {
  for (let i = 0; i < 100 && !ok(); i += 1) await V.act(turn);
  return ok();
}
async function measure(V, L, { box = BOX, line = 42, prefix = 'play', def = null, declared = true } = {}) {
  await V.fire(`${prefix}-sheet`, 'onLayout', layout(390, 844));
  await V.fire(`${prefix}-line`, 'onLayout', layout(box.width, line));
  for (let i = 0; V.has(`${prefix}-fit-${i}`); i += 1) await V.fire(`${prefix}-fit-${i}`, 'onLayout', layout(box.width, 22 + (i % 3) * 22));
  await V.fire(`${prefix}-box`, 'onLayout', layout(box.width, box.height));
  const shown = def ?? [cat, dog, tall].find((d) => d.id === L.core.getState().pet.shown);
  const L0 = G.playLayout(box, shown, line);
  if (declared) assert.ok(await until(V, () => L.core.getState().display.playFloor?.join() === L0.playFloor.join()), 'пол объявлен');
  return L0;
}
// Открыть игру прямой командой и измерить.
async function opened(L, V, options) {
  await V.act(() => L.core.open('play'));
  assert.equal(V.node('play-modal').visible, true, 'окно игры показано');
  return measure(V, L, options);
}
// Событие касания формы React Native: changed — пальцы этого события, all — все пальцы на экране.
const ev = (id, [x, y], t = 0, { all = null } = {}) => {
  const touch = { identifier: id, locationX: x, locationY: y };
  return { nativeEvent: { identifier: id, locationX: x, locationY: y, timestamp: t, changedTouches: [touch], touches: all ?? [touch] } };
};
async function down(V, point, { id = 1, t = 0, prefix = 'play' } = {}) {
  const node = V.node(`${prefix}-stage`);
  const asked = node.onStartShouldSetResponder(ev(id, point, t));
  if (asked) await V.act(() => node.onResponderGrant(ev(id, point, t)));
  return asked;
}
const move = (V, point, { id = 1, t = 0, all, prefix = 'play' } = {}) => V.act(() => V.node(`${prefix}-stage`).onResponderMove(ev(id, point, t, { all })));
async function up(V, point, { id = 1, t = 100, last = true, prefix = 'play' } = {}) {
  await V.act(() => {
    const node = V.node(`${prefix}-stage`);
    node.onResponderEnd(ev(id, point, t));
    if (last) node.onResponderRelease(ev(id, point, t));
  });
}
// Провести по голове от u0 с шагом step точек экрана n раз (сдвиг по горизонтали).
async function stroke(V, L0, { from = [100, 60], step = 12, n = 4, t = 0, id = 1 } = {}) {
  const start = G.toPoints(L0, from);
  assert.equal(await down(V, start, { id, t }), true, 'голова под пальцем');
  for (let i = 1; i <= n; i += 1) await move(V, [start[0] + i * step, start[1]], { id, t: t + i * 30 });
  return [start[0] + n * step, start[1]];
}
const pt = (L0, at) => G.toPoints(L0, at);

test('наборы: ресурсы игры штатных — по своим определениям (все позы сцены, предметы — с поворотом); минимальный и только с уголком — отказ игры; неверная форма play, исключение и строка рисунка — отказ; свой питомец другого размера без лапы — годен', () => {
  const defs = new Map([cat, dog, tall].map((def) => [def.id, def]));
  for (const kit of KITS) {
    assert.equal(Kits.nativeKitProblem(kit, defs, isEl), '', kit.pet);
    assert.equal(Kits.nativePlayProblem(kit, defs.get(kit.pet), isEl), '', kit.pet);
    assert.equal(kit.play, true);
  }
  assert.equal(Kits.nativePlayProblem(tallNative, tall, isEl), '');
  assert.equal(Kits.nativeKitProblem(MINIMAL, defs, isEl), '', 'PL10.1 годен PetView');
  assert.equal(Kits.nativeCornerProblem(CORNER_ONLY, cat, isEl), '', 'и уголку');
  for (const kit of [MINIMAL, CORNER_ONLY]) assert.match(Kits.nativePlayProblem(kit, cat, isEl), /нет ресурсов игры — play: true/);
  assert.match(Kits.nativeKitProblem({ ...catNative, play: 'yes' }, defs, isEl), /play — true/);
  assert.match(Kits.nativeKitProblem({ ...catNative, toys: ['ball'] }, defs, isEl), /неизвестные поля toys/);
  const turned = { ...catNative, Figure: (props) => (props.toward === 'left' && props.pose === 'watch' ? (() => { throw new Error('влево не рисую'); })() : catNative.Figure(props)) };
  assert.match(Kits.nativePlayProblem(turned, cat, isEl), /pose: 'watch', toward: 'left'.*исключение \(влево не рисую\)/);
  const string = { ...catNative, Figure: (props) => (props.pose === 'ball' && props.toward === 'right' ? '<g/>' : catNative.Figure(props)) };
  assert.match(Kits.nativePlayProblem(string, cat, isEl), /pose: 'ball', toward: 'right'.*элемент React/);
  // Лапу рисует только питомец с лапой: у своего без лапы её не требуют.
  assert.ok(!Kits.nativeKitNeeds(tall).poses.includes('paw'));
});

test('отказ игры до побочных действий: набор без ресурсов игры — читаемый отказ, вид play не объявлен, open(play) — unsupported, в уголке нет «Поиграть»; вне координатора — отказ; набор с ресурсами — вид объявлен и кнопка есть', async () => {
  const L = await lab();
  const V = mount('play-refuse', tree(L, { pets: [cat], kits: [CORNER_ONLY] }));
  await V.render();
  await started(L, V);
  assert.match(V.text('play-problem'), /Игра не показана: набор «cat»: нет ресурсов игры/);
  assert.equal(V.node('play').accessibilityRole, 'alert');
  assert.deepEqual(L.core.getState().display.views, ['corner']);
  assert.equal(L.core.open('play').error?.code, 'unsupported');
  await V.press('corner-open');
  assert.equal(V.has('corner-play'), false, 'неработающей кнопки нет');
  const X = mount('play-alone', h(PetPlay));
  await X.render();
  assert.match(X.text('play-problem'), /только внутри PetProvider/);
  const M = await lab();
  const W = mount('play-ok', tree(M));
  await W.render();
  await started(M, W);
  assert.deepEqual(M.core.getState().display.views, ['corner', 'play']);
  await W.press('corner-open');
  assert.equal(W.node('corner-play').accessibilityLabel, 'Поиграть');
  L.core.destroy();
  M.core.destroy();
});

test('один владелец объявления: вид play и пол игры объявляет координатор — пол только после замера показанной сцены, ровно playLayout; PetView и уголок не сбрасывают; StrictMode без лишних объявлений; поверхность снята — вида нет, открытая игра закрыта; новое ядро — без чужого пола', async () => {
  for (const strict of [false, true]) {
    const L = await lab();
    const V = mount(`play-owner-${strict}`, tree(L), { strict });
    await V.render();
    await started(L, V);
    assert.deepEqual(L.of('setDisplay'), [[DISPLAY(['corner', 'play'])]], `strict ${strict}: вид без пола`);
    assert.equal(L.core.getState().display.playFloor, null);
    const L0 = await opened(L, V);
    assert.deepEqual(L.of('setDisplay').at(-1), [DISPLAY(['corner', 'play'], { playFloor: [...L0.playFloor], playTouch: L0.playTouch })], 'пол — замер сцены');
    assert.deepEqual(L.core.getState().display.playFloor, [...L0.playFloor]);
    assert.equal(L.of('setDisplay').length, 2, 'одно объявление пола');
    // Тот же размер ещё раз — без повтора; другой — новое, когда замер устоялся; переходные замеры подряд — одно объявление.
    await V.fire('play-box', 'onLayout', layout(BOX.width, BOX.height));
    await V.act(turn);
    assert.equal(L.of('setDisplay').length, 2);
    await V.fire('play-box', 'onLayout', layout(BOX.width, BOX.height + 10));
    await V.fire('play-box', 'onLayout', layout(BOX.width, BOX.height + 25));
    await V.fire('play-box', 'onLayout', layout(BOX.width, BOX.height + 40));
    assert.ok(await until(V, () => L.of('setDisplay').length === 3));
    await V.act(turn);
    assert.equal(L.of('setDisplay').length, 3, 'переходные замеры не объявлены');
    assert.deepEqual(L.core.getState().display.playFloor, [...G.playLayout({ width: BOX.width, height: BOX.height + 40 }, cat, 42).playFloor]);
    // Поверхность игры снята при открытой игре — вид закрыт, остался уголок.
    await V.render(tree(L, { play: false }));
    await V.act(() => {});
    assert.deepEqual([L.core.getState().view.open, L.core.getState().display.views], [null, ['corner']]);
    // Снова есть — объявлена; новое ядро получает вид без пола прежнего.
    await V.render(tree(L));
    const M = await lab();
    await V.render(tree(M));
    assert.deepEqual(M.of('setDisplay'), [[DISPLAY(['corner', 'play'])]], 'новое ядро — без чужого пола');
    assert.deepEqual([L.core.getState().display.views, L.live()], [[], 0]);
    L.core.destroy();
    M.core.destroy();
  }
});

test('окно — только по view снимка и по очереди с уголком: «Поиграть» уголка (iOS — после onDismiss уголка), «Закрыть», Android «Назад» и жест VoiceOver — в уголок, следующий «Назад» — закрыто; прямые open(play) и close(); фокус на «Закрыть», на «Поиграть» при возврате, на вход после закрытия; закрытое окно «Назад» не перехватывает', async () => {
  const L = await lab();
  const V = mount('play-window', tree(L));
  await V.render();
  await started(L, V);
  assert.equal(V.node('play-modal').visible, false, 'закрыто — окна нет (Android «Назад» не перехватывается)');
  await V.press('corner-open');
  await V.fire('corner-modal', 'onShow');
  await V.press('corner-play');
  assert.deepEqual(L.core.getState().view, { open: 'play', source: 'pet' });
  assert.deepEqual([V.node('corner-modal').visible, V.node('play-modal').visible], [false, false], 'iOS: окно игры ждёт ухода уголка');
  await V.fire('corner-modal', 'onDismiss');
  assert.equal(V.node('play-modal').visible, true);
  assert.notDeepEqual(rn.focused.at(-1), { testID: 'corner-open', type: 'focus' }, 'переход в игру — не закрытие: фокус не на входе');
  await V.fire('play-modal', 'onShow');
  assert.deepEqual(rn.focused.at(-1), { testID: 'play-close', type: 'focus' });
  assert.equal(V.node('play-close').accessibilityLabel, 'Закрыть игру');
  assert.equal(V.has('play-corner'), false, 'из уголка — без «Уголок»');
  await V.press('play-close');
  assert.deepEqual(L.core.getState().view, { open: 'corner', source: 'pet' });
  assert.deepEqual([V.node('play-modal').visible, V.node('corner-modal').visible], [false, false]);
  await V.fire('play-modal', 'onDismiss');
  assert.equal(V.node('corner-modal').visible, true);
  await V.fire('corner-modal', 'onShow');
  assert.deepEqual(rn.focused.at(-1), { testID: 'corner-play', type: 'focus' }, 'возврат из игры — фокус на «Поиграть»');
  // Жест VoiceOver «назад» и Android «Назад» из игры — в уголок; «Назад» уголка — закрыто.
  await V.press('corner-play');
  await V.fire('corner-modal', 'onDismiss');
  await V.fire('play-sheet', 'onAccessibilityEscape');
  assert.equal(L.core.getState().view.open, 'corner');
  await V.fire('play-modal', 'onDismiss');
  rn.platform = 'android';
  rn.focused.length = 0;
  await V.press('corner-play');
  assert.equal(V.node('play-modal').visible, true, 'Android: окна сменяются сразу');
  await V.fire('play-modal', 'onRequestClose');
  assert.deepEqual([L.core.getState().view.open, V.node('corner-modal').visible], ['corner', true]);
  await V.fire('corner-modal', 'onRequestClose');
  assert.equal(L.core.getState().view.open, null);
  // Android переводит фокус после снятия окна, следующим оборотом таймеров: ждать по условию (until).
  await until(V, () => rn.focused.length > 0);
  assert.deepEqual(rn.focused, [{ testID: 'corner-open', type: 'focus' }]);
  // Прямая команда из закрытого — игра; прямой close() — закрыто целиком, уголок сам не открывается; фокус — на вход уголка.
  rn.platform = 'ios';
  await V.act(() => L.core.open('play'));
  assert.deepEqual([V.node('play-modal').visible, V.node('corner-modal').visible], [true, false]);
  rn.focused.length = 0;
  await V.act(() => L.core.close());
  assert.deepEqual([L.core.getState().view.open, V.node('play-modal').visible], [null, false]);
  await V.fire('play-modal', 'onDismiss');
  await V.act(() => {});
  assert.equal(L.core.getState().view.open, null, 'подписка не открывает уголок сама');
  assert.deepEqual(rn.focused, [{ testID: 'corner-open', type: 'focus' }]);
  // Без поверхности уголка «Закрыть» закрывает игру целиком.
  await V.render(tree(L, { corner: false }));
  await V.act(() => L.core.open('play'));
  await V.press('play-close');
  assert.equal(L.core.getState().view.open, null);
  L.core.destroy();
});

test('фокус возвращает окно, которое держит экран, когда всё закрыто: игра → уголок → закрыто быстрее ухода окна игры — один перевод фокуса на вход уголка (iOS — по onDismiss окна игры; окно уголка так и не показано); переход между видами фокус на вход не переводит', async () => {
  for (const platform of ['ios', 'android']) {
    rn.platform = platform;
    const L = await lab();
    const V = mount(`play-focus-${platform}`, tree(L));
    await V.render();
    await started(L, V);
    await V.act(() => L.core.open('play'));
    rn.focused.length = 0;
    await V.press('play-close');
    assert.equal(L.core.getState().view.open, 'corner');
    if (platform === 'ios') assert.equal(V.node('corner-modal').visible, false, 'iOS: окно уголка ждёт ухода окна игры');
    await V.act(turn);
    assert.deepEqual(rn.focused, [], 'переход в уголок — фокус не на входе');
    await V.act(() => L.core.close());
    if (platform === 'ios') await V.fire('play-modal', 'onDismiss');
    await until(V, () => rn.focused.length > 0);
    await V.act(turn);
    assert.deepEqual(rn.focused, [{ testID: 'corner-open', type: 'focus' }], platform);
    L.core.destroy();
  }
});

test('из ввода имени в игру: тишина ввода снята (setContext typing: false), поле уголка снято вместе с окном, черновик не переносится; уголок после игры — поле с сохранённым именем', async () => {
  const L = await lab();
  const V = mount('play-typing', tree(L));
  await V.render();
  await started(L, V);
  await V.press('corner-open');
  await V.fire('corner-body', 'onLayout', layout(390, 760));
  await V.fire('corner-name-input', 'onFocus');
  await V.fire('corner-name-input', 'onChangeText', 'Черновик');
  assert.deepEqual(L.of('setContext').at(-1), [{ typing: true }]);
  assert.deepEqual(L.core.getState().context.quiet, ['typing']);
  await V.press('corner-play');
  assert.deepEqual(L.of('setContext').at(-1), [{ typing: false }], 'тишина ввода снята');
  assert.deepEqual(L.core.getState().context.quiet, []);
  await V.fire('corner-modal', 'onDismiss');
  assert.equal(V.has('corner-name-input'), false, 'поле снято вместе с окном уголка (клавиатура уходит)');
  assert.equal(V.node('play-modal').visible, true);
  await V.press('play-close');
  await V.fire('play-modal', 'onDismiss');
  assert.equal(V.node('corner-name-input').value, L.core.getState().name.value, 'черновик не перенесён');
  L.core.destroy();
});

test('«Приходит по зову»: выбор в уголке, вход «Позвать …» вместо питомца (без невидимого питомца); вызов — сразу игра (source call), «Уголок» и обратно, источник сохраняется до закрытия; «Закрыть» вызванной — к вызову; «Скрыть» и «Показать» — игра сама не открывается; холодный перезапуск; ни знаков, ни лакомства, ни резервирования дня', async () => {
  const data = new Map();
  const L = await lab({ data });
  L.counts.set(2, 1);
  const V = mount('play-call', tree(L));
  await V.render();
  await started(L, V);
  await V.act(() => L.core.refresh());
  const before = { marks: L.core.getState().progress.marks, treat: L.core.getState().treat };
  await V.press('corner-open');
  await V.press('corner-presence-on-call');
  assert.deepEqual(L.of('setPresence'), [['on-call']]);
  assert.equal(V.node('corner-presence-on-call').accessibilityState.checked, true);
  assert.equal(L.core.getState().view.open, 'corner', 'открытый уголок остаётся');
  await V.press('corner-close');
  await V.fire('corner-modal', 'onDismiss');
  assert.deepEqual(L.core.getState().presence, { mode: 'on-call', hidden: false, surface: 'call', around: false });
  assert.equal(V.has('pet-art'), false, 'невидимого питомца нет');
  assert.equal(V.has('corner-open'), false);
  assert.equal(V.node('play-call').accessibilityLabel, 'Позвать питомца: Марс');
  assert.deepEqual(rn.focused.at(-1), { testID: 'play-call', type: 'focus' }, 'после закрытия — фокус на вызов');
  // Вызов.
  await V.press('play-call');
  assert.deepEqual(L.of('open').at(-1), ['play', { source: 'call' }]);
  assert.deepEqual(L.core.getState().view, { open: 'play', source: 'call' });
  assert.equal(V.node('play-modal').visible, true);
  assert.equal(V.node('play-call').accessibilityState.expanded, true);
  await V.press('play-corner');
  assert.deepEqual(L.core.getState().view, { open: 'corner', source: 'call' }, 'источник — до закрытия');
  await V.fire('play-modal', 'onDismiss');
  await V.press('corner-play');
  assert.deepEqual(L.core.getState().view, { open: 'play', source: 'call' });
  await V.fire('corner-modal', 'onDismiss');
  rn.focused.length = 0;
  await V.press('play-close');
  assert.deepEqual([L.core.getState().view.open, L.core.getState().presence.surface], [null, 'call'], 'вызванная — к вызову, не в уголок');
  await V.fire('play-modal', 'onDismiss');
  assert.deepEqual(rn.focused, [{ testID: 'play-call', type: 'focus' }]);
  // «Скрыть» (из уголка вызова) — окно закрыто; «Показать» — снова вызов, игра сама не открывается.
  await V.press('play-call');
  await V.press('play-corner');
  await V.fire('play-modal', 'onDismiss');
  rn.announced.length = 0;
  await V.press('corner-hide');
  assert.deepEqual([L.core.getState().view.open, L.core.getState().presence.surface], [null, 'none']);
  assert.deepEqual(rn.announced, ['Марс спрятан. Вернуть — «Показать кота».']);
  assert.equal(V.has('play-call'), false);
  await V.fire('corner-modal', 'onDismiss');
  assert.equal(V.node('corner-show').accessibilityLabel, 'Показать кота');
  await V.press('corner-show');
  await V.act(turn);
  assert.deepEqual([L.core.getState().view.open, L.core.getState().presence.surface], [null, 'call'], 'игра сама не открылась');
  assert.deepEqual(rn.focused.at(-1), { testID: 'play-call', type: 'focus' });
  // Прямые команды хоста: always — питомец снова на экране; on-call — снова вызов.
  await V.act(() => L.core.setPresence('always'));
  assert.equal(V.has('pet-art'), true);
  assert.equal(V.has('play-call'), false);
  await V.act(() => L.core.setPresence('on-call'));
  // Ни знаков, ни лакомства, ни резервирования дня; записан только ключ присутствия и «скрыт».
  assert.deepEqual({ marks: L.core.getState().progress.marks, treat: L.core.getState().treat }, before);
  assert.equal(L.scenes.calls.reserve, 0);
  assert.equal(L.of('notify').length, 0);
  // Холодный перезапуск на тех же данных: по зову, вызов на месте.
  await V.act(() => L.core.destroy());
  await V.unmount();
  const R = await lab({ data });
  const W = mount('play-call-restart', tree(R));
  await W.render();
  await started(R, W);
  assert.equal(R.core.getState().presence.mode, 'on-call');
  assert.equal(W.has('play-call'), true);
  assert.equal(W.has('pet-art'), false);
  R.core.destroy();
});

test('поглаживание: голова или тело — stroke.start, step на каждые 24 точки; поза удерживается между откликами, лимит, «пока хватит» и «жмурится» — ядро; итог — строка ядра в постоянной строке; объявления — по одному на новый итог; касание без сдвига и пустое место — не поглаживание; уход с питомца — отмена; знаков и лакомства нет', async () => {
  const L = await lab();
  L.counts.set(0, 0);
  const V = mount('play-stroke', tree(L));
  await V.render();
  await started(L, V);
  const L0 = await opened(L, V);
  assert.equal(V.text('play-hint'), PLAY_HINT);
  // Строка итога — высотой самого длинного из текстов ядра (образцы: подсказка и все итоги с этим именем).
  assert.equal(V.node('play-hint-box').style.at(-1).minHeight, 66);
  assert.ok(V.has('play-fit-1') && V.text('play-fit-1').includes('Марс'));
  rn.announced.length = 0;
  const end = await stroke(V, L0, { step: 12, n: 4 });
  assert.equal(L.of('stroke.start').length, 1);
  assert.equal(L.of('stroke.step').length, 2, '48 точек — два порога по 24');
  let s = L.core.getState();
  assert.deepEqual([s.pose.hold, s.pose.shown.play, s.play.outcome], ['pet', 'pet', 'pet']);
  assert.equal(V.text('play-hint'), 'Марс мурлычет.');
  assert.deepEqual(rn.announced, ['Марс мурлычет.']);
  // Долгое поглаживание: реакция кончилась, поза держится (ядро); новые отклики — по лимиту модели.
  await V.act(() => L.plan.advance(1500));
  assert.deepEqual([L.core.getState().pose.reaction, L.core.getState().pose.shown.play], [null, 'pet'], 'между откликами — довольная поза');
  for (let i = 0; i < 6; i += 1) {
    await move(V, [end[0] + (i % 2 ? 0 : 30), end[1]], { t: 2000 + i * 1000 });
    await V.act(() => L.plan.advance(1500));
  }
  const outcomes = L.effects.filter((effect) => effect.type === 'announce').map((effect) => effect.text);
  assert.deepEqual(rn.announced, ['Марс мурлычет.', 'Марс: пока хватит.', 'Марс жмурится.'], 'объявления — по одному на итог (ядро)');
  assert.ok(outcomes.includes('Марс: пока хватит.'));
  await up(V, end, { t: 9000 });
  assert.equal(L.of('stroke.end').length, 1);
  assert.equal(L.core.getState().pose.hold, null);
  // Касание без сдвига — не поглаживание.
  const steps = L.of('stroke.step').length;
  await down(V, pt(L0, [100, 150]), { t: 20000 });
  await up(V, pt(L0, [100, 150]), { t: 20080 });
  assert.equal(L.of('stroke.step').length, steps);
  // Пустое место — ничего.
  const calls = L.calls.list.length;
  assert.equal(await down(V, [3, 3]), false);
  assert.equal(L.calls.list.length, calls);
  // Уход с питомца — отмена, дальше ничего.
  const out = await stroke(V, L0, { from: [100, 150], step: 10, n: 3, t: 30000 });
  await move(V, [5, out[1] + 200], { t: 30500 });
  assert.equal(L.of('stroke.cancel').length, 1);
  await move(V, out, { t: 30600 });
  await up(V, out, { t: 30700 });
  assert.equal(L.of('stroke.end').length, 2, 'после отмены отпускание — не end');
  assert.deepEqual([L.core.getState().progress.marks, L.core.getState().treat, L.scenes.calls.reserve], [0, 'waiting', 0]);
  L.core.destroy();
});

test('лапа: короткое касание на лапе — interact paw на отпускание (итог ядра); удержание, сдвиг и отпускание не на лапе — нет; у собаки в позе «Дай лапу» — на поднятой лапе; у своего питомца без лапы — ни области, ни кнопки', async () => {
  const L = await lab();
  const V = mount('play-paw', tree(L));
  await V.render();
  await started(L, V);
  let L0 = await opened(L, V);
  const paw = pt(L0, [cat.play.paw.cx, cat.play.paw.cy]);
  await down(V, paw, { t: 1000 });
  await up(V, [paw[0] + 4, paw[1]], { t: 1300 });
  assert.deepEqual(L.of('interact').at(-1), [{ type: 'paw' }]);
  assert.equal(L.core.getState().play.outcome, 'paw');
  assert.equal(V.text('play-hint'), 'Марс касается твоей руки лапой.');
  await V.act(() => L.plan.advance(3000));
  const paws = () => L.of('interact').filter(([action]) => action.type === 'paw').length;
  const count = paws();
  await down(V, paw, { t: 5000 });
  await up(V, paw, { t: 5600 });
  assert.equal(paws(), count, 'удержание — не касание');
  await down(V, paw, { t: 7000 });
  await move(V, [paw[0] + 12, paw[1]], { t: 7050 });
  await up(V, paw, { t: 7100 });
  assert.equal(paws(), count, 'сдвиг дальше допуска — не касание');
  assert.equal(V.node('play-paw').accessibilityLabel, 'Коснуться лапы');
  // Собака: «Дай лапу» — поза paw, область — на поднятой лапе.
  await V.act(() => L.core.setPet('dog'));
  await V.act(() => L.plan.advance(3000));
  L0 = await measure(V, L);
  assert.equal(V.node('play-paw').accessibilityLabel, 'Дай лапу');
  await V.press('play-paw');
  assert.equal(L.core.getState().pose.shown.play, 'paw');
  const raised = pt(L0, [dog.play.paw.up.cx, dog.play.paw.up.cy]);
  const before = paws();
  await down(V, raised, { t: 9000 });
  await up(V, raised, { t: 9100 });
  assert.equal(paws(), before + 1, 'поднятая лапа — касание лапы');
  L.core.destroy();
  // Свой питомец без лапы, другая рамка: кнопки и области лапы нет, шея — поглаживание; размеры — его определения.
  const T = await lab({ pets: [tall] });
  const W = mount('play-tall', tree(T, { pets: [tall], kits: [tallNative], corner: false }));
  await W.render();
  await started(T, W);
  const LT = await opened(T, W, { def: tall });
  assert.equal(W.has('play-paw'), false);
  assert.ok(Math.abs(W.node('play-figure-art').height / W.node('play-figure-art').width - 300 / 160) < 0.01, 'рамка — определения');
  assert.deepEqual(T.core.getState().display.playFloor, [...LT.playFloor]);
  await stroke(W, LT, { from: [80, 120], step: 0, n: 0, t: 0 });
  await up(W, pt(LT, [80, 120]), { t: 80 });
  assert.equal(T.of('interact').filter(([action]) => action.type === 'paw').length, 0);
  await W.act(() => {});
  const neck = pt(LT, [80, 60]);
  await down(W, neck);
  for (let i = 1; i <= 3; i += 1) await move(W, [neck[0], neck[1] + i * 25]);
  assert.equal(T.of('stroke.step').length, 3, 'шея своего питомца — поглаживание по его областям');
  await up(W, [neck[0], neck[1] + 75]);
  T.core.destroy();
});

test('миска и мячик: перенос — с места, где предмет нарисован (без скачка), меньше 6 точек — ни переноса, ни drop; миска на новом месте — итог ядра, миска не кормит; простое касание мячика не катит; бросок — в единицах рисунка, докат и пределы — ядро; кнопки — те же interact; без замера — предметов и их кнопок нет', async () => {
  const L = await lab();
  L.counts.set(1, 1);
  const V = mount('play-toys', tree(L));
  await V.render();
  await started(L, V);
  await V.act(() => L.core.refresh());
  await V.act(() => L.core.open('play'));
  assert.equal(V.node('play-bowl')?.disabled ?? true, true, 'до замера — предметы недоступны');
  let L0 = await measure(V, L);
  assert.equal(V.node('play-bowl').disabled, false);
  // В снимке не пол этой сцены (объявил другой — хост прямой командой): предметы недоступны и пальцем, и кнопками, пока
  // сцена не объявит свой замер снова.
  await V.act(() => L.core.setDisplay({ playFloor: [-200, -10, 400, 260], playTouch: 30 }));
  assert.equal(V.node('play-bowl').disabled, true);
  assert.equal(V.node('play-ball').disabled, true);
  const foreign = pt(L0, L.core.getState().play.toys.bowl.at);
  assert.equal(V.node('play-stage').onStartShouldSetResponder(ev(1, foreign)), false, 'миска чужого пола пальцем не берётся');
  L0 = await measure(V, L, { box: { width: BOX.width, height: BOX.height + 2 } });
  assert.equal(V.node('play-bowl').disabled, false, 'свой замер — снова доступно');
  const { bowl, ball } = L.core.getState().play.toys;
  // Миска: первая точка — её место, сдвиг пальца — относительно него.
  const at = pt(L0, bowl.at);
  await down(V, [at[0] + 5, at[1] - 3]);
  assert.deepEqual(L.of('toy.drag').at(-1), ['bowl', bowl.at], 'с места, где нарисована');
  await move(V, [at[0] + 8, at[1] - 3]);
  assert.equal(L.of('toy.drag').length, 1, 'меньше 6 точек — не перенос');
  await move(V, [at[0] + 5 + 60, at[1] - 3]);
  const dragged = L.of('toy.drag').at(-1)[1];
  assert.ok(Math.abs(dragged[0] - (bowl.at[0] + 60 / L0.s)) < 1e-9 && Math.abs(dragged[1] - bowl.at[1]) < 1e-9, 'сдвиг — в единицах рисунка текущим масштабом');
  assert.equal(L.core.getState().play.drag.toy, 'bowl');
  await up(V, [at[0] + 65, at[1] - 3]);
  assert.equal(L.of('toy.drop').length, 1);
  assert.ok(['sniff', 'look', 'moved'].includes(L.core.getState().play.outcome));
  assert.equal(L.core.getState().play.toys.bowl.home, false);
  assert.equal(V.node('play-bowl').accessibilityLabel, 'Вернуть миску');
  assert.equal(L.core.getState().treat, 'ready', 'миска не кормит');
  // Мячик: простое касание — toy.cancel, место прежнее.
  const b = pt(L0, ball.at);
  await down(V, b);
  await up(V, [b[0] + 3, b[1]]);
  assert.deepEqual([L.of('toy.cancel').length, L.of('toy.drop').length], [1, 1]);
  assert.deepEqual(L.core.getState().play.toys.ball.at, ball.at);
  // Бросок влево на 80 точек: roll = −80 / масштаб; ядро докатило.
  await down(V, b);
  await move(V, [b[0] - 80, b[1]]);
  await up(V, [b[0] - 80, b[1]]);
  const [{ roll }] = L.of('toy.drop').at(-1);
  assert.ok(Math.abs(roll + 80 / L0.s) < 1e-9);
  assert.ok(L.core.getState().play.toys.ball.at[0] < ball.at[0]);
  // Кнопки — те же interact.
  await V.press('play-bowl');
  assert.deepEqual(L.of('interact').at(-1), [{ type: 'bowl', to: 'home' }]);
  assert.equal(L.core.getState().play.toys.bowl.home, true);
  await V.press('play-ball');
  assert.deepEqual(L.of('interact').at(-1), [{ type: 'ball', to: 'roll' }]);
  await V.press('play-stroke');
  assert.deepEqual(L.of('interact').at(-1), [{ type: 'pet' }]);
  assert.deepEqual([L.core.getState().progress.marks, L.core.getState().treat, L.scenes.calls.reserve], [1, 'ready', 0], 'ни знаков, ни лакомства, ни сценки');
  // Выход и вход — предметы на исходных местах (ядро), расстановка уголка не меняется.
  const room = JSON.stringify(L.core.getState().room.pos);
  await V.press('play-close');
  await V.fire('play-modal', 'onDismiss');
  await V.press('corner-play');
  await V.fire('corner-modal', 'onDismiss');
  assert.deepEqual(L.core.getState().play.toys.ball, ball);
  assert.equal(JSON.stringify(L.core.getState().room.pos), room);
  L.core.destroy();
});

test('катящийся мячик берут там, где он нарисован: кривая отображения (та же, что у Animated) — первая точка переноса; без движения — сразу на месте, анимаций нет', async (t) => {
  let clock = 1000;
  t.mock.method(performance, 'now', () => clock);
  const L = await lab();
  const V = mount('play-roll', tree(L));
  await V.render();
  await started(L, V);
  const L0 = await opened(L, V);
  const from = L.core.getState().play.toys.ball.at;
  const startedBefore = rn.animations.started;
  await V.press('play-ball');
  const to = L.core.getState().play.toys.ball.at;
  assert.notDeepEqual(to, from);
  assert.equal(rn.animations.started - startedBefore, 2, 'плавно: x и y');
  const ms = Math.min(900, 300 + Math.abs(to[0] - from[0]) * L0.s * 3);
  clock += ms / 2;
  const k = 1 - (1 - 0.5) ** 3;
  const mid = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
  await down(V, pt(L0, mid));
  const [toy, first] = L.of('toy.drag').at(-1);
  assert.equal(toy, 'ball');
  assert.ok(Math.abs(first[0] - mid[0]) < 1e-6 && Math.abs(first[1] - mid[1]) < 1e-6, `первая точка — нарисованная: ${first} ≈ ${mid}`);
  assert.deepEqual(L.core.getState().play.drag.from, first, 'ядро начало перенос оттуда же');
  await up(V, pt(L0, mid));
  // Без движения: место — сразу.
  await V.act(() => L.core.setPreferences({ motion: 'none' }));
  assert.equal(V.node('play-modal').animationType, 'none');
  const before = rn.animations.started;
  await V.press('play-ball');
  assert.equal(rn.animations.started, before, 'без анимации');
  L.core.destroy();
});

test('один жест: второй палец не перехватывает и не завершает первый; два окна игры одного ядра — показано одно; другое ядро не блокируется', async () => {
  const L = await lab();
  const V = mount('play-one', tree(L));
  await V.render();
  await started(L, V);
  const L0 = await opened(L, V);
  const start = pt(L0, [100, 60]);
  await down(V, start, { id: 1 });
  assert.equal(V.node('play-stage').onStartShouldSetResponder(ev(2, start)), false, 'второй жест не начинается');
  await move(V, [start[0] + 200, start[1] + 200], { id: 2, all: [{ identifier: 2, locationX: start[0] + 200, locationY: start[1] + 200 }] });
  assert.equal(L.of('stroke.step').length, 0, 'чужой палец не гладит');
  await up(V, [start[0] + 200, start[1]], { id: 2, last: false });
  assert.equal(L.of('stroke.end').length, 0, 'чужой палец не завершает');
  await move(V, [start[0] + 30, start[1]], { id: 1 });
  assert.equal(L.of('stroke.step').length, 1);
  await up(V, [start[0] + 30, start[1]], { id: 1 });
  assert.equal(L.of('stroke.end').length, 1);
  // Две поверхности игры одного ядра — окно одно.
  await V.render(h(PetProvider, { core: L.spy, pets: PETS, kits: KITS }, h(PetPlay), h(PetPlay, { testID: 'play2' })));
  await V.act(() => {});
  assert.equal([V.node('play-modal')?.visible, V.node('play2-modal')?.visible].filter(Boolean).length, 1);
  // Другое ядро — своё окно и свой жест одновременно.
  const M = await lab();
  const W = mount('play-other', tree(M));
  await W.render();
  await started(M, W);
  const M0 = await opened(M, W);
  const visibleOne = V.node('play-modal')?.visible ? 'play' : 'play2';
  const P0 = await measure(V, L, { prefix: visibleOne });
  await down(V, pt(P0, [100, 60]), { prefix: visibleOne });
  assert.equal(await down(W, pt(M0, [100, 60])), true, 'другое ядро не заблокировано');
  await move(W, [pt(M0, [100, 60])[0] + 30, pt(M0, [100, 60])[1]]);
  assert.equal(M.of('stroke.step').length, 1);
  L.core.destroy();
  M.core.destroy();
});

test('отмены: система (неактивно, фон, Android blur, onResponderTerminate) — ядру отмена, позднее отпускание ничего не вызывает, в том числе касание лапы и мячика до порога; ядро сняло жест само (другой питомец, облик, close, hide, destroy) — без команд; раскладка, смена ядра, кнопка и размонтирование — отмена', async () => {
  const L = await lab();
  const V = mount('play-cancel', tree(L));
  await V.render();
  await started(L, V);
  let L0 = await opened(L, V);
  const head = pt(L0, [100, 60]);
  const paw = pt(L0, [cat.play.paw.cx, cat.play.paw.cy]);
  const ends = () => L.of('stroke.end').length;
  const cancels = () => L.of('stroke.cancel').length;
  // iOS «неактивно» во время поглаживания.
  await stroke(V, L0, { n: 3 });
  await V.act(() => rn.emit('change', 'inactive'));
  assert.equal(cancels(), 1);
  assert.equal(L.core.getState().play.stroke, null);
  await move(V, [head[0] + 100, head[1]]);
  await up(V, head);
  assert.deepEqual([ends(), L.of('stroke.step').length], [0, 1], 'после отмены — ни step, ни end');
  await V.act(() => rn.emit('change', 'active'));
  // Касание лапы до отпускания + Android blur — лапы нет; новый жест — только после возврата фокуса окна.
  rn.platform = 'android';
  await down(V, paw, { t: 0 });
  await V.act(() => rn.emit('blur'));
  await up(V, paw, { t: 50 });
  assert.equal(L.of('interact').filter(([action]) => action.type === 'paw').length, 0, 'blur до отпускания — касания лапы нет');
  const ball = pt(L0, L.core.getState().play.toys.ball.at);
  assert.equal(await down(V, ball, { t: 60 }), false, 'фокус окна не вернулся — новый жест не начинается');
  await V.act(() => rn.emit('focus'));
  // Мячик до порога + blur: перенос у ядра снят, отпускание — не drop и не новый drag.
  await down(V, ball);
  await move(V, [ball[0] + 3, ball[1]]);
  await V.act(() => rn.emit('blur'));
  assert.equal(L.of('toy.cancel').length, 1);
  await move(V, [ball[0] + 80, ball[1]]);
  await up(V, [ball[0] + 80, ball[1]]);
  assert.deepEqual([L.of('toy.drop').length, L.of('toy.drag').length], [0, 1]);
  await V.act(() => rn.emit('focus'));
  // Фон (AppState background → ядро setVisible(false) у хоста; здесь — своя отмена).
  await stroke(V, L0, { n: 2 });
  await V.act(() => rn.emit('change', 'background'));
  await up(V, head);
  assert.equal(ends(), 0);
  await V.act(() => rn.emit('change', 'active'));
  // Система забрала касание.
  await stroke(V, L0, { n: 2 });
  await V.act(() => V.node('play-stage').onResponderTerminate(ev(1, head)));
  assert.equal(await down(V, head), true, 'замок отпущен — новый жест начинается');
  await up(V, head);
  // Ядро сняло жест само: другой облик — без команды отмены, отпускание — без end.
  const before = cancels();
  await stroke(V, L0, { n: 2 });
  await V.act(() => L.core.setAppearance({ coat: cat.coats[1].id }));
  assert.equal(L.core.getState().play.stroke, null);
  await up(V, head);
  assert.deepEqual([cancels(), ends()], [before, 1], 'только прежний end касания без сдвига выше');
  // Перенос миски и прямой close() — окно закрыто, жест забыт.
  const bowl = pt(L0, L.core.getState().play.toys.bowl.at);
  await down(V, bowl);
  await move(V, [bowl[0] + 40, bowl[1]]);
  await V.act(() => L.core.close());
  assert.equal(L.core.getState().play, null);
  assert.equal(L.of('toy.drop').length, 0);
  // Раскладка сменилась во время жеста (поворот) — отмена.
  rn.platform = 'ios';
  L0 = await opened(L, V);
  await stroke(V, L0, { n: 2 });
  const was = cancels();
  await V.fire('play-box', 'onLayout', layout(700, 300));
  assert.equal(cancels(), was + 1, 'раскладка — отмена');
  await up(V, head);
  // Кнопка во время жеста: сначала отмена, потом команда.
  L0 = await measure(V, L, { box: { width: 700, height: 300 } });
  await stroke(V, L0, { n: 1 });
  await V.press('play-stroke');
  assert.deepEqual(L.names().slice(-2), ['stroke.cancel', 'interact']);
  await up(V, head);
  // Смена ядра во время жеста: прежнему — отмена, новому — ничего.
  await stroke(V, L0, { n: 2 });
  const M = await lab();
  const was2 = cancels();
  await V.render(tree(M));
  assert.equal(cancels(), was2 + 1);
  assert.equal(M.of('stroke.start').length, 0);
  // Размонтирование во время жеста — отмена у ядра.
  await V.render(tree(L));
  await V.act(() => {});
  L0 = await opened(L, V);
  await stroke(V, L0, { n: 2 });
  const was3 = cancels();
  await V.unmount();
  assert.equal(cancels(), was3 + 1);
  assert.equal(L.live(), 0, 'подписки сняты');
  // Отключение ядра во время жеста — без ошибок и команд после destroy.
  const D = await lab();
  const X = mount('play-destroy', tree(D));
  await X.render();
  await started(D, X);
  const D0 = await opened(D, X);
  await stroke(X, D0, { n: 2 });
  await X.act(() => D.core.destroy());
  const after = D.calls.list.length;
  await X.act(() => rn.emit('change', 'inactive'));
  assert.equal(D.calls.list.length, after);
  L.core.destroy();
  M.core.destroy();
});

test('замена координатора при открытой игре: новая поверхность показывает окно и объявляет свой замер; без чужого «unsupported»; уголок и PetView не сбрасывают пол', async () => {
  const L = await lab();
  const element = (key) => tree(L, { key });
  const V = mount('play-swap', element('first'));
  await V.render();
  await started(L, V);
  await opened(L, V);
  await V.render(element('second'));
  await V.act(() => {});
  assert.deepEqual([L.core.getState().view.open, L.core.getState().display.views], ['play', ['corner', 'play']]);
  assert.equal(V.node('play-modal').visible, true, 'окно — у новой поверхности');
  const L1 = await measure(V, L, { box: { width: 400, height: 500 } });
  assert.deepEqual(L.core.getState().display.playFloor, [...L1.playFloor]);
  assert.equal(L.of('close').length, 0);
  L.core.destroy();
});

test('уменьшение движения и раскладка: окно без анимации при none и системном «уменьшить движение», fade — спокойное; insets — отступы окна; широкий экран — сцена слева, кнопки справа; длинное имя — целиком; объявления скринридеру — у координатора, одно на эффект', async () => {
  const L = await lab();
  const insets = { top: 47, right: 0, bottom: 34, left: 0 };
  const V = mount('play-layout', tree(L, { insets }));
  await V.render();
  await started(L, V);
  await V.act(() => L.core.open('play'));
  assert.equal(V.node('play-modal').animationType, 'slide');
  await V.act(() => L.core.setPreferences({ motion: 'calm' }));
  assert.equal(V.node('play-modal').animationType, 'fade');
  await V.act(() => L.core.setPreferences({ motion: 'normal' }));
  await V.act(() => L.core.setReducedMotion(true));
  assert.equal(V.node('play-modal').animationType, 'none');
  assert.equal(V.node('play-modal').statusBarTranslucent, true);
  assert.deepEqual(V.node('play-sheet').style.at(-1), { paddingTop: 47, paddingLeft: 0, paddingRight: 0 });
  // Портрет: шапка (имя и строка итога) над сценой; выше четверти окна (крупный текст) — в прокрутке под сценой, сцена — вне
  // прокрутки.
  const inScroll = () => [V.node('play-scroll').children].flat(Infinity).some((child) => child?.props?.testID === 'play-head');
  await V.fire('play-sheet', 'onLayout', layout(390, 844));
  await V.fire('play-head', 'onLayout', layout(390, 120));
  assert.equal(inScroll(), false, 'обычный текст — шапка над сценой');
  await V.fire('play-head', 'onLayout', layout(390, 560));
  assert.equal(inScroll(), true, 'крупный текст — шапка в прокрутке под сценой');
  assert.equal(V.node('play-scroll').style.at(-1).maxHeight, 422);
  assert.equal(V.node('play-line').maxFontSizeMultiplier, 1.5, 'строка реплики — не крупнее 1,5 системного размера');
  assert.equal(V.node('play-hint').maxFontSizeMultiplier, undefined, 'итог — без ограничения');
  await V.fire('play-head', 'onLayout', layout(358, 150));
  assert.equal(inScroll(), false);
  // Широкий экран: сцена и колонка рядом (прокрутка — только у колонки).
  await V.fire('play-sheet', 'onLayout', layout(844, 390));
  assert.equal(V.has('play-scroll'), true);
  const name = 'Ш'.repeat(24);
  await V.act(() => L.core.setName(name));
  assert.equal(V.text('play-title'), name);
  assert.ok(V.has('play-fit-1') && V.text('play-fit-1').startsWith(name), 'образцы итога — с длинным именем');
  rn.announced.length = 0;
  L.effects.length = 0;
  await V.act(() => L.core.setReducedMotion(false));
  const L0 = await measure(V, L, { box: { width: 500, height: 330 } });
  await stroke(V, L0, { n: 2 });
  await up(V, pt(L0, [100, 60]));
  assert.deepEqual(rn.announced, L.effects.filter((effect) => effect.type === 'announce').map((effect) => effect.text));
  assert.equal(rn.announced.length, 1);
  L.core.destroy();
});

test('порт резервирования сценок подключён (контроль: объявленная сценка и занятие — резервирование есть), а открытие, вызов, жесты и закрытие игры дня не расходуют', async () => {
  // Контроль порта без координатора: сценка объявлена, занятие — резервирование вызвано.
  const C = await lab();
  C.core.setDisplay({ full: true, pets: ['cat', 'dog'], views: ['play'], scenes: { cat: ['stretch'] } });
  C.core.start();
  C.plan.advance(8000);
  C.counts.set(1, 1);
  C.rand.push(0, 0, 0);
  C.core.notify('saved', { key: 'a1', counted: true });
  assert.equal(C.core.getState().scene.waiting?.type, 'stretch', 'контроль: попытка выбрана');
  C.plan.advance(3000);
  await turn();
  assert.ok(C.scenes.calls.reserve >= 1, `контроль: ${C.scenes.calls.reserve}`);
  C.core.destroy();
  // Игра в координаторе: open, вызов, жест, кнопки, закрытие — ноль, хотя случайность разрешила бы сценку.
  const L = await lab();
  L.rand.push(0, 0, 0, 0, 0, 0);
  const V = mount('play-reserve', tree(L));
  await V.render();
  await started(L, V);
  const L0 = await opened(L, V);
  await stroke(V, L0, { n: 3 });
  await up(V, pt(L0, [100, 60]));
  await V.press('play-ball');
  await V.press('play-close');
  await V.act(() => L.core.setPresence('on-call'));
  await V.fire('play-modal', 'onDismiss');
  await V.act(() => L.core.close());
  await V.fire('corner-modal', 'onDismiss');
  await V.press('play-call');
  await V.press('play-close');
  await V.act(() => L.plan.advance(60_000));
  assert.equal(L.scenes.calls.reserve, 0);
  assert.deepEqual(L.core.getState().display.scenes, { cat: ['stretch', 'curl'], dog: ['fetch'] }, 'сценки наборов объявлены (PL10.2.4) — и всё равно игра дня не расходует');
  L.core.destroy();
});

// ---------- доработка PL10.2.2 после независимой проверки Codex ----------

// Обе координаты предмета toy (Animated.Value узла предмета; узел есть, пока предмет на сцене) и идущие анимации этих значений.
const toyValues = (V, toy = 'ball', prefix = 'play') => {
  const [{ translateX: x }, { translateY: y }] = V.node(`${prefix}-toy-${toy}`).style.transform;
  return [x, y];
};
const runsOf = (values) => [...rn.animations.live].filter((run) => run.steps.some((step) => values.includes(step.value)));
// Катнуть мячик кнопкой; контроль — ядро передвинуло мячик, и движение действительно идёт по обеим координатам.
async function rolling(V, L, prefix = 'play') {
  const values = toyValues(V, 'ball', prefix);
  const before = L.core.getState().play.toys.ball.at;
  await V.press(`${prefix}-ball`);
  assert.notDeepEqual(L.core.getState().play.toys.ball.at, before, 'контроль: мячик покатился (ядро)');
  const runs = runsOf(values);
  assert.equal(runs.length, 2, 'контроль: идут обе координаты');
  assert.ok(runs.every((run) => run.live));
  return { values, runs };
}
// Место предмета по снимку ядра — левый верх его рамки в точках сцены; нарисованное место — значения обеих координат.
const placeOf = (L, L0, toy = 'ball') => {
  const box = G.toyBox(L0, toy, L.core.getState().play.toys[toy].at);
  return [box.left, box.top];
};
const sameAt = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

test('P2-1: начатое движение мячика (обе координаты) снимается системным «уменьшить движение», motion: none, фоном (AppState и видимость ядра у хоста) — мячик сразу на месте снимка, возврат не доигрывает прежнее, захват — по нарисованному месту; закрытие, нулевая раскладка, смена ядра (и с открытой игрой на тех же местах), отключение и размонтирование — тоже', async () => {
  const L = await lab();
  const V = mount('play-motion', tree(L));
  await V.render();
  await started(L, V);
  let L0 = await opened(L, V);
  const causes = [
    ['системное «уменьшить движение»', () => L.core.setReducedMotion(true), () => L.core.setReducedMotion(false)],
    ['motion: none', () => L.core.setPreferences({ motion: 'none' }), () => L.core.setPreferences({ motion: 'normal' })],
    ['фон (AppState)', () => rn.emit('change', 'background'), () => rn.emit('change', 'active')],
    ['фон у хоста (setVisible)', () => L.core.setVisible(false), () => L.core.setVisible(true)],
  ];
  for (const [what, cause, undo] of causes) {
    const { values, runs } = await rolling(V, L);
    await V.act(cause);
    assert.ok(runs.every((run) => !run.live), `${what}: обе координаты сняты`);
    assert.ok(sameAt(values.map((value) => value.value), placeOf(L, L0)), `${what}: мячик на месте снимка`);
    await V.act(undo);
    assert.deepEqual(runsOf(values), [], `${what}: возврат не доигрывает прежнее движение`);
    assert.ok(sameAt(values.map((value) => value.value), placeOf(L, L0)), `${what}: место прежнее`);
    // Нарисован там же, где ядро: захват с этого места — первая точка переноса и есть место снимка.
    const at = L.core.getState().play.toys.ball.at;
    assert.equal(await down(V, pt(L0, at)), true, `${what}: мячик берут на месте снимка`);
    assert.deepEqual(L.of('toy.drag').at(-1), ['ball', at]);
    await up(V, pt(L0, at));
  }
  // Закрытие во время движения: сняты; новое открытие — предметы на местах ядра без прежнего движения.
  let roll = await rolling(V, L);
  await V.act(() => L.core.close());
  assert.ok(roll.runs.every((run) => !run.live), 'закрытие — сняты');
  L0 = await opened(L, V);
  assert.deepEqual(runsOf(roll.values), []);
  assert.ok(sameAt(roll.values.map((value) => value.value), placeOf(L, L0)), 'новое открытие — на месте снимка');
  // Нулевая раскладка (сцену сжали до нуля) во время движения — сняты; новый замер — место сразу.
  roll = await rolling(V, L);
  await V.fire('play-box', 'onLayout', layout(0, 0));
  assert.ok(roll.runs.every((run) => !run.live), 'нулевая раскладка — сняты');
  L0 = await measure(V, L);
  assert.deepEqual(runsOf(roll.values), []);
  // Смена ядра, у которого игра открыта и мячик на тех же местах: движение прежнего снято, у нового — место сразу.
  roll = await rolling(V, L);
  const M = await lab();
  await V.act(() => M.core.start());
  await V.act(() => M.plan.advance(8000));
  await V.render(tree(M));
  assert.ok(roll.runs.every((run) => !run.live), 'смена ядра — движение прежнего снято');
  await V.act(() => M.core.open('play'));
  const M0 = await measure(V, M);
  assert.deepEqual(runsOf(roll.values), [], 'новое ядро — без движения от мест прежнего');
  assert.ok(sameAt(roll.values.map((value) => value.value), placeOf(M, M0)));
  // Отключение ядра во время движения — сняты.
  roll = await rolling(V, M);
  await V.act(() => M.core.destroy());
  assert.ok(roll.runs.every((run) => !run.live), 'отключение — сняты');
  // Смена ядра, у которого игра уже открыта на том же полу (объявил хост), а мячик — на своём месте: движение прежнего
  // снято, у нового мячик сразу на месте его снимка — без кривой от нарисованного места прежнего.
  await V.render(tree(L));
  L0 = await opened(L, V);
  roll = await rolling(V, L);
  const N = await lab();
  await V.act(() => N.core.start());
  await V.act(() => N.plan.advance(8000));
  N.core.setDisplay({ full: true, moving: false, pets: ['cat', 'dog'], views: ['corner', 'play'], scenes: {}, playFloor: [...L0.playFloor], playTouch: L0.playTouch });
  assert.equal(N.core.open('play').ok, true);
  await V.render(tree(N));
  assert.equal(V.node('play-modal').visible, true, 'контроль: окно нового ядра показано сразу');
  assert.ok(roll.runs.every((run) => !run.live), 'смена на открытую игру — движение прежнего снято');
  assert.deepEqual(runsOf(roll.values), [], 'без движения от места прежнего ядра');
  assert.ok(sameAt(roll.values.map((value) => value.value), placeOf(N, L0)), 'мячик — на месте снимка нового ядра');
  // Размонтирование во время движения — сняты.
  roll = await rolling(V, N);
  await V.unmount();
  assert.ok(roll.runs.every((run) => !run.live), 'размонтирование — сняты');
  L.core.destroy();
  N.core.destroy();
});

test('P2-1: поздний отклик прежнего движения не трогает новое (захват — по кривой нового); отказ команды, другие команды и отказ переноса движение не снимают; другое ядро и другая поверхность — своё движение', async (t) => {
  let clock = 1000;
  t.mock.method(performance, 'now', () => clock);
  const L = await lab();
  const V = mount('play-motion-late', tree(L));
  await V.render();
  await started(L, V);
  const L0 = await opened(L, V);
  // Первое катание, через 150 мс — второе: прежние анимации сняты (их отклик — finished: false), новые идут.
  const first = await rolling(V, L);
  clock += 150;
  const second = await rolling(V, L);
  assert.ok(first.runs.every((run) => !run.live), 'прежние сняты');
  // Начало второго движения — нарисованное место на момент нажатия (значения координат сразу после него), конец — место
  // снимка; длительность — у его анимаций.
  const frame = G.toyBox(L0, 'ball', [0, 0]);
  const from = G.toUnits(L0, [second.values[0].value + frame.width / 2, second.values[1].value + frame.height / 2]);
  const to = L.core.getState().play.toys.ball.at;
  const ms = second.runs[0].steps[0].duration;
  // Поздний «закончилась» прежней анимации пришёл после начала новой — модель новой остаётся.
  for (const run of first.runs) run.late({ finished: true });
  // Отказы команд (неверный предмет и место) и другие команды («Погладить», перенос миски хостом) — движение идёт.
  assert.equal(L.core.interact({ type: 'ball', to: 0 }).ok, false);
  assert.equal(L.core.toy.drag('ball', [Number.NaN, 0]).ok, false);
  await V.press('play-stroke');
  await V.act(() => L.core.toy.drag('bowl', L.core.getState().play.toys.bowl.at));
  await V.act(() => L.core.toy.cancel());
  assert.ok(second.runs.every((run) => run.live), 'отказы и другие команды движение не трогают');
  // Захват посередине второго движения: первая точка переноса — по его кривой (не конечное место: модель не снята).
  clock += ms / 2;
  const k = 1 - (1 - 0.5) ** 3;
  const mid = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
  assert.ok(Math.abs(mid[0] - to[0]) > 1, 'контроль: середина пути отличается от конца');
  await down(V, pt(L0, mid));
  const [toy, firstPoint] = L.of('toy.drag').at(-1);
  assert.equal(toy, 'ball');
  assert.ok(sameAt(firstPoint, mid), `первая точка — по кривой нового движения: ${firstPoint} ≈ ${mid}`);
  await up(V, pt(L0, mid));
  // Другое ядро: «уменьшить движение» одного не останавливает другое.
  const M = await lab();
  const W = mount('play-motion-other', tree(M));
  await W.render();
  await started(M, W);
  await opened(M, W);
  const mine = await rolling(V, L);
  const other = await rolling(W, M);
  await V.act(() => L.core.setReducedMotion(true));
  assert.ok(mine.runs.every((run) => !run.live));
  assert.ok(other.runs.every((run) => run.live), 'другое ядро — своё движение');
  L.core.destroy();
  M.core.destroy();
});

// ---------- доработка PL10.2.2 после повторной проверки Codex: отклики координат порознь ----------

// Анимации движения по координатам (0 — x, 1 — y): отклики «закончилась» x и y приходят порознь.
const axesOf = (values, runs) => values.map((value) => runs.find((run) => run.steps[0].value === value));
// Две точки пола для миски (единицы рисунка, внутри пределов пола у кота): перенос хостом между ними движет обе координаты.
const BOWL_AT = [
  [20, 210],
  [45, 232],
];
// Начать движение предмета toy: мячик — кнопкой «Катнуть мячик» (движется только x), миска — хостом в дальнюю из BOWL_AT.
// Контроль — ядро передвинуло предмет, и идут анимации обеих координат; from — значения координат в начале движения.
async function movement(V, L, toy, prefix = 'play') {
  const values = toyValues(V, toy, prefix);
  const before = L.core.getState().play.toys[toy].at;
  if (toy === 'ball') await V.press(`${prefix}-ball`);
  else {
    const far = BOWL_AT.reduce((a, b) => (Math.hypot(b[0] - before[0], b[1] - before[1]) > Math.hypot(a[0] - before[0], a[1] - before[1]) ? b : a));
    let result = null;
    await V.act(() => {
      result = L.core.interact({ type: 'bowl', to: far });
    });
    assert.equal(result.ok, true, 'контроль: миска передвинута хостом');
  }
  assert.notDeepEqual(L.core.getState().play.toys[toy].at, before, 'контроль: предмет передвинут (ядро)');
  const runs = runsOf(values);
  assert.equal(runs.length, 2, 'контроль: идут обе координаты');
  const axes = axesOf(values, runs);
  assert.ok(axes.every((run) => run?.live), 'контроль: у каждой координаты своя идущая анимация');
  return { values, runs, axes, from: values.map((value) => value.value) };
}
// Команды ввода игры, которые отображение отдало ядру после отметки mark (снятие движения их не вызывает).
const inputSince = (L, mark) => L.names().slice(mark).filter((name) => /^(toy\.|stroke\.|interact$)/.test(name));

test('P2-1: отклики координат порознь — закончилась одна (y или x), другая ещё идёт: системное «уменьшить движение» и motion: none снимают оставшуюся, предмет сразу на месте снимка, возврат не доигрывает; ни toy.*, ни interact, места ядра прежние; захват после отклика одной — по нарисованному месту, без скачка', async (t) => {
  let clock = 1000;
  t.mock.method(performance, 'now', () => clock);
  const L = await lab();
  const V = mount('play-axes', tree(L));
  await V.render();
  await started(L, V);
  const L0 = await opened(L, V);
  const causes = [
    ['системное «уменьшить движение»', () => L.core.setReducedMotion(true), () => L.core.setReducedMotion(false)],
    ['motion: none', () => L.core.setPreferences({ motion: 'none' }), () => L.core.setPreferences({ motion: 'normal' })],
  ];
  // Предмет и координата, чья анимация закончилась первой: мячик — y (сценарий проверки Codex), миска — y и x (у неё
  // движутся обе, поэтому оставшаяся действительно не на цели в обоих порядках).
  const cases = [
    ['ball', 1],
    ['bowl', 1],
    ['bowl', 0],
  ];
  for (const [toy, first] of cases)
    for (const [what, cause, undo] of causes) {
      const label = `${toy}, первой закончилась ${first ? 'y' : 'x'}, ${what}`;
      const { values, axes } = await movement(V, L, toy);
      const [done, rest] = [axes[first], axes[1 - first]];
      assert.notEqual(rest.steps[0].value.value, rest.steps[0].toValue, `${label}: контроль — оставшаяся координата не на цели`);
      await V.act(() => done.end({ finished: true }));
      assert.equal(done.live, false, `${label}: контроль — первая закончилась`);
      assert.equal(rest.live, true, `${label}: контроль — оставшаяся ещё идёт`);
      const toys = JSON.stringify(L.core.getState().play.toys);
      const mark = L.names().length;
      await V.act(cause);
      assert.equal(rest.live, false, `${label}: оставшаяся координата снята`);
      assert.deepEqual(runsOf(values), [], `${label}: идущих анимаций предмета нет`);
      assert.ok(sameAt(values.map((value) => value.value), placeOf(L, L0, toy)), `${label}: сразу на месте снимка`);
      assert.deepEqual(inputSince(L, mark), [], `${label}: ни toy.*, ни interact`);
      assert.equal(JSON.stringify(L.core.getState().play.toys), toys, `${label}: места ядра прежние`);
      await V.act(undo);
      assert.deepEqual(runsOf(values), [], `${label}: возврат не доигрывает прежнее движение`);
      assert.ok(sameAt(values.map((value) => value.value), placeOf(L, L0, toy)), `${label}: место прежнее`);
    }
  // Захват после отклика одной координаты — там, где предмет нарисован: закончившаяся — на своей цели, оставшаяся — по
  // кривой; ядро берёт предмет с этого места (первая точка переноса).
  for (const [toy, first] of [
    ['ball', 1],
    ['bowl', 0],
  ]) {
    const { axes, from: start } = await movement(V, L, toy);
    const frame = G.toyBox(L0, toy, [0, 0]);
    const from = G.toUnits(L0, [start[0] + frame.width / 2, start[1] + frame.height / 2]);
    const to = L.core.getState().play.toys[toy].at;
    const ms = axes[0].steps[0].duration;
    await V.act(() => axes[first].end({ finished: true }));
    clock += ms * 0.2;
    const e = 1 - (1 - 0.2) ** 3;
    const drawn = [0, 1].map((i) => (i === first ? to[i] : from[i] + (to[i] - from[i]) * e));
    assert.ok(Math.abs(drawn[1 - first] - to[1 - first]) > 1, `${toy}: контроль — оставшаяся координата далеко от цели`);
    assert.equal(await down(V, pt(L0, drawn)), true, `${toy}: под пальцем — там, где нарисован`);
    const [took, point] = L.of('toy.drag').at(-1);
    assert.equal(took, toy);
    assert.ok(sameAt(point, drawn), `${toy}: первая точка переноса — нарисованное место: ${point} ≈ ${drawn}`);
    assert.equal(axes[1 - first].live, false, `${toy}: перенос снял оставшуюся координату`);
    await up(V, pt(L0, drawn));
  }
  // Обе координаты закончились сами — мячик на цели; затем без движения мгновенная перестановка — берут на новом месте
  // снимка, а не на цели прежней кривой.
  const done = await movement(V, L, 'ball');
  await V.act(() => {
    for (const run of done.axes) run.end({ finished: true });
  });
  assert.deepEqual(runsOf(done.values), [], 'контроль: обе закончились');
  let at = L.core.getState().play.toys.ball.at;
  assert.equal(await down(V, pt(L0, at)), true, 'закончилось само — под пальцем на цели');
  assert.ok(sameAt(L.of('toy.drag').at(-1)[1], at), 'первая точка переноса — цель');
  await up(V, pt(L0, at));
  await V.act(() => L.core.setPreferences({ motion: 'none' }));
  await V.press('play-ball');
  assert.notDeepEqual(L.core.getState().play.toys.ball.at, at, 'контроль: мячик переставлен (ядро)');
  assert.deepEqual(runsOf(done.values), [], 'без движения — анимаций нет');
  at = L.core.getState().play.toys.ball.at;
  assert.ok(sameAt(done.values.map((value) => value.value), placeOf(L, L0)), 'нарисован на новом месте снимка');
  assert.equal(await down(V, pt(L0, at)), true, 'мгновенная перестановка — под пальцем на новом месте');
  assert.ok(sameAt(L.of('toy.drag').at(-1)[1], at), 'первая точка переноса — новое место');
  await up(V, pt(L0, at));
  await V.act(() => L.core.destroy());
});

test('P2-1: отклики координат порознь — поздние отклики прежнего движения не трогают новое; после отклика одной координаты оставшуюся снимают фон (AppState и видимость ядра у хоста), закрытие, нулевая раскладка, смена ядра, отключение и размонтирование; независимые экземпляры — каждый своё', async () => {
  const L = await lab();
  const V = mount('play-axes-more', tree(L));
  await V.render();
  await started(L, V);
  let L0 = await opened(L, V);
  // Прежнее движение: y закончилась, x снята новым. Поздние «закончилась» прежних x и y приходят после начала нового — оно
  // идёт обеими координатами; затем закончилась y нового — «уменьшить движение» снимает его x.
  const old = await movement(V, L, 'bowl');
  await V.act(() => old.axes[1].end({ finished: true }));
  const next = await movement(V, L, 'bowl');
  assert.equal(old.axes[0].live, false, 'новое движение сняло прежнюю x');
  for (const run of old.axes) run.late({ finished: true });
  assert.ok(next.runs.every((run) => run.live), 'поздние отклики прежнего новое не трогают');
  await V.act(() => next.axes[1].end({ finished: true }));
  old.axes[1].late({ finished: true });
  assert.equal(next.axes[0].live, true, 'контроль: x нового ещё идёт');
  await V.act(() => L.core.setReducedMotion(true));
  assert.equal(next.axes[0].live, false, 'x нового снята');
  assert.ok(sameAt(next.values.map((value) => value.value), placeOf(L, L0, 'bowl')), 'миска на месте снимка');
  await V.act(() => L.core.setReducedMotion(false));
  // Мячик: закончилась y, x ещё идёт.
  const partial = async (M, W) => {
    const roll = await movement(W, M, 'ball');
    await W.act(() => roll.axes[1].end({ finished: true }));
    assert.equal(roll.axes[0].live, true, 'контроль: x ещё идёт');
    return roll;
  };
  for (const [what, cause, undo] of [
    ['фон (AppState)', () => rn.emit('change', 'background'), () => rn.emit('change', 'active')],
    ['фон у хоста (setVisible)', () => L.core.setVisible(false), () => L.core.setVisible(true)],
  ]) {
    const roll = await partial(L, V);
    const mark = L.names().length;
    await V.act(cause);
    assert.equal(roll.axes[0].live, false, `${what}: оставшаяся x снята`);
    assert.ok(sameAt(roll.values.map((value) => value.value), placeOf(L, L0)), `${what}: на месте снимка`);
    await V.act(undo);
    assert.deepEqual(runsOf(roll.values), [], `${what}: возврат не доигрывает`);
    assert.deepEqual(inputSince(L, mark), [], `${what}: ни toy.*, ни interact`);
  }
  let roll = await partial(L, V);
  await V.act(() => L.core.close());
  assert.equal(roll.axes[0].live, false, 'закрытие — оставшаяся x снята');
  L0 = await opened(L, V);
  assert.deepEqual(runsOf(roll.values), []);
  assert.ok(sameAt(roll.values.map((value) => value.value), placeOf(L, L0)), 'новое открытие — на месте снимка');
  roll = await partial(L, V);
  await V.fire('play-box', 'onLayout', layout(0, 0));
  assert.equal(roll.axes[0].live, false, 'нулевая раскладка — оставшаяся x снята');
  L0 = await measure(V, L);
  assert.deepEqual(runsOf(roll.values), []);
  // Независимые экземпляры (свои ядра и поверхности): у одного закончилась y, у другого идут обе — «уменьшить движение»
  // первого снимает только его x; отклик и motion: none второго первый не трогают.
  const A = await lab();
  const VA = mount('play-axes-a', tree(A));
  await VA.render();
  await started(A, VA);
  await opened(A, VA);
  const B = await lab();
  const VB = mount('play-axes-b', tree(B));
  await VB.render();
  await started(B, VB);
  await opened(B, VB);
  const a = await partial(A, VA);
  const b = await movement(VB, B, 'ball');
  await VA.act(() => A.core.setReducedMotion(true));
  assert.equal(a.axes[0].live, false, 'первый — x снята');
  assert.ok(b.runs.every((run) => run.live), 'второй — своё движение');
  await VB.act(() => b.axes[1].end({ finished: true }));
  assert.equal(b.axes[0].live, true, 'второй — x ещё идёт');
  await VB.act(() => B.core.setPreferences({ motion: 'none' }));
  assert.equal(b.axes[0].live, false, 'второй — motion: none снял свою x');
  await VA.act(() => A.core.destroy());
  await VB.act(() => B.core.destroy());
  // Смена ядра, отключение и размонтирование после отклика одной координаты — оставшаяся снята.
  roll = await partial(L, V);
  const M = await lab();
  await V.act(() => M.core.start());
  await V.act(() => M.plan.advance(8000));
  await V.render(tree(M));
  assert.equal(roll.axes[0].live, false, 'смена ядра — оставшаяся x прежнего снята');
  await opened(M, V);
  assert.deepEqual(runsOf(roll.values), [], 'новое ядро — без движения от мест прежнего');
  roll = await partial(M, V);
  await V.act(() => M.core.destroy());
  assert.equal(roll.axes[0].live, false, 'отключение — оставшаяся x снята');
  await V.render(tree(L));
  await opened(L, V);
  roll = await partial(L, V);
  await V.unmount();
  assert.equal(roll.axes[0].live, false, 'размонтирование — оставшаяся x снята');
  L.core.destroy();
});

test('P2-2: системная отмена без отпускания — inactive → active и background → active без старых End/Release/Terminate: новый жест (другим пальцем и тем же identifier) без закрытия игры; пока неактивно — не начинается ни через Grant, ни через onResponderStart; поздние события прежнего касания не гладят и не завершают новый; повтор событий безопасен; ни лапы, ни drop отменённого', async () => {
  const L = await lab();
  const V = mount('play-recover', tree(L));
  await V.render();
  await started(L, V);
  const L0 = await opened(L, V);
  const head = pt(L0, [100, 60]);
  const stage = () => V.node('play-stage');
  for (const away of ['inactive', 'background']) {
    const base = { start: L.of('stroke.start').length, cancel: L.of('stroke.cancel').length, end: L.of('stroke.end').length };
    await stroke(V, L0, { n: 2, t: 0, id: 1 });
    await V.act(() => rn.emit('change', away));
    await V.act(() => rn.emit('change', away));
    assert.equal(L.core.getState().play.stroke, null, `${away}: жест ядра снят`);
    assert.equal(L.of('stroke.cancel').length, base.cancel + 1, `${away}: одна отмена и при повторе события`);
    // Пока неактивно — новый жест не начинается ни через Grant, ни через onResponderStart (сцена осталась ответчиком).
    assert.equal(await down(V, head, { id: 2, t: 500 }), false, `${away}: Grant — нет`);
    await V.act(() => stage().onResponderStart(ev(2, head, 500)));
    assert.equal(L.of('stroke.start').length, base.start + 1, `${away}: onResponderStart — нет`);
    await V.act(() => rn.emit('change', 'active'));
    await V.act(() => rn.emit('change', 'active'));
    // Старых End/Release/Terminate не было; новый палец — новый жест без закрытия игры.
    assert.equal(await down(V, head, { id: 2, t: 1000 }), true, `${away}: после возврата новый жест начинается`);
    assert.equal(L.of('stroke.start').length, base.start + 2);
    // Позднее движение и отпускание прежнего пальца (id 1) — ни step, ни end нового.
    const steps = L.of('stroke.step').length;
    await move(V, [head[0] + 60, head[1]], { id: 1, t: 1010 });
    await up(V, [head[0] + 60, head[1]], { id: 1, t: 1020, last: false });
    assert.deepEqual([L.of('stroke.step').length, L.of('stroke.end').length], [steps, base.end], `${away}: события прежнего пальца не действуют`);
    await move(V, [head[0] + 30, head[1]], { id: 2, t: 1030 });
    await up(V, [head[0] + 30, head[1]], { id: 2, t: 1040 });
    assert.deepEqual([L.of('stroke.step').length, L.of('stroke.end').length], [steps + 1, base.end + 1], `${away}: новый жест гладит и завершается`);
    // Тот же identifier новой последовательностью: запоздавшее отпускание прежней (старше начала) новый не завершает.
    await stroke(V, L0, { n: 1, t: 2000, id: 1 });
    await V.act(() => rn.emit('change', away));
    await V.act(() => rn.emit('change', 'active'));
    assert.equal(await down(V, head, { id: 1, t: 3000 }), true, `${away}: тот же номер пальца — новый жест`);
    await up(V, head, { id: 1, t: 2500 });
    await V.act(() => stage().onResponderTerminate(ev(1, head, 2600)));
    assert.equal(L.core.getState().play.stroke !== null, true, `${away}: старые отпускание и terminate новый не снимают`);
    await move(V, [head[0] + 30, head[1]], { id: 1, t: 3030 });
    await up(V, [head[0] + 30, head[1]], { id: 1, t: 3100 });
    assert.equal(L.core.getState().play.stroke, null);
    assert.equal(L.of('stroke.end').length, base.end + 2, `${away}: новый завершился своим отпусканием`);
  }
  // Касание лапы и мячик до порога, прерванные системой: ни лапы, ни drop — ни сразу, ни поздним отпусканием; после
  // возврата касание лапы и бросок работают.
  const paw = pt(L0, [cat.play.paw.cx, cat.play.paw.cy]);
  const paws = () => L.of('interact').filter(([action]) => action.type === 'paw').length;
  await down(V, paw, { id: 1, t: 5000 });
  await V.act(() => rn.emit('change', 'inactive'));
  await V.act(() => rn.emit('change', 'active'));
  await up(V, paw, { id: 1, t: 5100 });
  assert.equal(paws(), 0, 'отменённое касание лапы — не лапа');
  const ball = pt(L0, L.core.getState().play.toys.ball.at);
  await down(V, ball, { id: 1, t: 6000 });
  await move(V, [ball[0] - 3, ball[1]], { id: 1, t: 6010 });
  await V.act(() => rn.emit('change', 'background'));
  assert.equal(L.core.getState().play.drag, null, 'перенос у ядра снят');
  await V.act(() => rn.emit('change', 'active'));
  await move(V, [ball[0] - 80, ball[1]], { id: 1, t: 6050 });
  await up(V, [ball[0] - 80, ball[1]], { id: 1, t: 6100 });
  assert.equal(L.of('toy.drop').length, 0, 'отменённый мячик — не бросок');
  await down(V, paw, { id: 3, t: 7000 });
  await up(V, paw, { id: 3, t: 7100 });
  assert.equal(paws(), 1, 'после возврата — касание лапы');
  await down(V, ball, { id: 4, t: 8000 });
  await move(V, [ball[0] - 80, ball[1]], { id: 4, t: 8050 });
  await up(V, [ball[0] - 80, ball[1]], { id: 4, t: 8100 });
  assert.equal(L.of('toy.drop').length, 1, 'после возврата — бросок');
  // Настоящий перенос миски прерван системой: toy.cancel, миска на месте до жеста; позднее отпускание — не drop.
  await V.act(() => L.core.interact({ type: 'bowl', to: 'home' }));
  const home = L.core.getState().play.toys.bowl.at;
  const bowl = pt(L0, home);
  await down(V, bowl, { id: 5, t: 9000 });
  await move(V, [bowl[0] + 50, bowl[1]], { id: 5, t: 9050 });
  assert.equal(L.core.getState().play.drag?.toy, 'bowl');
  await V.act(() => rn.emit('change', 'inactive'));
  assert.deepEqual([L.core.getState().play.drag, L.core.getState().play.toys.bowl.at], [null, home]);
  await V.act(() => rn.emit('change', 'active'));
  await up(V, [bowl[0] + 50, bowl[1]], { id: 5, t: 9100 });
  assert.equal(L.of('toy.drop').length, 1, 'позднее отпускание миски — не drop');
  L.core.destroy();
});

test('P2-2: Android blur во время жеста при AppState active — жест снят, новые не начинаются до focus (поздний move/release под шторкой ничего не делает), focus — ввод без закрытия игры; blur без жеста ввод не приостанавливает (фокус Activity забирает и само окно игры); onResponderStart: новый палец, пока сцена ответчик, — жест, второй палец при живом — ничего; terminate текущего — снят', async () => {
  rn.platform = 'android';
  const L = await lab();
  const V = mount('play-blur', tree(L));
  await V.render();
  await started(L, V);
  const L0 = await opened(L, V);
  const head = pt(L0, [100, 60]);
  const stage = () => V.node('play-stage');
  await stroke(V, L0, { n: 2, t: 0, id: 1 });
  await V.act(() => rn.emit('blur'));
  assert.deepEqual([L.core.getState().play.stroke, rn.listeners.change.size > 0], [null, true]);
  assert.equal(rn.AppState.currentState, 'active', 'AppState остаётся active');
  // Под шторкой прежний палец продолжает (проба 18.10): ни step, ни end; новый палец — не начинается до focus.
  const steps = L.of('stroke.step').length;
  await move(V, [head[0] + 80, head[1]], { id: 1, t: 200 });
  await up(V, [head[0] + 80, head[1]], { id: 1, t: 300 });
  assert.deepEqual([L.of('stroke.step').length, L.of('stroke.end').length], [steps, 0]);
  assert.equal(await down(V, head, { id: 2, t: 400 }), false, 'до focus — нет');
  await V.act(() => stage().onResponderStart(ev(2, head, 400)));
  assert.equal(L.of('stroke.start').length, 1);
  await V.act(() => rn.emit('focus'));
  assert.equal(await down(V, head, { id: 2, t: 500 }), true, 'focus — новый жест');
  await up(V, head, { id: 2, t: 560 });
  // blur без жеста (фокус Activity ушёл, например, к самому окну игры) — ввод не приостановлен.
  await V.act(() => rn.emit('blur'));
  assert.equal(await down(V, head, { id: 3, t: 600 }), true, 'blur без жеста — ввод есть');
  await up(V, head, { id: 3, t: 650 });
  await V.act(() => rn.emit('focus'));
  // Прерванное касание без отпускания, сцена у React Native осталась ответчиком: новый палец приходит в onResponderStart.
  await stroke(V, L0, { n: 1, t: 1000, id: 0 });
  await V.act(() => rn.emit('change', 'inactive'));
  await V.act(() => rn.emit('change', 'active'));
  const started0 = L.of('stroke.start').length;
  await V.act(() => stage().onResponderStart(ev(0, head, 2000)));
  assert.equal(L.of('stroke.start').length, started0 + 1, 'onResponderStart тем же номером пальца — новый жест');
  // Второй палец при живом жесте — ни нового жеста, ни отмены.
  await V.act(() => stage().onResponderStart(ev(1, head, 2010)));
  assert.equal(L.of('stroke.start').length, started0 + 1);
  await move(V, [head[0] + 30, head[1]], { id: 0, t: 2030 });
  assert.equal(L.of('stroke.step').length, steps + 1);
  // Ответчик отнят сейчас (не старше начала) — жест снят, замок отпущен.
  await V.act(() => stage().onResponderTerminate(ev(0, head, 2040)));
  assert.equal(L.core.getState().play.stroke, null);
  assert.equal(await down(V, head, { id: 0, t: 2100 }), true, 'после terminate — новый жест');
  await up(V, head, { id: 0, t: 2150 });
  L.core.destroy();
});

test('P2-2: приостановка — на окно и экземпляр: закрытие при неактивном приложении и новое открытие после active — ввод есть; смена ядра, питомца и размонтирование после системной отмены — без команд и ошибок; второе ядро не затронуто blur первого; отключённое ядро — без команд', async () => {
  rn.platform = 'android';
  const L = await lab();
  const V = mount('play-pause-own', tree(L));
  await V.render();
  await started(L, V);
  let L0 = await opened(L, V);
  const M = await lab();
  const W = mount('play-pause-other', tree(M));
  await W.render();
  await started(M, W);
  const M0 = await opened(M, W);
  // blur во время жеста первого — второе ядро (без жеста) принимает касания.
  await stroke(V, L0, { n: 1, t: 0, id: 1 });
  await V.act(() => rn.emit('blur'));
  assert.equal(await down(W, pt(M0, [100, 60]), { t: 10 }), true, 'другое ядро не приостановлено');
  await up(W, pt(M0, [100, 60]), { t: 20 });
  await V.act(() => rn.emit('focus'));
  // Неактивно, окно закрыто, active пришёл при закрытом окне — новое окно начинает с текущего состояния.
  await stroke(V, L0, { n: 1, t: 100, id: 1 });
  await V.act(() => rn.emit('change', 'inactive'));
  await V.act(() => L.core.close());
  await V.act(() => rn.emit('change', 'active'));
  L0 = await opened(L, V);
  assert.equal(await down(V, pt(L0, [100, 60]), { id: 2, t: 1000 }), true, 'новое окно — ввод есть');
  await up(V, pt(L0, [100, 60]), { id: 2, t: 1050 });
  // Окно открыто, пока приложение неактивно (событие пришло при закрытом окне): ввод — только после active.
  await V.act(() => L.core.close());
  await V.act(() => rn.emit('change', 'inactive'));
  L0 = await opened(L, V);
  assert.equal(await down(V, pt(L0, [100, 60]), { id: 2, t: 1100 }), false, 'открыто при неактивном — ввода нет');
  await V.act(() => rn.emit('change', 'active'));
  assert.equal(await down(V, pt(L0, [100, 60]), { id: 2, t: 1200 }), true);
  await up(V, pt(L0, [100, 60]), { id: 2, t: 1250 });
  // Смена питомца и ядра после отмены без отпускания — без команд прежнему, без ошибок.
  await stroke(V, L0, { n: 1, t: 2000, id: 1 });
  await V.act(() => rn.emit('change', 'background'));
  const calls = L.calls.list.length;
  await V.act(() => L.core.setPet('dog'));
  await V.act(() => rn.emit('change', 'active'));
  await up(V, pt(L0, [100, 60]), { id: 1, t: 2100 });
  assert.deepEqual(L.names().slice(calls).filter((name) => /^(stroke|toy)\./.test(name)), [], 'после отмены — ни end, ни cancel');
  await V.render(tree(M));
  await V.act(() => {});
  await V.unmount();
  assert.equal(L.live(), 0);
  // Отключённое ядро и системные события — без команд.
  const after = M.calls.list.length;
  M.core.destroy();
  await W.act(() => rn.emit('change', 'inactive'));
  await W.act(() => rn.emit('blur'));
  assert.equal(M.calls.list.length, after);
  L.core.destroy();
});

test('P3: устаревшие кнопки — после смены питомца (и кот → собака → кот в одном такте) прежние «лапа», «Погладить», миска, мячик, «Закрыть», «Уголок», вызов «по зову» ничего не командуют, не отменяют жест нового показа и не навигируют; новые — работают; отказ прежнего не показан; прямые команды хоста — прежний контракт', async () => {
  const L = await lab();
  const V = mount('play-stale', tree(L));
  await V.render();
  await started(L, V);
  let L0 = await opened(L, V);
  const ids = ['play-paw', 'play-stroke', 'play-bowl', 'play-ball', 'play-close'];
  let old = Object.fromEntries(ids.map((id) => [id, V.node(id).onPress]));
  const back = V.node('play-modal').onRequestClose;
  const escape = V.node('play-sheet').onAccessibilityEscape;
  await V.act(() => L.core.setPet('dog'));
  const before = L.calls.list.length;
  for (const id of ids) await V.act(() => old[id]());
  await V.act(() => back());
  await V.act(() => escape());
  assert.deepEqual(L.names().slice(before), [], 'прежние обработчики кота собаке ничего не команд­уют');
  assert.equal(L.core.getState().view.open, 'play', 'и не навигируют');
  // Туда и обратно в одном такте — прежний обработчик первого показа кота не оживает; новый — работает.
  await V.act(() => L.core.setPet('cat'));
  L0 = await measure(V, L);
  old = Object.fromEntries(ids.map((id) => [id, V.node(id).onPress]));
  await V.act(() => {
    L.core.setPet('dog');
    L.core.setPet('cat');
  });
  assert.equal(L.core.getState().pet.shown, 'cat');
  const mark = L.calls.list.length;
  for (const id of ids) await V.act(() => old[id]());
  assert.deepEqual(L.names().slice(mark), [], 'кот → собака → кот: прежние ничего не делают');
  await V.press('play-paw');
  assert.deepEqual(L.of('interact').at(-1), [{ type: 'paw' }], 'новая кнопка — работает');
  // Прежняя кнопка во время жеста нового показа его не отменяет.
  const stale = V.node('play-stroke').onPress;
  await V.act(() => {
    L.core.setPet('dog');
    L.core.setPet('cat');
  });
  await stroke(V, L0, { n: 1 });
  await V.act(() => stale());
  assert.deepEqual([L.of('stroke.cancel').length, L.core.getState().play.stroke !== null], [0, true], 'жест нового показа не отменён');
  await up(V, pt(L0, [100, 60]));
  // Прежние «Закрыть» и «Назад» после смены вида (игра → уголок → игра, питомец тот же) новый показ не закрывают.
  const close = V.node('play-close').onPress;
  const request = V.node('play-modal').onRequestClose;
  await V.act(() => L.core.open('corner'));
  await V.act(() => L.core.open('play'));
  const view = L.calls.list.length;
  await V.act(() => close());
  await V.act(() => request());
  assert.deepEqual([L.core.getState().view.open, L.names().slice(view)], ['play', []], 'прежний сеанс вида не навигирует новый');
  // Прежний «Уголок» вызванной игры: питомец сменился — в уголок не ведёт.
  await V.act(() => L.core.close());
  await V.act(() => L.core.open('play', { source: 'call' }));
  const toCorner = V.node('play-corner').onPress;
  await V.act(() => L.core.setPet('dog'));
  await V.act(() => toCorner());
  assert.deepEqual(L.core.getState().view, { open: 'play', source: 'call' });
  // Вызов «по зову» из закрытого: текущий работает, прежний (до смены питомца) — нет.
  await V.act(() => L.core.close());
  await V.act(() => L.core.setPresence('on-call'));
  const call = V.node('play-call').onPress;
  await V.act(() => {
    L.core.setPet('cat');
    L.core.setPet('dog');
  });
  await V.act(() => call());
  assert.equal(L.core.getState().view.open, null, 'прежний вызов не открывает игру нового показа');
  await V.press('play-call');
  assert.deepEqual(L.core.getState().view, { open: 'play', source: 'call' }, 'текущий вызов из закрытого — работает');
  // Прямые команды хоста — прежний контракт (защита касается только устаревшего UI).
  await V.act(() => L.core.close());
  assert.equal(L.core.open('play').ok, true);
  assert.equal(L.core.interact({ type: 'pet' }).ok, true);
  assert.equal(L.core.close().ok, true);
  L.core.destroy();
});

test('P3: отказ и подсказка прежнего питомца новому не показаны (и после кот → собака → кот); отложенный возврат фокуса закрытия не переводит фокус после смены питомца или ядра (Android — таймер, iOS — onDismiss); без смены — переводит', async () => {
  const L = await lab();
  const V = mount('play-stale-note', tree(L));
  await V.render();
  await started(L, V);
  // Пол не объявлен (окно не измерено) — «Катнуть мячик» получает отказ ядра.
  await V.act(() => L.core.open('play'));
  await V.act(() => V.node('play-ball').onPress());
  assert.match(V.text('play-note'), /^Мячик: Пол «Поиграть» не объявлен/);
  await V.act(() => {
    L.core.setPet('dog');
    L.core.setPet('cat');
  });
  assert.equal(V.has('play-note'), false, 'отказ первого показа кота не показан');
  // Подсказка «проведи» после касания без сдвига — у своего показа; смена питомца — снята.
  const L0 = await measure(V, L);
  await down(V, pt(L0, [100, 150]), { t: 0 });
  await up(V, pt(L0, [100, 150]), { t: 50 });
  const nudged = () => V.node('play-hint').style.some((style) => style && style.color === '#2f5249');
  assert.equal(nudged(), true, 'контроль: подсказка выделена');
  await V.act(() => L.core.setPet('dog'));
  assert.equal(nudged(), false, 'у собаки — без подсказки кота');
  // Отложенный возврат фокуса (iOS — по onDismiss окна, через сотни миллисекунд после закрытия): питомец или ядро сменились
  // до него — фокус не переводится; без смены — на вход уголка.
  rn.platform = 'ios';
  const M = await lab();
  for (const change of ['none', 'pet', 'core']) {
    await V.act(() => L.core.open('play'));
    rn.focused.length = 0;
    await V.act(() => L.core.close());
    if (change === 'pet') await V.act(() => L.core.setPet(L.core.getState().pet.shown === 'cat' ? 'dog' : 'cat'));
    if (change === 'core') await V.render(tree(M));
    await V.fire('play-modal', 'onDismiss');
    await V.act(turn);
    assert.equal(rn.focused.filter((item) => item.testID === 'corner-open').length, change === 'none' ? 1 : 0, `${change}: ${JSON.stringify(rn.focused)}`);
  }
  L.core.destroy();
  M.core.destroy();
});

// ---------- PL10.2.4: редкие сценки на нативе ----------

test('сценки (PL10.2.4): наборы объявляют свои сценки; сценка ядра на PetView — фазы (покой → поза сценки → покой), без движения — статично; касание отменяет; в фоне ядро сценку не начинает и день не расходует', async () => {
  const scene = async ({ motion = 'normal', visible = true } = {}) => {
    const L = await lab();
    const V = mount(`scene-${motion}-${visible}`, tree(L, { corner: true, play: true }));
    await V.render();
    await started(L, V);
    if (motion !== 'normal') await V.act(() => L.core.setPreferences({ motion }));
    if (!visible) await V.act(() => L.core.setVisible(false));
    await V.act(() => L.counts.set(1, 1));
    L.rand.push(0, 0, 0);
    await V.act(() => L.core.notify('saved', { key: 'a1', counted: true }));
    await V.act(() => L.plan.advance(3000));
    await until(V, () => Boolean(L.core.getState().pose.reaction?.scene));
    return { L, V, pose: () => V.node('pet-art')?.children?.props?.pose };
  };
  // Обычное движение: сценка кота — реакция ядра; поза сценки — в середине длительности, до неё и после — поза поверхности.
  const A = await scene();
  const reaction = A.L.core.getState().pose.reaction;
  assert.equal(reaction?.scene, true, JSON.stringify(reaction));
  assert.ok(['stretch', 'curl'].includes(reaction.type));
  const scenePose = reaction.type;
  assert.notEqual(A.pose(), scenePose, 'вход: ещё поза покоя');
  await A.V.act(() => new Promise((resolve) => setTimeout(resolve, Math.round((reaction.type === 'curl' ? 4600 : 3600) * 0.2) + 60)));
  assert.equal(A.pose(), scenePose, 'середина: поза сценки набора');
  assert.ok(A.L.scenes.calls.reserve >= 1 && A.L.scenes.calls.show >= 1, JSON.stringify(A.L.scenes.calls));
  // Касание питомца — ядро отменяет сценку; рисунок сразу возвращается.
  await A.V.act(() => A.L.core.interact({ type: 'pet' }));
  assert.equal(A.L.core.getState().pose.reaction?.scene ?? false, false);
  assert.notEqual(A.pose(), scenePose, 'отмена — поза сценки снята сразу');
  // Без движения — поза сценки сразу и статично.
  const B = await scene({ motion: 'none' });
  const still = B.L.core.getState().pose.reaction;
  assert.equal(still?.scene, true);
  assert.equal(B.pose(), still.type, 'без движения — поза сценки сразу');
  // Ядро не на виду (фон): сценки нет, резервирования дня нет.
  const C = await scene({ visible: false });
  assert.equal(C.L.core.getState().pose.reaction?.scene ?? false, false);
  assert.equal(C.L.scenes.calls.reserve, 0, 'не на виду — день не расходуется');
});
