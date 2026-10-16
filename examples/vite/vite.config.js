// Сборка примера (Vite 8): base './' — dist/ работает под любым вложенным адресом сайта. assetsInlineLimit: 0 — стили
// пакета остаются файлами: Vite встраивает ресурсы меньше 4 КБ как data: (pet-base.css — 4 053 байта), а строгий CSP
// (style-src 'self') запрещает стили data:. Без строгого CSP настройка не нужна.
export default {
  base: './',
  build: { assetsInlineLimit: 0 },
};
