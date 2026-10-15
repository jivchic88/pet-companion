// Только проверки: распознавание жеста «Поиграть» с прежними сигнатурами 0.1.4 (по животному kind: 'cat' | 'dog') —
// поверх веб-модуля pet/pet-play.mjs (области и лапа — из определения питомца, PL06) и штатных определений. Прежние
// проверки областей, лапы и жеста (play, toys) сверяют через них, что определения кота и собаки воспроизводят области
// попадания и лапу 0.1.4. Своих данных нет — только выборки из определений.

import * as G from '../pet/pet-play.mjs';
import { cat } from '../pet/defs/cat.mjs';
import { dog } from '../pet/defs/dog.mjs';

export * from '../pet/pet-play.mjs';

const DEFS = { cat, dog };
const defOf = (kind) => DEFS[kind] ?? cat;

export const PET_BOX = Object.freeze({ width: cat.size.width, height: cat.size.height });
export const HIT = Object.freeze({ cat: cat.play.hits, dog: dog.play.hits });
export const PAW = Object.freeze({ cat: cat.play.paw, dog: dog.play.paw });

export const petPart = (kind, u, v, pose = '', minR = 0) => G.petPart(defOf(kind), u, v, pose, minR);
export const partAt = (kind, rect, x, y, pose = '') => G.partAt(defOf(kind), rect, x, y, pose);
export const pawBottom = (kind, rect, pose = '') => G.pawBottom(defOf(kind), rect, pose);
export const hitStyle = (e) => G.hitStyle(e, cat.size);
export const pawStyle = (p) => G.pawStyle(p, cat.size);
export const hitsHtml = (kind) => G.hitsHtml(defOf(kind));
// Определение питомца области — по data-kind разметки (без него — кот, как рисунок 0.1.4).
export const initPlay = (hooks, signal) => G.initPlay({ figure: (kind) => defOf(kind ?? 'cat'), ...hooks }, signal);
