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
// кормление по ядру и его повтор; ввод имени (тишина ввода); отключение и подключение; следующий день. Доработка PL10.1 —
// черновик имени принадлежит ядру и показанному питомцу (смена кнопкой, прямой командой ядра, в такте нажатия, отключение
// и подключение, «Новое ядро»; фокус и тишина ввода); сверка перезапуска по дню хоста — через экран (файл примера между
// запусками, box.disk) и на настоящей логике примера с публичным ядром (тот же и следующий день, потерянная запись,
// прежние форматы записи).
// Это Node и подделки React Native, не устройство: запуск на телефоне — examples/expo/README.md.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { calendar, flush, host as counter } from './core-kit.mjs';
import { nodeRoot, system } from './native-kit.mjs';

const rn = system();
globalThis.__petRN = rn;
const box = { cores: [], opens: 0, connections: 0, saved: 0, remembered: 0, manual: false, waiting: [], holdWrites: null, hostWrites: [], hostFail: false, notifies: [], disk: null };
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
const PEERS = { 'react-native': fake('react-native.mjs'), 'react-native-svg': fake('react-native-svg.mjs'), 'expo-sqlite': fake('expo-sqlite.mjs'), 'react-native-safe-area-context': fake('react-native-safe-area-context.mjs') };
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
const D = await import('../examples/expo/diagnostics.mjs');
const { createStorage } = await import('../pet/core.mjs');

const { act } = nodeRoot();
// Изоляция и после упавшей проверки: корни размонтированы, удержания отпущены, оставшиеся ядра уничтожены — следующая
// проверка начинает без чужих слушателей, подключений и стоящей очереди ключа.
const roots = [];
const held = [];
// Ядра сверки перезапуска (files() ниже): у них настоящий планировщик — уничтожаются и после упавшей проверки.
const opened = [];
test.afterEach(async () => {
  for (const core of opened.splice(0)) core.destroy();
  for (const R of roots.splice(0)) await R.unmount();
  box.manual = false;
  box.hostFail = false;
  box.disk = null;
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
  assert.deepEqual(since(from)[0].getState().display.scenes, { cat: ['stretch', 'curl'], dog: ['fetch'], 'example.bunny': ['hop'] }, 'сценки наборов объявлены (PL10.2.4; кролик — пример расширения)');
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
  // Модель поведения (PL10.2.4): выбор — командой ядра, кнопка выбранной модели отмечена (снимок — behavior.shown).
  assert.deepEqual([S.node('model-calm').accessibilityState.selected, S.node('model-example.lively').accessibilityState.selected], [true, false]);
  await S.press('model-example.lively');
  await act();
  assert.deepEqual([core.getState().behavior.shown, S.node('model-calm').accessibilityState.selected, S.node('model-example.lively').accessibilityState.selected], ['example.lively', false, true]);
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
  await act();
  assert.match(String(S.node('check:Подключение: восстановлено')?.children), /^✓/, 'сверка — по подтверждённому после записей start, не раньше');
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
  await act();
  assert.match(String(S.node('check:Следующий день: восстановлено')?.children), /^✓/, 'start нового дня пишет день приветствия — сверка ждёт подтверждения, а не даёт ложный ✗');
  await S.unmount();
});

// Черновик имени (доработка PL10.1 по независимой проверке Codex): имена обоих питомцев в ядре — [кот, собака]; поле
// имени — его последние свойства (value, editable, ref подделки с focus / blur / isFocused).
const names = (core) => ['cat', 'dog'].map((id) => core.getState().pets[id].name.display);
const field = (S) => S.node('name-input');
// Питомец id с сохранённым именем name — обычным вводом и «Сохранить имя».
async function named(S, id, name) {
  await S.press(`kind-${id}`);
  await act();
  await S.type('name-input', name);
  await S.press('name-save');
  await act();
}

