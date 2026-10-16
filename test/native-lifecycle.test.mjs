// Жизненный цикл React Native для ядра (PL09; docs/ARCHITECTURE.md § 12.2): bindLifecycle (pet/native/lifecycle.mjs) на
// подделке AppState и AccessibilityInfo (test/native-kit.mjs system) и настоящем публичном ядре с ручными часами,
// планировщиком и случайностью (core-kit life). active / background / iOS inactive / Android blur, начальное unknown, null,
// extension; фон снимает реакцию, попытку сценки, жест и задачи, возврат ничего не доигрывает и пересчитывает день;
// системное «уменьшить движение» не переписывает выбор владельца; гонка начального ответа с событием; ready; cleanup,
// смена core, повторное подключение (как StrictMode), внешний destroy и destroy при ожидающем ответе; слушатели сняты
// полностью, соседняя привязка не затронута; отказы системного API — журнал, без необработанных отклонений. Это подделка
// React Native: настоящие AppState и AccessibilityInfo — только в Expo-примере на устройстве. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { REACTIONS } from './legacy-rules.mjs';
import { exposed } from '../pet/core/facade.mjs';
import { bindLifecycle } from '../pet/native/lifecycle.mjs';
import { DAY, flush, host, journal, LEGACY_DISPLAY, life, reserver } from './core-kit.mjs';
import { system } from './native-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };
const DAY_MS = 86_400_000;
const rejections = [];
process.on('unhandledRejection', (reason) => rejections.push(reason));

// Ядро на веб-координаторе в памяти (хранение здесь не проверяется) под публичным фасадом — как у хука.
function made(initial = { cat: CAT }, parts = {}) {
  const L = life(initial, { counts: host(1, 1), display: LEGACY_DISPLAY, ...parts });
  const calls = { setVisible: [], setReducedMotion: [] };
  const core = exposed(L.core);
  const watched = Object.freeze({
    ...core,
    get status() {
      return core.status;
    },
    setVisible: (value) => (calls.setVisible.push(value), core.setVisible(value)),
    setReducedMotion: (value) => (calls.setReducedMotion.push(value), core.setReducedMotion(value)),
  });
  return { ...L, core: watched, calls };
}
const playing = (L) => L.state().pose.reaction?.type ?? null;

test('начальное состояние до start: background — видимость false до запуска: ни приветствия, ни задач; active — запуск с приветствием; unknown, extension, null — видимость не трогается', async () => {
  const back = made({ cat: { ...CAT, greetDay: '2026-10-12' } });
  const rn = system({ state: 'background' });
  bindLifecycle(back.core, rn);
  assert.deepEqual([back.calls.setVisible, back.state().visible], [[false], false]);
  back.core.start();
  back.plan.advance(1000);
  assert.deepEqual([playing(back), back.plan.live().length], [null, 0], 'запуск в фоне: ни приветствия, ни задач');
  rn.emit('change', 'active');
  assert.deepEqual([back.state().visible, playing(back), back.plan.live().length > 0], [true, null, true], 'возврат — задачи заново, приветствия нет');
  const front = made({ cat: { ...CAT, greetDay: '2026-10-12' } });
  bindLifecycle(front.core, system({ state: 'active' }));
  front.core.start();
  front.plan.advance(1000);
  assert.equal(playing(front), 'greet', 'на виду — приветствие дня');
  for (const state of ['unknown', 'extension', null, undefined]) {
    const L = made();
    const rn = system();
    rn.AppState.currentState = state;
    bindLifecycle(L.core, rn);
    assert.deepEqual([L.calls.setVisible, L.state().visible], [[], true], String(state));
  }
});

