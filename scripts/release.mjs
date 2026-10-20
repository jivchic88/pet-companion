#!/usr/bin/env node
// Выпуск pet-companion — проверяемая цепочка (PL12; CONTRIBUTING.md, «Выпуск»; docs/RELEASES.md):
// архив упаковывается из коммита (git archive, без рабочих файлов и node_modules), его запись фиксирует SHA-256, npm
// integrity и отпечаток содержимого; публикуется ровно записанный архив и только после зелёного CI того же коммита на теге;
// скачанное из npm и с GitHub сверяется с записью и с повторной упаковкой коммита тега. Опубликованное не меняется: версию
// не публикуют повторно, тег не переносят, архив выпуска GitHub не заменяют — исправление выходит новой версией.
//
//   node scripts/release.mjs record [--ref HEAD] [--out DIR] [--expect-tag vX.Y.Z]
//       упаковать коммит и записать DIR/record.json (CI — на каждый push; с --expect-tag — ещё согласованность версии)
//   node scripts/release.mjs prepare X.Y.Z [--candidate] [--out DIR] [--no-tests]
//       чистое дерево, согласованные номера, тег на HEAD (у кандидата — тега ещё нет), версии нет в npm; запись и все
//       четыре набора проверок на этом архиве (test:package и test:consumers — PET_TARBALL)
//   node scripts/release.mjs publish DIR/record.json [--dry-run] [--github skip] [--ci-record skip] [--registry URL]
//       архив = запись, аннотированный тег = коммит записи локально и на origin, CI тега зелёный и упаковал то же
//       содержимое; затем npm publish этого файла, выпуск GitHub с ним же и verify
//   node scripts/release.mjs verify X.Y.Z [--record FILE] [--no-rebuild] [--no-github] [--registry URL] [--json FILE]
//       скачать архив из npm и с GitHub и сверить: integrity, байты, описание выпуска, тег → коммит, повторная упаковка
//
// Код выхода: 0 — всё сходится; 1 — отказ или расхождение (ничего не опубликовано на шаге, где найден отказ); 2 — вызов.
// Отпечатки: sha256/integrity — байты .tgz (их публикует npm); tarSha256 — несжатый tar; filesSha256 — пути и содержимое
// файлов. Gzip одного и того же tar зависит от zlib версии Node (Node 24 и 25 дают разные .tgz одного содержимого),
// поэтому CI и повторная упаковка сверяются по содержимому, а публикуется и сверяется побайтно сам записанный .tgz.
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RECORD_SCHEMA = 1;
export const REGISTRY = 'https://registry.npmjs.org';
export const GITHUB_API = 'https://api.github.com';
export const WORKFLOW = 'ci.yml';
export const CI_ARTIFACT = 'release-record';

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const hash = (algo, data, enc = 'hex') => createHash(algo).update(data).digest(enc);
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export class ReleaseError extends Error {}
const refuse = (message) => {
  throw new ReleaseError(message);
};

export function run(cmd, args, { cwd = root, env, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { cwd, env: env ?? process.env, maxBuffer: 1 << 26 }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else resolve({ stdout, stderr });
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

// --- Архив -----------------------------------------------------------------------------------------------------------

// Разбор tar (ustar, pax-заголовки путей, GNU LongName): записи с путями, типом, правами и данными. Без записи на диск.
export function readTar(gz) {
  const tar = gunzipSync(gz);
  const entries = [];
  let offset = 0;
  let longPath = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => {
      const raw = header.subarray(start, start + length);
      const end = raw.indexOf(0);
      return raw.subarray(0, end < 0 ? length : end).toString('utf8');
    };
    const size = Number.parseInt(field(124, 12).trim() || '0', 8);
    const type = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    const prefix = field(257, 6).startsWith('ustar') ? field(345, 155) : '';
    const data = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      const pax = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString('utf8'));
      if (pax) longPath = pax[1];
      continue;
    }
    if (type === 'L') {
      longPath = data.toString('utf8').replace(/\0+$/, '');
      continue;
    }
    if (type === 'g') continue;
    const name = longPath ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longPath = null;
    entries.push({ path: name, type, mode: Number.parseInt(field(100, 8).trim() || '0', 8), size, data: Buffer.from(data) });
  }
  return { tar, entries };
}

