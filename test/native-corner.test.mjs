// Уголок и координатор поверхностей PL10.2.1 (README, «Нативное отображение»; docs/ARCHITECTURE.md § 12.2): PetProvider,
// PetCorner, режим композиции PetView и ресурсы уголка наборов в настоящем React 19 (react-dom/client с контейнером-
// заглушкой) — react-native и react-native-svg подменены загрузчиком (test/fakes/react-native.mjs: узлы записывают свои
// свойства по testID, Modal — дети только пока visible, Keyboard, Platform, sendAccessibilityEvent; test/fakes/
// react-native-svg.mjs — рисунок отрисовывается react-dom/server в настоящую разметку SVG). Ядро — публичный createPetCore
// на асинхронном хранилище с ручными часами, планировщиком и случайностью (test/core-kit.mjs). Проверяется контракт: один
// владелец setDisplay (композиция без повторного объявления, StrictMode, снятие поверхности, смена ядра, размонтирование),
// отказ неверного набора и набора без ресурсов уголка до подписок и команд, открытие и закрытие только через view снимка
// (вход, прямая команда, Android «Назад», жест VoiceOver, фокус), сцена по снимку (вещи ступени, места room.pos, сдвиг к
// миске, миска по лакомству), подтверждённое занятие хоста, праздник и «Новое в уголке», кормление, имя (черновик пары
// «ядро и питомец», тишина ввода), аксессуары, движение и реплики, раскладка (onLayout, insets, клавиатура), одно
// объявление на эффект, поздняя запись и внешний destroy. Это Node и подделки — не React Native и не устройство.
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
const Room = await import('../pet/native/room.mjs');
const CoreRoom = await import('../pet/core/room.mjs');
const { Screen, screen } = await import('./fakes/expo-screen.mjs');
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { PetCorner, PetProvider, PetView, catNative, dogNative } = Native;
const PETS = [cat, dog];
const KITS = [catNative, dogNative];
const h = React.createElement;
const MINIMAL = { pet: 'cat', poses: catNative.poses, substitutes: catNative.substitutes, coats: catNative.coats, accessories: catNative.accessories, Figure: catNative.Figure };
const COMMANDS = ['getState', 'setDisplay', 'activity', 'interact', 'open', 'close', 'setContext', 'setName', 'setPet', 'setAppearance', 'setPreferences', 'feed', 'refresh'];

// Ядро проверки: асинхронное хранилище в памяти (hold — удержать записи до release), ручные часы и планировщик, счёт хоста;
// spy — тот же PetCore для отображения с учётом подписок и команд.
async function lab({ data = new Map() } = {}) {
  const held = [];
  let hold = false;
  const set = async (key, value) => {
    if (hold) await new Promise((resolve) => held.push(resolve));
    data.set(key, value);
  };
  const storage = createStorage({ backend: { async: true, get: async (key) => data.get(key) ?? null, set } });
  assert.equal(await storage.load(), 'ready');
  const time = calendar();
  const plan = planner(time);
  const counts = counter(0, 0);
  const log = journal();
  const core = createPetCore({ storage, pets: PETS, behaviors: [calm], progress: counts.progress, clock: time.port, random: series().port, scheduler: plan.port, log: log.port });
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
  const effects = [];
  core.subscribe(({ effects: list }) => effects.push(...list), { initial: false });
  return {
    core,
    spy,
    calls,
    time,
    plan,
    counts,
    log,
    data,
    effects,
    of: (name) => calls.list.filter(([command]) => command === name).map(([, ...args]) => args),
    live: () => calls.subscribe - calls.unsubscribe,
    hold: () => (hold = true),
    release: () => {
      hold = false;
      for (const resolve of held.splice(0)) resolve();
    },
  };
}

const roots = [];
test.afterEach(async () => {
  for (const R of roots.splice(0)) await R.unmount();
  rn.animations.live.clear();
  rn.platform = 'ios';
  rn.focused.length = 0;
  rn.scrolls.length = 0;
});
const turn = () => new Promise((resolve) => setTimeout(resolve, 5));

// Дерево под меткой экрана name: render(next) — новое дерево; node(id) — свойства узла; press(id) — нажатие; text(id) —
// текст узла Text.
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
  return {
    own,
    act: R.act,
    render: (next = tree) => R.render(wrap(next)),
    unmount: () => R.unmount(),
    node,
    has: (id) => own.nodes.has(id),
    press: (id) => R.act(() => node(id).onPress()),
    fire: (id, prop, ...args) => R.act(() => node(id)[prop](...args)),
    text: (id) => String(node(id)?.children ?? ''),
    svg: (id) => {
      const art = node(id);
      return art ? renderToStaticMarkup(h('svg', { viewBox: art.viewBox }, art.children)) : '';
    },
  };
}
const layout = (width, height) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
const tree = (L, { corner = true, view = true, insets, entry } = {}) => h(PetProvider, { core: L.spy, pets: PETS, kits: KITS }, view ? h(PetView, { size: 200 }) : null, corner ? h(PetCorner, { insets, entry }) : null);
// Запуск ядра и конец приветствия дня (реакция при запуске на виду).
async function started(L, V) {
  await V.act(() => L.core.start());
  await V.act(() => L.plan.advance(8000));
}
// Открыть уголок входом и измерить окно (портрет 390×844, тело 390×760).
async function opened(L, V, { width = 390, height = 760 } = {}) {
  await V.press('corner-open');
  assert.equal(L.core.getState().view.open, 'corner');
  await V.fire('corner-sheet', 'onLayout', layout(width, height + 84));
  await V.fire('corner-body', 'onLayout', layout(width, height));
}
const DISPLAY = (views) => ({ full: true, moving: false, pets: ['cat', 'dog'], views, scenes: {} });
const elements = (node, list = []) => {
  if (Array.isArray(node)) for (const item of node) elements(item, list);
  else if (React.isValidElement(node)) {
    list.push(node);
    elements(node.props.children, list);
  }
  return list;
};

