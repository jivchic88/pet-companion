// Натив: PetView — питомец на экране приложения (этапы PL10.1, PL10.2.1; README, «Нативное отображение»;
// docs/ARCHITECTURE.md § 12.2). Рисует публичный снимок ядра (pet.shown, name, look, prefs.effectiveMotion, presence,
// visible, pose.shown.page, pose.reaction, phrase) штатным или своим нативным набором (react-native-svg) и превращает касание
// в публичную команду interact({ type: 'pet' }); своих правил поведения нет. Ядро создаёт и уничтожает хост, жизненный цикл
// приложения подключает хост (useNativeLifecycle — один владелец), PetView владеет только своим: подпиской снимка (общий
// usePetState) и анимацией рисунка (figure.mjs).
//
// Два режима, оба через тот же снимок:
// — отдельно (как PL10.1, свойства core, pets, kits): PetView сам объявляет ядру нарисованное — setDisplay({ full: true,
//   moving: false, pets — питомцы с набором, views: [], scenes — сценки наборов (PL10.2.4) }) — и сам передаёт объявления announce скринридеру;
// — композиция (внутри PetProvider, без core или с тем же core): ядро и каталог — координатора, объявление отображения и
//   объявления скринридеру — только у координатора (один владелец на ядро): PetView их не повторяет и views/scenes,
//   объявленные уголком, не сбрасывает. Свои pets и kits в композиции — только для рисунка, проверяются так же.
// Сценки (PL10.2.4) объявлены, только пока PetView подключён: в композиции он — поверхность рисунка координатора
// (register('figure')), отдельно — снимает свои сценки при размонтировании и смене ядра, если других отдельных PetView этого
// ядра не осталось (микрозадачей: StrictMode и повторное подключение не дают промежуточного снятия). Иначе ядро
// резервировало бы день сценке, которую никто не рисует.
// Неверные pets или kits — отказ до любых побочных действий: читаемый текст вместо питомца, без подписок и команд.

import { createElement as h, useEffect, useId } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { systemLog } from '../core/ports.mjs';
import { usePetState } from '../hooks/state.mjs';
import { PetFigure } from './figure.mjs';
import { kitFor, nativeScenes } from './kits.mjs';
import { useAnnounce, useCatalog, usePetContext } from './provider.mjs';

const SIZE = 180;
// Отдельные PetView по ядру: ядро → множество подключённых (последний ушедший снимает сценки).
const standalone = new WeakMap();

export function PetView(props) {
  const { size = SIZE, style, label, hint = 'Погладить', announce = true, touch = true, testID = 'pet' } = props;
  const shared = usePetContext();
  // Композиция: внутри координатора и с его ядром (core не передан или тот же).
  const composed = Boolean(shared) && (props.core === undefined || props.core === shared.core);
  const core = composed ? shared.core : (props.core ?? null);
  const ownCatalog = useCatalog(props.pets, props.kits);
  const catalog = composed && props.pets === undefined && props.kits === undefined ? shared.catalog : ownCatalog;
  const usable = catalog.problem ? null : core;
  const snapshot = usePetState(usable);
  const prefix = useId().replace(/[^a-z0-9]/gi, '');
  const width = Number.isFinite(size) && size > 0 ? size : SIZE;

  useEffect(() => {
    if (catalog.problem && core) systemLog.warn(`PetView: ${catalog.problem}`);
  }, [catalog.problem, core]);

  // Что нарисовано — ядру (только отдельно: в композиции объявляет координатор; только своё ядро и только при годном каталоге).
  const ids = catalog.ids.join('\n');
  const scenes = JSON.stringify(nativeScenes(catalog));
  useEffect(() => {
    if (composed || !usable || !ids) return undefined;
    const mine = {};
    const owners = standalone.get(usable) ?? new Set();
    standalone.set(usable, owners);
    owners.add(mine);
    try {
      usable.setDisplay({ full: true, moving: false, pets: ids.split('\n'), views: [], scenes: JSON.parse(scenes) });
    } catch (error) {
      systemLog.warn('PetView: объявление отображения не принято', error);
    }
    return () => {
      owners.delete(mine);
      queueMicrotask(() => {
        if (owners.size || usable.status === 'destroyed') return;
        try {
          usable.setDisplay({ scenes: {} });
        } catch (error) {
          systemLog.warn('PetView: сценки не сняты', error);
        }
      });
    };
  }, [composed, usable, ids, scenes]);

  // В композиции — поверхность рисунка координатора (сценки объявлены, пока она подключена).
  const register = composed ? (shared?.register ?? null) : null;
  useEffect(() => (register && usable ? register('figure') : undefined), [register, usable]);

  // Объявления ядра — скринридеру, по одному на эффект (в композиции — координатор).
  useAnnounce(composed ? null : usable, announce, 'PetView');

  if (!core) return null;
  if (catalog.problem) {
    return h(
      View,
      { testID, style: [styles.box, style], accessible: true, accessibilityRole: 'alert' },
      h(Text, { testID: `${testID}-problem`, style: styles.problem }, `Питомец не показан: ${catalog.problem}`),
    );
  }
  const kit = snapshot ? kitFor(catalog, snapshot.pet.shown) : null;
  if (!snapshot || !snapshot.presence.around || !kit) return null;

  const def = catalog.defs.get(kit.pet);
  const height = Math.round((width * def.size.height) / def.size.width);
  const shownDef = catalog.defs.get(snapshot.pet.shown) ?? def;
  const canTouch = touch && snapshot.status !== 'destroyed';
  const press = () => {
    if (!usable || usable.status === 'destroyed') return;
    usable.activity();
    usable.interact({ type: 'pet' });
  };
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
      h(PetFigure, { core: usable, snapshot, kit, def, width, pose: snapshot.pose.shown.page, prefix, testID }),
    ),
    snapshot.phrase ? h(Text, { testID: `${testID}-phrase`, style: [styles.phrase, { maxWidth: Math.max(width, 160) }] }, snapshot.phrase.text) : null,
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center' },
  phrase: { marginTop: 6, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  problem: { fontSize: 16, lineHeight: 22, color: '#a1271b' },
});
