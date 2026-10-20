// Пример минимального режима (вне пакета; README, «Персонаж: минимальный режим»): третий персонаж — робот, описание
// формата персонажа 1 только через публичный вход pet-companion/character. Ни комнаты, ни миски, ни лап, ни ступеней:
// позы покоя (calm, attentive — внимание в тишине, rest — дремота) и реакции продукта со своими именами. Реплики —
// нейтральные, {name} — имя, которое даёт продукт. Рисунок — набор robot-web.mjs.

import { defineCharacter } from 'pet-companion/character';

export const robot = defineCharacter({
  format: 1,
  id: 'example.robot',
  title: 'Робот',
  poses: ['calm', 'attentive', 'rest', 'happy', 'think', 'wave'],
  reactions: {
    // Продукт подтвердил выполненную задачу: радость, реплика объявляется скринридеру.
    done: { pose: 'happy', ms: 1600, priority: 4, phrases: 'done', announce: true },
    // Что-то не вышло: поддержка, не чаще раза в 5 с.
    oops: { pose: 'think', ms: 1400, priority: 5, cooldown: 5000, phrases: 'oops' },
    // Приветствие по нажатию на робота.
    wave: { pose: 'wave', ms: 1200, priority: 6, phrases: 'hello' },
  },
  phrases: {
    done: ['Готово!', '{name} отметил: сделано.', 'Ещё один шаг.'],
    oops: ['Бывает. Попробуем снова.', '{name} перепроверит.'],
    hello: ['Привет!', '{name} на связи.'],
  },
  micro: ['antenna', 'look'],
  timings: { phrase: 2200 },
});
