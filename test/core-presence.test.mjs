// Ядро PL04.2 в Node — присутствие, виды и их источник, отметка ступени по виду (docs/ARCHITECTURE.md § 5.2, § 6.4, § 8,
// § 10): настоящий экземпляр ядра с ручными часами, ручным планировщиком и заданной случайностью (test/core-kit.mjs life),
// хранение — синхронный веб-координатор и асинхронный с ручным подтверждением. Таблица: always / on-call × закрыт / уголок /
// «Поиграть» / редактор × источник pet / call × фон и тишина — снимок presence и view, решения notify, feed, failed,
// приветствие. «Скрыть», «Показать», вызов: вид закрыт, задачи сняты и заново, память событий, тишина и паузы повторов
// сохраняются, «Показать» по зову — лапка без игры. Праздник и отметка ступени: первое включение, «Поиграть» и редактор,
// возврат в уголок (и после вызова), позднее сохранение во время вида, непонятная и понятная ступень, свежая сверка при
// открытии. Ключ presence через координатор: неизвестные поля и v, повреждение, отказ чтения и записи, асинхронно pending,
// чужая запись без приветствия и записи, сверка без события, барьер, запись до destroy. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { REACTIONS } from './legacy-rules.mjs';
import { createPetCore } from './core-kit.mjs';
import { calendar, DAY, flush, host, journal, LEGACY_DISPLAY, life, manual, planner, series, VIEWS, web } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };
const started = (initial = { cat: CAT }, parts = {}) => {
  const L = life(initial, { counts: host(1, 1), display: LEGACY_DISPLAY, ...parts });
  assert.equal(L.core.start().ok, true);
  return L;
};
const playing = (L) => L.state().pose.reaction?.type ?? null;
const saved = (L, key, extra = {}) => L.core.notify('saved', { key, counted: true, ...extra });
const names = (L) => L.plan.live().map((item) => item.ms);

// ---------- А. Таблица присутствия, вида, источника, фона ----------

const OPENINGS = [
  [null, ''],
  ['corner', 'pet'],
  ['play', 'pet'],
  ['room', 'pet'],
  ['play', 'call'],
];

for (const mode of ['always', 'on-call']) {
  for (const [open, source] of OPENINGS) {
    for (const visible of [true, false]) {
      test(`таблица: ${mode}, вид ${open ?? 'закрыт'}${source ? ` (${source})` : ''}, ${visible ? 'вкладка видна' : 'фон'} — снимок и решения`, () => {
        const counts = host(2, 1);
        const L = started({ cat: CAT, presence: { v: 1, mode } }, { counts });
        if (open) assert.equal(L.core.open(open, { source }).ok, true);
        if (!visible) L.core.setVisible(false);
        const around = mode === 'always' || open !== null;
        const state = L.state();
        assert.deepEqual(state.presence, { mode, hidden: false, surface: mode === 'on-call' ? 'call' : 'pet', around });
        assert.deepEqual([state.view, state.visible], [{ open, source }, visible]);
        // Новая ступень этим занятием: праздник — только на виду и не в «Поиграть» и редакторе; в фоне — то же решение.
        counts.set(3, 2);
        const result = saved(L, 'K');
        const celebrate = around && open !== 'play' && open !== 'room' ? 1 : null;
        assert.deepEqual([result.reacted, result.celebrate, L.json('cat').seenStage], [around, celebrate, celebrate ?? 0], 'решение занятия по присутствию и виду');
        assert.equal(playing(L), around && visible ? 'joy' : null, 'проигрывание — только на виду и в видимой вкладке');
        assert.equal(L.core.feed().error?.code ?? 'ok', around ? 'ok' : 'away', 'лакомство: не на виду — away');
        assert.equal(L.state().presence.around, around, 'смысл присутствия от фона не меняется');
      });
    }
  }
}

