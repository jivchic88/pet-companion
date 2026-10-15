// PL06, наборы отображения веба (docs/ARCHITECTURE.md § 7.3, § 7.1.1; по независимой проверке PL06). Что набор обязан
// нарисовать — по роли позы в формате и цепочкам замен (kitNeeds): конечная поза каждой обязательной позы словаря и лапы
// (если у питомца есть actions.paw) — даже если её использует ещё и сценка, и даже если это своя поза сценки или
// декоративная; необязательные сценки и позы набор может не рисовать. Штатный набор проверяется тем же kitProblem против
// переданного определения: по совпадению ID он подходит только определению, ресурсы которого покрывает (облики,
// аксессуары, вещи, игрушки, позы и замены). mountPet в Node: отказ по настройкам приходит раньше отказа «нет document» —
// так видно, что проверка идёт до любых действий. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { calm } from '../pet/behaviors.mjs';
import { definePet } from '../pet/core.mjs';
import { REQUIRED_POSES } from '../pet/core/define.mjs';
import { mountPet } from '../pet/pet.mjs';
import { cat, dog } from '../pet/pets.mjs';
import { catWeb, dogWeb, kitNeeds, kitProblem } from '../pet/web/kits.mjs';
import { bunny } from '../examples/extension/bunny.mjs';
import { bunnyWeb } from '../examples/extension/bunny-web.mjs';

const defs = (...list) => new Map(list.map((def) => [def.id, def]));
const without = (list, ...ids) => list.filter((id) => !ids.includes(id));
const ROLL = { id: 'roll', pose: 'roll', needs: 'any', ms: 2000, still: 1000, text: 'катается' };

// Определения, где сценка использует обязательную позу, а набор её не рисует и сценок не объявляет.
const calmScene = {
  cat: definePet({ ...cat, poses: without(cat.poses, 'stretch', 'curl'), scenes: [{ ...cat.scenes[0], pose: 'calm' }] }),
  bunny: definePet({ ...bunny, poses: without(bunny.poses, 'hop'), scenes: [{ ...bunny.scenes[0], pose: 'calm' }] }),
};
const noCalm = { cat: { ...catWeb, poses: without(catWeb.poses, 'calm'), scenes: [] }, bunny: { ...bunnyWeb, poses: without(bunnyWeb.poses, 'calm'), scenes: [] } };

test('обязательная поза, которую использует и сценка, остаётся обязательной: набор без calm (и без joy) отклоняется', () => {
  for (const id of ['cat', 'bunny']) {
    const def = calmScene[id];
    assert.ok(kitNeeds(def).poses.includes('calm'), id);
    assert.match(kitProblem(noCalm[id], defs(def)), /не нарисовано \(poses\): calm$/, id);
  }
  const joyScene = definePet({ ...bunny, poses: without(bunny.poses, 'hop'), scenes: [{ ...bunny.scenes[0], pose: 'joy' }] });
  assert.match(kitProblem({ ...bunnyWeb, poses: without(bunnyWeb.poses, 'joy'), scenes: [] }, defs(joyScene)), /не нарисовано \(poses\): joy$/);
  // Положительный контроль: тот же набор с calm — без сценок подходит.
  assert.equal(kitProblem({ ...noCalm.cat, poses: [...noCalm.cat.poses, 'calm'] }, defs(calmScene.cat)), '');
});

