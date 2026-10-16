// Натив: жизненный цикл приложения для ядра (docs/ARCHITECTURE.md § 12.2; этап PL09). AppState и AccessibilityInfo React
// Native передаются аргументом (вход pet/native.mjs — модули react-native, проверки Node — подделки): сам модуль React Native
// не импортирует, импорт ничего не делает. Команды — существующие входы отображения ядра: setVisible, setReducedMotion и
// отмена идущего жеста; правил здесь нет — фон, возврат, день и уменьшение движения решает ядро.
//
//   active → setVisible(true); background → setVisible(false) — фон снимает реакцию, сценку и задачи, возврат ничего не
//   доигрывает и пересчитывает день (ядро); inactive (iOS: центр уведомлений, переключатель приложений, звонок) и blur
//   (Android: шторка уведомлений) — видимость не меняют, но отменяют идущий жест поглаживания и перенос предмета;
//   unknown, extension, null — ничего. Системное «уменьшить движение» → setReducedMotion: выбор владельца (prefs.motion)
//   не переписывается — ядро считает итог (effectiveMotion).
//
// Начальная синхронизация: состояние приложения — сразу (синхронно, до start хоста); «уменьшить движение» — ответом
// isReduceMotionEnabled, но событие reduceMotionChanged, пришедшее раньше ответа, главнее: поздний ответ его не затирает.
// ready() — один раз, когда начальное «уменьшить движение» известно (ответ, событие или отказ чтения): хост может вызвать
// start() после него. Отключение (stop, внешний core.destroy) снимает все слушатели этой привязки, поздние ответы и события
// ничего не вызывают; соседние привязки не затрагиваются. Отказы системного API — предупреждение журнала, без
// необработанных отклонений.

import { systemLog } from '../core/ports.mjs';

const noop = () => {};
const say = (log, message, error) => {
  try {
    log.warn(message, error);
  } catch {
    // журнал не мешает жизненному циклу
  }
};
const remove = (subscription) => {
  try {
    subscription?.remove?.();
  } catch {
    // уже снята
  }
};

// Идущий жест и перенос — отменить (как наложение поверх страницы в вебе): поглаживание, предмет «Поиграть», предмет
// редактора уголка. Ничего не идёт — ничего не вызывается.
export function interrupt(core) {
  const snapshot = core.getState();
  if (!snapshot || snapshot.status === 'destroyed') return;
  if (snapshot.play?.stroke) core.stroke.cancel(snapshot.play.stroke.id);
  if (snapshot.play?.drag) core.toy.cancel();
  if (snapshot.room?.draft?.drag) core.room.dragCancel();
}

// Привязать ядро core к системе { AppState, AccessibilityInfo }. Возвращает { stop } — снять всё (идемпотентно).
export function bindLifecycle(core, { AppState, AccessibilityInfo }, { ready = noop, log = systemLog } = {}) {
  let live = true;
  let motionKnown = false;
  let readied = false;
  const subscriptions = [];
  let unsubscribe = noop;
  const alive = () => live && core.status !== 'destroyed';
  const stop = () => {
    if (!live) return;
    live = false;
    for (const subscription of subscriptions.splice(0)) remove(subscription);
    try {
      unsubscribe();
    } catch {
      // ядро уже отключено
    }
  };
  if (!alive()) return { stop };
  const call = (what, fn) => {
    if (!alive()) return;
    try {
      fn();
    } catch (error) {
      say(log, `жизненный цикл: ${what} не выполнено`, error);
    }
  };
  const settled = () => {
    if (readied || !alive()) return;
    readied = true;
    try {
      ready();
    } catch (error) {
      say(log, 'жизненный цикл: ready() бросил', error);
    }
  };
  const listen = (target, event, handler, what) => {
    try {
      const subscription = target.addEventListener(event, handler);
      if (live) subscriptions.push(subscription);
      else remove(subscription);
    } catch (error) {
      say(log, `жизненный цикл: нет подписки ${what}`, error);
    }
  };

  // Внешний core.destroy() — сразу снять слушатели системы.
  try {
    unsubscribe = core.subscribe((update) => update.reason === 'destroyed' && stop(), { initial: false });
  } catch (error) {
    say(log, 'жизненный цикл: подписка на ядро не удалась', error);
  }

  const onState = (state) => {
    if (state === 'active') call('возврат приложения', () => core.setVisible(true));
    else if (state === 'background') call('уход в фон', () => core.setVisible(false));
    else if (state === 'inactive') call('отмена жеста', () => interrupt(core));
  };
  const onBlur = () => call('отмена жеста', () => interrupt(core));
  const onMotion = (on) => {
    motionKnown = true;
    if (typeof on === 'boolean') call('уменьшение движения', () => core.setReducedMotion(on));
    settled();
  };

  let current = null;
  try {
    current = AppState.currentState;
  } catch (error) {
    say(log, 'жизненный цикл: состояние приложения не прочитано', error);
  }
  onState(current);
  listen(AppState, 'change', onState, 'AppState change');
  listen(AppState, 'blur', onBlur, 'AppState blur');
  listen(AccessibilityInfo, 'reduceMotionChanged', onMotion, 'reduceMotionChanged');

  let first;
  try {
    first = Promise.resolve(AccessibilityInfo.isReduceMotionEnabled());
  } catch (error) {
    first = Promise.reject(error);
  }
  first.then(
    (on) => {
      if (!motionKnown && typeof on === 'boolean') call('уменьшение движения', () => core.setReducedMotion(on));
      settled();
    },
    (error) => {
      if (alive()) say(log, 'жизненный цикл: системная настройка «уменьшить движение» не прочитана', error);
      settled();
    },
  );
  return { stop };
}
