// Веб: наборы отображения legacy-отображения mountPet (этап PL06; docs/ARCHITECTURE.md § 7.3 «Наборы отображения»,
// § 7.4, § 7.5). Набор — код рисования одного питомца, отдельно от определения и модели поведения: рисует по снимку ядра
// (поза — data-pose, облик — data-coat, надетый аксессуар — data-acc, вид — data-view) и не принимает решений. Кот и собака —
// прежние рисунки 0.1.4 (cat-art.mjs, dog-art.mjs), обёрнутые в наборы без перерисовки; сторонний питомец приходит своим
// набором (mountPet({ pets, kits })) и своими стилями (страница подключает его CSS сама — сети нет).
//
// Набор: { pet — ID определения; poses, scenes, coats, accessories, items — что он рисует; art({ id, view, coat, className?,
// box?, accessory? }) — строка <svg class="cat-art" data-kind data-view data-coat data-pose data-acc …> (view — 'full' или
// 'portrait'; box — место во вложенной сцене комнаты { x, y, width, height }); item(id, { fresh }) — строка <g data-room="id">
// своей вещи или игрушки комнаты в единицах сцены 400×250; mini?(id) — маленькая вещь рядом с питомцем }. Общий уголок
// (стена, пол, мебель ступеней, миска) рисует отображение. Проверка — до подключения (kitProblem), для каждого
// выбранного набора, штатного тоже: набор без определения или не покрывший обязательные позы (по роли и заменам), облики,
// аксессуары и свои вещи определения — отказ подключения. Сценки набора, которых нет в определении, не объявляются.

import { catSvg, yarnArt } from '../cat-art.mjs';
import { PAW_POSE, POSES, REQUIRED_POSES, resolvePose } from '../core/define.mjs';
import { cornerItems } from '../defs/room.mjs';
import { ballArt, ballMiniSvg, dogSvg, ropeArt } from '../dog-art.mjs';

// Надетый аксессуар на портрете выбора: рисунки 0.1.4 по умолчанию — платок scarf.
const withAcc = (markup, accessory) => (accessory ? markup.replace('data-acc="scarf"', `data-acc="${accessory}"`) : markup);

export const catWeb = Object.freeze({
  pet: 'cat',
  poses: Object.freeze([...POSES, 'stretch', 'curl']),
  scenes: Object.freeze(['stretch', 'curl']),
  coats: Object.freeze(['smoke', 'ginger', 'tuxedo']),
  accessories: Object.freeze(['scarf', 'plaid', 'badge']),
  items: Object.freeze(['yarn']),
  art: ({ id, view, coat, className, box, accessory } = {}) => withAcc(catSvg({ id, view, coat, className, box }), accessory),
  item: (id) => (id === 'yarn' ? yarnArt() : ''),
});

export const dogWeb = Object.freeze({
  pet: 'dog',
  poses: Object.freeze([...POSES, 'fetch']),
  scenes: Object.freeze(['fetch']),
  coats: Object.freeze(['caramel', 'spotted', 'blacktan']),
  accessories: Object.freeze(['scarf', 'plaid', 'badge']),
  items: Object.freeze(['rope', 'ball']),
  art: ({ id, view, coat, className, box, accessory } = {}) => withAcc(dogSvg({ id, view, coat, className, box }), accessory),
  item: (id, { fresh = false } = {}) => (id === 'rope' ? ropeArt() : id === 'ball' ? ballArt({ fresh }) : ''),
  mini: (id) => (id === 'ball' ? ballMiniSvg() : ''),
});

export const STOCK_KITS = Object.freeze([catWeb, dogWeb]);
// Вещи ступеней, которые рисует общий уголок отображения (их набору рисовать не нужно).
export const SHARED_ITEMS = Object.freeze(cornerItems.map((item) => item.id));

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function stringList(value) {
  if (!Array.isArray(value)) return false;
  for (let i = 0; i < value.length; i += 1) if (!Object.hasOwn(value, i) || typeof value[i] !== 'string') return false;
  return true;
}

