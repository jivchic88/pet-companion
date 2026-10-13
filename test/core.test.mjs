// Ядро PL03 в Node (docs/ARCHITECTURE.md § 4–6, § 14.1): создание и проверка настроек, start, destroy, порты, снимок и
// подписка, ошибки аргументов; решения среза — счёт и ступени, первое включение, подтверждённое занятие, лакомство,
// приветствие; сохранность PL02 через настоящие команды и повторное подключение. Хранилище — синхронный веб-координатор с
// подменённым localStorage (test/core-kit.mjs); асинхронный путь и сценарии хранения — test/core-storage.test.mjs,
// раунд доставки — test/core-round.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPetCore, PetError } from '../pet/core/index.mjs';
import { clock, DAY, host, idle, journal, make, spy, web } from './core-kit.mjs';

const SEEN = { around: true };
const started = (initial = {}, parts = {}) => {
  const site = web(initial);
  assert.equal(site.storage.load(), 'ready');
  const made = make(site.storage, parts);
  return { ...site, ...made };
};

test('создание: настройки проверяются до подключения; хранилище не загружено — storage-not-loaded', () => {
  const site = web();
  const list = [];
  const watched = spy(site.storage, list);
  assert.throws(() => createPetCore({ storage: watched }), (error) => error instanceof PetError && error.code === 'storage-not-loaded');
  site.storage.load();
  const bad = [null, 5, {}, { storage: {} }, { storage: watched, extra: 1 }, { storage: watched, progress: 1 }, { storage: watched, clock: { now: () => 0 } }, { storage: watched, random: 'x' }, { storage: watched, scheduler: {} }, { storage: watched, log: { warn: 1 } }];
  for (const options of bad) assert.throws(() => createPetCore(options), (error) => error instanceof PetError && error.code === 'invalid-options', JSON.stringify(options));
  assert.deepEqual(list, [], 'ни при одной ошибке координатор не получил подключения');
  createPetCore({ storage: watched });
  assert.deepEqual(list, ['connect c1'], 'корректное создание — одно своё подключение');
});

test('создание без побочных действий: не пишет, не вызывает порты и progress(); снимок — сохранённое, счёт до первого чтения — null', () => {
  const site = web({ cat: { v: 1, name: 'Барсик', seenStage: -1 } });
  site.storage.load();
  const quiet = idle();
  const { core, counts, time, log } = make(site.storage, { quiet });
  const state = core.getState();
  assert.deepEqual({ writes: site.store.writes.length, progress: counts.state.calls, clock: time.state.calls, log: log.list.length, ...quiet.calls }, { writes: 0, progress: 0, clock: 0, log: 0, random: 0, scheduler: 0 });
  assert.equal(state.status, 'created');
  assert.equal(state.progress, null);
  assert.equal(state.treat, null);
  assert.equal(state.name.display, 'Барсик');
  assert.equal(state.storage, 'ready');
  assert.equal(core.getState(), state, 'стабильная ссылка');
});

test('start: один раз — первое включение молча и приветствие дня; повторный — already-started; до start портов random и scheduler нет, запуск планирует задачи PL04.1', () => {
  const quiet = idle();
  const { core, json, store } = started({}, { counts: host(9, 0), quiet });
  // До start команды меняют состояние, реакций нет.
  assert.equal(core.setName('Пух').save.status, 'saved');
  const early = core.notify('saved', { key: 'e', counted: true }, SEEN);
  assert.deepEqual([early.ok, early.reacted, early.reaction], [true, false, null]);
  assert.deepEqual(quiet.calls, { random: 0, scheduler: 0 }, 'до start — ни задач, ни случайности');
  const result = core.start(SEEN);
  assert.deepEqual([result.ok, result.greet], [true, { day: DAY, welcome: false }]);
  assert.deepEqual(json('cat'), { v: 1, name: 'Пух', seenStage: 2, greetDay: DAY }, 'первое включение (9 знаков — «Наш ритуал») и день приветствия');
  const state = core.getState();
  assert.deepEqual([state.status, state.progress.stage, state.progress.unseen, state.progress.fresh], ['running', 2, false, []], 'история без праздника');
  const writes = store.writes.length;
  const planned = { ...quiet.calls };
  assert.ok(planned.scheduler >= 5 && planned.random >= 2, `запуск: покой, полночь и приветствие — задачи, интервалы — random: ${JSON.stringify(planned)}`);
  assert.equal(core.start(SEEN).error.code, 'already-started');
  assert.equal(store.writes.length, writes);
  assert.deepEqual(quiet.calls, planned, 'повторный start ничего не планирует');
});

