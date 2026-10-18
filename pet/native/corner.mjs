// Натив: PetCorner — уголок питомца (этап PL10.2.1; README, «Нативное отображение»; docs/ARCHITECTURE.md § 12.2) внутри
// PetProvider. Вход (кнопка «Уголок …» рядом с питомцем) — core.open('corner'); окно уголка (Modal React Native) открыто
// ровно тогда, когда в снимке view.open === 'corner' (кнопка, прямая команда ядра, восстановление — одним путём); закрытие —
// core.close(): кнопка «Закрыть», Android «Назад» (onRequestClose окна — только пока оно открыто), жест VoiceOver «назад»
// (onAccessibilityEscape); фокус возвращается ко входу (или returnFocus хоста). Своего флага открытого вида нет.
//
// Внутри — только снимок и эффекты ядра: комната 400×250 (общий уголок room.mjs, вещи ступени по определению, свои вещи —
// Item набора, места — room.pos, сдвиг к миске — room.feedShift) и питомец по size определения (pose.shown.page); имя
// (клавиатура и готовые — names определения; черновик принадлежит паре «ядро и показанный питомец»), выбор питомца,
// облик, аксессуары (открытые — progress.accessories), движение и реплики, «Погладить», «Дай лапу» (actions.paw.ask),
// кормление (treat снимка, решение — feed() ядра), счёт, ступени и подарки (progress, STAGES ядра), праздник и «Новое в
// уголке» (эффекты celebrate и seen, пока уголок на виду; иначе progress.unseen), состояние записи (save). Правил нет:
// команды проходят проверки ядра, отказ показывается его текстом. «Поиграть» и «Обустроить уголок» — PL10.2.2–PL10.2.3:
// их кнопок здесь нет. Сценок нет (scenes: {} у координатора).
//
// Раскладка — по onLayout окна и отступам хоста insets (безопасные области; без них — системные отступы окна): портрет —
// сцена сверху в прокрутке, широкий экран — сцена слева, настройки справа; клавиатура не закрывает поле имени (отступ по
// её рамке, прокрутка к полю). Движение окна и питомца — по prefs.effectiveMotion. Объявления скринридеру — у координатора.

