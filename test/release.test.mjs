// Цепочка выпуска (PL12; scripts/release.mjs, CONTRIBUTING.md «Выпуск», docs/RELEASES.md) без сети: игрушечный пакет
// pet-companion 9.8.7 в своём git с аннотированным тегом и origin (голый репозиторий), локальный реестр и API GitHub
// (test/registry-stub.mjs), поддельный gh (test/fakes/gh.mjs). Проверяется результат и отказ: архив — из коммита, а не из
// рабочих файлов; отпечатки не зависят от gzip; публикуется ровно записанный архив и только после зелёного CI тега с тем же
// содержимым; при каждом отказе реестр не получает публикации, а выпуск GitHub не создаётся; повтор ничего не меняет;
// verify находит подмену в реестре, на GitHub, перенос тега и коммит с другим содержимым.
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { consistency, digest, makeRecord, packFromGit, parseNotes, prepare, publish, readTar, ReleaseError, releaseNotes, run, verifyRelease } from '../scripts/release.mjs';
import { startStub } from './registry-stub.mjs';

const NAME = 'pet-companion';
const SLUG = 'test/pet-companion';
const V = '9.8.7';
const TAG = `v${V}`;
const FAKE_GH = fileURLToPath(new URL('./fakes/gh.mjs', import.meta.url));
const GIT = ['-c', 'user.name=release-test', '-c', 'user.email=release-test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'init.defaultBranch=main'];
const quiet = () => {};

let tmp;
let repo;
let commitA;
let commitB;
let stub;
let ghState;
let ghLog;
let gh;
let record;
let recordFile;
let ciRecord;

const git = (...args) => run('git', [...GIT, ...args], { cwd: repo }).then(({ stdout }) => stdout.trim());
const write = async (file, text) => {
  await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
  await writeFile(path.join(repo, file), text);
};
const setGh = async (patch) => {
  ghState = { ...ghState, ...patch };
  await writeFile(process.env.FAKE_GH_STATE, JSON.stringify(ghState));
};
const ghCalls = async () => (await readFile(ghLog, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
const greenRun = (sha = commitA) => ({ databaseId: 101, event: 'push', headBranch: TAG, headSha: sha, status: 'completed', conclusion: 'success', attempt: 1, url: 'https://ci.example/101', createdAt: '2026-10-20T10:00:00Z' });
const options = (extra = {}) => ({ repo, recordFile, registry: stub.registry, api: stub.api, gh, log: quiet, ...extra });

before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'pet-release-test-'));
  repo = path.join(tmp, 'repo');
  await mkdir(repo);
  // prepublishOnly, который всегда падает: npm publish архива его не запускает — защита выпуска не может на него опираться.
  await write('package.json', `${JSON.stringify({ name: NAME, version: V, type: 'module', repository: { type: 'git', url: `git+https://github.com/${SLUG}.git` }, files: ['pet/', 'manifest.json', 'CHANGELOG.md'], scripts: { prepublishOnly: 'node -e "process.exit(1)"' } }, null, 2)}\n`);
  await write('pet/core/version.mjs', `export const VERSION = '${V}';\n`);
  await write('pet/pet.mjs', 'export const hello = 1;\n');
  await write('manifest.json', `${JSON.stringify({ schema: 1, name: NAME, version: V })}\n`);
  await write('CHANGELOG.md', `# Изменения\n\n## ${V} — 2026-10-20\n\n- проверочная версия\n\n## 9.8.6 — 2026-10-01\n\n- прежняя\n`);
  await git('init', '--quiet');
  await git('add', '-A');
  await git('commit', '--quiet', '-m', 'A');
  commitA = await git('rev-parse', 'HEAD');
  await git('tag', '-a', TAG, '-m', `${NAME} ${V}`);
  // Коммит B после тега: другое содержимое модуля (для переноса тега и повторной упаковки чужого коммита).
  await write('pet/pet.mjs', 'export const hello = 2;\n');
  await git('commit', '--quiet', '-am', 'B');
  commitB = await git('rev-parse', 'HEAD');
  await run('git', [...GIT, 'init', '--quiet', '--bare', path.join(tmp, 'origin.git')]);
  await git('remote', 'add', 'origin', path.join(tmp, 'origin.git'));
  await git('push', '--quiet', 'origin', 'main', TAG);

  stub = await startStub();
  stub.tag(SLUG, TAG, { object: await git('rev-parse', `refs/tags/${TAG}`), commit: commitA });
  const npmrc = path.join(tmp, 'npmrc');
  await writeFile(npmrc, `${stub.registry.replace(/^http:/, '')}:_authToken=stub-token\n`);
  process.env.npm_config_userconfig = npmrc;
  ghLog = path.join(tmp, 'gh.log');
  process.env.FAKE_GH_STATE = path.join(tmp, 'gh.json');
  process.env.FAKE_GH_LOG = ghLog;
  gh = path.join(tmp, 'gh');
  await writeFile(gh, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_GH}" "$@"\n`);
  await chmod(gh, 0o755);

  ({ record } = await makeRecord({ repo, ref: TAG, out: path.join(tmp, 'release'), expectTag: TAG }));
  recordFile = path.join(tmp, 'release', 'record.json');
  // «CI»: та же упаковка коммита тега в другой папке — его запись артефакта.
  ({ record: ciRecord } = await makeRecord({ repo, ref: TAG, out: path.join(tmp, 'ci'), expectTag: TAG }));
  await setGh({ runs: [greenRun()], artifacts: { 101: ciRecord }, api: stub.api });
});

