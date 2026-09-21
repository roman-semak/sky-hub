import airplaneInFlight from '@phosphor-icons/core/assets/fill/airplane-in-flight-fill.svg';
import globe from '@phosphor-icons/core/assets/fill/globe-hemisphere-west-fill.svg';
import radioactive from '@phosphor-icons/core/assets/fill/radioactive-fill.svg';
import arrowLeft from '@phosphor-icons/core/assets/regular/arrow-left.svg';
import arrowUpRight from '@phosphor-icons/core/assets/regular/arrow-up-right.svg';
import bell from '@phosphor-icons/core/assets/regular/bell.svg';
import bellRinging from '@phosphor-icons/core/assets/regular/bell-ringing.svg';
import bookmark from '@phosphor-icons/core/assets/regular/bookmark-simple.svg';
import caretUpDown from '@phosphor-icons/core/assets/regular/caret-up-down.svg';
import clock from '@phosphor-icons/core/assets/regular/clock-counter-clockwise.svg';
import crosshair from '@phosphor-icons/core/assets/regular/crosshair.svg';
import globeLine from '@phosphor-icons/core/assets/regular/globe-hemisphere-west.svg';
import magnifier from '@phosphor-icons/core/assets/regular/magnifying-glass.svg';
import minus from '@phosphor-icons/core/assets/regular/minus.svg';
import moon from '@phosphor-icons/core/assets/regular/moon.svg';
import plus from '@phosphor-icons/core/assets/regular/plus.svg';
import share from '@phosphor-icons/core/assets/regular/share-network.svg';
import sliders from '@phosphor-icons/core/assets/regular/sliders-horizontal.svg';
import stack from '@phosphor-icons/core/assets/regular/stack-simple.svg';
import sun from '@phosphor-icons/core/assets/regular/sun.svg';
import user from '@phosphor-icons/core/assets/regular/user.svg';
import xCircle from '@phosphor-icons/core/assets/regular/x-circle.svg';

/** Phosphor icons used by the UI, inlined at build time (no CDN, no icon font). */
export const ICONS = {
  'airplane-in-flight': airplaneInFlight,
  'arrow-left': arrowLeft,
  'arrow-up-right': arrowUpRight,
  bell,
  'bell-ringing': bellRinging,
  'bookmark-simple': bookmark,
  'caret-up-down': caretUpDown,
  'clock-counter-clockwise': clock,
  crosshair,
  globe,
  'globe-line': globeLine,
  'magnifying-glass': magnifier,
  minus,
  moon,
  plus,
  radioactive,
  'share-network': share,
  'sliders-horizontal': sliders,
  'stack-simple': stack,
  sun,
  user,
  'x-circle': xCircle,
} as const;

export type IconName = keyof typeof ICONS;
