// Общий контракт хранения (PL09; docs/ARCHITECTURE.md § 8.1–8.8, § 8.10) — одни и те же смысловые сценарии на двух
// асинхронных стендах test/native-kit.mjs: хранилище координатора с get/set обещаниями и настоящий SQLite (адаптер
// pet/storage/sqlite.mjs, node:sqlite, своё соединение записи, участок BEGIN IMMEDIATE → SELECT → build → INSERT/COMMIT либо
// ROLLBACK). Веб-контроли синхронного координатора остаются в core-storage.test.mjs. Ключа нет, повреждение, более новая
// схема, неизвестные поля и ID; отказ загрузки — без неявных записей и ложного saved; два ядра — разные поля одного ключа,
// одно поле — порядок очереди и честный поздний отказ; следующая операция — по подтверждённому предыдущей; старый успех не
// снимает pending новой; отказ → unsaved → следующая правка; partial у двух ключей; автор — settle, остальные —
// поглощение, внешнее изменение — всем, включая автора; ни вложенной фиксации, ни доставки между записью и settle; done —
// один раз и без отказа; барьер load; destroy с операциями в очереди и новое ядро. SQLite-отказы здесь — инъекции метода
// драйвера (failRead, failWrite); настоящие отказы SQLite — native-sqlite.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DAY, host, make, spy } from './core-kit.mjs';
import { asyncSite, sqliteSite } from './native-kit.mjs';

const MARS = { v: 1, name: 'Марс', motion: 'normal', seenStage: 0, greetDay: DAY };
const SITES = { async: asyncSite, sqlite: sqliteSite };
// Ядро проверок с ручными портами core-kit (make) — на координаторе или его шпионе.
const makeCore = (storage, parts) => make(storage, parts).core;
const view = (core) => {
  const state = core.getState();
  return { name: state.name.display, motion: state.prefs.motion, status: state.save.cat.status };
};

