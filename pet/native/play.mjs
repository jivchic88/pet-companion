// Натив: PetPlay — «Поиграть» и вызов «по зову» (этап PL10.2.2; README, «Нативное отображение»; docs/ARCHITECTURE.md
// § 6.4, § 6.8, § 12.2) внутри PetProvider. Окно (Modal React Native) открыто ровно тогда, когда в снимке view.open ===
// 'play' (кнопка «Поиграть» уголка, вызов, прямая команда ядра — одним путём; своего флага нет), и по очереди с окном
// уголка (useWindow координатора). Вход «Позвать …» — когда presence.surface === 'call' («Приходит по зову», не вызван):
// core.open('play', { source: 'call' }). Назад («Закрыть», Android «Назад», жест VoiceOver «назад»): открыта из уголка
// (source 'pet') и уголок объявлен — core.open('corner'), иначе (вызов, уголка нет) — core.close(), окно закрыто целиком;
// у вызванной ещё «Уголок» — core.open('corner'). Фокус: при показе — «Закрыть»; после закрытия целиком — вход вызова,
// вход уголка (координатор) или returnFocus хоста.
//
// Сцена — только снимок ядра: питомец по size определения (поза pose.shown.play, удержание и реакции решает ядро), миска и
// мячик — play.drag.at при переносе, иначе play.toys.*.at (единицы рисунка), итог под сценой — play.outcome / play.text,
// реплика — scenePhrase. Подсказка и итог — в строке постоянной высоты (самый длинный из текстов ядра), реплика — в своей
// строке: смена текста не сдвигает питомца под пальцем. Пол игры — замер сцены (gesture.mjs, playLayout) координатору;
// ввод — только когда в снимке именно этот пол.
//
// Касания — распознавание отображения (gesture.mjs): одна сцена — один ответчик (responder RN) и один жест на ядро (свой
// палец по identifier; второй палец ничего не меняет). Голова и тело — stroke.start → stroke.step на каждые STROKE_PT →
// stroke.end / stroke.cancel; лапа — короткое касание → interact({ type: 'paw' }) на отпускание; миска и мячик — toy.drag с
// места, где предмет нарисован, → toy.drop({ roll? }) / toy.cancel(). Отмены: система забрала касание (onResponderTerminate),
// приложение неактивно или в фоне, Android blur (AppState — если доходит), смена ядра, питомца, модели, облика, вида,
// присутствия, видимости, раскладки сцены, кнопка во время жеста, закрытие окна и размонтирование — локально и ядру (ядро
// снимает свой жест и само: тогда только локально). Снятый жест «мёртв» до отпускания пальца: позднее отпускание ничего не
// вызывает. Кнопки «Погладить», лапа, «Подвинуть / Вернуть миску», «Катнуть мячик» — interact(), те же правила ядра.

