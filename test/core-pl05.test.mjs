// PL05 — поведение экземпляра ядра, которое изменилось вместе с публичным входом (docs/ARCHITECTURE.md § 14.1.5), через
// внутренний экземпляр (он есть и до PL05: проверки падают на прежнем коде по поведению, а не из-за отсутствующего входа).
// Событие saved — непустой key и только известные поля; пустой key — только внутренняя граница legacy (scene: false);
// failed — без подробностей; подписка с неверными настройками — журнал без исключения; новая ступень, увиденная при
// показе уголка, — эффект seen (прямая команда показывает «Новое в уголке» тем же путём, что кнопка); готовое имя —
// объявление «Имя: …» эффектом ядра; отклики на имя и питомца — только на виду. У каждого — положительный контроль, который
// проходит и до PL05. Данные синтетические.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DAY, host, LEGACY_DISPLAY, life } from './core-kit.mjs';

const CAT = { v: 1, seenStage: 0, greetDay: DAY };

test('событие saved: пустой key и неизвестные поля — invalid-argument без изменений; failed с подробностями — invalid-argument; контроль — обычное событие и legacy без key', () => {
  const L = life({ cat: CAT }, { counts: host(1, 1) });
  L.core.start();
  const before = L.state();
  const seen = L.seen.length;
  for (const detail of [{ key: '' }, { key: 'k', points: 3 }, { key: 'k', counted: true, extra: 1 }]) assert.equal(L.core.notify('saved', detail).error?.code, 'invalid-argument', JSON.stringify(detail));
  assert.equal(L.core.notify('failed', { key: 'k' }).error?.code, 'invalid-argument');
  assert.deepEqual([L.state() === before, L.seen.length - seen], [true, 0]);
});

test('legacy-событие с пустым key (String(detail.key) фасада) — принято через scene: false; публичный путь его не принимает', () => {
  const L = life({ cat: CAT }, { counts: host(1, 1) });
  L.core.start();
  assert.equal(L.core.notify('saved', { key: '', counted: false, hard: false, first: false }, { scene: false }).ok, true, 'Р2: как 0.1.4');
  assert.equal(L.core.notify('saved', { key: '', counted: true }).error?.code, 'invalid-argument');
});

test('подписка с неверными настройками — журнал и пустая отписка, без исключения; контроль — обычная подписка', () => {
  const L = life({ cat: CAT });
  let thrown = null;
  let off = null;
  try {
    off = L.core.subscribe(() => {}, null);
  } catch (error) {
    thrown = error;
  }
  assert.deepEqual([thrown, typeof off], [null, 'function']);
  assert.ok(L.log.list.some((line) => line.includes('subscribe')));
});

test('ступень, увиденная при показе уголка, — эффект seen с вещами; контроль — результат fresh', () => {
  const L = life({ cat: CAT }, { counts: host(9, 1), display: LEGACY_DISPLAY });
  L.core.start();
  const opened = L.core.open('corner');
  const seen = L.seen.at(-1).effects.find((effect) => effect.type === 'seen');
  assert.deepEqual(seen && { stage: seen.stage, items: seen.items }, { stage: 2, items: opened.fresh });
});

test('готовое имя — объявление «Имя: …» эффектом ядра; контроль — отклик named', () => {
  const L = life({ cat: CAT }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  L.core.start();
  L.core.open('corner');
  L.plan.advance(5000);
  L.core.setName('Котлетыч', { pick: true });
  assert.ok(L.seen.at(-1).effects.some((effect) => effect.type === 'announce' && effect.text === 'Имя: Котлетыч.'));
});

test('отклики на имя и питомца — только на виду: «по зову» и не вызван — тихо; контроль — «Всегда рядом»', () => {
  const away = life({ cat: CAT, presence: { v: 1, mode: 'on-call' } }, { counts: host(1, 1), display: LEGACY_DISPLAY });
  away.core.start();
  away.plan.advance(10_000);
  const pet = away.core.setPet('dog');
  const name = away.core.setName('Котлетыч', { pick: true });
  assert.deepEqual([pet.ok, pet.reacted, name.ok, name.reacted, away.state().pose.reaction], [true, false, true, false, null]);
});

test('контроли (проходят и до PL05): обычное событие и legacy без key через scene: false, failed с null, обычная подписка, fresh при открытии уголка, отклик named и meet на виду', () => {
  const L = life({ cat: CAT }, { counts: host(9, 1), display: LEGACY_DISPLAY });
  L.core.start();
  const opened = L.core.open('corner');
  assert.ok(opened.ok && opened.fresh.length > 0, 'вещи стали увиденными (результат fresh)');
  assert.equal(L.core.notify('saved', { key: 'lesson', counted: true }).ok, true);
  assert.equal(L.core.notify('saved', { key: 'undefined', counted: false, hard: false, first: false }, { scene: false }).ok, true);
  assert.equal(L.core.notify('failed', null).ok, true);
  const got = [];
  L.core.subscribe((update) => got.push(update.reason));
  assert.deepEqual(got, ['initial']);
  L.plan.advance(10_000);
  assert.equal(L.core.setName('Котлетыч', { pick: true }).reacted, true);
  L.plan.advance(10_000);
  assert.equal(L.core.setPet('dog').reacted, true);
});
