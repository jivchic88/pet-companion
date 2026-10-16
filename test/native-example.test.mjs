// Пример Expo (PL09, PL10.1): настоящий examples/expo/App.js. App.js исполняется как есть — только JSX превращается в вызовы
// react/jsx-runtime компилятором TypeScript (загрузчик отдаёт результат по адресу самого файла). React и react-dom —
// настоящие (у App.js каждая смена состояния useState записывается его экрану, test/fakes/react-state.mjs), вход
// pet-companion/native — настоящий (useNativeLifecycle, usePetState, PetView и штатные наборы), react-native и
// react-native-svg — подделки (test/fakes/react-native.mjs — system(), узлы по testID; test/fakes/react-native-svg.mjs),
// ./diagnostics.mjs — настоящая логика примера с управляемым вводом-выводом (test/fakes/expo-diagnostics.mjs: хранилище в
// памяти со счётчиком подключений ядер, удержание записи, управляемая точка каждого создания ядра, база хоста в памяти).
// PL09 — владение ядром: статусы всех созданных ядер, слушатели системы, подключения к хранилищу и отсутствие смен
// состояния экрана после размонтирования (обычный запуск, «Новое ядро», размонтирование при ожидающей загрузке, два
// конкурирующих «Новое ядро», команда в полёте, StrictMode, соседний экран). PL10.1 — хост и питомец: подтверждённое
// занятие сначала в счёте хоста, затем notify и реакция на рисунке; отказ хоста — без знака; повтор — без новой реакции;
// кормление по ядру и его повтор; ввод имени (тишина ввода); отключение и подключение; следующий день.
// Это Node и подделки React Native, не устройство: запуск на телефоне — examples/expo/README.md.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { nodeRoot, system } from './native-kit.mjs';

const rn = system();
globalThis.__petRN = rn;
const box = { cores: [], opens: 0, connections: 0, saved: 0, remembered: 0, manual: false, waiting: [], holdWrites: null, hostWrites: [], hostFail: false, notifies: [] };
globalThis.__petExample = box;

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const ROOT = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', ROOT), 'utf8'));
const APP = new URL('examples/expo/App.js', ROOT).href;
const fake = (name) => new URL(`./fakes/${name}`, import.meta.url).href;
const source = ts.transpileModule(await readFile(new URL(APP), 'utf8'), { fileName: 'App.jsx', compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
// Только импорты самого App.js: его React — с записью смен состояния, jsx-runtime — тот же React, что у библиотеки.
const FROM_APP = { react: fake('react-state.mjs'), 'react/jsx-runtime': pathToFileURL(require.resolve('react/jsx-runtime')).href, './diagnostics.mjs': fake('expo-diagnostics.mjs') };
const PEERS = { 'react-native': fake('react-native.mjs'), 'react-native-svg': fake('react-native-svg.mjs'), 'expo-sqlite': fake('expo-sqlite.mjs') };
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === APP && Object.hasOwn(FROM_APP, specifier)) return { url: FROM_APP[specifier], shortCircuit: true };
    if (Object.hasOwn(PEERS, specifier)) return { url: PEERS[specifier], shortCircuit: true };
    const entry = specifier.startsWith('pet-companion/') ? pkg.exports[`./${specifier.slice('pet-companion/'.length)}`] : null;
    if (entry) return { url: new URL(entry.default, ROOT).href, shortCircuit: true };
    return next(specifier, context);
  },
  load: (url, context, next) => (url === APP ? { format: 'module', source, shortCircuit: true } : next(url, context)),
});
const { default: App } = await import(APP);
const { Screen, screen } = await import(fake('expo-screen.mjs'));
const { catNative, dogNative } = await import('../pet/native.mjs');

