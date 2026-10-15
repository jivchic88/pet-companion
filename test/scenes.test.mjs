// Редкие сценки после занятия (правила — pet/core/scenes.mjs, транзакция IndexedDB — pet/web/scenes.mjs; здесь через
// реэкспорт pet/pet-rules.mjs: pickScene, sceneFits, sceneWaited, sceneCommit, sceneTurn; конвейер попытки в ядре —
// test/core-scenes.test.mjs и test/core-reserve.test.mjs; рисунок —
// pet/pet.css, pet/dog.css, pet/dog-art.mjs): только подтверждённое сайтом занятие без праздника ступени; шанс 25% с
// точной границей; одна попытка на событие; одна показанная сценка за местный день — общая для кота и собаки и для
// вкладок: проверка и запись дня — одной транзакцией IndexedDB вместе с началом показа (отмена до него ничего не пишет;
// вкладка, ждущая очереди, видит запись другой); полночь между сохранением и показом — без сценки; реакция сохранения,
// ждавшая ввода, диктовки или таймера, сценку не переносит; кот не повторяет прошлый вариант; клубок не в портрете;
// тишина, скрытая вкладка, «Поиграть», перенос и срок 10 с — без показа; режиссёр: сценка не ждёт в очереди, любая
// реакция её сменяет; повреждённое и недоступное хранение — без сценки и без сбоя; анимации — только transform и opacity.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as R from './legacy-rules.mjs';
import { dogSvg } from '../pet/dog-art.mjs';
import { fakeIdb } from './core-kit.mjs';

const repo = (file) => new URL(`../${file}`, import.meta.url);
const DB = R.storageKeys('site').db;
const DAY = '2026-10-10';
// Случайность — по очереди значений; лишний вызов — ошибка теста.
const randoms = (...values) => () => {
  assert.ok(values.length, 'лишний вызов random');
  return values.shift();
};
const never = () => assert.fail('random не должен вызываться');
// Подтверждённое сайтом занятие (notify('saved', { key, counted: true })), после которого у сайта marks знаков, — как
// pet.mjs (doneOutcome): outcome и праздник.
const saved = (key, marks, seenStage = 0) => {
  const outcome = R.doneOutcome({ counted: true }, marks);
  return { key, outcome, celebrate: R.stageToCelebrate(outcome, seenStage), day: DAY };
};
// Очередь событий: дать отработать всему, что уже запланировано.
const turn = () => new Promise((resolve) => setImmediate(resolve));
// IndexedDB на память — по контракту браузера (test/core-kit.mjs fakeIdb): readwrite-транзакции одного хранилища идут строго
// по очереди, следующая видит запись предыдущей; tab({ name, gate }) — чтение вкладки ждёт шлюза при открытой транзакции.
const idbBackend = () => fakeIdb(DB);
// Попытка показа вкладки by (как sceneSoon в pet/pet.mjs): решение — sceneCommit по записи в базе, показ — в shows.
const attempt = (idb, by, shows, extra = {}) =>
  R.sceneTurn(
    idb,
    DB,
    (stored) => R.sceneCommit(stored, extra.mirror ?? null, { day: DAY, today: DAY, by, kind: 'cat', type: 'curl', fits: true, ...extra }),
    () => shows.push(by),
  );

test('праздник новой ступени важнее: сохранение, открывшее ступень, сценки не даёт; ступень, увиденная раньше, — не мешает', () => {
  // Два знака уже есть, третье занятие — третий знак.
  const opened = saved('a3', 3, 0);
  assert.equal(opened.celebrate, 1, 'третий знак открывает «Освоился»');
  assert.equal(R.pickScene({ ...opened, checked: new Set(), random: never }), '');
  // Ступень уже видели в другой вкладке — праздника нет, сценка возможна.
  const seen = saved('a3', 3, 1);
  assert.equal(seen.celebrate, null);
  assert.equal(R.pickScene({ ...seen, checked: new Set(), random: randoms(0.2, 0.6) }), 'curl');
});

