// Питомец (кот или собака) — самостоятельный модуль: места рядом со страницей или лапка вызова, один диалог в трёх видах
// (уголок, «Поиграть», «Обустроить уголок»), реакции и настройки. Подключение, интерфейс, хранение и ограничения — README
// модуля. Ядро без DOM (core/index.mjs) — все девять ключей (настройки, присутствие, копия дня сценки, расстановка комнаты,
// предпочтение места, расширения ext:v1), счёт и ступени, решения подтверждённого занятия, кормления и приветствия; с
// PL04.1 — реакции и время (режиссёр, память событий, тишина, покой, полночь, видимость, реплики, приветствие); с PL04.2 —
// присутствие, «Скрыть» / «Показать» / вызов, открытый вид и его источник, праздник и отметка ступени по виду, редкие
// сценки с резервированием дня; с PL04.3 — «Поиграть» (прямые действия, жест поглаживания, предметы, лимиты, итог), «Обустроить уголок» (геометрия,
// черновик, перенос, сохранение, чужая расстановка), итоговая поза каждой поверхности и «устроился». Хранение — общий
// координатор (web/storage.mjs), день сценки — веб-адаптер IndexedDB (web/scenes.mjs). Оболочка распознаёт события
// страницы и указатель, объявляет ядру свои возможности (setDisplay), передаёт смысловые входы и показывает его снимок и
// эффекты. С PL05 — pet.core (публичный экземпляр ядра, core/facade.mjs) и команды ядра на pet; кнопки и прямые команды
// показываются одним путём — подпиской onCore по снимку (reflect, syncView); pet.core.destroy() снимает весь экземпляр.
// С PL06 питомцы и модели поведения — определения (pets, behaviors; по умолчанию штатные кот, собака и модель calm): ядро
// исполняет их, оболочка берёт из них подписи, имена, облики, аксессуары, вещи и области; рисует наборы отображения
// (web/kits.mjs: кот и собака — прежние рисунки cat-art.mjs, dog-art.mjs; сторонний питомец — свой набор, options.kits).
// Места и раскладка — pet-place.mjs; перенос между местами — pet-move.mjs; жест сцены — pet-play.mjs; миска и мячик на
// странице — pet-toys.mjs; комната на странице — pet-room.mjs. Хранит только предпочтения в браузере; данных сайта не
// меняет; ошибки здесь сайту не мешают.

import { bowlArt, bowlMiniSvg, bowlToySvg, miniItemSvg, sceneCatBox, sceneSvg } from './cat-art.mjs';
import { register, resolvePose } from './core/define.mjs';
import { exposed } from './core/facade.mjs';
import { createPetCore, fieldLabel } from './core/index.mjs';
import { roomModel } from './core/room.mjs';
import { ballToySvg } from './dog-art.mjs';
import { calm } from './defs/calm.mjs';
import { cat } from './defs/cat.mjs';
import { dog } from './defs/dog.mjs';
import * as R from './pet-rules.mjs';
import * as P from './pet-place.mjs';
import * as Room from './pet-room.mjs';
import { ROOM_DIRS as DIR_IDS, ROOM_TEXT } from './core/editor.mjs';
import { playTexts } from './core/play.mjs';
import { cancelMove, initMover, moving, startMoveMode, stopMover, watchDrag } from './pet-move.mjs';
import { cancelStroke, hitsHtml, initPlay, release, strokeLost, watchStroke } from './pet-play.mjs';
import { draw as drawToys, initToys, mountToys, toyDragging, toyLost, unmountToys, watchToys } from './pet-toys.mjs';
import { kitProblem, STOCK_KITS } from './web/kits.mjs';
import { createWebScenes } from './web/scenes.mjs';
import { createWebStorage } from './web/storage.mjs';
import { VERSION } from './core/version.mjs';

// Версия модуля — та же, что в package.json и у входа pet-companion/core: одна константа ядра (core/version.mjs; npm version
// обновляет её там — scripts/sync-version.mjs). Версии форматов данных — v1 в ключах (storageKeys).
export { VERSION };

// Местная дата «ГГГГ-ММ-ДД» — граница дня лакомства и сценок; по ней сайт считает progress().today (README, «Интерфейс»).
export const localDay = R.localDay;

const REDUCED = '(prefers-reduced-motion: reduce)';
const TEXT_INPUT = 'textarea, select, [contenteditable="true"], input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"], [type="reset"])';

// Штатные определения (PL06): без options.pets и options.behaviors — кот, собака и модель calm, как 0.1.4.
const STOCK_PETS = [cat, dog];
const STOCK_BEHAVIORS = [calm];

