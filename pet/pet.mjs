// Питомец (кот или собака) — самостоятельный модуль: места рядом со страницей или лапка вызова, один диалог в трёх видах
// (уголок, «Поиграть», «Обустроить уголок»), реакции и настройки. Подключение, интерфейс, хранение и ограничения — README
// модуля. Ядро без DOM (core/index.mjs) — настройки и ключи cat, companion, look, treat, счёт и ступени, решения
// подтверждённого занятия, кормления и приветствия; хранение — общий координатор (web/storage.mjs). Оболочка показывает
// снимок ядра и проигрывает его решения. Рисунки — cat-art.mjs, dog-art.mjs; правила оболочки — pet-rules.mjs; место и
// присутствие — pet-place.mjs; перенос — pet-move.mjs; жест сцены — pet-play.mjs; миска и мячик — pet-toys.mjs; комната —
// pet-room.mjs. Хранит только предпочтения в браузере; данных сайта не меняет; ошибки здесь сайту не мешают.

import { bowlArt, bowlMiniSvg, bowlToySvg, catSvg, miniItemSvg, sceneCatBox, sceneSvg, yarnArt } from './cat-art.mjs';
import { createPetCore } from './core/index.mjs';
import { ballArt, ballMiniSvg, ballToySvg, dogSvg, ropeArt } from './dog-art.mjs';
import * as R from './pet-rules.mjs';
import * as P from './pet-place.mjs';
import * as Room from './pet-room.mjs';
import { cancelMove, initMover, moving, startMoveMode, stopMover, watchDrag } from './pet-move.mjs';
import { cancelStroke, gesturing, hitsHtml, initPlay, release, watchStroke } from './pet-play.mjs';
import { bowlHome, initToys, mountToys, moveBowl, resetToys, rollBall, unmountToys, watchToys } from './pet-toys.mjs';
import { createWebStorage } from './web/storage.mjs';

// Версия модуля — та же, что в package.json (npm version обновляет её здесь: scripts/sync-version.mjs; README и CHANGELOG
// сверяет npm run check). Версии форматов данных — v1 в ключах (storageKeys).
export const VERSION = '0.1.4';

// Местная дата «ГГГГ-ММ-ДД» — граница дня лакомства и сценок; по ней сайт считает progress().today (README, «Интерфейс»).
export const localDay = R.localDay;

const REDUCED = '(prefers-reduced-motion: reduce)';
const TEXT_INPUT = 'textarea, select, [contenteditable="true"], input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"], [type="reset"])';

const ITEM_NAMES = {
  cushion: 'подушка',
  plaid: 'клетчатый платок',
  mug: 'кружка',
  notebook: 'блокнот',
  bed: 'лежанка',
  lamp: 'лампа',
  plant: 'растение',
  board: 'доска с заметками',
  badge: 'бейдж',
  ball: 'мячик',
};

// Классы кнопок и служебных элементов — сайта (options.classes) или pet-base.css.
const CLASSES = { btn: 'pet-btn', alt: 'pet-btn pet-btn-alt', small: 'pet-btn-small', link: 'pet-link', close: 'pet-close', sr: 'pet-sr', muted: 'pet-muted' };
// Тексты, зависящие от сайта (options.texts).
const TEXTS = {
  wait: 'Одно занятие — и можно угостить.',
  rules: ['Знаки дают занятия на сайте. Оценки и пропуски знаков не отнимают: открытые вещи остаются.', 'Лакомство дня открывает первое занятие за день. Одно кормление в день — общее для кота и собаки.'],
  origin: 'Знаки и вещи даёт сайт и совпадают везде.',
  back: '',
  call: '',
};

// Подключение (один активный питомец на странице): O — настройки сайта, K — ключи хранения, C — классы, T — тексты.
let O = {};
let K = R.storageKeys();
let C = CLASSES;
let T = TEXTS;

const initial = () => ({
  mounted: false,
  abort: null, // снимает все слушатели при отключении
  core: null, // ядро этого подключения (createPetCore): настройки, ключи cat, companion, look, treat и решения среза
  mirror: null, // снимок ядра, по которому оболочка уже показана (изменение другой вкладки — разница с ним, onCore)
  starting: false, // идёт core.start(): предупреждение ядра — причина отказа подключения (startError), а не журнал
  startError: null,
  storage: 'ok', // 'failed' — при подключении хранилище не прочиталось: до отключения ничего не читается и не пишется
  seen: {}, // последний прочитанный текст ключа оболочки — place, presence, scene, room (показ, если чтение не удалось)
  kind: 'cat', // показанный напарник; выбор другой вкладки приходит поглощением ядра (onCore)
  look: R.defaultLook(), // показанный облик кота и собаки (снимок ядра)
  shownHidden: false, // показано ли место «спрятан» (renderAll); сравнивается со свежим «скрыт»
  settings: R.companionView(R.defaultSettings(), R.defaultCompanion()),
  director: R.createDirector(),
  reduced: null,
  dock: null,
  side: null,
  face: null,
  restore: null,
  sheet: null,
  live: null,
  opener: null,
  form: false,
  resting: false,
  lastActivity: Date.now(),
  timers: {},
  said: new Set(), // ждущие объявления (announce)
  lastPhrase: '',
  scenePhrase: '',
  petTimes: [],
  toyTimes: [], // полные реакции на миску и мячик (тот же лимит частоты, свой счёт)
  tryOn: '',
  mini: '',
  info: R.progressInfo(0),
  sheetStage: -1, // ступень, которую сейчас показывает открытый уголок (ui.info.stage может уйти вперёд)
  sheetY: 0,
  treat: 'waiting', // лакомство дня: waiting / ready / fed (снимок ядра)
  treatLater: false, // карточку лакомства не перерисовывали, пока вводят имя
  learnLater: false, // учебный шаг не обновляли, пока вводят имя
  sheetOpen: false, // уголок открыт (закрытие — один раз: событие close после закрытия кодом ничего не делает)
  namePage: 0, // страница готовых имён в открытом уголке
  place: P.defaultPlace(), // место и вид у телефона и компьютера (ключ place)
  placeUnsaved: {}, // место и вид, которые не удалось записать (до перезагрузки страницы), — по устройствам
  layout: null, // что показано сейчас (P.petLayout): место, вид, временная замена
  placeLater: false, // изменение другой вкладки пришло во время переноса — применить после него
  media: [], // медиазапросы мест (P.PLACE_MEDIA)
  layoutTimer: 0, // раскладка после пачки изменений медиазапросов
  saying: '', // реплика, которая сейчас в облаке (перерисованное место показывает её дальше)
  sayingShort: '', // та же реплика без имени — для узкого облака боковой панели (сценка с длинным именем)
  arrive: null, // место, где идёт появление, и его слушатель конца анимации
  float: null, // компьютер: внизу экрана
  bar: null, // телефон: в нижней панели
  fold: null, // телефон: «Свернуть» рядом с питомцем в верхней панели
  play: false, // открыта сцена «Поиграть» (вместо уголка в том же диалоге)
  playY: 0, // прокрутка уголка до сцены — вернуть при выходе
  escLeft: false, // Esc уже закрыл сцену — тот же Esc не закрывает уголок
  escHeld: false, // Esc, закрывший сцену, ещё нажат — его автоповтор не закрывает уголок
  strokeTold: '', // итог, уже объявленный в этом жесте
  strokeHeld: false, // жест идёт и дал отклик — питомец доволен до его конца
  playOutcome: '', // последний итог сцены (ключ playResults) — пересчитать текст при смене имени
  sceneNext: null, // редкая сценка после реакции занятия: { type, key, until } — до показа, отмены или срока
  sceneChecked: new Set(), // события, для которых сценку уже выбирали (одна попытка на событие)
  room: null, // редактор: { pos — черновик, live — идущий перенос, pick, saved, other, failed }
  roomY: 0, // прокрутка уголка до редактора — вернуть при выходе
  presence: 'always', // ключ presence: always | on-call
  presenceUnsaved: '', // не записалось (до перезагрузки)
  shownPresence: '', // показанное на местах (renderAll)
  source: '', // откуда открыт диалог (до закрытия): pet | call
  lostEntry: false, // вход с фокусом спрятан медиазапросом (onFocusOut)
});

// Состояние одного экземпляра; новое подключение — новый объект: отложенное старого его не трогает (ui !== owner).
let ui = initial();

const safe =
  (fn) =>
  (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      console.warn('Питомец:', error);
      return undefined;
    }
  };

const esc = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// Слушатель, который снимет отключение (у старых MediaQueryList addEventListener нет — без слушателя, как раньше).
const on = (target, type, fn, options = {}) => target?.addEventListener?.(type, fn, { ...options, signal: ui.abort.signal });

// ---------- хранение ----------
// Ключи cat, companion, look, treat — только ядро (снимок, команды, общий координатор web/storage.mjs): оболочка их не
// читает и не пишет. Ключи оболочки до PL04 — place, presence, scene, room: показ — нормализованное сохранённое
// (непонятное — по умолчанию); запись — свежий исходный текст ключа + только изменённые поля (функции записи
// pet-place.mjs, pet-room.mjs, pet-rules.mjs): неизвестные поля, значения и больший v остаются. Поля, которые не удалось
// записать, живут в памяти страницы до перезагрузки и читаются поверх сохранённого. Отказ загрузки любого из восьми
// ключей (координатор) запрещает записи всего подключения. README, «Хранение».

const WEB_STORED = ['place', 'presence', 'scene', 'room'];
const rawOf = (text) => R.readRecord(text).raw ?? {};

// Свежий текст ключа: { ok: true, text } (text — null, если ключа нет) или { ok: false } — отказ чтения.
function readText(key) {
  if (ui.storage === 'failed') return { ok: false };
  try {
    const text = localStorage.getItem(key);
    ui.seen[key] = text;
    return { ok: true, text };
  } catch {
    return { ok: false };
  }
}

// Для показа: свежее сохранённое; не прочиталось — последнее прочитанное (после неудачной загрузки — умолчания).
function readStored(key, parse) {
  const read = readText(key);
  return parse(read.ok ? read.text : (ui.seen[key] ?? null));
}

const corruptNote = (key) => `Питомец: значение ${key} повреждено — показаны значения по умолчанию; оно не перезаписывается, пока эту настройку не изменят.`;

// Загрузка при подключении — координатор (все восемь ключей пространства). Ключ не прочитался (исключение хранилища) —
// подключение работает в памяти: показывает умолчания, ничего не пишет и больше не читает; новая попытка — следующее
// подключение. Повреждённое значение — предупреждение (ключи ядра — его эффектом warning, onCore); неявные записи его не
// трогают.
function loadStorage(storage) {
  ui.storage = storage.load() === 'ready' ? 'ok' : 'failed';
  if (ui.storage === 'failed') {
    console.warn('Питомец: хранилище недоступно — настройки действуют до перезагрузки и не сохраняются.');
    return;
  }
  for (const key of WEB_STORED.map((name) => K[name])) {
    const read = readText(key);
    if (read.ok && R.readRecord(read.text).state === 'corrupt') console.warn(corruptNote(key));
  }
}

// Запись ключа оболочки: свежий текст → build(text) → setItem. Не пишет, если загрузка не удалась или ключ сейчас не
// прочитался (отказ чтения — не «пусто»); неявная запись (копия дня сценки) не заменяет повреждённое значение — его
// заменяет только явное действие. true — только после успешного setItem.
function writeKey(key, build, implicit = false) {
  const read = readText(key);
  if (!read.ok || (implicit && R.readRecord(read.text).state === 'corrupt')) return false;
  try {
    const text = JSON.stringify(build(read.text));
    localStorage.setItem(key, text);
    ui.seen[key] = text;
    return true;
  } catch {
    return false;
  }
}

// ---------- снимок ядра: настройки, облик, счёт, лакомство ----------
// Показ — снимок последнего закрытого обновления ядра (getState): после команды он уже новый. Правила (ступени, вещи,
// аксессуары, лакомство, первое включение, праздник, кормление, приветствие) оболочка не повторяет — берёт их итог.

const snap = () => ui.core.getState();

// Настройки напарника kind в прежней форме оболочки: общие поля и его имя с аксессуаром.
function settingsOf(state, kind) {
  const own = state.pets[kind];
  return { kind, name: own.name.value, accessory: own.accessory, motion: state.prefs.motion, phrases: state.prefs.phrases, hidden: state.presence.hidden };
}

const readSettings = (kind = ui.kind) => settingsOf(snap(), kind);
const lookOf = (state) => ({ cat: state.pets.cat.coat, dog: state.pets.dog.coat });

// Счёт и ступень — в прежней форме ui.info (только показ).
function infoOf(state) {
  const p = state.progress;
  if (!p) return R.progressInfo(0);
  return { marks: p.marks, stage: p.stage, computed: p.computed, current: R.STAGES[p.stage], next: R.STAGES[p.stage + 1] ?? null, toNext: p.toNext };
}

// Простые данные для решений ядра среза, которые зависят от ещё не перенесённого (PL04): питомец на виду (присутствие и
// открытый диалог) и открытый вид.
const sight = () => ({ around: around(), view: ui.room ? 'room' : ui.play ? 'play' : ui.sheet?.open ? 'corner' : null });

// Команда ядра изменила настройки: показ оболочки — по снимку, подсказка о сохранении — по статусу ключей.
function settingsChanged() {
  ui.settings = readSettings();
  syncStoreNote();
}

// Хранилище не прочиталось при подключении — изменения действуют только на этой странице (подсказки мест и облика).
const offline = () => ui.storage === 'failed';
const OFFLINE = 'Хранилище этого браузера недоступно: изменения действуют на этой странице до перезагрузки и не сохраняются.';

// Подсказка в «Настройках»: сохранение обещается, только пока запись удаётся; повреждённые настройки — честно.
function storeNote() {
  const save = snap().save;
  const head = offline()
    ? OFFLINE
    : save.cat.corrupt || save.companion.corrupt
      ? 'Сохранённые настройки в этом браузере повреждены и не читаются: показаны обычные. Сами они не перезаписываются — изменение настройки здесь их заменит.'
      : save.cat.unsaved.length > 0 || save.companion.unsaved.length > 0
        ? 'Сохранить настройки в этом браузере сейчас не получается: они действуют на этой странице до перезагрузки, другие вкладки их не видят.'
        : 'Настройки напарника, облик, имена и лакомство хранятся в этом браузере: на другом устройстве — свои.';
  return `${head} Имя, облик и аксессуар у кота и собаки свои, движение, реплики и «скрыть» — общие. ${T.origin}`;
}

// Облик: не записался — подсказка «не сохранился» (облик действует в памяти ядра до перезагрузки).
const coatNote = () =>
  snap().save.look.unsaved.includes(ui.kind)
    ? 'Облик не сохранился в этом браузере: он действует на этой странице до перезагрузки.'
    : offline()
      ? OFFLINE
      : 'Облик у кота и собаки свой и хранится в этом браузере. Знаков и вещей не меняет.';

// ---------- место и вид (ключ place) — как облик, по устройствам и полям ----------

const deviceOf = (raw, device) => (R.isRecord(raw[device]) ? raw[device] : {});

function readPlace() {
  const raw = readStored(K.place, rawOf);
  const stored = P.normalizePlace(raw);
  for (const device of P.DEVICES) {
    const own = ui.placeUnsaved[device];
    for (const field of Object.keys(own ?? {})) if (own[field] === deviceOf(raw, device)[field]) delete own[field];
    if (own && !Object.keys(own).length) delete ui.placeUnsaved[device];
  }
  return P.normalizePlace(Object.fromEntries(P.DEVICES.map((device) => [device, { ...stored[device], ...ui.placeUnsaved[device] }])));
}

function storePlace(patch) {
  for (const [device, fields] of Object.entries(patch)) ui.placeUnsaved[device] = { ...ui.placeUnsaved[device], ...fields };
  if (!writeKey(K.place, (text) => P.placeRecord(text, ui.placeUnsaved))) return false;
  ui.placeUnsaved = {};
  return true;
}

function forgetPlace({ oldValue, newValue }) {
  const was = rawOf(oldValue);
  const next = rawOf(newValue);
  for (const device of P.DEVICES) for (const field of ['place', 'view']) if (deviceOf(was, device)[field] !== deviceOf(next, device)[field]) delete ui.placeUnsaved[device]?.[field];
}

const placeUnsavedNow = () => Object.keys(ui.placeUnsaved[ui.layout?.device] ?? {}).length > 0;

// ---------- присутствие (ключ presence; не записалось — в памяти, как место) ----------

function readPresence() {
  const stored = readStored(K.presence, rawOf).mode;
  if (ui.presenceUnsaved === stored) ui.presenceUnsaved = '';
  return ui.presenceUnsaved || P.presenceOf(stored);
}

function storePresence(mode) {
  ui.presenceUnsaved = mode;
  if (!writeKey(K.presence, (text) => P.presenceRecord(text, mode))) return false;
  ui.presenceUnsaved = '';
  return true;
}

// Рядом со страницей: питомец, кнопка или ничего; на виду — рядом или вызван.
const surface = () => P.presenceSurface(ui.presence, ui.settings.hidden);
const around = () => P.petAround({ mode: ui.presence, open: ui.sheetOpen });

function syncStoreNote() {
  const note = ui.sheet?.querySelector('[data-cat-store]');
  if (note && note.textContent !== storeNote()) note.textContent = storeNote();
}

const motion = () => R.effectiveMotion(ui.settings, ui.reduced?.matches);
const profile = () => R.profileOf(ui.kind);
const name = () => R.companionName(ui.settings);
const now = () => Date.now();
const coat = () => ui.look[ui.kind];
// Рисунок показанного напарника в его облике; id — с видом, чтобы градиенты и клипы не совпадали.
const art = (options) => (ui.kind === 'dog' ? dogSvg({ coat: ui.look.dog, ...options }) : catSvg({ coat: ui.look.cat, ...options }));
// Статичный портрет для выбора (напарник, облик): без data-cat-managed, с надетым аксессуаром.
const pickerArt = (kind, look, id, acc) =>
  (kind === 'dog' ? dogSvg : catSvg)({ id: `${kind}-${id}`, view: 'portrait', coat: look }).replace('data-acc="scarf"', `data-acc="${acc}"`);

// ---------- таймеры ----------

function later(key, ms, fn) {
  clearTimeout(ui.timers[key]);
  if (ms === null || ms === undefined) return;
  ui.timers[key] = setTimeout(safe(fn), ms);
}

function stopTimers() {
  for (const key of Object.keys(ui.timers)) clearTimeout(ui.timers[key]);
  ui.timers = {};
}

// Смена напарника: декоративные таймеры прежнего не доигрывают на новом; конец тишины ввода (typing) — про страницу.
function stopDecor() {
  for (const key of Object.keys(ui.timers)) {
    if (key === 'typing') continue;
    clearTimeout(ui.timers[key]);
    delete ui.timers[key];
  }
}