test('вероятность 25%: граница точная, на равномерной сетке — ровно четверть', () => {
  const base = saved('p1', 1);
  const pick = (value) => R.pickScene({ ...base, checked: new Set(), random: randoms(value, 0) });
  assert.equal(R.SCENE_CHANCE, 0.25);
  assert.equal(pick(0), 'stretch');
  assert.equal(pick(0.2499999), 'stretch');
  assert.equal(pick(0.25), '');
  assert.equal(pick(0.9999), '');
  let shown = 0;
  for (let i = 0; i < 1000; i += 1) if (R.pickScene({ ...base, key: `k${i}`, checked: new Set(), random: randoms(i / 1000, 0) })) shown += 1;
  assert.equal(shown, 250);
});

test('дневной предел: день показа занят — без броска; новый местный день — снова можно; день — по местной дате', () => {
  const base = saved('d1', 1);
  const used = { v: 1, day: DAY, by: 'другая вкладка', cat: 'curl' };
  for (const kind of ['cat', 'dog']) assert.equal(R.pickScene({ ...base, checked: new Set(), kind, record: used, random: never }), '', `${kind}: общий предел`);
  assert.equal(R.pickScene({ ...base, checked: new Set(), record: R.parseScene(JSON.stringify(used)), random: never }), '', 'значение из ключа');
  assert.equal(R.pickScene({ ...base, checked: new Set(), record: { ...used, day: '2026-10-09' }, random: randoms(0.1) }), 'stretch', 'вчерашний показ не мешает (вариант — не прошлый)');
  assert.equal(R.localDay(new Date(2026, 9, 10, 23, 59, 59)), '2026-10-10');
  assert.equal(R.localDay(new Date(2026, 9, 11, 0, 0, 1)), '2026-10-11');
  const tomorrow = { ...base, day: R.localDay(new Date(2026, 9, 11, 0, 0, 1)) };
  assert.equal(R.pickScene({ ...tomorrow, checked: new Set(), record: used, random: randoms(0.1) }), 'stretch', 'после полуночи — снова можно');
});

test('один createdId — одна попытка: повтор без нового броска, даже если первый не выпал', () => {
  const base = saved('o1', 1);
  const checked = new Set();
  assert.equal(R.pickScene({ ...base, checked, random: randoms(0.9) }), '');
  assert.equal(R.pickScene({ ...base, checked, random: never }), '', 'повтор той же записи');
  assert.equal(R.pickScene({ ...base, key: 'другая', checked, random: randoms(0.1, 0.9) }), 'curl', 'другая запись — своя попытка');
  assert.equal(R.pickScene({ ...base, checked, random: never }), '');
});

test('варианты: кот не повторяет прошлый, если доступны оба; в портрете — только «потягивается»; собака — «приносит мячик»', () => {
  const base = saved('v1', 1);
  const pick = (record, extra = {}) => R.pickScene({ ...base, checked: new Set(), record, random: randoms(0.1, 0.99), ...extra });
  assert.equal(pick({ cat: 'stretch' }), 'curl');
  assert.equal(pick({ cat: 'curl' }), 'stretch');
  assert.equal(pick(null), 'curl', 'первый раз — случайно из двух');
  assert.equal(R.pickScene({ ...base, checked: new Set(), random: randoms(0.1, 0) }), 'stretch');
  // Десять дней подряд — без двух одинаковых подряд.
  let record = null;
  const seen = [];
  for (let i = 0; i < 10; i += 1) {
    const type = R.pickScene({ ...base, key: `day${i}`, checked: new Set(), record, random: randoms(0.1, Math.random()) });
    seen.push(type);
    record = { day: '2026-10-01', cat: type };
  }
  assert.ok(seen.every((type, i) => R.SCENES.cat.includes(type) && type !== seen[i - 1]), seen.join(','));
  // Портрет: клубок не читается — остаётся потягивание, даже если оно было в прошлый раз.
  assert.deepEqual(R.sceneTypes('cat', false), ['stretch']);
  assert.deepEqual(R.sceneTypes('cat', true), ['stretch', 'curl']);
  assert.deepEqual(R.sceneTypes('dog', false), ['fetch']);
  assert.equal(pick({ cat: 'stretch' }, { available: R.sceneTypes('cat', false) }), 'stretch');
  assert.equal(pick({ cat: 'curl' }, { kind: 'dog' }), 'fetch');
  assert.equal(pick(null, { kind: 'енот' }), 'curl', 'неизвестный вид — кот');
  assert.equal(R.pickScene({ ...base, checked: new Set(), available: [], random: randoms(0.1) }), '', 'нечего показать');
});

