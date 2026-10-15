// Веб: общая оболочка отображения одного экземпляра (этап PL07; до PL07 — тело pet/pet.mjs на уровне модуля). Один диалог
// в трёх видах (уголок, «Поиграть», «Обустроить уголок»), рисунки по снимку ядра, реакции и объявления, ввод страницы
// (тишина typing), видимость вкладки, «уменьшить движение», жесты сцены и редактора. Всё состояние — в замыкании
// createShell: настройки (O), ключи (K), классы (C), тексты (T), элементы, таймеры, слушатели, подписка ядра, указатель,
// жесты, наблюдатели — на экземпляр (Р3 устранено): два контейнера и legacy-подключение на одной странице друг друга не
// трогают; поздние таймеры, кадры и колбэки отключённого экземпляра проверяют свой ui.mounted.
//
// Где показан питомец рядом со страницей, — поверхность (surface): legacy-места mountPet (web/legacy/places.mjs: места
// сайта, раскладка и перенос, отметки на <html>, блокировка прокрутки) или контейнер mountPetIn (web/view.mjs: свой
// элемент и открытый Shadow DOM, размеры по контейнеру, onOpenChange). Поверхность получает контекст оболочки (ctx) и
// отдаёт ей свои входы (S). Правила — только ядро (core/index.mjs): оболочка распознаёт события страницы и указатель,
// объявляет ядру свои возможности (setDisplay), передаёт смысловые входы и показывает его снимок и эффекты. Кнопки и
// прямые команды хоста показываются одним путём — подпиской onCore по снимку (reflect, syncView).

import { bowlArt, bowlMiniSvg, bowlToySvg, miniItemSvg, sceneCatBox, sceneSvg } from '../cat-art.mjs';
import { resolvePose } from '../core/define.mjs';
import { ROOM_DIRS as DIR_IDS, ROOM_TEXT } from '../core/editor.mjs';
import { createPetCore, fieldLabel } from '../core/index.mjs';
import { playTexts } from '../core/play.mjs';
import { roomModel } from '../core/room.mjs';
import { ballToySvg } from '../dog-art.mjs';
import { PRESENCES } from '../pet-place.mjs';
import * as R from '../pet-rules.mjs';
import * as Room from '../pet-room.mjs';
import { createStroke, hitsHtml, paintHits } from '../pet-play.mjs';
import { createToys } from '../pet-toys.mjs';
import { kitScenes } from './kits.mjs';
import { BOWL_ICON, CALL, esc, fragment, managed, PAW_ICON, ROOM_ICON, safe, shown, TEXT_INPUT } from './parts.mjs';
import { createPointer } from './pointer.mjs';

const REDUCED = '(prefers-reduced-motion: reduce)';
const VIEWS = ['corner', 'play', 'room'];

// Классы кнопок и служебных элементов — сайта (options.classes, legacy) или pet-base.css.
export const CLASSES = Object.freeze({ btn: 'pet-btn', alt: 'pet-btn pet-btn-alt', small: 'pet-btn-small', link: 'pet-link', close: 'pet-close', sr: 'pet-sr', muted: 'pet-muted' });
// Тексты, зависящие от сайта (options.texts, legacy).
export const TEXTS = Object.freeze({
  wait: 'Одно занятие — и можно угостить.',
  // Второе правило — с подписями питомцев подключения (petsGen): «общее для кота и собаки».
  rules: null,
  origin: 'Знаки и вещи даёт сайт и совпадают везде.',
  back: '',
  call: '',
});

const OFFLINE = 'Хранилище этого браузера недоступно: изменения действуют на этой странице до перезагрузки и не сохраняются.';
const corruptNote = (key) => `Питомец: значение ${key} повреждено — показаны значения по умолчанию; оно не перезаписывается, пока эту настройку не изменят.`;
// Ключи настроек питомцев: общие и кот — cat, собака — companion, сторонние и модель — ext.
const SETTING_KEYS = ['cat', 'companion', 'ext'];

// Новая вещь или миска рядом с питомцем — рисунок слота (вещь заменяется, только когда другая).
const miniShown = new WeakMap();

const initial = () => ({
  mounted: false,
  abort: null, // снимает все слушатели экземпляра при отключении
  core: null, // ядро этого подключения (createPetCore): все девять ключей, решения, реакции, виды, игра и комната
  mirror: null, // снимок ядра, по которому оболочка уже показана (любое обновление — разница с ним, onCore → reflect)
  booting: false, // идёт подключение: обновления ядра до первой отрисовки мест — только эффекты, без reflect
  lost: null, // ядро отключили напрямую (core.destroy()) — снять весь экземпляр
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
  restore: null, // legacy: «Показать …» в разметке сайта или лапкой
  sheet: null,
  live: null,
  opener: null,
  timers: {}, // таймеры отображения: конец микродвижения, подсветка касания «Поиграть», ввод (typing), имя, итог редактора
  said: new Set(), // ждущие объявления (announce)
  reaction: 0, // номер реакции ядра, уже показанной (новая с той же позой в «Поиграть» — движения заново)
  info: R.progressInfo(0),
  sheetStage: -1, // ступень, которую сейчас показывает открытый уголок (ui.info.stage может уйти вперёд)
  treat: 'waiting', // лакомство дня: waiting / ready / fed (снимок ядра)
  treatLater: false, // карточку лакомства не перерисовывали, пока вводят имя
  learnLater: false, // учебный шаг не обновляли, пока вводят имя
  sheetOpen: false, // диалог открыт (закрытие — один раз: событие close после закрытия кодом ничего не делает)
  fresh: [], // вещи, которые ядро отметило увиденными при открытом уголке (refresh), — для «Новое в уголке» (syncSheet)
  namePage: 0, // страница готовых имён в открытом уголке
  play: false, // открыта сцена «Поиграть» (вместо уголка в том же диалоге)
  playY: 0, // прокрутка уголка до сцены — вернуть при выходе
  escLeft: false, // Esc уже закрыл сцену — тот же Esc не закрывает уголок
  escHeld: false, // Esc, закрывший сцену, ещё нажат — его автоповтор не закрывает уголок
  room: false, // открыт редактор «Обустроить уголок» (разметка вида; черновик и перенос — ядро, снимок room.draft)
  roomY: 0, // прокрутка уголка до редактора — вернуть при выходе
  presence: 'always', // показанное присутствие (снимок ядра presence.mode): always | on-call
  pointer: null, // общий указатель отображения (web/pointer.mjs)
  stroke: null, // жест «Поиграть» (pet-play.mjs)
  toys: null, // миска и мячик (pet-toys.mjs)
  arrange: null, // перенос в редакторе (pet-room.mjs)
});