// Полночь — служебная; декоративное — только пока питомец на виду (по зову — в открытом диалоге).
const live = () => ui.mounted && !ui.settings.hidden && !document.hidden;
const active = () => live() && around();

function scheduleIdle() {
  scheduleIdleBlink();
  scheduleIdleMicro();
  scheduleRest();
  scheduleMidnight();
}

// Новый день в открытой вкладке: лакомство снова ждёт занятия, довольная поза — обычный покой.
function scheduleMidnight() {
  if (live()) later('midnight', R.msToMidnight(new Date(now())), () => {
    refreshInfo();
    syncTreat();
    syncLearn();
    paint();
    scheduleMidnight();
  });
}

function scheduleIdleBlink() {
  if (active()) later('blink', R.blinkDelay(motion()), () => {
    micro('blink');
    scheduleIdleBlink();
  });
}

function scheduleIdleMicro() {
  if (active()) later('micro', R.microDelay(motion()), () => {
    const kinds = R.microKinds(ui.kind);
    if (motion() === 'normal' && !ui.form && !gesturing() && Math.random() < 0.18) play(R.request(ui.director, 'yawn', { now: now(), context: 'calm' }));
    else micro(kinds[Math.floor(Math.random() * kinds.length)]);
    scheduleIdleMicro();
  });
}

function scheduleRest() {
  if (!active() || ui.resting) return;
  const left = R.REST_AFTER_MS - (now() - ui.lastActivity);
  later('rest', Math.max(1000, left), () => {
    if (now() - ui.lastActivity >= R.REST_AFTER_MS && !quiet() && !playing()) {
      ui.resting = true;
      paint();
    } else scheduleRest();
  });
}

// Небольшое движение в покое: только если питомец спокоен, не спит и ничем не занят.
function micro(kind) {
  if (!active() || motion() === 'none' || quiet() || playing() || ui.resting || gesturing()) return;
  for (const art of arts()) art.dataset.micro = kind;
  later('micro-end', R.MICRO_MS[kind] ?? 600, () => {
    for (const art of arts()) delete art.dataset.micro;
  });
}

// ---------- поза ----------

const quiet = () => ui.director.quiet.size > 0;
const playing = () => Boolean(ui.director.current && ui.director.current.until > now());

function arts() {
  return [...document.querySelectorAll('.cat-art[data-cat-managed]')];
}

// В «Поиграть» питомец спокоен и не засыпает (области поглаживания — для сидящего), на прямое действие откликается и в
// тишине (reaction.explicit) — рисунки на странице тогда тихие; пока гладят — доволен и между откликами.
function paint() {
  const reaction = playing() ? ui.director.current : null;
  // Редкая сценка — data-scene поверх позы покоя; в сцене «Поиграть» её нет.
  const scene = reaction && R.REACTIONS[reaction.type].scene ? reaction.type : '';
  const content = ui.treat === 'fed';
  const base = R.basePose({ quiet: quiet(), focus: ui.form, resting: ui.resting, content });
  const still = ui.strokeHeld ? 'pet' : R.basePose({ content });
  const acc = ui.tryOn || snap().pets[ui.kind].worn;
  const move = motion();
  // Тот же режим — всему интерфейсу питомца (pet.css).
  if (document.documentElement.dataset.catMotion !== move) document.documentElement.dataset.catMotion = move;
  for (const art of arts()) {
    const inPlay = Boolean(art.closest('.cat-play'));
    // В редакторе питомец спокоен: без реакций и сценок.
    const inRoom = Boolean(art.closest('.cat-room'));
    const own = reaction && !scene && !inRoom && (inPlay || !(reaction.explicit && quiet())) ? reaction.pose : '';
    art.dataset.pose = own || (inPlay ? still : inRoom ? R.basePose({ content }) : base);
    // Только там, где сценка читается: клубок — у целого питомца (уголок открыт — портрет за ним остаётся в покое).
    if (scene && !inPlay && !inRoom && R.sceneTypes(ui.kind, art.dataset.view === 'full').includes(scene)) art.dataset.scene = scene;
    else delete art.dataset.scene;
    // Куда смотрит в сцене (миска, мячик).
    if (inPlay && own && reaction.toward) art.dataset.toward = reaction.toward;
    else delete art.dataset.toward;
    art.dataset.acc = acc;
    art.dataset.motion = move;
    if (move === 'normal' && (inPlay || inRoom || !quiet()) && !document.hidden) art.dataset.breathe = '';
    else delete art.dataset.breathe;
    if (own || scene) delete art.dataset.micro;
  }
}

// ---------- реплики ----------

// Компьютер — облако рядом с питомцем (боковая панель, внизу экрана); уголок — под сценой. Телефон — без текста в
// панелях: питомец реагирует позой, реплики — в уголке.
function say(text, short = '') {
  if (!text || !ui.settings.phrases) return;
  ui.lastPhrase = text;
  // В тишине (явный отклик в сцене) облаков на странице нет — только реплика в диалоге.
  if (!quiet()) {
    ui.saying = text;
    ui.sayingShort = short;
    showSaying();
    const side = ui.side?.querySelector('.cat-side-say');
    if (side) {
      side.textContent = text;
      ui.side.classList.add('is-saying');
    }
  }
  if (ui.sheet?.open) setScenePhrase(text);
  later('say-end', 3200, hush);
}

// Облако реплики — по ui.saying, и после перерисовки места. Узкое облако боковой панели не растёт за её край: не
// помещается фраза с длинным именем — без имени (ui.sayingShort).
function showSaying() {
  for (const box of [ui.dock?.querySelector('.cat-dock-say'), ui.float?.querySelector('.cat-float-say')]) {
    if (!box || !ui.saying) continue;
    const bubble = box.querySelector('.cat-bubble');
    bubble.textContent = ui.saying;
    if (ui.sayingShort && bubble.offsetTop + bubble.offsetHeight > box.clientHeight) bubble.textContent = ui.sayingShort;
    box.classList.add('is-saying');
  }
}

function hush() {
  ui.saying = '';
  ui.dock?.querySelector('.cat-dock-say')?.classList.remove('is-saying');
  ui.float?.querySelector('.cat-float-say')?.classList.remove('is-saying');
  ui.side?.classList.remove('is-saying');
}

// Реплика под сценой уголка и в сцене «Поиграть».
function setScenePhrase(text) {
  ui.scenePhrase = text;
  for (const box of ui.sheet?.querySelectorAll('[data-cat-phrase]') ?? []) {
    box.hidden = !text || !ui.settings.phrases;
    box.querySelector('span').textContent = text;
  }
}

// Область объявлений на странице, а пока открыт диалог — ещё и внутри него: страница под модальным окном выпадает из
// дерева доступности. Куда писать — решается в момент записи (диалог могли закрыть за эти 80 мс).
// Ждущие объявления снимает только отключение (said).
function announce(text) {
  const owner = ui;
  const boxes = () => [ui.live, ui.sheet?.open ? ui.sheet.querySelector('[data-cat-live-in]') : null].filter(Boolean);
  for (const box of [ui.live, ui.sheet?.querySelector('[data-cat-live-in]')]) if (box) box.textContent = '';
  const id = setTimeout(() => {
    owner.said.delete(id);
    if (ui !== owner || !ui.mounted) return;
    for (const box of boxes()) box.textContent = text;
  }, 80);
  owner.said.add(id);
}

// ---------- реакции ----------

function play(result) {
  if (!result) return;
  if (result.action === 'stop') {
    clearTimeout(ui.timers.reaction);
    endExtras();
    hush();
    paint();
    return;
  }
  if (result.action !== 'play') return;
  const reaction = result.reaction;
  // Реакция занятия ждала ввода, диктовки или таймера — её сценка через тишину не переносится.
  if (reaction.after && ui.sceneNext?.key === reaction.after && R.sceneWaited(ui.sceneNext, now())) ui.sceneNext = null;
  ui.resting = false;
  ui.tryOn = reaction.tryOn ?? '';
  showMini(reaction.mini ?? '');
  // Та же поза в сцене (гладят дальше) — её движения заново (data-again).
  for (const art of ui.sheet?.querySelectorAll('.cat-play .cat-art') ?? []) if (art.dataset.pose === reaction.pose) art.toggleAttribute('data-again');
  paint();
  const group = reaction.phrases ?? R.REACTIONS[reaction.type].phrases;
  if (reaction.say) say(reaction.say, reaction.sayShort);
  else if (group) say(R.pickPhrase(group, { last: ui.lastPhrase, stage: ui.info.stage, kind: ui.kind }));
  later('reaction', Math.max(50, reaction.until - now()), () => {
    endExtras();
    const next = R.finish(ui.director, now());
    if (next.action === 'play') play(next);
    else {
      paint();
      // Реакция занятия доиграла — может начаться редкая сценка.
      if (reaction.after) sceneSoon(reaction.after);
    }
    scheduleRest();
  });
}

function endExtras() {
  ui.tryOn = '';
  showMini('');
}

// Новая вещь или миска рядом с питомцем (боковая панель, внизу экрана) на время реакции.
function showMini(item) {
  ui.mini = item;
  for (const slot of [ui.dock, ui.float].map((box) => box?.querySelector('.cat-dock-mini'))) {
    if (!slot) continue;
    slot.innerHTML = item === 'ball' ? ballMiniSvg() : item === 'bowl' || item === 'bowl-empty' ? bowlMiniSvg({ full: item === 'bowl' }) : item ? miniItemSvg(item) : '';
    slot.classList.toggle('is-on', Boolean(item));
  }
}

function contextNow() {
  return ui.form ? 'focus' : 'calm';
}

// ---------- редкие сценки после занятия ----------

// Питомец виден целиком: открытый уголок (сцена комнаты) или место на странице; иначе — портрет.
const sceneFull = () => Boolean(ui.sheet?.open) || ui.layout?.view === 'full';

// Решается при подтверждённом занятии — один раз на событие; начнётся после его реакции (sceneSoon), если она не ждала
// тишины (play). Попытка — { type, key, day, at, until } до показа, отмены или срока.
function sceneFor(key, outcome, celebrate, at) {
  const day = R.localDay();
  // Хранилище не прочиталось при подключении — сценки нет (её день записывать нельзя).
  const type = offline() ? '' : R.pickScene({ key, checked: ui.sceneChecked, outcome, celebrate, day, record: readStored(K.scene, R.parseScene), kind: ui.kind, available: R.sceneTypes(ui.kind, sceneFull()) });
  ui.sceneNext = type ? { type, key, day, at, until: at + R.SCENE_FRESH_MS } : null;
  return type;
}

// «Поиграть» и редактор — занятость: сценки нет.
const sceneFits = (next) => R.sceneFits(next, { now: now(), shown: active(), quiet: quiet(), playing: playing(), play: ui.play || Boolean(ui.room), moving: moving(), kind: ui.kind, full: sceneFull() });

