// Натив: PetCorner — уголок питомца (этап PL10.2.1; README, «Нативное отображение»; docs/ARCHITECTURE.md § 12.2) внутри
// PetProvider. Вход (кнопка «Уголок …» рядом с питомцем) — core.open('corner'); окно уголка (Modal React Native) открыто
// ровно тогда, когда в снимке view.open === 'corner' (кнопка, прямая команда ядра, восстановление — одним путём); закрытие —
// core.close(): кнопка «Закрыть», Android «Назад» (onRequestClose окна — только пока оно открыто), жест VoiceOver «назад»
// (onAccessibilityEscape); фокус возвращается ко входу (или returnFocus хоста). Своего флага открытого вида нет.
//
// Внутри — только снимок и эффекты ядра: комната 400×250 (общий уголок room.mjs, вещи ступени по определению, свои вещи —
// Item набора, места — room.pos, сдвиг к миске — room.feedShift) и питомец по size определения (pose.shown.page); имя
// (клавиатура и готовые — names определения), выбор питомца, облик, аксессуары (открытые — progress.accessories),
// движение и реплики, «Погладить», «Дай лапу» (actions.paw.ask), кормление (treat снимка, решение — feed() ядра), счёт,
// ступени и подарки (progress, STAGES ядра), праздник и «Новое в уголке» (эффекты celebrate и seen показанного питомца,
// пока уголок на виду; иначе progress.unseen), состояние записи (save). Правил нет: команды проходят проверки ядра, отказ
// показывается его текстом. «Поиграть» (PL10.2.2) — кнопка у сцены, только когда вид 'play' объявлен ядру (подключена
// годная поверхность PetPlay): core.open('play'); возврат из игры — фокус на неё. Присутствие (PL10.2.2): «Всегда рядом» /
// «Приходит по зову» — core.setPresence, «Скрыть …» — core.hide() (окно закрывает ядро), спрятан — вместо входа
// «Показать …» — core.show() (по зову — снова вызов, игра сама не открывается). «Обустроить уголок» — PL10.2.3: кнопки нет.
// Сценок нет (scenes: {} у координатора). Окно — по очереди с окном игры (useWindow координатора: iOS не покажет новое
// модальное окно, пока прежнее уходит).
//
// Привязка окна — пара «ядро и показанный питомец» (доработка PL10.2.1): черновик имени, страница готовых имён, отказ и
// «Новое в уголке» принадлежат ей; смена питомца (по любому обновлению ядра) или ядра их снимает — возврат к прежней паре
// их не возвращает. Обработчик прежней привязки (замыкание прежней отрисовки) ничего не пишет и не применяет; смена ядра
// снимает тишину ввода прежнего и фокус поля.
//
// Раскладка — по onLayout окна и отступам хоста insets (безопасные области; без них — системные отступы окна): портрет —
// сцена сверху в прокрутке, широкий экран — сцена слева, настройки справа; клавиатура не закрывает поле имени (отступ по
// её рамке, прокрутка к полю). Движение окна и питомца — по prefs.effectiveMotion. Объявления скринридеру — у координатора.

