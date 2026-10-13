// Имена и лакомство дня (pet/pet-rules.mjs, pet/cat-art.mjs, pet/pet.css, pet/dog.css): готовые имена без
// переименования существующих, лакомство — одно в день, без наказаний за пропуски; отдельный ключ, совместимый со
// старыми вкладками; миска и позы.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as R from '../pet/pet-rules.mjs';
import { bowlArt, bowlMiniSvg } from '../pet/cat-art.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = (file) => path.join(here, '..', file);
const K = R.storageKeys('site');
const TODAY = '2026-10-08';
const YESTERDAY = '2026-10-07';

test('отметка лакомства: отдельный ключ, нормализация, повреждённые значения, поля будущих версий', () => {
  assert.equal(K.treat, 'site:treat:v1');
  assert.ok(K.treat !== K.cat && K.treat !== K.companion);
  assert.deepEqual(R.parseTreat(null), { v: 1, fedDay: '' });
  for (const bad of ['{oops', '[]', '"2026-10-08"', '42', '{"fedDay":"вчера"}', '{"fedDay":20261008}']) assert.deepEqual(R.parseTreat(bad), { v: 1, fedDay: '' }, bad);
  assert.deepEqual(R.parseTreat('{"v":7,"fedDay":"2026-10-08","extra":true}'), { v: 1, fedDay: '2026-10-08' });
  const once = JSON.stringify(R.parseTreat('{"fedDay":"2026-10-08"}'));
  assert.equal(JSON.stringify(R.parseTreat(once)), once, 'нормализация идемпотентна');
  // Запись сохраняет чужие (будущие) поля и заменяет только день; повреждённое — с чистого листа. Больший номер схемы не
  // уменьшается (до PL02 запись понижала v до 1).
  assert.deepEqual(R.treatRecord('{"v":2,"fedDay":"2026-10-01","future":{"x":1}}', TODAY), { v: 2, fedDay: TODAY, future: { x: 1 } });
  assert.deepEqual(R.treatRecord('{oops', TODAY), { v: 1, fedDay: TODAY });
  assert.deepEqual(R.treatRecord(null, TODAY), { v: 1, fedDay: TODAY });
  assert.deepEqual(R.treatRecord('[1,2]', TODAY), { v: 1, fedDay: TODAY });
  // Прежние ключи о лакомстве не знают: их нормализация (и вкладки старого кода) поле не получают и не стирают.
  assert.equal('fedDay' in R.normalizeSettings({ fedDay: TODAY }), false);
  assert.equal('fedDay' in R.normalizeCompanion({ fedDay: TODAY }), false);
});

test('имена: прежние по умолчанию, готовые варианты, предложение только как выбор', () => {
  assert.equal(R.DEFAULT_NAME, 'Марс');
  assert.equal(R.PROFILES.dog.defaultName, 'Тоби');
  assert.equal(R.companionName({ kind: 'cat', name: '' }), 'Марс', 'существующий кот не переименовывается сам');
  assert.equal(R.companionName({ kind: 'dog', name: '' }), 'Тоби');
  assert.deepEqual(R.NAME_OFFER, { cat: 'Котлетыч', dog: 'Барклий' });
  for (const name of ['Котлетыч', 'Пельмень', 'Бублик', 'Мурджер', 'Сеньор Мур', 'Марс']) assert.ok(R.NAME_PRESETS.cat.includes(name), name);
  for (const name of ['Барклий', 'Лапыч', 'Батон', 'Спринт', 'Шашлычок', 'Тоби']) assert.ok(R.NAME_PRESETS.dog.includes(name), name);
  for (const kind of R.KINDS) {
    const list = R.namePresets(kind);
    assert.equal(new Set(list).size, list.length, `${kind}: без повторов`);
    for (const name of list) assert.ok(R.cleanName(name) === name && name.length <= R.NAME_MAX, name);
    assert.ok(list.includes(R.NAME_OFFER[kind]) && list.includes(R.PROFILES[kind].defaultName), kind);
    // Страницы по четыре, по кругу; страница имени — та, где оно есть.
    const pages = Array.from({ length: R.namePageCount(kind) }, (_, page) => R.namePage(kind, page));
    assert.deepEqual(pages.flat(), list);
    assert.ok(pages.every((page) => page.length <= R.NAMES_PER_PAGE && page.length > 0));
    assert.deepEqual(R.namePage(kind, R.namePageCount(kind)), pages[0]);
    assert.deepEqual(R.namePage(kind, -1), pages.at(-1));
    assert.ok(R.namePage(kind, R.namePageOf(kind, R.PROFILES[kind].defaultName)).includes(R.PROFILES[kind].defaultName));
    assert.equal(R.namePageOf(kind, 'Своё имя'), 0);
  }
  assert.equal(R.nameOffered(''), true, 'имя ещё не выбирали — предложение');
  assert.equal(R.nameOffered('   '), true);
  assert.equal(R.nameOffered('Марс'), false, '«Оставить «Марс»» пишет имя явно — предложения больше нет');
  assert.equal(R.nameOffered('Барсик'), false);
});

