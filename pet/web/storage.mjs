// Веб: координатор хранения на localStorage (docs/ARCHITECTURE.md § 8.10). Один на пространство имён в этой копии модуля
// (разные копии на странице реестр не делят — держите одну). Загрузка — синхронно все восемь ключей формата 0.1.4: отказ
// чтения любого — 'failed', новые подключения работают без записей. Операция ключа и её фиксация — в том же вызове write
// (getItem → build → setItem или ничего → сверка, кэш, поглощение, settle): результат известен до рисования и объявления,
// видимого pending нет. Событие storage другой вкладки — повторное чтение и сверка (newValue не используется), key ===
// null — все ключи пространства. Слушатель storage — только пока есть открытые подключения.

import { STORAGE_NAMES, storageKeys } from '../core/formats/legacy.mjs';
import { createCoordinator, shared } from '../core/storage.mjs';

export const WEB_KEYS = STORAGE_NAMES;

// Идентичность localStorage этой страницы в реестре координаторов.
const PAGE = {};

// area и events — для проверок без браузера (объект с getItem / setItem и цель событий storage); по умолчанию —
// localStorage и окно страницы. Доступ к localStorage может бросить (запрещён) — это отказ чтения.
export function createWebStorage({ namespace = 'pet', area = null, events = null } = {}) {
  return shared(area ?? PAGE, namespace, () => {
    const full = storageKeys(namespace);
    const names = new Map(WEB_KEYS.map((key) => [full[key], key]));
    const store = () => area ?? globalThis.localStorage;
    const target = () => events ?? globalThis;
    let coordinator = null;
    const onStorage = (event) => {
      const key = event?.key ?? null;
      if (key !== null && !names.has(key)) return;
      try {
        coordinator.external(key === null ? null : names.get(key));
      } catch {
        // сбой сверки не мешает странице; следующее чтение ключа сверит кэш
      }
    };
    coordinator = createCoordinator({
      keys: WEB_KEYS,
      backend: {
        async: false,
        get: (key) => store().getItem(full[key]),
        set: (key, value) => store().setItem(full[key], value),
      },
      opened: () => target().addEventListener?.('storage', onStorage),
      closed: () => target().removeEventListener?.('storage', onStorage),
    });
    return coordinator;
  });
}
