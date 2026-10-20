// Ядро: определения формата 1 (docs/ARCHITECTURE.md § 7.1–7.3, § 7.1.1; этап PL06) — питомец (PetDefinition: кто это и
// как выглядит) и модель поведения (BehaviorDefinition: как себя ведёт). Только данные, без функций и исполняемого кода;
// ядро исполняет их своими правилами. Здесь: закрытый словарь поз, реакций и групп реплик формата 1, границы (значения
// 0.1.4: модель может только уменьшить длительности, шанс и лимит, не ускорить повторы), проверка с точным путём
// дефекта, собственная глубоко неизменяемая копия и регистрация списков на экземпляр (глобального реестра нет).
//
// Проверка идёт по копии: сначала определение копируется (только собственные перечисляемые свойства-данные простых
// объектов и плотных массивов — унаследованное, аксессоры, пропуски массивов, функции, символы, undefined и циклы — отказ
// с путём), затем проверяется копия и замораживается. Поэтому последующая правка исходного объекта ничего не меняет.
// Ошибка — PetError: definition-invalid (path — место дефекта), unsupported-format (format — целое, но не 1),
// duplicate-id (регистрация); у регистрации путь начинается с pets[i] или behaviors[i].
//
// Единственное знание о штатных питомцах — совместимость форматов 0.1.4 (formats/legacy.mjs): штатные ID без точки и
// запасной показ fallback для вкладок прежних версий.

import { PetError } from './errors.mjs';
import { LEGACY_KINDS } from './formats/legacy.mjs';
import { cleanName, NAME_MAX } from './pets.mjs';
import { STAGES } from './stages.mjs';

export const FORMAT = 1;

// ---------- словарь формата 1 (§ 7.1.1) ----------

// Позы покоя и обязательных реакций — питомец рисует их сам или через poseFallback (calm — только сам).
export const BASE_POSES = Object.freeze(['calm', 'attentive', 'rest', 'content']);
export const REQUIRED_POSES = Object.freeze([...BASE_POSES, 'wait', 'joy', 'support', 'unlock', 'greet', 'pet', 'feed', 'fed', 'sniff', 'watch', 'ball']);
// Лапа — возможность питомца: поза есть (или заменена), только если объявлено действие actions.paw.
export const PAW_POSE = 'paw';
// Декоративные — необязательные: нет позы и замены — реакция для этого питомца не играет.
export const OPTIONAL_POSES = Object.freeze(['yawn', 'settle']);
export const POSES = Object.freeze([...REQUIRED_POSES, PAW_POSE, ...OPTIONAL_POSES]);

export const REQUIRED_REACTIONS = Object.freeze(['wait', 'joy', 'support', 'unlock', 'greet', 'meet', 'named', 'pet', 'calmPet', 'feed', 'fed', 'sniff', 'watch', 'ball']);
// Условные по возможности: модель задаёт всегда, ядро использует только у питомца с лапой.
export const PAW_REACTIONS = Object.freeze(['paw', 'calmPaw']);
export const OPTIONAL_REACTIONS = Object.freeze(['yawn', 'settle']);
export const REACTION_TYPES = Object.freeze([...REQUIRED_REACTIONS, ...PAW_REACTIONS, ...OPTIONAL_REACTIONS]);
// Реакции на предметы «Поиграть»: новая сменяет прежнюю на предмет (признак toy — класс, не выбор модели).
export const TOY_REACTIONS = Object.freeze(['sniff', 'watch', 'ball']);
// Группы реплик, которые ядро выбирает само (кроме групп реакций модели): подсказка про миску, примерка аксессуара,
// «пока хватит», приветствие после паузы, реплика вида при дремоте и в покое.
export const CORE_GROUPS = Object.freeze(['joyTreat', 'tryOn', 'petEnough', 'welcome', 'rest', 'scene']);

// Границы реакций — 0.1.4 (§ 7.1.1, § 10): длительность не больше, пауза повтора не меньше.
const MAX_MS = { wait: 1000, joy: 1500, support: 1800, unlock: 2400, greet: 1700, meet: 1500, named: 1400, pet: 1300, calmPet: 700, feed: 2800, fed: 2200, sniff: 1400, watch: 900, ball: 1300, paw: 1500, calmPaw: 800, yawn: 1900, settle: 1200 };
const MIN_COOLDOWN = { wait: 10_000, meet: 6000, named: 4000, yawn: 6 * 60_000, settle: 1500 };
const MIN_MS = 200;
const DAY_MS = 86_400_000;
// Интервалы покоя по режиму движения: не чаще 0.1.4.
const INTERVALS = { blink: { normal: [12_000, 28_000], calm: [24_000, 48_000] }, micro: { normal: [45_000, 90_000], calm: [90_000, 180_000] } };
const INTERVAL_MAX = 600_000;
export const YAWN_MAX = 0.18;
export const PHRASE_MS_MAX = 3200;
export const SCENE_CHANCE_MAX = 0.25;
export const PET_LIMIT_MAX = 3;
export const SCENE_MS_MAX = 4600;
// Приоритеты реакций: 1–2 — запреты ядра (отключение, тишина), 8 — сценки; декоративные — всегда 7.
const PRIORITY = [3, 7];
const DECORATIVE_PRIORITY = 7;
const LAST_STAGE = STAGES.length - 1;

