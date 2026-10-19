// PL06 в Node — определения управляют исполнением (docs/ARCHITECTURE.md § 7.1.1, § 7.3, § 7.5, § 7.6, § 7.10): все пары
// трёх питомцев (кот, собака, кролик примера) и двух моделей (calm, живая модель примера). Позы и замены (кролик: wait →
// attentive и др.), лапа — возможность питомца (у кролика interact paw — unsupported без изменений; «Дай лапу» вне игры —
// только при ask), зевок — у calm с котом и собакой, нет у живой модели и у кролика; длительности, реплики (default и
// byPet), лимит поглаживания модели действительно действуют. Сценки — пересечение (сценки питомца без skip, объявление
// отображения, читаемость): таблица § 7.3 (целиком и портрет), случаи § 7.1.1, шанс 0 и пустое пересечение — без random,
// reserve и show, порядок random (шанс, затем вариант), fresh по своему питомцу, random модели. setBehavior — новая пара,
// снятие реакций, попытки, жеста и итога, задачи заново; память событий, попыток, пауз, лимитов, лакомство и день
// сценки — общие. Запасной показ: определение снято (выбор и данные целы, возврат), модель неизвестна, набора нет
// (setDisplay pets) — fallback, setPet такого — unsupported. Данные синтетические; время и случайность — ручные.
import assert from 'node:assert/strict';
import test from 'node:test';
import { calm } from '../pet/defs/calm.mjs';
import { cat } from '../pet/defs/cat.mjs';
import { dog } from '../pet/defs/dog.mjs';
import { bunny } from '../examples/extension/bunny.mjs';
import { lively } from '../examples/extension/lively.mjs';
import { defineBehavior, definePet } from '../pet/core.mjs';
import { DAY, flush, host, life, reserver, sceneStore } from './core-kit.mjs';

const ALL = { pets: [cat, dog, bunny], behaviors: [calm, lively] };
const VIEWS = ['corner', 'play', 'room'];
const SCENES = { cat: ['stretch', 'curl'], dog: ['fetch'], 'example.bunny': ['hop'] };
const DISPLAY = { pets: ['cat', 'dog', 'example.bunny'], views: VIEWS, scenes: SCENES };
const FLOOR = [-40, -10, 300, 230];
const COMMON = { v: 1, seenStage: 1, greetDay: DAY };
const PETS = { cat: {}, dog: { companion: { v: 1, kind: 'dog' } }, 'example.bunny': { ext: { v: 1, pet: { id: 'example.bunny', over: 'cat' } } } };
const MODELS = { calm: {}, 'example.lively': { behavior: 'example.lively' } };

// Ядро с парой питомец + модель (сохранено заранее), всеми определениями и объявлением отображения.
function pair(pet, model, { display = DISPLAY, scenes = null, counts = host(4, 1), random, extra = {}, shown = pet } = {}) {
  const initial = { cat: COMMON, ...PETS[pet], ...extra };
  if (model !== 'calm') initial.ext = { v: 1, ...(initial.ext ?? {}), behavior: model };
  const L = life(initial, { defs: ALL, display, scenes, counts, ...(random ? { random } : {}) });
  assert.equal(L.core.start().ok, true);
  assert.deepEqual([L.state().pet.shown, L.state().behavior.shown], [shown, model]);
  return L;
}
const playing = (L) => L.state().pose.reaction?.type ?? null;
const told = (L) => L.effects('announce').map((effect) => effect.text);

