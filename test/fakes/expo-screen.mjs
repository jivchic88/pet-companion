// Только проверки примера Expo (test/native-example.test.mjs): экран examples/expo/App.js под наблюдением. Screen — метка
// экземпляра экрана (контекст React, проверка оборачивает им каждый App); screen(метка) — его записи: последние
// обработчики кнопок по заголовку (подделка Button в test/fakes/react-native.mjs) и число вызовов функций смены состояния
// useState (test/fakes/react-state.mjs) — так видно позднее изменение состояния размонтированного экрана, которое React
// молча пропускает.
import { createContext } from 'react';

export const Screen = createContext('screen');
const screens = new Map();
export function screen(name) {
  if (!screens.has(name)) screens.set(name, { buttons: new Map(), writes: 0 });
  return screens.get(name);
}
