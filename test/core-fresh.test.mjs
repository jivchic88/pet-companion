// Сверка перед решением команды (docs/ARCHITECTURE.md § 5.5, шаг 1а; независимая проверка PL03, 2026-10-13): сохранённое
// изменение, завершённое до команды, а событие storage ещё не пришло (другая вкладка) или его не будет (восстановление на
// этой же странице), учитывается в решении, а не только в поздней сверке записи. Кормление при уже отмеченном дне и
// обратный случай; праздник уже увиденной, непонятной строки и непонятного числа ступени и нормальное открытие ступени;
// приветствие, отметка уголка и явная правка, совпавшая с устаревшим кэшем; второе ядро; запоздалое storage; отказ
// свежего чтения; отказ загрузки и отключённое ядро; асинхронный координатор, pending и destroy. Проверяются решение,
// реакция и продолжение, эффекты, снимок и фактическое хранилище, а не только текст объявления. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DAY, host, make, manual, web } from './core-kit.mjs';

const SEEN = { around: true };
const CAT = { v: 1, seenStage: 0, greetDay: DAY };

// Два запущенных ядра на одном веб-координаторе и журнал их обновлений: причина, лакомство, ступень, эффекты.
function pair(initial, counts) {
  const site = web(initial);
  assert.equal(site.storage.load(), 'ready');
  const A = make(site.storage, { counts }).core;
  const B = make(site.storage, { counts }).core;
  assert.equal(A.start(SEEN).ok, true);
  assert.equal(B.start(SEEN).ok, true);
  const got = { a: [], b: [] };
  const line = (update) => {
    const effects = update.effects.filter((effect) => effect.type !== 'save').map((effect) => (effect.type === 'announce' ? `announce ${effect.text}` : effect.type));
    return [update.reason, update.snapshot.treat, update.snapshot.progress?.seenStage, update.snapshot.save.cat.status, update.snapshot.save.treat.status, ...effects].join(' ');
  };
  A.subscribe((update) => got.a.push(line(update)), { initial: false });
  B.subscribe((update) => got.b.push(line(update)), { initial: false });
  return { ...site, A, B, got };
}

test('кормление: другая вкладка уже отметила день, события storage нет — treat-fed: ни записи, ни реакции, ни объявления; оба ядра видят «уже угостили»; запоздалое storage и повтор — без эффектов', () => {
  const counts = host(1, 1);
  const s = pair({ cat: CAT, treat: { v: 1, fedDay: '' } }, counts);
  assert.deepEqual([s.A.getState().treat, s.B.getState().treat], ['ready', 'ready'], 'кнопка «Покормить» доступна');
  s.put('treat', { v: 1, fedDay: DAY });
  const raw = s.raw('treat');
  const writes = s.store.writes.length;
  const result = s.A.feed(SEEN);
  assert.deepEqual([result.ok, result.error?.code, 'reaction' in result], [false, 'treat-fed', false], JSON.stringify(result));
  assert.deepEqual([s.store.writes.length, s.raw('treat')], [writes, raw], 'второй отметки нет, исходная запись как есть');
  for (const core of [s.A, s.B]) assert.deepEqual([core.getState().treat, core.getState().save.treat.status], ['fed', 'saved']);
  // Найденное сверкой — обновление storage у обоих, не изменение команды feed; объявлений и реакции нет.
  assert.deepEqual(s.got, { a: ['storage fed 0 saved saved'], b: ['storage fed 0 saved saved'] });
  s.events.fire(s.keys.treat);
  assert.deepEqual([s.A.feed(SEEN).error.code, s.B.feed(SEEN).error.code], ['treat-fed', 'treat-fed']);
  assert.deepEqual([s.got.a.length, s.got.b.length, s.store.writes.length, s.raw('treat')], [1, 1, writes, raw], 'запоздалое событие и повтор — без обновлений и записи');
});