test('таблица: спрятан — поверхность none, вид закрыт, открыть нельзя (hidden); «Показать» по зову — лапка, игра не открывается', () => {
  for (const mode of ['always', 'on-call']) {
    const L = started({ cat: CAT, presence: { v: 1, mode } });
    assert.equal(L.core.open(mode === 'on-call' ? 'play' : 'corner', { source: mode === 'on-call' ? 'call' : 'pet' }).ok, true);
    assert.equal(L.core.hide().ok, true);
    assert.deepEqual([L.state().presence, L.state().view], [{ mode, hidden: true, surface: 'none', around: false }, { open: null, source: '' }], `${mode}: спрятан`);
    for (const view of VIEWS) assert.equal(L.core.open(view).error.code, 'hidden');
    assert.equal(L.core.open('play', { source: 'call' }).error.code, 'hidden');
    assert.deepEqual([saved(L, 'h').reacted, L.core.feed().error.code], [false, 'hidden']);
    assert.equal(L.core.show().ok, true);
    assert.deepEqual([L.state().presence.surface, L.state().presence.around, L.state().view.open], [mode === 'on-call' ? 'call' : 'pet', mode === 'always', null], `${mode}: «Показать» — поверхность по присутствию, вид не открывается`);
  }
});

test('виды: объявляет отображение (иначе unsupported); аргументы — invalid-argument без изменений; источник — до закрытия; закрыть закрытое — без изменений', () => {
  const bare = life({ cat: CAT }, { counts: host(1, 1) });
  bare.core.start();
  const before = bare.state();
  for (const view of VIEWS) assert.equal(bare.core.open(view).error.code, 'unsupported', `${view} без объявления`);
  bare.core.setDisplay({ views: ['corner'] });
  assert.deepEqual([bare.core.open('play').error.code, bare.core.open('room').error.code, bare.core.open('corner').ok], ['unsupported', 'unsupported', true], 'только объявленные');
  assert.notEqual(before, bare.state());
  const L = started();
  const state = L.state();
  for (const [args, code] of [
    [['kitchen'], 'invalid-argument'],
    [[null], 'invalid-argument'],
    [['corner', { source: 'call' }], 'invalid-argument'],
    [['play', { source: 'tab' }], 'invalid-argument'],
    [['play', { source: 'pet', extra: 1 }], 'invalid-argument'],
    [['play', 'call'], 'invalid-argument'],
  ]) {
    assert.equal(L.core.open(...args).error.code, code, JSON.stringify(args));
  }
  assert.equal(L.state(), state, 'отказ — снимок прежний');
  assert.deepEqual(L.core.close(), { ok: true, changed: false, save: { status: 'none', keys: [], results: {} } }, 'закрыть закрытое');
  L.core.open('corner');
  L.core.open('play', { source: 'call' });
  assert.deepEqual(L.state().view, { open: 'play', source: 'pet' }, 'смена вида источник не меняет');
  L.core.close();
  L.core.open('play', { source: 'call' });
  L.core.open('corner');
  assert.deepEqual(L.state().view, { open: 'corner', source: 'call' }, 'вызов → «Уголок» — источник вызова до закрытия');
  assert.equal(L.core.open('corner').changed, false, 'тот же вид — без изменений');
  L.core.close();
  assert.deepEqual(L.state().view, { open: null, source: '' });
});

test('вызов по зову: сразу «Поиграть», без приветствия, праздника, отметки ступени и «заметил гостя»; задачи покоя — пока вызван; закрыт — ушёл, только полночь', () => {
  const counts = host(2, 1);
  const L = life({ cat: { v: 1, seenStage: 0 }, presence: { v: 1, mode: 'on-call' } }, { counts, display: LEGACY_DISPLAY });
  assert.deepEqual(L.core.start().greet, null, '«по зову» — без приветствия');
  assert.equal(L.json('cat').greetDay, undefined, 'и без записи дня приветствия');
  assert.deepEqual(names(L), [50_400_000], 'не вызван — только полночь');
  counts.set(3, 2);
  L.core.refresh();
  assert.equal(L.state().progress.unseen, true);
  const called = L.core.open('play', { source: 'call' });
  assert.deepEqual([called.ok, called.fresh, L.json('cat').seenStage, L.state().progress.unseen], [true, [], 0, true], 'вызов не отмечает ступень');
  assert.deepEqual([playing(L), L.effects('celebrate'), L.effects('announce')], [null, [], []], 'ни праздника, ни объявлений');
  assert.equal(names(L).length, 4, 'вызван — покой и полночь заново');
  assert.equal(L.plan.live().some((item) => item.ms === 600), false, 'без движения «заметил гостя»');
  L.core.close();
  assert.deepEqual([L.state().presence.around, names(L)], [false, [50_400_000 - 0]], 'закрыт — ушёл, только полночь');
  saved(L, 'away');
  assert.deepEqual([playing(L), L.state().scene.waiting], [null, null], 'закрытый по зову ничего не играет и не копит');
  L.core.open('play', { source: 'call' });
  assert.equal(playing(L), null, 'вызов ничего не доигрывает');
});