// ID: штатные без точки (питомцы — совместимость 0.1.4, модель — calm); сторонние — с точкой.
const DOTTED = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
// Сторонний ID с точкой (без штатных): общий для питомцев, моделей и персонажей (character/define.mjs).
export const isDottedId = (value) => typeof value === 'string' && value.length <= 80 && DOTTED.test(value);
export const BUILTIN_BEHAVIORS = Object.freeze(['calm']);
const LOCAL = /^[a-z0-9-]{1,40}$/;
const GROUP = /^[a-z][a-zA-Z0-9]{0,39}$/;
export const isPetId = (value) => typeof value === 'string' && value.length <= 80 && (LEGACY_KINDS.includes(value) || DOTTED.test(value));
export const isBehaviorId = (value) => typeof value === 'string' && value.length <= 80 && (BUILTIN_BEHAVIORS.includes(value) || DOTTED.test(value));
export const isLocalId = (value) => typeof value === 'string' && LOCAL.test(value);
// Полная ссылка на сценку питомца: 'petId/sceneId'.
export function sceneRef(value) {
  if (typeof value !== 'string') return null;
  const at = value.lastIndexOf('/');
  const pet = value.slice(0, at);
  const scene = value.slice(at + 1);
  return at > 0 && isPetId(pet) && isLocalId(scene) ? { pet, scene } : null;
}

// ---------- путь и отказ ----------

const NAME = /^[A-Za-z_$][\w$]*$/;
export const join = (path, key) => (typeof key === 'number' ? `${path}[${key}]` : NAME.test(key) ? (path ? `${path}.${key}` : key) : `${path}[${JSON.stringify(key)}]`);
export const invalid = (path, message) => new PetError('definition-invalid', `Определение${path ? ` ${path}` : ''}: ${message}.`, { path });

// ---------- копия: только данные ----------

// Собственная копия: простые объекты и плотные массивы из строк, чисел, булевых и null. Свойства — только собственные
// перечисляемые данные (аксессор, неперечисляемое, символ, пропуск массива, лишнее свойство массива — отказ): проверка
// идёт по копии, поэтому геттер и последующая правка исходника её не обходят. Ключ __proto__ — обычное собственное поле
// копии (его затем отклонит проверка как неизвестное).
export function copyData(value, path, depth = 0, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value !== 'object') throw invalid(path, `не данные формата 1 (${value === undefined ? 'undefined' : typeof value})`);
  if (depth > 12) throw invalid(path, 'слишком глубокая вложенность');
  if (seen.has(value)) throw invalid(path, 'циклическая ссылка');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const names = Object.getOwnPropertyNames(value);
      if (names.length !== value.length + 1 || Object.getOwnPropertySymbols(value).length) {
        const extra = names.find((name) => name !== 'length' && !(String(Number(name)) === name && Number(name) < value.length));
        if (extra !== undefined) throw invalid(join(path, extra), 'лишнее свойство массива');
      }
      const out = [];
      for (let i = 0; i < value.length; i += 1) {
        const at = join(path, i);
        const own = Object.getOwnPropertyDescriptor(value, i);
        if (!own) throw invalid(at, 'пропуск в массиве');
        if (!('value' in own)) throw invalid(at, 'свойство-аксессор');
        out.push(copyData(own.value, at, depth + 1, seen));
      }
      return out;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw invalid(path, 'не простой объект');
    if (Object.getOwnPropertySymbols(value).length) throw invalid(path, 'символьные ключи');
    const out = {};
    for (const key of Object.getOwnPropertyNames(value)) {
      const own = Object.getOwnPropertyDescriptor(value, key);
      const at = join(path, key);
      if (!own.enumerable) throw invalid(at, 'неперечисляемое свойство');
      if (!('value' in own)) throw invalid(at, 'свойство-аксессор');
      Object.defineProperty(out, key, { value: copyData(own.value, at, depth + 1, seen), enumerable: true, writable: true, configurable: true });
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

// ---------- проверки полей ----------

export const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const CONTROL = /[\u0000-\u001f\u007f]/;

export function shape(value, path, required, optional = []) {
  if (!isObject(value)) throw invalid(path, 'ожидается объект');
  for (const key of Object.keys(value)) if (!required.includes(key) && !optional.includes(key)) throw invalid(join(path, key), 'неизвестное поле формата 1');
  for (const key of required) if (!Object.hasOwn(value, key)) throw invalid(join(path, key), 'обязательное поле отсутствует');
}

export function list(value, path, min, max) {
  if (!Array.isArray(value)) throw invalid(path, 'ожидается массив');
  if (value.length < min || value.length > max) throw invalid(path, `ожидается от ${min} до ${max} элементов`);
}

export function text(value, path, max = 60) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || CONTROL.test(value)) throw invalid(path, `строка 1…${max} знаков без управляющих символов`);
}