test('черновик имени: обычное редактирование — имя своему питомцу; несохранённый ввод кота при выборе собаки кнопкой к ней не переходит — в поле имя собаки, «Сохранить имя» и Enter не меняют ни одного имени; у кота черновик снят, а не отложен', async () => {
  const { S, core } = await running('draft-pick');
  await S.press('kind-cat');
  await act();
  await act(() => field(S).ref.current.focus());
  assert.deepEqual(core.getState().context.quiet, ['typing'], 'фокус поля — тишина ввода');
  await S.type('name-input', 'Барсик');
  await S.press('name-save');
  await act();
  assert.deepEqual([field(S).ref.current.isFocused(), core.getState().context.quiet], [false, []], 'сохранение снимает фокус и тишину ввода');
  await S.press('kind-dog');
  await act();
  await S.type('name-input', 'Рекс');
  await act(() => field(S).onSubmitEditing());
  await act();
  assert.deepEqual(names(core), ['Барсик', 'Рекс'], 'обычное редактирование: каждому — своё имя');

  await S.press('kind-cat');
  await act();
  await act(() => field(S).ref.current.focus());
  await S.type('name-input', 'CatDraft');
  assert.equal(field(S).value, 'CatDraft');
  await S.press('kind-dog');
  await act();
  assert.deepEqual([core.getState().pet.shown, field(S).value], ['dog', 'Рекс'], 'в поле — имя собаки, не черновик кота');
  assert.deepEqual(core.getState().context.quiet, ['typing'], 'поле по-прежнему в фокусе — тишина ввода остаётся');
  await S.press('name-save');
  await act();
  assert.deepEqual(names(core), ['Барсик', 'Рекс'], '«Сохранить имя» не переименовало собаку черновиком кота');
  await act(() => field(S).onSubmitEditing());
  await act();
  assert.deepEqual(names(core), ['Барсик', 'Рекс'], 'Enter — тоже');
  await S.press('kind-cat');
  await act();
  assert.equal(field(S).value, 'Барсик');
  // Без сохранения: черновик кота → собака → снова кот.
  await S.type('name-input', 'CatDraft');
  await S.press('kind-dog');
  await act();
  await S.press('kind-cat');
  await act();
  assert.equal(field(S).value, 'Барсик', 'у кота — сохранённое имя: черновик снят при смене, а не отложен');
  await S.press('name-save');
  await act();
  assert.deepEqual(names(core), ['Барсик', 'Рекс']);
  await S.unmount();
});

test('черновик имени: смена питомца прямой командой ядра (не кнопкой экрана) — черновик не переходит; «Сохранить имя» в одном такте со сменой (обработчик отрисовки с черновиком кота) сверяет черновик с питомцем ядра в момент нажатия', async () => {
  const { S, core } = await running('draft-direct');
  await named(S, 'cat', 'Барсик');
  await named(S, 'dog', 'Рекс');
  await act(() => core.setPet('cat'));
  await S.type('name-input', 'CatDraft');
  await act(() => core.setPet('dog'));
  assert.equal(field(S).value, 'Рекс');
  await S.press('name-save');
  await act();
  assert.deepEqual(names(core), ['Барсик', 'Рекс']);

  await act(() => core.setPet('cat'));
  await S.type('name-input', 'CatDraft');
  const save = S.node('name-save').onPress;
  await act(() => {
    core.setPet('dog');
    save();
  });
  await act();
  assert.deepEqual(names(core), ['Барсик', 'Рекс'], 'черновик кота не сохранён собаке');
  await act(() => core.setPet('cat'));
  assert.equal(field(S).value, 'Барсик');
  await S.unmount();
});

