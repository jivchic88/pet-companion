// Место и вид рядом со страницей (pet/pet-place.mjs, реакция «устроился» в pet/pet-rules.mjs): значения по умолчанию
// и нормализация, отдельный ключ без потери чужих полей и значений будущих версий, независимость телефона и компьютера,
// поведение без выбора, временная замена места и вида без изменения сохранённого, правило двух вкладок.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as P from '../pet/pet-place.mjs';
import * as R from './legacy-rules.mjs';

const K = R.storageKeys('site');

const ROOMY = { tall: true, roomy: true, gutterFull: true, gutterCompact: true };
const SHORT = { tall: false, roomy: false, gutterFull: true, gutterCompact: true }; // 1280×760
const NARROW = { tall: false, roomy: false, gutterFull: false, gutterCompact: false }; // 861×650
const PHONE = { phone: true, topFull: true, barCompact: true, barFull: false }; // 390×844
const PHONE320 = { phone: true, topFull: false, barCompact: false, barFull: false };
const PHONE_WIDE = { phone: true, topFull: true, barCompact: true, barFull: true }; // 860×650
const record = (desktop, phone) => ({ v: 1, ...(desktop ? { desktop } : {}), ...(phone ? { phone } : {}) });
const shown = (layout) => `${layout.at}:${layout.view}`;

test('место: свой ключ; без ключа, повреждённое и неизвестное — по умолчанию у каждого устройства', () => {
  assert.equal(K.place, 'site:place:v1');
  assert.equal(new Set([K.place, K.cat, K.companion, K.look, K.treat]).size, 5, 'отдельный ключ');
  const base = { v: 1, desktop: { place: '', view: 'auto' }, phone: { place: 'top', view: 'auto' } };
  assert.deepEqual(P.defaultPlace(), base);
  for (const text of [null, '', '{', 'null', '[]', '42', '"top"', '{"desktop":[],"phone":"x"}']) assert.deepEqual(P.parsePlace(text), base, String(text));
  assert.deepEqual(P.normalizePlace({ desktop: { place: 'corner', view: 'huge' }, phone: { place: 'logo', view: 7 } }), base, 'места другого устройства и неизвестные — нет');
  assert.deepEqual(P.normalizePlace({ desktop: { place: 'bottom', view: 'full' } }), { v: 1, desktop: { place: 'bottom', view: 'full' }, phone: { place: 'top', view: 'auto' } });
  // Подписи — без технических значений.
  assert.deepEqual(P.PLACES.desktop.map((item) => item.title), ['У логотипа', 'В боковой панели', 'Внизу экрана']);
  assert.deepEqual(P.PLACES.phone.map((item) => item.title), ['Наверху', 'Внизу']);
  assert.deepEqual(P.VIEWS.map((item) => item.title), ['Автоматически', 'Портрет', 'Целиком']);
});

test('место: запись меняет только своё поле своего устройства, чужие поля и значения будущих версий целы', () => {
  const future = JSON.stringify({ v: 2, theme: 'room', desktop: { place: 'window-sill', view: 'auto', x: 1 }, phone: { place: 'top', pose: 'nap' } });
  const written = P.placeRecord(future, { phone: { view: 'full' } });
  assert.deepEqual(written, { v: 2, theme: 'room', desktop: { place: 'window-sill', view: 'auto', x: 1 }, phone: { place: 'top', pose: 'nap', view: 'full' } });
  // Телефон и компьютер независимы: запись одного не трогает другое.
  const both = P.placeRecord(JSON.stringify(record({ place: 'bottom', view: 'full' })), { phone: { place: 'bottom' } });
  assert.deepEqual(P.normalizePlace(both), { v: 1, desktop: { place: 'bottom', view: 'full' }, phone: { place: 'bottom', view: 'auto' } });
  // Неверное значение не записывается как есть.
  assert.deepEqual(P.placeRecord(null, { desktop: { place: 'nowhere', view: 'full' } }), { v: 1, desktop: { place: '', view: 'full' } });
  assert.deepEqual(P.placeRecord('{', { phone: { place: 'bottom' } }), { v: 1, phone: { place: 'bottom' } });
  // Ни координат, ни переноса, ни учебных данных.
  assert.doesNotMatch(JSON.stringify(P.placeRecord(null, { desktop: { place: 'bottom', view: 'full' }, phone: { place: 'bottom', view: 'compact' } })), /"x"|"y"|drag|entries|score/);
});

