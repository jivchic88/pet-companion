// Ядро: ступени по знакам, вещи и аксессуары ступеней, итог подтверждённого занятия, лакомство дня. Знаки считает сайт;
// питомец не знает качества занятия, только подтверждённое событие.

import { DEFAULT_NAME, PROFILES } from './pets.mjs';

export const STAGES = [
  { at: 0, title: 'Познакомились', gift: 'Марс и простая подушка', items: ['cushion'] },
  { at: 3, title: 'Освоился', gift: 'Клетчатый платок', items: [], accessory: 'plaid' },
  { at: 9, title: 'Наш ритуал', gift: 'Кружка и блокнот', items: ['mug', 'notebook'] },
  { at: 18, title: 'Уютный штаб', gift: 'Лежанка и лампа', items: ['bed', 'lamp'] },
  { at: 30, title: 'Сработались', gift: 'Растение, доска с заметками и бейдж', items: ['plant', 'board'], accessory: 'badge' },
];

// Вещи сцены по ступеням (номер ступени → вещи). У собаки со ступени «Наш ритуал» ещё мячик;
// пороги и вещи кота те же.
export function stageItems(index, kind = 'cat') {
  const items = STAGES[index]?.items ?? [];
  return kind === 'dog' && index === 2 ? [...items, 'ball'] : items;
}

// Подарок ступени — по животному: на первой ступени имя напарника (у собаки не «Марс»),
// у собаки на «Нашем ритуале» — ещё мячик. Названия наград кота не меняются.
export function stageGift(index, kind = 'cat', name = '') {
  const stage = STAGES[index];
  if (!stage) return '';
  if (index === 0) return `${name || PROFILES[kind]?.defaultName || DEFAULT_NAME} и простая подушка`;
  if (kind === 'dog' && index === 2) return 'Кружка, блокнот и мячик';
  return stage.gift;
}

export const ACCESSORIES = [
  { id: 'scarf', title: 'Терракотовый платок', stage: 0 },
  { id: 'plaid', title: 'Клетчатый платок', stage: 1 },
  { id: 'badge', title: 'Платок с бейджем', stage: 4 },
];

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

// Что открылось между ступенями (для объявления и подсветки в сцене); kind — чьи вещи.
export function unlockedBetween(from, to, kind = 'cat') {
  const items = [];
  const accessories = [];
  for (let i = Math.max(0, from + 1); i <= to && i < STAGES.length; i += 1) {
    items.push(...stageItems(i, kind));
    if (STAGES[i].accessory) accessories.push(STAGES[i].accessory);
  }
  return { items, accessories };
}

// Надетый аксессуар: выбранный, если его ступень открыта; иначе — обычный платок.
export function wornAccessory(settings, stage) {
  const item = ACCESSORIES.find((accessory) => accessory.id === settings?.accessory);
  return item && item.stage <= stage ? item.id : 'scarf';
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
