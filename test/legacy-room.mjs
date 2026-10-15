// Только проверки: правила комнаты 0.1.4 с прежними сигнатурами (по животному kind: 'cat' | 'dog'; раскладка
// { kind, stage, pos }) — поверх модели комнаты ядра (pet/core/room.mjs: roomModel(определение)) и штатных определений PL06.
// Прежние проверки геометрии (room, editor, integration) сверяют через них, что определения кота и собаки воспроизводят
// рамки, исходные места, мебель и масштаб 0.1.4. Своих данных нет — только выборки из определений.

import * as Core from '../pet/core/room.mjs';
import { cat } from '../pet/defs/cat.mjs';
import { dog } from '../pet/defs/dog.mjs';

export { DIRS, grid, movedItems, OVERLAP, readPoint, ROOM_VERSION, same, samePlaces, SCENE, STEP } from '../pet/core/room.mjs';

export const MODELS = Object.freeze({ cat: Core.roomModel(cat), dog: Core.roomModel(dog) });
const homes = { cat: MODELS.cat.home, dog: MODELS.dog.home };
const model = (kind = 'cat') => MODELS[kind] ?? MODELS.cat;
// Раскладка 0.1.4 ({ kind, stage, pos }) → раскладка ядра ({ model, stage, pos }).
const lay = (layout) => (layout?.model ? layout : { ...layout, model: model(layout?.kind) });

// Исходные места всех предметов кота и собаки (общие rest и bowl, клубок, канат, мячик).
export const HOME = Object.freeze({ ...MODELS.cat.home, ...MODELS.dog.home });
export const PET_SCALE = MODELS.cat.scale;
export const FEED = Object.freeze({ cat: cat.room.feed, dog: dog.room.feed });

export const seatOf = (stage) => Core.seatOf(MODELS.cat, stage).id;
export const itemTitle = (id, stage) => Core.itemTitle(id === 'yarn' ? MODELS.cat : MODELS.dog, id, stage);
export const roomItems = (kind, stage) => Core.roomItems(model(kind), stage);
export const parseRoom = (text) => Core.parseRoom(text, MODELS);
export const roomRecord = (text, kind, moved) => Core.roomRecord(text, kind, moved, model(kind).home);
export const roomWrite = (text, patch = {}) => Core.roomWrite(text, patch, homes);

export const arrange = (kind, stage, saved = {}) => ({ kind, ...Core.arrange(model(kind), stage, saved) });
export const frames = (layout, id, p) => Core.frames(lay(layout), id, p);
export const range = (layout, id) => Core.range(lay(layout), id);
export const fits = (layout, id, p) => Core.fits(lay(layout), id, p);
export const settle = (layout, id, want) => Core.settle(lay(layout), id, want);
export const nudge = (layout, id, dir) => Core.nudge(lay(layout), id, dir);
export const hitBox = (layout, id, min) => Core.hitBox(lay(layout), id, min);
export const pickAt = (layout, p, selected, min) => Core.pickAt(lay(layout), p, selected, min);
export const feedShift = (layout) => Core.feedShift(lay(layout));
export const layoutOf = lay;
