// Завершение процесса (PL09; docs/ARCHITECTURE.md § 8.7, § 9.5): отдельный процесс Node с настоящим SQLite-адаптером
// (test/sqlite-child.mjs) убивается SIGKILL — без завершающих обработчиков и flush; затем этот процесс открывает тот же файл
// своим адаптером. Подтверждённая запись переживает завершение; незавершённая транзакция (запись выполнена, COMMIT не
// отправлен) откатывается — значения прежние, файл не заблокирован; начатый показ сценки без COMMIT — день свободен.
// Режимы журнала WAL и DELETE. Перезапуск JS и новое ядро в том же процессе — test/native-storage.test.mjs (destroy и новое
// ядро); это — завершение процесса. Не устройство: убийство процесса Node, а не приложения ОС.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { coordinatorOf } from '../pet/core/storage.mjs';
import { sqliteScenes, sqliteStorage } from '../pet/storage/sqlite.mjs';
import { DAY, make } from './core-kit.mjs';
import { SCHEMA } from './native-kit.mjs';
import { lab } from './sqlite-driver.mjs';

const CHILD = fileURLToPath(new URL('./sqlite-child.mjs', import.meta.url));

// Процесс-ребёнок: ждать строку want, затем SIGKILL и конец процесса.
async function killAfter(args, want) {
  const child = spawn(process.execPath, [CHILD, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stderr.on('data', (chunk) => (err += chunk));
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.split('\n').includes(want)) resolve();
    });
    child.once('exit', () => reject(new Error(`процесс завершился сам: ${out} ${err}`)));
  });
  child.kill('SIGKILL');
  return { lines: out.trim().split('\n'), ...(await exited) };
}

for (const mode of ['wal', 'delete']) {
  test(`${mode}: SIGKILL после подтверждения — запись цела; посреди записи (до COMMIT) — откат, файл свободен; посреди показа сценки — день свободен; новый процесс видит подтверждённое`, async () => {
    const L = await lab();
    try {
      const path = L.file(`${mode}.db`);
      const app = L.other(path);
      await app.execAsync(`PRAGMA journal_mode = ${mode}`);
      await app.execAsync(SCHEMA);
      const saved = await killAfter([path, 'p', 'saved', 'Барсик'], 'saved');
      assert.deepEqual([saved.lines, saved.signal], [['saved'], 'SIGKILL']);
      const held = await killAfter([path, 'p', 'hold-kv', 'Пиксель'], 'holding');
      assert.equal(held.signal, 'SIGKILL');
      const day = await killAfter([path, 'p', 'hold-day'], 'holding');
      assert.deepEqual([day.lines, day.signal], [['showing', 'holding'], 'SIGKILL'], 'показ начат до COMMIT, затем процесс убит');
      // Другой процесс: соединение без ожидания — блокировки нет; значение — подтверждённое до убийства.
      const fresh = L.other(path);
      await fresh.execAsync('BEGIN IMMEDIATE');
      await fresh.execAsync('ROLLBACK');
      const storage = coordinatorOf(sqliteStorage({ db: fresh, namespace: 'p', busyTimeout: 200 }, L.open));
      assert.equal(await storage.load(), 'ready');
      const { core } = make(storage);
      assert.equal(core.getState().name.display, 'Барсик', 'подтверждённое пережило SIGKILL, незавершённое «Пиксель» откатилось');
      assert.equal(await app.getFirstAsync("SELECT value FROM pet_scene WHERE ns = 'p'"), null, 'день без COMMIT не записан');
      const scenes = sqliteScenes({ db: fresh, namespace: 'p', busyTimeout: 200 }, L.open);
      let shown = 0;
      assert.equal(await scenes.reserve(() => ({ v: 1, day: DAY, by: 'parent' }), () => shown++), 'shown');
      assert.equal(shown, 1, 'день свободен — сценка показана');
      core.destroy();
    } finally {
      await L.close();
    }
  });
}