test('пауза и полночь: дни между датами, время до следующей местной полуночи', () => {
  assert.equal(R.daysBetween(YESTERDAY, TODAY), 1);
  assert.equal(R.daysBetween('2026-10-03', TODAY), 5);
  assert.equal(R.daysBetween('2026-03-28', '2026-03-30'), 2, 'через переход на летнее время');
  assert.equal(R.daysBetween('', TODAY), null);
  assert.equal(R.daysBetween('вчера', TODAY), null);
  assert.equal(R.msToMidnight(new Date(2026, 9, 8, 12, 0, 0)), 12 * 3600_000);
  assert.equal(R.msToMidnight(new Date(2026, 9, 8, 23, 59, 59, 900)), 1000, 'не меньше секунды');
  assert.equal(R.localDay(new Date(new Date(2026, 9, 8, 23, 59, 50).getTime() + R.msToMidnight(new Date(2026, 9, 8, 23, 59, 50)))), '2026-10-09');
});

test('реакции лакомства: подходит и ест, затем доволен; тишина откладывает; покой после — довольный', () => {
  assert.equal(R.REACTIONS.feed.pose, 'feed');
  assert.equal(R.REACTIONS.fed.pose, 'fed');
  assert.equal(R.REACTIONS.feed.priority, R.REACTIONS.joy.priority, 'не важнее ожидания после ошибки сохранения');
  assert.ok(R.REACTIONS.wait.priority < R.REACTIONS.feed.priority);
  const d = R.createDirector();
  const extra = { mini: 'bowl', follow: { type: 'fed', extra: { mini: 'bowl-empty' } } };
  assert.equal(R.request(d, 'feed', { now: 0, key: `feed:${TODAY}`, extra }).action, 'play');
  assert.equal(R.request(d, 'feed', { now: 10, key: `feed:${TODAY}`, extra }).action, 'drop', 'повторное нажатие в тот же день — без второй реакции');
  const next = R.finish(d, R.REACTIONS.feed.ms);
  assert.deepEqual([next.action, next.reaction?.type, next.reaction?.mini], ['play', 'fed', 'bowl-empty']);
  // Тишина ввода, диктовки или таймера: кормление ждёт и играет, когда тихо стало.
  const q = R.createDirector();
  R.setQuiet(q, 'timer', true, 0);
  assert.equal(R.request(q, 'feed', { now: 0, extra }).action, 'queue');
  assert.equal(R.setQuiet(q, 'timer', false, 1000).reaction?.type, 'feed');
  assert.equal(R.basePose({ content: true }), 'content');
  assert.equal(R.basePose({ content: true, focus: true }), 'attentive', 'на экране практики — внимателен');
  assert.equal(R.basePose({ content: true, quiet: true }), 'attentive');
  assert.equal(R.basePose({ content: true, resting: true }), 'rest');
  assert.equal(R.basePose({}), 'calm');
  // Выбор готового имени — короткий отклик с паузой; знаков нет.
  assert.equal(R.REACTIONS.named.pose, 'greet');
  assert.ok(R.REACTIONS.named.cooldown >= 3000);
});