for (const pet of ['cat', 'dog', 'example.bunny']) {
  for (const model of ['calm', 'example.lively']) {
    test(`пара ${pet} + ${model}: позы с заменами, лапа по возможности, зевок по модели и позе, длительность модели`, () => {
      const L = pair(pet, model);
      const def = { cat, dog, 'example.bunny': bunny }[pet];
      const behavior = { calm, 'example.lively': lively }[model];
      // Ожидание — поза wait или замена питомца (у кролика — attentive).
      L.core.notify('failed');
      assert.deepEqual([playing(L), L.state().pose.reaction.pose], ['wait', def.poses.includes('wait') ? 'wait' : def.poseFallback.wait]);
      L.plan.advance(behavior.reactions.wait.ms);
      // Радость — длительность модели.
      const at = L.time.state.now;
      L.core.notify('saved', { key: 'j', counted: false });
      assert.equal(L.state().pose.reaction.until - at, behavior.reactions.joy.ms, 'длительность — модель');
      L.plan.advance(behavior.reactions.joy.ms);
      // Лапа: в «Поиграть» — у кота и собаки, у кролика — unsupported; вне игры — только «Дай лапу» (ask).
      assert.equal(L.core.setDisplay({ playFloor: FLOOR }).ok, true);
      const outside = L.core.interact({ type: 'paw' });
      assert.equal(outside.ok, Boolean(def.actions.paw?.ask), `вне игры: ${JSON.stringify(outside)}`);
      if (outside.ok) L.plan.advance(behavior.reactions.paw.ms);
      L.core.open('play');
      const before = L.state();
      const seen = L.seen.length;
      const inside = L.core.interact({ type: 'paw' });
      if (def.actions.paw) assert.deepEqual([inside.ok, inside.outcome], [true, 'paw']);
      else {
        assert.deepEqual([inside.ok, inside.error.code, L.state(), L.seen.length], [false, 'unsupported', before, seen], 'без лапы — отказ без изменений и обновлений');
      }
      L.core.close();
      // Зевок: при одиночном движении покоя (random 0 < шанс) — только если он есть у пары.
      const yawns = Boolean(behavior.reactions.yawn) && def.poses.includes('yawn');
      L.plan.advance(5 * 60_000);
      L.random.push(...Array(40).fill(0));
      let yawned = false;
      for (let i = 0; i < 40 && !yawned; i += 1) {
        L.core.activity();
        L.plan.advance(30_000);
        yawned = L.seen.some((update) => update.snapshot.pose.reaction?.type === 'yawn');
      }
      assert.equal(yawned, yawns, `зевок: ${yawns ? 'есть' : 'нет'}`);
      L.core.destroy();
    });
  }
}

test('реплики: default модели — для любого питомца, byPet — замены; у пары кролик + живая — свои реплики поглаживания', () => {
  const L = pair('example.bunny', 'example.lively', { random: { port: () => 0, state: { taken: 0 }, push() {} } });
  L.core.setDisplay({ playFloor: FLOOR });
  L.core.open('play');
  L.core.interact({ type: 'pet' });
  assert.ok(lively.phrases.byPet['example.bunny'].pet.includes(L.state().scenePhrase), L.state().scenePhrase);
  L.plan.advance(2000);
  L.core.close();
  L.core.notify('saved', { key: 'k', counted: false });
  assert.ok(lively.phrases.default.joy.includes(L.state().phrase.text), 'группы без замены — default модели');
  L.core.setBehavior('calm');
  L.plan.advance(2000);
  L.core.notify('saved', { key: 'k2', counted: false });
  assert.ok(calm.phrases.default.joy.includes(L.state().phrase.text), 'calm с кроликом — default calm (у кота свои byPet)');
  L.core.destroy();
});

test('лимит поглаживания — модель: calm — три полных отклика, живая — два; дальше «пока хватит» и тихо; знаков нет', () => {
  for (const [model, full] of [['calm', 3], ['example.lively', 2]]) {
    const L = pair('cat', model);
    L.core.setDisplay({ playFloor: FLOOR });
    L.core.open('play');
    const outcomes = [];
    for (let i = 0; i < full + 2; i += 1) {
      outcomes.push(L.core.interact({ type: 'pet' }).outcome);
      L.plan.advance(1600);
    }
    assert.deepEqual(outcomes, [...Array(full).fill('pet'), 'enough', 'quiet'], model);
    assert.equal(L.state().progress.marks, 4, 'знаков не прибавилось');
    L.core.destroy();
  }
});