// Отпечатки архива: байты .tgz (sha256, sha1, integrity), несжатый tar, содержимое файлов (пути и SHA-256), package.json.
// unsafe — записи вне package/, с «..», абсолютные или не файлы и папки (такой архив не распаковывают).
export function digest(gz) {
  const { tar, entries } = readTar(gz);
  const files = entries.filter((entry) => entry.type === '0').map((entry) => ({ path: entry.path, size: entry.size, sha256: hash('sha256', entry.data) })).sort(byPath);
  const unsafe = entries.filter((entry) => !entry.path.startsWith('package/') || entry.path.split('/').includes('..') || !['0', '5'].includes(entry.type)).map((entry) => `${entry.type} ${entry.path}`);
  const meta = entries.find((entry) => entry.path === 'package/package.json');
  let pkg = null;
  try {
    pkg = meta ? JSON.parse(meta.data.toString('utf8')) : null;
  } catch {
    pkg = null;
  }
  return {
    size: gz.length,
    sha256: hash('sha256', gz),
    sha1: hash('sha1', gz),
    integrity: `sha512-${hash('sha512', gz, 'base64')}`,
    tarSha256: hash('sha256', tar),
    filesSha256: hash('sha256', files.map((file) => `${file.sha256}  ${file.path}\n`).join('')),
    files: files.length,
    list: files,
    unsafe,
    pkg,
  };
}

