// PL06 в Node — определения формата 1 (docs/ARCHITECTURE.md § 7.1–7.3, § 7.1.1): definePet и defineBehavior через публичный
// вход pet-companion/core — собственная глубоко неизменяемая копия (правка исходника после define ничего не меняет;
// унаследованное, аксессоры, пропуски массивов, функции, undefined, циклы — отказ с путём); дефекты — definition-invalid с
// точным path (обязательные поля, формы, числа и границы 0.1.4, позы и замены без циклов, лапа только при возможности,
// сценки — своя поза, уникальный ID, needs, ms ≤ 4600, still ≤ ms; модель — обязательные реакции и их классы поз,
// группы реплик и длина строк, шанс ≤ 0,25, лимит ≤ 3, ссылки byPet и skip), неизвестный format — unsupported-format;
// регистрация — списки на экземпляр: повтор ID — duplicate-id, ошибка определения в списке — путь pets[i]…, слабые ссылки
// модели на питомца или сценку, которых нет, — одно предупреждение журнала на ссылку при создании, не ошибка; ошибка —
// до подключения к координатору (ни чтения, ни записи, ни задач); два экземпляра с разными регистрациями — без общего
// реестра. Штатные кот, собака, calm и пример (examples/extension: кролик, живая модель) проходят проверку.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPetCore, createStorage, defineBehavior, definePet, PetError } from '../pet/core.mjs';
import { calm } from '../pet/behaviors.mjs';
import { cat, dog } from '../pet/pets.mjs';
import { bunny } from '../examples/extension/bunny.mjs';
import { lively } from '../examples/extension/lively.mjs';

// Изменяемая глубокая копия определения (данные; для правок в проверках).
const clone = (value) => JSON.parse(JSON.stringify(value));
const fails = (fn, code, path) => {
  let error = null;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof PetError, `ожидался PetError ${code} ${path}: ${error}`);
  assert.equal(error.code, code, `${path}: ${error.message}`);
  if (path !== undefined) assert.equal(error.path, path, error.message);
  return error;
};
let spaces = 0;
function store() {
  const data = new Map();
  const log = [];
  const backend = { get: (name) => (log.push(`get ${name}`), data.get(name) ?? null), set: (name, text) => (log.push(`set ${name}`), data.set(name, text)) };
  const storage = createStorage({ namespace: `def${++spaces}`, backend });
  storage.load();
  return { data, log, storage };
}

test('штатные и пример: кот, собака, calm, кролик и живая модель проходят проверку; копии глубоко заморожены', () => {
  for (const def of [cat, dog, calm, bunny, lively]) {
    assert.equal(Object.isFrozen(def), true, def.id);
    assert.equal(Object.isFrozen(def.room?.toys ?? def.reactions), true, def.id);
  }
  assert.equal(definePet(cat), cat, 'уже проверенная копия — та же');
  assert.equal(defineBehavior(calm), calm);
  assert.deepEqual(definePet(clone(cat)), cat, 'данные кота проходят снова (своя копия)');
  assert.notEqual(definePet(clone(cat)), cat);
});

test('копия: правка исходника после define не меняет определение и ядро; исходник не заморожен', () => {
  const source = clone(bunny);
  const def = definePet(source);
  assert.equal(Object.isFrozen(source), false, 'исходник не заморожен');
  source.title = 'Заяц';
  source.coats.push({ id: 'gold', title: 'Золотой' });
  source.actions.pet.text = 'другое';
  assert.deepEqual([def.title, def.coats.length, def.actions.pet.text], ['Кролик', 3, '{name} шевелит носом.']);
  // Сырые данные в createPetCore тоже копируются: правка после создания ядра его не меняет.
  const raw = clone(lively);
  const { storage } = store();
  const core = createPetCore({ storage, pets: [cat], behaviors: [raw] });
  raw.reactions.joy.ms = 200;
  raw.id = 'example.other';
  assert.equal(core.getState().behavior.id, 'example.lively');
  core.destroy();
  assert.throws(() => {
    'use strict';
    def.title = 'x';
  }, TypeError);
});

