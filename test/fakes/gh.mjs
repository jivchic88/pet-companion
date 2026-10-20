#!/usr/bin/env node
// Поддельный gh для проверок цепочки выпуска (PL12; test/release.test.mjs) — только команды, которые зовёт
// scripts/release.mjs: `run list --json` (запуски CI из состояния), `run download ID --name release-record --dir D` (запись
// архива CI или отказ, если её нет), `release create TAG FILE --notes-file F` (выпуск в заглушке GitHub через её служебный
// POST). Состояние — JSON-файл FAKE_GH_STATE: { runs, artifacts: { [id]: record }, api }; каждый вызов дописывается в
// FAKE_GH_LOG строкой JSON.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const state = JSON.parse(readFileSync(process.env.FAKE_GH_STATE, 'utf8'));
if (process.env.FAKE_GH_LOG) appendFileSync(process.env.FAKE_GH_LOG, `${JSON.stringify(args)}\n`);
const value = (flag) => args[args.indexOf(flag) + 1];

if (args[0] === 'run' && args[1] === 'list') {
  process.stdout.write(JSON.stringify(state.runs ?? []));
} else if (args[0] === 'run' && args[1] === 'download') {
  const record = state.artifacts?.[args[2]];
  if (!record) {
    process.stderr.write(`no artifact matches any of the names or patterns provided`);
    process.exit(1);
  }
  writeFileSync(path.join(value('--dir'), 'record.json'), JSON.stringify(record));
} else if (args[0] === 'release' && args[1] === 'create') {
  const [tag, file] = [args[2], args[3]];
  const res = await fetch(`${state.api}/__release`, {
    method: 'POST',
    body: JSON.stringify({ slug: value('--repo'), tag, body: readFileSync(value('--notes-file'), 'utf8'), name: path.basename(file), data: readFileSync(file).toString('base64') }),
  });
  if (!res.ok) process.exit(1);
} else {
  process.stderr.write(`fake gh: ${args.join(' ')}`);
  process.exit(2);
}
