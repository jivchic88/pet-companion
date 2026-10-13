// Присутствие «Всегда рядом» / «Приходит по зову» (pet/pet-place.mjs, pet/pet.mjs, pet/pet.css): свой ключ, разбор
// без перезаписи, запись с чужими полями и номером будущей версии, независимость от «скрыт» и других предпочтений, что
// видно рядом со страницей и когда разрешено декоративное (в том числе сценки), кнопка вызова — без мордашки, точек,
// движения и переноса, прямой вызов — без отметки просмотра уголка, при печати кнопки нет.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as P from '../pet/pet-place.mjs';
import * as R from '../pet/pet-rules.mjs';
import * as Room from '../pet/pet-room.mjs';

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const K = R.storageKeys('site');

test('присутствие: свой ключ; без ключа, повреждённое и неизвестное — «Всегда рядом»', () => {
  assert.equal(K.presence, 'site:presence:v1');
  const keys = Object.values(K);
  assert.equal(new Set(keys).size, keys.length, 'отдельный ключ');
  assert.deepEqual(
    P.PRESENCES.map((item) => [item.id, item.title, item.note]),
    [
      ['always', 'Всегда рядом', 'Питомец остаётся рядом со страницей.'],
      ['on-call', 'Приходит по зову', 'Без постоянной мордашки. Позови кнопкой, когда захочешь.'],
    ],
  );
  for (const text of [null, undefined, '', '{', 'null', '[]', '42', '"on-call"', '{"mode":"sometimes"}', '{"mode":7}', '{"mode":["on-call"]}', '{"v":1}', '{"v":1,"mode":"ON-CALL"}']) {
    assert.equal(P.parsePresence(text), 'always', String(text));
  }
  assert.equal(P.parsePresence('{"v":1,"mode":"on-call"}'), 'on-call');
  assert.equal(P.parsePresence('{"v":1,"mode":"always"}'), 'always');
  // Будущая версия с понятным режимом читается; неизвестный режим будущей версии — безопасно «всегда рядом».
  assert.equal(P.parsePresence('{"v":3,"mode":"on-call","quiet":true}'), 'on-call');
  assert.equal(P.parsePresence('{"v":3,"mode":"nap"}'), 'always');
  assert.equal(P.presenceOf('on-call'), 'on-call');
  assert.equal(P.presenceOf('hidden'), 'always', '«скрыт» — не режим присутствия');
});

test('присутствие: запись — свежее значение, чужие поля и номер будущей версии сохраняются; чтение ничего не пишет', () => {
  assert.deepEqual(P.presenceRecord(null, 'on-call'), { v: 1, mode: 'on-call' });
  assert.deepEqual(P.presenceRecord('{', 'on-call'), { v: 1, mode: 'on-call' }, 'повреждённое — заново');
  assert.deepEqual(P.presenceRecord('[1,2]', 'always'), { v: 1, mode: 'always' });
  const future = JSON.stringify({ v: 2, mode: 'nap', when: { from: '22:00' }, note: 'x' });
  assert.deepEqual(P.presenceRecord(future, 'on-call'), { v: 2, mode: 'on-call', when: { from: '22:00' }, note: 'x' }, 'будущая версия не мигрирует молча');
  assert.deepEqual(P.presenceRecord('{"v":0,"mode":"on-call","x":1}', 'always'), { v: 1, mode: 'always', x: 1 });
  assert.deepEqual(P.presenceRecord('{"v":1,"mode":"always"}', 'bogus'), { v: 1, mode: 'always' }, 'неизвестное не пишется');
  // Разбор — чистая функция: сохранённый текст не меняется, повторная запись того же — та же.
  const text = JSON.stringify({ v: 1, mode: 'on-call', extra: [1] });
  assert.equal(P.parsePresence(text), 'on-call');
  assert.equal(text, JSON.stringify({ v: 1, mode: 'on-call', extra: [1] }));
  assert.deepEqual(P.presenceRecord(JSON.stringify(P.presenceRecord(text, 'on-call')), 'on-call'), { v: 1, mode: 'on-call', extra: [1] });
});