// Что набор обязан нарисовать по определению def (§ 7.3, § 7.1.1). Позы — по роли в формате, а не по тому, использует ли
// их ещё и сценка: конечная поза (после допустимых замен poseFallback) каждой обязательной позы словаря (calm — всегда
// сама) и лапы, если у питомца есть actions.paw. Конечной может быть и своя поза сценки или декоративная (yawn, settle) —
// тогда её набор тоже обязан нарисовать. yawn, settle и позы сценок, которые обязательным заменам не служат, —
// необязательные: их набор может не рисовать (сценку он тогда не объявляет, необязательную позу отображение показывает
// базовой). Ещё облики, аксессуары, свои игрушки комнаты и вещи ступеней вне общего уголка.
export function kitNeeds(def) {
  const roles = def.actions.paw ? [...REQUIRED_POSES, PAW_POSE] : REQUIRED_POSES;
  return {
    poses: [...new Set(roles.map((pose) => resolvePose(def, pose)))],
    coats: def.coats.map((coat) => coat.id),
    accessories: def.accessories.map((item) => item.id),
    items: [...new Set([...def.room.toys.map((toy) => toy.id), ...def.items.list.map((item) => item.id).filter((id) => !SHARED_ITEMS.includes(id))])],
  };
}

// Сценки, которые отображение объявляет ядру для питомца с этим набором: нарисованные набором и есть в определении.
export const kitScenes = (kit, def) => kit.scenes.filter((id) => def.scenes.some((scene) => scene.id === id));

// Проблема набора (строка для отказа подключения) или ''. defs — Map ID → определение зарегистрированных питомцев.
export function kitProblem(kit, defs) {
  if (!isObject(kit)) return 'набор отображения — объект';
  if (typeof kit.pet !== 'string' || !defs.has(kit.pet)) return `набор «${String(kit.pet)}»: нет определения питомца с таким ID в pets`;
  const def = defs.get(kit.pet);
  const at = `набор «${kit.pet}»`;
  for (const field of ['poses', 'scenes', 'coats', 'accessories', 'items']) if (!stringList(kit[field])) return `${at}: ${field} — плотный массив строк`;
  if (typeof kit.art !== 'function') return `${at}: art — функция рисунка`;
  if (kit.item !== undefined && typeof kit.item !== 'function') return `${at}: item — функция`;
  if (kit.mini !== undefined && typeof kit.mini !== 'function') return `${at}: mini — функция`;
  const needs = kitNeeds(def);
  for (const field of ['poses', 'coats', 'accessories', 'items']) {
    const missing = needs[field].filter((id) => !kit[field].includes(id));
    if (missing.length) return `${at}: не нарисовано (${field}): ${missing.join(', ')}`;
  }
  if (needs.items.length && typeof kit.item !== 'function') return `${at}: item — функция рисунка своих вещей`;
  // Объявленная сценка определения обязана быть нарисована; сценки набора, которых в определении нет, — лишний рисунок
  // (как лишний облик): не ошибка, отображение их не объявляет (kitScenes) — так штатный набор подходит и определению, из
  // которого сценку убрали.
  for (const id of kitScenes(kit, def)) {
    const scene = def.scenes.find((item) => item.id === id);
    if (!kit.poses.includes(scene.pose)) return `${at}: сценка «${id}» — поза ${scene.pose} не нарисована`;
  }
  // Пробный рисунок: строка svg с классом cat-art (механизм поз, движения и паузы отображения).
  for (const view of ['full', 'portrait']) {
    let markup;
    try {
      markup = kit.art({ id: 'probe', view, coat: def.coats[0].id, accessory: def.accessories[0].id });
    } catch (error) {
      return `${at}: art бросил исключение (${error instanceof Error ? error.message : String(error)})`;
    }
    if (typeof markup !== 'string' || !/^\s*<svg\s[^>]*class="cat-art/.test(markup)) return `${at}: art({ view: '${view}' }) — строка <svg class="cat-art …">`;
  }
  return '';
}
