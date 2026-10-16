// SQLite-адаптер PL09 на настоящем node:sqlite (docs/ARCHITECTURE.md § 8.7.2, § 8.9, § 8.10, § 12.3): идентичность файла и
// реестр; одно соединение записи и мьютекс на файл для всех namespace; другой файл независим; два независимых соединения
// к одному файлу — вторая копия модуля адаптера (свой реестр и своё соединение записи, «другой процесс» в одном Node) и
// соединение приложения; конкурирующий read-modify-write; чужая открытая транзакция запросов библиотеки не получает;
// обычная запись и резервирование не перекрывают транзакции; занятый файл — честный отказ до build, без повтора, замер
// busy_timeout; точный сценарий § 8.7.2; отказы: инъекции метода драйвера (помечены) и настоящие отказы SQLite —
// SQLITE_FULL по max_page_count (не настоящее переполнение диска), RAISE в триггере приложения, COMMIT при читателе в режиме
// DELETE; ROLLBACK не удался — проверка транзакции и сброс соединения; закрытие не удалось — предупреждение и честные
// отказы; режим журнала не переключается (предупреждение не-WAL), параметры привязываются, инициализация только
// добавляет. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { coordinatorOf } from '../pet/core/storage.mjs';
import { BUSY_MS, filePath, sqliteScenes, sqliteStorage } from '../pet/storage/sqlite.mjs';
import { DAY, journal, make, spy } from './core-kit.mjs';
import { sqliteSite } from './native-kit.mjs';
import { lab } from './sqlite-driver.mjs';

const MARS = { v: 1, name: 'Марс', motion: 'normal', seenStage: 0, greetDay: DAY };
const Q = await import('../pet/storage/sqlite.mjs?copy=peer');
const makeCore = (storage, parts) => make(storage, parts).core;
const lines = (L, who) => L.journal.filter((line) => line.startsWith(`${who} `));
const elapsed = async (work) => {
  const start = performance.now();
  const value = await work();
  return { value, ms: performance.now() - start };
};

// «Другой процесс» на том же файле: вторая копия модуля адаптера со своим реестром и соединением записи, своё соединение
// приложения; координатор загружен.
async function peer(S, { ns = S.ns, busyTimeout = 3000 } = {}) {
  const app = S.lab.other(S.path);
  await app.execAsync('PRAGMA busy_timeout = 5000');
  const log = journal();
  const facade = Q.sqliteStorage({ db: app, namespace: ns, busyTimeout, log: log.port }, S.lab.open);
  const storage = coordinatorOf(facade);
  assert.equal(await storage.load(), 'ready');
  return { app, storage, facade, log, scenes: Q.sqliteScenes({ db: app, namespace: ns, busyTimeout, log: log.port }, S.lab.open) };
}

// Блоки транзакций соединения who: каждая начинается BEGIN IMMEDIATE и кончается COMMIT или ROLLBACK без вложенных BEGIN.
function blocks(L, who) {
  const out = [];
  let open = null;
  for (const line of lines(L, who)) {
    if (/ exec BEGIN IMMEDIATE/.test(line)) {
      assert.equal(open, null, `BEGIN внутри открытой транзакции: ${line}`);
      open = [line];
    } else if (/ exec (COMMIT|ROLLBACK)/.test(line) && open) {
      open.push(line);
      out.push(open);
      open = null;
    } else if (open) open.push(line);
  }
  return out;
}