test('setBehavior: ext.behavior; реакция, отложенная, облако и попытка сценки сняты; жест и итог «Поиграть» сняты; задачи покоя заново; повтор — без записи', () => {
  const port = reserver(sceneStore(), 'qa');
  const L = pair('cat', 'calm', { scenes: port.port });
  L.random.push(0, 0, 0);
  L.core.notify('saved', { key: 'e1', counted: true });
  assert.ok(L.state().scene.waiting, 'попытка сценки ждёт');
  const result = L.core.setBehavior('example.lively');
  assert.deepEqual([result.ok, result.changed, result.save.status, result.save.keys], [true, true, 'saved', ['ext']]);
  assert.deepEqual(L.json('ext'), { v: 1, behavior: 'example.lively' });
  assert.deepEqual([playing(L), L.state().phrase, L.state().scene.waiting, L.state().behavior], [null, null, null, { id: 'example.lively', shown: 'example.lively', available: true }]);
  L.plan.advance(5000);
  assert.deepEqual(port.calls, { reserve: 0, decide: 0, show: 0 }, 'отменённая попытка не возвращается');
  // Жест и итог.
  L.core.setDisplay({ playFloor: FLOOR });
  L.core.open('play');
  const stroke = L.core.stroke.start().id;
  L.core.stroke.step(stroke);
  assert.equal(L.state().play.stroke.held, true);
  L.core.setBehavior('calm');
  assert.deepEqual([L.state().play.stroke, L.state().play.outcome, L.state().pose.hold], [null, '', null], 'жест и итог прежней модели сняты');
  assert.equal(L.core.stroke.step(stroke).error.code, 'no-gesture');
  const again = L.core.setBehavior('calm');
  assert.deepEqual([again.ok, again.changed, again.save.status], [true, false, 'none']);
  for (const [bad, code] of [[5, 'invalid-argument'], ['example.zen', 'unknown-id'], ['lively', 'unknown-id']]) assert.equal(L.core.setBehavior(bad).error.code, code);
  L.core.destroy();
  assert.equal(L.core.setBehavior('calm').error.code, 'destroyed');
});

test('смена модели и питомца не сбрасывает учёт событий, паузы повторов, лимит поглаживания и не обходит общее лакомство', () => {
  const L = pair('cat', 'calm', { counts: host(4, 1) });
  L.core.notify('saved', { key: 'same', counted: false });
  L.plan.advance(2000);
  L.core.setBehavior('example.lively');
  assert.equal(L.core.notify('saved', { key: 'same', counted: false }).duplicate, true, 'событие уже учтено экземпляром');
  // Пауза повтора готового имени (4 с) — общая для моделей.
  assert.equal(L.core.setName('Котлетыч', { pick: true }).reacted, true);
  L.plan.advance(1500);
  L.core.setBehavior('calm');
  assert.equal(L.core.setName('Пельмень', { pick: true }).reacted, false, 'пауза повтора named не сброшена сменой модели');
  // Лимит поглаживания: три с calm, затем живая (лимит 2) — не новый счёт.
  L.plan.advance(5000);
  L.core.setDisplay({ playFloor: FLOOR });
  L.core.open('play');
  for (let i = 0; i < 3; i += 1) {
    assert.equal(L.core.interact({ type: 'pet' }).outcome, 'pet');
    L.plan.advance(1500);
  }
  L.core.setBehavior('example.lively');
  assert.equal(L.core.interact({ type: 'pet' }).outcome, 'quiet', 'смена модели не даёт новых полных откликов');
  L.core.close();
  // Лакомство — одно в день на всех питомцев и модели.
  assert.equal(L.core.feed().ok, true);
  L.plan.advance(6000);
  L.core.setPet('example.bunny');
  assert.equal(L.core.feed().error.code, 'treat-fed');
  L.core.setBehavior('calm');
  assert.equal(L.core.feed().error.code, 'treat-fed');
  L.core.destroy();
});

// ---------- сценки: пересечение (§ 7.1.1, § 7.3) ----------

// Занятие с репликой радости (random 0) и значениями выбора: какие сценки допустимы (перебор варианта).
function options(pet, model, { full = true, display = DISPLAY } = {}) {
  const found = new Set();
  let rolls = null;
  for (const variant of [0, 0.99]) {
    const port = reserver(sceneStore(), 'qa');
    const L = pair(pet, model, { display: { ...display, full }, scenes: port.port });
    L.random.push(0, 0, variant);
    const before = L.random.state.taken;
    L.core.notify('saved', { key: 'k', counted: true });
    rolls = L.random.state.taken - before;
    const waiting = L.state().scene.waiting;
    if (waiting) found.add(waiting.type);
    L.core.destroy();
  }
  return { list: [...found].sort(), rolls };
}

