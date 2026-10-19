// Кот (pet/pet-rules.mjs, pet/cat-art.mjs): ступени по знакам сайта, без двойных и ложных наград, тихий режим и
// приоритеты реакций, настройки, реплики и графика; сцена уголка на невысоком экране.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as R from './legacy-rules.mjs';
import { CAT_VIEWBOX, PORTRAIT_VIEWBOX, SCENE_VIEWBOX, catSvg, miniItemSvg, sceneCatBox, sceneItems, sceneSvg } from '../pet/cat-art.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('режиссёр: одна реакция, приоритеты, без дублей и накопленной очереди', () => {
  const d = R.createDirector();
  assert.equal(R.request(d, 'joy', { now: 0, key: 'entry:e1' }).action, 'play');
  // Повторная доставка того же события — ничего.
  assert.equal(R.request(d, 'joy', { now: 10, key: 'entry:e1' }).action, 'drop');
  // Новая вещь ниже по приоритету — ждёт одна, после радости.
  assert.equal(R.request(d, 'unlock', { now: 20, key: 'stage:1' }).action, 'queue');
  assert.equal(R.request(d, 'greet', { now: 30 }).action, 'queue');
  assert.equal(d.pending.type, 'unlock', 'отложенной остаётся самая важная');
  // Ошибка сохранения важнее радости — прерывает.
  assert.equal(R.request(d, 'wait', { now: 40 }).action, 'play');
  assert.equal(d.current.type, 'wait');
  const next = R.finish(d, 1100);
  assert.equal(next.action, 'play');
  assert.equal(next.reaction.type, 'unlock');
  assert.equal(R.finish(d, 4000).action, 'none', 'очередь не копится');
  // Декоративное движение во время реакции не ждёт, а пропадает.
  R.request(d, 'pet', { now: 5000 });
  assert.equal(R.request(d, 'yawn', { now: 5100 }).action, 'drop');
});

test('тихий режим (ввод, диктовка, интервью): без реакций, потом одна актуальная', () => {
  const d = R.createDirector();
  R.request(d, 'greet', { now: 0 });
  // Начался ввод — приветствие останавливается.
  assert.equal(R.setQuiet(d, 'typing', true, 100).action, 'stop');
  assert.equal(R.basePose({ quiet: true, resting: true }), 'attentive', 'при вводе не спит');
  assert.equal(R.request(d, 'joy', { now: 200, key: 'entry:a' }).action, 'queue');
  assert.equal(R.request(d, 'yawn', { now: 300 }).action, 'drop');
  assert.equal(R.setQuiet(d, 'dictation', true, 400).action, 'none');
  assert.equal(R.setQuiet(d, 'typing', false, 500).action, 'none', 'диктовка ещё идёт');
  const after = R.setQuiet(d, 'dictation', false, 600);
  assert.equal(after.action, 'play');
  assert.equal(after.reaction.type, 'joy');
  // Отложенная устаревает: после долгого интервью старую радость не показываем.
  const late = R.createDirector();
  R.setQuiet(late, 'timer', true, 0);
  R.request(late, 'joy', { now: 0, key: 'entry:b' });
  assert.equal(R.setQuiet(late, 'timer', false, R.PENDING_MS + 1).action, 'none');
  assert.equal(R.basePose({ focus: true }), 'attentive');
  assert.equal(R.basePose({}), 'calm');
  assert.equal(R.basePose({ resting: true }), 'rest');
});

test('радость и новая вещь от одного сохранения — цепочка, даже если сохранили во время ввода', () => {
  const d = R.createDirector();
  R.setQuiet(d, 'typing', true, 0);
  const follow = { type: 'unlock', extra: { mini: 'mug' } };
  assert.equal(R.request(d, 'joy', { now: 10, key: 'entry:x', extra: { follow } }).action, 'queue');
  const first = R.setQuiet(d, 'typing', false, 300);
  assert.equal(first.reaction.type, 'joy');
  const second = R.finish(d, 1900);
  assert.equal(second.action, 'play');
  assert.equal(second.reaction.type, 'unlock');
  assert.equal(second.reaction.mini, 'mug');
  assert.equal(R.finish(d, 4400).action, 'none');
  // Более важная отложенная (ошибка сохранения) идёт первой, продолжение не копится.
  const e = R.createDirector();
  R.request(e, 'joy', { now: 0, extra: { follow } });
  R.setQuiet(e, 'typing', true, 10);
  R.setQuiet(e, 'typing', false, 20);
  assert.equal(R.request(e, 'support', { now: 30, extra: { follow } }).action, 'play');
  e.pending = { type: 'wait', priority: 3, expires: 60_000 };
  assert.equal(R.finish(e, 2000).reaction.type, 'wait');
});

