// Пример расширения без браузера (в пакет не входит; test:package запускает его в чистом проекте с установленным архивом):
// третий питомец — кролик (bunny.mjs) и вторая модель поведения — «живая» (lively.mjs) подключаются к ядру только
// публичными входами pet-companion/core, /pets и /behaviors. Хранилище — Map, время, случайность, задачи и день сценки —
// свои порты; отображения нет: возможности объявляет setDisplay, состояние читается снимком. Каждый шаг сверяется
// assert. Последняя строка вывода — JSON-итог. Запуск: node node.mjs
import assert from 'node:assert/strict';
import { calm } from 'pet-companion/behaviors';
import { createPetCore, createStorage, defineBehavior, definePet, PetError } from 'pet-companion/core';
import { cat, dog } from 'pet-companion/pets';
import { bunny } from './bunny.mjs';
import { lively } from './lively.mjs';

// ---------- порты ----------
let now = Date.parse('2026-10-15T10:00:00Z');
const clock = { now: () => now, day: (at) => new Date(at).toISOString().slice(0, 10), nextDay: (at) => Date.parse(`${new Date(at).toISOString().slice(0, 10)}T00:00:00Z`) + 86_400_000 };
const tasks = [];
const scheduler = {
  later(ms, task) {
    const item = { at: now + ms, task, live: true };
    tasks.push(item);
    return () => (item.live = false);
  },
};
function advance(ms) {
  const target = now + ms;
  for (;;) {
    const next = tasks.filter((item) => item.live && item.at <= target).sort((a, b) => a.at - b.at)[0];
    if (!next) break;
    next.live = false;
    now = next.at;
    next.task();
  }
  now = target;
}
// Случайность — заданная очередь (затем 0.5): пример сам решает, будет ли сценка.
const rolls = [];
const random = () => (rolls.length ? rolls.shift() : 0.5);
const warnings = [];
const log = { warn: (message) => warnings.push(message) };
// День сценки — общий для всех питомцев и моделей: одна запись на хранилище (здесь — переменная).
let sceneDay;
const scenes = {
  async reserve(decide, show) {
    const record = decide(sceneDay);
    if (!record) return 'skip';
    sceneDay = record;
    show();
    return 'shown';
  },
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

const disk = new Map();
const storage = createStorage({ namespace: 'demo-ext', backend: { get: (name) => disk.get(name) ?? null, set: (name, text) => disk.set(name, text) } });
assert.equal(storage.load(), 'ready');
const json = (key) => JSON.parse(disk.get(`demo-ext:${key}:v1`) ?? 'null');

// ---------- подключение: три питомца, две модели ----------
const host = { marks: 4, today: 1, limit: 3 };
const options = { storage, scenes, progress: () => host, clock, scheduler, random, log, pets: [cat, dog, bunny], behaviors: [calm, lively] };
const pet = createPetCore(options);
assert.deepEqual(Object.keys(pet.getState().pets), ['cat', 'dog', 'example.bunny']);
assert.deepEqual(pet.getState().behavior, { id: 'calm', shown: 'calm', available: true });
assert.equal(pet.start().ok, true);
// Отображение объявляет, что рисует: питомцев, виды и сценки (как веб-наборы примера) и пол «Поиграть».
pet.setDisplay({ pets: ['cat', 'dog', 'example.bunny'], views: ['corner', 'play', 'room'], scenes: { cat: ['stretch', 'curl'], dog: ['fetch'], 'example.bunny': ['hop'] }, playFloor: [-40, -10, 300, 230] });

// Выбор кролика — только ext:v1 (companion не трогается: вкладки 0.1.4 видят прежнего кота).
const chosen = pet.setPet('example.bunny');
assert.deepEqual([chosen.save.keys, json('ext').pet, json('companion')], [['ext'], { id: 'example.bunny', over: 'cat' }, null]);
advance(5000);
assert.equal(pet.setName('Морковкин').save.status, 'saved');
assert.equal(pet.setAppearance({ coat: 'grey', accessory: 'bow' }).ok, true);
assert.deepEqual([json('ext').pets, json('look')], [{ 'example.bunny': { name: 'Морковкин', accessory: 'bow' } }, { v: 1, 'example.bunny': 'grey' }]);

// Лапы у кролика нет: «Дай лапу» и лапа в «Поиграть» — unsupported без изменений.
advance(5000);
assert.equal(pet.open('play').ok, true);
const before = pet.getState();
assert.equal(pet.interact({ type: 'paw' }).error.code, 'unsupported');
assert.equal(pet.getState(), before);
// Поглаживание: calm у кролика — общие реплики calm; живая модель — свои замены для кролика и лимит два.
rolls.push(0);
assert.equal(pet.interact({ type: 'pet' }).outcome, 'pet');
assert.ok(calm.phrases.default.pet.includes(pet.getState().scenePhrase));
advance(1500);
assert.equal(pet.setBehavior('example.lively').save.keys.join(), 'ext');
const outcomes = [];
for (let i = 0; i < 3; i += 1) {
  rolls.push(0);
  outcomes.push(pet.interact({ type: 'pet' }).outcome);
  if (i === 0) assert.ok(lively.phrases.byPet['example.bunny'].pet.includes(pet.getState().scenePhrase));
  advance(1200);
}
assert.deepEqual(outcomes, ['pet', 'enough', 'quiet'], 'calm уже дал один полный отклик — лимит общий, у живой модели он два');
pet.close();

// Сценка кролика hop: реплика радости (0), шанс 0 < 0,15; вариант один — без броска. День сценки один на всех.
advance(10_000);
rolls.push(0, 0);
assert.equal(pet.notify('saved', { key: 'lesson-1', counted: true }).ok, true);
assert.equal(pet.getState().scene.waiting.type, 'hop');
advance(lively.reactions.joy.ms);
await settle();
assert.deepEqual([pet.getState().pose.reaction.type, json('scene').variants], ['hop', { 'example.bunny': 'hop' }]);
advance(10_000);
pet.setPet('cat');
advance(5000);
rolls.push(0, 0, 0);
pet.notify('saved', { key: 'lesson-2', counted: true });
assert.equal(pet.getState().scene.waiting, null, 'день сценки уже занят кроликом');
pet.setPet('example.bunny');
pet.destroy();

// ---------- без определения кролика: запасной показ, данные целы; с определением — тот же кролик ----------
const plain = createPetCore({ ...options, pets: [cat, dog], behaviors: [calm] });
assert.deepEqual([plain.getState().pet, plain.getState().behavior], [{ id: 'example.bunny', shown: 'cat', available: false }, { id: 'example.lively', shown: 'calm', available: false }]);
plain.setName('Барсик');
plain.destroy();
assert.deepEqual(json('ext').pets['example.bunny'], { name: 'Морковкин', accessory: 'bow' });
const back = createPetCore(options);
assert.deepEqual([back.getState().pet.shown, back.getState().name.display, back.getState().look.coat, back.getState().behavior.shown], ['example.bunny', 'Морковкин', 'grey', 'example.lively']);
back.destroy();

// ---------- ошибочные ссылки (§ 7.3): отклоняются при определении, слабая ссылка — журнал ----------
const copy = (def) => JSON.parse(JSON.stringify(def));
const invalid = (make, path) => assert.throws(make, (error) => error instanceof PetError && error.code === 'definition-invalid' && error.path === path, path);
invalid(() => definePet({ ...copy(bunny), scenes: [{ ...copy(bunny).scenes[0], pose: 'jump' }] }), 'scenes[0].pose');
invalid(() => definePet({ ...copy(bunny), actions: { pet: { text: '{name} шевелит носом.' }, paw: { text: '{name} даёт лапу.', ask: true } } }), 'poses');
invalid(() => defineBehavior({ ...copy(lively), reactions: { ...copy(lively).reactions, joy: { pose: 'yawn', ms: 1100, priority: 4, phrases: 'joy' } } }), 'reactions.joy.pose');
invalid(() => defineBehavior({ ...copy(lively), scenes: { chance: 0.15, order: 'random', skip: ['Bunny jump'] } }), 'scenes.skip[0]');
const weak = defineBehavior({ ...copy(lively), id: 'example.weak', scenes: { chance: 0.15, order: 'random', skip: ['example.bunny/jump'] } });
const count = warnings.length;
createPetCore({ ...options, behaviors: [calm, weak] }).destroy();
assert.equal(warnings.length, count + 1, 'skip несуществующей сценки — log.warn, регистрация проходит');

console.log(JSON.stringify({ ok: true, pets: Object.keys(pet.getState().pets), behaviors: ['calm', 'example.lively'], stored: [...disk.keys()].sort(), ext: json('ext'), warnings: warnings.length }));
