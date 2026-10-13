// Место и вид питомца рядом со страницей и присутствие: правила без DOM. Предпочтение — смысловое место и вид, у
// телефона и компьютера свои (ключ place); что показать сейчас, решает petLayout по предпочтению и окну, не меняя
// сохранённого.

export const PLACE_VERSION = 1;
export const DEVICES = ['desktop', 'phone'];

export const PLACES = {
  desktop: [
    { id: 'logo', title: 'У логотипа' },
    { id: 'sidebar', title: 'В боковой панели' },
    { id: 'bottom', title: 'Внизу экрана' },
  ],
  phone: [
    { id: 'top', title: 'Наверху' },
    { id: 'bottom', title: 'Внизу' },
  ],
};

export const VIEWS = [
  { id: 'auto', title: 'Автоматически' },
  { id: 'compact', title: 'Портрет' },
  { id: 'full', title: 'Целиком' },
];

// Пустое место компьютера — «не выбирали»: прежнее поведение (высокий экран — боковая панель, невысокий —
// у логотипа). На телефоне прежнее место — верхняя панель.
const DEFAULTS = { desktop: { place: '', view: 'auto' }, phone: { place: 'top', view: 'auto' } };

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
// Сохранённый объект или {}.
const readJson = (text) => {
  try {
    const raw = JSON.parse(text ?? 'null');
    return isObject(raw) ? raw : {};
  } catch {
    return {};
  }
};
export const placeIds = (device) => PLACES[device].map((item) => item.id);
export const placeTitle = (device, id) => PLACES[device].find((item) => item.id === id)?.title ?? '';

export function defaultPlace() {
  return { v: PLACE_VERSION, desktop: { ...DEFAULTS.desktop }, phone: { ...DEFAULTS.phone } };
}

function normalizeDevice(device, raw) {
  const own = isObject(raw) ? raw : {};
  return {
    place: placeIds(device).includes(own.place) ? own.place : DEFAULTS[device].place,
    view: VIEWS.some((item) => item.id === own.view) ? own.view : DEFAULTS[device].view,
  };
}

// Повреждённое, чужое или неизвестное значение — по умолчанию; у каждого устройства отдельно.
export function normalizePlace(raw) {
  const own = isObject(raw) ? raw : {};
  return { v: PLACE_VERSION, desktop: normalizeDevice('desktop', own.desktop), phone: normalizeDevice('phone', own.phone) };
}

export function parsePlace(text) {
  try {
    return normalizePlace(JSON.parse(text ?? 'null'));
  } catch {
    return defaultPlace();
  }
}

// Запись: свежее сохранённое + изменённые поля ({ desktop?: { place?, view? }, phone?: … }). Пишутся только
// изменённые поля; остальное — как было, включая поля и значения будущих версий.
export function placeRecord(text, patch = {}) {
  const keep = readJson(text);
  const out = { ...keep, v: Number.isInteger(keep.v) && keep.v > PLACE_VERSION ? keep.v : PLACE_VERSION };
  for (const device of DEVICES) {
    const was = isObject(keep[device]) ? keep[device] : {};
    const fields = isObject(patch[device]) ? patch[device] : {};
    const clean = normalizeDevice(device, { ...was, ...fields });
    const changed = Object.fromEntries(Object.keys(fields).filter((key) => key in clean).map((key) => [key, clean[key]]));
    if (Object.keys(changed).length || isObject(keep[device])) out[device] = { ...was, ...changed };
  }
  return out;
}

// Медиазапросы окна — те же пороги, что в pet.css (README модуля, «Места»): телефон — до 860 px; боковая панель
// целиком — от 880 px высоты, портретом — от 840; внизу экрана — целиком от 1180 px ширины, портретом от 1140;
// наверху телефона целиком — от 390 px; в нижней панели — портрет от 340 px, целиком от 480.
export const PLACE_MEDIA = {
  phone: '(max-width: 860px)',
  tall: '(min-height: 880px)',
  roomy: '(min-height: 840px)',
  gutterFull: '(min-width: 1180px) and (min-height: 420px)',
  gutterCompact: '(min-width: 1140px)',
  topFull: '(min-width: 390px) and (min-height: 500px)',
  barCompact: '(min-width: 340px)',
  barFull: '(min-width: 480px) and (min-height: 500px)',
};

// Что помещается в каждом месте при этом окне.
export function placeAbility(device, env = {}) {
  if (device === 'phone') return { top: { compact: true, full: Boolean(env.topFull) }, bottom: { compact: Boolean(env.barCompact), full: Boolean(env.barFull) } };
  return {
    logo: { compact: true, full: false },
    sidebar: { compact: Boolean(env.roomy), full: Boolean(env.tall) },
    bottom: { compact: Boolean(env.gutterCompact), full: Boolean(env.gutterFull) },
  };
}