after(async () => {
  await stub?.close();
  delete process.env.npm_config_userconfig;
  await rm(tmp, { recursive: true, force: true });
});

test('архив: отпечатки содержимого не зависят от gzip; npm pack и разбор tar согласны; небезопасные записи видны', async () => {
  const packed = await packFromGit({ repo, ref: TAG, out: path.join(tmp, 'pack-a') });
  const bytes = await readFile(packed.file);
  const regzip = gzipSync(gunzipSync(bytes), { level: 1 });
  const a = digest(bytes);
  const b = digest(regzip);
  assert.notEqual(a.sha256, b.sha256, 'другой gzip — другие байты .tgz');
  assert.equal(a.tarSha256, b.tarSha256);
  assert.equal(a.filesSha256, b.filesSha256);
  assert.deepEqual(a.list.map((file) => file.path), ['package/CHANGELOG.md', 'package/manifest.json', 'package/package.json', 'package/pet/core/version.mjs', 'package/pet/pet.mjs']);
  assert.equal(a.pkg.version, V);
  assert.deepEqual(a.unsafe, []);
  // Ручной tar с записью «../evil» и ссылкой: такой архив помечается небезопасным.
  const header = (name, type, size) => {
    const block = Buffer.alloc(512);
    block.write(name, 0);
    block.write('0000644\0', 100);
    block.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
    block.write(type, 156);
    block.write('ustar\0', 257);
    block.write('00', 263);
    block.fill(' ', 148, 156);
    let sum = 0;
    for (const byte of block) sum += byte;
    block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    return block;
  };
  const evil = gzipSync(Buffer.concat([header('package/../evil', '0', 1), Buffer.alloc(512, 120), header('package/link', '2', 0), Buffer.alloc(1024)]));
  assert.deepEqual(digest(evil).unsafe, ['0 package/../evil', '2 package/link']);
  assert.equal(readTar(evil).entries.length, 2);
});

test('упаковка — из коммита: незакоммиченная правка не попадает, повтор — те же байты', async () => {
  await write('pet/pet.mjs', 'export const hello = "не закоммичено";\n');
  try {
    const first = await packFromGit({ repo, ref: TAG, out: path.join(tmp, 'pack-1') });
    const second = await packFromGit({ repo, ref: TAG, out: path.join(tmp, 'pack-2') });
    assert.equal(first.facts.sha256, second.facts.sha256);
    assert.equal(first.commit, commitA);
    assert.equal(first.facts.sha256, record.sha256);
    const module = readTar(await readFile(first.file)).entries.find((entry) => entry.path === 'package/pet/pet.mjs');
    assert.equal(module.data.toString(), 'export const hello = 1;\n');
  } finally {
    await git('checkout', '--', 'pet/pet.mjs');
  }
});

