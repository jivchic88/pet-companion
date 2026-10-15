// Ядро: «Обустроить уголок» — черновик редактора комнаты (docs/ARCHITECTURE.md § 5.2 room.draft, § 6.4 «Комната»,
// сценарий § 6.8; срез PL04.3). Перенесено из оболочки pet.mjs (enterRoom, pickRoom, moveRoom, resetRoom, restageRoom,
// roomHooks, saveRoom — решение, cancelArrange — смысл) и pet-room.mjs (live). Сохраняемая расстановка (память ключа room),
// черновик и идущий перенос — разные вещи: перенос (drag) меняет только свою точку под указателем, черновик — только drop;
// отмена переноса оставляет все прежние правки черновика. Запись ключа, выход из редактора и вид — экземпляр (index.mjs);
// указатель, порог начала переноса и перевод px в единицы сцены — отображение.

import { arrange, DIRS, itemTitle, movedItems, nudge, same, samePlaces, settle } from './room.mjs';

// Объявления и сообщения редактора (тексты 0.1.4). Сообщения other и failed без точки — их показывает и редактор.
export const ROOM_TEXT = Object.freeze({
  other: 'В другой вкладке сохранена новая расстановка. Здесь останутся твои изменения',
  failed: 'Не удалось сохранить расстановку. Попробуй ещё раз',
  saved: 'Расстановка сохранена.',
  same: 'Расстановка не изменилась.',
  cancelled: 'Отменено: расстановка прежняя.',
  kept: 'Отменено. Расстановка не сохранилась в этом браузере: она действует на этой странице до перезагрузки.',
  late: 'Расстановка не сохранилась в этом браузере: она действует на этой странице до перезагрузки.',
  reset: 'Обычная расстановка. Сохрани, чтобы оставить её.',
});
// Итог шага и упор (0.1.4: «Клубок левее.», «Клубок: дальше влево нельзя.»).
const WORDS = { left: ['левее', 'влево'], right: ['правее', 'вправо'], up: ['выше', 'выше'], down: ['ниже', 'ниже'] };
export const ROOM_DIRS = Object.keys(DIRS);

const layoutOf = (draft, pos = draft.pos) => ({ kind: draft.kind, stage: draft.stage, pos });
const title = (draft, id) => itemTitle(id, draft.stage);

// Черновик: saved — расстановка из памяти ключа (с несохранёнными правками), baseline — подтверждённая и уже поставленная
// в запись (для «Не сохранено» и для того, что писать); unsaved — предметы с несохранёнными полями: их пишет следующее
// «Сохранить». Выбран — место отдыха.
export function openDraft({ kind, stage, saved, baseline, unsaved = [] }) {
  return { kind, stage, pos: { ...saved }, baseline: { ...baseline }, pick: 'rest', touched: new Set(unsaved.filter((id) => id in saved)), other: false, failed: false, drag: null };
}

// Выбор для шага кнопками (без объявления: кнопка отмечена). Во время переноса — ничего (кнопки ждут его конца).
export function select(draft, id) {
  if (draft.drag || draft.pick === id) return false;
  draft.pick = id;
  return true;
}

// Перенос указателем: point — точка с той же точкой захвата (единицы сцены). Первый вызов начинает перенос и выбирает
// предмет («Выбрано: …», если выбор сменился); следующие — ближайшее допустимое место под указателем; перенос другого
// предмета сначала отменяет текущий. Черновик не меняется. Возвращает объявления.
export function drag(draft, id, point) {
  const told = [];
  if (draft.drag && draft.drag.id !== id) draft.drag = null;
  const at = settle(layoutOf(draft), id, point);
  if (draft.drag) {
    draft.drag = { ...draft.drag, at };
    return told;
  }
  if (draft.pick !== id) {
    draft.pick = id;
    told.push(`Выбрано: ${title(draft, id).toLowerCase()}.`);
  }
  draft.drag = { id, at, from: draft.pos[id] };
  return told;
}

// Отпустили: место под указателем — в черновик; объявление — только если место изменилось.
export function drop(draft) {
  if (!draft.drag) return null;
  const { id, at } = draft.drag;
  draft.drag = null;
  const moved = !samePlaces({ [id]: at }, { [id]: draft.pos[id] });
  draft.pos = { ...draft.pos, [id]: at };
  if (!moved) return [];
  draft.touched.add(id);
  return [`${title(draft, id)} на новом месте.`];
}

