// pet-companion/web — публичный вход веба без мест сайта (этап PL07; README, «Питомец в контейнере»; docs/ARCHITECTURE.md § 6.1,
// § 11.2): питомец в одном контейнере (mountPetIn), веб-адаптеры ядра для своего отображения — координатор хранения на
// localStorage (createWebStorage) и резервирование дня сценки на IndexedDB (createWebScenes) — и штатные наборы
// отображения кота и собаки (catWeb, dogWeb). Импорт ничего не делает: ни DOM, ни хранилища, ни медиазапросов — только
// вызовы (вход безопасен для серверного рендера; сам питомец — клиентский, PL08).

import { PetError } from './core/errors.mjs';
import { publicStorage } from './core/storage.mjs';
import { createWebScenes as sharedScenes } from './web/scenes.mjs';
import { createWebStorage as sharedStorage } from './web/storage.mjs';

export { catWeb, dogWeb } from './web/kits.mjs';
export { mountPetIn } from './web/view.mjs';

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function namespaceOf(options, what) {
  if (options !== undefined && !isRecord(options)) throw new PetError('invalid-options', `Настройки ${what} — объект { namespace? }.`);
  for (const key of Object.keys(options ?? {})) if (key !== 'namespace') throw new PetError('invalid-options', `Неизвестная настройка ${what}: ${key}.`);
  const namespace = options?.namespace ?? 'pet';
  if (typeof namespace !== 'string' || !namespace) throw new PetError('invalid-options', 'namespace — непустая строка.');
  return namespace;
}

// Координатор хранения на localStorage этой страницы для пространства namespace: тот же объект для того же namespace —
// и тот же внутренний координатор (очередь ключа, кэш, реестр подключений), что у mountPet и mountPetIn этой копии модуля.
// Создаётся загруженным: первая загрузка читает все ключи синхронно (status — 'ready' или 'failed' при отказе
// localStorage). Перед каждым новым ядром — load() (синхронный барьер: перечитать и сверить). Публичный createPetCore
// (pet-companion/core этой же копии) его принимает; подключения создаёт само ядро. Ошибка настроек — PetError.
export function createWebStorage(options) {
  const coordinator = sharedStorage({ namespace: namespaceOf(options, 'хранилища') });
  if (coordinator.status === 'idle') coordinator.load();
  return publicStorage(coordinator);
}

const reservers = new WeakMap();
// Резервирование дня редкой сценки на IndexedDB (база <namespace>:scene) — общее для всех ядер с этим namespace на
// странице: тот же объект для того же namespace. reserve(decide, show) → Promise<'shown' | 'skip' | 'fail' | 'lost'>, никогда
// не отклоняется; без IndexedDB — 'fail' (сценок нет). Ошибка настроек — PetError.
export function createWebScenes(options) {
  const inner = sharedScenes({ namespace: namespaceOf(options, 'сценок') });
  let own = reservers.get(inner);
  if (!own) reservers.set(inner, (own = Object.freeze({ reserve: (decide, show) => inner.reserve(decide, show) })));
  return own;
}
