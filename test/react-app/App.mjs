// Только QA (npm run test:consumers): страница жизненного цикла pet-companion/react в чистом проекте с установленным архивом.
// Без JSX — тот же модуль рендерит сервер (prerender.mjs, Node) и гидратирует клиент (main.mjs, сборка Vite). Сайт держит
// ядро в своём состоянии (onCore → useState), снимок — usePetState(core), заглушку рисует рядом с контейнером. Журнал qa:
// каждый вызов onCore (номер ядра или null, метка свойств того рендера, статус прежнего ядра и число видов в контейнере в
// момент вызова), подписки хука на каждом ядре (активные, всего, настройки, доставки) и число рендеров. Пульт set/show —
// смена свойств и размонтирование без перезагрузки.
import { createElement as h, useEffect, useState } from 'react';
import { PetCompanion, usePetState } from 'pet-companion/react';

export const PLACEHOLDER = 'Питомец появится после загрузки страницы.';

// Журнал страницы. observe(next) — снимок обстановки в момент onCore (только клиент: читает DOM).
export function createQa(observe = () => ({})) {
  const ids = new Map();
  const cores = [];
  const log = [];
  const subs = new Map();
  const wrappers = new WeakMap();
  const counts = { renders: 0 };
  const idOf = (core) => {
    if (!core) return null;
    if (!ids.has(core)) {
      cores.push(core);
      ids.set(core, cores.length);
    }
    return ids.get(core);
  };
  // Ядро для usePetState через счётчик подписок: тот же объект для того же ядра (ссылка стабильна, как у ядра).
  const counted = (core) => {
    if (!core) return null;
    let own = wrappers.get(core);
    if (!own) {
      const stat = { active: 0, total: 0, options: [], deliveries: 0, early: 0 };
      subs.set(idOf(core), stat);
      own = {
        subscribe(listener, options) {
          stat.active += 1;
          stat.total += 1;
          stat.options.push(JSON.stringify(options ?? null));
          let subscribing = true;
          const off = core.subscribe((update) => {
            stat.deliveries += 1;
            if (subscribing) stat.early += 1;
            listener(update);
          }, options);
          subscribing = false;
          let done = false;
          return () => {
            if (!done) {
              done = true;
              stat.active -= 1;
            }
            off();
          };
        },
        getState: () => core.getState(),
      };
      wrappers.set(core, own);
    }
    return own;
  };
  return { idOf, cores, log, subs, counts, counted, observe, last: null };
}

// Свойства PetCompanion: tag — метка набора функций (новые функции каждого набора — новые ссылки).
export function propsOf(qa, { namespace = 'qa', tag = 'A', marks = 1, extra = {} } = {}) {
  return {
    namespace,
    tag,
    progress: () => ({ marks, today: 1, limit: 3 }),
    home: () => qa.home?.(tag) ?? null,
    onOpenChange: (open) => qa.log.push({ open, tag }),
    extra,
  };
}

export function App({ qa, initial }) {
  qa.counts.renders += 1;
  const [props, setProps] = useState(initial.props);
  const [shown, setShown] = useState(initial.shown);
  const [core, setCore] = useState(null);
  // Сайт, который держит ссылку на ядро и после onCore(null): хук сам превращает отключённое ядро в null.
  const [held, setHeld] = useState(null);
  const pet = usePetState(qa.counted(core));
  const kept = usePetState(held);
  // Пульт проверок — только на клиенте.
  useEffect(() => {
    qa.connect?.({ setProps, setShown });
  }, [qa]);
  const onCore = (next) => {
    qa.log.push({ core: qa.idOf(next), tag: props.tag, ...qa.observe(next) });
    if (next) {
      qa.last = next;
      setHeld(next);
    }
    setCore(next);
  };
  const { tag, extra, ...own } = props;
  return h(
    'main',
    null,
    shown ? h(PetCompanion, { ...own, ...extra, className: 'pet-box', onCore }) : null,
    h('p', { id: 'pet-state' }, pet ? `${pet.name.display}|${pet.progress?.marks ?? '-'}|${pet.status}` : PLACEHOLDER),
    h('p', { id: 'pet-held' }, kept ? `${kept.name.display}|${kept.status}` : PLACEHOLDER),
    h('button', { id: 'home-A', type: 'button' }, 'Дом A'),
    h('button', { id: 'home-B', type: 'button' }, 'Дом B'),
    h('button', { id: 'home-C', type: 'button' }, 'Дом C'),
  );
}
