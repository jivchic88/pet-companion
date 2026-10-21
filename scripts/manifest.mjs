#!/usr/bin/env node
// manifest.json — публичный перечень файлов пакета для серверов без сборщика (этап PL08; README, «Файлы пакета без
// сборщика»; docs/ARCHITECTURE.md § 11.4). Перечень производный, руками не правится: для каждого JS-входа exports — его
// файл и всё, что достижимо от него (import/export … from '…', import '…', import('…') строкой и ресурсы
// new URL('…', import.meta.url) — стили вида); стили, которые подключает страница (вход '.', mountPet), — PAGE_STYLES ниже в
// порядке каскада (README, «Стили»). Голое имя (react) — только объявленный peerDependencies: оно в peers входа, файлов
// пакета у него нет. Разбор — парсером TypeScript (комментарии и строки не путаются с импортами). Импорт не строкой,
// адрес ресурса не литералом, путь за пределы пакета, несуществующий файл, необъявленная зависимость и внешний файл в CSS —
// ошибка: такой файл не увидели бы ни перечень, ни сборщик.
//
//   node scripts/manifest.mjs          — записать manifest.json в корень пакета (npm run manifest)
//   node scripts/manifest.mjs --check  — сверить: устаревший или неверный перечень — код 1 и расхождения
//
// npm test сверяет перечень (test/manifest.test.mjs), шаг npm version (scripts/sync-version.mjs) пересобирает его с
// новой версией, test:package сверяет перечень архива с самим архивом.
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const SCHEMA = 1;
export const MANIFEST = 'manifest.json';
// Стили, которые подключает страница (у входа '.' — mountPet): порядок — порядок каскада; pet-base.css — по желанию сайта
// (README, «Стили»). Контейнер (/web, /react) подключает свои стили сам — они в его files, styles пуст.
export const PAGE_STYLES = Object.freeze({
  '.': Object.freeze([
    Object.freeze({ file: 'pet/pet-base.css', required: false }),
    Object.freeze({ file: 'pet/pet.css', required: true }),
    Object.freeze({ file: 'pet/dog.css', required: true }),
  ]),
  // Кролик (с 0.4.0): вход pet-companion/bunny — страница с mountPet подключает его стили после dog.css.
  './bunny': Object.freeze([Object.freeze({ file: 'pet/bunny.css', required: true })]),
});

const isFile = (file) => stat(file).then((info) => info.isFile(), () => false);
const posix = (file) => file.split(path.sep).join('/');