import { createElement as h, Fragment, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg from 'react-native-svg';
import { playTexts } from '../core/play.mjs';
import { systemLog } from '../core/ports.mjs';
import { TOYS } from '../core/toys.mjs';
import { usePetState } from '../hooks/state.mjs';
import { PetFigure } from './figure.mjs';
import { createGesture, MOVE_PT, PAW_MIN_PT, partAt, playLayout, targetAt, toUnits, toyBox } from './gesture.mjs';
import { drawnPose, kitFor, playProblem } from './kits.mjs';
import { usePetContext, useWindow } from './provider.mjs';
import { ballShape, bowlShape, TOY_VIEW } from './svg.mjs';

export const PLAY_HINT = 'Проведи по питомцу, чтобы погладить';
const ORIENTATIONS = ['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right'];
const NUDGE_MS = 900;
// Один жест на ядро для всех поверхностей игры: ядро → поверхность, чей палец сейчас на сцене.
const locks = new WeakMap();

const number = (value) => (Number.isFinite(value) && value > 0 ? value : 0);
const insetsOf = (value) => ({ top: number(value?.top), right: number(value?.right), bottom: number(value?.bottom), left: number(value?.left) });
const quiet = (what, fn) => {
  try {
    return fn();
  } catch (error) {
    systemLog.warn(`PetPlay: ${what}`, error);
    return null;
  }
};
const focusOn = (node) => {
  if (!node) return;
  quiet('фокус не перенесён', () => AccessibilityInfo.sendAccessibilityEvent?.(node, 'focus'));
};
const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
const near = (a, b) => Boolean(a && b) && Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
// Точка касания id в координатах сцены (её дети — pointerEvents 'none', поэтому цель касания — сама сцена).
function touchPoint(ne, id) {
  if (!ne) return null;
  if (id === undefined || id === null) return [ne.locationX, ne.locationY];
  for (const list of [ne.changedTouches, ne.touches]) {
    const found = Array.isArray(list) ? list.find((item) => item?.identifier === id) : null;
    if (found) return [found.locationX, found.locationY];
  }
  return ne.identifier === id ? [ne.locationX, ne.locationY] : null;
}
const ended = (ne, id) => (Array.isArray(ne?.changedTouches) ? ne.changedTouches.some((item) => item?.identifier === id) : ne?.identifier === id);

// Нарисованное место предмета t (единицы рисунка) в момент at: идёт движение — по той же кривой, что Animated (выход
// кубический), иначе — где поставлен.
function drawnAt(t, at = now()) {
  if (!t.model) return t.shown;
  const k = Math.min(1, Math.max(0, (at - t.model.start) / t.model.ms));
  const e = 1 - (1 - k) ** 3;
  return [t.model.from[0] + (t.model.to[0] - t.model.from[0]) * e, t.model.from[1] + (t.model.to[1] - t.model.from[1]) * e];
}

// Признак, сменив который ядро снимает жест (питомец, модель, облик, вид, присутствие, видимость, отключение): тогда и
// локальный жест снят — без команд из подписки.
const gestureKey = (s) => [s.status, s.pet.shown, s.behavior.shown, s.look.coat, s.look.worn, s.view.open, s.presence.hidden, s.presence.around, s.visible].join('|');

export function PetPlay({ insets, entry = true, label, hint = 'Открыть игру', returnFocus = null, testID = 'play', style } = {}) {
  const shared = usePetContext();
  const catalog = shared?.catalog ?? null;
  const problem = useMemo(() => (!shared ? 'PetPlay — только внутри PetProvider (координатор объявляет виды и пол игры ядру)' : playProblem(catalog, isValidElement)), [shared, catalog]);
  const core = problem ? null : (shared?.usable ?? null);
  const register = shared?.register ?? null;
  const place = shared?.place ?? null;
  const snapshot = usePetState(core);
  const prefix = useId().replace(/[^a-z0-9]/gi, '');
  const open = Boolean(snapshot && snapshot.status !== 'destroyed' && snapshot.view.open === 'play');
  const slot = useWindow(core, open);
  const token = useRef(null);
  if (!token.current) token.current = {};

  const [frame, setFrame] = useState(null);
  const [box, setBox] = useState(null);
  const [headHeight, setHeadHeight] = useState(0);
  const [line, setLine] = useState(0);
  const [fit, setFit] = useState({});
  const [note, setNote] = useState(null);
  const [nudge, setNudge] = useState(false);
  const callRef = useRef(null);
  const closeRef = useRef(null);
  const wasOpen = useRef(false);
  const source = useRef('');
  const nudgeTimer = useRef(null);
  const rolling = useRef('');
  // Ядро последней фиксации и всё, что нужно обработчикам касаний между отрисовками (раскладка, рисунок, нарисованная поза,
  // готовность ввода): обработчик читает текущее, а не замыкание прежней отрисовки.
  const bound = useRef(null);
  const live = useRef({ core: null, L: null, def: null, pose: '', ready: false, toys: false });
  const gcore = useRef(null);
  const toyState = useRef(null);
  if (!toyState.current) toyState.current = Object.fromEntries(TOYS.map((toy) => [toy, { x: new Animated.Value(0), y: new Animated.Value(0), model: null, shown: null, key: '', dragged: false, run: [] }]));

  useEffect(() => {
    if (problem && shared?.core) systemLog.warn(`PetPlay: ${problem}`);
  }, [problem, shared?.core]);

  // Поверхность игры — у координатора, пока она годна: вид 'play' объявлен ядру ровно на это время.
  useEffect(() => (register && !problem ? register('play') : undefined), [register, problem]);

  useLayoutEffect(() => {
    bound.current = core;
    return () => {
      bound.current = null;
    };
  }, [core]);

  // ---------- жест ----------
  const unlock = useCallback(() => {
    const c = gcore.current;
    if (c && locks.get(c) === token.current) locks.delete(c);
  }, []);
  const gesture = useRef(null);
  if (!gesture.current) {
    const on = () => {
      const c = gcore.current;
      return c && c.status !== 'destroyed' ? c : null;
    };
    const run = (what, fn) => {
      const c = on();
      return c ? quiet(what, () => fn(c)) : null;
    };
    gesture.current = createGesture({
      start: () => {
        const result = run('stroke.start', (c) => c.stroke.start());
        return result?.ok ? result.id : null;
      },
      step: (id) => run('stroke.step', (c) => c.stroke.step(id)),
      end: (id) => run('stroke.end', (c) => c.stroke.end(id)),
      cancel: (id) => run('stroke.cancel', (c) => c.stroke.cancel(id)),
      paw: () => {
        const result = run('лапа', (c) => c.interact({ type: 'paw' }));
        if (result && !result.ok) setNote({ core: gcore.current, text: `Лапа: ${result.error.message}` });
      },
      drag: (toy, at) => run('toy.drag', (c) => c.toy.drag(toy, at))?.ok === true,
      // Брошенный мячик докатывается плавно (отметка — до отрисовки нового места, её снимает эффект предметов).
      drop: (roll) => {
        const c = on();
        if (roll !== undefined) rolling.current = c?.getState().play?.drag?.toy ?? '';
        run('toy.drop', (core) => core.toy.drop(roll === undefined ? undefined : { roll }));
      },
      toyCancel: () => run('toy.cancel', (c) => c.toy.cancel()),
      moved: () => {
        const drag = on()?.getState().play?.drag;
        const L = live.current.L;
        return Boolean(drag && L) && Math.hypot(drag.at[0] - drag.from[0], drag.at[1] - drag.from[1]) * L.s >= MOVE_PT;
      },
      nudge: () => {
        clearTimeout(nudgeTimer.current);
        setNudge(true);
        nudgeTimer.current = setTimeout(() => setNudge(false), NUDGE_MS);
      },
    });
  }
  const g = gesture.current;
  // Снять жест отображением: ядру — отмена своего жеста, локально — «мёртв» до отпускания; gone — палец уже не наш
  // (система забрала касание, окно снято): забыть сразу.
  const stop = useCallback(
    (reason, gone = false) => {
      if (!g.active()) return;
      g.cancel(reason);
      if (gone) {
        g.forget();
        unlock();
      }
    },
    [g, unlock],
  );

  // Подписка: ядро сняло жест само (нет своего stroke или drag) или сменилось то, при чём ядро жест снимает, — локально,
  // без команд из подписки.
  useEffect(() => {
    if (!core) return undefined;
    let key = quiet('снимок не прочитан', () => gestureKey(core.getState()));
    return core.subscribe(
      ({ snapshot: s }) => {
        const next = gestureKey(s);
        if (gcore.current !== core || !g.live()) {
          key = next;
          return;
        }
        if (next !== key) g.abort();
        else g.sync(s.play);
        key = next;
      },
      { initial: false },
    );
  }, [core, g]);

  // Смена ядра и размонтирование: жест прежнего ядра снят (ядру — отмена, если оно живо), замок отпущен.
  useEffect(
    () => () => {
      if (gcore.current === core) stop('core', true);
    },
    [core, stop],
  );
  useEffect(
    () => () => {
      clearTimeout(nudgeTimer.current);
      for (const t of Object.values(toyState.current)) for (const anim of t.run.splice(0)) anim.stop();
    },
    [],
  );

  // Система: неактивно (iOS — центр уведомлений, звонок, переключатель приложений), фон, Android blur — локальная отмена
  // (видимость ядра меняет useNativeLifecycle хоста; здесь — только свой жест).
  useEffect(() => {
    if (!slot.visible) return undefined;
    const subs = [];
    const add = (event, handler) => {
      const sub = quiet(`нет подписки AppState ${event}`, () => AppState.addEventListener(event, handler));
      if (sub) subs.push(sub);
    };
    add('change', (state) => (state === 'inactive' || state === 'background') && stop('system'));
    add('blur', () => stop('blur'));
    return () => {
      for (const sub of subs) quiet('подписка не снята', () => sub.remove());
    };
  }, [slot.visible, stop]);

  // Окно ушло (вид сменён или закрыт, очередь окна, отключение): жест снят, замер забыт — новый показ меряет заново.
  useEffect(() => {
    if (slot.visible) return;
    stop('closed', true);
    setBox(null);
    setFrame(null);
    setNudge(false);
  }, [slot.visible, stop]);

  // ---------- раскладка и пол ----------
  const kit = snapshot && core ? kitFor(catalog, snapshot.pet.shown) : null;
  const def = kit ? catalog.defs.get(kit.pet) : null;
  const L = slot.visible && def ? playLayout(box, def, line) : null;
  const floorKey = L ? `${L.playFloor.join(',')}/${L.playTouch}` : '';
  useEffect(() => {
    if (!place || !core) return undefined;
    const me = token.current;
    if (!L) {
      place(me, null);
      return undefined;
    }
    place(me, { playFloor: L.playFloor, playTouch: L.playTouch });
    return () => place(me, null);
    // floorKey задаёт пол однозначно.
  }, [place, core, floorKey]);
  // Раскладка сцены сменилась во время жеста (поворот, размер окна, крупный текст) — жест снят, а не пересчитан молча.
  const layoutKey = L?.key ?? '';
  const lastLayout = useRef('');
  useEffect(() => {
    if (lastLayout.current && layoutKey !== lastLayout.current) stop('layout');
    lastLayout.current = layoutKey;
  }, [layoutKey, stop]);

  const display = snapshot?.display ?? null;
  const floored = Boolean(L && display?.playFloor && display.playFloor.join(',') === L.playFloor.join(',') && display.playTouch === L.playTouch);
  const running = Boolean(snapshot && snapshot.status === 'running');
  const ready = Boolean(open && slot.visible && L && running && snapshot.presence.around && !snapshot.presence.hidden && snapshot.visible);
  const pose = snapshot && kit ? drawnPose(kit, def, snapshot.pose.shown.play, snapshot.pose.base) : '';
  useLayoutEffect(() => {
    live.current = { core, L, def, pose, ready, toys: ready && floored };
  });

  // ---------- предметы ----------
  const play = open ? (snapshot?.play ?? null) : null;
  const motion = snapshot?.prefs.effectiveMotion ?? 'none';
  const drawnKey = play ? JSON.stringify([play.toys.bowl.at, play.toys.ball.at, play.drag]) : '';
  // Раскладка предметов: сцена и пол в снимке. Новый пол переставляет предметы (ядро, refloor) — это смена раскладки, а не
  // действие: место — сразу, как у веба.
  const placeKey = L ? `${L.key}|${display?.playFloor?.join(',') ?? ''}/${display?.playTouch ?? ''}` : '';
  useLayoutEffect(() => {
    for (const toy of TOYS) {
      const t = toyState.current[toy];
      const dragged = play?.drag?.toy === toy;
      const at = dragged ? play.drag.at : play?.toys[toy]?.at;
      if (!at || !L) {
        t.shown = null;
        t.model = null;
        t.dragged = false;
        continue;
      }
      const endedDrag = t.dragged && !dragged;
      t.dragged = dragged;
      const rolled = endedDrag && rolling.current === toy;
      if (endedDrag) rolling.current = '';
      const relayout = t.key !== placeKey;
      t.key = placeKey;
      if (near(t.shown, at) && !relayout) continue;
      const from = drawnAt(t) ?? at;
      for (const anim of t.run.splice(0)) anim.stop();
      const goal = toyBox(L, toy, at);
      const [x, y] = [goal.left, goal.top];
      if (relayout || dragged || !t.shown || (endedDrag && !rolled) || motion === 'none') {
        t.model = null;
        t.x.setValue(x);
        t.y.setValue(y);
        t.shown = [...at];
        continue;
      }
      const ms = toy === 'ball' ? Math.min(900, 300 + Math.abs(at[0] - from[0]) * L.s * 3) : 300;
      const model = { from, to: [...at], start: now(), ms };
      t.model = model;
      t.shown = [...at];
      const start = toyBox(L, toy, from);
      t.x.setValue(start.left);
      t.y.setValue(start.top);
      const easing = Easing.out(Easing.cubic);
      t.run = [Animated.timing(t.x, { toValue: x, duration: ms, easing, useNativeDriver: true }), Animated.timing(t.y, { toValue: y, duration: ms, easing, useNativeDriver: true })];
      for (const anim of t.run)
        anim.start(({ finished } = {}) => {
          if (finished && t.model === model) t.model = null;
        });
    }
    // drawnKey и ключ раскладки задают места; motion — плавность.
  }, [drawnKey, placeKey, motion]);
  // Где предметы нарисованы сейчас (единицы рисунка): только при объявленном поле этой сцены. Отсюда начинается перенос:
  // ядро останавливает катящийся мячик там, где его взяли (play.drag), и отрисовка ставит его туда же — без скачка; отказ
  // ядра в переносе движения не трогает.
  const drawnNow = () => (live.current.toys ? Object.fromEntries(TOYS.map((toy) => [toy, drawnAt(toyState.current[toy])])) : null);

  // ---------- ответчик касаний сцены ----------
  const hitOf = (point) => {
    const { L: L0, def: d, pose: p } = live.current;
    return L0 && d ? partAt(d, toUnits(L0, point), p, PAW_MIN_PT / L0.s) : '';
  };
  const targetOf = (point) => {
    const { L: L0, def: d, pose: p } = live.current;
    return L0 && d ? targetAt(L0, d, p, point, drawnNow()) : null;
  };
  const free = () => {
    const c = live.current.core;
    const owner = c ? locks.get(c) : null;
    return !owner || owner === token.current;
  };
  const responder = {
    onStartShouldSetResponder: (event) => Boolean(live.current.ready && free() && !g.active() && targetOf(touchPoint(event?.nativeEvent))),
    onMoveShouldSetResponder: () => false,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (event) => {
      const ne = event?.nativeEvent;
      const point = touchPoint(ne);
      const { core: c, L: L0, ready: ok } = live.current;
      const target = ok && free() && !g.active() ? targetOf(point) : null;
      if (!target || !c) return;
      gcore.current = c;
      locks.set(c, token.current);
      g.begin({ touch: ne?.identifier ?? 0, point, time: ne?.timestamp ?? now(), target, scale: L0.s });
    },
    onResponderMove: (event) => {
      if (!g.active()) return;
      const point = touchPoint(event?.nativeEvent, g.touch());
      if (point) g.move({ touch: g.touch(), point, hit: hitOf, scale: live.current.L?.s });
    },
    onResponderEnd: (event) => finish(event),
    onResponderRelease: (event) => finish(event),
    onResponderTerminate: () => stop('terminate', true),
  };
  function finish(event) {
    if (!g.active()) return;
    const ne = event?.nativeEvent;
    const id = g.touch();
    if (!ended(ne, id)) return;
    const point = touchPoint(ne, id) ?? [ne?.locationX, ne?.locationY];
    g.end({ touch: id, point, time: ne?.timestamp ?? now(), hit: hitOf });
    unlock();
  }

  // ---------- закрытие и фокус ----------
  if (open && snapshot?.view.source) source.current = snapshot.view.source;
  const focusBack = useCallback(() => {
    const c = bound.current;
    const view = c && c.status !== 'destroyed' ? quiet('снимок не прочитан', () => c.getState().view.open) : null;
    if (view !== null) return;
    if (returnFocus?.current) return focusOn(returnFocus.current);
    if (source.current === 'call' && callRef.current) return focusOn(callRef.current);
    if (!shared?.focusEntry?.('corner')) focusOn(callRef.current);
  }, [returnFocus, shared]);
  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (open) return undefined;
    setNote(null);
    if (!closed || Platform.OS === 'ios') return undefined;
    const id = setTimeout(focusBack, 0);
    return () => clearTimeout(id);
  }, [open, focusBack]);
  // Вход вызова — координатору: «Показать» уголка возвращает фокус сюда.
  const entryOf = shared?.entry ?? null;
  useEffect(() => (entryOf && !problem ? entryOf('call', () => focusOn(callRef.current)) : undefined), [entryOf, problem]);

  if (!shared || problem) {
    if (!shared?.core && shared) return null;
    return h(View, { testID, style, accessible: true, accessibilityRole: 'alert' }, h(Text, { testID: `${testID}-problem`, style: styles.problem }, `Игра не показана: ${problem}`));
  }
  if (!core || !snapshot || !kit) return null;

  const who = catalog.defs.get(snapshot.pet.shown) ?? def;
  const name = snapshot.name.display;
  const views = snapshot.display.views;
  const ours = () => bound.current === core && core.status !== 'destroyed';
  const say = (text) => setNote({ core, text });
  // Кнопка во время жеста: жест снят (ядру — отмена), затем команда — те же правила ядра, что у касания.
  const act = (title, action) => () => {
    if (!ours()) return;
    if (g.active()) stop('button');
    setNote(null);
    const result = core.interact(action);
    if (!result.ok) say(`${title}: ${result.error.message}`);
  };
  const back = () => {
    if (!ours()) return;
    stop('back');
    const s = core.getState();
    const result = s.view.source !== 'call' && s.display.views.includes('corner') ? core.open('corner') : core.close();
    if (!result.ok) say(result.error.message);
  };
  const toCorner = () => {
    if (!ours()) return;
    stop('back');
    const result = core.open('corner');
    if (!result.ok) say(result.error.message);
  };
  const call = () => {
    if (!ours()) return;
    setNote(null);
    core.activity();
    const result = core.open('play', { source: 'call' });
    if (!result.ok) say(result.error.message);
  };

  // ---------- вход «по зову» ----------
  const calling = entry && snapshot.presence.surface === 'call';
  const callNode = calling
    ? h(
        View,
        { style: [styles.entryBox, style] },
        h(
          Pressable,
          {
            ref: callRef,
            testID: `${testID}-call`,
            onPress: call,
            disabled: !running,
            accessibilityRole: 'button',
            accessibilityLabel: label ?? `Позвать питомца: ${name}`,
            accessibilityHint: hint,
            accessibilityState: { disabled: !running, expanded: open },
            style: ({ pressed }) => [styles.entry, pressed && styles.pressed],
          },
          h(Text, { style: styles.entryText }, `Позвать ${who.forms.acc}`),
        ),
        note && note.core === core && !open ? h(Text, { testID: `${testID}-note`, style: styles.refused, accessibilityRole: 'alert' }, note.text) : null,
      )
    : null;

  // ---------- окно ----------
  const pad = insetsOf(insets);
  const edge = Boolean(insets);
  const width = frame?.width ?? 0;
  const height = frame?.height ?? 0;
  const wide = width >= 520 && width > height * 1.2;
  const texts = [PLAY_HINT, ...Object.values(playTexts(who, name))];
  const noteHeight = Math.max(0, ...texts.map((_, i) => fit[`${i}:${texts[i]}`] ?? 0));
  const result = Boolean(play?.outcome);
  const noteText = result ? play.text : PLAY_HINT;
  const toys = ready && floored;
  const home = play?.toys.bowl.home ?? true;
  const paw = who.actions.paw;
  const phrase = snapshot.prefs.phrases ? snapshot.scenePhrase : '';

  const noteNode = h(
    View,
    { key: 'note', testID: `${testID}-hint-box`, style: [styles.note, { minHeight: noteHeight }] },
    h(Text, { testID: `${testID}-hint`, style: [styles.noteText, (result || nudge) && styles.noteStrong, nudge && !result && styles.noteNudge] }, noteText),
    // Невидимые образцы подсказки и всех итогов с этим именем — высота строки по самому длинному.
    h(
      View,
      { style: styles.measure, pointerEvents: 'none', accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' },
      ...texts.map((text, i) =>
        h(
          Text,
          {
            key: `${i}:${text}`,
            testID: `${testID}-fit-${i}`,
            style: [styles.noteText, styles.noteStrong],
            onLayout: (event) => {
              const value = event?.nativeEvent?.layout?.height ?? 0;
              setFit((was) => (was[`${i}:${text}`] === value ? was : { ...was, [`${i}:${text}`]: value }));
            },
          },
          text,
        ),
      ),
    ),
  );
  const titleNode = h(Text, { key: 'title', testID: `${testID}-title`, style: styles.title, accessibilityRole: 'header' }, name);
  const barNode = h(
    View,
    { key: 'bar', style: styles.bar },
    snapshot.view.source === 'call' && views.includes('corner')
      ? h(Button, { testID: `${testID}-corner`, title: 'Уголок', label: `Уголок ${who.forms.gen}`, onPress: toCorner })
      : null,
    h(Button, { ref: closeRef, testID: `${testID}-close`, title: 'Закрыть', label: 'Закрыть игру', onPress: back }),
  );
  const actionNodes = [
    h(Button, { key: 'stroke', testID: `${testID}-stroke`, title: 'Погладить', disabled: !ready, wide: true, onPress: act('Погладить', { type: 'pet' }) }),
    paw ? h(Button, { key: 'paw', testID: `${testID}-paw`, title: paw.ask ? 'Дай лапу' : 'Коснуться лапы', disabled: !ready, wide: true, onPress: act(paw.ask ? 'Дай лапу' : 'Коснуться лапы', { type: 'paw' }) }) : null,
    h(Button, { key: 'bowl', testID: `${testID}-bowl`, title: home ? 'Подвинуть миску' : 'Вернуть миску', disabled: !toys, wide: true, onPress: act('Миска', { type: 'bowl', to: home ? 'near' : 'home' }) }),
    h(Button, { key: 'ball', testID: `${testID}-ball`, title: 'Катнуть мячик', disabled: !toys, wide: true, onPress: act('Мячик', { type: 'ball', to: 'roll' }) }),
  ];
  const refusedNode = note && note.core === core && open ? h(Text, { key: 'refused', testID: `${testID}-note`, style: styles.refused, accessibilityRole: 'alert' }, note.text) : null;
  const actionsNode = h(View, { key: 'actions', style: styles.actions }, ...actionNodes);

  // Сцена: размер — по месту, рисунок и предметы — по снимку; ответчик — сама сцена (дети касаний не берут).
  const stageNode = h(
    View,
    {
      key: 'stage',
      testID: `${testID}-box`,
      style: [styles.box, wide && { marginBottom: pad.bottom, marginLeft: 8 }],
      onLayout: (event) => {
        const layout = event?.nativeEvent?.layout;
        const next = layout ? { width: layout.width, height: layout.height } : null;
        setBox((was) => (was && next && was.width === next.width && was.height === next.height ? was : next));
      },
    },
    L
      ? h(
          View,
          {
            testID: `${testID}-stage`,
            style: { width: L.width, height: L.height },
            accessible: true,
            accessibilityRole: 'image',
            accessibilityLabel: `${name}, ${who.title.toLowerCase()}: миска и мячик на полу`,
            accessibilityHint: 'Проведи пальцем по питомцу, чтобы погладить. Те же действия — кнопками.',
            ...responder,
          },
          h(View, { key: 'floor', pointerEvents: 'none', style: [styles.floor, { top: L.floor.top - 6, height: L.floor.height + 6 }] }),
          h(
            View,
            { key: 'pet', pointerEvents: 'none', style: { position: 'absolute', left: L.pet.left, top: L.pet.top }, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' },
            h(PetFigure, { core, snapshot, kit, def, width: L.pet.width, pose: snapshot.pose.shown.play, prefix: `${prefix}-pet`, testID: `${testID}-figure` }),
          ),
          ...TOYS.map((toy) => (play?.toys[toy]?.at ? h(Toy, { key: toy, toy, L, t: toyState.current[toy], testID: `${testID}-toy-${toy}`, dragging: play.drag?.toy === toy, motion }) : null)),
          h(
            View,
            { key: 'say', pointerEvents: 'none', style: [styles.say, { top: L.phrase.top, height: L.phrase.height }] },
            phrase ? h(Text, { testID: `${testID}-phrase`, style: styles.sayText, numberOfLines: 2 }, phrase) : null,
          ),
        )
      : null,
    // Высота строки реплики — две строки текущего размера шрифта.
    h(
      View,
      { key: 'line', style: styles.measure, pointerEvents: 'none', accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' },
      h(Text, { testID: `${testID}-line`, style: styles.sayText, onLayout: (event) => setLine(Math.ceil(event?.nativeEvent?.layout?.height ?? 0)) }, 'Ш\nШ'),
    ),
  );

  // Имя и строка итога: над сценой, а когда они выше четверти окна (крупный системный текст, длинное имя) — под сценой, в
  // прокрутке вместе с кнопками: сцене остаётся место, и она сама вне прокрутки (жест не спорит с прокруткой). Найдено в
  // iOS Simulator (PL10.2.2): при самом крупном тексте шапка занимала весь экран — ни питомца, ни кнопок.
  const headNode = h(
    View,
    { key: 'head', testID: `${testID}-head`, style: styles.head, onLayout: (event) => setHeadHeight(Math.ceil(event?.nativeEvent?.layout?.height ?? 0)) },
    titleNode,
    noteNode,
  );
  const compact = !wide && height > 0 && headHeight > height * 0.25;
  const content = wide
    ? h(
        View,
        { style: styles.row },
        stageNode,
        h(
          View,
          { style: [styles.side, { paddingBottom: pad.bottom }] },
          barNode,
          h(ScrollView, { testID: `${testID}-scroll`, style: styles.scroll, contentContainerStyle: styles.sideContent }, titleNode, noteNode, actionsNode, refusedNode),
        ),
      )
    : h(
        Fragment,
        null,
        barNode,
        compact ? null : headNode,
        stageNode,
        h(
          ScrollView,
          { testID: `${testID}-scroll`, style: [styles.below, { maxHeight: Math.max(120, height * (compact ? 0.5 : 0.42)) }], contentContainerStyle: [styles.belowContent, { paddingBottom: pad.bottom + 12 }] },
          compact ? headNode : null,
          actionsNode,
          refusedNode,
        ),
      );

  return h(
    Fragment,
    null,
    callNode,
    h(
      Modal,
      {
        visible: slot.visible,
        animationType: motion === 'none' ? 'none' : motion === 'calm' ? 'fade' : 'slide',
        presentationStyle: 'overFullScreen',
        supportedOrientations: ORIENTATIONS,
        statusBarTranslucent: edge,
        navigationBarTranslucent: edge,
        onRequestClose: back,
        onShow: () => focusOn(closeRef.current),
        onDismiss: () => {
          slot.dismissed();
          focusBack();
        },
        testID: `${testID}-modal`,
      },
      h(
        View,
        {
          testID: `${testID}-sheet`,
          style: [styles.sheet, { paddingTop: pad.top, paddingLeft: pad.left, paddingRight: pad.right }],
          onLayout: (event) => setFrame(event?.nativeEvent?.layout ?? null),
          accessibilityViewIsModal: true,
          onAccessibilityEscape: back,
        },
        content,
      ),
    ),
  );
}

// Предмет на полу: рамка касания не меньше TOY_MIN_PT, рисунок по размеру ядра; место — Animated (нативный драйвер),
// мячик поворачивается на пройденный путь. Касаний не берёт: их распознаёт сцена.
function Toy({ toy, L, t, testID, dragging, motion }) {
  const b = toyBox(L, toy, t.shown ?? [0, 0]);
  const art = { position: 'absolute', left: (b.width - b.w) / 2, top: (b.height - b.h) / 2 };
  const lifted = dragging && motion !== 'none' ? [{ translateY: -2 }, { scale: 1.05 }] : [];
  const svg = (children, extra = {}) => h(Svg, { width: b.w, height: b.h, viewBox: TOY_VIEW[toy], accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', ...extra }, ...children);
  let inner;
  if (toy === 'ball') {
    const ball = ballShape();
    const r = Math.max(1, b.w * 0.45);
    const rotate = t.x.interpolate({ inputRange: [0, r], outputRange: ['0deg', '57.3deg'], extrapolate: 'extend' });
    inner = h(
      View,
      { style: [art, { width: b.w, height: b.h, transform: lifted }] },
      svg(ball.shadow, { testID: `${testID}-shadow`, style: { position: 'absolute', left: 0, top: 0 } }),
      h(Animated.View, { style: { position: 'absolute', left: 0, top: 0, width: b.w, height: b.h, transform: [{ rotate }] } }, svg(ball.body, { testID: `${testID}-art` })),
    );
  } else inner = h(View, { style: [art, { width: b.w, height: b.h, transform: lifted }] }, svg(bowlShape(false), { testID: `${testID}-art` }));
  return h(Animated.View, { testID, pointerEvents: 'none', style: { position: 'absolute', left: 0, top: 0, width: b.width, height: b.height, transform: [{ translateX: t.x }, { translateY: t.y }] } }, inner);
}

// Кнопка: роль, подпись, состояние, область ≥ 48 точек.
function Button({ ref, testID, title, label, onPress, disabled = false, wide = false }) {
  return h(
    Pressable,
    {
      ref,
      testID,
      onPress,
      disabled: Boolean(disabled),
      accessibilityRole: 'button',
      accessibilityLabel: label ?? title,
      accessibilityState: { disabled: Boolean(disabled) },
      style: ({ pressed }) => [styles.control, wide && styles.half, disabled && styles.disabled, pressed && styles.pressed],
    },
    h(Text, { style: styles.controlText }, title),
  );
}

const INK = '#1d2024';
const ACCENT = '#2f5249';
const styles = StyleSheet.create({
  entryBox: { alignItems: 'center', gap: 6 },
  entry: { minHeight: 48, minWidth: 48, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: ACCENT, backgroundColor: '#ffffff', justifyContent: 'center' },
  entryText: { fontSize: 16, color: ACCENT, fontWeight: '600', textAlign: 'center' },
  sheet: { flex: 1, backgroundColor: '#f1e9dc' },
  bar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  head: { paddingHorizontal: 16, gap: 4 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: INK, flexShrink: 1 },
  note: { justifyContent: 'center' },
  noteText: { fontSize: 16, lineHeight: 22, color: '#5b574f', textAlign: 'center' },
  noteStrong: { color: INK, fontWeight: '600' },
  noteNudge: { color: ACCENT },
  measure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  box: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  floor: { position: 'absolute', left: 0, right: 0, backgroundColor: '#e2d3bc', borderTopLeftRadius: 24, borderTopRightRadius: 24, opacity: 0.6 },
  say: { position: 'absolute', left: 16, right: 16, justifyContent: 'flex-start' },
  sayText: { fontSize: 15, lineHeight: 21, color: INK, textAlign: 'center', fontStyle: 'italic' },
  row: { flex: 1, flexDirection: 'row' },
  side: { width: '40%', minWidth: 260, maxWidth: 380 },
  scroll: { flex: 1 },
  sideContent: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  below: { flexGrow: 0 },
  belowContent: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  control: { minHeight: 48, minWidth: 48, maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: ACCENT, justifyContent: 'center', backgroundColor: '#ffffff' },
  half: { flexGrow: 1, flexBasis: '45%' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  controlText: { fontSize: 16, lineHeight: 22, color: ACCENT, textAlign: 'center' },
  refused: { fontSize: 15, lineHeight: 21, color: '#8a5a00' },
  problem: { fontSize: 16, lineHeight: 22, color: '#a1271b' },
});
