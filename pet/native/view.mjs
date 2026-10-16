// Натив: PetView — питомец на экране приложения (этап PL10.1; README, «Нативное отображение»; docs/ARCHITECTURE.md § 12.2).
// Рисует публичный снимок ядра (pet.shown, name, look, prefs.effectiveMotion, presence, visible, pose.shown.page,
// pose.reaction, phrase) штатным или своим нативным набором (react-native-svg) и превращает касание в публичную команду
// interact({ type: 'pet' }); своих правил поведения нет. Ядро создаёт и уничтожает хост, жизненный цикл приложения
// подключает хост (useNativeLifecycle — один владелец), PetView владеет только своим: подпиской снимка (общий
// usePetState), подпиской объявлений (эффекты announce → AccessibilityInfo.announceForAccessibility) и анимацией Animated.
//
// Объявление отображения ядру (setDisplay) — только нарисованное: { full: true, moving: false, pets — питомцы с набором,
// views: [] — видов уголка, «Поиграть» и редактора в PL10.1 нет, scenes: {} — сценок нет: ни резервирования дня, ни показа }.
// Неверные pets или kits — отказ до любых побочных действий: читаемый текст вместо питомца, без подписок и команд.
// Движение — короткая анимация реакции (motion.mjs), только пока ядро запущено, приложение на виду и движение не
// выключено: фон (visible: false), effectiveMotion 'none', конец реакции, смена ядра и размонтирование её снимают.

import { createElement as h, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg from 'react-native-svg';
import { systemLog } from '../core/ports.mjs';
import { usePetState } from '../hooks/state.mjs';
import { drawnPose, kitFor, nativeCatalog } from './kits.mjs';
import { motionPlan } from './motion.mjs';

const SIZE = 180;
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => item === b[i]);

// Каталог на экземпляр: пересчёт только при смене состава pets или kits (не при каждой отрисовке со встроенными массивами).
function useCatalog(pets, kits) {
  const memo = useRef(null);
  if (!memo.current || !same(memo.current.pets, pets) || !same(memo.current.kits, kits)) memo.current = { pets, kits, catalog: nativeCatalog(pets, kits, isValidElement) };
  return memo.current.catalog;
}

export function PetView({ core = null, pets, kits, size = SIZE, style, label, hint = 'Погладить', announce = true, touch = true, testID = 'pet' }) {
  const catalog = useCatalog(pets, kits);
  const usable = catalog.problem ? null : core;
  const snapshot = usePetState(usable);
  const prefix = useId().replace(/[^a-z0-9]/gi, '');
  const [liftX] = useState(() => new Animated.Value(0));
  const [liftY] = useState(() => new Animated.Value(0));
  const width = Number.isFinite(size) && size > 0 ? size : SIZE;

  useEffect(() => {
    if (catalog.problem && core) systemLog.warn(`PetView: ${catalog.problem}`);
  }, [catalog.problem, core]);

  // Что нарисовано — ядру (только своё ядро и только при годном каталоге).
  const ids = catalog.ids.join('\n');
  useEffect(() => {
    if (!usable || !ids) return;
    try {
      usable.setDisplay({ full: true, moving: false, pets: ids.split('\n'), views: [], scenes: {} });
    } catch (error) {
      systemLog.warn('PetView: объявление отображения не принято', error);
    }
  }, [usable, ids]);

  // Объявления ядра — скринридеру, по одному на эффект; своя подписка снимается при смене ядра и размонтировании.
  useEffect(() => {
    if (!usable || !announce) return undefined;
    return usable.subscribe(
      (update) => {
        for (const effect of update.effects) {
          if (effect.type !== 'announce' || !effect.text) continue;
          try {
            AccessibilityInfo.announceForAccessibility(effect.text);
          } catch (error) {
            systemLog.warn('PetView: объявление не передано', error);
          }
        }
      },
      { initial: false },
    );
  }, [usable, announce]);

  const reaction = snapshot?.pose.reaction ?? null;
  const motion = snapshot?.prefs.effectiveMotion ?? 'none';
  const active = Boolean(snapshot && snapshot.status === 'running' && snapshot.visible && snapshot.presence.around);
  const kit = snapshot ? kitFor(catalog, snapshot.pet.shown) : null;
  const def = kit ? catalog.defs.get(kit.pet) : null;
  const units = def ? width / def.size.width : 1;
  const plan = active && reaction && !reaction.scene ? motionPlan(reaction.type, motion) : null;
  const run = plan ? `${reaction.id}:${reaction.type}:${motion}:${units}` : '';

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
    // План однозначно задан run; usable — смена ядра снимает и одинаковую по виду реакцию.
  }, [run, usable]);

  if (!core) return null;
  if (catalog.problem) {
    return h(
      View,
      { testID, style: [styles.box, style], accessible: true, accessibilityRole: 'alert' },
      h(Text, { testID: `${testID}-problem`, style: styles.problem }, `Питомец не показан: ${catalog.problem}`),
    );
  }
  if (!snapshot || !snapshot.presence.around || !kit) return null;

  const height = Math.round((width * def.size.height) / def.size.width);
  const pose = drawnPose(kit, def, snapshot.pose.shown.page, snapshot.pose.base);
  const shownDef = catalog.defs.get(snapshot.pet.shown) ?? def;
  const canTouch = touch && snapshot.status !== 'destroyed';
  const press = () => {
    if (!usable || usable.status === 'destroyed') return;
    usable.activity();
    usable.interact({ type: 'pet' });
  };
  const figure = h(kit.Figure, { pose, coat: snapshot.look.coat, accessory: snapshot.look.worn, toward: reaction?.toward ?? '', prefix });
  return h(
    View,
    { testID, style: [styles.box, style] },
    h(
      Pressable,
      {
        testID: `${testID}-touch`,
        onPress: press,
        disabled: !canTouch,
        accessibilityRole: 'button',
        accessibilityLabel: label ?? `${snapshot.name.display}, ${shownDef.title.toLowerCase()}`,
        accessibilityHint: hint,
        accessibilityState: { disabled: !canTouch },
        style: { width, height },
      },
      h(
        Animated.View,
        { testID: `${testID}-motion`, style: { width, height, transform: [{ translateX: liftX }, { translateY: liftY }] }, pointerEvents: 'none' },
        h(Svg, { testID: `${testID}-art`, width, height, viewBox: `0 0 ${def.size.width} ${def.size.height}`, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }, figure),
      ),
    ),
    snapshot.phrase ? h(Text, { testID: `${testID}-phrase`, style: [styles.phrase, { maxWidth: Math.max(width, 160) }] }, snapshot.phrase.text) : null,
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center' },
  phrase: { marginTop: 6, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  problem: { fontSize: 16, lineHeight: 22, color: '#a1271b' },
});
