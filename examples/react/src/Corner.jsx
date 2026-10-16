import { useState } from 'react';
import { PetCompanion, usePetState } from 'pet-companion/react';

// Питомец в блоке страницы: на сервере и при гидратации — пустой контейнер и заглушка сайта (снимка нет), после эффекта —
// питомец и строка по его снимку. Ядро приходит через onCore; заглушку рисует сайт рядом с контейнером, не внутри.
export function Corner({ progress }) {
  const [core, setCore] = useState(null);
  const pet = usePetState(core);
  return (
    <>
      <PetCompanion namespace="mysite" className="pet" progress={progress} onCore={setCore} />
      {pet ? <p>{pet.name.display}: {pet.treat === 'ready' ? 'можно угостить' : 'рядом'}</p> : <p>Питомец появится после загрузки страницы.</p>}
    </>
  );
}
