// Только QA: серверный рендер страницы жизненного цикла в Node — браузерные глобалы ловушки (бросают и записывают), до
// импорта pet-companion/react, react и react-dom/server установленного архива. Пишет в папку сборки (аргумент) index.html
// (с питомцем) и empty.html (без него, data-shown="0") по шаблону Vite; печатает JSON: разметки и обращения к глобалам.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TRAPS = ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'matchMedia', 'requestAnimationFrame', 'ResizeObserver', 'MutationObserver', 'HTMLElement', 'customElements', 'location'];
const touched = [];
for (const name of TRAPS) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      touched.push(name);
      throw new Error(`обращение к ${name}`);
    },
  });
}
const calls = [];
for (const level of ['error', 'warn', 'log', 'info']) console[level] = (...args) => calls.push(`${level}: ${args.map(String).join(' ')}`);

const { createElement: h, StrictMode } = await import('react');
const { renderToString } = await import('react-dom/server');
const { App, createQa, propsOf } = await import('./App.mjs');

const out = process.argv[2];
const template = await readFile(path.join(out, 'index.html'), 'utf8');
const render = (shown) => {
  const qa = createQa();
  return renderToString(h(StrictMode, null, h(App, { qa, initial: { shown, props: propsOf(qa) } })));
};
const full = render(true);
const empty = render(false);
await writeFile(path.join(out, 'index.html'), template.replace('<div id="root"></div>', `<div id="root">${full}</div>`));
await writeFile(path.join(out, 'empty.html'), template.replace('<div id="root"></div>', `<div id="root" data-shown="0">${empty}</div>`));
for (const name of TRAPS) delete globalThis[name];
process.stdout.write(`${JSON.stringify({ full, empty, touched, calls })}\n`);
