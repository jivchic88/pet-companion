// Только проверки: правила миски и мячика с прежними сигнатурами 0.1.4 (пол по животному kind, питомец стоит в ANCHOR) —
// поверх ядра pet/core/toys.mjs и штатных определений PL06 (play.foot, play.paw, play.anchor, size.ground).

import * as Core from '../pet/core/toys.mjs';
import { cat } from '../pet/defs/cat.mjs';
import { dog } from '../pet/defs/dog.mjs';

export * from '../pet/core/toys.mjs';

const DEFS = { cat, dog };
export const ANCHOR = cat.play.anchor;
export const FLOOR_LINE = cat.size.ground;
export const zoneOf = (floor, touch = 0, kind = 'cat') => Core.zoneOf(floor, touch, DEFS[kind] ?? cat);
export const closer = (a, b, anchor = ANCHOR) => Core.closer(a, b, anchor);
export const sideOf = (x, anchor = ANCHOR) => Core.sideOf(x, anchor);