export function number(value, path, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw invalid(path, `${integer ? 'целое ' : ''}число от ${min} до ${max}`);
}

export function bool(value, path) {
  if (typeof value !== 'boolean') throw invalid(path, 'true или false');
}

export function local(value, path) {
  if (!isLocalId(value)) throw invalid(path, 'ID — строчные латинские буквы, цифры и дефис (1…40)');
}

export function unique(items, path, key = (item) => item) {
  const seen = new Set();
  items.forEach((item, i) => {
    const id = key(item);
    if (seen.has(id)) throw invalid(join(path, i), `повтор ID «${id}»`);
    seen.add(id);
  });
}

const COORD = 2000;
function point(value, path) {
  list(value, path, 2, 2);
  value.forEach((n, i) => number(n, join(path, i), -COORD, COORD));
}
function box(value, path) {
  list(value, path, 4, 4);
  value.forEach((n, i) => number(n, join(path, i), -COORD, COORD));
  if (!(value[0] < value[2] && value[1] < value[3])) throw invalid(path, 'рамка [l, t, r, b]: l < r, t < b');
}

function name(value, path) {
  if (typeof value !== 'string' || !value || cleanName(value) !== value) throw invalid(path, `имя: непустое, без управляющих символов и <>, без лишних пробелов, до ${NAME_MAX} знаков`);
}

const stage = (value, path) => number(value, path, 0, LAST_STAGE, true);

// ---------- питомец ----------

const PET_FIELDS = ['format', 'id', 'title', 'forms', 'names', 'coats', 'accessories', 'items', 'poses', 'micro', 'openMicro', 'actions', 'scenes', 'size', 'play', 'room', 'fallback'];

// Поза питомца с заменами: сама, иначе по цепочке poseFallback; цикл или обрыв — null.
export function resolvePose(def, pose) {
  const own = new Set(def.poses);
  const fallback = def.poseFallback ?? {};
  const seen = new Set();
  let at = pose;
  while (!own.has(at)) {
    if (seen.has(at) || !Object.hasOwn(fallback, at)) return null;
    seen.add(at);
    at = fallback[at];
  }
  return at;
}

