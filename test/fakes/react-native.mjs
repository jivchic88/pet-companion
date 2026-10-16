// Только проверки (test/native-entry.test.mjs, test/native-hook.test.mjs, test/native-example.test.mjs,
// test/native-view.test.mjs): подмена пакета react-native загрузчиком Node (registerHooks) — AppState и AccessibilityInfo
// подделки system() из test/native-kit.mjs, которую проверка кладёт в globalThis.__petRN до импорта. Компоненты ничего не
// рисуют: View, ScrollView, Pressable и Animated.View — только дети, Text и TextInput — ничего; каждый записывает свои
// последние свойства по testID в записи своего экрана (test/fakes/expo-screen.mjs), Button — ещё и обработчик по
// заголовку. TextInput по ref — focus(), blur() и isFocused(), как у настоящего поля: фокус меняется только через них, и
// только смена фокуса вызывает onFocus / onBlur (blur без фокуса — ничего). Animated — Value (setValue, значение в value) и
// анимации timing / sequence / loop с учётом в system().animations: start, stop, сама закончилась (end). Это не React
// Native и не устройство.
import { createElement, Fragment, useContext, useImperativeHandle, useRef } from 'react';
import { Screen, screen, useRecord } from './expo-screen.mjs';

const system = globalThis.__petRN;
export const AppState = system.AppState;
export const AccessibilityInfo = system.AccessibilityInfo;

export const StyleSheet = { create: (styles) => styles };
const host = (type) =>
  function Fake(props) {
    useRecord(type, props);
    return createElement(Fragment, null, typeof props.children === 'function' ? props.children({ pressed: false }) : props.children);
  };
export const View = host('View');
export const ScrollView = host('ScrollView');
export const Pressable = host('Pressable');
export function Text(props) {
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
}
// Анимация подделки: steps — шаги timing по порядку; start — идёт (live), stop — снята, end — закончилась сама.
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