// Файл входа по значению exports: условие default (или строка) — модуль .mjs; CSS и package.json — не входы перечня.
function entryModule(target) {
  const file = typeof target === 'string' ? target : target && typeof target === 'object' ? target.default : null;
  return typeof file === 'string' && file.endsWith('.mjs') ? file.replace(/^\.\//, '') : null;
}

// import.meta.url
const metaUrl = (node) => ts.isPropertyAccessExpression(node) && node.name.text === 'url' && ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword;

// Ссылки модуля: imports — спецификаторы импортов, resources — адреса new URL('…', import.meta.url); errors — то, что
// перечень увидеть не может.
export function scan(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const imports = [];
  const resources = [];
  const errors = [];
  const where = (node) => `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      else errors.push(`${where(node)}: импорт не строкой`);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [spec] = node.arguments;
      if (spec && ts.isStringLiteralLike(spec)) imports.push(spec.text);
      else errors.push(`${where(node)}: import() не строкой — перечень его не видит`);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' && node.arguments?.length >= 2 && metaUrl(node.arguments[1])) {
      const [spec] = node.arguments;
      if (ts.isStringLiteralLike(spec)) resources.push(spec.text);
      else errors.push(`${where(node)}: адрес new URL(…, import.meta.url) не литералом — его не видят ни перечень, ни сборщик`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { imports, resources, errors };
}

// Перечень пакета в папке dir (package.json и файлы). Бросает Error со списком причин, если граф нельзя перечислить.
export async function buildManifest(dir) {
  const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  const peersDeclared = pkg.peerDependencies ?? {};
  const errors = [];
  const entries = {};
  // Граф одного файла кэшируется: ссылки и ошибки.
  const graph = new Map();
  async function refs(file) {
    if (graph.has(file)) return graph.get(file);
    const result = { files: [], peers: [] };
    graph.set(file, result);
    const full = path.join(dir, file);
    if (!(await isFile(full))) {
      errors.push(`${file}: нет такого файла`);
      return result;
    }
    const text = await readFile(full, 'utf8');
    if (file.endsWith('.css')) {
      const plain = text.replace(/\/\*[\s\S]*?\*\//g, '');
      if (/@import|url\(\s*(?!['"]?data:)/.test(plain)) errors.push(`${file}: внешний файл в CSS (@import или url()) — перечень его не видит`);
      return result;
    }
    if (!file.endsWith('.mjs')) {
      errors.push(`${file}: ресурс модуля — только .mjs или .css`);
      return result;
    }
    const found = scan(file, text);
    errors.push(...found.errors);
    for (const spec of [...found.imports, ...found.resources]) {
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
        if (target.startsWith('../') || path.posix.isAbsolute(target)) errors.push(`${file}: ${spec} — за пределами пакета`);
        else result.files.push(target);
      } else if (/^[a-z@][\w.@/-]*$/i.test(spec) && !spec.includes(':')) {
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        if (Object.hasOwn(peersDeclared, name)) result.peers.push(name);
        else errors.push(`${file}: ${spec} — зависимость не объявлена в peerDependencies`);
      } else errors.push(`${file}: ${spec} — не относительный путь и не имя пакета`);
    }
    return result;
  }
  for (const [entry, target] of Object.entries(pkg.exports ?? {})) {
    const module = entryModule(target);
    if (!module) continue;
    const styles = (PAGE_STYLES[entry] ?? []).map((style) => ({ ...style }));
    const files = new Set([module, ...styles.map((style) => style.file)]);
    const peers = new Set();
    const queue = [...files];
    while (queue.length) {
      const file = queue.shift();
      const { files: next, peers: own } = await refs(file);
      for (const name of own) peers.add(name);
      for (const one of next) if (!files.has(one)) (files.add(one), queue.push(one));
    }
    entries[entry] = {
      module,
      styles,
      peers: Object.fromEntries([...peers].sort().map((name) => [name, peersDeclared[name]])),
      files: [...files].sort(),
    };
  }
  if (errors.length) throw new Error(`manifest.json не собрать:\n${[...new Set(errors)].map((line) => `  ${line}`).join('\n')}`);
  return { schema: SCHEMA, name: pkg.name, version: pkg.version, entries };
}

export const manifestText = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

const safePath = (file) => typeof file === 'string' && file.length > 0 && !file.includes('\\') && !path.posix.isAbsolute(file) && path.posix.normalize(file) === file && !file.startsWith('../') && !file.startsWith('./');

// Проблемы перечня manifest относительно папки пакета dir (без сравнения с графом): схема, версия, входы exports, пути
// внутри пакета, существующие файлы, без повторов, модуль и стили — в files, peers — объявленные.
export async function manifestProblems(manifest, dir) {
  const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  const problems = [];
  if (!manifest || typeof manifest !== 'object') return ['перечень — не объект'];
  if (manifest.schema !== SCHEMA) problems.push(`schema ${manifest.schema} — ожидается ${SCHEMA}`);
  if (manifest.name !== pkg.name) problems.push(`name ${manifest.name} — ожидается ${pkg.name}`);
  if (manifest.version !== pkg.version) problems.push(`version ${manifest.version} — в package.json ${pkg.version}`);
  const expected = Object.entries(pkg.exports ?? {}).filter(([, target]) => entryModule(target)).map(([entry]) => entry);
  const entries = manifest.entries && typeof manifest.entries === 'object' ? manifest.entries : {};
  if (JSON.stringify(Object.keys(entries)) !== JSON.stringify(expected)) problems.push(`входы ${Object.keys(entries).join(', ')} — ожидаются ${expected.join(', ')}`);
  for (const [entry, own] of Object.entries(entries)) {
    const files = Array.isArray(own?.files) ? own.files : [];
    if (!files.length) problems.push(`${entry}: files пуст`);
    const seen = new Set();
    for (const file of files) {
      if (seen.has(file)) problems.push(`${entry}: ${file} — повтор`);
      seen.add(file);
      if (!safePath(file)) problems.push(`${entry}: ${String(file)} — путь не внутри пакета (относительный, без ../ и ./)`);
      else if (!(await isFile(path.join(dir, file)))) problems.push(`${entry}: ${file} — нет такого файла`);
    }
    if (JSON.stringify(files) !== JSON.stringify([...files].sort())) problems.push(`${entry}: files не по порядку`);
    if (own?.module !== entryModule(pkg.exports[entry])) problems.push(`${entry}: module ${own?.module} — в exports ${entryModule(pkg.exports[entry])}`);
    if (!files.includes(own?.module)) problems.push(`${entry}: module не в files`);
    for (const style of Array.isArray(own?.styles) ? own.styles : []) if (!files.includes(style?.file)) problems.push(`${entry}: стиль ${style?.file} не в files`);
    for (const name of Object.keys(own?.peers ?? {})) if (!Object.hasOwn(pkg.peerDependencies ?? {}, name)) problems.push(`${entry}: peer ${name} не объявлен`);
  }
  return problems;
}

// Расхождения записанного перечня dir/manifest.json с собранным по графу и его проблемы; [] — актуален.
export async function manifestCheck(dir) {
  const built = await buildManifest(dir);
  let text = '';
  try {
    text = await readFile(path.join(dir, MANIFEST), 'utf8');
  } catch {
    return [`${MANIFEST} нет — node scripts/manifest.mjs`];
  }
  let stored;
  try {
    stored = JSON.parse(text);
  } catch {
    return [`${MANIFEST} — не JSON`];
  }
  const diff = await manifestProblems(stored, dir);
  for (const [entry, own] of Object.entries(built.entries)) {
    const have = new Set(stored.entries?.[entry]?.files ?? []);
    const want = new Set(own.files);
    for (const file of want) if (!have.has(file)) diff.push(`${entry}: нет ${file} (его загружает вход)`);
    for (const file of have) if (!want.has(file)) diff.push(`${entry}: лишний ${file} (вход его не загружает)`);
  }
  if (!diff.length && text !== manifestText(built)) diff.push(`${MANIFEST} отличается от собранного (styles, peers, порядок или формат) — node scripts/manifest.mjs`);
  return diff;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    if (process.argv.includes('--check')) {
      const diff = await manifestCheck(root);
      if (diff.length) {
        console.error(`${MANIFEST} устарел или неверен:\n${diff.map((line) => `  ${line}`).join('\n')}\nОбновить: node scripts/manifest.mjs`);
        process.exit(1);
      }
      console.log(`${MANIFEST} актуален`);
    } else {
      const manifest = await buildManifest(root);
      await writeFile(path.join(root, MANIFEST), manifestText(manifest));
      const count = Object.values(manifest.entries).map((own) => own.files.length);
      console.log(`${MANIFEST}: ${Object.keys(manifest.entries).length} входов, файлов ${count.join(' / ')} (версия ${manifest.version}); ${posix(path.relative(process.cwd(), path.join(root, MANIFEST))) || MANIFEST}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