test('смена присутствия: тихо меняет поверхность; открытый диалог и источник остаются; закрытый on-call ничего не доигрывает; снова рядом — без приветствия', () => {
  const L = started();
  L.core.open('corner');
  L.core.setPresence('on-call');
  assert.deepEqual([L.state().presence, L.state().view], [{ mode: 'on-call', hidden: false, surface: 'call', around: true }, { open: 'corner', source: 'pet' }], 'диалог открыт — на виду, источник прежний');
  saved(L, 'a');
  assert.equal(playing(L), 'joy');
  L.core.close();
  assert.deepEqual([playing(L), L.state().phrase, names(L)], [null, null, [L.plan.live()[0]?.ms]], 'закрыт по зову — радость не доигрывается, остаётся полночь');
  assert.equal(names(L).length, 1);
  L.core.setPresence('always');
  assert.deepEqual([L.state().presence.around, names(L).length, playing(L), L.effects('announce')], [true, 4, null, []], 'снова рядом: покой и полночь заново, без приветствия');
  assert.equal(L.core.setPresence('always').changed, false);
  assert.equal(L.core.setPresence('nap').error.code, 'invalid-argument');
});

// ---------- Б. «Скрыть» и «Показать» ----------

test('«Скрыть»: вид закрыт, реакция, облако, попытка и все задачи (и полночь) сняты; память событий, тишина и паузы повторов — нет; «Показать» без приветствия и повторов', () => {
  const L = started();
  L.core.open('play', { source: 'call' });
  saved(L, 'K');
  L.core.notify('failed', null);
  L.core.setContext({ timer: true });
  assert.equal(L.core.hide().ok, true);
  assert.deepEqual([L.state().view, playing(L), L.state().phrase, L.plan.live().length, L.json('cat').hidden], [{ open: null, source: '' }, null, null, 0, true]);
  assert.deepEqual(L.state().context.quiet, ['timer'], 'тишина сохранена');
  assert.equal(L.core.show().ok, true);
  assert.deepEqual([names(L).length, playing(L), L.effects('announce')], [4, null, []], '«Показать»: покой и полночь, без приветствия');
  assert.equal(saved(L, 'K').duplicate, true, 'K учтён — не повторяется');
  L.core.setContext({ timer: false });
  L.plan.advance(REACTIONS.joy.ms);
  L.core.notify('failed', null);
  assert.equal(playing(L), null, 'пауза повтора ожидания (10 с) помнится');
  assert.equal(L.core.hide().ok && L.core.hide().changed, false, 'повторное «Скрыть» — без изменений');
});

test('«Скрыть» из другой вкладки: вид закрыт, задачи сняты — без записи, приветствия и объявлений', () => {
  const L = started();
  L.core.open('corner');
  const writes = L.store.writes.length;
  L.put('cat', { ...L.json('cat'), hidden: true });
  L.events.fire(L.keys.cat);
  assert.deepEqual([L.state().presence.hidden, L.state().view.open, L.plan.live().length, L.store.writes.length, L.effects('announce')], [true, null, 0, writes, []]);
  L.put('cat', { ...L.json('cat'), hidden: false });
  L.events.fire(L.keys.cat);
  assert.deepEqual([L.state().presence.surface, L.state().view.open, names(L).length, playing(L)], ['pet', null, 4, null]);
});

// ---------- В. Праздник и отметка ступени по виду ----------

