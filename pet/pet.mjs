// Питомец (кот или собака) — legacy-подключение mountPet (вход pet-companion): места рядом со страницей или лапка вызова,
// один диалог в трёх видах (уголок, «Поиграть», «Обустроить уголок»), реакции и настройки. Подключение, интерфейс,
// хранение и ограничения — README модуля. С PL07 этот файл — фасад: проверка настроек, реестр одного питомца на странице
// (globalThis[Symbol.for('pet-module')]) и объект pet; отображение — общая оболочка на экземпляр (web/shell.mjs) с
// поверхностью мест сайта (web/legacy/places.mjs); правила — ядро без DOM (core/index.mjs; хранение — общий координатор
// web/storage.mjs, день сценки — web/scenes.mjs). С PL05 — pet.core (публичный экземпляр ядра, core/facade.mjs) и команды
// ядра на pet; кнопки и прямые команды показываются одним путём — подпиской оболочки по снимку; pet.core.destroy()
// снимает весь экземпляр. С PL06 питомцы и модели поведения — определения (pets, behaviors; по умолчанию штатные кот,
// собака и модель calm), рисуют наборы отображения (web/kits.mjs; сторонний питомец — свой набор, options.kits).
// Контейнерный режим без мест (mountPetIn) — вход pet-companion/web (web.mjs); legacy-реестр он не использует, и
// подключение mountPet контейнеров не отключает. Хранит только предпочтения в браузере; данных сайта не меняет; ошибки
// здесь сайту не мешают.

import * as R from './pet-rules.mjs';
import { exposed } from './core/facade.mjs';
import { VERSION } from './core/version.mjs';
import { catalogOf, catalogProblem } from './web/catalog.mjs';
import { legacySurface } from './web/legacy/places.mjs';
import { safe, shown } from './web/parts.mjs';
import { createWebScenes } from './web/scenes.mjs';
import { createShell } from './web/shell.mjs';
import { createWebStorage } from './web/storage.mjs';

// Версия модуля — та же, что в package.json и у входа pet-companion/core: одна константа ядра (core/version.mjs; npm version
// обновляет её там — scripts/sync-version.mjs). Версии форматов данных — v1 в ключах (storageKeys).
export { VERSION };

// Местная дата «ГГГГ-ММ-ДД» — граница дня лакомства и сценок; по ней сайт считает progress().today (README, «Интерфейс»).
export const localDay = R.localDay;

let current = null;
// Оболочка текущего подключения (одна на странице; заменяется новым подключением).
let shell = null;

// Один питомец на странице — и для разных копий модуля (файлы по другому адресу — другой модуль браузера): владелец —
// globalThis[Symbol.for('pet-module')] = { version, busy, destroy }. Копии без реестра (до 0.1.2) видны по своим id.
const PAGE = Symbol.for('pet-module');
const IDS = ['cat-sheet', 'cat-live', 'cat-dock', 'cat-side', 'cat-float', 'cat-bar'];

// Настройки, с которыми подключаться нельзя (README, «Отказ подключения»): проверка до любых действий. PL06: pets и
// behaviors — определения (ошибка определения — его код и путь), kits — наборы: без определения, неполный, повтор
// питомца — отказ; хотя бы один питомец с набором (web/catalog.mjs).
function invalid(o) {
  const p = o?.places;
  if (!p || typeof p !== 'object') return 'нет places';
  for (const key of ['logo', 'top']) if (typeof p[key] !== 'function') return `places.${key} — обязательная функция`;
  for (const key in p) if (p[key] != null && typeof p[key] !== 'function') return `places.${key} — не функция`;
  for (const key of ['progress', 'step', 'go', 'zone', 'home']) if (o[key] != null && typeof o[key] !== 'function') return `${key} — не функция`;
  if (!(o.storage === undefined || (typeof o.storage === 'string' && o.storage))) return 'storage — непустая строка';
  return catalogProblem(o);
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
// возвращают undefined. Команда ядра и кнопка уголка показываются одним путём (подписка оболочки); pet.core.destroy()
// отключает всё, как pet.destroy().
export function mountPet(options = {}) {
  let entry = null;
  let core = null;
  let own = null;
  // Команда ядра этого подключения: до подключения и при отказе — destroyed без действий; методы не зависят от this.
  const forward = (get) => (...args) => (core ? get(core)(...args) : unmounted());
  const live = () => current === pet && own !== null && own.ui.mounted;
  const pet = {
    version: VERSION,
    update: mine((flags) => own.update(flags)),
    notify: mine((type, detail) => (type === 'saved' ? own.saved(detail) : type === 'failed' ? own.failed() : undefined)),
    open: mine((view = 'corner') => {
      own.openSheet(own.openers().find(shown) ?? null, view === 'play' ? 'call' : 'pet');
    }),
    close: mine(({ restore = true } = {}) => {
      own.cancelMove('close');
      own.closeSheet({ restore });
    }),
    get opened() {
      return live() && Boolean(own.ui.sheet?.open);
    },
    get mounted() {
      return live();
    },
    get core() {
      return core;
    },
    getState: () => (core ? core.getState() : null),
    subscribe: (listener, settings) => (core ? core.subscribe(listener, settings) : () => {}),
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
      const gone = own;
      if (shell === gone) shell = null;
      safe(() => gone?.destroy())();
    },
  };
  function mine(fn) {
    return safe((...args) => (live() ? fn(...args) : undefined));
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
    const namespace = options.storage ?? 'pet';
    own = shell = createShell({
      options,
      namespace,
      catalog: catalogOf(options),
      storage: createWebStorage({ namespace }),
      scenes: createWebScenes({ namespace }),
      classes: options.classes,
      texts: options.texts,
      watchTyping: true,
      surface: legacySurface,
      // lost — снять весь экземпляр (pet.destroy() этого подключения), если ядро отключат напрямую (pet.core.destroy()).
      lost: () => pet.destroy(),
    });
    own.start();
    core = exposed(own.ui.core);
  } catch (error) {
    pet.destroy();
    refuse(error);
  }
  entry.busy = false;
  return pet;
}