// Классы кнопок и служебных элементов — сайта (options.classes) или pet-base.css.
const CLASSES = { btn: 'pet-btn', alt: 'pet-btn pet-btn-alt', small: 'pet-btn-small', link: 'pet-link', close: 'pet-close', sr: 'pet-sr', muted: 'pet-muted' };
// Тексты, зависящие от сайта (options.texts).
const TEXTS = {
  wait: 'Одно занятие — и можно угостить.',
  // Второе правило — с подписями питомцев подключения (petsGen): «общее для кота и собаки».
  rules: null,
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
  core: null, // ядро этого подключения (createPetCore): все девять ключей, решения, реакции, виды, игра и комната
  mirror: null, // снимок ядра, по которому оболочка уже показана (любое обновление — разница с ним, onCore → reflect)
  booting: false, // идёт подключение: обновления ядра до первой отрисовки мест — только эффекты, без reflect
  lost: null, // ядро отключили напрямую (pet.core.destroy()) — снять весь экземпляр, как pet.destroy()
  intent: null, // кнопка, которой открывают диалог (openSheet до команды ядра open; без неё — видимый вход питомца)
  closing: null, // { restore } закрытия, начатого отображением (closeSheet до команды ядра close; без него — с возвратом)
  declared: null, // последнее объявление раскладки ядру ({ full, moving }, setDisplay)
  starting: false, // идёт core.start(): предупреждение ядра — причина отказа подключения (startError), а не журнал
  startError: null,
  storage: 'ok', // 'failed' — при подключении хранилище не прочиталось: до отключения ничего не читается и не пишется
  kind: '', // показанный напарник; выбор другой вкладки приходит поглощением ядра (onCore)
  defs: new Map(), // определения питомцев подключения (ID → определение)
  kits: new Map(), // наборы отображения (ID → набор): штатные и options.kits
  drawn: [], // питомцы, которых рисует отображение (с набором), в порядке pets
  rooms: new Map(), // модели комнаты питомцев (ядро, room.mjs)
  look: {}, // показанный облик каждого питомца (снимок ядра)
  shownHidden: false, // показано ли место «спрятан» (renderAll); сравнивается со свежим «скрыт»
  settings: { kind: '', name: '', accessory: '', motion: 'normal', phrases: true, hidden: false },
  reduced: null,
  dock: null,
  side: null,
  face: null,
  restore: null,
  sheet: null,
  live: null,
  opener: null,
  timers: {}, // таймеры отображения: конец микродвижения, подсветка касания «Поиграть», ввод (typing), имя, итог редактора
  said: new Set(), // ждущие объявления (announce)
  reaction: 0, // номер реакции ядра, уже показанной (новая с той же позой в «Поиграть» — движения заново)
  info: R.progressInfo(0),
  sheetStage: -1, // ступень, которую сейчас показывает открытый уголок (ui.info.stage может уйти вперёд)
  sheetY: 0,
  treat: 'waiting', // лакомство дня: waiting / ready / fed (снимок ядра)
  treatLater: false, // карточку лакомства не перерисовывали, пока вводят имя
  learnLater: false, // учебный шаг не обновляли, пока вводят имя
  sheetOpen: false, // диалог открыт (закрытие — один раз: событие close после закрытия кодом ничего не делает)
  fresh: [], // вещи, которые ядро отметило увиденными при открытом уголке (refresh), — для «Новое в уголке» (syncSheet)
  namePage: 0, // страница готовых имён в открытом уголке
  place: P.defaultPlace(), // место и вид у телефона и компьютера (ключ place — память ядра, снимок place)
  layout: null, // что показано сейчас (P.petLayout): место, вид, временная замена
  placeLater: false, // изменение другой вкладки пришло во время переноса — применить после него
  media: [], // медиазапросы мест (P.PLACE_MEDIA)
  layoutTimer: 0, // раскладка после пачки изменений медиазапросов
  arrive: null, // место, где идёт появление, и его слушатель конца анимации
  float: null, // компьютер: внизу экрана
  bar: null, // телефон: в нижней панели
  fold: null, // телефон: «Свернуть» рядом с питомцем в верхней панели
  play: false, // открыта сцена «Поиграть» (вместо уголка в том же диалоге)
  playY: 0, // прокрутка уголка до сцены — вернуть при выходе
  escLeft: false, // Esc уже закрыл сцену — тот же Esc не закрывает уголок
  escHeld: false, // Esc, закрывший сцену, ещё нажат — его автоповтор не закрывает уголок
  room: false, // открыт редактор «Обустроить уголок» (разметка вида; черновик и перенос — ядро, снимок room.draft)
  roomY: 0, // прокрутка уголка до редактора — вернуть при выходе
  presence: 'always', // показанное присутствие (снимок ядра presence.mode): always | on-call
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
// Все девять ключей — ядро (снимок, команды, общий координатор web/storage.mjs): оболочка ключи не читает и не пишет. Место и
// вид legacy-раскладки (ключ place) ядро хранит и не толкует: оболочка показывает его по снимку (place) своими правилами
// (pet-place.mjs) и меняет командой ядра setPlace. Отказ загрузки любого из девяти ключей (координатор) запрещает записи
// всего подключения. README, «Хранение».

const corruptNote = (key) => `Питомец: значение ${key} повреждено — показаны значения по умолчанию; оно не перезаписывается, пока эту настройку не изменят.`;

// Загрузка при подключении — координатор (все девять ключей пространства). Ключ не прочитался (исключение хранилища) —
// подключение работает в памяти: показывает умолчания и ничего не пишет; новая попытка — следующее подключение.
// Повреждённое значение — предупреждение эффектом ядра warning (onCore); неявные записи его не трогают.
function loadStorage(storage) {
  ui.storage = storage.load() === 'ready' ? 'ok' : 'failed';
  if (ui.storage === 'failed') console.warn('Питомец: хранилище недоступно — настройки действуют до перезагрузки и не сохраняются.');
}

// ---------- снимок ядра: настройки, облик, счёт, лакомство, присутствие и вид ----------
// Показ — снимок последнего закрытого обновления ядра (getState): после команды он уже новый. Правила (ступени, вещи,
// аксессуары, лакомство, первое включение, праздник и отметка ступени по виду, кормление, приветствие, присутствие,
// сценки) оболочка не повторяет — берёт их итог.

const snap = () => ui.core.getState();

// Настройки напарника kind в прежней форме оболочки: общие поля и его имя с аксессуаром.
function settingsOf(state, kind) {
  const own = state.pets[kind];
  return { kind, name: own.name.value, accessory: own.accessory, motion: state.prefs.motion, phrases: state.prefs.phrases, hidden: state.presence.hidden };
}

const readSettings = (kind = ui.kind) => settingsOf(snap(), kind);
const lookOf = (state) => Object.fromEntries(Object.entries(state.pets).map(([id, own]) => [id, own.coat]));

// Счёт и ступень — в прежней форме ui.info (только показ).
function infoOf(state) {
  const p = state.progress;
  if (!p) return R.progressInfo(0);
  return { marks: p.marks, stage: p.stage, computed: p.computed, current: R.STAGES[p.stage], next: R.STAGES[p.stage + 1] ?? null, toNext: p.toNext };
}

// Хранилище не прочиталось при подключении — изменения действуют только на этой странице (подсказки мест и облика).
const offline = () => ui.storage === 'failed';
const OFFLINE = 'Хранилище этого браузера недоступно: изменения действуют на этой странице до перезагрузки и не сохраняются.';

// Подписи питомцев подключения в родительном падеже: «кота и собаки», «кота, собаки и кролика».
function petsGen() {
  const list = ui.drawn.map((id) => ui.defs.get(id).forms.gen);
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} и ${list.at(-1)}` : (list[0] ?? '');
}

// Ключи настроек питомцев: общие и кот — cat, собака — companion, сторонние и модель — ext.
const SETTING_KEYS = ['cat', 'companion', 'ext'];

// Подсказка в «Настройках»: сохранение обещается, только пока запись удаётся; повреждённые настройки — честно.
function storeNote() {
  const save = snap().save;
  const head = offline()
    ? OFFLINE
    : SETTING_KEYS.some((key) => save[key].corrupt)
      ? 'Сохранённые настройки в этом браузере повреждены и не читаются: показаны обычные. Сами они не перезаписываются — изменение настройки здесь их заменит.'
      : SETTING_KEYS.some((key) => save[key].unsaved.length > 0)
        ? 'Сохранить настройки в этом браузере сейчас не получается: они действуют на этой странице до перезагрузки, другие вкладки их не видят.'
        : 'Настройки напарника, облик, имена и лакомство хранятся в этом браузере: на другом устройстве — свои.';
  return `${head} Имя, облик и аксессуар у ${petsGen()} свои, движение, реплики и «скрыть» — общие. ${T.origin}`;
}

// Облик: не записался — подсказка «не сохранился» (облик действует в памяти ядра до перезагрузки).
const coatNote = () =>
  snap().save.look.unsaved.includes(fieldLabel([ui.kind]))
    ? 'Облик не сохранился в этом браузере: он действует на этой странице до перезагрузки.'
    : offline()
      ? OFFLINE
      : `Облик у ${petsGen()} свой и хранится в этом браузере. Знаков и вещей не меняет.`;

// ---------- место и вид (ключ place) — память ядра, правила раскладки — здесь ----------

// Сохранённое (с несохранёнными правками) — снимок ядра; показ — нормализованное (непонятное — по умолчанию).
const placeRaw = () => snap().place;
const readPlace = () => P.normalizePlace(placeRaw());

// Правка места или вида — проверенная (P.placePatch) команда ядра (операция ключа place через его подключение); true —
// записано или записывать нечего.
function storePlace(patch) {
  const result = ui.core.setPlace(P.placePatch(patch));
  return result.ok && result.save.status !== 'failed';
}

// Не записалось — поля устройства в несохранённых ядра.
const placeFailed = () => snap().save.place.unsaved.some((path) => path.startsWith(`${ui.layout?.device}.`));

// ---------- присутствие (ключ presence) — ядро ----------
// Рядом со страницей (питомец, лапка вызова или ничего) и «на виду» (рядом или вызван) — снимок ядра; источник
// открытия диалога (pet — питомец, call — вызов «по зову») — тоже.
const surface = () => snap().presence.surface;
const around = () => snap().presence.around;
const openedBy = () => snap().view.source;

function syncStoreNote() {
  const note = ui.sheet?.querySelector('[data-cat-store]');
  if (note && note.textContent !== storeNote()) note.textContent = storeNote();
}

// Режим движения — снимок ядра: итог выбора владельца и системного «уменьшить движение» (setReducedMotion).
const motion = () => snap().prefs.effectiveMotion;
// Определение и набор показанного напарника (или питомца kind); модель его комнаты.
const defOf = (kind = ui.kind) => ui.defs.get(kind);
const kitOf = (kind = ui.kind) => ui.kits.get(kind);
const roomOf = (kind = ui.kind) => ui.rooms.get(kind);
const name = () => ui.settings.name || defOf().names.default;
const coat = () => ui.look[ui.kind];
// Рисунок показанного напарника в его облике (набор отображения); id — с видом, чтобы градиенты и клипы не совпадали.
const art = (options) => kitOf().art({ coat: coat(), ...options });
// Статичный портрет для выбора (напарник, облик): без data-cat-managed, с надетым аксессуаром.
const pickerArt = (kind, look, id, acc) => kitOf(kind).art({ id: `${kind}-${id}`, view: 'portrait', coat: look, accessory: acc });
// Название вещи или аксессуара для «Новое в уголке» (строчными; у аксессуара — короткое, если есть).
function itemName(id) {
  const def = defOf();
  const item = def.items.list.find((entry) => entry.id === id);
  if (item) return item.title.toLowerCase();
  const accessory = def.accessories.find((entry) => entry.id === id);
  return accessory ? (accessory.short ?? accessory.title.toLowerCase()) : id;
}
// Сценка читается в этом показе (целиком — все, портрет — needs: 'any').
const sceneReadable = (scene, full) => defOf().scenes.some((item) => item.id === scene && (full || item.needs === 'any'));
// Поза, которой нет в наборе (необязательная yawn, settle), — базовая поза питомца (§ 7.5).
const drawnPose = (pose, state) => (kitOf().poses.includes(pose) ? pose : (resolvePose(defOf(), state.pose.base) ?? 'calm'));

// ---------- таймеры отображения ----------
// Смысловые задачи (конец реакции и продолжение, облако, покой и дремота, полночь, приветствие, итог «Поиграть» и его
// сброс) — у ядра (порт scheduler). Здесь — только показ: конец микродвижения, подсветка касания «Поиграть», проверка ухода
// из поля ввода (typing, 250 мс), имя, итог над сценой уголка после редактора.

function later(key, ms, fn) {
  clearTimeout(ui.timers[key]);
  if (ms === null || ms === undefined) return;
  ui.timers[key] = setTimeout(safe(fn), ms);
}

function stopTimers() {
  for (const key of Object.keys(ui.timers)) clearTimeout(ui.timers[key]);
  ui.timers = {};
}

// Смена напарника, фон: таймеры показа прежнего не доигрывают; проверка конца ввода (typing) — про страницу.
function stopDecor() {
  for (const key of Object.keys(ui.timers)) {
    if (key === 'typing') continue;
    clearTimeout(ui.timers[key]);
    delete ui.timers[key];
  }
}

// Одиночное движение покоя (моргание, ухо, хвост, взгляд, наклон) — эффект ядра micro: атрибут рисунков на ms.
function showMicro(kind, ms) {
  for (const art of arts()) art.dataset.micro = kind;
  later('micro-end', ms, () => {
    for (const art of arts()) delete art.dataset.micro;
  });
}

// ---------- поза ----------

function arts() {
  return [...document.querySelectorAll('.cat-art[data-cat-managed]')];
}

// Поза — снимок ядра, итоговая для каждой поверхности (pose.shown): на странице — page (реакция, кроме сценки и прямого
// действия «Поиграть» в тишине, иначе покой, внимание или дремота), в «Поиграть» — play (реакция не сценка, иначе удержание
// жестом, иначе спокойная или довольная), в редакторе — room (спокойная или довольная, без реакций и сценок). Редкая
// сценка — data-scene поверх позы покоя там, где её вариант читается (целиком или портрет) — выбор рисунка отображения.
function paint() {
  const state = snap();
  const { pose } = state;
  const reaction = pose.reaction;
  const scene = reaction?.scene ? reaction.type : '';
  const own = reaction && !scene ? reaction.pose : '';
  const acc = reaction?.tryOn || state.pets[ui.kind].worn;
  const move = state.prefs.effectiveMotion;
  const hushed = state.context.quiet.length > 0;
  // Тот же режим — всему интерфейсу питомца (pet.css).
  if (document.documentElement.dataset.catMotion !== move) document.documentElement.dataset.catMotion = move;
  for (const art of arts()) {
    const inPlay = Boolean(art.closest('.cat-play'));
    // В редакторе питомец спокоен: без реакций и сценок.
    const inRoom = Boolean(art.closest('.cat-room'));
    const posed = drawnPose(inPlay ? pose.shown.play : inRoom ? pose.shown.room : pose.shown.page, state);
    art.dataset.pose = posed;
    // Только там, где сценка читается: клубок — у целого питомца (уголок открыт — портрет за ним остаётся в покое).
    if (scene && !inPlay && !inRoom && sceneReadable(scene, art.dataset.view === 'full')) art.dataset.scene = scene;
    else delete art.dataset.scene;
    // Куда смотрит в сцене (миска, мячик).
    if (inPlay && own && reaction.toward) art.dataset.toward = reaction.toward;
    else delete art.dataset.toward;
    art.dataset.acc = acc;
    art.dataset.motion = move;
    if (move === 'normal' && (inPlay || inRoom || !hushed) && !document.hidden) art.dataset.breathe = '';
    else delete art.dataset.breathe;
    if ((own && posed === own && !inRoom) || scene) delete art.dataset.micro;
  }
}

// ---------- реплики ----------
// Реплику выбирает ядро: phrase — облако на странице (компьютер — рядом с питомцем в боковой панели и внизу экрана;
// телефон — без текста в панелях, реплики — в уголке), scenePhrase — под сценой открытого вида. Узкое облако не растёт
// за край: не помещается фраза с длинным именем — её короткий вариант (phrase.short).

function showSaying() {
  const phrase = snap().phrase;
  for (const box of [ui.dock?.querySelector('.cat-dock-say'), ui.float?.querySelector('.cat-float-say')]) {
    if (!box) continue;
    if (!phrase) {
      box.classList.remove('is-saying');
      continue;
    }
    const bubble = box.querySelector('.cat-bubble');
    bubble.textContent = phrase.text;
    if (phrase.short && bubble.offsetTop + bubble.offsetHeight > box.clientHeight) bubble.textContent = phrase.short;
    box.classList.add('is-saying');
  }
  const side = ui.side?.querySelector('.cat-side-say');
  if (phrase && side) {
    side.textContent = phrase.text;
    ui.side.classList.add('is-saying');
  } else ui.side?.classList.remove('is-saying');
}

// Реплика под сценой уголка и в сцене «Поиграть»; реплики выключены — скрыта.
function showScenePhrase() {
  const state = snap();
  for (const box of ui.sheet?.querySelectorAll('[data-cat-phrase]') ?? []) {
    box.hidden = !state.scenePhrase || !state.prefs.phrases;
    box.querySelector('span').textContent = state.scenePhrase;
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
// Проигрывает ядро (режиссёр, сроки, продолжения, реплика). Здесь — показ после каждого его обновления.

function render() {
  paint();
  showSaying();
  showMini();
  showScenePhrase();
}

// Новая вещь или миска рядом с питомцем (боковая панель, внизу экрана) на время реакции — её поле mini; рисунок вещи
// заменяется, только когда вещь другая.
const miniShown = new WeakMap();
function showMini() {
  const item = snap().pose.reaction?.mini ?? '';
  for (const slot of [ui.dock, ui.float].map((box) => box?.querySelector('.cat-dock-mini'))) {
    if (!slot) continue;
    if (miniShown.get(slot) !== item) {
      slot.innerHTML = item === 'bowl' || item === 'bowl-empty' ? bowlMiniSvg({ full: item === 'bowl' }) : item ? kitOf().mini?.(item) || miniItemSvg(item) : '';
      miniShown.set(slot, item);
    }
    slot.classList.toggle('is-on', Boolean(item));
  }
}

// ---------- что умеет и показывает отображение (setDisplay) ----------
// Возможности legacy-отображения объявляются ядру явно, до start (docs/ARCHITECTURE.md § 11.1): питомцы — те, у кого есть
// набор, виды и сценки — ровно нарисованные наборами (штатные — рисунки 0.1.4: кот — stretch, curl, собака — fetch; без
// объявления сценок их не было бы, а не «были бы все»). Редкую сценку — выбор, попытку, отмену, резервирование дня и
// показ — ведёт ядро; здесь только рисунок (data-scene по снимку) и факты раскладки: целиком или портрет и идёт ли перенос
// между местами.
const VIEWS = ['corner', 'play', 'room'];
const legacyDisplay = () => ({ pets: [...ui.drawn], views: VIEWS, scenes: Object.fromEntries(ui.drawn.map((id) => [id, [...kitOf(id).scenes]])) });

// Раскладка мест: целиком ли питомец на странице и идёт ли перенос (уголок целиком — смысл открытого вида, его учитывает
// ядро). Объявляется, только когда факт раскладки сменился: перерисовка по снимку команду не повторяет.
function syncDisplay() {
  const next = { full: ui.layout?.view === 'full', moving: moving() };
  if (ui.declared?.full === next.full && ui.declared?.moving === next.moving) return;
  ui.declared = next;
  ui.core.setDisplay(next);
}

// ---------- прогресс: знаки от сайта ----------

// Всего (marks), за сегодня (today), предел дня (limit — только для подписи) — сайт; читает ядро.
const progress = () => ({ marks: 0, today: 0, ...O.progress?.() });

// Знаки сайта, ступень и лакомство дня — заново в ядре (первое включение — молча, неявной записью ядра; открыт уголок —
// новая ступень увидена, её вещи — эффект seen для «Новое в уголке»), затем показ. Перечитывают действия отображения и
// сайта (подключение, update(), «Показать», отказ кормления); перерисовка по снимку (reflect) счёт не перечитывает.
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
    button.setAttribute('aria-label', call ? callLabel() : `${name()} — уголок ${defOf().forms.gen}${fresh ? ', есть новая вещь' : ''}`);
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
const foldLabel = () => `Свернуть ${defOf().forms.acc}`;
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

const returnLabel = () => `Показать ${defOf().forms.acc}`;

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

// Места заново по снимку (присутствие, раскладка, имя, облик). reread — ещё и перечитать счёт сайта (подключение); иначе
// только показ снимка: перерисовка из подписки команд ядра не вызывает, кроме объявления сменившейся раскладки.
function renderAll({ reread = false } = {}) {
  ui.presence = snap().presence.mode;
  ui.layout = layoutNow();
  markLayout();
  syncDisplay();
  renderDock();
  renderSide();
  renderFace();
  renderFloat();
  renderBar();
  renderReturn();
  ui.shownHidden = ui.settings.hidden;
  if (reread) refreshInfo();
  else showProgress();
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
    // Другое место legacy-раскладки — сценка отменяется (места в ядро не переходят: узкий вход stopScene); целиком или
    // портрет — объявление отображения (setDisplay({ full })), его смену ядро учитывает само.
    ui.core.stopScene();
    syncDisplay();
    if (ui.dock && ui.dock.dataset.view !== hostView('sidebar')) renderDock();
    if (ui.float && ui.float.dataset.view !== hostView('float')) renderFloat();
    if (ui.bar && ui.bar.dataset.view !== hostView('bar')) renderBar();
    renderFace();
    // Точка «новое» и подписи новых кнопок мест — по снимку.
    showProgress();
    // Идущая реакция продолжается и на перерисованном месте: реплика и маленькая вещь.
    showSaying();
    showMini();
    paint();
    if (explicit) settle();
  }
  // Кнопки вызова не перерисовываются — одну показывает pet.css.
  if (lost) fallbackFocus()?.focus({ preventScroll: true });
  else keepFocus(focused);
  syncPlaceBox();
}

const hostBox = (host) => ({ sidebar: ui.dock, logo: ui.side, float: ui.float, top: ui.face, bar: ui.bar })[host];

// Питомец на новом месте или раскрылся по действию владельца — ядру (arrive): без анимации — ничего, иначе эффект arrive
// (появление — здесь, startArrive) и декоративный отклик «устроился» (в тишине и поверх другой реакции не играет).
function settle() {
  endArrive();
  ui.core.arrive();
}

// Эффект ядра arrive: появление на показанном месте (класс снимается концом анимации или следующим появлением).
function startArrive() {
  endArrive();
  const box = ui.layout && hostBox(ui.layout.host);
  if (!box) return;
  const done = (event) => event.animationName === 'pet-arrive' && endArrive();
  ui.arrive = { box, done };
  box.classList.add('is-arriving');
  for (const type of ['animationend', 'animationcancel']) box.addEventListener(type, done);
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
  ui.core.activity();
  applyLayout({ explicit: true });
  announce(`Место: ${P.placeTitle(device, id).toLowerCase()}.${ui.layout.moved ? ` Сейчас там нет места — питомец временно ${P.placeTitle(device, ui.layout.at).toLowerCase()}.` : ''}${saved ? '' : ' Не сохранилось в этом браузере — действует до перезагрузки.'}`);
}

// Вид: «Показать целиком», «Свернуть» или выбор в «Настройках». Питомец не уходит с места, где новый вид помещается
// (P.viewPatch).
function chooseView(view) {
  if (!P.VIEWS.some((item) => item.id === view)) return;
  const saved = storePlace(P.viewPatch(ui.place, env(), view, placeRaw()));
  ui.place = readPlace();
  ui.core.activity();
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

const moveLabel = () => `Перетащите ${defOf().forms.acc}${ui.layout?.device === 'phone' ? ' пальцем вверх или вниз' : ' на одно из мест'} — или нажмите место.`;

// «Переместить» в уголке: уголок закрывается, на странице — места; питомца можно тянуть пальцем.
function startMove() {
  closeSheet({ restore: false });
  const source = openers().find(shown);
  if (!source) return;
  startMoveMode(source);
  // Режим «Переместить» — перенос: сценки нет (ядро отменяет её по setDisplay({ moving })).
  syncDisplay();
  announce(`${moveLabel()} Esc — отмена.`);
}

// Перенос закончился: отпустили над местом — оно выбрано; иначе ничего не меняется. Изменение другой вкладки во время
// переноса применяется теперь (после отмены — её значение, после переноса — новее наше). Фокус не остаётся на исчезнувшем.
function onMoveEnd({ reason, place }) {
  if (!ui.mounted) return;
  syncDisplay();
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

const gift = (index) => R.stageGift(defOf(), index, name());

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
  return defOf().accessories.map((item) => {
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
  for (const item of defOf().accessories) {
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

// Сцена ступени: общий уголок (место отдыха с питомцем, мебель ступеней), миска (в уголке — когда можно угостить и после)
// и свои вещи питомца из набора — игрушки комнаты открытых ступеней (клубок кота; канат и со ступени «Наш ритуал» мячик
// собаки) и вещи ступеней вне общего уголка. Расстановка — paintRoom после вставки. id — свой у уголка и редактора.
const scenePet = (stage, id) => managed(art({ id: `${ui.kind}-${id}-art`, box: sceneCatBox(stage) })).replace('<svg ', '<svg data-room="rest" ');
function ownItems(stage, fresh) {
  const def = defOf();
  const toys = def.room.toys.filter((toy) => toy.stage <= stage).map((toy) => toy.id);
  const items = def.items.list.filter((item) => item.stage <= stage && kitOf().items.includes(item.id) && !toys.includes(item.id)).map((item) => item.id);
  return [...toys, ...items].map((id) => kitOf().item?.(id, { fresh: fresh.includes(id) }) ?? '').join('');
}
const sceneHtml = (stage, fresh, { id = 'scene', bowl = ui.treat } = {}) =>
  sceneSvg({
    id: `cat-${id}`,
    stage,
    fresh,
    cat: scenePet(stage, id),
    extra: `${bowlArt({ state: bowl })}${ownItems(stage, fresh)}`,
  });

// Комната уголка — сохраняемая расстановка из снимка ядра (room.pos, сдвиг к миске — room.feedShift), на месте (фокус,
// прокрутка и реакция те же).
function paintCorner() {
  const scene = ui.sheet?.querySelector('.cat-stage-wrap > .cat-scene-art');
  const room = snap().room;
  if (scene) Room.paintRoom(scene, { model: roomOf(), stage: ui.sheetStage, pos: room.pos }, room.feedShift);
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
        ${who.actions.paw?.ask ? `<button class="${C.alt} cat-paw" type="button" data-cat-paw>Дай лапу</button>` : ''}
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
  ui.core.activity();
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
      <legend>Облик ${defOf().forms.gen}</legend>
      <div class="cat-coat-list">${defOf().coats
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
  const want = coat();
  syncHostArts();
  if (ui.face) renderFace();
  const scene = ui.sheet?.open ? ui.sheet.querySelector('.cat-stage-wrap > .cat-scene-art > .cat-art') : null;
  if (scene && scene.dataset.coat !== want) {
    scene.replaceWith(fragment(scenePet(ui.sheetStage, 'scene')));
    paintCorner();
  }
  // Редактор: перенос отменён (ядро), черновик тот же.
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
  for (const kind of ui.drawn) {
    const face = ui.sheet.querySelector(`[data-cat-kind-face="${CSS.escape(kind)}"]`);
    if (face && face.firstElementChild?.dataset.coat !== ui.look[kind]) face.innerHTML = pickerArt(kind, ui.look[kind], 'pick', face.firstElementChild?.dataset.acc ?? defOf(kind).accessories[0].id);
  }
  for (const input of ui.sheet.querySelectorAll('input[name="cat-coat"]')) input.checked = input.value === coat();
  const note = ui.sheet.querySelector('[data-cat-coat-note]');
  if (note && note.textContent !== coatNote()) note.textContent = coatNote();
}

// Выбрали облик: команда ядра (запись — его операция ключа look); показ везде — по снимку (onCore → reflect, тот же путь,
// что у прямой команды pet.setAppearance); фокус остаётся на выбранном переключателе; объявление — по итогу записи.
function chooseCoat(value) {
  const kind = ui.kind;
  if (value === coat()) return;
  const result = ui.core.setAppearance({ coat: value });
  if (!result.ok) return;
  ui.core.activity();
  announce(`Облик: ${defOf(kind).coats.find((item) => item.id === value).title.toLowerCase()}.${result.save.status === 'failed' ? ' Не сохранился в этом браузере — действует до перезагрузки.' : ''}`);
}

// Надетый аксессуар — и на портретах выбора (напарник и облик показанного животного).
function syncPickerAcc() {
  const acc = snap().pets[ui.kind].worn;
  for (const svg of ui.sheet?.querySelectorAll(`.cat-coat-face .cat-art, [data-cat-kind-face="${CSS.escape(ui.kind)}"] .cat-art`) ?? []) svg.dataset.acc = acc;
}

// Имя показанного напарника: предложение (пока имя не выбирали), готовые имена страницами, «Другие имена» и поле
// своего имени. Выбранное отмечено галочкой и aria-pressed.
function chipsHtml() {
  const shown = name();
  return R.namePage(defOf().names.presets, ui.namePage)
    .map((item) => `<button class="cat-chip" type="button" data-cat-name-pick="${esc(item)}" aria-pressed="${item === shown ? 'true' : 'false'}">${esc(item)}</button>`)
    .join('');
}

function nameHtml() {
  const who = defOf();
  const offer = who.names.offer;
  const fallback = who.names.default;
  return `<fieldset class="cat-name">
      <legend>Имя ${who.forms.gen}</legend>
      <div class="cat-name-offer" data-cat-offer${snap().pets[ui.kind].name.chosen ? ' hidden' : ''}>
        <p>Новое имя? Предлагаем «${esc(offer)}» — или оставим «${esc(fallback)}».</p>
        <div class="cat-name-offer-actions">
          <button class="${C.btn} ${C.small}" type="button" data-cat-name-pick="${esc(offer)}">${esc(offer)}</button>
          <button class="${C.alt} ${C.small}" type="button" data-cat-name-pick="${esc(fallback)}">Оставить «${esc(fallback)}»</button>
        </div>
      </div>
      <div class="cat-name-row">
        <div class="cat-name-list" id="cat-name-list" data-cat-names role="group" aria-label="Готовые имена">${chipsHtml()}</div>
        <button class="cat-chip cat-chip-more" type="button" data-cat-name-more aria-controls="cat-name-list">Другие имена</button>
      </div>
      <label class="cat-field"><span>Своё имя</span><input type="text" name="cat-name" maxlength="${R.NAME_MAX}" autocomplete="off" value="${esc(ui.settings.name)}" placeholder="${esc(fallback)}" /></label>
      <p class="${C.muted} cat-note">До ${R.NAME_MAX} знаков. Имена у ${petsGen()} свои; знаков имя не даёт.</p>
    </fieldset>`;
}

// «Новое в уголке»: вещи и аксессуары, открытые после увиденной ступени (снимок ядра).
function freshText(fresh) {
  const accessories = snap().progress?.unseen ? snap().progress.freshAccessories : [];
  const names = [...fresh, ...accessories].map(itemName);
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
  return Object.fromEntries(ui.drawn.map((id) => [id, pets[id].name.display]));
}

function kindHtml() {
  const names = kindNames();
  const pets = snap().pets;
  return `<fieldset class="cat-kind">
      <legend>Напарник</legend>
      <div class="cat-kind-list">${ui.drawn.map((kind) => {
        const on = kind === ui.kind;
        return `<label class="cat-kind-option">
          <input type="radio" name="cat-kind" value="${esc(kind)}"${on ? ' checked' : ''} />
          <span class="cat-kind-face" data-cat-kind-face="${esc(kind)}" aria-hidden="true">${pickerArt(kind, ui.look[kind], 'pick', pets[kind].worn)}</span>
          <span class="cat-kind-text"><strong>${esc(defOf(kind).title)}</strong><span class="${C.muted}" data-cat-kind-name="${esc(kind)}">${esc(names[kind])}</span></span>
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
  const keep = placeFailed()
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
  snap().save.presence.unsaved.length > 0
    ? 'Не сохранилось в этом браузере: действует на этой странице до перезагрузки.'
    : `${ui.presence === 'on-call' ? `Лапка «${CALL}»${T.call}. ` : ''}${offline() ? OFFLINE : `Хранится в этом браузере; общее для ${petsGen()}.`}`;

// Открытый уголок — на месте, без пересоздания.
function syncPresenceBox() {
  for (const input of ui.sheet?.querySelectorAll('input[name="cat-presence"]') ?? []) input.checked = input.value === ui.presence;
  const note = ui.sheet?.querySelector('[data-cat-presence-note]');
  if (note && note.textContent !== presenceNote()) note.textContent = presenceNote();
  syncPlaceBox();
}

// Сменилось (кнопкой, прямой командой или в другой вкладке — onCore → reflect): места — тихо; открытый диалог, источник и
// черновик — как были, закрытый по зову — без рисунка. Сценку, задачи покоя («на виду» — заново, ушёл — ничего не
// доигрывает) и запись решает ядро.
function applyPresence() {
  cancelMove('presence');
  const focused = focusedControl();
  renderAll();
  if (!around()) {
    dropShown();
    clearSheet();
  }
  syncPresenceBox();
  keepFocus(focused);
}

function choosePresence(mode) {
  if (!P.PRESENCES.some((item) => item.id === mode) || mode === ui.presence) return;
  const result = ui.core.setPresence(mode);
  if (!result.ok) return;
  ui.core.activity();
  announce(`${P.PRESENCES.find((item) => item.id === mode).title}.${result.save.status === 'failed' ? ' Не сохранилось в этом браузере — действует до перезагрузки.' : ''}`);
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
  const who = defOf();
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
      <summary>Настройки ${who.forms.gen}</summary>
      <fieldset class="cat-motion">
        <legend>Движение</legend>
        ${R.MOTIONS.map(([id, label]) => `<label><input type="radio" name="cat-motion" value="${id}"${s.motion === id ? ' checked' : ''} /> ${label}</label>`).join('')}
        <p class="${C.muted} cat-note" data-cat-reduced${ui.reduced?.matches ? '' : ' hidden'}>В системе включено «уменьшить движение» — ${who.title.toLowerCase()} без анимации, состояния видны позами.</p>
      </fieldset>
      ${viewHtml()}
      <label class="cat-check"><input type="checkbox" name="cat-phrases"${s.phrases ? ' checked' : ''} /> Короткие реплики</label>
      <p class="${C.muted} cat-note" data-cat-store>${esc(storeNote())}</p>
      <button class="${C.alt} cat-hide" type="button" data-cat-hide>Скрыть ${who.forms.acc}</button>
    </details>`;
}

// Целиком — только при открытии, пока в уголке нечего терять.
function renderSheet(fresh = []) {
  if (!ui.sheet) return;
  ui.sheet.querySelector('#cat-sheet-title').textContent = name();
  ui.sheet.querySelector('[data-cat-sub]').textContent = `Ступень «${ui.info.current.title}»`;
  ui.namePage = R.namePageOf(defOf().names.presets, name());
  ui.treatLater = false;
  ui.sheet.querySelector('[data-cat-body]').innerHTML = bodyHtml(fresh);
  ui.sheetStage = ui.info.stage;
  paintCorner();
  showScenePhrase();
  paint();
}

// Вещи, которых ещё не видели (подсветка в сцене), — от увиденной ступени до текущей (снимок ядра).
const unseenItems = () => (snap().progress?.unseen ? snap().progress.fresh : []);

// Открытый уголок после изменения знаков или ступени: адресно — знаки, «сегодня», шкала, что дальше; если ступень не та,
// что показана (ui.sheetStage), — подзаголовок, сцена, «Новое в уголке», ступени и аксессуары. Сравнение — с показанной:
// её может поднять seenStage из другой вкладки раньше, чем придут знаки. Новое — то, что ядро отметило увиденным при
// открытом уголке (ui.fresh), иначе ещё не увиденное (в «Поиграть» и редакторе уголок скрыт — ядро отметит при возврате).
// Поле имени, фокус, раскрытые блоки, прокрутка, реплика и текущая реакция не трогаются.
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
  const fresh = ui.fresh.length ? ui.fresh : unseenItems();
  ui.fresh = [];
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

// «Покормить»: решение, запись и реакция «ест» → «доволен» — ядро (день заново, отметка до реакции — второго лакомства
// нет; объявление — его эффект по итогу записи). Карточка и поза — по снимку (onCore, как у прямой команды pet.feed);
// фокус — на новом действии карточки. Отказ (сегодня ещё нет занятия, уже угостили — другая вкладка, полночь) — карточка
// по свежему счёту сайта.
function feed() {
  const result = ui.core.feed();
  if (!result.ok) refreshInfo();
  syncTreat({ focus: true });
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

// Готовое имя (или «Оставить …»): тот же путь ядра, что публичный pet.setName (правило 'preset': отклик named с паузой
// повтора 4 с и объявление «Имя: …» — ядро, и когда имя то же); имя везде — по снимку (onCore). Здесь — предложение
// исчезает, подборка — на странице выбранного, фокус — на его кнопке. Знаков нет.
function pickName(value) {
  const chosen = R.cleanName(value);
  if (!chosen) return;
  ui.core.setName(chosen, { pick: 'preset' });
  const page = R.namePageOf(defOf().names.presets, chosen);
  const turn = page !== ui.namePage;
  ui.namePage = page;
  syncNameField({ force: true });
  syncNamePick({ chips: turn, offer: true });
  showName();
  const chip = [...(ui.sheet?.querySelectorAll('[data-cat-names] [data-cat-name-pick]') ?? [])].find((item) => item.dataset.catNamePick === chosen);
  if (chip && document.activeElement !== chip) chip.focus({ preventScroll: true });
}

// «Другие имена»: следующая страница подборки по кругу; фокус остаётся на этой кнопке.
function moreNames() {
  ui.namePage = (ui.namePage + 1) % R.namePageCount(defOf().names.presets);
  syncNamePick({ chips: true });
  announce(`Другие имена: ${R.namePage(defOf().names.presets, ui.namePage).join(', ')}.`);
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
  for (const kind of ui.drawn) {
    const label = ui.sheet?.querySelector(`[data-cat-kind-name="${CSS.escape(kind)}"]`);
    if (label && label.textContent !== names[kind]) label.textContent = names[kind];
  }
}

// Открытие кнопкой — команда ядра open (кнопка-источник — для возврата фокуса); разметку рисует подписка (openMarkup), как
// при прямой команде pet.core.open. source (до закрытия): pet — уголок; call — сразу «Поиграть».
function openSheet(opener, source = 'pet') {
  if (!ui.sheet || ui.sheet.open || ui.settings.hidden) return;
  // Диалог уже закрыл браузер (Esc), а его событие close ещё не пришло: сначала то же закрытие вида ядром, затем открытие.
  if (ui.sheetOpen) closeSheet({ restore: false });
  cancelMove('sheet');
  ui.intent = { opener };
  try {
    ui.core.open(source === 'call' ? 'play' : 'corner', { source });
  } finally {
    ui.intent = null;
  }
}

// Вид открыт ядром (кнопкой или прямой командой open): облик и счёт перечитаны ядром, новая ступень уголка увидена (её
// вещи — эффект seen: подсветка в сцене и «Новое в уголке»); «Поиграть» и редактор из закрытого — вид до showModal, уголок
// под ними скрыт (его новое ядро отметит при возврате), без приветствия и движения «заметил гостя» при вызове. Реплика вида
// по позе до пробуждения, пробуждение, задачи покоя и отмена сценки — ядро; здесь — разметка, фокус, прокрутка (диалог
// модальный: страница под ним не прокручивается — html.cat-open), aria-expanded. Кнопка возврата фокуса — открывшая
// (ui.intent) или видимый вход питомца (прямая команда).
function openMarkup(state) {
  const want = state.view.open;
  cancelMove('sheet');
  ui.opener = ui.intent?.opener ?? openers().find(shown) ?? null;
  // Облик — по снимку ядра (изменение другой вкладки ядро уже поглотило; подсказка о сохранении верна).
  const was = coat();
  ui.look = lookOf(state);
  if (coat() !== was) applyCoat();
  showProgress();
  ui.sheetOpen = true;
  const fresh = want === 'corner' ? ui.fresh : unseenItems();
  ui.fresh = [];
  renderSheet(fresh);
  ui.sheetY = window.scrollY;
  document.documentElement.classList.add('cat-open');
  for (const button of openers()) button.setAttribute('aria-expanded', 'true');
  if (want === 'play') {
    playMarkup();
    ui.playY = 0;
  } else if (want === 'room') {
    roomMarkup();
    ui.roomY = 0;
  }
  ui.sheet.showModal();
  // Прокрутку закрытого уголка браузер помнит — новое открытие сверху, со сценой.
  ui.sheet.querySelector('[data-cat-body]').scrollTop = 0;
  ui.sheet.querySelector(want === 'play' ? '[data-cat-play-close]' : want === 'room' ? '[data-room-pick="rest"]' : '[data-cat-close]')?.focus();
}

// Закрытие отображением (кнопка, Esc, затемнение, переход, перенос, legacy pet.close) — команда ядра close, разметку
// снимает подписка (closeMarkup) с этим restore; прямая команда pet.core.close — с возвратом фокуса и прокрутки. Закрытие —
// один раз: событие close после закрытия кодом уже ничего не делает. Ядро уже закрыло вид само — разметка вслед.
function closeSheet({ restore = true } = {}) {
  if (!ui.sheet || !ui.sheetOpen) return;
  ui.closing = { restore };
  try {
    ui.core.close();
  } finally {
    ui.closing = null;
  }
  if (ui.sheetOpen) closeMarkup({ restore });
}

// Вид закрыт ядром: «Поиграть» и редактор сняты, диалог закрыт; по зову питомец ушёл — рисунка нет. restore — фокус на
// открывшую кнопку (или питомца на новом месте) и прежняя прокрутка страницы.
function closeMarkup({ restore = true } = {}) {
  unplayMarkup({ restore: false });
  unroomMarkup({ restore: false });
  ui.sheetOpen = false;
  ui.fresh = [];
  if (ui.sheet.open) ui.sheet.close();
  document.documentElement.classList.remove('cat-open');
  for (const button of openers()) button.setAttribute('aria-expanded', 'false');
  // По зову рисунка нет.
  if (!around()) {
    dropShown();
    clearSheet();
  }
  if (!restore) return;
  if (window.scrollY !== ui.sheetY) window.scrollTo(0, ui.sheetY);
  // Место могло смениться, пока уголок был открыт, — тогда фокус на питомце на новом месте.
  const target = ui.opener?.isConnected && shown(ui.opener) ? ui.opener : fallbackFocus();
  target?.focus({ preventScroll: true });
}

// Открытый вид ядра → разметка диалога (каждое обновление; переданный слушателю снимок мог устареть — берётся
// getState()). Закрыт — диалог закрыт; открыт из закрытого — диалог с нужным видом; смена вида — снять прежний («Поиграть»,
// редактор; возврат в уголок — фокус на его кнопку и прежняя прокрутка уголка), разметить новый. Команд не вызывает.
function syncView(state) {
  if (!ui.sheet) return;
  const want = state.view.open;
  if (want === null) {
    if (ui.sheetOpen) closeMarkup({ restore: ui.closing?.restore ?? true });
    return;
  }
  if (!ui.sheetOpen) {
    openMarkup(state);
    return;
  }
  if (want !== 'play' && ui.play) unplayMarkup({ restore: want === 'corner' });
  if (want !== 'room' && ui.room) unroomMarkup({ restore: want === 'corner' });
  if (want === 'play' && !ui.play) playMarkup();
  if (want === 'room' && !ui.room) roomMarkup();
}

// ---------- сцена «Поиграть» ----------
// Вид того же диалога (одна ловушка фокуса): уголок скрыт, его прокрутка и поля целы. Выход — playBack: из уголка — в
// уголок, вызванная — к странице. Смысл — ядро (PL04.3): прямые действия, жест поглаживания, лимиты, места предметов, итог
// под сценой и момент его сброса, объявления; здесь — разметка, указатель (pet-play.mjs, pet-toys.mjs), подсказка, место
// под итог и фокус. Миска не кормит. Ничего не хранится.

const PLAY_HINT = 'Проведи по питомцу, чтобы погладить';
const playState = () => snap().play;

// Вызванная — ещё «Уголок».
function playHtml() {
  const said = snap().scenePhrase;
  return `<div class="cat-play-head">
      <h2 id="cat-play-title"><span class="${C.sr}">Поиграть: </span><span data-cat-play-name>${esc(name())}</span></h2>
      ${openedBy() === 'call' ? `<button class="${C.close} cat-play-corner" type="button" data-cat-play-corner aria-label="Уголок ${defOf().forms.gen}">Уголок</button>` : ''}
      <button class="${C.close}" type="button" data-cat-play-close aria-label="Закрыть игру">Закрыть</button>
    </div>
    <div class="cat-play-note">
      <p class="cat-play-hint" data-cat-play-hint>${PLAY_HINT}</p>
      <span class="cat-play-fit" data-cat-play-fit aria-hidden="true">${fitHtml()}</span>
    </div>
    <div class="cat-play-stage" data-play-stage>
      <div class="cat-play-pet" data-play-pet data-kind="${esc(ui.kind)}">${managed(art({ id: `${ui.kind}-play`, view: 'full' }))}${hitsHtml(defOf())}</div>
      <span class="cat-play-floor" data-play-floor aria-hidden="true"></span>
      <p class="cat-scene-say cat-play-say" data-cat-phrase${said && ui.settings.phrases ? '' : ' hidden'}><span>${esc(said)}</span></p>
      <span class="cat-play-touch" data-play-touch aria-hidden="true"></span>
      <div class="cat-play-toys" aria-hidden="true">
        <span class="cat-play-toy" data-play-toy="bowl">${bowlToySvg(ui.treat)}</span>
        <span class="cat-play-toy" data-play-toy="ball">${ballToySvg()}</span>
      </div>
    </div>
    <div class="cat-play-actions">
      <button class="${C.alt}" type="button" data-cat-play-pet>Погладить</button>
      ${defOf().actions.paw ? `<button class="${C.alt}" type="button" data-cat-play-paw>${defOf().actions.paw.ask ? 'Дай лапу' : 'Коснуться лапы'}</button>` : ''}
      <button class="${C.alt}" type="button" data-cat-play-bowl>${bowlLabel()}</button>
      <button class="${C.alt}" type="button" data-cat-play-ball>Катнуть мячик</button>
    </div>`;
}

// Миска на исходном месте — снимок ядра (play.toys.bowl.home).
const bowlLabel = () => ((playState()?.toys.bowl.home ?? true) ? 'Подвинуть миску' : 'Вернуть миску');

// Сцена заново (вход, другой напарник из другой вкладки): жест отменяется, фокус — на ту же кнопку, если она есть.
function renderPlay() {
  const view = ui.sheet.querySelector('[data-cat-play-view]');
  const focus = view.contains(document.activeElement) ? [...document.activeElement.attributes].find((item) => item.name.startsWith('data-cat-play'))?.name : '';
  cancelStroke('render');
  unmountToys('render');
  later('play-nudge', null);
  view.innerHTML = playHtml();
  mountToys(view);
  syncPlay();
  if (focus) (view.querySelector(`[${focus}]`) ?? view.querySelector('[data-cat-play-pet]')).focus({ preventScroll: true });
}

// «Поиграть» кнопкой уголка — команда ядра open('play'): «Поиграть» будит, сценка отменена, предметы на исходных местах;
// разметку рисует подписка (playMarkup), как при прямой команде.
function enterPlay() {
  if (!ui.sheetOpen || ui.play || ui.settings.hidden) return;
  ui.core.open('play');
}

// Вид «Поиграть» открыт ядром (вызов входит сюда до showModal). Сначала вид сцены, затем разметка: пол меряется по
// настоящим рамкам сразу (pet-toys.mjs).
function playMarkup() {
  if (ui.play) return;
  ui.playY = ui.sheet.querySelector('[data-cat-body]').scrollTop;
  ui.play = true;
  ui.sheet.dataset.view = 'play';
  renderPlay();
  ui.sheet.setAttribute('aria-labelledby', 'cat-play-title');
  ui.sheet.querySelector('[data-cat-play-close]').focus();
  paint();
}

// Назад в уголок кнопкой («Уголок» после вызова, «Закрыть» и Esc из уголка) — команда ядра open('corner'): уголок снова
// виден, новая ступень увидена (в том числе после вызова по зову); разметку снимает подписка (unplayMarkup).
function leavePlay() {
  if (!ui.play) return;
  ui.core.open('corner');
}

// «Поиграть» больше не открыта: жест и подсказка снимаются, сцена очищается (рисунка и обработчиков не остаётся).
// restore — возврат в уголок: точка «новое» по снимку, фокус на «Поиграть» и прежняя прокрутка уголка; без него — диалог
// закрывают целиком или открывают другой вид.
function unplayMarkup({ restore = true } = {}) {
  if (!ui.play) return;
  cancelStroke('close');
  unmountToys('close');
  later('play-nudge', null);
  ui.play = false;
  delete ui.sheet.dataset.view;
  ui.sheet.setAttribute('aria-labelledby', 'cat-sheet-title');
  ui.sheet.querySelector('[data-cat-play-view]').innerHTML = '';
  if (restore) showProgress();
  paint();
  if (!restore) return;
  ui.sheet.querySelector('[data-cat-body]').scrollTop = ui.playY;
  ui.sheet.querySelector('[data-cat-play]')?.focus({ preventScroll: true });
}

// «Закрыть», Esc, затемнение: вызванная — к странице, из уголка — в уголок.
const playBack = () => (openedBy() === 'call' ? closeSheet() : leavePlay());

// Невидимые образцы подсказки и всех итогов с этим именем (тексты ядра) — в той же ячейке, что подсказка: место по самому
// длинному, и итог не сдвигает питомца под пальцем.
function fitHtml() {
  return [PLAY_HINT, ...Object.values(playTexts(defOf(), name()))].map((text) => `<span>${esc(text)}</span>`).join('');
}

// Сцена по снимку ядра: итог под сценой (play.outcome, текст с именем — play.text) вместо подсказки, пока ядро его держит;
// подпись кнопки миски; места предметов (pet-toys.mjs).
function syncPlay() {
  const view = ui.play ? ui.sheet?.querySelector('[data-cat-play-view]') : null;
  if (!view?.firstElementChild) return;
  const play = playState();
  const hint = view.querySelector('[data-cat-play-hint]');
  if (hint) {
    const text = play?.outcome ? play.text : PLAY_HINT;
    if (hint.textContent !== text) hint.textContent = text;
    if (play?.outcome) {
      later('play-nudge', null);
      delete hint.dataset.nudge;
      hint.dataset.result = '';
    } else delete hint.dataset.result;
  }
  const button = view.querySelector('[data-cat-play-bowl]');
  if (button && button.textContent !== bowlLabel()) button.textContent = bowlLabel();
  drawToys();
}

// Кнопки сцены и клавиатура — прямые действия ядру (interact): итог, объявление и лимит — ядро; сцена — по снимку
// (onCore → syncPlay), как у прямой команды pet.interact.
function playAct(action) {
  ui.core.interact(action);
}

// Нажатие на питомца без движения — не поглаживание: подсказка коротко выделяется (подсветка — таймер отображения).
function nudgeHint() {
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

// Кнопки уголка «Погладить» и у собаки «Дай лапу» — обычный запрос ядру (interact вне «Поиграть»): лимит частоты, тишина и
// очередь — ядро, итога под сценой и объявления нет (как 0.1.4).
const pet = () => ui.core.interact({ type: 'pet' });
const paw = () => defOf().actions.paw?.ask && ui.core.interact({ type: 'paw' });

// ---------- «Обустроить уголок» ----------
// Третий вид диалога. Черновик, перенос, выбор, шаг, обычная расстановка, сохранение, отмена и чужая расстановка — ядро
// (команды room.*, снимок room.draft); здесь — разметка, кнопки и стрелки, указатель (pet-room.mjs), фокус и прокрутка,
// строки состояния редактора и итог над сценой уголка.

// Направление: стрелка и кнопка (итог шага и упор объявляет ядро).
const ROOM_DIRS = { left: ['←', 'Влево'], right: ['→', 'Вправо'], up: ['↑', 'Выше'], down: ['↓', 'Ниже'] };
const ROOM_KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

const draftNow = () => snap().room.draft;
const roomTitle = (id) => Room.itemTitle(roomOf(), id, ui.sheetStage);
// Черновик как раскладка (live — с идущим переносом под указателем).
function roomLayout(live = true) {
  const draft = draftNow();
  if (!draft) return null;
  const pos = live && draft.drag ? { ...draft.pos, [draft.drag.id]: draft.drag.at } : draft.pos;
  return { model: roomOf(), stage: ui.sheetStage, pos, pick: draft.pick };
}

function roomHtml() {
  const ids = Object.keys(draftNow()?.pos ?? {});
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
      <div class="cat-room-pad" role="group" aria-labelledby="cat-room-chosen">${DIR_IDS.map((dir) => `<button class="${C.alt}" type="button" data-room-move="${dir}"><span aria-hidden="true">${ROOM_DIRS[dir][0]}</span> ${ROOM_DIRS[dir][1]}</button>`).join('')}</div>
    </div>
    <div class="cat-room-more">
      <p class="${C.muted} cat-note cat-room-keys">Стрелки клавиатуры двигают выбранный предмет, когда фокус на этих кнопках.</p>
      <button class="${C.link} cat-room-reset" type="button" data-room-reset>Вернуть обычную расстановку</button>
      <p class="${C.muted} cat-note">${offline() ? OFFLINE : 'Расстановка сохраняется в этом браузере.'}<span data-room-bowl> Миска появится в уголке после занятия — на этом месте.</span></p>
    </div>
    <div class="cat-room-actions">
      <p class="cat-room-other" data-room-other hidden>${ROOM_TEXT.other}</p>
      <p class="cat-room-error" data-room-error hidden>${ROOM_TEXT.failed}</p>
      <p class="cat-room-state" data-room-state></p>
      <button class="${C.alt}" type="button" data-room-cancel>Отмена</button>
      <button class="${C.btn}" type="button" data-room-save>Сохранить</button>
    </div>`;
}

// Черновик из снимка — на рисунке и в кнопках: места (идущий перенос — под указателем), выбор, доступные направления, что
// не сохранено, другая вкладка, отказ записи.
function paintDraft() {
  const view = ui.room ? ui.sheet.querySelector('[data-cat-room-view]') : null;
  const draft = draftNow();
  if (!view?.firstElementChild || !draft) return;
  const layout = roomLayout();
  Room.paintRoom(view.querySelector('.cat-scene-art'), layout, snap().room.feedShift);
  view.querySelector('[data-room-stage]').toggleAttribute('data-moving', Room.moving() && Boolean(draft.drag));
  for (const hit of view.querySelectorAll('[data-room-hit]')) {
    if (!(hit.dataset.roomHit in layout.pos)) continue;
    hit.style.cssText = Room.hitStyle(layout, hit.dataset.roomHit);
    hit.toggleAttribute('data-on', hit.dataset.roomHit === draft.pick);
  }
  for (const button of view.querySelectorAll('[data-room-pick]')) button.setAttribute('aria-pressed', String(button.dataset.roomPick === draft.pick));
  view.querySelector('[data-room-chosen]').textContent = `Передвинуть: ${roomTitle(draft.pick).toLowerCase()}`;
  for (const button of view.querySelectorAll('[data-room-move]')) button.setAttribute('aria-disabled', String(!draft.can.includes(button.dataset.roomMove)));
  view.querySelector('[data-room-state]').textContent = draft.changed.length ? `Не сохранено: ${draft.changed.map((id) => roomTitle(id).toLowerCase()).join(', ')}` : 'Изменений нет';
  view.querySelector('[data-room-other]').hidden = !draft.other;
  view.querySelector('[data-room-error]').hidden = !draft.failed;
  view.querySelector('[data-room-bowl]').hidden = ui.treat !== 'waiting';
}

// Редактор заново (вход, новая ступень): фокус — на ту же кнопку.
function renderRoom() {
  const view = ui.sheet.querySelector('[data-cat-room-view]');
  const had = view.contains(document.activeElement) ? [...document.activeElement.attributes].find((item) => item.name.startsWith('data-room-')) : null;
  view.innerHTML = roomHtml();
  paintDraft();
  paint();
  if (had) (view.querySelector(`[${had.name}="${had.value}"]`) ?? view.querySelector(`[data-room-pick="${draftNow()?.pick}"]`))?.focus({ preventScroll: true });
}

// «Обустроить уголок» кнопкой — команда ядра open('room'): редактор будит, сценка отменена, черновик — из сохраняемой
// расстановки; разметку рисует подписка (roomMarkup), как при прямой команде.
function enterRoom() {
  if (!ui.sheet?.open || ui.play || ui.room || ui.settings.hidden) return;
  ui.core.open('room');
}

// Вид редактора открыт ядром (из уголка или прямой командой из закрытого — до showModal).
function roomMarkup() {
  if (ui.room) return;
  ui.roomY = ui.sheet.querySelector('[data-cat-body]').scrollTop;
  ui.room = true;
  ui.sheet.dataset.view = 'room';
  renderRoom();
  ui.sheet.setAttribute('aria-labelledby', 'cat-room-title');
  ui.sheet.querySelector('[data-room-pick="rest"]').focus();
}

// Разметка редактора снята (ядро уже вышло из него: сохранение, отмена, другой питомец, закрытие, другой вид): перенос
// указателем отпущен, комната уголка — по сохраняемой; restore — фокус на входе и прокрутка уголка.
function unroomMarkup({ restore = true } = {}) {
  if (!ui.room) return;
  Room.cancelArrange('close');
  ui.room = false;
  delete ui.sheet.dataset.view;
  ui.sheet.setAttribute('aria-labelledby', 'cat-sheet-title');
  ui.sheet.querySelector('[data-cat-room-view]').innerHTML = '';
  if (restore) showProgress();
  paintCorner();
  paint();
  if (!restore) return;
  ui.sheet.querySelector('[data-cat-body]').scrollTop = ui.roomY;
  ui.sheet.querySelector('[data-cat-room]')?.focus({ preventScroll: true });
}

// Итог над сценой уголка (гаснет); объявление — эффект ядра.
function roomDone(text) {
  const done = ui.sheet.querySelector('[data-cat-room-done]');
  if (!done || !text) return;
  done.textContent = text;
  done.hidden = false;
  later('room-done', 4000, () => (done.hidden = true));
}

// «Сохранить» — ядру (тот же путь, что прямая команда pet.room.save): идущий перенос не дописывается; без изменений или
// записано — ядро выходит в уголок (разметка и итог над сценой — подписка, onCore); отказ — редактор открыт, черновик цел,
// сообщение об ошибке (снимок).
function saveRoom() {
  if (!ui.room) return;
  Room.cancelArrange('save');
  ui.core.room.save();
}

// «Отмена», Esc, затемнение: черновик отброшен, вид — уголок (ядро; разметка — подписка).
function cancelRoom() {
  if (!ui.room) return;
  Room.cancelArrange('close');
  ui.core.room.cancel();
}

// Обычная расстановка — в черновик ядра (постоянной — после «Сохранить»); черновик на рисунке — по снимку.
function resetRoom() {
  if (!ui.room) return;
  Room.cancelArrange('reset');
  ui.core.room.reset();
}

function pickRoom(id) {
  if (!ui.room || Room.arranging()) return;
  ui.core.room.select(id);
}

// Кнопка или стрелка: шаг ядра (итог и упор объявляет ядро).
function moveRoom(dir) {
  if (!ui.room || Room.arranging()) return;
  ui.core.room.nudge(dir);
}

// Стрелки — только с фокусом на кнопках предметов и направлений.
function onRoomKey(event) {
  const dir = ROOM_KEYS[event.key];
  if (!dir || !ui.room || event.altKey || event.ctrlKey || event.metaKey || !event.target.closest?.('[data-room-keys]')) return;
  event.preventDefault();
  moveRoom(dir);
}

// Новая ступень при открытом редакторе: черновик пересчитан ядром (лежанка, мячик), перенос отменён, записи нет; здесь —
// разметка на новой ступени.
function restageRoom() {
  Room.cancelArrange('stage');
  renderRoom();
}

// Esc в «Поиграть» или редакторе: сначала идущий перенос (указатель и ядро — room.dragCancel), иначе редактор — отмена
// всего (room.cancel), сцена — playBack.
function escapeSub() {
  if (ui.room && Room.arranging()) Room.cancelArrange('escape');
  else if (ui.room && draftNow()?.drag) ui.core.room.dragCancel();
  else if (ui.room) cancelRoom();
  else playBack();
}

// Перенос указателем (pet-room.mjs): раскладка черновика для выбора под точкой — снимок ядра; перенос — команды ядра.
const roomHooks = {
  layout: () => (ui.room ? roomLayout(false) : null),
  drag: safe((id, point) => ui.core.room.drag(id, point)),
  drop: safe(() => ui.core.room.drop()),
  cancel: safe(() => ui.core.room.dragCancel()),
};

// «Скрыть»: ядро закрывает вид, снимает реакции, облако, сценку и все свои задачи (с полуночью), но помнит обработанные
// события, причины тишины и паузы повторов до отключения (исправление Р1). Здесь — закрытие диалога, места, таймеры показа
// (проверка конца ввода остаётся), объявление (называет свою кнопку «Показать …» и texts.back сайта) и фокус.
// Закрытие диалога без возврата и места «спрятан» — подписка (onCore → setShown), как при прямой команде pet.hide.
function hideCat() {
  cancelMove('hide');
  ui.core.hide();
  stopDecor();
  announce(`${name()} спрятан. Вернуть — «${returnLabel()}»${T.back}.`);
  fallbackFocus()?.focus({ preventScroll: true });
}

// «Показать»: поверхность по присутствию (по зову — лапка, игра не открывается), покой и полночь заново — ядро (без
// приветствия); места — подписка (как при прямой команде pet.show); здесь — знаки сайта заново (пока питомец спрятан,
// update() ничего не делает — как 0.1.4), фокус, объявление.
function showCat() {
  ui.core.show();
  refreshInfo();
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
// ждёт отложенной записи. Свой ввод — тихо, и когда совпал с готовым именем (внутренний pick: false, как 0.1.4); имя
// везде — по снимку (onCore → showName).
function onSheetInput(event) {
  const field = event.target;
  if (field.name !== 'cat-name') return;
  ui.core.setName(field.value, { pick: false });
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
  syncPlay();
  const label = ui.dock?.querySelector('[data-cat-name]');
  if (label) label.textContent = name();
  // Имя — и в подарке первой ступени, в выборе напарника и в готовых именах.
  const steps = ui.sheet?.open ? ui.sheet.querySelector('[data-cat-steps]') : null;
  if (steps) steps.innerHTML = stageListHtml(ui.info);
  if (ui.sheet?.open) {
    syncKindNames();
    syncNamePick();
  }
  // Подписи кнопок мест с именем — по снимку.
  showProgress();
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
    // Аксессуар на портретах и рисунках — по снимку (onCore), как у прямой команды pet.setAppearance.
    ui.core.setAppearance({ accessory: field.value });
  } else if (field.name === 'cat-motion' && field.checked) {
    // Новый режим: сценка отменена, интервалы покоя заново — ядро; поза и режим рисунков — по снимку.
    ui.core.setPreferences({ motion: field.value });
  } else if (field.name === 'cat-phrases') {
    // Выключены — облако и реплика вида исчезают (ядро; показ — по снимку).
    ui.core.setPreferences({ phrases: field.checked });
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

// Системное «уменьшить движение»: режим пересчитан в ядре (сценка отменена, интервалы покоя заново), выбор в настройках
// не меняется; подсказка в уголке — по факту.
function onReducedChange() {
  ui.core.setReducedMotion(Boolean(ui.reduced.matches));
  paint();
  const note = ui.sheet?.querySelector('[data-cat-reduced]');
  if (note) note.hidden = !ui.reduced.matches;
}

// ---------- выбор напарника ----------

// Выбрали в уголке: команда ядра (другие вкладки переключатся тоже); прежний не доигрывает, новый здоровается (meet) —
// ядро; показ нового — подписка (onCore → switchKind), как при прямой команде pet.setPet.
function chooseKind(kind) {
  if (kind === ui.kind || !ui.core.setPet(kind).ok) return;
  // Фокус — на выбранном (переключатель перерисован вместе с уголком): Tab и стрелки работают дальше.
  ui.sheet?.querySelector('input[name="cat-kind"]:checked')?.focus({ preventScroll: true });
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

// Прежний напарник (или ушедший по зову) не доигрывает на странице: таймеры показа снимаются. Реакцию, отложенную,
// облако, примерку, вещь, сценку и задачи снимает ядро; тишина и уже отыгранные события (память ядра) остаются, полночь
// ядро оставляет.
function dropShown() {
  stopDecor();
}

// Спрятали или вернули (возможно, вместе со сменой вида) — кнопкой, прямой командой или в другой вкладке: места целиком
// по снимку, без приветствия, объявлений и записей. Спрятан — диалог закрыт без возврата (вид закрыло ядро), мест и
// рисунков нет; вернули — выбранный напарник везде.
function setShown(kind, next) {
  cancelMove('hide');
  // Фокус был в диалоге, который закрывается (прямая команда pet.hide или другая вкладка при открытом уголке), — не в
  // никуда: на «Показать …» (кнопка «Скрыть» уголка ставит его сама).
  const inside = Boolean(next.hidden && ui.sheetOpen && ui.sheet?.contains(document.activeElement));
  if (next.hidden && ui.sheetOpen) closeMarkup({ restore: false });
  // После закрытия уголка фокус у кнопки, которая его открыла, — её тоже перерисуют.
  const focused = focusedControl();
  dropShown();
  ui.kind = kind;
  ui.settings = next;
  clearSheet();
  renderAll();
  keepFocus(focused);
  const active = document.activeElement;
  if (inside && (!active || active === document.body || !shown(active))) fallbackFocus()?.focus({ preventScroll: true });
}

// Показать другого напарника при неизменном «скрыт»: прогресс, знаки и общие настройки те же — смена не даёт знаков и
// праздников. Кнопки мест те же; открытый уголок перерисовывается с тем же раскрытием, прокруткой и фокусом.
function switchKind(kind, next) {
  if (!ui.defs.has(kind) || !ui.kits.has(kind) || kind === ui.kind) return;
  cancelMove('kind');
  release('kind');
  // Редактор закрывается без сохранения черновика (ядро уже вышло из него в уголок).
  unroomMarkup();
  const memo = sheetMemo();
  dropShown();
  ui.kind = kind;
  ui.settings = next;
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
  showProgress();
  if (memo) restoreSheet(memo);
  else clearSheet();
  if (ui.play) renderPlay();
  paint();
}

// Закрытый уголок нарисуется заново при открытии — прежний рисунок в нём не остаётся.
function clearSheet() {
  if (ui.sheet && !ui.sheet.open) ui.sheet.querySelector('[data-cat-body]').innerHTML = '';
}

const artFor = (place, view = 'full') => art({ id: `${ui.kind}-${place}`, view: view === 'full' ? 'full' : 'portrait' });

// Рисунки мест — по показанному напарнику, облику и виду места: заменяется только отличающийся (фокус не теряется).
function syncHostArts() {
  // У рисунка кота 0.1.4 атрибута data-kind нет — это кот.
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
// Распознавание ввода в поля страницы (focusin, focusout и проверка через 250 мс) и действий пользователя — здесь; тишина
// (причина typing), её снятие, отложенная реакция, пробуждение и отсчёт покоя — ядро.

const isTextField = (element) => Boolean(element?.matches?.(TEXT_INPUT)) && !element.closest('.cat-sheet');

function onFocusIn(event) {
  ui.lostEntry = false;
  if (!isTextField(event.target)) return;
  // Ввод (и при уже идущей тишине ввода) — ядро отменяет сценку: она не начнётся и конца ввода не ждёт.
  ui.core.setContext({ typing: true });
}

// Фокус ушёл в никуда со спрятанного входа — вернёт applyLayout.
function onFocusOut({ target, relatedTarget }) {
  if (!relatedTarget && openers().includes(target) && !shown(target)) ui.lostEntry = true;
  later('typing', 250, () => {
    if (!isTextField(document.activeElement)) ui.core.setContext({ typing: false });
  });
}

// Действие пользователя (нажатие, клавиша, колесо, касание, прокрутка) — ядру: пробуждение, отсчёт покоя заново (не чаще
// раза в 500 мс).
function onActivity() {
  ui.core.activity();
}

// Фон и возврат — ядру (setVisible): в фоне реакция, облако, примерка, вещь, сценка и задачи сняты; при возврате —
// дремота после долгого отсутствия, новый день и лакомство, задачи заново, без приветствия. Здесь — показ.
function onVisibility() {
  document.documentElement.classList.toggle('cat-paused', document.hidden);
  if (document.hidden) {
    // Таймеры показа прежнего не доигрывают; итог «Поиграть» сменяет подсказка (ядро — по фону).
    stopDecor();
    ui.core.setVisible(false);
    return;
  }
  ui.core.setVisible(true);
  if (!ui.mounted || ui.settings.hidden) return;
  // Пока вкладка была в фоне, мог наступить новый день или другая вкладка — угостить; окно — измениться.
  applyLayout();
  showProgress();
  syncTreat();
  syncLearn();
  paint();
}

// Что из снимка показывает оболочка: облик, лакомство, счёт и ступень, присутствие, место и вид (ключ place), настройки
// (напарник, «скрыт», имена, аксессуары, движение, реплики, увиденная ступень, сохранность).
function views(state) {
  return {
    look: JSON.stringify([lookOf(state), state.save.look]),
    treat: JSON.stringify([state.treat, state.save.treat, state.progress]),
    presence: JSON.stringify([state.presence.mode, state.save.presence]),
    place: JSON.stringify([state.place, state.save.place]),
    settings: JSON.stringify([state.pet, state.behavior, ...Object.values(state.pets).map((own) => [own.name, own.accessory]), state.prefs, state.presence.hidden, state.progress?.seenStage, state.progress?.seenKnown, state.save.cat, state.save.companion, state.save.ext]),
  };
}

// Отображение догоняет снимок ядра — после любой команды (кнопки отображения, прямые pet.* и pet.core.* хоста), задачи ядра
// и изменения хранилища (другая вкладка, найденное сверкой перед командой, § 5.5, шаг 1а): один путь правил — ядро, здесь
// только показ. Тихо (без объявлений и переноса фокуса, кроме исчезнувшего): облик; карточка лакомства, знаки и ступень
// открытого уголка («Новое в уголке» — по эффекту seen); присутствие (места; открытый диалог и черновик — как были);
// другой напарник или «скрыт»; имя, аксессуар, движение, реплики; открытый вид. Место и вид legacy-раскладки (ключ place)
// публичной командой не меняются: по снимку — только изменение другой вкладки (своё показывает выбор места, с
// «устроился»). Команд ядра не вызывает, кроме объявления сменившейся раскладки (syncDisplay). was — снимок, по которому
// оболочка уже показана; state — текущий (getState(): переданный слушателю мог устареть).
function reflect(was, state, reason) {
  const shown = views(was);
  const now = views(state);
  if (shown.look !== now.look) {
    ui.look = lookOf(state);
    applyCoat();
  }
  if (shown.treat !== now.treat && !ui.settings.hidden) {
    showProgress();
    syncSheet();
    paint();
  }
  if (shown.presence !== now.presence) {
    if (state.presence.mode !== ui.presence) applyPresence();
    else syncPresenceBox();
  }
  // Во время переноса между местами — после него (onMoveEnd).
  if (reason === 'storage' && shown.place !== now.place) {
    ui.place = readPlace();
    applyLayout();
  }
  if (shown.settings !== now.settings) {
    syncStoreNote();
    // Другой напарник, «скрыт» или «показан» — места и открытый уголок заново (applyShown).
    if (!applyShown()) {
      ui.settings = readSettings();
      showName();
      // Облако и реплика вида, сценка и покой — ядро, показ — здесь.
      render();
      // Открытый уголок согласован с сохранённым: переключатели, имя, аксессуар на портретах, ступень (seenStage).
      syncControls();
      syncPickerAcc();
      syncSheet();
    }
  }
  syncView(state);
}

// Обновление ядра — каждое (команда, сработавшая задача ядра, изменение хранилища): поза, облако, вещь рядом и реплика вида
// — по снимку (render); новая реакция с той же позой в «Поиграть» — её движения заново (data-again); остальное показанное
// — reflect. Эффекты: объявления (кормление, праздник ступени, имя, комната), вещи новой увиденной ступени (seen — «Новое в
// уголке»), предупреждение о повреждённом значении ключа при загрузке, одиночное движение покоя (micro), «устроился»
// (arrive). Редкая сценка — реакция ядра (data-scene по снимку). Ядро отключили напрямую (pet.core.destroy(), в том числе
// из порта или слушателя) — экземпляр снимается целиком, как pet.destroy() (lost).
function onCore({ effects, reason }) {
  if (!ui.mounted) return;
  if (reason === 'destroyed') {
    ui.lost?.();
    return;
  }
  const state = snap();
  for (const effect of effects) if (effect.type === 'seen') ui.fresh = [...new Set([...ui.fresh, ...effect.items])];
  const reaction = state.pose.reaction;
  if (reaction && reaction.id !== ui.reaction) {
    ui.reaction = reaction.id;
    // Та же поза в сцене (гладят дальше) — её движения заново.
    for (const art of ui.sheet?.querySelectorAll('.cat-play .cat-art') ?? []) if (art.dataset.pose === reaction.pose) art.toggleAttribute('data-again');
  }
  const was = ui.mirror;
  ui.mirror = state;
  if (was && was !== state && !ui.booting) reflect(was, state, reason);
  render();
  // Ядро сняло жест поглаживания, перенос предмета или перенос в редакторе само (вид, питомец, облик, фон, новая ступень):
  // указатель отпускается, его поздний конец ядру безвреден. Сцена, черновик и комната уголка — по снимку.
  strokeLost(state.play?.stroke?.id ?? null);
  if (toyDragging() && state.play?.drag?.toy !== toyDragging()) toyLost();
  if (Room.arranging() && !state.room.draft?.drag) Room.cancelArrange('lost');
  if (ui.sheet?.open) {
    syncPlay();
    paintDraft();
    paintCorner();
  }
  // Новый местный день (задача ядра): учебный шаг открытого уголка (знаки и лакомство — reflect).
  if (reason === 'midnight') syncLearn();
  for (const effect of effects) {
    if (effect.type === 'announce') announce(effect.text);
    else if (effect.type === 'warning' && effect.code === 'corrupt') console.warn(corruptNote(K[effect.key]));
    else if (effect.type === 'micro') showMicro(effect.kind, effect.ms);
    else if (effect.type === 'arrive') startArrive();
  }
  // «Сохранить» вывело в уголок (кнопкой или прямой командой room.save): итог — над сценой уголка.
  if (reason === 'room.save' && state.view.open === 'corner') roomDone([...effects].reverse().find((effect) => effect.type === 'announce')?.text ?? '');
  // Вещи, не показанные этим обновлением, не переходят в следующее.
  ui.fresh = [];
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

// Питомцы, модели и наборы подключения (PL06): options.pets и options.behaviors — определения (по умолчанию штатные кот,
// собака и calm), options.kits — наборы сторонних питомцев (у кота и собаки — штатные, если свой не передан). Проверка —
// invalid() до любых действий; здесь — уже проверенные. Рисуются питомцы, у которых есть набор.
function catalogOf(options) {
  const defs = register(options.pets ?? STOCK_PETS, options.behaviors ?? STOCK_BEHAVIORS);
  const pets = new Map(defs.pets.map((def) => [def.id, def]));
  const kits = new Map();
  for (const kit of [...STOCK_KITS, ...(options.kits ?? [])]) if (pets.has(kit.pet)) kits.set(kit.pet, kit);
  return { defs, pets, kits, drawn: defs.pets.map((def) => def.id).filter((id) => kits.has(id)) };
}

// lost — снять весь экземпляр (pet.destroy() этого подключения), если ядро отключат напрямую (pet.core.destroy()).
function start(options, lost) {
  ui = initial();
  ui.abort = new AbortController();
  ui.lost = lost;
  O = options;
  K = R.storageKeys(options.storage);
  C = { ...CLASSES, ...options.classes };
  const catalog = catalogOf(options);
  ui.defs = catalog.pets;
  ui.kits = catalog.kits;
  ui.drawn = catalog.drawn;
  ui.rooms = new Map([...catalog.pets.values()].map((def) => [def.id, roomModel(def)]));
  T = { ...TEXTS, rules: ['Знаки дают занятия на сайте. Оценки и пропуски знаков не отнимают: открытые вещи остаются.', `Лакомство дня открывает первое занятие за день. Одно кормление в день — общее для ${petsGen()}.`], ...options.texts };
  // Хранение: общий координатор пространства имён (загрузка — все девять ключей) и своё подключение ядра; день редкой
  // сценки — резервирование IndexedDB того же пространства (общее для ядер). Ядро создаётся без записей; первое включение
  // и приветствие — core.start ниже.
  const storage = createWebStorage({ namespace: options.storage ?? 'pet' });
  loadStorage(storage);
  const owner = ui;
  ui.core = createPetCore({ storage, scenes: createWebScenes({ namespace: options.storage ?? 'pet' }), progress, pets: catalog.defs.pets, behaviors: catalog.defs.behaviors, log: { warn: (message, error) => coreWarn(owner, message, error) } });
  ui.mirror = snap();
  // Только своё ядро и только этот экземпляр: поздний вызов прежнего подключения новый не трогает.
  ui.core.subscribe(safe((update) => ui === owner && onCore(update)), { initial: false });
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
  initMover({ zones: zoneList, same: sameLayout, ghost: () => (syncDisplay(), art({ id: `${ui.kind}-ghost`, view: 'portrait' })), label: moveLabel, cancel: C.alt, end: safe(onMoveEnd) }, ui.abort.signal);

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
      else if (event.target.closest('[data-cat-play-pet]')) playAct({ type: 'pet' });
      else if (event.target.closest('[data-cat-play-paw]')) playAct({ type: 'paw' });
      else if (event.target.closest('[data-cat-play-bowl]')) playAct({ type: 'bowl', to: (playState()?.toys.bowl.home ?? true) ? 'near' : 'home' });
      else if (event.target.closest('[data-cat-play-ball]')) playAct({ type: 'ball', to: 'roll' });
      else if (event.target.closest('[data-play-hit]')) nudgeHint();
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
  // Жест сцены и предметы — смысловые входы ядра (stroke.*, interact, toy.*); пол сцены — объявление отображения.
  initPlay({ start: safe(() => ui.core.stroke.start().id ?? null), step: safe((id) => ui.core.stroke.step(id)), end: safe((id) => ui.core.stroke.end(id)), cancel: safe((id) => ui.core.stroke.cancel(id)), paw: safe(() => playAct({ type: 'paw' })), motion, figure: (kind) => ui.defs.get(kind) ?? null }, ui.abort.signal);
  initToys({ play: playState, drag: safe((toy, at) => ui.core.toy.drag(toy, at)), drop: safe((roll) => ui.core.toy.drop(roll === undefined ? undefined : { roll })), cancel: safe(() => ui.core.toy.cancel()), floor: safe((floor, touch) => ui.core.setDisplay({ playFloor: floor, playTouch: touch })), motion, width: () => defOf()?.size.width ?? 220 });
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

  ui.mounted = true;
  ui.booting = true;
  document.documentElement.classList.toggle('cat-paused', document.hidden);
  // До запуска ядро знает, что видно и что умеет отображение: системное «уменьшить движение», видимость вкладки,
  // нарисованные питомцы, виды и сценки (явное объявление legacy, § 11.1). Присутствие и «на виду» — ядра (ключ presence).
  ui.core.setReducedMotion(Boolean(ui.reduced.matches));
  ui.core.setVisible(!document.hidden);
  ui.core.setDisplay(legacyDisplay());
  // Ядро: первое включение (история — молча) и приветствие дня — решение и неявная запись; покой, полночь и приветствие
  // (через 0,9 с; после паузы в два дня и больше — спокойное «рад, что ты здесь», без упрёков) — его задачи; спрятан и
  // «по зову» — без приветствия. Отказ запуска (progress() сайта бросил) — отказ подключения: mountPet откатит всё.
  ui.starting = true;
  const started = ui.core.start();
  ui.starting = false;
  if (!started.ok) throw ui.startError ?? new Error(started.error.message);
  ui.settings = readSettings();
  renderAll({ reread: true });
  // Показано по снимку — дальше обновления ядра догоняет reflect.
  ui.mirror = snap();
  ui.booting = false;
  if (ui.settings.hidden) return;
  if (isTextField(document.activeElement)) ui.core.setContext({ typing: true });
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
// Отложенное прежнего экземпляра сверяется с ui и ничего не делает. Тот же путь — и при pet.core.destroy() (onCore → lost):
// mounted снимается первым, поэтому обновление 'destroyed' своего ядра сюда не возвращается.
function destroy() {
  ui.mounted = false;
  ui.lost = null;
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
  // Переданный флаг меняется, непереданный сохраняется (ядро: контекст и независимые причины тишины).
  const context = {};
  for (const key of ['focus', 'timer', 'dictation', 'dialog']) if (key in flags) context[key] = Boolean(flags[key]);
  // Открылся важный диалог — перенос питомца отменяется.
  if (context.dialog) cancelMove('dialog');
  ui.core.setContext(context);
}

// Подтверждённое занятие (detail — { key, counted, hard, first }; null — запись не учебная). Решение и реакция — ядро:
// знаки заново, первое включение, радость или поддержка (повтор key в экземпляре — без реакции), праздник новой ступени
// (не в «Поиграть» и редакторе) с отметкой увиденной, продолжение с новой вещью, подсказка про миску, попытка редкой
// сценки; спрятан или «по зову» и закрыт — только числа. Показ (числа, открытый уголок, «Новое в уголке» по эффекту seen) —
// подписка, как у прямой команды pet.core.notify. Событие без key — как 0.1.4 (Р2): ядру — ключ String(detail.key) через
// внутреннюю границу legacy (scene: false по исходному key: сценки нет, пустой ключ допустим); публичный notify ядра
// требует непустой key.
function saved(detail) {
  const event = detail ? { key: String(detail.key), counted: Boolean(detail.counted), hard: Boolean(detail.hard), first: Boolean(detail.first) } : null;
  ui.core.notify('saved', event, { scene: Boolean(detail?.key) });
}

// Занятие не сохранилось: награды нет, только нейтральное ожидание (решение и реакция — ядро); ошибку показывает сайт.
function failed() {
  ui.core.notify('failed', null);
}

let current = null;

// Один питомец на странице — и для разных копий модуля (файлы по другому адресу — другой модуль браузера): владелец —
// globalThis[Symbol.for('pet-module')] = { version, busy, destroy }. Копии без реестра (до 0.1.2) видны по своим id.
const PAGE = Symbol.for('pet-module');
const IDS = ['cat-sheet', 'cat-live', 'cat-dock', 'cat-side', 'cat-float', 'cat-bar'];

// Настройки, с которыми подключаться нельзя (README, «Отказ подключения»): проверка до любых действий. PL06: pets и
// behaviors — определения (ошибка определения — его код и путь), kits — наборы: без определения, неполный, повтор
// питомца — отказ; хотя бы один питомец с набором.
function invalid(o) {
  const p = o?.places;
  if (!p || typeof p !== 'object') return 'нет places';
  for (const key of ['logo', 'top']) if (typeof p[key] !== 'function') return `places.${key} — обязательная функция`;
  for (const key in p) if (p[key] != null && typeof p[key] !== 'function') return `places.${key} — не функция`;
  for (const key of ['progress', 'step', 'go', 'zone', 'home']) if (o[key] != null && typeof o[key] !== 'function') return `${key} — не функция`;
  if (!(o.storage === undefined || (typeof o.storage === 'string' && o.storage))) return 'storage — непустая строка';
  let defs;
  try {
    defs = register(o.pets ?? STOCK_PETS, o.behaviors ?? STOCK_BEHAVIORS);
  } catch (error) {
    return error?.code ? `${error.code}: ${error.message}` : error;
  }
  if (o.kits !== undefined && !Array.isArray(o.kits)) return 'kits — массив наборов отображения';
  const pets = new Map(defs.pets.map((def) => [def.id, def]));
  const seen = new Set();
  for (let i = 0; i < (o.kits ?? []).length; i += 1) {
    if (!Object.hasOwn(o.kits, i)) return `kits[${i}] — пропуск в массиве`;
    const problem = kitProblem(o.kits[i], pets);
    if (problem) return `kits[${i}]: ${problem}`;
    if (seen.has(o.kits[i].pet)) return `kits[${i}]: второй набор питомца «${o.kits[i].pet}»`;
    seen.add(o.kits[i].pet);
  }
  const drawn = defs.pets.filter((def) => seen.has(def.id) || STOCK_KITS.some((kit) => kit.pet === def.id));
  return drawn.length ? '' : 'ни у одного питомца из pets нет набора отображения (kits)';
}

// Отказ команды у экземпляра, который так и не подключился (у отключённого — свой результат ядра, тоже destroyed).
const unmounted = () => ({ ok: false, error: { code: 'destroyed', message: 'Питомец не подключён.' } });

// Подключить питомца (README модуля, «Подключение»). Один активный питомец: новое подключение сначала отключает прежнее (и
// другой копии модуля), методы прежнего после этого ничего не делают. Отказ (неверные настройки, подключение изнутри
// подключения, чужие id, нет document — не браузер, исключение сайта при запуске) — console.error, откат всего созданного,
// pet.mounted === false.
// С PL05: pet.core — публичный экземпляр ядра этого подключения (pet-companion/core; null, пока не подключён и при отказе;
// после отключения — тот же отключённый экземпляр); дополнительные методы pet.* — те же команды ядра (pet.setName ===
// pet.core.setName по смыслу и результату). Совпавшие по имени update, notify, open, close, destroy остаются legacy и
// возвращают undefined. Команда ядра и кнопка уголка показываются одним путём (подписка onCore); pet.core.destroy()
// отключает всё, как pet.destroy().
export function mountPet(options = {}) {
  let entry = null;
  let core = null;
  // Команда ядра этого подключения: до подключения и при отказе — destroyed без действий; методы не зависят от this.
  const forward = (get) => (...args) => (core ? get(core)(...args) : unmounted());
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
    get core() {
      return core;
    },
    getState: () => (core ? core.getState() : null),
    subscribe: (listener, options) => (core ? core.subscribe(listener, options) : () => {}),
    refresh: forward((c) => c.refresh),
    setContext: forward((c) => c.setContext),
    setName: forward((c) => c.setName),
    setPet: forward((c) => c.setPet),
    setBehavior: forward((c) => c.setBehavior),
    setAppearance: forward((c) => c.setAppearance),
    setPreferences: forward((c) => c.setPreferences),
    setPresence: forward((c) => c.setPresence),
    hide: forward((c) => c.hide),
    show: forward((c) => c.show),
    feed: forward((c) => c.feed),
    interact: forward((c) => c.interact),
    stroke: Object.freeze({ start: forward((c) => c.stroke.start), step: forward((c) => c.stroke.step), end: forward((c) => c.stroke.end), cancel: forward((c) => c.stroke.cancel) }),
    toy: Object.freeze({ drag: forward((c) => c.toy.drag), drop: forward((c) => c.toy.drop), cancel: forward((c) => c.toy.cancel) }),
    room: Object.freeze(Object.fromEntries(['select', 'move', 'nudge', 'reset', 'drag', 'drop', 'dragCancel', 'save', 'cancel'].map((name) => [name, forward((c) => c.room[name])]))),
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
    why = invalid(options) || (globalThis[PAGE]?.busy ? 'подключение уже идёт (mountPet из функции сайта)' : '') || (typeof document === 'undefined' ? 'нет document — mountPet подключается только в браузере' : '');
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
    start(options, () => pet.destroy());
    core = exposed(ui.core);
  } catch (error) {
    pet.destroy();
    refuse(error);
  }
  entry.busy = false;
  return pet;
}
