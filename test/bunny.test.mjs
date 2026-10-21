// Кролик — штатный питомец с 0.4.0 (README, «Кролик»; docs/ARCHITECTURE.md § 7.1): определение формата 1 (все обязательные
// позы, лапка в «Поиграть» без «Дай лапу», зевок и «устроился», две сценки — «прыгает» и в портрете, «умывается» — только
// целиком, морковка сразу и пучок сена со ступени «Наш ритуал»), веб-набор bunnyWeb (принят kitProblem против своего
// определения, рисунок — svg класса cat-art с data-kind='bunny', у всех обликов те же части, рамка и опора, ленточки
// всех трёх видов, вещи и маленькое сено, стили набора — pet/bunny.css), стили (каждая поза, движение и сценка — своим
// правилом только для data-kind='bunny'; только transform, opacity, display и анимации; образцы ленточек), области
// попадания и лапа «Поиграть» против рисунка, комната (исходная расстановка допустима на всех ступенях, сено не
// наезжает на кружку), реплики calm для кролика, ID штатного питомца без точки, запись — в ext:v1 (как у стороннего),
// mountPet в Node — отказ по настройкам раньше «нет document». Нативный набор — test/native-view.test.mjs,
// test/native-example.test.mjs; браузер — test/browser-bunny.mjs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { calm } from '../pet/behaviors.mjs';
import { bunny, bunnyWeb } from '../pet/bunny.mjs';
import { BUNNY_COATS, BUNNY_PALETTE, bunnySvg, carrotArt, hayArt, hayMiniSvg } from '../pet/bunny-art.mjs';
import { createPetCore, createStorage, definePet, PetError } from '../pet/core.mjs';
import { OPTIONAL_POSES, PAW_POSE, REQUIRED_POSES, SCENE_MS_MAX } from '../pet/core/define.mjs';
import { BUILTIN_KINDS, LEGACY_KINDS, ownHome } from '../pet/core/formats/legacy.mjs';
import * as Room from '../pet/core/room.mjs';
import { sceneCatBox, sceneSvg } from '../pet/cat-art.mjs';
import * as G from '../pet/pet-play.mjs';
import { mountPet } from '../pet/pet.mjs';
import { cat, dog } from '../pet/pets.mjs';
import { catWeb, dogWeb, kitNeeds, kitProblem, kitScenes } from '../pet/web/kits.mjs';

