// Мобильный потребитель (PL10.1, PL10.2.1, PL10.2.2): питомец на экране — PetView и штатные наборы pet-companion/native
// (рисунки react-native-svg, без WebView) внутри координатора PetProvider (один владелец объявления отображения ядра),
// уголок PetCorner (окно по view снимка: вход, «Закрыть», Android «Назад»; комната, вещи ступени, имя, облик, аксессуары,
// движение, реплики, кормление, счёт и ступени, «Поиграть», присутствие, «Скрыть») и «Поиграть» PetPlay (поглаживание,
// лапа, миска и мячик пальцем и кнопками; вызов «по зову»); отступы безопасной области — useSafeAreaInsets
// (react-native-safe-area-context, входит в Expo Go SDK 58). Прямые команды хоста PL10.2.2 — присутствие, «Скрыть» /
// «Показать», открыть, позвать и закрыть игру — те же публичные команды ядра. Ниже — прежние кнопки PL10.1 (выбор кота или собаки, имя с клавиатуры, облик и
// платок, движение, «Погладить», «Покормить», подтверждённое занятие хоста, отключение и повторное подключение) и
// диагностика PL09: хранение (настоящий expo-sqlite), жизненный цикл (useNativeLifecycle — единственный владелец), «Новое
// ядро», резервирование дня, занятый файл, журнал. Все решения — ядро: подписи и доступность кнопок — по снимку, команда
// всё равно проходит его проверку. Сценарии и что записать — README.md рядом.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { catNative, dogNative, PetCorner, PetPlay, PetProvider, PetView, useNativeLifecycle, usePetState } from 'pet-companion/native';
import { busyProbe, compare, confirmed, NAMES, newCore, openStore, PETS, remember, reserveProbe, restartCheck } from './diagnostics.mjs';

const KITS = [catNative, dogNative];
const MOTION_TITLES = [
  ['normal', 'Обычное'],
  ['calm', 'Спокойное'],
  ['none', 'Без анимации'],
];
const SAVE = { none: 'без изменений', pending: 'сохраняется…', saved: 'сохранено', failed: 'не сохранилось', partial: 'сохранено частично' };
const TREAT = { waiting: 'Покормить (сначала занятие)', ready: 'Покормить', fed: 'Покормить (сегодня уже угостили)' };

const time = () => new Date().toTimeString().slice(0, 8);
const next = (list, value) => list[(list.indexOf(value) + 1) % list.length];
// В разработке (Expo Go, __DEV__) журнал, проверки и смены строк состояния дублируются в консоль — Expo CLI печатает их в
// терминале Metro: доказательство запуска на устройстве вместе со снимками экрана. В Node-проверке __DEV__ нет.
const trace = (text) => globalThis.__DEV__ && console.log(`[PET] ${text}`);
const mark = (value) => (value.ok === true ? '✓' : value.ok === false ? '✗' : '·');
// Черновик имени принадлежит паре «ядро и показанный питомец» (draft — { core, pet, text }): для другой пары его нет. Смена
// питомца (кнопкой, прямой командой ядра, записью из хранилища) или ядра (отключение, подключение, «Новое ядро», следующий
// день) его не переносит — поле показывает сохранённое имя, «Сохранить имя» чужой черновик не применит.
const draftOf = (draft, core, state) => (draft && core && state && draft.core === core && draft.pet === state.pet.shown ? draft.text : null);

// Владение ядром: у подключённого экрана — запись own { live, core, turn, before }: текущее ядро, номер последнего создания
// и подтверждённое на момент отключения. Созданное ядро принимается, только если экран ещё подключён и создание — последнее;
// иначе (размонтирован, опередило более новое) уничтожается сразу — ядра без владельца не остаётся.
function adopt(own, turn, core) {
  if (own.live && own.turn === turn) {
    own.core = core;
    return true;
  }
  core.destroy();
  return false;
}

