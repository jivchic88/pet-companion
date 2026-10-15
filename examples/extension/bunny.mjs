// Пример расширения (вне пакета; README, «Питомцы и модели поведения»): третий питомец — кролик, определение формата 1
// только через публичные входы pet-companion/core (definePet) и pet-companion/pets (общий уголок). Своих правил нет: ядро
// исполняет данные. Лапы нет (actions.paw: null — interact({ type: 'paw' }) отклоняется unsupported, области лапы и кнопки
// нет), зевка нет (нет позы yawn — реакция не играет), одна своя сценка hop (needs: 'any' — и в портрете). Недостающие позы
// словаря — замены poseFallback. Живёт в штатном уголке (corner, cornerItems) со своей игрушкой — морковкой. Рисунок —
// набор bunny-web.mjs.

import { definePet } from 'pet-companion/core';
import { corner, cornerItems } from 'pet-companion/pets';

export const bunny = definePet({
  format: 1,
  id: 'example.bunny',
  title: 'Кролик',
  forms: { gen: 'кролика', acc: 'кролика' },
  names: { default: 'Пух', presets: ['Морковкин', 'Пух', 'Ушастик', 'Зефир', 'Прыг', 'Хрустик', 'Попрыгун', 'Сугроб'], offer: 'Морковкин' },
  coats: [
    { id: 'snow', title: 'Белый' },
    { id: 'grey', title: 'Серый' },
    { id: 'spot', title: 'Пятнистый' },
  ],
  accessories: [
    { id: 'ribbon', title: 'Голубая ленточка', stage: 0 },
    { id: 'bow', title: 'Бантик', stage: 1 },
    { id: 'clover', title: 'Ленточка с клевером', stage: 4, short: 'клевер' },
  ],
  items: {
    list: cornerItems.map((item) => ({ ...item })),
    gifts: ['{name} и простая подушка', 'Бантик', 'Кружка и блокнот', 'Лежанка и лампа', 'Растение, доска с заметками и клевер'],
  },
  poses: ['calm', 'attentive', 'rest', 'content', 'joy', 'pet', 'feed', 'sniff', 'hop'],
  poseFallback: { wait: 'attentive', support: 'calm', unlock: 'joy', greet: 'joy', fed: 'content', watch: 'attentive', ball: 'attentive' },
  micro: ['ear', 'nose', 'look'],
  openMicro: ['ear', 'nose'],
  actions: { pet: { text: '{name} шевелит носом.' }, paw: null },
  scenes: [{ id: 'hop', pose: 'hop', needs: 'any', ms: 2500, still: 1500, text: 'прыгает на месте' }],
  size: { width: 220, height: 204, ground: 176 },
  play: {
    hits: [
      { part: 'head', cx: 104, cy: 70, rx: 44, ry: 66 },
      { part: 'body', cx: 110, cy: 152, rx: 60, ry: 38 },
    ],
    paw: null,
    foot: [48, 174, 194],
    anchor: [106, 190],
  },
  room: {
    ...corner,
    pet: { all: [-47, -146, 51, -11], core: [-45, -146, 33, -19] },
    feed: [-62, -116, 50, 0],
    toys: [{ id: 'carrot', title: 'Морковка', home: [40, 232], box: [-17, -8, 17, 8], stage: 0 }],
  },
  fallback: 'cat',
});
