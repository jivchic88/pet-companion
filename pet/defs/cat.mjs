// Определения: кот — штатный питомец (docs/ARCHITECTURE.md § 7.1, § 7.9; этап PL06). Данные 0.1.4 без изменений: имя
// Марс и готовые имена, три облика, платки, вещи и подарки ступеней, позы и сценки (потягивается, сворачивается клубком —
// только целиком), одиночные движения, лапа в «Поиграть» без команды «Дай лапу», области попадания и рамки комнаты
// (замеры рисунка cat-art.mjs), клубок. Рисунки — веб-набор отображения, реплики — модель calm (byPet.cat).

import { definePet } from '../core/define.mjs';
import { corner, cornerItems } from './room.mjs';

export const cat = definePet({
  format: 1,
  id: 'cat',
  title: 'Кот',
  forms: { gen: 'кота', acc: 'кота' },
  names: {
    default: 'Марс',
    presets: ['Котлетыч', 'Пельмень', 'Бублик', 'Мурджер', 'Сеньор Мур', 'Марс', 'Сырник', 'Бэклог', 'Пиксель', 'Тимлидыч', 'Коржик', 'Профитроль'],
    offer: 'Котлетыч',
  },
  coats: [
    { id: 'smoke', title: 'Дымчатый' },
    { id: 'ginger', title: 'Рыжий' },
    { id: 'tuxedo', title: 'Чёрно-белый' },
  ],
  accessories: [
    { id: 'scarf', title: 'Терракотовый платок', stage: 0 },
    { id: 'plaid', title: 'Клетчатый платок', stage: 1 },
    { id: 'badge', title: 'Платок с бейджем', stage: 4, short: 'бейдж' },
  ],
  items: {
    list: cornerItems.map((item) => ({ ...item })),
    gifts: ['{name} и простая подушка', 'Клетчатый платок', 'Кружка и блокнот', 'Лежанка и лампа', 'Растение, доска с заметками и бейдж'],
  },
  poses: ['calm', 'attentive', 'rest', 'content', 'wait', 'joy', 'support', 'unlock', 'greet', 'pet', 'paw', 'feed', 'fed', 'sniff', 'watch', 'ball', 'yawn', 'settle', 'stretch', 'curl'],
  micro: ['ear', 'tail', 'look'],
  openMicro: ['ear', 'blink'],
  actions: { pet: { text: '{name} мурлычет.' }, paw: { text: '{name} касается твоей руки лапой.', ask: false } },
  scenes: [
    { id: 'stretch', pose: 'stretch', needs: 'any', ms: 3600, still: 2400, text: 'потягивается' },
    { id: 'curl', pose: 'curl', needs: 'full', ms: 4600, still: 2400, text: 'сворачивается клубком' },
  ],
  size: { width: 220, height: 204, ground: 176 },
  play: {
    hits: [
      { part: 'head', cx: 100, cy: 66, rx: 58, ry: 52 },
      { part: 'body', cx: 100, cy: 150, rx: 64, ry: 46 },
    ],
    paw: { cx: 90, cy: 176, r: 15 },
    foot: [34, 202, 197],
    anchor: [100, 190],
  },
  room: {
    ...corner,
    pet: { all: [-63, -154, 67, -9], core: [-60, -154, 32, -16] },
    feed: [-88, -114, 49, 0],
    toys: [{ id: 'yarn', title: 'Клубок', home: [36, 231], box: [-13, -11, 17, 14], stage: 0 }],
  },
  fallback: 'cat',
});