test('таблица § 7.3: все сценки объявлены — пары и показ (целиком / портрет)', () => {
  const table = [
    ['cat', 'calm', ['curl', 'stretch'], ['stretch']],
    ['cat', 'example.lively', ['stretch'], ['stretch']],
    ['dog', 'calm', ['fetch'], ['fetch']],
    ['dog', 'example.lively', ['fetch'], ['fetch']],
    ['example.bunny', 'calm', ['hop'], ['hop']],
    ['example.bunny', 'example.lively', ['hop'], ['hop']],
  ];
  for (const [pet, model, whole, portrait] of table) {
    assert.deepEqual(options(pet, model).list, whole, `${pet} + ${model} целиком`);
    assert.deepEqual(options(pet, model, { full: false }).list, portrait, `${pet} + ${model} портрет`);
  }
  // Порядок random: реплика, шанс, вариант — только когда вариантов больше одного.
  assert.equal(options('cat', 'calm').rolls, 3);
  assert.equal(options('cat', 'example.lively').rolls, 2, 'один вариант — без броска варианта');
});

test('таблица § 7.1.1: объявление — не объявлено, {}, без ключа, пустой список — ни одной у всех; часть питомцев; неизвестные ссылки — журнал', () => {
  const none = [{ pets: DISPLAY.pets, views: VIEWS }, { ...DISPLAY, scenes: {} }, { ...DISPLAY, scenes: { dog: ['fetch'] } }, { ...DISPLAY, scenes: { cat: [], 'example.bunny': [] } }];
  for (const display of none.slice(0, 2)) for (const pet of ['cat', 'dog', 'example.bunny']) assert.deepEqual(options(pet, 'calm', { display }).list, [], `${pet}: ${JSON.stringify(display.scenes)}`);
  assert.deepEqual(options('cat', 'calm', { display: none[2] }).list, [], 'нет ключа кота');
  assert.deepEqual(options('dog', 'calm', { display: none[2] }).list, ['fetch'], 'собака объявлена');
  assert.deepEqual(options('example.bunny', 'calm', { display: none[3] }).list, [], 'пустой список кролика');
  // Неизвестные строковые ссылки — пропуск и журнал на ссылку; неверная форма — invalid-argument, прежнее объявление.
  const L = pair('example.bunny', 'calm');
  const result = L.core.setDisplay({ scenes: { 'example.bunny': ['hop', 'jump'], 'example.fox': ['run'] } });
  assert.deepEqual([result.ok, L.state().display.scenes], [true, { 'example.bunny': ['hop'] }]);
  assert.deepEqual(L.log.list.slice(-2), ['setDisplay: example.bunny/jump — нет у зарегистрированных питомцев, пропущено', 'setDisplay: example.fox — нет у зарегистрированных питомцев, пропущено']);
  for (const bad of [{ scenes: { 'example.bunny': 'hop' } }, { scenes: { 'example.bunny': ['hop', , 'x'] } }, { scenes: { 'example.bunny': [null] } }]) assert.equal(L.core.setDisplay(bad).error.code, 'invalid-argument');
  assert.deepEqual(L.state().display.scenes, { 'example.bunny': ['hop'] }, 'прежнее объявление');
  L.core.destroy();
});

