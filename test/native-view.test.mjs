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

test('штатные наборы: проходят проверку против своих определений; каждая нарисованная поза — свой рисунок; облики и аксессуары различимы; только элементы react-native-svg, не строка', () => {
  const defs = new Map(PETS.map((def) => [def.id, def]));
  for (const kit of KITS) {
    assert.equal(Kits.nativeKitProblem(kit, defs, React.isValidElement), '', kit.pet);
    const needs = Kits.nativeKitNeeds(defs.get(kit.pet));
    assert.ok(needs.poses.every((pose) => kit.poses.includes(pose)), `${kit.pet}: обязательные позы и лапа`);
    assert.ok(needs.poses.includes('paw'), 'у кота и собаки лапа есть — поза paw обязательна');
    assert.deepEqual(kit.substitutes, { settle: 'content' }, 'необязательная декоративная поза settle — явная замена');
    const element = kit.Figure({ pose: 'calm', coat: kit.coats[0], accessory: 'scarf', toward: '', prefix: 'q' });
    assert.ok(React.isValidElement(element) && typeof element !== 'string');
    const shapes = new Map(kit.poses.map((pose) => [pose, markupOf(kit, { pose })]));
    assert.equal(new Set(shapes.values()).size, kit.poses.length, `${kit.pet}: позы различимы (${kit.poses.join(', ')})`);
    for (const markup of shapes.values()) for (const [, tag] of markup.matchAll(/<([a-zA-Z]+)/g)) assert.ok(TAGS.has(tag.toLowerCase()), `${kit.pet}: ${tag}`);
    for (const pose of ['sniff', 'watch', 'ball']) assert.notEqual(markupOf(kit, { pose, toward: 'right' }), shapes.get(pose), `${kit.pet} ${pose}: предмет справа`);
    const coats = kit.coats.map((coat) => markupOf(kit, { pose: 'calm', coat }));
    assert.equal(new Set(coats).size, kit.coats.length, `${kit.pet}: облики различимы`);
    assert.equal(markupOf(kit, { pose: 'calm', coat: 'нет-такого' }), coats[0], 'неизвестный облик — облик по умолчанию, как веб');
    const scarf = markupOf(kit, { pose: 'calm' });
    const plaid = markupOf(kit, { pose: 'calm', accessory: 'plaid' });
    const badge = markupOf(kit, { pose: 'calm', accessory: 'badge' });
    assert.ok(plaid.includes('url(#q-' + kit.pet + '-plaid)') && !scarf.includes('url(#q-' + kit.pet + '-plaid)'), `${kit.pet}: клетчатый платок — узор`);
    assert.ok(badge.includes('#4f8a6e') && !scarf.includes('#4f8a6e'), `${kit.pet}: бейдж`);
    assert.ok(!markupOf(kit, { pose: 'calm', accessory: '' }).includes(`url(#q-${kit.pet}-scarf)`), `${kit.pet}: без аксессуара — без платка`);
  }
  // Суставы — всегда явная строка преобразования (тождество — translate(0, 0)): react-native-svg на Fabric при снятии
  // свойства transform прежнюю матрицу не сбрасывает (найдено в iOS Simulator: платок оставался опущенным после «ест»).
  const elements = (node, list = []) => {
    if (Array.isArray(node)) for (const item of node) elements(item, list);
    else if (React.isValidElement(node)) {
      list.push(node);
      elements(node.props.children, list);
    }
    return list;
  };
  for (const kit of KITS) {
    for (const pose of kit.poses) {
      for (const toward of ['', 'right']) {
        const bad = elements(kit.Figure({ pose, coat: kit.coats[0], accessory: 'badge', toward, prefix: 'q' })).filter((el) => Object.hasOwn(el.props, 'transform') && (typeof el.props.transform !== 'string' || el.props.transform === ''));
        assert.deepEqual(bad.map((el) => el.type), [], `${kit.pet} ${pose} ${toward}: transform — непустая строка`);
      }
    }
  }
  assert.ok(markupOf(catNative, { pose: 'calm', coat: 'ginger' }).includes('#e0954f') && markupOf(dogNative, { pose: 'calm', coat: 'blacktan' }).includes('#4d423b'), 'палитры обликов веба');
  assert.ok(markupOf(catNative, { pose: 'feed' }).includes('#b0743f') && !markupOf(catNative, { pose: 'fed' }).includes('#b0743f'), 'лакомство: миска с кормом, после — пустая');
});