const { act } = nodeRoot();
// Изоляция и после упавшей проверки: корни размонтированы, удержания отпущены, оставшиеся ядра уничтожены — следующая
// проверка начинает без чужих слушателей, подключений и стоящей очереди ключа.
const roots = [];
const held = [];
test.afterEach(async () => {
  for (const R of roots.splice(0)) await R.unmount();
  box.manual = false;
  box.hostFail = false;
  await act(() => {
    for (const open of held.splice(0)) open();
    for (const gate of box.waiting.splice(0)) gate.resolve();
  });
  box.holdWrites = null;
  for (const core of box.cores) core.destroy();
});
const holdWrites = () => {
  let open;
  box.holdWrites = new Promise((resolve) => (open = resolve));
  held.push(open);
  return open;
};

// Экран name в своём корне (StrictMode — по желанию). press(id) — обработчик кнопки последней отрисовки по testID; его
// обещание не возвращается: «Новое ядро» может держать управляемая точка. type(id, text) — ввод в поле.
function mount(name, { strict = false } = {}) {
  const R = nodeRoot();
  roots.push(R);
  const own = screen(name);
  let app = React.createElement(Screen.Provider, { value: name }, React.createElement(App));
  if (strict) app = React.createElement(React.StrictMode, null, app);
  const node = (id) => own.nodes.get(id)?.props ?? null;
  return {
    own,
    node,
    start: () => R.render(app),
    press: (id) =>
      act(() => {
        const props = node(id);
        assert.ok(props, `нет кнопки ${id}`);
        assert.notEqual(props.disabled, true, `${id} недоступна`);
        props.onPress();
      }),
    type: (id, text) => act(() => node(id).onChangeText(text)),
    status: () => String(node('status')?.children ?? ''),
    unmount: () => R.unmount(),
  };
}
const statuses = (list) => list.map((core) => core.status);
const since = (from) => box.cores.slice(from);
const release = (index) => act(() => box.waiting[index].resolve());
// После размонтирования: доделать всё, что ещё ждёт (fn), — экран своё состояние больше не меняет.
async function quiet(S, fn) {
  const writes = S.own.writes;
  await act(fn);
  assert.equal(S.own.writes, writes, 'после размонтирования экран своё состояние не меняет');
}
// Запущенный экран: ядро создано, начальная настройка движения ответила — ядро running.
async function running(name, options) {
  const from = box.cores.length;
  const S = mount(name, options);
  await S.start();
  await act(() => rn.answer(false));
  const [core] = since(from);
  assert.equal(core.status, 'running');
  return { S, core, from };
}

test('обычный запуск и размонтирование: одно ядро после загрузки, start — только после ready, питомец нарисован нативным набором; размонтирование уничтожает ядро и снимает слушатели и подключение', async () => {
  const from = box.cores.length;
  const S = mount('mount');
  await S.start();
  assert.deepEqual(statuses(since(from)), ['created'], 'до начальной синхронизации не запущено');
  assert.deepEqual([rn.live(), box.connections], [4, 1], 'хук: change, blur, reduceMotionChanged; журнал экрана: change; PetView своих слушателей системы не ставит');
  await act(() => rn.answer(false));
  assert.deepEqual(statuses(since(from)), ['running']);
  const art = S.node('pet-art');
  assert.equal(art.children.type, catNative.Figure, 'питомец — рисунок штатного набора, без WebView');
  assert.equal(S.node('pet-touch').accessibilityLabel, 'Марс, кот');
  assert.deepEqual(since(from)[0].getState().display.scenes, {}, 'сценки не объявлены');
  await S.unmount();
  assert.deepEqual([statuses(since(from)), rn.live(), box.connections], [['destroyed'], 0, 0]);
  await quiet(S);
});

test('«Новое ядро» → размонтирование: прежнее уничтожено заменой, новое — размонтированием; слушатели и подключения сняты', async () => {
  const { S, from } = await running('renew');
  await S.press('diag-renew');
  assert.deepEqual(statuses(since(from)), ['destroyed', 'created']);
  await act(() => rn.answer(false));
  assert.deepEqual([statuses(since(from)), rn.live(), box.connections], [['destroyed', 'running'], 4, 1]);
  await S.unmount();
  assert.deepEqual([statuses(since(from)), rn.live(), box.connections], [['destroyed', 'destroyed'], 0, 0]);
  await quiet(S);
});