test('место: две вкладки — изменения разных полей сохраняются оба, одного поля — побеждает последняя запись', () => {
  let stored = null;
  const tab = (patch) => (stored = JSON.stringify(P.placeRecord(stored, patch)));
  tab({ desktop: { place: 'bottom' } }); // вкладка А
  tab({ phone: { view: 'full' } }); // вкладка Б читает свежее — место компьютера не теряется
  tab({ desktop: { view: 'compact' } }); // А
  assert.deepEqual(P.parsePlace(stored), { v: 1, desktop: { place: 'bottom', view: 'compact' }, phone: { place: 'top', view: 'full' } });
  tab({ desktop: { place: 'logo' } });
  tab({ desktop: { place: 'sidebar' } });
  assert.equal(P.parsePlace(stored).desktop.place, 'sidebar');
});

test('раскладка: без выбора — прежнее поведение (высокий экран — целиком в боковой панели, невысокий — портрет у логотипа, телефон — портрет наверху)', () => {
  const none = P.defaultPlace();
  assert.equal(shown(P.petLayout(none, ROOMY)), 'sidebar:full');
  assert.equal(P.petLayout(none, ROOMY).host, 'sidebar');
  assert.equal(shown(P.petLayout(none, SHORT)), 'logo:compact');
  assert.equal(shown(P.petLayout(none, NARROW)), 'logo:compact');
  for (const env of [PHONE, PHONE320, PHONE_WIDE, { phone: true }]) assert.equal(shown(P.petLayout(none, env)), 'top:compact');
  assert.equal(P.petLayout(none, PHONE).host, 'top');
  assert.equal(P.petLayout(null, {}).device, 'desktop');
});

test('раскладка: выбранное место и вид; не помещается — ближайшее место или портрет, сохранённое не меняется', () => {
  const bottom = record({ place: 'bottom', view: 'auto' });
  const before = JSON.stringify(bottom);
  assert.deepEqual([shown(P.petLayout(bottom, ROOMY)), P.petLayout(bottom, ROOMY).host], ['bottom:full', 'float']);
  assert.equal(shown(P.petLayout(bottom, { ...ROOMY, gutterFull: false })), 'bottom:compact', 'поле справа узкое — портрет');
  const narrow = P.petLayout(bottom, NARROW);
  assert.deepEqual([shown(narrow), narrow.place, narrow.moved], ['logo:compact', 'bottom', true], 'поля справа нет — временно у логотипа, выбор — «внизу»');
  assert.equal(shown(P.petLayout(bottom, { ...NARROW, tall: true, roomy: true })), 'sidebar:full', 'на высоком — в боковой панели');
  assert.equal(JSON.stringify(bottom), before, 'раскладка не меняет предпочтение');
  // Боковая панель: целиком от 880 px, портретом от 840, ниже — временно у логотипа.
  const sidebar = (view) => record({ place: 'sidebar', view });
  assert.equal(shown(P.petLayout(sidebar('auto'), ROOMY)), 'sidebar:full');
  assert.equal(shown(P.petLayout(sidebar('compact'), ROOMY)), 'sidebar:compact');
  assert.equal(shown(P.petLayout(sidebar('full'), { roomy: true, tall: false })), 'sidebar:compact');
  assert.equal(P.petLayout(sidebar('full'), { roomy: true }).squeezed, true);
  assert.deepEqual([shown(P.petLayout(sidebar('auto'), SHORT)), P.petLayout(sidebar('auto'), SHORT).moved], ['logo:compact', true]);
  // У логотипа — только портрет; «Целиком» сохраняется и честно объясняется.
  const logo = P.petLayout(record({ place: 'logo', view: 'full' }), ROOMY);
  assert.deepEqual([shown(logo), logo.squeezed, logo.wantsFull], ['logo:compact', true, true]);
  assert.match(P.placeNote(logo), /только портрет/);
  // Телефон: наверху целиком от 390 px и не на низком экране, внизу — портрет от 340, целиком от 480.
  const top = record(null, { place: 'top', view: 'full' });
  assert.equal(shown(P.petLayout(top, PHONE)), 'top:full');
  assert.deepEqual([shown(P.petLayout(top, PHONE320)), P.petLayout(top, PHONE320).squeezed], ['top:compact', true]);
  const low = record(null, { place: 'bottom', view: 'full' });
  assert.deepEqual([shown(P.petLayout(low, PHONE)), P.petLayout(low, PHONE).host], ['bottom:compact', 'bar']);
  assert.match(P.placeNote(P.petLayout(low, PHONE)), /целиком помещается наверху/);
  assert.equal(shown(P.petLayout(low, PHONE_WIDE)), 'bottom:full');
  const moved = P.petLayout(low, PHONE320);
  assert.deepEqual([shown(moved), moved.place, moved.moved], ['top:compact', 'bottom', true]);
  assert.match(P.placeNote(moved), /временно наверху\. Выбор сохранён/);
  // «Автоматически» на телефоне — портрет, как раньше.
  assert.equal(shown(P.petLayout(record(null, { place: 'bottom', view: 'auto' }), PHONE_WIDE)), 'bottom:compact');
});