function checkPet(d, p) {
  shape(d, p, PET_FIELDS, ['poseFallback']);
  if (!isPetId(d.id)) throw invalid(join(p, 'id'), `ID питомца: штатный (${LEGACY_KINDS.join(', ')}) или сторонний с точкой (example.bunny)`);
  text(d.title, join(p, 'title'), 40);
  shape(d.forms, join(p, 'forms'), ['gen', 'acc']);
  text(d.forms.gen, join(join(p, 'forms'), 'gen'), 40);
  text(d.forms.acc, join(join(p, 'forms'), 'acc'), 40);

  const names = join(p, 'names');
  shape(d.names, names, ['default', 'presets', 'offer']);
  name(d.names.default, join(names, 'default'));
  list(d.names.presets, join(names, 'presets'), 1, 48);
  d.names.presets.forEach((item, i) => name(item, join(join(names, 'presets'), i)));
  unique(d.names.presets, join(names, 'presets'));
  name(d.names.offer, join(names, 'offer'));
  if (!d.names.presets.includes(d.names.offer)) throw invalid(join(names, 'offer'), 'предложение — одно из готовых имён (presets)');

  const coats = join(p, 'coats');
  list(d.coats, coats, 1, 12);
  d.coats.forEach((coat, i) => {
    shape(coat, join(coats, i), ['id', 'title']);
    local(coat.id, join(join(coats, i), 'id'));
    text(coat.title, join(join(coats, i), 'title'), 40);
  });
  unique(d.coats, coats, (coat) => coat.id);

  const accessories = join(p, 'accessories');
  list(d.accessories, accessories, 1, 12);
  d.accessories.forEach((item, i) => {
    const at = join(accessories, i);
    shape(item, at, ['id', 'title', 'stage'], ['short']);
    local(item.id, join(at, 'id'));
    text(item.title, join(at, 'title'), 60);
    stage(item.stage, join(at, 'stage'));
    if (Object.hasOwn(item, 'short')) text(item.short, join(at, 'short'), 40);
  });
  unique(d.accessories, accessories, (item) => item.id);
  if (d.accessories[0].stage !== 0) throw invalid(join(join(accessories, 0), 'stage'), 'первый аксессуар — по умолчанию, открыт с начала (ступень 0)');

  const items = join(p, 'items');
  shape(d.items, items, ['list', 'gifts']);
  list(d.items.list, join(items, 'list'), 0, 32);
  d.items.list.forEach((item, i) => {
    const at = join(join(items, 'list'), i);
    shape(item, at, ['id', 'title', 'stage'], ['mini']);
    local(item.id, join(at, 'id'));
    text(item.title, join(at, 'title'), 40);
    stage(item.stage, join(at, 'stage'));
    if (Object.hasOwn(item, 'mini')) number(item.mini, join(at, 'mini'), 0, 9, true);
  });
  unique(d.items.list, join(items, 'list'), (item) => item.id);
  list(d.items.gifts, join(items, 'gifts'), STAGES.length, STAGES.length);
  d.items.gifts.forEach((gift, i) => text(gift, join(join(items, 'gifts'), i), 120));

  const actions = join(p, 'actions');
  shape(d.actions, actions, ['pet', 'paw']);
  shape(d.actions.pet, join(actions, 'pet'), ['text']);
  text(d.actions.pet.text, join(join(actions, 'pet'), 'text'), 120);
  const paw = d.actions.paw !== null;
  if (paw) {
    shape(d.actions.paw, join(actions, 'paw'), ['text', 'ask']);
    text(d.actions.paw.text, join(join(actions, 'paw'), 'text'), 120);
    bool(d.actions.paw.ask, join(join(actions, 'paw'), 'ask'));
  }

  const poses = join(p, 'poses');
  list(d.poses, poses, 1, 40);
  d.poses.forEach((pose, i) => {
    if (!POSES.includes(pose)) local(pose, join(poses, i));
  });
  unique(d.poses, poses);
  if (!d.poses.includes('calm')) throw invalid(poses, 'поза покоя calm обязательна в poses (без замены)');
  if (!paw && d.poses.includes(PAW_POSE)) throw invalid(join(poses, d.poses.indexOf(PAW_POSE)), 'поза paw — только у питомца с действием actions.paw');

  if (Object.hasOwn(d, 'poseFallback')) {
    const fallback = join(p, 'poseFallback');
    if (!isObject(d.poseFallback)) throw invalid(fallback, 'ожидается объект { поза словаря: замена }');
    for (const [pose, to] of Object.entries(d.poseFallback)) {
      const at = join(fallback, pose);
      if (!POSES.includes(pose)) throw invalid(at, 'замена — только для позы словаря формата 1');
      if (pose === 'calm') throw invalid(at, 'calm не заменяется');
      if (d.poses.includes(pose)) throw invalid(at, 'поза уже есть в poses — замена не нужна');
      if (pose === PAW_POSE && !paw) throw invalid(at, 'поза paw — только у питомца с действием actions.paw');
      if (typeof to !== 'string' || !(POSES.includes(to) || isLocalId(to))) throw invalid(at, 'замена — имя позы');
      if (resolvePose(d, pose) === null) throw invalid(at, `замена не ведёт к позе из poses (нет такой позы или цикл)`);
    }
  }
  for (const pose of REQUIRED_POSES) if (resolvePose(d, pose) === null) throw invalid(poses, `нет обязательной позы ${pose} и её замены (poseFallback)`);
  if (paw && resolvePose(d, PAW_POSE) === null) throw invalid(poses, 'actions.paw объявлено, а позы paw и её замены нет');

  const micro = join(p, 'micro');
  list(d.micro, micro, 1, 12);
  d.micro.forEach((item, i) => local(item, join(micro, i)));
  const openMicro = join(p, 'openMicro');
  list(d.openMicro, openMicro, 1, 4);
  d.openMicro.forEach((item, i) => local(item, join(openMicro, i)));

  const scenes = join(p, 'scenes');
  list(d.scenes, scenes, 0, 8);
  d.scenes.forEach((scene, i) => {
    const at = join(scenes, i);
    shape(scene, at, ['id', 'pose', 'needs', 'ms', 'still', 'text']);
    local(scene.id, join(at, 'id'));
    if (REACTION_TYPES.includes(scene.id)) throw invalid(join(at, 'id'), 'совпадает с типом реакции формата 1');
    if (!d.poses.includes(scene.pose)) throw invalid(join(at, 'pose'), `позы «${String(scene.pose)}» нет в poses питомца`);
    if (scene.needs !== 'any' && scene.needs !== 'full') throw invalid(join(at, 'needs'), "any (и в портрете) или full (только целиком)");
    number(scene.ms, join(at, 'ms'), 500, SCENE_MS_MAX, true);
    number(scene.still, join(at, 'still'), 300, scene.ms, true);
    text(scene.text, join(at, 'text'), 60);
  });
  unique(d.scenes, scenes, (scene) => scene.id);
  d.poses.forEach((pose, i) => {
    if (!POSES.includes(pose) && !d.scenes.some((scene) => scene.pose === pose)) throw invalid(join(poses, i), `своя поза «${pose}» не используется ни одной сценкой`);
  });

  const size = join(p, 'size');
  shape(d.size, size, ['width', 'height', 'ground']);
  number(d.size.width, join(size, 'width'), 100, 400);
  number(d.size.height, join(size, 'height'), 100, 400);
  number(d.size.ground, join(size, 'ground'), 0, d.size.height);

  const play = join(p, 'play');
  shape(d.play, play, ['hits', 'paw', 'foot', 'anchor']);
  list(d.play.hits, join(play, 'hits'), 1, 4);
  d.play.hits.forEach((hit, i) => {
    const at = join(join(play, 'hits'), i);
    shape(hit, at, ['part', 'cx', 'cy', 'rx', 'ry']);
    local(hit.part, join(at, 'part'));
    if (hit.part === PAW_POSE) throw invalid(join(at, 'part'), 'лапа — play.paw');
    number(hit.cx, join(at, 'cx'), -COORD, COORD);
    number(hit.cy, join(at, 'cy'), -COORD, COORD);
    number(hit.rx, join(at, 'rx'), 1, COORD);
    number(hit.ry, join(at, 'ry'), 1, COORD);
  });
  unique(d.play.hits, join(play, 'hits'), (hit) => hit.part);
  if (paw !== (d.play.paw !== null)) throw invalid(join(play, 'paw'), paw ? 'у питомца с лапой нужна её область { cx, cy, r }' : 'у питомца без лапы (actions.paw: null) области лапы нет — null');
  if (paw) {
    const circle = (value, at, extra = []) => {
      shape(value, at, ['cx', 'cy', 'r'], extra);
      number(value.cx, join(at, 'cx'), -COORD, COORD);
      number(value.cy, join(at, 'cy'), -COORD, COORD);
      number(value.r, join(at, 'r'), 1, COORD);
    };
    circle(d.play.paw, join(play, 'paw'), ['up']);
    if (Object.hasOwn(d.play.paw, 'up')) circle(d.play.paw.up, join(join(play, 'paw'), 'up'));
  }
  list(d.play.foot, join(play, 'foot'), 3, 3);
  d.play.foot.forEach((n, i) => number(n, join(join(play, 'foot'), i), -COORD, COORD));
  if (!(d.play.foot[0] < d.play.foot[1])) throw invalid(join(play, 'foot'), '[слева, справа, низ]: слева < справа');
  point(d.play.anchor, join(play, 'anchor'));

  checkRoom(d.room, join(p, 'room'));

  if (!LEGACY_KINDS.includes(d.fallback)) throw invalid(join(p, 'fallback'), `штатный питомец (${LEGACY_KINDS.join(' или ')}) — его показывают отображения без набора и вкладки прежних версий`);
}