test('согласованность номера: package.json, manifest.json, VERSION и раздел CHANGELOG', async () => {
  assert.deepEqual(await consistency(repo, V), []);
  assert.deepEqual(await consistency(repo, '9.8.8'), ['package.json — 9.8.7', 'manifest.json — 9.8.7', 'VERSION — 9.8.7', 'в CHANGELOG.md нет раздела «## 9.8.8»']);
  await assert.rejects(makeRecord({ repo, ref: TAG, out: path.join(tmp, 'wrong-tag'), expectTag: 'v9.8.8' }), (error) => error instanceof ReleaseError && /тег v9\.8\.8, а версия пакета 9\.8\.7/.test(error.message));
});

test('описание выпуска: раздел CHANGELOG версии и контрольные суммы, которые читает verify', async () => {
  const notes = await releaseNotes({ repo, record, ci: { url: 'https://ci.example/101' } });
  assert.match(notes, /^- проверочная версия/);
  assert.doesNotMatch(notes, /прежняя/);
  assert.deepEqual(parseNotes(notes), { sha256: record.sha256, integrity: record.integrity });
  // Формат выпусков 0.2.1 и 0.2.3 на GitHub.
  assert.deepEqual(parseNotes('- SHA-256: `75d01a29e77df167208de2004e6aff15a8860f8a85284c95702926e46c793416`\n- npm integrity: `sha512-YuXmnfKZfYdxWtHza7Xj4xlhdFZ08TP91MGqESxDCtC4bPqWjQSVkqD/MDau5GuAX6l+ZMb40kKnrbN/wEgsHQ==`'), {
    sha256: '75d01a29e77df167208de2004e6aff15a8860f8a85284c95702926e46c793416',
    integrity: 'sha512-YuXmnfKZfYdxWtHza7Xj4xlhdFZ08TP91MGqESxDCtC4bPqWjQSVkqD/MDau5GuAX6l+ZMb40kKnrbN/wEgsHQ==',
  });
});

test('подготовка: отказ при грязном дереве, чужом номере, теге не на HEAD, занятом номере; кандидат — без тега', async () => {
  const out = path.join(tmp, 'prepare');
  const refused = (pattern) => (error) => error instanceof ReleaseError && pattern.test(error.message);
  await assert.rejects(prepare({ repo, version: '9.8.8', out, tests: false, registry: stub.registry, log: quiet }), refused(/не согласован/));
  await assert.rejects(prepare({ repo, version: V, out, tests: false, registry: stub.registry, log: quiet }), refused(/тег v9\.8\.7 на .*, а HEAD/));
  await assert.rejects(prepare({ repo, version: V, candidate: true, out, tests: false, registry: stub.registry, log: quiet }), refused(/тег v9\.8\.7 уже есть/));
  await write('untracked.txt', 'x');
  try {
    await assert.rejects(prepare({ repo, version: V, out, tests: false, registry: stub.registry, log: quiet }), refused(/рабочее дерево не чистое/));
  } finally {
    await rm(path.join(repo, 'untracked.txt'));
  }
  await git('checkout', '--quiet', TAG);
  try {
    const ready = await prepare({ repo, version: V, out, tests: false, registry: stub.registry, log: quiet });
    assert.equal(ready.record.sha256, record.sha256);
    assert.equal(ready.record.commit, commitA);
  } finally {
    await git('checkout', '--quiet', 'main');
  }
  assert.equal(stub.puts.length, 0);
});