test('черновик имени: отключение и подключение, «Новое ядро» — несохранённый ввод не переходит в новое ядро; смена ядра снимает фокус поля, у нового ядра тишины ввода нет; сохранение имени после этого — прежним setName текущему питомцу', async () => {
  const { S, core } = await running('draft-core');
  await named(S, 'dog', 'Рекс');
  await named(S, 'cat', 'Барсик');
  await act(() => field(S).ref.current.focus());
  await S.type('name-input', 'CatDraft');
  assert.deepEqual(core.getState().context.quiet, ['typing']);
  await S.press('pet-off');
  assert.deepEqual([field(S).ref.current.isFocused(), field(S).value, field(S).editable], [false, '', false], 'ядра нет: фокус снят, поле пустое и недоступно');
  await S.press('pet-on');
  await act(() => rn.answer(false));
  const fresh = box.cores.at(-1);
  assert.deepEqual([fresh.status, field(S).value, fresh.getState().context.quiet], ['running', 'Барсик', []], 'новое ядро: сохранённое имя, тишины ввода нет');
  await S.press('name-save');
  await act();
  assert.deepEqual(names(fresh), ['Барсик', 'Рекс']);

  await act(() => field(S).ref.current.focus());
  await S.type('name-input', 'CatDraft');
  await S.press('diag-renew');
  await act(() => rn.answer(false));
  const renewed = box.cores.at(-1);
  assert.deepEqual([renewed.status, field(S).ref.current.isFocused(), field(S).value, renewed.getState().context.quiet], ['running', false, 'Барсик', []]);
  await S.press('name-save');
  await act();
  assert.deepEqual(names(renewed), ['Барсик', 'Рекс'], 'черновик прежнего ядра не сохранён');
  await S.type('name-input', 'Дымок');
  await S.press('name-save');
  await act();
  assert.deepEqual([names(renewed), renewed.getState().save.cat.status], [['Дымок', 'Рекс'], 'saved'], 'имя текущему питомцу — как раньше');
  await S.unmount();
});

// Сверка перезапуска (доработка PL10.1): лакомство — производное ядра (записанный день кормления, счёт хоста, текущий
// день), поэтому сравнимо только в тот же день хоста. Через экран: файл примера между запусками (box.disk), сдвиг дня —
// календарь хоста ушёл вперёд, пока процесса не было; строка проверки — «✓ …» или «✗ …».
const restartMark = (S) => String(S.node('check:Перезапуск с тем же файлом')?.children);

test('перезапуск экрана по дню хоста: тот же день после кормления — ✓; следующий день без занятия (ядро: waiting) — ✓, а не ложное «НЕ совпало»; тот же следующий день после занятия — ✓', async () => {
  // Свой день хоста (+30) — без лакомства прежних проверок этого файла.
  box.disk = { days: {}, shift: 30, diag: null };
  const first = await running('restart-day');
  assert.match(restartMark(first.S), /^· /, 'первый запуск — сверять не с чем');
  await first.S.press('host-save');
  await act();
  await first.S.press('pet-feed');
  await act();
  assert.deepEqual([first.core.getState().treat, box.disk.diag?.treat], ['fed', 'fed'], 'кормление подтверждено и записано диагностикой');
  const fedDay = box.disk.diag.day;
  await first.S.unmount();

  const same = await running('restart-same');
  assert.match(restartMark(same.S), /^✓ /, 'тот же день');
  await same.S.unmount();

  box.disk.shift += 1;
  const next = await running('restart-next');
  assert.equal(next.core.getState().treat, 'waiting', 'ядро: лакомство нового дня ждёт занятия');
  assert.match(restartMark(next.S), /^✓ /, 'следующий день без занятия — не потеря данных');
  await next.S.press('host-save');
  await act();
  assert.deepEqual([next.core.getState().treat, box.disk.diag?.treat], ['ready', 'ready']);
  assert.notEqual(box.disk.diag.day, fedDay, 'запись — уже за следующий день');
  await next.S.unmount();

  const after = await running('restart-after');
  assert.match(restartMark(after.S), /^✓ /, 'следующий день после занятия');
  await after.S.unmount();
});

