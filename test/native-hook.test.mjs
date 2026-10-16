// Хук useNativeLifecycle в настоящем React 19 (PL09, доработка по независимой проверке Codex 2026-10-16): готовность
// принадлежит текущей привязке, а не идентичности ядра. react-native подменён загрузчиком (test/fakes/react-native.mjs —
// подделка system() из test/native-kit.mjs; react-native-svg входа PL10.1 — test/fakes/react-native-svg.mjs), ядро — публичный createPetCore на асинхронном хранилище в памяти. Хост — как в
// README и примере: его эффект зовёт start(), когда хук вернул true и ядро ещё created; проверка записывает, что вернул хук
// на каждой отрисовке, что видел каждый запуск эффекта хоста и с какой системной настройкой ядро стартовало. Сценарии:
// готовый A → null → A (false до свежего ответа, start по прежней готовности не выполняется), системная настройка
// изменилась во время отключения, A → неготовый B → A, поздний ответ снятой привязки и событие главнее позднего ответа,
// StrictMode (в том числе повторное подключение), внешний destroy, соседний хост. Это Node и подделка React Native, не устройство.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { nodeRoot, system } from './native-kit.mjs';

const rn = system();
globalThis.__petRN = rn;
const FAKES = { 'react-native': new URL('./fakes/react-native.mjs', import.meta.url).href, 'react-native-svg': new URL('./fakes/react-native-svg.mjs', import.meta.url).href };
registerHooks({ resolve: (specifier, context, next) => (Object.hasOwn(FAKES, specifier) ? { url: FAKES[specifier], shortCircuit: true } : next(specifier, context)) });
const { useNativeLifecycle } = await import('../pet/native.mjs');
const { createPetCore, createStorage } = await import('../pet/core.mjs');
const { cat, dog } = await import('../pet/pets.mjs');
const { calm } = await import('../pet/behaviors.mjs');

const data = new Map();
const storage = createStorage({ backend: { async: true, get: async (key) => data.get(key) ?? null, set: async (key, value) => void data.set(key, value) } });
await storage.load();
const cores = [];
const made = () => {
  const core = createPetCore({ storage, pets: [cat, dog], behaviors: [calm] });
  cores.push(core);
  return core;
};
test.after(() => {
  for (const core of cores) core.destroy();
});
// Корни проверки размонтируются и после упавшей проверки: следующая начинает без чужих слушателей.
const roots = [];
test.afterEach(async () => {
  for (const R of roots.splice(0)) await R.unmount();
});

const motion = (core) => ({ reducedMotion: core.getState().prefs.reducedMotion, effectiveMotion: core.getState().prefs.effectiveMotion });

// Хост: seen — что вернул хук на каждой отрисовке; runs — что видел каждый запуск эффекта хоста; starts — ядро и его
// системная настройка движения в момент start(). start: false — хост этой фазы ядро не запускает.
function host() {
  const R = nodeRoot();
  roots.push(R);
  const { React } = R;
  const seen = [];
  const runs = [];
  const starts = [];
  function Host({ core, start }) {
    const ready = useNativeLifecycle(core);
    seen.push(ready);
    React.useEffect(() => {
      runs.push({ core, ready });
      if (start && core && ready && core.status === 'created') {
        starts.push({ core, ...motion(core) });
        core.start();
      }
    }, [core, ready, start]);
    return null;
  }
  const element = (core, start, strict) => {
    const host = React.createElement(Host, { core, start });
    return strict ? React.createElement(React.StrictMode, null, host) : host;
  };
  return {
    R,
    React,
    Host,
    seen,
    runs,
    starts,
    show: (core, { start = true, strict = false } = {}) => R.render(element(core, start, strict)),
    last: () => seen.at(-1),
    act: R.act,
  };
}

test('готовый A → null → A: хук — false до свежего ответа системы; эффект хоста этого commit видит false и не запускает ядро по прежней готовности; ответ — true и запуск', async () => {
  const H = host();
  const A = made();
  await H.show(A, { start: false });
  assert.equal(H.last(), false, 'до начального ответа');
  await H.act(() => rn.answer(false));
  assert.deepEqual([H.last(), A.status], [true, 'created'], 'готово; хост этой фазы ядро не запускает');
  await H.show(null);
  assert.deepEqual([H.last(), rn.live()], [false, 0], 'null — слушатели сняты');
  const asks = rn.asks.length;
  const from = H.runs.length;
  await H.show(A);
  assert.equal(rn.asks.length, asks + 1, 'новая привязка заново спросила систему');
  assert.deepEqual(
    H.runs.slice(from).map((run) => [run.core === A, run.ready]),
    [[true, false]],
    'эффект хоста commit повторного подключения видит false',
  );
  assert.deepEqual([H.last(), A.status, H.starts.length], [false, 'created', 0], 'до свежего ответа ядро не запущено');
  await H.act(() => rn.answer(false));
  assert.deepEqual([H.last(), A.status], [true, 'running']);
  assert.deepEqual(
    H.starts.map((start) => [start.core === A, start.reducedMotion]),
    [[true, false]],
  );
  await H.R.unmount();
  assert.equal(rn.live(), 0);
});