test('destroy: синхронно и идемпотентно; последнее обновление — destroyed; команды — destroyed без эффектов; снимок стабилен', () => {
  const { core, store } = started();
  core.start(SEEN);
  const got = [];
  core.subscribe((update) => got.push(update.reason), { initial: false });
  core.destroy();
  core.destroy();
  assert.deepEqual(got, ['destroyed']);
  const dead = core.getState();
  assert.equal(dead.status, 'destroyed');
  assert.ok(Object.isFrozen(dead) && Object.isFrozen(dead.pets.cat));
  assert.equal(core.getState(), dead);
  const writes = store.writes.length;
  const calls = [core.start(SEEN), core.setName('x'), core.setPet('dog'), core.setAppearance({ coat: 'ginger' }), core.setPreferences({ motion: 'calm' }), core.hide(), core.show(), core.feed(SEEN), core.notify('failed', null, SEEN), core.refresh(), core.markSeen()];
  assert.ok(calls.every((result) => result.ok === false && result.error.code === 'destroyed'));
  assert.equal(store.writes.length, writes);
  assert.deepEqual(got, ['destroyed'], 'после destroy слушатели ничего не получают');
  const late = [];
  core.subscribe((update) => late.push(`${update.reason} ${update.snapshot.status}`))();
  core.subscribe(() => late.push('лишнее'), { initial: false });
  assert.deepEqual(late, ['destroyed destroyed'], 'subscribe после destroy — один снимок destroyed');
});

test('снимок: простые данные, глубоко заморожен, та же ссылка без изменений, новый после изменения', () => {
  const { core } = started({}, { counts: host(3, 1) });
  core.start(SEEN);
  const state = core.getState();
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state, 'без функций и DOM');
  const frozen = (value) => !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(frozen));
  assert.ok(frozen(state));
  assert.throws(() => {
    'use strict';
    state.pets.cat.name.value = 'взлом';
  }, TypeError);
  assert.equal(core.refresh().changed, false);
  assert.equal(core.getState(), state, 'ничего не изменилось — та же ссылка');
  core.setName('Дымок');
  assert.notEqual(core.getState(), state);
  assert.equal(state.name.display, 'Марс', 'переданный снимок не меняется задним числом');
  assert.equal(core.getState().name.display, 'Дымок');
});

test('подписка: initial синхронно до возврата; initial: false; отписка немедленная; исключение слушателя — журнал, остальные получают', () => {
  const { core, log } = started();
  core.start(SEEN);
  const list = [];
  core.subscribe((update) => list.push(`a ${update.reason}`));
  assert.deepEqual(list, ['a initial']);
  let offB = null;
  core.subscribe(() => {
    list.push('бросает');
    throw new Error('слушатель упал');
  }, { initial: false });
  offB = core.subscribe((update) => list.push(`b ${update.reason}`), { initial: false });
  core.subscribe((update) => {
    list.push(`c ${update.reason}`);
    offB();
  }, { initial: false });
  core.setName('Дымок');
  assert.deepEqual(list, ['a initial', 'a setName', 'бросает', 'b setName', 'c setName']);
  core.setName('Пух');
  assert.deepEqual(list.slice(5), ['a setName', 'бросает', 'c setName'], 'отписанный не получает; бросивший остался подписан');
  assert.equal(log.list.filter((line) => line.startsWith('исключение подписчика')).length, 2);
});

