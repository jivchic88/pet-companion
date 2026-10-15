// Ядро: «Поиграть» — прямые действия, жест поглаживания и предметы (docs/ARCHITECTURE.md § 5.2 play, § 6.4 interact и
// stroke.*, сценарии § 6.8, § 10 «Лимит», «Перемещение миски не кормит»; срез PL04.3). Перенесено из оболочки pet.mjs
// (interact, playAct, showResult, playResults, onToy, onStroke, onStrokeEnd, resetHint) и pet-toys.mjs (moveBowl, rollBall,
// перенос предмета): лимиты, итог под сценой и момент его сброса, удержание довольной позы, объявления без повторов
// внутри жеста, места предметов. Отклик — единственный режиссёр сессии (host.manual: ручное действие окончательно
// отменяет сценку, затем отклик); задачи — её планировщик. Распознавание указателя, пороги в CSS px, кадры и анимации —
// отображение.
//
// Лимит: три полных отклика поглаживания и лапы за минуту, затем «пока хватит», дальше тихо; у предметов свой счёт;
// отклик, не сыгранный из-за не менее важной реакции, лимит не расходует (прямое действие). Знаков и наград нет, миска не
// кормит. Итог держится, пока идёт реакция, при которой он показан, и не меньше OUTCOME_MS; пока жест удерживает позу —
// не гаснет.

import { petMood } from './director.mjs';
import { kindOf } from './pets.mjs';
import { closer, HOME, NEAR, placeToy, rollDist, rollEnd, rollWay, sideOf, SIZE, TOY_STEP, TOYS, zoneOf } from './toys.mjs';

export const OUTCOME_MS = 900;
const MINUTE = 60_000;

// Итоги действий с именем (один список для показа и места под ним у отображения). moved — предмет сдвинулся, а питомец
// занят не менее важным откликом.
export function playTexts(kind, name) {
  const dog = kindOf(kind) === 'dog';
  return {
    enough: `${name}: пока хватит.`,
    paw: dog ? `${name} даёт лапу.` : `${name} касается твоей руки лапой.`,
    quiet: `${name} жмурится.`,
    pet: dog ? `${name} виляет хвостом.` : `${name} мурлычет.`,
    sniff: `${name} принюхивается к миске.`,
    look: `${name} смотрит на миску.`,
    ball: `${name} следит за мячиком.`,
    bowlMoved: 'Миска на новом месте.',
    ballMoved: 'Мячик прокатился.',
  };
}

export const playText = (outcome, toy, kind, name) => (outcome ? playTexts(kind, name)[outcome === 'moved' ? `${toy}Moved` : outcome] : '');

const recent = (times, at) => [...times.filter((time) => at - time < MINUTE), at];
const near = (a, b, tol) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;