// Возврат того же ядра сразу после commit с null — синхронным обновлением из layout-эффекта родителя, до отложенного
// cleanup снятой привязки: в этом же цикле эффект хоста тоже должен получить false.
test('A → null → A синхронным обновлением того же commit (layout-эффект родителя): эффект хоста видит false, start — только после свежего ответа', async () => {
  const H = host();
  const { React } = H;
  const A = made();
  let back = null;
  let setOuter = null;
  function Parent() {
    const [state, set] = React.useState({ core: A, start: false });
    setOuter = set;
    React.useLayoutEffect(() => {
      if (state.core === null && back) {
        const core = back;
        back = null;
        set({ core, start: true });
      }
    }, [state.core]);
    return React.createElement(H.Host, state);
  }
  await H.R.render(React.createElement(Parent));
  await H.act(() => rn.answer(false));
  assert.deepEqual([H.last(), A.status], [true, 'created']);
  const from = H.runs.length;
  const asks = rn.asks.length;
  await H.act(() => {
    back = A;
    setOuter({ core: null, start: false });
  });
  assert.deepEqual([back, rn.asks.length, rn.live()], [null, asks + 1, 3], 'A вернулся тем же commit-циклом и подключён заново');
  assert.deepEqual(
    H.runs.slice(from).filter((run) => run.core === A).map((run) => run.ready),
    [false],
    'эффект хоста при возврате A видит false',
  );
  assert.deepEqual([H.last(), A.status, H.starts.length], [false, 'created', 0]);
  await H.act(() => rn.answer(false));
  assert.deepEqual([H.last(), A.status, H.starts.length], [true, 'running', 1]);
});

test('системная настройка изменилась во время отключения: ядро стартует уже со свежей, а не с прежней', async () => {
  const H = host();
  const A = made();
  await H.show(A, { start: false });
  await H.act(() => rn.answer(false));
  assert.deepEqual([H.last(), motion(A).reducedMotion], [true, false]);
  await H.show(null);
  await H.act(() => rn.emit('reduceMotionChanged', true));
  assert.equal(motion(A).reducedMotion, false, 'отключённое ядро событие не получило');
  await H.show(A);
  assert.deepEqual([H.last(), A.status], [false, 'created'], 'прежняя готовность не действует');
  await H.act(() => rn.answer(true));
  assert.deepEqual([H.last(), A.status], [true, 'running']);
  assert.deepEqual(
    H.starts.map((start) => [start.core === A, start.reducedMotion, start.effectiveMotion]),
    [[true, true, 'none']],
    'start — со свежей системной настройкой',
  );
  await H.R.unmount();
});

test('A → неготовый B → A: false, пока новая привязка A не ответила; поздний ответ снятой привязки B ничего не меняет ни у B, ни у хука', async () => {
  const H = host();
  const A = made();
  const B = made();
  await H.show(A, { start: false });
  await H.act(() => rn.answer(false));
  assert.equal(H.last(), true);
  const askB = rn.asks.length;
  await H.show(B, { start: false });
  assert.deepEqual([H.last(), rn.live()], [false, 3], 'B ещё не ответила');
  const askA = rn.asks.length;
  await H.show(A);
  assert.deepEqual([askA, rn.asks.length], [askB + 1, askB + 2]);
  assert.deepEqual([H.last(), A.status, H.starts.length], [false, 'created', 0], 'возврат к A — без прежней готовности');
  rn.answered = rn.asks.length;
  await H.act(() => rn.asks[askB].resolve(true));
  assert.deepEqual([H.last(), motion(B).reducedMotion, A.status], [false, false, 'created'], 'ответ снятой привязки B проигнорирован');
  await H.act(() => rn.asks[askA].resolve(false));
  assert.deepEqual([H.last(), A.status, B.status], [true, 'running', 'created']);
  await H.R.unmount();
  assert.equal(rn.live(), 0);
});