test('два ядра на одном координаторе: память и подписки свои, правка одного поглощается другим', () => {
  const site = web();
  site.storage.load();
  const a = make(site.storage);
  const b = make(site.storage);
  a.core.start(SEEN);
  b.core.start(SEEN);
  const got = { a: [], b: [] };
  a.core.subscribe((update) => got.a.push(update.reason), { initial: false });
  b.core.subscribe((update) => got.b.push(update.reason), { initial: false });
  site.store.denySet = /:cat:/;
  a.core.setName('Дымок');
  assert.deepEqual([a.core.getState().name.display, a.core.getState().save.cat.status], ['Дымок', 'failed'], 'несохранённое — у A');
  assert.deepEqual([b.core.getState().name.display, b.core.getState().save.cat.status], ['Марс', 'saved'], 'у B своей памяти несохранённого нет');
  site.store.denySet = null;
  b.core.setPreferences({ motion: 'calm' });
  assert.deepEqual(site.json('cat').name, undefined, 'несохранённое A не уходит с правкой B');
  assert.deepEqual([got.a, got.b], [['setName', 'storage'], ['setPreferences']], 'отказ A не поглощается B; запись B поглотил A');
  assert.equal(a.core.getState().prefs.motion, 'calm');
});

test('ошибки аргументов и бизнес-отказы: ok: false, снимок и хранилище без изменений', () => {
  const { core, store } = started({}, { counts: host(3, 1) });
  core.start(SEEN);
  const state = core.getState();
  const writes = store.writes.length;
  const cases = [
    [core.setName(5), 'invalid-argument'],
    [core.setPet(5), 'invalid-argument'],
    [core.setPet('example.fox'), 'unknown-id'],
    [core.setAppearance({}), 'invalid-argument'],
    [core.setAppearance({ coat: 1 }), 'invalid-argument'],
    [core.setAppearance({ coat: 'spotted' }), 'unknown-id'],
    [core.setAppearance({ accessory: 'crown' }), 'unknown-id'],
    [core.setAppearance({ coat: 'ginger', accessory: 'badge' }), 'locked'],
    [core.setPreferences({ motion: 'fast' }), 'invalid-argument'],
    [core.setPreferences({ phrases: 'да' }), 'invalid-argument'],
    [core.notify('done', null, SEEN), 'invalid-argument'],
    [core.notify('saved', { key: 1 }, SEEN), 'invalid-argument'],
    [core.notify('saved', { key: 'k', counted: 'да' }, SEEN), 'invalid-argument'],
    [core.notify('saved', { key: 'k' }, { around: 'да' }), 'invalid-argument'],
    [core.feed({ view: 'kitchen' }), 'invalid-argument'],
  ];
  for (const [result, code] of cases) assert.deepEqual([result.ok, result.error.code], [false, code], JSON.stringify(result));
  assert.equal(core.getState(), state);
  assert.equal(store.writes.length, writes);
  assert.equal(core.getState().look.coat, 'smoke', 'неполная правка (coat верный, accessory закрыт) не применена частично');
});

test('ступени 0, 3, 9, 18, 30: первое подключение молча; праздник только ступени, открытой этим занятием, — с вещами, продолжением и отметкой', () => {
  const counts = host(0, 0);
  const { core, json } = started({}, { counts });
  core.start(SEEN);
  const stages = [0, 3, 9, 18, 30].map((marks) => {
    counts.set(marks);
    core.refresh();
    return core.getState().progress.stage;
  });
  assert.deepEqual(stages, [0, 1, 2, 3, 4]);
  // Второе ядро на 8 знаках: «Освоился» отмечена молча; 9-й знак открывает «Наш ритуал» — праздник.
  const site = web();
  site.storage.load();
  const marks = host(8, 0);
  const second = make(site.storage, { counts: marks });
  const announced = [];
  // Сигналы конвейеру сценки (PL04.1) — не решение праздника.
  second.core.subscribe((update) => announced.push(...update.effects.filter((effect) => effect.type !== 'save' && effect.type !== 'scene')), { initial: false });
  second.core.start(SEEN);
  assert.equal(site.json('cat').seenStage, 1);
  marks.set(9, 1);
  const joy = second.core.notify('saved', { key: 'k9', counted: true }, SEEN);
  assert.equal(joy.celebrate, 2);
  assert.deepEqual(joy.reaction, { type: 'joy', key: 'entry:k9', extra: { follow: { type: 'unlock', extra: { tryOn: '', mini: 'mug', phrases: 'unlock' } } } });
  assert.equal(site.json('cat').seenStage, 2, 'отметка увиденной — сразу');
  assert.deepEqual(announced, [{ type: 'celebrate', stage: 2, items: ['mug', 'notebook'], accessories: [] }, { type: 'announce', text: 'Марс: открыта ступень «Наш ритуал» — кружка и блокнот.' }]);
  // Повтор занятия на той же ступени — без праздника; трудное — поддержка.
  marks.set(10, 2);
  const again = second.core.notify('saved', { key: 'k10', counted: true, hard: true }, SEEN);
  assert.deepEqual([again.celebrate, again.reaction.type], [null, 'support']);
  // Не counted — знака нет, праздника нет.
  assert.equal(second.core.notify('saved', { key: 'k11' }, SEEN).celebrate, null);
  assert.equal(json('cat').seenStage, 0, 'первое ядро: молчаливое первое включение на 0 знаков');
});