// Ближайшее безопасное место, если в выбранном сейчас не помещается даже портрет.
const FALLBACK = { desktop: { logo: ['logo'], sidebar: ['sidebar', 'logo'], bottom: ['bottom', 'sidebar', 'logo'] }, phone: { top: ['top'], bottom: ['bottom', 'top'] } };
// Где показан напарник (элемент страницы): у компьютера внизу — поле справа, у телефона — нижняя панель.
const HOST = { desktop: { logo: 'logo', sidebar: 'sidebar', bottom: 'float' }, phone: { top: 'top', bottom: 'bar' } };

// Что показать сейчас: место (at) и вид. Сохранённое не меняется: не хватило места — портрет или
// ближайшее место, хватило — снова выбранное. «Автоматически» — прежнее поведение: целиком в боковой
// панели на высоком экране и внизу экрана при свободном поле; у логотипа и на телефоне — портрет.
export function petLayout(record, env = {}) {
  const device = env.phone ? 'phone' : 'desktop';
  const pref = normalizePlace(record)[device];
  const can = placeAbility(device, env);
  const chosen = pref.place;
  let at = '';
  if (!chosen) at = env.tall ? 'sidebar' : pref.view === 'full' && can.bottom.full ? 'bottom' : 'logo';
  else at = FALLBACK[device][chosen].find((id) => can[id].compact);
  const fits = can[at].full;
  const full = pref.view === 'full' ? fits : pref.view === 'auto' && device === 'desktop' && at !== 'logo' && fits;
  return {
    device,
    place: chosen || at,
    chosen,
    at,
    host: HOST[device][at],
    view: full ? 'full' : 'compact',
    want: pref.view,
    moved: Boolean(chosen) && at !== chosen,
    squeezed: pref.view === 'full' && !full,
    wantsFull: pref.view === 'full' || full,
  };
}

// Изменение вида: «Свернуть» и «Показать целиком» не уводят питомца с места, где новый вид помещается. Место,
// которое не выбирали, закрепляется только тогда, когда без этого питомец ушёл бы отсюда (например, свернули
// целого внизу экрана на невысоком окне); «Автоматически» ничего не закрепляет — это прежнее поведение.
// stored — сохранённое как есть: место, непонятное этой версии (из более новой), выбор вида не заменяет.
export function viewPatch(record, env, view, stored = record) {
  const device = env.phone ? 'phone' : 'desktop';
  const pref = normalizePlace(record)[device];
  const kept = isObject(stored) && isObject(stored[device]) ? stored[device].place : undefined;
  const unknown = kept !== undefined && kept !== '' && !placeIds(device).includes(kept);
  if (pref.place || view === 'auto' || unknown) return { [device]: { view } };
  const now = petLayout(record, env);
  const next = petLayout({ ...normalizePlace(record), [device]: { ...pref, view } }, env);
  const fits = placeAbility(device, env)[now.at]?.[view];
  return next.at !== now.at && fits ? { [device]: { view, place: now.at } } : { [device]: { view } };
}

// Пояснение под выбором: где питомец сейчас, если не там или не так, как выбрано.
export function placeNote(layout) {
  const where = placeTitle(layout.device, layout.at).toLowerCase();
  if (layout.moved) {
    const why =
      layout.chosen === 'bottom' && layout.device === 'desktop'
        ? 'Внизу экрана сейчас нет свободного поля справа'
        : layout.chosen === 'sidebar'
          ? 'В боковой панели сейчас мало места по высоте'
          : 'Внизу на узком экране нет места';
    return `${why} — питомец временно ${where}. Выбор сохранён.`;
  }
  if (!layout.squeezed) return '';
  if (layout.at === 'logo') return 'У логотипа помещается только портрет; целиком — в боковой панели или внизу экрана.';
  if (layout.device === 'phone' && layout.at === 'bottom') return 'Внизу на узком экране — портрет; целиком помещается наверху.';
  return 'Сейчас мало места — показан портрет; целиком вернётся, когда места хватит.';
}

// ---------- присутствие (ключ presence): always — рядом, on-call — кнопка вызова; «скрыт» — отдельно ----------

export const PRESENCES = [
  { id: 'always', title: 'Всегда рядом', note: 'Питомец остаётся рядом со страницей.' },
  { id: 'on-call', title: 'Приходит по зову', note: 'Без постоянной мордашки. Позови кнопкой, когда захочешь.' },
];
export const presenceOf = (value) => (PRESENCES.some((item) => item.id === value) ? value : 'always');
// Нет ключа, повреждено, неизвестно — always.
export const parsePresence = (text) => presenceOf(readJson(text).mode);
// Запись: свежее сохранённое (с полями будущих версий) + режим.
export function presenceRecord(text, mode) {
  const keep = readJson(text);
  return { ...keep, v: Number.isInteger(keep.v) && keep.v > 1 ? keep.v : 1, mode: presenceOf(mode) };
}

// Рядом со страницей: 'pet', 'call' или 'none' (скрыт).
export const presenceSurface = (mode, hidden = false) => (hidden ? 'none' : presenceOf(mode) === 'on-call' ? 'call' : 'pet');
// Питомец на виду (можно декоративное): рядом или вызван, не скрыт, вкладка видна.
export const petAround = ({ mode, hidden = false, open = false, pageHidden = false } = {}) => !hidden && !pageHidden && (open || presenceOf(mode) !== 'on-call');
