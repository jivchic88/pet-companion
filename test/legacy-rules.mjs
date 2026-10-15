// Только проверки: правила 0.1.4 с прежними сигнатурами (по животному kind: 'cat' | 'dog') — представления штатных
// определений PL06 (pet/defs: cat, dog, calm) поверх общих правил ядра (pet/pet-rules.mjs). Прежние проверки правил
// (cat, companion, ritual, scenes, room, toys, play, storage …) сверяют через них, что определения воспроизводят данные и
// правила 0.1.4 (имена, облики, вещи и подарки ступеней, реакции, реплики, сценки). Своих данных здесь нет — только
// выборки из определений; ядро и оболочка этим модулем не пользуются.

import * as Core from '../pet/pet-rules.mjs';
import * as CorePlay from '../pet/core/play.mjs';
import { calm } from '../pet/defs/calm.mjs';
import { cat } from '../pet/defs/cat.mjs';
import { dog } from '../pet/defs/dog.mjs';

export * from '../pet/pet-rules.mjs';

export const DEFS = Object.freeze({ cat, dog });
export const KINDS = ['cat', 'dog'];
export const kindOf = Core.legacyKind;
const defOf = (kind) => DEFS[kindOf(kind)];

// ---------- питомцы ----------

export const DEFAULT_NAME = cat.names.default;
export const PROFILES = Object.fromEntries(
  KINDS.map((kind) => {
    const def = DEFS[kind];
    return [kind, { kind, title: def.title, defaultName: def.names.default, gen: def.forms.gen, acc: def.forms.acc, micro: [...def.micro], open: [...def.openMicro], paw: Boolean(def.actions.paw?.ask) }];
  }),
);
export const profileOf = (kind) => PROFILES[kindOf(kind)];
export const catName = (settings) => settings?.name || DEFAULT_NAME;
export const companionName = (view) => view?.name || profileOf(view?.kind).defaultName;

export const NAME_PRESETS = { cat: [...cat.names.presets], dog: [...dog.names.presets] };
export const NAME_OFFER = { cat: cat.names.offer, dog: dog.names.offer };
export const namePresets = (kind) => NAME_PRESETS[kindOf(kind)];
export const namePageCount = (kind) => Core.namePageCount(namePresets(kind));
export const namePageOf = (kind, name = '') => Core.namePageOf(namePresets(kind), name);
export const namePage = (kind, page = 0) => Core.namePage(namePresets(kind), page);

export const COATS = { cat: cat.coats.map((coat) => ({ ...coat })), dog: dog.coats.map((coat) => ({ ...coat })) };
export const coatsOf = (kind) => COATS[kindOf(kind)];
export const coatOf = (kind, value) => (coatsOf(kind).some((coat) => coat.id === value) ? value : coatsOf(kind)[0].id);
export const coatTitle = (kind, value) => coatsOf(kind).find((coat) => coat.id === coatOf(kind, value)).title;

// ---------- ступени, вещи, аксессуары ----------

export const ACCESSORIES = cat.accessories.map(({ id, title, stage }) => ({ id, title, stage }));
const ACCESSORY_IDS = ACCESSORIES.map((item) => item.id);
export const STAGES = Core.STAGES.map((stage, index) => {
  const accessory = cat.accessories.find((item) => index > 0 && item.stage === index)?.id;
  return { ...stage, gift: Core.stageGift(cat, index, cat.names.default), items: Core.stageItems(cat, index), ...(accessory ? { accessory } : {}) };
});
export const stageItems = (index, kind = 'cat') => Core.stageItems(defOf(kind), index);
export const stageGift = (index, kind = 'cat', name = '') => (Core.STAGES[index] ? Core.stageGift(defOf(kind), index, name) : '');
export const unlockedBetween = (from, to, kind = 'cat') => Core.unlockedBetween(defOf(kind), from, to);
export const wornAccessory = (settings, stage) => Core.wornAccessory(cat, settings?.accessory, stage);

// ---------- форматы 0.1.4: понятные значения кота и собаки ----------

