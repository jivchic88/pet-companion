// Сверка перед решением команды (docs/ARCHITECTURE.md § 5.5, шаг 1а; независимая проверка PL03, 2026-10-13): сохранённое
// изменение, завершённое до команды, а событие storage ещё не пришло (другая вкладка) или его не будет (восстановление на
// этой же странице), учитывается в решении, а не только в поздней сверке записи. Кормление при уже отмеченном дне и
// обратный случай; праздник уже увиденной, непонятной строки и непонятного числа ступени и нормальное открытие ступени;
// приветствие, отметка уголка и явная правка, совпавшая с устаревшим кэшем; второе ядро; запоздалое storage; отказ
// свежего чтения; отказ загрузки и отключённое ядро; асинхронный координатор, pending и destroy. Проверяются решение,
// реакция и продолжение, эффекты, снимок и фактическое хранилище, а не только текст объявления. Граница сверки и фазы
// команды (повторная проверка PL03): destroy() из чтения сверки, команды из него (reentrant), исключение сверки до чтения
// и после поглощения внешнего изменения, контроль — destroy() из progress() в фазе самой команды. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CORE_KEYS, corner, DAY, host, make, manual, spy, web } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };

// Два запущенных ядра на одном веб-координаторе и журнал их обновлений: причина, лакомство, ступень, эффекты.
function pair(initial, counts) {
  const site = web(initial);
  assert.equal(site.storage.load(), 'ready');
  const A = make(site.storage, { counts }).core;
  const B = make(site.storage, { counts }).core;
  assert.equal(A.start().ok, true);
  assert.equal(B.start().ok, true);
  const got = { a: [], b: [] };
  const line = (update) => {
    // Сигналы конвейеру сценки (PL04.1, { type: 'scene' }) к решению по подтверждённому не относятся.
    const effects = update.effects.filter((effect) => effect.type !== 'save' && effect.type !== 'scene').map((effect) => (effect.type === 'announce' ? `announce ${effect.text}` : effect.type));
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
  const result = s.A.feed();
  assert.deepEqual([result.ok, result.error?.code, 'reaction' in result], [false, 'treat-fed', false], JSON.stringify(result));
  assert.deepEqual([s.store.writes.length, s.raw('treat')], [writes, raw], 'второй отметки нет, исходная запись как есть');
  for (const core of [s.A, s.B]) assert.deepEqual([core.getState().treat, core.getState().save.treat.status], ['fed', 'saved']);
  // Найденное сверкой — обновление storage у обоих, не изменение команды feed; объявлений и реакции нет.
  assert.deepEqual(s.got, { a: ['storage fed 0 saved saved'], b: ['storage fed 0 saved saved'] });
  s.events.fire(s.keys.treat);
  assert.deepEqual([s.A.feed().error.code, s.B.feed().error.code], ['treat-fed', 'treat-fed']);
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
  const result = s.A.feed();
  assert.deepEqual([result.ok, result.save.status, result.reaction?.type, result.reaction?.key, result.reaction?.extra.follow.type], [true, 'saved', 'feed', `feed:${DAY}`, 'fed']);
  assert.deepEqual(s.json('treat'), { v: 2, fedDay: DAY, note: 'копия' });
  assert.deepEqual(s.got.a, ['storage ready 0 saved saved', 'feed fed 0 saved saved announce Марс получает лакомство. Сегодня уже угостили.']);
  assert.deepEqual(s.got.b, ['storage ready 0 saved saved', 'storage fed 0 saved saved'], 'второе ядро: сверка, затем поглощение записи — без объявления');
  assert.equal(s.B.feed().error.code, 'treat-fed', 'одно в день');
});

