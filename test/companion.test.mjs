// Выбор животного и собака (pet/pet-rules.mjs, pet/dog-art.mjs, pet/dog.css): прежние настройки кота без потерь,
// отдельные имя и аксессуар животных, безопасное чтение и запись двух ключей, реплики собаки, графика и стили.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as R from '../pet/pet-rules.mjs';
import { CAT_VIEWBOX, catSvg, sceneCatBox, sceneSvg } from '../pet/cat-art.mjs';
import { DOG_PORTRAIT_VIEWBOX, DOG_VIEWBOX, ballArt, ballMiniSvg, dogSvg } from '../pet/dog-art.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = (file) => path.join(here, '..', file);
// Ключи в пространстве имён сайта (mountPet({ storage: 'site' })).
const K = R.storageKeys('site');

// Как пишет настройки вкладка, открытая до выбора собаки: только ключ cat, только его поля.
const oldTabWrite = (stored, fields) => JSON.stringify(R.normalizeSettings({ ...R.parseSettings(stored), ...fields }));
// Как пишет новая (pet/pet.mjs, updateSettings): каждый ключ — только если в нём есть изменённые поля.
function newTabWrite(storage, kind, fields) {
  const part = R.splitUpdate(kind, fields);
  if (Object.keys(part.cat).length) storage[K.cat] = JSON.stringify(R.normalizeSettings({ ...R.parseSettings(storage[K.cat]), ...part.cat }));
  if (Object.keys(part.companion).length) storage[K.companion] = JSON.stringify(R.mergeCompanion(R.parseCompanion(storage[K.companion]), part.companion));
}
const view = (storage, kind) => {
  const companion = R.parseCompanion(storage[K.companion]);
  return R.companionView(R.parseSettings(storage[K.cat]), companion, kind ?? companion.kind);
};

test('старые настройки кота без выбора напарника: остаётся кот, всё понятное сохраняется, ключ не переписывается', () => {
  const old = JSON.stringify({ v: 1, name: 'Барсик', accessory: 'plaid', motion: 'calm', phrases: false, hidden: true, seenStage: 2, greetDay: '2026-10-07' });
  const storage = { [K.cat]: old };
  const shown = view(storage);
  assert.deepEqual(
    [shown.kind, R.companionName(shown), shown.accessory, shown.motion, shown.phrases, shown.hidden, shown.seenStage, shown.greetDay],
    ['cat', 'Барсик', 'plaid', 'calm', false, true, 2, '2026-10-07'],
  );
  // Чтение ничего не пишет и не переносит: старый ключ байт в байт, нового нет.
  assert.equal(storage[K.cat], old);
  assert.equal(storage[K.companion], undefined);
  // Скрытый кот остаётся скрытым: собака не появляется сама.
  assert.equal(R.companionView(R.parseSettings(old), R.defaultCompanion(), 'dog').hidden, true);
});

test('имя и аксессуар у кота и собаки свои; выбор сохраняется; возврат к животному — его настройки', () => {
  const storage = { [K.cat]: JSON.stringify({ name: 'Барсик', accessory: 'scarf', seenStage: 1 }) };
  newTabWrite(storage, 'cat', { kind: 'dog' });
  assert.equal(view(storage).kind, 'dog');
  assert.equal(R.companionName(view(storage)), 'Тоби', 'имя собаки по умолчанию');
  newTabWrite(storage, 'dog', { name: 'Рекс' });
  newTabWrite(storage, 'dog', { accessory: 'plaid' });
  const cat = R.parseSettings(storage[K.cat]);
  assert.deepEqual([cat.name, cat.accessory], ['Барсик', 'scarf'], 'настройки кота не перезаписаны собакой');
  assert.deepEqual([view(storage, 'dog').name, view(storage, 'dog').accessory], ['Рекс', 'plaid']);
  newTabWrite(storage, 'dog', { kind: 'cat' });
  assert.deepEqual([view(storage).kind, view(storage).name, view(storage).accessory], ['cat', 'Барсик', 'scarf']);
  newTabWrite(storage, 'cat', { name: 'Дымок', accessory: 'plaid' });
  assert.deepEqual(R.parseCompanion(storage[K.companion]).dog, { name: 'Рекс', accessory: 'plaid' }, 'кот не трогает собаку');
  // Общие поля — одни на обоих: движение, реплики, «скрыт», ступень, приветствие.
  newTabWrite(storage, 'dog', { motion: 'none', phrases: false });
  assert.deepEqual([view(storage, 'cat').motion, view(storage, 'cat').phrases], ['none', false]);
  assert.equal(R.parseCompanion(storage[K.companion]).motion, undefined, 'общие поля — только в прежнем ключе');
});