test('кормление, обратное: в хранилище день лакомства сброшен (восстановление на этой странице), события нет — кормление разрешено, записано по свежему, неизвестное сохранено', () => {
  const counts = host(1, 1);
  const s = pair({ cat: CAT, treat: { v: 1, fedDay: DAY } }, counts);
  assert.equal(s.A.getState().treat, 'fed');
  s.put('treat', { v: 2, fedDay: '2026-10-12', note: 'копия' });
  // Карточка — по подтверждённому: refresh тоже сверяет.
  s.A.refresh();
  assert.deepEqual([s.A.getState().treat, s.B.getState().treat], ['ready', 'ready']);
  const result = s.A.feed(SEEN);
  assert.deepEqual([result.ok, result.save.status, result.reaction?.type, result.reaction?.key, result.reaction?.extra.follow.type], [true, 'saved', 'feed', `feed:${DAY}`, 'fed']);
  assert.deepEqual(s.json('treat'), { v: 2, fedDay: DAY, note: 'копия' });
  assert.deepEqual(s.got.a, ['storage ready 0 saved saved', 'feed fed 0 saved saved announce Марс получает лакомство. Сегодня уже угостили.']);
  assert.deepEqual(s.got.b, ['storage ready 0 saved saved', 'storage fed 0 saved saved'], 'второе ядро: сверка, затем поглощение записи — без объявления');
  assert.equal(s.B.feed(SEEN).error.code, 'treat-fed', 'одно в день');
});

test('кормление, контроль: без внешней записи — обычное кормление, реакция и объявление по итогу записи', () => {
  const counts = host(1, 1);
  const s = pair({ cat: CAT, treat: { v: 1, fedDay: '' } }, counts);
  const result = s.A.feed(SEEN);
  assert.deepEqual([result.ok, result.save.status, result.reaction.type, s.json('treat')], [true, 'saved', 'feed', { v: 1, fedDay: DAY }]);
  assert.deepEqual(s.got.a, ['feed fed 0 saved saved announce Марс получает лакомство. Сегодня уже угостили.']);
  assert.deepEqual(s.got.b, ['storage fed 0 saved saved']);
});

for (const [odd, known] of [
  [1, true],
  ['future-stage', false],
  [8, false],
]) {
  test(`праздник: до занятия сохранено seenStage ${JSON.stringify(odd)} (v 3, future), события storage нет — ${known ? 'уже увиденная' : 'непонятная'} ступень не празднуется; обычная радость; raw целиком; запоздалое storage — без эффектов`, () => {
    const counts = host(2, 1);
    const s = pair({ cat: CAT }, counts);
    const stored = { v: 3, seenStage: odd, greetDay: DAY, future: 42 };
    s.put('cat', stored);
    const raw = s.raw('cat');
    const writes = s.store.writes.length;
    counts.set(3, 1);
    const result = s.A.notify('saved', { key: 'one', counted: true }, SEEN);
    assert.deepEqual([result.ok, result.celebrate, result.reaction, result.scene.stage], [true, null, { type: 'joy', key: 'entry:one', extra: {} }, null], JSON.stringify(result));
    assert.deepEqual([s.store.writes.length, s.raw('cat')], [writes, raw], 'ни отметки, ни перезаписи: v 3, future и ступень как есть');
    const seen = known ? 1 : -1;
    assert.equal(s.A.getState().progress.stage, 1, 'знаки занятия — «Освоился»');
    for (const core of [s.A, s.B]) {
      const { progress } = core.getState();
      assert.deepEqual([progress.seenStage, progress.seenKnown, progress.unseen, progress.fresh, progress.freshAccessories], [seen, known, false, [], []], 'без «нового»');
    }
    // Ни celebrate, ни объявления открытия; сверка — обновлением storage у обоих, затем числа занятия у автора.
    assert.deepEqual(s.got.a, [`storage ready ${seen} saved saved`, `notify ready ${seen} saved saved`]);
    assert.deepEqual(s.got.b, [`storage ready ${seen} saved saved`]);
    s.events.fire(s.keys.cat);
    assert.deepEqual([s.got.a.length, s.got.b.length, s.raw('cat')], [2, 1, raw], 'запоздалое событие — без повторных эффектов');
    // Следующая ступень («Наш ритуал», 9 знаков): после увиденной известной — праздник и отметка поверх v 3 и future;
    // пока ступень непонятна — праздника нет и ступень не переписывается.
    counts.set(9, 2);
    const next = s.A.notify('saved', { key: 'two', counted: true }, SEEN);
    if (known) {
      assert.deepEqual([next.celebrate, next.reaction.extra.follow?.type, s.json('cat')], [2, 'unlock', { ...stored, seenStage: 2 }]);
      assert.ok(s.got.a.at(-1).includes('announce Марс: открыта ступень «Наш ритуал»'), s.got.a.at(-1));
    } else {
      assert.deepEqual([next.celebrate, next.reaction.extra, s.raw('cat'), s.store.writes.length], [null, {}, raw, writes]);
    }
  });
}