test('зевок — редкий и только в спокойном контексте', () => {
  const d = R.createDirector();
  assert.equal(R.request(d, 'yawn', { now: 0, context: 'focus' }).action, 'drop');
  assert.equal(R.request(d, 'yawn', { now: 0, context: 'calm' }).action, 'play');
  R.finish(d, 3000);
  assert.equal(R.request(d, 'yawn', { now: 60_000, context: 'calm' }).action, 'drop');
  assert.equal(R.request(d, 'yawn', { now: 6 * 60_000 + 1, context: 'calm' }).action, 'play');
});

test('движение: «уменьшить движение» и «Без анимации» отключают декоративные движения', () => {
  assert.equal(R.effectiveMotion({ motion: 'normal' }, true), 'none');
  assert.equal(R.effectiveMotion({ motion: 'calm' }, true), 'none');
  assert.equal(R.effectiveMotion({ motion: 'none' }, false), 'none');
  assert.equal(R.effectiveMotion({ motion: 'calm' }, false), 'calm');
  assert.equal(R.effectiveMotion({ motion: 'дискотека' }, false), 'normal');
  assert.equal(R.microDelay('none'), null);
  assert.equal(R.blinkDelay('none'), null);
  for (const r of [0, 0.5, 0.999]) {
    const normal = R.microDelay('normal', () => r);
    assert.ok(normal >= 45_000 && normal <= 90_000, String(normal));
    assert.ok(R.microDelay('calm', () => r) >= 90_000);
  }
});

