// pet-companion/core — публичный вход общего ядра без DOM (этап PL05; README, «Ядро без отображения»; docs/ARCHITECTURE.md
// § 4–6, § 14.1.5). Экземпляр ядра с командами, результатами, снимком и подпиской; координатор хранения над хранилищем
// ключ-значение интегратора (Node, своё приложение); ошибка создания, граница дня, версия. Импортирует только pet/core/**:
// ни отображения, ни DOM, ни рисунков, ни стилей, ни сети. Питомцы — встроенные кот и собака; регистрация определений
// (definePet, defineBehavior, настройки pets и behaviors) — следующий этап (PL06), здесь её нет.

import { exposed } from './core/facade.mjs';
import { createPetCore as createInstance } from './core/index.mjs';
import { PetError } from './core/errors.mjs';
import { coordinatorOf, createStorage } from './core/storage.mjs';

export { localDay } from './core/day.mjs';
export { VERSION } from './core/version.mjs';
export { createStorage, PetError };

// Экземпляр ядра: синхронно; проверка настроек — до подключения к хранилищу (PetError с code: invalid-options,
// storage-not-loaded). storage — координатор createStorage этой копии модуля, загруженный (load → ready или failed). Без
// записи, таймеров, портов и слушателей при создании; start() — первое включение и приветствие.
export function createPetCore(options) {
  if (options !== null && typeof options === 'object' && !Array.isArray(options) && !coordinatorOf(options.storage)) {
    throw new PetError('invalid-options', 'storage — координатор хранения из createStorage({ backend, namespace }) этой копии pet-companion/core.');
  }
  return exposed(createInstance(options));
}