test('шанс 0 и пустое пересечение: попытка использована, random на выбор не тратится, ни reserve, ни show, день и копия не меняются', async () => {
  const zero = defineBehavior({ ...JSON.parse(JSON.stringify(calm)), id: 'example.zero', scenes: { chance: 0, order: 'fresh' } });
  for (const [behaviors, model, display] of [[[calm, zero], 'example.zero', DISPLAY], [[calm, lively], 'calm', { ...DISPLAY, scenes: {} }]]) {
    const port = reserver(sceneStore(), 'qa');
    const L = life({ cat: COMMON, ...(model === 'calm' ? {} : { ext: { v: 1, behavior: model } }) }, { defs: { pets: [cat, dog, bunny], behaviors }, display, scenes: port.port, counts: host(4, 1) });
    L.core.start();
    L.random.push(0, 0, 0);
    const before = L.random.state.taken;
    L.core.notify('saved', { key: 'z', counted: true });
    assert.deepEqual([L.random.state.taken - before, L.state().scene.waiting], [1, null], `${model}: только реплика радости`);
    L.plan.advance(2000);
    await flush();
    assert.deepEqual([port.calls, L.raw('scene')], [{ reserve: 0, decide: 0, show: 0 }, null]);
    assert.equal(L.core.notify('saved', { key: 'z', counted: true }).duplicate, true, 'попытка этого события использована');
    L.core.destroy();
  }
});

test('fresh — не прошлый вариант этого питомца; random — любой; память варианта кота — scene.cat, собаки — нет (0.1.4), других — ext.scenes[petId]', async () => {
  const randomCalm = defineBehavior({ ...JSON.parse(JSON.stringify(calm)), id: 'example.shuffle', scenes: { chance: 0.25, order: 'random' } });
  const defs = { pets: [cat, dog, bunny], behaviors: [calm, randomCalm] };
  // Прошлый вариант кота — stretch: fresh даёт только curl (без броска варианта), random — оба (бросок).
  for (const [model, rolls, list] of [['calm', 2, ['curl']], ['example.shuffle', 3, ['curl', 'stretch']]]) {
    const found = new Set();
    let taken = 0;
    for (const variant of [0, 0.99]) {
      const L = life({ cat: COMMON, scene: { v: 1, day: '2026-10-01', cat: 'stretch', variants: { dog: 'fetch' } }, ...(model === 'calm' ? {} : { ext: { v: 1, behavior: model } }) }, { defs, display: DISPLAY, scenes: reserver().port, counts: host(4, 1) });
      L.core.start();
      L.random.push(0, 0, variant);
      const before = L.random.state.taken;
      L.core.notify('saved', { key: 'f', counted: true });
      taken = L.random.state.taken - before;
      found.add(L.state().scene.waiting.type);
      L.core.destroy();
    }
    assert.deepEqual([taken, [...found].sort()], [rolls, list], model);
  }
  // PL11.2, D5: запись сценки (копия и запись дня) — формат 0.1.4: вариант кота прежний, variants не добавляется (до 0.2.2
  // собака и кролик писали variants[petId] в старый ключ). Собака варианта не помнит, как 0.1.4 (вариант один); кролик —
  // в ext:v1 scenes (выбор питомца и неизвестное ext целы).
  for (const [pet, extra, ext] of [['dog', PETS.dog, null], ['example.bunny', PETS['example.bunny'], { ...PETS['example.bunny'].ext, scenes: { 'example.bunny': 'hop' } }]]) {
    const store = sceneStore();
    const port = reserver(store, 'qa');
    const L = life({ cat: COMMON, ...extra, scene: { v: 1, day: '2026-10-01', cat: 'curl', other: 1 } }, { defs, display: DISPLAY, scenes: port.port, counts: host(4, 1) });
    L.core.start();
    L.random.push(0, 0);
    L.core.notify('saved', { key: 'd', counted: true });
    L.plan.advance(2000);
    await flush();
    assert.equal(playing(L), { dog: 'fetch', 'example.bunny': 'hop' }[pet]);
    const copy = L.json('scene');
    assert.deepEqual([copy.cat, copy.other, Object.hasOwn(copy, 'variants'), Object.keys(copy).sort()], ['curl', 1, false, ['by', 'cat', 'day', 'other', 'v']], `${pet}: копия — формат 0.1.4`);
    assert.deepEqual([store.days.get('qa').cat, Object.hasOwn(store.days.get('qa'), 'variants')], ['curl', false], `${pet}: запись дня — вариант кота прежний, без variants`);
    assert.deepEqual(L.raw('ext') === null ? null : L.json('ext'), ext, `${pet}: ext`);
    L.core.destroy();
  }
  // Память кролика из ext — fresh не повторяет; прежнее variants записи сценки (0.2.0–0.2.1) — читается, если в ext нет.
  const twice = definePet({ ...JSON.parse(JSON.stringify(bunny)), scenes: [...JSON.parse(JSON.stringify(bunny.scenes)), { ...JSON.parse(JSON.stringify(bunny.scenes[0])), id: 'skip' }] });
  for (const [where, initial] of [['ext', { ext: { ...PETS['example.bunny'].ext, scenes: { 'example.bunny': 'hop' } } }], ['variants', { ...PETS['example.bunny'], scene: { v: 1, day: '2026-10-01', cat: 'curl', variants: { 'example.bunny': 'hop' } } }]]) {
    const L = life({ cat: COMMON, ...initial }, { defs: { pets: [cat, dog, twice], behaviors: [calm] }, display: { ...DISPLAY, scenes: { ...DISPLAY.scenes, 'example.bunny': ['hop', 'skip'] } }, scenes: reserver().port, counts: host(4, 1) });
    L.core.start();
    L.random.push(0, 0, 0);
    L.core.notify('saved', { key: 'w', counted: true });
    assert.equal(L.state().scene.waiting?.type, 'skip', `${where}: прошлый вариант hop — fresh даёт skip`);
    L.core.destroy();
  }
});

