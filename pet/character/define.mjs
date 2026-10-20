// Персонаж (минимальный режим, U01; docs/ARCHITECTURE.md § 19): описание формата персонажа 1 — только данные, без кода,
// без комнаты, игры, кормления, обликов, аксессуаров, вещей и ступеней. Обязательны: ID с точкой, название, позы (из них
// обязательна только calm — покой; attentive — внимание в тишине и на экране дела, rest — дремота: необязательны, без них
// рисуется calm) и словарь реакций продукта (может быть пустым): у каждой — поза, длительность, приоритет, по желанию пауза
// повтора, группа реплик и объявление скринридеру. Реплики — группы строк с подстановкой {name}; одиночные движения покоя
// (micro) и интервалы (timings) — по желанию, границы — как у модели calm (не чаще 0.1.4).
//
// Проверка — теми же помощниками, что у формата 1 питомца (core/define.mjs: копия только из данных, путь дефекта,
// неизменяемая копия), но своей таблицей полей: неизвестное поле — отказ, и у определения персонажа нет полей питомца, а у
// питомца — полей персонажа; определение персонажа, переданное в createPetCore, отклоняется проверкой формата 1 питомца,
// как любой неверный питомец. Форматы независимы: номер 1 здесь — формат персонажа, не питомца.

import { bool, copyData, deepFreeze, invalid, isDottedId, isLocalId, isObject, join, list, local, number, PHRASE_MS_MAX, shape, text, unique } from '../core/define.mjs';
import { PetError } from '../core/errors.mjs';

export const CHARACTER_FORMAT = 1;
// Поза покоя — обязательна; поза внимания (тишина, экран дела) и дремота — необязательны (без них — calm).
export const CALM_POSE = 'calm';
export const ATTENTIVE_POSE = 'attentive';
export const REST_POSE = 'rest';
const FIELDS = ['format', 'id', 'title', 'poses', 'reactions'];
const OPTIONAL = ['phrases', 'micro', 'timings'];
const REACTION_FIELDS = ['pose', 'ms', 'priority'];
const REACTION_OPTIONAL = ['cooldown', 'phrases', 'announce'];
const GROUP = /^[a-z][a-zA-Z0-9]{0,39}$/;
const DAY_MS = 86_400_000;
// Границы: длительность реакции — как у сценки (до 4,6 с), приоритет — как у реакций модели (3–7), интервалы покоя — не
// чаще модели calm 0.1.4.
export const REACTION_MS = Object.freeze([200, 4600]);
export const PRIORITY = Object.freeze([3, 7]);
export const DEFAULT_TIMINGS = Object.freeze({ blink: Object.freeze([12_000, 28_000]), micro: Object.freeze([45_000, 90_000]), phrase: 2600 });
const INTERVAL_MIN = { blink: 12_000, micro: 45_000 };
const INTERVAL_MAX = 600_000;

