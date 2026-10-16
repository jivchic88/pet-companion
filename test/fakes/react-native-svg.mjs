// Только проверки (test/native-*.test.mjs): подмена пакета react-native-svg загрузчиком Node (registerHooks). Примитивы —
// имена тегов SVG: рисунок набора, отрисованный react-dom/server (renderToStaticMarkup), даёт настоящую разметку SVG с теми
// же атрибутами (strokeWidth → stroke-width), — так проверки видят геометрию, позу, облик и аксессуар без устройства.
// Корневой Svg ничего не монтирует: записывает свои свойства (с детьми — рисунком набора) в записи своего экрана по
// testID (test/fakes/expo-screen.mjs) и возвращает null — React DOM в Node не создаёт элементов. Это не react-native-svg.
import { useRecord } from './expo-screen.mjs';

export const G = 'g';
export const Path = 'path';
export const Circle = 'circle';
export const Ellipse = 'ellipse';
export const Rect = 'rect';
export const Defs = 'defs';
export const LinearGradient = 'linearGradient';
export const RadialGradient = 'radialGradient';
export const Stop = 'stop';
export const ClipPath = 'clipPath';
export const Pattern = 'pattern';

export default function Svg(props) {
  useRecord('Svg', props);
  return null;
}