test('первое включение молча; уголок открыт — новая ступень увидена (fresh); «Поиграть» и редактор — без праздника и отметки, «новое» до возврата', () => {
  const counts = host(9, 0);
  const L = life({}, { counts, display: LEGACY_DISPLAY });
  L.core.start();
  assert.deepEqual([L.json('cat').seenStage, L.effects('celebrate')], [2, []], 'история молча');
  counts.set(18, 1);
  L.core.open('play');
  saved(L, 'p');
  assert.deepEqual([L.json('cat').seenStage, L.state().progress.unseen, L.effects('celebrate')], [2, true, []], '«Поиграть» — без праздника, «новое» ждёт');
  L.core.open('room');
  assert.equal(L.core.refresh().fresh.length, 0, 'refresh в редакторе ступень не отмечает');
  const back = L.core.open('corner');
  assert.deepEqual([back.fresh, L.json('cat').seenStage, L.state().progress.unseen, L.effects('celebrate')], [['bed', 'lamp'], 3, false, []], 'возврат в уголок — увидена, без праздника');
  counts.set(30, 2);
  const shown = L.core.refresh();
  assert.deepEqual([shown.fresh, L.json('cat').seenStage], [['plant', 'board'], 4], 'новые знаки при открытом уголке — увидены');
  L.core.close();
  assert.deepEqual(L.core.refresh().fresh, [], 'закрыт — refresh не отмечает');
});

test('вызов → «Уголок»: отметка как при обычном возврате (запрет — не на весь срок вызова); позднее сохранение при открытой игре — без праздника, unseen сохраняется', () => {
  const counts = host(2, 1);
  const L = life({ cat: CAT, presence: { v: 1, mode: 'on-call' } }, { counts, display: LEGACY_DISPLAY });
  L.core.start();
  L.core.open('play', { source: 'call' });
  counts.set(9, 2);
  const late = saved(L, 'late');
  assert.deepEqual([late.reacted, late.celebrate, L.state().progress.unseen, L.json('cat').seenStage], [true, null, true, 0], 'позднее сохранение в игре — без праздника');
  L.core.close();
  assert.deepEqual([L.state().progress.unseen, L.json('cat').seenStage], [true, 0], 'закрыли — «новое» ждёт');
  L.core.open('play', { source: 'call' });
  const corner = L.core.open('corner');
  assert.deepEqual([corner.fresh, L.json('cat').seenStage, L.state().view], [['mug', 'notebook'], 2, { open: 'corner', source: 'call' }], 'явно показанный «Уголок» после вызова — увидена');
});

test('занятие при открытом уголке, ступень поднялась без праздника (без знака, скачок счёта) — увидена, fresh, как syncSheet 0.1.4; в «Поиграть», редакторе и закрытом — нет', () => {
  for (const [title, from, to, counted] of [
    ['без знака', 4, 9, false],
    ['скачок счёта 4 → 10', 4, 10, true],
  ]) {
    for (const view of ['corner', null, 'play', 'room']) {
      const counts = host(from, 1);
      const L = started({ cat: { v: 1, seenStage: 1, greetDay: DAY } }, { counts });
      if (view) L.core.open(view);
      counts.set(to, 2);
      const result = saved(L, `${title}-${view}`, { counted });
      const corner = view === 'corner';
      assert.deepEqual([result.celebrate, L.json('cat').seenStage, L.state().progress.unseen, L.effects('celebrate')], [null, corner ? 2 : 1, !corner, []], `${title}, вид ${view ?? 'закрыт'}: отметка`);
      assert.deepEqual(result.fresh, corner ? ['mug', 'notebook'] : [], `${title}, вид ${view ?? 'закрыт'}: «Новое в уголке»`);
      // Отмечено один раз: refresh при открытом уголке больше ничего не отмечает и не пишет.
      const writes = L.store.writes.length;
      if (corner) assert.deepEqual([L.core.refresh().fresh, L.store.writes.length], [[], writes]);
    }
  }
  // Праздник по-прежнему сам отмечает ступень (fresh пуст), непонятная — не отмечается и не переписывается.
  const counts = host(8, 1);
  const L = started({ cat: { v: 1, seenStage: 1, greetDay: DAY } }, { counts });
  L.core.open('corner');
  counts.set(9, 2);
  const party = saved(L, 'party');
  assert.deepEqual([party.celebrate, party.fresh, L.json('cat').seenStage], [2, [], 2]);
  const stored = { v: 3, seenStage: 'future-stage', greetDay: DAY, future: { a: 1 } };
  const odd = started({ cat: stored }, { counts: host(4, 1) });
  odd.core.open('corner');
  assert.deepEqual([saved(odd, 'odd', { counted: false }).fresh, odd.json('cat')], [[], stored]);
});

