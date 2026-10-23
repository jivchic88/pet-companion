// Ядро: порты времени, случайности, планировщика и журнала (docs/ARCHITECTURE.md § 4.3) — системные реализации по
// умолчанию. Ни один порт не вызывается при загрузке модуля: только после createPetCore. Порты не вызывают команд ядра
// синхронно (такая команда — отказ reentrant, § 5.4).

import { localDay, msToMidnight } from './day.mjs';

export const systemClock = Object.freeze({
  now: () => Date.now(),
  day: (at) => localDay(new Date(at)),
  nextDay: (at) => at + msToMidnight(new Date(at)),
});

export const systemRandom = () => Math.random();

export const systemScheduler = Object.freeze({
  later(ms, task) {
    const id = setTimeout(task, ms);
    return () => clearTimeout(id);
  },
});

export const systemLog = Object.freeze({
  warn: (message, error) => (error === undefined ? console.warn(`Питомец: ${message}`) : console.warn(`Питомец: ${message}`, error)),
});

const isFn = (value) => typeof value === 'function';

// Проверка переданных портов; текст ошибки или ''.
export function portProblem({ clock, random, scheduler, log }) {
  if (clock !== undefined && !(clock && isFn(clock.now) && isFn(clock.day) && isFn(clock.nextDay))) return 'clock — объект с now(), day(at), nextDay(at)';
  if (random !== undefined && !isFn(random)) return 'random — функция () => [0, 1)';
  if (scheduler !== undefined && !(scheduler && isFn(scheduler.later))) return 'scheduler — объект с later(ms, task)';
  if (log !== undefined && !(log && isFn(log.warn))) return 'log — объект с warn(message, error?)';
  return '';
}