test('копия: только собственные свойства-данные простых объектов и плотных массивов — иначе отказ с путём', () => {
  const inherited = Object.create(clone(bunny));
  fails(() => definePet(inherited), 'definition-invalid', '');
  const proto = { format: 1 };
  const own = Object.assign(Object.create(proto), clone(bunny));
  delete own.format;
  fails(() => definePet(own), 'definition-invalid', '');
  const getter = clone(bunny);
  Object.defineProperty(getter, 'title', { get: () => 'Кролик', enumerable: true });
  fails(() => definePet(getter), 'definition-invalid', 'title');
  const holes = clone(bunny);
  holes.poses = ['calm', , 'rest'];
  fails(() => definePet(holes), 'definition-invalid', 'poses[1]');
  const extra = clone(bunny);
  extra.micro = ['ear'];
  extra.micro.more = 'x';
  fails(() => definePet(extra), 'definition-invalid', 'micro.more');
  const fn = clone(bunny);
  fn.actions.pet.text = () => 'мурлычет';
  fails(() => definePet(fn), 'definition-invalid', 'actions.pet.text');
  const undef = clone(bunny);
  undef.poseFallback = undefined;
  fails(() => definePet(undef), 'definition-invalid', 'poseFallback');
  const cycle = clone(bunny);
  cycle.play.self = cycle.play;
  fails(() => definePet(cycle), 'definition-invalid', 'play.self');
  const unknown = clone(bunny);
  unknown.colour = 'white';
  fails(() => definePet(unknown), 'definition-invalid', 'colour');
  const proto2 = clone(bunny);
  Object.defineProperty(proto2, '__proto__', { value: { x: 1 }, enumerable: true, configurable: true, writable: true });
  fails(() => definePet(proto2), 'definition-invalid', '__proto__');
  fails(() => definePet(null), 'definition-invalid', '');
  fails(() => definePet([]), 'definition-invalid', '');
});

test('формат: неизвестный целый — unsupported-format; не число и дробь — definition-invalid; нет — definition-invalid', () => {
  fails(() => definePet({ ...clone(bunny), format: 2 }), 'unsupported-format', 'format');
  fails(() => defineBehavior({ ...clone(lively), format: 0 }), 'unsupported-format', 'format');
  fails(() => definePet({ ...clone(bunny), format: '1' }), 'definition-invalid', 'format');
  fails(() => definePet({ ...clone(bunny), format: 1.5 }), 'definition-invalid', 'format');
  const none = clone(bunny);
  delete none.format;
  fails(() => definePet(none), 'definition-invalid', 'format');
});