test('подтверждённое занятие: «Освоился» — примерка платка; собака на «Нашем ритуале» — мячик; first и готовое лакомство — подсказка про миску', () => {
  const counts = host(2, 0);
  const { core } = started({}, { counts });
  core.start(SEEN);
  counts.set(3, 1);
  const plaid = core.notify('saved', { key: 'p', counted: true, first: true }, SEEN);
  assert.deepEqual(plaid.reaction.extra, { phrases: 'joyTreat', follow: { type: 'unlock', extra: { tryOn: 'plaid', mini: '', phrases: 'plaid' } } });
  const dogCounts = host(8, 0);
  const dog = started({ companion: { v: 1, kind: 'dog' } }, { counts: dogCounts });
  dog.core.start(SEEN);
  dogCounts.set(9, 1);
  assert.deepEqual(dog.core.notify('saved', { key: 'd', counted: true }, SEEN).reaction.extra.follow.extra, { tryOn: '', mini: 'ball', phrases: 'unlock' });
  // Лакомство уже съедено — подсказки нет.
  dogCounts.set(10, 2);
  dog.core.feed(SEEN);
  assert.equal(dog.core.notify('saved', { key: 'd2', counted: true, first: true }, SEEN).reaction.extra.phrases, undefined);
});

test('подтверждённое занятие: null, спрятан, не на виду — только числа; «Поиграть» и редактор — без праздника и отметки (её даст markSeen)', () => {
  const counts = host(2, 0);
  const { core, json } = started({}, { counts });
  core.start(SEEN);
  counts.set(3, 1);
  const quiet = core.notify('saved', null, SEEN);
  assert.deepEqual([quiet.reacted, quiet.reaction, core.getState().progress.marks], [false, null, 3], 'null — только числа');
  assert.equal(json('cat').seenStage, 0);
  counts.set(9, 2);
  const away = core.notify('saved', { key: 'a', counted: true }, { around: false });
  assert.deepEqual([away.reacted, away.celebrate, json('cat').seenStage], [false, null, 0], '«по зову» и не вызван — без праздника и отметки');
  assert.equal(core.getState().progress.unseen, true, 'новая ступень ждёт уголка');
  core.hide();
  counts.set(18, 3);
  assert.equal(core.notify('saved', { key: 'h', counted: true }, SEEN).reacted, false, 'спрятан');
  core.show();
  counts.set(19, 4);
  const play = core.notify('saved', { key: 'pl', counted: true }, { around: true, view: 'play' });
  assert.deepEqual([play.reacted, play.celebrate, play.scene.stage, json('cat').seenStage], [true, null, null, 0], '18→19 не открывает ступень');
  counts.set(29, 5);
  core.refresh();
  counts.set(30, 6);
  const room = core.notify('saved', { key: 'r', counted: true }, { around: true, view: 'room' });
  assert.deepEqual([room.celebrate, room.scene.stage, json('cat').seenStage], [null, 4, 0], 'в редакторе — без праздника; сценке — ступень события');
  assert.deepEqual(core.getState().progress.fresh, ['mug', 'notebook', 'bed', 'lamp', 'plant', 'board']);
  assert.equal(core.markSeen().changed, true);
  assert.deepEqual([json('cat').seenStage, core.getState().progress.unseen], [4, false]);
  assert.equal(core.markSeen().changed, false);
});

test('notify failed: нейтральное ожидание; спрятан или не на виду — ничего; до start — ничего', () => {
  const { core } = started();
  assert.equal(core.notify('failed', null, SEEN).reaction, null, 'до start');
  core.start(SEEN);
  assert.deepEqual(core.notify('failed', null, SEEN).reaction, { type: 'wait' });
  assert.equal(core.notify('failed', null, { around: false }).reaction, null);
  core.hide();
  assert.equal(core.notify('failed', null, SEEN).reaction, null);
});