function checkRoom(room, p) {
  shape(room, p, ['frame', 'floor', 'rest', 'seats', 'bowl', 'fixed', 'pet', 'feed', 'toys']);
  list(room.frame, join(p, 'frame'), 2, 2);
  number(room.frame[0], join(join(p, 'frame'), 0), 1, 400);
  number(room.frame[1], join(join(p, 'frame'), 1), 1, 250);
  number(room.floor, join(p, 'floor'), 0, 250);
  point(room.rest, join(p, 'rest'));
  list(room.seats, join(p, 'seats'), 1, 4);
  room.seats.forEach((seat, i) => {
    const at = join(join(p, 'seats'), i);
    shape(seat, at, ['id', 'title', 'box', 'stage', 'lift']);
    local(seat.id, join(at, 'id'));
    text(seat.title, join(at, 'title'), 40);
    box(seat.box, join(at, 'box'));
    stage(seat.stage, join(at, 'stage'));
    number(seat.lift, join(at, 'lift'), -50, 50);
    if (i === 0 ? seat.stage !== 0 : seat.stage <= room.seats[i - 1].stage) throw invalid(join(at, 'stage'), 'места отдыха — по возрастанию ступени, первое — с начала (0)');
  });
  unique(room.seats, join(p, 'seats'), (seat) => seat.id);
  shape(room.bowl, join(p, 'bowl'), ['title', 'home', 'box']);
  text(room.bowl.title, join(join(p, 'bowl'), 'title'), 40);
  point(room.bowl.home, join(join(p, 'bowl'), 'home'));
  box(room.bowl.box, join(join(p, 'bowl'), 'box'));
  list(room.fixed, join(p, 'fixed'), 0, 16);
  room.fixed.forEach((item, i) => {
    const at = join(join(p, 'fixed'), i);
    shape(item, at, ['stage', 'box']);
    stage(item.stage, join(at, 'stage'));
    box(item.box, join(at, 'box'));
  });
  shape(room.pet, join(p, 'pet'), ['all', 'core']);
  box(room.pet.all, join(join(p, 'pet'), 'all'));
  box(room.pet.core, join(join(p, 'pet'), 'core'));
  box(room.feed, join(p, 'feed'));
  list(room.toys, join(p, 'toys'), 0, 8);
  room.toys.forEach((toy, i) => {
    const at = join(join(p, 'toys'), i);
    shape(toy, at, ['id', 'title', 'home', 'box', 'stage']);
    local(toy.id, join(at, 'id'));
    if (toy.id === 'rest' || toy.id === 'bowl') throw invalid(join(at, 'id'), 'rest и bowl — общие места комнаты');
    text(toy.title, join(at, 'title'), 40);
    point(toy.home, join(at, 'home'));
    box(toy.box, join(at, 'box'));
    stage(toy.stage, join(at, 'stage'));
  });
  unique(room.toys, join(p, 'toys'), (toy) => toy.id);
}