// Отмена только текущего переноса: черновик со всеми прежними правками остаётся, редактор открыт, без объявления.
export function dragCancel(draft) {
  if (!draft.drag) return false;
  draft.drag = null;
  return true;
}

// Размещение одним шагом (программное): то же, что перенос и отпускание, без объявления выбора.
export function move(draft, id, point) {
  draft.drag = null;
  draft.pick = id;
  const at = settle(layoutOf(draft), id, point);
  const moved = !samePlaces({ [id]: at }, { [id]: draft.pos[id] });
  draft.pos = { ...draft.pos, [id]: at };
  if (!moved) return [];
  draft.touched.add(id);
  return [`${title(draft, id)} на новом месте.`];
}

// Шаг кнопкой или стрелкой — выбранный предмет на STEP, у преграды — сколько можно; некуда — прежнее объявление об упоре.
// Во время переноса — ничего. Возвращает { moved, told }.
export function step(draft, dir) {
  if (draft.drag) return { moved: false, told: [] };
  const id = draft.pick;
  const p = nudge(layoutOf(draft), id, dir);
  if (!p) return { moved: false, told: [`${title(draft, id)}: дальше ${WORDS[dir][1]} нельзя.`] };
  draft.pos = { ...draft.pos, [id]: p };
  draft.touched.add(id);
  return { moved: true, told: [`${title(draft, id)} ${WORDS[dir][0]}.`] };
}

// Обычная расстановка — в черновик (постоянной — после «Сохранить»); перенос сначала отменяется.
export function reset(draft) {
  draft.drag = null;
  draft.pos = arrange(draft.kind, draft.stage, {}).pos;
  for (const id of Object.keys(draft.pos)) draft.touched.add(id);
  return [ROOM_TEXT.reset];
}

// Новая ступень при открытом редакторе: перенос отменён, черновик — на ней (лежанка, мячик), сделанное остаётся; выбор —
// место отдыха, если выбранного предмета больше нет. Записи нет.
export function restage(draft, stage, saved, baseline) {
  draft.drag = null;
  draft.stage = stage;
  draft.baseline = { ...baseline };
  draft.pos = arrange(draft.kind, stage, { ...saved, ...draft.pos }).pos;
  if (!(draft.pick in draft.pos)) draft.pick = 'rest';
}

// Расстановка изменилась помимо редактора. foreign — чужая запись (другая вкладка, другое ядро): если сменилась
// расстановка этого питомца — отметка и одно объявление; черновик не меняется. Иначе (исход своей записи) — тихо.
export function rebase(draft, baseline, foreign) {
  if (samePlaces(baseline, draft.baseline)) return [];
  draft.baseline = { ...baseline };
  if (!foreign || draft.other) return [];
  draft.other = true;
  return [`${ROOM_TEXT.other}.`];
}

// «Сохранить»: перенос отменяется, а не дописывается; черновик — по правилам текущей ступени; пишутся передвинутые здесь
// предметы, чьё место отличается от подтверждённого (baseline — свежая расстановка после сверки). Возвращает moved.
export function prepare(draft, baseline) {
  draft.drag = null;
  draft.pos = arrange(draft.kind, draft.stage, draft.pos).pos;
  draft.baseline = { ...baseline };
  return movedItems(draft.pos, baseline, [...draft.touched]);
}

// Снимок черновика (простые данные): места, выбор, не сохранённые предметы, другая вкладка, отказ, идёт ли запись, перенос
// и куда можно шагнуть выбранным (кнопки направлений).
export function draftState(draft, saving) {
  const ids = Object.keys(draft.pos);
  return {
    pos: Object.fromEntries(ids.map((id) => [id, [...draft.pos[id]]])),
    pick: draft.pick,
    changed: ids.filter((id) => !(draft.baseline[id] && same(draft.pos[id], draft.baseline[id]))),
    other: draft.other,
    failed: draft.failed,
    saving,
    drag: draft.drag ? { id: draft.drag.id, at: [...draft.drag.at], from: [...draft.drag.from] } : null,
    can: ROOM_DIRS.filter((dir) => nudge(layoutOf(draft), draft.pick, dir) !== null),
  };
}
