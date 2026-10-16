// Резервирование дня сценки на SQLite (PL09; docs/ARCHITECTURE.md § 9.1–9.5): порт scenes ядра — createSqliteScenes
// (pet/storage/sqlite.mjs) на настоящем node:sqlite, хранение ключей — тот же файл и соединение записи (sqliteSite). Шлюзы
// драйвера вместо пауз: удержан SELECT дня — участок взят, решения ещё нет; удержан INSERT дня — показ начат, запись не
// подтверждена; удержан INSERT ключа — обычная запись держит мьютекс. Исходы shown, skip, fail, lost; два ядра одного
// резервирования; два независимых соединения (вторая копия модуля); разные namespace; очередь за обычной записью и
// устаревшая попытка; отмена и ручное действие до решения; destroy до решения, из random, часов и peek внутри решения, из
// планировщика во время начала показа, слушателем после начала; поздние shown и lost прежнего ядра; настоящие отказы INSERT
// (RAISE в триггере) и COMMIT (читатель в режиме DELETE) после начала показа; show бросил — дождались INSERT, затем
// ROLLBACK; повреждённый день не переписывается; мьютекс освобождён после каждого исхода; копия scene:v1 и её отказ не
// подменяют исход дня; необработанных отклонений нет. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PHRASE_MS, REACTIONS } from './legacy-rules.mjs';
import { coordinatorOf } from '../pet/core/storage.mjs';
import { SCENE_FRESH_MS } from '../pet/core/scenes.mjs';
import { DAY, flush, host, LEGACY_DISPLAY, life, series } from './core-kit.mjs';
import { sqliteSite } from './native-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };
const Q = await import('../pet/storage/sqlite.mjs?copy=reserve-peer');
const rejections = [];
process.on('unhandledRejection', (reason) => rejections.push(reason));
const playing = (L) => L.state().pose.reaction?.type ?? null;
const saved = (L, key, extra = {}) => L.core.notify('saved', { key, counted: true, ...extra });
const tail = (L, n) => L.S.lab.journal.filter((line) => line.startsWith('w')).slice(-n).map((line) => line.split(' ').slice(1, 4).join(' '));

// Порт с журналом шагов: read (decide вызван после SELECT), decide record / null, show / show threw, исход.
function logged(scenes, steps = []) {
  const self = { steps, calls: { reserve: 0, decide: 0, show: 0 }, outcomes: [] };
  self.port = {
    reserve(decide, show) {
      self.calls.reserve += 1;
      const result = scenes
        .reserve(
          (stored) => {
            self.calls.decide += 1;
            steps.push('read');
            const record = decide(stored);
            steps.push(record ? 'decide record' : 'decide null');
            return record;
          },
          () => {
            self.calls.show += 1;
            try {
              show();
              steps.push('show');
            } catch (error) {
              steps.push('show threw');
              throw error;
            }
          },
        )
        .then((outcome) => (steps.push(`→ ${outcome}`), outcome));
      self.outcomes.push(result);
      return result;
    },
  };
  self.last = () => self.outcomes.at(-1);
  return self;
}

// Ядро PL04.1+ с ручным временем на SQLite-стенде S (ключи и день — один файл), запущенное; steps — общий журнал.
function scened(S, { counts = host(1, 1), scenes = S.scenes, storage = S.storage, steps = [], ...parts } = {}) {
  const port = logged(scenes, steps);
  const L = life({}, { storage, counts, display: LEGACY_DISPLAY, scenes: port.port, ...parts });
  assert.equal(L.core.start().ok, true);
  return { ...L, S, port, steps };
}
// Занятие с выпавшей сценкой «потягивается» и конец радости — резервирование начато.
function attempt(L, key = 'K') {
  L.random.push(0, 0, 0);
  saved(L, key);
  assert.equal(L.state().scene.waiting?.type, 'stretch', 'попытка выбрана');
  L.plan.advance(REACTIONS.joy.ms);
  assert.equal(L.port.calls.reserve > 0, true, 'резервирование начато');
}
const holdDay = (S) => S.lab.hold(/^SELECT value FROM pet_scene/);
const holdPut = (S) => S.lab.hold(/^INSERT INTO pet_scene/);

