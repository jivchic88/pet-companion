// Ядро: штатные кот и собака — профили, облики, имена (данные без графики). До подключаемых определений питомцев (этап
// PL06, docs/ARCHITECTURE.md § 7.9) кот и собака описаны здесь; рисунки и стили — у веб-отображения.

export const DEFAULT_NAME = 'Марс';
export const NAME_MAX = 24;

export const KINDS = ['cat', 'dog'];

// Профиль животного: подписи, имя по умолчанию, одиночные движения покоя и особенности.
export const PROFILES = {
  cat: { kind: 'cat', title: 'Кот', defaultName: DEFAULT_NAME, gen: 'кота', acc: 'кота', micro: ['ear', 'tail', 'look'], open: ['ear', 'blink'], paw: false },
  // Пёс чаще наклоняет голову, двигает ушами и виляет хвостом.
  dog: { kind: 'dog', title: 'Собака', defaultName: 'Тоби', gen: 'собаки', acc: 'собаку', micro: ['tilt', 'ear', 'tail', 'tilt', 'ear', 'look'], open: ['tilt', 'ear'], paw: true },
};

export const kindOf = (value) => (KINDS.includes(value) ? value : 'cat');
export const profileOf = (kind) => PROFILES[kindOf(kind)];

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

export const catName = (settings) => settings?.name || DEFAULT_NAME;
export const companionName = (view) => view?.name || profileOf(view?.kind).defaultName;

// ---------- имена: готовые варианты ----------
// Имя — name кота в cat, dog.name в companion. Пустое сохранённое имя — «ещё не выбирали»: имя по умолчанию (Марс, Тоби)
// и предложение смешного варианта; «Оставить» пишет имя по умолчанию явно.

export const NAME_PRESETS = {
  cat: ['Котлетыч', 'Пельмень', 'Бублик', 'Мурджер', 'Сеньор Мур', 'Марс', 'Сырник', 'Бэклог', 'Пиксель', 'Тимлидыч', 'Коржик', 'Профитроль'],
  dog: ['Барклий', 'Лапыч', 'Батон', 'Спринт', 'Шашлычок', 'Тоби', 'Пончик', 'Стендап', 'Чебурек', 'Релиз', 'Пряник', 'Гавриил'],
};
// Стартовое предложение для знакомства (без выбора — только предложение, не переименование).
export const NAME_OFFER = { cat: 'Котлетыч', dog: 'Барклий' };
export const NAMES_PER_PAGE = 4;

export const namePresets = (kind) => NAME_PRESETS[kindOf(kind)];
export const namePageCount = (kind) => Math.ceil(namePresets(kind).length / NAMES_PER_PAGE);

// Страница подборки, где есть имя (иначе первая); номер — по кругу.
export function namePageOf(kind, name = '') {
  const index = namePresets(kind).indexOf(name);
  return index < 0 ? 0 : Math.floor(index / NAMES_PER_PAGE);
}

export function namePage(kind, page = 0) {
  const count = namePageCount(kind);
  const at = (((Math.trunc(page) || 0) % count) + count) % count;
  return namePresets(kind).slice(at * NAMES_PER_PAGE, (at + 1) * NAMES_PER_PAGE);
}

// Предлагать ли смешной вариант: имя ещё не выбирали (сохранено пустое).
export const nameOffered = (storedName) => !cleanName(storedName);

// ---------- облик ----------
// Три окраса у каждого животного; первый — прежний облик и значение по умолчанию. Только косметика.

export const COATS = {
  cat: [
    { id: 'smoke', title: 'Дымчатый' },
    { id: 'ginger', title: 'Рыжий' },
    { id: 'tuxedo', title: 'Чёрно-белый' },
  ],
  dog: [
    { id: 'caramel', title: 'Карамельный' },
    // Неразрывный пробел после «с»: в узкой карточке предлог не остаётся в конце строки.
    { id: 'spotted', title: 'Белый с пятном' },
    { id: 'blacktan', title: 'Чёрный с подпалом' },
  ],
};

export const coatsOf = (kind) => COATS[kindOf(kind)];
// Известный облик животного; неизвестный, чужой или пустой — облик по умолчанию.
export const coatOf = (kind, value) => (coatsOf(kind).some((coat) => coat.id === value) ? value : coatsOf(kind)[0].id);
export const coatTitle = (kind, value) => coatsOf(kind).find((coat) => coat.id === coatOf(kind, value)).title;