test('размонтирование при ожидающей загрузке — первого ядра и нового: созданное после этого ядро сразу уничтожено, экран своё состояние не меняет', async () => {
  let from = box.cores.length;
  box.manual = true;
  const first = mount('pending-first');
  await first.start();
  assert.deepEqual([box.waiting.length, since(from).length], [1, 0], 'загрузка первого ядра ждёт');
  await first.unmount();
  await quiet(first, () => box.waiting.shift().resolve());
  assert.deepEqual([statuses(since(from)), rn.live(), box.connections], [['destroyed'], 0, 0]);

  box.manual = false;
  from = box.cores.length;
  const renewed = mount('pending-renew');
  await renewed.start();
  await act(() => rn.answer(false));
  box.manual = true;
  await renewed.press('diag-renew');
  assert.deepEqual([box.waiting.length, statuses(since(from))], [1, ['destroyed']], 'прежнее уничтожено, новое ждёт загрузки');
  await renewed.unmount();
  await quiet(renewed, () => box.waiting.shift().resolve());
  assert.deepEqual([statuses(since(from)), rn.live(), box.connections], [['destroyed', 'destroyed'], 0, 0]);
});

for (const order of [
  [0, 1],
  [1, 0],
]) {
  test(`два конкурирующих «Новое ядро» (ответы загрузки ${order.join(' → ')}): принимается только последнее нажатие, остальные ядра уничтожены, потерянных нет`, async () => {
    const { S, from } = await running(`race-${order.join('')}`);
    box.manual = true;
    // Двойное касание: оба нажатия — одним обработчиком, до новой отрисовки.
    const press = S.node('diag-renew').onPress;
    await act(() => {
      press();
      press();
    });
    assert.deepEqual([box.waiting.length, statuses(since(from))], [2, ['destroyed']]);
    const made = {};
    for (const index of order) {
      await release(index);
      made[index] = box.cores.at(-1);
    }
    box.waiting.length = 0;
    await act(() => rn.answer(false));
    assert.deepEqual([made[0].status, made[1].status], ['destroyed', 'running'], 'результат первого нажатия не заменяет последнее и не остаётся живым');
    assert.deepEqual([since(from).filter((core) => core.status !== 'destroyed').length, rn.live(), box.connections], [1, 4, 1]);
    await act(() => rn.emit('change', 'background'));
    assert.equal(made[1].getState().visible, false, 'экран привязан к ядру последнего нажатия');
    await act(() => rn.emit('change', 'active'));
    await S.unmount();
    assert.deepEqual([statuses(since(from)), rn.live(), box.connections], [['destroyed', 'destroyed', 'destroyed'], 0, 0]);
    await quiet(S);
  });
}

test('команда в полёте при размонтировании: имя с клавиатуры, поставленная запись после размонтирования доходит до хранилища, экран своё состояние не меняет', async () => {
  const { S, core } = await running('inflight');
  const open = holdWrites();
  await S.type('name-input', 'Барсик');
  await S.press('name-save');
  assert.deepEqual([core.getState().name.display, core.getState().save.cat.status], ['Барсик', 'pending']);
  await S.unmount();
  assert.deepEqual([core.status, box.connections], ['destroyed', 0]);
  const saved = box.saved;
  await quiet(S, () => open());
  assert.equal(box.saved, saved + 1, 'запись выполнена очередью после размонтирования');
});

test('StrictMode: двойной эффект запуска не оставляет ядра (первое уничтожено, слушатели одной привязки); «Новое ядро» и размонтирование — всё уничтожено', async () => {
  const from = box.cores.length;
  const opens = box.opens;
  const S = mount('strict', { strict: true });
  await S.start();
  assert.deepEqual([box.opens - opens, statuses(since(from)), rn.live(), box.connections], [2, ['destroyed', 'created'], 4, 1], 'эффект, снятие, снова эффект');
  await act(() => rn.answer(false));
  assert.deepEqual(statuses(since(from)), ['destroyed', 'running']);
  await S.press('diag-renew');
  await act(() => rn.answer(false));
  assert.deepEqual([statuses(since(from)), rn.live(), box.connections], [['destroyed', 'destroyed', 'running'], 4, 1]);
  await S.unmount();
  assert.deepEqual([statuses(since(from)), rn.live(), box.connections], [['destroyed', 'destroyed', 'destroyed'], 0, 0]);
  await quiet(S);
});