test('поздний ответ снятой привязки того же ядра не делает хук готовым; событие системы главнее позднего начального ответа живой привязки', async () => {
  const H = host();
  const A = made();
  await H.show(A, { start: false });
  await H.act(() => rn.answer(false));
  await H.show(null);
  const removed = rn.asks.length;
  await H.show(A);
  await H.show(null);
  const live = rn.asks.length;
  await H.show(A);
  rn.answered = rn.asks.length;
  await H.act(() => rn.asks[removed].resolve(true));
  assert.deepEqual([H.last(), motion(A).reducedMotion, A.status], [false, false, 'created'], 'ответ снятой привязки проигнорирован');
  await H.act(() => rn.emit('reduceMotionChanged', true));
  assert.deepEqual([H.last(), A.status], [true, 'running'], 'событие — тоже начальная синхронизация');
  assert.deepEqual([H.starts.at(-1).reducedMotion, motion(A).reducedMotion], [true, true]);
  await H.act(() => rn.asks[live].resolve(false));
  assert.deepEqual([H.last(), motion(A).reducedMotion], [true, true], 'поздний начальный ответ событие не затирает');
  await H.R.unmount();
  assert.equal(rn.live(), 0);
});

test('StrictMode: ответ снятой первой привязки не делает готовым, готовность — по ответу живой; повторное подключение того же ядра — снова false до свежего ответа', async () => {
  const H = host();
  const A = made();
  const first = rn.asks.length;
  const added = rn.counts.add;
  await H.show(A, { strict: true });
  assert.deepEqual([rn.asks.length - first, rn.counts.add - added, rn.live()], [2, 6, 3], 'эффект, снятие, снова эффект');
  rn.answered = rn.asks.length;
  await H.act(() => rn.asks[first].resolve(true));
  assert.deepEqual([H.last(), A.status, motion(A).reducedMotion], [false, 'created', false]);
  await H.act(() => rn.asks[first + 1].resolve(false));
  assert.deepEqual([H.last(), A.status], [true, 'running']);
  // Повторное подключение того же ядра в том же компоненте под StrictMode (смена свойства — один новый эффект): другое
  // ядро, ещё не запущенное.
  const C = made();
  await H.show(C, { strict: true, start: false });
  await H.act(() => rn.answer(false));
  assert.equal(H.last(), true);
  await H.show(null, { strict: true });
  const again = rn.asks.length;
  await H.show(C, { strict: true });
  assert.deepEqual([rn.asks.length - again, rn.live(), H.last(), C.status], [1, 3, false, 'created'], 'прежняя готовность C не действует');
  await H.act(() => rn.answer(true));
  assert.deepEqual([H.last(), C.status, H.starts.at(-1).core === C, H.starts.at(-1).reducedMotion], [true, 'running', true, true]);
  await H.R.unmount();
  assert.equal(rn.live(), 0);
});

test('внешний core.destroy(): слушатели сняты, хук — false (привязки больше нет); destroy при ожидающем ответе — поздний ответ ничего не меняет, start не вызывается', async () => {
  const H = host();
  const A = made();
  await H.show(A);
  await H.act(() => rn.answer(false));
  assert.deepEqual([H.last(), A.status, rn.live()], [true, 'running', 3]);
  await H.act(() => A.destroy());
  assert.deepEqual([rn.live(), H.last()], [0, false]);
  const B = made();
  await H.show(B);
  const ask = rn.asks.length - 1;
  await H.act(() => B.destroy());
  rn.answered = rn.asks.length;
  await H.act(() => rn.asks[ask].resolve(false));
  assert.deepEqual([rn.live(), H.last(), B.status, H.starts.filter((start) => start.core === B).length], [0, false, 'destroyed', 0]);
  await H.show(null);
  await H.show(B);
  assert.deepEqual([rn.live(), rn.asks.length, H.last()], [0, ask + 1, false], 'отключённое ядро не подключается и не спрашивает систему');
  await H.R.unmount();
});

test('соседний хост: отключение и повторное подключение одного не трогает готовность, слушатели и события другого', async () => {
  const left = host();
  const right = host();
  const A = made();
  const B = made();
  await left.show(A);
  await right.show(B);
  await left.act(() => rn.answer(false));
  assert.deepEqual([left.last(), right.last(), rn.live()], [true, true, 6]);
  await left.show(null);
  assert.deepEqual([left.last(), right.last(), rn.live()], [false, true, 3]);
  await left.show(A);
  assert.deepEqual([left.last(), right.last()], [false, true]);
  await right.act(() => rn.emit('change', 'background'));
  assert.deepEqual([A.getState().visible, B.getState().visible], [false, false], 'событие — обеим живым привязкам');
  await right.act(() => rn.emit('change', 'active'));
  await left.act(() => rn.answer(false));
  assert.deepEqual([left.last(), right.last()], [true, true]);
  await left.R.unmount();
  assert.deepEqual([right.last(), rn.live()], [true, 3]);
  await right.R.unmount();
  assert.equal(rn.live(), 0);
});
