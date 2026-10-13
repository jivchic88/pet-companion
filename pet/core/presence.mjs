// Ядро: присутствие (docs/ARCHITECTURE.md § 6.4, § 10; срез PL04.2) — ключ presence:v1 (always — питомец рядом со
// страницей, on-call — приходит по зову) и смысл поверхности. «Скрыт» — отдельное поле cat.hidden: вызов не смешивается со
// скрытием. Формат и правила без DOM; кнопки и места — у отображения.

import { keepRecord, readRecord, isRecord } from './formats/legacy.mjs';

export const PRESENCE_VERSION = 1;
export const PRESENCE_MODES = ['always', 'on-call'];

export const presenceOf = (value) => (PRESENCE_MODES.includes(value) ? value : 'always');
// Нет ключа, повреждено, неизвестный режим (в том числе более новой версии) — always.
export const normalizePresence = (raw) => ({ v: PRESENCE_VERSION, mode: presenceOf(isRecord(raw) ? raw.mode : undefined) });
export const parsePresence = (text) => normalizePresence(readRecord(text).raw).mode;
// Запись: свежее сохранённое как есть (поля будущих версий, больший v) + режим. patch — { mode } или строка режима.
export const presenceRecord = (text, patch) => keepRecord(text, PRESENCE_VERSION, normalizePresence, typeof patch === 'string' ? { mode: patch } : (patch ?? {}));

// Рядом со страницей: 'pet' (питомец), 'call' (лапка вызова) или 'none' (спрятан).
export const presenceSurface = (mode, hidden = false) => (hidden ? 'none' : presenceOf(mode) === 'on-call' ? 'call' : 'pet');
// Питомец на виду (можно декоративное): не спрятан и рядом либо вызван (открыт вид). pageHidden — скрытая вкладка: смысл
// присутствия от неё не меняется (снимок ядра — presence.around без неё, видимость — visible), учитывает тот, кто
// спрашивает о показе.
export const petAround = ({ mode, hidden = false, open = false, pageHidden = false } = {}) => !hidden && !pageHidden && (open || presenceOf(mode) !== 'on-call');
