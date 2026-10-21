// Типы входа pet-companion/bunny (pet/bunny.mjs): кролик — штатное определение формата 1 и его веб-набор отображения.

import type { PetDefinition } from './core.mjs';
import type { PetWebKit } from './pet.mjs';

/** Кролик — штатный питомец (с 0.4.0): подключается явно — `pets: [cat, dog, bunny]`. */
export declare const bunny: PetDefinition;
/** Веб-набор кролика: `kits: [bunnyWeb]`; стили — `pet-companion/bunny.css` на странице (контейнер подключает `styles` сам). */
export declare const bunnyWeb: PetWebKit;
