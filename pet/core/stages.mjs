// Ядро: ступени по знакам, итог подтверждённого занятия, лакомство дня. Знаки считает сайт; питомец не знает качества
// занятия, только подтверждённое событие. Пороги и названия ступеней — общие правила ядра; вещи, подарки и аксессуары
// ступеней — у определения питомца (PL06: items, accessories), функции ниже получают его определение.

export const STAGES = [
  { at: 0, title: 'Познакомились' },
  { at: 3, title: 'Освоился' },
  { at: 9, title: 'Наш ритуал' },
  { at: 18, title: 'Уютный штаб' },
  { at: 30, title: 'Сработались' },
];

// Вещи ступени index у питомца (определение pet) — в порядке items.list.
export const stageItems = (pet, index) => pet.items.list.filter((item) => item.stage === index).map((item) => item.id);

// Подарок ступени — по питомцу: шаблон items.gifts[index], {name} — его имя (пустое — имя по умолчанию).
export function stageGift(pet, index, name = '') {
  const gift = pet.items.gifts[index];
  return gift ? gift.replaceAll('{name}', name || pet.names.default) : '';
}

export function stageIndex(marks) {
  let index = 0;
  STAGES.forEach((stage, i) => {
    if (marks >= stage.at) index = i;
  });
  return index;
}

// Прогресс для сцены: ступень (открытые вещи не пропадают — unlocked не меньше видимой ранее),
// следующая ступень и сколько знаков до неё.
export function progressInfo(marks, seenStage = -1) {
  const computed = stageIndex(marks);
  const stage = Math.max(computed, Math.min(seenStage, STAGES.length - 1));
  const next = STAGES[stage + 1] ?? null;
  return { marks, stage, computed, current: STAGES[stage], next, toNext: next ? Math.max(0, next.at - marks) : 0 };
}

// Подтверждённое занятие (notify 'saved'): counted — дало знак (тогда до него знаков было на один меньше), hard — трудное;
// marks — знаки сейчас. Ступени до и после — по знакам.
export const doneOutcome = ({ counted = false, hard = false } = {}, marks = 0) => ({
  practice: true,
  counted: Boolean(counted),
  hard: Boolean(hard),
  stageBefore: stageIndex(marks - (counted ? 1 : 0)),
  stageAfter: stageIndex(marks),
});

// Праздновать ли новую ступень после занятия: только если её открыло это занятие и на этом
// устройстве её ещё не видели (перезагрузка и другая вкладка награду не повторяют).
export function stageToCelebrate(outcome, seenStage = -1) {
  if (!outcome?.practice || !outcome.counted) return null;
  return outcome.stageAfter > outcome.stageBefore && outcome.stageAfter > seenStage ? outcome.stageAfter : null;
}

// Что открылось у питомца между ступенями (для объявления и подсветки в сцене): вещи и аксессуары его определения.
// Аксессуар по умолчанию (первый, открыт с начала) — не награда и не перечисляется (как 0.1.4; PL11.2, D4); другой
// аксессуар ступени 0 у расширения — награда.
export function unlockedBetween(pet, from, to) {
  const items = [];
  const accessories = [];
  const [fallback] = pet.accessories;
  for (let i = Math.max(0, from + 1); i <= to && i < STAGES.length; i += 1) {
    items.push(...stageItems(pet, i));
    accessories.push(...pet.accessories.filter((item) => item !== fallback && item.stage === i).map((item) => item.id));
  }
  return { items, accessories };
}

// Аксессуар питомца: выбранный, если он есть у питомца; иначе — первый (по умолчанию).
export const accessoryOf = (pet, value) => (pet.accessories.some((item) => item.id === value) ? value : pet.accessories[0].id);

// Надетый аксессуар: выбранный, если его ступень открыта; иначе — первый (по умолчанию, ступень 0).
export function wornAccessory(pet, value, stage) {
  const item = pet.accessories.find((accessory) => accessory.id === value);
  return item && item.stage <= stage ? item.id : pet.accessories[0].id;
}

// Вещь рядом с питомцем при празднике: среди открытых — с наименьшим items.list[].mini (при равных — первая открытая);
// без mini — не показывается.
export function miniItem(pet, items) {
  let best = '';
  let rank = Infinity;
  for (const id of items) {
    const mini = pet.items.list.find((item) => item.id === id)?.mini;
    if (mini !== undefined && mini < rank) {
      best = id;
      rank = mini;
    }
  }
  return best;
}

// Состояние ритуала на день today: 'fed' — сегодня уже угостили; 'ready' — сегодня есть занятие (count — знаков за
// сегодня от сайта), можно угостить; 'waiting' — занятия сегодня ещё не было.
export function treatState(today = '', fedDay = '', count = 0) {
  if (fedDay && fedDay === today) return 'fed';
  return count > 0 ? 'ready' : 'waiting';
}

// Склонение «знак практики».
export function marksText(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const form = mod10 === 1 && mod100 !== 11 ? 'знак' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'знака' : 'знаков';
  return `${n} ${form}`;
}