test('лакомство: день — заново; одно в день, общее для кота и собаки; отметка и запись до реакции; синхронный итог — в объявлении', () => {
  const counts = host(0, 0);
  const time = clock();
  const { core, json, store, keys } = started({}, { counts, time });
  core.start(SEEN);
  const state = core.getState();
  assert.deepEqual([core.feed(SEEN).error.code, core.getState()], ['treat-waiting', state], 'до занятия — отказ без изменений');
  counts.set(1, 1);
  const said = [];
  core.subscribe((update) => said.push(...update.effects.filter((effect) => effect.type === 'announce').map((effect) => effect.text)), { initial: false });
  const fed = core.feed(SEEN);
  assert.deepEqual([fed.ok, fed.save.status, fed.reaction.key, json('treat'), core.getState().treat], [true, 'saved', `feed:${DAY}`, { v: 1, fedDay: DAY }, 'fed']);
  assert.deepEqual(said, ['Марс получает лакомство. Сегодня уже угостили.']);
  assert.equal(core.feed(SEEN).error.code, 'treat-fed');
  core.setPet('dog');
  assert.equal(core.feed(SEEN).error.code, 'treat-fed', 'общее для кота и собаки');
  assert.equal(core.feed({ around: false }).error.code, 'away');
  // Новый местный день: лакомство снова ждёт занятия.
  time.state.day = '2026-10-14';
  counts.set(1, 0);
  core.refresh();
  assert.equal(core.getState().treat, 'waiting');
  counts.set(2, 1);
  store.denySet = new RegExp(keys.treat);
  const lost = core.feed(SEEN);
  assert.deepEqual([lost.ok, lost.save.status, core.getState().treat, core.getState().save.treat.status], [true, 'failed', 'fed', 'failed'], 'отказ записи: отметка в памяти, второго лакомства нет');
  assert.equal(said.at(-1), 'Тоби получает лакомство. Сегодня уже угостили, но отметка не сохранилась в этом браузере.');
  assert.equal(core.feed(SEEN).error.code, 'treat-fed');
  core.hide();
  assert.equal(core.feed(SEEN).error.code, 'hidden');
});

test('приветствие: раз в местный день; после паузы ≥ 2 дней — welcome; спрятан или «по зову» — нет; непонятный день заменяется', () => {
  const site = web({ cat: { v: 3, greetDay: '2026-10-10', future: 1, seenStage: 0 } });
  site.storage.load();
  const first = make(site.storage).core.start(SEEN);
  assert.deepEqual(first.greet, { day: DAY, welcome: true });
  assert.deepEqual(site.json('cat'), { v: 3, greetDay: DAY, future: 1, seenStage: 0 });
  const writes = site.store.writes.length;
  assert.equal(make(site.storage).core.start(SEEN).greet, null, 'тот же день — без приветствия и записи');
  assert.equal(site.store.writes.length, writes);
  const day = (greetDay) => {
    const one = web({ cat: { v: 1, seenStage: 0, greetDay } });
    one.storage.load();
    return { greet: make(one.storage).core.start(SEEN).greet, cat: one.json('cat') };
  };
  assert.deepEqual(day('2026-10-12').greet, { day: DAY, welcome: false });
  assert.deepEqual(day('2026-10-11').greet, { day: DAY, welcome: true });
  const odd = day('когда-то');
  assert.deepEqual([odd.greet, odd.cat.greetDay], [{ day: DAY, welcome: false }, DAY], 'день приветствия — заменяемое поле');
  const hidden = web({ cat: { v: 1, hidden: true, seenStage: 0 } });
  hidden.storage.load();
  assert.equal(make(hidden.storage).core.start(SEEN).greet, null);
  assert.equal(hidden.json('cat').greetDay, undefined);
  const call = web({ cat: { v: 1, seenStage: 0 } });
  call.storage.load();
  assert.equal(make(call.storage).core.start({ around: false }).greet, null, '«по зову» — без приветствия');
  // Повреждённый ключ: решение приветствия есть, неявная запись его не заменяет.
  const broken = web({ cat: '{' });
  broken.storage.load();
  const core = make(broken.storage).core;
  assert.notEqual(core.start(SEEN).greet, null);
  assert.deepEqual([broken.raw('cat'), broken.store.writes.length], ['{', 0]);
  assert.deepEqual(core.getState().save.cat, { status: 'failed', pending: [], unsaved: ['seenStage', 'greetDay'], corrupt: true });
});

