// Натив: рисунок питомца поверхности (этапы PL10.1, PL10.2.1; docs/ARCHITECTURE.md § 12.2) — общий для PetView и уголка.
// Рисует решённую ядром позу поверхности (pose.shown.page) набором питомца: корневой Svg в единицах рисунка определения
// (size; у штатных 220×204), Figure набора внутри; в сцене комнаты — со свойством room ({ feed } — сдвиг к миске
// room.feedShift ядра). Движение реакции — встроенный Animated на нативном драйвере по чистой таблице motion.mjs: одна
// анимация на реакцию, только пока ядро запущено, приложение на виду, питомец рядом и движение не выключено (снимок:
// status, visible, presence.around, prefs.effectiveMotion); конец реакции, смена режима или ядра и размонтирование её
// снимают и возвращают рисунок на место. Рисунок скрыт от скринридера — смысл несут подписи поверхности.
//
// Редкая сценка (PL10.2.4): реакция ядра со scene — сценка, которую набор рисует (kit.scenes), — поверх позы покоя фазами, как
// кадры веба: начало и конец — поза поверхности, середина (SCENE_ON…SCENE_OFF длительности сценки определения) — поза
// сценки; без движения (effectiveMotion none) — поза сценки статично всё время. Выбор, отмену, резервирование дня и
// длительность ведёт ядро: конец реакции, отмена, смена ядра, фон (visible) и размонтирование снимают показ сразу.
// Сценки рисуют страница (PetView) и открытый уголок; редактор расстановки и «Поиграть» — нет (scenes: false; ядро там
// сценок и не начинает).

import { createElement as h, useEffect, useState } from 'react';
import { Animated } from 'react-native';
import Svg from 'react-native-svg';
import { drawnPose, kitScene } from './kits.mjs';
import { motionPlan } from './motion.mjs';

// props: core — ядро поверхности (его смена снимает движение); snapshot — снимок; kit, def — набор и определение
// показанного; width — ширина в точках экрана; pose — поза поверхности из снимка; prefix — префикс id экземпляра; testID —
// префикс узлов ('-motion', '-art'); room — рисунок в сцене комнаты (необязательно); scenes — рисовать ли редкие сценки.
export const SCENE_ON = 0.2;
export const SCENE_OFF = 0.8;

export function PetFigure({ core, snapshot, kit, def, width, pose, prefix, testID, room = null, scenes = true }) {
  const [liftX] = useState(() => new Animated.Value(0));
  const [liftY] = useState(() => new Animated.Value(0));
  const reaction = snapshot.pose.reaction;
  const motion = snapshot.prefs.effectiveMotion;
  const active = snapshot.status === 'running' && snapshot.visible && snapshot.presence.around;
  const units = width / def.size.width;
  const plan = active && reaction && !reaction.scene ? motionPlan(reaction.type, motion) : null;
  const run = plan ? `${reaction.id}:${reaction.type}:${motion}:${units}` : '';
  const scene = active && scenes ? kitScene(kit, def, reaction) : null;
  const sceneRun = scene ? `${reaction.id}:${scene.id}:${motion}` : '';
  const [phase, setPhase] = useState(null);

  // Фазы сценки: середина — поза сценки (без движения — сразу и до конца); любое снятие — поза поверхности.
  useEffect(() => {
    if (!scene) {
      setPhase(null);
      return undefined;
    }
    if (motion === 'none') {
      setPhase(sceneRun);
      return () => setPhase(null);
    }
    setPhase(null);
    const on = setTimeout(() => setPhase(sceneRun), Math.round(scene.ms * SCENE_ON));
    const off = setTimeout(() => setPhase(null), Math.round(scene.ms * SCENE_OFF));
    return () => {
      clearTimeout(on);
      clearTimeout(off);
      setPhase(null);
    };
    // sceneRun однозначно задаёт показ; core — смена ядра снимает и одинаковую по виду сценку.
  }, [sceneRun, core]);

  // Движение реакции: одна анимация на реакцию; любое снятие условий — стоп и исходное положение.
  useEffect(() => {
    if (!plan) return undefined;
    const value = plan.prop === 'x' ? liftX : liftY;
    value.setValue(0);
    const once = Animated.sequence(plan.steps.map((step) => Animated.timing(value, { toValue: step.to * units, duration: step.ms, useNativeDriver: true })));
    const animation = plan.repeat > 1 ? Animated.loop(once, { iterations: plan.repeat }) : once;
    animation.start();
    return () => {
      animation.stop();
      value.setValue(0);
    };
    // План однозначно задан run; core — смена ядра снимает и одинаковую по виду реакцию.
  }, [run, core]);

  const height = Math.round((width * def.size.height) / def.size.width);
  const shown = scene && phase === sceneRun ? scene.pose : pose;
  const props = { pose: drawnPose(kit, def, shown, snapshot.pose.base), coat: snapshot.look.coat, accessory: snapshot.look.worn, toward: reaction?.toward ?? '', prefix };
  if (room) props.room = room;
  return h(
    Animated.View,
    { testID: `${testID}-motion`, style: { width, height, transform: [{ translateX: liftX }, { translateY: liftY }] }, pointerEvents: 'none' },
    h(Svg, { testID: `${testID}-art`, width, height, viewBox: `0 0 ${def.size.width} ${def.size.height}`, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }, h(kit.Figure, props)),
  );
}