test('сцена уголка на невысоком экране в ландшафте — уже, но в пропорции рисунка; в портрете — прежняя', async () => {
  const css = (await readFile(path.join(here, '..', 'pet', 'pet.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/(?:^|\n)\s*\.cat-scene-art \{([^}]+)\}/g)].map((match) => match[1]);
  assert.equal(rules.length, 2, 'базовое правило и ограничение в ландшафте');
  const [base, landscape] = rules;
  const [, , w, h] = SCENE_VIEWBOX.split(' ').map(Number);
  const [a, b] = /aspect-ratio: (\d+) \/ (\d+);/.exec(base)?.slice(1).map(Number) ?? [];
  assert.equal(a / b, w / h, 'пропорция CSS = viewBox сцены — без полей и обрезки');
  assert.match(base, /width: 100%;/);
  assert.match(base, /height: auto;/);
  // Ограничение — только ширина от высоты окна (vh и dvh), не больше ширины уголка, только в ландшафте.
  assert.match(css, /@media \(orientation: landscape\) \{\s*\.cat-scene-art \{/);
  const widths = [...landscape.matchAll(/width: (min\(100%, [^;]+\));/g)].map((match) => match[1]);
  assert.equal(widths.length, 2, widths.join(' | '));
  assert.ok(widths.some((value) => value.includes('100vh')) && widths.some((value) => value.includes('100dvh')), widths.join(' | '));
  for (const rule of rules) assert.doesNotMatch(rule, /max-height|object-fit|preserveAspectRatio|scale\(/);
  // С 2026-10-09 ниже 700 px высоты сбоку от сцены — «Поиграть»: ширина та же по высоте окна (vh и dvh), но оставляет
  // по 140 px с боков (кнопка 128 px и отступ); пропорция — прежняя.
  const low = /@media \(orientation: landscape\) and \(max-height: 700px\) \{([\s\S]*?)\n\}/g;
  const block = [...css.matchAll(low)].map((match) => match[1]).find((text) => text.includes('--scene-w'));
  assert.ok(block, 'невысокий ландшафт: ширина сцены рядом с «Поиграть»');
  const scene = [...block.matchAll(/--scene-w: ([^;]+);/g)].map((match) => match[1]);
  assert.ok(scene.some((value) => value.includes('100vh')) && scene.some((value) => value.includes('100dvh')), scene.join(' | '));
  assert.ok(scene.every((value) => value.startsWith('min(100cqw - 280px, max(240px,')), scene.join(' | '));
  assert.match(block, /\.cat-stage-wrap \.cat-scene-art \{\s*width: var\(--scene-w\);\s*\}/);
  assert.match(block, /\.cat-play-open \{[^}]*top: calc\(var\(--scene-w\) \/ 1\.6 - 48px\);[^}]*width: 128px;/);
});

test('поглаживание — без фарма: три реакции в минуту, затем «хватит пока» и тихий прищур', () => {
  assert.equal(R.petMood([], 0), 'pet');
  assert.equal(R.petMood([0, 1000], 2000), 'pet');
  assert.equal(R.petMood([0, 1000, 2000], 3000), 'enough');
  assert.equal(R.petMood([0, 1000, 2000, 3000], 4000), 'quiet');
  assert.equal(R.petMood([0, 1000, 2000, 3000], 70_000), 'pet');
});

test('настройки: повреждённые, старые и чужие значения не ломают кота', () => {
  const base = R.defaultSettings();
  for (const raw of ['', 'null', '{', '[]', '"кот"', '42', 'true']) assert.deepEqual(R.parseSettings(raw), base, raw);
  assert.deepEqual(R.parseSettings(null), base);
  const messy = R.normalizeSettings({ name: '  Барсик\u0000 <b>  Великий   и   ужасный  кот  ', accessory: 'crown', motion: 'turbo', phrases: 'yes', hidden: 'true', seenStage: 99, greetDay: 'сегодня', extra: 1 });
  assert.equal(messy.name, 'Барсик b Великий и ужасн');
  assert.ok(messy.name.length <= R.NAME_MAX);
  assert.equal(messy.accessory, 'scarf');
  assert.equal(messy.motion, 'normal');
  assert.equal(messy.phrases, true);
  assert.equal(messy.hidden, false);
  assert.equal(messy.seenStage, -1);
  assert.equal(messy.greetDay, '');
  assert.equal('extra' in messy, false);
  // Старая версия без v и версия из более новой вкладки: понятные поля сохраняются.
  const old = R.normalizeSettings({ name: 'Дымок', hidden: true, motion: 'calm' });
  assert.deepEqual([old.v, old.name, old.hidden, old.motion], [1, 'Дымок', true, 'calm']);
  const future = R.normalizeSettings({ v: 7, name: 'Марс', accessory: 'plaid', seenStage: 2, phrases: false, greetDay: '2026-10-07' });
  assert.deepEqual([future.v, future.accessory, future.seenStage, future.phrases, future.greetDay], [1, 'plaid', 2, false, '2026-10-07']);
  assert.equal(R.catName({ name: '' }), 'Марс');
  // Аксессуар закрытой ступени не надевается.
  assert.equal(R.wornAccessory({ accessory: 'badge' }, 1), 'scarf');
  assert.equal(R.wornAccessory({ accessory: 'plaid' }, 1), 'plaid');
});

test('реплики: коротко, без оценки личности и упрёков, без повтора подряд', () => {
  const all = Object.keys(R.PHRASES).flatMap((group) => R.phraseList(group, 4));
  // С 2026-10-08 ещё группы лакомства, имени и возвращения после паузы; с 2026-10-10 — лапа, миска и мячик сцены.
  assert.ok(all.length >= 20 && all.length <= 56, String(all.length));
  for (const text of all) {
    const words = text.split(/\s+/).filter((word) => /[А-Яа-яЁё]/.test(word));
    assert.ok(words.length >= 2 && words.length <= 9, text);
    assert.doesNotMatch(text, /ты (точно )?готов|отличн|разочаров|опять|без тебя|пропустил|правильн|тимлид/i, text);
  }
  let last = '';
  for (let i = 0; i < 50; i += 1) {
    const next = R.pickPhrase('joy', { last, random: Math.random });
    assert.notEqual(next, last);
    last = next;
  }
  // Реплики про вещи — только когда вещи открыты.
  assert.equal(R.phraseList('scene', 0).some((text) => text.includes('Лампа')), false);
  assert.equal(R.phraseList('scene', 3).some((text) => text.includes('Лампа')), true);
  assert.equal(R.pickPhrase('нет-такой'), '');
  assert.equal(R.marksText(1), '1 знак');
  assert.equal(R.marksText(3), '3 знака');
  assert.equal(R.marksText(11), '11 знаков');
  assert.equal(R.marksText(22), '22 знака');
});

test('графика: общий масштаб и опора поз, уникальные id, вещи по ступеням, без внешних ресурсов', () => {
  const a = catSvg({ id: 'cat-a' });
  const b = catSvg({ id: 'cat-b', view: 'portrait' });
  assert.match(a, new RegExp(`viewBox="${CAT_VIEWBOX}"`));
  assert.match(b, new RegExp(`viewBox="${PORTRAIT_VIEWBOX}"`));
  const ids = (svg) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set([...ids(a), ...ids(b)]).size, ids(a).length + ids(b).length, 'id двух котов на странице не совпадают');
  for (const pose of ['cat-sit', 'cat-lie', 'cat-head', 'cat-tail', 'cat-lid-up', 'cat-happy', 'cat-sleep']) assert.ok(a.includes(pose), pose);
  assert.ok(!b.includes('cat-sit') && b.includes('cat-head'), 'портрет — та же голова без тела');
  assert.ok(a.includes('aria-hidden="true"'));
  for (const accessory of R.ACCESSORIES) assert.ok(a.includes(`data-acc-part="${accessory.id}"`), accessory.id);
  assert.deepEqual(sceneItems(0), ['cushion']);
  assert.deepEqual(sceneItems(4), ['bed', 'notebook', 'mug', 'lamp', 'board', 'plant']);
  for (const stage of [0, 1, 2, 3, 4]) {
    const scene = sceneSvg({ id: 's', stage, cat: catSvg({ id: 'c', box: sceneCatBox(stage) }) });
    for (const item of sceneItems(stage)) assert.ok(scene.includes(`data-item="${item}"`), `${stage}: ${item}`);
    assert.doesNotMatch(scene, /https?:|href=/);
  }
  for (const item of ['mug', 'notebook', 'lamp', 'bed', 'board', 'plant']) assert.ok(miniItemSvg(item).startsWith('<svg'), item);
  assert.equal(miniItemSvg('нет'), '');
});


// PL11.2, D4: аксессуар по умолчанию (первый в определении, открыт с начала) — не награда ступени: unlockedBetween его не
// перечисляет, как 0.1.4 (STAGES[0] без accessory). Другой аксессуар ступени 0 у расширения — открываемая награда, остаётся.
test('D4: unlockedBetween — без аксессуара по умолчанию; второй аксессуар ступени 0 у расширения перечисляется', async () => {
  const { definePet } = await import('../pet/core.mjs');
  const { cat, dog } = await import('../pet/pets.mjs');
  const Core = await import('../pet/core/stages.mjs');
  assert.deepEqual(R.unlockedBetween(-1, 0), { items: ['cushion'], accessories: [] });
  assert.deepEqual(Core.unlockedBetween(cat, -1, 0), { items: ['cushion'], accessories: [] });
  assert.deepEqual(Core.unlockedBetween(dog, -1, 0).accessories, []);
  assert.deepEqual(Core.unlockedBetween(cat, -1, 4).accessories, ['plaid', 'badge'], 'награды ступеней 1 и 4 — как раньше');
  assert.deepEqual(Core.unlockedBetween(cat, 0, 2), { items: ['mug', 'notebook'], accessories: ['plaid'] });
  const src = JSON.parse(JSON.stringify(cat));
  const ext = definePet({ ...src, id: 'example.cat2', accessories: [{ id: 'bow', title: 'Бант', stage: 0 }, { id: 'bell', title: 'Колокольчик', stage: 0 }, { id: 'cap', title: 'Шапка', stage: 2 }] });
  assert.deepEqual(Core.unlockedBetween(ext, -1, 0).accessories, ['bell'], 'по умолчанию — только первый; второй ступени 0 — награда');
  assert.deepEqual(Core.unlockedBetween(ext, -1, 2).accessories, ['bell', 'cap']);
  assert.deepEqual(Core.unlockedBetween(ext, 0, 2).accessories, ['cap']);
});
