import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { Corner } from './Corner.jsx';

// Серверный рендер: пустой контейнер питомца и заглушка сайта — без браузера, хранилища и побочных действий.
export const render = () =>
  renderToString(
    <StrictMode>
      <Corner progress={() => ({ marks: 0, today: 0, limit: 3 })} />
    </StrictMode>,
  );
