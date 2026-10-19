// Общий указатель отображения (pet/web/pointer.mjs, PL11.1): сдвиг пальца жеста — не прокрутка браузера. Контейнер сцены
// (watch) получает не пассивный touchmove, страница и окно — нет; touchmove отменяется, пока идёт жест или прерванный ждёт
// отпускания пальца, и только отменяемый; после отпускания и вне жеста — не трогается. Иначе Chrome после быстрого
// отпускания запускает свою инерцию и на Android и Linux глотает следующее касание (в Chrome проверяет browser-play.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPointer } from '../pet/web/pointer.mjs';

// Цель событий: записанные слушатели (тип, параметры) и вызов по типу.
function target(extra = {}) {
  const added = [];
  return {
    added,
    addEventListener: (type, fn, options) => added.push({ type, fn, options }),
    removeEventListener: (type, fn) => {
      const i = added.findIndex((item) => item.type === type && item.fn === fn);
      if (i >= 0) added.splice(i, 1);
    },
    fire(type, event) {
      for (const item of added.filter((one) => one.type === type)) item.fn(event);
    },
    ...extra,
  };
}

function setup() {
  const abort = new AbortController();
  const win = target();
  const doc = target({ hidden: false });
  const root = target();
  const pointer = createPointer({ signal: abort.signal, root, win, doc });
  const box = target();
  const el = target({ setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {} });
  // touchmove контейнера: отменён ли (у неотменяемого preventDefault не вызывается вовсе).
  const move = (cancelable = true) => {
    let prevented = false;
    box.fire('touchmove', {
      cancelable,
      preventDefault() {
        assert.ok(cancelable, 'preventDefault у неотменяемого touchmove');
        prevented = true;
      },
    });
    return prevented;
  };
  const down = (on) => pointer.grab({ pointerId: 1, isPrimary: true, button: 0, pointerType: 'touch', preventDefault() {} }, el, on);
  return { abort, win, doc, root, pointer, box, move, down };
}

test('watch: не пассивный touchmove — только на контейнере сцены, со снятием при отключении; повторно — тот же слушатель', () => {
  const { abort, win, doc, root, pointer, box } = setup();
  pointer.watch(box);
  const [item] = box.added;
  assert.deepEqual([box.added.length, item.type, item.options.passive, item.options.signal], [1, 'touchmove', false, abort.signal]);
  for (const other of [win, doc, root]) assert.equal(other.added.some((one) => one.type.startsWith('touch')), false, 'на странице и в окне touch-слушателей нет');
  pointer.watch(box);
  assert.equal(new Set(box.added.filter((one) => one.type === 'touchmove').map((one) => one.fn)).size, 1, 'одна функция: браузер повтор не добавляет');
});

test('touchmove отменяется, пока палец ведёт жест; после отпускания и без жеста — нет', () => {
  const { pointer, box, move, down, win } = setup();
  pointer.watch(box);
  assert.equal(move(), false, 'без жеста — прокрутка страницы как есть');
  assert.equal(down({ move() {}, end: () => true }), true);
  assert.equal(move(), true, 'жест идёт — сдвиг не прокрутка');
  assert.equal(move(false), false, 'неотменяемый не трогается');
  win.fire('pointerup', { pointerId: 1 });
  assert.equal(pointer.gesturing(), false);
  assert.equal(move(), false, 'отпустили — снова как страница');
});

test('прерванный жест (скрыт, фон, уход с питомца) — touchmove отменяются до отпускания этого пальца', () => {
  const { pointer, box, move, down, win } = setup();
  pointer.watch(box);
  for (const reason of ['hidden', 'blur', 'leave', 'close']) {
    down({ move() {}, end: () => false });
    pointer.release(reason);
    assert.equal(pointer.gesturing(), false);
    assert.equal(move(), true, `${reason}: палец ещё на экране — без инерции браузера`);
    win.fire('pointerup', { pointerId: 1 });
    assert.equal(move(), false, `${reason}: отпустили — не трогается`);
  }
  // pointercancel — браузер сам забрал палец: ждать отпускания нечего.
  down({ move() {}, end: () => false });
  win.fire('pointercancel', { pointerId: 1 });
  assert.equal(move(), false);
});

test('отключение снимает и жест, и ожидание отпускания: touchmove больше не отменяются', () => {
  const { pointer, box, move, down } = setup();
  pointer.watch(box);
  down({ move() {}, end: () => false });
  pointer.destroy();
  assert.equal(move(), false);
});
