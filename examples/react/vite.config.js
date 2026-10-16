// Сборка примера React (Vite 8, JSX без плагина): base './' — клиент работает под любым вложенным адресом;
// assetsInlineLimit: 0 — стили пакета файлами (для строгого CSP; без него настройка не нужна).
export default {
  base: './',
  build: { assetsInlineLimit: 0 },
};
