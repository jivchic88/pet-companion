// Только проверки (test/native-entry.test.mjs, test/native-hook.test.mjs, test/native-example.test.mjs,
// test/native-view.test.mjs, test/native-corner.test.mjs, test/native-play.test.mjs): подмена пакета react-native
// загрузчиком Node (registerHooks); с PL10.2.2 — ещё Easing и interpolate у Animated.Value (только запись настройки) —
// AppState, AccessibilityInfo, Keyboard и Platform подделки system() из test/native-kit.mjs, которую проверка кладёт в
// globalThis.__petRN до импорта. Компоненты ничего не рисуют: View, ScrollView, Pressable и Animated.View — только дети,
// Text и TextInput — ничего, Modal — дети только пока visible (как закрытое окно Android); каждый записывает свои последние
// свойства по testID в записи своего экрана (test/fakes/expo-screen.mjs), Button — ещё и обработчик по заголовку. По ref
// у узлов — { testID } (цель sendAccessibilityEvent), у ScrollView — ещё scrollTo (учёт в system().scrolls). TextInput по
// ref — focus(), blur() и isFocused(), как у настоящего поля: фокус меняется только через них, и только смена фокуса
// вызывает onFocus / onBlur (blur без фокуса — ничего). Animated — Value (setValue, значение в value) и анимации timing /
// sequence / loop с учётом в system().animations: start, stop, сама закончилась (end). Это не React Native и не устройство.
import { createElement, Fragment, useContext, useImperativeHandle, useRef } from 'react';
import { Screen, screen, useRecord } from './expo-screen.mjs';

const system = globalThis.__petRN;
export const AppState = system.AppState;
export const AccessibilityInfo = system.AccessibilityInfo;
export const Keyboard = system.Keyboard;
export const Platform = system.Platform;

export const StyleSheet = { create: (styles) => styles };
// Узел по ref — { testID } (React 19: ref — обычное свойство функционального компонента).
const handle = (props, extra = {}) => ({ testID: props.testID, ...extra });
const host = (type, extra = () => ({})) =>
  function Fake(props) {
    useImperativeHandle(props.ref, () => handle(props, extra(props)), [props.testID]);
    useRecord(type, props);
    return createElement(Fragment, null, typeof props.children === 'function' ? props.children({ pressed: false }) : props.children);
  };
export const View = host('View');
export const ScrollView = host('ScrollView', (props) => ({ scrollTo: (to) => system.scrolls.push({ testID: props.testID, ...to }) }));
export const Pressable = host('Pressable');
export function Modal(props) {
  useRecord('Modal', props);
  return props.visible === false ? null : createElement(Fragment, null, props.children);
}
export function Text(props) {
  useImperativeHandle(props.ref, () => handle(props), [props.testID]);
  useRecord('Text', props);
  return null;
}
export function TextInput(props) {
  const field = useRef({ focused: false, props });
  field.current.props = props;
  useImperativeHandle(
    props.ref,
    () => ({
      focus() {
        if (field.current.focused) return;
        field.current.focused = true;
        field.current.props.onFocus?.();
      },
      blur() {
        if (!field.current.focused) return;
        field.current.focused = false;
        field.current.props.onBlur?.();
      },
      isFocused: () => field.current.focused,
    }),
    [],
  );
  useRecord('TextInput', props);
  return null;
}
export function Button(props) {
  screen(useContext(Screen)).buttons.set(props.title, props.onPress);
  useRecord('Button', props);
  return null;
}

class Value {
  constructor(value) {
    this.value = value;
  }
  setValue(value) {
    this.value = value;
  }
  interpolate(config) {
    return { source: this, config };
  }
}
// Кривые — те же формулы, что у React Native (out — отражение, cubic — t³).
export const Easing = { cubic: (t) => t ** 3, out: (f) => (t) => 1 - f(1 - t) };
// Анимация подделки: steps — шаги timing по порядку; start — идёт (live), stop — снята, end — закончилась сама; late(result) —
// отклик start ещё раз, когда анимация уже снята или закончилась (запоздавший отклик прежнего движения).
function animation(steps, iterations = 1) {
  const book = system.animations;
  let live = false;
  let done = null;
  const run = {
    steps,
    iterations,
    get live() {
      return live;
    },
    start(callback) {
      if (live) return;
      live = true;
      done = callback;
      book.started += 1;
      book.live.add(run);
    },
    stop() {
      if (!live) return;
      live = false;
      book.stopped += 1;
      book.live.delete(run);
      done?.({ finished: false });
    },
    end(result) {
      if (!live) return;
      live = false;
      book.live.delete(run);
      const last = steps.at(-1);
      if (last) last.value.setValue(last.toValue);
      done?.(result);
    },
    late(result) {
      if (!live) done?.(result);
    },
  };
  return run;
}
export const Animated = {
  Value,
  View: host('Animated.View'),
  timing: (value, config) => animation([{ value, ...config }]),
  sequence: (list) => animation(list.flatMap((item) => item.steps)),
  loop: (item, { iterations = -1 } = {}) => animation(item.steps, iterations),
};