export function normalizeSettings(raw) {
  const settings = Core.normalizeSettings(raw);
  return { ...settings, accessory: ACCESSORY_IDS.includes(settings.accessory) ? settings.accessory : 'scarf' };
}
export const parseSettings = Core.parser(normalizeSettings);
export function normalizeCompanion(raw) {
  const companion = Core.normalizeCompanion(raw);
  return { ...companion, dog: { ...companion.dog, accessory: ACCESSORY_IDS.includes(companion.dog.accessory) ? companion.dog.accessory : 'scarf' } };
}
export const parseCompanion = Core.parser(normalizeCompanion);
export function companionView(settings, companion, kind = companion?.kind) {
  const k = kindOf(kind);
  const own = k === 'dog' ? normalizeCompanion(companion).dog : normalizeSettings(settings);
  return { ...normalizeSettings(settings), kind: k, name: own.name, accessory: own.accessory };
}
export function mergeCompanion(current, patch = {}) {
  const now = normalizeCompanion(current);
  return normalizeCompanion({ ...now, ...patch, dog: { ...now.dog, ...patch.dog } });
}
export const defaultLook = () => ({ v: Core.LOOK_VERSION, cat: cat.coats[0].id, dog: dog.coats[0].id });
export function normalizeLook(raw) {
  const own = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { v: Core.LOOK_VERSION, cat: coatOf('cat', own.cat), dog: coatOf('dog', own.dog) };
}
export const parseLook = Core.parser(normalizeLook);
// Запись облика 0.1.4: облик кота и собаки — только понятный им (иначе по умолчанию), других полей правка не пишет.
export const lookRecord = (text, patch = {}) =>
  Core.lookRecord(text, Object.fromEntries(Object.entries(patch).filter(([id]) => KINDS.includes(id)).map(([id, coat]) => [id, coatOf(id, coat)])));

// ---------- реакции и покой: модель calm с питомцами кот и собака ----------

const scenes = [...cat.scenes, ...dog.scenes];
export const REACTIONS = {
  ...Object.fromEntries(
    Object.entries(calm.reactions).map(([type, r]) => {
      const row = { pose: r.pose, ms: r.ms, priority: r.priority, phrases: r.phrases ?? '' };
      if (r.cooldown !== undefined) row.cooldown = r.cooldown;
      if (r.toy) row.toy = true;
      if (r.decorative) row.decorative = true;
      if (r.calmOnly) row.calmOnly = true;
      return [type, row];
    }),
  ),
  ...Object.fromEntries(scenes.map((scene) => [scene.id, { pose: scene.pose, ms: scene.ms, still: scene.still, priority: 8, phrases: '', decorative: true, scene: true }])),
};
export const createDirector = (table = REACTIONS) => Core.createDirector(table);
export const petMood = (times, now) => Core.petMood(times, now, calm.limits.pet);
export const microDelay = (motion, random) => Core.microDelay(motion, random, calm.timings);
export const blinkDelay = (motion, random) => Core.blinkDelay(motion, random, calm.timings);
export const YAWN_CHANCE = calm.timings.yawn;
export const PHRASE_MS = calm.timings.phrase;
export const MICRO_KINDS = [...cat.micro];
export const microKinds = (kind) => profileOf(kind).micro;

// ---------- реплики ----------

export const PHRASES = calm.phrases.byPet.cat;
export const DOG_PHRASES = calm.phrases.byPet.dog;
const bank = (kind) => Core.bankOf(calm, kindOf(kind));
export const phraseList = (group, stage = 0, kind = 'cat') => Core.phraseList(bank(kind), group, stage);
export const pickPhrase = (group, { last = '', stage = 0, kind = 'cat', random } = {}) => Core.pickPhrase(bank(kind), group, { last, stage, random });

// ---------- сценки ----------

export const PET_SCENES = { cat: cat.scenes.map(({ id, needs }) => ({ id, needs })), dog: dog.scenes.map(({ id, needs }) => ({ id, needs })) };
export const SCENES = { cat: cat.scenes.map((scene) => scene.id), dog: dog.scenes.map((scene) => scene.id) };
export const PORTRAIT_SCENES = scenes.filter((scene) => scene.needs === 'any').map((scene) => scene.id);
export const SCENE_CHANCE = calm.scenes.chance;
export const sceneText = (type, name = '') => Core.sceneText(scenes.find((scene) => scene.id === type), name);
export const sceneTypes = (kind, full) => Core.sceneTypes(defOf(kind).scenes, full);
export const sceneOptions = (kind, declared, full) => (KINDS.includes(kind) ? Core.sceneOptions(kind, defOf(kind).scenes, declared, full) : []);
export function normalizeScene(raw) {
  const own = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const { v, day, by } = Core.normalizeScene(own);
  return { v, day, by, cat: SCENES.cat.includes(own.cat) ? own.cat : '' };
}
export const parseScene = (text) => normalizeScene(Core.readRecord(text).raw);
export const pickScene = ({ kind = 'cat', available = SCENES[kindOf(kind)], ...rest } = {}) => Core.pickScene({ ...rest, pet: kindOf(kind), available, chance: calm.scenes.chance, order: calm.scenes.order });
export const sceneFits = (next, { kind = 'cat', full = true, available = sceneTypes(kind, full), ...rest } = {}) => Core.sceneFits(next, { ...rest, available });
export const sceneCommit = (stored, mirror, { kind = 'cat', ...rest } = {}) => Core.sceneCommit(stored, mirror, { ...rest, pet: kindOf(kind) });

// ---------- «Поиграть»: тексты итогов по животному ----------

export const playTexts = (kind, name) => CorePlay.playTexts(defOf(kind), name);
export const playText = (outcome, toy, kind, name) => CorePlay.playText(outcome, toy, defOf(kind), name);