// PL11.2, D5 (0.2.3): копия scene:v1 — поля подтверждённой записи дня у любого питомца, как 0.1.4 (копия и запись — одна
// запись { v, day, by, cat }). До 0.2.3 у собаки и расширения при новом профиле или копии без cat запись дня получала
// cat: '', а копия — нет. Значения сравниваются строго (не join: пустая строка, null и undefined различаются).
test('D5: копия scene:v1 получает cat записи дня у любого питомца — новый профиль собаки, копия без cat, прежнее curl, кот, расширение', async (t) => {
  const OLD = '2026-10-01';
  const BUNNY_EXT = { ...PETS['example.bunny'].ext, other: 7 };
  // [название, питомец, копия scene (undefined — ключа нет), прежняя запись дня (undefined — нет), ожидаемое cat, сценка]
  const cases = [
    ['новый профиль собаки', 'dog', undefined, undefined, '', 'fetch'],
    ['собака: копия без cat', 'dog', { v: 1, day: OLD, keep: 1 }, { v: 1, day: OLD, by: 'old', mark: 2 }, '', 'fetch'],
    ['собака: прежнее cat curl', 'dog', { v: 1, day: OLD, cat: 'curl', keep: 1 }, { v: 1, day: OLD, by: 'old', cat: 'curl', mark: 2 }, 'curl', 'fetch'],
    ['прежний кот', 'cat', { v: 1, day: OLD, cat: 'curl', keep: 1 }, { v: 1, day: OLD, by: 'old', cat: 'curl', mark: 2 }, 'stretch', 'stretch'],
    ['расширение: новый профиль', 'example.bunny', undefined, undefined, '', 'hop'],
    ['расширение: прежнее cat curl', 'example.bunny', { v: 1, day: OLD, cat: 'curl', keep: 1 }, { v: 1, day: OLD, by: 'old', cat: 'curl', mark: 2 }, 'curl', 'hop'],
  ];
  for (const [name, pet, scene, prior, cat, type] of cases) await t.test(name, async () => {
    const store = sceneStore();
    if (prior) store.days.set('qa', prior);
    const port = reserver(store, 'qa');
    const extra = pet === 'example.bunny' ? { ext: BUNNY_EXT } : PETS[pet];
    const L = life({ cat: COMMON, ...extra, ...(scene ? { scene } : {}) }, { defs: ALL, display: DISPLAY, scenes: port.port, counts: host(4, 1) });
    assert.equal(L.core.start().ok, true, name);
    L.random.push(0, 0);
    L.core.notify('saved', { key: `d5-${name}`, counted: true });
    L.plan.advance(2000);
    await flush();
    assert.deepEqual([playing(L), port.steps.at(-1)], [type, '→ shown'], `${name}: сценка показана`);
    const record = store.days.get('qa');
    const copy = L.json('scene');
    assert.equal(record.cat, cat, `${name}: cat записи дня`);
    assert.equal(copy.cat, cat, `${name}: cat копии`);
    assert.equal(typeof copy.cat, 'string', `${name}: cat копии — строка`);
    assert.deepEqual(Object.keys(record).sort(), ['by', 'cat', 'day', 'v', ...(prior ? ['mark'] : [])].sort(), `${name}: ключи записи дня`);
    assert.deepEqual(Object.keys(copy).sort(), ['by', 'cat', 'day', 'v', ...(scene ? ['keep'] : [])].sort(), `${name}: ключи копии`);
    assert.deepEqual([record.day, copy.day, copy.by], [DAY, DAY, record.by], `${name}: день и метка — одной записи`);
    assert.deepEqual([record.mark, copy.keep], [prior ? 2 : undefined, scene ? 1 : undefined], `${name}: неизвестное цело`);
    assert.deepEqual([Object.hasOwn(record, 'variants'), Object.hasOwn(copy, 'variants')], [false, false], `${name}: без variants`);
    if (pet === 'example.bunny') assert.deepEqual(L.json('ext'), { ...BUNNY_EXT, scenes: { 'example.bunny': 'hop' } }, `${name}: вариант расширения — в ext:v1, выбор и неизвестное ext целы`);
    else assert.equal(L.raw('ext'), null, `${name}: ext:v1 нет`);
    L.core.destroy();
  });
});

