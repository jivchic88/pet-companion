// Определения: кролик — штатный питомец (docs/ARCHITECTURE.md § 7.1, § 7.9; с 0.4.0). Пух и готовые имена, три облика
// (палевый, белый, пятнистый), аксессуары ступеней (терракотовый платок, бантик, ленточка с клевером), вещи ступеней (на «Нашем ритуале» — ещё
// пучок сена), две сценки («прыгает на месте» — и в портрете, «умывается» — только целиком), одиночные движения (чаще ухо и
// нос), лапка в «Поиграть» без команды «Дай лапу», области попадания и рамки комнаты (замеры рисунка bunny-art.mjs), морковка
// и сено. Рисунки — веб-набор bunnyWeb (вход pet-companion/bunny) и нативный bunnyNative, реплики — модель calm (byPet.bunny).
// В перечень входа «.» не входит: кролик подключается явно — pets: [cat, dog, bunny], kits: [bunnyWeb] (README, «Кролик»).

import { definePet } from '../core/define.mjs';
import { corner, cornerItems } from './room.mjs';

const items = cornerItems.map((item) => ({ ...item }));
// Пучок сена — после кружки и блокнота той же ступени, первым рядом с питомцем при празднике.
items.splice(items.findIndex((item) => item.id === 'notebook') + 1, 0, { id: 'hay', title: 'Пучок сена', stage: 2, mini: 0 });

export const bunny = definePet({
  format: 1,
  id: 'bunny',
  title: 'Кролик',
  forms: { gen: 'кролика', acc: 'кролика' },
  names: {
    default: 'Пух',
    presets: ['Морковкин', 'Пух', 'Ушастик', 'Зефир', 'Прыгун', 'Хрустик', 'Клевер', 'Сугроб', 'Бусинка', 'Дедлайн', 'Тыковка', 'Кнопка'],
    offer: 'Морковкин',
  },
  coats: [
    { id: 'fawn', title: 'Палевый' },
    { id: 'snow', title: 'Белый' },
    { id: 'spot', title: 'Пятнистый' },
  ],
  accessories: [
    { id: 'scarf', title: 'Терракотовый платок', stage: 0 },
    { id: 'bow', title: 'Розовый бантик', stage: 1 },
    { id: 'clover', title: 'Ленточка с клевером', stage: 4, short: 'клевер' },
  ],
  items: {
    list: items,
    gifts: ['{name} и простая подушка', 'Розовый бантик', 'Кружка, блокнот и пучок сена', 'Лежанка и лампа', 'Растение, доска с заметками и клевер'],
  },
  poses: ['calm', 'attentive', 'rest', 'content', 'wait', 'joy', 'support', 'unlock', 'greet', 'pet', 'paw', 'feed', 'fed', 'sniff', 'watch', 'ball', 'yawn', 'settle', 'hop', 'wash'],
  micro: ['ear', 'nose', 'look', 'ear', 'nose', 'tail'],
  openMicro: ['ear', 'nose'],
  actions: { pet: { text: '{name} шевелит носом.' }, paw: { text: '{name} тянется к твоей руке лапкой.', ask: false } },
  scenes: [
    { id: 'hop', pose: 'hop', needs: 'any', ms: 3200, still: 2000, text: 'прыгает на месте' },
    { id: 'wash', pose: 'wash', needs: 'full', ms: 4200, still: 2400, text: 'умывает мордочку' },
  ],
  size: { width: 220, height: 204, ground: 176 },
  play: {
    hits: [
      { part: 'head', cx: 100, cy: 72, rx: 50, ry: 66 },
      { part: 'body', cx: 100, cy: 152, rx: 68, ry: 42 },
    ],
    paw: { cx: 90, cy: 176, r: 15 },
    foot: [30, 190, 197],
    anchor: [100, 190],
  },
  room: {
    ...corner,
    pet: { all: [-58, -156, 66, -7], core: [-56, -122, 40, -14] },
    feed: [-84, -116, 48, 2],
    toys: [
      { id: 'carrot', title: 'Морковка', home: [40, 232], box: [-19, -9, 19, 9], stage: 0 },
      { id: 'hay', title: 'Пучок сена', home: [280, 236], box: [-22, -18, 22, 6], stage: 2 },
    ],
  },
  fallback: 'cat',
});