test('уместность: срок 10 с от сохранения, видимость, тишина, другая реакция, «Поиграть», перенос, место и вид', () => {
  const next = { type: 'curl', key: 'e1', until: 1000 + R.SCENE_FRESH_MS };
  assert.equal(R.SCENE_FRESH_MS, 10_000);
  const fits = (state) => R.sceneFits(next, { now: 2000, ...state });
  assert.equal(fits({}), true);
  assert.equal(R.sceneFits(next, { now: next.until }), true, 'ровно 10 с — ещё можно');
  assert.equal(R.sceneFits(next, { now: next.until + 1 }), false, 'позже — пропускается, не ждёт');
  assert.equal(fits({ shown: false }), false, 'скрытая вкладка или спрятанный напарник');
  assert.equal(fits({ quiet: true }), false, 'ввод, диктовка, таймер, «Все разделы»');
  assert.equal(fits({ playing: true }), false, 'идёт другая реакция');
  assert.equal(fits({ play: true }), false, 'открыта «Поиграть»');
  assert.equal(fits({ moving: true }), false, 'питомца переносят');
  assert.equal(fits({ full: false }), false, 'клубок в портрете не читается');
  assert.equal(R.sceneFits({ ...next, type: 'stretch' }, { now: 2000, full: false }), true);
  assert.equal(fits({ kind: 'dog' }), false, 'сменили напарника — вариант не его');
  assert.equal(R.sceneFits(null), false);
});

test('режиссёр: сценка — последняя по важности, в тишине и поверх реакции не начинается, очередь не занимает', () => {
  for (const type of ['stretch', 'curl', 'fetch']) {
    const reaction = R.REACTIONS[type];
    assert.ok(reaction.scene && reaction.decorative && !reaction.calmOnly, type);
    assert.ok(Object.values(R.REACTIONS).every((other) => other.scene || other.priority < reaction.priority), `${type}: любая другая реакция важнее`);
    assert.ok(reaction.still < reaction.ms && reaction.still >= 1500, `${type}: без анимации — короче`);
  }
  assert.ok(R.REACTIONS.stretch.ms >= 3000 && R.REACTIONS.stretch.ms <= 4000);
  assert.ok(R.REACTIONS.curl.ms >= 4000 && R.REACTIONS.curl.ms <= 5000);
  assert.ok(R.REACTIONS.fetch.ms >= 3000 && R.REACTIONS.fetch.ms <= 5000);
  // Тишина: сценка пропадает, в очередь не встаёт и чужую отложенную не вытесняет.
  let d = R.createDirector();
  R.setQuiet(d, 'typing', true, 0);
  R.request(d, 'joy', { now: 0, key: 'entry:1' });
  const held = d.pending;
  assert.deepEqual(R.request(d, 'stretch', { now: 10, context: 'focus' }), { action: 'drop' });
  assert.equal(d.pending, held);
  // Идёт радость — сценка не перебивает.
  d = R.createDirector();
  R.request(d, 'joy', { now: 0 });
  assert.deepEqual(R.request(d, 'curl', { now: 100 }), { action: 'drop' });
  assert.equal(d.current.type, 'joy');
  // На экране практики (context focus) — можно: после сохранения экран остаётся формой.
  d = R.createDirector();
  assert.equal(R.request(d, 'fetch', { now: 0, context: 'focus', extra: { say: 'Тоби приносит мячик.' } }).action, 'play');
  assert.equal(d.current.until, R.REACTIONS.fetch.ms);
  // Ручное действие и важные реакции сменяют сценку сразу.
  for (const type of ['pet', 'paw', 'feed', 'greet', 'meet', 'named', 'joy', 'support', 'wait', 'unlock']) {
    d = R.createDirector();
    R.request(d, 'stretch', { now: 0 });
    assert.equal(R.request(d, type, { now: 500 }).action, 'play', type);
    assert.equal(d.current.type, type);
  }
  // Декоративные (зевок, «устроился») во время сценки не играют.
  d = R.createDirector();
  R.request(d, 'curl', { now: 0 });
  assert.deepEqual(R.request(d, 'settle', { now: 100 }), { action: 'drop' });
  // Тишина посреди сценки — останавливает её; после тишины она не возобновляется.
  assert.deepEqual(R.setQuiet(d, 'dictation', true, 200), { action: 'stop' });
  assert.equal(d.current, null);
  assert.deepEqual(R.setQuiet(d, 'dictation', false, 300), { action: 'none' });
  // Без анимации — свой короткий срок (extra.until), затем — поза покоя.
  d = R.createDirector();
  R.request(d, 'curl', { now: 0, extra: { until: R.REACTIONS.curl.still } });
  assert.equal(d.current.until, R.REACTIONS.curl.still);
  assert.deepEqual(R.finish(d, R.REACTIONS.curl.still), { action: 'none' });
});