test('shown: BEGIN IMMEDIATE → SELECT дня → decide → INSERT поставлен и show до его подтверждения → COMMIT; день в pet_scene, копия scene:v1 — отдельной операцией ядра (pending → saved); мьютекс свободен', async () => {
  const S = await sqliteSite({ cat: CAT, scene: { v: 2, day: '2026-10-12', cat: 'curl', future: [1] } });
  try {
    const L = scened(S);
    const put = holdPut(S);
    attempt(L);
    await put.reached;
    assert.deepEqual([L.steps, playing(L)], [['read', 'decide record', 'show'], 'stretch'], 'показ начат, INSERT ещё не выполнен');
    assert.equal(await S.day(), undefined, 'до COMMIT дня в файле нет');
    put.release();
    assert.equal(await L.port.last(), 'shown');
    assert.deepEqual(tail(L, 4).slice(0, 4).map((line) => line.split(' ').slice(0, 2).join(' ')), ['exec BEGIN', 'get SELECT', 'run INSERT', 'exec COMMIT'].slice(-4).map((x) => x));
    const day = JSON.parse(await S.day());
    assert.deepEqual(day, { v: 1, day: DAY, by: day.by, cat: 'stretch' });
    assert.equal(L.state().save.scene.status, 'pending', 'копия — отдельная обычная операция');
    await S.idle();
    assert.deepEqual(await S.json('scene'), { v: 2, day: DAY, cat: 'stretch', future: [1], by: day.by }, 'копия: неизвестные поля и больший v остались');
    assert.equal(L.state().save.scene.status, 'saved');
    assert.equal(await L.core.setName('Пиксель').save.done, 'saved', 'мьютекс освобождён');
    L.core.destroy();
  } finally {
    await S.close();
  }
});

test('два ядра одного резервирования: обе попытки — одна сценка (второе видит день первого под той же блокировкой); другой namespace того же файла — своя сценка', async () => {
  const S = await sqliteSite({ cat: CAT });
  try {
    const A = scened(S);
    const B = scened(S);
    const gate = holdDay(S);
    attempt(A, 'a');
    await gate.reached;
    attempt(B, 'b');
    gate.release();
    assert.deepEqual([await A.port.last(), await B.port.last()], ['shown', 'skip']);
    assert.deepEqual([playing(A), playing(B), B.port.calls.show], ['stretch', null, 0]);
    const N = await sqliteSite({ cat: CAT }, { ns: 'другое', L: S.lab, file: S.path });
    const other = scened(N);
    attempt(other);
    assert.equal(await other.port.last(), 'shown', 'другое пространство — своя сценка');
    for (const L of [A, B, other]) L.core.destroy();
  } finally {
    await S.close();
  }
});

test('два независимых соединения к одному файлу: блокировка записи до чтения — конкурент ждёт и видит подтверждённый день (skip); держит дольше busy_timeout — fail до decide и show', async () => {
  const S = await sqliteSite({ cat: CAT });
  try {
    const app = S.lab.other(S.path);
    await app.execAsync('PRAGMA busy_timeout = 5000');
    const peerStorage = coordinatorOf(Q.sqliteStorage({ db: app, namespace: S.ns, busyTimeout: 3000 }, S.lab.open));
    assert.equal(await peerStorage.load(), 'ready');
    const peerScenes = Q.sqliteScenes({ db: app, namespace: S.ns, busyTimeout: 3000 }, S.lab.open);
    const A = scened(S);
    const C = scened(S, { storage: peerStorage, scenes: peerScenes });
    const put = holdPut(S);
    attempt(A, 'a');
    await put.reached;
    const begin = S.lab.hold('BEGIN IMMEDIATE', { who: 'w2' });
    attempt(C, 'c');
    await begin.reached;
    begin.release();
    put.release();
    assert.deepEqual([await A.port.last(), await C.port.last()], ['shown', 'skip'], 'одна сценка на два соединения');
    assert.deepEqual([playing(C), C.port.calls.show], [null, 0]);
    // Q держит файл дольше busy_timeout P: P — fail до чтения, без decide и show; день свободен для следующего.
    const short = await sqliteSite({ cat: CAT }, { ns: 'b', busyTimeout: 100 });
    try {
      const other = short.lab.other(short.path);
      await other.execAsync('BEGIN IMMEDIATE');
      const P = scened(short);
      attempt(P);
      assert.equal(await P.port.last(), 'fail');
      assert.deepEqual([P.port.calls.decide, P.port.calls.show, playing(P)], [0, 0, null]);
      await other.execAsync('ROLLBACK');
      assert.equal(await short.day(), undefined);
      P.core.destroy();
    } finally {
      await short.close();
    }
    A.core.destroy();
    C.core.destroy();
  } finally {
    await S.close();
  }
});