test('праздник, контроль: без внешней записи новая ступень «Освоился» — праздник, примерка платка, объявление и отметка', () => {
  const counts = host(2, 1);
  const s = pair({ cat: CAT }, counts);
  counts.set(3, 1);
  const result = s.A.notify('saved', { key: 'one', counted: true }, SEEN);
  assert.deepEqual([result.celebrate, result.reaction.extra.follow, s.json('cat').seenStage], [1, { type: 'unlock', extra: { tryOn: 'plaid', mini: '', phrases: 'plaid' } }, 1]);
  assert.equal(s.got.a.length, 1);
  assert.match(s.got.a[0], /^notify ready 1 saved saved celebrate announce Марс: открыта ступень «Освоился»/);
  assert.deepEqual(s.got.b, ['storage ready 1 saved saved']);
});

test('приветствие, отметка уголка и явная правка — тоже по подтверждённому: уже поздоровались сегодня — без приветствия; уже увидели — без записи; правка, совпавшая с устаревшим кэшем, записывается', () => {
  // Приветствие: кэш — вчерашний день, в хранилище — сегодняшний (поздоровалась другая вкладка).
  const site = web({ cat: { v: 1, name: 'Марс', seenStage: 0, greetDay: '2026-10-12' } });
  site.storage.load();
  const core = make(site.storage, { counts: host(3, 1) }).core;
  site.put('cat', { v: 1, name: 'Марс', seenStage: 0, greetDay: DAY });
  const writes = site.store.writes.length;
  assert.deepEqual([core.start(SEEN).greet, site.store.writes.length], [null, writes]);
  // Отметка уголка: новая ступень уже отмечена другой вкладкой — записи нет, «нового» нет.
  assert.equal(core.getState().progress.unseen, true);
  site.put('cat', { v: 1, name: 'Марс', seenStage: 1, greetDay: DAY });
  assert.deepEqual([core.markSeen().changed, site.store.writes.length, core.getState().progress.unseen], [false, writes, false]);
  // Явная правка: в кэше «Марс», в хранилище уже «Пиксель» — «Марс» не считается «без изменений».
  site.put('cat', { v: 1, name: 'Пиксель', seenStage: 1, greetDay: DAY });
  const named = core.setName('Марс');
  assert.deepEqual([named.changed, named.save.status, site.json('cat')], [true, 'saved', { v: 1, name: 'Марс', seenStage: 1, greetDay: DAY }]);
});

test('отказ свежего чтения перед командой: не «ключа нет» — решение по последнему подтверждённому; поверх непрочитанного не пишет; сохранения не выдаёт', () => {
  // Подтверждено «уже угостили», чтение отказывает: не умолчания (иначе лакомство стало бы доступно).
  const fed = pair({ cat: CAT, treat: { v: 1, fedDay: DAY } }, host(1, 1));
  fed.store.denyGet = new RegExp(fed.keys.treat);
  assert.deepEqual([fed.A.feed(SEEN).error.code, fed.A.getState().treat], ['treat-fed', 'fed']);
  // Подтверждено «ждёт», в хранилище уже отметка, чтение отказывает: кормление по подтверждённому, запись не делается
  // (её чтение тоже отказывает), итог честный — «не сохранилась».
  const s = pair({ cat: CAT, treat: { v: 1, fedDay: '' } }, host(1, 1));
  s.put('treat', { v: 1, fedDay: DAY, future: 1 });
  const raw = s.raw('treat');
  const writes = s.store.writes.length;
  s.store.denyGet = new RegExp(s.keys.treat);
  const result = s.A.feed(SEEN);
  assert.deepEqual([result.ok, result.save.status, s.A.getState().save.treat.status, s.A.getState().save.treat.unsaved], [true, 'failed', 'failed', ['fedDay']]);
  assert.deepEqual([s.store.writes.length, s.raw('treat')], [writes, raw]);
  assert.ok(s.got.a.at(-1).endsWith('Сегодня уже угостили, но отметка не сохранилась в этом браузере.'), s.got.a.at(-1));
  // Чтение вернулось: несохранённая отметка вытеснена подтверждённой, повтора нет.
  s.store.denyGet = null;
  assert.deepEqual([s.A.feed(SEEN).error.code, s.A.getState().save.treat.status, s.raw('treat')], ['treat-fed', 'saved', raw]);
});