test('PL02 через команды: неизвестные поля, вложенные данные, непонятные значения, другое животное и больший v сохраняются', () => {
  const seed = {
    cat: { v: 3, name: 'Барсик', accessory: 'crown', motion: 'turbo', future: { deep: [1] } },
    companion: { v: 2, kind: 'example.bunny', dog: { name: 'Рекс', accessory: 'crown', bow: { color: 'red' } }, pets: { 'example.bunny': { name: 'Пух' } }, extra: 1 },
    look: { v: 2, cat: 'calico', dog: 'merle', bunny: 'snow' },
    treat: { v: 2, fedDay: '2026-10-01', streak: { n: 2 } },
  };
  const counts = host(3, 1);
  const { core, json, storage, store } = started(seed, { counts });
  core.start(SEEN);
  assert.deepEqual(json('cat'), { ...seed.cat, seenStage: 1, greetDay: DAY });
  const state = core.getState();
  assert.deepEqual([state.pet, state.look.coat, state.name.display, state.look.accessory], [{ id: 'example.bunny', shown: 'cat', available: false }, 'smoke', 'Барсик', 'scarf'], 'непонятное — безопасный показ');
  core.setName('Дымок');
  core.setPreferences({ motion: 'calm' });
  core.setAppearance({ accessory: 'plaid' });
  assert.deepEqual(json('cat'), { ...seed.cat, seenStage: 1, greetDay: DAY, name: 'Дымок', motion: 'calm', accessory: 'plaid' });
  core.feed(SEEN);
  assert.deepEqual(json('treat'), { ...seed.treat, fedDay: DAY });
  core.setAppearance({ coat: 'ginger' });
  assert.deepEqual(json('look'), { ...seed.look, cat: 'ginger' });
  assert.deepEqual(json('companion'), seed.companion, 'выбор не меняли — неизвестный вид остаётся');
  core.setPet('dog');
  core.setName('Барклий');
  core.setAppearance({ coat: 'spotted' });
  assert.deepEqual(json('companion'), { ...seed.companion, kind: 'dog', dog: { ...seed.companion.dog, name: 'Барклий' } });
  assert.deepEqual(json('look'), { ...seed.look, cat: 'ginger', dog: 'spotted' });
  core.hide();
  core.show();
  assert.equal(json('cat').hidden, false);
  // Повторное подключение: подтверждённое, без записей.
  core.destroy();
  const writes = store.writes.length;
  assert.equal(storage.load(), 'ready');
  const again = make(storage, { counts }).core;
  again.start(SEEN);
  assert.deepEqual([again.getState().pet.shown, again.getState().name.display, again.getState().look.coat, again.getState().treat], ['dog', 'Барклий', 'spotted', 'fed']);
  assert.equal(store.writes.length, writes, 'повторное подключение и запуск в тот же день ничего не пишут');
});