test('очередь за обычной записью: резервирование ждёт мьютекс файла; за ожидание попытка устарела (> 10 с) — decide после ожидания: skip без постановки и показа', async () => {
  const S = await sqliteSite({ cat: CAT });
  try {
    const L = scened(S);
    await S.idle();
    const write = S.lab.hold(/^INSERT INTO pet_kv/);
    const named = L.core.setName('Пиксель');
    await write.reached;
    attempt(L);
    L.time.state.now += SCENE_FRESH_MS + 1;
    write.release();
    assert.equal(await named.save.done, 'saved');
    assert.equal(await L.port.last(), 'skip');
    assert.deepEqual([L.steps, L.port.calls.show, await S.day()], [['read', 'decide null', '→ skip'], 0, undefined]);
    L.core.destroy();
  } finally {
    await S.close();
  }
});

test('отмена до решения и ручное действие, закончившееся до освобождения очереди, — окончательный skip; destroy до решения — skip; после каждого исхода мьютекс свободен', async () => {
  const S = await sqliteSite({ cat: CAT });
  try {
    for (const [title, act] of [
      ['ввод', (L) => L.core.setContext({ typing: true })],
      ['кормление (кончилось до решения)', (L) => (L.core.feed(), L.plan.advance(REACTIONS.feed.ms + REACTIONS.fed.ms))],
      ['destroy', (L) => L.core.destroy()],
    ]) {
      const L = scened(S);
      const gate = holdDay(S);
      attempt(L);
      await gate.reached;
      act(L);
      gate.release();
      assert.equal(await L.port.last(), 'skip', title);
      assert.deepEqual([L.port.calls.show, await S.day()], [0, undefined], title);
      L.core.destroy();
      assert.equal(await S.storage.load(), 'ready', `${title}: мьютекс свободен`);
    }
  } finally {
    await S.close();
  }
});

// Ловушки отключения из портов (как core-reserve.test.mjs): random метки, часы и peek копии внутри решения, планировщик
// во время начала показа. peek — через обёртку координатора (асинхронный координатор отдаёт подтверждённое из кэша).
function trapped(S) {
  const box = { point: null, core: null, inner: null };
  const spring = (point) => {
    if (box.point !== point) return;
    box.point = null;
    box.inner = box.core.setName('Взлом');
    box.core.destroy();
  };
  const sequence = series();
  const random = { ...sequence, port: () => (spring('random'), sequence.port()) };
  const storage = {
    get status() {
      return S.storage.status;
    },
    load: () => S.storage.load(),
    connect() {
      const client = S.storage.connect();
      return { ...client, peek: (key) => (key === 'scene' && spring('peek'), client.peek(key)) };
    },
  };
  const scheduler = (plan) => ({ later: (ms, task) => (ms === REACTIONS.stretch.ms && spring('scheduler'), plan.port.later(ms, task)) });
  const L = scened(S, { random, storage, scheduler });
  L.core.subscribe((update) => L.steps.push(`deliver ${update.reason}`), { initial: false });
  box.core = L.core;
  const now = L.time.port.now;
  L.time.port.now = () => (spring('clock'), now());
  return { ...L, box, arm: (point) => (box.point = point) };
}
const from = (steps, first) => steps.slice(steps.indexOf(first));

for (const point of ['random', 'peek', 'clock']) {
  test(`destroy из порта внутри решения (${point}): reentrant, отключение в конце фазы решения — decide null, skip: ни INSERT, ни показа, ни дня; новое ядро показывает`, async () => {
    const S = await sqliteSite({ cat: CAT });
    try {
      const L = trapped(S);
      const gate = holdDay(S);
      attempt(L);
      await gate.reached;
      L.arm(point);
      gate.release();
      assert.equal(await L.port.last(), 'skip');
      assert.deepEqual(from(L.steps, 'read'), ['read', 'deliver destroyed', 'decide null', '→ skip'], L.steps.join(' | '));
      assert.deepEqual([L.box.inner?.error?.code, L.state().status, L.port.calls.show, await S.day()], ['reentrant', 'destroyed', 0, undefined]);
      assert.ok(!tail(L, 3).some((line) => line.includes('INSERT INTO pet_scene')));
      assert.equal(await S.storage.load(), 'ready');
      const C = scened(S);
      attempt(C, 'c');
      assert.deepEqual([await C.port.last(), playing(C)], ['shown', 'stretch'], 'день свободен');
      C.core.destroy();
    } finally {
      await S.close();
    }
  });
}

