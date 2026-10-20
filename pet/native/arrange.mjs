// Натив: PetRoom — «Обустроить уголок» (этап PL10.2.3; README, «Нативное отображение»; docs/ARCHITECTURE.md § 6.4, § 6.8,
// § 12.2) внутри PetProvider. Окно (Modal React Native) открыто ровно тогда, когда в снимке view.open === 'room' и есть
// черновик (кнопка «Обустроить уголок» уголка или прямая команда core.open('room') — одним путём; своего флага нет), и по
// очереди с окнами уголка и игры (useWindow координатора).
//
// Черновик, выбор, перенос, шаги, обычная расстановка, «Сохранить», «Отмена», чужая запись и отказ записи — ядро (команды
// room.*, снимок room.draft); здесь — рисунок черновика (общий уголок PetCorner: места — draft.pos, идущий перенос —
// draft.drag.at), выбранный предмет — пунктирная рамка его области (hitBox ядра), кнопки предметов и направлений (доступные —
// draft.can), строки состояния (что не сохранено, «Сохраняется…», другая запись, отказ). Правил нет: предмет под пальцем —
// pickAt ядра (видимый — верхний, затем увеличенные до 44 точек области), места и упоры — ядро.
//
// Касание сцены — как указатель веба (pet-room.mjs): нажатие на предмете — room.drag(id, его место) (выбор, ручное
// действие); сдвиг больше MOVE_PT — room.drag с той же точкой захвата (единицы сцены по текущему масштабу); отпускание после
// сдвига — room.drop(); касание без сдвига, ответчик отнят системой, приложение неактивно или в фоне, смена ядра, питомца или
// вида, закрытие окна и размонтирование — room.dragCancel() (у ядра снятый перенос — без вреда). Один палец на сцену
// (identifier); кнопки во время переноса ничего не делают.
//
// Назад (Android «Назад», жест VoiceOver «назад», кнопка «Отмена»): идущий перенос — room.dragCancel, иначе room.cancel() —
// черновик отброшен, вид — уголок. Записывает только «Сохранить» (room.save; отказ — окно открыто, черновик цел, сообщение
// ядра). Фон, закрытие, поворот и смена размеров ничего не сохраняют; черновик живёт в ядре до его закрытия, после
// перезапуска приложения — сохранённая расстановка.

import { createElement as h, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ROOM_DIRS, ROOM_TEXT } from '../core/editor.mjs';
import { systemLog } from '../core/ports.mjs';
import { hitBox, itemTitle, pickAt, roomModel } from '../core/room.mjs';
import { usePetState } from '../hooks/state.mjs';
import { CornerScene } from './corner.mjs';
import { MOVE_PT } from './gesture.mjs';
import { cornerProblem, kitFor } from './kits.mjs';
import { usePetContext, useWindow } from './provider.mjs';
import { SCENE } from './room.mjs';

export const ROOM_HINT = 'Перетаскивай вещи или выбери предмет и передвинь кнопками';
const DIR_TEXT = { left: ['←', 'Влево'], right: ['→', 'Вправо'], up: ['↑', 'Выше'], down: ['↓', 'Ниже'] };
const ORIENTATIONS = ['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right'];
const HIT_PT = 44;
const MAX_SCENE = 560;
// Заголовок — не крупнее 1,6 системного размера: при самом крупном тексте «Обустроить» иначе рвётся посреди слова (iOS
// Simulator, accessibility-extra-extra-large).
const TITLE_SCALE = 1.6;

const quiet = (what, fn) => {
  try {
    return fn();
  } catch (error) {
    systemLog.warn(`PetRoom: ${what}`, error);
    return null;
  }
};
const focusOn = (node) => node && quiet('фокус не перенесён', () => AccessibilityInfo.sendAccessibilityEvent?.(node, 'focus'));
const number = (value) => (Number.isFinite(value) && value > 0 ? value : 0);
// Точка пальца id в событии (changedTouches, touches, само событие) — как в PetPlay.
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