test('хранение: повреждённое значение — по умолчанию, поля будущих версий сохраняются, учебных данных нет', () => {
  const empty = { v: 1, day: '', by: '', cat: '' };
  for (const text of [null, '', '{', '[]', '"строка"', '42', 'null', '{"day":"10.10.2026"}', '{"day":20261010}']) assert.deepEqual(R.parseScene(text), empty, String(text));
  assert.deepEqual(R.parseScene('{"day":"2026-10-10","by":"tab","cat":"dance"}'), { v: 1, day: DAY, by: 'tab', cat: '' });
  assert.equal(R.parseScene(JSON.stringify({ by: 'x'.repeat(100) })).by.length, 32);
  // Больший номер схемы не уменьшается (до PL02 запись понижала v до 1); вариант кота не меняли — он прежний.
  const record = R.sceneRecord('{"v":2,"future":{"a":1},"cat":"curl"}', { day: DAY, by: 'tab' });
  assert.deepEqual(record, { v: 2, future: { a: 1 }, day: DAY, by: 'tab', cat: 'curl' });
  assert.deepEqual(R.sceneRecord('{"v":1,"cat":"dance","x":[1]}', { day: DAY, by: 'tab' }), { v: 1, cat: 'dance', x: [1], day: DAY, by: 'tab' }, 'непонятный вариант кота без правки не стирается');
  assert.deepEqual(R.sceneRecord('испорчено', { day: DAY, by: 'tab', cat: 'stretch' }), { v: 1, day: DAY, by: 'tab', cat: 'stretch' });
  assert.deepEqual(Object.keys(R.sceneRecord(null, { day: DAY, by: 'tab', cat: 'curl', answer: 'текст ответа' })).sort(), ['by', 'cat', 'day', 'v'], 'лишнее (например, текст ответа) не пишется');
  // Прежние записи ключей не изменились (общий помощник keepRecord).
  assert.deepEqual(R.treatRecord('{"v":1,"fedDay":"2026-10-01","future":true}', DAY), { v: 1, fedDay: DAY, future: true });
  assert.deepEqual(R.lookRecord('{"v":1,"cat":"ginger","x":1}', { dog: 'spotted' }), { v: 1, cat: 'ginger', dog: 'spotted', x: 1 });
});

test('реакция сохранения ждала ввода, диктовки или таймера дольше короткого перехода — сценка отменяется, а не переносится', () => {
  const next = { type: 'curl', key: 'e1', day: DAY, at: 1000, until: 1000 + R.SCENE_FRESH_MS };
  // Переход — снятие тишины ввода после ухода из отправленного поля (250 мс в pet/pet.mjs) с запасом, но не ожидание.
  assert.ok(R.SCENE_GRACE_MS > 250 && R.SCENE_GRACE_MS <= 600, String(R.SCENE_GRACE_MS));
  assert.equal(R.sceneWaited(next, 1000), false, 'сразу после сохранения');
  assert.equal(R.sceneWaited(next, 1250), false, 'после снятия тишины ввода (кнопка «Проверить», Ctrl+Enter)');
  assert.equal(R.sceneWaited(next, 1000 + R.SCENE_GRACE_MS), false);
  assert.equal(R.sceneWaited(next, 1000 + R.SCENE_GRACE_MS + 1), true);
  assert.equal(R.sceneWaited(next, 4000), true, 'ждала 3 с — срок 10 с не разрешение ждать');
  assert.equal(R.sceneWaited(null, 1000), true, 'попытки нет');
});

