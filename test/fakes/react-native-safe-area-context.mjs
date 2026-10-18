// Только проверки примера Expo (test/native-example.test.mjs): подмена пакета react-native-safe-area-context загрузчиком
// Node. SafeAreaProvider — только дети; useSafeAreaInsets — отступы globalThis.__petInsets (проверка задаёт их сама, по
// умолчанию — портрет телефона с вырезом). Это не настоящее измерение окна и не устройство.
import { createElement, Fragment } from 'react';

export const SafeAreaProvider = ({ children }) => createElement(Fragment, null, children);
export const useSafeAreaInsets = () => globalThis.__petInsets ?? { top: 59, right: 0, bottom: 34, left: 0 };
