// Общий хук React: снимок ядра или null (этап PL08; README, «React и серверный рендер»; docs/ARCHITECTURE.md § 11.3).
// Зависит только от react: ядро передаётся аргументом (веб — из PetCompanion или mountPetIn, натив — PL10), ни DOM, ни
// веб-модулей, ни ядра этот файл не импортирует. Сервер и гидратация — null (третий аргумент useSyncExternalStore; без
// него серверный рендер бросил бы). Подписка — с initial: false: React сам читает getSnapshot после подписки, начальная
// синхронная доставка ядра ему не нужна. Отключённое ядро — null. Снимок ядра — одна замороженная ссылка, пока состояние
// не изменилось (§ 5.2): хук его не копирует, поэтому повторное чтение не даёт лишних обновлений.

import { useCallback, useSyncExternalStore } from 'react';

const serverSnapshot = () => null;

// usePetState(core | null) → PetSnapshot | null. subscribe и getSnapshot меняются только вместе с core: React
// отписывается от прежнего ядра и подписывается на новое; отписка от уже отключённого ядра безвредна.
export function usePetState(core) {
  const subscribe = useCallback((changed) => (core ? core.subscribe(() => changed(), { initial: false }) : () => {}), [core]);
  const getSnapshot = useCallback(() => {
    const snapshot = core ? core.getState() : null;
    return snapshot && snapshot.status !== 'destroyed' ? snapshot : null;
  }, [core]);
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}