test('непонятная ступень не отмечается и не переписывается; понятная не понижается; открытие сверяет облик и счёт', () => {
  for (const odd of [8, 'future-stage']) {
    const stored = { v: 3, seenStage: odd, greetDay: DAY, future: { a: 1 } };
    const L = started({ cat: stored }, { counts: host(9, 1) });
    assert.deepEqual([L.core.open('corner').fresh, L.core.refresh().fresh, L.json('cat')], [[], [], stored], JSON.stringify(odd));
  }
  const high = started({ cat: { v: 1, seenStage: 3, greetDay: DAY } }, { counts: host(3, 1) });
  const writes = high.store.writes.length;
  assert.deepEqual([high.core.open('corner').fresh, high.json('cat').seenStage, high.store.writes.length], [[], 3, writes], 'увиденная выше — без записи');
  // Сверка при открытии: облик сохранён другой вкладкой без события, счёт сайта вырос — уголок видит свежие.
  const counts = host(1, 1);
  const L = started({ cat: CAT, look: { v: 1, cat: 'smoke' } }, { counts });
  L.put('look', { v: 1, cat: 'ginger' });
  counts.set(9, 2);
  const opened = L.core.open('corner');
  assert.deepEqual([L.state().look.coat, L.state().progress.marks, opened.fresh], ['ginger', 9, ['mug', 'notebook']]);
  assert.equal(L.seen.some((update) => update.reason === 'storage'), true, 'изменение другой вкладки — своим обновлением storage');
});

test('setPet: отображение рисует не всех — unsupported без изменений; без объявления — все зарегистрированные', () => {
  const L = started();
  L.core.setDisplay({ pets: ['cat'] });
  const state = L.state();
  assert.equal(L.core.setPet('dog').error.code, 'unsupported');
  assert.equal(L.state(), state);
  L.core.setDisplay({ pets: ['cat', 'dog'] });
  assert.equal(L.core.setPet('dog').ok, true);
  const bare = life({ cat: CAT }, { counts: host(1, 1) });
  bare.core.start();
  assert.equal(bare.core.setPet('dog').ok, true, 'pets не объявлено — разрешены все');
});

// ---------- К. Ключ presence через координатор ----------

test('presence: запись — свежее сохранённое как есть + режим; неизвестные поля и больший v остаются; повреждённое заменяет явная команда; неизвестный режим — always', () => {
  const L = started({ cat: CAT, presence: { v: 3, mode: 'nap', when: { from: '22:00' } } });
  assert.deepEqual([L.state().presence.mode, L.state().save.presence], ['always', { status: 'saved', pending: [], unsaved: [], corrupt: false }]);
  assert.equal(L.core.setPresence('on-call').save.status, 'saved');
  assert.deepEqual(L.json('presence'), { v: 3, mode: 'on-call', when: { from: '22:00' } });
  const broken = started({ cat: CAT, presence: '{' });
  assert.deepEqual([broken.state().save.presence.corrupt, broken.effects('warning').map((effect) => effect.key)], [true, ['presence']], 'повреждено — предупреждение и показ always');
  assert.equal(broken.raw('presence'), '{', 'неявно не трогается');
  broken.core.setPresence('on-call');
  assert.deepEqual(broken.json('presence'), { v: 1, mode: 'on-call' }, 'явная команда заменяет повреждённое');
});

