// Только QA (npm run test:consumers): персонаж минимального режима (U01) для страницы жизненного цикла — описание и набор
// через публичные входы установленного архива; стили набора — файл рядом (Vite переносит адрес new URL в сборку).
import { defineCharacter } from 'pet-companion/character';

export const robot = defineCharacter({
  format: 1,
  id: 'qa.robot',
  title: 'Робот',
  poses: ['calm', 'attentive', 'happy'],
  reactions: { done: { pose: 'happy', ms: 1500, priority: 4, phrases: 'done', announce: true } },
  phrases: { done: ['{name}: готово'] },
});

export const robotKit = Object.freeze({
  character: 'qa.robot',
  poses: Object.freeze(['calm', 'attentive', 'happy']),
  art: ({ id }) => `<svg class="qa-robot" data-id="${id}" viewBox="0 0 100 100" aria-hidden="true"><rect class="qa-robot-body" x="20" y="30" width="60" height="50" rx="8"/><circle class="qa-robot-eye" cx="40" cy="50" r="6"/><circle class="qa-robot-eye" cx="60" cy="50" r="6"/></svg>`,
  styles: Object.freeze([new URL('./hero.css', import.meta.url).href]),
});