test('питомец: ID — штатный или с точкой; поля, формы, имена, облики, аксессуары, вещи и подарки — по границам', () => {
  const pet = (patch, path, code = 'definition-invalid') => fails(() => definePet(patch(clone(bunny))), code, path);
  for (const id of ['bunny', 'Example.Bunny', 'example.', '.bunny', 'example..bunny', 'example bunny', '', 5]) pet((d) => ({ ...d, id }), 'id');
  assert.equal(definePet({ ...clone(bunny), id: 'my-site.pets.bunny-2' }).id, 'my-site.pets.bunny-2', 'несколько точек');
  pet((d) => ({ ...d, title: '' }), 'title');
  pet((d) => ({ ...d, title: 'x'.repeat(41) }), 'title');
  pet((d) => ({ ...d, title: 'Кро\nлик' }), 'title');
  pet((d) => ({ ...d, forms: { gen: 'кролика' } }), 'forms.acc');
  pet((d) => ({ ...d, names: { ...d.names, default: ' Пух' } }), 'names.default');
  pet((d) => ({ ...d, names: { ...d.names, default: 'Пух<' } }), 'names.default');
  pet((d) => ({ ...d, names: { ...d.names, presets: ['Пух', 'Пух'] } }), 'names.presets[1]');
  pet((d) => ({ ...d, names: { ...d.names, presets: [] } }), 'names.presets');
  pet((d) => ({ ...d, names: { ...d.names, offer: 'Кто-то' } }), 'names.offer');
  pet((d) => ({ ...d, coats: [] }), 'coats');
  pet((d) => ({ ...d, coats: [...d.coats, { id: 'snow', title: 'Ещё' }] }), 'coats[3]');
  pet((d) => ({ ...d, coats: [{ id: 'Snow', title: 'Белый' }] }), 'coats[0].id');
  pet((d) => ({ ...d, accessories: [{ id: 'bow', title: 'Бантик', stage: 1 }] }), 'accessories[0].stage');
  pet((d) => ({ ...d, accessories: [...d.accessories, { id: 'x', title: 'X', stage: 5 }] }), 'accessories[3].stage');
  pet((d) => ({ ...d, accessories: [...d.accessories, { id: 'x', title: 'X', stage: 1.5 }] }), 'accessories[3].stage');
  pet((d) => ({ ...d, items: { ...d.items, gifts: d.items.gifts.slice(1) } }), 'items.gifts');
  pet((d) => ({ ...d, items: { ...d.items, list: [{ id: 'mug', title: 'Кружка', stage: -1 }] } }), 'items.list[0].stage');
  pet((d) => ({ ...d, items: { ...d.items, list: [{ id: 'mug', title: 'Кружка', stage: 2, mini: 10 }] } }), 'items.list[0].mini');
  pet((d) => ({ ...d, fallback: 'example.bunny' }), 'fallback');
  pet((d) => ({ ...d, fallback: 'fox' }), 'fallback');
});

test('позы: calm обязательна сама; обязательные — сами или заменой; замена — на позу словаря, без циклов; своя поза — только у сценки', () => {
  const pet = (patch, path) => fails(() => definePet(patch(clone(bunny))), 'definition-invalid', path);
  pet((d) => ({ ...d, poses: d.poses.filter((p) => p !== 'calm') }), 'poses');
  pet((d) => ({ ...d, poseFallback: { ...d.poseFallback, calm: 'joy' }, poses: d.poses.filter((p) => p !== 'calm') }), 'poses');
  pet((d) => ({ ...d, poses: d.poses.filter((p) => p !== 'feed') }), 'poses');
  // Поза — цель замены другой: пропала — ошибка у замены.
  pet((d) => ({ ...d, poses: d.poses.filter((p) => p !== 'joy') }), 'poseFallback.unlock');
  const noWait = (d) => {
    const fallback = { ...d.poseFallback };
    delete fallback.wait;
    return { ...d, poseFallback: fallback };
  };
  pet(noWait, 'poses');
  pet((d) => ({ ...d, poseFallback: { ...d.poseFallback, wait: 'jump' } }), 'poseFallback.wait');
  pet((d) => ({ ...d, poseFallback: { ...d.poseFallback, wait: 'support', support: 'wait' } }), 'poseFallback.wait');
  pet((d) => ({ ...d, poseFallback: { ...d.poseFallback, joy: 'calm' } }), 'poseFallback.joy');
  pet((d) => ({ ...d, poseFallback: { ...d.poseFallback, hop: 'calm' } }), 'poseFallback.hop');
  pet((d) => ({ ...d, poses: [...d.poses, 'dance'] }), `poses[${bunny.poses.length}]`);
  pet((d) => ({ ...d, poses: [...d.poses, 'calm'] }), `poses[${bunny.poses.length}]`);
  // Цепочка замен допустима, если ведёт к позе питомца.
  const chain = clone(bunny);
  chain.poseFallback = { ...chain.poseFallback, wait: 'watch', watch: 'attentive' };
  assert.equal(definePet(chain).poseFallback.wait, 'watch');
});

