// Ядро: публичный экземпляр (вход pet-companion/core и pet.core legacy-фасада, PL05; docs/ARCHITECTURE.md § 4–6,
// § 14.1.5). Тот же внутренний экземпляр (index.mjs) — без второй модели состояния и второго пути команд: фасад только
// сужает поверхность. Наружу — ровно публичные методы § 6.4 (входы legacy-отображения setPlace, arrive, stopScene,
// событие без key и признак выбора имени остаются внутренними), ровно документированные поля результатов (внутренние
// решения reaction, scene, greet не выдаются) и снимок без внутреннего предпочтения места legacy (place). Снимок и
// обновление — те же замороженные данные; ссылка стабильна, пока снимок ядра не изменился. Методы не зависят от this.

import { VERSION } from './version.mjs';

// Поля внутреннего снимка, которых нет в публичном (значение ключа place:v1 legacy-отображения — его предпочтение мест).
const INTERNAL = ['place'];

const snapshots = new WeakMap();
// Публичный снимок по внутреннему: тот же объект для того же снимка (стабильная ссылка, useSyncExternalStore), без
// внутренних полей; вложенные части — те же глубоко замороженные данные ядра.
export function publicSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  let own = snapshots.get(snapshot);
  if (!own) {
    own = Object.freeze(Object.fromEntries(Object.entries(snapshot).filter(([key]) => !INTERNAL.includes(key))));
    snapshots.set(snapshot, own);
  }
  return own;
}

const updates = new WeakMap();
// Публичное обновление { snapshot, effects, reason } — замороженное; одно на обновление ядра для всех слушателей фасада.
function publicUpdate(update) {
  let own = updates.get(update);
  if (!own) {
    own = Object.freeze({ snapshot: publicSnapshot(update.snapshot), effects: Object.freeze([...update.effects]), reason: update.reason });
    updates.set(update, own);
  }
  return own;
}

// Результат команды: отказ — { ok: false, error: { code, message } }; успех — ok, changed, save, degraded (только при
// сбое после применения) и дополнительные поля этой команды.
function pick(result, fields = []) {
  if (!result || result.ok !== true) {
    const error = result?.error ?? { code: 'internal', message: 'Внутренний сбой: нет результата.' };
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  const own = { ok: true, changed: result.changed, save: result.save };
  if (result.degraded === true) own.degraded = true;
  for (const field of fields) own[field] = result[field];
  return own;
}

// Дополнительные поля результатов (§ 6.4): событие занятия, отказ, открытие вида, обновление счёта, игра, жест, комната.
const SAVED = ['reacted', 'duplicate', 'celebrate', 'fresh'];
const FAILED = ['reacted'];
const OUTCOME = ['outcome', 'text'];

// Публичный экземпляр поверх внутреннего inner.
export function exposed(inner) {
  const plain = (name) => () => pick(inner[name]());
  return Object.freeze({
    get version() {
      return VERSION;
    },
    get status() {
      return inner.status;
    },
    start: () => pick(inner.start()),
    // Синхронно и идемпотентно; возвращает undefined.
    destroy: () => {
      inner.destroy();
    },
    getState: () => publicSnapshot(inner.getState()),
    subscribe: (listener, options) => (typeof listener === 'function' ? inner.subscribe((update) => listener(publicUpdate(update)), options) : inner.subscribe(listener, options)),
    refresh: () => pick(inner.refresh(), ['fresh']),
    // notify('saved', detail | null) и notify('failed'); третий аргумент не параметр (граница legacy — только внутри).
    notify: (type, detail) => pick(inner.notify(type, detail), type === 'saved' ? SAVED : type === 'failed' ? FAILED : []),
    feed: plain('feed'),
    open: (view, options) => pick(inner.open(view, options), ['fresh']),
    close: plain('close'),
    setPresence: (mode) => pick(inner.setPresence(mode)),
    // Готовое ли имя, решает ядро (публичное правило 'preset'); второй аргумент не параметр.
    setName: (name) => pick(inner.setName(name, { pick: 'preset' }), ['reacted']),
    setPet: (id) => pick(inner.setPet(id), ['reacted']),
    setAppearance: (look) => pick(inner.setAppearance(look)),
    setPreferences: (prefs) => pick(inner.setPreferences(prefs)),
    hide: plain('hide'),
    show: plain('show'),
    setContext: (flags) => pick(inner.setContext(flags)),
    setVisible: (visible) => pick(inner.setVisible(visible)),
    setReducedMotion: (on) => pick(inner.setReducedMotion(on)),
    activity: plain('activity'),
    setDisplay: (display) => pick(inner.setDisplay(display)),
    interact: (action) => pick(inner.interact(action), OUTCOME),
    stroke: Object.freeze({
      start: () => pick(inner.stroke.start(), ['id']),
      step: (id) => pick(inner.stroke.step(id), ['outcome', 'announced']),
      end: (id) => pick(inner.stroke.end(id)),
      cancel: (id) => pick(inner.stroke.cancel(id)),
    }),
    // Перенос предмета в «Поиграть» — граница жеста отображения, как room.drag (решение PL05: публичный).
    toy: Object.freeze({
      drag: (id, at) => pick(inner.toy.drag(id, at)),
      drop: (options) => pick(inner.toy.drop(options), OUTCOME),
      cancel: () => pick(inner.toy.cancel()),
    }),
    room: Object.freeze({
      select: (id) => pick(inner.room.select(id)),
      move: (id, at) => pick(inner.room.move(id, at)),
      nudge: (dir) => pick(inner.room.nudge(dir)),
      reset: () => pick(inner.room.reset()),
      drag: (id, at) => pick(inner.room.drag(id, at)),
      drop: () => pick(inner.room.drop()),
      dragCancel: () => pick(inner.room.dragCancel()),
      save: () => pick(inner.room.save(), ['closed', 'text', 'fresh']),
      cancel: () => pick(inner.room.cancel(), ['text', 'fresh']),
    }),
  });
}
