// Только проверки: поток одного соединения SQLite тестового драйвера (test/sqlite-driver.mjs) — настоящий DatabaseSync из
// node:sqlite. Запросы выполняются по одному в порядке получения, вне потока проверки: ожидание busy_timeout этого
// соединения не останавливает остальные (как нативный поток expo-sqlite).
import { DatabaseSync } from 'node:sqlite';
import { parentPort, workerData } from 'node:worker_threads';

const db = new DatabaseSync(workerData.path);
const plain = (row) => (row ? { ...row } : null);

parentPort.on('message', ({ id, op, sql, params = [] }) => {
  try {
    let value = null;
    if (op === 'exec') db.exec(sql);
    else if (op === 'get') value = plain(db.prepare(sql).get(...params));
    else if (op === 'run') {
      const result = db.prepare(sql).run(...params);
      value = { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    } else if (op === 'inTx') value = db.isTransaction;
    else if (op === 'close') db.close();
    else throw new Error(`неизвестная операция ${op}`);
    parentPort.postMessage({ id, ok: true, value });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: { message: error.message, code: error.code, errcode: error.errcode, errstr: error.errstr } });
  }
});