test('лапа — возможность: actions.paw — нужна поза paw (или замена) и область; без лапы — ни позы, ни области', () => {
  const pet = (patch, path) => fails(() => definePet(patch(clone(bunny))), 'definition-invalid', path);
  pet((d) => ({ ...d, actions: { ...d.actions, paw: { text: '{name} даёт лапу.', ask: true } } }), 'poses');
  pet((d) => ({ ...d, actions: { ...d.actions, paw: { text: '{name} даёт лапу.', ask: true } }, poses: [...d.poses, 'paw'] }), 'play.paw');
  pet((d) => ({ ...d, actions: { ...d.actions, paw: { text: 'x', ask: 'yes' } }, poses: [...d.poses, 'paw'], play: { ...d.play, paw: { cx: 90, cy: 176, r: 15 } } }), 'actions.paw.ask');
  pet((d) => ({ ...d, poses: [...d.poses, 'paw'] }), `poses[${bunny.poses.length}]`);
  pet((d) => ({ ...d, play: { ...d.play, paw: { cx: 90, cy: 176, r: 15 } } }), 'play.paw');
  pet((d) => ({ ...d, poseFallback: { ...d.poseFallback, paw: 'joy' } }), 'poseFallback.paw');
  const withPaw = clone(bunny);
  withPaw.actions.paw = { text: '{name} даёт лапу.', ask: false };
  withPaw.poseFallback.paw = 'joy';
  withPaw.play.paw = { cx: 90, cy: 176, r: 15 };
  assert.equal(definePet(withPaw).actions.paw.ask, false, 'лапа заменой позы — допустимо');
});

test('сценки: своя поза питомца, уникальный ID не из словаря реакций, needs any|full, ms ≤ 4600, still ≤ ms; пустой список — допустим', () => {
  const pet = (patch, path) => fails(() => definePet(patch(clone(bunny))), 'definition-invalid', path);
  const scene = (patch) => (d) => ({ ...d, scenes: [{ ...d.scenes[0], ...patch }] });
  pet(scene({ pose: 'jump' }), 'scenes[0].pose');
  pet(scene({ needs: 'portrait' }), 'scenes[0].needs');
  pet(scene({ ms: 4601 }), 'scenes[0].ms');
  pet(scene({ ms: 499 }), 'scenes[0].ms');
  pet(scene({ still: 2600 }), 'scenes[0].still');
  pet(scene({ id: 'joy' }), 'scenes[0].id');
  pet(scene({ id: 'Hop' }), 'scenes[0].id');
  pet(scene({ text: '' }), 'scenes[0].text');
  pet((d) => ({ ...d, scenes: [d.scenes[0], d.scenes[0]] }), 'scenes[1]');
  const none = clone(bunny);
  none.scenes = [];
  none.poses = none.poses.filter((pose) => pose !== 'hop');
  assert.deepEqual(definePet(none).scenes, []);
});

test('геометрия: размер, области, лапа, стойка, комната — конечные числа и рамки l < r, t < b', () => {
  const pet = (patch, path) => fails(() => definePet(patch(clone(bunny))), 'definition-invalid', path);
  pet((d) => ({ ...d, size: { ...d.size, width: Infinity } }), 'size.width');
  pet((d) => ({ ...d, size: { ...d.size, ground: 300 } }), 'size.ground');
  pet((d) => ({ ...d, play: { ...d.play, hits: [] } }), 'play.hits');
  pet((d) => ({ ...d, play: { ...d.play, hits: [{ ...d.play.hits[0], rx: 0 }] } }), 'play.hits[0].rx');
  pet((d) => ({ ...d, play: { ...d.play, hits: [{ ...d.play.hits[0], part: 'paw' }] } }), 'play.hits[0].part');
  pet((d) => ({ ...d, play: { ...d.play, foot: [100, 50, 190] } }), 'play.foot');
  pet((d) => ({ ...d, play: { ...d.play, anchor: [1, NaN] } }), 'play.anchor[1]');
  pet((d) => ({ ...d, room: { ...d.room, feed: [10, 0, -10, 5] } }), 'room.feed');
  pet((d) => ({ ...d, room: { ...d.room, toys: [{ ...d.room.toys[0], id: 'bowl' }] } }), 'room.toys[0].id');
  pet((d) => ({ ...d, room: { ...d.room, toys: [{ ...d.room.toys[0], home: [40] }] } }), 'room.toys[0].home');
  pet((d) => ({ ...d, room: { ...d.room, seats: [d.room.seats[1], d.room.seats[0]] } }), 'room.seats[0].stage');
  pet((d) => ({ ...d, room: { ...d.room, fixed: [{ stage: 2, box: [1, 2, 3] }] } }), 'room.fixed[0].box');
});