test('повторное чтение и запись безопасны; изменение одного поля не откатывает другие', () => {
  const storage = {};
  newTabWrite(storage, 'cat', { kind: 'dog' });
  newTabWrite(storage, 'dog', { name: 'Рекс' });
  const once = storage[K.companion];
  for (let i = 0; i < 3; i += 1) assert.equal(JSON.stringify(R.parseCompanion(once)), once, 'нормализация идемпотентна');
  // Вкладка 1 знает старое имя собаки; вкладка 2 поменяла его. Вкладка 1 меняет только выбор —
  // перед записью она читает свежие значения, имя не откатывается.
  storage[K.companion] = JSON.stringify(R.mergeCompanion(R.parseCompanion(storage[K.companion]), { dog: { name: 'Тобиас' } }));
  newTabWrite(storage, 'dog', { kind: 'cat' });
  assert.deepEqual(R.parseCompanion(storage[K.companion]), { v: 1, kind: 'cat', dog: { name: 'Тобиас', accessory: 'scarf' } });
});

test('вкладка, открытая до обновления, не стирает выбор и собаку: её записи — только в прежний ключ', () => {
  const storage = { [K.cat]: JSON.stringify({ name: 'Барсик', seenStage: 2 }) };
  newTabWrite(storage, 'cat', { kind: 'dog' });
  newTabWrite(storage, 'dog', { name: 'Рекс', accessory: 'plaid' });
  const companion = storage[K.companion];
  // Старый код меняет имя (своего кота), движение и день приветствия.
  storage[K.cat] = oldTabWrite(storage[K.cat], { name: 'Мурзик', motion: 'calm', greetDay: '2026-10-08' });
  assert.equal(storage[K.companion], companion, 'новый ключ не тронут');
  const shown = view(storage);
  assert.deepEqual([shown.kind, shown.name, shown.accessory, shown.motion], ['dog', 'Рекс', 'plaid', 'calm']);
  assert.equal(view(storage, 'cat').name, 'Мурзик');
  // Новый код не кладёт в прежний ключ чужих полей — старая вкладка читает его как раньше.
  assert.deepEqual(Object.keys(JSON.parse(storage[K.cat])).sort(), Object.keys(R.defaultSettings()).sort());
});

test('повреждённые данные и неизвестный вид — кот по умолчанию; имена безопасны', () => {
  const base = R.defaultCompanion();
  for (const raw of ['', 'null', '{', '[]', '"dog"', '42', 'true', '{"kind":"hamster"}', '{"kind":["dog"]}', '{"dog":"Рекс"}']) {
    assert.deepEqual(R.parseCompanion(raw), base, raw);
  }
  assert.deepEqual(R.parseCompanion(null), base);
  assert.equal(R.kindOf('parrot'), 'cat');
  assert.equal(R.companionView(R.defaultSettings(), base, 'parrot').kind, 'cat');
  assert.equal(R.profileOf('parrot').title, 'Кот');
  const messy = R.normalizeCompanion({ v: 9, kind: 'dog', dog: { name: '  <img src=x>\u0007 Шарик   ', accessory: 'crown' }, extra: 1 });
  assert.deepEqual(messy, { v: 1, kind: 'dog', dog: { name: 'img src=x Шарик', accessory: 'scarf' } });
  assert.ok(R.normalizeCompanion({ dog: { name: 'Очень длинное имя для собаки-напарника' } }).dog.name.length <= R.NAME_MAX);
});

