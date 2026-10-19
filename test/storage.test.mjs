// Сохранность данных (PL02): функции записи каждого ключа — свежее сохранённое как есть + только изменённые известные
// поля; неизвестные поля, вложенные данные, неизвестные ID и непонятные значения известных полей, данные другого
// животного и больший номер схемы не теряются; непонятная увиденная ступень не заменяется, понятная не понижается.
// Чтение различает «ключа нет» и «повреждено»; повреждённая запись дня сценки — не свободный день. Путь записи настоящего
// экземпляра (mountPet, неявные записи, отказы, смешанные версии) — test/browser.mjs, группа «хранение».
import assert from 'node:assert/strict';
import test from 'node:test';
import * as P from '../pet/pet-place.mjs';
import * as R from './legacy-rules.mjs';
import * as Room from './legacy-room.mjs';

const DAY = '2026-10-11';
const SHORT = { tall: false, roomy: false, gutterFull: true, gutterCompact: true }; // 1280×760

test('чтение: ключа нет — отдельно от повреждения; объект с непонятными значениями — не повреждение', () => {
  for (const text of [null, undefined]) assert.deepEqual(R.readRecord(text), { state: 'missing', raw: null }, String(text));
  // Пустая строка, не JSON, массив, строка, число, логическое, JSON null — повреждено (строка "null" — не «ключа нет»).
  for (const text of ['', '{', 'не json', '[]', '[1]', '"текст"', '42', 'true', 'null']) assert.deepEqual(R.readRecord(text), { state: 'corrupt', raw: null }, JSON.stringify(text));
  const raw = { v: 9, accessory: 'crown', future: { a: [1] } };
  assert.deepEqual(R.readRecord(JSON.stringify(raw)), { state: 'ok', raw });
  assert.equal(R.keepVersion(3, 1), 3);
  for (const v of [undefined, 0, 1, -2, 1.5, '3', null]) assert.equal(R.keepVersion(v, 1), 1, String(v));
});

test('cat: правка меняет только своё поле; неизвестные поля и значения, вложенные данные и больший v — как были', () => {
  const stored = JSON.stringify({ v: 4, name: 'Барсик', accessory: 'crown', motion: 'turbo', phrases: false, seenStage: 2, greetDay: '2026-10-01', future: { a: [1, { b: 2 }] }, hat: 'cap' });
  // Имя: accessory и motion непонятны этой версии (показ — по умолчанию), но не переписываются (до PL02 — scarf и normal, v 1).
  const renamed = R.catRecord(stored, { name: '  Дымок  ' });
  assert.deepEqual(renamed, { ...JSON.parse(stored), name: 'Дымок' });
  assert.deepEqual([R.parseSettings(stored).accessory, R.parseSettings(stored).motion], ['scarf', 'normal'], 'показ — безопасный');
  // Явный выбор аксессуара заменяет только его; день приветствия и увиденная ступень — неявные поля — тоже только свои.
  assert.deepEqual(R.catRecord(stored, { accessory: 'plaid' }), { ...JSON.parse(stored), accessory: 'plaid' });
  assert.deepEqual(R.catRecord(stored, { greetDay: DAY, seenStage: 3 }), { ...JSON.parse(stored), greetDay: DAY, seenStage: 3 });
  // Значение правки — по правилам проверки; поля, которых формат не знает, правкой не пишутся (запись данных хоста — нет).
  assert.deepEqual(R.catRecord(null, { name: '<b>Кот</b>', answer: 'текст ответа', v: 7 }), { v: 1, name: 'bКот/b' });
  // Ключа нет или повреждён — запись только из изменённых полей; показ остальных — по умолчанию.
  for (const text of [null, '{', '[1]', 'null']) assert.deepEqual(R.catRecord(text, { greetDay: DAY }), { v: 1, greetDay: DAY }, String(text));
});