// ---------- модель поведения ----------

const BEHAVIOR_FIELDS = ['format', 'id', 'title', 'reactions', 'timings', 'limits', 'scenes', 'phrases'];
const REACTION_OPTIONAL = ['phrases', 'cooldown', 'calmOnly', 'decorative', 'toy'];

function entries(value, path) {
  list(value, path, 1, 32);
  value.forEach((item, i) => {
    const at = join(path, i);
    if (typeof item === 'string') return text(item, at, 120);
    shape(item, at, ['text', 'stage']);
    text(item.text, join(at, 'text'), 120);
    stage(item.stage, join(at, 'stage'));
  });
}

function checkBehavior(d, p) {
  shape(d, p, BEHAVIOR_FIELDS);
  if (!isBehaviorId(d.id)) throw invalid(join(p, 'id'), `ID модели: штатная (${BUILTIN_BEHAVIORS.join(', ')}) или сторонняя с точкой (example.lively)`);
  text(d.title, join(p, 'title'), 40);

  const phrases = join(p, 'phrases');
  shape(d.phrases, phrases, ['default'], ['byPet']);
  const groups = join(phrases, 'default');
  if (!isObject(d.phrases.default)) throw invalid(groups, 'ожидается объект { группа: реплики }');
  for (const [group, items] of Object.entries(d.phrases.default)) {
    if (!GROUP.test(group)) throw invalid(join(groups, group), 'имя группы — латинские буквы и цифры, с маленькой буквы');
    entries(items, join(groups, group));
  }
  if (Object.hasOwn(d.phrases, 'byPet')) {
    const byPet = join(phrases, 'byPet');
    if (!isObject(d.phrases.byPet)) throw invalid(byPet, 'ожидается объект { petId: { группа: реплики } }');
    for (const [pet, own] of Object.entries(d.phrases.byPet)) {
      const at = join(byPet, pet);
      if (!isPetId(pet)) throw invalid(at, 'ключ — ID питомца (штатный или с точкой)');
      if (!isObject(own)) throw invalid(at, 'ожидается объект { группа: реплики }');
      for (const [group, items] of Object.entries(own)) {
        if (!Object.hasOwn(d.phrases.default, group)) throw invalid(join(at, group), 'группы нет в phrases.default');
        entries(items, join(at, group));
      }
    }
  }
  for (const group of CORE_GROUPS) if (!Object.hasOwn(d.phrases.default, group)) throw invalid(groups, `нет группы ${group} (её выбирает ядро)`);

  const reactions = join(p, 'reactions');
  if (!isObject(d.reactions)) throw invalid(reactions, 'ожидается объект { тип: реакция }');
  for (const type of Object.keys(d.reactions)) if (!REACTION_TYPES.includes(type)) throw invalid(join(reactions, type), 'неизвестный тип реакции формата 1 (сценки — у питомца)');
  for (const type of [...REQUIRED_REACTIONS, ...PAW_REACTIONS]) if (!Object.hasOwn(d.reactions, type)) throw invalid(join(reactions, type), 'обязательная реакция отсутствует');
  for (const [type, r] of Object.entries(d.reactions)) {
    const at = join(reactions, type);
    shape(r, at, ['pose', 'ms', 'priority'], REACTION_OPTIONAL);
    const decorative = OPTIONAL_REACTIONS.includes(type);
    if (!POSES.includes(r.pose)) throw invalid(join(at, 'pose'), 'поза — из словаря формата 1');
    if (REQUIRED_REACTIONS.includes(type) && !REQUIRED_POSES.includes(r.pose)) throw invalid(join(at, 'pose'), 'обязательная реакция — на обязательной позе (paw, yawn, settle есть не у всех)');
    if (PAW_REACTIONS.includes(type) && !REQUIRED_POSES.includes(r.pose) && r.pose !== PAW_POSE) throw invalid(join(at, 'pose'), 'реакция лапы — на позе paw или обязательной');
    number(r.ms, join(at, 'ms'), MIN_MS, MAX_MS[type], true);
    if (decorative) {
      if (r.priority !== DECORATIVE_PRIORITY) throw invalid(join(at, 'priority'), `декоративная реакция — приоритет ${DECORATIVE_PRIORITY}`);
    } else number(r.priority, join(at, 'priority'), PRIORITY[0], PRIORITY[1], true);
    if (Object.hasOwn(r, 'phrases') && r.phrases !== '' && !(typeof r.phrases === 'string' && Object.hasOwn(d.phrases.default, r.phrases))) throw invalid(join(at, 'phrases'), "группа из phrases.default или '' (без реплики)");
    if (Object.hasOwn(r, 'cooldown') || MIN_COOLDOWN[type] !== undefined) {
      if (!Object.hasOwn(r, 'cooldown')) throw invalid(join(at, 'cooldown'), `пауза повтора обязательна (не меньше ${MIN_COOLDOWN[type]} мс)`);
      number(r.cooldown, join(at, 'cooldown'), MIN_COOLDOWN[type] ?? 0, DAY_MS, true);
    }
    if (Object.hasOwn(r, 'calmOnly')) {
      bool(r.calmOnly, join(at, 'calmOnly'));
      if (r.calmOnly && !decorative) throw invalid(join(at, 'calmOnly'), 'только у декоративной реакции');
    }
    if (Object.hasOwn(r, 'decorative') && r.decorative !== decorative) throw invalid(join(at, 'decorative'), `класс реакции ${type} — ${decorative ? 'декоративная' : 'не декоративная'}`);
    if (Object.hasOwn(r, 'toy') && r.toy !== TOY_REACTIONS.includes(type)) throw invalid(join(at, 'toy'), `класс реакции ${type} — ${TOY_REACTIONS.includes(type) ? 'на предмет' : 'не на предмет'}`);
  }

  const timings = join(p, 'timings');
  shape(d.timings, timings, ['blink', 'micro', 'yawn', 'phrase']);
  for (const what of ['blink', 'micro']) {
    shape(d.timings[what], join(timings, what), ['normal', 'calm']);
    for (const mode of ['normal', 'calm']) {
      const at = join(join(timings, what), mode);
      list(d.timings[what][mode], at, 2, 2);
      const [min, max] = d.timings[what][mode];
      number(min, join(at, 0), INTERVALS[what][mode][0], INTERVAL_MAX, true);
      number(max, join(at, 1), min, INTERVAL_MAX, true);
    }
  }
  number(d.timings.yawn, join(timings, 'yawn'), 0, YAWN_MAX);
  number(d.timings.phrase, join(timings, 'phrase'), 1000, PHRASE_MS_MAX, true);

  shape(d.limits, join(p, 'limits'), ['pet']);
  number(d.limits.pet, join(join(p, 'limits'), 'pet'), 1, PET_LIMIT_MAX, true);

  const scenes = join(p, 'scenes');
  shape(d.scenes, scenes, ['chance', 'order'], ['skip']);
  number(d.scenes.chance, join(scenes, 'chance'), 0, SCENE_CHANCE_MAX);
  if (d.scenes.order !== 'fresh' && d.scenes.order !== 'random') throw invalid(join(scenes, 'order'), 'fresh (не прошлый вариант питомца) или random');
  if (Object.hasOwn(d.scenes, 'skip')) {
    list(d.scenes.skip, join(scenes, 'skip'), 0, 32);
    d.scenes.skip.forEach((ref, i) => {
      if (!sceneRef(ref)) throw invalid(join(join(scenes, 'skip'), i), "полная ссылка 'petId/sceneId'");
    });
    unique(d.scenes.skip, join(scenes, 'skip'));
  }
}