// Описание архива в форме вывода npm pack --json (для проверок, которым передан готовый архив выпуска).
export async function tarballInfo(file) {
  const facts = digest(await readFile(file));
  return { filename: path.basename(file), path: file, size: facts.size, integrity: facts.integrity, shasum: facts.sha1, files: facts.list.map((item) => ({ path: item.path.replace(/^package\//, ''), size: item.size })), digest: facts };
}

async function gitArchive(repo, commit, dest) {
  await new Promise((resolve, reject) => {
    const git = spawn('git', ['-C', repo, 'archive', '--format=tar', commit], { stdio: ['ignore', 'pipe', 'pipe'] });
    const tar = spawn('tar', ['-x', '-f', '-', '-C', dest], { stdio: ['pipe', 'ignore', 'pipe'] });
    let errors = '';
    git.stderr.on('data', (chunk) => (errors += chunk));
    tar.stderr.on('data', (chunk) => (errors += chunk));
    git.stdout.pipe(tar.stdin);
    let left = 2;
    const done = (code) => {
      if (code !== 0) reject(new ReleaseError(`git archive ${commit}: ${errors.trim() || `код ${code}`}`));
      else if (--left === 0) resolve();
    };
    git.on('close', done);
    tar.on('close', done);
  });
}

// Упаковка коммита: git archive → временная папка → npm pack (без скриптов). Файл .tgz кладётся в out.
export async function packFromGit({ repo = root, ref = 'HEAD', out }) {
  const commit = (await run('git', ['-C', repo, 'rev-parse', '--verify', `${ref}^{commit}`])).stdout.trim();
  const src = await mkdtemp(path.join(tmpdir(), 'pet-release-src-'));
  try {
    await gitArchive(repo, commit, src);
    await mkdir(out, { recursive: true });
    const { stdout } = await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', out], { cwd: src });
    const [info] = JSON.parse(stdout);
    const file = path.join(out, info.filename);
    const facts = digest(await readFile(file));
    if (facts.integrity !== info.integrity || facts.sha1 !== info.shasum) refuse(`npm pack и разбор архива расходятся: ${info.integrity} / ${facts.integrity}`);
    return { commit, file, facts };
  } finally {
    await rm(src, { recursive: true, force: true });
  }
}

// --- Репозиторий -----------------------------------------------------------------------------------------------------

export function slugOf(pkg) {
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const found = /github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(url ?? '');
  if (!found) refuse(`в package.json нет репозитория GitHub (repository.url: ${url ?? 'нет'})`);
  return found[1];
}

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

// Согласованность номера в коммите: package.json, manifest.json, VERSION и раздел CHANGELOG «## X.Y.Z».
export async function consistency(dir, version) {
  const problems = [];
  const pkg = await readJson(path.join(dir, 'package.json'));
  if (pkg.version !== version) problems.push(`package.json — ${pkg.version}`);
  const manifest = await readJson(path.join(dir, 'manifest.json')).catch(() => null);
  if (manifest?.version !== version) problems.push(`manifest.json — ${manifest?.version ?? 'нет'}`);
  const constant = /^export const VERSION = '([^']*)';$/m.exec(await readFile(path.join(dir, 'pet/core/version.mjs'), 'utf8').catch(() => ''))?.[1];
  if (constant !== version) problems.push(`VERSION — ${constant ?? 'нет'}`);
  const changelog = await readFile(path.join(dir, 'CHANGELOG.md'), 'utf8').catch(() => '');
  if (!new RegExp(`^## ${version.replaceAll('.', '\\.')}(?:\\s|$)`, 'm').test(changelog)) problems.push(`в CHANGELOG.md нет раздела «## ${version}»`);
  return problems;
}

async function clean(repo) {
  const { stdout } = await run('git', ['-C', repo, 'status', '--porcelain']);
  return stdout.trim();
}

// Тег vX.Y.Z: аннотированный, его коммит; на remote — тот же объект тега и коммит (тег не перенесён).
export async function tagState(repo, tag, remote = 'origin') {
  const local = await run('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]).then(({ stdout }) => stdout.trim(), () => null);
  if (!local) return { local: null };
  const type = (await run('git', ['-C', repo, 'cat-file', '-t', local])).stdout.trim();
  const commit = (await run('git', ['-C', repo, 'rev-parse', `${tag}^{commit}`])).stdout.trim();
  const remoteLines = remote ? (await run('git', ['-C', repo, 'ls-remote', remote, `refs/tags/${tag}`, `refs/tags/${tag}^{}`])).stdout.trim().split('\n').filter(Boolean) : [];
  const remoteObject = remoteLines.find((line) => line.endsWith(`refs/tags/${tag}`))?.split('\t')[0] ?? null;
  const remoteCommit = remoteLines.find((line) => line.endsWith('^{}'))?.split('\t')[0] ?? remoteObject;
  return { local, type, commit, remoteObject, remoteCommit };
}

// --- npm и GitHub ----------------------------------------------------------------------------------------------------

const fetchOk = (url, options = {}) => fetch(url, { redirect: 'follow', ...options });

// Состояние версии в реестре: null — версии (или пакета) нет; иначе dist версии и dist-tags.
export async function registryVersion({ registry = REGISTRY, name, version }) {
  const res = await fetchOk(`${registry.replace(/\/$/, '')}/${encodeURIComponent(name)}`, { headers: { accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) refuse(`реестр ${registry}: ${res.status} для ${name}`);
  const doc = await res.json();
  const entry = doc.versions?.[version];
  return entry ? { dist: entry.dist, tags: doc['dist-tags'] ?? {}, gitHead: entry.gitHead ?? null } : null;
}

async function download(url, headers = {}) {
  const res = await fetchOk(url, { headers });
  if (!res.ok) refuse(`скачивание ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const githubHeaders = (token) => ({ accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}) });

// Контрольные суммы из описания выпуска GitHub (раздел «Контрольные суммы», формат выпусков 0.2.1 и 0.2.3).
export function parseNotes(body = '') {
  return {
    sha256: /SHA-256:\s*`([0-9a-f]{64})`/i.exec(body)?.[1] ?? null,
    integrity: /integrity:\s*`(sha512-[A-Za-z0-9+/]+={0,2})`/.exec(body)?.[1] ?? null,
  };
}

export async function githubRelease({ api = GITHUB_API, slug, tag, token }) {
  const res = await fetchOk(`${api.replace(/\/$/, '')}/repos/${slug}/releases/tags/${encodeURIComponent(tag)}`, { headers: githubHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) refuse(`GitHub ${slug} ${tag}: ${res.status}`);
  return res.json();
}

export async function githubTagCommit({ api = GITHUB_API, slug, tag, token }) {
  const base = api.replace(/\/$/, '');
  const res = await fetchOk(`${base}/repos/${slug}/git/ref/tags/${encodeURIComponent(tag)}`, { headers: githubHeaders(token) });
  if (!res.ok) return null;
  let object = (await res.json()).object;
  for (let i = 0; object?.type === 'tag' && i < 4; i += 1) {
    const next = await fetchOk(`${base}/repos/${slug}/git/tags/${object.sha}`, { headers: githubHeaders(token) });
    if (!next.ok) return null;
    object = (await next.json()).object;
  }
  return object?.type === 'commit' ? object.sha : null;
}

// --- Проверка опубликованного ----------------------------------------------------------------------------------------

// Сверка выпуска: каждый пункт — { name, ok, detail }. record — запись выпуска (необязательно); repo — локальный репозиторий
// для повторной упаковки коммита тега (rebuild).
export async function verifyRelease({ name = 'pet-companion', version, slug, registry = REGISTRY, api = GITHUB_API, token, record = null, repo = root, rebuild = true, github = true }) {
  const checks = [];
  const facts = { version, registry, slug };
  const check = (label, ok, detail = '') => {
    checks.push({ name: label, ok: Boolean(ok), detail });
    return Boolean(ok);
  };
  const tag = `v${version}`;
  const file = `${name}-${version}.tgz`;
  const npm = await registryVersion({ registry, name, version });
  let tarball = null;
  if (check(`npm: ${name}@${version} опубликована`, npm, npm ? npm.dist.tarball : 'версии нет в реестре')) {
    tarball = await download(npm.dist.tarball);
    const got = digest(tarball);
    Object.assign(facts, { npm: { tarball: npm.dist.tarball, integrity: npm.dist.integrity, shasum: npm.dist.shasum, latest: npm.tags.latest }, size: got.size, sha256: got.sha256, integrity: got.integrity, tarSha256: got.tarSha256, filesSha256: got.filesSha256, files: got.files });
    check('npm: скачанный архив = dist.integrity и dist.shasum реестра', got.integrity === npm.dist.integrity && got.sha1 === npm.dist.shasum, `${got.integrity} / ${npm.dist.integrity}`);
    check(`архив: package.json — ${name}@${version}, записи только внутри package/`, got.pkg?.name === name && got.pkg?.version === version && got.unsafe.length === 0, `${got.pkg?.name}@${got.pkg?.version} ${got.unsafe.join(', ')}`);
    if (record) {
      check('запись выпуска: те же SHA-256, integrity и содержимое', record.sha256 === got.sha256 && record.integrity === got.integrity && record.filesSha256 === got.filesSha256, `запись ${record.sha256}, npm ${got.sha256}`);
    }
  }
  if (github) {
    const release = await githubRelease({ api, slug, tag, token });
    const asset = release?.assets?.find((item) => item.name === file) ?? null;
    if (check(`GitHub: выпуск ${tag} с файлом ${file}`, release && asset, release ? (release.assets ?? []).map((item) => item.name).join(', ') : 'выпуска нет')) {
      const bytes = await download(asset.browser_download_url);
      const sha = hash('sha256', bytes);
      facts.github = { url: release.html_url, asset: asset.browser_download_url, digest: asset.digest ?? null, sha256: sha };
      check('GitHub: файл выпуска — те же байты, что в npm', tarball && sha === hash('sha256', tarball), `GitHub ${sha}`);
      if (asset.digest) check('GitHub: digest файла выпуска = SHA-256 байтов', asset.digest === `sha256:${sha}`, asset.digest);
      const notes = parseNotes(release.body);
      check('GitHub: описание выпуска называет SHA-256 и integrity этого архива', tarball && notes.sha256 === hash('sha256', tarball) && notes.integrity === digest(tarball).integrity, JSON.stringify(notes));
    }
    const commit = await githubTagCommit({ api, slug, tag, token });
    facts.commit = commit;
    check(`GitHub: тег ${tag} указывает на коммит${record ? ' записи' : ''}`, commit && (!record || commit === record.commit), `${commit ?? 'нет тега'}${record ? ` / запись ${record.commit}` : ''}`);
  } else if (record) facts.commit = record.commit;
  if (rebuild && tarball) {
    const commit = facts.commit;
    const has = commit && (await run('git', ['-C', repo, 'cat-file', '-e', `${commit}^{commit}`]).then(() => true, () => false));
    if (check(`повторная упаковка: коммит ${commit ?? '?'} есть в ${repo}`, has, has ? '' : 'нет коммита — git fetch --tags')) {
      const out = await mkdtemp(path.join(tmpdir(), 'pet-release-rebuild-'));
      try {
        const again = await packFromGit({ repo, ref: commit, out });
        const got = digest(tarball);
        facts.rebuild = { sha256: again.facts.sha256, tarSha256: again.facts.tarSha256, filesSha256: again.facts.filesSha256, sameBytes: again.facts.sha256 === got.sha256 };
        check('повторная упаковка коммита тега — то же содержимое, что опубликовано', again.facts.filesSha256 === got.filesSha256 && again.facts.tarSha256 === got.tarSha256, `${again.facts.filesSha256} / ${got.filesSha256}${again.facts.sha256 === got.sha256 ? ', байты .tgz совпали' : ', gzip другой версии zlib'}`);
      } finally {
        await rm(out, { recursive: true, force: true });
      }
    }
  }
  return { ok: checks.every((item) => item.ok), checks, facts };
}

// --- CI --------------------------------------------------------------------------------------------------------------

// Последний запуск CI на push тега для коммита: должен быть завершён успешно; запись CI (артефакт release-record) —
// упакованное CI содержимое и номер.
export async function ciGate({ gh = 'gh', slug, sha, tag, ciRecord = true }) {
  const fields = 'databaseId,event,headBranch,headSha,status,conclusion,attempt,url,createdAt';
  const { stdout } = await run(gh, ['run', 'list', '--repo', slug, '--commit', sha, '--workflow', WORKFLOW, '--limit', '50', '--json', fields]);
  const runs = JSON.parse(stdout).filter((item) => item.headSha === sha);
  const tagRuns = runs.filter((item) => item.event === 'push' && item.headBranch === tag).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const last = tagRuns[0];
  if (!last) refuse(`CI: для ${tag} (${sha.slice(0, 7)}) нет запуска ${WORKFLOW} на push тега — сначала git push origin ${tag} и зелёный CI`);
  if (last.status !== 'completed' || last.conclusion !== 'success') refuse(`CI: последний запуск тега ${tag} — ${last.status}/${last.conclusion ?? '—'} (${last.url}); публикация только после зелёного CI этого коммита`);
  const gate = { run: last.databaseId, url: last.url, attempt: last.attempt, main: runs.find((item) => item.event === 'push' && item.headBranch === 'main')?.conclusion ?? null, record: null };
  if (!ciRecord) return gate;
  const dir = await mkdtemp(path.join(tmpdir(), 'pet-release-ci-'));
  try {
    await run(gh, ['run', 'download', String(last.databaseId), '--repo', slug, '--name', CI_ARTIFACT, '--dir', dir]).catch((error) => refuse(`CI: у запуска ${last.databaseId} нет записи архива ${CI_ARTIFACT} (${(error.stderr || error.message).trim()})`));
    gate.record = await readJson(path.join(dir, 'record.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return gate;
}

// --- Запись, подготовка, публикация ----------------------------------------------------------------------------------

async function npmVersion() {
  return (await run('npm', ['-v'])).stdout.trim();
}

export async function makeRecord({ repo = root, ref = 'HEAD', out, expectTag = null }) {
  const pkg = await readJson(path.join(repo, 'package.json'));
  const packed = await packFromGit({ repo, ref, out });
  const { facts } = packed;
  if (facts.pkg?.name !== pkg.name) refuse(`в архиве ${facts.pkg?.name}, а в репозитории ${pkg.name}`);
  const version = facts.pkg.version;
  if (expectTag) {
    if (expectTag !== `v${version}`) refuse(`тег ${expectTag}, а версия пакета ${version}`);
    const src = await mkdtemp(path.join(tmpdir(), 'pet-release-check-'));
    try {
      await gitArchive(repo, packed.commit, src);
      const problems = await consistency(src, version);
      if (problems.length) refuse(`номер ${version} в коммите тега не согласован: ${problems.join('; ')}`);
    } finally {
      await rm(src, { recursive: true, force: true });
    }
  }
  const record = {
    schema: RECORD_SCHEMA,
    name: facts.pkg.name,
    version,
    commit: packed.commit,
    tag: expectTag,
    file: path.basename(packed.file),
    size: facts.size,
    sha256: facts.sha256,
    sha1: facts.sha1,
    integrity: facts.integrity,
    tarSha256: facts.tarSha256,
    filesSha256: facts.filesSha256,
    files: facts.files,
    node: process.version,
    npm: await npmVersion(),
    createdAt: new Date().toISOString(),
  };
  await writeFile(path.join(out, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
  return { record, file: packed.file };
}

const TESTS = [
  ['npm', ['test']],
  ['npm', ['run', 'test:browser']],
  ['npm', ['run', 'test:package'], true],
  ['npm', ['run', 'test:consumers'], true],
];

export async function prepare({ repo = root, version, candidate = false, out, tests = true, registry = REGISTRY, log = console.log }) {
  if (!VERSION_RE.test(version ?? '')) refuse(`версия «${version}» — нужен вид x.y.z`);
  const dirty = await clean(repo);
  if (dirty) refuse(`рабочее дерево не чистое — выпуск только из закоммиченного:\n${dirty}`);
  const problems = await consistency(repo, version);
  if (problems.length) refuse(`номер ${version} не согласован: ${problems.join('; ')} (npm version ${version})`);
  const head = (await run('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout.trim();
  const tag = await tagState(repo, `v${version}`, null);
  if (candidate) {
    if (tag.local) refuse(`тег v${version} уже есть (${tag.commit}) — кандидат готовят до тега; опубликованный или занятый номер не переиспользуется`);
  } else {
    if (!tag.local) refuse(`нет тега v${version} — git tag -a v${version} на проверенном коммите (или --candidate)`);
    if (tag.type !== 'tag') refuse(`тег v${version} — не аннотированный`);
    if (tag.commit !== head) refuse(`тег v${version} на ${tag.commit}, а HEAD — ${head}: тег не переносят; проверяют коммит тега`);
  }
  const pkg = await readJson(path.join(repo, 'package.json'));
  if (await registryVersion({ registry, name: pkg.name, version })) refuse(`${pkg.name}@${version} уже в реестре — опубликованная версия не меняется, нужен новый номер`);
  const { record, file } = await makeRecord({ repo, ref: head, out, expectTag: candidate ? null : `v${version}` });
  log(`запись: ${file} — ${record.size} байт, SHA-256 ${record.sha256}, ${record.integrity}`);
  record.tests = [];
  if (tests) {
    for (const [cmd, args, tarball] of TESTS) {
      const label = `${cmd} ${args.join(' ')}${tarball ? ` (PET_TARBALL=${record.file})` : ''}`;
      log(`проверка: ${label}`);
      const started = Date.now();
      const result = await run(cmd, args, { cwd: repo, env: { ...process.env, ...(tarball ? { PET_TARBALL: file } : {}) } }).then(
        ({ stdout }) => ({ ok: true, stdout }),
        (error) => ({ ok: false, stdout: `${error.stdout ?? ''}\n${error.stderr ?? ''}` }),
      );
      const summary = result.stdout.trim().split('\n').filter((line) => /^(ℹ (tests|pass|fail)|\d+\/\d+ провер)/.test(line)).join('; ');
      record.tests.push({ command: label, ok: result.ok, summary, seconds: Math.round((Date.now() - started) / 1000) });
      if (!result.ok) {
        await writeFile(path.join(out, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
        refuse(`проверка не прошла: ${label} — ${summary || result.stdout.trim().split('\n').slice(-5).join(' | ')}`);
      }
    }
    if (await clean(repo)) refuse('проверки изменили рабочее дерево — запись недействительна');
    const again = digest(await readFile(file));
    if (again.sha256 !== record.sha256) refuse('архив изменился во время проверок');
  }
  await writeFile(path.join(out, 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
  return { record, file };
}

// Описание выпуска GitHub: раздел CHANGELOG версии и контрольные суммы (формат, который читает verify и потребители).
export async function releaseNotes({ repo = root, record, ci }) {
  const changelog = await run('git', ['-C', repo, 'show', `${record.commit}:CHANGELOG.md`]).then(({ stdout }) => stdout, () => '');
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^## ${record.version.replaceAll('.', '\\.')}(\\s|$)`).test(line));
  const end = start < 0 ? -1 : lines.findIndex((line, index) => index > start && /^## /.test(line));
  const section = start < 0 ? '' : lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
  return `${section}\n\n## Контрольные суммы \`${record.file}\`\n\nТот же файл, что в npm (\`${record.name}@${record.version}\`); ${record.size} байт, ${record.files} файлов.\n\n- SHA-256: \`${record.sha256}\`\n- npm integrity: \`${record.integrity}\`\n\nАрхив упакован из коммита тега (\`${record.commit.slice(0, 7)}\`) командой \`node scripts/release.mjs prepare\`; CI тега: ${ci?.url ?? '—'}. Сверка: \`node scripts/release.mjs verify ${record.version}\`.\n`;
}

export async function publish({ repo = root, recordFile, dryRun = false, github = true, ciRecord = true, registry = REGISTRY, api = GITHUB_API, gh = 'gh', token, remote = 'origin', log = console.log }) {
  const record = await readJson(recordFile);
  if (record.schema !== RECORD_SCHEMA || !VERSION_RE.test(record.version ?? '')) refuse(`${recordFile}: не запись выпуска схемы ${RECORD_SCHEMA}`);
  const file = path.join(path.dirname(recordFile), record.file);
  if (!existsSync(file)) refuse(`нет архива ${file}`);
  const now = digest(await readFile(file));
  if (now.sha256 !== record.sha256 || now.integrity !== record.integrity || now.filesSha256 !== record.filesSha256) refuse(`архив ${record.file} не совпадает с записью (SHA-256 ${now.sha256}, в записи ${record.sha256}) — публикуется только записанный архив`);
  if (now.pkg?.name !== record.name || now.pkg?.version !== record.version) refuse(`в архиве ${now.pkg?.name}@${now.pkg?.version}, в записи ${record.name}@${record.version}`);
  if (record.tests?.some((item) => !item.ok)) refuse('в записи есть непрошедшие проверки');
  const tag = `v${record.version}`;
  const state = await tagState(repo, tag, remote);
  if (!state.local) refuse(`нет локального тега ${tag}`);
  if (state.type !== 'tag') refuse(`тег ${tag} — не аннотированный`);
  if (state.commit !== record.commit) refuse(`тег ${tag} на ${state.commit}, запись — ${record.commit}: тег не переносят, архив пересобирают с коммита тега`);
  if (state.remoteCommit !== record.commit || state.remoteObject !== state.local) refuse(`на ${remote} тег ${tag} — ${state.remoteObject ?? 'нет'} (${state.remoteCommit ?? '—'}), локально ${state.local}: сначала git push ${remote} ${tag}, перенесённый тег не публикуется`);
  log(`✓ архив = запись, тег ${tag} = ${record.commit.slice(0, 7)} локально и на ${remote}`);
  const pkg = await readJson(path.join(repo, 'package.json'));
  const slug = slugOf(pkg);
  const ci = await ciGate({ gh, slug, sha: record.commit, tag, ciRecord });
  if (ci.record) {
    const same = ci.record.commit === record.commit && ci.record.version === record.version && ci.record.filesSha256 === record.filesSha256 && ci.record.tarSha256 === record.tarSha256;
    if (!same) refuse(`CI упаковал другое содержимое: ${ci.record.filesSha256} (${ci.record.commit?.slice(0, 7)}), запись — ${record.filesSha256}`);
    log(`✓ CI ${ci.url} (попытка ${ci.attempt}) зелёный; упакованное CI содержимое = запись${ci.record.sha256 === record.sha256 ? ', байты .tgz тоже' : ` (gzip CI: ${ci.record.sha256}, Node ${ci.record.node})`}`);
  } else log(`✓ CI ${ci.url} (попытка ${ci.attempt}) зелёный; запись архива CI не сверялась (--ci-record skip)`);
  const published = await registryVersion({ registry, name: record.name, version: record.version });
  const steps = { npm: null, github: null };
  if (published) {
    if (published.dist.integrity !== record.integrity) refuse(`${record.name}@${record.version} уже опубликована с другим архивом (${published.dist.integrity}) — опубликованное не меняется, нужен новый номер`);
    steps.npm = 'уже опубликован этот архив';
  } else {
    const args = ['publish', file, '--registry', registry, ...(dryRun ? ['--dry-run'] : [])];
    log(`npm ${args.join(' ')}`);
    // Под терминалом — общий ввод-вывод: веб-подтверждение 2FA npm 11 работает только с TTY (CONTRIBUTING, «Выпуск»).
    if (process.stdin.isTTY) {
      const code = await new Promise((resolve) => spawn('npm', args, { cwd: path.dirname(file), stdio: 'inherit' }).on('close', resolve));
      if (code !== 0) refuse(`npm publish: код ${code}`);
    } else await run('npm', args, { cwd: path.dirname(file) }).catch((error) => refuse(`npm publish: ${(error.stderr || error.message).trim().split('\n').slice(-4).join(' | ')}`));
    steps.npm = dryRun ? 'dry-run' : 'опубликован';
  }
  const notes = await releaseNotes({ repo, record, ci });
  if (dryRun || !github) {
    steps.github = dryRun ? 'dry-run' : 'пропущен (--github skip)';
    if (dryRun) {
      log(`(dry-run) gh release create ${tag} ${record.file} --repo ${slug} --verify-tag --title "${record.name} ${record.version}"`);
      return { ok: true, record, ci, steps, notes };
    }
  } else {
    const release = await githubRelease({ api, slug, tag, token });
    if (release) {
      const asset = release.assets?.find((item) => item.name === record.file);
      if (!asset || (asset.digest && asset.digest !== `sha256:${record.sha256}`)) refuse(`выпуск GitHub ${tag} уже есть с другим файлом — не заменяется`);
      steps.github = 'уже есть с этим архивом';
    } else {
      const notesFile = path.join(path.dirname(recordFile), 'notes.md');
      await writeFile(notesFile, notes);
      await run(gh, ['release', 'create', tag, file, '--repo', slug, '--verify-tag', '--title', `${record.name} ${record.version}`, '--notes-file', notesFile]).catch((error) => refuse(`gh release create: ${(error.stderr || error.message).trim()}`));
      steps.github = 'создан';
    }
  }
  const verified = await verifyRelease({ name: record.name, version: record.version, slug, registry, api, token, record, repo, github });
  return { ok: verified.ok, record, ci, steps, verified };
}

// --- Командная строка ------------------------------------------------------------------------------------------------

function parse(argv) {
  const [command, ...rest] = argv;
  const options = { _: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) options._.push(arg);
    else if (['--candidate', '--no-tests', '--dry-run', '--no-rebuild', '--no-github'].includes(arg)) options[arg.slice(2)] = true;
    else options[arg.slice(2)] = rest[++i];
  }
  return { command, options };
}

const print = (result) => {
  for (const item of result.checks) console.log(`${item.ok ? '✓' : '✗'} ${item.name}${item.detail && !item.ok ? ` — ${item.detail}` : ''}`);
};

async function main() {
  const { command, options } = parse(process.argv.slice(2));
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || undefined;
  const registry = options.registry ?? REGISTRY;
  const pkg = await readJson(path.join(root, 'package.json'));
  if (command === 'record') {
    const out = path.resolve(options.out ?? 'release');
    const { record, file } = await makeRecord({ ref: options.ref ?? 'HEAD', out, expectTag: options['expect-tag'] || null });
    console.log(`${file}\n${JSON.stringify(record, null, 2)}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await writeFile(process.env.GITHUB_STEP_SUMMARY, `### Архив ${record.file}\n\n| | |\n| --- | --- |\n| коммит | \`${record.commit}\` |\n| размер, файлов | ${record.size} байт, ${record.files} |\n| SHA-256 .tgz | \`${record.sha256}\` |\n| integrity | \`${record.integrity}\` |\n| содержимое (filesSha256) | \`${record.filesSha256}\` |\n| tar (tarSha256) | \`${record.tarSha256}\` |\n| Node, npm | ${record.node}, ${record.npm} |\n`, { flag: 'a' });
    }
    return 0;
  }
  if (command === 'prepare') {
    const version = options._[0];
    const out = path.resolve(options.out ?? path.join(tmpdir(), `pet-companion-release-${version}`));
    const { record, file } = await prepare({ version, candidate: options.candidate, out, tests: !options['no-tests'], registry });
    console.log(`✓ готово к публикации после проверки: ${file}\n  запись: ${path.join(out, 'record.json')}\n  SHA-256 ${record.sha256}\n  ${record.integrity}`);
    return 0;
  }
  if (command === 'publish') {
    const recordFile = options._[0] && path.resolve(options._[0]);
    if (!recordFile) return usage();
    const result = await publish({ recordFile, dryRun: options['dry-run'], github: options.github !== 'skip', ciRecord: options['ci-record'] !== 'skip', registry, api: options['github-api'] ?? GITHUB_API, gh: options.gh ?? 'gh', token });
    console.log(`npm: ${result.steps.npm}; GitHub: ${result.steps.github}`);
    if (result.verified) print(result.verified);
    return result.ok ? 0 : 1;
  }
  if (command === 'verify') {
    const version = options._[0];
    if (!VERSION_RE.test(version ?? '')) return usage();
    const record = options.record ? await readJson(path.resolve(options.record)) : null;
    const result = await verifyRelease({ name: pkg.name, version, slug: slugOf(pkg), registry, api: options['github-api'] ?? GITHUB_API, token, record, rebuild: !options['no-rebuild'], github: !options['no-github'] });
    print(result);
    if (options.json) await writeFile(path.resolve(options.json), `${JSON.stringify(result, null, 2)}\n`);
    console.log(result.ok ? `\n✓ ${pkg.name}@${version}: опубликованное сходится (${result.checks.length} пунктов)` : `\n✗ ${pkg.name}@${version}: расхождения — ${result.checks.filter((item) => !item.ok).length}`);
    return result.ok ? 0 : 1;
  }
  return usage();
}

function usage() {
  console.error('node scripts/release.mjs record|prepare X.Y.Z|publish DIR/record.json|verify X.Y.Z — CONTRIBUTING.md, «Выпуск»');
  return 2;
}

if (import.meta.url === pathToFileURL(await realpath(process.argv[1] ?? '.').catch(() => '')).href) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof ReleaseError ? `✗ отказ: ${error.message}` : error.stack);
      process.exit(1);
    },
  );
}