import { createElement as h, Fragment, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg from 'react-native-svg';
import { NAME_MAX, namePage, namePageCount, namePageOf } from '../core/pets.mjs';
import { systemLog } from '../core/ports.mjs';
import { roomModel } from '../core/room.mjs';
import { marksText, STAGES, stageGift } from '../core/stages.mjs';
import { usePetState } from '../hooks/state.mjs';
import { PetFigure } from './figure.mjs';
import { cornerProblem, kitFor } from './kits.mjs';
import { usePetContext } from './provider.mjs';
import { petBox, roomBack, roomFront, sharedItems, SCENE } from './room.mjs';

const MOTIONS = [
  ['normal', 'Обычное'],
  ['calm', 'Спокойное'],
  ['none', 'Без анимации'],
];
const SAVE_KEYS = ['cat', 'companion', 'look', 'treat', 'ext'];
const ORIENTATIONS = ['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right'];

// Черновик имени: { core, pet, text } — виден и применяется только для того же ядра и показанного питомца.
const draftOf = (draft, core, state) => (draft && core && state && draft.core === core && draft.pet === state.pet.shown ? draft.text : null);
const number = (value) => (Number.isFinite(value) && value > 0 ? value : 0);
const insetsOf = (value) => ({ top: number(value?.top), right: number(value?.right), bottom: number(value?.bottom), left: number(value?.left) });
const focusOn = (node) => {
  if (!node) return;
  try {
    AccessibilityInfo.sendAccessibilityEvent?.(node, 'focus');
  } catch (error) {
    systemLog.warn('PetCorner: фокус не перенесён', error);
  }
};

export function PetCorner({ insets, entry = true, label, hint = 'Открыть уголок', returnFocus = null, testID = 'corner', style } = {}) {
  const shared = usePetContext();
  const catalog = shared?.catalog ?? null;
  const problem = useMemo(() => (!shared ? 'PetCorner — только внутри PetProvider (координатор объявляет виды ядру)' : cornerProblem(catalog, isValidElement)), [shared, catalog]);
  const core = problem ? null : (shared?.usable ?? null);
  const register = shared?.register ?? null;
  const snapshot = usePetState(core);
  const prefix = useId().replace(/[^a-z0-9]/gi, '');
  const open = Boolean(snapshot && snapshot.status !== 'destroyed' && snapshot.view.open === 'corner');

  const [news, setNews] = useState(null);
  const [draft, setDraft] = useState(null);
  const [page, setPage] = useState(null);
  const [note, setNote] = useState(null);
  const [frame, setFrame] = useState(null);
  const [body, setBody] = useState(null);
  const [keyboardTop, setKeyboardTop] = useState(null);
  const entryRef = useRef(null);
  const closeRef = useRef(null);
  const treatRef = useRef(null);
  const nameRef = useRef(null);
  const scrollRef = useRef(null);
  const nameY = useRef(0);
  const typing = useRef(null);
  const nameFocused = useRef(false);
  const treatFocus = useRef(false);
  const wasOpen = useRef(false);
  // Режим движения последней отрисовки — для прокрутки из слушателя клавиатуры (без движения — без анимации).
  const still = useRef(true);
  still.current = (snapshot?.prefs.effectiveMotion ?? 'none') === 'none';

  useEffect(() => {
    if (problem && shared?.core) systemLog.warn(`PetCorner: ${problem}`);
  }, [problem, shared?.core]);

  // Поверхность уголка — у координатора, пока она годна: вид 'corner' объявлен ядру ровно на это время.
  useEffect(() => (register && !problem ? register('corner') : undefined), [register, problem]);

  // Праздник и «Новое в уголке» — эффекты ядра, пришедшие, пока уголок на виду (одно на ступень, вещи — объединением).
  useEffect(() => {
    if (!core) return undefined;
    return core.subscribe(
      ({ snapshot: s, effects }) => {
        if (s.view.open !== 'corner') return;
        for (const effect of effects) {
          if (effect.type !== 'celebrate' && effect.type !== 'seen') continue;
          setNews((was) => {
            const same = was && was.core === core && was.stage === effect.stage;
            return {
              core,
              stage: effect.stage,
              celebrate: effect.type === 'celebrate' || Boolean(same && was.celebrate),
              items: [...new Set([...(same ? was.items : []), ...effect.items])],
              accessories: [...new Set([...(same ? was.accessories : []), ...effect.accessories])],
            };
          });
        }
      },
      { initial: false },
    );
  }, [core]);

  // Тишина ввода снимается, когда поле больше не в работе: закрытие уголка, смена ядра, размонтирование.
  const release = useCallback(() => {
    const was = typing.current;
    typing.current = null;
    nameFocused.current = false;
    if (was && was.status !== 'destroyed') was.setContext({ typing: false });
  }, []);
  useEffect(() => release, [core, release]);

  // Возврат фокуса ко входу (или к returnFocus хоста) после закрытия окна.
  const focusBack = useCallback(() => focusOn(returnFocus?.current ?? entryRef.current), [returnFocus]);
  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (open) return undefined;
    setNews(null);
    setDraft(null);
    setNote(null);
    setKeyboardTop(null);
    release();
    // iOS — по onDismiss окна; Android — после снятия окна, следующим оборотом.
    if (!closed || Platform.OS === 'ios') return undefined;
    const id = setTimeout(focusBack, 0);
    return () => clearTimeout(id);
  }, [open, focusBack, release]);

  // Клавиатура, пока окно открыто: её верх — для отступа под полем имени; поле в фокусе — прокрутка к нему.
  useEffect(() => {
    if (!open) return undefined;
    const ios = Platform.OS === 'ios';
    const shown = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      const top = event?.endCoordinates?.screenY;
      setKeyboardTop(Number.isFinite(top) ? top : null);
      if (nameFocused.current) scrollRef.current?.scrollTo?.({ y: Math.max(0, nameY.current - 12), animated: !still.current });
    });
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardTop(null));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [open]);

  // Фокус после кормления — на новом состоянии лакомства.
  const treat = snapshot?.treat ?? 'waiting';
  useEffect(() => {
    if (!treatFocus.current) return;
    treatFocus.current = false;
    focusOn(treatRef.current);
  }, [treat]);

  if (!shared || problem) {
    if (!shared?.core && shared) return null;
    return h(View, { testID, style, accessible: true, accessibilityRole: 'alert' }, h(Text, { testID: `${testID}-problem`, style: styles.problem }, `Уголок не показан: ${problem}`));
  }
  if (!core || !snapshot) return null;

  const kit = kitFor(catalog, snapshot.pet.shown);
  const def = catalog.defs.get(kit.pet);
  const who = catalog.defs.get(snapshot.pet.shown) ?? def;
  const name = snapshot.name.display;
  const progress = snapshot.progress;
  const stage = progress?.stage ?? 0;
  const motion = snapshot.prefs.effectiveMotion;
  const running = snapshot.status !== 'destroyed';

  const say = (text) => setNote({ core, text });
  const run = (title, fn) => () => {
    if (!running) return;
    core.activity();
    const result = fn(core);
    if (result && !result.ok) say(`${title}: ${result.error.message}`);
    return result;
  };
  const openCorner = () => {
    if (!running) return;
    setNote(null);
    core.activity();
    const result = core.open('corner');
    if (!result.ok) say(result.error.message);
  };
  const close = () => {
    if (core.status !== 'destroyed') core.close();
  };

  // ---------- вход ----------
  const surface = snapshot.presence.surface === 'pet';
  const unseen = Boolean(progress?.unseen);
  const entryNode =
    entry && surface
      ? h(
          View,
          { style: [styles.entryBox, style] },
          h(
            Pressable,
            {
              ref: entryRef,
              testID: `${testID}-open`,
              onPress: openCorner,
              disabled: !running,
              accessibilityRole: 'button',
              accessibilityLabel: label ?? `${name} — уголок ${who.forms.gen}${unseen ? ', есть новая вещь' : ''}`,
              accessibilityHint: hint,
              accessibilityState: { disabled: !running, expanded: open },
              style: ({ pressed }) => [styles.entry, pressed && styles.pressed],
            },
            h(Text, { style: styles.entryText }, `Уголок ${who.forms.gen}${unseen ? ' · новое' : ''}`),
          ),
          note && note.core === core && !open ? h(Text, { testID: `${testID}-note`, style: styles.note, accessibilityRole: 'alert' }, note.text) : null,
        )
      : null;

  // ---------- окно ----------
  // Окно — всегда в дереве, видимость — по снимку: iOS доигрывает закрытие с прежним содержимым и сообщает onDismiss;
  // закрытое окно React Native не монтирует.
  const pad = insetsOf(insets);
  const edge = Boolean(insets);
  const width = body?.width ?? 0;
  const height = body?.height ?? 0;
  const wide = width >= 520 && width > height * 1.2;
  const sceneWidth = width > 0 && height > 0 ? Math.floor(wide ? Math.min(width * 0.5 - 24, (height - 24) * (SCENE[0] / SCENE[1])) : Math.min(width - 32, height * 0.45 * (SCENE[0] / SCENE[1]), 560)) : 0;
  const keyboard = keyboardTop !== null && frame ? Math.max(0, frame.height - keyboardTop) : 0;
  const bottom = Math.max(pad.bottom, keyboard) + 16;

  const fresh = news && news.core === core ? news.items : progress?.unseen ? progress.fresh : [];
  const freshAccessories = news && news.core === core ? news.accessories : progress?.unseen ? progress.freshAccessories : [];
  const itemName = (id) => who.items.list.find((item) => item.id === id)?.title ?? who.accessories.find((item) => item.id === id)?.title ?? who.room.toys.find((toy) => toy.id === id)?.title ?? id;
  const freshNames = [...fresh, ...freshAccessories].map(itemName);
  const newsText = `${news && news.core === core && news.celebrate ? `Новая ступень «${STAGES[news.stage]?.title ?? ''}»! ` : ''}${freshNames.length ? `Новое в уголке: ${freshNames.join(', ')}.` : ''}`.trim();

  const scene = sceneWidth > 0 ? h(Scene, { width: sceneWidth, def, kit, who, snapshot, stage, fresh, prefix, core, testID, name }) : null;
  const sections = [
    snapshot.prefs.phrases && snapshot.scenePhrase ? h(Text, { key: 'say', testID: `${testID}-phrase`, style: styles.phrase }, snapshot.scenePhrase) : null,
    newsText ? h(Text, { key: 'news', testID: `${testID}-news`, style: styles.news }, newsText) : null,
    note && note.core === core ? h(Text, { key: 'note', testID: `${testID}-note`, style: styles.note, accessibilityRole: 'alert' }, note.text) : null,
    h(TreatBox, { key: 'treat', snapshot, who, testID, treatRef, run, onFeed: () => (treatFocus.current = true) }),
    h(ProgressBox, { key: 'progress', snapshot, who, name, catalog, testID }),
    h(Group, { key: 'kind', title: 'Напарник', testID: `${testID}-kind`, note: 'Знаки и открытые вещи общие: смена напарника их не меняет и новых не даёт.' }, catalog.ids.map((id) => h(Choice, { key: id, testID: `${testID}-kind-${id}`, title: `${catalog.defs.get(id).title}: ${snapshot.pets[id]?.name.display ?? ''}`, checked: snapshot.pet.shown === id, disabled: !running, onPress: run('Напарник', (c) => c.setPet(id)) }))),
    h(Group, { key: 'coat', title: `Облик ${who.forms.gen}`, testID: `${testID}-coat` }, who.coats.map((coat) => h(Choice, { key: coat.id, testID: `${testID}-coat-${coat.id}`, title: coat.title, checked: snapshot.look.coat === coat.id, disabled: !running, onPress: run('Облик', (c) => c.setAppearance({ coat: coat.id })) }))),
    h(NameBox, {
      key: 'name',
      snapshot,
      who,
      core,
      testID,
      draft: draftOf(draft, core, snapshot),
      page: page && page.core === core && page.pet === snapshot.pet.shown ? page.value : namePageOf(who.names.presets, name),
      onPage: (value) => setPage({ core, pet: snapshot.pet.shown, value }),
      onDraft: (text) => setDraft({ core, pet: snapshot.pet.shown, text }),
      onPick: (value) => {
        setDraft(null);
        run('Имя', (c) => c.setName(value))();
      },
      onSave: () => {
        const now = core.getState();
        const text = draftOf(draft, core, now);
        setDraft(null);
        nameRef.current?.blur?.();
        run('Имя', (c) => c.setName(text ?? now.name.value))();
      },
      onFocus: () => {
        nameFocused.current = true;
        typing.current = core;
        core.setContext({ typing: true });
      },
      onBlur: release,
      onLayout: (event) => (nameY.current = event?.nativeEvent?.layout?.y ?? 0),
      nameRef,
      running,
    }),
    h(
      Group,
      { key: 'acc', title: 'Аксессуар', testID: `${testID}-acc` },
      who.accessories.map((item) => {
        const opened = progress?.accessories.includes(item.id) ?? false;
        const at = STAGES[item.stage];
        return h(Choice, { key: item.id, testID: `${testID}-acc-${item.id}`, title: opened ? item.title : `${item.title} — откроется на ступени «${at.title}»`, checked: snapshot.look.worn === item.id, disabled: !running || !opened, hint: opened ? undefined : `Нужно ${marksText(at.at)}`, onPress: run('Аксессуар', (c) => c.setAppearance({ accessory: item.id })) });
      }),
    ),
    h(
      Group,
      { key: 'motion', title: 'Движение', testID: `${testID}-motion`, note: snapshot.prefs.reducedMotion ? `В системе включено «уменьшить движение» — ${who.title.toLowerCase()} без анимации, состояния видны позами.` : '' },
      MOTIONS.map(([id, title]) => h(Choice, { key: id, testID: `${testID}-motion-${id}`, title, checked: snapshot.prefs.motion === id, disabled: !running, onPress: run('Движение', (c) => c.setPreferences({ motion: id })) })),
    ),
    h(
      View,
      { key: 'phrases', style: styles.group },
      h(Choice, { testID: `${testID}-phrases`, role: 'switch', title: 'Короткие реплики', checked: snapshot.prefs.phrases, disabled: !running, onPress: run('Реплики', (c) => c.setPreferences({ phrases: !snapshot.prefs.phrases })) }),
    ),
    h(Text, { key: 'save', testID: `${testID}-save`, style: styles.muted }, saveText(snapshot)),
  ];

  return h(
    Fragment,
    null,
    entryNode,
    h(
      Modal,
      {
        visible: open,
        animationType: motion === 'none' ? 'none' : motion === 'calm' ? 'fade' : 'slide',
        presentationStyle: 'fullScreen',
        supportedOrientations: ORIENTATIONS,
        statusBarTranslucent: edge,
        navigationBarTranslucent: edge,
        onRequestClose: close,
        onShow: () => focusOn(closeRef.current),
        onDismiss: focusBack,
        testID: `${testID}-modal`,
      },
      h(
        View,
        {
          testID: `${testID}-sheet`,
          style: [styles.sheet, { paddingTop: pad.top, paddingLeft: pad.left, paddingRight: pad.right }],
          onLayout: (event) => setFrame(event?.nativeEvent?.layout ?? null),
          accessibilityViewIsModal: true,
          onAccessibilityEscape: close,
        },
        h(
          View,
          { style: styles.head },
          h(
            View,
            { style: styles.titles },
            h(Text, { testID: `${testID}-title`, style: styles.title, accessibilityRole: 'header' }, name),
            h(Text, { testID: `${testID}-stage`, style: styles.sub }, `Ступень «${STAGES[stage]?.title ?? ''}»`),
          ),
          h(Pressable, { ref: closeRef, testID: `${testID}-close`, onPress: close, accessibilityRole: 'button', accessibilityLabel: 'Закрыть уголок', style: ({ pressed }) => [styles.close, pressed && styles.pressed] }, h(Text, { style: styles.closeText }, 'Закрыть')),
        ),
        h(
          View,
          { testID: `${testID}-body`, style: [styles.body, wide && styles.bodyWide], onLayout: (event) => setBody(event?.nativeEvent?.layout ?? null) },
          wide && scene ? h(View, { style: [styles.sceneSide, { paddingBottom: pad.bottom + 12 }] }, scene) : null,
          h(
            ScrollView,
            { ref: scrollRef, testID: `${testID}-scroll`, style: styles.scroll, contentContainerStyle: [styles.content, { paddingBottom: bottom }], keyboardShouldPersistTaps: 'handled' },
            !wide && scene ? h(View, { style: styles.sceneTop }, scene) : null,
            ...sections,
          ),
        ),
      ),
    ),
  );
}