test('фон снимает реакцию, попытку сценки, жест и задачи; событие в фоне не копится; возврат ничего не доигрывает', async () => {
  const port = reserver();
  const L = made({ cat: CAT }, { scenes: port.port });
  const rn = system();
  bindLifecycle(L.core, rn);
  L.core.start();
  L.random.push(0, 0, 0);
  L.core.notify('saved', { key: 'K', counted: true });
  assert.deepEqual([playing(L), L.state().scene.waiting?.type], ['joy', 'stretch']);
  rn.emit('change', 'background');
  assert.deepEqual([playing(L), L.state().scene.waiting, L.plan.live().length, L.state().visible], [null, null, 0, false]);
  const during = L.core.notify('saved', { key: 'K2', counted: true });
  assert.deepEqual([during.ok, playing(L), L.plan.live().length], [true, null, 0], 'в фоне реакция не начинается и не откладывается');
  L.plan.advance(60_000);
  rn.emit('change', 'active');
  L.plan.advance(5_000);
  await flush();
  assert.deepEqual([playing(L), port.calls.reserve], [null, 0], 'возврат: ни радости, ни сценки задним числом');
  // Жест «Поиграть» и фон.
  L.core.open('play');
  const { id } = L.core.stroke.start();
  assert.equal(L.state().play.stroke?.id, id);
  rn.emit('change', 'background');
  assert.equal(L.state().play?.stroke ?? null, null, 'фон отменил жест');
  rn.emit('change', 'active');
});

test('iOS inactive и Android blur: видимость не меняется, идущий жест, перенос предмета «Поиграть» и перенос в редакторе отменяются; ничего не идёт — ничего не вызывается', () => {
  const L = made();
  const rn = system();
  bindLifecycle(L.core, rn);
  L.core.start();
  assert.equal(L.core.setDisplay({ playFloor: [-40, -10, 300, 230] }).ok, true, 'пол «Поиграть» — объявление отображения');
  L.core.open('play');
  L.core.stroke.start();
  rn.emit('change', 'inactive');
  assert.deepEqual([L.state().play.stroke, L.state().visible, L.calls.setVisible], [null, true, [true]], 'видимость — только начальная синхронизация active');
  assert.equal(L.core.toy.drag('ball', [200, 180]).ok, true);
  assert.ok(L.state().play.drag);
  rn.emit('blur');
  assert.equal(L.state().play.drag, null, 'blur отменил перенос предмета');
  L.core.open('room');
  const item = Object.keys(L.state().room.draft.pos)[0];
  assert.equal(L.core.room.drag(item, [150, 150]).ok, true);
  assert.ok(L.state().room.draft.drag);
  rn.emit('change', 'inactive');
  assert.equal(L.state().room.draft.drag, null, 'перенос в редакторе отменён, черновик цел');
  assert.ok(L.state().room.draft);
  const before = L.seen.length;
  rn.emit('change', 'inactive');
  rn.emit('blur');
  assert.equal(L.seen.length, before, 'нечего отменять — нет обновлений');
});

test('смена дня в фоне: возврат пересчитывает день и лакомство, без приветствия и записи дня', () => {
  const counts = host(1, 1);
  const L = made({ cat: CAT }, { counts });
  const rn = system();
  bindLifecycle(L.core, rn);
  L.core.start();
  L.core.feed();
  L.plan.advance(REACTIONS.feed.ms + REACTIONS.fed.ms);
  assert.equal(L.state().treat, 'fed');
  rn.emit('change', 'background');
  L.plan.jump(DAY_MS);
  counts.set(1, 0);
  rn.emit('change', 'active');
  assert.deepEqual([L.state().treat, L.state().visible], ['waiting', true], 'новый день — лакомство снова ждёт');
  L.plan.advance(1000);
  assert.equal(playing(L), null, 'приветствие — только при запуске');
});