test('соседний экран: «Новое ядро» и размонтирование одного не трогают ядро, слушатели, подключение и кнопки другого', async () => {
  const from = box.cores.length;
  const left = mount('left');
  const right = mount('right');
  await left.start();
  await right.start();
  await act(() => rn.answer(false));
  const [leftCore, rightCore] = since(from);
  assert.deepEqual([statuses(since(from)), rn.live(), box.connections], [['running', 'running'], 8, 2]);
  await left.press('diag-renew');
  await act(() => rn.answer(false));
  const leftFresh = box.cores.at(-1);
  assert.deepEqual([leftCore.status, leftFresh.status, rightCore.status], ['destroyed', 'running', 'running']);
  await left.unmount();
  assert.deepEqual([leftFresh.status, rightCore.status, rn.live(), box.connections], ['destroyed', 'running', 4, 1]);
  await quiet(left);
  await right.type('name-input', 'Дымок');
  await right.press('name-save');
  await act();
  assert.deepEqual([rightCore.getState().name.display, rightCore.getState().save.cat.status], ['Дымок', 'saved'], 'кнопки соседа работают');
  await right.unmount();
  assert.deepEqual([statuses(since(from)), rn.live(), box.connections], [['destroyed', 'destroyed', 'destroyed'], 0, 0]);
  await quiet(right);
});

test('хост (PL10.1): подтверждённое занятие — запись хоста, затем notify: счёт уже со знаком, реакция радости на рисунке; отказ хоста — без знака и без радости; повтор того же ключа — без новой реакции; кормление по ядру, повтор — отказ ядра', async () => {
  const { S, core } = await running('host');
  assert.deepEqual([core.getState().treat, S.node('pet-feed').accessibilityLabel], ['waiting', 'Покормить (сначала занятие)']);
  // Корм до занятия: кнопка доступна, решает ядро.
  await S.press('pet-feed');
  assert.match(S.status(), /Покормить: Сегодня ещё не было занятия/);
  const writes = box.hostWrites.length;
  box.notifies.length = 0;
  await S.press('host-save');
  await act();
  assert.deepEqual(box.hostWrites.slice(writes), ['INSERT INTO example_marks'], 'сначала — запись хоста');
  assert.deepEqual(box.notifies.map(({ type, today }) => [type, today]), [['saved', 1]], 'notify — после записи: счёт хоста уже со знаком');
  assert.deepEqual([core.getState().progress.today, core.getState().pose.reaction?.type], [1, 'joy']);
  assert.equal(S.node('pet-art').children.props.pose, 'joy', 'радость — на рисунке');
  assert.match(S.status(), /Занятие сохранено: знаков сегодня 1/);
  const joy = core.getState().pose.reaction.id;
  await S.press('host-repeat');
  assert.equal(core.getState().pose.reaction?.id, joy, 'повтор не дал новой реакции');
  assert.match(S.status(), /Повтор того же занятия: реакции и знака нет/);
  // Кнопка «Занятие не сохранилось»: хост отказывает до записи — знака нет, notify('failed').
  await S.press('host-fail');
  await act();
  assert.deepEqual([core.getState().progress.today, box.hostWrites.length - writes, box.notifies.at(-1)?.type], [1, 1, 'failed'], 'отказ хоста — знака нет');
  assert.match(S.status(), /Занятие не сохранилось — знака нет/);
  // Отказ самой записи хоста (база) у «Занятие сохранено» — тоже без знака и notify('failed').
  box.hostFail = true;
  await S.press('host-save');
  await act();
  assert.deepEqual([core.getState().progress.today, box.hostWrites.length - writes, box.notifies.at(-1)?.type], [1, 1, 'failed']);
  box.hostFail = false;
  assert.equal(core.getState().treat, 'ready');
  assert.equal(S.node('pet-feed').accessibilityLabel, 'Покормить');
  await S.press('pet-feed');
  await act();
  assert.deepEqual([core.getState().treat, core.getState().save.treat.status], ['fed', 'saved']);
  const name = core.getState().name.display;
  assert.equal(rn.announced.filter((text) => text === `${name} получает лакомство. Сегодня уже угостили.`).length, 1, 'объявление ядра — PetView, один раз');
  await S.press('pet-feed');
  assert.match(S.status(), /Покормить: Сегодня уже угостили/);
  await S.unmount();
});