export function PetRoom({ insets, testID = 'room' } = {}) {
  const shared = usePetContext();
  const catalog = shared?.catalog ?? null;
  const problem = useMemo(() => (!shared ? 'PetRoom — только внутри PetProvider (координатор объявляет виды ядру)' : cornerProblem(catalog, isValidElement)), [shared, catalog]);
  const core = problem ? null : (shared?.usable ?? null);
  const register = shared?.register ?? null;
  const snapshot = usePetState(core);
  const prefix = useId().replace(/[^a-z0-9]/gi, '');
  const draft = snapshot && snapshot.status !== 'destroyed' && snapshot.view.open === 'room' ? snapshot.room.draft : null;
  const open = Boolean(draft);
  const slot = useWindow(core, open);
  const [frame, setFrame] = useState(null);
  const [note, setNote] = useState(null);
  const grab = useRef(null);
  const serial = useRef(0);
  const firstRef = useRef(null);

  useEffect(() => {
    if (problem && shared?.core) systemLog.warn(`PetRoom: ${problem}`);
  }, [problem, shared?.core]);
  // Поверхность редактора — у координатора, пока она годна: вид 'room' объявлен ядру ровно на это время.
  useEffect(() => (register && !problem ? register('room') : undefined), [register, problem]);

  // Ядро последней фиксации: обработчики прежней отрисовки (другое ядро) ничего не командуют.
  const bound = useRef(null);
  useLayoutEffect(() => {
    bound.current = core;
    return () => {
      bound.current = null;
    };
  }, [core]);
  const ours = useCallback(() => Boolean(core && bound.current === core && quiet('снимок не прочитан', () => core.getState().view.open === 'room')), [core]);

  // Снять идущий перенос: локально и ядру (у ядра уже снятый — без вреда).
  const drop = useCallback(() => {
    const was = grab.current;
    grab.current = null;
    if (was) quiet('перенос не отменён', () => was.core.room.dragCancel());
  }, []);

  // Смена ядра, питомца или вида, закрытие и размонтирование — перенос снят; отказ — только для своего ядра.
  useEffect(() => {
    setNote(null);
    if (!core) return drop;
    let pet = quiet('снимок не прочитан', () => core.getState().pet.shown);
    const off = core.subscribe(
      ({ snapshot: s }) => {
        if (s.pet?.shown !== pet || s.view.open !== 'room') {
          pet = s.pet?.shown ?? null;
          if (grab.current) drop();
          setNote(null);
        }
      },
      { initial: false },
    );
    return () => {
      off();
      drop();
    };
  }, [core, drop]);
  // Фон и неактивное приложение — перенос снят (отпускания может не быть); черновик остаётся, не записывается. Слушатель —
  // только пока редактор открыт: закрытый PetRoom системных подписок не держит.
  useEffect(() => {
    if (!open) return undefined;
    const sub = quiet('нет подписки AppState', () => AppState.addEventListener('change', (state) => state !== 'active' && drop()));
    return () => quiet('подписка AppState не снята', () => sub?.remove());
  }, [open, drop]);

  // Раскладка окна: отступы хоста (безопасные области), иначе системные; широкий экран — сцена слева.
  const pad = { top: number(insets?.top) || (Platform.OS === 'ios' ? 20 : 0), bottom: number(insets?.bottom), left: number(insets?.left), right: number(insets?.right) };
  const width = number(frame?.width);
  const height = number(frame?.height);
  const wide = width > height && width >= 600;
  const inner = Math.max(0, width - pad.left - pad.right - 32);
  const sceneWidth = Math.floor(Math.min(MAX_SCENE, wide ? inner * 0.55 : inner, wide ? (height - pad.top - pad.bottom - 32) * (SCENE[0] / SCENE[1]) : Infinity));
  const k = sceneWidth / SCENE[0];
  // Размер сцены сменился (поворот, разделённый экран) — идущий перенос снят: точка захвата в прежнем масштабе.
  useEffect(() => drop, [sceneWidth, drop]);

  // Как у уголка: набор показанного питомца (или запасной), определение — набора, подписи — показанного.
  const shown = snapshot?.pet.shown ?? null;
  const kit = shown && core ? kitFor(catalog, shown) : null;
  const def = kit ? catalog.defs.get(kit.pet) : null;
  const who = shown && catalog ? (catalog.defs.get(shown) ?? def) : null;
  const model = useMemo(() => (def ? roomModel(def) : null), [def]);
  const stage = snapshot?.progress?.stage ?? 0;
  const running = Boolean(snapshot && snapshot.status !== 'destroyed');
  const title = (id) => (model ? itemTitle(model, id, stage) : id);
  const layoutOf = (d) => ({ model, stage, pos: d.drag ? { ...d.pos, [d.drag.id]: d.drag.at } : d.pos, pick: d.pick });

  // ---------- команды ----------
  const say = (text) => setNote({ core, text });
  const act = (fn) => () => {
    if (!ours() || grab.current) return;
    setNote(null);
    const result = quiet('команда не выполнена', () => fn(core));
    if (result && !result.ok) say(result.error.message);
  };
  const back = () => {
    if (!ours()) return;
    if (grab.current) return drop();
    if (quiet('снимок не прочитан', () => core.getState().room.draft?.drag)) return void quiet('перенос не отменён', () => core.room.dragCancel());
    act((c) => c.room.cancel())();
  };

  // ---------- касания сцены ----------
  const startable = (ne) => {
    if (!ours() || grab.current || !running || !model || sceneWidth <= 0) return false;
    const d = core.getState().room.draft;
    const point = touchPoint(ne);
    return Boolean(d && point && pickAt(layoutOf(d), [point[0] / k, point[1] / k], d.pick, HIT_PT / k));
  };
  const begin = (ne) => {
    if (!startable(ne)) return;
    const d = core.getState().room.draft;
    const point = touchPoint(ne);
    const id = pickAt(layoutOf(d), [point[0] / k, point[1] / k], d.pick, HIT_PT / k);
    const from = d.pos[id];
    const result = core.room.drag(id, from);
    if (!result.ok) return say(result.error.message);
    setNote(null);
    serial.current += 1;
    grab.current = { core, serial: serial.current, id, from: [...from], start: point, touch: ne?.identifier ?? 0, stamp: Number.isFinite(ne?.timestamp) ? ne.timestamp : null, k, on: false };
  };
  // Событие идущего переноса: обработчик этой привязки (ядро отрисовки = ядро последней фиксации = ядро жеста) и событие не
  // старше начала жеста. Поздние move / release / terminate прежнего касания (после отмены, фона, смены ядра — в том числе
  // с тем же identifier) и обработчики прежней отрисовки другого ядра новый перенос не ведут и не завершают.
  const live = (ne) => {
    const g = grab.current;
    if (!g || g.core !== core || bound.current !== core) return null;
    if (Number.isFinite(ne?.timestamp) && g.stamp !== null && ne.timestamp < g.stamp) return null;
    return g;
  };
  const responder = {
    onStartShouldSetResponder: (event) => startable(event?.nativeEvent),
    onMoveShouldSetResponder: () => false,
    onResponderTerminationRequest: () => !grab.current,
    onResponderGrant: (event) => begin(event?.nativeEvent),
    onResponderMove: (event) => {
      const g = live(event?.nativeEvent);
      if (!g) return;
      const point = touchPoint(event?.nativeEvent, g.touch);
      if (!point) return;
      const dx = point[0] - g.start[0];
      const dy = point[1] - g.start[1];
      if (!g.on && Math.hypot(dx, dy) < MOVE_PT) return;
      g.on = true;
      const result = core.room.drag(g.id, [g.from[0] + dx / g.k, g.from[1] + dy / g.k]);
      if (!result.ok && grab.current === g) drop();
    },
    onResponderRelease: (event) => {
      const g = live(event?.nativeEvent);
      if (!g || !ended(event?.nativeEvent, g.touch)) return;
      grab.current = null;
      if (g.on) quiet('перенос не завершён', () => g.core.room.drop());
      else quiet('перенос не отменён', () => g.core.room.dragCancel());
    },
    // Ответчик отнят — снять только свой идущий перенос (не перенос другого ядра или более позднего касания).
    onResponderTerminate: (event) => {
      if (live(event?.nativeEvent)) drop();
    },
  };

  if (!snapshot || !core) return null;
  const ids = draft ? Object.keys(draft.pos) : [];
  const layout = draft && model ? layoutOf(draft) : null;
  const box = layout && draft.pick ? hitBox(layout, draft.pick, HIT_PT / k) : null;
  const changed = draft?.changed ?? [];
  const status = draft?.saving ? 'Сохраняется…' : changed.length ? `Не сохранено: ${changed.map((id) => title(id).toLowerCase()).join(', ')}` : 'Изменений нет';
  const motion = snapshot.prefs.effectiveMotion;
  const name = snapshot.name?.display ?? '';

  const scene =
    draft && def && kit && sceneWidth > 0
      ? h(
          View,
          { testID: `${testID}-stage`, style: { width: sceneWidth, height: Math.round(sceneWidth * (SCENE[1] / SCENE[0])) }, ...responder },
          h(CornerScene, { width: sceneWidth, def, kit, who, snapshot, stage, fresh: [], prefix, core, testID, name, pos: layout.pos, editor: true }),
          box
            ? h(View, {
                testID: `${testID}-pick-frame`,
                pointerEvents: 'none',
                accessibilityElementsHidden: true,
                importantForAccessibility: 'no-hide-descendants',
                style: [styles.frame, { left: box[0] * k, top: box[1] * k, width: (box[2] - box[0]) * k, height: (box[3] - box[1]) * k }],
              })
            : null,
        )
      : null;
  const controls = draft
    ? [
        h(
          View,
          { key: 'picks', style: styles.row, accessibilityRole: 'radiogroup', accessibilityLabel: 'Предмет' },
          ids.map((id, index) =>
            h(
              Pressable,
              {
                key: id,
                ref: index === 0 ? firstRef : undefined,
                testID: `${testID}-pick-${id}`,
                onPress: act((c) => c.room.select(id)),
                accessibilityRole: 'radio',
                accessibilityState: { checked: draft.pick === id, disabled: !running },
                style: ({ pressed }) => [styles.chip, draft.pick === id && styles.chipOn, pressed && styles.pressed],
              },
              h(Text, { style: [styles.chipText, draft.pick === id && styles.chipTextOn] }, title(id)),
            ),
          ),
        ),
        h(Text, { key: 'chosen', testID: `${testID}-chosen`, style: styles.sub }, `Передвинуть: ${title(draft.pick).toLowerCase()}`),
        h(
          View,
          { key: 'pad', style: styles.row },
          ROOM_DIRS.map((dir) => {
            const can = running && draft.can.includes(dir);
            return h(
              Pressable,
              {
                key: dir,
                testID: `${testID}-move-${dir}`,
                onPress: can ? act((c) => c.room.nudge(dir)) : undefined,
                accessibilityRole: 'button',
                accessibilityLabel: `${DIR_TEXT[dir][1]}: ${title(draft.pick).toLowerCase()}`,
                accessibilityState: { disabled: !can },
                style: ({ pressed }) => [styles.button, !can && styles.off, pressed && can && styles.pressed],
              },
              h(Text, { style: styles.buttonText }, `${DIR_TEXT[dir][0]} ${DIR_TEXT[dir][1]}`),
            );
          }),
        ),
        h(
          Pressable,
          { key: 'reset', testID: `${testID}-reset`, onPress: act((c) => c.room.reset()), accessibilityRole: 'button', style: ({ pressed }) => [styles.link, pressed && styles.pressed] },
          h(Text, { style: styles.linkText }, 'Вернуть обычную расстановку'),
        ),
        snapshot.treat === 'waiting' || !snapshot.treat ? h(Text, { key: 'bowl', testID: `${testID}-bowl`, style: styles.muted }, 'Миска появится в уголке после занятия — на этом месте.') : null,
        draft.other ? h(Text, { key: 'other', testID: `${testID}-other`, style: styles.alert, accessibilityRole: 'alert' }, ROOM_TEXT.other) : null,
        draft.failed ? h(Text, { key: 'failed', testID: `${testID}-failed`, style: styles.alert, accessibilityRole: 'alert' }, ROOM_TEXT.failed) : null,
        note && note.core === core ? h(Text, { key: 'note', testID: `${testID}-note`, style: styles.alert, accessibilityRole: 'alert' }, note.text) : null,
        h(Text, { key: 'state', testID: `${testID}-state`, style: styles.sub, accessibilityLiveRegion: 'polite' }, status),
        h(
          View,
          { key: 'actions', style: styles.row },
          h(Pressable, { testID: `${testID}-cancel`, onPress: back, accessibilityRole: 'button', style: ({ pressed }) => [styles.button, pressed && styles.pressed] }, h(Text, { style: styles.buttonText }, 'Отмена')),
          h(
            Pressable,
            { testID: `${testID}-save`, onPress: act((c) => c.room.save()), accessibilityRole: 'button', accessibilityState: { busy: Boolean(draft.saving) }, style: ({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed] },
            h(Text, { style: [styles.buttonText, styles.primaryText] }, 'Сохранить'),
          ),
        ),
      ]
    : [];

  return h(
    Modal,
    {
      visible: slot.visible,
      animationType: motion === 'none' ? 'none' : motion === 'calm' ? 'fade' : 'slide',
      presentationStyle: 'overFullScreen',
      supportedOrientations: ORIENTATIONS,
      onRequestClose: back,
      onShow: () => focusOn(firstRef.current),
      onDismiss: () => slot.dismissed(),
      testID: `${testID}-modal`,
    },
    h(
      View,
      { testID: `${testID}-sheet`, style: [styles.sheet, { paddingTop: pad.top, paddingLeft: pad.left, paddingRight: pad.right }], onLayout: (event) => setFrame(event?.nativeEvent?.layout ?? null), accessibilityViewIsModal: true, onAccessibilityEscape: back },
      h(
        ScrollView,
        { testID: `${testID}-scroll`, scrollEnabled: !grab.current, contentContainerStyle: [styles.content, wide && styles.contentWide, { paddingBottom: pad.bottom + 16 }] },
        h(View, { style: wide ? styles.side : null }, h(Text, { testID: `${testID}-title`, style: styles.title, accessibilityRole: 'header', maxFontSizeMultiplier: TITLE_SCALE }, 'Обустроить уголок'), h(Text, { style: styles.muted }, ROOM_HINT), scene),
        h(View, { style: wide ? styles.side : styles.below }, ...controls),
      ),
    ),
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#fbf8f3' },
  content: { padding: 16, gap: 10 },
  contentWide: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  side: { flex: 1, gap: 10 },
  below: { gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: '#2f2a24' },
  sub: { fontSize: 15, color: '#3d362e' },
  muted: { fontSize: 14, color: '#6b6258' },
  alert: { fontSize: 15, color: '#9a3412' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: '#cbb79c', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#4d3f30', borderColor: '#4d3f30' },
  chipText: { fontSize: 15, color: '#3d362e' },
  chipTextOn: { color: '#fff' },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#cbb79c', backgroundColor: '#fff' },
  primary: { backgroundColor: '#4d3f30', borderColor: '#4d3f30' },
  buttonText: { fontSize: 15, color: '#3d362e' },
  primaryText: { color: '#fff', fontWeight: '600' },
  off: { opacity: 0.45 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 15, color: '#7c4a1e', textDecorationLine: 'underline' },
  pressed: { opacity: 0.7 },
  frame: { position: 'absolute', borderWidth: 2, borderStyle: 'dashed', borderColor: '#7c4a1e', borderRadius: 6 },
});