test('модель: обязательные и реакции лапы; классы поз; длительности и паузы — границы 0.1.4; приоритеты; группы и строки реплик', () => {
  const model = (patch, path, code = 'definition-invalid') => fails(() => defineBehavior(patch(clone(lively))), code, path);
  for (const id of ['lively', 'Example.lively', '']) model((d) => ({ ...d, id }), 'id');
  const without = (type) => (d) => {
    const reactions = { ...d.reactions };
    delete reactions[type];
    return { ...d, reactions };
  };
  model(without('joy'), 'reactions.joy');
  model(without('calmPaw'), 'reactions.calmPaw');
  const yawnless = defineBehavior(without('settle')(clone(lively)));
  assert.equal(yawnless.reactions.settle, undefined, 'декоративные — необязательны');
  const r = (type, patch) => (d) => ({ ...d, reactions: { ...d.reactions, [type]: { ...d.reactions[type], ...patch } } });
  model(r('joy', { pose: 'yawn' }), 'reactions.joy.pose');
  model(r('joy', { pose: 'paw' }), 'reactions.joy.pose');
  model(r('joy', { pose: 'dance' }), 'reactions.joy.pose');
  model(r('paw', { pose: 'settle' }), 'reactions.paw.pose');
  model(r('joy', { ms: 1501 }), 'reactions.joy.ms');
  model(r('joy', { ms: 100 }), 'reactions.joy.ms');
  model(r('feed', { ms: 2801 }), 'reactions.feed.ms');
  model(r('meet', { cooldown: 5999 }), 'reactions.meet.cooldown');
  model((d) => without('cooldown')({ ...d, reactions: { ...d.reactions, wait: { pose: 'wait', ms: 700, priority: 3 } } }), 'reactions.wait.cooldown');
  model(r('joy', { priority: 2 }), 'reactions.joy.priority');
  model(r('joy', { priority: 8 }), 'reactions.joy.priority');
  model(r('settle', { priority: 6 }), 'reactions.settle.priority');
  model(r('joy', { calmOnly: true }), 'reactions.joy.calmOnly');
  model(r('joy', { decorative: true }), 'reactions.joy.decorative');
  model(r('sniff', { toy: false }), 'reactions.sniff.toy');
  model(r('joy', { phrases: 'cheer' }), 'reactions.joy.phrases');
  model((d) => ({ ...d, reactions: { ...d.reactions, stretch: { pose: 'joy', ms: 900, priority: 7 } } }), 'reactions.stretch');
  model((d) => ({ ...d, phrases: { ...d.phrases, default: { ...d.phrases.default, joy: [] } } }), 'phrases.default.joy');
  model((d) => ({ ...d, phrases: { ...d.phrases, default: { ...d.phrases.default, joy: ['x'.repeat(121)] } } }), 'phrases.default.joy[0]');
  model((d) => ({ ...d, phrases: { ...d.phrases, default: { ...d.phrases.default, joy: [{ text: 'x', stage: 7 }] } } }), 'phrases.default.joy[0].stage');
  const noScene = (d) => {
    const groups = { ...d.phrases.default };
    delete groups.scene;
    return { ...d, phrases: { ...d.phrases, default: groups } };
  };
  model(noScene, 'phrases.default');
  model((d) => ({ ...d, phrases: { ...d.phrases, byPet: { bunny: {} } } }), 'phrases.byPet.bunny');
  model((d) => ({ ...d, phrases: { ...d.phrases, byPet: { 'example.bunny': { cheer: ['x'] } } } }), 'phrases.byPet["example.bunny"].cheer');
});

