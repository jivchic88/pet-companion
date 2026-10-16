// Ставит в пример текущую библиотеку из этого репозитория так, как её получит приложение: npm pack корня репозитория →
// архив в .lib/ → npm install архива без записи в package.json и lock примера (lock примера — только Expo и React
// Native). Запуск: npm run lib (после npm ci). Печатает версию, integrity и SHA-256 установленного архива.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const example = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const library = path.resolve(example, '..', '..');
const dest = path.join(example, '.lib');
mkdirSync(dest, { recursive: true });
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', dest], { cwd: library, encoding: 'utf8' }));
const tarball = path.join(dest, packed.filename);
execFileSync('npm', ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', tarball], { cwd: example, stdio: 'inherit' });
const installed = JSON.parse(readFileSync(path.join(example, 'node_modules', 'pet-companion', 'package.json'), 'utf8'));
const sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');
console.log(`pet-companion ${installed.version} из ${path.relative(example, tarball)}: integrity ${packed.integrity}, sha256 ${sha256}`);