// host: now(), sense() (kind, name, motion — итог движения), manual(type, options) → { played, id } (ручное действие
// режиссёра), activity(), current() → { id, until } | null (идущая реакция), later(name, ms, body), cancel(name),
// emit(effect), cancelScene(), floor() → { floor: [l, t, r, b] | null, touch }.
export function createPlay(host) {
  let petTimes = []; // полные отклики поглаживания и лапы (сессия: до destroy)
  let toyTimes = []; // реакции на миску и мячик — свой счёт
  let pos = { bowl: null, ball: null }; // заданное место (единицы рисунка) или null — исходное
  let outcome = null; // { key, toy, at, reaction } — итог под сценой
  let stroke = null; // { id, held, told }
  let strokes = 0;
  let drag = null; // { toy, at, from }

  const zone = () => {
    const { floor, touch } = host.floor();
    return floor ? zoneOf(floor, touch, host.sense().kind) : null;
  };
  const place = (z, toy, p) => placeToy(z, SIZE[toy], p);
  const at = (z, toy) => (z ? place(z, toy, pos[toy] ?? HOME[toy]) : null);

  // ---------- итог ----------

  // Показать итог: реакция, при которой он показан, — текущая (сыгранная или та, что его не пустила).
  function show(key, toy = '', { tell = true } = {}) {
    const s = host.sense();
    outcome = { key, toy, at: host.now(), reaction: host.current()?.id ?? null };
    host.cancel('play-outcome');
    if (tell) host.emit({ type: 'announce', text: playText(key, toy, s.kind, s.name) });
    settle();
  }

  // Итог гаснет, когда жест не удерживает позу, реакция, при которой он показан, кончилась (или её сменили) и прошло не
  // меньше OUTCOME_MS. Вызывается при каждом начале и конце реакции, конце жеста и задаче play-outcome (только запас до
  // OUTCOME_MS; конец реакции — задача сессии, своего таймера конца реакции нет).
  function settle() {
    if (!outcome || stroke?.held) return;
    const now = host.now();
    const r = host.current();
    if (r && r.id === outcome.reaction && r.until > now) return;
    const left = outcome.at + OUTCOME_MS - now;
    // Без задачи запаса итог не остался бы навсегда (§ 4.5): планировщик отказал — подсказка сразу (сбой отмечает сессия).
    if (left > 0 && host.later('play-outcome', left, settle)) return;
    outcome = null;
    host.cancel('play-outcome');
  }

  function clearOutcome() {
    outcome = null;
    host.cancel('play-outcome');
  }

  // ---------- поглаживание и лапа ----------

  // Отклик лимита: настроение по прошлым откликам минуты, тихий вариант после «пока хватит». explicit — прямое действие в
  // «Поиграть» (в тишине страницы — отклик в сцене; не менее важная реакция — пропадает и в лимит не идёт); вне «Поиграть»
  // (кнопки уголка) — обычный запрос, он и в лимит идёт всегда.
  function stroked(type, explicit) {
    const now = host.now();
    const mood = petMood(petTimes, now);
    host.activity();
    const result = host.manual(mood === 'quiet' ? (type === 'paw' ? 'calmPaw' : 'calmPet') : type, { explicit, extra: mood === 'enough' ? { phrases: 'petEnough' } : {} });
    if (!explicit || result.played) petTimes = recent(petTimes, now);
    const key = result.played ? (mood === 'enough' ? 'enough' : type === 'paw' ? 'paw' : mood === 'quiet' ? 'quiet' : 'pet') : null;
    return { key, played: result.played };
  }

  // Одиночное действие (кнопка, клавиатура, касание лапы): в «Поиграть» каждый сыгранный отклик — итог и объявление.
  function touch(type, explicit) {
    const { key } = stroked(type, explicit);
    if (key && explicit) show(key);
    return key;
  }

  // ---------- жест поглаживания (§ 6.4, § 6.8) ----------

  // Начало: прежний жест завершается как отмена; удержания и отклика нет. Начало жеста — ручное действие (сценка отменена).
  function strokeStart() {
    if (stroke) strokeStop(stroke.id);
    host.cancelScene();
    stroke = { id: ++strokes, held: false, told: '' };
    return stroke.id;
  }

  // Пройденный порог: то же правило, что одиночное поглаживание; первый сыгранный отклик включает удержание позы до
  // конца жеста; объявление — только при новом итоге в этом жесте.
  function strokeStep(id) {
    if (!stroke || stroke.id !== id) return null;
    const { key } = stroked('pet', true);
    if (!key) return { outcome: null, announced: false };
    stroke.held = true;
    const announced = key !== stroke.told;
    stroke.told = key;
    show(key, '', { tell: announced });
    return { outcome: key, announced };
  }

  // Конец или отмена: удержание снято, новых откликов и объявлений нет; итог гаснет, когда доиграет реакция (или сразу).
  function strokeStop(id) {
    if (!stroke || stroke.id !== id) return false;
    stroke = null;
    settle();
    return true;
  }

  // ---------- миска и мячик ----------

  // Предмет сдвинулся: отклик питомца (если не занят не менее важным), лимит — свой счёт; иначе итог про предмет.
  function moved(toy, near, toward) {
    const now = host.now();
    const full = petMood(toyTimes, now) === 'pet';
    host.activity();
    const type = full && toy === 'ball' ? 'ball' : full && near ? 'sniff' : 'watch';
    const result = host.manual(type, { explicit: true, extra: { toward } });
    if (result.played) toyTimes = recent(toyTimes, now);
    const key = !result.played ? 'moved' : toy === 'ball' ? 'ball' : type === 'sniff' ? 'sniff' : 'look';
    show(key, toy);
    return key;
  }

  // Миска: to — 'near' (к питомцу), 'home' (на исходное место) или [u, v]. Идёт перенос предмета или место то же — ничего
  // ('dropped').
  function bowl(to) {
    const z = zone();
    if (drag) return 'dropped';
    const from = at(z, 'bowl');
    const goal = place(z, 'bowl', to === 'near' ? NEAR.bowl : to === 'home' ? HOME.bowl : to);
    if (near(goal, from, 0.01)) return 'dropped';
    pos = { ...pos, bowl: to === 'home' ? null : goal };
    return moved('bowl', closer(from, goal), sideOf(goal[0]));
  }

  // Мячик: to — 'roll' (туда, где свободнее) или бросок на число единиц (знак — направление). Некуда — ничего ('dropped').
  function ball(to) {
    const z = zone();
    if (drag) return 'dropped';
    const from = at(z, 'ball');
    const way = to === 'roll' ? rollWay(z, SIZE.ball, from) : { dir: Math.sign(to), to: rollEnd(z, SIZE.ball, from, Math.sign(to), rollDist(to)) };
    if (Math.abs(way.to - from[0]) < TOY_STEP) return 'dropped';
    pos = { ...pos, ball: [way.to, from[1]] };
    return moved('ball', false, way.dir < 0 ? 'left' : 'right');
  }

  // Перенос предмета указателем: point — где предмет был бы под указателем (единицы рисунка). Первый вызов начинает перенос
  // (ручное действие: сценка отменена) с места, где предмет сейчас нарисован: катившийся мячик останавливается там, где его
  // взяли. Следующие — ближайшее допустимое место под указателем. Другой предмет сначала отменяет прежний перенос.
  function dragTo(toy, point) {
    const z = zone();
    if (drag && drag.toy !== toy) drag = null;
    const p = place(z, toy, point);
    if (!drag) {
      host.cancelScene();
      const now = at(z, toy);
      const from = near(p, now, 0.01) ? now : p;
      if (from !== now) pos = { ...pos, [toy]: from };
      drag = { toy, at: from, from };
      return;
    }
    drag = { ...drag, at: p };
  }

  // Отпустили (отображение распознало заметный сдвиг): миска — на новом месте; мячик — бросок roll (единицы, знак —
  // направление) докатывается от места под указателем (без анимации — остаётся там), упёрся — не катание. Без сдвига —
  // на месте до жеста ('dropped').
  function drop({ roll } = {}) {
    if (!drag) return null;
    const z = zone();
    const { toy, at: end, from } = drag;
    drag = null;
    if (toy === 'bowl') {
      if (near(end, from, 0.01)) return 'dropped';
      pos = { ...pos, bowl: end };
      return moved('bowl', closer(from, end), sideOf(end[0]));
    }
    if (roll === undefined || roll === 0) return 'dropped';
    const dir = Math.sign(roll);
    const to = host.sense().motion === 'none' ? end[0] : rollEnd(z, SIZE.ball, end, dir, rollDist(roll));
    if (Math.abs(to - from[0]) < TOY_STEP) return 'dropped';
    pos = { ...pos, ball: [to, end[1]] };
    return moved('ball', false, dir < 0 ? 'left' : 'right');
  }

  function dragCancel() {
    if (!drag) return false;
    drag = null;
    return true;
  }

  // Новый пол (объявление отображения): заданные места — на ближайшее допустимое; идущий перенос — тоже.
  function refloor() {
    const z = zone();
    if (!z) return;
    for (const toy of TOYS) if (pos[toy]) pos = { ...pos, [toy]: place(z, toy, pos[toy]) };
    if (drag) drag = { ...drag, at: place(z, drag.toy, drag.at), from: place(z, drag.toy, drag.from) };
  }

  // ---------- вид и снятие ядром ----------

  // Открыта «Поиграть»: предметы на исходных местах, итога, жеста и переноса нет (лимиты — сессии).
  function enter() {
    pos = { bowl: null, ball: null };
    stroke = null;
    drag = null;
    clearOutcome();
  }

  // Жест и перенос сняты ядром (вид закрыт или сменён, другой питомец или облик, «Скрыть», фон); clear — и итог.
  function interrupt({ clear = false } = {}) {
    stroke = null;
    drag = null;
    if (clear) clearOutcome();
    else settle();
  }

  function state(s) {
    const z = zone();
    const toys = Object.fromEntries(
      TOYS.map((toy) => {
        const now = at(z, toy);
        const home = !pos[toy] || (z && near(now, place(z, toy, HOME[toy]), TOY_STEP / 2));
        return [toy, { at: now, home: Boolean(home) }];
      }),
    );
    return {
      toys,
      outcome: outcome?.key ?? '',
      text: outcome ? playText(outcome.key, outcome.toy, s.kind, s.name) : '',
      stroke: stroke ? { ...stroke } : null,
      drag: drag ? { toy: drag.toy, at: [...drag.at], from: [...drag.from] } : null,
    };
  }

  return {
    touch,
    strokeStart,
    strokeStep,
    strokeStop,
    bowl,
    ball,
    dragTo,
    drop,
    dragCancel,
    refloor,
    enter,
    interrupt,
    settle,
    clearOutcome,
    state,
    held: () => Boolean(stroke?.held),
    gesturing: () => Boolean(stroke || drag),
    stroking: (id) => Boolean(stroke && stroke.id === id),
    dragging: () => drag?.toy ?? '',
    floored: () => zone() !== null,
  };
}