test('подарки ступеней по животному: у собаки не «Марс», мячик с 9 знаков; награды кота прежние', () => {
  assert.equal(R.stageGift(0, 'cat'), 'Марс и простая подушка');
  assert.equal(R.stageGift(0, 'cat'), R.STAGES[0].gift);
  assert.equal(R.stageGift(0, 'dog'), 'Тоби и простая подушка');
  assert.equal(R.stageGift(0, 'dog', 'Рекс'), 'Рекс и простая подушка');
  assert.doesNotMatch(R.stageGift(0, 'dog'), /Марс/);
  for (let i = 1; i < R.STAGES.length; i += 1) assert.equal(R.stageGift(i, 'cat'), R.STAGES[i].gift, `кот ${i}`);
  assert.equal(R.stageGift(2, 'dog'), 'Кружка, блокнот и мячик');
  assert.deepEqual(R.stageItems(2, 'dog'), ['mug', 'notebook', 'ball']);
  assert.deepEqual(R.stageItems(2, 'cat'), ['mug', 'notebook']);
  assert.equal(R.stageGift(9, 'dog'), '');
});

test('смена напарника во время реакции: прежняя и отложенная снимаются, то же событие не повторяется', () => {
  const d = R.createDirector();
  R.setQuiet(d, 'typing', true, 0);
  assert.equal(R.request(d, 'joy', { now: 10, key: 'entry:e1' }).action, 'queue');
  // Смена (switchKind в pet/pet.mjs): текущая и отложенная реакции сняты, тишина и отыгранные события — нет.
  d.current = null;
  d.pending = null;
  assert.equal(R.setQuiet(d, 'typing', false, 300).action, 'none', 'отложенная радость прежнего напарника не играет');
  assert.equal(R.request(d, 'joy', { now: 400, key: 'entry:e1' }).action, 'drop', 'повторная доставка того же сохранения — ничего');
  // Знакомство после выбора — не чаще раза в 6 секунд.
  assert.equal(R.request(d, 'meet', { now: 1000 }).action, 'play');
  R.finish(d, 2600);
  assert.equal(R.request(d, 'meet', { now: 3000 }).action, 'drop');
  assert.equal(R.request(d, 'meet', { now: 8000 }).action, 'play');
});

test('реплики собаки: свой характер, коротко, без оценки, упрёков и кошачьих деталей; кот прежний', () => {
  const groups = ['greet', 'joy', 'support', 'unlock', 'plaid', 'pet', 'petEnough', 'scene', 'rest', 'paw'];
  for (const group of groups) assert.ok(R.phraseList(group, 4, 'dog').length > 0, group);
  for (const [type, reaction] of Object.entries(R.REACTIONS)) {
    if (reaction.phrases) assert.ok(R.phraseList(reaction.phrases, 4, 'dog').length > 0, `dog ${type}`);
  }
  const dog = groups.flatMap((group) => R.phraseList(group, 4, 'dog'));
  assert.ok(dog.length >= 20 && dog.length <= 40, String(dog.length));
  for (const text of dog) {
    const words = text.split(/\s+/).filter((word) => /[А-Яа-яЁё]/.test(word));
    assert.ok(words.length >= 2 && words.length <= 9, text);
    assert.doesNotMatch(text, /ты (точно )?готов|отличн|разочаров|опять|без тебя|пропустил|правильн|тимлид|тревож|скуча|голод|грущ|почему не|не приход|потеря/i, text);
    assert.doesNotMatch(text, /(^|[^а-яё])кот|мрр|мур|когт|кош|усы|лоток/i, `кошачья деталь: ${text}`);
  }
  const cat = Object.keys(R.PHRASES).flatMap((group) => R.phraseList(group, 4, 'cat'));
  assert.deepEqual(cat, Object.keys(R.PHRASES).flatMap((group) => R.phraseList(group, 4)), 'кот по умолчанию — прежний банк');
  assert.equal(dog.filter((text) => cat.includes(text)).length <= 2, true, 'банки разные по характеру');
  // С 2026-10-10 кот касается руки лапой в сцене «Поиграть» — свои реплики, без собачьей команды.
  assert.ok(R.phraseList('paw', 0, 'cat').length >= 2 && R.phraseList('paw', 0, 'cat').every((text) => !/дай лапу|по рукам|договорились/i.test(text)), 'у кота — своя «лапа»');
  // Сообщение о сохранении — только в радости (после подтверждения сервера), не в ожидании и не в покое.
  for (const group of ['scene', 'rest', 'greet', 'pet', 'paw']) {
    for (const text of R.phraseList(group, 4, 'dog')) assert.doesNotMatch(text, /сохран|записан/i, `${group}: ${text}`);
  }
  assert.equal(R.phraseList('scene', 1, 'dog').some((text) => text.includes('Мячик')), false);
  assert.equal(R.phraseList('scene', 2, 'dog').some((text) => text.includes('Мячик')), true);
});

