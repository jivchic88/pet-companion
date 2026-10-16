// Натив: проверка и выбор наборов отображения (этап PL10.1; docs/ARCHITECTURE.md § 7.3, § 7.4, § 12.2). Набор —
// код рисования одного питомца для react-native-svg, отдельно от определения и модели поведения: рисует позу, облик и
// надетый аксессуар из снимка ядра и не принимает решений. Модуль без React и React Native — только словарь поз ядра:
// проверка идёт до любых побочных действий отображения (подписки, setDisplay, команды).
//
// Набор: { pet — ID определения; poses — нарисованные позы; coats, accessories — нарисованные облики и аксессуары;
// substitutes? — явные замены необязательных поз { поза: нарисованная поза } (декоративные yawn и settle, позы сценок);
// Figure({ pose, coat, accessory, toward, prefix }) — чистая функция без хуков: элементы react-native-svg в единицах рисунка
// (220×204 у штатных — size определения), без корневого <Svg> (его ставит отображение) }. Сценок, вещей уголка и предметов
// игры набор PL10.1 не рисует — это PL10.2.
//
// Обязательное покрытие — как у веб-наборов (§ 7.3), по роли позы: конечная поза (после poseFallback определения) каждой
// обязательной позы словаря (calm — всегда сама) и лапы, если у питомца есть actions.paw; облики и аксессуары определения.
// Необязательная поза без рисунка и без замены показывается базовой позой снимка.

import { OPTIONAL_POSES, PAW_POSE, REQUIRED_POSES, resolvePose } from '../core/define.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function stringList(value) {
  if (!Array.isArray(value)) return false;
  for (let i = 0; i < value.length; i += 1) if (!Object.hasOwn(value, i) || typeof value[i] !== 'string') return false;
  return true;
}
const looksLikeElement = (value) => isObject(value) && 'type' in value && 'props' in value;
const KIT_FIELDS = ['pet', 'poses', 'coats', 'accessories', 'substitutes', 'Figure'];

// Что набор обязан нарисовать по определению def.
export function nativeKitNeeds(def) {
  const roles = def.actions.paw ? [...REQUIRED_POSES, PAW_POSE] : REQUIRED_POSES;
  return {
    poses: [...new Set(roles.map((pose) => resolvePose(def, pose)))],
    coats: def.coats.map((coat) => coat.id),
    accessories: def.accessories.map((item) => item.id),
  };
}

// Позы, которые набор может заменить: необязательные декоративные и позы сценок определения, если они не служат
// конечной позой обязательной роли.
function replaceable(def) {
  const needed = new Set(nativeKitNeeds(def).poses);
  const scenePoses = def.scenes.map((scene) => scene.pose);
  return new Set([...OPTIONAL_POSES, ...scenePoses].filter((pose) => !needed.has(pose)));
}