test('destroy из планировщика во время начала показа: show бросает после постановки INSERT — его дождались, затем ROLLBACK: lost, день свободен, копии нет; новое ядро показывает', async () => {
  const S = await sqliteSite({ cat: CAT });
  try {
    const L = trapped(S);
    const gate = holdDay(S);
    const put = holdPut(S);
    attempt(L);
    await gate.reached;
    L.arm('scheduler');
    gate.release();
    await put.reached;
    assert.deepEqual(from(L.steps, 'read'), ['read', 'decide record', 'deliver destroyed', 'show threw'], 'show бросил, INSERT ещё в пути');
    assert.ok(!S.lab.journal.slice(-1)[0].includes('ROLLBACK'), 'ROLLBACK не обгоняет поставленный INSERT');
    put.release();
    assert.equal(await L.port.last(), 'lost');
    assert.deepEqual(tail(L, 2).map((line) => line.split(' ').slice(0, 2).join(' ')), ['run INSERT', 'exec ROLLBACK']);
    assert.deepEqual([L.state().status, await S.day(), await S.raw('scene')], ['destroyed', undefined, null]);
    const C = scened(S);
    attempt(C, 'c');
    assert.equal(await C.port.last(), 'shown');
    C.core.destroy();
  } finally {
    await S.close();
  }
});

test('destroy слушателем после настоящего начала показа: транзакция не прерывается — shown, день остаётся, копии нет; новое ядро — второй сценки нет', async () => {
  const S = await sqliteSite({ cat: CAT });
  try {
    const L = trapped(S);
    L.core.subscribe((update) => update.snapshot.pose.reaction?.scene && L.core.destroy(), { initial: false });
    attempt(L);
    assert.equal(await L.port.last(), 'shown');
    assert.ok(from(L.steps, 'read').join(' ').startsWith('read decide record deliver scene deliver destroyed show'), L.steps.join(' | '));
    await S.idle();
    assert.deepEqual([L.state().status, JSON.parse(await S.day()).day, await S.raw('scene')], ['destroyed', DAY, null], 'копию отключённое ядро не пишет');
    const C = scened(S);
    attempt(C, 'c');
    assert.deepEqual([await C.port.last(), playing(C)], ['skip', null]);
    C.core.destroy();
  } finally {
    await S.close();
  }
});

test('поздний lost прежнего ядра (настоящий отказ INSERT — RAISE в триггере) не трогает новое ядро; lost своего ядра не снимает более новую реакцию; день свободен', async () => {
  const S = await sqliteSite({ cat: CAT });
  try {
    await S.app.execAsync("CREATE TRIGGER deny_day BEFORE INSERT ON pet_scene BEGIN SELECT RAISE(ABORT, 'приложение запретило'); END");
    const A = scened(S);
    const put = holdPut(S);
    attempt(A);
    await put.reached;
    A.core.destroy();
    const C = scened(S);
    saved(C, 'fresh');
    assert.equal(playing(C), 'joy');
    put.release();
    assert.equal(await A.port.last(), 'lost');
    await flush();
    assert.deepEqual([playing(C), await S.day(), tail(A, 1)[0].split(' ').slice(0, 2).join(' ')], ['joy', undefined, 'exec ROLLBACK']);
    C.core.destroy();
    const L = scened(S);
    const late = holdPut(S);
    attempt(L);
    await late.reached;
    saved(L, 'newer');
    assert.equal(playing(L), 'joy');
    late.release();
    assert.equal(await L.port.last(), 'lost');
    await flush();
    assert.equal(playing(L), 'joy', 'более новая реакция не снята');
    await S.app.execAsync('DROP TRIGGER deny_day');
    const N = scened(S);
    attempt(N, 'n');
    assert.equal(await N.port.last(), 'shown', 'после lost день свободен, мьютекс отпущен');
    L.core.destroy();
    N.core.destroy();
  } finally {
    await S.close();
  }
});

test('настоящий отказ COMMIT после начала показа (читатель в режиме DELETE): lost — своя текущая сценка остановлена, ROLLBACK, день свободен; читатель отпустил — следующая сценка показана', async () => {
  const S = await sqliteSite({ cat: CAT }, { mode: 'delete', busyTimeout: 100 });
  try {
    const L = scened(S);
    await S.idle();
    await S.app.execAsync('BEGIN');
    await S.app.getFirstAsync('SELECT count(*) AS n FROM pet_scene');
    const commit = S.lab.hold('COMMIT', { who: 'w1' });
    attempt(L);
    await commit.reached;
    assert.equal(playing(L), 'stretch', 'показ начат до COMMIT');
    commit.release();
    assert.equal(await L.port.last(), 'lost');
    await flush();
    assert.deepEqual(tail(L, 3).map((line) => line.split(' ').slice(0, 2).join(' ')), ['run INSERT', 'exec COMMIT', 'exec ROLLBACK']);
    assert.deepEqual([playing(L), L.state().phrase], [null, null], 'своя сценка остановлена исходом lost');
    await S.app.execAsync('COMMIT');
    assert.equal(await S.day(), undefined, 'частичной записи нет');
    L.plan.advance(REACTIONS.stretch.ms);
    attempt(L, 'K2');
    assert.equal(await L.port.last(), 'shown');
    L.core.destroy();
  } finally {
    await S.close();
  }
});