test('уменьшение движения: начальный ответ → setReducedMotion, выбор владельца не переписан; событие раньше ответа главнее; ready — один раз; отказ чтения — журнал и ready, без отклонений', async () => {
  const L = made({ cat: { ...CAT, motion: 'calm' } });
  const rn = system();
  let ready = 0;
  bindLifecycle(L.core, rn, { ready: () => ready++ });
  assert.equal(ready, 0, 'до ответа — не готово');
  rn.asks[0].resolve(true);
  await flush();
  assert.deepEqual([L.calls.setReducedMotion, L.state().prefs.motion, L.state().prefs.reducedMotion, L.state().prefs.effectiveMotion, ready], [[true], 'calm', true, 'none', 1]);
  rn.emit('reduceMotionChanged', false);
  assert.deepEqual([L.state().prefs.effectiveMotion, L.state().prefs.motion, ready], ['calm', 'calm', 1]);
  assert.equal(L.state().save.cat.status, 'saved', 'системная настройка ничего не пишет');
  // Гонка: событие пришло раньше ответа — поздний ответ его не затирает.
  const R = made();
  const late = system();
  let readyR = 0;
  bindLifecycle(R.core, late, { ready: () => readyR++ });
  late.emit('reduceMotionChanged', true);
  assert.equal(readyR, 1, 'событие — тоже начальная синхронизация');
  late.asks[0].resolve(false);
  await flush();
  assert.deepEqual([R.calls.setReducedMotion, R.state().prefs.reducedMotion, readyR], [[true], true, 1]);
  // Отказ системного API.
  const F = made();
  const broken = system();
  const log = journal();
  let readyF = 0;
  bindLifecycle(F.core, broken, { ready: () => readyF++, log: log.port });
  broken.asks[0].reject(new Error('нет модуля'));
  await flush();
  assert.deepEqual([F.calls.setReducedMotion, readyF, log.list.length], [[], 1, 1]);
  const thrower = system();
  thrower.AccessibilityInfo.isReduceMotionEnabled = () => {
    throw new Error('бросил синхронно');
  };
  thrower.AppState.addEventListener = () => {
    throw new Error('нет подписки');
  };
  const T = made();
  const logT = journal();
  let readyT = 0;
  const bound = bindLifecycle(T.core, thrower, { ready: () => readyT++, log: logT.port });
  await flush();
  assert.equal(readyT, 1);
  assert.ok(logT.list.some((line) => line.includes('нет подписки AppState change')) && logT.list.some((line) => line.includes('«уменьшить движение» не прочитана')), logT.list.join(' | '));
  bound.stop();
  assert.deepEqual(rejections, []);
});

test('cleanup, повторное подключение (StrictMode), смена core: слушатели сняты полностью, поздний ответ прежней привязки ничего не меняет; соседняя привязка не затронута; null-ядро не подключается', async () => {
  const A = made();
  const rn = system();
  const first = bindLifecycle(A.core, rn);
  assert.equal(rn.live(), 3, 'change, blur, reduceMotionChanged');
  first.stop();
  first.stop();
  assert.deepEqual([rn.live(), rn.counts.remove], [0, 3], 'StrictMode: снятие первой привязки');
  const second = bindLifecycle(A.core, rn);
  rn.asks[0].resolve(true);
  rn.asks[1].resolve(false);
  await flush();
  assert.deepEqual(A.calls.setReducedMotion, [false], 'ответ снятой привязки проигнорирован');
  // Смена core: прежняя снята, новая подключена; событие доходит только до нового.
  second.stop();
  const B = made();
  const neighbour = made();
  const third = bindLifecycle(B.core, rn);
  const side = bindLifecycle(neighbour.core, rn);
  rn.emit('change', 'background');
  // У каждой привязки — начальная синхронизация active (true), затем только события, пока она подключена.
  assert.deepEqual([A.calls.setVisible, B.calls.setVisible, neighbour.calls.setVisible], [[true, true], [true, false], [true, false]]);
  third.stop();
  rn.emit('change', 'active');
  assert.deepEqual([B.calls.setVisible, neighbour.calls.setVisible], [[true, false], [true, false, true]], 'соседняя привязка работает');
  side.stop();
  assert.equal(rn.live(), 0);
});

test('внешний core.destroy(): слушатели системы сняты сразу; destroy при ожидающем начальном ответе — ответ проигнорирован, ready не вызывается; привязка к уже отключённому — ничего', async () => {
  const L = made();
  const rn = system();
  let ready = 0;
  const bound = bindLifecycle(L.core, rn, { ready: () => ready++ });
  assert.equal(rn.live(), 3);
  L.core.destroy();
  assert.equal(rn.live(), 0, 'destroy снял слушатели');
  rn.asks[0].resolve(true);
  await flush();
  assert.deepEqual([L.calls.setReducedMotion, ready], [[], 0]);
  bound.stop();
  const dead = bindLifecycle(L.core, rn);
  assert.deepEqual([rn.live(), rn.counts.ask], [0, 1], 'отключённое ядро не подключается');
  dead.stop();
  await flush();
  assert.deepEqual(rejections, []);
});
