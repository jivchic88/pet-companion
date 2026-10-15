// Ядро: единственный выбор реплики (docs/ARCHITECTURE.md § 13 «Реплики»). Банки реплик — у модели поведения (PL06:
// phrases.default — без признаков вида, phrases.byPet[petId] — замены групп для питомца; реплики кота и собаки 0.1.4 — в
// byPet штатной модели calm). Выбор — с портом random экземпляра, без повтора только что сказанной.

// Банк пары «питомец + модель»: группы default, поверх — группы byPet этого питомца (группа заменяется целиком).
export const bankOf = (behavior, petId) => ({ ...behavior.phrases.default, ...(behavior.phrases.byPet?.[petId] ?? {}) });

// Реплики группы, открытые на ступени stage (запись { text, stage } — с этой ступени).
export function phraseList(bank, group, stage = 0) {
  return (Object.hasOwn(bank, group) ? bank[group] : []).filter((item) => typeof item === 'string' || item.stage <= stage).map((item) => (typeof item === 'string' ? item : item.text));
}

// Случайная реплика группы, но не та же, что была только что. random — порт [0, 1) экземпляра ядра (вызывается, только
// если выбирать есть из чего).
export function pickPhrase(bank, group, { last = '', stage = 0, random } = {}) {
  const list = phraseList(bank, group, stage);
  const pool = list.filter((text) => text !== last);
  const from = pool.length ? pool : list;
  return from.length ? from[Math.min(from.length - 1, Math.floor(random() * from.length))] : '';
}