// Настоящая логика примера (newCore, confirmed, restartCheck) и публичное ядро: «файл» — записи ключей в Map, процесс —
// новое хранилище над ними (барьер загрузки) и новое ядро; часы и счёт хоста — ручные (core-kit), день хоста — день этих
// часов. Потерянная запись — файл, откатившийся к прежнему снимку после того, как ядро её подтвердило.
function files() {
  const data = new Map();
  const time = calendar();
  const counts = counter(0, 0);
  const today = () => time.day(time.state.now);
  return {
    data,
    time,
    counts,
    today,
    nextDay: () => (time.state.now += 86_400_000),
    restore: (copy) => {
      data.clear();
      for (const [key, value] of copy) data.set(key, value);
    },
    async open() {
      const storage = createStorage({ backend: { async: true, get: async (key) => (data.has(key) ? data.get(key) : null), set: async (key, value) => void data.set(key, value) } });
      const { core, status } = await D.newCore({ storage, host: { clock: time.port, progress: counts.progress } });
      opened.push(core);
      assert.equal(status, 'ready');
      core.start();
      return core;
    },
    // Подтверждённое в день хоста — когда записи ключей дошли; как его хранит пример (JSON).
    async confirm(core) {
      for (let i = 0; i < 20 && !D.confirmed(core.getState(), today()); i += 1) await flush();
      const value = D.confirmed(core.getState(), today());
      assert.ok(value, 'подтверждено');
      return JSON.parse(JSON.stringify(value));
    },
  };
}

test('сверка перезапуска (diagnostics): тот же день после кормления — лакомство сверено; следующий день без занятия — восстановлено, лакомство нового дня (waiting) не сверяется; следующий день после занятия — восстановлено, подтверждённое того дня — сверено целиком', async () => {
  const F = files();
  let core = await F.open();
  F.counts.set(1, 1);
  assert.equal(core.notify('saved', { key: 'd1', counted: true }).ok, true);
  assert.equal(await core.feed().save.done, 'saved');
  const fed = await F.confirm(core);
  assert.deepEqual([fed.v, fed.day, fed.treat], [3, F.today(), 'fed']);
  core.destroy();

  core = await F.open();
  let result = D.restartCheck(fed, core.getState(), F.today());
  assert.equal(result.ok, true, result.text);
  assert.match(result.text, /^восстановлено: подтверждено .+ \/ fed, загружено .+ \/ fed$/, 'тот же день: лакомство сверено');
  core.destroy();

  F.nextDay();
  F.counts.set(1, 0);
  core = await F.open();
  assert.equal(core.getState().treat, 'waiting');
  result = D.restartCheck(fed, core.getState(), F.today());
  assert.equal(result.ok, true, result.text);
  assert.match(result.text, new RegExp(`^восстановлено: .+; лакомство не сверяется — подтверждено fed за ${fed.day}, сегодня ${F.today()}: waiting`));
  core.destroy();

  F.counts.set(2, 1);
  core = await F.open();
  assert.equal(core.getState().treat, 'ready');
  result = D.restartCheck(fed, core.getState(), F.today());
  assert.equal(result.ok, true, result.text);
  const ready = await F.confirm(core);
  assert.deepEqual([ready.day, ready.treat], [F.today(), 'ready']);
  core.destroy();
  core = await F.open();
  result = D.restartCheck(ready, core.getState(), F.today());
  assert.equal(result.ok, true, result.text);
  assert.match(result.text, /\/ ready, загружено .+ \/ ready$/, 'подтверждённое этого дня сверено вместе с лакомством');
  core.destroy();
});

test('сверка перезапуска (diagnostics): настоящее несовпадение обнаруживается — потерянные имя и кормление в тот же день, потерянное имя на следующий день, потерянное только кормление в тот же день', async () => {
  const F = files();
  let core = await F.open();
  F.counts.set(1, 1);
  core.notify('saved', { key: 'd1', counted: true });
  await F.confirm(core);
  const before = new Map(F.data);
  assert.equal(await core.setName('Дымок').save.done, 'saved');
  assert.equal(await core.feed().save.done, 'saved');
  const expected = await F.confirm(core);
  assert.deepEqual([expected.name, expected.treat], ['Дымок', 'fed']);
  core.destroy();

  F.restore(before);
  core = await F.open();
  let result = D.restartCheck(expected, core.getState(), F.today());
  assert.equal(result.ok, false, result.text);
  assert.match(result.text, /^НЕ совпало: подтверждено .+ \/ Дымок \/ .+ \/ fed, загружено .+ \/ ready$/);
  core.destroy();

  F.nextDay();
  F.counts.set(1, 0);
  core = await F.open();
  result = D.restartCheck(expected, core.getState(), F.today());
  assert.equal(result.ok, false, 'следующий день: лакомство не сверяется, сохранённые настройки — сверяются');
  assert.match(result.text, /^НЕ совпало: подтверждено .+ \/ Дымок \/ .+; лакомство не сверяется/);
  core.destroy();

  const G = files();
  core = await G.open();
  G.counts.set(1, 1);
  core.notify('saved', { key: 'd1', counted: true });
  assert.equal(await core.setName('Дымок').save.done, 'saved');
  await G.confirm(core);
  const unfed = new Map(G.data);
  assert.equal(await core.feed().save.done, 'saved');
  const fed = await G.confirm(core);
  core.destroy();
  G.restore(unfed);
  core = await G.open();
  result = D.restartCheck(fed, core.getState(), G.today());
  assert.equal(result.ok, false, 'потерянное кормление в тот же день');
  assert.match(result.text, /\/ Дымок \/ .+ \/ fed, загружено .+ \/ Дымок \/ .+ \/ ready$/);
  core.destroy();
});