// Проблема набора (строка для отказа отображения) или ''. defs — Map ID → определение; isElement — проверка элемента
// React (отображение передаёт isValidElement; без React — проверка формы).
export function nativeKitProblem(kit, defs, isElement = looksLikeElement) {
  if (!isObject(kit)) return 'набор отображения — объект';
  if (typeof kit.pet !== 'string' || !defs.has(kit.pet)) return `набор «${String(kit.pet)}»: нет определения питомца с таким ID в pets`;
  const def = defs.get(kit.pet);
  const at = `набор «${kit.pet}»`;
  const extra = Object.keys(kit).filter((key) => !KIT_FIELDS.includes(key));
  if (extra.length) return `${at}: неизвестные поля ${extra.join(', ')} (сценки, вещи и предметы — PL10.2)`;
  for (const field of ['poses', 'coats', 'accessories']) if (!stringList(kit[field])) return `${at}: ${field} — плотный массив строк`;
  if (typeof kit.Figure !== 'function') return `${at}: Figure — функция рисунка`;
  if (kit.substitutes !== undefined) {
    if (!isObject(kit.substitutes)) return `${at}: substitutes — объект { поза: нарисованная поза }`;
    const allowed = replaceable(def);
    for (const [pose, drawn] of Object.entries(kit.substitutes)) {
      if (!allowed.has(pose)) return `${at}: substitutes.${pose} — заменять можно только необязательные позы (${[...allowed].join(', ')})`;
      if (typeof drawn !== 'string' || !kit.poses.includes(drawn)) return `${at}: substitutes.${pose} — поза ${String(drawn)} не нарисована`;
    }
  }
  const needs = nativeKitNeeds(def);
  for (const field of ['poses', 'coats', 'accessories']) {
    const missing = needs[field].filter((id) => !kit[field].includes(id));
    if (missing.length) return `${at}: не нарисовано (${field}): ${missing.join(', ')}`;
  }
  // Пробный рисунок: каждая обязательная поза с первым обликом и аксессуаром — элемент, не строка разметки.
  for (const pose of needs.poses) {
    let element;
    try {
      element = kit.Figure({ pose, coat: def.coats[0].id, accessory: def.accessories[0]?.id ?? '', toward: '', prefix: 'probe' });
    } catch (error) {
      return `${at}: Figure({ pose: '${pose}' }) бросил исключение (${error instanceof Error ? error.message : String(error)})`;
    }
    if (!isElement(element)) return `${at}: Figure({ pose: '${pose}' }) — элемент React (компоненты react-native-svg), не строка и не null`;
  }
  return '';
}

// Каталог отображения: определения pets и наборы kits одним проверенным списком. { problem: '' | строка, defs, kits, ids }:
// ids — питомцы с набором в порядке kits (их отображение объявляет ядру через setDisplay({ pets })).
export function nativeCatalog(pets, kits, isElement = looksLikeElement) {
  const fail = (problem) => ({ problem, defs: new Map(), kits: new Map(), ids: [] });
  if (!Array.isArray(pets) || !pets.length) return fail('pets — непустой список определений (те же, что у createPetCore)');
  if (!Array.isArray(kits) || !kits.length) return fail('kits — непустой список нативных наборов');
  const defs = new Map();
  for (const def of pets) {
    if (!isObject(def) || typeof def.id !== 'string' || !Array.isArray(def.coats)) return fail('pets — определения питомцев (definePet или pet-companion/pets)');
    if (defs.has(def.id)) return fail(`pets: определение «${def.id}» дважды`);
    defs.set(def.id, def);
  }
  const chosen = new Map();
  for (const kit of kits) {
    const problem = nativeKitProblem(kit, defs, isElement);
    if (problem) return fail(problem);
    if (chosen.has(kit.pet)) return fail(`kits: набор «${kit.pet}» дважды`);
    chosen.set(kit.pet, kit);
  }
  return { problem: '', defs, kits: chosen, ids: [...chosen.keys()] };
}

// Набор показанного питомца: свой, иначе набор штатного запасного (fallback определения), иначе первый.
export function kitFor(catalog, petId) {
  const own = catalog.kits.get(petId);
  if (own) return own;
  const fallback = catalog.defs.get(petId)?.fallback;
  return catalog.kits.get(fallback) ?? catalog.kits.values().next().value;
}

// Какую позу нарисовать: поза снимка, если нарисована; иначе явная замена набора; иначе замена определения
// (poseFallback); иначе базовая поза снимка; иначе calm. Решений о позе здесь нет — только показ решённой ядром.
export function drawnPose(kit, def, pose, base) {
  if (kit.poses.includes(pose)) return pose;
  const sub = kit.substitutes?.[pose];
  if (typeof sub === 'string' && kit.poses.includes(sub)) return sub;
  const viaDef = def ? resolvePose(def, pose) : null;
  if (viaDef && kit.poses.includes(viaDef)) return viaDef;
  return kit.poses.includes(base) ? base : 'calm';
}
