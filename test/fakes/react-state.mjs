// Только проверки примера Expo (test/native-example.test.mjs): React для examples/expo/App.js (загрузчик подставляет этот
// модуль только импорту 'react' из App.js) — настоящий React, но каждый вызов функции смены состояния useState
// записывается экрану своей метки (test/fakes/expo-screen.mjs). Остальное — тот же экземпляр React.
import { useCallback, useContext, useState as reactState } from 'react';
import { Screen, screen } from './expo-screen.mjs';

export * from 'react';

export function useState(initial) {
  const own = screen(useContext(Screen));
  const [value, set] = reactState(initial);
  const write = useCallback(
    (next) => {
      own.writes += 1;
      set(next);
    },
    [own, set],
  );
  return [value, write];
}