test('раскладка: телефон и компьютер не путаются — переход через границу берёт настройку своего устройства', () => {
  const both = record({ place: 'bottom', view: 'compact' }, { place: 'bottom', view: 'full' });
  assert.equal(shown(P.petLayout(both, ROOMY)), 'bottom:compact');
  assert.equal(P.petLayout(both, ROOMY).host, 'float');
  assert.equal(shown(P.petLayout(both, PHONE_WIDE)), 'bottom:full');
  assert.equal(P.petLayout(both, PHONE_WIDE).host, 'bar');
  assert.equal(P.petLayout(both, PHONE).device, 'phone');
});

test('вид: «Свернуть» и «Показать целиком» не уводят питомца с места, где вид помещается; «Автоматически» ничего не закрепляет', () => {
  const none = P.defaultPlace();
  const pinned = (patch, env) => P.petLayout(P.normalizePlace({ ...none, ...Object.fromEntries(Object.entries(patch).map(([device, fields]) => [device, { ...none[device], ...fields }])) }), env);
  // Свернули целого в боковой панели — остаётся там же, место не закреплено: «Автоматически» потом — как раньше.
  assert.deepEqual(P.viewPatch(none, ROOMY, 'compact'), { desktop: { view: 'compact' } });
  assert.equal(shown(pinned(P.viewPatch(none, ROOMY, 'compact'), ROOMY)), 'sidebar:compact');
  // Невысокий экран с полем справа: «Показать целиком» — целиком внизу (у логотипа не помещается), не закрепляет.
  const full = P.viewPatch(none, SHORT, 'full');
  assert.deepEqual(full, { desktop: { view: 'full' } });
  const bottom = pinned(full, SHORT);
  assert.equal(shown(bottom), 'bottom:full');
  // …а «Свернуть» там же закрепляет «Внизу экрана», иначе портрет ушёл бы к логотипу.
  const back = P.viewPatch(P.normalizePlace({ desktop: { place: '', view: 'full' } }), SHORT, 'compact');
  assert.deepEqual(back, { desktop: { view: 'compact', place: 'bottom' } });
  // Без поля справа и невысоко — «Показать целиком» ничего не закрепляет у логотипа: на высоком окне — целиком в боковой панели.
  assert.deepEqual(P.viewPatch(none, NARROW, 'full'), { desktop: { view: 'full' } });
  assert.equal(shown(P.petLayout(P.normalizePlace({ desktop: { place: '', view: 'full' } }), { ...NARROW, tall: true, roomy: true })), 'sidebar:full');
  // «Автоматически» и выбранное место — только вид.
  assert.deepEqual(P.viewPatch(P.normalizePlace({ desktop: { place: 'bottom', view: 'compact' } }), SHORT, 'auto'), { desktop: { view: 'auto' } });
  assert.deepEqual(P.viewPatch(record({ place: 'logo', view: 'auto' }), ROOMY, 'full'), { desktop: { view: 'full' } });
  assert.deepEqual(P.viewPatch(none, PHONE, 'full'), { phone: { view: 'full' } });
  // wantsFull — подпись «Свернуть» / «Показать целиком».
  assert.equal(P.petLayout(none, ROOMY).wantsFull, true);
  assert.equal(P.petLayout(none, SHORT).wantsFull, false);
  assert.equal(P.placeNote(P.petLayout(none, ROOMY)), '');
});

test('«устроился»: декоративная реакция без слов — в тишине и поверх другой реакции не играет', () => {
  const settle = R.REACTIONS.settle;
  assert.equal(settle.decorative, true);
  assert.equal(settle.phrases, '');
  assert.ok(settle.ms <= 1500);
  const d = R.createDirector();
  R.setQuiet(d, 'typing', true, 0);
  assert.equal(R.request(d, 'settle', { now: 10 }).action, 'drop', 'тишина ввода');
  assert.equal(d.pending, null, 'и не откладывается');
  R.setQuiet(d, 'typing', false, 20);
  assert.equal(R.request(d, 'feed', { now: 100 }).action, 'play');
  assert.equal(R.request(d, 'settle', { now: 200 }).action, 'drop', 'кормление важнее');
  R.finish(d, 3000);
  assert.equal(R.request(d, 'settle', { now: 3100 }).action, 'play');
  assert.equal(R.request(d, 'settle', { now: 3200 }).action, 'drop', 'не чаще раза в 1,5 секунды');
});

