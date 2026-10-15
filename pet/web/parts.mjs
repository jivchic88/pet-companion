// Веб: общие мелочи отображения (PL07) — для общей оболочки (web/shell.mjs) и обоих способов показа: legacy-места
// (web/legacy/places.mjs) и контейнер (web/view.mjs). Без состояния: значки, экранирование, перехват ошибок, разметка.

// Ошибка внутри обработчика отображения сайту не мешает: «Питомец: …» в консоли.
export const safe =
  (fn) =>
  (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      console.warn('Питомец:', error);
      return undefined;
    }
  };

export const esc = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// Рисунок, которым управляет отображение (поза, облик, движение — data-*): у svg набора — отметка data-cat-managed.
export const managed = (markup) => markup.replace('<svg ', '<svg data-cat-managed ');

export function fragment(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content;
}

// Видимая кнопка: у скрытых (display: none) нет коробки.
export const shown = (element) => Boolean(element?.getClientRects().length);

export const PAW_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="currentColor"><ellipse cx="12" cy="16" rx="4.6" ry="3.8"/><circle cx="6.4" cy="10.6" r="2.1"/><circle cx="9.8" cy="6.9" r="2.1"/><circle cx="14.2" cy="6.9" r="2.1"/><circle cx="17.6" cy="10.6" r="2.1"/></g></svg>';
export const FOLD_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// «Обустроить уголок» — домик.
export const ROOM_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11.2 12 4.5l8.5 6.7"/><path d="M6 9.6V19.5h12V9.6"/><path d="M9.6 19.5v-4a2.4 2.4 0 0 1 4.8 0v4"/></g></svg>';
// Лакомство дня — миска.
export const BOWL_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="10" rx="8.5" ry="2.4"/><path d="M3.5 10.4C4.3 15.6 7.6 18.5 12 18.5s7.7-2.9 8.5-8.1M8 18.2l-.6 1.8h9.2l-.6-1.8"/></g></svg>';

// Кнопка вызова — лапка без мордашки, точки и движения; подпись — где помещается.
export const CALL = 'Позвать питомца';

// Поле ввода текста (вне уголка — ввод страницы: тишина typing).
export const TEXT_INPUT = 'textarea, select, [contenteditable="true"], input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"], [type="reset"])';
