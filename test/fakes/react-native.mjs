// Только проверки (test/native-entry.test.mjs, test/native-hook.test.mjs, test/native-example.test.mjs): подмена пакета
// react-native загрузчиком Node (registerHooks) — AppState и AccessibilityInfo подделки system() из test/native-kit.mjs,
// которую проверка кладёт в globalThis.__petRN до импорта. Компоненты экрана примера Expo ничего не рисуют: View и
// ScrollView — только дети, Text — ничего, Button — обработчик по заголовку в записи своего экрана (test/fakes/expo-screen.mjs).
import { createElement, Fragment, useContext } from 'react';
import { Screen, screen } from './expo-screen.mjs';

const system = globalThis.__petRN;
export const AppState = system.AppState;
export const AccessibilityInfo = system.AccessibilityInfo;

export const StyleSheet = { create: (styles) => styles };
export const View = ({ children }) => createElement(Fragment, null, children);
export const ScrollView = View;
export const Text = () => null;
export function Button({ title, onPress }) {
  screen(useContext(Screen)).buttons.set(title, onPress);
  return null;
}