test('отказ загрузки и отключённое ядро: сверка ничего не читает; reentrant — без сверки', () => {
  const list = [];
  const site = web({ cat: CAT }, { journal: list });
  site.store.denyGet = /./;
  assert.equal(site.storage.load(), 'failed');
  site.store.denyGet = null;
  const offline = make(site.storage, { counts: host(1, 1) }).core;
  list.length = 0;
  offline.start(SEEN);
  offline.feed(SEEN);
  offline.notify('saved', { key: 'k', counted: true }, SEEN);
  assert.deepEqual(list, [], 'подключение при отказе загрузки не читает и не пишет');
  // Отключённое ядро и вызов из progress() в фазе работы: ни чтений, ни записей.
  const ok = web({ cat: CAT }, { journal: list });
  ok.storage.load();
  let inner = null;
  let core;
  core = make(ok.storage, { counts: { progress: () => ((inner ??= core.feed(SEEN)), { marks: 1, today: 1 }) } }).core;
  list.length = 0;
  core.start(SEEN);
  assert.deepEqual([inner.error.code, list.length], ['reentrant', 4], 'только сверка самого start (четыре ключа); reentrant ничего не читает');
  core.destroy();
  list.length = 0;
  assert.deepEqual([core.feed(SEEN).error.code, list], ['destroyed', []]);
});

test('асинхронно: сверка перед командой ничего не читает — решение по подтверждённому в процессе; кормление другим ядром учтено; pending, done без отказа; операция после destroy выполняется, второго кормления нет', async () => {
  const store = manual({ cat: CAT, treat: { v: 1, fedDay: '' } });
  await store.load();
  const counts = host(1, 1);
  const A = make(store.storage, { counts }).core;
  const B = make(store.storage, { counts }).core;
  A.start(SEEN);
  B.start(SEEN);
  assert.equal(store.waiting.length, 0, 'запуск в тот же день ничего не ставит');
  const fed = A.feed(SEEN);
  assert.deepEqual([fed.save.status, A.getState().treat, B.getState().treat, store.waiting.map((item) => `${item.op} ${item.key}`)], ['pending', 'fed', 'ready', ['get treat']], 'только чтение операции записи, без чтений сверки');
  A.destroy();
  await store.drain();
  assert.equal(await fed.save.done, 'saved', 'операция после destroy выполнена, done не отклоняется');
  assert.deepEqual([B.getState().treat, store.json('treat')], ['fed', { v: 1, fedDay: DAY }]);
  assert.deepEqual([B.feed(SEEN).error.code, store.waiting.length], ['treat-fed', 0], 'второго кормления нет');
  // Праздник: увиденную ступень подтвердило другое ядро этого координатора — решение по ней.
  counts.set(3, 1);
  const C = make(store.storage, { counts }).core;
  C.start(SEEN);
  const seen = C.markSeen();
  assert.equal(seen.save.status, 'pending');
  await store.drain();
  assert.deepEqual([await seen.save.done, store.json('cat').seenStage], ['saved', 1]);
  assert.deepEqual([B.notify('saved', { key: 'one', counted: true }, SEEN).celebrate, store.waiting.length], [null, 0]);
});
