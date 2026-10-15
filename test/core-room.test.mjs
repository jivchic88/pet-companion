// Ядро PL04.3 в Node — комната и место legacy-раскладки как ключи ядра (docs/ARCHITECTURE.md § 3.1, § 8, § 11.1, § 13
// «Геометрия комнаты», «Формат места»). Геометрия комнаты и игрушек — одна реализация в ядре (веб — реэкспорт тех же
// функций), без импорта рисунков: масштаб и рамки — данные определений питомцев (PL06: size, play, room), сверенные с
// веб-графикой (sceneCatBox, области попадания, лапа). Ключ room: память ядра (подтверждённое, несохранённое, операции), сохранная запись, поглощение другой
// вкладки без записи, сверка перед решением, отказ загрузки. Ключ place: запись только командой ядра setPlace через его
// подключение (как прежний placeRecord для правок отображения), несохранённое и его забывание чужой записью, неизвестное и
// больший v, неверная правка — invalid-argument. Данные синтетические.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sceneCatBox } from '../pet/cat-art.mjs';
import { cat } from '../pet/defs/cat.mjs';
import { dog } from '../pet/defs/dog.mjs';
import { prefRecord } from '../pet/core/formats/legacy.mjs';
import * as Core from '../pet/core/room.mjs';
import * as CoreToys from '../pet/core/toys.mjs';
import * as Place from '../pet/pet-place.mjs';
import * as Play from '../pet/pet-play.mjs';
import * as Web from '../pet/pet-room.mjs';
import * as WebToys from '../pet/pet-toys.mjs';
import { DAY, host, LEGACY_DISPLAY, life } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };

test('геометрия комнаты и игрушек — одна реализация в ядре: веб реэкспортирует те же функции; ядро не импортирует рисунки', async () => {
  for (const name of ['arrange', 'settle', 'fits', 'frames', 'range', 'nudge', 'pickAt', 'hitBox', 'feedShift', 'roomRecord', 'parseRoom', 'readPoint', 'movedItems', 'samePlaces', 'roomItems', 'itemTitle', 'seatOf']) assert.equal(Web[name], Core[name], `pet-room.mjs: ${name} — функция ядра`);
  for (const name of ['placeToy', 'rollEnd', 'rollWay', 'rollDist', 'closer', 'sideOf', 'zoneOf']) assert.equal(WebToys[name], CoreToys[name], `pet-toys.mjs: ${name} — функция ядра`);
  // PL06: данных рисунка (области, лапа, рамка) у веб-модуля нет — они в определении питомца.
  for (const name of ['HIT', 'PAW', 'PET_BOX']) assert.equal(Play[name], undefined, `pet-play.mjs: ${name} — данные определения, не модуля`);
  for (const file of ['room', 'toys', 'play', 'editor', 'catalog', 'define']) {
    const text = await readFile(new URL(`../pet/core/${file}.mjs`, import.meta.url), 'utf8');
    const specs = [...text.matchAll(/^import [^;]*? from '([^']+)';/gm)].map((match) => match[1]);
    assert.ok(specs.every((spec) => spec.startsWith('./') && !spec.includes('art')), `core/${file}.mjs импортирует только ядро: ${specs.join(', ')}`);
    const code = text.replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b(document|window|getBoundingClientRect|requestAnimationFrame|localStorage)\b/, `core/${file}.mjs — без DOM`);
  }
  // Второй реализации правил в веб-модулях нет: формулы пола, доката и поиска места — только в ядре.
  // (settle в legacy-местах — прежнее «устроился» раскладки, не место предмета: оно передаёт ядру arrive.) С PL07
  // отображение — общая оболочка web/shell.mjs, места legacy — web/legacy/places.mjs, контейнер — web/view.mjs.
  for (const file of ['pet-room.mjs', 'pet-toys.mjs', 'pet-play.mjs', 'pet.mjs', 'web/shell.mjs', 'web/legacy/places.mjs', 'web/view.mjs', 'web/pointer.mjs']) {
    const text = await readFile(new URL(`../pet/${file}`, import.meta.url), 'utf8');
    const own = [...text.matchAll(/function (placeToy|rollEnd|rollWay|closer|sideOf|fits|arrange|nudge|feedShift|movedItems|roomRecord|around|petMood|bowlHome|moveBowl|rollBall|onToy|onStroke|resetHint|showResult|playResults)\(/g)].map((match) => match[1]);
    if (file !== 'web/legacy/places.mjs' && /function settle\(/.test(text)) own.push('settle');
    assert.deepEqual(own, [], `${file}: без своей геометрии и правил игры`);
    const temporary = [...text.matchAll(/petMood|toyTimes|petTimes|strokeHeld|strokeTold|playOutcome|setBusy|\.react\(|writeKey|readStored|placeUnsaved/g)].map((match) => match[0]);
    assert.deepEqual(temporary, [], `${file}: без своих лимитов, удержания, временных входов и записи ключей`);
  }
});

test('данные рисунка в определениях совпадают с веб-графикой: масштаб 160/204, рамка сцены, области и лапа', () => {
  for (const def of [cat, dog]) {
    assert.deepEqual([def.room.frame[0], def.room.frame[1]], [sceneCatBox(0).width, sceneCatBox(0).height], `${def.id}: рамка питомца в сцене`);
    assert.equal(Core.roomModel(def).scale, 160 / 204, `${def.id}: рисунок 220×204 вписан в 176×160 по высоте`);
    assert.equal(def.size.ground, 176, `${def.id}: линия пола у лап`);
    assert.deepEqual([def.size.width, def.size.height], [220, 204]);
    // Область лапы определения — та же, что попадание отображения.
    assert.equal(Play.petPart(def, def.play.paw.cx, def.play.paw.cy), 'paw', `${def.id}: лапа`);
  }
  assert.deepEqual([sceneCatBox(3).width, sceneCatBox(3).height], [sceneCatBox(0).width, sceneCatBox(0).height], 'на лежанке — та же рамка');
});

test('ключ room — ядро: чтение и запись только через его подключение; несохранённое; поглощение другой вкладки без записи', () => {
  const L = life({ cat: CAT, room: { v: 2, cat: { yarn: { x: 60, y: 230, glow: 1 } } } }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  L.core.start();
  assert.deepEqual([L.state().room.pos.yarn, L.state().save.room], [[60, 230], { status: 'saved', pending: [], unsaved: [], corrupt: false }]);
  const writes = L.store.writes.length;
  L.put('room', { v: 2, cat: { yarn: { x: 120, y: 234 } }, dog: { rope: { x: 40, y: 233 } } });
  L.events.fire(L.keys.room);
  assert.deepEqual([L.state().room.pos.yarn, L.store.writes.length, L.seen.at(-1).reason], [[120, 234], writes, 'storage'], 'другая вкладка: поглощено, ничего не записано');
  // Повреждённое значение — показ по умолчанию, предупреждение при загрузке, явная запись (сохранение) его заменяет.
  const C = life({ cat: CAT, room: '{bad' }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  C.core.start();
  assert.deepEqual([C.state().room.pos, C.state().save.room.corrupt, C.effects('warning').some((effect) => effect.key === 'room' && effect.code === 'corrupt')], [Core.arrange(Core.roomModel(cat), 0, {}).pos, true, true]);
  C.core.open('room');
  C.core.room.move('yarn', [120, 234]);
  C.core.room.save();
  assert.deepEqual(C.json('room'), { v: 1, cat: { yarn: { x: 120, y: 234 } } });
});

test('ключ place — предпочтение legacy-отображения: запись командой ядра через подключение, как прежняя запись правки', () => {
  const stored = { v: 3, desktop: { place: 'future-place', view: 'auto', glow: 1 }, phone: 7, extra: { a: 1 } };
  const L = life({ cat: CAT, place: stored }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  L.core.start();
  assert.deepEqual(L.state().place, stored, 'снимок — ключ как есть: ядро его не толкует');
  assert.equal(Object.isFrozen(L.state().place.desktop), true);
  const result = L.core.setPlace({ desktop: { view: 'full' } });
  assert.deepEqual([result.save.status, L.json('place')], ['saved', { ...stored, desktop: { ...stored.desktop, view: 'full' } }], 'изменённое поле; непонятное место, чужие поля и v 3 целы');
  assert.deepEqual(L.json('place'), Place.placeRecord(JSON.stringify(stored), { desktop: { view: 'full' } }), 'та же запись, что прежний placeRecord отображения');
  assert.equal(L.core.setPlace({ desktop: { view: 'full' } }).save.status, 'none', 'то же — без записи');
  for (const bad of [null, {}, { desktop: 'full' }, { desktop: {} }, { desktop: { view: 1 } }]) assert.equal(L.core.setPlace(bad).error.code, 'invalid-argument', JSON.stringify(bad));
  // Отказ записи — несохранённое до перезагрузки; чужая запись поля его забывает; следующая правка уносит остальное.
  L.store.denySet = /place/;
  assert.equal(L.core.setPlace({ phone: { place: 'bottom' }, desktop: { place: 'logo' } }).save.status, 'failed');
  assert.deepEqual([L.state().save.place.unsaved, L.state().place.phone.place, L.state().place.desktop.place], [['phone.place', 'desktop.place'], 'bottom', 'logo']);
  L.store.denySet = null;
  L.put('place', { ...L.json('place'), phone: { place: 'top' } });
  L.events.fire(L.keys.place);
  assert.deepEqual([L.state().save.place.unsaved, L.state().place.phone.place], [['desktop.place'], 'top'], 'чужая правка того же поля новее несохранённого здесь');
  L.core.setPlace({ phone: { view: 'compact' } });
  assert.deepEqual([L.json('place').desktop.place, L.json('place').phone, L.state().save.place.status], ['logo', { place: 'top', view: 'compact' }, 'saved']);
  // prefRecord ядра — общий формат записи: прежний placeRecord проверяет поля и пишет через него.
  assert.deepEqual(prefRecord(null, { phone: { place: 'top' } }), { v: 1, phone: { place: 'top' } });
});
