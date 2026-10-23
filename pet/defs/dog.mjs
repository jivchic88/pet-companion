// Определения: собака — штатный питомец (docs/ARCHITECTURE.md § 7.1, § 7.9; этап PL06). Данные 0.1.4 без изменений: имя
// Тоби и готовые имена, три облика, платки, вещи ступеней (на «Нашем ритуале» — ещё мячик), сценка «приносит мячик»,
// одиночные движения (чаще наклон головы и уши), лапа с командой «Дай лапу» (поднятая лапа — своя область), области
// попадания и рамки комнаты (замеры рисунка dog-art.mjs), канат и мячик. Реплики — модель calm (byPet.dog).

import { definePet } from '../core/define.mjs';
import { corner, cornerItems } from './room.mjs';

const items = cornerItems.map((item) => ({ ...item }));
// Мячик — после кружки и блокнота той же ступени, первым рядом с питомцем при празднике.
items.splice(items.findIndex((item) => item.id === 'notebook') + 1, 0, { id: 'ball', title: 'Мячик', stage: 2, mini: 0 });

export const dog = definePet({
  format: 1,
  id: 'dog',
  title: 'Собака',
  forms: { gen: 'собаки', acc: 'собаку' },
  names: {
    default: 'Тоби',
    presets: ['Барклий', 'Лапыч', 'Батон', 'Спринт', 'Шашлычок', 'Тоби', 'Пончик', 'Стендап', 'Чебурек', 'Релиз', 'Пряник', 'Гавриил'],
    offer: 'Барклий',
  },
  coats: [
    { id: 'caramel', title: 'Карамельный' },
    // Неразрывный пробел после «с»: в узкой карточке предлог не остаётся в конце строки.
    { id: 'spotted', title: 'Белый с\u00a0пятном' },
    { id: 'blacktan', title: 'Чёрный с\u00a0подпалом' },
  ],
  accessories: [
    { id: 'scarf', title: 'Терракотовый платок', stage: 0 },
    { id: 'plaid', title: 'Клетчатый платок', stage: 1 },
    { id: 'badge', title: 'Платок с бейджем', stage: 4, short: 'бейдж' },
  ],
  items: {
    list: items,
    gifts: ['{name} и простая подушка', 'Клетчатый платок', 'Кружка, блокнот и мячик', 'Лежанка и лампа', 'Растение, доска с заметками и бейдж'],
  },
  poses: ['calm', 'attentive', 'rest', 'content', 'wait', 'joy', 'support', 'unlock', 'greet', 'pet', 'paw', 'feed', 'fed', 'sniff', 'watch', 'ball', 'yawn', 'settle', 'fetch'],
  micro: ['tilt', 'ear', 'tail', 'tilt', 'ear', 'look'],
  openMicro: ['tilt', 'ear'],
  actions: { pet: { text: '{name} виляет хвостом.' }, paw: { text: '{name} даёт лапу.', ask: true } },
  scenes: [{ id: 'fetch', pose: 'fetch', needs: 'any', ms: 4200, still: 2400, text: 'приносит мячик' }],
  size: { width: 220, height: 204, ground: 176 },
  play: {
    hits: [
      { part: 'head', cx: 100, cy: 72, rx: 64, ry: 52 },
      { part: 'body', cx: 100, cy: 150, rx: 64, ry: 46 },
    ],
    paw: { cx: 90, cy: 176, r: 15, up: { cx: 72, cy: 137, r: 15 } },
    foot: [34, 202, 197],
    anchor: [100, 190],
  },
  room: {
    ...corner,
    pet: { all: [-66, -145, 71, -6], core: [-64, -145, 28, -14] },
    feed: [-90, -102, 50, 0],
    toys: [
      { id: 'rope', title: 'Канат', home: [36, 233], box: [-26, -8, 26, 10], stage: 0 },
      { id: 'ball', title: 'Мячик', home: [283, 234], box: [-12, -12, 12, 14], stage: 2 },
    ],
  },
  fallback: 'dog',
});
