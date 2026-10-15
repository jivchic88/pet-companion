// Пример: питомец без браузера — только публичный вход pet-companion/core (Node 22+; в пакет не входит, test:package
// запускает его в чистом проекте с установленным архивом). Хранилище — своё (здесь Map; синхронное и асинхронное с ручным
// подтверждением), время, случайность и задачи — свои порты; отображения нет: состояние читается снимком и подпиской.
// Каждый шаг сверяется assert — пример заодно проверяет обещания README. Запуск: node core-node.mjs
import assert from 'node:assert/strict';
import { createPetCore, createStorage, localDay, PetError, VERSION } from 'pet-companion/core';

// ---------- порты: ручные часы, планировщик, случайность ----------
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
// Продвинуть время: задачи ядра срабатывают по порядку (конец реакции, покой, полночь).
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
const random = () => 0.5;
const warnings = [];
const log = { warn: (message) => warnings.push(message) };

// ---------- синхронное хранилище ----------
const disk = new Map();
const deny = new Set(); // имена ключей, запись которых откажет
const backend = {
  get: (name) => disk.get(name) ?? null,
  set: (name, text) => {
    if (deny.has(name)) throw new Error(`нет места: ${name}`);
    disk.set(name, text);
  },
};
const storage = createStorage({ namespace: 'demo', backend });
assert.equal(storage.load(), 'ready');

// Счёт ведёт хост: сначала сохранить занятие, затем обновить счёт, затем сообщить ядру.
const host = { marks: 0, today: 0, limit: 3 };
const options = { storage, progress: () => host, clock, scheduler, random, log };
const pet = createPetCore(options);
const updates = [];
const off = pet.subscribe(({ snapshot, effects, reason }) => updates.push({ reason, name: snapshot.name.display, effects: effects.map((effect) => effect.type) }));
assert.equal(updates[0].reason, 'initial', 'подписка сразу получает снимок');
assert.equal(pet.status, 'created');
assert.deepEqual(pet.start(), { ok: true, changed: true, save: { status: 'saved', keys: ['cat'], results: { cat: 'saved' } } });

// Имя: своё — тихо; готовое — отклик и объявление.
assert.equal(pet.setName('Барсик').reacted, false);
advance(5000);
const preset = pet.setName('Пиксель');
assert.deepEqual([preset.ok, preset.reacted, preset.save.status], [true, true, 'saved']);
assert.ok(updates.at(-1).effects.includes('announce'));

// Подтверждённое занятие: счёт хоста уже включает знак; key — непустой.
host.marks = 1;
host.today = 1;
const lesson = pet.notify('saved', { key: 'lesson-1', counted: true, first: true });
assert.deepEqual([lesson.ok, lesson.reacted, lesson.duplicate], [true, true, false]);
assert.equal(pet.notify('saved', { key: '' }).error.code, 'invalid-argument');
assert.equal(pet.notify('saved', { key: 'lesson-1', counted: true }).duplicate, true, 'повтор того же события — без реакции');
advance(5000);

// Кормление: один раз за местный день.
assert.equal(pet.feed().ok, true);
assert.equal(pet.feed().error.code, 'treat-fed');
assert.equal(pet.getState().treat, 'fed');

// Другой питомец, облик, настройки.
assert.equal(pet.setPet('dog').ok, true);
assert.equal(pet.getState().name.display, 'Тоби');
assert.equal(pet.setPet('fox').error.code, 'unknown-id');
assert.equal(pet.setAppearance({ coat: 'spotted' }).save.status, 'saved');
assert.equal(pet.setPreferences({ motion: 'calm' }).ok, true);

// Отказ хранилища — правка действует, не сохранена; partial у команды с двумя ключами.
deny.add('demo:companion:v1');
const both = pet.setAppearance({ coat: 'blacktan', accessory: 'scarf' });
// Аксессуар уже scarf — пишется только облик.
assert.deepEqual(both.save, { status: 'saved', keys: ['look'], results: { look: 'saved' } });
const failed = pet.setName('Батон');
assert.deepEqual([failed.ok, failed.save.status, pet.getState().name.value, pet.getState().save.companion.status], [true, 'failed', 'Батон', 'failed']);
deny.clear();

