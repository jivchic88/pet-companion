// Ядро: данные рисунка питомца, общие для игры и комнаты (docs/ARCHITECTURE.md § 7.1 «size», «play», «room»; срез
// PL04.3) — рамка рисунка в его единицах (viewBox 220×204, общий у кота и собаки, земля — y = 188), области попадания
// головы и тела, лапа, рамка питомца в сцене комнаты. Только данные, без DOM и без импорта рисунков: веб-рисунки
// (cat-art.mjs, dog-art.mjs) нарисованы в этих же единицах — соответствие сверяют проверки (test/core-room.test.mjs). С
// PL06 — поля определения питомца (size, play, room); подключаемых определений до PL06 нет.

// Рамка рисунка: единицы игры («Поиграть») и масштаб питомца в комнате.
export const PET_BOX = Object.freeze({ width: 220, height: 204 });

// Голова с ушами и тело с лапами — эллипсы в единицах рисунка; хвост и пустые углы рамки — не питомец.
export const HIT = Object.freeze({
  cat: Object.freeze([Object.freeze({ part: 'head', cx: 100, cy: 66, rx: 58, ry: 52 }), Object.freeze({ part: 'body', cx: 100, cy: 150, rx: 64, ry: 46 })]),
  dog: Object.freeze([Object.freeze({ part: 'head', cx: 100, cy: 72, rx: 64, ry: 52 }), Object.freeze({ part: 'body', cx: 100, cy: 150, rx: 64, ry: 46 })]),
});

// Левая (на экране) передняя лапа — круг; up — поднятая лапа собаки в позе «Дай лапу».
export const PAW = Object.freeze({
  cat: Object.freeze({ cx: 90, cy: 176, r: 15 }),
  dog: Object.freeze({ cx: 90, cy: 176, r: 15, up: Object.freeze({ cx: 72, cy: 137, r: 15 }) }),
});

// Питомец в сцене комнаты (viewBox 400×250): рисунок 220×204 вписан в эту рамку целиком — по высоте (веб: sceneCatBox
// в cat-art.mjs, там же её положение по ступени).
export const SCENE_PET = Object.freeze({ width: 176, height: 160 });