test('повторная проверка в decide: смена модели (skip) и сужение объявления во время ожидания очереди — skip без записи; день сценки общий для питомцев и моделей', async () => {
  const store = sceneStore();
  const port = reserver(store, 'qa');
  port.mode.hold.add('enter');
  const L = pair('cat', 'calm', { scenes: port.port });
  L.random.push(0, 0, 0.99);
  L.core.notify('saved', { key: 'c', counted: true });
  assert.equal(L.state().scene.waiting.type, 'curl');
  L.plan.advance(calm.reactions.joy.ms);
  await flush();
  assert.equal(port.calls.reserve, 1, 'резервирование ждёт очереди');
  L.core.setBehavior('example.lively');
  await port.open('enter');
  assert.deepEqual([port.steps.at(-1), store.days.size, L.raw('scene')], ['→ skip', 0, null], 'попытка снята сменой модели — решение null');
  // Сужение объявления, пока попытка ждёт очереди: в decide сценки уже нет среди объявленных — skip.
  L.plan.advance(5000);
  L.random.push(0, 0);
  L.core.notify('saved', { key: 'c1', counted: true });
  assert.equal(L.state().scene.waiting.type, 'stretch');
  L.plan.advance(lively.reactions.joy.ms);
  await flush();
  assert.equal(port.calls.reserve, 2);
  assert.equal(L.core.setDisplay({ scenes: { ...SCENES, cat: ['curl'] } }).ok, true);
  await port.open('enter');
  assert.deepEqual([port.steps.at(-1), store.days.size, playing(L)], ['→ skip', 0, null], 'объявление сужено — skip без записи');
  // Показ при живой модели занимает день — и для calm, и для собаки второй сценки нет.
  port.mode.hold.clear();
  L.core.setDisplay({ scenes: SCENES });
  L.plan.advance(5000);
  L.random.push(0, 0);
  L.core.notify('saved', { key: 'c2', counted: true });
  L.plan.advance(lively.reactions.joy.ms);
  await flush();
  assert.deepEqual([playing(L), store.days.get('qa').day], ['stretch', DAY]);
  L.plan.advance(5000);
  for (const step of [() => L.core.setBehavior('calm'), () => L.core.setPet('dog')]) {
    step();
    L.plan.advance(2000);
    L.random.push(0, 0, 0);
    L.core.notify('saved', { key: `n${L.time.state.now}`, counted: true });
    assert.equal(L.state().scene.waiting, null, 'день занят — сценки нет');
  }
  L.core.destroy();
});

// ---------- запасной показ (§ 7.5, § 7.8) ----------

