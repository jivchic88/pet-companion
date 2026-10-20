// Пример минимального режима в Node (вне пакета): персонаж без отображения и хранения — только публичный вход
// pet-companion/character. Продукт подтверждает события, персонаж отвечает реакцией; снимок и подписка — вызывающему.
// Часы и планировщик — свои (ручные), чтобы сценарий был воспроизводимым. Печатает JSON итога.

import { createCharacter, defineCharacter, PetError, VERSION } from 'pet-companion/character';
import { robot } from './robot.mjs';

let t = 1_000_000;
const tasks = [];
const scheduler = {
  later(ms, task) {
    const item = { at: t + ms, task };
    tasks.push(item);
    return () => {
      const i = tasks.indexOf(item);
      if (i >= 0) tasks.splice(i, 1);
    };
  },
};
function run(until) {
  for (;;) {
    tasks.sort((x, y) => x.at - y.at);
    const next = tasks[0];
    if (!next || next.at > until) break;
    t = next.at;
    tasks.shift();
    next.task();
  }
  t = until;
}
const clock = { now: () => t, day: () => '2026-10-20', nextDay: (at) => at + 86_400_000 };
const warnings = [];
const log = { warn: (message) => warnings.push(message) };

const hero = createCharacter({ character: robot, name: 'Бип', clock, random: () => 0.5, scheduler, log });
const seen = [];
hero.subscribe(({ snapshot, effects, reason }) => seen.push({ reason, pose: snapshot.pose.shown, phrase: snapshot.phrase?.text ?? '', effects: effects.map((e) => e.type) }));

const out = { ok: false, version: VERSION, warnings };
try {
  out.start = hero.start();
  out.done = hero.react('done', { key: 'task-1' }); // играет: поза happy, реплика, объявление
  out.duplicate = hero.react('done', { key: 'task-1' }); // тот же key — не играет
  out.unknown = hero.react('nope'); // unknown-id
  out.poseDuring = hero.getState().pose.shown;
  run(t + 2000);
  out.poseAfter = hero.getState().pose.shown;
  hero.setContext({ typing: true });
  out.queued = hero.react('oops', { text: 'Не вышло: сервер не ответил' }); // тишина — отложено
  hero.setContext({ typing: false }); // ввод закончился — отложенная реакция играет
  out.afterQuiet = { pose: hero.getState().pose.shown, phrase: hero.getState().phrase?.text ?? '' };
  run(t + 5000);
  out.focusPose = (hero.setContext({ focus: true }), hero.getState().pose.base);
  hero.setContext({ focus: false });
  out.reduced = (hero.setReducedMotion(true), hero.getState().prefs.effectiveMotion);
  out.named = hero.setName('Робик');
  // Без комнаты, игры и кормления: таких команд у персонажа нет вовсе.
  out.noRoom = ['room', 'feed', 'interact', 'stroke', 'toy', 'open', 'setPet'].every((name) => !(name in hero));
  // Описание без полей питомца — это описание персонажа, а не питомца формата 1.
  try {
    defineCharacter({ ...robot, room: {} });
    out.rejectsRoom = false;
  } catch (error) {
    out.rejectsRoom = error instanceof PetError && error.code === 'definition-invalid' && error.path === 'room';
  }
  hero.destroy();
  out.afterDestroy = hero.react('done');
  out.pendingTasks = tasks.length;
  out.updates = seen;
  out.ok = out.start.ok && out.done.played && out.duplicate.duplicate && out.unknown.error?.code === 'unknown-id' && out.poseDuring === 'happy' && out.poseAfter === 'calm' && out.queued.queued && out.afterQuiet.pose === 'think' && out.afterQuiet.phrase.startsWith('Не вышло') && out.focusPose === 'attentive' && out.reduced === 'none' && out.named.name === 'Робик' && out.noRoom && out.rejectsRoom && out.afterDestroy.error?.code === 'destroyed' && out.pendingTasks === 0 && warnings.length === 0;
} catch (error) {
  out.error = String(error?.stack ?? error);
}
console.log(JSON.stringify(out));