test('присутствие не зависит от «скрыт» и других предпочтений, и они — от него', () => {
  // Скрыт — ни питомца, ни кнопки при любом режиме; не скрыт — режим решает, что рядом со страницей.
  assert.equal(P.presenceSurface('always', false), 'pet');
  assert.equal(P.presenceSurface('on-call', false), 'call');
  assert.equal(P.presenceSurface('always', true), 'none');
  assert.equal(P.presenceSurface('on-call', true), 'none');
  assert.equal(P.presenceSurface(undefined), 'pet', 'без выбора — прежнее поведение');
  // Режим не пишется в прежние ключи: их нормализация (в том числе вкладкой старого кода) его не знает и стёрла бы.
  const settings = R.normalizeSettings({ ...R.defaultSettings(), hidden: true, mode: 'on-call', presence: 'on-call' });
  assert.equal('mode' in settings || 'presence' in settings, false);
  assert.equal(settings.hidden, true, '«скрыт» — своё поле в site:cat:v1');
  assert.equal('mode' in R.normalizeCompanion({ kind: 'dog', mode: 'on-call' }), false);
  assert.deepEqual(P.parsePlace(JSON.stringify({ v: 1, desktop: { place: 'bottom', view: 'full' }, mode: 'on-call' })).desktop, { place: 'bottom', view: 'full' }, 'место и вид — как были');
  // Записи соседних ключей не получают режим и не теряют свои значения.
  const place = { v: 1, desktop: { place: 'bottom', view: 'full' }, phone: { place: 'bottom', view: 'compact' } };
  assert.deepEqual(P.placeRecord(JSON.stringify(place), {}), place);
  const room = Room.roomRecord(null, 'cat', { rest: [210, 206] });
  assert.equal('mode' in room, false);
  assert.equal(JSON.stringify(R.lookRecord(null, { cat: 'ginger' })).includes('on-call'), false);
  assert.equal(JSON.stringify(R.treatRecord(null, '2026-10-11')).includes('mode'), false);
  // Обратное: запись присутствия не трогает поля, похожие на чужие.
  assert.deepEqual(P.presenceRecord(JSON.stringify({ v: 1, mode: 'always', hidden: true, place: 'bottom' }), 'on-call'), { v: 1, mode: 'on-call', hidden: true, place: 'bottom' });
});

test('присутствие: декоративное (движения покоя, реакции, сценки) — только пока питомец на виду', () => {
  const around = (mode, extra = {}) => P.petAround({ mode, ...extra });
  assert.equal(around('always'), true, 'всегда рядом — как раньше');
  assert.equal(around('on-call'), false, 'по зову, диалог закрыт — питомца нет');
  assert.equal(around('on-call', { open: true }), true, 'вызван — на виду');
  assert.equal(around('always', { hidden: true }), false);
  assert.equal(around('on-call', { open: true, hidden: true }), false);
  assert.equal(around('always', { pageHidden: true }), false, 'скрытая вкладка');
  assert.equal(around('on-call', { open: true, pageHidden: true }), false);
  assert.equal(around(undefined), true);
  // Сценка проверяет видимость и при допуске к транзакции (sceneTurn → sceneCommit с fits): по зову при закрытом
  // диалоге — нет ни показа, ни записи дня.
  const next = { type: 'stretch', key: 'e1', day: '2026-10-11', at: 0, until: 10_000 };
  const fits = (mode, open) => R.sceneFits(next, { now: 100, shown: around(mode, { open }), kind: 'cat', full: true });
  assert.equal(fits('always', false), true);
  assert.equal(fits('on-call', false), false);
  assert.equal(fits('on-call', true), true, 'в открытом уголке — по прежним правилам');
  assert.equal(R.sceneCommit(null, null, { day: '2026-10-11', today: '2026-10-11', by: 'tab', kind: 'cat', type: 'stretch', fits: fits('on-call', false) }), null, 'день не занят');
});