test('определение снято: выбор и данные расширения целы, показ — over, затем первый; возврат определения — питомец и его настройки', () => {
  const ext = { v: 1, pet: { id: 'example.bunny', over: 'dog' }, pets: { 'example.bunny': { name: 'Морковкин', accessory: 'bow', glow: 1 } }, behavior: 'example.lively', future: [1] };
  const stored = { cat: COMMON, companion: { v: 1, kind: 'dog' }, ext, look: { v: 1, 'example.bunny': 'grey' }, room: { v: 1, 'example.bunny': { carrot: { x: 60, y: 232 } } } };
  const without = life(stored, { defs: { pets: [cat, dog], behaviors: [calm] }, display: { views: VIEWS } });
  without.core.start();
  const s = without.state();
  assert.deepEqual([s.pet, s.behavior, Object.keys(s.pets)], [{ id: 'example.bunny', shown: 'dog', available: false }, { id: 'example.lively', shown: 'calm', available: false }, ['cat', 'dog']]);
  without.core.setName('Тобик');
  without.core.notify('saved', { key: 'x', counted: true });
  assert.deepEqual([without.json('ext'), without.json('look'), without.json('room')], [ext, stored.look, stored.room], 'данные расширения не тронуты');
  // Без over (выбор — неизвестный companion.kind): первый питомец списка.
  const first = life({ cat: COMMON, companion: { v: 1, kind: 'unicorn' } }, { defs: { pets: [dog, cat], behaviors: [calm] } });
  first.core.start();
  assert.deepEqual(first.state().pet, { id: 'unicorn', shown: 'dog', available: false });
  // Возврат определения — тот же питомец и его настройки.
  const back = life({}, { storage: without.storage, defs: ALL });
  back.core.start();
  assert.deepEqual([back.state().pet, back.state().name.value, back.state().look.coat, back.state().look.accessory, back.state().behavior.shown, back.state().room.pos.carrot], [{ id: 'example.bunny', shown: 'example.bunny', available: true }, 'Морковкин', 'grey', 'bow', 'example.lively', [60, 232]]);
  for (const L of [without, first, back]) L.core.destroy();
});

test('набора нет: отображение не рисует питомца — показ fallback определения, выбор прежний; setPet такого — unsupported', () => {
  const L = pair('example.bunny', 'calm', { display: { ...DISPLAY, pets: ['cat', 'dog'] }, shown: 'cat' });
  assert.deepEqual(L.state().pet, { id: 'example.bunny', shown: 'cat', available: true });
  assert.equal(L.core.setPet('example.bunny').error.code, 'unsupported');
  assert.equal(L.core.setPet('dog').ok, true, 'нарисованный — можно');
  L.core.setDisplay({ pets: ['dog', 'example.bunny'] });
  assert.deepEqual(L.state().pet.shown, 'dog');
  L.core.destroy();
  // Fallback тоже не нарисован — первый нарисованный.
  const M = pair('example.bunny', 'calm', { display: { ...DISPLAY, pets: ['dog'] }, shown: 'dog' });
  assert.deepEqual(M.state().pet, { id: 'example.bunny', shown: 'dog', available: true });
  M.core.destroy();
});

test('снимок PL06: pet и behavior — данные выбора и показа, pets — все зарегистрированные; глубоко заморожен, без функций и ссылок на определения', () => {
  const L = pair('example.bunny', 'example.lively');
  const s = L.state();
  assert.deepEqual(Object.keys(s.pets), ['cat', 'dog', 'example.bunny']);
  assert.deepEqual(s.pets['example.bunny'], { name: { value: '', chosen: false, display: 'Пух' }, coat: 'snow', accessory: 'ribbon', worn: 'ribbon' });
  const walk = (value) => {
    if (value && typeof value === 'object') {
      assert.equal(Object.isFrozen(value), true);
      assert.ok(![cat, dog, bunny, calm, lively].includes(value), 'не ссылка на определение');
      for (const item of Object.values(value)) walk(item);
    } else assert.notEqual(typeof value, 'function');
  };
  walk(s);
  assert.equal(L.state(), s, 'стабильная ссылка');
  L.core.destroy();
});