test('dog.css — только для собаки: каждый селектор ограничен data-kind=dog, кошачьих частей нет', async () => {
  const css = (await readFile(repo('pet/dog.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '');
  const selectors = [...css.matchAll(/([^{}@]+)\{[^{}]*\}/g)]
    .map((match) => match[1].trim())
    .filter((selector) => selector && !selector.startsWith('@'))
    .flatMap((selector) => selector.split(/,(?![^(]*\))/).map((part) => part.trim()));
  assert.ok(selectors.length > 40, String(selectors.length));
  for (const selector of selectors) {
    assert.match(selector, /\.cat-art\[data-kind='dog'\]/, selector);
    assert.doesNotMatch(selector.replace(/\.cat-(art|dock-btn|side-face)\b/g, ''), /\.cat-/, `кошачья часть: ${selector}`);
    assert.doesNotMatch(selector, /^(html|body|:root|\*)/, selector);
  }
  assert.doesNotMatch(css, /!important/);
});

test('графика собаки: общий масштаб и опора, все позы, уникальные id и ссылки, без внешних ресурсов', () => {
  assert.equal(DOG_VIEWBOX, CAT_VIEWBOX, 'тот же масштаб и земля — то же место в панели и сцене');
  const places = ['dog-dock', 'dog-side', 'dog-face', 'dog-scene-art', 'dog-pick'];
  const svgs = places.map((id) => dogSvg({ id, view: id.endsWith('side') || id.endsWith('face') || id.endsWith('pick') ? 'portrait' : 'full' }));
  svgs.push(catSvg({ id: 'cat-pick', view: 'portrait' }));
  const ids = (svg) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  const all = svgs.flatMap(ids);
  assert.equal(new Set(all).size, all.length, 'id не совпадают на одной странице (места, выбор, кот)');
  for (const svg of svgs) {
    const own = new Set(ids(svg));
    for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(own.has(ref), `ссылка на чужой id: ${ref}`);
    assert.doesNotMatch(svg, /https?:|href=|<image/);
  }
  const full = dogSvg({ id: 'd' });
  assert.match(full, /data-kind="dog"/);
  assert.match(full, /class="cat-art"/);
  for (const part of ['dog-sit', 'dog-lie', 'dog-lie-front', 'dog-head', 'dog-ear-l', 'dog-ear-r', 'dog-tail', 'dog-tuft', 'dog-lid-up', 'dog-happy', 'dog-sleep', 'dog-paw-up', 'dog-mouth-open', 'dog-mouth-yawn', 'dog-brow-l']) assert.ok(full.includes(part), part);
  for (const accessory of R.ACCESSORIES) assert.ok(full.includes(`data-acc-part="${accessory.id}"`), accessory.id);
  const portrait = dogSvg({ id: 'p', view: 'portrait' });
  assert.match(portrait, new RegExp(`viewBox="${DOG_PORTRAIT_VIEWBOX}"`));
  assert.ok(!portrait.includes('dog-sit') && portrait.includes('dog-head') && portrait.includes('dog-ear-r'), 'портрет — голова с ушами и платком');
  // Мячик — в сцене (с подсветкой новинки) и маленький рядом с собакой.
  const scene = sceneSvg({ id: 's', stage: 2, cat: dogSvg({ id: 'sd', box: sceneCatBox(2) }), extra: ballArt({ fresh: true }) });
  assert.match(scene, /class="cat-item is-fresh" data-item="ball"/);
  assert.match(ballMiniSvg(), /^<svg class="cat-mini-art"/);
  assert.equal(sceneSvg({ id: 'c', stage: 2 }).includes('data-item="ball"'), false, 'у кота мячика нет');
});