for (const [kind, site] of Object.entries(SITES)) {
  test(`${kind}: ключа нет, повреждение, более новая схема — показ по понятому; неявная запись повреждённое не трогает, явная заменяет; неизвестные поля, ID и больший v сохраняются`, async () => {
    const S = await site({ cat: { ...MARS, v: 3, future: { x: 1 } }, look: { v: 2, cat: 'smoke', 'example.bunny': 'white', extra: [1] }, treat: '{' });
    try {
      const A = makeCore(S.storage);
      assert.deepEqual([A.getState().name.display, A.getState().look.coat, A.getState().save.treat.corrupt, A.getState().save.companion.status], ['Марс', 'smoke', true, 'saved']);
      const named = A.setName('Барсик');
      const coat = A.setAppearance({ coat: 'ginger' });
      assert.deepEqual([named.save.status, coat.save.status], ['pending', 'pending']);
      assert.deepEqual([await named.save.done, await coat.save.done], ['saved', 'saved']);
      assert.deepEqual(await S.json('cat'), { ...MARS, v: 3, future: { x: 1 }, name: 'Барсик' }, 'неизвестное поле и больший v остались');
      assert.deepEqual(await S.json('look'), { v: 2, cat: 'ginger', 'example.bunny': 'white', extra: [1] }, 'чужой ID и неизвестное поле остались');
      assert.equal(await S.raw('companion'), null, 'ключа не было — и не появился');
      // Повреждённый cat: неявная запись (приветствие дня при запуске) его не заменяет; явная правка — заменяет.
      const B = await site({ cat: '{' });
      try {
        const core = makeCore(B.storage, { counts: host(0, 0) });
        assert.equal(core.getState().save.cat.corrupt, true);
        core.start();
        await B.idle();
        assert.equal(await B.raw('cat'), '{', 'неявная запись повреждённое не трогает');
        assert.notEqual(core.getState().save.cat.status, 'pending');
        const explicit = core.setName('Пиксель');
        assert.equal(await explicit.save.done, 'saved');
        assert.equal((await B.json('cat')).name, 'Пиксель', 'явная правка заменила повреждённое');
        core.destroy();
      } finally {
        await B.close();
      }
      A.destroy();
    } finally {
      await S.close();
    }
  });

  test(`${kind}: отказ загрузки — ядро без записей (unavailable), неявных записей и ложного saved нет; повторная загрузка — снова ready`, async () => {
    const S = await site({ cat: MARS, look: { v: 1, cat: 'smoke' } }, { load: false });
    try {
      S.failRead('look');
      assert.equal(await S.storage.load(), 'failed');
      const before = S.writes();
      const core = makeCore(S.storage, { counts: host(0, 0) });
      core.start();
      const named = core.setName('Барсик');
      assert.deepEqual([named.ok, named.save.status, core.getState().save.cat.status, core.getState().name.display], [true, 'failed', 'unavailable', 'Барсик']);
      assert.ok(!('done' in named.save));
      await S.idle();
      assert.deepEqual([S.writes(), (await S.json('cat')).name], [before, 'Марс'], 'ни одной записи');
      core.destroy();
      assert.equal(await S.storage.load(), 'ready', 'повторная загрузка — новая попытка');
      const next = makeCore(S.storage);
      assert.equal(await next.setName('Пиксель').save.done, 'saved');
      assert.equal((await S.json('cat')).name, 'Пиксель');
      next.destroy();
    } finally {
      await S.close();
    }
  });

  test(`${kind}: два ядра, разные поля одного ключа — B ждёт в общей очереди и строится по подтверждённому A; обе правки, автор — settle, другой — поглощение`, async () => {
    const S = await site({ cat: MARS });
    try {
      const list = [];
      const watched = spy(S.storage, list, ['a', 'b']);
      const A = makeCore(watched);
      const B = makeCore(watched);
      list.length = 0;
      const named = A.setName('Барсик');
      const moved = B.setPreferences({ motion: 'none' });
      assert.deepEqual([named.save.status, moved.save.status, view(A), view(B)], ['pending', 'pending', { name: 'Барсик', motion: 'normal', status: 'pending' }, { name: 'Марс', motion: 'none', status: 'pending' }]);
      assert.equal(await named.save.done, 'saved');
      assert.deepEqual(view(B), { name: 'Барсик', motion: 'none', status: 'pending' }, 'B поглотил A1, его патч поверх, B1 ещё не подтверждена');
      assert.equal(await moved.save.done, 'saved');
      assert.deepEqual(await S.json('cat'), { ...MARS, name: 'Барсик', motion: 'none' }, 'B1 построена по подтверждённому A1, не по заранее собранному');
      for (const core of [A, B]) assert.deepEqual(view(core), { name: 'Барсик', motion: 'none', status: 'saved' });
      const lines = list.filter((line) => /^(settle|absorb)/.test(line));
      assert.deepEqual(lines, ['absorb b cat', 'settle a true', 'absorb a cat', 'settle b true'], 'каждую операцию каждое ядро обработало один раз');
      A.destroy();
      B.destroy();
    } finally {
      await S.close();
    }
  });

  test(`${kind}: одно поле — побеждает поставленная позже; её поздний отказ честен (unsaved у B), следующая подтверждённая чужая правка его заменяет`, async () => {
    const S = await site({ cat: MARS });
    try {
      const A = makeCore(S.storage);
      const B = makeCore(S.storage);
      A.setName('Барсик');
      const late = B.setName('Пиксель');
      assert.equal(await late.save.done, 'saved');
      assert.deepEqual([A.getState().name.display, B.getState().name.display, (await S.json('cat')).name], ['Пиксель', 'Пиксель', 'Пиксель']);
      S.failWrite('cat', { skip: 1 });
      const first = A.setName('Дымок');
      const second = B.setName('Рыжик');
      assert.deepEqual([await first.save.done, await second.save.done], ['saved', 'failed']);
      assert.deepEqual([A.getState().name.display, B.getState().name.display, B.getState().save.cat.unsaved, B.getState().save.cat.status, (await S.json('cat')).name], ['Дымок', 'Рыжик', ['name'], 'failed', 'Дымок']);
      assert.equal(await A.setName('Уголёк').save.done, 'saved');
      assert.deepEqual([B.getState().name.display, B.getState().save.cat.status], ['Уголёк', 'saved'], 'подтверждённая чужая правка новее несохранённой');
      A.destroy();
      B.destroy();
    } finally {
      await S.close();
    }
  });

  test(`${kind}: старый успех не снимает pending новой правки; отказ → unsaved → следующая явная правка уносит несохранённое`, async () => {
    const S = await site({ cat: MARS });
    try {
      const A = makeCore(S.storage);
      const first = A.setName('Барсик');
      const second = A.setName('Пиксель');
      assert.equal(await first.save.done, 'saved');
      assert.deepEqual(view(A), { name: 'Пиксель', motion: 'normal', status: 'pending' }, 'подтверждение старой правки не сохраняет новую');
      assert.equal(await second.save.done, 'saved');
      assert.equal(view(A).status, 'saved');
      S.failWrite('cat');
      const failed = A.setName('Дымок');
      assert.equal(await failed.save.done, 'failed');
      assert.deepEqual(A.getState().save.cat, { status: 'failed', pending: [], unsaved: ['name'], corrupt: false });
      const next = A.setPreferences({ motion: 'calm' });
      assert.deepEqual(A.getState().save.cat.pending, ['name', 'motion'], 'несохранённое перешло в новую операцию');
      assert.equal(await next.save.done, 'saved');
      assert.deepEqual([(await S.json('cat')).name, (await S.json('cat')).motion, A.getState().save.cat.status], ['Дымок', 'calm', 'saved']);
      A.destroy();
    } finally {
      await S.close();
    }
  });

  test(`${kind}: команда с двумя ключами — results по ключам и partial; межключевой транзакции нет`, async () => {
    const S = await site({ cat: { ...MARS, seenStage: 1 } });
    try {
      const A = makeCore(S.storage, { counts: host(3, 1) });
      A.refresh();
      await S.idle();
      S.failWrite('look');
      const both = A.setAppearance({ coat: 'ginger', accessory: 'plaid' });
      assert.deepEqual([both.save.status, both.save.keys, both.save.results], ['pending', ['look', 'cat'], { look: 'pending', cat: 'pending' }]);
      assert.equal(await both.save.done, 'partial');
      assert.deepEqual([A.getState().save.look.status, A.getState().save.cat.status, (await S.json('cat')).accessory, await S.raw('look')], ['failed', 'saved', 'plaid', null], 'cat подтверждён, look — нет: каждый ключ сам по себе');
      A.destroy();
    } finally {
      await S.close();
    }
  });

  test(`${kind}: внешнее изменение (другой процесс) и запись того же значения по устаревшему кэшу — без записи; сверку поглощают все, включая автора, до его settle; B — одно обновление; новое ядро после load — то же`, async () => {
    const S = await site({ cat: { v: 1, name: 'Марс' } });
    try {
      const list = [];
      const watched = spy(S.storage, list, ['a', 'b', 'd']);
      const A = makeCore(watched);
      const B = makeCore(watched);
      const got = { a: [], b: [] };
      A.subscribe((update) => got.a.push(`${update.reason} ${update.snapshot.name.display} ${update.snapshot.save.cat.status}`), { initial: false });
      B.subscribe((update) => got.b.push(`${update.reason} ${update.snapshot.name.display}`), { initial: false });
      await S.put('cat', { v: 1, name: 'Барсик' });
      const writes = S.writes();
      list.length = 0;
      const same = A.setName('Барсик');
      assert.deepEqual([same.changed, same.save.status], [true, 'pending'], 'асинхронно решение по подтверждённому в процессе (кэш «Марс»)');
      assert.equal(await same.save.done, 'saved');
      assert.equal(S.writes(), writes, 'next === current — записи нет');
      assert.deepEqual(list.filter((line) => /^(settle|absorb)/.test(line)), ['absorb a cat', 'absorb b cat', 'settle a true'], 'сверка — всем, включая автора, до его settle');
      assert.deepEqual([got.a, got.b], [['setName Барсик pending', 'save Барсик saved'], ['storage Барсик']]);
      assert.deepEqual([view(A).name, view(B).name, view(A).status], ['Барсик', 'Барсик', 'saved']);
      assert.equal(await S.storage.load(), 'ready');
      const D = makeCore(watched);
      assert.equal(D.getState().name.display, 'Барсик');
      // Кэш уже совпадает: операция без изменения — ни поглощений, ни обновлений у B.
      const client = watched.connect();
      let settled = null;
      client.write('cat', (current) => current, (ok) => (settled = ok));
      await S.idle();
      client.close();
      assert.deepEqual([settled, got.b.length], [true, 1]);
      for (const core of [A, B, D]) core.destroy();
    } finally {
      await S.close();
    }
  });

  test(`${kind}: нет вложенной фиксации и доставки между записью и settle — команда слушателя B встаёт в очередь после settle A`, async () => {
    const S = await site({ cat: MARS });
    try {
      const list = [];
      const watched = spy(S.storage, list, ['a', 'b']);
      const A = makeCore(watched);
      const B = makeCore(watched);
      let asked = null;
      B.subscribe((update) => {
        if (update.reason === 'storage' && !asked) {
          list.push('deliver b');
          asked = B.setPreferences({ motion: 'calm' });
        }
      }, { initial: false });
      list.length = 0;
      const named = A.setName('Барсик');
      assert.equal(await named.save.done, 'saved');
      assert.equal(await asked.save.done, 'saved');
      const at = (line) => list.indexOf(line);
      assert.ok(at('absorb b cat') < at('settle a true') && at('settle a true') < at('deliver b') && at('deliver b') < at('write b cat'), list.join(' | '));
      assert.deepEqual(await S.json('cat'), { ...MARS, name: 'Барсик', motion: 'calm' });
      A.destroy();
      B.destroy();
    } finally {
      await S.close();
    }
  });

  test(`${kind}: done разрешается один раз и никогда не отклоняется — успех, отказ записи, отказ чтения; settle — один на операцию`, async () => {
    const S = await site({ cat: MARS });
    try {
      const list = [];
      const watched = spy(S.storage, list, ['a']);
      const A = makeCore(watched);
      list.length = 0;
      S.failWrite('cat', { skip: 1 });
      S.failRead('cat', { skip: 2 });
      const results = [A.setName('Барсик'), A.setName('Пиксель'), A.setName('Дымок')];
      const done = await Promise.allSettled(results.map((result) => result.save.done));
      assert.deepEqual(done.map((item) => [item.status, item.value]), [['fulfilled', 'saved'], ['fulfilled', 'failed'], ['fulfilled', 'failed']]);
      assert.deepEqual(list.filter((line) => line.startsWith('settle')), ['settle a true', 'settle a false', 'settle a false']);
      assert.deepEqual([(await S.json('cat')).name, A.getState().save.cat.unsaved], ['Барсик', ['name']], 'отказ чтения — без записи поверх непрочитанного');
      A.destroy();
    } finally {
      await S.close();
    }
  });

  test(`${kind}: барьер load ждёт принятых операций и сверяет кэш со свежим чтением без записей; позже поставленное новое ядро поглощает`, async () => {
    const S = await site({ cat: MARS });
    try {
      const A = makeCore(S.storage);
      const writes = S.writes();
      A.setName('Барсик');
      const loading = S.storage.load();
      assert.equal(S.storage.status, 'loading');
      assert.throws(() => makeCore(S.storage), { code: 'storage-not-loaded' });
      await S.put('look', { v: 1, cat: 'tuxedo' });
      assert.equal(await loading, 'ready');
      assert.equal(S.writes(), writes + 1, 'записала только A1, барьер — ничего');
      const C = makeCore(S.storage);
      // Внешнее look записано до чтения барьером (после постановки) — барьер мог прочитать его или нет: проверяем подтверждённое.
      assert.equal(C.getState().name.display, 'Барсик', 'операция до барьера подтверждена и видна новому ядру');
      await S.storage.load();
      assert.deepEqual([C.getState().look.coat, A.getState().look.coat], ['tuxedo', 'tuxedo'], 'сверка барьером раздала изменение');
      A.setPreferences({ motion: 'none' });
      await S.idle();
      assert.equal(C.getState().prefs.motion, 'none', 'позже поставленное — поглощено');
      A.destroy();
      C.destroy();
    } finally {
      await S.close();
    }
  });

  test(`${kind}: destroy в очереди (§ 8.7) — A1 самодостаточна, B1 строится по ней, поздний done A без обновлений A; C после барьера видит обе`, async () => {
    const S = await site({ cat: MARS });
    try {
      const list = [];
      const watched = spy(S.storage, list, ['a', 'b', 'c']);
      const A = makeCore(watched);
      const B = makeCore(watched);
      const seenA = [];
      A.subscribe((update) => seenA.push(update.reason), { initial: false });
      const named = A.setName('Барсик');
      const moved = B.setPreferences({ motion: 'none' });
      A.destroy();
      const dead = A.getState();
      seenA.length = 0;
      assert.equal(await named.save.done, 'saved', 'done A — действительный итог');
      assert.deepEqual([A.getState(), seenA], [dead, []], 'отключённый A не меняется и обновлений не получает');
      assert.deepEqual(view(B), { name: 'Барсик', motion: 'none', status: 'pending' });
      assert.equal(await S.storage.load(), 'ready');
      assert.equal(await moved.save.done, 'saved');
      const C = makeCore(watched);
      assert.deepEqual([view(C).name, view(C).motion], ['Барсик', 'none']);
      assert.ok(!list.includes('absorb a cat'), 'закрытое подключение ничего не поглощает');
      B.destroy();
      C.destroy();
    } finally {
      await S.close();
    }
  });

  test(`${kind}: destroy в очереди, отказ A1 и C до завершения — B1 ложится на прежнее, правка A потеряна; C читает подтверждённое и поглощает B1`, async () => {
    const S = await site({ cat: MARS });
    try {
      const A = makeCore(S.storage);
      const B = makeCore(S.storage);
      S.failWrite('cat');
      const named = A.setName('Барсик');
      const moved = B.setPreferences({ motion: 'none' });
      A.destroy();
      const C = makeCore(S.storage);
      assert.deepEqual([view(C).name, view(C).motion], ['Марс', 'normal'], 'C создан до подтверждений — только подтверждённое');
      assert.deepEqual([await named.save.done, await moved.save.done], ['failed', 'saved']);
      assert.deepEqual(await S.json('cat'), { ...MARS, motion: 'none' }, 'B1 легла на Марс; правка A потеряна, как перезагрузка');
      assert.deepEqual([view(C).name, view(C).motion, view(B).status], ['Марс', 'none', 'saved'], 'C поглотил B1');
      B.destroy();
      C.destroy();
    } finally {
      await S.close();
    }
  });
}
