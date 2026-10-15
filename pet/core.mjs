// pet-companion/core — публичный вход общего ядра без DOM (этапы PL05, PL06; README, «Ядро без отображения»,
// «Питомцы и модели поведения»; docs/ARCHITECTURE.md § 4–7, § 14.1.5, § 14.1.6). Экземпляр ядра с командами,
// результатами, снимком и подпиской; определения формата 1 — питомец (definePet) и модель поведения (defineBehavior):
// проверка и собственная неизменяемая копия; координатор хранения над хранилищем ключ-значение интегратора (Node, своё
// приложение); ошибка создания, граница дня, версия. Импортирует только pet/core/**: ни определений штатных питомцев
// (pet-companion/pets, /behaviors), ни отображения, ни DOM, ни рисунков, ни стилей, ни сети.

import { exposed } from './core/facade.mjs';
import { createPetCore as createInstance } from './core/index.mjs';
import { PetError } from './core/errors.mjs';
import { coordinatorOf, createStorage } from './core/storage.mjs';

export { defineBehavior, definePet } from './core/define.mjs';
export { localDay } from './core/day.mjs';
export { VERSION } from './core/version.mjs';
export { createStorage, PetError };

// Экземпляр ядра: синхронно; проверка настроек и определений — до подключения к хранилищу (PetError с code:
// invalid-options, definition-invalid, duplicate-id, unsupported-format, storage-not-loaded). storage — координатор
// createStorage этой копии модуля, загруженный (load → ready или failed); pets и behaviors — непустые списки определений
// (своих у экземпляра, глобального реестра нет). Без записи, таймеров, слушателей при создании (журнал — только
// предупреждения о слабых ссылках модели); start() — первое включение и приветствие.
export function createPetCore(options) {
  if (options !== null && typeof options === 'object' && !Array.isArray(options) && !coordinatorOf(options.storage)) {
    throw new PetError('invalid-options', 'storage — координатор хранения из createStorage({ backend, namespace }) этой копии pet-companion/core.');
  }
  return exposed(createInstance(options));
}