test('публикация: каждый отказ — до реестра и GitHub; затем ровно записанный архив, повтор ничего не меняет, verify сходится', async () => {
  const refused = (pattern) => (error) => error instanceof ReleaseError && pattern.test(error.message);
  const untouched = async () => {
    assert.equal(stub.puts.length, 0, 'реестр не получил публикации');
    assert.ok(!(await ghCalls()).some((call) => call[0] === 'release'), 'выпуск GitHub не создавался');
  };
  // CI: красный, нет запуска тега, нет записи архива, другое содержимое.
  await setGh({ runs: [{ ...greenRun(), conclusion: 'failure' }] });
  await assert.rejects(publish(options()), refused(/CI: последний запуск тега v9\.8\.7 — completed\/failure/));
  await setGh({ runs: [{ ...greenRun(), headBranch: 'main' }] });
  await assert.rejects(publish(options()), refused(/нет запуска ci\.yml на push тега/));
  await setGh({ runs: [greenRun()], artifacts: {} });
  await assert.rejects(publish(options()), refused(/нет записи архива release-record/));
  await setGh({ artifacts: { 101: { ...ciRecord, filesSha256: '0'.repeat(64) } } });
  await assert.rejects(publish(options()), refused(/CI упаковал другое содержимое/));
  await setGh({ artifacts: { 101: ciRecord } });
  await untouched();

  // Архив после записи заменён (то же содержимое, другой gzip) и запись с непрошедшей проверкой.
  const forged = path.join(tmp, 'forged');
  await mkdir(forged);
  await writeFile(path.join(forged, record.file), gzipSync(gunzipSync(await readFile(path.join(tmp, 'release', record.file))), { level: 1 }));
  await writeFile(path.join(forged, 'record.json'), JSON.stringify(record));
  await assert.rejects(publish(options({ recordFile: path.join(forged, 'record.json') })), refused(/не совпадает с записью/));
  const failed = path.join(tmp, 'failed');
  await mkdir(failed);
  await writeFile(path.join(failed, record.file), await readFile(path.join(tmp, 'release', record.file)));
  await writeFile(path.join(failed, 'record.json'), JSON.stringify({ ...record, tests: [{ command: 'npm test', ok: false }] }));
  await assert.rejects(publish(options({ recordFile: path.join(failed, 'record.json') })), refused(/непрошедшие проверки/));

  // Тег: перенесён локально; возвращён новым объектом (на origin — прежний); снят с origin.
  await git('tag', '-f', '-a', TAG, '-m', 'перенос', commitB);
  await assert.rejects(publish(options()), refused(/тег v9\.8\.7 на .*, запись — /));
  await git('tag', '-f', '-a', TAG, '-m', 'новый объект', commitA);
  await assert.rejects(publish(options()), refused(/перенесённый тег не публикуется/));
  await git('fetch', '--quiet', 'origin', `+refs/tags/${TAG}:refs/tags/${TAG}`);
  await git('push', '--quiet', 'origin', `:refs/tags/${TAG}`);
  await assert.rejects(publish(options()), refused(/на origin тег v9\.8\.7 — нет/));
  await git('push', '--quiet', 'origin', TAG);
  await untouched();

  // Успех: npm publish архива (его prepublishOnly не выполняется), выпуск GitHub с тем же файлом, verify с повторной упаковкой.
  const result = await publish(options());
  assert.deepEqual(result.steps, { npm: 'опубликован', github: 'создан' });
  assert.equal(stub.puts.length, 1);
  assert.equal(stub.puts[0].sha256, record.sha256, 'в реестр ушли байты записанного архива');
  assert.equal(stub.puts[0].integrity, record.integrity);
  assert.match(stub.puts[0].scripts.prepublishOnly ?? '', /process\.exit\(1\)/, 'prepublishOnly в пакете есть, но публикации архива не помешал');
  const created = (await ghCalls()).filter((call) => call[0] === 'release');
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].slice(0, 6), ['release', 'create', TAG, path.join(tmp, 'release', record.file), '--repo', SLUG]);
  assert.ok(result.verified.ok, JSON.stringify(result.verified.checks.filter((item) => !item.ok)));
  assert.ok(result.verified.checks.some((item) => /повторная упаковка коммита тега/.test(item.name) && item.ok));

  // Повтор: ни второй публикации, ни второго выпуска.
  const again = await publish(options());
  assert.deepEqual(again.steps, { npm: 'уже опубликован этот архив', github: 'уже есть с этим архивом' });
  assert.equal(stub.puts.length, 1);
  assert.equal((await ghCalls()).filter((call) => call[0] === 'release').length, 1);
});