test('цель замены обязательной позы — своя поза сценки, декоративная или лапа — обязательна для набора; без замены лапы — сама paw', () => {
  // wait → hop (своя поза сценки): без hop набор не покрывает wait, даже без объявленной сценки.
  const hopWait = definePet({ ...bunny, poseFallback: { ...bunny.poseFallback, wait: 'hop' } });
  assert.ok(kitNeeds(hopWait).poses.includes('hop'));
  assert.match(kitProblem({ ...bunnyWeb, poses: without(bunnyWeb.poses, 'hop'), scenes: [] }, defs(hopWait)), /не нарисовано \(poses\): hop$/);
  assert.equal(kitProblem(bunnyWeb, defs(hopWait)), '');
  // support → settle (декоративная): обязательна, раз служит замене.
  const settleSupport = definePet({ ...bunny, poses: [...bunny.poses, 'settle'], poseFallback: { ...bunny.poseFallback, support: 'settle' } });
  assert.match(kitProblem(bunnyWeb, defs(settleSupport)), /не нарисовано \(poses\): settle$/);
  assert.equal(kitProblem({ ...bunnyWeb, poses: [...bunnyWeb.poses, 'settle'] }, defs(settleSupport)), '');
  // Лапа: своя paw — обязательна; замена paw → content — нужна content, не paw; без actions.paw — не нужна.
  assert.match(kitProblem({ ...dogWeb, poses: without(dogWeb.poses, 'paw') }, defs(dog)), /не нарисовано \(poses\): paw$/);
  const pawContent = definePet({ ...dog, poses: without(dog.poses, 'paw'), poseFallback: { paw: 'content' } });
  assert.equal(kitProblem({ ...dogWeb, poses: without(dogWeb.poses, 'paw') }, defs(pawContent)), '');
  assert.equal(kitNeeds(bunny).poses.includes('paw'), false);
});

// Что отображение объявляет ядру (сценки набора, которые есть в определении), — test/browser-kits.mjs: без предупреждений
// журнала о неизвестной сценке.
test('необязательное не требуется: сценки, их позы, yawn и settle, не служащие заменам; объявленная сценка — с нарисованной позой; лишняя сценка набора — не ошибка', () => {
  const sorted = (list) => [...list].sort();
  assert.deepEqual(sorted(kitNeeds(cat).poses), sorted([...REQUIRED_POSES, 'paw']));
  assert.deepEqual(sorted(kitNeeds(bunny).poses), sorted(['calm', 'attentive', 'rest', 'content', 'joy', 'pet', 'feed', 'sniff']));
  assert.equal(kitProblem({ ...catWeb, poses: without(catWeb.poses, 'yawn', 'settle', 'stretch', 'curl'), scenes: [] }, defs(cat)), '');
  assert.equal(kitProblem({ ...bunnyWeb, poses: without(bunnyWeb.poses, 'hop'), scenes: [] }, defs(bunny)), '');
  // Объявил сценку curl — её поза обязана быть нарисована.
  assert.match(kitProblem({ ...catWeb, poses: without(catWeb.poses, 'curl') }, defs(cat)), /сценка «curl» — поза curl не нарисована$/);
  // Сценки curl нет в определении: штатный набор подходит (лишний рисунок, как лишний облик), отображение объявит только
  // stretch.
  const noCurl = definePet({ ...cat, poses: without(cat.poses, 'curl'), scenes: cat.scenes.filter((scene) => scene.id !== 'curl') });
  assert.equal(kitProblem(catWeb, defs(noCurl)), '');
});

// Изменённые определения штатных ID: какой ресурс штатный набор не покрывает.
const changed = {
  coat: [definePet({ ...cat, coats: [...cat.coats, { id: 'purple', title: 'Фиолетовый' }] }), /не нарисовано \(coats\): purple$/],
  accessory: [definePet({ ...cat, accessories: [...cat.accessories, { id: 'bow', title: 'Бантик', stage: 2 }] }), /не нарисовано \(accessories\): bow$/],
  item: [definePet({ ...cat, items: { ...cat.items, list: [...cat.items.list, { id: 'feather', title: 'Перо', stage: 2 }] } }), /не нарисовано \(items\): feather$/],
  toy: [definePet({ ...dog, room: { ...dog.room, toys: [...dog.room.toys, { ...dog.room.toys[0], id: 'stick', title: 'Палка' }] } }), /не нарисовано \(items\): stick$/],
  pose: [definePet({ ...cat, poses: [...without(cat.poses, 'wait'), 'roll'], poseFallback: { wait: 'roll' }, scenes: [...cat.scenes, ROLL] }), /не нарисовано \(poses\): roll$/],
};

