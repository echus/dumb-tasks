// Icons for the app's own controls (tasks use emoji).
import arrow from '@phosphor-icons/core/assets/bold/arrow-right-bold.svg?raw';
import arrowDown from '@phosphor-icons/core/assets/bold/arrow-down-bold.svg?raw';
import dots from '@phosphor-icons/core/assets/bold/dots-three-bold.svg?raw';
import type { Bucket } from '../types';

// Bold, not fill: Phosphor's filled check is a solid box with the tick cut out
export { default as check } from '@phosphor-icons/core/assets/bold/check-bold.svg?raw';
export { default as plus } from '@phosphor-icons/core/assets/bold/plus-bold.svg?raw';
export { default as x } from '@phosphor-icons/core/assets/bold/x-bold.svg?raw';
export { default as calendarX } from '@phosphor-icons/core/assets/bold/calendar-x-bold.svg?raw';
export { default as sun } from '@phosphor-icons/core/assets/fill/sun-fill.svg?raw';
export { default as moon } from '@phosphor-icons/core/assets/fill/moon-fill.svg?raw';
export { default as undo } from '@phosphor-icons/core/assets/bold/arrow-u-up-left-bold.svg?raw';
export { default as sync } from '@phosphor-icons/core/assets/bold/arrows-clockwise-bold.svg?raw';
export { default as redo } from '@phosphor-icons/core/assets/bold/arrow-u-up-right-bold.svg?raw';
export { default as download } from '@phosphor-icons/core/assets/bold/download-simple-bold.svg?raw';
export { default as drive } from '@phosphor-icons/core/assets/bold/google-drive-logo-bold.svg?raw';
export { default as server } from '@phosphor-icons/core/assets/bold/hard-drives-bold.svg?raw';
export { default as enter } from '@phosphor-icons/core/assets/bold/arrow-elbow-down-left-bold.svg?raw';

// Phosphor's arrow-right with the shaft stretched, so it's 1.5× as wide
const longArrow =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 256" fill="currentColor"><path d="M352.49,136.49l-72,72a12,12,0,0,1-17-17L315,140H40a12,12,0,0,1,0-24H315L263.51,64.48a12,12,0,0,1,17-17l72,72A12,12,0,0,1,352.49,136.49Z"/></svg>';

// Today is an arrow down (here, now); Week and Month point onwards, Month's longer; Later is "..."
export const bucketIcons: Record<Bucket, { svg: string; widthRatio?: number }> = {
  today: { svg: arrowDown },
  week: { svg: arrow },
  month: { svg: longArrow, widthRatio: 1.5 },
  icebox: { svg: dots },
};