// ---------- определение и регистрация ----------

// Копии, прошедшие проверку: тот же объект не проверяется повторно (он неизменяем). Значение — вид определения.
const DEFINED = new WeakMap();
const KIND = { pet: { check: checkPet, title: 'питомца', other: 'модели поведения' }, behavior: { check: checkBehavior, title: 'модели поведения', other: 'питомца' } };

function define(kind, value, prefix) {
  const known = value && typeof value === 'object' ? DEFINED.get(value) : undefined;
  if (known === kind) return value;
  if (known) throw invalid(prefix, `это определение ${KIND[kind].other}, а нужно определение ${KIND[kind].title}`);
  const copy = copyData(value, prefix);
  if (isObject(copy) && Object.hasOwn(copy, 'format') && copy.format !== FORMAT) {
    const at = join(prefix, 'format');
    if (Number.isInteger(copy.format)) throw new PetError('unsupported-format', `Определение ${at}: формат ${copy.format} этой версией не поддерживается (известен ${FORMAT}).`, { path: at });
    throw invalid(at, `номер формата — целое число (${FORMAT})`);
  }
  KIND[kind].check(copy, prefix);
  deepFreeze(copy);
  DEFINED.set(copy, kind);
  return copy;
}

// Проверить определение питомца и вернуть его собственную глубоко замороженную копию (PetError при дефекте).
export const definePet = (def) => define('pet', def, '');
// Проверить определение модели поведения и вернуть его собственную глубоко замороженную копию.
export const defineBehavior = (def) => define('behavior', def, '');