test('кормление, контроль: без внешней записи — обычное кормление, реакция и объявление по итогу записи', () => {
  const counts = host(1, 1);
  const s = pair({ cat: CAT, treat: { v: 1, fedDay: '' } }, counts);
  const result = s.A.feed();
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
    const result = s.A.notify('saved', { key: 'one', counted: true });
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
    const next = s.A.notify('saved', { key: 'two', counted: true });
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
  const result = s.A.notify('saved', { key: 'one', counted: true });
  assert.deepEqual([result.celebrate, result.reaction.extra.follow, s.json('cat').seenStage], [1, { type: 'unlock', extra: { tryOn: 'plaid', mini: '', phrases: 'tryOn' } }, 1]);
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
  assert.deepEqual([core.start().greet, site.store.writes.length], [null, writes]);
  // Отметка уголка: новая ступень уже отмечена другой вкладкой — записи нет, «нового» нет.
  assert.equal(core.getState().progress.unseen, true);
  site.put('cat', { v: 1, name: 'Марс', seenStage: 1, greetDay: DAY });
  assert.deepEqual([corner(core).fresh, site.store.writes.length, core.getState().progress.unseen], [[], writes, false]);
  // Явная правка: в кэше «Марс», в хранилище уже «Пиксель» — «Марс» не считается «без изменений».
  site.put('cat', { v: 1, name: 'Пиксель', seenStage: 1, greetDay: DAY });
  const named = core.setName('Марс');
  assert.deepEqual([named.changed, named.save.status, site.json('cat')], [true, 'saved', { v: 1, name: 'Марс', seenStage: 1, greetDay: DAY }]);
});

test('отказ свежего чтения перед командой: не «ключа нет» — решение по последнему подтверждённому; поверх непрочитанного не пишет; сохранения не выдаёт', () => {
  // Подтверждено «уже угостили», чтение отказывает: не умолчания (иначе лакомство стало бы доступно).
  const fed = pair({ cat: CAT, treat: { v: 1, fedDay: DAY } }, host(1, 1));
  fed.store.denyGet = new RegExp(fed.keys.treat);
  assert.deepEqual([fed.A.feed().error.code, fed.A.getState().treat], ['treat-fed', 'fed']);
  // Подтверждено «ждёт», в хранилище уже отметка, чтение отказывает: кормление по подтверждённому, запись не делается
  // (её чтение тоже отказывает), итог честный — «не сохранилась».
  const s = pair({ cat: CAT, treat: { v: 1, fedDay: '' } }, host(1, 1));
  s.put('treat', { v: 1, fedDay: DAY, future: 1 });
  const raw = s.raw('treat');
  const writes = s.store.writes.length;
  s.store.denyGet = new RegExp(s.keys.treat);
  const result = s.A.feed();
  assert.deepEqual([result.ok, result.save.status, s.A.getState().save.treat.status, s.A.getState().save.treat.unsaved], [true, 'failed', 'failed', ['fedDay']]);
  assert.deepEqual([s.store.writes.length, s.raw('treat')], [writes, raw]);
  assert.ok(s.got.a.at(-1).endsWith('Сегодня уже угостили, но отметка не сохранилась в этом браузере.'), s.got.a.at(-1));
  // Чтение вернулось: несохранённая отметка вытеснена подтверждённой, повтора нет.
  s.store.denyGet = null;
  assert.deepEqual([s.A.feed().error.code, s.A.getState().save.treat.status, s.raw('treat')], ['treat-fed', 'saved', raw]);
});

test('отказ загрузки и отключённое ядро: сверка ничего не читает; reentrant — без сверки', () => {
  const list = [];
  const site = web({ cat: CAT }, { journal: list });
  site.store.denyGet = /./;
  assert.equal(site.storage.load(), 'failed');
  site.store.denyGet = null;
  const offline = make(site.storage, { counts: host(1, 1) }).core;
  list.length = 0;
  offline.start();
  offline.feed();
  offline.notify('saved', { key: 'k', counted: true });
  assert.deepEqual(list, [], 'подключение при отказе загрузки не читает и не пишет');
  // Отключённое ядро и вызов из progress() в фазе работы: ни чтений, ни записей.
  const ok = web({ cat: CAT }, { journal: list });
  ok.storage.load();
  let inner = null;
  let core;
  core = make(ok.storage, { counts: { progress: () => ((inner ??= core.feed()), { marks: 1, today: 1 }) } }).core;
  list.length = 0;
  core.start();
  assert.deepEqual([inner.error.code, list.length], ['reentrant', CORE_KEYS.length], 'только сверка самого start (ключи ядра); reentrant ничего не читает');
  core.destroy();
  list.length = 0;
  assert.deepEqual([core.feed().error.code, list], ['destroyed', []]);
});