test('повреждённый день не становится свободным и не переписывается: не JSON и не строка — fail без decide; сохранённый null и не объект — decide видит как есть, skip', async () => {
  for (const [title, setup, outcome, decided] of [
    ['не JSON', "INSERT INTO pet_scene (ns, value) VALUES ('qa', '{')", 'fail', 0],
    ['не строка (BLOB)', "INSERT INTO pet_scene (ns, value) VALUES ('qa', X'00')", 'fail', 0],
    ['сохранённый null', "INSERT INTO pet_scene (ns, value) VALUES ('qa', 'null')", 'skip', 1],
    ['массив', `INSERT INTO pet_scene (ns, value) VALUES ('qa', '["${DAY}"]')`, 'skip', 1],
  ]) {
    const S = await sqliteSite({ cat: CAT });
    try {
      await S.app.execAsync(setup);
      const before = await S.app.getFirstAsync("SELECT value, typeof(value) AS type FROM pet_scene WHERE ns = 'qa'");
      const L = scened(S);
      attempt(L);
      assert.equal(await L.port.last(), outcome, title);
      assert.deepEqual([L.port.calls.decide, L.port.calls.show, playing(L)], [decided, 0, null], title);
      assert.deepEqual({ ...(await S.app.getFirstAsync("SELECT value, typeof(value) AS type FROM pet_scene WHERE ns = 'qa'")) }, { ...before }, `${title}: не переписан`);
      assert.equal(await L.core.setName('Пиксель').save.done, 'saved', `${title}: мьютекс свободен`);
      L.core.destroy();
    } finally {
      await S.close();
    }
  }
});

test('копия scene:v1 — отдельная обычная операция после shown: её отказ (инъекция) — failed копии, день подтверждён и исход shown не меняется; второй сценки в этот день нет', async () => {
  const S = await sqliteSite({ cat: CAT });
  try {
    S.failWrite('scene');
    const L = scened(S);
    attempt(L);
    assert.equal(await L.port.last(), 'shown');
    await S.idle();
    assert.deepEqual([L.state().save.scene.status, await S.raw('scene'), JSON.parse(await S.day()).day], ['failed', null, DAY]);
    L.plan.advance(REACTIONS.stretch.ms);
    L.random.push(0, 0, 0);
    saved(L, 'K2');
    L.plan.advance(REACTIONS.joy.ms);
    assert.equal(L.port.calls.reserve, 1, 'в памяти ядра копия с днём (несохранённой) — новой попытки нет');
    L.core.destroy();
    // Новое ядро: копии в файле нет — попытка есть, но запись дня под блокировкой решает: skip.
    assert.equal(await S.storage.load(), 'ready');
    const C = scened(S);
    attempt(C, 'c');
    assert.deepEqual([await C.port.last(), C.port.calls.show], ['skip', 0], 'день занят записью резервирования, даже без копии');
    C.core.destroy();
  } finally {
    await S.close();
  }
});

test('отказ планировщика при начале показа: show бросает — lost, ROLLBACK после INSERT; облако не начато; необработанных отклонений за весь набор нет', async () => {
  const S = await sqliteSite({ cat: CAT });
  try {
    const refusing = (plan) => ({ later: (ms, task) => (ms === REACTIONS.stretch.ms ? (() => { throw new Error('отказ планировщика'); })() : plan.port.later(ms, task)) });
    const L = scened(S, { scheduler: refusing });
    attempt(L);
    assert.equal(await L.port.last(), 'lost');
    assert.deepEqual([L.steps.slice(-2), playing(L), L.state().phrase, await S.day()], [['show threw', '→ lost'], null, null, undefined]);
    assert.ok(!L.steps.includes(`plan ${PHRASE_MS}`));
    L.core.destroy();
  } finally {
    await S.close();
  }
  await flush();
  assert.deepEqual(rejections, []);
});