test('идентичность файла: два handle одного пути и file:-адрес — тот же координатор и резервирование, одно соединение записи; одноимённый файл в другой папке — другие; :memory:, относительный путь, неверные настройки — invalid-options', async () => {
  const L = await lab();
  try {
    const path = L.file('same.db');
    const one = { databasePath: path };
    const two = { databasePath: `${L.dir}//./same.db` };
    const url = { databasePath: `file://${encodeURI(path)}` };
    const a = sqliteStorage({ db: one, namespace: 'n' }, L.open);
    assert.equal(sqliteStorage({ db: two, namespace: 'n' }, L.open), a, 'тот же путь — тот же координатор');
    assert.equal(sqliteStorage({ db: url, namespace: 'n' }, L.open), a, 'file:-адрес того же файла — тот же');
    const scenes = sqliteScenes({ db: one, namespace: 'n' }, L.open);
    assert.equal(sqliteScenes({ db: two, namespace: 'n' }, L.open), scenes);
    assert.notEqual(sqliteStorage({ db: one, namespace: 'm' }, L.open), a, 'другой namespace — другой координатор');
    const other = sqliteStorage({ db: { databasePath: L.file('sub/same.db') }, namespace: 'n' }, L.open);
    assert.notEqual(other, a, 'то же имя в другой папке — другой файл');
    assert.equal(filePath({ databasePath: 'file:///var/x/../y/pet%20db.sqlite' }), '/var/y/pet db.sqlite');
    for (const [title, options] of [
      ['база в памяти', { db: { databasePath: ':memory:' } }],
      ['относительный путь', { db: { databasePath: 'pet.db' } }],
      ['нет db', {}],
      ['db без пути', { db: {} }],
      ['пустой namespace', { db: one, namespace: '' }],
      ['busyTimeout дробный', { db: one, busyTimeout: 1.5 }],
      ['busyTimeout больше 10 с', { db: one, busyTimeout: 10_001 }],
      ['log без warn', { db: one, log: {} }],
      ['неизвестная настройка', { db: one, retry: true }],
      ['другой busyTimeout того же файла', { db: one, namespace: 'n', busyTimeout: 5 }],
    ]) {
      assert.throws(() => sqliteStorage(options, L.open), { name: 'PetError', code: 'invalid-options' }, title);
    }
    assert.throws(() => sqliteStorage(null, L.open), { code: 'invalid-options' });
    // Одно соединение записи на файл: загрузка двух namespace одного файла.
    await a.load();
    await sqliteStorage({ db: one, namespace: 'm' }, L.open).load();
    assert.equal(await scenes.reserve(() => null, () => {}), 'skip');
    assert.equal(L.writers.length, 1, 'одно соединение записи на файл: namespace и резервирование');
    await other.load();
    assert.equal(L.writers.length, 2, 'другой файл — своё соединение');
  } finally {
    await L.close();
  }
});