test('асинхронно: сверка перед командой ничего не читает — решение по подтверждённому в процессе; кормление другим ядром учтено; pending, done без отказа; операция после destroy выполняется, второго кормления нет', async () => {
  const store = manual({ cat: CAT, treat: { v: 1, fedDay: '' } });
  await store.load();
  const counts = host(1, 1);
  const A = make(store.storage, { counts }).core;
  const B = make(store.storage, { counts }).core;
  A.start();
  B.start();
  assert.equal(store.waiting.length, 0, 'запуск в тот же день ничего не ставит');
  const fed = A.feed();
  assert.deepEqual([fed.save.status, A.getState().treat, B.getState().treat, store.waiting.map((item) => `${item.op} ${item.key}`)], ['pending', 'fed', 'ready', ['get treat']], 'только чтение операции записи, без чтений сверки');
  A.destroy();
  await store.drain();
  assert.equal(await fed.save.done, 'saved', 'операция после destroy выполнена, done не отклоняется');
  assert.deepEqual([B.getState().treat, store.json('treat')], ['fed', { v: 1, fedDay: DAY }]);
  assert.deepEqual([B.feed().error.code, store.waiting.length], ['treat-fed', 0], 'второго кормления нет');
  // Праздник: увиденную ступень подтвердило другое ядро этого координатора — решение по ней.
  counts.set(3, 1);
  const C = make(store.storage, { counts }).core;
  C.start();
  const seen = corner(C);
  assert.equal(seen.save.status, 'pending');
  await store.drain();
  assert.deepEqual([await seen.save.done, store.json('cat').seenStage], ['saved', 1]);
  assert.deepEqual([B.notify('saved', { key: 'one', counted: true }).celebrate, store.waiting.length], [null, 0]);
});

// ---------- граница сверки и фазы команды ----------

const MARS = { v: 1, name: 'Марс', seenStage: 0, greetDay: DAY };

// Подключение, чья сверка бросает: fault.when — 'before' (до чтения), 'after' (после настоящей сверки) или null (обычная);
// остальные методы — настоящего подключения.
function faulty(storage, fault) {
  return {
    get status() {
      return storage.status;
    },
    load: () => storage.load(),
    connect() {
      const client = storage.connect();
      return {
        ...client,
        sync(keys) {
          if (fault.when === 'after') client.sync(keys);
          if (fault.when) throw new Error('sync fault');
          client.sync(keys);
        },
      };
    },
  };
}

// Два запущенных ядра на одном веб-координаторе со шпионом (A — подключение a через faulty, B — b) и журнал: сверка,
// чтения и записи хранилища, постановки, settle, поглощения, доставки; got — обновления слушателей.
function edge(initial, { counts = host(1, 1), fault = { when: null } } = {}) {
  const list = [];
  const site = web(initial, { journal: list });
  assert.equal(site.storage.load(), 'ready');
  const watched = spy(site.storage, list, ['a', 'b']);
  const A = make(faulty(watched, fault), { counts });
  const B = make(watched, { counts });
  assert.equal(A.core.start().ok, true);
  assert.equal(B.core.start().ok, true);
  const got = { a: [], b: [] };
  const line = (update) => [update.reason, update.snapshot.status, update.snapshot.name.display, update.snapshot.treat].join(' ');
  A.core.subscribe((update) => (got.a.push(line(update)), list.push(`deliver la ${update.reason}`)), { initial: false });
  B.core.subscribe((update) => (got.b.push(line(update)), list.push(`deliver lb ${update.reason}`)), { initial: false });
  list.length = 0;
  const fresh = (who) => [`sync ${who}`, ...CORE_KEYS.map((name) => `getItem ${site.keys[name]}`)];
  return { ...site, list, got, fresh, watched, A: A.core, B: B.core, logA: A.log.list, logB: B.log.list };
}

// Чтение хранилища, которое один раз (первым чтением следующей сверки) вызывает action.
function once(s, action) {
  const get = s.store.getItem;
  let armed = true;
  s.store.getItem = (key) => {
    if (armed) {
      armed = false;
      action();
    }
    return get(key);
  };
}

