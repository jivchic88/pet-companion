// Типы входа pet-companion/pets (pet/pets.mjs): штатные питомцы — определения формата 1 (данные 0.1.4) и общий уголок.

import type { PetDefinition, PetRoomDefinition, PetStageIndex } from './core.mjs';

/** Кот — штатный питомец. */
export declare const cat: PetDefinition;
/** Собака — штатный питомец. */
export declare const dog: PetDefinition;
/** Общий уголок: мебель ступеней и её места — `room: { ...corner, pet, feed, toys }` своего питомца. */
export declare const corner: Pick<PetRoomDefinition, 'frame' | 'floor' | 'rest' | 'seats' | 'bowl' | 'fixed'>;
/** Вещи ступеней общего уголка (их рисует общая сцена веб-отображения). */
export declare const cornerItems: readonly { readonly id: string; readonly title: string; readonly stage: PetStageIndex; readonly mini?: number }[];
