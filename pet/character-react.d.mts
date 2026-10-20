// Типы входа pet-companion/character-react (pet/character-react.mjs; README, «Персонаж: минимальный режим»). Только
// описания; нужны типы React проекта (@types/react 18.3 или 19).

import type { ReactElement } from 'react';
import type { Character, CharacterDefinition, CharacterSnapshot } from './character.mjs';
import type { CharacterKit, CharacterView } from './character-web.mjs';

/**
 * Свойства `<Character>`. Настройки подключения — `character`, `kit`, `watchTyping`: их смена отключает прежний вид и
 * подключает новый. `name` — начальное имя, его смена — команда `setName` без пересоздания. Функции продукта — `label`,
 * `onActivate`, `onCore`: вызываются последние переданные. Других свойств нет: детей контейнера рисует библиотека.
 */
export interface CharacterProps {
  character: CharacterDefinition;
  kit: CharacterKit;
  name?: string;
  label?: string | ((state: CharacterSnapshot) => string);
  onActivate?: ((view: CharacterView) => void) | null;
  watchTyping?: boolean;
  /** Экземпляр после подключения; `null` — до отключения, при отказе и после постороннего отключения. */
  onCore?: ((core: Character | null) => void) | null;
  className?: string;
}

/** Персонаж в контейнере: пустой `<div>` на сервере и при гидратации, персонаж — после клиентского эффекта. */
export declare function Character(props: CharacterProps): ReactElement;

/** Снимок экземпляра для React: `null` — нет экземпляра, сервер и гидратация, экземпляр отключён. */
export declare function useCharacterState(core: Character | null): CharacterSnapshot | null;