test('наборы: ресурсы уголка штатных — по своим определениям; минимальный набор PL10.1 годен PetView, уголку — нет; неверная форма новых полей и неизвестные поля — отказ; изменённое определение того же ID, вещь-строка, исключение и неизвестное место отдыха — отказ; рисунок в комнате без своей миски и со сдвигом к миске', () => {
  const defs = new Map(PETS.map((def) => [def.id, def]));
  const isEl = React.isValidElement;
  for (const kit of KITS) {
    assert.equal(Kits.nativeKitProblem(kit, defs, isEl), '', kit.pet);
    assert.equal(Kits.nativeCornerProblem(kit, defs.get(kit.pet), isEl), '', kit.pet);
    assert.deepEqual([...kit.items].sort(), Kits.cornerNeeds(defs.get(kit.pet)).items.sort(), `${kit.pet}: свои вещи — ровно игрушки и вещи вне общего уголка`);
  }
  assert.deepEqual(Kits.cornerNeeds(cat).items, ['yarn']);
  assert.deepEqual(Kits.cornerNeeds(dog).items.sort(), ['ball', 'rope']);
  // Минимальный набор PL10.1: PetView — да, уголок — понятный отказ.
  assert.equal(Kits.nativeKitProblem(MINIMAL, defs, isEl), '');
  assert.match(Kits.nativeCornerProblem(MINIMAL, cat, isEl), /нет ресурсов уголка — room: true/);
  assert.match(Kits.nativeCornerProblem({ ...MINIMAL, room: true }, cat, isEl), /не нарисовано для уголка \(items\): yarn/);
  assert.match(Kits.nativeCornerProblem({ ...MINIMAL, room: true, items: ['yarn'] }, cat, isEl), /Item — функция рисунка своих вещей/);
  // Новые поля — только верной формы; неизвестные поля — отказ, как прежде.
  for (const [kit, problem] of [
    [{ ...catNative, room: 'yes' }, /room — true/],
    [{ ...catNative, items: 'yarn' }, /items — плотный массив строк/],
    [{ ...catNative, items: ['yarn', 1] }, /items — плотный массив строк/],
    [{ ...catNative, Item: '<g/>' }, /Item — функция/],
    [{ ...catNative, scenes: ['stretch'] }, /неизвестные поля scenes/],
    [{ ...catNative, toys: ['ball'] }, /неизвестные поля toys/],
  ])
    assert.match(Kits.nativeKitProblem(kit, defs, isEl), problem);
  // Изменённое определение того же ID: новая игрушка и своя вещь ступени — штатный набор их не рисует.
  const mouse = definePet({ ...cat, room: { ...cat.room, toys: [...cat.room.toys, { id: 'mouse', title: 'Мышка', home: [250, 230], box: [-8, -6, 8, 6], stage: 1 }] } });
  assert.match(Kits.nativeCornerProblem(catNative, mouse, isEl), /не нарисовано для уголка \(items\): mouse/);
  const sofa = definePet({ ...cat, items: { ...cat.items, list: [...cat.items.list, { id: 'sofa', title: 'Диван', stage: 4 }] } });
  assert.match(Kits.nativeCornerProblem(catNative, sofa, isEl), /\(items\): sofa/);
  const hammock = definePet({ ...cat, room: { ...cat.room, seats: [...cat.room.seats, { id: 'hammock', title: 'Гамак', box: [-80, -20, 80, 20], stage: 4, lift: 2 }] } });
  assert.match(Kits.nativeCornerProblem(catNative, hammock, isEl), /место отдыха hammock общий уголок натива не рисует/);
  assert.match(Kits.nativeCornerProblem({ ...catNative, Item: () => '<g data-item="yarn"/>' }, cat, isEl), /Item\(\{ id: 'yarn' \}\) — элемент React/);
  assert.match(Kits.nativeCornerProblem({ ...catNative, Item: () => null }, cat, isEl), /элемент React/);
  assert.match(Kits.nativeCornerProblem({ ...catNative, Item: () => { throw new Error('нет'); } }, cat, isEl), /исключение \(нет\)/);
  assert.match(Kits.nativeCornerProblem({ ...catNative, Figure: (props) => (props.room ? '<svg/>' : catNative.Figure(props)) }, cat, isEl), /Figure в комнате — элемент React/);
  // Рисунок в комнате: своей миски нет (её рисует сцена), поза «ест» идёт к миске: (−30, +12) + room.feed. Отдельно —
  // как PL10.1: миска у лап и сдвиг (−20, +10).
  const markup = (kit, props) => renderToStaticMarkup(h('svg', null, kit.Figure({ prefix: 'q', coat: kit.coats[0], accessory: 'scarf', toward: '', ...props })));
  for (const kit of KITS) {
    assert.match(markup(kit, { pose: 'feed' }), /#b0743f/, `${kit.pet}: отдельно — миска с кормом`);
    assert.doesNotMatch(markup(kit, { pose: 'feed', room: { feed: [0, 0] } }), /#b0743f|#4f8a6e/, `${kit.pet}: в комнате — без своей миски`);
    assert.match(markup(kit, { pose: 'feed', room: { feed: [12.5, -4] } }), /translate\(-17\.5, 8\)/, `${kit.pet}: сдвиг к миске`);
    assert.match(markup(kit, { pose: 'feed' }), /translate\(-20, 10\)/);
    assert.equal(markup(kit, { pose: 'calm', room: { feed: [40, 9] } }), markup(kit, { pose: 'calm' }), `${kit.pet}: другие позы в комнате — как отдельно`);
    for (const id of kit.items) {
      const item = kit.Item({ id, prefix: 'q' });
      assert.ok(React.isValidElement(item) && elements(item).length > 2, `${kit.pet} ${id}: элементы`);
      const bad = elements(item).filter((el) => Object.hasOwn(el.props, 'transform') && (typeof el.props.transform !== 'string' || !el.props.transform));
      assert.deepEqual(bad, [], `${kit.pet} ${id}: transform — строка`);
    }
  }
  assert.notEqual(renderToStaticMarkup(dogNative.Item({ id: 'rope', prefix: 'q' })), renderToStaticMarkup(dogNative.Item({ id: 'ball', prefix: 'q' })));
});

test('общий уголок: вещи ступени — по определению, место отдыха — по ступени, геометрия питомца — из определения (рамка, size, масштаб ядра), сдвиг предмета — по расстановке; не размеры кота', () => {
  assert.deepEqual(Room.sharedItems(cat, 0), ['cushion']);
  assert.deepEqual(Room.sharedItems(cat, 2), ['cushion', 'mug', 'notebook']);
  assert.deepEqual(Room.sharedItems(dog, 4), ['cushion', 'mug', 'notebook', 'bed', 'lamp', 'plant', 'board']);
  const model = CoreRoom.roomModel(cat);
  // Как sceneCatBox веба: рамка 176×160 у (114, 46), с лежанкой — у (114, 50); рисунок 220×204 вписан по центру.
  const at0 = Room.petBox(model, cat.size, 0, CoreRoom.arrange(model, 0).pos);
  assert.deepEqual([at0.x, at0.y, at0.width, at0.height], [115.7, 46, 172.5, 160]);
  const at3 = Room.petBox(model, cat.size, 3, CoreRoom.arrange(model, 3).pos);
  assert.equal(at3.y, 50);
  const moved = Room.petBox(model, cat.size, 0, { ...CoreRoom.arrange(model, 0).pos, rest: [150, 210] });
  assert.deepEqual([moved.x, moved.y], [65.7, 50]);
  assert.deepEqual(Room.itemShift(model, 'yarn', { yarn: [60, 230] }), [24, -1]);
  // Другой размер рисунка (расширение): масштаб и рамка — по его определению.
  const wide = definePet({ ...cat, id: 'example.wide', fallback: 'cat', size: { width: 300, height: 150, ground: 140 } });
  const w = Room.petBox(CoreRoom.roomModel(wide), wide.size, 0, {});
  assert.deepEqual([w.width, w.height], [176, 88]);
  // Сцена: элементы react-native-svg, подложка и передний план, преобразования — строки.
  const parts = { model, stage: 3, pos: CoreRoom.arrange(model, 3).pos, shared: Room.sharedItems(cat, 3), fresh: ['lamp'], prefix: 'q' };
  const back = renderToStaticMarkup(h('svg', null, Room.roomBack(parts)));
  const front = renderToStaticMarkup(h('svg', null, Room.roomFront({ ...parts, bowl: { shown: true, full: true }, own: [{ id: 'yarn', element: catNative.Item({ id: 'yarn', prefix: 'q' }) }] })));
  assert.match(back, /#b98a5a/, 'лежанка');
  assert.match(back, /#d9a441/, 'лампа');
  assert.match(back, /#ffd98a/, 'подсветка новой вещи');
  assert.doesNotMatch(back, /#c9a77c/, 'доски ещё нет');
  assert.match(front, /#c99863/, 'передний край лежанки');
  assert.match(front, /#b0743f/, 'корм в миске');
  assert.match(front, /#cf6741/, 'клубок');
  for (const node of elements([Room.roomBack(parts), Room.roomFront({ ...parts, bowl: { shown: false, full: false }, own: [] })])) if (Object.hasOwn(node.props, 'transform')) assert.equal(typeof node.props.transform, 'string');
});

test('один владелец объявления: PetProvider объявляет ядру ровно одно { pets, views: ["corner"], scenes: {} }; PetView в композиции не объявляет и views не сбрасывает; повторная отрисовка со встроенными массивами и StrictMode — без повторов; отдельный PetView — как PL10.1', async () => {
  for (const strict of [false, true]) {
    const L = await lab();
    const V = mount(`owner-${strict}`, tree(L), { strict });
    await V.render();
    assert.deepEqual(L.of('setDisplay'), [[DISPLAY(['corner'])]], `strict ${strict}`);
    await V.render(h(PetProvider, { core: L.spy, pets: [cat, dog], kits: [catNative, dogNative] }, h(PetView, { size: 120 }), h(PetCorner)));
    await V.act(() => {});
    assert.equal(L.of('setDisplay').length, 1, 'встроенные массивы того же состава — без нового объявления');
    assert.deepEqual(L.core.getState().display.views, ['corner']);
    await started(L, V);
    assert.ok(V.has('pet-art') && V.has('corner-open'), 'питомец и вход нарисованы');
    await V.act(() => L.core.destroy());
  }
  // Отдельный PetView (без координатора) — прежнее объявление PL10.1, свои объявления скринридеру.
  const S = await lab();
  const W = mount('owner-alone', h(PetView, { core: S.spy, pets: PETS, kits: KITS }));
  await W.render();
  assert.deepEqual(S.of('setDisplay'), [[DISPLAY([])]]);
  assert.equal(S.live(), 2, 'снимок и объявления');
  await W.act(() => S.core.destroy());
});

test('снятие поверхности: уголок размонтирован — views: [] (микрозадачей) и открытый уголок закрыт ядром; координатор размонтирован или сменил ядро — прежнее ядро без разрешений и открытого вида; новое объявлено один раз', async () => {
  const L = await lab();
  const V = mount('withdraw', tree(L));
  await V.render();
  await started(L, V);
  await opened(L, V);
  // Пересоздание поверхности в том же такте (новый key) — не снятие: открытый уголок остаётся, объявление прежнее.
  const calls = L.of('setDisplay').length;
  await V.render(h(PetProvider, { core: L.spy, pets: PETS, kits: KITS }, h(PetView), h(PetCorner, { key: 'again' })));
  assert.deepEqual([L.core.getState().view.open, L.of('setDisplay').length, L.of('close').length], ['corner', calls, 0]);
  await V.render(tree(L, { corner: false }));
  assert.equal(L.core.getState().view.open, null, 'уголка нет — вид закрыт');
  assert.deepEqual(L.core.getState().display.views, []);
  assert.deepEqual(L.of('setDisplay').at(-1), [DISPLAY([])]);
  assert.equal(L.core.open('corner').error?.code, 'unsupported', 'без поверхности уголок не открыть');
  // Снова есть уголок — снова объявлен.
  await V.render(tree(L));
  assert.deepEqual(L.core.getState().display.views, ['corner']);
  // Смена ядра при открытом уголке: прежнее — закрыто и без видов, новое — объявлено.
  await opened(L, V);
  const M = await lab();
  await V.render(tree(M));
  assert.deepEqual([L.core.getState().view.open, L.core.getState().display.views], [null, []]);
  assert.deepEqual(M.of('setDisplay'), [[DISPLAY(['corner'])]]);
  assert.equal(L.live(), 0, 'подписки прежнего сняты');
  // Размонтирование координатора: открытый вид закрыт, разрешений нет.
  await M.core.start();
  await V.act(() => M.core.open('corner'));
  await V.unmount();
  assert.deepEqual([M.core.getState().view.open, M.core.getState().display.views, M.live()], [null, [], 0]);
  L.core.destroy();
  M.core.destroy();
});

test('отказы до побочных действий: неверный набор у координатора — ни подписок, ни объявления, ни команд, читаемый отказ PetView и уголка; минимальный набор PL10.1 — PetView рисует, уголок отказывает, вида corner у ядра нет', async () => {
  const L = await lab();
  const V = mount('refuse', h(PetProvider, { core: L.spy, pets: PETS, kits: [{ ...catNative, coats: ['smoke'] }, dogNative] }, h(PetView), h(PetCorner)));
  await V.render();
  assert.deepEqual([L.calls.subscribe, L.calls.list.length], [0, 0]);
  assert.match(V.text('pet-problem'), /Питомец не показан: набор «cat»: не нарисовано \(coats\)/);
  assert.match(V.text('corner-problem'), /Уголок не показан: набор «cat»: не нарисовано \(coats\)/);
  assert.equal(V.node('corner').accessibilityRole, 'alert');
  await V.unmount();
  const M = await lab();
  const W = mount('minimal', h(PetProvider, { core: M.spy, pets: [cat], kits: [MINIMAL] }, h(PetView), h(PetCorner)));
  await W.render();
  await started(M, W);
  assert.ok(W.has('pet-art'), 'PetView с минимальным набором рисует');
  assert.match(W.text('corner-problem'), /нет ресурсов уголка/);
  assert.deepEqual(M.core.getState().display.views, [], 'вида corner нет');
  assert.equal(M.core.open('corner').error?.code, 'unsupported');
  assert.equal(W.has('corner-open'), false);
  // Уголок без координатора — отказ, не своё объявление.
  const N = await lab();
  const X = mount('alone-corner', h(PetCorner));
  await X.render();
  assert.match(X.text('corner-problem'), /только внутри PetProvider/);
  assert.equal(N.calls.list.length, 0);
  L.core.destroy();
  M.core.destroy();
  N.core.destroy();
});

test('открытие и закрытие — только по view снимка: вход, прямая команда, «Закрыть», Android «Назад» (onRequestClose), жест VoiceOver; фокус — на «Закрыть» при показе и обратно на вход (iOS — onDismiss, Android — после снятия окна); спрятан — входа нет', async () => {
  const L = await lab();
  const V = mount('open', tree(L));
  await V.render();
  await started(L, V);
  assert.equal(V.node('corner-modal').visible, false, 'закрыто — окно не показано и «Назад» не перехватывает');
  assert.equal(V.has('corner-sheet'), false);
  assert.equal(V.node('corner-open').accessibilityLabel, 'Марс — уголок кота');
  await V.press('corner-open');
  assert.deepEqual(L.of('open'), [['corner']]);
  assert.equal(V.node('corner-modal').visible, true);
  assert.equal(V.text('corner-title'), 'Марс');
  assert.equal(V.text('corner-stage'), 'Ступень «Познакомились»');
  await V.fire('corner-modal', 'onShow');
  assert.deepEqual(rn.focused.at(-1), { testID: 'corner-close', type: 'focus' });
  await V.press('corner-close');
  assert.deepEqual([L.core.getState().view.open, V.node('corner-modal').visible], [null, false]);
  await V.fire('corner-modal', 'onDismiss');
  assert.deepEqual(rn.focused.at(-1), { testID: 'corner-open', type: 'focus' }, 'iOS: фокус на входе после закрытия');
  // Прямая команда хоста — то же окно.
  await V.act(() => L.core.open('corner'));
  assert.equal(V.node('corner-modal').visible, true);
  // Android «Назад».
  rn.platform = 'android';
  rn.focused.length = 0;
  await V.fire('corner-modal', 'onRequestClose');
  assert.equal(L.core.getState().view.open, null);
  await V.act(turn);
  assert.deepEqual(rn.focused, [{ testID: 'corner-open', type: 'focus' }], 'Android: фокус на входе после снятия окна');
  // Жест VoiceOver «назад».
  await V.act(() => L.core.open('corner'));
  await V.fire('corner-sheet', 'onAccessibilityEscape');
  assert.equal(L.core.getState().view.open, null);
  assert.equal(L.of('close').length, 3);
  // Спрятан — входа нет; показан — снова есть.
  await V.act(() => L.core.hide());
  assert.equal(V.has('corner-open'), false);
  await V.act(() => L.core.show());
  assert.equal(V.has('corner-open'), true);
  await V.act(() => L.core.destroy());
  assert.equal(V.has('corner-open'), false, 'отключено — входа нет');
});

test('сцена по снимку: вещи ступени и свои вещи набора, места из сохранённой расстановки (room.pos), сдвиг к миске в позе «ест» (room.feedShift), миска — когда можно угостить; питомец — набор показанного, поза страницы; описание для скринридера', async () => {
  const data = new Map([['pet:room:v1', JSON.stringify({ v: 1, cat: { rest: { x: 170, y: 212 }, bowl: { x: 300, y: 220 }, yarn: { x: 60, y: 232 } } })]]);
  const L = await lab({ data });
  const V = mount('scene', tree(L));
  await V.render();
  await started(L, V);
  await opened(L, V);
  const state = () => L.core.getState();
  assert.equal(V.has('corner-scene'), true);
  assert.equal(V.node('corner-scene').style.width, 358, 'портрет: ширина тела − 32');
  let back = V.svg('corner-back');
  let front = V.svg('corner-front');
  assert.match(back, /#8ea787/, 'подушка');
  assert.doesNotMatch(back + front, /#f2ead9/, 'кружки на первой ступени нет');
  assert.match(front, /#cf6741/, 'клубок');
  assert.doesNotMatch(front, /#4f8a6e/, 'лакомство ждёт занятия — миски нет');
  // Места — из сохранённой расстановки ядра.
  const pos = state().room.pos;
  assert.deepEqual([pos.rest, pos.yarn], [[170, 212], [60, 232]]);
  const box = Room.petBox(CoreRoom.roomModel(cat), cat.size, 0, pos);
  const k = 358 / 400;
  assert.deepEqual([V.node('corner-pet').style.left, V.node('corner-pet').style.top], [box.x * k, box.y * k]);
  assert.match(front, /translate\(24, 1\)/, 'клубок на сохранённом месте');
  let figure = V.node('corner-pet-art').children;
  assert.deepEqual([figure.type, figure.props.pose, figure.props.room], [catNative.Figure, state().pose.shown.page, { feed: state().room.feedShift }]);
  assert.match(V.node('corner-scene').accessibilityLabel, /^Марс в уголке: подушка, клубок$/);
  // Занятие сегодня — миска есть; кормление — поза «ест», корм в миске, сдвиг к переставленной миске.
  L.counts.set(1, 1);
  await V.act(() => L.core.refresh());
  assert.match(V.svg('corner-front'), /#4f8a6e/, 'миска');
  assert.match(V.svg('corner-front'), /translate\(130, 15\)/, 'миска на сохранённом месте');
  await V.press('corner-feed');
  figure = V.node('corner-pet-art').children;
  assert.equal(figure.props.pose, 'feed');
  assert.deepEqual(figure.props.room.feed, state().room.feedShift);
  assert.notDeepEqual(state().room.feedShift, [0, 0], 'миска переставлена — сдвиг не нулевой');
  assert.match(V.svg('corner-front'), /#b0743f/, 'корм, пока ест');
  // Ступень «Наш ритуал» — кружка и блокнот, у собаки ещё мячик; другой питомец — его набор и вещи.
  L.counts.set(9, 2);
  await V.act(() => L.core.refresh());
  await V.press('corner-kind-dog');
  await V.act(() => L.plan.advance(8000));
  back = V.svg('corner-back');
  front = V.svg('corner-front');
  assert.match(front, /#f2ead9/, 'кружка');
  assert.match(front, /#3f6b62/, 'блокнот');
  assert.match(front, /#e3b94a/, 'мячик собаки');
  assert.match(front, /#8b6a47/, 'канат');
  assert.equal(V.node('corner-pet-art').children.type, dogNative.Figure);
  await V.act(() => L.core.destroy());
});

test('подтверждённое занятие хоста при открытом уголке: праздник новой ступени и «Новое в уголке» — по эффекту ядра; повтор key и отказ — без награды; открытие после новой ступени — «Новое в уголке» по эффекту seen; одно объявление на эффект', async () => {
  const L = await lab();
  const V = mount('host', tree(L));
  await V.render();
  await started(L, V);
  await opened(L, V);
  rn.announced.length = 0;
  L.effects.length = 0;
  L.counts.set(3, 1);
  let saved = null;
  await V.act(() => (saved = L.core.notify('saved', { key: 'k1', counted: true })));
  assert.deepEqual([saved.ok, saved.reacted, saved.celebrate], [true, true, 1]);
  assert.equal(L.core.getState().progress.stage, 1);
  assert.ok(L.effects.some((effect) => effect.type === 'celebrate' && effect.stage === 1), 'праздник — эффект ядра');
  assert.equal(V.text('corner-news'), 'Новая ступень «Освоился»! Новое в уголке: Клетчатый платок.');
  assert.equal(V.text('corner-stage'), 'Ступень «Освоился»');
  const reaction = L.core.getState().pose.reaction.id;
  const again = L.core.notify('saved', { key: 'k1', counted: true });
  assert.deepEqual([again.ok, again.duplicate, again.celebrate], [true, true, null]);
  assert.equal(L.core.getState().pose.reaction.id, reaction, 'повтор не играет');
  const failed = L.core.notify('failed');
  assert.equal(failed.ok, true);
  assert.equal(L.core.getState().progress.marks, 3, 'отказ хоста знаков не даёт');
  // Закрыли — «Новое» снято; новая ступень без открытого уголка, затем открытие — эффект seen.
  await V.press('corner-close');
  assert.equal(V.has('corner-news'), false);
  L.counts.set(9, 2);
  await V.act(() => L.core.refresh());
  assert.equal(L.core.getState().progress.unseen, true);
  assert.equal(V.node('corner-open').accessibilityLabel, 'Марс — уголок кота, есть новая вещь');
  await opened(L, V);
  assert.equal(V.text('corner-news'), 'Новое в уголке: Кружка, Блокнот.');
  assert.equal(L.core.getState().progress.unseen, false);
  // Объявления скринридеру — ровно эффекты announce ядра, по одному (композиция и уголок не дублируют).
  const said = L.effects.filter((effect) => effect.type === 'announce').map((effect) => effect.text);
  assert.deepEqual(rn.announced, said);
  await V.act(() => L.core.destroy());
});

test('кормление: решение и состояние — ядро; кнопка только при ready, повтор — отказ ядра, объявление — одно; фокус на новом состоянии; поздняя запись — «сохраняется» до итога; destroy во время записи — без ошибок', async () => {
  const L = await lab();
  const V = mount('feed', tree(L));
  await V.render();
  await started(L, V);
  await opened(L, V);
  assert.equal(V.has('corner-feed'), false);
  assert.equal(V.text('corner-treat'), 'Лакомство: после занятия');
  assert.equal(V.text('corner-treat-note'), 'Одно занятие — и можно угостить.');
  L.counts.set(1, 1);
  await V.act(() => L.core.refresh());
  assert.equal(V.node('corner-feed').accessibilityLabel, 'Покормить');
  rn.announced.length = 0;
  L.hold();
  await V.press('corner-feed');
  assert.deepEqual(L.of('feed'), [[]]);
  assert.equal(L.core.getState().treat, 'fed');
  assert.equal(V.text('corner-treat'), '✓ Угостили');
  assert.match(V.text('corner-treat-note'), /отметка сохраняется…/);
  assert.equal(V.text('corner-save'), 'Сохраняется…');
  assert.deepEqual(rn.focused.at(-1), { testID: 'corner-treat', type: 'focus' });
  await V.act(() => L.release());
  await V.act(() => {});
  assert.equal(V.text('corner-treat-note'), 'Сегодня уже угостили. Новое — завтра, после занятия.');
  assert.equal(V.text('corner-save'), 'Настройки, облик, имена и лакомство сохранены на этом устройстве.');
  const twice = L.core.feed();
  assert.equal(twice.error?.code, 'treat-fed');
  assert.deepEqual(rn.announced.filter((text) => /лакомство/.test(text)), ['Марс получает лакомство. Сегодня уже угостили.']);
  // Запись в полёте и внешний destroy.
  L.hold();
  await V.act(() => L.core.setName('Пельмень'));
  await V.act(() => L.core.destroy());
  await V.act(() => L.release());
  assert.equal(V.node('corner-modal')?.visible ?? false, false, 'отключено — окна нет');
  assert.deepEqual(L.log.list, [], 'журнал ядра пуст: ни исключений, ни отказов');
});

test('имя: черновик принадлежит паре «ядро и показанный питомец» — смена питомца его не переносит, «Сохранить имя» чужой не применит; готовое имя — ядро (одно «Имя: …»); тишина ввода снимается при закрытии; длинное имя целиком; поле до 24 знаков', async () => {
  const L = await lab();
  const V = mount('name', tree(L));
  await V.render();
  await started(L, V);
  await opened(L, V);
  assert.equal(V.node('corner-name-input').maxLength, 24);
  assert.equal(V.text('corner-name-offer-text'), 'Новое имя? Предлагаем «Котлетыч» — или оставим «Марс».');
  await V.fire('corner-name-input', 'onFocus');
  assert.ok(L.core.getState().context.quiet.includes('typing'));
  await V.fire('corner-name-input', 'onChangeText', 'КотДраф');
  assert.equal(V.node('corner-name-input').value, 'КотДраф');
  await V.press('corner-kind-dog');
  await V.act(() => L.plan.advance(8000));
  assert.equal(L.core.getState().pet.shown, 'dog');
  assert.equal(V.node('corner-name-input').value, '', 'у собаки — её сохранённое (пустое) имя, а не черновик кота');
  await V.press('corner-name-save');
  assert.deepEqual(L.of('setName').at(-1), ['']);
  assert.equal(L.core.getState().pets.dog.name.display, 'Тоби');
  await V.press('corner-kind-cat');
  assert.equal(V.node('corner-name-input').value, '', 'черновик кота снят');
  assert.equal(L.core.getState().pets.cat.name.display, 'Марс');
  // Готовое имя — тот же путь ядра; объявление — одно, от ядра через координатор.
  rn.announced.length = 0;
  await V.press('corner-name-offer');
  assert.equal(L.core.getState().name.display, 'Котлетыч');
  assert.deepEqual(rn.announced.filter((text) => text.startsWith('Имя')), ['Имя: Котлетыч.']);
  assert.equal(V.has('corner-name-offer'), false, 'имя выбрано — предложения нет');
  assert.equal(V.node('corner-name-pick-0').accessibilityState.checked, true);
  await V.press('corner-name-more');
  assert.notEqual(V.node('corner-name-pick-0').accessibilityLabel, 'Котлетыч', 'другая страница готовых имён');
  // Длинное имя без пробелов — целиком, перенос — у текста.
  const long = 'Ш'.repeat(24);
  await V.fire('corner-name-input', 'onFocus');
  await V.fire('corner-name-input', 'onChangeText', long);
  await V.fire('corner-name-input', 'onSubmitEditing');
  assert.equal(V.text('corner-title'), long);
  assert.equal(V.node('corner-title').numberOfLines, undefined, 'без обрезки строк');
  // Тишина ввода: поле в фокусе, уголок закрыли — снята.
  await V.fire('corner-name-input', 'onFocus');
  assert.ok(L.core.getState().context.quiet.includes('typing'));
  await V.press('corner-close');
  assert.equal(L.core.getState().context.quiet.includes('typing'), false);
  await V.act(() => L.core.destroy());
});

test('облик, аксессуары, движение и реплики: команды ядра и состояние из снимка; закрытый ступенью аксессуар недоступен с подсказкой; «без анимации» и системное «уменьшить движение» — окно и питомец без анимации', async () => {
  const L = await lab();
  const V = mount('looks', tree(L));
  await V.render();
  await started(L, V);
  await opened(L, V);
  assert.deepEqual(V.node('corner-acc-plaid').accessibilityState, { disabled: true, checked: false });
  assert.equal(V.node('corner-acc-plaid').accessibilityHint, 'Нужно 3 знака');
  assert.deepEqual(V.node('corner-acc-scarf').accessibilityState, { disabled: false, checked: true });
  await V.press('corner-coat-ginger');
  assert.equal(L.core.getState().look.coat, 'ginger');
  assert.equal(V.node('corner-pet-art').children.props.coat, 'ginger');
  assert.equal(V.node('corner-coat-ginger').accessibilityState.checked, true);
  L.counts.set(3, 1);
  await V.act(() => L.core.refresh());
  await V.press('corner-acc-plaid');
  assert.equal(L.core.getState().look.worn, 'plaid');
  assert.equal(V.node('corner-modal').animationType, 'slide');
  await V.press('corner-motion-none');
  assert.equal(L.core.getState().prefs.motion, 'none');
  assert.equal(V.node('corner-modal').animationType, 'none');
  await V.press('corner-motion-normal');
  await V.act(() => L.core.setReducedMotion(true));
  assert.equal(V.node('corner-modal').animationType, 'none', 'системная настройка — без анимации окна');
  assert.equal(L.core.getState().prefs.motion, 'normal', 'выбор владельца не переписан');
  rn.animations.live.clear();
  const before = rn.animations.started;
  await V.press('corner-stroke');
  assert.equal(L.core.getState().pose.reaction?.type, 'pet');
  assert.equal(rn.animations.started, before, 'уменьшение движения — питомец без анимации');
  await V.act(() => L.core.setReducedMotion(false));
  await V.press('corner-motion-calm');
  assert.equal(V.node('corner-modal').animationType, 'fade');
  assert.equal(V.node('corner-phrases').accessibilityRole, 'switch');
  await V.press('corner-phrases');
  assert.equal(L.core.getState().prefs.phrases, false);
  assert.equal(V.node('corner-phrases').accessibilityState.checked, false);
  // «Дай лапу» — только у питомца с командой (собака).
  assert.equal(V.has('corner-paw'), false);
  await V.press('corner-kind-dog');
  await V.press('corner-paw');
  assert.deepEqual(L.of('interact').at(-1), [{ type: 'paw' }]);
  await V.act(() => L.core.destroy());
});

test('раскладка: без измерения сцены нет; портрет — сцена в прокрутке, широкий экран — сбоку; отступы insets хоста; клавиатура над полем имени — отступ по её рамке и прокрутка к полю; поворот пересчитывает', async () => {
  const L = await lab();
  const insets = { top: 59, right: 0, bottom: 34, left: 0 };
  const V = mount('layout', tree(L, { insets }));
  await V.render();
  await started(L, V);
  await V.press('corner-open');
  assert.equal(V.has('corner-scene'), false, 'нулевой размер — сцены нет');
  assert.equal(V.node('corner-modal').statusBarTranslucent, true, 'с insets хоста — сквозной режим Android');
  assert.equal(V.node('corner-modal').presentationStyle, 'overFullScreen', 'iOS: экран хоста под окном — его отступы обновляются при повороте');
  assert.deepEqual([V.node('corner-sheet').style[1].paddingTop, V.node('corner-sheet').style[1].paddingLeft], [59, 0]);
  await V.fire('corner-sheet', 'onLayout', layout(390, 844));
  await V.fire('corner-body', 'onLayout', layout(390, 700));
  assert.equal(V.node('corner-scene').style.width, 358);
  assert.equal(V.node('corner-scroll').contentContainerStyle[1].paddingBottom, 34 + 16);
  // Поворот: широкое тело — сцена сбоку, отступы по бокам из insets.
  await V.render(tree(L, { insets: { top: 0, right: 59, bottom: 21, left: 59 } }));
  await V.fire('corner-sheet', 'onLayout', layout(844, 390));
  await V.fire('corner-body', 'onLayout', layout(726, 300));
  assert.equal(V.node('corner-scene').style.width, Math.floor(Math.min(726 * 0.5 - 24, (300 - 24) * 1.6)));
  assert.deepEqual([V.node('corner-sheet').style[1].paddingLeft, V.node('corner-sheet').style[1].paddingRight], [59, 59]);
  // Клавиатура: поле в фокусе — прокрутка к нему, отступ — перекрытие клавиатурой.
  await V.render(tree(L, { insets }));
  await V.fire('corner-sheet', 'onLayout', layout(390, 844));
  await V.fire('corner-body', 'onLayout', layout(390, 700));
  // Блок имени на y 600 прокрутки, строка поля в нём — на y 140: прокрутка — к строке поля.
  const nameAt = 600;
  await V.fire('corner-name', 'onLayout', { nativeEvent: { layout: { x: 0, y: nameAt, width: 358, height: 300 } } });
  await V.fire('corner-name-row', 'onLayout', { nativeEvent: { layout: { x: 0, y: 140, width: 358, height: 48 } } });
  await V.fire('corner-name-input', 'onFocus');
  rn.keyboard('keyboardWillShow', { endCoordinates: { screenY: 508, height: 336 } });
  await V.act(() => {});
  assert.equal(V.node('corner-scroll').contentContainerStyle[1].paddingBottom, 336 + 16);
  assert.deepEqual([rn.scrolls.at(-1)?.testID, rn.scrolls.at(-1)?.animated], ['corner-scroll', true]);
  assert.equal(rn.scrolls.at(-1).y, nameAt + 140 - 12, 'к строке поля, а не к заголовку блока');
  // iOS: клавиатура раньше фокуса поля — прокрутка при фокусе.
  await V.fire('corner-name-input', 'onBlur');
  rn.scrolls.length = 0;
  rn.keyboard('keyboardWillShow', { endCoordinates: { screenY: 508, height: 336 } });
  assert.equal(rn.scrolls.length, 0, 'поле не в фокусе — не прокручивать');
  await V.fire('corner-name-input', 'onFocus');
  assert.equal(rn.scrolls.at(-1)?.y, nameAt + 140 - 12, 'фокус после клавиатуры — прокрутка к полю');
  await V.act(() => L.core.setReducedMotion(true));
  rn.keyboard('keyboardWillShow', { endCoordinates: { screenY: 508, height: 336 } });
  assert.equal(rn.scrolls.at(-1)?.animated, false, 'уменьшение движения — прокрутка без анимации');
  await V.act(() => L.core.setReducedMotion(false));
  rn.keyboard('keyboardWillHide', {});
  await V.act(() => {});
  assert.equal(V.node('corner-scroll').contentContainerStyle[1].paddingBottom, 34 + 16);
  // Закрыто — слушателей клавиатуры нет.
  await V.press('corner-close');
  assert.deepEqual(Object.values(rn.keys).map((set) => set.size), [0, 0, 0, 0]);
  // Без insets хоста — системные отступы окна (без сквозного режима Android).
  await V.render(tree(L));
  await V.press('corner-open');
  assert.equal(V.node('corner-modal').statusBarTranslucent, false);
  await V.act(() => L.core.destroy());
});

test('два координатора на двух ядрах независимы; внешний destroy при открытом уголке — окно снято без ошибок; размонтирование снимает подписки, клавиатуру и анимации', async () => {
  const A = await lab();
  const B = await lab();
  const VA = mount('pair-a', tree(A));
  const VB = mount('pair-b', h(PetProvider, { core: B.spy, pets: [dog], kits: [dogNative] }, h(PetView), h(PetCorner)));
  await VA.render();
  await VB.render();
  await started(A, VA);
  await started(B, VB);
  await opened(A, VA);
  assert.equal(B.core.getState().view.open, null, 'уголок B не открыт');
  assert.deepEqual(B.core.getState().display.pets, ['dog']);
  await VB.press('corner-open');
  assert.equal(B.core.getState().view.open, 'corner');
  await VA.act(() => A.core.destroy());
  assert.equal(VA.node('corner-modal')?.visible ?? false, false);
  assert.equal(B.core.getState().view.open, 'corner', 'B не тронут');
  await VA.unmount();
  await VB.unmount();
  assert.deepEqual([A.live(), B.live()], [0, 0]);
  assert.deepEqual(Object.values(rn.keys).map((set) => set.size), [0, 0, 0, 0]);
  assert.equal(rn.animations.live.size, 0);
  assert.deepEqual([B.core.getState().view.open, B.core.getState().display.views], [null, []]);
  B.core.destroy();
});