test('модель: интервалы покоя не чаще 0.1.4, зевок ≤ 0,18, облако ≤ 3,2 с, лимит 1…3, шанс 0…0,25, порядок, skip — синтаксис ссылки', () => {
  const model = (patch, path) => fails(() => defineBehavior(patch(clone(lively))), 'definition-invalid', path);
  model((d) => ({ ...d, timings: { ...d.timings, blink: { ...d.timings.blink, normal: [11_000, 28_000] } } }), 'timings.blink.normal[0]');
  model((d) => ({ ...d, timings: { ...d.timings, micro: { ...d.timings.micro, calm: [90_000, 80_000] } } }), 'timings.micro.calm[1]');
  model((d) => ({ ...d, timings: { ...d.timings, yawn: 0.2 } }), 'timings.yawn');
  model((d) => ({ ...d, timings: { ...d.timings, phrase: 3300 } }), 'timings.phrase');
  model((d) => ({ ...d, limits: { pet: 4 } }), 'limits.pet');
  model((d) => ({ ...d, limits: { pet: 0 } }), 'limits.pet');
  model((d) => ({ ...d, scenes: { ...d.scenes, chance: 0.26 } }), 'scenes.chance');
  model((d) => ({ ...d, scenes: { ...d.scenes, chance: -0.1 } }), 'scenes.chance');
  model((d) => ({ ...d, scenes: { ...d.scenes, order: 'shuffle' } }), 'scenes.order');
  model((d) => ({ ...d, scenes: { ...d.scenes, skip: ['Bunny jump'] } }), 'scenes.skip[0]');
  model((d) => ({ ...d, scenes: { ...d.scenes, skip: ['cat/curl', 'cat/curl'] } }), 'scenes.skip[1]');
  model((d) => ({ ...d, scenes: { ...d.scenes, skip: ['bunny/hop'] } }), 'scenes.skip[0]');
  assert.equal(defineBehavior({ ...clone(lively), scenes: { chance: 0, order: 'random' } }).scenes.chance, 0, 'шанс 0 и без skip — допустимо');
});

test('ошибочные ссылки примера § 7.3: сценка с позой не из poses, лапа без позы, обязательная реакция на необязательной позе — отказ; skip на чужую сценку — предупреждение', () => {
  fails(() => definePet({ ...clone(bunny), scenes: [{ ...bunny.scenes[0], pose: 'jump' }] }), 'definition-invalid', 'scenes[0].pose');
  fails(() => definePet({ ...clone(bunny), actions: { ...bunny.actions, paw: { text: '{name} даёт лапу.', ask: true } } }), 'definition-invalid', 'poses');
  fails(() => defineBehavior({ ...clone(lively), reactions: { ...clone(lively.reactions), joy: { pose: 'yawn', ms: 900, priority: 4 } } }), 'definition-invalid', 'reactions.joy.pose');
  fails(() => defineBehavior({ ...clone(lively), scenes: { ...lively.scenes, skip: ['Bunny jump'] } }), 'definition-invalid', 'scenes.skip[0]');
  const warned = defineBehavior({ ...clone(lively), scenes: { ...lively.scenes, skip: ['example.bunny/jump'] } });
  const { storage } = store();
  const log = [];
  const core = createPetCore({ storage, pets: [cat, dog, bunny], behaviors: [calm, warned], log: { warn: (message) => log.push(message) } });
  assert.deepEqual(log, ['behaviors[1].scenes.skip: «example.bunny/jump» — у питомца «example.bunny» нет сценки «jump»']);
  core.destroy();
});