test('сверка перезапуска (diagnostics): прежние записи читаются — v2 без дня сверяет настройки, лакомство без дня не сверяет; PL09 — имя и движение; без дня хоста confirmed и restartCheck отказывают TypeError', async () => {
  const F = files();
  const core = await F.open();
  const now = await F.confirm(core);
  const state = core.getState();
  const v2 = { v: 2, pet: now.pet, name: now.name, motion: now.motion, coat: now.coat, accessory: now.accessory, treat: 'fed' };
  let result = D.restartCheck(v2, state, F.today());
  assert.equal(result.ok, true, result.text);
  assert.match(result.text, /; лакомство не сверяется — в записи нет дня \(прежний формат\)$/);
  result = D.restartCheck({ ...v2, coat: v2.coat === 'smoke' ? 'ginger' : 'smoke' }, state, F.today());
  assert.equal(result.ok, false, 'v2: облик сверяется');
  const pl09 = { name: state.name.display, motion: state.prefs.motion };
  assert.equal(D.restartCheck(pl09, state, F.today()).ok, true);
  assert.equal(D.restartCheck({ ...pl09, motion: pl09.motion === 'calm' ? 'normal' : 'calm' }, state, F.today()).ok, false);
  assert.deepEqual(D.restartCheck(null, state, F.today()), { ok: null, text: 'первый запуск: сверять не с чем' });
  assert.throws(() => D.confirmed(state), TypeError);
  assert.throws(() => D.restartCheck(now, state), TypeError);
  core.destroy();
});

test('экран PL10.2.1–PL10.2.3: координатор PetProvider — одно объявление { views: ["corner", "play", "room"], scenes — сценки наборов }, PetView в композиции его не сбрасывает; уголок открывается входом и закрывается Android «Назад»; отступы экрана и уголка — из useSafeAreaInsets, а не константы; отключение — уголка нет', async () => {
  globalThis.__petInsets = { top: 47, right: 0, bottom: 34, left: 0 };
  try {
    const { S, core } = await running('pl1021');
    const display = core.getState().display;
    assert.deepEqual([display.views, display.scenes, display.pets], [['corner', 'play', 'room'], { cat: ['stretch', 'curl'], dog: ['fetch'], 'example.bunny': ['hop'] }, ['cat', 'dog', 'example.bunny']]);
    assert.equal(S.node('pet-art').children.type, catNative.Figure, 'PetView в композиции рисует');
    const page = S.node('screen').contentContainerStyle[1];
    assert.deepEqual([page.paddingTop, page.paddingBottom, page.paddingLeft, page.paddingRight], [47 + 12, 34 + 48, 16, 16]);
    assert.equal(S.node('corner-modal').visible, false);
    await S.press('corner-open');
    assert.equal(core.getState().view.open, 'corner');
    assert.equal(S.node('corner-modal').visible, true);
    assert.equal(S.node('corner-sheet').style[1].paddingTop, 47, 'уголок — те же отступы хоста');
    assert.deepEqual(core.getState().display.views, ['corner', 'play', 'room'], 'открытие уголка объявление не меняет');
    await act(() => S.node('corner-modal').onRequestClose());
    assert.deepEqual([core.getState().view.open, S.node('corner-modal').visible], [null, false]);
    await S.press('pet-off');
    assert.deepEqual([core.status, S.node('corner-open')], ['destroyed', null], 'отключено — входа уголка нет');
    await S.unmount();
  } finally {
    delete globalThis.__petInsets;
  }
});