// Корень: SafeAreaProvider измеряет системные отступы окна (вырез, строка состояния, полоса жестов, нижний индикатор) —
// экран и уголок получают их настоящими значениями, а не константами.
export default function App() {
  return (
    <SafeAreaProvider>
      <Screen />
    </SafeAreaProvider>
  );
}

function Screen() {
  const insets = useSafeAreaInsets();
  const [store, setStore] = useState(null);
  const [core, setCore] = useState(null);
  const [lines, setLines] = useState([]);
  const [checks, setChecks] = useState({});
  const [note, setNote] = useState('');
  // Несохранённый ввод имени: { core, pet, text } — см. draftOf.
  const [draft, setDraft] = useState(null);
  // Запись владения подключённого экрана (null — экран не подключён): после размонтирования экран своё состояние не меняет.
  const owner = useRef(null);
  // Что сверить после ближайшего start: первый запуск процесса (restart) или переподключение ({ reason, before }).
  const follow = useRef(null);
  const lastKey = useRef('');
  // Поле имени: сохранение снимает с него фокус — вместе с ним снимается и тишина ввода (setContext typing).
  const nameField = useRef(null);
  const seq = useRef(0);
  const say = useCallback((text) => {
    if (!owner.current) return;
    const line = `${time()} ${text}`;
    trace(line);
    setLines((list) => [line, ...list].slice(0, 80));
  }, []);
  const check = useCallback((name, value) => {
    if (!owner.current) return;
    trace(`проверка «${name}»: ${mark(value)} ${value.text}`);
    setChecks((all) => ({ ...all, [name]: value }));
  }, []);
  // Итог для человека: строка состояния; важное (отказы, итог занятия хоста) — ещё и скринридеру, один раз. Объявления
  // самого питомца (лакомство, готовое имя) делает координатор PetProvider по эффектам ядра — здесь они не повторяются.
  const tell = useCallback((text, important = false) => {
    if (!owner.current) return;
    setNote(text);
    trace(`итог: ${text}`);
    if (important) AccessibilityInfo.announceForAccessibility?.(text);
  }, []);
  // Сверка после start по дню хоста (want.host — его часы; лакомство сверяется только в тот же день): перезапуск — сразу
  // по загруженному; переподключение — по первому снимку, где записи ключей питомца подтверждены (start сам пишет день
  // приветствия — до его подтверждения сверять рано).
  const settle = useCallback(
    (state) => {
      const want = follow.current;
      if (!want || !state || state.status !== 'running') return;
      const day = want.host.today();
      if (want.reason === 'restart') {
        follow.current = null;
        const result = restartCheck(want.expected, state, day);
        check('Перезапуск с тем же файлом', result);
        say(`перезапуск: ${result.text}`);
        return;
      }
      const now = confirmed(state, day);
      if (!now) return;
      follow.current = null;
      const result = want.before ? compare(want.before, now, day) : { ok: true, text: `${now.pet} / ${now.name} / ${now.motion} / ${now.coat} / ${now.accessory} / ${now.treat}` };
      check(want.reason === 'Новое ядро' ? 'destroy → load → новое ядро' : `${want.reason}: восстановлено`, result);
    },
    [check, say],
  );
  const ready = useNativeLifecycle(core);
  const pet = usePetState(core);

  // Запуск: база примера, барьер загрузки, ядро. Размонтирование уничтожает текущее ядро (и первое, и созданное позже);
  // ядро, созданное после него, уничтожает adopt.
  useEffect(() => {
    const own = { live: true, core: null, turn: 1, before: null };
    owner.current = own;
    (async () => {
      const opened = await openStore();
      const { core: first, status } = await newCore(opened);
      if (!adopt(own, 1, first)) return;
      follow.current = { reason: 'restart', expected: opened.expected, host: opened.host };
      setStore(opened);
      setCore(first);
      say(`хранилище: ${status}; день хоста ${opened.host?.today?.() ?? '—'}`);
    })().catch((error) => own.live && say(`ошибка запуска: ${error?.message ?? error}`));
    return () => {
      own.live = false;
      if (owner.current === own) owner.current = null;
      own.core?.destroy();
      own.core = null;
    };
  }, [say]);

  // Ядро запускается после начальной синхронизации видимости и «уменьшить движение»; затем — сверка восстановленного.
  useEffect(() => {
    if (!core || !ready || core.status !== 'created') return;
    core.start();
    say('start после useNativeLifecycle → ready');
    settle(core.getState());
  }, [core, ready, say, settle]);

  // Журнал переходов: сохранение, видимость, реакция и нарисованная поза; с PL10.2.2 — вид и источник, присутствие, игра
  // (жест поглаживания, перенос предмета, итог, поза сцены, места предметов, пол); запоминание подтверждённого для сверки
  // после перезапуска.
  useEffect(() => {
    if (!core || !store) return undefined;
    const pick = (s) => ({
      cat: s?.save.cat.status,
      visible: s?.visible,
      reaction: s?.pose.reaction?.type ?? '—',
      page: s?.pose.shown.page,
      view: s ? `${s.view.open ?? '—'}${s.view.source ? `/${s.view.source}` : ''}` : '—',
      views: s?.display.views.join(','),
      presence: s ? `${s.presence.mode}/${s.presence.surface}${s.presence.hidden ? '/скрыт' : ''}` : '—',
      stroke: s?.play?.stroke ? `${s.play.stroke.id}${s.play.stroke.held ? '+удержание' : ''}` : '—',
      drag: s?.play?.drag ? s.play.drag.toy : '—',
      outcome: s?.play?.outcome || '—',
      playPose: s?.play ? s.pose.shown.play : '—',
      toys: s?.play ? `миска ${s.play.toys.bowl.at?.map(Math.round).join(',') ?? '—'}${s.play.toys.bowl.home ? ' (дом)' : ''}, мячик ${s.play.toys.ball.at?.map(Math.round).join(',') ?? '—'}` : '—',
      // Пол — с тремя знаками: по нему проверка на устройстве переводит единицы рисунка в точки сцены (масштаб 22 / playTouch).
      floor: s?.display.playFloor ? `${s.display.playFloor.join(',')} / ${s.display.playTouch}` : '—',
    });
    let last = pick(core.getState());
    return core.subscribe(
      (update) => {
        const s = update.snapshot;
        const now = pick(s);
        if (now.view !== last.view) say(`вид: ${last.view} → ${now.view} (${update.reason})`);
        if (now.views !== last.views) say(`объявлены виды: [${last.views ?? ''}] → [${now.views}]`);
        if (now.presence !== last.presence) say(`присутствие: ${last.presence} → ${now.presence}`);
        if (now.floor !== last.floor) say(`пол игры: ${last.floor} → ${now.floor}`);
        if (now.cat !== last.cat) say(`cat: ${last.cat} → ${now.cat}`);
        if (now.visible !== last.visible) say(`ядро visible: ${last.visible} → ${now.visible}`);
        if (now.reaction !== last.reaction) say(`реакция: ${last.reaction} → ${now.reaction}`);
        if (now.page !== last.page) say(`поза: ${last.page} → ${now.page}`);
        if (now.stroke !== last.stroke) say(`игра: жест ${last.stroke} → ${now.stroke} (${update.reason})`);
        if (now.drag !== last.drag) say(`игра: перенос ${last.drag} → ${now.drag} (${update.reason})`);
        if (now.outcome !== last.outcome) say(`игра: итог ${last.outcome} → ${now.outcome}${s.play?.text ? ` «${s.play.text}»` : ''}`);
        if (now.playPose !== last.playPose) say(`игра: поза ${last.playPose} → ${now.playPose}`);
        if (now.toys !== last.toys) say(`игра: ${now.toys}`);
        last = now;
        settle(s);
        const value = confirmed(s, store.host.today());
        if (value) remember(store.db, value).catch((error) => say(`диагностика не записана: ${error?.message ?? error}`));
      },
      { initial: false },
    );
  }, [core, store, say, settle]);

  // Настоящие события AppState — в журнал экрана (ядро получает их через useNativeLifecycle).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => say(`AppState: ${state}`));
    return () => subscription.remove();
  }, [say]);

  // Черновик другой пары (draftOf) снимается, а не откладывается: вернувшись к прежнему питомцу, поле покажет его
  // сохранённое имя.
  useEffect(() => {
    if (!draft || draftOf(draft, core, pet) !== null) return;
    setDraft(null);
    say(`черновик имени «${draft.text}» (${draft.pet}) снят: ${draft.core === core ? `показан ${pet?.pet.shown}` : 'ядро сменилось'}`);
  }, [draft, core, pet, say]);
  // Смена ядра заканчивает ввод: поле теряет фокус, его onBlur снимает тишину ввода; у нового ядра её нет, пока владелец
  // снова не начнёт ввод.
  useEffect(() => () => nameField.current?.blur?.(), [core]);

  // Итог команды ядра: отказ — его текст (ядро пишет по-русски), успех — судьба записи; поздний итог — тоже.
  const report = (title, result) => {
    if (!result.ok) {
      say(`${title}: ${result.error.code}`);
      tell(`${title}: ${result.error.message}`, true);
      return;
    }
    say(`${title}: ${result.save.status}`);
    tell(`${title}: ${SAVE[result.save.status]}`);
    result.save.done?.then((done) => {
      say(`${title}: done → ${done}`);
      tell(`${title}: ${SAVE[done]}`, done !== 'saved');
    });
  };
  const command = (title, run) => () => {
    const live = owner.current?.core;
    if (live) report(title, run(live));
  };

  // Подключение: прежнее ядро уничтожается до барьера загрузки (load ждёт его принятых операций), новое — во владение
  // экрана; каждое нажатие получает номер — результат более раннего уничтожается и экран не трогает.
  const connect = async (reason) => {
    const own = owner.current;
    if (!own || !store) return;
    const turn = ++own.turn;
    const before = own.core ? confirmed(own.core.getState(), store.host.today()) : own.before;
    own.core?.destroy();
    own.core = null;
    setCore(null);
    try {
      const { core: fresh, status } = await newCore(store);
      if (!adopt(own, turn, fresh)) return;
      follow.current = { reason, before, host: store.host };
      setCore(fresh);
      say(`${reason}: новое ядро после load (${status}): ${fresh.getState().name.display} / ${fresh.getState().prefs.motion}`);
      tell(reason === 'Подключение' ? 'Питомец подключён' : `${reason}: ядро заново`);
    } catch (error) {
      if (own.live) say(`новое ядро не создано: ${error?.message ?? error}`);
    }
  };
  const disconnect = () => {
    const own = owner.current;
    if (!own?.core) return;
    own.turn += 1;
    own.before = confirmed(own.core.getState(), store.host.today());
    own.core.destroy();
    own.core = null;
    setCore(null);
    say('питомец отключён: destroy');
    tell('Питомец отключён', true);
  };
  const nextDay = async () => {
    const own = owner.current;
    if (!own || !store) return;
    own.before = own.core ? confirmed(own.core.getState(), store.host.today()) : own.before;
    own.turn += 1;
    own.core?.destroy();
    own.core = null;
    setCore(null);
    await store.host.shiftDay(1);
    if (!own.live) return;
    say(`день хоста: ${store.host.today()} (сдвиг +${store.host.shift})`);
    await connect('Следующий день');
  };

  // Подтверждённое занятие хоста: сначала записать в счёт хоста, затем notify('saved') — progress() уже со знаком.
  const saveAction = async ({ fail = false } = {}) => {
    const own = owner.current;
    if (!own || !store) return;
    seq.current += 1;
    const key = `a-${Date.now().toString(36)}-${seq.current}`;
    tell('Занятие: сохраняется…');
    try {
      await store.host.save(key, { fail });
    } catch (error) {
      if (!own.live) return;
      say(`занятие не записано хостом: ${error?.message ?? error}`);
      const result = own.core?.notify('failed');
      if (result) say(`notify failed: ${result.ok ? `reacted ${result.reacted}` : result.error.code}`);
      tell('Занятие не сохранилось — знака нет', true);
      return;
    }
    if (!own.live) return;
    lastKey.current = key;
    const live = own.core;
    if (!live) {
      say(`занятие ${key} сохранено, питомец отключён`);
      tell('Занятие сохранено; питомец отключён — без реакции', true);
      return;
    }
    const result = live.notify('saved', { key, counted: true });
    say(`notify saved ${key}: ${result.ok ? `reacted ${result.reacted}, duplicate ${result.duplicate}` : result.error.code}`);
    tell(result.ok ? `Занятие сохранено: знаков сегодня ${store.host.progress().today}` : `Занятие сохранено; питомец: ${result.error.message}`, true);
  };
  const repeatAction = () => {
    const live = owner.current?.core;
    if (!live || !lastKey.current) return tell('Повторять нечего: занятий ещё не было', true);
    const result = live.notify('saved', { key: lastKey.current, counted: true });
    say(`повтор notify ${lastKey.current}: ${result.ok ? `reacted ${result.reacted}, duplicate ${result.duplicate}` : result.error.code}`);
    tell(result.ok && result.duplicate ? 'Повтор того же занятия: реакции и знака нет' : 'Повтор: ' + (result.ok ? 'принят' : result.error.message), true);
  };
  // Черновик сверяется с ядром и питомцем в момент нажатия (команда могла сменить питомца после отрисовки): чужой не
  // применяется — тогда setName текущего имени, без изменений.
  const saveName = () => {
    const live = owner.current?.core;
    if (!live) return;
    const now = live.getState();
    report('Имя', live.setName(draftOf(draft, live, now) ?? now.name.value));
    setDraft(null);
    nameField.current?.blur?.();
  };
  const typing = (on) => owner.current?.core?.setContext({ typing: on });
  // «Погладить» — то же публичное interact({ type: 'pet' }), что касание питомца: без знаков и записи; итог — от ядра.
  const stroke = () => {
    const live = owner.current?.core;
    if (!live) return;
    const result = live.interact({ type: 'pet' });
    say(`interact pet: ${result.ok ? `outcome ${result.outcome ?? '—'}, реакция ${live.getState().pose.reaction?.type ?? '—'}` : result.error.code}`);
    tell(result.ok ? 'Погладили' : `Погладить: ${result.error.message}`, !result.ok);
  };

  const reserve = async () => {
    if (!store) return;
    const result = await reserveProbe(store.scenes);
    check('Резервирование дня', { ok: result.ok, text: `${result.first}, затем ${result.second}; показов ${result.shown}` });
  };
  const busy = async () => {
    const live = owner.current?.core;
    if (!store || !live) return;
    const result = await busyProbe(store.db, live, next(NAMES, live.getState().name.display));
    check('Занятый файл', { ok: result.ok, text: `${result.done} через ${result.ms} мс; несохранённое уйдёт со следующей правкой` });
  };

  const state = pet;
  const def = PETS.find((one) => one.id === state?.pet.shown) ?? PETS[0];
  const opened = new Set(state?.progress?.accessories ?? []);
  const running = Boolean(core && state);
  // Кнопки — данные: та же функция у кнопки и у моста разработки.
  const kinds = PETS.map((one) => ({ id: `kind-${one.id}`, title: one.title, selected: state?.pet.shown === one.id, disabled: !running, onPress: command(`Питомец «${one.title}»`, (c) => c.setPet(one.id)) }));
  const coats = def.coats.map((coat) => ({ id: `coat-${coat.id}`, title: coat.title, selected: state?.look.coat === coat.id, disabled: !running, onPress: command(`Облик «${coat.title}»`, (c) => c.setAppearance({ coat: coat.id })) }));
  const accessories = def.accessories.map((item) => ({
    id: `acc-${item.id}`,
    title: item.title,
    selected: state?.look.accessory === item.id,
    disabled: !running || !opened.has(item.id),
    hint: opened.has(item.id) ? undefined : `Откроется на ступени ${item.stage}`,
    onPress: command(`Аксессуар «${item.title}»`, (c) => c.setAppearance({ accessory: item.id })),
  }));
  const motions = MOTION_TITLES.map(([id, title]) => ({ id: `motion-${id}`, title, selected: state?.prefs.motion === id, disabled: !running, onPress: command(`Движение «${title}»`, (c) => c.setPreferences({ motion: id })) }));
  const actions = [
    { id: 'pet-stroke', title: 'Погладить', disabled: !running, onPress: stroke },
    { id: 'pet-feed', title: TREAT[state?.treat] ?? 'Покормить', disabled: !running, hint: state?.treat === 'ready' ? undefined : 'Ядро проверит, можно ли сейчас', onPress: command('Покормить', (c) => c.feed()) },
    { id: 'host-save', title: 'Занятие сохранено', disabled: !store, onPress: () => saveAction() },
    { id: 'host-fail', title: 'Занятие не сохранилось', disabled: !store, onPress: () => saveAction({ fail: true }) },
    { id: 'host-repeat', title: 'Повторить уведомление', disabled: !running, onPress: repeatAction },
  ];
  // PL10.2.2: прямые команды хоста — те же публичные команды, что у кнопок поверхностей; их итог — строка состояния.
  const direct = [
    { id: 'host-always', title: 'Всегда рядом', selected: state?.presence.mode === 'always', disabled: !running, onPress: command('Присутствие «Всегда рядом»', (c) => c.setPresence('always')) },
    { id: 'host-oncall', title: 'Приходит по зову', selected: state?.presence.mode === 'on-call', disabled: !running, onPress: command('Присутствие «по зову»', (c) => c.setPresence('on-call')) },
    { id: 'host-hide', title: 'Скрыть (команда)', disabled: !running, onPress: command('Скрыть', (c) => c.hide()) },
    { id: 'host-show', title: 'Показать (команда)', disabled: !running, onPress: command('Показать', (c) => c.show()) },
    { id: 'host-play', title: 'Открыть игру (команда)', disabled: !running, onPress: command('open(play)', (c) => c.open('play')) },
    { id: 'host-call', title: 'Позвать (команда)', disabled: !running, onPress: command('open(play, call)', (c) => c.open('play', { source: 'call' })) },
    { id: 'host-close', title: 'Закрыть вид (команда)', disabled: !running, onPress: command('close()', (c) => c.close()) },
  ];
  const life = [
    core ? { id: 'pet-off', title: 'Отключить питомца', onPress: disconnect } : { id: 'pet-on', title: 'Подключить питомца', disabled: !store, onPress: () => connect('Подключение') },
    { id: 'day-next', title: 'Следующий день (проверка)', disabled: !store, onPress: nextDay },
  ];
  const diag = [
    { id: 'diag-renew', title: 'Новое ядро', disabled: !store, onPress: () => connect('Новое ядро') },
    { id: 'diag-reserve', title: 'Резервирование дня', disabled: !store, onPress: reserve },
    { id: 'diag-busy', title: 'Занятый файл', disabled: !running, onPress: busy },
  ];
  const nameSave = { id: 'name-save', title: 'Сохранить имя', disabled: !running, onPress: saveName };
  const all = [...kinds, nameSave, ...coats, ...accessories, ...motions, ...actions, ...direct, ...life, ...diag];
  const progress = store?.host?.progress?.();
  const rows = [
    ['Хранилище', store ? store.storage.status : '…'],
    ['Ядро', core ? `${core.status}${ready ? ', ready' : ''}` : 'отключено'],
    ['AppState / visible', `${AppState.currentState} / ${state ? state.visible : '—'}`],
    ['Имя', state ? state.name.display : '—'],
    ['Движение: владелец / система / итог', state ? `${state.prefs.motion} / ${state.prefs.reducedMotion} / ${state.prefs.effectiveMotion}` : '—'],
    ['Сохранение cat, companion, look, treat', state ? ['cat', 'companion', 'look', 'treat'].map((key) => state.save[key].status).join(', ') : '—'],
    ['cat: pending, unsaved', state ? `[${state.save.cat.pending}], [${state.save.cat.unsaved}]` : '—'],
    ['Реакция / поза', state ? `${state.pose.reaction?.type ?? '—'} / ${state.pose.shown.page}` : '—'],
    ['Вид / объявлено ядру', state ? `${state.view.open ?? '—'}${state.view.source ? ` (${state.view.source})` : ''} / views [${state.display.views.join(', ')}] · pets [${state.display.pets?.join(', ') ?? '—'}] · scenes ${JSON.stringify(state.display.scenes)}` : '—'],
    ['Присутствие: режим / поверхность / на виду / скрыт', state ? `${state.presence.mode} / ${state.presence.surface} / ${state.presence.around} / ${state.presence.hidden}` : '—'],
    ['Игра: итог / жест / перенос / поза', state?.play ? `${state.play.outcome || '—'} / ${state.play.stroke ? `${state.play.stroke.id}${state.play.stroke.held ? ' удержание' : ''}` : '—'} / ${state.play.drag?.toy ?? '—'} / ${state.pose.shown.play}` : 'не открыта'],
    ['Пол игры (единицы рисунка) / радиус лапы', state?.display.playFloor ? `${state.display.playFloor.map((n) => Math.round(n)).join(', ')} / ${Math.round(state.display.playTouch * 10) / 10}` : '—'],
    ['Отступы (insets)', `${Math.round(insets.top)} / ${Math.round(insets.right)} / ${Math.round(insets.bottom)} / ${Math.round(insets.left)}`],
    ['Лакомство', state?.treat ?? '—'],
    ['Знаки хоста: всего / сегодня / день', progress ? `${progress.marks} / ${progress.today} / ${store.host.today()}${store.host.shift ? ` (сдвиг +${store.host.shift})` : ''}` : '—'],
  ];
  const summary = rows.map(([label, value]) => `${label}: ${value}`).join(' | ');
  useEffect(() => {
    if (owner.current) trace(`экран — ${summary}`);
  }, [summary]);
  // Мост разработки (__DEV__): инспектор Metro вызывает те же функции, что отданы кнопкам последнего смонтированного
  // экрана, и читает показанные строки; своих действий у моста нет. Снимается при размонтировании. В Node-проверке нет.
  useEffect(() => {
    if (!globalThis.__DEV__) return undefined;
    const bridge = {
      titles: all.map((item) => item.title),
      press: (title) => {
        const found = all.find((item) => item.title === title || item.id === title);
        if (!found) throw new Error(`нет кнопки «${title}»`);
        return found.onPress();
      },
      screen: () => ({ rows: Object.fromEntries(rows), checks, lines, note }),
    };
    globalThis.__PET_EXAMPLE__ = bridge;
    return () => {
      if (globalThis.__PET_EXAMPLE__ === bridge) delete globalThis.__PET_EXAMPLE__;
    };
  });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 48, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}
      keyboardShouldPersistTaps="handled"
      testID="screen"
    >
      <Text style={styles.title} accessibilityRole="header">
        pet-companion · нативный пример
      </Text>
      <PetProvider core={core} pets={PETS} kits={KITS}>
        <View style={styles.stage}>{core ? <PetView size={200} testID="pet" /> : <Text style={styles.off}>Питомец отключён</Text>}</View>
        {core ? <PetCorner insets={insets} testID="corner" /> : null}
        {core ? <PetPlay insets={insets} testID="play" /> : null}
      </PetProvider>
      <Text style={styles.status} testID="status">
        {`${store ? `Хранилище: ${store.storage.status}` : 'Хранилище: загрузка…'} · ${core ? `ядро ${core.status}` : 'ядро отключено'}${note ? `\n${note}` : ''}`}
      </Text>
      <Group title="Действия" items={actions} />
      <Group title="Питомец" items={kinds} />
      <Text style={styles.label} nativeID="name-label">
        Имя: {state ? state.name.display : '—'}
      </Text>
      <View style={styles.row}>
        <TextInput
          ref={nameField}
          testID="name-input"
          style={styles.input}
          accessibilityLabel="Имя питомца"
          accessibilityLabelledBy="name-label"
          value={draftOf(draft, core, state) ?? state?.name.value ?? ''}
          placeholder={def.names.default}
          maxLength={40}
          editable={running}
          returnKeyType="done"
          onChangeText={(text) => setDraft(core && state ? { core, pet: state.pet.shown, text } : null)}
          onFocus={() => typing(true)}
          onBlur={() => typing(false)}
          onSubmitEditing={saveName}
        />
        <Control item={nameSave} />
      </View>
      <Group title="Облик" items={coats} />
      <Group title="Платок" items={accessories} />
      <Group title="Движение" items={motions} />
      <Group title="Присутствие и вид (команды хоста)" items={direct} />
      <Group title="Подключение и день" items={life} />
      <Text style={styles.head} accessibilityRole="header">
        Диагностика
      </Text>
      {rows.map(([label, value]) => (
        <Row key={label} label={label} value={value} />
      ))}
      <Group title="Проверки хранения" items={diag} />
      {Object.entries(checks).map(([name, value]) => (
        <Row key={name} id={`check:${name}`} label={`${mark(value)} ${name}`} value={value.text} />
      ))}
      <Text style={styles.head} accessibilityRole="header">
        Журнал
      </Text>
      {lines.map((line, index) => (
        <Text key={`${index}-${line}`} style={styles.line}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

function Group({ title, items }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.row}>
        {items.map((item) => (
          <Control key={item.id} item={item} />
        ))}
      </View>
    </View>
  );
}

// Кнопка: роль, название, состояние (выбрана, недоступна), область касания не меньше 48 точек.
function Control({ item }) {
  const { id, title, onPress, selected, disabled, hint } = item;
  return (
    <Pressable
      testID={id}
      onPress={onPress}
      disabled={Boolean(disabled)}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(disabled), ...(selected === undefined ? {} : { selected }) }}
      style={({ pressed }) => [styles.control, selected && styles.selected, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={[styles.controlText, selected && styles.selectedText]}>{title}</Text>
    </Pressable>
  );
}

function Row({ id, label, value }) {
  return (
    <View style={styles.rowText}>
      <Text style={styles.small} testID={id}>
        {label}
      </Text>
      <Text style={styles.value} selectable>
        {String(value)}
      </Text>
    </View>
  );
}

const INK = '#1d2024';
const styles = StyleSheet.create({
  screen: { backgroundColor: '#f6f2ea' },
  page: { gap: 10 },
  title: { fontSize: 20, fontWeight: '600', color: INK },
  stage: { alignItems: 'center', minHeight: 200, justifyContent: 'center' },
  off: { fontSize: 16, color: INK },
  status: { fontSize: 15, lineHeight: 21, color: INK },
  group: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  label: { fontSize: 15, fontWeight: '600', color: INK },
  input: { flexGrow: 1, flexBasis: 180, minHeight: 48, borderWidth: 1, borderColor: '#8a8478', borderRadius: 8, paddingHorizontal: 12, fontSize: 17, color: INK, backgroundColor: '#ffffff' },
  control: { minHeight: 48, minWidth: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2f5249', justifyContent: 'center', backgroundColor: '#ffffff' },
  selected: { backgroundColor: '#2f5249' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  controlText: { fontSize: 16, color: '#2f5249' },
  selectedText: { color: '#ffffff', fontWeight: '600' },
  head: { marginTop: 14, fontSize: 17, fontWeight: '600', color: INK },
  rowText: { gap: 2 },
  small: { fontSize: 12, color: '#5b574f' },
  value: { fontSize: 14, color: INK },
  line: { fontSize: 12, color: INK },
});
