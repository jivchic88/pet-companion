// Ядро: имя питомца — очистка, готовые имена страницами, «ещё не выбирали». Сами имена (по умолчанию, готовые,
// предложение для знакомства), облики, подписи и формы слова — у определений питомцев (PL06, pet/defs/**, definePet);
// здесь только общие правила над ними.

export const NAME_MAX = 24;

// Имя: без управляющих символов и лишних пробелов, не длиннее NAME_MAX; пустое — имя по умолчанию.
export function cleanName(value) {
  // Управляющие символы и угловые скобки убираются (имя попадает в разметку и подписи).
  const unsafe = (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === '<' || char === '>';
  return String(value ?? '')
    .replace(/[\s\S]/g, (char) => (unsafe(char) ? '' : char))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

// Показанное имя: выбранное или имя по умолчанию питомца (fallback — его names.default).
export const displayName = (name, fallback) => name || fallback;

// ---------- готовые имена страницами ----------
// presets — готовые имена питомца (names.presets определения).

export const NAMES_PER_PAGE = 4;

export const namePageCount = (presets) => Math.ceil(presets.length / NAMES_PER_PAGE);

// Страница подборки, где есть имя (иначе первая); номер — по кругу.
export function namePageOf(presets, name = '') {
  const index = presets.indexOf(name);
  return index < 0 ? 0 : Math.floor(index / NAMES_PER_PAGE);
}

export function namePage(presets, page = 0) {
  const count = namePageCount(presets);
  const at = (((Math.trunc(page) || 0) % count) + count) % count;
  return presets.slice(at * NAMES_PER_PAGE, (at + 1) * NAMES_PER_PAGE);
}

// Предлагать ли смешной вариант: имя ещё не выбирали (сохранено пустое).
export const nameOffered = (storedName) => !cleanName(storedName);