test('namespace делят физический мьютекс, но не данные; другой файл независим — его транзакции идут, пока первый файл занят', async () => {
  const S = await sqliteSite({ cat: MARS }, { ns: 'n1' });
  try {
    const app2 = S.lab.other(S.path);
    const second = coordinatorOf(sqliteStorage({ db: app2, namespace: 'n2', busyTimeout: 200 }, S.lab.open));
    await second.load();
    const other = await sqliteSite({ cat: MARS }, { ns: 'n1', L: S.lab, file: S.lab.file('other.db') });
    const A = makeCore(S.storage);
    const B = makeCore(second);
    const C = makeCore(other.storage);
    const gate = S.lab.hold(({ sql, params }) => sql.startsWith('INSERT INTO pet_kv') && params[0] === 'n1', { who: 'w1' });
    const named = A.setName('Барсик');
    await gate.reached;
    const mark = S.lab.journal.length;
    const moved = B.setName('Пиксель');
    const far = C.setName('Дымок');
    assert.equal(await far.save.done, 'saved', 'другой файл не ждёт мьютекс первого');
    assert.ok(!S.lab.journal.slice(mark).some((line) => line.startsWith('w1 ')), 'n2 ещё не начинал: мьютекс файла общий');
    gate.release();
    assert.deepEqual([await named.save.done, await moved.save.done], ['saved', 'saved']);
    assert.deepEqual([(await S.json('cat')).name, (await other.json('cat')).name], ['Барсик', 'Дымок']);
    const row = await S.app.getFirstAsync("SELECT value FROM pet_kv WHERE ns = 'n2' AND key = 'cat:v1'");
    assert.equal(JSON.parse(row.value).name, 'Пиксель', 'данные n2 — свои');
    assert.equal(A.getState().name.display, 'Барсик');
    assert.equal(B.getState().name.display, 'Пиксель', 'пространства не делят кэш и поглощение');
    const order = blocks(S.lab, 'w1').map((block) => block.find((line) => line.includes('SELECT'))?.match(/\[(n\d)/)?.[1]);
    assert.deepEqual(order.slice(-2), ['n1', 'n2'], 'транзакция n2 — после COMMIT n1');
    for (const core of [A, B, C]) core.destroy();
  } finally {
    await S.close();
  }
});

test('два независимых соединения (другой процесс): конкурирующий read-modify-write — второй ждёт блокировку записи, взятую до чтения, и строится по подтверждённому первым; уведомлений между процессами нет — кэш P сверит барьер load', async () => {
  const S = await sqliteSite({ cat: MARS });
  try {
    const P = await peer(S);
    const A = makeCore(S.storage);
    const C = makeCore(P.storage);
    const held = S.lab.hold(/^INSERT INTO pet_kv/, { who: 'w1' });
    const mark = S.lab.journal.length;
    const named = A.setName('Барсик');
    await held.reached;
    const sent = S.lab.hold('BEGIN IMMEDIATE', { who: 'w2' });
    const moved = C.setPreferences({ motion: 'none' });
    await sent.reached;
    sent.release();
    held.release();
    assert.deepEqual([await named.save.done, await moved.save.done], ['saved', 'saved']);
    assert.deepEqual(await S.json('cat'), { ...MARS, name: 'Барсик', motion: 'none' }, 'обе правки: вторая прочитана после COMMIT первой');
    const after = S.lab.journal.slice(mark).map((line) => line.split(' ').slice(0, 3).join(' '));
    const begin2 = after.indexOf('w2 exec BEGIN');
    const commit1 = after.indexOf('w1 exec COMMIT');
    const select2 = after.indexOf('w2 get SELECT');
    assert.ok(begin2 >= 0 && begin2 < commit1 && commit1 < select2, `BEGIN второго — до COMMIT первого, его SELECT — после: ${after.join(' | ')}`);
    assert.deepEqual([C.getState().name.display, C.getState().prefs.motion], ['Барсик', 'none'], 'Q поглотил чужое из своей транзакции');
    assert.equal(A.getState().prefs.motion, 'normal', 'P не уведомлён: межпроцессных уведомлений нет');
    assert.equal(await S.storage.load(), 'ready');
    assert.equal(A.getState().prefs.motion, 'none', 'барьер load сверил кэш P');
    A.destroy();
    C.destroy();
  } finally {
    await S.close();
  }
});

test('чужая открытая транзакция соединения приложения не получает запросов библиотеки: запись приложения держит файл — запись библиотеки честно отказывает (без повтора), откат приложения не затрагивает библиотеку', async () => {
  const S = await sqliteSite({ cat: MARS });
  try {
    const A = makeCore(S.storage);
    const before = lines(S.lab, 'o1').length;
    await S.app.execAsync('BEGIN');
    await S.app.runAsync('INSERT OR REPLACE INTO pet_kv (ns, key, value) VALUES (?, ?, ?)', ['app', 'own:v1', '{"x":1}']);
    const failed = A.setName('Барсик');
    assert.equal(await failed.save.done, 'failed', 'файл занят транзакцией приложения дольше busy_timeout');
    await S.app.execAsync('ROLLBACK');
    assert.deepEqual(lines(S.lab, 'o1').slice(before).map((line) => line.split(' ').slice(1, 3).join(' ')), ['exec BEGIN', 'run INSERT', 'exec ROLLBACK'], 'на соединении приложения — только его запросы');
    assert.equal(await S.app.getFirstAsync("SELECT value FROM pet_kv WHERE ns = 'app'"), null, 'откат приложения — его данные');
    assert.equal((await S.json('cat')).name, 'Марс');
    assert.equal(lines(S.lab, 'w1').filter((line) => line.includes('BEGIN IMMEDIATE')).length, 10, 'загрузка (9) и одна попытка записи — повтора нет');
    // Транзакция чтения приложения в WAL запись библиотеки не держит.
    await S.app.execAsync('BEGIN');
    await S.app.getFirstAsync('SELECT count(*) AS n FROM pet_kv');
    assert.equal(await A.setName('Пиксель').save.done, 'saved', 'несохранённое имя ушло со следующей правкой');
    await S.app.execAsync('COMMIT');
    A.destroy();
  } finally {
    await S.close();
  }
});

test('обычная запись и резервирование на одном файле — одно соединение, транзакции по одной, без вложенных BEGIN', async () => {
  const S = await sqliteSite({ cat: MARS });
  try {
    const A = makeCore(S.storage);
    const results = [];
    const named = A.setName('Барсик');
    results.push(S.scenes.reserve(() => ({ v: 1, day: DAY, by: 't' }), () => {}));
    const moved = A.setPreferences({ motion: 'calm' });
    results.push(S.scenes.reserve(() => null, () => {}));
    assert.deepEqual(await Promise.all([named.save.done, moved.save.done, ...results]), ['saved', 'saved', 'shown', 'skip']);
    // Порядок входа в мьютекс: имя; резервирование с записью; резервирование без записи; motion — его операция ждала в
    // очереди ключа cat конца операции имени (логическая очередь ключа), а резервирование — нет.
    const own = blocks(S.lab, 'w1').slice(-4);
    assert.deepEqual(own.map((block) => block.map((line) => line.split(' ').slice(1, 3).join(' '))), [
      ['exec BEGIN', 'get SELECT', 'run INSERT', 'exec COMMIT'],
      ['exec BEGIN', 'get SELECT', 'run INSERT', 'exec COMMIT'],
      ['exec BEGIN', 'get SELECT', 'exec ROLLBACK'],
      ['exec BEGIN', 'get SELECT', 'run INSERT', 'exec COMMIT'],
    ]);
    assert.deepEqual(own.map((block) => (block[1].includes('pet_scene') ? 'day' : 'kv')), ['kv', 'day', 'day', 'kv']);
    A.destroy();
  } finally {
    await S.close();
  }
});

test('занятый файл: запись — отказ до build и без повтора, резервирование — fail без decide и show; ожидание ≈ busy_timeout (замер, по умолчанию 1000 мс); после освобождения — следующая операция проходит тем же соединением', async (t) => {
  const S = await sqliteSite({ cat: MARS }, { busyTimeout: 150 });
  try {
    const client = S.storage.connect();
    client.watch(() => {});
    const other = S.lab.other(S.path);
    await other.execAsync('BEGIN IMMEDIATE');
    let built = 0;
    let settled = null;
    const begins = () => lines(S.lab, 'w1').filter((line) => line.includes('BEGIN IMMEDIATE')).length;
    const before = begins();
    const write = await elapsed(
      () =>
        new Promise((resolve) => {
          client.write('cat', (current) => (built++, current), (ok) => resolve((settled = ok)));
        }),
    );
    assert.deepEqual([settled, built, begins() - before], [false, 0, 1], 'build не вызван, одна попытка BEGIN');
    assert.ok(!lines(S.lab, 'w1').slice(-2).some((line) => line.includes('SELECT')), 'ничего не прочитано');
    const calls = { decide: 0, show: 0 };
    const day = await elapsed(() => S.scenes.reserve(() => (calls.decide++, { v: 1, day: DAY, by: 'x' }), () => calls.show++));
    assert.deepEqual([day.value, calls], ['fail', { decide: 0, show: 0 }]);
    t.diagnostic(`busy_timeout 150 мс: запись отказала через ${write.ms.toFixed(0)} мс, резервирование — через ${day.ms.toFixed(0)} мс`);
    assert.ok(write.ms >= 140 && day.ms >= 140, `ожидание не короче busy_timeout: ${write.ms}, ${day.ms}`);
    await other.execAsync('ROLLBACK');
    assert.equal(await new Promise((resolve) => client.write('cat', (current) => JSON.stringify({ ...JSON.parse(current), name: 'Барсик' }), resolve)), true);
    assert.equal(S.lab.writers.length, 1, 'соединение записи то же: занятый файл — не повод для сброса');
    client.close();
  } finally {
    await S.close();
  }
  // Значение по умолчанию: замер одного отказа.
  const D = await sqliteSite({ cat: MARS }, { busyTimeout: 'default' });
  try {
    const other = D.lab.other(D.path);
    await other.execAsync('BEGIN IMMEDIATE');
    const core = makeCore(D.storage);
    const result = await elapsed(() => core.setName('Барсик').save.done);
    await other.execAsync('ROLLBACK');
    t.diagnostic(`busy_timeout по умолчанию ${BUSY_MS} мс: отказ записи через ${result.ms.toFixed(0)} мс`);
    assert.equal(result.value, 'failed');
    assert.ok(result.ms >= BUSY_MS - 20 && result.ms < BUSY_MS + 1500, String(result.ms));
    core.destroy();
  } finally {
    await D.close();
  }
});

test('§ 8.7.2 на двух соединениях: Q подтвердил «Барсик», A ставит то же по устаревшему кэшу — BEGIN IMMEDIATE, SELECT, ROLLBACK без INSERT; сверку поглощают A и B до settle; оба и новое D — «Барсик», saved; B — одно обновление; чужое имя и своя motion — вместе', async () => {
  const S = await sqliteSite({ cat: { v: 1, name: 'Марс' } });
  try {
    const P = await peer(S);
    const list = [];
    const watched = spy(S.storage, list, ['a', 'b', 'd']);
    const A = makeCore(watched);
    const B = makeCore(watched);
    const C = makeCore(P.storage);
    const got = { a: [], b: [] };
    A.subscribe((update) => got.a.push(`${update.reason} ${update.snapshot.name.display} ${update.snapshot.save.cat.status}`), { initial: false });
    B.subscribe((update) => got.b.push(`${update.reason} ${update.snapshot.name.display} ${update.snapshot.prefs.motion}`), { initial: false });
    assert.equal(await C.setName('Барсик').save.done, 'saved', 'шаг 1: транзакция Q до COMMIT');
    list.length = 0;
    const mark = S.lab.journal.length;
    const same = A.setName('Барсик');
    assert.equal(same.save.status, 'pending');
    assert.equal(await same.save.done, 'saved');
    assert.deepEqual(S.lab.journal.slice(mark).map((line) => line.split(' ').slice(0, 3).join(' ')), ['w1 exec BEGIN', 'w1 get SELECT', 'w1 exec ROLLBACK'], 'писать нечего — ROLLBACK, блокировка снята');
    assert.deepEqual(list.filter((line) => /^(absorb|settle)/.test(line)), ['absorb a cat', 'absorb b cat', 'settle a true']);
    assert.deepEqual([got.a, got.b], [['setName Барсик pending', 'save Барсик saved'], ['storage Барсик normal']]);
    assert.equal(await S.storage.load(), 'ready');
    const D = makeCore(watched);
    assert.deepEqual([A.getState().name.display, B.getState().name.display, D.getState().name.display, A.getState().save.cat.status], ['Барсик', 'Барсик', 'Барсик', 'saved'], 'ни read, ни память не возвращаются к «Марс»');
    // Чужая правка и своя запись другого поля: Q — имя «Пиксель», A — motion по устаревшему кэшу.
    assert.equal(await C.setName('Пиксель').save.done, 'saved');
    const before = got.b.length;
    const moved = A.setPreferences({ motion: 'none' });
    assert.equal(await moved.save.done, 'saved');
    assert.deepEqual(await S.json('cat'), { v: 1, name: 'Пиксель', motion: 'none' }, 'INSERT по свежему SELECT: чужое имя и своя motion');
    assert.deepEqual(got.b.slice(before), ['storage Пиксель none'], 'сверка и своя запись в одной фиксации — одно обновление B');
    for (const core of [A, B, C, D]) core.destroy();
  } finally {
    await S.close();
  }
});

test('§ 8.7.2, отказы после чтения: SELECT отказал (инъекция) — прежний кэш, failed; build бросил и INSERT отказал (инъекция) — свежее чужое всё равно поглощено, failed', async () => {
  const S = await sqliteSite({ cat: { v: 1, name: 'Марс' } });
  try {
    const A = makeCore(S.storage);
    const B = makeCore(S.storage);
    await S.put('cat', { v: 1, name: 'Барсик' });
    S.failRead('cat');
    const unread = A.setPreferences({ motion: 'none' });
    assert.equal(await unread.save.done, 'failed');
    assert.deepEqual([A.getState().name.display, B.getState().name.display, A.getState().save.cat.unsaved], ['Марс', 'Марс', ['motion']], 'SELECT отказал — сверки нет');
    // build бросил после чтения (прямое подключение): прочитанное подтверждено и поглощено.
    const client = S.storage.connect();
    client.watch(() => {});
    const threw = await new Promise((resolve) =>
      client.write('cat', () => {
        throw new Error('build бросил');
      }, resolve),
    );
    client.close();
    assert.deepEqual([threw, A.getState().name.display, B.getState().name.display], [false, 'Барсик', 'Барсик']);
    await S.put('cat', { v: 1, name: 'Пиксель' });
    S.failWrite('cat');
    const refused = A.setPreferences({ motion: 'calm' });
    assert.equal(await refused.save.done, 'failed');
    assert.deepEqual([A.getState().name.display, B.getState().name.display, (await S.json('cat')).motion], ['Пиксель', 'Пиксель', undefined], 'INSERT отказал — чужое поглощено, своё не записано');
    A.destroy();
    B.destroy();
  } finally {
    await S.close();
  }
});

test('настоящие отказы SQLite после чтения: SQLITE_FULL (max_page_count) — SQLite сам откатил, ROLLBACK «нет транзакции», соединение не сброшено; RAISE в триггере приложения; COMMIT при читателе в режиме DELETE — блокировка, ROLLBACK, затем запись проходит', async () => {
  const S = await sqliteSite({ cat: { v: 1, name: 'Марс' } }, { mode: 'delete' });
  try {
    const A = makeCore(S.storage);
    await S.put('look', { v: 1, cat: 'tuxedo' });
    // SQLITE_FULL: у соединения записи предел страниц — текущий размер; большое значение не помещается.
    const pages = (await S.lab.writers[0].getFirstAsync('PRAGMA page_count')).page_count;
    await S.lab.writers[0].execAsync(`PRAGMA max_page_count = ${pages}`);
    const client = S.storage.connect();
    client.watch(() => {});
    const full = await new Promise((resolve) => client.write('look', (current) => JSON.stringify({ ...JSON.parse(current), big: 'х'.repeat(200_000) }), resolve));
    assert.equal(full, false);
    assert.equal(A.getState().look.coat, 'tuxedo', 'чтение подтверждено — чужое поглощено');
    const tail = lines(S.lab, 'w1').slice(-3).map((line) => line.split(' ').slice(1, 3).join(' '));
    assert.deepEqual(tail, ['run INSERT', 'exec ROLLBACK', 'inTx '].map((line) => line.trim()), 'ROLLBACK не удался — проверка транзакции');
    assert.equal(S.lab.writers.length, 1, 'транзакции нет — соединение не сброшено');
    await S.lab.writers[0].execAsync('PRAGMA max_page_count = 1073741823');
    // RAISE в триггере приложения — настоящая ошибка INSERT; транзакция открыта, ROLLBACK удаётся.
    await S.app.execAsync("CREATE TRIGGER deny_look BEFORE INSERT ON pet_kv WHEN NEW.key = 'look:v1' BEGIN SELECT RAISE(ABORT, 'приложение запретило'); END");
    const raised = A.setAppearance({ coat: 'ginger' });
    assert.equal(await raised.save.done, 'failed');
    assert.equal(lines(S.lab, 'w1').at(-1).split(' ').slice(1, 3).join(' '), 'exec ROLLBACK');
    await S.app.execAsync('DROP TRIGGER deny_look');
    // COMMIT при читателе (режим DELETE): соединение приложения держит транзакцию чтения — COMMIT ждёт и отказывает.
    await S.put('cat', { v: 1, name: 'Пиксель' });
    await S.app.execAsync('BEGIN');
    await S.app.getFirstAsync('SELECT count(*) AS n FROM pet_kv');
    const blocked = A.setPreferences({ motion: 'none' });
    assert.equal(await blocked.save.done, 'failed');
    assert.deepEqual(lines(S.lab, 'w1').slice(-4).map((line) => line.split(' ').slice(1, 3).join(' ')), ['get SELECT', 'run INSERT', 'exec COMMIT', 'exec ROLLBACK']);
    assert.equal(A.getState().name.display, 'Пиксель', 'свежее чужое поглощено и при отказе COMMIT');
    await S.app.execAsync('COMMIT');
    assert.equal((await S.json('cat')).motion, undefined, 'частичной записи нет');
    assert.equal(await A.setPreferences({ motion: 'calm' }).save.done, 'saved', 'блокировка снята: следующая запись проходит (уносит и несохранённое)');
    assert.equal((await S.json('cat')).motion, 'calm');
    assert.equal(S.log.list.filter((line) => line.includes('не WAL')).length, 1, 'режим DELETE — одно предупреждение');
    client.close();
    A.destroy();
  } finally {
    await S.close();
  }
});

test('ROLLBACK не удался (инъекция): транзакция открыта — соединение записи закрыто, следующая операция на новом и проходит, блокировки не осталось; путь без записи остаётся успешным; ошибка проверки транзакции — «открыта»', async () => {
  const S = await sqliteSite({ cat: { v: 1, name: 'Марс' } });
  try {
    const A = makeCore(S.storage);
    const B = makeCore(S.storage);
    await S.put('cat', { v: 1, name: 'Барсик' });
    S.lab.fail('ROLLBACK', { who: 'w1', op: 'exec', message: 'ROLLBACK: инъекция отказа' });
    const same = A.setName('Барсик');
    assert.equal(await same.save.done, 'saved', 'без записи после подтверждённого чтения — успех и при ошибке завершения');
    assert.deepEqual([A.getState().name.display, B.getState().name.display], ['Барсик', 'Барсик']);
    assert.deepEqual(lines(S.lab, 'w1').slice(-3).map((line) => line.split(' ').slice(1, 3).join(' ').trim()), ['exec ROLLBACK', 'inTx', 'close'], 'транзакция открыта — соединение закрыто');
    const other = S.lab.other(S.path);
    await other.execAsync('BEGIN IMMEDIATE');
    await other.execAsync('ROLLBACK');
    assert.equal(await A.setName('Пиксель').save.done, 'saved', 'следующая операция — на новом соединении');
    assert.deepEqual([S.lab.writers.length, lines(S.lab, 'w2').some((line) => line.includes('COMMIT'))], [2, true]);
    // После отказа INSERT ROLLBACK не удался, а проверка транзакции бросила: считается открытой — сброс; итог — failed.
    S.failWrite('cat');
    S.lab.fail('ROLLBACK', { who: 'w2', op: 'exec', message: 'ROLLBACK: инъекция отказа' });
    S.lab.fail(() => true, { who: 'w2', op: 'inTx', message: 'проверка транзакции: инъекция отказа' });
    assert.equal(await A.setName('Дымок').save.done, 'failed');
    assert.equal(lines(S.lab, 'w2').at(-1).split(' ')[1], 'close');
    assert.equal(await A.setName('Уголёк').save.done, 'saved');
    assert.equal(S.lab.writers.length, 3);
    A.destroy();
    B.destroy();
  } finally {
    await S.close();
  }
});

test('закрытие соединения записи не удалось (инъекция): предупреждение журнала после мьютекса; блокировку держит неисправное соединение — следующие записи честно отказывают; закрыли — снова проходят', async () => {
  const S = await sqliteSite({ cat: MARS }, { busyTimeout: 100 });
  try {
    const A = makeCore(S.storage);
    S.failWrite('cat');
    S.lab.fail('ROLLBACK', { who: 'w1', op: 'exec', message: 'ROLLBACK: инъекция отказа' });
    S.lab.fail(() => true, { who: 'w1', op: 'close', message: 'close: инъекция отказа' });
    assert.equal(await A.setName('Барсик').save.done, 'failed');
    assert.equal(S.log.list.filter((line) => line.includes('не закрылось')).length, 1);
    assert.equal(await A.setName('Пиксель').save.done, 'failed', 'w1 держит открытую транзакцию — новое соединение получает занятый файл');
    assert.ok(lines(S.lab, 'w2').some((line) => line.includes('BEGIN IMMEDIATE')));
    await S.lab.writers[0].closeAsync();
    assert.equal(await A.setName('Дымок').save.done, 'saved', 'неисправное закрыто — блокировка снята');
    A.destroy();
  } finally {
    await S.close();
  }
});

test('режим журнала и настройки приложения не меняются: только PRAGMA busy_timeout и чтение journal_mode на своём соединении; WAL — без предупреждения; параметры привязываются; инициализация только добавляет — чужие таблицы, строки и столбцы целы; таблица без ключа — честный отказ', async () => {
  const L = await lab();
  try {
    const path = L.file('app.db');
    const app = L.other(path);
    await app.execAsync('PRAGMA journal_mode = WAL');
    await app.execAsync("CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT); INSERT INTO notes (text) VALUES ('своё');");
    await app.execAsync("CREATE TABLE pet_kv (ns TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, note TEXT DEFAULT 'приложение', PRIMARY KEY (ns, key)); INSERT INTO pet_kv (ns, key, value, note) VALUES ('x', 'cat:v1', '{\"v\":1}', 'метка');");
    const ns = "q'; DROP TABLE notes; --";
    const log = journal();
    const storage = sqliteStorage({ db: app, namespace: ns, busyTimeout: 200, log: log.port }, L.open);
    assert.equal(await storage.load(), 'ready');
    const core = makeCore(coordinatorOf(storage));
    assert.equal(await core.setName('Барсик').save.done, 'saved');
    await app.runAsync("UPDATE pet_kv SET note = 'своя метка' WHERE ns = ?", [ns]);
    assert.equal(await core.setName('Пиксель').save.done, 'saved');
    const rows = await app.getFirstAsync('SELECT count(*) AS n FROM notes');
    assert.equal(rows.n, 1, 'чужая таблица цела: namespace — параметр, не текст SQL');
    assert.deepEqual({ ...(await app.getFirstAsync('SELECT value, note FROM pet_kv WHERE ns = ?', [ns])) }, { value: '{"v":1,"name":"Пиксель"}', note: 'своя метка' }, 'UPSERT меняет только value');
    assert.equal((await app.getFirstAsync("SELECT note FROM pet_kv WHERE ns = 'x'")).note, 'метка');
    assert.equal((await app.getFirstAsync('PRAGMA journal_mode')).journal_mode, 'wal');
    const pragmas = L.journal.filter((line) => line.startsWith('w') && /PRAGMA/i.test(line));
    assert.deepEqual(pragmas.map((line) => line.split(' ').slice(2).join(' ')), ['PRAGMA busy_timeout = 200', 'PRAGMA journal_mode'], 'режим журнала и synchronous не переключаются');
    assert.ok(!L.journal.some((line) => line.startsWith('w') && line.split(' [')[0].includes('DROP')), 'текст namespace в SQL не попал (он — параметр)');
    assert.deepEqual(log.list, [], 'WAL — без предупреждения');
    core.destroy();
    // Таблица приложения без ключа (ns, key): запись не дублирует строки — честный отказ.
    const bare = L.other(L.file('bare.db'));
    await bare.execAsync('CREATE TABLE pet_kv (ns TEXT, key TEXT, value TEXT)');
    const plain = sqliteStorage({ db: bare, namespace: 'p', busyTimeout: 200, log: journal().port }, L.open);
    assert.equal(await plain.load(), 'ready');
    const refused = makeCore(coordinatorOf(plain));
    assert.equal(await refused.setName('Барсик').save.done, 'failed');
    assert.equal((await bare.getFirstAsync('SELECT count(*) AS n FROM pet_kv')).n, 0);
    refused.destroy();
  } finally {
    await L.close();
  }
});