// Проверка Codex PL02 (2026-10-13): показ непонятной ступени — -1, и первое включение записывало её поверх оригинала.
test('cat: увиденную ступень, непонятную этой версии, правка не заменяет; понятная только растёт', () => {
  for (const odd of [8, R.STAGES.length, 'future-stage', 1.5, -2, null, { at: 3 }]) {
    const stored = JSON.stringify({ v: 3, name: 'Марс', accessory: 'crown', seenStage: odd, greetDay: DAY, future: { a: 1 } });
    const raw = JSON.parse(stored);
    assert.equal(R.parseSettings(stored).seenStage, -1, `показ безопасный: ${JSON.stringify(odd)}`);
    // Первое включение, отметка при открытии и праздник — неявные правки ступени — ничего не меняют.
    for (const stage of [-1, 0, 1, R.STAGES.length - 1]) assert.deepEqual(R.catRecord(stored, { seenStage: stage }), raw, `${JSON.stringify(odd)} ← ${stage}`);
    // Явная правка вместе с памятью страницы (ступень и приветствие после отказа записи): свои поля — новые, ступень прежняя.
    assert.deepEqual(R.catRecord(stored, { seenStage: 0, greetDay: '2026-10-12', name: 'Дымок', motion: 'calm' }), { ...raw, greetDay: '2026-10-12', name: 'Дымок', motion: 'calm' }, JSON.stringify(odd));
  }
  // Понятная ступень не понижается правкой из памяти; большая пишется.
  const known = JSON.stringify({ v: 1, seenStage: 2, future: 1 });
  assert.deepEqual(R.catRecord(known, { seenStage: 1, name: 'Дымок' }), { v: 1, seenStage: 2, future: 1, name: 'Дымок' });
  assert.deepEqual(R.catRecord(known, { seenStage: 3 }), { v: 1, seenStage: 3, future: 1 });
  // Ключа нет, повреждён, поля нет, известный -1 — обычное первое включение: ступень пишется.
  for (const text of [null, '{', 'null', JSON.stringify({ v: 1, name: 'Барсик' }), JSON.stringify({ v: 1, seenStage: -1 })]) assert.equal(R.catRecord(text, { seenStage: 2 }).seenStage, 2, String(text));
});

test('companion: неизвестный вид остаётся до явного выбора; имя собаки не трогает её аксессуар, вложенное и других животных', () => {
  const stored = JSON.stringify({ v: 2, kind: 'example.bunny', dog: { name: 'Рекс', accessory: 'crown', bow: { color: 'red' } }, pets: { 'example.bunny': { name: 'Пух' } }, future: 1 });
  // Показ: неизвестный вид — котом; запись kind = cat не делается.
  assert.equal(R.parseCompanion(stored).kind, 'cat');
  const named = R.companionRecord(stored, { dog: { name: 'Барклий' } });
  assert.deepEqual(named, { v: 2, kind: 'example.bunny', dog: { name: 'Барклий', accessory: 'crown', bow: { color: 'red' } }, pets: { 'example.bunny': { name: 'Пух' } }, future: 1 });
  // Явный выбор известного вида меняет только kind.
  assert.deepEqual(R.companionRecord(stored, { kind: 'dog' }), { ...JSON.parse(stored), kind: 'dog' });
  // Пустая правка dog (как ui.unsaved.companion без полей собаки) не создаёт dog.
  assert.deepEqual(R.companionRecord(JSON.stringify({ v: 1, kind: 'cat' }), { kind: 'dog', dog: {} }), { v: 1, kind: 'dog' });
  // dog не объект (непонятное значение): выбор вида его не трогает; правка имени собаки — заменяет объектом (граница).
  const odd = JSON.stringify({ v: 1, kind: 'cat', dog: 'Шарик' });
  assert.equal(R.companionRecord(odd, { kind: 'dog' }).dog, 'Шарик');
  assert.deepEqual(R.companionRecord(odd, { dog: { name: 'Шарик' } }).dog, { name: 'Шарик' });
  // Ключа нет — только изменённое.
  assert.deepEqual(R.companionRecord(null, { dog: { accessory: 'plaid' } }), { v: 1, dog: { accessory: 'plaid' } });
});

test('кот и собака: настройки кота — в cat, собаки — в companion.dog; правка одного не трогает другого', () => {
  const cat = JSON.stringify({ v: 1, name: 'Барсик', accessory: 'plaid', motion: 'calm' });
  const companion = JSON.stringify({ v: 1, kind: 'dog', dog: { name: 'Рекс', accessory: 'badge' } });
  const dogName = R.splitUpdate('dog', { name: 'Тоби' });
  assert.deepEqual(dogName, { cat: {}, companion: { dog: { name: 'Тоби' } } });
  assert.deepEqual(R.companionRecord(companion, dogName.companion).dog, { name: 'Тоби', accessory: 'badge' });
  // Общее движение — в cat, companion не трогается.
  const motion = R.splitUpdate('dog', { motion: 'none' });
  assert.deepEqual(motion, { cat: { motion: 'none' }, companion: {} });
  assert.deepEqual(R.catRecord(cat, motion.cat), { v: 1, name: 'Барсик', accessory: 'plaid', motion: 'none' });
});

