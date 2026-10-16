// Вход pet-companion/react в Node (PL08; README, «React и серверный рендер»; docs/ARCHITECTURE.md § 11.3): браузерные глобалы
// — ловушки (бросают и записывают обращение) до импорта входа, React и react-dom/server. Импорт и серверный рендер страницы
// с PetCompanion и usePetState — ни одного обращения, ни вызовов функций сайта (onCore, progress, home, onOpenChange), ни
// таймеров, ни сообщений консоли; разметка — пустой контейнер и ветка «снимка нет» (null), одинаковая при каждом рендере и в
// StrictMode. usePetState на сервере не подписывается и не читает ядро — даже живое: серверный снимок null. Неверные
// свойства (children, неизвестное) на сервере тоже дают пустой контейнер: отказ подключения — только в клиентском эффекте.
// Отдельный процесс node --test (настоящие react 19 и react-dom/server из devDependencies, не заглушки).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const TRAPS = ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'matchMedia', 'requestAnimationFrame', 'ResizeObserver', 'MutationObserver', 'HTMLElement', 'customElements', 'location', 'crypto', 'fetch'];
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

const Entry = await import('../pet/react.mjs');
const { PetCompanion, usePetState } = Entry;
const React = await import('react');
const { renderToString } = await import('react-dom/server');
const { createPetCore, createStorage } = await import('../pet/core.mjs');
const { cat, dog } = await import('../pet/pets.mjs');
const { calm } = await import('../pet/behaviors.mjs');
const { createElement: h, StrictMode, useState } = React;
const importTouched = [...touched];

const PLACEHOLDER = 'Питомец появится после загрузки страницы.';

// Счётчики: функции сайта, таймеры и консоль на время серверного рендера.
function watch() {
  const calls = { onCore: 0, progress: 0, home: 0, onOpenChange: 0, timers: 0, console: [] };
  const saved = { setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval, setImmediate: globalThis.setImmediate, queueMicrotask: globalThis.queueMicrotask, error: console.error, warn: console.warn, log: console.log };
  globalThis.setTimeout = (...args) => (calls.timers++, saved.setTimeout(...args));
  globalThis.setInterval = (...args) => (calls.timers++, saved.setInterval(...args));
  globalThis.setImmediate = (...args) => (calls.timers++, saved.setImmediate(...args));
  for (const level of ['error', 'warn', 'log']) console[level] = (...args) => calls.console.push(`${level}: ${args.map(String).join(' ')}`);
  const props = {
    onCore: () => calls.onCore++,
    progress: () => (calls.progress++, { marks: 3, today: 1, limit: 3 }),
    home: () => (calls.home++, null),
    onOpenChange: () => calls.onOpenChange++,
  };
  const stop = () => {
    Object.assign(globalThis, { setTimeout: saved.setTimeout, setInterval: saved.setInterval, setImmediate: saved.setImmediate });
    Object.assign(console, { error: saved.error, warn: saved.warn, log: saved.log });
  };
  return { calls, props, stop };
}

// Страница § 11.3: ядро — в состоянии сайта (onCore), снимок — usePetState(core); заглушку рисует сайт рядом с контейнером.
function Corner({ own }) {
  const [core, setCore] = useState(null);
  const pet = usePetState(core);
  return h(
    'section',
    null,
    h(PetCompanion, { namespace: 'ssr', className: 'pet-box', ...own, onCore: (next) => (own.onCore(next), setCore(next)) }),
    h('p', null, pet ? `${pet.name.display}: ${pet.treat === 'ready' ? 'можно угостить' : 'рядом'}` : PLACEHOLDER),
  );
}

test('импорт pet-companion/react, react и react-dom/server — без браузерных глобалов; поверхность — ровно PetCompanion и usePetState; вход — граница клиентских компонентов', async () => {
  assert.deepEqual(importTouched, [], 'импорт');
  assert.deepEqual(Object.keys(Entry).sort(), ['PetCompanion', 'usePetState']);
  assert.equal(typeof PetCompanion, 'function');
  assert.equal(typeof usePetState, 'function');
  const source = await readFile(new URL('../pet/react.mjs', import.meta.url), 'utf8');
  assert.match(source, /^'use client';\n/, "первая строка входа — 'use client'");
  assert.throws(() => globalThis.document, /обращение к document/, 'ловушки действуют');
  touched.length = 0;
});

test('серверный рендер: пустой контейнер и ветка null; функции сайта, таймеры, консоль и браузерные глобалы не тронуты; разметка одинакова каждый раз и в StrictMode', () => {
  const { calls, props, stop } = watch();
  let html;
  let again;
  let strict;
  try {
    html = renderToString(h(Corner, { own: props }));
    again = renderToString(h(Corner, { own: props }));
    strict = renderToString(h(StrictMode, null, h(Corner, { own: props })));
  } finally {
    stop();
  }
  assert.equal(html, `<section><div class="pet-box"></div><p>${PLACEHOLDER}</p></section>`);
  assert.equal(again, html);
  assert.equal(strict, html);
  assert.deepEqual(touched, []);
  assert.deepEqual(calls, { onCore: 0, progress: 0, home: 0, onOpenChange: 0, timers: 0, console: [] });
});

test('usePetState на сервере: null и для живого ядра — ни подписки, ни чтения снимка; ядро без className — <div></div>', () => {
  const data = new Map();
  const storage = createStorage({ namespace: 'ssr', backend: { get: (name) => data.get(name) ?? null, set: (name, text) => data.set(name, text) } });
  storage.load();
  const core = createPetCore({ storage, pets: [cat, dog], behaviors: [calm] });
  const seen = { subscribe: 0, getState: 0 };
  const counted = { subscribe: (...args) => (seen.subscribe++, core.subscribe(...args)), getState: () => (seen.getState++, core.getState()) };
  const Show = () => {
    const pet = usePetState(counted);
    return h('p', null, pet === null ? 'null' : pet.status);
  };
  const { calls, stop } = watch();
  let html;
  try {
    html = renderToString(h('main', null, h(PetCompanion), h(Show)));
  } finally {
    stop();
  }
  assert.equal(html, '<main><div></div><p>null</p></main>');
  assert.deepEqual(seen, { subscribe: 0, getState: 0 });
  assert.deepEqual(calls.console, []);
  assert.equal(core.getState().status, 'created', 'ядро не запускалось');
  core.destroy();
  assert.deepEqual(touched, []);
});

test('неверные свойства на сервере — тот же пустой контейнер без сообщений: отказ подключения (children, неизвестное свойство, неверный namespace) — только в клиентском эффекте', () => {
  const { calls, props, stop } = watch();
  let html;
  try {
    html = renderToString(h('div', null, h(PetCompanion, { ...props, namespace: '' }, 'текст'), h(PetCompanion, { ...props, places: {} })));
  } finally {
    stop();
  }
  assert.equal(html, '<div><div></div><div></div></div>');
  assert.deepEqual(calls, { onCore: 0, progress: 0, home: 0, onOpenChange: 0, timers: 0, console: [] });
  assert.deepEqual(touched, []);
});