test('экран PL10.2.2: прямые команды хоста — открыть игру (окно PetPlay по снимку), «Приходит по зову» (питомца нет, вход «Позвать …»), вызов, закрыть вид, «Скрыть» и «Показать»; журнал перехода видов и присутствия; знаков и лакомства нет', async () => {
  rn.platform = 'android';
  try {
    const { S, core } = await running('pl1022');
    const before = [core.getState().progress?.marks ?? 0, core.getState().treat];
    await S.press('host-play');
    assert.deepEqual(core.getState().view, { open: 'play', source: 'pet' });
    assert.equal(S.node('play-modal').visible, true);
    await act(() => S.node('play-modal').onRequestClose());
    assert.equal(core.getState().view.open, 'corner', 'из «Открыть игру» — назад в уголок (уголок есть)');
    await S.press('host-close');
    assert.equal(core.getState().view.open, null);
    await S.press('host-oncall');
    assert.deepEqual([core.getState().presence.surface, S.node('pet-art'), Boolean(S.node('play-call'))], ['call', null, true]);
    await S.press('play-call');
    assert.deepEqual(core.getState().view, { open: 'play', source: 'call' });
    await S.press('play-close');
    assert.equal(core.getState().view.open, null, 'вызванная — закрыта целиком');
    await S.press('host-hide');
    assert.equal(core.getState().presence.surface, 'none');
    await S.press('host-show');
    assert.deepEqual([core.getState().presence.surface, core.getState().view.open], ['call', null], 'показать — вызов, без игры');
    await S.press('host-always');
    assert.ok(S.node('pet-art'), 'снова на экране');
    assert.deepEqual([core.getState().progress?.marks ?? 0, core.getState().treat], before);
    await S.unmount();
  } finally {
    rn.platform = 'ios';
  }
});

test('пример расширения на нативе (PL10.2.4): кролик и «живая» в примере — те же данные, что examples/extension; набор кролика проходит проверки уголка и игры, рисует сценку hop', async () => {
  const E = { ...(await import('../examples/expo/extension.mjs')), ...(await import('../examples/expo/bunny-native.mjs')) };
  const { bunny } = await import('../examples/extension/bunny.mjs');
  const { lively } = await import('../examples/extension/lively.mjs');
  assert.equal(JSON.stringify(E.bunny), JSON.stringify(bunny), 'определение кролика совпадает');
  assert.equal(JSON.stringify(E.lively), JSON.stringify(lively), 'модель «живая» совпадает');
  const Kits = await import('../pet/native/kits.mjs');
  const { cat, dog } = await import('../pet/pets.mjs');
  const catalog = Kits.nativeCatalog([cat, dog, E.bunny], [catNative, dogNative, E.bunnyNative], React.isValidElement);
  assert.equal(catalog.problem, '');
  assert.equal(Kits.cornerProblem(catalog, React.isValidElement), '');
  assert.equal(Kits.nativePlayProblem(E.bunnyNative, E.bunny, React.isValidElement), '');
  assert.deepEqual(Kits.nativeScenes(catalog)['example.bunny'], ['hop']);
  assert.ok(React.isValidElement(E.bunnyNative.Figure({ pose: 'hop', coat: 'spot', accessory: 'bow', prefix: 't' })));
  assert.ok(React.isValidElement(E.bunnyNative.Item({ id: 'carrot' })));
  assert.deepEqual(D.PETS.map((one) => one.id), ['cat', 'dog', 'example.bunny']);
  assert.deepEqual(D.BEHAVIORS.map((one) => one.id), ['calm', 'example.lively']);
});