test('look, treat, presence, place: только изменённое, вложенное и неизвестное — как было, v не уменьшается', () => {
  // Облик: симметрично — меняют кота, непонятный облик собаки остаётся.
  assert.deepEqual(R.lookRecord(JSON.stringify({ v: 2, cat: 'smoke', dog: 'merle', bunny: 'snow' }), { cat: 'ginger' }), { v: 2, cat: 'ginger', dog: 'merle', bunny: 'snow' });
  // Лакомство: день и только он.
  assert.deepEqual(R.treatRecord(JSON.stringify({ v: 3, fedDay: 'вчера', streak: { n: 2 } }), DAY), { v: 3, fedDay: DAY, streak: { n: 2 } });
  // Присутствие: только mode.
  assert.deepEqual(P.presenceRecord(JSON.stringify({ v: 2, mode: 'nap', when: { from: '22:00' } }), 'on-call'), { v: 2, mode: 'on-call', when: { from: '22:00' } });
  // Место: вид компьютера — только desktop.view; desktop.place (непонятное), phone и неизвестное — как было.
  const place = JSON.stringify({ v: 2, theme: { dark: true }, desktop: { place: 'corner', view: 'auto', x: 1 }, phone: { place: 'pip', view: 'huge', pose: 'nap' } });
  assert.deepEqual(P.placeRecord(place, { desktop: { view: 'full' } }), { v: 2, theme: { dark: true }, desktop: { place: 'corner', view: 'full', x: 1 }, phone: { place: 'pip', view: 'huge', pose: 'nap' } });
});

test('место: выбор вида не закрепляет место поверх непонятного этой версии', () => {
  const normalized = P.normalizePlace({ desktop: { place: '', view: 'full' } });
  // Место не выбирали — «Свернуть» закрепляет «Внизу экрана» (прежнее поведение, test/place.test.mjs).
  assert.deepEqual(P.viewPatch(normalized, SHORT, 'compact', { v: 1, desktop: { view: 'full' } }), { desktop: { view: 'compact', place: 'bottom' } });
  // В хранилище место из более новой версии (показ — «не выбирали»): правка — только вид.
  const stored = { v: 2, desktop: { place: 'corner', view: 'full' } };
  assert.deepEqual(P.viewPatch(P.normalizePlace(stored), SHORT, 'compact', stored), { desktop: { view: 'compact' } });
  assert.deepEqual(P.placeRecord(JSON.stringify(stored), P.viewPatch(P.normalizePlace(stored), SHORT, 'compact', stored)), { v: 2, desktop: { place: 'corner', view: 'compact' } });
});