for (const odd of [8, 'future-stage']) {
  test(`непонятная увиденная ступень ${JSON.stringify(odd)}: подключение, занятие, отметка, refresh и явные правки её не трогают`, () => {
    const stored = { v: 3, name: 'Марс', accessory: 'crown', seenStage: odd, greetDay: DAY, future: { a: 1 } };
    const counts = host(2, 0);
    const { core, json, store, keys } = started({ cat: stored }, { counts });
    core.start(SEEN);
    assert.deepEqual([store.writes.filter((key) => key === keys.cat).length, json('cat')], [0, stored], 'подключение ничего не пишет');
    assert.deepEqual([core.getState().progress.seenKnown, core.getState().progress.seenStage], [false, -1]);
    counts.set(3, 1);
    const result = core.notify('saved', { key: 'u', counted: true }, SEEN);
    assert.deepEqual([result.reacted, result.celebrate, core.getState().progress.unseen, core.getState().progress.stage], [true, null, false, 1], 'вещи по знакам, без праздника и «нового»');
    counts.set(9, 2);
    core.refresh();
    assert.equal(core.markSeen().changed, false);
    assert.deepEqual(json('cat'), stored);
    core.setName('Дымок');
    core.setPreferences({ motion: 'calm' });
    assert.deepEqual(json('cat'), { ...stored, name: 'Дымок', motion: 'calm' });
  });

  test(`непонятная ступень ${JSON.stringify(odd)} после отказа: память правок не уносит ступень; событие другой вкладки её забывает`, () => {
    const counts = host(3, 1);
    const site = started({ cat: { v: 1, seenStage: 0, greetDay: DAY } }, { counts });
    site.core.start(SEEN);
    site.store.denyGet = new RegExp(site.keys.cat);
    assert.equal(site.core.markSeen().save.status, 'failed', 'отказ свежего чтения — правка в памяти');
    assert.deepEqual(site.core.getState().save.cat.unsaved, ['seenStage']);
    site.store.denyGet = null;
    const restored = { v: 3, name: 'Марс', seenStage: odd, greetDay: DAY, future: { a: 1 } };
    site.put('cat', restored); // сайт восстановил на этой же странице — события нет
    site.core.setName('Дымок');
    assert.deepEqual(site.json('cat'), { ...restored, name: 'Дымок' }, 'явное имя пишет своё, ступень на месте');
    assert.deepEqual(site.core.getState().save.cat, { status: 'saved', pending: [], unsaved: [], corrupt: false });
    // Другая вкладка: отказ, затем внешнее неизвестное значение с событием — несохранённое забыто.
    const other = started({ cat: { v: 1, seenStage: 0, greetDay: DAY } }, { counts: host(3, 1) });
    other.core.start(SEEN);
    other.store.denySet = new RegExp(other.keys.cat);
    other.core.markSeen();
    other.store.denySet = null;
    other.put('cat', restored);
    other.events.fire(other.keys.cat);
    assert.deepEqual(other.core.getState().save.cat.unsaved, [], 'вытеснено подтверждённым');
    other.core.setPreferences({ motion: 'calm' });
    assert.deepEqual(other.json('cat'), { ...restored, motion: 'calm' });
    // Новое подключение и уголок — ничего не пишут.
    other.core.destroy();
    other.storage.load();
    const writes = other.store.writes.length;
    const again = make(other.storage, { counts: host(9, 2) }).core;
    again.start(SEEN);
    again.markSeen();
    assert.equal(other.store.writes.length, writes);
  });
}

test('известная ступень правкой из памяти не понижается; нет ключа, нет поля, -1 — молчаливое первое включение', () => {
  for (const start of [undefined, { v: 2, name: 'Барсик', greetDay: DAY, future: 1 }, { v: 1, seenStage: -1, greetDay: DAY }]) {
    const counts = host(9, 0);
    const site = started(start ? { cat: start } : {}, { counts });
    site.core.start(SEEN);
    assert.equal(site.json('cat').seenStage, 2, JSON.stringify(start));
    counts.set(18, 1);
    assert.equal(site.core.notify('saved', { key: 'n', counted: true }, SEEN).celebrate, 3);
    assert.equal(site.json('cat').seenStage, 3);
  }
  const counts = host(3, 1);
  const site = started({ cat: { v: 1, seenStage: 0, greetDay: DAY } }, { counts });
  site.core.start(SEEN);
  site.store.denySet = new RegExp(site.keys.cat);
  site.core.markSeen(); // в памяти — 1
  site.store.denySet = null;
  site.put('cat', { v: 1, seenStage: 3, greetDay: DAY }); // выше, без события
  site.core.setName('Дымок');
  assert.deepEqual(site.json('cat'), { v: 1, seenStage: 3, greetDay: DAY, name: 'Дымок' });
});