const defs = (...list) => new Map(list.map((def) => [def.id, def]));
const css = (await readFile(new URL('../pet/bunny.css', import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');

test('определение: штатный ID без точки, все обязательные позы и лапка (без «Дай лапу»), зевок и «устроился», две сценки, вещи и игрушки, запасной показ — кот', () => {
  assert.deepEqual([bunny.id, bunny.title, bunny.forms, bunny.names.default, bunny.names.offer, bunny.fallback], ['bunny', 'Кролик', { gen: 'кролика', acc: 'кролика' }, 'Пух', 'Морковкин', 'cat']);
  assert.deepEqual([BUILTIN_KINDS, LEGACY_KINDS], [['cat', 'dog', 'bunny'], ['cat', 'dog']], 'кролик — штатный, но не ключ 0.1.4');
  assert.deepEqual(ownHome('bunny'), { key: 'ext', path: ['pets', 'bunny'] }, 'имя и ленточка кролика — в ext:v1, как у стороннего питомца');
  assert.ok(Object.isFrozen(bunny) && Object.isFrozen(bunny.room) && Object.isFrozen(bunny.scenes[0]), 'глубоко заморожено');
  for (const pose of [...REQUIRED_POSES, PAW_POSE, ...OPTIONAL_POSES]) assert.ok(bunny.poses.includes(pose), pose);
  assert.deepEqual(bunny.poseFallback, undefined, 'замен нет — всё нарисовано');
  assert.deepEqual(bunny.actions, { pet: { text: '{name} шевелит носом.' }, paw: { text: '{name} тянется к твоей руке лапкой.', ask: false } });
  assert.deepEqual(
    bunny.scenes.map((scene) => [scene.id, scene.pose, scene.needs, scene.ms <= SCENE_MS_MAX && scene.still < scene.ms]),
    [['hop', 'hop', 'any', true], ['wash', 'wash', 'full', true]],
  );
  assert.deepEqual(bunny.coats.map((coat) => coat.id), ['snow', 'grey', 'spot']);
  assert.deepEqual(bunny.accessories.map((item) => [item.id, item.stage]), [['ribbon', 0], ['bow', 1], ['clover', 4]]);
  assert.deepEqual(bunny.room.toys.map((toy) => [toy.id, toy.stage, toy.home]), [['carrot', 0, [40, 232]], ['hay', 2, [280, 236]]]);
  const hay = bunny.items.list.find((item) => item.id === 'hay');
  assert.deepEqual([hay.stage, hay.mini, bunny.items.list.indexOf(hay)], [2, 0, bunny.items.list.findIndex((item) => item.id === 'notebook') + 1], 'сено — вещь ступени «Наш ритуал», первым рядом с питомцем');
  assert.equal(bunny.items.gifts.length, 5);
  assert.ok(bunny.micro.includes('nose') && bunny.micro.includes('ear') && bunny.openMicro.every((kind) => bunny.micro.includes(kind)));
  assert.equal(bunny.names.presets.length, 12);
  assert.equal(new Set([...cat.names.presets, ...dog.names.presets]).has(bunny.names.default), false, 'имя по умолчанию — своё');
  // Сторонний ID по-прежнему с точкой; штатный bunny занят — своё определение с таким ID не зарегистрировать дважды.
  assert.throws(() => definePet({ ...bunny, id: 'rabbit' }), (error) => error instanceof PetError && error.code === 'definition-invalid' && /cat, dog, bunny/.test(error.message));
  assert.equal(definePet({ ...bunny, id: 'example.rabbit' }).id, 'example.rabbit');
});

test('веб-набор: принят против своего определения, объявляет обе сценки, стили — pet/bunny.css; у штатных наборов кота и собаки ничего не изменилось', () => {
  const all = defs(cat, dog, bunny);
  assert.equal(kitProblem(bunnyWeb, all), '');
  assert.equal(kitProblem(catWeb, all), '');
  assert.equal(kitProblem(dogWeb, all), '');
  assert.ok(kitNeeds(bunny).poses.includes('paw'), 'лапа — обязательная поза набора');
  assert.deepEqual(kitScenes(bunnyWeb, bunny), ['hop', 'wash']);
  assert.deepEqual([bunnyWeb.pet, bunnyWeb.coats, bunnyWeb.accessories, bunnyWeb.items], ['bunny', ['snow', 'grey', 'spot'], ['ribbon', 'bow', 'clover'], ['carrot', 'hay']]);
  assert.ok(bunnyWeb.styles.length === 1 && bunnyWeb.styles[0].endsWith('/pet/bunny.css') && new URL(bunnyWeb.styles[0]).href === bunnyWeb.styles[0], bunnyWeb.styles[0]);
  // Без позы сценки набор не принимается, без лапы — тоже.
  const without = (list, ...ids) => list.filter((id) => !ids.includes(id));
  assert.match(kitProblem({ ...bunnyWeb, poses: without(bunnyWeb.poses, 'wash') }, all), /сценка «wash» — поза wash не нарисована/);
  assert.match(kitProblem({ ...bunnyWeb, poses: without(bunnyWeb.poses, 'paw') }, all), /не нарисовано \(poses\): paw$/);
  assert.match(kitProblem({ ...bunnyWeb, items: ['carrot'] }, all), /не нарисовано \(items\): hay$/);
});

const classes = (svg) => [...svg.matchAll(/class="([^"]+)"/g)].map(([, value]) => value).sort((a, b) => a.localeCompare(b));
const geometry = (svg) => ({ viewBox: /viewBox="([^"]+)"/.exec(svg)[1], place: /<svg[^>]*?( x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+")/.exec(svg)?.[1] ?? '' });