test('room: у передвинутой точки меняются только x и y; возврат домой оставляет её поля; незатронутое — как было', () => {
  const stored = JSON.stringify({
    v: 3,
    theme: 'night',
    cat: { rest: { x: 150, y: 210, tilt: 3 }, bowl: { x: 'край', y: 230, mark: 'b' }, yarn: { x: 60, y: 230, glow: { on: true } }, sofa: { x: 1, y: 2 } },
    dog: { rope: { x: 330, y: 240 } },
    'example.bunny': { carrot: { x: 5, y: 6 } },
  });
  // Передвинули клубок: остальные точки (в том числе непонятная миска, показанная на исходном месте) не трогаются.
  const moved = Room.roomRecord(stored, 'cat', { yarn: [80, 231] });
  const raw = JSON.parse(stored);
  assert.deepEqual(moved, { ...raw, cat: { ...raw.cat, yarn: { x: 80, y: 231, glow: { on: true } } } });
  // Вернули место отдыха и клубок домой: координаты сняты, прочие поля точки остались; пустая точка удаляется.
  const home = Room.roomRecord(stored, 'cat', { rest: Room.HOME.rest, yarn: Room.HOME.yarn });
  assert.deepEqual(home.cat.rest, { tilt: 3 });
  assert.deepEqual(home.cat.yarn, { glow: { on: true } });
  assert.deepEqual(Room.parseRoom(JSON.stringify(home)).cat, {}, 'без координат — исходное место (так же читает 0.1.4)');
  assert.deepEqual(Room.roomRecord(JSON.stringify({ v: 1, cat: { yarn: { x: 60, y: 230 } } }), 'cat', { yarn: Room.HOME.yarn }).cat, {});
  assert.equal(home.v, 3, 'больший v не уменьшается');
  assert.deepEqual([home.dog, home['example.bunny'], home.theme, home.cat.bowl, home.cat.sofa], [raw.dog, raw['example.bunny'], raw.theme, raw.cat.bowl, raw.cat.sofa]);
  // Что пишет «Сохранить»: только передвинутые в редакторе и только если место отличается от сохранённого.
  const saved = Room.arrange('cat', 0, Room.parseRoom(stored).cat).pos;
  const draft = { ...saved, yarn: [80, 231] };
  assert.deepEqual(Room.movedItems(draft, saved, ['yarn']), { yarn: [80, 231] });
  assert.deepEqual(Room.movedItems(draft, saved, []), {}, 'место, показанное вместо непонятного, — не правка');
  // «Вернуть обычную расстановку»: все предметы тронуты, но пишутся только те, чьё место не исходное.
  const reset = Room.arrange('cat', 0, {}).pos;
  assert.deepEqual(Object.keys(Room.movedItems(reset, saved, Object.keys(reset))).sort(), ['rest', 'yarn']);
});

test('сценка: запись дня сохраняет неизвестное, повреждённая не заменяется; отсутствующая — свободный день', async () => {
  const base = { day: DAY, today: DAY, by: 'A', kind: 'cat', type: 'curl', fits: true };
  const shown = { v: 2, day: '2026-10-10', by: 'B', cat: 'jump', mood: { calm: [1] } };
  assert.deepEqual(R.sceneCommit(shown, null, base), { v: 2, day: DAY, by: 'A', cat: 'curl', mood: { calm: [1] } });
  assert.deepEqual(R.sceneCommit(shown, null, { ...base, kind: 'dog', type: 'fetch' }), { v: 2, day: DAY, by: 'A', cat: 'jump', mood: { calm: [1] } }, 'собака не нормализует вариант кота; новых полей нет (PL11.2, D5)');
  // Транзакция: повреждённая запись — skip, ничего не записано и не показано; нет записи — показ.
  const run = async (initial, { getFails = false } = {}) => {
    const data = new Map(initial === undefined ? [] : [['shown', initial]]);
    const shows = [];
    const idb = {
      open() {
        const request = {};
        queueMicrotask(() => {
          request.result = {
            close() {},
            transaction() {
              const tx = {};
              const writes = new Map();
              tx.objectStore = () => ({
                get(key) {
                  const get = {};
                  queueMicrotask(() => {
                    // Отказ чтения: запрос с ошибкой отменяет транзакцию.
                    if (getFails) return tx.onabort();
                    get.result = data.get(key);
                    get.onsuccess();
                    queueMicrotask(() => {
                      for (const [k, value] of writes) data.set(k, value);
                      tx.oncomplete();
                    });
                  });
                  return get;
                },
                put(value, key) {
                  writes.set(key, structuredClone(value));
                },
              });
              return tx;
            },
          };
          request.onsuccess();
        });
        return request;
      },
    };
    const result = await R.sceneTurn(idb, 'site:scene', (stored) => R.sceneCommit(stored, null, base), () => shows.push('A'));
    return { result, shows, data: data.get('shown') };
  };
  for (const bad of [null, [], 'день', 7]) assert.deepEqual(await run(bad), { result: 'skip', shows: [], data: bad }, JSON.stringify(bad));
  assert.deepEqual(await run(undefined), { result: 'shown', shows: ['A'], data: { v: 1, day: DAY, by: 'A', cat: 'curl' } });
  assert.deepEqual((await run(shown)).data, { v: 2, day: DAY, by: 'A', cat: 'curl', mood: { calm: [1] } });
  assert.deepEqual(await run(shown, { getFails: true }), { result: 'fail', shows: [], data: shown }, 'отказ чтения записи дня — fail до показа, запись прежняя');
});