function checkCharacter(d, p) {
  shape(d, p, FIELDS, OPTIONAL);
  if (!isDottedId(d.id)) throw invalid(join(p, 'id'), 'ID персонажа — сторонний с точкой (example.robot): строчные латинские буквы, цифры и дефис');
  text(d.title, join(p, 'title'), 40);

  const poses = join(p, 'poses');
  list(d.poses, poses, 1, 40);
  d.poses.forEach((pose, i) => local(pose, join(poses, i)));
  unique(d.poses, poses);
  if (!d.poses.includes(CALM_POSE)) throw invalid(poses, 'поза покоя calm обязательна');

  const groups = join(p, 'phrases');
  const bank = Object.hasOwn(d, 'phrases') ? d.phrases : {};
  if (!isObject(bank)) throw invalid(groups, 'ожидается объект { группа: реплики }');
  if (Object.keys(bank).length > 32) throw invalid(groups, 'не больше 32 групп');
  for (const [group, lines] of Object.entries(bank)) {
    const at = join(groups, group);
    if (!GROUP.test(group)) throw invalid(at, 'имя группы — латинские буквы и цифры, с маленькой буквы');
    list(lines, at, 1, 32);
    lines.forEach((line, i) => text(line, join(at, i), 120));
  }

  const reactions = join(p, 'reactions');
  if (!isObject(d.reactions)) throw invalid(reactions, 'ожидается объект { id: реакция }');
  if (Object.keys(d.reactions).length > 32) throw invalid(reactions, 'не больше 32 реакций');
  for (const [id, r] of Object.entries(d.reactions)) {
    const at = join(reactions, id);
    if (!isLocalId(id)) throw invalid(at, 'ID реакции — строчные латинские буквы, цифры и дефис (1…40)');
    shape(r, at, REACTION_FIELDS, REACTION_OPTIONAL);
    if (!d.poses.includes(r.pose)) throw invalid(join(at, 'pose'), `позы «${String(r.pose)}» нет в poses персонажа`);
    number(r.ms, join(at, 'ms'), REACTION_MS[0], REACTION_MS[1], true);
    number(r.priority, join(at, 'priority'), PRIORITY[0], PRIORITY[1], true);
    if (Object.hasOwn(r, 'cooldown')) number(r.cooldown, join(at, 'cooldown'), 0, DAY_MS, true);
    if (Object.hasOwn(r, 'phrases') && r.phrases !== '' && !(typeof r.phrases === 'string' && Object.hasOwn(bank, r.phrases))) throw invalid(join(at, 'phrases'), "группа из phrases или '' (без реплики)");
    if (Object.hasOwn(r, 'announce')) bool(r.announce, join(at, 'announce'));
  }

  if (Object.hasOwn(d, 'micro')) {
    const micro = join(p, 'micro');
    list(d.micro, micro, 0, 12);
    d.micro.forEach((item, i) => local(item, join(micro, i)));
    unique(d.micro, micro);
  }

  if (Object.hasOwn(d, 'timings')) {
    const timings = join(p, 'timings');
    shape(d.timings, timings, [], ['blink', 'micro', 'phrase']);
    for (const what of ['blink', 'micro']) {
      if (!Object.hasOwn(d.timings, what)) continue;
      const at = join(timings, what);
      list(d.timings[what], at, 2, 2);
      const [min, max] = d.timings[what];
      number(min, join(at, 0), INTERVAL_MIN[what], INTERVAL_MAX, true);
      number(max, join(at, 1), min, INTERVAL_MAX, true);
    }
    if (Object.hasOwn(d.timings, 'phrase')) number(d.timings.phrase, join(timings, 'phrase'), 1000, PHRASE_MS_MAX, true);
  }
}

// Копии, прошедшие проверку (своя таблица: определение питомца или модели сюда не попадает и наоборот).
const DEFINED = new WeakSet();

// Проверить описание персонажа и вернуть его собственную глубоко замороженную копию (PetError при дефекте: definition-invalid
// с path, unsupported-format — целый номер формата, которого эта версия не знает).
export function defineCharacter(def) {
  if (def && typeof def === 'object' && DEFINED.has(def)) return def;
  const copy = copyData(def, '');
  if (!isObject(copy)) throw invalid('', 'ожидается объект описания персонажа');
  if (Object.hasOwn(copy, 'format') && copy.format !== CHARACTER_FORMAT) {
    if (Number.isInteger(copy.format)) throw new PetError('unsupported-format', `Определение format: формат персонажа ${copy.format} этой версией не поддерживается (известен ${CHARACTER_FORMAT}).`, { path: 'format' });
    throw invalid('format', `номер формата — целое число (${CHARACTER_FORMAT})`);
  }
  checkCharacter(copy, '');
  deepFreeze(copy);
  DEFINED.add(copy);
  return copy;
}

// Что из описания нужно исполнению: таблица режиссёра (реакции по ID), банк реплик, интервалы с умолчаниями, позы покоя.
export function characterModel(def) {
  const table = Object.fromEntries(Object.entries(def.reactions).map(([id, r]) => [id, { pose: r.pose, ms: r.ms, priority: r.priority, cooldown: r.cooldown ?? 0, phrases: r.phrases ?? '', announce: r.announce ?? false }]));
  const own = def.timings ?? {};
  const range = (what) => {
    const normal = own[what] ?? DEFAULT_TIMINGS[what];
    return { normal: [...normal], calm: [normal[0] * 2, normal[1] * 2] };
  };
  return {
    def,
    table,
    bank: { ...(def.phrases ?? {}) },
    micro: [...(def.micro ?? [])],
    timings: { blink: range('blink'), micro: range('micro'), phrase: own.phrase ?? DEFAULT_TIMINGS.phrase },
    attentive: def.poses.includes(ATTENTIVE_POSE),
    rest: def.poses.includes(REST_POSE),
  };
}
