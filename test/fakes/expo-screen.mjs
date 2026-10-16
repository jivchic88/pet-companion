// Только проверки натива (test/native-example.test.mjs, test/native-view.test.mjs): экран под наблюдением. Screen — метка
// экземпляра экрана (контекст React, проверка оборачивает им каждый App или PetView; без метки — экран 'screen');
// screen(метка) — его записи: последние обработчики кнопок Button по заголовку, последние свойства каждого узла подделок
// React Native и react-native-svg по testID (nodes: testID → { type, props }; test/fakes/react-native.mjs,
// test/fakes/react-native-svg.mjs) и число вызовов функций смены состояния useState (test/fakes/react-state.mjs) — так
// видно позднее изменение состояния размонтированного экрана, которое React молча пропускает.
import { createContext, useContext, useEffect } from 'react';

export const Screen = createContext('screen');
const screens = new Map();
export function screen(name) {
  if (!screens.has(name)) screens.set(name, { buttons: new Map(), nodes: new Map(), writes: 0 });
  return screens.get(name);
}
// Хук подделок: записать свойства узла type своего экрана по testID; при размонтировании узла — убрать.
export function useRecord(type, props) {
  const own = screen(useContext(Screen));
  const id = props.testID;
  if (id) own.nodes.set(id, { type, props });
  useEffect(
    () => () => {
      if (id && own.nodes.get(id)?.props === props) own.nodes.delete(id);
    },
    [own, id, props],
  );
}