test('проверка набора: отказ до подключения — не объект, нет определения, лишние поля, не нарисованы обязательная поза, лапа или облик определения, Figure — строка, исключение или не функция, неверная замена; лапа не нужна питомцу без лапы, замены определения учитываются', () => {
  const defs = new Map(PETS.map((def) => [def.id, def]));
  const check = (kit, list = defs) => Kits.nativeKitProblem(kit, list, React.isValidElement);
  const without = (field, value) => ({ ...catNative, [field]: catNative[field].filter((item) => item !== value) });
  const cases = [
    [null, /объект/],
    [{ ...catNative, pet: 'example.fox' }, /нет определения/],
    [{ ...catNative, scenes: ['nope'] }, /у определения нет сценки «nope»/],
    [{ ...catNative, art: () => '<svg/>' }, /неизвестные поля art/],
    [without('poses', 'joy'), /не нарисовано \(poses\): joy/],
    [without('poses', 'paw'), /не нарисовано \(poses\): paw/],
    [without('coats', 'tuxedo'), /не нарисовано \(coats\): tuxedo/],
    [without('accessories', 'badge'), /не нарисовано \(accessories\): badge/],
    [{ ...catNative, Figure: () => '<svg class="cat-art"></svg>' }, /элемент React/],
    [{ ...catNative, Figure: () => null }, /элемент React/],
    [{ ...catNative, Figure: '<svg/>' }, /Figure — функция/],
    [{ ...catNative, Figure: () => { throw new Error('сломан'); } }, /исключение \(сломан\)/],
    [{ ...catNative, substitutes: { joy: 'calm' } }, /substitutes\.joy — заменять можно только необязательные/],
    [{ ...catNative, substitutes: { settle: 'nope' } }, /поза nope не нарисована/],
    [{ ...catNative, poses: 'calm' }, /poses — плотный массив/],
  ];
  for (const [kit, problem] of cases) assert.match(check(kit), problem);
  // Изменённое определение кота с новым обликом: штатный набор его не рисует — отказ.
  const purple = definePet({ ...cat, coats: [...cat.coats, { id: 'purple', title: 'Фиолетовый' }] });
  assert.match(check(catNative, new Map([['cat', purple]])), /не нарисовано \(coats\): purple/);
  // Питомец без лапы и с заменами определения: набору не нужны paw и заменённые позы.
  const bunny = definePet({ ...cat, id: 'example.bunny', fallback: 'cat', poses: ['calm', 'attentive', 'rest', 'content', 'joy', 'pet', 'feed', 'sniff', 'support'], poseFallback: { wait: 'attentive', unlock: 'joy', greet: 'joy', fed: 'content', watch: 'attentive', ball: 'attentive' }, actions: { pet: { text: '{name} шевелит носом.' }, paw: null }, play: { ...cat.play, paw: null }, scenes: [] });
  const drawn = ['calm', 'attentive', 'rest', 'content', 'joy', 'pet', 'feed', 'sniff', 'support'];
  const bunnyKit = { pet: 'example.bunny', poses: drawn, coats: cat.coats.map((coat) => coat.id), accessories: cat.accessories.map((item) => item.id), Figure: catNative.Figure };
  assert.equal(check(bunnyKit, new Map([['example.bunny', bunny]])), '');
  assert.deepEqual(Kits.nativeKitNeeds(bunny).poses.sort(), [...drawn].sort());
  // Выбор позы при показе: нарисована — она; замена набора; замена определения; иначе базовая.
  assert.equal(Kits.drawnPose(catNative, cat, 'joy', 'calm'), 'joy');
  assert.equal(Kits.drawnPose(catNative, cat, 'settle', 'calm'), 'content');
  assert.equal(Kits.drawnPose(bunnyKit, bunny, 'wait', 'calm'), 'attentive');
  assert.equal(Kits.drawnPose({ ...catNative, poses: catNative.poses.filter((pose) => pose !== 'stretch') }, cat, 'stretch', 'rest'), 'rest', 'поза сценки без рисунка — базовая поза снимка');
  assert.equal(Kits.drawnPose(catNative, cat, 'stretch', 'rest'), 'stretch', 'PL10.2.4: штатный кот рисует позу сценки');
  // Каталог: дубликаты, пустые списки.
  assert.match(Kits.nativeCatalog(PETS, [catNative, catNative], React.isValidElement).problem, /дважды/);
  assert.match(Kits.nativeCatalog([], KITS, React.isValidElement).problem, /pets/);
  assert.match(Kits.nativeCatalog(PETS, [], React.isValidElement).problem, /kits/);
  assert.deepEqual(Kits.nativeCatalog(PETS, [dogNative], React.isValidElement).ids, ['dog']);
});