test('штатный набор против изменённого определения своего ID: облик, аксессуар, вещь, игрушка, поза через замену — отказ; исходные и с необязательной сценкой — подходят', () => {
  assert.deepEqual([kitProblem(catWeb, defs(cat)), kitProblem(dogWeb, defs(dog))], ['', '']);
  for (const [name, [def, problem]] of Object.entries(changed)) assert.match(kitProblem(def.id === 'cat' ? catWeb : dogWeb, defs(def)), problem, name);
  // Своя сценка roll без замены — необязательная: штатный набор её не рисует и не объявляет.
  const extraScene = definePet({ ...cat, poses: [...cat.poses, 'roll'], scenes: [...cat.scenes, ROLL] });
  assert.equal(kitProblem(catWeb, defs(extraScene)), '');
  // Полный свой набор (override) — подходит.
  assert.equal(kitProblem({ ...catWeb, coats: [...catWeb.coats, 'purple'] }, defs(changed.coat[0])), '');
});

// Отказ mountPet в Node: сообщение console.error; без document подключение и так не идёт — поэтому отказ по набору,
// пришедший первым, значит: проверка — до любых действий (и до проверки окружения).
function refusal(options) {
  const told = [];
  const error = console.error;
  console.error = (...args) => told.push(args.map(String).join(' '));
  try {
    const pet = mountPet({ places: { logo: () => {}, top: () => {} }, ...options });
    return { mounted: pet.mounted, state: pet.getState(), told, owner: globalThis[Symbol.for('pet-module')] ?? null };
  } finally {
    console.error = error;
  }
}
const NO_DOCUMENT = 'Питомец не подключён: нет document — mountPet подключается только в браузере';

test('mountPet: каждый выбранный набор — и штатный — проверяется против своего определения до подключения', () => {
  const refused = (options, message, label = message) => {
    const result = refusal(options);
    assert.deepEqual([result.mounted, result.state, result.owner, result.told.length], [false, null, null, 1], label);
    assert.ok(result.told[0].startsWith('Питомец не подключён: ') && result.told[0].includes(message), `${label}: ${result.told[0]}`);
  };
  // Контроли: без новых настроек, исходные определения, полный свой набор, свой питомец без кота — проверку проходят.
  for (const options of [{}, { pets: [cat, dog], behaviors: [calm] }, { pets: [changed.coat[0], dog], behaviors: [calm], kits: [{ ...catWeb, coats: [...catWeb.coats, 'purple'] }] }, { pets: [bunny, dog], behaviors: [calm], kits: [bunnyWeb] }]) {
    assert.deepEqual(refusal(options).told, [NO_DOCUMENT], JSON.stringify(Object.keys(options)));
  }
  // Штатный набор не покрывает изменённое определение — отказ с подсказкой.
  for (const [name, [def]] of Object.entries(changed)) refused({ pets: def.id === 'cat' ? [def, dog] : [cat, def], behaviors: [calm] }, `штатный набор «${def.id}»: не нарисовано`, name);
  refused({ pets: [changed.coat[0], dog], behaviors: [calm] }, 'штатный набор «cat»: не нарисовано (coats): purple — свой набор этого питомца передаётся в kits');
  // Свой набор без обязательной calm (её использует сценка) — отказ.
  refused({ pets: [calmScene.cat, dog], behaviors: [calm], kits: [noCalm.cat] }, 'kits[0]: набор «cat»: не нарисовано (poses): calm');
  // Набор без определения — отказ.
  refused({ pets: [cat, dog], behaviors: [calm], kits: [bunnyWeb] }, 'kits[0]: набор «example.bunny»: нет определения');
});