// Оболочка одного экземпляра. spec = { options, catalog ({ defs, pets, kits, drawn }), storage (внутренний координатор),
// scenes (резервирование дня сценки), classes, texts, surface(ctx) → S, lost() — снять весь экземпляр, когда ядро
// отключили напрямую }. Возвращает входы для фасада: ui, start, destroy, update, saved, failed, openSheet, closeSheet,
// openers, fallback.
export function createShell(spec) {
  const ui = initial();
  const O = spec.options;
  const K = R.storageKeys(spec.namespace);
  const C = { ...CLASSES, ...spec.classes };
  const catalog = spec.catalog;
  // Ввод страницы (тишина typing): legacy — всегда, контейнер — по options.watchTyping (по умолчанию да).
  const typing = spec.watchTyping !== false;
  let T = { ...TEXTS };
  let S = null;

  // Слушатель, который снимет отключение (у старых MediaQueryList addEventListener нет — без слушателя, как раньше).
  const on = (target, type, fn, options = {}) => target?.addEventListener?.(type, fn, { ...options, signal: ui.abort.signal });

  // ---------- хранение ----------
  // Все девять ключей — ядро (снимок, команды, общий координатор web/storage.mjs): оболочка ключи не читает и не пишет.
  // Отказ загрузки любого из девяти ключей (координатор) запрещает записи всего подключения. README, «Хранение».

  // Загрузка при подключении — координатор (все девять ключей пространства; повторно — барьер и сверка). Ключ не прочитался
  // (исключение хранилища) — подключение работает в памяти: показывает умолчания и ничего не пишет; новая попытка —
  // следующее подключение. Повреждённое значение — предупреждение эффектом ядра warning (onCore); неявные записи его не
  // трогают.
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

  // Подписи питомцев подключения в родительном падеже: «кота и собаки», «кота, собаки и кролика».
  function petsGen() {
    const list = ui.drawn.map((id) => ui.defs.get(id).forms.gen);
    return list.length > 1 ? `${list.slice(0, -1).join(', ')} и ${list.at(-1)}` : (list[0] ?? '');
  }

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
  // Элемент с фокусом в своей области (legacy — документ, контейнер — свой Shadow DOM).
  const active = () => S.active();

  // ---------- таймеры отображения ----------
  // Смысловые задачи (конец реакции и продолжение, облако, покой и дремота, полночь, приветствие, итог «Поиграть» и его
  // сброс) — у ядра (порт scheduler). Здесь — только показ: конец микродвижения, подсветка касания «Поиграть», проверка
  // ухода из поля ввода (typing, 250 мс), имя, итог над сценой уголка после редактора.

  function later(key, ms, fn) {
    clearTimeout(ui.timers[key]);
    if (ms === null || ms === undefined) return;
    ui.timers[key] = setTimeout(
      safe(() => ui.mounted && fn()),
      ms,
    );
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
    for (const item of arts()) item.dataset.micro = kind;
    later('micro-end', ms, () => {
      for (const item of arts()) delete item.dataset.micro;
    });
  }

  // ---------- поза ----------

  // Рисунки этого экземпляра — только в своих элементах (места или контейнер и свой диалог), не по всему документу.
  function arts() {
    return S.roots().flatMap((root) => (root ? [...root.querySelectorAll('.cat-art[data-cat-managed]')] : []));
  }

  // Поза — снимок ядра, итоговая для каждой поверхности (pose.shown): на странице — page (реакция, кроме сценки и прямого
  // действия «Поиграть» в тишине, иначе покой, внимание или дремота), в «Поиграть» — play (реакция не сценка, иначе
  // удержание жестом, иначе спокойная или довольная), в редакторе — room (спокойная или довольная, без реакций и сценок).
  // Редкая сценка — data-scene поверх позы покоя там, где её вариант читается (целиком или портрет) — выбор рисунка
  // отображения.
  function paint() {
    const state = snap();
    const { pose } = state;
    const reaction = pose.reaction;
    const scene = reaction?.scene ? reaction.type : '';
    const own = reaction && !scene ? reaction.pose : '';
    const acc = reaction?.tryOn || state.pets[ui.kind].worn;
    const move = state.prefs.effectiveMotion;
    const hushed = state.context.quiet.length > 0;
    // Тот же режим — всему интерфейсу питомца (legacy — отметка на <html>, контейнер — на своём элементе).
    S.markMotion(move);
    for (const item of arts()) {
      const inPlay = Boolean(item.closest('.cat-play'));
      // В редакторе питомец спокоен: без реакций и сценок.
      const inRoom = Boolean(item.closest('.cat-room'));
      const posed = drawnPose(inPlay ? pose.shown.play : inRoom ? pose.shown.room : pose.shown.page, state);
      item.dataset.pose = posed;
      // Только там, где сценка читается: клубок — у целого питомца (уголок открыт — портрет за ним остаётся в покое).
      if (scene && !inPlay && !inRoom && sceneReadable(scene, item.dataset.view === 'full')) item.dataset.scene = scene;
      else delete item.dataset.scene;
      // Куда смотрит в сцене (миска, мячик).
      if (inPlay && own && reaction.toward) item.dataset.toward = reaction.toward;
      else delete item.dataset.toward;
      item.dataset.acc = acc;
      item.dataset.motion = move;
      if (move === 'normal' && (inPlay || inRoom || !hushed) && !document.hidden) item.dataset.breathe = '';
      else delete item.dataset.breathe;
      if ((own && posed === own && !inRoom) || scene) delete item.dataset.micro;
    }
  }

  // ---------- реплики ----------
  // Реплику выбирает ядро: phrase — облако рядом с питомцем (поверхность: legacy — боковая панель и низ экрана, контейнер —
  // свой целый вид), scenePhrase — под сценой открытого вида.

  // Реплика под сценой уголка и в сцене «Поиграть»; реплики выключены — скрыта.
  function showScenePhrase() {
    const state = snap();
    for (const box of ui.sheet?.querySelectorAll('[data-cat-phrase]') ?? []) {
      box.hidden = !state.scenePhrase || !state.prefs.phrases;
      box.querySelector('span').textContent = state.scenePhrase;
    }
  }

  // Область объявлений рядом с питомцем, а пока открыт диалог — ещё и внутри него: всё под модальным окном выпадает из
  // дерева доступности. Куда писать — решается в момент записи (диалог могли закрыть за эти 80 мс). Ждущие объявления
  // снимает только отключение (said).
  function announce(text) {
    const boxes = () => [ui.live, ui.sheet?.open ? ui.sheet.querySelector('[data-cat-live-in]') : null].filter(Boolean);
    for (const box of [ui.live, ui.sheet?.querySelector('[data-cat-live-in]')]) if (box) box.textContent = '';
    const id = setTimeout(() => {
      ui.said.delete(id);
      if (!ui.mounted) return;
      for (const box of boxes()) box.textContent = text;
    }, 80);
    ui.said.add(id);
  }

  // ---------- реакции ----------
  // Проигрывает ядро (режиссёр, сроки, продолжения, реплика). Здесь — показ после каждого его обновления.

  function render() {
    paint();
    S.saying(snap().phrase);
    showMini();
    showScenePhrase();
  }

  // Новая вещь или миска рядом с питомцем на время реакции — её поле mini; рисунок вещи заменяется, только когда вещь
  // другая.
  function showMini() {
    const item = snap().pose.reaction?.mini ?? '';
    for (const slot of S.minis()) {
      if (!slot) continue;
      if (miniShown.get(slot) !== item) {
        slot.innerHTML = item === 'bowl' || item === 'bowl-empty' ? bowlMiniSvg({ full: item === 'bowl' }) : item ? kitOf().mini?.(item) || miniItemSvg(item) : '';
        miniShown.set(slot, item);
      }
      slot.classList.toggle('is-on', Boolean(item));
    }
  }

  // ---------- что умеет и показывает отображение (setDisplay) ----------
  // Возможности объявляются ядру явно, до start (docs/ARCHITECTURE.md § 11.1, § 11.2): питомцы — те, у кого есть набор,
  // виды, сценки — ровно нарисованные наборами и есть в определении (kitScenes; штатные — рисунки 0.1.4: кот — stretch,
  // curl, собака — fetch; без объявления сценок их не было бы, а не «были бы все»). Редкую сценку — выбор, попытку,
  // отмену, резервирование дня и показ — ведёт ядро; здесь только рисунок (data-scene по снимку) и факты раскладки:
  // целиком или портрет и идёт ли перенос между местами (поверхность).
  const displayOf = () => ({ pets: [...ui.drawn], views: VIEWS, scenes: Object.fromEntries(ui.drawn.map((id) => [id, kitScenes(kitOf(id), defOf(id))])) });

  // Раскладка: целиком ли питомец на странице и идёт ли перенос. Объявляется, только когда факт сменился: перерисовка по
  // снимку команду не повторяет.
  function syncDisplay() {
    const next = S.display();
    if (ui.declared?.full === next.full && ui.declared?.moving === next.moving) return;
    ui.declared = next;
    ui.core.setDisplay(next);
  }

  // ---------- прогресс: знаки от сайта ----------

  // Всего (marks), за сегодня (today), предел дня (limit — только для подписи) — сайт; читает ядро.
  const progress = () => ({ marks: 0, today: 0, ...O.progress?.() });

  // Знаки сайта, ступень и лакомство дня — заново в ядре (первое включение — молча, неявной записью ядра; открыт уголок —
  // новая ступень увидена, её вещи — эффект seen для «Новое в уголке»), затем показ.
  function refreshInfo() {
    ui.core.refresh();
    showProgress();
  }

  const openers = () => S.openers();
  const fallbackFocus = () => S.fallback();

  // Счёт, ступень и лакомство — по снимку ядра: точка «новое» и подписи кнопок, ступень у питомца; подсказка о
  // сохранении (неявная запись ядра — первое включение, отметка ступени — могла не удаться).
  function showProgress() {
    const state = snap();
    ui.info = infoOf(state);
    ui.treat = state.treat ?? 'waiting';
    syncStoreNote();
    labelOpeners();
    S.stage?.(ui.info.current.title);
  }

  // Входы диалога (питомец, лапка вызова) по снимку: точка «новое», доступное имя, aria-expanded. И после того, как
  // поверхность пересоздала вход (контейнер: облик, напарник, вид, присутствие), — новая кнопка не остаётся без имени.
  function labelOpeners() {
    const fresh = Boolean(snap().progress?.unseen);
    for (const button of openers()) {
      // У кнопки вызова точки нет.
      const call = button.hasAttribute('data-cat-call');
      button.querySelector('.cat-dot')?.toggleAttribute('hidden', call || !fresh);
      button.setAttribute('aria-label', call ? callLabel() : `${name()} — уголок ${defOf().forms.gen}${fresh ? ', есть новая вещь' : ''}`);
      button.setAttribute('aria-expanded', String(ui.sheetOpen));
    }
  }

  const callLabel = () => `${CALL}: ${name()}`;
  const callHtml = () =>
    `<button class="cat-call" type="button" data-cat-call aria-haspopup="dialog" aria-expanded="false" aria-controls="cat-sheet" aria-label="${esc(callLabel())}" title="${CALL}">${PAW_ICON}<span class="cat-call-text">${CALL}</span></button>`;
  const returnLabel = () => `Показать ${defOf().forms.acc}`;

  // Места (или контейнер) заново по снимку (присутствие, раскладка, имя, облик). reread — ещё и перечитать счёт сайта
  // (подключение); иначе только показ снимка: перерисовка из подписки команд ядра не вызывает, кроме объявления
  // сменившейся раскладки.
  function renderAll({ reread = false } = {}) {
    ui.presence = snap().presence.mode;
    S.render();
    ui.shownHidden = ui.settings.hidden;
    if (reread) refreshInfo();
    else showProgress();
    paint();
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
    <section class="cat-play" data-cat-play-view></section>
    <section class="cat-room" data-cat-room-view></section>
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
    return defOf()
      .accessories.map((item) => {
        const open = opened.includes(item.id);
        return `<label class="cat-acc-option${open ? '' : ' is-locked'}">
        <input type="radio" name="cat-acc" value="${item.id}"${item.id === worn ? ' checked' : ''}${open ? '' : ' disabled'} />
        <span class="cat-swatch cat-swatch-${item.id}" aria-hidden="true"></span>
        <span>${accessoryText(item, open)}</span>
      </label>`;
      })
      .join('');
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

  // Сцена ступени: общий уголок (место отдыха с питомцем, мебель ступеней), миска (в уголке — когда можно угостить и
  // после) и свои вещи питомца из набора — игрушки комнаты открытых ступеней (клубок кота; канат и со ступени «Наш
  // ритуал» мячик собаки) и вещи ступеней вне общего уголка. Расстановка — paintRoom после вставки. id — свой у уголка и
  // редактора.
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

  // ---------- следующий шаг на сайте (legacy: options.step) ----------
  // Одно главное действие от сайта: до занятия, после него и после лакомства. Переход — options.go (иначе обычная
  // ссылка); ничего не сохраняет и знаков не даёт. У контейнера шага нет.
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
    if (field && field === active()) {
      ui.learnLater = true;
      return;
    }
    ui.learnLater = false;
    const step = learnNow();
    const card = ui.sheet.querySelector('[data-cat-learn-card]');
    if (!step !== !card) {
      const had = card?.contains(active());
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
      <div class="cat-coat-list">${defOf()
        .coats.map(
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

  // Облик показанного напарника везде: рисунок заменяется только там, где облик другой (data-coat); кнопки мест те же —
  // фокус не теряется. Реакций, приветствия и знаков нет.
  function applyCoat() {
    const want = coat();
    S.coatChanged();
    const scene = ui.sheet?.open ? ui.sheet.querySelector('.cat-stage-wrap > .cat-scene-art > .cat-art') : null;
    if (scene && scene.dataset.coat !== want) {
      scene.replaceWith(fragment(scenePet(ui.sheetStage, 'scene')));
      paintCorner();
    }
    // Редактор: перенос отменён (ядро), черновик тот же.
    const roomPet = ui.room ? ui.sheet.querySelector('.cat-room .cat-scene-art > .cat-art') : null;
    if (roomPet && roomPet.dataset.coat !== want) {
      ui.arrange.cancel('look');
      roomPet.replaceWith(fragment(scenePet(ui.sheetStage, 'room')));
      paintDraft();
    }
    // Сцена «Поиграть»: идущий жест (с питомцем или предметом) отменяется, рисунок — в новом облике (области те же).
    const big = ui.play ? ui.sheet.querySelector('.cat-play-pet > .cat-art') : null;
    if (big && big.dataset.coat !== want) {
      ui.pointer.release('look');
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
  // что у прямой команды setAppearance); фокус остаётся на выбранном переключателе; объявление — по итогу записи.
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
    const current = name();
    return R.namePage(defOf().names.presets, ui.namePage)
      .map((item) => `<button class="cat-chip" type="button" data-cat-name-pick="${esc(item)}" aria-pressed="${item === current ? 'true' : 'false'}">${esc(item)}</button>`)
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

  // Шкала ступени — шириной через CSSOM (без атрибута style в разметке — строгий CSP).
  function paintMeter(width) {
    const fill = ui.sheet?.querySelector('.cat-meter > span');
    if (fill) fill.style.width = width;
  }

  // Выбор напарника: портреты, выбранный отмечен рамкой, галочкой и словом «рядом»; имя у каждого своё.
  function kindNames() {
    const pets = snap().pets;
    return Object.fromEntries(ui.drawn.map((id) => [id, pets[id].name.display]));
  }

  function kindHtml() {
    const names = kindNames();
    const pets = snap().pets;
    return `<fieldset class="cat-kind">
      <legend>Напарник</legend>
      <div class="cat-kind-list">${ui.drawn
        .map((kind) => {
          const on = kind === ui.kind;
          return `<label class="cat-kind-option">
          <input type="radio" name="cat-kind" value="${esc(kind)}"${on ? ' checked' : ''} />
          <span class="cat-kind-face" data-cat-kind-face="${esc(kind)}" aria-hidden="true">${pickerArt(kind, ui.look[kind], 'pick', pets[kind].worn)}</span>
          <span class="cat-kind-text"><strong>${esc(defOf(kind).title)}</strong><span class="${C.muted}" data-cat-kind-name="${esc(kind)}">${esc(names[kind])}</span></span>
          <span class="cat-kind-mark" aria-hidden="true">✓ рядом</span>
        </label>`;
        })
        .join('')}</div>
      <p class="${C.muted} cat-note">Знаки и открытые вещи общие: смена напарника их не меняет и новых не даёт.</p>
    </fieldset>`;
  }

  // «Присутствие»: применяется и хранится сразу.
  function presenceHtml() {
    return `<fieldset class="cat-place cat-presence">
      <legend>Присутствие</legend>
      <div class="cat-place-list">${PRESENCES.map(
          (item) =>
            `<label class="cat-place-option"><input type="radio" name="cat-presence" value="${item.id}"${item.id === ui.presence ? ' checked' : ''} /><span><strong>${item.title}</strong><span class="${C.muted}">${item.note}</span></span><span class="cat-place-mark" aria-hidden="true">✓</span></label>`,
        )
        .join('')}</div>
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
    S.syncPlaceBox();
  }

  // Сменилось (кнопкой, прямой командой или в другой вкладке — onCore → reflect): места — тихо; открытый диалог, источник и
  // черновик — как были, закрытый по зову — без рисунка. Сценку, задачи покоя («на виду» — заново, ушёл — ничего не
  // доигрывает) и запись решает ядро.
  function applyPresence() {
    S.cancelMove('presence');
    const focused = S.focused();
    renderAll();
    if (!around()) {
      dropShown();
      clearSheet();
    }
    syncPresenceBox();
    S.keep(focused);
  }

  function choosePresence(mode) {
    const item = PRESENCES.find((entry) => entry.id === mode);
    if (!item || mode === ui.presence) return;
    const result = ui.core.setPresence(mode);
    if (!result.ok) return;
    ui.core.activity();
    announce(`${item.title}.${result.save.status === 'failed' ? ' Не сохранилось в этом браузере — действует до перезагрузки.' : ''}`);
  }

  function bodyHtml(fresh) {
    const info = ui.info;
    const parts = progressParts();
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
      <p class="cat-progress-line" data-cat-line>${parts.line}</p>
      <div class="cat-meter" aria-hidden="true"${info.next ? '' : ' hidden'}><span></span></div>
      <p class="cat-next" data-cat-next>${esc(parts.next)}</p>
      <details class="cat-rules">
        <summary>Как появляются знаки и лакомство</summary>
        ${T.rules.map((text) => `<p>${esc(text)}</p>`).join('')}
        <ol class="cat-steps" data-cat-steps>${stageListHtml(info)}</ol>
      </details>
    </section>
    ${presenceHtml()}
    ${S.placeHtml()}
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
      ${S.viewHtml()}
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
    paintMeter(progressParts().width);
    ui.sheetStage = ui.info.stage;
    paintCorner();
    showScenePhrase();
    paint();
  }

  // Вещи, которых ещё не видели (подсветка в сцене), — от увиденной ступени до текущей (снимок ядра).
  const unseenItems = () => (snap().progress?.unseen ? snap().progress.fresh : []);

  // Открытый уголок после изменения знаков или ступени: адресно — знаки, «сегодня», шкала, что дальше; если ступень не
  // та, что показана (ui.sheetStage), — подзаголовок, сцена, «Новое в уголке», ступени и аксессуары. Сравнение — с
  // показанной: её может поднять seenStage из другой вкладки раньше, чем придут знаки. Новое — то, что ядро отметило
  // увиденным при открытом уголке (ui.fresh), иначе ещё не увиденное (в «Поиграть» и редакторе уголок скрыт — ядро
  // отметит при возврате). Поле имени, фокус, раскрытые блоки, прокрутка, реплика и текущая реакция не трогаются.
  function syncSheet() {
    if (!ui.sheet?.open) return;
    syncTreat();
    syncLearn();
    const parts = progressParts();
    ui.sheet.querySelector('[data-cat-line]').innerHTML = parts.line;
    const meter = ui.sheet.querySelector('.cat-meter');
    meter.hidden = !ui.info.next;
    paintMeter(parts.width);
    ui.sheet.querySelector('[data-cat-next]').textContent = parts.next;
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
    if (!focus && field && field === active()) {
      ui.treatLater = true;
      return;
    }
    ui.treatLater = false;
    const act = card.querySelector('[data-cat-treat-act]');
    const had = act.contains(active());
    const parts = treatParts();
    card.dataset.state = ui.treat;
    note.textContent = parts.note;
    act.innerHTML = parts.act;
    if (focus || had) act.firstElementChild?.focus({ preventScroll: true });
  }

  // «Покормить»: решение, запись и реакция «ест» → «доволен» — ядро (день заново, отметка до реакции — второго лакомства
  // нет; объявление — его эффект по итогу записи). Карточка и поза — по снимку (onCore, как у прямой команды feed); фокус
  // — на новом действии карточки. Отказ (сегодня ещё нет занятия, уже угостили — другая вкладка, полночь) — карточка по
  // свежему счёту сайта.
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
    if (!box || (!offer && field === active())) return;
    const inside = box.contains(active());
    box.hidden = snap().pets[ui.kind].name.chosen;
    if (inside && box.hidden) (list.querySelector('[aria-pressed="true"]') ?? field)?.focus({ preventScroll: true });
  }

  // Готовое имя (или «Оставить …»): тот же путь ядра, что публичный setName (правило 'preset': отклик named с паузой
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
    if (chip && active() !== chip) chip.focus({ preventScroll: true });
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
    if (!field || (!force && field === active())) return;
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

  // Открытие кнопкой — команда ядра open (кнопка-источник — для возврата фокуса); разметку рисует подписка (openMarkup),
  // как при прямой команде core.open. source (до закрытия): pet — уголок; call — сразу «Поиграть». Результат — команды ядра
  // (null, если открыть нельзя: диалог уже открыт, спрятан).
  function openSheet(opener, source = 'pet', view = null) {
    if (!ui.sheet || ui.sheet.open || ui.settings.hidden) return null;
    // Диалог уже закрыл браузер (Esc), а его событие close ещё не пришло: сначала то же закрытие вида ядром, затем открытие.
    if (ui.sheetOpen) closeSheet({ restore: false });
    S.cancelMove('sheet');
    ui.intent = { opener };
    try {
      return ui.core.open(view ?? (source === 'call' ? 'play' : 'corner'), { source });
    } finally {
      ui.intent = null;
    }
  }

  // Вид открыт ядром (кнопкой или прямой командой open): облик и счёт перечитаны ядром, новая ступень уголка увидена (её
  // вещи — эффект seen: подсветка в сцене и «Новое в уголке»); «Поиграть» и редактор из закрытого — вид до showModal,
  // уголок под ними скрыт (его новое ядро отметит при возврате), без приветствия и движения «заметил гостя» при вызове.
  // Реплика вида по позе до пробуждения, пробуждение, задачи покоя и отмена сценки — ядро; здесь — разметка, фокус,
  // прокрутка (legacy — страница под модальным окном не прокручивается, html.cat-open; контейнер — сообщает хосту
  // onOpenChange), aria-expanded. Кнопка возврата фокуса — открывшая (ui.intent) или видимый вход питомца (прямая
  // команда).
  function openMarkup(state) {
    const want = state.view.open;
    S.cancelMove('sheet');
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
    S.opened();
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
    S.changed(true);
  }

  // Закрытие отображением (кнопка, Esc, затемнение, переход, перенос, legacy pet.close) — команда ядра close, разметку
  // снимает подписка (closeMarkup) с этим restore; прямая команда core.close — с возвратом фокуса и прокрутки. Закрытие —
  // один раз: событие close после закрытия кодом уже ничего не делает. Ядро уже закрыло вид само — разметка вслед.
  // Результат — команды ядра (null, если диалог не открыт).
  function closeSheet({ restore = true } = {}) {
    if (!ui.sheet || !ui.sheetOpen) return null;
    ui.closing = { restore };
    let result;
    try {
      result = ui.core.close();
    } finally {
      ui.closing = null;
    }
    if (ui.sheetOpen) closeMarkup({ restore });
    return result;
  }

  // Вид закрыт ядром: «Поиграть» и редактор сняты, диалог закрыт; по зову питомец ушёл — рисунка нет. restore — фокус на
  // открывшую кнопку (или питомца на новом месте) и прежняя прокрутка страницы (legacy).
  function closeMarkup({ restore = true } = {}) {
    unplayMarkup({ restore: false });
    unroomMarkup({ restore: false });
    ui.sheetOpen = false;
    ui.fresh = [];
    if (ui.sheet.open) ui.sheet.close();
    S.closed({ restore });
    for (const button of openers()) button.setAttribute('aria-expanded', 'false');
    // По зову рисунка нет.
    if (!around()) {
      dropShown();
      clearSheet();
    }
    S.changed(false);
    if (!restore) return;
    // Место могло смениться, пока уголок был открыт, — тогда фокус на питомце на новом месте.
    const target = ui.opener?.isConnected && shown(ui.opener) ? ui.opener : fallbackFocus();
    target?.focus({ preventScroll: true });
  }

  // Открытый вид ядра → разметка диалога (каждое обновление; переданный слушателю снимок мог устареть — берётся
  // getState()). Закрыт — диалог закрыт; открыт из закрытого — диалог с нужным видом; смена вида — снять прежний
  // («Поиграть», редактор; возврат в уголок — фокус на его кнопку и прежняя прокрутка уголка), разметить новый. Команд не
  // вызывает.
  function syncView(state) {
    if (!ui.sheet) return;
    const want = state.view.open;
    if (want === null) {
      if (ui.sheetOpen) closeMarkup({ restore: ui.closing?.restore ?? true });
      return;
    }
    if (!ui.sheetOpen) {
      // Отображение сейчас не может показать диалог (контейнер вне документа или без размеров): вид закрывается ядром.
      if (!S.canOpen()) {
        ui.core.close();
        return;
      }
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
  // уголок, вызванная — к странице. Смысл — ядро (PL04.3): прямые действия, жест поглаживания, лимиты, места предметов,
  // итог под сценой и момент его сброса, объявления; здесь — разметка, указатель (pet-play.mjs, pet-toys.mjs), подсказка,
  // место под итог и фокус. Миска не кормит. Ничего не хранится.

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
    const focus = view.contains(active()) ? [...active().attributes].find((item) => item.name.startsWith('data-cat-play'))?.name : '';
    ui.stroke.cancel('render');
    ui.toys.unmount('render');
    later('play-nudge', null);
    view.innerHTML = playHtml();
    paintHits(view.querySelector('[data-play-pet]'), defOf());
    ui.toys.mount(view);
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
    // Подпись раздела — только у открытого вида (пустой раздел не ссылается на несуществующий заголовок).
    ui.sheet.querySelector('[data-cat-play-view]').setAttribute('aria-labelledby', 'cat-play-title');
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
  // restore — возврат в уголок: точка «новое» по снимку, фокус на «Поиграть» и прежняя прокрутка уголка; без него —
  // диалог закрывают целиком или открывают другой вид.
  function unplayMarkup({ restore = true } = {}) {
    if (!ui.play) return;
    ui.stroke.cancel('close');
    ui.toys.unmount('close');
    later('play-nudge', null);
    ui.play = false;
    delete ui.sheet.dataset.view;
    ui.sheet.setAttribute('aria-labelledby', 'cat-sheet-title');
    ui.sheet.querySelector('[data-cat-play-view]').removeAttribute('aria-labelledby');
    ui.sheet.querySelector('[data-cat-play-view]').innerHTML = '';
    if (restore) showProgress();
    paint();
    if (!restore) return;
    ui.sheet.querySelector('[data-cat-body]').scrollTop = ui.playY;
    ui.sheet.querySelector('[data-cat-play]')?.focus({ preventScroll: true });
  }

  // «Закрыть», Esc, затемнение: вызванная — к странице, из уголка — в уголок.
  const playBack = () => (openedBy() === 'call' ? closeSheet() : leavePlay());

  // Невидимые образцы подсказки и всех итогов с этим именем (тексты ядра) — в той же ячейке, что подсказка: место по
  // самому длинному, и итог не сдвигает питомца под пальцем.
  function fitHtml() {
    return [PLAY_HINT, ...Object.values(playTexts(defOf(), name()))].map((text) => `<span>${esc(text)}</span>`).join('');
  }

  // Сцена по снимку ядра: итог под сценой (play.outcome, текст с именем — play.text) вместо подсказки, пока ядро его
  // держит; подпись кнопки миски; места предметов (pet-toys.mjs).
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
    ui.toys.draw();
  }

  // Кнопки сцены и клавиатура — прямые действия ядру (interact): итог, объявление и лимит — ядро; сцена — по снимку
  // (onCore → syncPlay), как у прямой команды interact.
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

  // Кнопки уголка «Погладить» и у собаки «Дай лапу» — обычный запрос ядру (interact вне «Поиграть»): лимит частоты, тишина
  // и очередь — ядро, итога под сценой и объявления нет (как 0.1.4).
  const petAct = () => ui.core.interact({ type: 'pet' });
  const pawAct = () => defOf().actions.paw?.ask && ui.core.interact({ type: 'paw' });

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
    view.querySelector('[data-room-stage]').toggleAttribute('data-moving', ui.arrange.moving() && Boolean(draft.drag));
    for (const hit of view.querySelectorAll('[data-room-hit]')) {
      if (!(hit.dataset.roomHit in layout.pos)) continue;
      Room.paintHit(hit, layout, hit.dataset.roomHit);
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
    const focus = active();
    const had = view.contains(focus) ? [...focus.attributes].find((item) => item.name.startsWith('data-room-')) : null;
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
    ui.sheet.querySelector('[data-cat-room-view]').setAttribute('aria-labelledby', 'cat-room-title');
    ui.sheet.setAttribute('aria-labelledby', 'cat-room-title');
    ui.sheet.querySelector('[data-room-pick="rest"]').focus();
  }

  // Разметка редактора снята (ядро уже вышло из него: сохранение, отмена, другой питомец, закрытие, другой вид): перенос
  // указателем отпущен, комната уголка — по сохраняемой; restore — фокус на входе и прокрутка уголка.
  function unroomMarkup({ restore = true } = {}) {
    if (!ui.room) return;
    ui.arrange.cancel('close');
    ui.room = false;
    delete ui.sheet.dataset.view;
    ui.sheet.setAttribute('aria-labelledby', 'cat-sheet-title');
    ui.sheet.querySelector('[data-cat-room-view]').removeAttribute('aria-labelledby');
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

  // «Сохранить» — ядру (тот же путь, что прямая команда room.save): идущий перенос не дописывается; без изменений или
  // записано — ядро выходит в уголок (разметка и итог над сценой — подписка, onCore); отказ — редактор открыт, черновик
  // цел, сообщение об ошибке (снимок).
  function saveRoom() {
    if (!ui.room) return;
    ui.arrange.cancel('save');
    ui.core.room.save();
  }

  // «Отмена», Esc, затемнение: черновик отброшен, вид — уголок (ядро; разметка — подписка).
  function cancelRoom() {
    if (!ui.room) return;
    ui.arrange.cancel('close');
    ui.core.room.cancel();
  }

  // Обычная расстановка — в черновик ядра (постоянной — после «Сохранить»); черновик на рисунке — по снимку.
  function resetRoom() {
    if (!ui.room) return;
    ui.arrange.cancel('reset');
    ui.core.room.reset();
  }

  function pickRoom(id) {
    if (!ui.room || ui.arrange.arranging()) return;
    ui.core.room.select(id);
  }

  // Кнопка или стрелка: шаг ядра (итог и упор объявляет ядро).
  function moveRoom(dir) {
    if (!ui.room || ui.arrange.arranging()) return;
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
    ui.arrange.cancel('stage');
    renderRoom();
  }

  // Esc в «Поиграть» или редакторе: сначала идущий перенос (указатель и ядро — room.dragCancel), иначе редактор — отмена
  // всего (room.cancel), сцена — playBack.
  function escapeSub() {
    if (ui.room && ui.arrange.arranging()) ui.arrange.cancel('escape');
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
  // события, причины тишины и паузы повторов до отключения (исправление Р1). Здесь — закрытие диалога, места, таймеры
  // показа (проверка конца ввода остаётся), объявление (называет свою кнопку «Показать …» и texts.back сайта) и фокус.
  // Закрытие диалога без возврата и места «спрятан» — подписка (onCore → setShown), как при прямой команде hide.
  function hideCat() {
    S.cancelMove('hide');
    ui.core.hide();
    stopDecor();
    announce(`${name()} спрятан. Вернуть — «${returnLabel()}»${T.back}.`);
    fallbackFocus()?.focus({ preventScroll: true });
  }

  // «Показать»: поверхность по присутствию (по зову — лапка, игра не открывается), покой и полночь заново — ядро (без
  // приветствия); места — подписка (как при прямой команде show); здесь — знаки сайта заново (пока питомец спрятан,
  // update() ничего не делает — как 0.1.4), фокус, объявление.
  function showCat() {
    ui.core.show();
    refreshInfo();
    const focusCat = () => ui.mounted && fallbackFocus()?.focus({ preventScroll: true });
    S.focusAfterShow(focusCat);
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

  // Имя везде согласованно: заголовок уголка и сцены, подпись рядом с питомцем, доступные имена кнопок.
  function showName() {
    const title = ui.sheet?.querySelector('#cat-sheet-title');
    if (title) title.textContent = name();
    const big = ui.sheet?.querySelector('[data-cat-play-name]');
    if (big) big.textContent = name();
    // Сцена: место под итогом — по образцам с новым именем, итог на экране — тоже с ним.
    const fit = ui.sheet?.querySelector('[data-cat-play-fit]');
    if (fit) fit.innerHTML = fitHtml();
    syncPlay();
    S.named();
    // Имя — и в подарке первой ступени, в выборе напарника и в готовых именах.
    const steps = ui.sheet?.open ? ui.sheet.querySelector('[data-cat-steps]') : null;
    if (steps) steps.innerHTML = stageListHtml(ui.info);
    if (ui.sheet?.open) {
      syncKindNames();
      syncNamePick();
    }
    // Подписи кнопок с именем — по снимку.
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
    } else if (S.change(field)) {
      // место и вид legacy-раскладки
    } else if (field.name === 'cat-acc' && field.checked) {
      // Аксессуар на портретах и рисунках — по снимку (onCore), как у прямой команды setAppearance.
      ui.core.setAppearance({ accessory: field.value });
    } else if (field.name === 'cat-motion' && field.checked) {
      // Новый режим: сценка отменена, интервалы покоя заново — ядро; поза и режим рисунков — по снимку.
      ui.core.setPreferences({ motion: field.value });
    } else if (field.name === 'cat-phrases') {
      // Выключены — облако и реплика вида исчезают (ядро; показ — по снимку).
      ui.core.setPreferences({ phrases: field.checked });
    }
  }

  // Ушли из поля имени: в нём сохранённое имя (другая вкладка могла поменять его, пока поле редактировали здесь без
  // ввода).
  function onSheetFocusOut(event) {
    if (event.target.name !== 'cat-name') return;
    syncNameField({ force: true });
    // Пока вводили имя, могли измениться лакомство дня и предложение имени — догоняем. После паузы: фокус ушёл нажатием,
    // и кнопка под пальцем не должна сдвинуться до того, как нажатие сработает.
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
  // ядро; показ нового — подписка (onCore → switchKind), как при прямой команде setPet.
  function chooseKind(kind) {
    if (kind === ui.kind || !ui.core.setPet(kind).ok) return;
    // Фокус — на выбранном (переключатель перерисован вместе с уголком): Tab и стрелки работают дальше.
    ui.sheet?.querySelector('input[name="cat-kind"]:checked')?.focus({ preventScroll: true });
  }

  // Показать сохранённое: вид напарника и «скрыт» — по снимку ядра (оба ключа, с поглощёнными изменениями других
  // вкладок). Сравнение — с показанным (ui.kind, ui.shownHidden). Возвращает true, если вид или скрытие пришлось показать
  // заново.
  function applyShown(kind = snap().pet.shown) {
    const next = readSettings(kind);
    if (next.hidden !== ui.shownHidden) setShown(kind, next);
    else if (kind !== ui.kind) switchKind(kind, next);
    else return false;
    return true;
  }

  // Прежний напарник (или ушедший по зову) не доигрывает на странице: таймеры показа снимаются. Реакцию, отложенную,
  // облако, примерку, вещь, сценку и задачи снимает ядро; тишина и уже отыгранные события (память ядра) остаются,
  // полночь ядро оставляет.
  function dropShown() {
    stopDecor();
  }

  // Спрятали или вернули (возможно, вместе со сменой вида) — кнопкой, прямой командой или в другой вкладке: места
  // целиком по снимку, без приветствия, объявлений и записей. Спрятан — диалог закрыт без возврата (вид закрыло ядро),
  // мест и рисунков нет; вернули — выбранный напарник везде.
  function setShown(kind, next) {
    S.cancelMove('hide');
    // Фокус был в диалоге, который закрывается (прямая команда hide или другая вкладка при открытом уголке), — не в
    // никуда: на «Показать …» (кнопка «Скрыть» уголка ставит его сама).
    const inside = Boolean(next.hidden && ui.sheetOpen && ui.sheet?.contains(active()));
    if (next.hidden && ui.sheetOpen) closeMarkup({ restore: false });
    // После закрытия уголка фокус у кнопки, которая его открыла, — её тоже перерисуют.
    const focused = S.focused();
    dropShown();
    ui.kind = kind;
    ui.settings = next;
    clearSheet();
    renderAll();
    S.keep(focused);
    const now = active();
    if (inside && (!now || now === document.body || !shown(now))) fallbackFocus()?.focus({ preventScroll: true });
  }

  // Показать другого напарника при неизменном «скрыт»: прогресс, знаки и общие настройки те же — смена не даёт знаков и
  // праздников. Кнопки мест те же; открытый уголок перерисовывается с тем же раскрытием, прокруткой и фокусом.
  function switchKind(kind, next) {
    if (!ui.defs.has(kind) || !ui.kits.has(kind) || kind === ui.kind) return;
    S.cancelMove('kind');
    ui.pointer.release('kind');
    // Редактор закрывается без сохранения черновика (ядро уже вышло из него в уголок).
    unroomMarkup();
    const memo = sheetMemo();
    dropShown();
    ui.kind = kind;
    ui.settings = next;
    S.kindChanged();
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

  // Состояние открытого уголка перед перерисовкой: прокрутка, раскрытые блоки, элемент с фокусом.
  function sheetMemo() {
    if (!ui.sheet?.open) return null;
    const body = ui.sheet.querySelector('[data-cat-body]');
    const now = active();
    const focus = now && body.contains(now) ? now : null;
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
  // Распознавание ввода в поля страницы (focusin, focusout и проверка через 250 мс) и действий пользователя — здесь;
  // тишина (причина typing), её снятие, отложенная реакция, пробуждение и отсчёт покоя — ядро. Поле — настоящий элемент
  // с фокусом и внутри открытых теневых деревьев страницы (composedPath, deepActive); свой уголок — не ввод страницы.

  const isTextField = (element) => Boolean(element?.matches?.(TEXT_INPUT)) && !ui.sheet?.contains(element);
  // Элемент с фокусом на странице, в том числе внутри открытых теневых деревьев.
  function deepActive() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    return element;
  }
  const targetOf = (event) => (typeof event.composedPath === 'function' ? (event.composedPath()[0] ?? event.target) : event.target);

  function onFocusIn(event) {
    S.focusIn?.(event);
    if (!typing || !isTextField(targetOf(event))) return;
    // Ввод (и при уже идущей тишине ввода) — ядро отменяет сценку: она не начнётся и конца ввода не ждёт.
    ui.core.setContext({ typing: true });
  }

  function onFocusOut(event) {
    S.focusOut?.(event);
    if (!typing) return;
    later('typing', 250, () => {
      if (!isTextField(deepActive())) ui.core.setContext({ typing: false });
    });
  }

  // Действие пользователя (нажатие, клавиша, колесо, касание, прокрутка) — ядру: пробуждение, отсчёт покоя заново (не
  // чаще раза в 500 мс).
  function onActivity() {
    ui.core.activity();
  }

  // Питомец виден: вкладка не в фоне и поверхность может его показать (контейнер в документе и с размерами).
  const seen = () => !document.hidden && S.visible();

  // Фон и возврат (вкладка или поверхность) — ядру (setVisible): в фоне реакция, облако, примерка, вещь, сценка и задачи
  // сняты; при возврате — дремота после долгого отсутствия, новый день и лакомство, задачи заново, без приветствия.
  // Здесь — показ.
  function onVisibility() {
    S.markPaused(document.hidden);
    if (!seen()) {
      // Таймеры показа прежнего не доигрывают; итог «Поиграть» сменяет подсказка (ядро — по фону).
      stopDecor();
      ui.core.setVisible(false);
      return;
    }
    ui.core.setVisible(true);
    if (!ui.mounted || ui.settings.hidden) return;
    // Пока вкладка была в фоне, мог наступить новый день или другая вкладка — угостить; окно — измениться.
    S.relayout();
    showProgress();
    syncTreat();
    syncLearn();
    paint();
  }

  // Что из снимка показывает оболочка: облик, лакомство, счёт и ступень, присутствие, место и вид (ключ place, legacy),
  // настройки (напарник, «скрыт», имена, аксессуары, движение, реплики, увиденная ступень, сохранность).
  function views(state) {
    return {
      look: JSON.stringify([lookOf(state), state.save.look]),
      treat: JSON.stringify([state.treat, state.save.treat, state.progress]),
      presence: JSON.stringify([state.presence.mode, state.save.presence]),
      place: JSON.stringify([state.place, state.save.place]),
      settings: JSON.stringify([state.pet, state.behavior, ...Object.values(state.pets).map((own) => [own.name, own.accessory]), state.prefs, state.presence.hidden, state.progress?.seenStage, state.progress?.seenKnown, state.save.cat, state.save.companion, state.save.ext]),
    };
  }

  // Отображение догоняет снимок ядра — после любой команды (кнопки отображения, прямые команды хоста), задачи ядра и
  // изменения хранилища (другая вкладка, найденное сверкой перед командой, § 5.5, шаг 1а): один путь правил — ядро, здесь
  // только показ. Тихо (без объявлений и переноса фокуса, кроме исчезнувшего): облик; карточка лакомства, знаки и ступень
  // открытого уголка («Новое в уголке» — по эффекту seen); присутствие (места; открытый диалог и черновик — как были);
  // другой напарник или «скрыт»; имя, аксессуар, движение, реплики; открытый вид. Место и вид legacy-раскладки (ключ
  // place) публичной командой не меняются: по снимку — только изменение другой вкладки. Команд ядра не вызывает, кроме
  // объявления сменившейся раскладки (syncDisplay). was — снимок, по которому оболочка уже показана; state — текущий
  // (getState(): переданный слушателю мог устареть).
  function reflect(was, state, reason) {
    const before = views(was);
    const now = views(state);
    if (before.look !== now.look) {
      ui.look = lookOf(state);
      applyCoat();
    }
    if (before.treat !== now.treat && !ui.settings.hidden) {
      showProgress();
      syncSheet();
      paint();
    }
    if (before.presence !== now.presence) {
      if (state.presence.mode !== ui.presence) applyPresence();
      else syncPresenceBox();
    }
    // Во время переноса между местами — после него.
    if (reason === 'storage' && before.place !== now.place) S.placeChanged();
    if (before.settings !== now.settings) {
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

  // Обновление ядра — каждое (команда, сработавшая задача ядра, изменение хранилища): поза, облако, вещь рядом и реплика
  // вида — по снимку (render); новая реакция с той же позой в «Поиграть» — её движения заново (data-again); остальное
  // показанное — reflect. Эффекты: объявления (кормление, праздник ступени, имя, комната), вещи новой увиденной ступени
  // (seen — «Новое в уголке»), предупреждение о повреждённом значении ключа при загрузке, одиночное движение покоя
  // (micro), «устроился» (arrive). Редкая сценка — реакция ядра (data-scene по снимку). Ядро отключили напрямую
  // (core.destroy(), в том числе из порта или слушателя) — экземпляр снимается целиком (lost).
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
      for (const item of ui.sheet?.querySelectorAll('.cat-play .cat-art') ?? []) if (item.dataset.pose === reaction.pose) item.toggleAttribute('data-again');
    }
    const was = ui.mirror;
    ui.mirror = state;
    if (was && was !== state && !ui.booting) reflect(was, state, reason);
    render();
    // Ядро сняло жест поглаживания, перенос предмета или перенос в редакторе само (вид, питомец, облик, фон, новая
    // ступень): указатель отпускается, его поздний конец ядру безвреден. Сцена, черновик и комната уголка — по снимку.
    ui.stroke.lost(state.play?.stroke?.id ?? null);
    if (ui.toys.dragging() && state.play?.drag?.toy !== ui.toys.dragging()) ui.toys.lost();
    if (ui.arrange.arranging() && !state.room.draft?.drag) ui.arrange.cancel('lost');
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
      else if (effect.type === 'arrive') S.arrive();
    }
    // «Сохранить» вывело в уголок (кнопкой или прямой командой room.save): итог — над сценой уголка.
    if (reason === 'room.save' && state.view.open === 'corner') roomDone([...effects].reverse().find((effect) => effect.type === 'announce')?.text ?? '');
    // Вещи, не показанные этим обновлением, не переходят в следующее.
    ui.fresh = [];
  }

  // Журнал ядра — «Питомец: …» в консоли. Во время core.start предупреждение о сбое — причина отказа подключения (её
  // сообщает фасад одной строкой), а не отдельный журнал.
  function coreWarn(message, error) {
    if (ui.starting) {
      ui.startError ??= error ?? new Error(message);
      return;
    }
    if (error === undefined) console.warn(`Питомец: ${message}`);
    else console.warn(`Питомец: ${message}`, error);
  }

  // Контекст поверхности: состояние экземпляра и нужные ей входы оболочки.
  const ctx = {
    ui,
    O,
    C,
    get T() {
      return T;
    },
    K,
    on,
    later,
    snap,
    surface,
    around,
    name,
    defOf,
    kitOf,
    coat,
    art,
    offline,
    OFFLINE,
    announce,
    paint,
    render,
    showProgress,
    labelOpeners,
    showMini,
    syncDisplay,
    renderAll,
    refreshInfo,
    openSheet,
    closeSheet,
    showCat,
    hideCat,
    callHtml,
    callLabel,
    returnLabel,
    openers,
    fallback: fallbackFocus,
    active,
    syncPlaceBox: () => S.syncPlaceBox(),
    syncTreat,
    syncLearn,
  };

  // Подключение: ядро, поверхность, диалог, слушатели. Исключение (поверхность, функция места сайта, progress() при
  // запуске) — наружу: фасад откатывает всё созданное (destroy) и отказывает.
  function start() {
    ui.abort = new AbortController();
    ui.lost = spec.lost;
    ui.defs = catalog.pets;
    ui.kits = catalog.kits;
    ui.drawn = catalog.drawn;
    ui.rooms = new Map([...catalog.pets.values()].map((def) => [def.id, roomModel(def)]));
    T = { ...TEXTS, rules: ['Знаки дают занятия на сайте. Оценки и пропуски знаков не отнимают: открытые вещи остаются.', `Лакомство дня открывает первое занятие за день. Одно кормление в день — общее для ${petsGen()}.`], ...spec.texts };
    // Хранение: общий координатор пространства имён (загрузка — все девять ключей; повторно — барьер и сверка) и своё
    // подключение ядра; день редкой сценки — резервирование IndexedDB того же пространства (общее для ядер). Ядро
    // создаётся без записей; первое включение и приветствие — core.start ниже.
    loadStorage(spec.storage);
    ui.core = createPetCore({ storage: spec.storage, scenes: spec.scenes, progress, pets: catalog.defs.pets, behaviors: catalog.defs.behaviors, log: { warn: coreWarn } });
    ui.mirror = snap();
    // Только своё ядро и только этот экземпляр: поздний вызов отключённого ничего не делает (onCore — ui.mounted).
    ui.core.subscribe(safe(onCore), { initial: false });
    ui.look = lookOf(snap());
    ui.kind = snap().pet.shown;
    ui.settings = readSettings();
    ui.reduced = window.matchMedia(REDUCED);
    on(ui.reduced, 'change', safe(onReducedChange));

    S = spec.surface(ctx);
    // Поверхность: места сайта (legacy) или свой элемент с Shadow DOM в контейнере; её корень — для жестов и нажатий.
    S.mount();
    ui.pointer = createPointer({ signal: ui.abort.signal, root: S.root() });

    ui.sheet = sheetSkeleton();
    S.attach(ui.sheet);
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
        else if (event.target.closest('[data-cat-pet]')) petAct();
        else if (event.target.closest('[data-cat-paw]')) pawAct();
        else if (event.target.closest('[data-cat-feed]')) feed();
        else if (event.target.closest('[data-cat-learn]')) goLearn(event, event.target.closest('[data-cat-learn]'));
        else if (event.target.closest('[data-cat-name-pick]')) pickName(event.target.closest('[data-cat-name-pick]').dataset.catNamePick);
        else if (event.target.closest('[data-cat-name-more]')) moreNames();
        else if (event.target.closest('[data-cat-hide]')) hideCat();
        else S.click(event.target);
      }),
    );
    on(ui.sheet, 'input', safe(onSheetInput));
    on(ui.sheet, 'change', safe(onSheetChange));
    on(ui.sheet, 'focusout', safe(onSheetFocusOut));
    // Клавиши диалога не доходят до сочетаний страницы. Esc в «Поиграть» и редакторе — на один шаг (escapeSub), запасной
    // флаг гасит cancel. Удержанный Esc после шага ничего не делает до отпускания; новое нажатие — снова обычный Esc.
    // Только свой диалог: Esc чужого вида (соседнего контейнера, legacy) сюда не приходит.
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
      ui.escLeft = true;
      setTimeout(() => (ui.escLeft = false), 0);
      if (held) return;
      ui.escHeld = true;
      safe(escapeSub)();
    });
    // Автоповтор Esc, закрывшего свой диалог, до страницы не доходит (диктовка, сочетания). Чужой Esc (нажат не в своём
    // диалоге) этот слушатель не трогает: escHeld ставит только свой keydown.
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
    // Указатель — один на отображение: жест, предметы и перенос в редакторе одного экземпляра.
    ui.stroke = createStroke(
      ui.pointer,
      { start: safe(() => ui.core.stroke.start().id ?? null), step: safe((id) => ui.core.stroke.step(id)), end: safe((id) => ui.core.stroke.end(id)), cancel: safe((id) => ui.core.stroke.cancel(id)), paw: safe(() => playAct({ type: 'paw' })), motion, figure: (kind) => ui.defs.get(kind) ?? null },
      ui.abort.signal,
    );
    ui.toys = createToys(
      ui.pointer,
      { play: playState, drag: safe((toy, at) => ui.core.toy.drag(toy, at)), drop: safe((roll) => ui.core.toy.drop(roll === undefined ? undefined : { roll })), cancel: safe(() => ui.core.toy.cancel()), floor: safe((floor, touch) => ui.core.setDisplay({ playFloor: floor, playTouch: touch })), motion, width: () => defOf()?.size.width ?? 220 },
      ui.abort.signal,
    );
    ui.arrange = Room.createRoomDrag(ui.pointer, roomHooks, ui.abort.signal);
    ui.stroke.watch(ui.sheet.querySelector('[data-cat-play-view]'));
    ui.toys.watch(ui.sheet.querySelector('[data-cat-play-view]'));
    ui.arrange.watch(ui.sheet.querySelector('[data-cat-room-view]'));
    on(ui.sheet.querySelector('[data-cat-room-view]'), 'keydown', safe(onRoomKey));

    ui.live = document.createElement('div');
    ui.live.className = C.sr;
    ui.live.id = 'cat-live';
    ui.live.setAttribute('role', 'status');
    ui.live.setAttribute('aria-live', 'polite');
    S.attachLive(ui.live);

    // Ввод страницы (только чтение; у контейнера — по watchTyping: без него слушателей ввода нет), действия пользователя,
    // видимость вкладки.
    if (typing || S.focusIn) {
      on(document, 'focusin', safe(onFocusIn));
      on(document, 'focusout', safe(onFocusOut));
    }
    for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) on(document, type, safe(onActivity), { passive: true, capture: true });
    on(document, 'scroll', safe(onActivity), { passive: true });
    on(document, 'visibilitychange', safe(onVisibility));

    ui.mounted = true;
    ui.booting = true;
    S.markPaused(document.hidden);
    // До запуска ядро знает, что видно и что умеет отображение: системное «уменьшить движение», видимость, нарисованные
    // питомцы, виды и сценки (явное объявление, § 11.1). Присутствие и «на виду» — ядра (ключ presence).
    ui.core.setReducedMotion(Boolean(ui.reduced.matches));
    ui.core.setVisible(seen());
    ui.core.setDisplay(displayOf());
    // Ядро: первое включение (история — молча) и приветствие дня — решение и неявная запись; покой, полночь и
    // приветствие (через 0,9 с; после паузы в два дня и больше — спокойное «рад, что ты здесь», без упрёков) — его
    // задачи; спрятан и «по зову» — без приветствия. Отказ запуска (progress() сайта бросил) — отказ подключения: фасад
    // откатит всё.
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
    if (typing && isTextField(deepActive())) ui.core.setContext({ typing: true });
  }

  // Полное отключение (и откат неудачного запуска): жесты и перенос отменены, слушатели, таймеры, наблюдатели и кадры
  // сняты, элементы питомца (и у legacy — отметки на html) убраны. Каждый шаг — отдельно: частичный запуск и сбой шага не
  // мешают остальным. Отложенное отключённого экземпляра проверяет ui.mounted и ничего не делает. Тот же путь — и при
  // core.destroy() (onCore → lost): mounted снимается первым, поэтому обновление 'destroyed' своего ядра сюда не
  // возвращается.
  function destroy() {
    const wasOpen = ui.sheetOpen;
    ui.mounted = false;
    ui.lost = null;
    for (const step of [
      () => ui.sheet?.open && ui.sheet.close(),
      () => ui.pointer?.destroy(),
      () => ui.toys?.unmount('close'),
      () => S?.cancelMove('close'),
      () => ui.abort?.abort(),
      () => ui.core?.destroy(),
      stopTimers,
      () => [...ui.said].forEach(clearTimeout),
      () => S?.destroy({ wasOpen }),
    ])
      safe(step)();
    ui.sheetOpen = false;
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
    if (context.dialog) S.cancelMove('dialog');
    ui.core.setContext(context);
  }

  // Подтверждённое занятие (detail — { key, counted, hard, first }; null — запись не учебная). Решение и реакция — ядро.
  // Событие без key — как 0.1.4 (Р2): ядру — ключ String(detail.key) через внутреннюю границу legacy (scene: false по
  // исходному key: сценки нет, пустой ключ допустим); публичный notify ядра требует непустой key.
  function saved(detail) {
    const event = detail ? { key: String(detail.key), counted: Boolean(detail.counted), hard: Boolean(detail.hard), first: Boolean(detail.first) } : null;
    ui.core.notify('saved', event, { scene: Boolean(detail?.key) });
  }

  // Занятие не сохранилось: награды нет, только нейтральное ожидание (решение и реакция — ядро); ошибку показывает сайт.
  function failed() {
    ui.core.notify('failed', null);
  }

  return Object.freeze({
    ui,
    start,
    destroy,
    update,
    saved,
    failed,
    openSheet,
    closeSheet,
    openers,
    fallback: fallbackFocus,
    cancelMove: (reason) => S?.cancelMove(reason),
    seen,
    onVisibility,
    syncDisplay,
    renderAll,
  });
}