test('кнопка вызова: лапка без мордашки, точек и переноса; прямой вызов — сразу «Поиграть», без отметки просмотра уголка', async () => {
  const ui = await source('pet/pet.mjs');
  const call = ui.slice(ui.indexOf('const callHtml = () =>'), ui.indexOf('// Вид места:'));
  assert.match(call, /<button class="cat-call" type="button" data-cat-call aria-haspopup="dialog" aria-expanded="false" aria-controls="cat-sheet"/);
  assert.match(call, /\$\{PAW_ICON\}/, 'существующий значок лапки');
  assert.doesNotMatch(call, /data-pet-drag|cat-dot|cat-art|art\(/, 'без переноса, точки и рисунка животного');
  assert.match(ui, /const callLabel = \(\) => `\$\{CALL\}: \$\{name\(\)\}`/, 'доступное название — «Позвать питомца: имя»');
  // Источник — параметр открытия (кнопка вызова или питомец), до закрытия; не по тексту, режиму или имени.
  const open = ui.slice(ui.indexOf('function openSheet('), ui.indexOf('// Закрытие — один раз'));
  assert.match(open, /function openSheet\(opener, source = 'pet'\)/);
  assert.match(open, /ui\.source = source;/);
  assert.match(open, /if \(!call\) markSeen\(\);/, 'вызов не отмечает уголок увиденным');
  assert.ok(open.indexOf('enterPlay();') < open.indexOf('ui.sheet.showModal();'), 'вид «Поиграть» — до showModal (без вспышки уголка)');
  assert.doesNotMatch(open, /'greet'|'joy'|'unlock'/, 'без приветствия, радости и праздника');
  const close = ui.slice(ui.indexOf('function closeSheet('), ui.indexOf('// ---------- сцена «Поиграть»'));
  assert.match(close, /ui\.source = '';/);
  assert.match(ui, /const playBack = \(\) => \(ui\.source === 'call' \? closeSheet\(\) : leavePlay\(\)\);/);
  // Закрытый по зову питомец не реагирует на сохранение и не ждёт следующего вызова; в «Поиграть» и редакторе праздника,
  // объявления и seenStage нет (их даёт markSeen при возврате). С PL03 это решение ядра (notify): оболочка передаёт ему,
  // на виду ли питомец и какой вид открыт (sight), и своего правила праздника не держит; поведение — test/core.test.mjs.
  const saved = ui.slice(ui.indexOf('function saved('), ui.indexOf('function failed('));
  assert.match(saved, /ui\.core\.notify\('saved', event, sight\(\)\)/);
  assert.match(ui, /const sight = \(\) => \(\{ around: around\(\), view: ui\.room \? 'room' : ui\.play \? 'play' : ui\.sheet\?\.open \? 'corner' : null \}\);/);
  assert.doesNotMatch(ui, /stageToCelebrate|doneOutcome|unlockedBetween|seenStage: /, 'праздник, ступень и её отметка — только в ядре');
  // Доработка 2026-10-11: закрытый по зову диалог очищается и при смене режима; фокус спрятанного медиазапросом входа
  // возвращается.
  const presence = ui.slice(ui.indexOf('function applyPresence('), ui.indexOf('function choosePresence('));
  assert.match(presence, /else \{\s*calmDown\(\);\s*clearSheet\(\);\s*\}/);
  assert.match(ui, /if \(!relatedTarget && openers\(\)\.includes\(target\) && !shown\(target\)\) ui\.lostEntry = true;/);
  const layout = ui.slice(ui.indexOf('function applyLayout('), ui.indexOf('const hostBox'));
  assert.match(layout, /if \(lost\) fallbackFocus\(\)\?\.focus\(\{ preventScroll: true \}\);\s*else keepFocus\(focused\);/, 'и для лапки, а не только при смене места питомца');
  // Запись присутствия — только из выбора (storePresence), не из чтения. С PL02 все записи идут через writeKey (свежее
  // чтение, отказ, повреждённое): setItem — только в нём.
  assert.equal([...ui.matchAll(/writeKey\(K\.presence/g)].length, 1);
  assert.equal([...ui.matchAll(/setItem\(/g)].length, 1);
});

test('кнопка вызова в стилях: не меньше 44×44, без анимации, при печати нет; видна одна по компоновке', async () => {
  const css = await source('pet/pet.css');
  const rule = (selector) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
  const call = rule('.cat-call');
  assert.match(call, /min-width: 44px;/);
  assert.match(call, /min-height: 44px;/);
  assert.doesNotMatch(call, /animation|transition/, 'значок не анимирован');
  assert.match(rule('.cat-call:focus-visible'), /outline: 2px solid var\(--pet-accent\)/);
  const block = css.slice(css.indexOf('«Приходит по зову» (с 2026-10-11)'), css.indexOf('/* ---------- уголок кота (диалог)'));
  assert.ok(block.length > 0, 'раздел найден');
  assert.doesNotMatch(block, /animation|@keyframes|transition/);
  assert.match(block, /@media \(min-width: 861px\) and \(max-height: 839px\)/, 'невысокий компьютер — в строке с логотипом');
  assert.match(css, /html:is\(\[data-pet-at='top'\], \[data-pet-call\]\) \.cat-face \{/, 'телефон — та же кнопка в верхней панели');
  const print = css.slice(css.lastIndexOf('@media print'));
  for (const host of ['.cat-dock', '.cat-side', '.cat-face', '.cat-sheet']) assert.ok(print.includes(host), `при печати нет ${host}`);
});
