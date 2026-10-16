// Натив: движение реакции при показе (этап PL10.1; docs/ARCHITECTURE.md § 12.2). Только данные и чистая функция: какую
// короткую анимацию встроенного Animated сыграть поверх позы, которую уже решило ядро (снимок pose.shown.page и
// pose.reaction). Тип и длительность реакции, приоритеты, лимиты, награды и кормление — в ядре; здесь — только амплитуда и
// темп самого движения рисунка, как ключевые кадры CSS веб-отображения (pet.css: прыжок радости, мурлыканье, поклёвывание
// у миски). Без движения (effectiveMotion 'none') — ничего: смысл реакции остаётся статической позой и текстом.
//
// План: { prop: 'x' | 'y', steps: [{ to, ms }], repeat } — значение одного Animated.Value в единицах рисунка (отображение
// переводит их в точки экрана), repeat — сколько раз пройти шаги. 'calm' — только мягкие движения и вдвое меньше.

const PLANS = Object.freeze({
  // Радость и приветствие — прыжок (pet.css cat-hop), только обычное движение.
  joy: { prop: 'y', steps: [[-6, 170], [0.6, 150], [0, 130]], repeat: 1, calm: false },
  greet: { prop: 'y', steps: [[-3.5, 160], [0, 170]], repeat: 1, calm: false },
  meet: { prop: 'y', steps: [[-3.5, 160], [0, 170]], repeat: 1, calm: false },
  unlock: { prop: 'y', steps: [[-4, 160], [0, 170]], repeat: 1, calm: false },
  named: { prop: 'y', steps: [[-2.5, 150], [0, 150]], repeat: 1, calm: false },
  // Поглаживание и сытость — мурлыканье (pet.css cat-purr), мягко и в спокойном режиме.
  pet: { prop: 'x', steps: [[1.5, 140], [-1, 140], [0, 120]], repeat: 2, calm: true },
  calmPet: { prop: 'x', steps: [[1, 140], [0, 140]], repeat: 1, calm: true },
  fed: { prop: 'x', steps: [[1.2, 140], [0, 140]], repeat: 3, calm: true },
  // Лакомство — поклёвывание у миски (pet.css cat-nibble).
  feed: { prop: 'y', steps: [[2.5, 190], [0, 190]], repeat: 4, calm: true },
  // Лапа — лёгкий толчок.
  paw: { prop: 'y', steps: [[-1.5, 150], [0, 150]], repeat: 1, calm: true },
  calmPaw: { prop: 'y', steps: [[-1, 150], [0, 150]], repeat: 1, calm: true },
});

export const MOTION_TYPES = Object.freeze(Object.keys(PLANS));

// План движения реакции type в режиме motion ('normal' | 'calm' | 'none') или null — не двигать.
export function motionPlan(type, motion) {
  if (motion !== 'normal' && motion !== 'calm') return null;
  const plan = typeof type === 'string' && Object.hasOwn(PLANS, type) ? PLANS[type] : null;
  if (!plan || (motion === 'calm' && !plan.calm)) return null;
  const k = motion === 'calm' ? 0.5 : 1;
  return Object.freeze({ prop: plan.prop, repeat: plan.repeat, steps: Object.freeze(plan.steps.map(([to, ms]) => Object.freeze({ to: to * k, ms }))) });
}