// Метка этой вкладки для дня сценки (не связана с занятием).
const sceneBy = () => `${now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;

function sceneIdb() {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

// Реакция занятия доиграла: если сценка уместна — R.sceneTurn (решение, запись дня и начало показа одной транзакцией, по
// очереди со всеми вкладками). Отменили, пока ждали очереди, или питомца отключили — ничего не пишется; показ начался —
// день занят, даже если его прервут. Нет IndexedDB или localStorage — сценки нет; запись дня в базе повреждена — тоже
// (R.sceneCommit). Копия дня — после записи и только своим экземпляром и в своём пространстве (keys): отключили до конца
// транзакции — день остаётся в базе, копии и остановки нет, новый экземпляр (с любым storage) не затрагивается. Копия —
// неявная запись: повреждённую или непрочитанную не заменяет; собака не меняет в ней прошлый вариант кота.
function sceneSoon(key) {
  const next = ui.sceneNext;
  if (next?.key !== key || !sceneFits(next)) {
    ui.sceneNext = null;
    return;
  }
  const owner = ui;
  const keys = K;
  let copy = null; // правка копии дня: день, метка, у кота — вариант
  let shown = null;
  const decide = (stored) => {
    if (ui !== owner || !ui.mounted || ui.sceneNext !== next) return null;
    ui.sceneNext = null;
    const record = R.sceneCommit(stored, R.parseScene(localStorage.getItem(keys.scene)), { day: next.day, today: R.localDay(), by: sceneBy(), kind: ui.kind, type: next.type, fits: sceneFits(next) });
    if (record) copy = { day: record.day, by: record.by, ...(ui.kind === 'cat' ? { cat: record.cat } : {}) };
    return record;
  };
  const show = () => {
    const at = now();
    play(R.request(ui.director, next.type, { now: at, context: contextNow(), extra: { say: R.sceneText(next.type, name()), sayShort: R.sceneText(next.type), ...(motion() === 'none' ? { until: at + R.REACTIONS[next.type].still } : {}) } }));
    shown = ui.director.current;
  };
  void R.sceneTurn(sceneIdb(), keys.db, decide, show).then(
    safe((result) => {
      if (ui !== owner || !ui.mounted) return;
      if (result === 'shown') writeKey(keys.scene, (text) => R.sceneRecord(text, copy), true);
      else if (result === 'lost' && shown && ui.director.current === shown) stopScene();
    }),
  );
}

// Отмена (тишина, ввод, ручное действие, смена вида, облика, места или движения, «Поиграть», перенос): ждущая не
// начнётся, идущая останавливается — поза покоя без data-scene и мячика; прерванная не возобновляется.
function stopScene() {
  ui.sceneNext = null;
  if (!playing() || !R.REACTIONS[ui.director.current.type].scene) return;
  ui.director.current = null;
  play({ action: 'stop' });
}

// ---------- прогресс: знаки от сайта ----------

// Всего (marks), за сегодня (today), предел дня (limit — только для подписи) — сайт; читает ядро.
const progress = () => ({ marks: 0, today: 0, ...O.progress?.() });

// Знаки сайта, ступень и лакомство дня — заново в ядре (первое включение — молча, неявной записью ядра), затем показ.
function refreshInfo() {
  ui.core.refresh();
  showProgress();
}

// Счёт, ступень и лакомство — по снимку ядра: точка «новое» и подписи кнопок, ступень в боковой панели; подсказка о
// сохранении (неявная запись ядра — первое включение, отметка ступени — могла не удаться).
function showProgress() {
  const state = snap();
  ui.info = infoOf(state);
  ui.treat = state.treat ?? 'waiting';
  syncStoreNote();
  const fresh = Boolean(state.progress?.unseen);
  for (const button of openers()) {
    // У кнопки вызова точки нет.
    const call = button.hasAttribute('data-cat-call');
    button.querySelector('.cat-dot')?.toggleAttribute('hidden', call || !fresh);
    button.setAttribute('aria-label', call ? callLabel() : `${name()} — уголок ${profile().gen}${fresh ? ', есть новая вещь' : ''}`);
    button.setAttribute('aria-expanded', String(ui.sheetOpen));
  }
  const stage = ui.dock?.querySelector('[data-cat-stage]');
  if (stage) stage.textContent = ui.info.current.title;
}

// ---------- места рядом со страницей ----------

// Кнопки, открывающие диалог: питомец или кнопка вызова; видна одна — html[data-pet-at] или html[data-pet-call].
function openers() {
  return [...[ui.dock, ui.side, ui.float, ui.bar].flatMap((box) => [...(box?.querySelectorAll('[aria-controls="cat-sheet"]') ?? [])]), ui.face].filter(Boolean);
}

const managed = (markup) => markup.replace('<svg ', '<svg data-cat-managed ');
const PAW_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="currentColor"><ellipse cx="12" cy="16" rx="4.6" ry="3.8"/><circle cx="6.4" cy="10.6" r="2.1"/><circle cx="9.8" cy="6.9" r="2.1"/><circle cx="14.2" cy="6.9" r="2.1"/><circle cx="17.6" cy="10.6" r="2.1"/></g></svg>';
const FOLD_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// «Обустроить уголок» — домик.
const ROOM_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11.2 12 4.5l8.5 6.7"/><path d="M6 9.6V19.5h12V9.6"/><path d="M9.6 19.5v-4a2.4 2.4 0 0 1 4.8 0v4"/></g></svg>';
const foldLabel = () => `Свернуть ${profile().acc}`;
const foldHtml = () => `<button class="cat-fold" type="button" data-cat-fold aria-label="${foldLabel()}" title="Свернуть">${FOLD_ICON}</button>`;
// Тянуть мышью — только если сайт задал рамки мест (options.zone).
const opener = () => `aria-haspopup="dialog" aria-expanded="false" aria-controls="cat-sheet"${O.zone ? ' data-pet-drag' : ''}`;
// Кнопка вызова — лапка без мордашки, точки и движения; подпись — где помещается.
const CALL = 'Позвать питомца';
const callLabel = () => `${CALL}: ${name()}`;
const callHtml = () =>
  `<button class="cat-call" type="button" data-cat-call aria-haspopup="dialog" aria-expanded="false" aria-controls="cat-sheet" aria-label="${esc(callLabel())}" title="${CALL}">${PAW_ICON}<span class="cat-call-text">${CALL}</span></button>`;

// Вид места: показанного — по раскладке, остальных — портрет (их не видно).
const hostView = (host) => (ui.layout?.host === host ? ui.layout.view : 'compact');

// Боковая панель: целиком (имя, ступень и реплика рядом, «Свернуть» при наведении) или портретом с именем; по зову — кнопка.
function renderDock() {
  if (!ui.dock) return;
  const view = hostView('sidebar');
  const s = surface();
  ui.dock.hidden = s === 'none';
  ui.dock.dataset.view = s === 'call' ? 'call' : view;
  ui.dock.innerHTML =
    s === 'call'
      ? callHtml()
      : s === 'none'
        ? ''
        : `<button class="cat-dock-btn" type="button" ${opener()}>
      <span class="cat-dock-art">${managed(artFor('dock', view))}</span>
      <span class="cat-dock-mini" aria-hidden="true"></span>
      <span class="cat-dot" hidden></span>
    </button>
    <p class="cat-dock-say" aria-hidden="true"><span class="cat-dock-name"><strong data-cat-name>${esc(name())}</strong><span data-cat-stage></span></span><span class="cat-bubble"></span></p>${view === 'full' ? foldHtml() : ''}`;
}

// Внизу экрана (компьютер) и нижняя панель (телефон): кнопка-питомец и «Свернуть» у целого.
const hostHtml = (host, view) =>
  `<button class="cat-host-btn" type="button" ${opener()}><span class="cat-host-art">${managed(artFor(host, view))}</span><span class="cat-dot" hidden></span></button>${view === 'full' ? foldHtml() : ''}`;

function renderFloat() {
  if (!ui.float) return;
  const view = hostView('float');
  ui.float.dataset.view = view;
  ui.float.innerHTML = surface() !== 'pet' ? '' : `<p class="cat-float-say" aria-hidden="true"><span class="cat-bubble"></span></p>${hostHtml('float', view)}<span class="cat-dock-mini" aria-hidden="true"></span>`;
}

function renderBar() {
  if (!ui.bar) return;
  const view = hostView('bar');
  ui.bar.dataset.view = view;
  ui.bar.innerHTML = surface() !== 'pet' ? '' : hostHtml('bar', view);
}

const returnLabel = () => `Показать ${profile().acc}`;

// У логотипа: портрет без лишней высоты; по зову — кнопка; спрятан — маленькая кнопка «Показать …» (на любой высоте).
function renderSide() {
  if (!ui.side) return;
  const s = surface();
  ui.side.classList.toggle('is-hidden-cat', s === 'none');
  ui.side.classList.toggle('is-call', s === 'call');
  ui.side.innerHTML =
    s === 'none'
      ? `<button class="cat-side-return" type="button" data-cat-return aria-label="${returnLabel()}" title="${returnLabel()}">${PAW_ICON}</button>`
      : s === 'call'
        ? callHtml()
        : `<button class="cat-side-face" type="button" ${opener()}>${managed(art({ id: `${ui.kind}-side`, view: 'portrait' }))}<span class="cat-dot" hidden></span></button>
      <span class="cat-side-say" aria-hidden="true"></span>`;
}

// Верх телефона: кнопка-питомец (портрет или целиком) или лапка вызова; место ставит сайт (places.top).
function renderFace() {
  if (!O.places?.top) return;
  if (ui.settings.hidden) {
    ui.face?.remove();
    ui.fold?.remove();
    ui.face = null;
    document.documentElement.classList.remove('cat-on');
    return;
  }
  if (!ui.face) {
    ui.face = document.createElement('button');
    ui.face.type = 'button';
    ui.face.className = 'cat-face';
    for (const [key, value] of [['aria-haspopup', 'dialog'], ['aria-expanded', 'false'], ['aria-controls', 'cat-sheet']]) ui.face.setAttribute(key, value);
    ui.face.innerHTML = '<span class="cat-dot" hidden></span>';
    ui.face.addEventListener('click', safe(() => openSheet(ui.face, ui.face.hasAttribute('data-cat-call') ? 'call' : 'pet')));
    watchDrag(ui.face);
    O.places.top(ui.face);
  }
  // По зову — та же кнопка с лапкой (не переносится).
  const call = surface() === 'call';
  ui.face.toggleAttribute('data-pet-drag', !call && Boolean(O.zone));
  ui.face.toggleAttribute('data-cat-call', call);
  if (call) ui.face.title = CALL;
  else ui.face.removeAttribute('title');
  // «Свернуть» — сразу за питомцем (видна, только когда он целиком наверху).
  if (ui.fold && ui.fold.previousElementSibling !== ui.face) ui.face.after(ui.fold);
  ui.fold?.setAttribute('aria-label', foldLabel());
  // Портрет или целиком, в облике показанного напарника; кнопка та же (фокус и состояние не теряются).
  const view = call ? 'call' : hostView('top');
  if (ui.face.dataset.kind !== ui.kind || ui.face.dataset.coat !== coat() || ui.face.dataset.view !== view) {
    ui.face.querySelector('svg')?.remove();
    ui.face.insertAdjacentHTML('afterbegin', call ? PAW_ICON : managed(artFor('face', view)));
    ui.face.dataset.kind = ui.kind;
    ui.face.dataset.coat = coat();
    ui.face.dataset.view = view;
  }
  document.documentElement.classList.add('cat-on');
}

// «Показать …» на телефоне: ссылкой в разметке сайта или лапкой в шапке (подпись — aria-label и title).
function renderReturn() {
  if (!ui.restore) return;
  ui.restore.hidden = !ui.settings.hidden;
  const button = ui.restore.querySelector('button');
  if (O.places.restore) button.textContent = returnLabel();
  else button.setAttribute('aria-label', (button.title = returnLabel()));
}

function renderAll() {
  ui.presence = readPresence();
  ui.layout = layoutNow();
  markLayout();
  renderDock();
  renderSide();
  renderFace();
  renderFloat();
  renderBar();
  renderReturn();
  ui.shownHidden = ui.settings.hidden;
  ui.shownPresence = ui.presence;
  refreshInfo();
  paint();
}

// ---------- место и вид на странице ----------

// Места, которых сайт не задал, не помещаются (у логотипа и наверху телефона — запасные места).
function env() {
  const e = Object.fromEntries(ui.media.map(([key, list]) => [key, list.matches]));
  if (!ui.dock) e.tall = e.roomy = false;
  if (!ui.float) e.gutterFull = e.gutterCompact = false;
  if (!ui.bar) e.barFull = e.barCompact = false;
  return e;
}
const layoutNow = () => P.petLayout(ui.place, env());

// Место и вид — атрибутами страницы (pet.css показывает одно место); по зову — data-pet-call; спрятан — нигде.
function markLayout() {
  const html = document.documentElement;
  const on = ui.layout && surface() === 'pet';
  if (on) {
    html.dataset.petAt = ui.layout.host;
    html.dataset.petView = ui.layout.view;
  } else {
    delete html.dataset.petAt;
    delete html.dataset.petView;
  }
  html.toggleAttribute('data-pet-call', surface() === 'call');
  if (ui.fold) ui.fold.hidden = !on || ui.layout.host !== 'top' || ui.layout.view !== 'full';
}

// Место и вид по сохранённому и окну: перерисовываются только сменившиеся места, фокус — на питомца на новом месте.
// explicit — действие владельца (появление и «устроился»), иначе — тихо. Во время переноса — после него.
function applyLayout({ explicit = false } = {}) {
  if (!ui.mounted) return;
  if (moving()) {
    ui.placeLater = true;
    return;
  }
  // Вход с фокусом спрятал медиазапрос pet.css — браузер мог снять фокус ещё до раскладки (onFocusOut).
  const lost = ui.lostEntry && [null, document.body].includes(document.activeElement);
  ui.lostEntry = false;
  const was = ui.layout;
  ui.layout = layoutNow();
  markLayout();
  const focused = focusedControl();
  const changed = !was || was.host !== ui.layout.host || was.view !== ui.layout.view;
  if (changed && surface() === 'pet') {
    stopScene();
    if (ui.dock && ui.dock.dataset.view !== hostView('sidebar')) renderDock();
    if (ui.float && ui.float.dataset.view !== hostView('float')) renderFloat();
    if (ui.bar && ui.bar.dataset.view !== hostView('bar')) renderBar();
    renderFace();
    refreshInfo();
    // Идущая реакция продолжается и на перерисованном месте: реплика и маленькая вещь.
    showSaying();
    showMini(ui.mini);
    paint();
    if (explicit) settle();
  }
  // Кнопки вызова не перерисовываются — одну показывает pet.css.
  if (lost) fallbackFocus()?.focus({ preventScroll: true });
  else keepFocus(focused);
  syncPlaceBox();
}

const hostBox = (host) => ({ sidebar: ui.dock, logo: ui.side, float: ui.float, top: ui.face, bar: ui.bar })[host];

// Питомец на новом месте или раскрылся: появляется (класс снимается концом анимации или следующим появлением)
// и коротко устраивается.
function settle() {
  endArrive();
  if (motion() === 'none') return;
  const box = hostBox(ui.layout.host);
  if (box) {
    const done = (event) => event.animationName === 'pet-arrive' && endArrive();
    ui.arrive = { box, done };
    box.classList.add('is-arriving');
    for (const type of ['animationend', 'animationcancel']) box.addEventListener(type, done);
  }
  play(R.request(ui.director, 'settle', { now: now(), context: contextNow() }));
}

function endArrive() {
  if (!ui.arrive) return;
  const { box, done } = ui.arrive;
  box.classList.remove('is-arriving');
  for (const type of ['animationend', 'animationcancel']) box.removeEventListener(type, done);
  ui.arrive = null;
}

// Медиазапросы меняются пачкой при одном изменении окна — раскладка один раз, после всех.
function onMediaChange() {
  clearTimeout(ui.layoutTimer);
  ui.layoutTimer = setTimeout(safe(() => applyLayout()), 0);
}

function chooseDevice() {
  return ui.layout?.device ?? (env().phone ? 'phone' : 'desktop');
}

// Выбрали место (в уголке или переносом): сохраняется сразу, питомец там. Не помещается — временно рядом.
function choosePlace(id) {
  const device = chooseDevice();
  if (!P.placeIds(device).includes(id)) return;
  const saved = storePlace({ [device]: { place: id } });
  ui.place = readPlace();
  ui.lastActivity = now();
  applyLayout({ explicit: true });
  announce(`Место: ${P.placeTitle(device, id).toLowerCase()}.${ui.layout.moved ? ` Сейчас там нет места — питомец временно ${P.placeTitle(device, ui.layout.at).toLowerCase()}.` : ''}${saved ? '' : ' Не сохранилось в этом браузере — действует до перезагрузки.'}`);
}

// Вид: «Показать целиком», «Свернуть» или выбор в «Настройках». Питомец не уходит с места, где новый вид помещается
// (P.viewPatch).
function chooseView(view) {
  if (!P.VIEWS.some((item) => item.id === view)) return;
  const saved = storePlace(P.viewPatch(ui.place, env(), view, readStored(K.place, rawOf)));
  ui.place = readPlace();
  ui.lastActivity = now();
  applyLayout({ explicit: true });
  const title = P.VIEWS.find((item) => item.id === view).title.toLowerCase();
  announce(`Вид: ${title}.${ui.layout.squeezed ? ' Сейчас здесь помещается только портрет.' : ''}${saved ? '' : ' Не сохранилось в этом браузере — действует до перезагрузки.'}`);
}

const toggleView = () => chooseView(ui.layout?.wantsFull ? 'compact' : 'full');

// «Свернуть» у питомца: кнопка исчезает — фокус на питомце.
function fold() {
  chooseView('compact');
  fallbackFocus()?.focus({ preventScroll: true });
}

// ---------- перенос ----------

// Места переноса — другие доступные сейчас; рамки задаёт сайт (options.zone), без них переноса нет.
const sameLayout = () => {
  const next = layoutNow();
  return next.host === ui.layout?.host && next.view === ui.layout?.view;
};

function otherPlaces() {
  const L = ui.layout;
  if (!L || surface() !== 'pet' || !O.zone) return [];
  const can = P.placeAbility(L.device, env());
  return P.PLACES[L.device].filter((item) => can[item.id].compact && item.id !== L.at);
}

function zoneList() {
  return otherPlaces()
    .map((item) => ({ id: item.id, title: item.title, rect: O.zone?.(ui.layout.device, item.id) }))
    .filter((zone) => zone.rect);
}

const moveLabel = () => `Перетащите ${profile().acc}${ui.layout?.device === 'phone' ? ' пальцем вверх или вниз' : ' на одно из мест'} — или нажмите место.`;

// «Переместить» в уголке: уголок закрывается, на странице — места; питомца можно тянуть пальцем.
function startMove() {
  stopScene();
  closeSheet({ restore: false });
  const source = openers().find(shown);
  if (!source) return;
  startMoveMode(source);
  announce(`${moveLabel()} Esc — отмена.`);
}

// Перенос закончился: отпустили над местом — оно выбрано; иначе ничего не меняется. Изменение другой вкладки во время
// переноса применяется теперь (после отмены — её значение, после переноса — новее наше). Фокус не остаётся на исчезнувшем.
function onMoveEnd({ reason, place }) {
  if (!ui.mounted) return;
  if (ui.placeLater || !place) {
    ui.placeLater = false;
    ui.place = readPlace();
    applyLayout();
  }
  if (place) choosePlace(place);
  const active = document.activeElement;
  if (reason !== 'outside' && (!active || active === document.body || !shown(active))) fallbackFocus()?.focus({ preventScroll: true });
}

// ---------- уголок (диалог) ----------

function sheetSkeleton() {
  const dialog = document.createElement('dialog');
  dialog.className = 'cat-sheet';
  dialog.id = 'cat-sheet';
  dialog.setAttribute('aria-labelledby', 'cat-sheet-title');
  dialog.innerHTML = `<div class="cat-sheet-panel">
      <div class="cat-sheet-head">
        <div class="cat-sheet-titles"><h2 id="cat-sheet-title"></h2><p class="cat-sheet-sub" data-cat-sub></p></div>
        <button class="${C.close}" type="button" data-cat-close>Закрыть</button>
      </div>
      <div class="cat-sheet-body" data-cat-body></div>
    </div>
    <section class="cat-play" data-cat-play-view aria-labelledby="cat-play-title"></section>
    <section class="cat-room" data-cat-room-view aria-labelledby="cat-room-title"></section>
    <div class="${C.sr}" role="status" aria-live="polite" data-cat-live-in></div>`;
  return dialog;
}

const gift = (index) => R.stageGift(index, ui.kind, name());

function stageListHtml(info) {
  return R.STAGES.map((stage, index) => {
    const done = index <= info.stage;
    return `<li class="${done ? 'is-done' : ''}"><span class="cat-step-mark" aria-hidden="true">${done ? '✓' : ''}</span><span><strong>${esc(stage.title)}</strong> · ${stage.at ? R.marksText(stage.at) : 'с начала'}<br><span class="${C.muted}">${esc(gift(index))}</span></span></li>`;
  }).join('');
}

const accessoryText = (item, open) =>
  `${esc(item.title)}${open ? '' : `<br><span class="${C.muted}">откроется на ${R.marksText(R.STAGES[item.stage].at)}</span>`}`;

// Аксессуары, открытые ступенью, и надетый — решение ядра (снимок).
const openAccessories = () => snap().progress?.accessories ?? [];

function accessoryHtml() {
  const worn = snap().pets[ui.kind].worn;
  const opened = openAccessories();
  return R.ACCESSORIES.map((item) => {
    const open = opened.includes(item.id);
    return `<label class="cat-acc-option${open ? '' : ' is-locked'}">
        <input type="radio" name="cat-acc" value="${item.id}"${item.id === worn ? ' checked' : ''}${open ? '' : ' disabled'} />
        <span class="cat-swatch cat-swatch-${item.id}" aria-hidden="true"></span>
        <span>${accessoryText(item, open)}</span>
      </label>`;
  }).join('');
}

// Аксессуары открытого уголка — на месте: переключатели не пересоздаются, фокус не теряется.
function syncAccessories() {
  const worn = snap().pets[ui.kind].worn;
  const opened = openAccessories();
  for (const item of R.ACCESSORIES) {
    const input = ui.sheet.querySelector(`input[name="cat-acc"][value="${item.id}"]`);
    if (!input) continue;
    const open = opened.includes(item.id);
    input.disabled = !open;
    input.checked = item.id === worn;
    const option = input.closest('.cat-acc-option');
    option.classList.toggle('is-locked', !open);
    option.lastElementChild.innerHTML = accessoryText(item, open);
  }
}

// Сцена ступени: место отдыха с питомцем, миска (в уголке — когда можно угостить и после), клубок или канат, у собаки
// со ступени «Наш ритуал» мячик. Расстановка — paintRoom после вставки. id — свой у уголка и редактора.
const scenePet = (stage, id) => managed(art({ id: `${ui.kind}-${id}-art`, box: sceneCatBox(stage) })).replace('<svg ', '<svg data-room="rest" ');
const sceneHtml = (stage, fresh, { id = 'scene', bowl = ui.treat } = {}) =>
  sceneSvg({
    id: `cat-${id}`,
    stage,
    fresh,
    cat: scenePet(stage, id),
    extra: `${bowlArt({ state: bowl })}${ui.kind === 'dog' ? ropeArt() : yarnArt()}${R.STAGES.some((_, index) => index <= stage && R.stageItems(index, ui.kind).includes('ball')) ? ballArt({ fresh: fresh.includes('ball') }) : ''}`,
  });

// Сохранённая расстановка показанного питомца на ступени stage (повреждённые точки — исходные места).
const roomSaved = (stage) => Room.arrange(ui.kind, stage, readStored(K.room, Room.parseRoom)[ui.kind]);

// Комната уголка — по сохранённой, на месте (фокус, прокрутка и реакция те же).
function paintCorner() {
  const scene = ui.sheet?.querySelector('.cat-stage-wrap > .cat-scene-art');
  if (scene) Room.paintRoom(scene, roomSaved(ui.sheetStage));
}

// Лакомство дня — в ряду с «Погладить»: действие по состоянию и подсказка под рядом; тексты без имени (не склоняется).
const BOWL_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="10" rx="8.5" ry="2.4"/><path d="M3.5 10.4C4.3 15.6 7.6 18.5 12 18.5s7.7-2.9 8.5-8.1M8 18.2l-.6 1.8h9.2l-.6-1.8"/></g></svg>';

function treatParts(state = ui.treat) {
  if (state === 'fed') {
    return {
      note: snap().save.treat.unsaved.length
        ? 'Сегодня уже угостили, но отметка не сохранилась в этом браузере: после перезагрузки — снова.'
        : 'Сегодня уже угостили. Новое — завтра, после занятия; отметка — в этом браузере.',
      act: '<p class="cat-treat-done" data-cat-treat-done tabindex="-1"><span aria-hidden="true">✓</span> Угостили</p>',
    };
  }
  if (state === 'ready') {
    return {
      note: 'Занятие сегодня есть — можно угостить. Лакомство — одно в день.',
      act: `<button class="${C.btn} cat-feed" type="button" data-cat-feed aria-describedby="cat-treat-note">Покормить</button>`,
    };
  }
  return {
    note: T.wait,
    act: `<p class="cat-treat-wait" data-cat-treat-wait tabindex="-1">${BOWL_ICON}<span><span class="${C.sr}">Лакомство: </span>После занятия</span></p>`,
  };
}

function treatHtml(who) {
  const parts = treatParts();
  return `<div class="cat-treat" data-cat-treat data-state="${ui.treat}">
      <div class="cat-actions">
        <button class="${C.alt} cat-pet" type="button" data-cat-pet>Погладить</button>
        ${who.paw ? `<button class="${C.alt} cat-paw" type="button" data-cat-paw>Дай лапу</button>` : ''}
        <span class="cat-treat-act" data-cat-treat-act>${parts.act}</span>
      </div>
      <p class="cat-treat-note" id="cat-treat-note" data-cat-treat-note>${esc(parts.note)}</p>
    </div>`;
}

// ---------- следующий шаг на сайте ----------
// Одно главное действие от сайта (options.step): до занятия, после него и после лакомства. Переход — options.go
// (иначе обычная ссылка); ничего не сохраняет и знаков не даёт.
const learnNow = () => O.step?.() ?? null;
const learnLabel = (step) => `${esc(step.action)} <span aria-hidden="true">→</span>`;

function learnHtml() {
  const step = learnNow();
  if (!step) return '';
  return `<section class="cat-learn" data-cat-learn-card data-type="${esc(step.type)}" aria-labelledby="cat-learn-heading">
      <h3 class="cat-learn-kind" id="cat-learn-heading">Следующий шаг<span aria-hidden="true"> · </span><span class="${C.sr}">: </span><span data-cat-learn-kind>${esc(step.kind)}</span></h3>
      <p class="cat-learn-title" id="cat-learn-title" data-cat-learn-title>${esc(step.title)}</p>
      <a class="${C.btn} cat-learn-go" href="${esc(step.href)}" data-cat-learn aria-describedby="cat-learn-title">${learnLabel(step)}</a>
    </section>`;
}

// Шаг открытого уголка — заново (своё занятие, другая вкладка, полночь, update() сайта): та же ссылка на месте, фокус и
// прокрутка не теряются. Шаг появился — карточка после лакомства, пропал — карточки нет (фокус с её ссылки — на «Как
// появляются знаки…» под ней); видимое не сдвигается. Пока в поле имени курсор, не обновляется (высота сдвинула бы
// поле) — догонит при уходе из поля.
function syncLearn() {
  if (!ui.sheet?.open) return;
  const field = ui.sheet.querySelector('input[name="cat-name"]');
  if (field && field === document.activeElement) {
    ui.learnLater = true;
    return;
  }
  ui.learnLater = false;
  const step = learnNow();
  const card = ui.sheet.querySelector('[data-cat-learn-card]');
  if (!step !== !card) {
    const had = card?.contains(document.activeElement);
    keepView(card ?? ui.sheet.querySelector('.cat-progress'), () => (card ? card.remove() : ui.sheet.querySelector('[data-cat-treat]').insertAdjacentHTML('afterend', learnHtml())));
    if (had) ui.sheet.querySelector('.cat-rules > summary').focus();
    return;
  }
  if (!step) return;
  const link = card.querySelector('[data-cat-learn]');
  const title = card.querySelector('[data-cat-learn-title]');
  const kind = card.querySelector('[data-cat-learn-kind]');
  card.dataset.type = step.type;
  if (link.getAttribute('href') !== step.href) link.setAttribute('href', step.href);
  if (title.textContent !== step.title) title.textContent = step.title;
  if (kind.textContent !== step.kind) kind.textContent = step.kind;
  if (link.innerHTML !== learnLabel(step)) link.innerHTML = learnLabel(step);
}

// Блок уголка выше видимой части (edge — его верх) появился или пропал: видимое остаётся на месте и там, где браузер сам
// не держит прокрутку (overflow-anchor). Опора — «Совместная практика» под карточкой шага.
function keepView(edge, change) {
  const body = ui.sheet.querySelector('[data-cat-body]');
  const mark = ui.sheet.querySelector('.cat-progress');
  const above = edge.getBoundingClientRect().top < body.getBoundingClientRect().top;
  const top = mark.getBoundingClientRect().top;
  change();
  if (above) body.scrollTop += mark.getBoundingClientRect().top - top;
}

// Переход к шагу: уголок закрывается без возврата фокуса и прокрутки — их ставит сайт.
function goLearn(event, link) {
  ui.lastActivity = now();
  if (!O.go) {
    closeSheet({ restore: false });
    return;
  }
  event.preventDefault();
  closeSheet({ restore: false });
  O.go(link.getAttribute('href'));
}

// ---------- облик ----------

// Выбор облика показанного напарника: три портрета, выбранный — рамкой, фоном и галочкой (не только цветом).
function coatHtml() {
  const acc = snap().pets[ui.kind].worn;
  return `<fieldset class="cat-coat">
      <legend>Облик ${profile().gen}</legend>
      <div class="cat-coat-list">${R.coatsOf(ui.kind)
        .map(
          (item) => `<label class="cat-coat-option">
          <input type="radio" name="cat-coat" value="${item.id}"${item.id === coat() ? ' checked' : ''} />
          <span class="cat-coat-face" aria-hidden="true">${pickerArt(ui.kind, item.id, `coat-${item.id}`, acc)}</span>
          <span class="cat-coat-title">${esc(item.title)}</span>
          <span class="cat-coat-mark" aria-hidden="true">✓</span>
        </label>`,
        )
        .join('')}</div>
      <p class="${C.muted} cat-note" data-cat-coat-note>${esc(coatNote())}</p>
    </fieldset>`;
}

// Облик показанного напарника на всех местах: рисунок заменяется только там, где облик другой (data-coat); кнопки мест
// те же — фокус не теряется. Реакций, приветствия и знаков нет.
function applyCoat() {
  stopScene();
  const want = coat();
  syncHostArts();
  if (ui.face) renderFace();
  const scene = ui.sheet?.open ? ui.sheet.querySelector('.cat-stage-wrap > .cat-scene-art > .cat-art') : null;
  if (scene && scene.dataset.coat !== want) {
    scene.replaceWith(fragment(scenePet(ui.sheetStage, 'scene')));
    paintCorner();
  }
  // Редактор: перенос отменён, черновик тот же.
  const roomPet = ui.room ? ui.sheet.querySelector('.cat-room .cat-scene-art > .cat-art') : null;
  if (roomPet && roomPet.dataset.coat !== want) {
    Room.cancelArrange('look');
    roomPet.replaceWith(fragment(scenePet(ui.sheetStage, 'room')));
    paintDraft();
  }
  // Сцена «Поиграть»: идущий жест (с питомцем или предметом) отменяется, рисунок — в новом облике (области те же).
  const big = ui.play ? ui.sheet.querySelector('.cat-play-pet > .cat-art') : null;
  if (big && big.dataset.coat !== want) {
    release('look');
    big.replaceWith(fragment(managed(art({ id: `${ui.kind}-play`, view: 'full' }))));
  }
  syncPickers();
  paint();
}

// Выбор напарника и облика открытого уголка — по сохранённому: портреты, отмеченный облик и подсказка о сохранении.
function syncPickers() {
  if (!ui.sheet?.open) return;
  for (const kind of R.KINDS) {
    const face = ui.sheet.querySelector(`[data-cat-kind-face="${kind}"]`);
    if (face && face.firstElementChild?.dataset.coat !== ui.look[kind]) face.innerHTML = pickerArt(kind, ui.look[kind], 'pick', face.firstElementChild?.dataset.acc ?? 'scarf');
  }
  for (const input of ui.sheet.querySelectorAll('input[name="cat-coat"]')) input.checked = input.value === coat();
  const note = ui.sheet.querySelector('[data-cat-coat-note]');
  if (note && note.textContent !== coatNote()) note.textContent = coatNote();
}

// Выбрали облик: команда ядра (запись — его операция ключа look), показывается везде; фокус остаётся на выбранном
// переключателе; объявление — по итогу записи.
function chooseCoat(value) {
  const kind = ui.kind;
  if (value === coat()) return;
  const result = ui.core.setAppearance({ coat: value });
  if (!result.ok) return;
  ui.look = lookOf(snap());
  ui.lastActivity = now();
  applyCoat();
  announce(`Облик: ${R.coatTitle(kind, value).toLowerCase()}.${result.save.status === 'failed' ? ' Не сохранился в этом браузере — действует до перезагрузки.' : ''}`);
}

// Надетый аксессуар — и на портретах выбора (напарник и облик показанного животного).
function syncPickerAcc() {
  const acc = snap().pets[ui.kind].worn;
  for (const svg of ui.sheet?.querySelectorAll(`.cat-coat-face .cat-art, [data-cat-kind-face="${ui.kind}"] .cat-art`) ?? []) svg.dataset.acc = acc;
}

// Имя показанного напарника: предложение (пока имя не выбирали), готовые имена страницами, «Другие имена» и поле
// своего имени. Выбранное отмечено галочкой и aria-pressed.
function chipsHtml() {
  const shown = name();
  return R.namePage(ui.kind, ui.namePage)
    .map((item) => `<button class="cat-chip" type="button" data-cat-name-pick="${esc(item)}" aria-pressed="${item === shown ? 'true' : 'false'}">${esc(item)}</button>`)
    .join('');
}

function nameHtml() {
  const who = profile();
  const offer = R.NAME_OFFER[ui.kind];
  return `<fieldset class="cat-name">
      <legend>Имя ${who.gen}</legend>
      <div class="cat-name-offer" data-cat-offer${snap().pets[ui.kind].name.chosen ? ' hidden' : ''}>
        <p>Новое имя? Предлагаем «${esc(offer)}» — или оставим «${esc(who.defaultName)}».</p>
        <div class="cat-name-offer-actions">
          <button class="${C.btn} ${C.small}" type="button" data-cat-name-pick="${esc(offer)}">${esc(offer)}</button>
          <button class="${C.alt} ${C.small}" type="button" data-cat-name-pick="${esc(who.defaultName)}">Оставить «${esc(who.defaultName)}»</button>
        </div>
      </div>
      <div class="cat-name-row">
        <div class="cat-name-list" id="cat-name-list" data-cat-names role="group" aria-label="Готовые имена">${chipsHtml()}</div>
        <button class="cat-chip cat-chip-more" type="button" data-cat-name-more aria-controls="cat-name-list">Другие имена</button>
      </div>
      <label class="cat-field"><span>Своё имя</span><input type="text" name="cat-name" maxlength="${R.NAME_MAX}" autocomplete="off" value="${esc(ui.settings.name)}" placeholder="${esc(who.defaultName)}" /></label>
      <p class="${C.muted} cat-note">До ${R.NAME_MAX} знаков. Имена у кота и собаки свои; знаков имя не даёт.</p>
    </fieldset>`;
}

// «Новое в уголке»: вещи и аксессуары, открытые после увиденной ступени (снимок ядра).
function freshText(fresh) {
  const accessories = snap().progress?.unseen ? snap().progress.freshAccessories : [];
  const names = [...fresh, ...accessories].map((item) => ITEM_NAMES[item] ?? item);
  return names.length ? `Новое в уголке: ${names.join(', ')}.` : '';
}

// Совместная практика: всего знаков, сегодня, шкала и что дальше.
function progressParts() {
  const info = ui.info;
  const next = info.next;
  const span = next ? next.at - info.current.at : 1;
  const done = next ? Math.min(span, Math.max(0, info.marks - info.current.at)) : span;
  const p = snap().progress ?? { today: 0, limit: null };
  return {
    line: `<strong>${R.marksText(info.marks)} практики</strong> · сегодня ${p.today}${p.limit ? ` из ${p.limit}` : ''}`,
    width: `${Math.round((done / span) * 100)}%`,
    next: next
      ? `До ступени «${next.title}» — ещё ${R.marksText(info.toNext)}: ${gift(info.stage + 1).toLowerCase()}.`
      : 'Все ступени открыты. Дальше — просто практика вместе.',
  };
}

// Выбор напарника: два портрета, выбранный отмечен рамкой, галочкой и словом «рядом»; имя у каждого своё.
function kindNames() {
  const pets = snap().pets;
  return { cat: pets.cat.name.display, dog: pets.dog.name.display };
}

function kindHtml() {
  const names = kindNames();
  const pets = snap().pets;
  const worn = { cat: pets.cat.worn, dog: pets.dog.worn };
  return `<fieldset class="cat-kind">
      <legend>Напарник</legend>
      <div class="cat-kind-list">${R.KINDS.map((kind) => {
        const on = kind === ui.kind;
        return `<label class="cat-kind-option">
          <input type="radio" name="cat-kind" value="${kind}"${on ? ' checked' : ''} />
          <span class="cat-kind-face" data-cat-kind-face="${kind}" aria-hidden="true">${pickerArt(kind, ui.look[kind], 'pick', worn[kind])}</span>
          <span class="cat-kind-text"><strong>${R.PROFILES[kind].title}</strong><span class="${C.muted}" data-cat-kind-name="${kind}">${esc(names[kind])}</span></span>
          <span class="cat-kind-mark" aria-hidden="true">✓ рядом</span>
        </label>`;
      }).join('')}</div>
      <p class="${C.muted} cat-note">Знаки и открытые вещи общие: смена напарника их не меняет и новых не даёт.</p>
    </fieldset>`;
}

// ---------- место и вид в уголке ----------

// «Место питомца»: места этого устройства, «Показать целиком» / «Свернуть», «Переместить» и пояснение.
function placeHtml() {
  const L = ui.layout;
  return `<fieldset class="cat-place" data-cat-place-box data-device="${L.device}">
      <legend>Место питомца</legend>
      <div class="cat-place-list">${P.PLACES[L.device]
        .map((item) => `<label class="cat-place-option"><input type="radio" name="cat-place" value="${item.id}"${item.id === L.place ? ' checked' : ''} /><span>${item.title}</span><span class="cat-place-mark" aria-hidden="true">✓</span></label>`)
        .join('')}</div>
      <div class="cat-place-actions">
        <button class="${C.alt}" type="button" data-cat-view-toggle>${viewToggleLabel()}</button>
        <button class="${C.alt}" type="button" data-cat-move${otherPlaces().length ? '' : ' disabled'}>Переместить</button>
      </div>
      <p class="${C.muted} cat-note" data-cat-place-note>${esc(placeNoteText())}</p>
    </fieldset>`;
}

const viewToggleLabel = () => (ui.layout.wantsFull ? 'Свернуть' : 'Показать целиком');

function placeNoteText() {
  const L = ui.layout;
  const call = ui.presence === 'on-call';
  const how = call
    ? 'Место и вид — для режима «Всегда рядом».'
    : !otherPlaces().length
      ? 'Другого места на этом экране сейчас нет.'
      : L.device === 'phone'
        ? '«Переместить» — перетащите пальцем или нажмите место.'
        : 'Питомца можно перетащить мышью.';
  const keep = placeUnsavedNow()
    ? 'Не сохранилось в этом браузере: действует на этой странице до перезагрузки.'
    : offline()
      ? OFFLINE
      : 'У телефона и компьютера место и вид свои; хранятся в этом браузере.';
  return [call ? '' : P.placeNote(L), how, keep].filter(Boolean).join(' ');
}

// «Присутствие»: применяется и хранится сразу.
function presenceHtml() {
  return `<fieldset class="cat-place cat-presence">
      <legend>Присутствие</legend>
      <div class="cat-place-list">${P.PRESENCES.map((item) => `<label class="cat-place-option"><input type="radio" name="cat-presence" value="${item.id}"${item.id === ui.presence ? ' checked' : ''} /><span><strong>${item.title}</strong><span class="${C.muted}">${item.note}</span></span><span class="cat-place-mark" aria-hidden="true">✓</span></label>`).join('')}</div>
      <p class="${C.muted} cat-note" data-cat-presence-note>${presenceNote()}</p>
    </fieldset>`;
}

const presenceNote = () =>
  ui.presenceUnsaved
    ? 'Не сохранилось в этом браузере: действует на этой странице до перезагрузки.'
    : `${ui.presence === 'on-call' ? `Лапка «${CALL}»${T.call}. ` : ''}${offline() ? OFFLINE : 'Хранится в этом браузере; общее для кота и собаки.'}`;

// Открытый уголок — на месте, без пересоздания.
function syncPresenceBox() {
  for (const input of ui.sheet?.querySelectorAll('input[name="cat-presence"]') ?? []) input.checked = input.value === ui.presence;
  const note = ui.sheet?.querySelector('[data-cat-presence-note]');
  if (note && note.textContent !== presenceNote()) note.textContent = presenceNote();
  syncPlaceBox();
}

// Сменилось (здесь или в другой вкладке): места — тихо, сценка отменяется; открытый диалог, источник и черновик — как
// были, закрытый по зову — без рисунка.
function applyPresence() {
  stopScene();
  cancelMove('presence');
  const focused = focusedControl();
  renderAll();
  if (around()) scheduleIdle();
  else {
    calmDown();
    clearSheet();
  }
  syncPresenceBox();
  keepFocus(focused);
}

function choosePresence(mode) {
  if (P.presenceOf(mode) !== mode || mode === ui.presence) return;
  const saved = storePresence(mode);
  ui.lastActivity = now();
  applyPresence();
  announce(`${P.PRESENCES.find((item) => item.id === mode).title}.${saved ? '' : ' Не сохранилось в этом браузере — действует до перезагрузки.'}`);
}

// Вид рядом со страницей — в «Настройках»: «Автоматически» возвращает прежнее поведение.
function viewHtml() {
  const L = ui.layout;
  return `<fieldset class="cat-motion cat-view" data-cat-view-box>
      <legend>Вид рядом со страницей</legend>
      ${P.VIEWS.map((item) => `<label><input type="radio" name="cat-view" value="${item.id}"${L.want === item.id ? ' checked' : ''} /> ${item.title}</label>`).join('')}
      <p class="${C.muted} cat-note">${L.device === 'phone' ? 'Для телефона. «Автоматически» — портрет, как раньше.' : 'Для компьютера. «Автоматически» — целиком в боковой панели на высоком экране и внизу экрана, у логотипа — портрет.'}</p>
    </fieldset>`;
}

// Открытый уголок — по показанному месту и виду: переключатели на месте (фокус не теряется). Окно перешло границу
// телефона — блоки заново, фокус — на выбранное место или вид.
function syncPlaceBox() {
  const box = ui.sheet?.open ? ui.sheet.querySelector('[data-cat-place-box]') : null;
  if (!box) return;
  const L = ui.layout;
  if (box.dataset.device !== L.device) {
    const focus = document.activeElement?.name;
    box.outerHTML = placeHtml();
    ui.sheet.querySelector('[data-cat-view-box]').outerHTML = viewHtml();
    if (focus === 'cat-place' || focus === 'cat-view') ui.sheet.querySelector(`input[name="${focus}"]:checked`)?.focus({ preventScroll: true });
    return;
  }
  for (const input of ui.sheet.querySelectorAll('input[name="cat-place"]')) input.checked = input.value === L.place;
  for (const input of ui.sheet.querySelectorAll('input[name="cat-view"]')) input.checked = input.value === L.want;
  const toggle = box.querySelector('[data-cat-view-toggle]');
  if (toggle.textContent !== viewToggleLabel()) toggle.textContent = viewToggleLabel();
  box.querySelector('[data-cat-move]').disabled = !otherPlaces().length;
  const note = box.querySelector('[data-cat-place-note]');
  const text = placeNoteText();
  if (note.textContent !== text) note.textContent = text;
}

function bodyHtml(fresh) {
  const info = ui.info;
  const progress = progressParts();
  const fresher = freshText(fresh);
  const s = ui.settings;
  const who = profile();
  return `<div class="cat-stage-wrap">
      ${sceneHtml(info.stage, fresh)}
      <p class="cat-scene-say" data-cat-phrase hidden><span></span></p>
      <div class="cat-stage-acts">
        <button class="${C.btn} cat-play-open" type="button" data-cat-play>${PAW_ICON}Поиграть</button>
        <button class="${C.btn} cat-play-open cat-room-open" type="button" data-cat-room>${ROOM_ICON}<span>Обустроить <span class="cat-room-word">уголок</span></span></button>
      </div>
      <p class="cat-room-done" data-cat-room-done hidden></p>
    </div>
    <p class="cat-fresh" data-cat-fresh${fresher ? '' : ' hidden'}>${esc(fresher)}</p>
    ${treatHtml(who)}
    ${learnHtml()}
    <section class="cat-progress" aria-labelledby="cat-progress-title">
      <h3 id="cat-progress-title">Совместная практика</h3>
      <p class="cat-progress-line" data-cat-line>${progress.line}</p>
      <div class="cat-meter" aria-hidden="true"${info.next ? '' : ' hidden'}><span style="width:${progress.width}"></span></div>
      <p class="cat-next" data-cat-next>${esc(progress.next)}</p>
      <details class="cat-rules">
        <summary>Как появляются знаки и лакомство</summary>
        ${T.rules.map((text) => `<p>${esc(text)}</p>`).join('')}
        <ol class="cat-steps" data-cat-steps>${stageListHtml(info)}</ol>
      </details>
    </section>
    ${presenceHtml()}
    ${placeHtml()}
    <div class="cat-who">
      ${kindHtml()}
      ${coatHtml()}
      ${nameHtml()}
    </div>
    <fieldset class="cat-acc">
      <legend>Аксессуар</legend>
      <div class="cat-acc-list">${accessoryHtml()}</div>
    </fieldset>
    <details class="cat-settings">
      <summary>Настройки ${who.gen}</summary>
      <fieldset class="cat-motion">
        <legend>Движение</legend>
        ${R.MOTIONS.map(([id, label]) => `<label><input type="radio" name="cat-motion" value="${id}"${s.motion === id ? ' checked' : ''} /> ${label}</label>`).join('')}
        <p class="${C.muted} cat-note" data-cat-reduced${ui.reduced?.matches ? '' : ' hidden'}>В системе включено «уменьшить движение» — ${who.title.toLowerCase()} без анимации, состояния видны позами.</p>
      </fieldset>
      ${viewHtml()}
      <label class="cat-check"><input type="checkbox" name="cat-phrases"${s.phrases ? ' checked' : ''} /> Короткие реплики</label>
      <p class="${C.muted} cat-note" data-cat-store>${esc(storeNote())}</p>
      <button class="${C.alt} cat-hide" type="button" data-cat-hide>Скрыть ${who.acc}</button>
    </details>`;
}

// Целиком — только при открытии, пока в уголке нечего терять.
function renderSheet(fresh = []) {
  if (!ui.sheet) return;
  ui.sheet.querySelector('#cat-sheet-title').textContent = name();
  ui.sheet.querySelector('[data-cat-sub]').textContent = `Ступень «${ui.info.current.title}»`;
  ui.namePage = R.namePageOf(ui.kind, name());
  ui.treatLater = false;
  ui.sheet.querySelector('[data-cat-body]').innerHTML = bodyHtml(fresh);
  ui.sheetStage = ui.info.stage;
  paintCorner();
  setScenePhrase(ui.scenePhrase);
  paint();
}

// Вещи, которых ещё не видели (подсветка в сцене), — от увиденной ступени до текущей (снимок ядра).
const unseenItems = () => (snap().progress?.unseen ? snap().progress.fresh : []);

// Уголок открыт и всё видно — новая ступень увидена (правило и неявная запись — ядро): точка на питомце гаснет, праздника
// нет.
function markSeen() {
  if (ui.core.markSeen().changed) showProgress();
}

// Открытый уголок после изменения знаков или ступени: адресно — знаки, «сегодня», шкала, что дальше; если ступень не та,
// что показана (ui.sheetStage), — подзаголовок, сцена, «Новое в уголке», ступени и аксессуары. Сравнение — с показанной:
// её может поднять seenStage из другой вкладки раньше, чем придут знаки. Поле имени, фокус, раскрытые блоки, прокрутка,
// реплика и текущая реакция не трогаются.
function syncSheet() {
  if (!ui.sheet?.open) return;
  syncTreat();
  syncLearn();
  const progress = progressParts();
  ui.sheet.querySelector('[data-cat-line]').innerHTML = progress.line;
  const meter = ui.sheet.querySelector('.cat-meter');
  meter.hidden = !ui.info.next;
  meter.firstElementChild.style.width = progress.width;
  ui.sheet.querySelector('[data-cat-next]').textContent = progress.next;
  if (ui.info.stage === ui.sheetStage) return;
  const fresh = unseenItems();
  const note = ui.sheet.querySelector('[data-cat-fresh]');
  note.textContent = freshText(fresh);
  note.hidden = !note.textContent;
  ui.sheet.querySelector('[data-cat-sub]').textContent = `Ступень «${ui.info.current.title}»`;
  ui.sheet.querySelector('.cat-stage-wrap > .cat-scene-art').outerHTML = sceneHtml(ui.info.stage, fresh);
  ui.sheet.querySelector('[data-cat-steps]').innerHTML = stageListHtml(ui.info);
  ui.sheetStage = ui.info.stage;
  paintCorner();
  if (ui.room) restageRoom();
  syncAccessories();
  syncPickerAcc();
  // В «Поиграть» и редакторе уголок скрыт — новое увидят при возврате.
  if (!ui.play && !ui.room) markSeen();
  paint();
}

// Карточка лакомства и миска открытого уголка — по состоянию дня. Пока в поле имени курсор, карточку не перерисовываем
// (её высота сдвинула бы поле) — догонит при уходе из поля. Фокус с исчезнувшего действия — на новое.
function syncTreat({ focus = false } = {}) {
  if (!ui.sheet?.open) return;
  // В редакторе миска видна и до занятия.
  for (const bowl of ui.sheet.querySelectorAll('[data-cat-bowl]')) {
    const want = ui.treat === 'waiting' && bowl.closest('.cat-room') ? 'ready' : ui.treat;
    if (bowl.dataset.state !== want) bowl.dataset.state = want;
  }
  const card = ui.sheet.querySelector('[data-cat-treat]');
  if (!card) return;
  const note = card.querySelector('[data-cat-treat-note]');
  if (card.dataset.state === ui.treat) {
    // Тот же день и состояние; подсказка могла смениться (отметка не записалась).
    if (note.textContent !== treatParts().note) note.textContent = treatParts().note;
    return;
  }
  const field = ui.sheet.querySelector('input[name="cat-name"]');
  if (!focus && field && field === document.activeElement) {
    ui.treatLater = true;
    return;
  }
  ui.treatLater = false;
  const act = card.querySelector('[data-cat-treat-act]');
  const had = act.contains(document.activeElement);
  const parts = treatParts();
  card.dataset.state = ui.treat;
  note.textContent = parts.note;
  act.innerHTML = parts.act;
  if (focus || had) act.firstElementChild?.focus({ preventScroll: true });
}

// «Покормить»: решение и запись — ядро (день заново, отметка до реакции — второго лакомства нет; объявление — его эффект
// по итогу записи). Отказ (сегодня ещё нет занятия, уже угостили — другая вкладка, полночь) — карточка по свежему счёту.
function feed() {
  const result = ui.core.feed(sight());
  if (!result.ok) {
    refreshInfo();
    syncTreat({ focus: true });
    paint();
    return;
  }
  showProgress();
  syncTreat({ focus: true });
  ui.lastActivity = now();
  ui.resting = false;
  if (result.reaction) play(R.request(ui.director, result.reaction.type, { now: now(), key: result.reaction.key, context: 'calm', extra: result.reaction.extra }));
  paint();
}

// Готовые имена и предложение открытого уголка — по сохранённому имени: отметка — на месте, кнопки страницы — заново,
// только если сменили страницу (chips). Предложение не меняется, пока в поле имени курсор, — кроме явного выбора (offer).
function syncNamePick({ chips = false, offer = false } = {}) {
  const list = ui.sheet?.querySelector('[data-cat-names]');
  if (!list) return;
  if (chips) list.innerHTML = chipsHtml();
  else for (const chip of list.querySelectorAll('[data-cat-name-pick]')) chip.setAttribute('aria-pressed', String(chip.dataset.catNamePick === name()));
  const box = ui.sheet.querySelector('[data-cat-offer]');
  const field = ui.sheet.querySelector('input[name="cat-name"]');
  if (!box || (!offer && field === document.activeElement)) return;
  const inside = box.contains(document.activeElement);
  box.hidden = snap().pets[ui.kind].name.chosen;
  if (inside && box.hidden) (list.querySelector('[aria-pressed="true"]') ?? field)?.focus({ preventScroll: true });
}

// Готовое имя (или «Оставить …»): команда ядра (запись сразу); предложение исчезает, подборка — на странице выбранного,
// фокус — на его кнопке. Короткий отклик, знаков нет.
function pickName(value) {
  const chosen = R.cleanName(value);
  if (!chosen) return;
  ui.core.setName(chosen);
  settingsChanged();
  const page = R.namePageOf(ui.kind, chosen);
  const turn = page !== ui.namePage;
  ui.namePage = page;
  syncNameField({ force: true });
  syncNamePick({ chips: turn, offer: true });
  showName();
  const chip = [...(ui.sheet?.querySelectorAll('[data-cat-names] [data-cat-name-pick]') ?? [])].find((item) => item.dataset.catNamePick === chosen);
  if (chip && document.activeElement !== chip) chip.focus({ preventScroll: true });
  announce(`Имя: ${name()}.`);
  play(R.request(ui.director, 'named', { now: now(), context: contextNow() }));
}

// «Другие имена»: следующая страница подборки по кругу; фокус остаётся на этой кнопке.
function moreNames() {
  ui.namePage = (ui.namePage + 1) % R.namePageCount(ui.kind);
  syncNamePick({ chips: true });
  announce(`Другие имена: ${R.namePage(ui.kind, ui.namePage).join(', ')}.`);
}

// Поле имени — по сохранённому имени, если в нём не стоит курсор: поле, которое редактируют, входящие изменения не
// трогают; вышли без ввода — в нём сохранённое имя (onSheetFocusOut).
function syncNameField({ force = false } = {}) {
  const field = ui.sheet?.querySelector('input[name="cat-name"]');
  if (!field || (!force && field === document.activeElement)) return;
  if (R.cleanName(field.value) !== ui.settings.name) field.value = ui.settings.name;
}

// Настройки открытого уголка — как сохранены (другая вкладка): переключатели на месте, без записи (событий change нет).
function syncControls() {
  if (!ui.sheet?.open) return;
  for (const input of ui.sheet.querySelectorAll('input[name="cat-motion"]')) input.checked = input.value === ui.settings.motion;
  const phrases = ui.sheet.querySelector('input[name="cat-phrases"]');
  if (phrases) phrases.checked = ui.settings.phrases;
  syncNameField();
  syncNamePick();
  syncAccessories();
  syncKindNames();
}

// Имена в выборе напарника (имя другого животного могли поменять в другой вкладке).
function syncKindNames() {
  const names = kindNames();
  for (const kind of R.KINDS) {
    const label = ui.sheet?.querySelector(`[data-cat-kind-name="${kind}"]`);
    if (label && label.textContent !== names[kind]) label.textContent = names[kind];
  }
}

// source (до закрытия): pet — уголок и markSeen; call — сразу «Поиграть», вид до showModal, без markSeen и реакций.
function openSheet(opener, source = 'pet') {
  if (!ui.sheet || ui.sheet.open || ui.settings.hidden) return;
  stopScene();
  cancelMove('sheet');
  ui.opener = opener;
  ui.source = source;
  const call = source === 'call';
  // Облик — по снимку ядра (изменение другой вкладки ядро уже поглотило; подсказка о сохранении верна).
  const was = coat();
  ui.look = lookOf(snap());
  if (coat() !== was) applyCoat();
  refreshInfo();
  ui.scenePhrase = ui.settings.phrases ? R.pickPhrase(ui.resting ? 'rest' : 'scene', { last: ui.lastPhrase, stage: ui.info.stage, kind: ui.kind }) : '';
  ui.lastPhrase = ui.scenePhrase || ui.lastPhrase;
  renderSheet(unseenItems());
  if (!call) markSeen();
  ui.sheetY = window.scrollY;
  document.documentElement.classList.add('cat-open');
  for (const button of openers()) button.setAttribute('aria-expanded', 'true');
  ui.sheetOpen = true;
  if (call) {
    enterPlay();
    ui.playY = 0;
  }
  ui.sheet.showModal();
  // Прокрутку закрытого уголка браузер помнит — новое открытие сверху, со сценой.
  ui.sheet.querySelector('[data-cat-body]').scrollTop = 0;
  ui.sheet.querySelector(call ? '[data-cat-play-close]' : '[data-cat-close]').focus();
  // Открыли уголок — питомец проснулся (только поза).
  if (ui.resting) {
    ui.resting = false;
    paint();
  }
  ui.lastActivity = now();
  // По зову движения покоя — только пока вызван.
  if (ui.presence === 'on-call') scheduleIdle();
  else scheduleRest();
  // Повторный визит: питомец замечает гостя — ухо, взгляд или наклон головы.
  if (!call) later('open-micro', 600, () => micro(profile().open[Math.random() < 0.5 ? 0 : 1]));
}

// Закрытие — один раз: событие close после закрытия кодом (переход, скрытие) уже ничего не делает и не возвращает
// фокус и прокрутку. Esc закрывает сам диалог — тогда close приходит первым и возвращает их.
function closeSheet({ restore = true } = {}) {
  if (!ui.sheet || !ui.sheetOpen) return;
  leavePlay({ restore: false });
  leaveRoom({ restore: false });
  ui.sheetOpen = false;
  ui.source = '';
  if (ui.sheet.open) ui.sheet.close();
  document.documentElement.classList.remove('cat-open');
  for (const button of openers()) button.setAttribute('aria-expanded', 'false');
  // По зову питомец ушёл: ничего не доигрывает и не ждёт вызова; рисунка нет.
  if (!around()) {
    calmDown();
    clearSheet();
  }
  if (!restore) return;
  if (window.scrollY !== ui.sheetY) window.scrollTo(0, ui.sheetY);
  // Место могло смениться, пока уголок был открыт, — тогда фокус на питомце на новом месте.
  const target = ui.opener?.isConnected && shown(ui.opener) ? ui.opener : fallbackFocus();
  target?.focus({ preventScroll: true });
}

// ---------- сцена «Поиграть» ----------
// Вид того же диалога (одна ловушка фокуса): уголок скрыт, его прокрутка и поля целы. Выход — playBack: из уголка — в
// уголок, вызванная — к странице. Миска не кормит. Ничего не хранится.

const PLAY_HINT = 'Проведи по питомцу, чтобы погладить';

// Вызванная — ещё «Уголок».
function playHtml() {
  return `<div class="cat-play-head">
      <h2 id="cat-play-title"><span class="${C.sr}">Поиграть: </span><span data-cat-play-name>${esc(name())}</span></h2>
      ${ui.source === 'call' ? `<button class="${C.close} cat-play-corner" type="button" data-cat-play-corner aria-label="Уголок ${profile().gen}">Уголок</button>` : ''}
      <button class="${C.close}" type="button" data-cat-play-close aria-label="Закрыть игру">Закрыть</button>
    </div>
    <div class="cat-play-note">
      <p class="cat-play-hint" data-cat-play-hint>${PLAY_HINT}</p>
      <span class="cat-play-fit" data-cat-play-fit aria-hidden="true">${fitHtml()}</span>
    </div>
    <div class="cat-play-stage" data-play-stage>
      <div class="cat-play-pet" data-play-pet data-kind="${ui.kind}">${managed(art({ id: `${ui.kind}-play`, view: 'full' }))}${hitsHtml(ui.kind)}</div>
      <span class="cat-play-floor" data-play-floor aria-hidden="true"></span>
      <p class="cat-scene-say cat-play-say" data-cat-phrase${ui.scenePhrase && ui.settings.phrases ? '' : ' hidden'}><span>${esc(ui.scenePhrase)}</span></p>
      <span class="cat-play-touch" data-play-touch aria-hidden="true"></span>
      <div class="cat-play-toys" aria-hidden="true">
        <span class="cat-play-toy" data-play-toy="bowl">${bowlToySvg(ui.treat)}</span>
        <span class="cat-play-toy" data-play-toy="ball">${ballToySvg()}</span>
      </div>
    </div>
    <div class="cat-play-actions">
      <button class="${C.alt}" type="button" data-cat-play-pet>Погладить</button>
      <button class="${C.alt}" type="button" data-cat-play-paw>${profile().paw ? 'Дай лапу' : 'Коснуться лапы'}</button>
      <button class="${C.alt}" type="button" data-cat-play-bowl>${bowlLabel()}</button>
      <button class="${C.alt}" type="button" data-cat-play-ball>Катнуть мячик</button>
    </div>`;
}

const bowlLabel = () => (bowlHome() ? 'Подвинуть миску' : 'Вернуть миску');

// Сцена заново (вход, другой напарник из другой вкладки): жест отменяется, фокус — на ту же кнопку, если она есть.
function renderPlay() {
  const view = ui.sheet.querySelector('[data-cat-play-view]');
  const focus = view.contains(document.activeElement) ? [...document.activeElement.attributes].find((item) => item.name.startsWith('data-cat-play'))?.name : '';
  cancelStroke('render');
  unmountToys('render');
  later('play-status', null);
  later('play-nudge', null);
  view.innerHTML = playHtml();
  mountToys(view);
  syncBowl();
  if (focus) (view.querySelector(`[${focus}]`) ?? view.querySelector('[data-cat-play-pet]')).focus({ preventScroll: true });
}

// Вызов входит сюда до showModal.
function enterPlay() {
  if (!ui.sheetOpen || ui.play || ui.settings.hidden) return;
  stopScene();
  ui.playY = ui.sheet.querySelector('[data-cat-body]').scrollTop;
  ui.play = true;
  resetToys();
  // Сначала вид сцены, затем разметка: предметы встают на пол по настоящим рамкам сразу (pet-toys.mjs).
  ui.sheet.dataset.view = 'play';
  renderPlay();
  ui.sheet.setAttribute('aria-labelledby', 'cat-play-title');
  ui.sheet.querySelector('[data-cat-play-close]').focus();
  ui.resting = false;
  ui.lastActivity = now();
  paint();
}

// Назад в уголок: жест и подсказка снимаются, сцена очищается (рисунка и обработчиков не остаётся). restore — фокус на
// «Поиграть» и прежняя прокрутка уголка; без него — уголок закрывают целиком.
function leavePlay({ restore = true } = {}) {
  if (!ui.play) return;
  cancelStroke('close');
  unmountToys('close');
  later('play-status', null);
  later('play-nudge', null);
  ui.play = false;
  delete ui.sheet.dataset.view;
  ui.sheet.setAttribute('aria-labelledby', 'cat-sheet-title');
  ui.sheet.querySelector('[data-cat-play-view]').innerHTML = '';
  paint();
  if (!restore) return;
  ui.sheet.querySelector('[data-cat-body]').scrollTop = ui.playY;
  ui.sheet.querySelector('[data-cat-play]')?.focus({ preventScroll: true });
  markSeen();
}

// «Закрыть», Esc, затемнение: вызванная — к странице, из уголка — в уголок.
const playBack = () => (ui.source === 'call' ? closeSheet() : leavePlay());

// Итоги действия с именем — один список для показа и для места под ним (fitHtml). Предмет сдвинулся, а питомец занят
// более важным откликом, — итог про предмет (bowlMoved, ballMoved).
function playResults() {
  const who = name();
  const dog = ui.kind === 'dog';
  return {
    enough: `${who}: пока хватит.`,
    paw: dog ? `${who} даёт лапу.` : `${who} касается твоей руки лапой.`,
    quiet: `${who} жмурится.`,
    pet: dog ? `${who} виляет хвостом.` : `${who} мурлычет.`,
    sniff: `${who} принюхивается к миске.`,
    look: `${who} смотрит на миску.`,
    ball: `${who} следит за мячиком.`,
    bowlMoved: 'Миска на новом месте.',
    ballMoved: 'Мячик прокатился.',
  };
}

// Невидимые образцы подсказки и всех итогов с этим именем — в той же ячейке, что подсказка: место по самому длинному, и
// итог не сдвигает питомца под пальцем.
function fitHtml() {
  return [PLAY_HINT, ...Object.values(playResults())].map((text) => `<span>${esc(text)}</span>`).join('');
}

function playAct(type, { tell = true } = {}) {
  const mood = interact(type, type === 'paw' ? 'calmPaw' : 'calmPet', { explicit: true });
  if (!mood) return '';
  return showResult(mood === 'enough' ? 'enough' : type === 'paw' ? 'paw' : mood === 'quiet' ? 'quiet' : 'pet', { tell });
}

// Итог действия — коротко текстом вместо подсказки (видно и без реплик и анимации) и одним объявлением.
function showResult(key, { tell = true } = {}) {
  const text = playResults()[key];
  ui.playOutcome = key;
  const hint = ui.sheet?.querySelector('[data-cat-play-hint]');
  if (hint) {
    later('play-nudge', null);
    delete hint.dataset.nudge;
    hint.textContent = text;
    hint.dataset.result = '';
    later('play-status', Math.max(900, (playing() ? ui.director.current.until : 0) - now()), resetHint);
  }
  if (tell) announce(text);
  return text;
}

// Миска или мячик на новом месте (pet-toys.mjs): питомец откликается, если не занят более важным (поглаживание, лапа);
// иначе итог про предмет. Лимит — как у поглаживания, свой счёт: после трёх реакций в минуту питомец только смотрит.
function onToy({ toy, closer, toward }) {
  const at = now();
  const full = R.petMood(ui.toyTimes, at) === 'pet';
  ui.lastActivity = at;
  const type = full && toy === 'ball' ? 'ball' : full && closer ? 'sniff' : 'watch';
  const result = R.request(ui.director, type, { now: at, context: 'calm', extra: { toward }, explicit: true });
  if (result.action === 'play') {
    ui.toyTimes = [...ui.toyTimes.filter((time) => at - time < 60_000), at];
    play(result);
  }
  syncBowl();
  showResult(result.action !== 'play' ? `${toy}Moved` : toy === 'ball' ? 'ball' : type === 'sniff' ? 'sniff' : 'look');
}

// «Подвинуть миску» / «Вернуть миску» — по месту миски (фокус остаётся на кнопке).
function syncBowl() {
  const button = ui.sheet?.querySelector('[data-cat-play-bowl]');
  if (button && button.textContent !== bowlLabel()) button.textContent = bowlLabel();
}

// Пока гладят, итог держится (подсказку вернёт onStrokeEnd).
function resetHint() {
  const hint = ui.sheet?.querySelector('[data-cat-play-hint]');
  if (!hint || ui.strokeHeld) return;
  hint.textContent = PLAY_HINT;
  delete hint.dataset.result;
  delete hint.dataset.nudge;
}

// Поглаживание жестом (pet-play.mjs): объявляется только новый итог, а не каждый порог; после первого отклика питомец
// доволен до конца жеста.
function onStroke({ first }) {
  if (first) ui.strokeTold = '';
  const text = playAct('pet', { tell: false });
  if (!text) return;
  ui.strokeHeld = true;
  if (text !== ui.strokeTold) announce(text);
  ui.strokeTold = text;
}

// Жест кончился: питомец спокоен, когда доиграет отклик (или сразу), подсказка возвращается тогда же.
function onStrokeEnd() {
  if (!ui.strokeHeld) return;
  ui.strokeHeld = false;
  paint();
  if (playing()) later('play-status', ui.director.current.until - now(), resetHint);
  else resetHint();
}

// Нажатие на питомца без движения — не поглаживание: подсказка коротко выделяется.
function nudge() {
  const hint = ui.sheet?.querySelector('[data-cat-play-hint]');
  if (!hint || hint.dataset.result !== undefined) return;
  hint.dataset.nudge = '';
  later('play-nudge', 900, () => delete hint.dataset.nudge);
}

// Видимая кнопка: у скрытых (display: none) нет коробки.
const shown = (element) => Boolean(element?.getClientRects().length);

// Спрятан — видимая «Показать …» (у логотипа, лапка в шапке телефона), иначе куда скажет сайт (options.home).
function fallbackFocus() {
  if (ui.shownHidden) return [ui.side?.querySelector('[data-cat-return]'), ui.restore?.querySelector('button')].find(shown) ?? O.home?.() ?? null;
  return openers().find(shown) ?? null;
}

// Кнопка питомца с фокусом: место, портрет, «Показать …» (после перерисовки её может не стать).
function focusedControl() {
  const element = document.activeElement;
  return element && [ui.dock, ui.side, ui.face, ui.fold, ui.float, ui.bar, ui.restore].some((box) => box?.contains(element)) ? element : null;
}

// Кнопка с фокусом исчезла — фокус на ту, что встала на её место; внутри открытого диалога сайта (страница под ним
// недоступна) — куда скажет сайт (options.home(panel)). Фокус в других местах не трогается.
function keepFocus(element) {
  if (!element || (element.isConnected && shown(element))) return;
  const panel = element.isConnected ? element.closest('dialog[open]') : null;
  (panel ? O.home?.(panel) : fallbackFocus())?.focus({ preventScroll: true });
}

// Поглаживание и «Дай лапу» (собака) — один лимит частоты: три полные реакции в минуту, затем «хватит пока», дальше тихо.
// explicit — действие в сцене «Поиграть»: отклик и в тишине; пока идёт не менее важная реакция, режиссёр его отбрасывает —
// тогда оно и в лимит не идёт. Возвращает настроение сыгранного отклика или ''.
function interact(type, quietType, { explicit = false } = {}) {
  const at = now();
  const mood = R.petMood(ui.petTimes, at);
  ui.lastActivity = at;
  const result = R.request(ui.director, mood === 'quiet' ? quietType : type, { now: at, context: 'calm', extra: mood === 'enough' ? { phrases: 'petEnough' } : {}, explicit });
  if (!explicit || result.action === 'play') ui.petTimes = [...ui.petTimes.filter((time) => at - time < 60_000), at];
  if (result.action !== 'play') return '';
  play(result);
  return mood;
}

const pet = () => interact('pet', 'calmPet');
const paw = () => profile().paw && interact('paw', 'calmPaw');

// ---------- «Обустроить уголок» ----------
// Третий вид диалога. Черновик — из сохранённой расстановки (идущий перенос — ui.room.live); «Сохранить» пишет ключ room
// по свежему значению, остальное — без записи.

const ROOM_OTHER = 'В другой вкладке сохранена новая расстановка. Здесь останутся твои изменения';
const ROOM_FAILED = 'Не удалось сохранить расстановку. Попробуй ещё раз';
// Направление: стрелка, кнопка, итог шага, упор.
const ROOM_DIRS = { left: ['←', 'Влево', 'левее', 'влево'], right: ['→', 'Вправо', 'правее', 'вправо'], up: ['↑', 'Выше', 'выше', 'выше'], down: ['↓', 'Ниже', 'ниже', 'ниже'] };
const ROOM_KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

const roomTitle = (id) => Room.itemTitle(id, ui.sheetStage);
// Черновик как раскладка (live — с идущим переносом).
const roomLayout = (live = true) => ({ kind: ui.kind, stage: ui.sheetStage, pos: live && ui.room.live ? { ...ui.room.pos, [ui.room.live.id]: ui.room.live.p } : ui.room.pos });

function roomHtml() {
  const ids = Object.keys(ui.room.pos);
  return `<div class="cat-room-head">
      <h2 id="cat-room-title">Обустроить уголок</h2>
      <p class="cat-room-hint">Перетаскивай вещи или выбери предмет и передвинь кнопками</p>
    </div>
    <div class="cat-room-stage" data-room-stage>
      ${sceneHtml(ui.sheetStage, [], { id: 'room', bowl: ui.treat === 'waiting' ? 'ready' : ui.treat })}
      ${ids.map((id) => `<span class="cat-room-hit" data-room-hit="${id}" aria-hidden="true"></span>`).join('')}
    </div>
    <div class="cat-room-picks" role="group" aria-label="Предмет" data-room-keys>${ids.map((id) => `<button class="cat-chip" type="button" data-room-pick="${id}" aria-pressed="false">${esc(roomTitle(id))}</button>`).join('')}</div>
    <div class="cat-room-move" data-room-keys>
      <p class="cat-room-chosen" id="cat-room-chosen" data-room-chosen></p>
      <div class="cat-room-pad" role="group" aria-labelledby="cat-room-chosen">${Object.entries(ROOM_DIRS)
        .map(([dir, [arrow, label]]) => `<button class="${C.alt}" type="button" data-room-move="${dir}"><span aria-hidden="true">${arrow}</span> ${label}</button>`)
        .join('')}</div>
    </div>
    <div class="cat-room-more">
      <p class="${C.muted} cat-note cat-room-keys">Стрелки клавиатуры двигают выбранный предмет, когда фокус на этих кнопках.</p>
      <button class="${C.link} cat-room-reset" type="button" data-room-reset>Вернуть обычную расстановку</button>
      <p class="${C.muted} cat-note">${offline() ? OFFLINE : 'Расстановка сохраняется в этом браузере.'}<span data-room-bowl> Миска появится в уголке после занятия — на этом месте.</span></p>
    </div>
    <div class="cat-room-actions">
      <p class="cat-room-other" data-room-other hidden>${ROOM_OTHER}</p>
      <p class="cat-room-error" data-room-error hidden>${ROOM_FAILED}</p>
      <p class="cat-room-state" data-room-state></p>
      <button class="${C.alt}" type="button" data-room-cancel>Отмена</button>
      <button class="${C.btn}" type="button" data-room-save>Сохранить</button>
    </div>`;
}

// Черновик на рисунке и в кнопках: места, выбор, доступные направления, что не сохранено, другая вкладка, ошибка.
function paintDraft() {
  const view = ui.room ? ui.sheet.querySelector('[data-cat-room-view]') : null;
  if (!view?.firstElementChild) return;
  const layout = roomLayout();
  Room.paintRoom(view.querySelector('.cat-scene-art'), layout);
  view.querySelector('[data-room-stage]').toggleAttribute('data-moving', Boolean(ui.room.live));
  for (const hit of view.querySelectorAll('[data-room-hit]')) {
    hit.style.cssText = Room.hitStyle(layout, hit.dataset.roomHit);
    hit.toggleAttribute('data-on', hit.dataset.roomHit === ui.room.pick);
  }
  for (const button of view.querySelectorAll('[data-room-pick]')) button.setAttribute('aria-pressed', String(button.dataset.roomPick === ui.room.pick));
  view.querySelector('[data-room-chosen]').textContent = `Передвинуть: ${roomTitle(ui.room.pick).toLowerCase()}`;
  for (const button of view.querySelectorAll('[data-room-move]')) button.setAttribute('aria-disabled', String(!Room.nudge(roomLayout(false), ui.room.pick, button.dataset.roomMove)));
  const changed = Object.keys(ui.room.pos).filter((id) => !Room.samePlaces({ [id]: ui.room.pos[id] }, { [id]: ui.room.saved[id] }));
  view.querySelector('[data-room-state]').textContent = changed.length ? `Не сохранено: ${changed.map((id) => roomTitle(id).toLowerCase()).join(', ')}` : 'Изменений нет';
  view.querySelector('[data-room-other]').hidden = !ui.room.other;
  view.querySelector('[data-room-error]').hidden = !ui.room.failed;
  view.querySelector('[data-room-bowl]').hidden = ui.treat !== 'waiting';
}

// Редактор заново (вход, новая ступень): фокус — на ту же кнопку.
function renderRoom() {
  const view = ui.sheet.querySelector('[data-cat-room-view]');
  const had = view.contains(document.activeElement) ? [...document.activeElement.attributes].find((item) => item.name.startsWith('data-room-')) : null;
  view.innerHTML = roomHtml();
  paintDraft();
  paint();
  if (had) (view.querySelector(`[${had.name}="${had.value}"]`) ?? view.querySelector(`[data-room-pick="${ui.room.pick}"]`))?.focus({ preventScroll: true });
}

function enterRoom() {
  if (!ui.sheet?.open || ui.play || ui.room || ui.settings.hidden) return;
  stopScene();
  ui.roomY = ui.sheet.querySelector('[data-cat-body]').scrollTop;
  const saved = roomSaved(ui.sheetStage).pos;
  // touched — предметы, которые здесь передвигали (перенос, кнопки, «Вернуть обычную»): только их пишет «Сохранить».
  ui.room = { pos: { ...saved }, saved, touched: new Set(), pick: 'rest', live: null, other: false, failed: false };
  ui.sheet.dataset.view = 'room';
  renderRoom();
  ui.sheet.setAttribute('aria-labelledby', 'cat-room-title');
  ui.sheet.querySelector('[data-room-pick="rest"]').focus();
  ui.resting = false;
  ui.lastActivity = now();
}

// Назад в уголок: перенос отменён, редактор пуст, комната — по сохранённой; restore — фокус на входе и прокрутка уголка.
function leaveRoom({ restore = true } = {}) {
  if (!ui.room) return;
  Room.cancelArrange('close');
  ui.room = null;
  delete ui.sheet.dataset.view;
  ui.sheet.setAttribute('aria-labelledby', 'cat-sheet-title');
  ui.sheet.querySelector('[data-cat-room-view]').innerHTML = '';
  paintCorner();
  paint();
  if (!restore) return;
  ui.sheet.querySelector('[data-cat-body]').scrollTop = ui.roomY;
  ui.sheet.querySelector('[data-cat-room]')?.focus({ preventScroll: true });
  markSeen();
}

// Итог в уголке (над сценой, гаснет) и объявление.
function roomDone(text) {
  const done = ui.sheet.querySelector('[data-cat-room-done]');
  if (done) {
    done.textContent = text;
    done.hidden = false;
    later('room-done', 4000, () => (done.hidden = true));
  }
  announce(text);
}

// «Сохранить»: перенос отменён; пишутся только передвинутые здесь предметы, чьё место отличается от свежего сохранённого
// (остальные точки — как в хранилище: правки другой вкладки, поля и значения, которых эта версия не знает); без изменений —
// выход без записи; запись не удалась — редактор открыт, черновик цел.
function saveRoom() {
  if (!ui.room) return;
  Room.cancelArrange('save');
  const pos = Room.arrange(ui.kind, ui.sheetStage, ui.room.pos).pos;
  ui.room.pos = pos;
  const moved = Room.movedItems(pos, roomSaved(ui.sheetStage).pos, [...ui.room.touched]);
  if (!Object.keys(moved).length) {
    leaveRoom();
    roomDone('Расстановка не изменилась.');
    return;
  }
  if (!writeKey(K.room, (text) => Room.roomRecord(text, ui.kind, moved))) {
    ui.room.failed = true;
    paintDraft();
    announce(`${ROOM_FAILED}.`);
    return;
  }
  leaveRoom();
  roomDone('Расстановка сохранена.');
}

// «Отмена», Esc, затемнение: черновик отброшен, комната — последняя сохранённая.
function cancelRoom() {
  if (!ui.room) return;
  leaveRoom();
  announce('Отменено: расстановка прежняя.');
}

// Обычная расстановка — в черновике (постоянной — после «Сохранить»).
function resetRoom() {
  if (!ui.room) return;
  Room.cancelArrange('reset');
  ui.room.pos = Room.arrange(ui.kind, ui.sheetStage, {}).pos;
  for (const id of Object.keys(ui.room.pos)) ui.room.touched.add(id);
  paintDraft();
  announce('Обычная расстановка. Сохрани, чтобы оставить её.');
}

function pickRoom(id) {
  if (!ui.room || !(id in ui.room.pos) || Room.arranging()) return;
  ui.room.pick = id;
  paintDraft();
}

// Кнопка или стрелка: шаг по тем же правилам, что у переноса.
function moveRoom(dir) {
  if (!ui.room || Room.arranging()) return;
  const id = ui.room.pick;
  const p = Room.nudge(roomLayout(false), id, dir);
  if (!p) {
    announce(`${roomTitle(id)}: дальше ${ROOM_DIRS[dir][3]} нельзя.`);
    return;
  }
  ui.room.pos = { ...ui.room.pos, [id]: p };
  ui.room.touched.add(id);
  paintDraft();
  announce(`${roomTitle(id)} ${ROOM_DIRS[dir][2]}.`);
}

// Стрелки — только с фокусом на кнопках предметов и направлений.
function onRoomKey(event) {
  const dir = ROOM_KEYS[event.key];
  if (!dir || !ui.room || event.altKey || event.ctrlKey || event.metaKey || !event.target.closest?.('[data-room-keys]')) return;
  event.preventDefault();
  moveRoom(dir);
}

// Новая ступень при открытом редакторе: черновик — на ней (лежанка, мячик), перенос отменён, записи нет.
function restageRoom() {
  Room.cancelArrange('stage');
  ui.room.saved = roomSaved(ui.sheetStage).pos;
  ui.room.pos = Room.arrange(ui.kind, ui.sheetStage, { ...ui.room.saved, ...ui.room.pos }).pos;
  if (!(ui.room.pick in ui.room.pos)) ui.room.pick = 'rest';
  renderRoom();
}

// Esc в «Поиграть» или редакторе: сначала идущий перенос, иначе редактор — в уголок, сцена — playBack.
function escapeSub() {
  if (ui.room && Room.arranging()) Room.cancelArrange('escape');
  else if (ui.room) cancelRoom();
  else playBack();
}

// Перенос (pet-room.mjs): точка под указателем — ближайшая допустимая, отпустили — в черновик.
const roomHooks = {
  layout: () => (ui.room ? roomLayout(false) : { kind: ui.kind, stage: 0, pos: {} }),
  selected: () => ui.room?.pick ?? '',
  select: safe((id) => {
    if (!ui.room || ui.room.pick === id) return;
    ui.room.pick = id;
    paintDraft();
    announce(`Выбрано: ${roomTitle(id).toLowerCase()}.`);
  }),
  move: safe((id, want) => {
    if (!ui.room) return;
    ui.room.live = { id, p: Room.settle(roomLayout(false), id, want) };
    paintDraft();
  }),
  done: safe((id) => {
    const live = ui.room?.live;
    if (!live) return;
    ui.room.live = null;
    const moved = !Room.samePlaces({ [id]: live.p }, { [id]: ui.room.pos[id] });
    ui.room.pos = { ...ui.room.pos, [id]: live.p };
    if (moved) ui.room.touched.add(id);
    paintDraft();
    if (moved) announce(`${roomTitle(id)} на новом месте.`);
  }),
  cancel: safe(() => {
    if (!ui.room) return;
    ui.room.live = null;
    paintDraft();
  }),
};

function hideCat() {
  cancelMove('hide');
  ui.core.hide();
  settingsChanged();
  closeSheet({ restore: false });
  clearSheet();
  stopTimers();
  ui.director = R.createDirector();
  ui.sceneNext = null;
  ui.resting = false;
  hush();
  renderAll();
  announce(`${name()} спрятан. Вернуть — «${returnLabel()}»${T.back}.`);
  fallbackFocus()?.focus({ preventScroll: true });
}

function showCat() {
  ui.core.show();
  settingsChanged();
  ui.lastActivity = now();
  renderAll();
  scheduleIdle();
  const owner = ui;
  const focusCat = () => ui === owner && ui.mounted && fallbackFocus()?.focus({ preventScroll: true });
  // «Показать …» в открытом диалоге сайта: тот при закрытии возвращает фокус на свою кнопку — питомец получает его после.
  const panel = ui.restore?.closest('dialog[open]');
  if (panel) {
    panel.addEventListener('close', () => setTimeout(focusCat, 0), { once: true, signal: ui.abort.signal });
    panel.close();
  } else focusCat();
  announce(surface() === 'call' ? `${CALL} — снова на месте.` : `${name()} снова рядом.`);
}

// Имя — команда ядра на каждый ввод (очистка и запись — ядро): декоративные таймеры её не отменят, а закрытие уголка не
// ждёт отложенной записи.
function onSheetInput(event) {
  const field = event.target;
  if (field.name !== 'cat-name') return;
  ui.core.setName(field.value);
  settingsChanged();
  showName();
}

// Имя везде согласованно: заголовок уголка и сцены, подпись в боковой панели, доступные имена кнопок.
function showName() {
  const title = ui.sheet?.querySelector('#cat-sheet-title');
  if (title) title.textContent = name();
  const big = ui.sheet?.querySelector('[data-cat-play-name]');
  if (big) big.textContent = name();
  // Сцена: место под итогом — по образцам с новым именем, итог на экране — тоже с ним.
  const fit = ui.sheet?.querySelector('[data-cat-play-fit]');
  if (fit) fit.innerHTML = fitHtml();
  const shownResult = ui.sheet?.querySelector('[data-cat-play-hint][data-result]');
  if (shownResult && ui.playOutcome) shownResult.textContent = playResults()[ui.playOutcome];
  const label = ui.dock?.querySelector('[data-cat-name]');
  if (label) label.textContent = name();
  // Имя — и в подарке первой ступени, в выборе напарника и в готовых именах.
  const steps = ui.sheet?.open ? ui.sheet.querySelector('[data-cat-steps]') : null;
  if (steps) steps.innerHTML = stageListHtml(ui.info);
  if (ui.sheet?.open) {
    syncKindNames();
    syncNamePick();
  }
  refreshInfo();
}

// Имя здесь не сохраняется: оно уже сохранено на каждый ввод, а change при уходе из поля переписал бы устаревшим текстом
// имя, сохранённое после него в другой вкладке.
function onSheetChange(event) {
  const field = event.target;
  if (field.name === 'cat-kind' && field.checked) {
    chooseKind(field.value);
  } else if (field.name === 'cat-coat' && field.checked) {
    chooseCoat(field.value);
  } else if (field.name === 'cat-presence' && field.checked) {
    choosePresence(field.value);
  } else if (field.name === 'cat-place' && field.checked) {
    choosePlace(field.value);
  } else if (field.name === 'cat-view' && field.checked) {
    chooseView(field.value);
  } else if (field.name === 'cat-acc' && field.checked) {
    ui.core.setAppearance({ accessory: field.value });
    settingsChanged();
    syncPickerAcc();
    paint();
  } else if (field.name === 'cat-motion' && field.checked) {
    ui.core.setPreferences({ motion: field.value });
    settingsChanged();
    restartIdle();
  } else if (field.name === 'cat-phrases') {
    ui.core.setPreferences({ phrases: field.checked });
    settingsChanged();
    if (!field.checked) hush();
    setScenePhrase(field.checked ? ui.scenePhrase : '');
  }
}

// Ушли из поля имени: в нём сохранённое имя (другая вкладка могла поменять его, пока поле редактировали здесь без ввода).
function onSheetFocusOut(event) {
  if (event.target.name !== 'cat-name') return;
  syncNameField({ force: true });
  // Пока вводили имя, могли измениться лакомство дня и предложение имени — догоняем. После паузы: фокус ушёл нажатием, и
  // кнопка под пальцем не должна сдвинуться до того, как нажатие сработает.
  later('name-sync', 400, () => {
    if (ui.treatLater) syncTreat();
    if (ui.learnLater) syncLearn();
    syncNamePick();
  });
}

// Движение изменилось (настройка, системное «уменьшить движение», другая вкладка): поза заново, таймеры покоя — с новыми
// интервалами. Реакция, реплика и конец микродвижения доигрывают по своим таймерам.
function restartIdle() {
  stopScene();
  paint();
  scheduleIdle();
}

// Системное «уменьшить движение»: режим пересчитан, выбор в настройках не меняется; подсказка в уголке — по факту.
function onReducedChange() {
  restartIdle();
  const note = ui.sheet?.querySelector('[data-cat-reduced]');
  if (note) note.hidden = !ui.reduced.matches;
}

// ---------- выбор напарника ----------

// Выбрали в уголке: команда ядра (другие вкладки переключатся тоже), новый напарник здоровается.
function chooseKind(kind) {
  if (kind === ui.kind || !ui.core.setPet(kind).ok) return;
  settingsChanged();
  applyShown(kind);
  // Фокус — на выбранном (переключатель перерисован вместе с уголком): Tab и стрелки работают дальше.
  ui.sheet?.querySelector('input[name="cat-kind"]:checked')?.focus({ preventScroll: true });
  if (!ui.settings.hidden) play(R.request(ui.director, 'meet', { now: now(), context: contextNow() }));
}

// Показать сохранённое: вид напарника и «скрыт» — по снимку ядра (оба ключа, с поглощёнными изменениями других вкладок).
// Сравнение — с показанным (ui.kind, ui.shownHidden). Возвращает true, если вид или скрытие пришлось показать заново.
function applyShown(kind = snap().pet.shown) {
  const next = readSettings(kind);
  if (next.hidden !== ui.shownHidden) setShown(kind, next);
  else if (kind !== ui.kind) switchKind(kind, next);
  else return false;
  return true;
}

// Прежний напарник не доигрывает: таймеры, реакция и отложенная реакция, реплика, примерка и маленькая вещь снимаются;
// тишина (ввод, диктовка, таймер) и уже отыгранные события (handled) остаются.
function dropShown() {
  stopDecor();
  ui.director.current = null;
  ui.director.pending = null;
  ui.sceneNext = null;
  endExtras();
  hush();
  ui.resting = false;
  ui.lastActivity = now();
  ui.lastPhrase = '';
}

// Питомец больше не на виду: ничего не доигрывает и не ждёт вызова; полночь остаётся.
function calmDown() {
  dropShown();
  scheduleMidnight();
}

// Спрятали или вернули (возможно, вместе со сменой вида) в другой вкладке: места целиком по сохранённому, без
// приветствия, объявлений и записей. Спрятан — уголок закрыт, мест и рисунков нет; вернули — выбранный напарник везде.
function setShown(kind, next) {
  cancelMove('hide');
  if (next.hidden) closeSheet({ restore: false });
  // После закрытия уголка фокус у кнопки, которая его открыла, — её тоже перерисуют.
  const focused = focusedControl();
  dropShown();
  ui.kind = kind;
  ui.settings = next;
  ui.scenePhrase = '';
  clearSheet();
  renderAll();
  if (!next.hidden) scheduleIdle();
  keepFocus(focused);
}

// Показать другого напарника при неизменном «скрыт»: прогресс, знаки и общие настройки те же — смена не даёт знаков и
// праздников. Кнопки мест те же; открытый уголок перерисовывается с тем же раскрытием, прокруткой и фокусом.
function switchKind(kind, next) {
  if (!R.KINDS.includes(kind) || kind === ui.kind) return;
  cancelMove('kind');
  release('kind');
  // Редактор закрывается без сохранения черновика.
  leaveRoom();
  const memo = sheetMemo();
  dropShown();
  ui.kind = kind;
  ui.settings = next;
  ui.scenePhrase = memo && ui.settings.phrases ? R.pickPhrase('scene', { stage: ui.info.stage, kind }) : '';
  if (ui.settings.hidden) {
    // Спрятан: меняется только подпись «Показать …» — кнопки те же, фокус на месте.
    const back = ui.side?.querySelector('[data-cat-return]');
    back?.setAttribute('aria-label', returnLabel());
    back?.setAttribute('title', returnLabel());
    renderReturn();
  } else {
    syncHostArts();
    const label = ui.dock?.querySelector('[data-cat-name]');
    if (label) label.textContent = name();
    renderFace();
    renderReturn();
  }
  refreshInfo();
  if (memo) restoreSheet(memo);
  else clearSheet();
  if (ui.play) renderPlay();
  paint();
  if (!ui.settings.hidden) scheduleIdle();
}

// Закрытый уголок нарисуется заново при открытии — прежний рисунок в нём не остаётся.
function clearSheet() {
  if (ui.sheet && !ui.sheet.open) ui.sheet.querySelector('[data-cat-body]').innerHTML = '';
}

const artFor = (place, view = 'full') => art({ id: `${ui.kind}-${place}`, view: view === 'full' ? 'full' : 'portrait' });

// Рисунки мест — по показанному напарнику, облику и виду места: заменяется только отличающийся (фокус не теряется).
function syncHostArts() {
  const stale = (svg, view) => !svg || svg.dataset.coat !== coat() || (svg.dataset.kind ?? 'cat') !== ui.kind || svg.dataset.view !== (view === 'full' ? 'full' : 'portrait');
  for (const [slot, place, host] of [
    [ui.dock?.querySelector('.cat-dock-art'), 'dock', 'sidebar'],
    [ui.float?.querySelector('.cat-host-art'), 'float', 'float'],
    [ui.bar?.querySelector('.cat-host-art'), 'bar', 'bar'],
  ]) {
    if (slot && stale(slot.firstElementChild, hostView(host))) slot.innerHTML = managed(artFor(place, hostView(host)));
  }
  const side = ui.side?.querySelector('.cat-side-face > svg');
  if (side && stale(side, 'compact')) side.replaceWith(fragment(managed(artFor('side', 'portrait'))));
  for (const button of [ui.dock, ui.float, ui.bar].flatMap((box) => [...(box?.querySelectorAll('[data-cat-fold]') ?? [])])) button.setAttribute('aria-label', foldLabel());
}

function fragment(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content;
}

// Состояние открытого уголка перед перерисовкой: прокрутка, раскрытые блоки, элемент с фокусом.
function sheetMemo() {
  if (!ui.sheet?.open) return null;
  const body = ui.sheet.querySelector('[data-cat-body]');
  const focus = body.contains(document.activeElement) ? document.activeElement : null;
  return {
    top: body.scrollTop,
    rules: Boolean(ui.sheet.querySelector('.cat-rules')?.open),
    settings: Boolean(ui.sheet.querySelector('.cat-settings')?.open),
    focus: focus ? { name: focus.name ?? '', value: focus.type === 'radio' || focus.type === 'checkbox' ? focus.value : '', data: [...focus.attributes].find((item) => item.name.startsWith('data-cat-'))?.name ?? '', summary: focus.matches('summary') ? focus.parentElement.className : '' } : null,
  };
}

function restoreSheet(memo) {
  renderSheet([]);
  const body = ui.sheet.querySelector('[data-cat-body]');
  ui.sheet.querySelector('.cat-rules').open = memo.rules;
  ui.sheet.querySelector('.cat-settings').open = memo.settings;
  body.scrollTop = memo.top;
  const f = memo.focus;
  if (!f) return;
  let target = null;
  if (['cat-kind', 'cat-coat', 'cat-acc', 'cat-motion', 'cat-presence', 'cat-place', 'cat-view'].includes(f.name)) target = body.querySelector(`input[name="${f.name}"]:checked`) ?? body.querySelector(`input[name="${f.name}"]`);
  else if (f.name) target = body.querySelector(`[name="${f.name}"]`);
  else if (f.summary) target = body.querySelector(`.${f.summary.split(' ')[0]} > summary`);
  // Видимый: кнопки имени есть и в предложении, которое у другого животного может быть скрыто.
  else if (f.data) target = [...body.querySelectorAll(`[${f.data}]`)].find(shown) ?? null;
  (target ?? ui.sheet.querySelector('[data-cat-close]')).focus({ preventScroll: true });
}

// ---------- тихий режим и активность ----------

function setQuiet(reason, on) {
  if (ui.director.quiet.has(reason) === on) return;
  if (on) stopScene();
  const result = R.setQuiet(ui.director, reason, on, now());
  if (on) hush();
  if (result.action === 'play' || result.action === 'stop') play(result);
  else paint();
}

const isTextField = (element) => Boolean(element?.matches?.(TEXT_INPUT)) && !element.closest('.cat-sheet');

function onFocusIn(event) {
  ui.lostEntry = false;
  if (!isTextField(event.target)) return;
  // Ввод продолжился (и при уже идущей тишине) — сценка не начнётся и конца ввода не ждёт.
  stopScene();
  setQuiet('typing', true);
}

// Фокус ушёл в никуда со спрятанного входа — вернёт applyLayout.
function onFocusOut({ target, relatedTarget }) {
  if (!relatedTarget && openers().includes(target) && !shown(target)) ui.lostEntry = true;
  later('typing', 250, () => {
    if (!isTextField(document.activeElement)) setQuiet('typing', false);
  });
}

function onActivity() {
  const at = now();
  if (at - ui.lastActivity < 500 && !ui.resting) return;
  ui.lastActivity = at;
  if (ui.resting) {
    ui.resting = false;
    paint();
  }
  if (active()) scheduleRest();
}

function onVisibility() {
  document.documentElement.classList.toggle('cat-paused', document.hidden);
  if (document.hidden) {
    // Реакция не доигрывается в фоне: примерка и маленькая вещь снимаются, поза — обычная; в сцене — подсказка.
    stopTimers();
    hush();
    endExtras();
    resetHint();
    ui.director.current = null;
    ui.sceneNext = null;
    return;
  }
  if (!ui.mounted || ui.settings.hidden) return;
  // Вернулись после долгого отсутствия — питомец успел задремать; проснётся от первого действия.
  if (now() - ui.lastActivity >= R.REST_AFTER_MS && !quiet()) ui.resting = true;
  // Пока вкладка была в фоне, мог наступить новый день или другая вкладка — угостить; окно — измениться.
  applyLayout();
  refreshInfo();
  syncTreat();
  syncLearn();
  paint();
  scheduleIdle();
}

function onStorage(event) {
  // Хранилище не прочиталось при подключении — экземпляр живёт в памяти, чужие записи не читает.
  if (offline()) return;
  // Другая вкладка сохранила расстановку: комната — тихо, на месте; черновик не меняется — отметка, если сменилась
  // расстановка этого питомца (своё «Сохранить» побеждает для предметов, передвинутых здесь).
  if (event.key === K.room || event.key === null) {
    if (ui.room) {
      const saved = roomSaved(ui.sheetStage).pos;
      if (!Room.samePlaces(saved, ui.room.saved)) {
        if (!ui.room.other) announce(`${ROOM_OTHER}.`);
        Object.assign(ui.room, { saved, other: true });
        paintDraft();
      }
    }
    paintCorner();
    if (event.key === K.room) return;
  }
  // Присутствие из другой вкладки: места — тихо, по свежему ключу; диалог и черновик не меняются.
  if (event.key === K.presence || event.key === null) {
    if (event.key && rawOf(event.oldValue).mode !== rawOf(event.newValue).mode) ui.presenceUnsaved = '';
    ui.presence = readPresence();
    if (ui.mounted && ui.presence !== ui.shownPresence) applyPresence();
    else syncPresenceBox();
    if (event.key) return;
  }
  // Место или вид (или ключ очистили): тихо; во время переноса здесь — после него (onMoveEnd).
  if (event.key === K.place || event.key === null) {
    if (event.key === K.place) forgetPlace(event);
    ui.place = readPlace();
    applyLayout();
  }
  // Ключи cat, companion, look, treat событие storage передаёт координатору ядра (свежее чтение и сверка): изменение
  // приходит обновлением ядра (onCore).
}

// Что из снимка показывает оболочка по ключам ядра: облик, лакомство, настройки (напарник, «скрыт», имена, аксессуары,
// движение, реплики, увиденная ступень, сохранность).
function views(state) {
  return {
    look: JSON.stringify([lookOf(state), state.save.look]),
    treat: JSON.stringify([state.treat, state.save.treat]),
    settings: JSON.stringify([state.pet, ...['cat', 'dog'].map((kind) => [state.pets[kind].name, state.pets[kind].accessory]), state.prefs, state.presence, state.progress?.seenStage, state.progress?.seenKnown, state.save.cat, state.save.companion]),
  };
}

// Обновление ядра. Эффекты — всегда: объявления (кормление, праздник ступени) и предупреждение о повреждённом значении
// ключа при загрузке. Изменение другой вкладки, поглощённое ядром (reason 'storage', docs/ARCHITECTURE.md § 8.6), — тихо,
// как прежнее событие storage: облик, карточка лакомства, другой напарник или «скрыт», имя, реплики, движение, открытый
// уголок. Свои команды оболочка показывает сама после вызова.
function onCore({ effects, reason }) {
  if (!ui.mounted) return;
  for (const effect of effects) {
    if (effect.type === 'announce') announce(effect.text);
    else if (effect.type === 'warning' && effect.code === 'corrupt') console.warn(corruptNote(K[effect.key]));
  }
  const was = ui.mirror;
  const state = snap();
  ui.mirror = state;
  if (reason !== 'storage' || !was) return;
  const shown = views(was);
  const now = views(state);
  if (shown.look !== now.look) {
    ui.look = lookOf(state);
    applyCoat();
  }
  // Угостили в другой вкладке: карточка и поза — тихо.
  if (shown.treat !== now.treat && !ui.settings.hidden) {
    refreshInfo();
    syncTreat();
    paint();
  }
  if (shown.settings === now.settings) return;
  syncStoreNote();
  // Другая вкладка выбрала другого напарника, спрятала или вернула его — здесь так же, тихо.
  if (applyShown()) return;
  const before = ui.settings;
  ui.settings = readSettings();
  showName();
  // Реплики выключили в другой вкладке — показанные облака и реплика уголка исчезают сразу.
  if (!ui.settings.phrases) {
    hush();
    setScenePhrase('');
  }
  if (before.motion !== ui.settings.motion) restartIdle();
  paint();
  // Открытый уголок согласован с сохранённым; ступень — если её подняла увиденная в другой вкладке (seenStage).
  syncControls();
  syncSheet();
}

// ---------- подключение и интерфейс для сайта ----------

// Элемент места: создаёт модуль, ставит сайт (options.places[place]); места без функции нет. Элемент — в ui до вызова сайта:
// бросит исключение после вставки — откат его уберёт.
function host(key, place, cls) {
  if (!O.places[place]) return;
  const box = (ui[key] = document.createElement('div'));
  box.className = `cat-${cls}`;
  box.id = `cat-${cls}`;
  O.places[place](box);
}

function start(options) {
  ui = initial();
  ui.abort = new AbortController();
  O = options;
  K = R.storageKeys(options.storage);
  C = { ...CLASSES, ...options.classes };
  T = { ...TEXTS, ...options.texts };
  // Хранение: общий координатор пространства имён (загрузка — все восемь ключей) и своё подключение ядра. Ядро создаётся
  // без записей; первое включение и приветствие — core.start ниже.
  const storage = createWebStorage({ namespace: options.storage ?? 'pet' });
  loadStorage(storage);
  const owner = ui;
  ui.core = createPetCore({ storage, progress, log: { warn: (message, error) => coreWarn(owner, message, error) } });
  ui.mirror = snap();
  ui.core.subscribe(safe(onCore), { initial: false });
  ui.look = lookOf(snap());
  ui.kind = snap().pet.shown;
  ui.settings = readSettings();
  ui.reduced = window.matchMedia(REDUCED);
  on(ui.reduced, 'change', safe(onReducedChange));
  ui.place = readPlace();
  ui.media = Object.entries(P.PLACE_MEDIA).map(([key, query]) => [key, window.matchMedia(query)]);
  for (const [, list] of ui.media) on(list, 'change', safe(onMediaChange));

  // Порядок Tab — как на экране: сайт ставит места в своей разметке.
  host('dock', 'sidebar', 'dock');
  host('side', 'logo', 'side');
  host('float', 'float', 'float');
  host('bar', 'bar', 'bar');
  for (const box of [ui.dock, ui.side, ui.float, ui.bar]) {
    on(
      box,
      'click',
      safe((event) => {
        const opener = event.target.closest('.cat-dock-btn, .cat-side-face, .cat-host-btn');
        if (event.target.closest('[data-cat-return]')) showCat();
        else if (event.target.closest('[data-cat-fold]')) fold();
        else if (event.target.closest('[data-cat-call]')) openSheet(event.target.closest('[data-cat-call]'), 'call');
        else if (opener) openSheet(opener);
      }),
    );
    if (box) watchDrag(box);
  }
  if (O.places?.top) {
    ui.fold = document.createElement('button');
    ui.fold.type = 'button';
    ui.fold.className = 'cat-fold cat-fold-top';
    ui.fold.dataset.catFold = '';
    ui.fold.title = 'Свернуть';
    ui.fold.hidden = true;
    ui.fold.innerHTML = FOLD_ICON;
    ui.fold.addEventListener('click', safe(fold));
  }
  initMover({ zones: zoneList, same: sameLayout, ghost: () => (stopScene(), art({ id: `${ui.kind}-ghost`, view: 'portrait' })), label: moveLabel, cancel: C.alt, end: safe(onMoveEnd) }, ui.abort.signal);

  // «Показать …», когда питомец спрятан, на телефоне (у логотипа на телефоне места нет) — в разметке сайта (restore), без
  // неё — лапкой в шапке (top): вернуть питомца можно всегда (logo и top обязательны — mountPet проверяет).
  ui.restore = document.createElement('div');
  ui.restore.className = O.places.restore ? 'cat-sections-return' : 'cat-sections-return cat-top-return';
  ui.restore.innerHTML = O.places.restore ? `<button class="${C.link}" type="button"></button>` : `<button class="cat-side-return" type="button">${PAW_ICON}</button>`;
  ui.restore.querySelector('button').addEventListener('click', safe(showCat));
  (O.places.restore ?? O.places.top)(ui.restore);

  ui.sheet = sheetSkeleton();
  document.body.append(ui.sheet);
  on(
    ui.sheet,
    'click',
    safe((event) => {
      // Затемнение вокруг «Поиграть» и редактора — как Esc.
      if (event.target === ui.sheet && ui.play) playBack();
      else if (event.target === ui.sheet && ui.room) cancelRoom();
      else if (event.target === ui.sheet || event.target.closest('[data-cat-close]')) closeSheet();
      else if (event.target.closest('[data-cat-play]')) enterPlay();
      else if (event.target.closest('[data-cat-room]')) enterRoom();
      else if (event.target.closest('[data-room-pick]')) pickRoom(event.target.closest('[data-room-pick]').dataset.roomPick);
      else if (event.target.closest('[data-room-move]')) moveRoom(event.target.closest('[data-room-move]').dataset.roomMove);
      else if (event.target.closest('[data-room-reset]')) resetRoom();
      else if (event.target.closest('[data-room-save]')) saveRoom();
      else if (event.target.closest('[data-room-cancel]')) cancelRoom();
      else if (event.target.closest('[data-cat-play-close]')) playBack();
      else if (event.target.closest('[data-cat-play-corner]')) leavePlay();
      else if (event.target.closest('[data-cat-play-pet]')) playAct('pet');
      else if (event.target.closest('[data-cat-play-paw]')) playAct('paw');
      else if (event.target.closest('[data-cat-play-bowl]')) moveBowl();
      else if (event.target.closest('[data-cat-play-ball]')) rollBall();
      else if (event.target.closest('[data-play-hit]')) nudge();
      else if (event.target.closest('[data-cat-pet]')) pet();
      else if (event.target.closest('[data-cat-paw]')) paw();
      else if (event.target.closest('[data-cat-feed]')) feed();
      else if (event.target.closest('[data-cat-learn]')) goLearn(event, event.target.closest('[data-cat-learn]'));
      else if (event.target.closest('[data-cat-name-pick]')) pickName(event.target.closest('[data-cat-name-pick]').dataset.catNamePick);
      else if (event.target.closest('[data-cat-name-more]')) moreNames();
      else if (event.target.closest('[data-cat-hide]')) hideCat();
      else if (event.target.closest('[data-cat-view-toggle]')) toggleView();
      else if (event.target.closest('[data-cat-move]')) startMove();
    }),
  );
  on(ui.sheet, 'input', safe(onSheetInput));
  on(ui.sheet, 'change', safe(onSheetChange));
  on(ui.sheet, 'focusout', safe(onSheetFocusOut));
  // Клавиши диалога не доходят до сочетаний страницы. Esc в «Поиграть» и редакторе — на один шаг (escapeSub), запасной
  // флаг гасит cancel. Удержанный Esc после шага ничего не делает до отпускания; новое нажатие — снова обычный Esc.
  on(ui.sheet, 'keydown', (event) => {
    event.stopPropagation();
    if (event.key !== 'Escape') return;
    // Новое нажатие: прежнее отпущено, и его запасной флаг (escLeft) не должен гасить этот Esc.
    if (!event.repeat) {
      ui.escHeld = false;
      ui.escLeft = false;
    }
    const sub = ui.play || Boolean(ui.room);
    const held = event.repeat && ui.escHeld;
    // Уголок: Esc закрывает сам диалог; шаг сделан.
    if (!sub && !held) {
      ui.escHeld = true;
      return;
    }
    event.preventDefault();
    const owner = ui;
    owner.escLeft = true;
    setTimeout(() => (owner.escLeft = false), 0);
    if (held) return;
    ui.escHeld = true;
    safe(escapeSub)();
  });
  // Автоповтор Esc, закрывшего диалог, до страницы не доходит (диктовка, сочетания).
  on(
    document,
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || ui.sheetOpen) return;
      if (!event.repeat) ui.escHeld = false;
      else if (ui.escHeld) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
  on(document, 'keyup', (event) => event.key === 'Escape' && (ui.escHeld = false), { capture: true });
  on(ui.sheet, 'cancel', (event) => {
    if (!ui.play && !ui.room && !ui.escLeft) return;
    event.preventDefault();
    if (!ui.escLeft) safe(escapeSub)();
  });
  // Запоздалое close прошлой сессии не закрывает уже новую (вызвали сразу после закрытия).
  on(ui.sheet, 'close', safe(() => !ui.sheet.open && closeSheet({ restore: true })));
  initPlay({ stroke: safe(onStroke), end: safe(onStrokeEnd), paw: safe(() => playAct('paw')), motion }, ui.abort.signal);
  initToys({ done: safe(onToy), motion });
  watchStroke(ui.sheet.querySelector('[data-cat-play-view]'));
  watchToys(ui.sheet.querySelector('[data-cat-play-view]'));
  Room.initRoom(roomHooks);
  Room.watchRoom(ui.sheet.querySelector('[data-cat-room-view]'));
  on(ui.sheet.querySelector('[data-cat-room-view]'), 'keydown', safe(onRoomKey));

  ui.live = document.createElement('div');
  ui.live.className = C.sr;
  ui.live.id = 'cat-live';
  ui.live.setAttribute('role', 'status');
  ui.live.setAttribute('aria-live', 'polite');
  document.body.append(ui.live);

  on(document, 'focusin', safe(onFocusIn));
  on(document, 'focusout', safe(onFocusOut));
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) on(document, type, safe(onActivity), { passive: true, capture: true });
  on(document, 'scroll', safe(onActivity), { passive: true });
  on(document, 'visibilitychange', safe(onVisibility));
  on(window, 'storage', safe(onStorage));

  ui.mounted = true;
  document.documentElement.classList.toggle('cat-paused', document.hidden);
  // Ядро: первое включение (история — молча) и приветствие дня — решение и неявная запись ядра; спрятан и «по зову» — без
  // приветствия. Отказ запуска (progress() сайта бросил) — отказ подключения: mountPet откатит всё созданное.
  ui.presence = readPresence();
  ui.starting = true;
  const started = ui.core.start({ around: P.petAround({ mode: ui.presence, open: false }) });
  ui.starting = false;
  if (!started.ok) throw ui.startError ?? new Error(started.error.message);
  ui.settings = readSettings();
  renderAll();
  if (ui.settings.hidden) return;
  if (isTextField(document.activeElement)) setQuiet('typing', true);
  scheduleIdle();
  // Первое открытие за день — приветствие (решение ядра, один раз). После паузы в два дня и больше — спокойное «рад, что
  // ты здесь», без упрёков. Проигрывание — здесь до PL04.1.
  const greet = started.greet;
  if (greet) later('greet', 900, () => play(R.request(ui.director, 'greet', { now: now(), key: `greet:${greet.day}`, context: contextNow(), extra: greet.welcome ? { phrases: 'welcome' } : {} })));
}

// Журнал ядра — «Питомец: …» в консоли. Во время core.start предупреждение о сбое — причина отказа подключения (её
// сообщает mountPet одной строкой), а не отдельный журнал.
function coreWarn(owner, message, error) {
  if (owner.starting) {
    owner.startError ??= error ?? new Error(message);
    return;
  }
  if (error === undefined) console.warn(`Питомец: ${message}`);
  else console.warn(`Питомец: ${message}`, error);
}

// Полное отключение (и откат неудачного запуска): жесты и перенос отменены, слушатели, таймеры, наблюдатели и кадры сняты,
// элементы питомца и отметки на html убраны. Каждый шаг — отдельно: частичный запуск и сбой шага не мешают остальным.
// Отложенное прежнего экземпляра сверяется с ui и ничего не делает.
function destroy() {
  ui.mounted = false;
  ui.sceneNext = null;
  const html = document.documentElement;
  for (const step of [
    () => ui.sheet?.open && ui.sheet.close(),
    () => cancelStroke('close'),
    () => unmountToys('close'),
    () => Room.cancelArrange('close'),
    stopMover,
    () => ui.abort?.abort(),
    () => ui.core?.destroy(),
    stopTimers,
    () => [ui.layoutTimer, ...ui.said].forEach(clearTimeout),
    endArrive,
    () => [ui.dock, ui.side, ui.float, ui.bar, ui.face, ui.fold, ui.restore, ui.sheet, ui.live].forEach((element) => element?.remove()),
    () => {
      html.classList.remove('cat-on', 'cat-open', 'cat-paused');
      for (const key of ['catMotion', 'petAt', 'petView', 'petMove']) delete html.dataset[key];
      html.removeAttribute('data-pet-call');
    },
  ])
    safe(step)();
}

// Изменилось состояние сайта: без аргументов — знаки или шаг (перечитать progress и step); с флагами — экран занятия
// (focus), таймер, диктовка, важный диалог сайта (тишина: без реакций и сценок, отложенная — после).
function update(flags) {
  if (!flags) {
    if (ui.settings.hidden) return;
    refreshInfo();
    syncSheet();
    return;
  }
  const changed = 'focus' in flags && ui.form !== Boolean(flags.focus);
  if ('focus' in flags) ui.form = Boolean(flags.focus);
  for (const reason of ['timer', 'dictation', 'dialog']) {
    if (!(reason in flags)) continue;
    // Открылся важный диалог — перенос питомца отменяется.
    if (reason === 'dialog' && flags.dialog) cancelMove('dialog');
    setQuiet(reason, Boolean(flags[reason]));
  }
  if (changed) paint();
}

// Подтверждённое занятие (detail — { key, counted, hard, first }; null — запись не учебная). Решение — ядро: знаки
// заново, первое включение, радость или поддержка, праздник новой ступени (не в «Поиграть» и редакторе) с отметкой
// увиденной, продолжение с новой вещью, подсказка про миску; спрятан или «по зову» и закрыт — только числа. Здесь — показ
// и проигрывание: числа, открытый уголок, редкая сценка (PL04.2) и реакция прежним режиссёром (повтор key — его память).
// Событие без key — как 0.1.4: ключ String(detail.key).
function saved(detail) {
  const event = detail ? { key: String(detail.key), counted: Boolean(detail.counted), hard: Boolean(detail.hard), first: Boolean(detail.first) } : null;
  const result = ui.core.notify('saved', event, sight());
  ui.settings = readSettings();
  showProgress();
  if (!result.ok || !result.reaction) return;
  const at = now();
  // Уголок открыли, пока занятие сохранялось: числа и ступень догоняют, праздник — реакцией.
  syncSheet();
  // Редкая сценка — после этой реакции, если выпала и всё ещё уместна; праздник ступени её исключает.
  const key = detail.key;
  const after = sceneFor(key, result.scene.outcome, result.scene.stage, at) ? { after: key } : {};
  play(R.request(ui.director, result.reaction.type, { now: at, key: result.reaction.key, context: contextNow(), extra: { ...result.reaction.extra, ...after } }));
}

// Занятие не сохранилось: награды нет, только нейтральное ожидание (решение ядра); ошибку показывает сайт.
function failed() {
  const result = ui.core.notify('failed', null, sight());
  if (result.ok && result.reaction) play(R.request(ui.director, result.reaction.type, { now: now(), context: contextNow() }));
}

let current = null;

// Один питомец на странице — и для разных копий модуля (файлы по другому адресу — другой модуль браузера): владелец —
// globalThis[Symbol.for('pet-module')] = { version, busy, destroy }. Копии без реестра (до 0.1.2) видны по своим id.
const PAGE = Symbol.for('pet-module');
const IDS = ['cat-sheet', 'cat-live', 'cat-dock', 'cat-side', 'cat-float', 'cat-bar'];

// Настройки, с которыми подключаться нельзя (README, «Отказ подключения»): проверка до любых действий.
function invalid(o) {
  const p = o?.places;
  if (!p || typeof p !== 'object') return 'нет places';
  for (const key of ['logo', 'top']) if (typeof p[key] !== 'function') return `places.${key} — обязательная функция`;
  for (const key in p) if (p[key] != null && typeof p[key] !== 'function') return `places.${key} — не функция`;
  for (const key of ['progress', 'step', 'go', 'zone', 'home']) if (o[key] != null && typeof o[key] !== 'function') return `${key} — не функция`;
  return o.storage === undefined || (typeof o.storage === 'string' && o.storage) ? '' : 'storage — непустая строка';
}

// Подключить питомца (README модуля, «Подключение»). Один активный питомец: новое подключение сначала отключает прежнее (и
// другой копии модуля), методы прежнего после этого ничего не делают. Отказ (неверные настройки, подключение изнутри
// подключения, чужие id, исключение сайта при запуске) — console.error, откат всего созданного, pet.mounted === false.
export function mountPet(options = {}) {
  let entry = null;
  const pet = {
    version: VERSION,
    update: own(update),
    notify: own((type, detail) => (type === 'saved' ? saved(detail) : type === 'failed' ? failed() : undefined)),
    open: own((view = 'corner') => openSheet(openers().find(shown) ?? null, view === 'play' ? 'call' : 'pet')),
    close: own(({ restore = true } = {}) => {
      cancelMove('close');
      closeSheet({ restore });
    }),
    get opened() {
      return current === pet && Boolean(ui.sheet?.open);
    },
    get mounted() {
      return current === pet && ui.mounted;
    },
    destroy() {
      if (current !== pet) return;
      current = null;
      if (globalThis[PAGE] === entry) delete globalThis[PAGE];
      safe(destroy)();
    },
  };
  function own(fn) {
    return safe((...args) => (current === pet && ui.mounted ? fn(...args) : undefined));
  }
  const refuse = (why) => (console.error('Питомец не подключён:', why), pet);
  let why;
  try {
    why = invalid(options) || (globalThis[PAGE]?.busy ? 'подключение уже идёт (mountPet из функции сайта)' : '');
  } catch (error) {
    why = error;
  }
  if (why) return refuse(why);
  try {
    globalThis[PAGE]?.destroy();
  } catch {
    // прежний владелец не отключился — ниже отказ
  }
  current?.destroy();
  const taken = globalThis[PAGE] ? 'прежний питомец не отключился' : IDS.find((id) => document.getElementById(id));
  if (taken) return refuse(globalThis[PAGE] ? taken : `на странице уже есть #${taken} — копия модуля до 0.1.2 или разметка сайта`);
  globalThis[PAGE] = entry = { version: VERSION, busy: true, destroy: () => pet.destroy() };
  current = pet;
  try {
    start(options);
  } catch (error) {
    pet.destroy();
    refuse(error);
  }
  entry.busy = false;
  return pet;
}
