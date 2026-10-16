import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { Corner } from './Corner.jsx';

let marks = 0; // знаки за занятия — считает сайт
const progress = () => ({ marks, today: marks, limit: 3 });

// Разметка сервера (prerender.mjs) — та же, что первый клиентский рендер: гидратация без расхождений.
hydrateRoot(
  document.getElementById('root'),
  <StrictMode>
    <Corner progress={progress} />
  </StrictMode>,
);
