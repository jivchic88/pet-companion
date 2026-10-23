// Ядро: местный день 'ГГГГ-ММ-ДД' — граница лакомства, приветствия и сценок; пауза между днями; начало следующего дня.
// Время экземпляра ядра — порт clock (ports.mjs); эти функции — его системная реализация и правила над днями.

export const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (value) => typeof value === 'string' && DAY_ONLY.test(value);

// Дней между двумя днями 'ГГГГ-ММ-ДД' (неверный день — null): пауза перед приветствием.
export function daysBetween(from, to) {
  if (!DAY_ONLY.test(String(from)) || !DAY_ONLY.test(String(to))) return null;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// Миллисекунды до следующей местной полуночи (смена дня ритуала в открытой вкладке).
export function msToMidnight(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return Math.max(1000, next.getTime() - date.getTime());
}

// Местная дата — для «первого открытия за день», лакомства и сценок.
export function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