test('решение в транзакции: показ — только если уместно, день тот же и свободен (в базе и в копии для старых вкладок)', () => {
  // Записи в базе нет — undefined (как get.result); null и другое не-объект — повреждённая запись (ниже).
  const base = { day: DAY, today: DAY, by: 'A', kind: 'cat', type: 'curl', fits: true };
  assert.deepEqual(R.sceneCommit(undefined, null, base), { v: 1, day: DAY, by: 'A', cat: 'curl' });
  assert.deepEqual(R.sceneCommit({ day: '2026-10-09', by: 'B', cat: 'curl' }, R.parseScene('{не json'), { ...base, type: 'stretch' }), { v: 1, day: DAY, by: 'A', cat: 'stretch' }, 'вчерашний показ не мешает; повреждённая копия — как пустая');
  assert.equal(R.sceneCommit(undefined, null, { ...base, fits: false }), null, 'условия помешали — ничего не пишется');
  assert.equal(R.sceneCommit(undefined, null, { ...base, today: '2026-10-11' }), null, 'полночь между сохранением и показом');
  assert.equal(R.sceneCommit({ v: 1, day: DAY, by: 'B', cat: 'stretch' }, null, base), null, 'день занят другой вкладкой');
  assert.equal(R.sceneCommit(undefined, { v: 1, day: DAY, by: 'old', cat: '' }, base), null, 'день занят старой версией в другой вкладке (копия SCENE_KEY)');
  assert.equal(R.sceneCommit(undefined, null, { ...base, by: '' }), null);
  assert.equal(R.sceneCommit(undefined, null, { ...base, day: 'вчера', today: 'вчера' }), null);
  // Повреждённая запись дня — не свободный день: неявно её не заменяем, сценки нет (до PL02 — как пустая, и заменялась).
  for (const bad of [null, [], 'день', 7, true]) assert.equal(R.sceneCommit(bad, null, base), null, JSON.stringify(bad));
  // Неизвестные поля, вложенные данные и больший v записи базы остаются (до PL02 запись заменялась нормализованной).
  assert.deepEqual(R.sceneCommit({ v: 4, day: '2026-10-09', by: 'B', cat: 'curl', future: { a: [1] } }, null, base), { v: 4, day: DAY, by: 'A', cat: 'curl', future: { a: [1] } });
  // Собака не меняет прошлый вариант кота (из базы, иначе — из копии); непонятный этой версии — тоже (до PL02 — стирался).
  const dog = { ...base, kind: 'dog', type: 'fetch' };
  // PL06: прошлый вариант собаки — своё поле variants.dog.
  assert.deepEqual(R.sceneCommit({ day: '2026-10-09', cat: 'stretch' }, null, dog), { v: 1, day: DAY, by: 'A', cat: 'stretch', variants: { dog: 'fetch' } });
  assert.equal(R.sceneCommit(undefined, { day: '2026-10-09', cat: 'curl' }, dog).cat, 'curl');
  assert.equal(R.sceneCommit({ cat: 'dance' }, null, dog).cat, 'dance');
});

