// Пример расширения на нативе (PL10.2.4) — данные: третий питомец (кролик) и вторая модель «живая» только через публичные
// входы pet-companion/core и pet-companion/pets. Те же данные, что examples/extension/bunny.mjs и lively.mjs (Metro не берёт
// файлы вне проекта примера; совпадение сверяет test/native-example.test.mjs). Без React и react-native-svg — их использует
// diagnostics.mjs, которую test:package запускает в Node; рисунок кролика — bunny-native.mjs.
import { defineBehavior, definePet } from 'pet-companion/core';
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

export const lively = defineBehavior({
  format: 1,
  id: 'example.lively',
  title: 'Живая',
  reactions: {
    wait: { pose: 'wait', ms: 700, priority: 3, phrases: '', cooldown: 10_000 },
    joy: { pose: 'joy', ms: 1100, priority: 4, phrases: 'joy' },
    support: { pose: 'support', ms: 1300, priority: 4, phrases: 'support' },
    unlock: { pose: 'unlock', ms: 1800, priority: 5, phrases: 'unlock' },
    greet: { pose: 'greet', ms: 1200, priority: 6, phrases: 'greet' },
    meet: { pose: 'greet', ms: 1100, priority: 6, phrases: 'greet', cooldown: 6000 },
    named: { pose: 'greet', ms: 1000, priority: 6, phrases: 'named', cooldown: 4000 },
    pet: { pose: 'pet', ms: 1000, priority: 6, phrases: 'pet' },
    calmPet: { pose: 'pet', ms: 500, priority: 6, phrases: '' },
    paw: { pose: 'paw', ms: 1100, priority: 6, phrases: 'paw' },
    calmPaw: { pose: 'paw', ms: 600, priority: 6, phrases: '' },
    sniff: { pose: 'sniff', ms: 1000, priority: 7, phrases: 'sniff', toy: true },
    watch: { pose: 'watch', ms: 700, priority: 7, phrases: '', toy: true },
    ball: { pose: 'ball', ms: 1000, priority: 7, phrases: 'ball', toy: true },
    feed: { pose: 'feed', ms: 2000, priority: 4, phrases: '' },
    fed: { pose: 'fed', ms: 1600, priority: 4, phrases: 'fed' },
    settle: { pose: 'settle', ms: 900, priority: 7, phrases: '', decorative: true, cooldown: 1500 },
  },
  timings: {
    blink: { normal: [12_000, 28_000], calm: [24_000, 48_000] },
    micro: { normal: [45_000, 90_000], calm: [90_000, 180_000] },
    yawn: 0,
    phrase: 2600,
  },
  limits: { pet: 2 },
  scenes: { chance: 0.15, order: 'random', skip: ['cat/curl'] },
  phrases: {
    default: {
      greet: ['Привет! Поехали?', 'О, ты пришёл. Начинаем?', 'Я тут! С чего начнём?'],
      joy: ['Есть! Записано.', 'Ура, сохранено!', 'Шаг сделан. Дальше!'],
      support: ['Трудное позади. Отдышимся.', 'Сложный кусок пройден.', 'Получилось. Это было непросто.'],
      unlock: ['Ого, новинка!', 'Смотри, что появилось!', 'Становится уютнее!'],
      tryOn: ['Обновка! Ну как?'],
      pet: ['Ещё! Ещё!', 'Вот это да!', 'Хорошо-о.'],
      petEnough: ['Всё, хватит. Я довольный!'],
      paw: ['Держи лапу!', 'Лапа — тебе!'],
      sniff: ['Миска! Проверяю.', 'Нюх-нюх, на месте.'],
      ball: ['Катится! Догоню!', 'Мячик! Вижу!'],
      scene: ['Готов к делу!', 'Что дальше?', 'Я весь внимание.', { text: 'Кружка! Кофе будет?', stage: 2 }, { text: 'Под лампой светло.', stage: 3 }],
      rest: ['Прилягу на минутку.', 'Короткий перерыв.'],
      fed: ['Вкусно! Спасибо!', 'Хрум-хрум, отлично!', 'Подкрепился!'],
      joyTreat: ['Записано! А в уголке миска.', 'Готово! Можно угостить.'],
      named: ['Классное имя!', 'Запомнил!'],
      welcome: ['Вернулся! Здорово!', 'Привет! Без спешки начнём.'],
    },
    byPet: {
      'example.bunny': {
        pet: ['Нос шевелится сам.', 'Уши — довольные.', 'Хрум. Ещё немного.'],
        fed: ['Хрум-хрум. Морковно!', 'Вкусно! Уши торчком.'],
      },
    },
  },
});