test('четыре случая чтения: нет ключа — запись; повреждено — неявные не пишут, явная заменяет свой ключ; отказ загрузки — ни одной записи', () => {
  const missing = started({}, { counts: host(3, 1) });
  missing.core.start(SEEN);
  assert.deepEqual(missing.json('cat'), { v: 1, seenStage: 1, greetDay: DAY });
  for (const value of ['', '{', '[1]', '"текст"', '42', 'null']) {
    const counts = host(2, 0);
    const site = started({ cat: value, companion: value, look: value, treat: value }, { counts });
    const warned = [];
    site.core.subscribe((update) => warned.push(...update.effects.filter((effect) => effect.type === 'warning').map((effect) => effect.key)), { initial: false });
    site.core.start(SEEN);
    counts.set(3, 1);
    site.core.notify('saved', { key: 'c', counted: true }, SEEN);
    site.core.markSeen();
    assert.deepEqual([site.store.writes.length, warned], [0, ['cat', 'companion', 'look', 'treat']], JSON.stringify(value));
    assert.ok(['cat', 'companion', 'look', 'treat'].every((key) => site.core.getState().save[key].corrupt));
    site.core.setName('Мурзик');
    assert.deepEqual(site.json('cat'), { v: 1, seenStage: 1, greetDay: DAY, name: 'Мурзик' }, 'явное имя — с неявными полями из памяти');
    site.core.setAppearance({ coat: 'ginger' });
    assert.deepEqual([site.json('look'), site.raw('companion'), site.raw('treat')], [{ v: 1, cat: 'ginger' }, value, value]);
  }
  // Отказ загрузки: память и unavailable; ни одной записи, даже когда чтение вернулось; новое подключение — оригинал.
  const original = { cat: { v: 1, name: 'Барсик', seenStage: 0, greetDay: '2026-10-01' }, look: { v: 1, cat: 'tuxedo' } };
  const site = web(original);
  site.store.denyGet = /./;
  assert.equal(site.storage.load(), 'failed');
  site.store.denyGet = null;
  const offline = make(site.storage, { counts: host(3, 1) }).core;
  offline.start(SEEN);
  assert.deepEqual([offline.getState().storage, offline.getState().name.display, offline.getState().save.cat.status], ['failed', 'Марс', 'unavailable']);
  assert.equal(offline.setName('Дымок').save.status, 'failed');
  offline.setAppearance({ coat: 'ginger' });
  offline.feed(SEEN);
  site.put('cat', { ...original.cat, name: 'Пиксель' });
  site.events.fire(site.keys.cat);
  assert.deepEqual([offline.getState().name.display, site.store.writes.length], ['Дымок', 0], 'чужие записи не читает, своих не делает');
  offline.destroy();
  assert.equal(site.storage.load(), 'ready');
  const fresh = make(site.storage, { counts: host(3, 1) }).core;
  assert.deepEqual([fresh.getState().name.display, fresh.getState().look.coat], ['Пиксель', 'tuxedo']);
});

test('повторное подключение: несохранённые правки прежнего не наследуются; подтверждённое — да', () => {
  const site = started();
  site.core.start(SEEN);
  site.store.denySet = new RegExp(site.keys.cat);
  site.core.setName('Дымок');
  site.store.denySet = null;
  site.core.setAppearance({ coat: 'ginger' });
  site.core.destroy();
  site.storage.load();
  const again = make(site.storage).core;
  assert.deepEqual([again.getState().name.display, again.getState().look.coat, again.getState().save.cat.unsaved], ['Марс', 'ginger', []]);
});

test('внутренний сбой до применения: progress() бросил, clock.day — не дата → internal, ничего не изменилось, журнал', () => {
  let failing = false;
  const site = web();
  site.storage.load();
  const log = journal();
  const time = clock();
  const progress = () => {
    if (failing) throw new Error('сайт упал');
    return { marks: 3, today: 1 };
  };
  const quiet = idle();
  const core = createPetCore({ storage: site.storage, progress, clock: time.port, log: log.port, random: quiet.random, scheduler: quiet.scheduler });
  core.start(SEEN);
  const state = core.getState();
  const writes = site.store.writes.length;
  failing = true;
  for (const result of [core.refresh(), core.notify('saved', { key: 'x', counted: true }, SEEN), core.feed(SEEN)]) assert.deepEqual([result.ok, result.error.code], [false, 'internal'], JSON.stringify(result));
  failing = false;
  time.state.day = 'завтра';
  assert.equal(core.refresh().error.code, 'internal');
  assert.equal(core.getState(), state, 'снимок прежний');
  assert.equal(site.store.writes.length, writes);
  assert.deepEqual(log.list, ['сбой команды refresh: сайт упал', 'сбой команды notify: сайт упал', 'сбой команды feed: сайт упал', 'сбой команды refresh: clock.day вернул не местную дату ГГГГ-ММ-ДД: завтра']);
});
