// Диагностический экран мобильного потребителя (PL09): состояние ядра, статусы сохранения и результаты проверок на обычных
// View, Text и Button — без рисунков, анимаций и уголка (нативное отображение — PL10). Хранение — createSqliteStorage
// (настоящий expo-sqlite), жизненный цикл — useNativeLifecycle (настоящие AppState и AccessibilityInfo); start — после
// начальной синхронизации. Сценарии и что записать — README.md рядом.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNativeLifecycle, usePetState } from 'pet-companion/native';
import { busyProbe, confirmed, MOTIONS, NAMES, newCore, openStore, remember, reserveProbe, restartCheck } from './diagnostics.mjs';

const time = () => new Date().toTimeString().slice(0, 8);
const next = (list, value) => list[(list.indexOf(value) + 1) % list.length];
// В разработке (Expo Go, __DEV__) журнал, проверки и смены строк состояния дублируются в консоль — Expo CLI печатает их в
// терминале Metro: доказательство запуска на устройстве без снимков экрана. В Node-проверке __DEV__ нет — консоль молчит.
const trace = (text) => globalThis.__DEV__ && console.log(`[PL09] ${text}`);
const mark = (value) => (value.ok === true ? '✓' : value.ok === false ? '✗' : '·');

// Владение ядром: у подключённого экрана — запись own { live, core, turn }: текущее ядро и номер последнего создания.
// Созданное ядро принимается, только если экран ещё подключён и создание — последнее; иначе (размонтирован, опередило
// более новое «Новое ядро») уничтожается сразу — ядра без владельца не остаётся.
function adopt(own, turn, core) {
  if (own.live && own.turn === turn) {
    own.core = core;
    return true;
  }
  core.destroy();
  return false;
}