test('рисунок: svg класса cat-art с data-kind=bunny, те же части, рамка и опора у всех обликов, ленточки всех видов, без внешних ресурсов, id с префиксом; вещи и маленькое сено', () => {
  assert.deepEqual(Object.keys(BUNNY_COATS), bunny.coats.map((coat) => coat.id));
  assert.equal(BUNNY_PALETTE.fur, BUNNY_COATS.snow.fur);
  for (const view of ['full', 'portrait']) {
    const base = bunnySvg({ id: 'b', view });
    assert.match(base, /^\s*<svg class="cat-art" data-kind="bunny" data-view="(full|portrait)" data-coat="snow" data-pose="calm" data-acc="ribbon" viewBox="/);
    assert.equal(/viewBox="([^"]+)"/.exec(base)[1], view === 'full' ? '0 0 220 204' : '40 -4 120 120');
    for (const coat of Object.keys(BUNNY_COATS)) {
      const shown = bunnySvg({ id: 'b', view, coat });
      assert.match(shown, new RegExp(`data-coat="${coat}"`));
      assert.deepEqual(geometry(shown), geometry(base), `${coat} ${view}: та же рамка`);
      assert.deepEqual(classes(shown), classes(base), `${coat} ${view}: те же части`);
      for (const accessory of bunny.accessories) assert.ok(shown.includes(`data-acc-part="${accessory.id}"`), `${coat}: ${accessory.id}`);
      assert.doesNotMatch(shown, /https?:|href=|<image|undefined|NaN/, coat);
      const ids = new Set([...shown.matchAll(/id="([^"]+)"/g)].map(([, id]) => id));
      for (const [, ref] of shown.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.has(ref), `${coat}: ссылка на чужой id ${ref}`);
      for (const id of ids) assert.ok(id.startsWith('b-'), `${coat}: id ${id} без префикса экземпляра`);
    }
  }
  // Целиком — тело, лёжа и сидя, ступни, лапки, хвост-помпон, зубки; портрет — только голова с ушами и ленточка.
  const full = bunnySvg({ id: 'f' });
  for (const part of ['bunny-all', 'bunny-sit', 'bunny-lie', 'bunny-lie-front', 'bunny-tail', 'bunny-leg-l', 'bunny-leg-r', 'bunny-head', 'bunny-ear-l', 'bunny-ear-r', 'bunny-collar', 'bunny-nose', 'bunny-mouth-smile', 'bunny-mouth-yawn', 'bunny-wash']) assert.ok(full.includes(`class="${part}`) || full.includes(` ${part}"`) || full.includes(` ${part} `), part);
  const portrait = bunnySvg({ id: 'p', view: 'portrait' });
  assert.ok(!portrait.includes('bunny-sit') && !portrait.includes('bunny-lie') && portrait.includes('bunny-head') && portrait.includes('bunny-collar'), 'портрет — голова и ленточка');
  assert.ok(full.includes('url(#f-ground)') && !portrait.includes('-ground)'), 'тень под лапами — только целиком');
  // Место в сцене и коробка — общие (без прыжков при смене облика); пятнистый — отметины без новых классов.
  for (const stage of [0, 3]) assert.equal(new Set(Object.keys(BUNNY_COATS).map((coat) => geometry(bunnySvg({ id: 's', box: sceneCatBox(stage), coat })).place)).size, 1, `ступень ${stage}`);
  assert.equal(bunnySvg({ id: 'x', coat: 'нет-такого' }), bunnySvg({ id: 'x' }), 'неизвестный облик — белый');
  assert.match(sceneSvg({ id: 's', stage: 2, cat: bunnySvg({ id: 'b', box: sceneCatBox(2), coat: 'spot' }), extra: carrotArt() + hayArt({ fresh: true }) }), /data-coat="spot"[\s\S]*data-room="carrot"[\s\S]*class="cat-item is-fresh" data-item="hay" data-room="hay"/);
  assert.match(hayMiniSvg(), /^<svg class="cat-mini-art" viewBox="[^"]+" aria-hidden="true" focusable="false"><g class="cat-item" data-item="hay"/);
  assert.equal(bunnyWeb.item('carrot'), carrotArt());
  assert.equal(bunnyWeb.item('hay', { fresh: true }), hayArt({ fresh: true }));
  assert.deepEqual([bunnyWeb.item('yarn'), bunnyWeb.mini('carrot'), bunnyWeb.mini('hay')], ['', '', hayMiniSvg()]);
  assert.equal(bunnyWeb.art({ id: 'a', view: 'portrait', coat: 'grey', accessory: 'bow' }), bunnySvg({ id: 'a', view: 'portrait', coat: 'grey' }).replace('data-acc="ribbon"', 'data-acc="bow"'));
});

test('стили: каждая поза, движение и сценка — своим правилом только для data-kind=bunny; только transform, opacity, display и анимации; образцы ленточек', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
  const own = rules.filter((rule) => !rule.selector.startsWith('@') && !/^\d+%|^(from|to)\b/.test(rule.selector) && !/,\s*\d+%/.test(rule.selector));
  // Селекторы списка — по запятым верхнего уровня (внутри :is(…) запятые не делят).
  const split = (text) => {
    const out = [];
    let depth = 0;
    let from = 0;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') depth -= 1;
      else if (text[i] === ',' && depth === 0) (out.push(text.slice(from, i)), (from = i + 1));
    }
    out.push(text.slice(from));
    return out.map((one) => one.trim()).filter(Boolean);
  };
  for (const rule of own) {
    const selectors = split(rule.selector);
    for (const one of selectors) assert.ok(/\.cat-art\[data-kind='bunny'\]|^\.cat-swatch-(ribbon|bow|clover)$/.test(one), `чужое правило: ${one}`);
    const props = [...rule.body.matchAll(/(^|;|\n)\s*([a-z-]+)\s*:/g)].map(([, , name]) => name);
    for (const name of props) assert.ok(/^(--bn-|transform|transition|animation|opacity|display|scale|background|border-color)/.test(name), `${rule.selector}: ${name}`);
    if (/background|border-color/.test(rule.body)) assert.match(rule.selector, /^\.cat-swatch-/, rule.selector);
  }
  const poses = new Set([...Object.values(calm.reactions).map((reaction) => reaction.pose), 'calm', 'attentive', 'rest', 'content']);
  for (const pose of poses) {
    assert.ok(bunny.poses.includes(pose), `${pose}: поза в определении`);
    assert.match(css, new RegExp(`\\.cat-art\\[data-kind='bunny'\\]\\[data-pose='${pose}'\\] \\{`), pose);
  }
  for (const kind of new Set([...bunny.micro, 'blink', ...bunny.openMicro])) assert.match(css, new RegExp(`\\[data-kind='bunny'\\]\\[data-micro='${kind}'\\]`), kind);
  for (const scene of bunny.scenes) {
    assert.match(css, new RegExp(`\\[data-kind='bunny'\\]\\[data-scene='${scene.id}'\\]`), scene.id);
    assert.match(css, new RegExp(`\\[data-kind='bunny'\\]\\[data-scene='${scene.id}'\\]\\[data-motion='none'\\] \\{`), `${scene.id}: статичная поза без анимации`);
    assert.ok(css.includes(`${scene.ms / 1000}s`), `${scene.id}: кадры длятся как сценка (${scene.ms} мс)`);
  }
  for (const accessory of bunny.accessories) assert.match(css, new RegExp(`\\.cat-art\\[data-kind='bunny'\\]\\[data-acc='${accessory.id}'\\] \\[data-acc-part='${accessory.id}'\\]`), accessory.id);
  for (const accessory of bunny.accessories) assert.match(css, new RegExp(`\\.cat-swatch-${accessory.id} \\{`), accessory.id);
  // Поворот к предмету, лакомство со сдвигом к миске (--feed-x/--feed-y), портрет без сдвига, дыхание, спокойное движение.
  assert.match(css, /\[data-pose='sniff'\], \[data-pose='watch'\], \[data-pose='ball'\]\)\[data-toward='right'\]/);
  assert.match(css, /\[data-pose='feed'\] \{\s*--bn-all-x: calc\(var\(--feed-x, 0px\) - 30px\);\s*--bn-all-y: calc\(var\(--feed-y, 0px\) \+ 12px\);/);
  assert.match(css, /\[data-view='portrait'\]\[data-pose='feed'\] \{\s*--bn-all-x: 0px;/);
  assert.match(css, /\[data-motion='normal'\]\[data-breathe\] \.bunny-all \{\s*animation: bunny-breathe/);
  assert.match(css, /\[data-motion='calm'\] \{\s*--bn-move: 0\.8s;/);
  // Движения без кадров нет: каждое имя анимации объявлено.
  const names = new Set([...css.matchAll(/@keyframes ([\w-]+)/g)].map(([, name]) => name));
  for (const [, name] of css.matchAll(/animation(?:-name)?: ([\w-]+)/g)) if (name !== 'none') assert.ok(names.has(name) || name === 'pet-stretch', name);
});

test('«Поиграть»: голова, тело и лапка — по рисунку; углы рамки, кончики ушей и хвост — не питомец', () => {
  assert.equal(G.petPart(bunny, 100, 72), 'head', 'мордочка');
  assert.equal(G.petPart(bunny, 100, 150), 'body', 'грудь');
  assert.equal(G.petPart(bunny, 90, 185), 'paw', 'левая лапка');
  assert.equal(G.petPart(bunny, 116, 185), 'body', 'правая лапка — тело');
  assert.equal(G.petPart(bunny, 84, 30), 'head', 'ухо');
  assert.equal(G.petPart(bunny, 50, 170), 'body', 'бедро');
  for (const [u, v] of [[0, 0], [220, 0], [0, 204], [220, 204], [5, 100], [215, 100], [100, 202], [196, 150]]) assert.equal(G.petPart(bunny, u, v), '', `${u},${v}`);
  assert.deepEqual(bunny.play.paw, { cx: 90, cy: 176, r: 15 }, 'лапка на месте передней лапы, без поднятой области: подъём мал');
});

test('комната: исходная расстановка допустима на всех ступенях; морковка слева, сено перед кружкой; рамки кролика шире кота из-за ушей', () => {
  const model = Room.roomModel(bunny);
  for (const stage of [0, 1, 2, 3, 4]) {
    const layout = { model, stage, ...Room.arrange(model, stage, {}) };
    for (const [id, p] of Object.entries(layout.pos)) assert.ok(Room.fits(layout, id, p), `${stage}/${id} ${JSON.stringify(p)}`);
    assert.deepEqual(Object.keys(layout.pos).includes('hay'), stage >= 2, `сено — со ступени 2 (${stage})`);
  }
  assert.deepEqual([model.home.carrot, model.home.hay, model.home.rest, model.home.bowl], [[40, 232], [280, 236], [200, 206], [170, 205]]);
  assert.ok(bunny.room.pet.all[1] <= cat.room.pet.all[1] && bunny.room.pet.all[2] - bunny.room.pet.all[0] >= 120, JSON.stringify(bunny.room.pet));
  assert.deepEqual(Room.feedShift({ model, stage: 0, ...Room.arrange(model, 0, {}) }), [0, 0], 'миска на месте — без сдвига к миске');
});

test('реплики calm для кролика: свои группы те же, что у кота и собаки, без кошачьих и собачьих слов', () => {
  const bank = calm.phrases.byPet.bunny;
  assert.deepEqual(Object.keys(bank).sort(), Object.keys(calm.phrases.byPet.dog).sort());
  for (const [group, list] of Object.entries(bank)) {
    assert.ok(list.length >= 1, group);
    for (const item of list) {
      const text = typeof item === 'string' ? item : item.text;
      assert.doesNotMatch(text, /хвост|мур|лап(а|у|ой)\b(?!ка)|гав|мяу/i, `${group}: «${text}»`);
      assert.ok(text.length <= 48, `${group}: «${text}» — коротко`);
    }
  }
  // Ядро берёт банк кролика: выбор — в ext:v1 поверх кота; поглаживание в «Поиграть» отвечает репликой кролика (второе
  // ядро на том же хранилище — без реакции знакомства после выбора).
  const map = new Map();
  const storage = createStorage({ backend: { get: (name) => map.get(name) ?? null, set: (name, text) => void map.set(name, text) } });
  storage.load();
  const seen = [];
  const make = () => createPetCore({ storage, pets: [cat, dog, bunny], behaviors: [calm], progress: () => ({ marks: 3, today: 1, limit: 3 }), random: () => 0, log: { warn: (text) => seen.push(text) } });
  const cores = [];
  try {
    const first = make();
    cores.push(first);
    first.start();
    assert.equal(first.setPet('bunny').ok, true);
    assert.deepEqual(first.getState().pet, { id: 'bunny', shown: 'bunny', available: true });
    const ext = [...map.entries()].find(([key]) => key.endsWith(':ext:v1'));
    assert.deepEqual([ext?.[0], JSON.parse(ext?.[1] ?? 'null')?.pet], ['pet:ext:v1', { id: 'bunny', over: 'cat' }], 'выбор кролика — в ext:v1 поверх кота');
    assert.ok(![...map.keys()].some((key) => key.endsWith(':companion:v1')), 'companion:v1 не записан');
    first.destroy();
    const core = make();
    cores.push(core);
    core.start();
    assert.deepEqual(core.getState().pet, { id: 'bunny', shown: 'bunny', available: true }, 'выбор кролика пережил перезапуск');
    assert.equal(core.setDisplay({ full: true, playFloor: [-40, -10, 300, 230], pets: ['cat', 'dog', 'bunny'], views: ['corner', 'play', 'room'] }).ok, true);
    assert.equal(core.open('play').ok, true, 'игра открыта');
    assert.deepEqual([core.interact({ type: 'pet' }).ok, core.getState().pose.reaction?.type], [true, 'pet']);
    assert.ok(bank.pet.includes(core.getState().scenePhrase), `реплика поглаживания: «${core.getState().scenePhrase}»`);
    assert.deepEqual(seen, [], 'без предупреждений журнала');
  } finally {
    for (const core of cores) core.destroy();
  }
});

test('mountPet в Node: кролик с набором проходит проверку настроек — отказ только «нет document»; неполный набор кролика — отказ по набору раньше', () => {
  // Отказ mountPet в Node — сообщение console.error (как test/kits.test.mjs): отказ по набору раньше «нет document» значит,
  // что проверка идёт до любых действий.
  const refusal = (options) => {
    const told = [];
    const error = console.error;
    console.error = (...args) => told.push(args.map(String).join(' '));
    try {
      const pet = mountPet({ places: { logo: () => {}, top: () => {} }, progress: () => ({ marks: 0, today: 0, limit: 3 }), ...options });
      return { mounted: pet.mounted, told };
    } finally {
      console.error = error;
    }
  };
  const withKit = refusal({ pets: [cat, dog, bunny], behaviors: [calm], kits: [bunnyWeb] });
  assert.deepEqual([withKit.mounted, withKit.told], [false, ['Питомец не подключён: нет document — mountPet подключается только в браузере']]);
  const broken = refusal({ pets: [cat, dog, bunny], behaviors: [calm], kits: [{ ...bunnyWeb, poses: bunnyWeb.poses.filter((pose) => pose !== 'paw') }] });
  assert.equal(broken.mounted, false);
  assert.match(broken.told.join('\n'), /набор «bunny»: не нарисовано \(poses\): paw/, broken.told.join('\n'));
});