test('неверный набор: PetView показывает читаемый отказ и ничего не делает с ядром — ни подписки, ни объявления отображения, ни команд', async () => {
  const L = await lab();
  const bad = { ...catNative, coats: ['smoke'] };
  const V = view('bad-kit', { core: L.spy, pets: PETS, kits: [bad, dogNative] });
  await V.render();
  const before = L.core.getState();
  assert.deepEqual([L.calls.subscribe, L.calls.setDisplay.length, L.calls.interact.length, L.calls.activity], [0, 0, 0, 0]);
  assert.match(String(V.node('pet-problem').children), /Питомец не показан: набор «cat»: не нарисовано \(coats\): ginger, tuxedo/);
  assert.equal(V.node('pet').accessibilityRole, 'alert');
  assert.equal(V.node('pet-art'), null, 'рисунка нет');
  assert.equal(L.core.getState(), before, 'снимок ядра прежний (display не объявлен)');
  assert.equal(before.display.pets, null);
  assert.deepEqual(L.log.list, []);
  await V.act(() => L.core.destroy());
});

test('объявление отображения и рисунок по снимку: только нарисованные питомцы, без видов и сценок; имя, вид, облик, аксессуар и поза реакции — из снимка, без своей копии правил', async () => {
  const L = await lab();
  const V = view('draw', { core: L.spy, pets: PETS, kits: KITS, size: 220 });
  await V.render();
  assert.deepEqual(L.calls.setDisplay, [{ full: true, moving: false, pets: ['cat', 'dog'], views: [], scenes: { cat: ['stretch', 'curl'], dog: ['fetch'] } }]);
  const display = L.core.getState().display;
  assert.deepEqual([display.pets, display.views, display.scenes, display.full], [['cat', 'dog'], [], { cat: ['stretch', 'curl'], dog: ['fetch'] }, true]);
  await started(L, V);
  let art = V.figure();
  assert.equal(art.element.type, catNative.Figure);
  assert.deepEqual([art.width, art.height], [220, 204], 'рамка рисунка определения 220×204');
  assert.deepEqual([art.element.props.pose, art.element.props.coat, art.element.props.accessory], [L.core.getState().pose.shown.page, 'smoke', 'scarf']);
  assert.equal(V.node('pet-touch').accessibilityLabel, 'Марс, кот');
  assert.equal(V.node('pet-touch').accessibilityRole, 'button');
  // Прямые команды хоста — тем же путём через снимок.
  await V.act(() => L.core.setName('Котофей Длинноимённый'));
  assert.equal(V.node('pet-touch').accessibilityLabel, 'Котофей Длинноимённый, кот');
  await V.act(() => L.core.setAppearance({ coat: 'ginger' }));
  assert.equal(V.figure().element.props.coat, 'ginger');
  await V.act(() => L.core.setPet('dog'));
  art = V.figure();
  assert.deepEqual([art.element.type, art.element.props.coat, V.node('pet-touch').accessibilityLabel], [dogNative.Figure, 'caramel', 'Тоби, собака']);
  await V.act(() => L.plan.advance(8000));
  // Подтверждённое действие хоста: счёт уже обновлён, затем notify — реакция ядра видна рисунком.
  L.counts.set(1, 1);
  const saved = await V.act(() => L.core.notify('saved', { key: 'k1', counted: true }));
  void saved;
  const joy = L.core.getState().pose.reaction;
  assert.equal(joy?.type, 'joy');
  assert.equal(V.figure().element.props.pose, 'joy');
  assert.match(V.figure().svg, /#e2808a/, 'у собаки в радости открытая пасть');
  // Повтор того же key — ядро его не награждает и не играет снова.
  const again = await V.act(() => L.core.notify('saved', { key: 'k1', counted: true }));
  void again;
  assert.equal(L.core.getState().pose.reaction?.id, joy.id, 'повтор не дал новой реакции');
  await V.act(() => L.plan.advance(4000));
  assert.equal(L.core.getState().pose.reaction, null);
  assert.notEqual(V.figure().element.props.pose, 'joy', 'реакция кончилась — рисунок вернулся к позе покоя');
  await V.act(() => L.core.destroy());
});

test('касание питомца — activity и interact({ type: "pet" }) публичного ядра: поза «гладят», знаков и наград нет; доступное имя и роль', async () => {
  const L = await lab();
  const V = view('touch', { core: L.spy, pets: PETS, kits: KITS });
  await V.render();
  await started(L, V);
  const progress = L.core.getState().progress;
  await V.act(() => V.node('pet-touch').onPress());
  assert.deepEqual(L.calls.interact, [{ type: 'pet' }]);
  assert.equal(L.calls.activity, 1);
  assert.equal(L.core.getState().pose.reaction?.type, 'pet');
  assert.equal(V.figure().element.props.pose, 'pet');
  assert.deepEqual(L.core.getState().progress, progress, 'счёт и ступень прежние');
  assert.equal(V.node('pet-touch').accessibilityHint, 'Погладить');
  assert.deepEqual(V.node('pet-touch').accessibilityState, { disabled: false });
  await V.act(() => L.core.destroy());
});

test('движение реакции: Animated только при обычном или спокойном движении, на виду и у запущенного ядра; конец реакции, системное «уменьшить движение», фон, смена ядра и размонтирование снимают анимацию; фон ничего не доигрывает', async () => {
  const L = await lab();
  const V = view('motion', { core: L.spy, pets: PETS, kits: KITS });
  await V.render();
  await started(L, V);
  rn.animations.live.clear();
  const base = { ...rn.animations };
  L.counts.set(1, 1);
  await V.act(() => L.core.notify('saved', { key: 'm1', counted: true }));
  assert.equal(rn.animations.started - base.started, 1, 'прыжок радости');
  const [hop] = rn.animations.live;
  assert.ok(hop.steps.every((step) => step.useNativeDriver === true) && hop.steps[0].toValue < 0, 'вверх, на нативном драйвере');
  await V.act(() => L.plan.advance(4000));
  assert.equal(rn.animations.live.size, 0, 'реакция кончилась — анимация снята');
  // Системное «уменьшить движение»: поза радости статично, без анимации.
  await V.act(() => L.core.setReducedMotion(true));
  L.counts.set(2, 2);
  const started2 = rn.animations.started;
  await V.act(() => L.core.notify('saved', { key: 'm2', counted: true }));
  assert.equal(L.core.getState().prefs.effectiveMotion, 'none');
  assert.equal(V.figure().element.props.pose, 'joy', 'смысл реакции — статической позой');
  assert.deepEqual([rn.animations.started, rn.animations.live.size], [started2, 0]);
  await V.act(() => L.plan.advance(4000));
  await V.act(() => L.core.setReducedMotion(false));
  // Идущая анимация и включение системной настройки посреди реакции — снята сразу.
  L.counts.set(3, 3);
  await V.act(() => L.core.notify('saved', { key: 'm3', counted: true }));
  assert.equal(rn.animations.live.size, 1);
  await V.act(() => L.core.setReducedMotion(true));
  assert.equal(rn.animations.live.size, 0, 'уменьшение движения снимает идущую анимацию');
  await V.act(() => L.core.setReducedMotion(false));
  await V.act(() => L.plan.advance(4000));
  // Фон во время реакции: ядро снимает реакцию, анимация снята; событие в фоне не играет и после возврата не доигрывается.
  L.counts.set(4, 4);
  await V.act(() => L.core.notify('saved', { key: 'm4', counted: true }));
  assert.equal(rn.animations.live.size, 1);
  await V.act(() => L.core.setVisible(false));
  assert.deepEqual([rn.animations.live.size, L.core.getState().pose.reaction], [0, null]);
  L.counts.set(5, 5);
  const inBackground = rn.animations.started;
  await V.act(() => L.core.notify('saved', { key: 'm5', counted: true }));
  await V.act(() => L.core.setVisible(true));
  assert.deepEqual([rn.animations.started, L.core.getState().pose.reaction], [inBackground, null], 'ничего не доигрывается');
  // Смена ядра и размонтирование посреди реакции.
  L.counts.set(6, 6);
  await V.act(() => L.core.notify('saved', { key: 'm6', counted: true }));
  assert.equal(rn.animations.live.size, 1);
  const M = await lab();
  await V.render({ core: M.spy, pets: PETS, kits: KITS });
  assert.equal(rn.animations.live.size, 0, 'смена ядра снимает анимацию прежнего');
  assert.deepEqual([L.live(), M.live(), M.calls.setDisplay.length], [0, 2, 1], 'подписки прежнего ядра сняты; новое — объявлено');
  await V.unmount();
  assert.deepEqual([M.live(), rn.animations.live.size], [0, 0], 'размонтирование снимает подписки и анимации');
  L.core.destroy();
  M.core.destroy();
});

test('объявления: эффект announce ядра — announceForAccessibility по одному разу (и в StrictMode, и при повторных отрисовках); announce: false — молчит; поздний результат асинхронной записи не дублирует', async () => {
  for (const strict of [false, true]) {
    const L = await lab();
    const V = view(`announce-${strict}`, { core: L.spy, pets: PETS, kits: KITS }, { strict });
    await V.render();
    await started(L, V);
    assert.equal(L.live(), 2, 'одна подписка снимка и одна объявлений');
    rn.announced.length = 0;
    L.counts.set(1, 1);
    await V.act(() => L.core.notify('saved', { key: 'a1', counted: true }));
    await V.act(() => L.plan.advance(4000));
    const fed = await V.act(() => L.core.feed());
    void fed;
    await V.render();
    await V.act(() => L.plan.advance(8000));
    const texts = rn.announced.filter((text) => /лакомство/.test(text));
    assert.deepEqual(texts, ['Марс получает лакомство. Сегодня уже угостили.']);
    assert.equal(rn.announced.length, new Set(rn.announced).size, 'без повторов');
    // Повторное кормление — ядро отказывает, объявления нет.
    const twice = L.core.feed();
    assert.deepEqual([twice.ok, twice.error?.code], [false, 'treat-fed']);
    assert.equal(rn.announced.filter((text) => /лакомство/.test(text)).length, 1);
    await V.render({ core: L.spy, pets: PETS, kits: KITS, announce: false });
    rn.announced.length = 0;
    await V.act(() => L.core.setName('Пельмень'));
    assert.deepEqual(rn.announced, [], 'announce: false — объявлений нет');
    assert.equal(L.live(), 1, 'подписка объявлений снята');
    await V.act(() => L.core.destroy());
  }
});

test('два экземпляра на разных ядрах не мешают друг другу; скрытый питомец не рисуется; внешний destroy — PetView пуст, без ошибок и анимаций', async () => {
  const A = await lab();
  const B = await lab();
  const VA = view('pair-a', { core: A.spy, pets: PETS, kits: KITS });
  const VB = view('pair-b', { core: B.spy, pets: PETS, kits: [dogNative] });
  await VA.render();
  await VB.render();
  await started(A, VA);
  await started(B, VB);
  assert.deepEqual([A.core.getState().display.pets, B.core.getState().display.pets], [['cat', 'dog'], ['dog']]);
  assert.deepEqual([B.core.getState().pet.shown, VB.figure().element.type], ['dog', dogNative.Figure], 'у B нарисована только собака — ядро показывает её');
  await VA.act(() => VA.node('pet-touch').onPress());
  assert.deepEqual([A.calls.interact.length, B.calls.interact.length, B.core.getState().pose.reaction], [1, 0, null]);
  await VB.act(() => B.core.hide());
  assert.equal(VB.node('pet-art'), null, 'спрятан — не рисуется');
  assert.notEqual(VA.node('pet-art'), null);
  A.counts.set(1, 1);
  await VA.act(() => A.core.notify('saved', { key: 'd1', counted: true }));
  assert.equal(rn.animations.live.size, 1);
  await VA.act(() => A.core.destroy());
  assert.deepEqual([VA.node('pet-art'), rn.animations.live.size], [null, 0], 'внешний destroy: рисунка нет, анимация снята');
  await VA.unmount();
  assert.equal(A.live(), 0, 'размонтирование снимает обе подписки');
  await VB.act(() => B.core.destroy());
});
