// Ядро: каталог экземпляра (docs/ARCHITECTURE.md § 7.1–7.3, § 7.1.1; этап PL06) — зарегистрированные определения
// питомцев и моделей поведения и их исполняемое представление: позы питомца с заменами, модель комнаты, пара «питомец +
// модель» — таблица реакций (длительности, приоритеты, реплики и паузы — модель; поза — питомец, с заменой; реакции лапы —
// только у питомца с лапой; декоративная без позы — не играет), банк реплик (default и byPet), интервалы покоя, лимит,
// политика и варианты сценок (сценки питомца без skip модели). Только данные определений: ни одного ветвления по ID.
// Каталог — свой у экземпляра (createPetCore({ pets, behaviors })), глобального реестра нет.

import { OPTIONAL_REACTIONS, PAW_REACTIONS, resolvePose, sceneRef, TOY_REACTIONS } from './define.mjs';
import { bankOf } from './phrases.mjs';
import { roomModel } from './room.mjs';

// Сценки — самые неважные реакции: любая реакция их сменяет, сами в тишине и поверх другой не начинаются и не ждут.
export const SCENE_PRIORITY = 8;

function petModel(def) {
  return Object.freeze({
    id: def.id,
    def,
    // Поза словаря или своя — у этого питомца: сама, по цепочке замен или null (не рисуется).
    resolve: (pose) => resolvePose(def, pose),
    paw: def.actions.paw,
    room: roomModel(def),
  });
}

function behaviorModel(def) {
  return Object.freeze({ id: def.id, def });
}

// Пара «питомец + модель»: что исполняет режиссёр и сессия для показанного питомца.
function pairModel(pet, behavior) {
  const table = {};
  for (const [type, r] of Object.entries(behavior.def.reactions)) {
    // Лапа — возможность питомца: без actions.paw реакций лапы нет.
    if (PAW_REACTIONS.includes(type) && !pet.paw) continue;
    const pose = pet.resolve(r.pose);
    // Декоративная поза, которой у питомца нет и не заменена, — реакция для него не играет (без ошибки).
    if (pose === null) continue;
    const row = { pose, ms: r.ms, priority: r.priority, phrases: r.phrases ?? '' };
    if (r.cooldown !== undefined) row.cooldown = r.cooldown;
    if (OPTIONAL_REACTIONS.includes(type)) row.decorative = true;
    if (r.calmOnly) row.calmOnly = true;
    if (TOY_REACTIONS.includes(type)) row.toy = true;
    table[type] = Object.freeze(row);
  }
  const skip = new Set((behavior.def.scenes.skip ?? []).map(sceneRef).filter((ref) => ref.pet === pet.id).map((ref) => ref.scene));
  const scenes = pet.def.scenes.filter((scene) => !skip.has(scene.id));
  // Сценки питомца — реакции этой пары (поза — своя, без анимации — статичная still), только допустимые моделью.
  for (const scene of scenes) table[scene.id] = Object.freeze({ pose: scene.pose, ms: scene.ms, still: scene.still, priority: SCENE_PRIORITY, phrases: '', decorative: true, scene: true });
  return Object.freeze({
    key: `${pet.id}\n${behavior.id}`,
    pet,
    behavior,
    table: Object.freeze(table),
    bank: bankOf(behavior.def, pet.id),
    timings: behavior.def.timings,
    limit: behavior.def.limits.pet,
    chance: behavior.def.scenes.chance,
    order: behavior.def.scenes.order,
    scenes,
  });
}

// Каталог по проверенным спискам (define.mjs, register): порядок списков сохраняется — первый питомец и первая модель —
// запасной показ и модель по умолчанию (§ 7.5).
export function createCatalog({ pets, behaviors }) {
  const petMap = new Map(pets.map((def) => [def.id, petModel(def)]));
  const behaviorMap = new Map(behaviors.map((def) => [def.id, behaviorModel(def)]));
  const pairs = new Map();
  const rooms = Object.fromEntries([...petMap.values()].map((pet) => [pet.id, pet.room]));
  const homes = Object.fromEntries([...petMap.values()].map((pet) => [pet.id, pet.room.home]));
  return Object.freeze({
    pets: Object.freeze(pets.map((def) => def.id)),
    behaviors: Object.freeze(behaviors.map((def) => def.id)),
    pet: (id) => petMap.get(id) ?? null,
    behavior: (id) => behaviorMap.get(id) ?? null,
    hasPet: (id) => typeof id === 'string' && petMap.has(id),
    hasBehavior: (id) => typeof id === 'string' && behaviorMap.has(id),
    pair(pet, behavior) {
      const key = `${pet.id}\n${behavior.id}`;
      if (!pairs.has(key)) pairs.set(key, pairModel(pet, behavior));
      return pairs.get(key);
    },
    // Комнаты и исходные места предметов зарегистрированных питомцев (разбор и запись ключа room).
    rooms: Object.freeze(rooms),
    homes: Object.freeze(homes),
  });
}
