// Только QA: клиент страницы жизненного цикла — hydrateRoot разметки сервера (prerender.mjs) в StrictMode; пульт window.qa
// для проверок test/consumers.mjs. Без питомца на старте (#root data-shown="0") — страница для базы ресурсов.
import { createElement as h, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { App, createQa, propsOf } from './App.mjs';

const root = document.getElementById('root');
const views = () => root.querySelectorAll('[data-pet-view]').length;
const qa = createQa((next) => ({ prev: qa.last ? qa.last.status : null, next: next ? next.status : null, views: views() }));
qa.home = (tag) => document.getElementById(`home-${tag}`);
const recoverable = [];
let control = null;
qa.connect = (own) => (control = own);
// Добавленные в контейнер виды (новое подключение — новый элемент).
let added = 0;
new MutationObserver((records) => {
  for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 && node.hasAttribute('data-pet-view')) added += 1;
}).observe(root, { childList: true, subtree: true });

window.qa = {
  qa,
  recoverable,
  get added() {
    return added;
  },
  views,
  set: (options) => control.setProps(propsOf(qa, options)),
  show: (on) => control.setShown(on),
  core: (n) => qa.cores[n - 1] ?? null,
  // Сводка журнала простыми данными.
  state: () => ({
    log: qa.log.map((entry) => ({ ...entry })),
    statuses: qa.cores.map((core) => core.status),
    subs: Object.fromEntries([...qa.subs].map(([id, stat]) => [id, { ...stat }])),
    renders: qa.counts.renders,
    added,
    views: views(),
    text: document.getElementById('pet-state').textContent,
    held: document.getElementById('pet-held').textContent,
    recoverable: [...recoverable],
  }),
};

hydrateRoot(root, h(StrictMode, null, h(App, { qa, initial: { shown: root.dataset.shown !== '0', props: propsOf(qa) } })), {
  onRecoverableError: (error) => recoverable.push(String(error?.message ?? error)),
});
