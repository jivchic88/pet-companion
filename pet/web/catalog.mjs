// Веб: питомцы, модели поведения и наборы отображения одного подключения (PL06; с PL07 — общее для legacy mountPet и
// контейнера mountPetIn). options.pets и options.behaviors — определения (по умолчанию штатные кот, собака и модель calm),
// options.kits — наборы сторонних питомцев (у кота и собаки — штатные, если свой не передан). Проверка (catalogProblem) —
// до любых действий: определения (код и путь ошибки), наборы (без определения, неполный — каждый выбранный, штатный тоже,
// против своего определения; повтор питомца), хотя бы один питомец с набором. Рисуются питомцы, у которых есть набор.

import { register } from '../core/define.mjs';
import { calm } from '../defs/calm.mjs';
import { cat } from '../defs/cat.mjs';
import { dog } from '../defs/dog.mjs';
import { kitProblem, STOCK_KITS } from './kits.mjs';

export const STOCK_PETS = Object.freeze([cat, dog]);
export const STOCK_BEHAVIORS = Object.freeze([calm]);

// Выбранные наборы подключения (ID → набор): у зарегистрированного питомца — свой из kits, иначе штатный того же ID. Одна
// выборка и для проверки (каждый выбранный, штатный тоже, — kitProblem против своего определения), и для подключения.
export function kitsOf(pets, list = []) {
  const kits = new Map();
  for (const kit of [...STOCK_KITS, ...list]) if (pets.has(kit.pet)) kits.set(kit.pet, kit);
  return kits;
}

// Проблема настроек pets, behaviors, kits (строка для отказа подключения) или ''.
export function catalogProblem(o) {
  let defs;
  try {
    defs = register(o.pets ?? STOCK_PETS, o.behaviors ?? STOCK_BEHAVIORS);
  } catch (error) {
    return error?.code ? `${error.code}: ${error.message}` : error;
  }
  if (o.kits !== undefined && !Array.isArray(o.kits)) return 'kits — массив наборов отображения';
  const pets = new Map(defs.pets.map((def) => [def.id, def]));
  const seen = new Set();
  for (let i = 0; i < (o.kits ?? []).length; i += 1) {
    if (!Object.hasOwn(o.kits, i)) return `kits[${i}] — пропуск в массиве`;
    const problem = kitProblem(o.kits[i], pets);
    if (problem) return `kits[${i}]: ${problem}`;
    if (seen.has(o.kits[i].pet)) return `kits[${i}]: второй набор питомца «${o.kits[i].pet}»`;
    seen.add(o.kits[i].pet);
  }
  // Тем же правилом — выбранные штатные наборы (не заменённые своим): совпадение ID не значит, что набор покрывает ресурсы
  // переданного определения (по независимой проверке PL06: изменённый кот с обликом purple подключался, а рисовался smoke).
  const kits = kitsOf(pets, o.kits);
  for (const [id, kit] of kits) {
    if (seen.has(id)) continue;
    const problem = kitProblem(kit, pets);
    if (problem) return `штатный ${problem} — свой набор этого питомца передаётся в kits`;
  }
  return kits.size ? '' : 'ни у одного питомца из pets нет набора отображения (kits)';
}

// Уже проверенные настройки → { defs, pets, kits, drawn }: определения (register), питомцы по ID, выбранные наборы и
// рисуемые питомцы в порядке pets.
export function catalogOf(options) {
  const defs = register(options.pets ?? STOCK_PETS, options.behaviors ?? STOCK_BEHAVIORS);
  const pets = new Map(defs.pets.map((def) => [def.id, def]));
  const kits = kitsOf(pets, options.kits);
  return { defs, pets, kits, drawn: defs.pets.map((def) => def.id).filter((id) => kits.has(id)) };
}