import { createElement as h, Fragment, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg from 'react-native-svg';
import { NAME_MAX, namePage, namePageCount, namePageOf } from '../core/pets.mjs';
import { systemLog } from '../core/ports.mjs';
import { roomModel } from '../core/room.mjs';
import { marksText, STAGES, stageGift } from '../core/stages.mjs';
import { usePetState } from '../hooks/state.mjs';
import { PetFigure } from './figure.mjs';
import { cornerProblem, kitFor } from './kits.mjs';
import { usePetContext, useWindow } from './provider.mjs';
import { petBox, roomBack, roomFront, sharedItems, SCENE } from './room.mjs';

const MOTIONS = [
  ['normal', 'Обычное'],
  ['calm', 'Спокойное'],
  ['none', 'Без анимации'],
];
// Присутствие (ключ presence ядра): подписи и пояснения — как у веба (pet-place.mjs, PRESENCES).
const PRESENCES = Object.freeze([
  Object.freeze({ id: 'always', title: 'Всегда рядом', note: 'Питомец остаётся на экране.' }),
  Object.freeze({ id: 'on-call', title: 'Приходит по зову', note: 'Без питомца на экране. Позови кнопкой, когда захочешь.' }),
]);
const SAVE_KEYS = ['cat', 'companion', 'look', 'treat', 'ext', 'presence'];
const ORIENTATIONS = ['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right'];

// Черновик имени: { core, pet, text } — виден и применяется только для того же ядра и показанного питомца (смена пары его
// снимает — см. подписку в PetCorner; фильтр — защита до обновления состояния).
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
const quiet = (what, fn) => {
  try {
    return fn();
  } catch (error) {
    systemLog.warn(`PetCorner: ${what}`, error);
    return null;
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
  // Окно — по очереди с окном игры того же ядра (iOS: новое модальное окно — после ухода прежнего).
  const slot = useWindow(core, open);

  // Принадлежат привязке окна — паре «ядро и показанный питомец»: «Новое в уголке» { core, pet, … }, черновик имени
  // { core, pet, text }, страница готовых имён { core, pet, value }, отказ { core, text }.
  const [news, setNews] = useState(null);
  const [draft, setDraft] = useState(null);
  const [page, setPage] = useState(null);
  const [note, setNote] = useState(null);
  const [frame, setFrame] = useState(null);
  const [body, setBody] = useState(null);
  const [keyboardTop, setKeyboardTop] = useState(null);
  const entryRef = useRef(null);
  const closeRef = useRef(null);
  const playRef = useRef(null);
  // Вид до открытия уголка: из «Поиграть» — фокус на «Поиграть», иначе на «Закрыть».
  const from = useRef(null);
  const seen = useRef(null);
  const treatRef = useRef(null);
  const nameRef = useRef(null);
  const scrollRef = useRef(null);
  const nameY = useRef(0);
  const rowY = useRef(0);
  const typing = useRef(null);
  const nameFocused = useRef(false);
  const treatFocus = useRef(false);
  // Режим движения последней отрисовки — для прокрутки из слушателя клавиатуры (без движения — без анимации).
  const still = useRef(true);
  still.current = (snapshot?.prefs.effectiveMotion ?? 'none') === 'none';

  useEffect(() => {
    if (problem && shared?.core) systemLog.warn(`PetCorner: ${problem}`);
  }, [problem, shared?.core]);

  // Поверхность уголка — у координатора, пока она годна: вид 'corner' объявлен ядру ровно на это время.
  useEffect(() => (register && !problem ? register('corner') : undefined), [register, problem]);

  // Ядро последней фиксации — для проверки обработчиков (замыканий отрисовки) в момент вызова.
  const bound = useRef(null);
  useLayoutEffect(() => {
    bound.current = core;
    return () => {
      bound.current = null;
    };
  }, [core]);

  // Смена привязки снимает её состояние, а не прячет: другое ядро — при подписке, другой показанный питомец — по любому
  // обновлению ядра (не только по отрисовке: смена туда и обратно в одном такте тоже снимает); возврат к прежней паре его
  // не возвращает. Праздник и «Новое в уголке» — эффекты ядра, пришедшие, пока уголок на виду, — принадлежат питомцу,
  // показанному в этом обновлении (одно на ступень, вещи — объединением; вещи — его определения).
  useEffect(() => {
    const forget = () => {
      setNews(null);
      setDraft(null);
      setPage(null);
      setNote(null);
    };
    forget();
    if (!core) return undefined;
    let pet = quiet('снимок не прочитан', () => core.getState().pet.shown);
    return core.subscribe(
      ({ snapshot: s, effects }) => {
        if (s.pet?.shown !== pet) {
          pet = s.pet?.shown ?? null;
          forget();
        }
        if (s.view.open !== 'corner') return;
        for (const effect of effects) {
          if (effect.type !== 'celebrate' && effect.type !== 'seen') continue;
          setNews((was) => {
            const same = was && was.core === core && was.pet === pet && was.stage === effect.stage;
            return {
              core,
              pet,
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

  // Тишина ввода снимается, когда поле больше не в работе: закрытие уголка, смена ядра, размонтирование. Смена ядра при
  // открытом уголке ещё и снимает фокус поля: ввод для нового ядра начинается заново (его фокус — его тишина).
  const release = useCallback(() => {
    const was = typing.current;
    typing.current = null;
    nameFocused.current = false;
    if (was && was.status !== 'destroyed') was.setContext({ typing: false });
  }, []);
  useEffect(
    () => () => {
      release();
      quiet('фокус поля не снят', () => nameRef.current?.blur?.());
    },
    [core, release],
  );

  // Откуда открыт уголок: прежний вид снимка (возврат из «Поиграть» — фокус на «Поиграть»).
  const viewNow = snapshot?.view.open ?? null;
  useLayoutEffect(() => {
    if (seen.current !== viewNow) {
      from.current = seen.current;
      seen.current = viewNow;
    }
  }, [viewNow]);

  // Возврат фокуса ко входу (или к returnFocus хоста) после закрытия окна — только когда закрыто всё (переход в «Поиграть»
  // — не закрытие: фокус там у игры).
  // Входа уголка нет («по зову»: вызов открыл игру, «Уголок» — уголок) — фокус на вход вызова.
  const callFocus = shared?.focusEntry ?? null;
  const entryFocus = useCallback(() => {
    const target = returnFocus?.current ?? entryRef.current;
    if (target) focusOn(target);
    else callFocus?.('call');
  }, [returnFocus, callFocus]);
  const focusBack = useCallback(() => {
    const now = quiet('снимок не прочитан', () => (core && core.status !== 'destroyed' ? core.getState().view.open : null));
    if (now === null) entryFocus();
  }, [core, entryFocus]);
  // Вход уголка — координатору: «Поиграть», открытая из уголка и закрытая целиком, возвращает фокус сюда.
  const entryOf = shared?.entry ?? null;
  useEffect(() => (entryOf && !problem ? entryOf('corner', entryFocus) : undefined), [entryOf, problem, entryFocus]);
  useEffect(() => {
    if (open) return;
    setNews(null);
    setDraft(null);
    setNote(null);
    setKeyboardTop(null);
    release();
  }, [open, release]);
  // Фокус возвращает поверхность, которая держит окно (показано или ещё уходит), когда вид становится «ничего не
  // открыто»: переход в «Поиграть» — не закрытие (фокус там у игры), окно, так и не показанное (ждало ухода окна игры), —
  // не возвращает (иначе игра и уголок возвращали бы его оба). iOS — по onDismiss окна, Android — следующим оборотом после
  // снятия окна (таймер снимает только размонтирование).
  const backTimer = useRef(null);
  const focusPending = useRef(false);
  const lastView = useRef(viewNow);
  useEffect(() => () => clearTimeout(backTimer.current), []);
  useEffect(() => {
    const was = lastView.current;
    lastView.current = viewNow;
    if (viewNow !== null) {
      focusPending.current = false;
      return;
    }
    if (was === null || !slot.holding) return;
    focusPending.current = true;
    if (Platform.OS === 'ios') return;
    clearTimeout(backTimer.current);
    backTimer.current = setTimeout(() => {
      if (!focusPending.current) return;
      focusPending.current = false;
      focusBack();
    }, 0);
    // Решает отрисовка, в которой вид стал «ничего не открыто» (slot.holding — её).
  }, [viewNow]);
  const dismissed = () => {
    if (!focusPending.current) return;
    focusPending.current = false;
    focusBack();
  };

  // Клавиатура, пока окно открыто: её верх — для отступа под полем имени; поле в фокусе и клавиатура показана — прокрутка к
  // строке поля (поле и «Сохранить имя»), а не к заголовку блока: над клавиатурой в альбомной ориентации остаётся меньше
  // высоты блока имени. Оба порядка событий: на iOS keyboardWillShow приходит раньше onFocus поля (найдено в iOS
  // Simulator, PL10.2.1), на Android keyboardDidShow — после.
  const keyboardShown = useRef(false);
  const toName = useCallback(() => {
    if (nameFocused.current && keyboardShown.current) scrollRef.current?.scrollTo?.({ y: Math.max(0, nameY.current + rowY.current - 12), animated: !still.current });
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const ios = Platform.OS === 'ios';
    const shown = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      const top = event?.endCoordinates?.screenY;
      keyboardShown.current = true;
      setKeyboardTop(Number.isFinite(top) ? top : null);
      toName();
    });
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      keyboardShown.current = false;
      setKeyboardTop(null);
    });
    return () => {
      keyboardShown.current = false;
      shown.remove();
      hidden.remove();
    };
  }, [open, toName]);

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
  const shown = snapshot.pet.shown;

  // Обработчики этой отрисовки годны, пока её привязка текущая: то же ядро (последней фиксации) и — для действий с
  // питомцем — тот же показанный питомец (по ядру в момент вызова). Устаревший обработчик (замыкание прежней отрисовки
  // после смены питомца или ядра) ничего не пишет и не применяет: ни черновика, ни имени, ни команды другому питомцу или
  // ядру.
  const ours = () => bound.current === core && core.status !== 'destroyed';
  const mine = () => ours() && core.getState().pet.shown === shown;
  const say = (text) => setNote({ core, text });
  const run = (title, fn) => () => {
    if (!mine()) return;
    core.activity();
    const result = fn(core);
    if (result && !result.ok) say(`${title}: ${result.error.message}`);
    return result;
  };
  const openCorner = () => {
    if (!ours()) return;
    setNote(null);
    core.activity();
    const result = core.open('corner');
    if (!result.ok) say(result.error.message);
  };
  const close = () => {
    if (ours()) core.close();
  };
  // «Поиграть» — тот же вид ядра: окно уголка уходит, окно игры показывает её поверхность.
  const toPlay = () => {
    if (!ours()) return;
    setNote(null);
    core.activity();
    const result = core.open('play');
    if (!result.ok) say(`Поиграть: ${result.error.message}`);
  };
  const tell = (text) => quiet('объявление не передано', () => AccessibilityInfo.announceForAccessibility?.(text));
  // «Скрыть»: окно закрывает ядро, фокус — на «Показать …» (вход на месте прежнего).
  const hide = () => {
    if (!mine()) return;
    const result = core.hide();
    if (!result.ok) return say(`Скрыть: ${result.error.message}`);
    tell(`${name} спрятан. Вернуть — «Показать ${who.forms.acc}».`);
  };
  // «Показать»: поверхность по присутствию — питомец рядом (вход уголка) или вызов «по зову» (вход игры); игра сама не
  // открывается. Фокус — на новый вход после отрисовки.
  const show = () => {
    if (!ours()) return;
    const result = core.show();
    if (!result.ok) return say(`Показать: ${result.error.message}`);
    const call = core.getState().presence.surface === 'call';
    tell(call ? `Позвать ${who.forms.acc} — снова на месте.` : `${name} снова рядом.`);
    setTimeout(() => (call ? shared.focusEntry('call') : focusOn(entryRef.current)), 0);
  };

  // ---------- вход ----------
  const surface = snapshot.presence.surface === 'pet';
  const hidden = snapshot.presence.surface === 'none';
  const unseen = Boolean(progress?.unseen);
  const showNode =
    entry && hidden && running
      ? h(
          View,
          { style: [styles.entryBox, style] },
          h(
            Pressable,
            {
              ref: entryRef,
              testID: `${testID}-show`,
              onPress: show,
              accessibilityRole: 'button',
              accessibilityLabel: `Показать ${who.forms.acc}`,
              accessibilityHint: snapshot.presence.mode === 'on-call' ? 'Вернуть вызов «по зову»' : 'Вернуть питомца на экран',
              style: ({ pressed }) => [styles.entry, pressed && styles.pressed],
            },
            h(Text, { style: styles.entryText }, `Показать ${who.forms.acc}`),
          ),
          note && note.core === core ? h(Text, { testID: `${testID}-note`, style: styles.note, accessibilityRole: 'alert' }, note.text) : null,
        )
      : null;
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

  // Новости — только показанного питомца (его вещи по его определению); неизвестный ему ID не выводится.
  const told = news && news.core === core && news.pet === shown ? news : null;
  const fresh = told ? told.items : progress?.unseen ? progress.fresh : [];
  const freshAccessories = told ? told.accessories : progress?.unseen ? progress.freshAccessories : [];
  const itemName = (id) => who.items.list.find((item) => item.id === id)?.title ?? who.accessories.find((item) => item.id === id)?.title ?? who.room.toys.find((toy) => toy.id === id)?.title ?? null;
  const freshNames = [...fresh, ...freshAccessories].map(itemName).filter(Boolean);
  const newsText = `${told?.celebrate ? `Новая ступень «${STAGES[told.stage]?.title ?? ''}»! ` : ''}${freshNames.length ? `Новое в уголке: ${freshNames.join(', ')}.` : ''}`.trim();

  const scene = sceneWidth > 0 ? h(Scene, { width: sceneWidth, def, kit, who, snapshot, stage, fresh, prefix, core, testID, name }) : null;
  // «Поиграть» — только когда вид объявлен (подключена годная поверхность игры): неработающей кнопки нет.
  const playable = snapshot.display.views.includes('play');
  const playNode = playable
    ? h(Choice, { key: 'play', ref: playRef, testID: `${testID}-play`, role: 'button', title: 'Поиграть', primary: true, disabled: !running, hint: 'Погладить, лапа, миска и мячик', onPress: toPlay })
    : null;
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
      page: page && page.core === core && page.pet === shown ? page.value : namePageOf(who.names.presets, name),
      onPage: (value) => mine() && setPage({ core, pet: shown, value }),
      onDraft: (text) => mine() && setDraft({ core, pet: shown, text }),
      onPick: (value) => {
        if (!mine()) return;
        setDraft(null);
        run('Имя', (c) => c.setName(value))();
      },
      onSave: () => {
        if (!mine()) return;
        const now = core.getState();
        const text = draftOf(draft, core, now);
        setDraft(null);
        nameRef.current?.blur?.();
        run('Имя', (c) => c.setName(text ?? now.name.value))();
      },
      // Тишина ввода — у ядра, а не у питомца: фокус после смены питомца того же ядра остаётся в работе.
      onFocus: () => {
        if (!ours()) return;
        nameFocused.current = true;
        typing.current = core;
        core.setContext({ typing: true });
        toName();
      },
      onBlur: release,
      onLayout: (event) => (nameY.current = event?.nativeEvent?.layout?.y ?? 0),
      onRow: (event) => (rowY.current = event?.nativeEvent?.layout?.y ?? 0),
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
      Group,
      { key: 'presence', title: 'Присутствие', testID: `${testID}-presence`, note: PRESENCES.find((item) => item.id === snapshot.presence.mode)?.note ?? '' },
      PRESENCES.map((item) => h(Choice, { key: item.id, testID: `${testID}-presence-${item.id}`, title: item.title, checked: snapshot.presence.mode === item.id, disabled: !running, onPress: run('Присутствие', (c) => c.setPresence(item.id)) })),
    ),
    h(
      View,
      { key: 'phrases', style: styles.group },
      h(Choice, { testID: `${testID}-phrases`, role: 'switch', title: 'Короткие реплики', checked: snapshot.prefs.phrases, disabled: !running, onPress: run('Реплики', (c) => c.setPreferences({ phrases: !snapshot.prefs.phrases })) }),
      h(Choice, { testID: `${testID}-hide`, role: 'button', title: `Скрыть ${who.forms.acc}`, disabled: !running, hint: 'Убрать с экрана; вернуть — «Показать»', onPress: hide }),
    ),
    h(Text, { key: 'save', testID: `${testID}-save`, style: styles.muted }, saveText(snapshot)),
  ];

  return h(
    Fragment,
    null,
    entryNode,
    showNode,
    h(
      Modal,
      {
        visible: slot.visible,
        animationType: motion === 'none' ? 'none' : motion === 'calm' ? 'fade' : 'slide',
        // iOS: окно поверх экрана хоста, а не вместо него — экран хоста остаётся в иерархии и при повороте пересчитывает свои
        // отступы (insets хоста обновляются и для открытого уголка). При fullScreen они оставались портретными (найдено в
        // iOS Simulator, PL10.2.1).
        presentationStyle: 'overFullScreen',
        supportedOrientations: ORIENTATIONS,
        statusBarTranslucent: edge,
        navigationBarTranslucent: edge,
        onRequestClose: close,
        onShow: () => focusOn((from.current === 'play' ? playRef.current : null) ?? closeRef.current),
        onDismiss: () => {
          slot.dismissed();
          dismissed();
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
          onAccessibilityEscape: close,
        },
        // Закреплена только кнопка «Закрыть»: заголовок с именем прокручивается вместе с уголком — длинное имя и крупный
        // системный текст не вытесняют сцену и настройки (найдено в iOS Simulator, PL10.2.1: шапка занимала весь экран).
        h(
          View,
          { style: styles.bar },
          h(Pressable, { ref: closeRef, testID: `${testID}-close`, onPress: close, accessibilityRole: 'button', accessibilityLabel: 'Закрыть уголок', style: ({ pressed }) => [styles.close, pressed && styles.pressed] }, h(Text, { style: styles.closeText }, 'Закрыть')),
        ),
        h(
          View,
          { testID: `${testID}-body`, style: [styles.body, wide && styles.bodyWide], onLayout: (event) => setBody(event?.nativeEvent?.layout ?? null) },
          wide && scene ? h(View, { style: [styles.sceneSide, { paddingBottom: pad.bottom + 12 }] }, scene, playNode) : null,
          h(
            ScrollView,
            { ref: scrollRef, testID: `${testID}-scroll`, style: styles.scroll, contentContainerStyle: [styles.content, { paddingBottom: bottom }], keyboardShouldPersistTaps: 'handled' },
            h(
              View,
              { style: styles.titles },
              h(Text, { testID: `${testID}-title`, style: styles.title, accessibilityRole: 'header' }, name),
              h(Text, { testID: `${testID}-stage`, style: styles.sub }, `Ступень «${STAGES[stage]?.title ?? ''}»`),
            ),
            !wide && scene ? h(View, { style: styles.sceneTop }, scene) : null,
            wide && scene ? null : playNode,
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

function NameBox({ snapshot, who, testID, draft, page, onPage, onDraft, onPick, onSave, onFocus, onBlur, onLayout, onRow, nameRef, running }) {
  const presets = who.names.presets;
  const shown = snapshot.name.display;
  const chips = namePage(presets, page);
  const count = namePageCount(presets);
  return h(
    View,
    { testID: `${testID}-name`, style: styles.group, onLayout },
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
      { testID: `${testID}-name-row`, style: styles.row, onLayout: onRow },
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
function Choice({ ref, testID, title, onPress, checked, disabled = false, hint, role = 'radio', primary = false }) {
  const state = { disabled: Boolean(disabled) };
  if (role !== 'button') state.checked = Boolean(checked);
  return h(
    Pressable,
    {
      ref,
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
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  titles: { gap: 2 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: INK, flexShrink: 1 },
  sub: { fontSize: 15, lineHeight: 20, color: '#5b574f' },
  close: { minHeight: 48, minWidth: 48, maxWidth: '100%', paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: ACCENT, justifyContent: 'center', backgroundColor: '#ffffff' },
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