export default function App() {
  const [store, setStore] = useState(null);
  const [core, setCore] = useState(null);
  const [lines, setLines] = useState([]);
  const [checks, setChecks] = useState({});
  const marks = useRef(0);
  // Запись владения подключённого экрана (null — экран не подключён): после размонтирования экран своё состояние не меняет.
  const owner = useRef(null);
  const say = useCallback((text) => {
    if (!owner.current) return;
    const line = `${time()} ${text}`;
    trace(line);
    setLines((list) => [line, ...list].slice(0, 60));
  }, []);
  const check = useCallback((name, value) => {
    if (!owner.current) return;
    trace(`проверка «${name}»: ${mark(value)} ${value.text}`);
    setChecks((all) => ({ ...all, [name]: value }));
  }, []);
  const progress = useCallback(() => ({ marks: marks.current, today: marks.current, limit: null }), []);
  const ready = useNativeLifecycle(core);
  const pet = usePetState(core);

  // Запуск: база примера, барьер загрузки, ядро; сверка подтверждённого прошлого запуска. Размонтирование уничтожает
  // текущее ядро (и первое, и созданное «Новое ядро»); ядро, созданное после него, уничтожает adopt.
  useEffect(() => {
    const own = { live: true, core: null, turn: 1 };
    owner.current = own;
    (async () => {
      const opened = await openStore();
      const { core: first, status } = await newCore(opened, progress);
      if (!adopt(own, 1, first)) return;
      setStore(opened);
      setCore(first);
      say(`хранилище: ${status}`);
      const result = restartCheck(opened.expected, first.getState());
      check('Перезапуск с тем же файлом', result);
      say(`перезапуск: ${result.text}`);
    })().catch((error) => own.live && say(`ошибка запуска: ${error?.message ?? error}`));
    return () => {
      own.live = false;
      if (owner.current === own) owner.current = null;
      own.core?.destroy();
      own.core = null;
    };
  }, [check, progress, say]);

  // Ядро запускается после начальной синхронизации видимости и «уменьшить движение».
  useEffect(() => {
    if (core && ready && core.status === 'created') {
      core.start();
      say('start после useNativeLifecycle → ready');
    }
  }, [core, ready, say]);

  // Переходы статуса сохранения cat и запоминание подтверждённого для сверки после перезапуска.
  useEffect(() => {
    if (!core || !store) return undefined;
    let last = core.getState()?.save.cat.status;
    let shown = core.getState()?.visible;
    return core.subscribe(
      (update) => {
        const now = update.snapshot.save.cat.status;
        if (now !== last) say(`cat: ${last} → ${now}`);
        last = now;
        if (update.snapshot.visible !== shown) say(`ядро visible: ${shown} → ${update.snapshot.visible}`);
        shown = update.snapshot.visible;
        const value = confirmed(update.snapshot);
        if (value) remember(store.db, value).catch((error) => say(`диагностика не записана: ${error?.message ?? error}`));
      },
      { initial: false },
    );
  }, [core, store, say]);

  // Настоящие события AppState — в журнал экрана (ядро получает их через useNativeLifecycle).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => say(`AppState: ${state}`));
    return () => subscription.remove();
  }, [say]);

  const command = (title, run) => () => {
    if (!core) return;
    const result = run(core);
    say(`${title}: ${result.ok ? result.save.status : result.error.code}`);
    result.save?.done?.then((done) => say(`${title}: done → ${done}`));
  };

  // «Новое ядро»: прежнее уничтожается до барьера загрузки (load ждёт его принятых операций), новое — во владение экрана.
  // Каждое нажатие получает свой номер: результат более раннего (в том числе нажатого, пока предыдущее ещё грузится)
  // уничтожается и экран не трогает.
  const renew = async () => {
    const own = owner.current;
    if (!own || !store) return;
    const turn = ++own.turn;
    own.core?.destroy();
    own.core = null;
    setCore(null);
    try {
      const { core: fresh, status } = await newCore(store, progress);
      if (!adopt(own, turn, fresh)) return;
      setCore(fresh);
      const value = confirmed(fresh.getState());
      say(`новое ядро после load (${status}): ${fresh.getState().name.display} / ${fresh.getState().prefs.motion}`);
      check('destroy → load → новое ядро', { ok: Boolean(value), text: value ? `подтверждённое: ${value.name} / ${value.motion}` : 'есть неподтверждённое' });
    } catch (error) {
      if (own.live) say(`новое ядро не создано: ${error?.message ?? error}`);
    }
  };

  const reserve = async () => {
    if (!store) return;
    const result = await reserveProbe(store.scenes);
    check('Резервирование дня', { ok: result.ok, text: `${result.first}, затем ${result.second}; показов ${result.shown}` });
  };

  const busy = async () => {
    if (!store || !core) return;
    const name = next(NAMES, core.getState().name.display);
    const result = await busyProbe(store.db, core, name);
    check('Занятый файл', { ok: result.ok, text: `${result.done} через ${result.ms} мс; несохранённое уйдёт со следующей правкой` });
  };

  const state = pet;
  const rows = [
    ['Хранилище', store ? store.storage.status : '…'],
    ['Ядро', core ? `${core.status}${ready ? ', ready' : ''}` : 'нет'],
    ['AppState / visible', `${AppState.currentState} / ${state ? state.visible : '—'}`],
    ['Имя', state ? state.name.display : '—'],
    ['Движение: владелец / система / итог', state ? `${state.prefs.motion} / ${state.prefs.reducedMotion} / ${state.prefs.effectiveMotion}` : '—'],
    ['cat: статус, pending, unsaved', state ? `${state.save.cat.status}, [${state.save.cat.pending}], [${state.save.cat.unsaved}]` : '—'],
    ['Реакция', state?.pose.reaction?.type ?? '—'],
  ];
  const summary = rows.map(([label, value]) => `${label}: ${value}`).join(' | ');
  useEffect(() => {
    if (owner.current) trace(`экран — ${summary}`);
  }, [summary]);
  const buttons = [
    ['Имя', command('setName', (c) => c.setName(next(NAMES, c.getState().name.display)))],
    ['Движение', command('setPreferences', (c) => c.setPreferences({ motion: next(MOTIONS, c.getState().prefs.motion) }))],
    ['Подтверждённое занятие', command('notify saved', (c) => ((marks.current += 1), c.notify('saved', { key: `k${Date.now()}`, counted: true })))],
    ['Новое ядро', renew],
    ['Резервирование дня', reserve],
    ['Занятый файл', busy],
  ];
  // Мост диагностики (только разработка, __DEV__): инспектор Metro вызывает те же функции, что отданы кнопкам последнего
  // смонтированного экрана, и читает показанные строки; своих действий у моста нет. Снимается при размонтировании. В
  // Node-проверке __DEV__ нет — моста нет.
  useEffect(() => {
    if (!globalThis.__DEV__) return undefined;
    const bridge = {
      titles: buttons.map(([title]) => title),
      press: (title) => {
        const found = buttons.find(([name]) => name === title);
        if (!found) throw new Error(`нет кнопки «${title}»`);
        return found[1]();
      },
      screen: () => ({ rows: Object.fromEntries(rows), checks, lines }),
    };
    globalThis.__PL09__ = bridge;
    return () => {
      if (globalThis.__PL09__ === bridge) delete globalThis.__PL09__;
    };
  });
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>pet-companion · PL09 · диагностика</Text>
      {rows.map(([label, value]) => (
        <Row key={label} label={label} value={value} />
      ))}
      <View style={styles.buttons}>
        {buttons.map(([title, onPress]) => (
          <Button key={title} title={title} onPress={onPress} />
        ))}
      </View>
      <Text style={styles.head}>Проверки</Text>
      {Object.entries(checks).map(([name, value]) => (
        <Row key={name} label={`${mark(value)} ${name}`} value={value.text} />
      ))}
      <Text style={styles.head}>Журнал</Text>
      {lines.map((line, index) => (
        <Text key={`${index}-${line}`} style={styles.line}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingTop: 56, gap: 8 },
  title: { fontSize: 18, fontWeight: '600' },
  row: { gap: 2 },
  label: { fontSize: 12, opacity: 0.7 },
  buttons: { gap: 8, marginVertical: 8 },
  head: { marginTop: 12, fontWeight: '600' },
  line: { fontSize: 12 },
});
