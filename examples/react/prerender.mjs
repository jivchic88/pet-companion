// Разметка сервера в страницу клиента (пример React; README, «React и серверный рендер»): после
//   npx vite build --outDir dist/client && npx vite build --ssr src/server.jsx --outDir dist/server
// node prerender.mjs подставляет renderToString в dist/client/index.html. Сервер сайта отдаёт только dist/client/.
import { readFile, writeFile } from 'node:fs/promises';
import { render } from './dist/server/server.js';

const page = new URL('./dist/client/index.html', import.meta.url);
const html = await readFile(page, 'utf8');
if (!html.includes('<!--app-->')) throw new Error('В dist/client/index.html нет места <!--app-->');
await writeFile(page, html.replace('<!--app-->', render()));
console.log('Разметка сервера — в dist/client/index.html');