test('presence: отказ чтения и записи — правка в памяти (failed, unsaved), уходит со следующей; отказ загрузки — unavailable, ни одной записи', () => {
  const L = started();
  L.store.denySet = new RegExp(L.keys.presence);
  const refused = L.core.setPresence('on-call');
  assert.deepEqual([refused.ok, refused.save.status, L.state().presence.mode, L.state().save.presence.unsaved], [true, 'failed', 'on-call', ['mode']]);
  L.store.denySet = null;
  L.core.setPresence('always');
  assert.deepEqual([L.json('presence'), L.state().save.presence.status], [{ v: 1, mode: 'always' }, 'saved']);
  const site = web({ presence: { v: 1, mode: 'on-call' } });
  site.store.denyGet = /./;
  assert.equal(site.storage.load(), 'failed');
  site.store.denyGet = null;
  const offline = createPetCore({ storage: site.storage, clock: calendar().port, random: series().port, scheduler: planner(calendar()).port, log: journal().port });
  offline.setDisplay(LEGACY_DISPLAY);
  offline.start();
  assert.deepEqual([offline.getState().presence.mode, offline.getState().save.presence.status], ['always', 'unavailable']);
  assert.equal(offline.setPresence('on-call').save.status, 'failed');
  assert.equal(site.store.writes.length, 0);
});

test('presence: чужая запись — тихо (без приветствия, записи и объявлений), поверхность и задачи по ней; сверка без события — до решения; запоздалое storage — без второго обновления', () => {
  const A = started();
  const B = life({}, { storage: A.storage, counts: host(1, 1), display: LEGACY_DISPLAY });
  B.core.start();
  const writes = A.store.writes.length;
  A.core.setPresence('on-call');
  assert.deepEqual([B.state().presence.surface, B.state().presence.around, B.plan.live().length], ['call', false, 1], 'B: лапка, ушёл — только полночь');
  assert.deepEqual([A.store.writes.length - writes, B.effects('announce'), A.json('cat').greetDay], [1, [], DAY], 'одна запись — автора; B не пишет и не приветствует');
  // Сверка перед решением: другая вкладка вернула «Всегда рядом», события ещё нет — notify решает по сохранённому.
  A.put('presence', { v: 1, mode: 'always' });
  const before = B.seen.length;
  assert.equal(saved(B, 'x').reacted, true, 'на виду по сверенному');
  assert.deepEqual(B.seen.slice(before).map((update) => update.reason), ['storage', 'notify']);
  const count = B.seen.length;
  A.events.fire(A.keys.presence);
  assert.equal(B.seen.length, count, 'запоздалое storage — без обновления');
});

test('presence асинхронно: pending до подтверждения, done; отказ — failed и unsaved; барьер load; запись, поставленная до destroy, выполняется', async () => {
  const store = manual();
  assert.equal(await store.load(), 'ready');
  const time = calendar();
  const plan = planner(time);
  const make = () => createPetCore({ storage: store.storage, clock: time.port, random: series().port, scheduler: plan.port, log: journal().port, progress: () => ({ marks: 1, today: 1 }) });
  const A = make();
  A.setDisplay(LEGACY_DISPLAY);
  A.start();
  await store.drain();
  const first = A.setPresence('on-call');
  assert.deepEqual([first.save.status, A.getState().save.presence.pending, A.getState().presence.mode], ['pending', ['mode'], 'on-call']);
  await store.next('get', 'presence');
  await store.next('set', 'presence');
  assert.deepEqual([await first.save.done, A.getState().save.presence.status, store.json('presence')], ['saved', 'saved', { v: 1, mode: 'on-call' }]);
  const second = A.setPresence('always');
  await store.next('get', 'presence');
  await store.next('set', 'presence', 'fail');
  assert.deepEqual([await second.save.done, A.getState().save.presence.unsaved, A.getState().presence.mode], ['failed', ['mode'], 'always']);
  const third = A.setPresence('on-call');
  A.destroy();
  await store.drain();
  assert.deepEqual([await third.save.done, store.json('presence').mode], ['saved', 'on-call'], 'поставленная до destroy — выполнена');
  const loaded = store.storage.load();
  await store.drain();
  assert.equal(await loaded, 'ready');
  const B = make();
  assert.deepEqual(B.getState().presence.mode, 'on-call', 'новое ядро после барьера — подтверждённое');
  await flush();
});