test('IndexedDB: проверка, запись и начало показа — в одной транзакции; отмена до показа ничего не пишет', async () => {
  const db = idbBackend();
  const shows = [];
  assert.equal(await attempt(db.tab({ name: 'A' }), 'A', shows), 'shown');
  assert.deepEqual(shows, ['A']);
  assert.deepEqual(db.data.get('shown'), { v: 1, day: DAY, by: 'A', cat: 'curl' });
  // Тот же день — вторая попытка (другая вкладка или запись) читает показ и не показывает.
  assert.equal(await attempt(db.tab({ name: 'B' }), 'B', shows), 'skip');
  assert.deepEqual(shows, ['A']);
  // Отмена до начала (уголок, ввод, скрытая вкладка — fits: false) и полночь — ничего не пишут: показ другой вкладки
  // и прошлый вариант кота на месте, ключ не удаляется.
  const fresh = idbBackend();
  fresh.data.set('shown', { v: 1, day: '2026-10-09', by: 'прошлый', cat: 'stretch' });
  for (const extra of [{ fits: false }, { today: '2026-10-11' }]) {
    assert.equal(await attempt(fresh.tab({ name: 'C' }), 'C', shows, extra), 'skip', JSON.stringify(extra));
    assert.deepEqual(fresh.data.get('shown'), { v: 1, day: '2026-10-09', by: 'прошлый', cat: 'stretch' });
  }
  assert.equal(await attempt(db.tab({ name: 'D' }), 'D', shows, { fits: false }), 'skip');
  assert.deepEqual(db.data.get('shown'), { v: 1, day: DAY, by: 'A', cat: 'curl' }, 'отмена в одной вкладке не стирает показ другой');
  // После отмены — другое занятие того же дня может показать сценку.
  assert.equal(await attempt(fresh.tab({ name: 'C' }), 'C', shows), 'shown');
  assert.deepEqual(shows, ['A', 'C']);
  assert.deepEqual(fresh.data.get('shown'), { v: 1, day: DAY, by: 'C', cat: 'curl' });
});

test('две вкладки: пока A между чтением и записью (дольше 300 мс), B не читает; затем видит запись A — сценка одна', async () => {
  const db = idbBackend();
  const shows = [];
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const a = attempt(db.tab({ name: 'A', gate }), 'A', shows);
  while (!db.started.length) await turn();
  // B просит свою очередь, пока транзакция A открыта; держим дольше прежней паузы 300 мс.
  const b = attempt(db.tab({ name: 'B' }), 'B', shows);
  await new Promise((resolve) => setTimeout(resolve, 350));
  for (let i = 0; i < 20; i += 1) await turn();
  assert.deepEqual(db.started, ['A'], 'транзакция B не началась');
  assert.deepEqual(shows, []);
  release();
  assert.deepEqual(await Promise.all([a, b]), ['shown', 'skip']);
  assert.deepEqual(shows, ['A']);
  assert.deepEqual(db.started, ['A', 'B']);
  assert.equal(db.data.get('shown').by, 'A');
  // Обратный порядок: первой взяла очередь B — показывает B, A видит её запись.
  const other = idbBackend();
  const both = [];
  const first = attempt(other.tab({ name: 'B' }), 'B', both);
  const second = attempt(other.tab({ name: 'A' }), 'A', both);
  assert.deepEqual(await Promise.all([first, second]), ['shown', 'skip']);
  assert.deepEqual(both, ['B']);
  // Последовательно: показ уже в копии SCENE_KEY — следующее сохранение не бросает кубик.
  assert.equal(R.pickScene({ ...saved('t1', 1), checked: new Set(), record: R.parseScene(JSON.stringify(other.data.get('shown'))), random: never }), '');
});

