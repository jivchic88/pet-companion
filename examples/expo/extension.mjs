// Пример расширения на нативе (PL10.2.4) — данные: вторая модель поведения «живая» только через публичный вход
// pet-companion/core. Те же данные, что examples/extension/lively.mjs (Metro не берёт файлы вне проекта примера; совпадение
// сверяет test/native-example.test.mjs). Третий питомец с 0.4.0 — штатный кролик пакета (pet-companion/bunny, набор
// bunnyNative входа pet-companion/native); прежний кролик примера расширения остался в examples/extension/ (веб).
import { defineBehavior } from 'pet-companion/core';

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

