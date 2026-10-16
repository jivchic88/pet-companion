// Только проверки (test/native-process.test.mjs): отдельный процесс с настоящим SQLite-адаптером на файле file и
// пространстве ns. mode: saved — setName(name), дождаться подтверждения, напечатать итог; hold-kv — setName(name), удержать
// COMMIT (запись выполнена, транзакция открыта) и напечатать holding; hold-day — резервирование дня: show печатает showing,
// COMMIT удержан, затем holding. Процесс ждёт, пока проверка его не убьёт (SIGKILL): завершающих обработчиков нет.
import { coordinatorOf } from '../pet/core/storage.mjs';
import { sqliteScenes, sqliteStorage } from '../pet/storage/sqlite.mjs';
import { DAY, make } from './core-kit.mjs';
import { lab } from './sqlite-driver.mjs';

const [file, ns, mode, name = 'Барсик'] = process.argv.slice(2);
const L = await lab({ prefix: 'pet-sqlite-child-' });
const app = L.other(file);
const options = { db: app, namespace: ns, busyTimeout: 500 };
const storage = coordinatorOf(sqliteStorage(options, L.open));
if ((await storage.load()) !== 'ready') throw new Error('не загрузилось');
const { core } = make(storage);
const say = (text) => process.stdout.write(`${text}\n`);
if (mode === 'saved') say(await core.setName(name).save.done);
else if (mode === 'hold-kv') {
  const gate = L.hold('COMMIT', { who: 'w' });
  core.setName(name);
  await gate.reached;
  say('holding');
} else if (mode === 'hold-day') {
  const gate = L.hold('COMMIT', { who: 'w' });
  void sqliteScenes(options, L.open).reserve(
    () => ({ v: 1, day: DAY, by: 'child' }),
    () => say('showing'),
  );
  await gate.reached;
  say('holding');
}
setInterval(() => {}, 60_000);