test('регистрация: непустые списки; повтор ID — duplicate-id с путём; дефект в списке — путь pets[i]…; формат — unsupported-format; ошибка — до подключения и записи', () => {
  const { storage, log } = store();
  const before = log.length;
  fails(() => createPetCore({ storage, pets: [], behaviors: [calm] }), 'invalid-options');
  fails(() => createPetCore({ storage, pets: [cat], behaviors: [] }), 'invalid-options');
  fails(() => createPetCore({ storage, pets: cat, behaviors: [calm] }), 'invalid-options');
  fails(() => createPetCore({ storage, pets: [cat, , dog], behaviors: [calm] }), 'invalid-options');
  fails(() => createPetCore({ storage, behaviors: [calm] }), 'invalid-options');
  fails(() => createPetCore({ storage, pets: [cat, dog, cat], behaviors: [calm] }), 'duplicate-id', 'pets[2].id');
  fails(() => createPetCore({ storage, pets: [cat], behaviors: [calm, lively, clone(calm)] }), 'duplicate-id', 'behaviors[2].id');
  fails(() => createPetCore({ storage, pets: [cat, { ...clone(bunny), scenes: [{ ...bunny.scenes[0], pose: 'jump' }] }], behaviors: [calm] }), 'definition-invalid', 'pets[1].scenes[0].pose');
  fails(() => createPetCore({ storage, pets: [cat], behaviors: [calm, { ...clone(lively), format: 2 }] }), 'unsupported-format', 'behaviors[1].format');
  fails(() => createPetCore({ storage, pets: [calm], behaviors: [calm] }), 'definition-invalid', 'pets[0]');
  fails(() => createPetCore({ storage, pets: [cat], behaviors: [cat] }), 'definition-invalid', 'behaviors[0]');
  assert.equal(log.length, before, 'отказ создания хранилище не трогает');
});

test('слабые ссылки модели: byPet и skip на питомца или сценку, которых в экземпляре нет, — по одному предупреждению при создании; любая пара совместима', () => {
  const { storage } = store();
  const log = [];
  const core = createPetCore({ storage, pets: [bunny], behaviors: [calm, lively], log: { warn: (message) => log.push(message) } });
  assert.deepEqual(log, [
    'behaviors[0].phrases.byPet["cat"]: питомца «cat» нет в этом экземпляре — замены реплик не используются',
    'behaviors[0].phrases.byPet["dog"]: питомца «dog» нет в этом экземпляре — замены реплик не используются',
    'behaviors[1].scenes.skip: «cat/curl» — питомца «cat» нет в этом экземпляре',
  ]);
  assert.deepEqual([core.getState().pet.shown, core.getState().behavior.shown], ['example.bunny', 'calm']);
  core.destroy();
  const quiet = [];
  createPetCore({ storage, pets: [cat, dog, bunny], behaviors: [calm, lively], log: { warn: (message) => quiet.push(message) } }).destroy();
  assert.deepEqual(quiet, [], 'все ссылки разрешены — тихо');
});

test('реестр — на экземпляр: два ядра с разными регистрациями не мешают друг другу; общего изменяемого реестра нет', () => {
  const { storage } = store();
  const a = createPetCore({ storage, pets: [cat, dog, bunny], behaviors: [calm, lively] });
  const b = createPetCore({ storage, pets: [dog], behaviors: [lively] });
  assert.equal(a.setPet('example.bunny').ok, true);
  assert.equal(b.setPet('example.bunny').error.code, 'unknown-id', 'у второго ядра кролика нет');
  assert.equal(b.setBehavior('calm').error.code, 'unknown-id');
  assert.deepEqual([b.getState().pet.id, b.getState().pet.available, b.getState().pet.shown], ['example.bunny', false, 'dog'], 'выбор другого ядра — недоступен здесь, показ — его первый');
  assert.deepEqual([a.getState().behavior.id, b.getState().behavior.id, b.getState().behavior.shown], ['calm', 'example.lively', 'example.lively'], 'модель без выбора — первая своего списка у каждого');
  assert.deepEqual(Object.keys(a.getState().pets), ['cat', 'dog', 'example.bunny']);
  assert.deepEqual(Object.keys(b.getState().pets), ['dog']);
  a.destroy();
  b.destroy();
});
