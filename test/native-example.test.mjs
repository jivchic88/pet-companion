// Пример Expo (PL09, доработка по независимой проверке Codex 2026-10-16): владение ядром в настоящем examples/expo/App.js.
// App.js исполняется как есть — только JSX превращается в вызовы react/jsx-runtime компилятором TypeScript (загрузчик
// отдаёт результат по адресу самого файла). React и react-dom — настоящие (у App.js каждая смена состояния useState
// записывается его экрану, test/fakes/react-state.mjs), useNativeLifecycle и usePetState — настоящий вход
// pet-companion/native, react-native — подделка system() (test/fakes/react-native.mjs), ./diagnostics.mjs — настоящая
// логика примера с управляемым вводом-выводом (test/fakes/expo-diagnostics.mjs: хранилище в памяти со счётчиком
// подключений ядер, удержание записи, управляемая точка каждого создания ядра). Проверяются статусы всех созданных ядер,
// слушатели системы, подключения к хранилищу и отсутствие смен состояния экрана после размонтирования: обычный запуск и
// размонтирование, «Новое ядро» → размонтирование, размонтирование при ожидающей загрузке (первого и нового ядра), два
// конкурирующих «Новое ядро» при обоих порядках ответа, команда в полёте при размонтировании, StrictMode, соседний экран.
// Это Node и подделка React Native, не устройство: запуск на телефоне — examples/expo/README.md.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { nodeRoot, system } from './native-kit.mjs';

const rn = system();
globalThis.__petRN = rn;
const box = { cores: [], opens: 0, connections: 0, saved: 0, remembered: 0, manual: false, waiting: [], holdWrites: null };
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
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === APP && Object.hasOwn(FROM_APP, specifier)) return { url: FROM_APP[specifier], shortCircuit: true };
    if (specifier === 'react-native') return { url: fake('react-native.mjs'), shortCircuit: true };
    if (specifier === 'expo-sqlite') return { url: fake('expo-sqlite.mjs'), shortCircuit: true };
    const entry = specifier.startsWith('pet-companion/') ? pkg.exports[`./${specifier.slice('pet-companion/'.length)}`] : null;
    if (entry) return { url: new URL(entry.default, ROOT).href, shortCircuit: true };
    return next(specifier, context);
  },
  load: (url, context, next) => (url === APP ? { format: 'module', source, shortCircuit: true } : next(url, context)),
});
const { default: App } = await import(APP);
const { Screen, screen } = await import(fake('expo-screen.mjs'));

const { act } = nodeRoot();
// Изоляция и после упавшей проверки: корни размонтированы, удержания отпущены, оставшиеся ядра уничтожены — следующая
// проверка начинает без чужих слушателей, подключений и стоящей очереди ключа.
const roots = [];
const held = [];
test.afterEach(async () => {
  for (const R of roots.splice(0)) await R.unmount();
  box.manual = false;
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

// Экран name в своём корне (StrictMode — по желанию). press — обработчик кнопки последней отрисовки; его обещание не
// возвращается: «Новое ядро» может держать управляемая точка.
function mount(name, { strict = false } = {}) {
  const R = nodeRoot();
  roots.push(R);
  const own = screen(name);
  let app = React.createElement(Screen.Provider, { value: name }, React.createElement(App));
  if (strict) app = React.createElement(React.StrictMode, null, app);
  return {
    own,
    start: () => R.render(app),
    press: (title) =>
      act(() => {
        own.buttons.get(title)();
      }),
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

test('обычный запуск и размонтирование: одно ядро после загрузки, start — только после ready, размонтирование уничтожает его и снимает слушатели и подключение', async () => {
  const from = box.cores.length;
  const S = mount('mount');
  await S.start();
  assert.deepEqual(statuses(since(from)), ['created'], 'до начальной синхронизации не запущено');
  assert.deepEqual([rn.live(), box.connections], [4, 1], 'хук: change, blur, reduceMotionChanged; журнал экрана: change');
  await act(() => rn.answer(false));
  assert.deepEqual(statuses(since(from)), ['running']);
  await S.unmount();
  assert.deepEqual([statuses(since(from)), rn.live(), box.connections], [['destroyed'], 0, 0]);
  await quiet(S);
});

test('«Новое ядро» → размонтирование: прежнее уничтожено заменой, новое — размонтированием; слушатели и подключения сняты', async () => {
  const from = box.cores.length;
  const S = mount('renew');
  await S.start();
  await act(() => rn.answer(false));
  await S.press('Новое ядро');
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
  await renewed.press('Новое ядро');
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
    const from = box.cores.length;
    const S = mount(`race-${order.join('')}`);
    await S.start();
    await act(() => rn.answer(false));
    box.manual = true;
    // Двойное касание: оба нажатия — одним обработчиком, до новой отрисовки.
    const press = S.own.buttons.get('Новое ядро');
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

test('команда в полёте при размонтировании: поставленная запись после него доходит до хранилища, экран своё состояние не меняет', async () => {
  const from = box.cores.length;
  const S = mount('inflight');
  await S.start();
  await act(() => rn.answer(false));
  const open = holdWrites();
  const [core] = since(from);
  await S.press('Имя');
  assert.equal(core.getState().save.cat.status, 'pending');
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
  await S.press('Новое ядро');
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
  await left.press('Новое ядро');
  await act(() => rn.answer(false));
  const leftFresh = box.cores.at(-1);
  assert.deepEqual([leftCore.status, leftFresh.status, rightCore.status], ['destroyed', 'running', 'running']);
  await left.unmount();
  assert.deepEqual([leftFresh.status, rightCore.status, rn.live(), box.connections], ['destroyed', 'running', 4, 1]);
  await quiet(left);
  const before = rightCore.getState().name.display;
  await right.press('Имя');
  await act();
  assert.deepEqual([rightCore.getState().name.display !== before, rightCore.getState().save.cat.status], [true, 'saved'], 'кнопки соседа работают');
  await right.unmount();
  assert.deepEqual([statuses(since(from)), rn.live(), box.connections], [['destroyed', 'destroyed', 'destroyed'], 0, 0]);
  await quiet(right);
});