test('реплики лакомства, имени и возвращения: у каждого животного свои, коротко, без упрёков и долгов', () => {
  const groups = ['fed', 'joyTreat', 'named', 'welcome'];
  for (const kind of R.KINDS) {
    for (const group of groups) {
      const list = R.phraseList(group, 0, kind);
      assert.ok(list.length >= 2, `${kind} ${group}`);
      for (const text of list) {
        const words = text.split(/\s+/).filter((word) => /[А-Яа-яЁё]/.test(word));
        assert.ok(words.length >= 2 && words.length <= 9, text);
        assert.doesNotMatch(text, /брос|голод|скуча|без тебя|опять|почему не|долг|пропустил|не приход|отличн|разочаров|правильн|тимлид|готов к/i, text);
      }
    }
  }
  const dog = groups.flatMap((group) => R.phraseList(group, 0, 'dog'));
  for (const text of dog) assert.doesNotMatch(text, /(^|[^а-яё])кот|мрр|мур|когт|кош/i, `кошачья деталь: ${text}`);
  const cat = groups.flatMap((group) => R.phraseList(group, 0, 'cat'));
  assert.equal(dog.filter((text) => cat.includes(text)).length, 0, 'банки разные по характеру');
  // Подсказка про лакомство — только после подтверждённого сохранения (группа радости), не в покое.
  for (const group of ['welcome', 'named', 'fed']) for (const text of R.phraseList(group, 0, 'cat')) assert.doesNotMatch(text, /сохран|записан/i, text);
});

test('миска и позы: графика без внешних ресурсов, позы есть у кота и собаки, без анимации — статично', async () => {
  assert.match(bowlArt({ state: 'ready' }), /data-cat-bowl data-state="ready"/);
  assert.match(bowlArt({ state: 'fed' }), /data-state="fed"/);
  assert.match(bowlArt({ state: 'чужое' }), /data-state="ready"/);
  assert.match(bowlArt({ state: 'waiting' }), /data-state="waiting"/);
  assert.match(bowlMiniSvg({ full: true }), /data-full/);
  assert.doesNotMatch(bowlMiniSvg({ full: false }), /data-full/);
  for (const svg of [bowlArt(), bowlMiniSvg()]) assert.doesNotMatch(svg, /https?:|href=|<script/);
  const cat = (await readFile(repo('pet/pet.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  const dog = (await readFile(repo('pet/dog.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const pose of ['feed', 'fed', 'content']) {
    assert.match(cat, new RegExp(`\\.cat-art\\[data-pose='${pose}'\\] \\{`), `кот: ${pose}`);
    assert.match(dog, new RegExp(`\\.cat-art\\[data-kind='dog'\\]\\[data-pose='${pose}'\\] \\{`), `собака: ${pose}`);
  }
  // Портрет (телефон, выбор напарника) — без смещения к миске.
  assert.match(cat, /\.cat-art\[data-view='portrait'\]\[data-pose='feed'\] \{[^}]*--all-x: 0px;/);
  assert.match(dog, /\.cat-art\[data-kind='dog'\]\[data-view='portrait'\]\[data-pose='feed'\] \{[^}]*--dg-all-x: 0px;/);
  // Миски нет, пока лакомство не открыто; корм — только пока ест (и в маленькой миске).
  assert.match(cat, /\.cat-bowl\[data-state='waiting'\] \{\s*display: none;/);
  assert.match(cat, /\.cat-bowl \.cat-bowl-food \{\s*opacity: 0;/);
  // Анимации кормления — только не в режиме «Без анимации»; общий запрет для .cat-art остаётся.
  assert.match(cat, /\.cat-art\[data-pose='feed'\]:not\(\[data-motion='none'\]\) \.cat-head \{\s*animation: cat-nibble/);
  assert.match(dog, /\.cat-art\[data-kind='dog'\]\[data-pose='feed'\]:not\(\[data-motion='none'\]\) \.dog-head \{\s*animation: dog-nibble/);
  assert.match(cat, /\.cat-art\[data-motion='none'\],\s*\.cat-art\[data-motion='none'\] \* \{\s*animation: none !important;\s*transition: none !important;/);
});