test('настройки (PL10.1): выбор собаки, облик, платок по ступени, движение и ввод имени — командами ядра; поле ввода включает тишину ввода; длинное имя очищает ядро', async () => {
  const { S, core } = await running('settings');
  await S.press('kind-dog');
  await act();
  assert.deepEqual([core.getState().pet.shown, S.node('pet-art').children.type, S.node('kind-dog').accessibilityState.selected], ['dog', dogNative.Figure, true]);
  await S.press('coat-spotted');
  await act();
  assert.equal(S.node('pet-art').children.props.coat, 'spotted');
  assert.deepEqual([S.node('acc-plaid').disabled, S.node('acc-plaid').accessibilityHint], [true, 'Откроется на ступени 1'], 'клетчатый платок ещё не открыт');
  await S.press('motion-none');
  await act();
  assert.equal(core.getState().prefs.effectiveMotion, 'none');
  await act(() => S.node('name-input').onFocus());
  assert.deepEqual(core.getState().context.quiet, ['typing']);
  await S.type('name-input', 'Шшшшшшшшшшшшшшшшшшшшшшшшшшшшшш');
  await act(() => S.node('name-input').onSubmitEditing());
  await act(() => S.node('name-input').onBlur());
  assert.deepEqual(core.getState().context.quiet, []);
  assert.equal(core.getState().name.display.length, 24, 'ядро ограничило имя');
  assert.equal(S.node('pet-touch').accessibilityLabel, `${core.getState().name.display}, собака`);
  await S.unmount();
});

test('отключение и подключение (PL10.1): «Отключить питомца» уничтожает ядро и снимает слушатели, питомца нет; «Подключить питомца» — load → новое ядро → ready → start, подтверждённое восстановлено', async () => {
  const { S, core, from } = await running('detach');
  await S.press('kind-cat');
  await act();
  await S.press('coat-ginger');
  await act();
  await S.press('pet-off');
  assert.deepEqual([core.status, S.node('pet-art'), rn.live(), box.connections], ['destroyed', null, 1, 0], 'остался только журнал AppState экрана');
  assert.ok(S.node('pet-on'));
  await S.press('pet-on');
  assert.equal(since(from).length, 2);
  const fresh = box.cores.at(-1);
  assert.equal(fresh.status, 'created', 'start — только после ready');
  await act(() => rn.answer(false));
  assert.deepEqual([fresh.status, fresh.getState().look.coat, rn.live(), box.connections], ['running', 'ginger', 4, 1]);
  assert.equal(S.node('pet-art').children.props.coat, 'ginger');
  await S.unmount();
  assert.deepEqual([fresh.status, rn.live(), box.connections], ['destroyed', 0, 0]);
});

test('следующий день (PL10.1): сдвиг дня хоста записан, ядро заново с теми же часами — лакомство нового дня ждёт занятия, счёт сегодня 0', async () => {
  const { S, core } = await running('day');
  await S.press('host-save');
  await act();
  await S.press('pet-feed');
  await act();
  assert.equal(core.getState().treat, 'fed');
  const writes = box.hostWrites.length;
  await S.press('day-next');
  await act();
  await act(() => rn.answer(false));
  const fresh = box.cores.at(-1);
  assert.deepEqual(box.hostWrites.slice(writes), ['INSERT INTO example_clock'], 'сдвиг дня — запись хоста');
  assert.deepEqual([core.status, fresh.status, fresh.getState().treat, fresh.getState().progress.today], ['destroyed', 'running', 'waiting', 0]);
  await S.unmount();
});
