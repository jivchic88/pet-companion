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

export default function App() {
  const [store, setStore] = useState(null);
  const [core, setCore] = useState(null);
  const [lines, setLines] = useState([]);
  const [checks, setChecks] = useState({});
  const marks = useRef(0);
  const say = useCallback((text) => setLines((list) => [`${time()} ${text}`, ...list].slice(0, 60)), []);
  const check = useCallback((name, value) => setChecks((all) => ({ ...all, [name]: value })), []);
  const progress = useCallback(() => ({ marks: marks.current, today: marks.current, limit: null }), []);
  const ready = useNativeLifecycle(core);
  const pet = usePetState(core);

  // Запуск: база примера, барьер загрузки, ядро; сверка подтверждённого прошлого запуска.
  useEffect(() => {
    let live = true;
    let made = null;
    (async () => {
      const opened = await openStore();
      const { core: first, status } = await newCore(opened, progress);
      if (!live) return first.destroy();
      made = first;
      setStore(opened);
      setCore(first);
      say(`хранилище: ${status}`);
      const result = restartCheck(opened.expected, first.getState());
      check('Перезапуск с тем же файлом', result);
      say(`перезапуск: ${result.text}`);
    })().catch((error) => say(`ошибка запуска: ${error?.message ?? error}`));
    return () => {
      live = false;
      made?.destroy();
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

  const renew = async () => {
    if (!store || !core) return;
    core.destroy();
    setCore(null);
    const { core: fresh, status } = await newCore(store, progress);
    setCore(fresh);
    const value = confirmed(fresh.getState());
    say(`новое ядро после load (${status}): ${fresh.getState().name.display} / ${fresh.getState().prefs.motion}`);
    check('destroy → load → новое ядро', { ok: Boolean(value), text: value ? `подтверждённое: ${value.name} / ${value.motion}` : 'есть неподтверждённое' });
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
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>pet-companion · PL09 · диагностика</Text>
      <Row label="Хранилище" value={store ? store.storage.status : '…'} />
      <Row label="Ядро" value={core ? `${core.status}${ready ? ', ready' : ''}` : 'нет'} />
      <Row label="AppState / visible" value={`${AppState.currentState} / ${state ? state.visible : '—'}`} />
      <Row label="Имя" value={state ? state.name.display : '—'} />
      <Row label="Движение: владелец / система / итог" value={state ? `${state.prefs.motion} / ${state.prefs.reducedMotion} / ${state.prefs.effectiveMotion}` : '—'} />
      <Row label="cat: статус, pending, unsaved" value={state ? `${state.save.cat.status}, [${state.save.cat.pending}], [${state.save.cat.unsaved}]` : '—'} />
      <Row label="Реакция" value={state?.pose.reaction?.type ?? '—'} />
      <View style={styles.buttons}>
        <Button title="Имя" onPress={command('setName', (c) => c.setName(next(NAMES, c.getState().name.display)))} />
        <Button title="Движение" onPress={command('setPreferences', (c) => c.setPreferences({ motion: next(MOTIONS, c.getState().prefs.motion) }))} />
        <Button title="Подтверждённое занятие" onPress={command('notify saved', (c) => ((marks.current += 1), c.notify('saved', { key: `k${Date.now()}`, counted: true })))} />
        <Button title="Новое ядро" onPress={renew} />
        <Button title="Резервирование дня" onPress={reserve} />
        <Button title="Занятый файл" onPress={busy} />
      </View>
      <Text style={styles.head}>Проверки</Text>
      {Object.entries(checks).map(([name, value]) => (
        <Row key={name} label={`${value.ok === true ? '✓' : value.ok === false ? '✗' : '·'} ${name}`} value={value.text} />
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
