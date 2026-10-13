// Ядро: раунд доставки (docs/ARCHITECTURE.md § 5.4) — один на копию модуля, общий для всех её ядер и координаторов
// хранения. Раунд открывает каждый вход извне: команда, destroy, subscribe, событие хранилища другой вкладки, поздний
// результат операции хранения, барьер загрузки. Фазы: работа (вместе с фиксациями операций хранения, § 8.3) → закрытие —
// не больше одного обновления каждого изменённого ядра, сначала ядро-автор, затем остальные в порядке подключения →
// доставка очереди FIFO. В работе публичные слушатели не вызываются. Команда из слушателя выполняется сразу в собственной
// фазе работы, её обновления встают в конец очереди того же раунда.

const R = { phase: 'idle', touched: null, deferred: null, queue: [], seq: 0, orders: 0 };

// Порядок подключения ядра к координатору — общий для всех координаторов этой копии модуля (порядок закрытия, § 5.4).
export const nextOrder = () => ++R.orders;

export const working = () => R.phase === 'work';
export const delivering = () => R.phase === 'deliver';
// Номер последнего закрытого обновления: подписка во время доставки получает только закрытые после неё.
export const sequence = () => R.seq;

// Ядро изменилось в текущей фазе работы — в её конце закроет обновление (core.close()).
export function touch(core) {
  if (R.phase === 'work') R.touched.add(core);
}

// destroy() в фазе работы — в её конце, до доставки (§ 5.4).
export function defer(fn) {
  R.deferred.push(fn);
}

// Закрытое обновление ядра — в очередь доставки.
export function push(item) {
  item.seq = ++R.seq;
  R.queue.push(item);
}

// Ядро отключили: его недоставленные обновления сняты с очереди (последним встанет 'destroyed').
export function drop(core) {
  R.queue = R.queue.filter((item) => item.core !== core);
}

// Вызов в фазе доставки этого раунда: сразу (уже идёт доставка), в конце очереди (идёт работа) или своим раундом.
export function soon(fn) {
  if (R.phase === 'deliver') fn();
  else if (R.phase === 'work') R.queue.push({ run: fn });
  else run(null, () => R.queue.push({ run: fn }));
}

// Фаза работы; author — порядок подключения ядра, чью команду или задачу (или поздний результат) она выполняет, null —
// событие хранилища или барьер. Внутри идущей фазы работы — её часть (синхронная фиксация внутри команды). Вне раунда —
// после работы и закрытия доставка всей очереди, затем возврат результата.
export function run(author, fn) {
  if (R.phase === 'work') return fn();
  const outer = R.phase;
  const touched = new Set();
  const deferred = [];
  R.phase = 'work';
  R.touched = touched;
  R.deferred = deferred;
  try {
    return fn();
  } finally {
    try {
      while (deferred.length) deferred.shift()();
    } finally {
      try {
        const rank = (core) => (core.order === author ? -Infinity : core.order);
        for (const core of [...touched].sort((a, b) => rank(a) - rank(b))) core.close();
      } finally {
        R.touched = null;
        R.deferred = null;
        R.phase = outer;
      }
    }
    if (outer === 'idle') deliver();
  }
}

function deliver() {
  R.phase = 'deliver';
  try {
    while (R.queue.length) {
      const item = R.queue.shift();
      if (item.run) item.run();
      else item.core.deliver(item);
    }
  } finally {
    R.phase = 'idle';
  }
}