for (const [name, command] of [
  ['setName', (core) => core.setName('После отключения')],
  ['feed', (core) => core.feed()],
]) {
  test(`граница сверки: destroy() из чтения сверки, затем ${name} не выполняется — destroyed без правки, write и эффектов; destroyed доставлен один раз; снимок стабилен; дальше — без действий; второе ядро живо`, () => {
    const s = edge({ cat: MARS, treat: { v: 1, fedDay: '' } });
    once(s, () => s.A.destroy());
    const writes = s.store.writes.length;
    const raw = [s.raw('cat'), s.raw('treat')];
    const result = command(s.A);
    assert.deepEqual(result, { ok: false, error: { code: 'destroyed', message: 'Питомец отключён.' } }, JSON.stringify(result));
    // Сверка дочитана (подключение закрыто в конце её фазы), затем ни постановки, ни поглощения B, ни обновлений команды.
    assert.deepEqual(s.list, [...s.fresh('a'), 'deliver la destroyed']);
    assert.deepEqual([s.A.status, s.store.writes.length, [s.raw('cat'), s.raw('treat')]], ['destroyed', writes, raw]);
    const state = s.A.getState();
    assert.deepEqual([state.status, state.name.value, state.treat, state.save.cat.status, state.save.treat.status], ['destroyed', 'Марс', 'ready', 'saved', 'saved']);
    assert.deepEqual(s.got, { a: ['destroyed destroyed Марс ready'], b: [] }, 'без объявления и реакции; B ничего не поглощал');
    s.list.length = 0;
    for (const again of [() => s.A.setName('Ещё'), () => s.A.feed(), () => s.A.notify('saved', { key: 'k', counted: true }), () => s.A.refresh(), () => s.A.open('corner'), () => s.A.setPresence('on-call'), () => s.A.hide()]) assert.equal(again().error.code, 'destroyed');
    s.A.destroy();
    assert.equal(s.A.getState(), state, 'снимок destroyed — тот же объект');
    assert.deepEqual([s.list, s.got.a.length, s.logA], [[], 1, []]);
    // B живо: его команда пишет; закрытое подключение A не поглощает, снимок A прежний.
    const named = s.B.setName('Пиксель');
    assert.deepEqual([named.ok, named.save.status, s.json('cat').name], [true, 'saved', 'Пиксель']);
    assert.deepEqual(s.list, [...s.fresh('b'), 'write b cat', `getItem ${s.keys.cat}`, `setItem ${s.keys.cat}`, 'settle b true', 'settled b', 'deliver lb setName']);
    assert.deepEqual([s.A.getState(), s.got.a.length, s.logB], [state, 1, []]);
  });
}

test('граница сверки: из чтения сверки команды A и B — reentrant без изменений и журнала, destroy() B — в конце фазы сверки; команда A выполняется по сверенному, B только destroyed', () => {
  const s = edge({ cat: MARS, treat: { v: 1, fedDay: '' } });
  let inner = null;
  once(s, () => {
    inner = [s.A.setName('Изнутри'), s.B.feed()];
    s.B.destroy();
  });
  const treat = s.raw('treat');
  const result = s.A.setName('Барсик');
  assert.deepEqual(inner.map((item) => [item.ok, item.error.code]), [[false, 'reentrant'], [false, 'reentrant']]);
  assert.deepEqual([result.ok, result.changed, result.save.status, s.json('cat').name, s.raw('treat')], [true, true, 'saved', 'Барсик', treat]);
  assert.deepEqual(s.list, [...s.fresh('a'), 'write a cat', `getItem ${s.keys.cat}`, `setItem ${s.keys.cat}`, 'settle a true', 'settled a', 'deliver lb destroyed', 'deliver la setName']);
  assert.deepEqual(s.got, { a: ['setName running Барсик ready'], b: ['destroyed destroyed Марс ready'] });
  assert.deepEqual([s.B.status, s.logA, s.logB], ['destroyed', [], []]);
});