function listOf(name, value, kind) {
  if (!Array.isArray(value) || !value.length) throw new PetError('invalid-options', `${name} — непустой массив определений (${kind === 'pet' ? 'definePet' : 'defineBehavior'}).`);
  const out = [];
  const seen = new Map();
  for (let i = 0; i < value.length; i += 1) {
    if (!Object.hasOwn(value, i)) throw new PetError('invalid-options', `${name}[${i}] — пропуск в массиве определений.`);
    const def = define(kind, value[i], `${name}[${i}]`);
    if (seen.has(def.id)) throw new PetError('duplicate-id', `${name}[${i}].id: «${def.id}» уже зарегистрирован (${name}[${seen.get(def.id)}]).`, { path: `${name}[${i}].id` });
    seen.set(def.id, i);
    out.push(def);
  }
  return out;
}

// Регистрация на экземпляр (§ 7.3): списки питомцев и моделей, без глобального реестра. Обязательных перекрёстных ссылок
// нет: любая корректная модель совместима с любым корректным питомцем (классы § 7.1.1). Слабые ссылки модели —
// byPet[petId] и skip 'petId/sceneId' — на питомца или сценку, которых в этом экземпляре нет, не ошибка: по одному
// предупреждению на ссылку (refs).
export function register(pets, behaviors) {
  const petList = listOf('pets', pets, 'pet');
  const behaviorList = listOf('behaviors', behaviors, 'behavior');
  const scenes = new Map(petList.map((pet) => [pet.id, new Set(pet.scenes.map((scene) => scene.id))]));
  const refs = [];
  behaviorList.forEach((behavior, i) => {
    for (const pet of Object.keys(behavior.phrases.byPet ?? {})) {
      if (!scenes.has(pet)) refs.push(`behaviors[${i}].phrases.byPet[${JSON.stringify(pet)}]: питомца «${pet}» нет в этом экземпляре — замены реплик не используются`);
    }
    for (const ref of behavior.scenes.skip ?? []) {
      const { pet, scene } = sceneRef(ref);
      if (!scenes.has(pet)) refs.push(`behaviors[${i}].scenes.skip: «${ref}» — питомца «${pet}» нет в этом экземпляре`);
      else if (!scenes.get(pet).has(scene)) refs.push(`behaviors[${i}].scenes.skip: «${ref}» — у питомца «${pet}» нет сценки «${scene}»`);
    }
  });
  return { pets: petList, behaviors: behaviorList, refs };
}