// Виды объявляет отображение; без него «Поиграть» и редактор не поддерживаются.
assert.equal(pet.open('play').error.code, 'unsupported');
pet.setDisplay({ views: ['corner', 'play', 'room'], playFloor: [-40, -10, 300, 230] });
advance(10_000);
assert.equal(pet.open('play').ok, true);
const stroke = pet.stroke.start();
assert.equal(stroke.ok, true);
assert.equal(pet.stroke.step(stroke.id).outcome, 'pet');
assert.equal(pet.stroke.end(stroke.id).ok, true);
// Прямое действие не сменяет не менее важную реакцию: отклик поглаживания доигрывает, затем лапа.
advance(2000);
assert.equal(pet.interact({ type: 'paw' }).outcome, 'paw');
// Редактор: программная расстановка и сохранение.
advance(10_000);
assert.equal(pet.open('room').ok, true);
assert.equal(pet.room.move('bowl', [120, 230]).ok, true);
const saved = pet.room.save();
assert.deepEqual([saved.closed, saved.text, saved.save.status, pet.getState().view.open], [true, 'Расстановка сохранена.', 'saved', 'corner']);
assert.equal(pet.close().ok, true);

// Присутствие и «Скрыть».
assert.equal(pet.setPresence('on-call').ok, true);
assert.equal(pet.feed().error.code, 'away');
assert.equal(pet.setPresence('always').ok, true);
assert.equal(pet.hide().ok, true);
assert.equal(pet.getState().presence.surface, 'none');
assert.equal(pet.show().ok, true);

// Снимок — замороженные простые данные, та же ссылка без изменений.
const snapshot = pet.getState();
assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.pets.dog));
assert.equal(pet.getState(), snapshot);

// Отключение: команды — destroyed, повторный destroy — ничего; новое ядро на том же хранилище видит сохранённое.
off();
pet.destroy();
assert.equal(pet.setName('Ещё').error.code, 'destroyed');
pet.destroy();
assert.equal(storage.load(), 'ready', 'барьер перед новым ядром');
const again = createPetCore(options);
assert.deepEqual([again.getState().pet.shown, again.getState().look.coat, again.getState().prefs.motion], ['dog', 'blacktan', 'calm']);
again.destroy();

// ---------- асинхронное хранилище: принятие в очередь ≠ сохранение ----------
const slow = new Map();
const waiting = [];
const asyncStorage = createStorage({
  namespace: 'demo-async',
  backend: {
    async: true,
    get: (name) => new Promise((resolve) => waiting.push(() => resolve(slow.get(name) ?? null))),
    set: (name, text) =>
      new Promise((resolve, reject) =>
        waiting.push((ok = true) => {
          if (!ok) return reject(new Error('диск занят'));
          slow.set(name, text);
          resolve();
        }),
      ),
  },
});
const settle = async (ok = true) => {
  while (waiting.length) {
    waiting.shift()(ok);
    await new Promise((resolve) => setImmediate(resolve));
  }
};
const loading = asyncStorage.load();
await settle();
assert.equal(await loading, 'ready');
const remote = createPetCore({ storage: asyncStorage, clock, scheduler, random });
const named = remote.setName('Сырник');
assert.deepEqual([named.save.status, remote.getState().save.cat.status], ['pending', 'pending']);
await settle();
assert.equal(await named.save.done, 'saved');
const refused = remote.setPreferences({ phrases: false });
await settle(false);
assert.equal(await refused.save.done, 'failed', 'done не отклоняется: итог — failed');
// done после destroy — действительный итог операции, ядро не меняется.
const late = remote.setName('Кекс');
remote.destroy();
await settle();
assert.equal(await late.save.done, 'saved');
assert.equal(remote.getState().status, 'destroyed');

// Ошибки создания — исключение PetError (интегратор их видит сразу).
assert.throws(() => createPetCore({ storage, pets: [] }), (error) => error instanceof PetError && error.code === 'invalid-options');

console.log(JSON.stringify({ ok: true, version: VERSION, day: localDay(new Date(2026, 9, 15)), updates: updates.length, warnings: warnings.length, stored: [...disk.keys()].sort() }));