test('граница сверки: исключение сверки до чтения — каждая команда internal, не бросает: без чтения, правки, записи и обновлений, журнал; раунд завершён — подписка сразу получает снимок, дальше команды A и B выполняются', () => {
  const fault = { when: null };
  const s = edge({ cat: MARS, treat: { v: 1, fedDay: '' } }, { fault });
  fault.when = 'before';
  const state = s.A.getState();
  const writes = s.store.writes.length;
  const commands = {
    refresh: () => s.A.refresh(),
    notify: () => s.A.notify('saved', { key: 'k', counted: true }),
    feed: () => s.A.feed(),
    open: () => s.A.open('corner'),
    setPresence: () => s.A.setPresence('on-call'),
    setName: () => s.A.setName('Барсик'),
    setPet: () => s.A.setPet('dog'),
    setAppearance: () => s.A.setAppearance({ coat: 'tuxedo' }),
    setPreferences: () => s.A.setPreferences({ motion: 'calm' }),
    hide: () => s.A.hide(),
  };
  for (const [name, run] of Object.entries(commands)) {
    let result;
    assert.doesNotThrow(() => (result = run()), name);
    assert.deepEqual(result, { ok: false, error: { code: 'internal', message: 'Внутренний сбой: sync fault' } }, name);
  }
  assert.equal(s.A.getState(), state, 'снимок прежний');
  assert.deepEqual([s.list, s.store.writes.length, s.got, s.logB], [[], writes, { a: [], b: [] }, []]);
  assert.deepEqual(s.logA, Object.keys(commands).map((name) => `сбой команды ${name}: sync fault`));
  // start нового ядра — тоже internal: не запущено, ничего не записано.
  const C = make(faulty(s.watched, { when: 'before' }), { counts: host(1, 1) });
  assert.deepEqual([C.core.start().error?.code, C.core.status, C.log.list, s.store.writes.length], ['internal', 'created', ['сбой команды start: sync fault'], writes]);
  C.core.destroy();
  // Раунд не остался в фазе сверки или работы: начальный снимок подписки — до возврата subscribe.
  fault.when = null;
  s.list.length = 0;
  const initial = [];
  s.A.subscribe((update) => initial.push(update.reason))();
  assert.deepEqual(initial, ['initial']);
  const named = s.A.setName('Барсик');
  const fed = s.B.feed();
  assert.deepEqual([named.ok, named.save.status, fed.ok, fed.save.status], [true, 'saved', true, 'saved']);
  assert.deepEqual([s.json('cat').name, s.json('treat').fedDay], ['Барсик', DAY]);
  assert.deepEqual(s.got, { a: ['setName running Барсик ready', 'storage running Барсик fed'], b: ['storage running Барсик ready', 'feed running Барсик fed'] });
});

test('граница сверки: исключение после поглощения внешнего изменения — поглощённое не откатывается и доставлено обоим ядрам (storage); команда — internal без записи; запоздалое storage — без эффектов', () => {
  const fault = { when: null };
  const s = edge({ cat: MARS, treat: { v: 1, fedDay: '' } }, { fault });
  fault.when = 'after';
  s.put('treat', { v: 1, fedDay: DAY });
  const raw = s.raw('treat');
  const writes = s.store.writes.length;
  let result;
  assert.doesNotThrow(() => (result = s.A.feed()));
  assert.deepEqual(result, { ok: false, error: { code: 'internal', message: 'Внутренний сбой: sync fault' } });
  // Сверка по очереди ключей: поглощение treat — сразу после его чтения, затем остальные ключи ядра.
  const read = s.fresh('a');
  const after = read.indexOf(`getItem ${s.keys.treat}`) + 1;
  assert.deepEqual(s.list, [...read.slice(0, after), 'absorb a treat', 'absorb b treat', ...read.slice(after), 'deliver la storage', 'deliver lb storage']);
  assert.deepEqual(s.got, { a: ['storage running Марс fed'], b: ['storage running Марс fed'] });
  assert.deepEqual([s.store.writes.length, s.raw('treat'), s.logA, s.logB], [writes, raw, ['сбой команды feed: sync fault'], []]);
  fault.when = null;
  s.events.fire(s.keys.treat);
  assert.deepEqual([s.A.feed().error.code, s.B.feed().error.code, s.got.a.length, s.got.b.length, s.store.writes.length, s.raw('treat')], ['treat-fed', 'treat-fed', 1, 1, writes, raw]);
});

test('граница сверки, контроль: destroy() из progress() в фазе самой команды — прежняя семантика: команда выполнена и записана, отключение в конце её фазы; слушателям A — только destroyed', () => {
  let armed = false;
  let core = null;
  const counts = {
    progress: () => {
      if (armed) {
        armed = false;
        core.destroy();
      }
      return { marks: 1, today: 1, limit: 3 };
    },
  };
  const s = edge({ cat: MARS, treat: { v: 1, fedDay: '' } }, { counts });
  core = s.A;
  armed = true;
  const result = s.A.feed();
  assert.deepEqual([result.ok, result.changed, result.save.status, result.reaction?.type, s.A.status], [true, true, 'saved', 'feed', 'destroyed']);
  assert.deepEqual(s.json('treat'), { v: 1, fedDay: DAY });
  assert.deepEqual(s.list, [...s.fresh('a'), 'write a treat', `getItem ${s.keys.treat}`, `setItem ${s.keys.treat}`, 'absorb b treat', 'settle a true', 'settled a', 'deliver la destroyed', 'deliver lb storage']);
  assert.deepEqual(s.got, { a: ['destroyed destroyed Марс fed'], b: ['storage running Марс fed'] });
  assert.deepEqual([s.A.feed().error.code, s.B.feed().error.code, s.logA], ['destroyed', 'treat-fed', []]);
});