// ---------- сцена ----------

function Scene({ width, def, kit, who, snapshot, stage, fresh, prefix, core, testID, name }) {
  const model = useMemo(() => roomModel(def), [def]);
  const k = width / SCENE[0];
  const height = Math.round(width * (SCENE[1] / SCENE[0]));
  const pos = snapshot.room.pos;
  const shared = sharedItems(def, stage);
  const toys = def.room.toys.filter((toy) => toy.stage <= stage).map((toy) => toy.id);
  const ownIds = [...new Set([...toys, ...def.items.list.filter((item) => item.stage <= stage && !shared.includes(item.id) && (kit.items ?? []).includes(item.id)).map((item) => item.id)])];
  const own = ownIds.filter((id) => (kit.items ?? []).includes(id)).map((id) => ({ id, element: kit.Item({ id, prefix: `${prefix}-${id}` }) }));
  const pose = snapshot.pose.shown.page;
  const treat = snapshot.treat ?? 'waiting';
  const box = petBox(model, def.size, stage, pos);
  const things = [...shared, ...ownIds].map((id) => who.items.list.find((item) => item.id === id)?.title ?? who.room.toys.find((toy) => toy.id === id)?.title ?? id);
  const layer = { position: 'absolute', left: 0, top: 0 };
  const parts = { model, stage, pos, shared, fresh, prefix: `${prefix}-room` };
  return h(
    View,
    { testID: `${testID}-scene`, style: { width, height }, accessible: true, accessibilityRole: 'image', accessibilityLabel: `${name} в уголке${things.length ? `: ${things.join(', ').toLowerCase()}` : ''}${treat !== 'waiting' ? ', миска' : ''}`, pointerEvents: 'none' },
    h(Svg, { testID: `${testID}-back`, style: layer, width, height, viewBox: `0 0 ${SCENE[0]} ${SCENE[1]}`, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }, roomBack(parts)),
    h(
      View,
      { testID: `${testID}-pet`, style: { position: 'absolute', left: box.x * k, top: box.y * k }, pointerEvents: 'none', accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' },
      h(PetFigure, { core, snapshot, kit, def, width: box.width * k, pose, prefix: `${prefix}-pet`, testID: `${testID}-pet`, room: { feed: snapshot.room.feedShift } }),
    ),
    h(Svg, { testID: `${testID}-front`, style: layer, width, height, viewBox: `0 0 ${SCENE[0]} ${SCENE[1]}`, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }, roomFront({ ...parts, bowl: { shown: treat !== 'waiting', full: pose === 'feed' }, own })),
  );
}

// ---------- части окна ----------

function saveText(snapshot) {
  const save = snapshot.save;
  if (snapshot.storage === 'failed') return 'Хранилище не загрузилось: изменения действуют до перезапуска приложения, сохранённое не перезаписывается.';
  if (SAVE_KEYS.some((key) => save[key].corrupt)) return 'Сохранённые настройки повреждены и не читаются: показаны обычные. Изменение настройки здесь их заменит.';
  if (SAVE_KEYS.some((key) => save[key].unsaved.length > 0)) return 'Не всё сохранилось на этом устройстве: изменения действуют до перезапуска приложения.';
  if (SAVE_KEYS.some((key) => save[key].pending.length > 0)) return 'Сохраняется…';
  return 'Настройки, облик, имена и лакомство сохранены на этом устройстве.';
}

function TreatBox({ snapshot, who, testID, treatRef, run, onFeed }) {
  const treat = snapshot.treat ?? 'waiting';
  const running = snapshot.status !== 'destroyed';
  const unsaved = snapshot.save.treat.unsaved.length > 0;
  const pending = snapshot.save.treat.pending.length > 0;
  const text =
    treat === 'fed'
      ? unsaved
        ? 'Сегодня уже угостили, но отметка не сохранилась на этом устройстве: после перезапуска — снова.'
        : `Сегодня уже угостили${pending ? ' — отметка сохраняется…' : '.'} Новое — завтра, после занятия.`
      : treat === 'ready'
        ? 'Занятие сегодня есть — можно угостить. Лакомство — одно в день.'
        : 'Одно занятие — и можно угостить.';
  const act =
    treat === 'ready'
      ? h(Choice, { testID: `${testID}-feed`, role: 'button', title: 'Покормить', disabled: !running, primary: true, hint: 'Лакомство дня', onPress: () => (onFeed(), run('Покормить', (c) => c.feed())()) })
      : h(Text, { ref: treatRef, testID: `${testID}-treat`, style: styles.treatState, accessible: true }, treat === 'fed' ? '✓ Угостили' : 'Лакомство: после занятия');
  return h(
    View,
    { style: styles.group },
    h(
      View,
      { style: styles.row },
      h(Choice, { testID: `${testID}-stroke`, role: 'button', title: 'Погладить', disabled: !running, onPress: run('Погладить', (c) => c.interact({ type: 'pet' })) }),
      who.actions.paw?.ask ? h(Choice, { testID: `${testID}-paw`, role: 'button', title: 'Дай лапу', disabled: !running, onPress: run('Дай лапу', (c) => c.interact({ type: 'paw' })) }) : null,
      act,
    ),
    h(Text, { testID: `${testID}-treat-note`, style: styles.muted }, text),
  );
}

function ProgressBox({ snapshot, who, name, catalog, testID }) {
  const p = snapshot.progress;
  const marks = p?.marks ?? 0;
  const stage = p?.stage ?? 0;
  const current = STAGES[stage];
  const next = p?.next ?? null;
  const span = next ? next.at - current.at : 1;
  const done = next ? Math.min(span, Math.max(0, marks - current.at)) : span;
  const gift = (index) => stageGift(who, index, name);
  const pets = catalog.ids.map((id) => catalog.defs.get(id).forms.gen).join(' и ');
  return h(
    View,
    { style: styles.group },
    h(Text, { style: styles.label, accessibilityRole: 'header' }, 'Совместная практика'),
    h(Text, { testID: `${testID}-marks`, style: styles.text }, `${marksText(marks)} практики · сегодня ${p?.today ?? 0}${p?.limit ? ` из ${p.limit}` : ''}`),
    next
      ? h(
          View,
          { testID: `${testID}-meter`, style: styles.meter, accessible: true, accessibilityRole: 'progressbar', accessibilityLabel: `До ступени «${next.title}»`, accessibilityValue: { min: 0, max: span, now: done } },
          h(View, { style: [styles.meterFill, { width: `${Math.round((done / span) * 100)}%` }] }),
        )
      : null,
    h(Text, { testID: `${testID}-next`, style: styles.text }, next ? `До ступени «${next.title}» — ещё ${marksText(p.toNext)}: ${gift(stage + 1).toLowerCase()}.` : 'Все ступени открыты. Дальше — просто практика вместе.'),
    ...STAGES.map((item, index) => h(Text, { key: item.title, testID: `${testID}-stage-${index}`, style: [styles.muted, index <= stage && styles.done] }, `${index <= stage ? '✓ ' : ''}${item.title} · ${item.at ? marksText(item.at) : 'с начала'} — ${gift(index)}`)),
    h(Text, { style: styles.muted }, `Знаки дают занятия в приложении. Оценки и пропуски знаков не отнимают: открытые вещи остаются. Лакомство дня открывает первое занятие за день; одно кормление в день — общее для ${pets}.`),
  );
}

function NameBox({ snapshot, who, testID, draft, page, onPage, onDraft, onPick, onSave, onFocus, onBlur, onLayout, nameRef, running }) {
  const presets = who.names.presets;
  const shown = snapshot.name.display;
  const chips = namePage(presets, page);
  const count = namePageCount(presets);
  return h(
    View,
    { style: styles.group, onLayout },
    h(Text, { style: styles.label, accessibilityRole: 'header', nativeID: `${testID}-name-label` }, `Имя ${who.forms.gen}`),
    snapshot.name.chosen
      ? null
      : h(
          View,
          { style: styles.group },
          h(Text, { testID: `${testID}-name-offer-text`, style: styles.text }, `Новое имя? Предлагаем «${who.names.offer}» — или оставим «${who.names.default}».`),
          h(
            View,
            { style: styles.row },
            h(Choice, { testID: `${testID}-name-offer`, role: 'button', title: who.names.offer, disabled: !running, onPress: () => onPick(who.names.offer) }),
            h(Choice, { testID: `${testID}-name-keep`, role: 'button', title: `Оставить «${who.names.default}»`, disabled: !running, onPress: () => onPick(who.names.default) }),
          ),
        ),
    h(
      View,
      { style: styles.row, accessibilityRole: 'radiogroup', accessibilityLabel: 'Готовые имена' },
      ...chips.map((item, index) => h(Choice, { key: item, testID: `${testID}-name-pick-${index}`, title: item, checked: shown === item, disabled: !running, onPress: () => onPick(item) })),
      count > 1 ? h(Choice, { testID: `${testID}-name-more`, role: 'button', title: 'Другие имена', disabled: !running, onPress: () => onPage((page + 1) % count) }) : null,
    ),
    h(
      View,
      { style: styles.row },
      h(TextInput, {
        ref: nameRef,
        testID: `${testID}-name-input`,
        style: styles.input,
        accessibilityLabel: `Своё имя ${who.forms.gen}`,
        accessibilityLabelledBy: `${testID}-name-label`,
        value: draft ?? snapshot.name.value,
        placeholder: who.names.default,
        maxLength: NAME_MAX,
        editable: running,
        autoCorrect: false,
        returnKeyType: 'done',
        onChangeText: onDraft,
        onFocus,
        onBlur,
        onSubmitEditing: onSave,
      }),
      h(Choice, { testID: `${testID}-name-save`, role: 'button', title: 'Сохранить имя', disabled: !running, onPress: onSave }),
    ),
    h(Text, { style: styles.muted }, `До ${NAME_MAX} знаков. Имена у каждого питомца свои; знаков имя не даёт.`),
  );
}

function Group({ title, testID, note = '', children }) {
  return h(
    View,
    { style: styles.group },
    h(Text, { style: styles.label, accessibilityRole: 'header' }, title),
    h(View, { testID, style: styles.row, accessibilityRole: 'radiogroup', accessibilityLabel: title }, children),
    note ? h(Text, { style: styles.muted }, note) : null,
  );
}

// Кнопка или выбор: роль (radio — выбор из группы, switch — переключатель, button), подпись, состояние, область ≥ 48 точек.
function Choice({ testID, title, onPress, checked, disabled = false, hint, role = 'radio', primary = false }) {
  const state = { disabled: Boolean(disabled) };
  if (role !== 'button') state.checked = Boolean(checked);
  return h(
    Pressable,
    {
      testID,
      onPress,
      disabled: Boolean(disabled),
      accessibilityRole: role,
      accessibilityLabel: title,
      accessibilityHint: hint,
      accessibilityState: state,
      style: ({ pressed }) => [styles.control, checked && styles.checked, primary && styles.primary, disabled && styles.disabled, pressed && styles.pressed],
    },
    h(Text, { style: [styles.controlText, (checked || primary) && styles.checkedText] }, role === 'switch' ? `${checked ? '✓ ' : ''}${title}` : title),
  );
}

const INK = '#1d2024';
const ACCENT = '#2f5249';
const styles = StyleSheet.create({
  entryBox: { alignItems: 'center', gap: 6 },
  entry: { minHeight: 48, minWidth: 48, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: ACCENT, backgroundColor: '#ffffff', justifyContent: 'center' },
  entryText: { fontSize: 16, color: ACCENT, fontWeight: '600', textAlign: 'center' },
  sheet: { flex: 1, backgroundColor: '#f6f2ea' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  titles: { flex: 1, flexShrink: 1, gap: 2 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: INK, flexShrink: 1 },
  sub: { fontSize: 15, lineHeight: 20, color: '#5b574f' },
  close: { minHeight: 48, minWidth: 48, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: ACCENT, justifyContent: 'center', backgroundColor: '#ffffff' },
  closeText: { fontSize: 16, color: ACCENT, fontWeight: '600' },
  body: { flex: 1 },
  bodyWide: { flexDirection: 'row' },
  sceneSide: { paddingHorizontal: 16, paddingTop: 8, alignItems: 'center' },
  sceneTop: { alignItems: 'center', paddingBottom: 8 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  phrase: { fontSize: 16, lineHeight: 22, color: INK, textAlign: 'center', fontStyle: 'italic' },
  news: { fontSize: 16, lineHeight: 22, color: ACCENT, fontWeight: '600', textAlign: 'center' },
  note: { fontSize: 15, lineHeight: 21, color: '#8a5a00' },
  problem: { fontSize: 16, lineHeight: 22, color: '#a1271b' },
  group: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  label: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: INK },
  text: { fontSize: 15, lineHeight: 21, color: INK },
  muted: { fontSize: 14, lineHeight: 20, color: '#5b574f' },
  done: { color: ACCENT },
  treatState: { minHeight: 48, paddingHorizontal: 6, textAlignVertical: 'center', fontSize: 16, lineHeight: 22, color: ACCENT, fontWeight: '600' },
  meter: { height: 10, borderRadius: 5, backgroundColor: '#e2dccf', overflow: 'hidden' },
  meterFill: { height: 10, backgroundColor: '#4f8a6e' },
  input: { flexGrow: 1, flexBasis: 180, minHeight: 48, borderWidth: 1, borderColor: '#8a8478', borderRadius: 8, paddingHorizontal: 12, fontSize: 17, color: INK, backgroundColor: '#ffffff' },
  control: { minHeight: 48, minWidth: 48, maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: ACCENT, justifyContent: 'center', backgroundColor: '#ffffff' },
  checked: { backgroundColor: ACCENT },
  primary: { backgroundColor: '#4f8a6e', borderColor: '#4f8a6e' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  controlText: { fontSize: 16, lineHeight: 22, color: ACCENT },
  checkedText: { color: '#ffffff', fontWeight: '600' },
});