test('verify: подмена в реестре, на GitHub, перенос тега и другое содержимое коммита — расхождения', async () => {
  const bytes = await readFile(path.join(tmp, 'release', record.file));
  const failing = async (extra = {}) => {
    const result = await verifyRelease({ name: NAME, version: V, slug: SLUG, registry: stub.registry, api: stub.api, record, repo, ...extra });
    return result.checks.filter((item) => !item.ok).map((item) => item.name);
  };
  if (!stub.puts.length) stub.add(NAME, V, bytes);
  stub.tag(SLUG, TAG, { object: 'a'.repeat(40), commit: commitA });
  if (!stub.requests.some((line) => line.includes('__release'))) stub.release(SLUG, TAG, { body: await releaseNotes({ repo, record, ci: null }), assets: [{ name: record.file, bytes }] });
  assert.deepEqual(await failing(), []);

  // Повреждение по дороге: реестр называет прежний integrity, байты другие.
  const other = gzipSync(gunzipSync(bytes), { level: 1 });
  stub.tamper(NAME, V, other, { keepIntegrity: true });
  assert.ok((await failing()).includes('npm: скачанный архив = dist.integrity и dist.shasum реестра'));
  // Подменён и документ реестра (integrity пересчитан): расходятся GitHub, описание выпуска и запись.
  stub.tamper(NAME, V, other);
  const swapped = await failing();
  for (const name of ['запись выпуска: те же SHA-256, integrity и содержимое', 'GitHub: файл выпуска — те же байты, что в npm', 'GitHub: описание выпуска называет SHA-256 и integrity этого архива']) assert.ok(swapped.includes(name), `${name}: ${swapped}`);
  assert.deepEqual(await failing({ record: null }), ['GitHub: файл выпуска — те же байты, что в npm', 'GitHub: описание выпуска называет SHA-256 и integrity этого архива'], 'без записи подмену находят источники GitHub');
  stub.tamper(NAME, V, bytes);
  assert.deepEqual(await failing(), []);

  // GitHub: файл с чужим digest, описание без сумм.
  const notes = await releaseNotes({ repo, record, ci: null });
  stub.release(SLUG, TAG, { body: notes, assets: [{ name: record.file, bytes, digest: `sha256:${'0'.repeat(64)}` }] });
  assert.deepEqual(await failing(), ['GitHub: digest файла выпуска = SHA-256 байтов']);
  stub.release(SLUG, TAG, { body: 'Контрольных сумм нет', assets: [{ name: record.file, bytes }] });
  assert.deepEqual(await failing(), ['GitHub: описание выпуска называет SHA-256 и integrity этого архива']);
  stub.release(SLUG, TAG, { body: notes, assets: [{ name: record.file, bytes }] });

  // Тег GitHub на коммите B: не коммит записи, а повторная упаковка B даёт другое содержимое.
  stub.tag(SLUG, TAG, { object: 'b'.repeat(40), commit: commitB });
  const moved = await failing();
  assert.ok(moved.includes('GitHub: тег v9.8.7 указывает на коммит записи'), moved.join(', '));
  assert.ok(moved.includes('повторная упаковка коммита тега — то же содержимое, что опубликовано'), moved.join(', '));
  stub.tag(SLUG, TAG, { object: 'a'.repeat(40), commit: commitA });

  // Версии нет в реестре.
  const absent = await verifyRelease({ name: NAME, version: '9.8.9', slug: SLUG, registry: stub.registry, api: stub.api, repo });
  assert.equal(absent.ok, false);
  assert.equal(absent.checks[0].name, 'npm: pet-companion@9.8.9 опубликована');
});

test('публикация: версия уже в реестре с другим архивом — отказ, опубликованное не меняется', async () => {
  const second = await startStub();
  try {
    await writeFile(process.env.npm_config_userconfig, `${second.registry.replace(/^http:/, '')}:_authToken=stub-token\n`);
    second.add(NAME, V, gzipSync(Buffer.alloc(1024)));
    await assert.rejects(publish(options({ registry: second.registry, api: second.api })), (error) => error instanceof ReleaseError && /уже опубликована с другим архивом/.test(error.message));
    assert.equal(second.puts.length, 0);
  } finally {
    await second.close();
    await writeFile(process.env.npm_config_userconfig, `${stub.registry.replace(/^http:/, '')}:_authToken=stub-token\n`);
  }
});