test('хранение и координация недоступны — сценки нет, без сбоя; запись сорвалась после начала — показ надо остановить', async () => {
  const shows = [];
  for (const own of [{ deny: true }, { openError: true }, { throwPut: true }]) {
    const db = idbBackend();
    assert.equal(await attempt(db.tab(own), 'A', shows), 'fail', JSON.stringify(own));
    assert.equal(db.data.has('shown'), false);
  }
  assert.equal(await R.sceneTurn(null, DB, () => assert.fail('решения нет'), () => assert.fail('показа нет')), 'fail', 'IndexedDB в браузере нет');
  assert.deepEqual(shows, []);
  // Показ начался, но транзакция откатилась: итог 'lost' — оболочка останавливает сценку, день не записан.
  const lost = idbBackend();
  assert.equal(await attempt(lost.tab({ failPut: true }), 'A', shows), 'lost');
  assert.deepEqual(shows, ['A']);
  assert.equal(lost.data.has('shown'), false);
  // Сбой в самом показе (исключение) — откат, запись не остаётся.
  const thrown = idbBackend();
  const result = await R.sceneTurn(thrown.tab(), DB, (stored) => R.sceneCommit(stored, null, { day: DAY, today: DAY, by: 'A', type: 'curl', fits: true }), () => {
    throw new Error('сбой показа');
  });
  assert.equal(result, 'lost');
  assert.equal(thrown.data.has('shown'), false);
  // Копия для старых вкладок и выбора варианта: только день, метка и вариант; поля будущих версий и больший v сохраняются
  // (v из правки не пишется; до PL02 номер понижался до 1).
  assert.deepEqual(R.sceneRecord('{"v":2,"future":1,"day":"2026-10-01"}', { v: 1, day: DAY, by: 'A', cat: 'curl' }), { v: 2, future: 1, day: DAY, by: 'A', cat: 'curl' });
});

test('текст: имя без склонения, длинное имя целиком; реплик в банках нет — только одна фраза сценки', () => {
  assert.equal(R.sceneText('stretch', 'Марс'), 'Марс потягивается.');
  assert.equal(R.sceneText('curl', 'Марс'), 'Марс сворачивается клубком.');
  assert.equal(R.sceneText('fetch', 'Тоби'), 'Тоби приносит мячик.');
  const long = 'Ш'.repeat(R.NAME_MAX);
  assert.equal(R.sceneText('fetch', long), `${long} приносит мячик.`);
  assert.equal(R.sceneText('dance', 'Марс'), '');
  for (const type of ['stretch', 'curl', 'fetch']) assert.equal(R.REACTIONS[type].phrases, '', type);
});

test('рисунок: сценки нарисованы, длительность — как у реакции, анимации — только transform и opacity, статичная поза есть', async () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
  const cat = strip(await readFile(repo('pet/pet.css'), 'utf8'));
  const dog = strip(await readFile(repo('pet/dog.css'), 'utf8'));
  for (const [type, css, names] of [
    ['stretch', cat, /cat-stretch[\w-]*/],
    ['curl', cat, /cat-curl[\w-]*/],
    ['fetch', dog, /dog-fetch[\w-]*/],
  ]) {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) => match[1].includes(`[data-scene='${type}']`));
    assert.ok(rules.length >= 5, `${type}: правила`);
    const runs = rules.flatMap((match) => [...match[2].matchAll(/animation: ([\w-]+) ([\d.]+)s/g)]);
    assert.ok(runs.length >= 3, `${type}: анимации`);
    for (const run of runs) assert.equal(Number(run[2]) * 1000, R.REACTIONS[type].ms, `${type}: ${run[0]}`);
    assert.ok(rules.some((match) => match[1].includes("[data-motion='none']")), `${type}: статичная поза без анимации`);
    for (const frames of css.matchAll(/@keyframes ([\w-]+) \{((?:[^{}]*\{[^}]*\})*)\s*\}/g)) {
      if (!names.test(frames[1])) continue;
      const props = new Set([...frames[2].matchAll(/([\w-]+):/g)].map((match) => match[1]));
      for (const prop of props) assert.ok(prop === 'transform' || prop === 'opacity', `${frames[1]}: ${prop}`);
    }
  }
  // Мячик собаки — временный реквизит: в рисунке целиком и в портрете, по умолчанию не виден; в уголке — один мячик.
  for (const view of ['full', 'portrait']) assert.match(dogSvg({ id: 'f', view }), /<g class="dog-fetch">/, view);
  assert.match(dog, /\.cat-art\[data-kind='dog'\] \.dog-fetch \{\s*opacity: 0;/);
  assert.match(cat, /\.cat-scene-art:has\(\.cat-art\[data-scene='fetch'\]\) > \[data-item='ball'\] \{\s*opacity: 0;/);
  assert.match(cat, /\.cat-art\[data-motion='calm'\] \{\s*--sc: 0\.6;/, '«Спокойное» — меньше амплитуда');
});

