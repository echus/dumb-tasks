import { cubicOut } from 'svelte/easing';
import { crossfade } from 'svelte/transition';

// A task ticked off glides from its spot down to the done rows, and one unticked glides back.
// Two pairs, so a move between buckets (out of one list, into another) doesn't glide - the
// drag has its own landing.

export const reduceMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const options = {
  duration: (distance: number) => (reduceMotion() ? 0 : Math.min(450, 200 + Math.sqrt(distance) * 12)),
  easing: cubicOut,
  fallback: () => ({ duration: 0 }), // removed or added any other way: no motion
};

const [sendDone, receiveDone] = crossfade(options);
const [sendUndone, receiveUndone] = crossfade(options);

type Glide = typeof sendDone;

// Lifted above the rows it passes, with the list's own background, so their text doesn't
// show through it
const LIFTED = 'position: relative; z-index: 1; background: var(--surface)';

/** Adds to a transition's CSS. Svelte stops reading it at an empty part, as from a ";;". */
const withCss = (css: string | undefined, extra: string) =>
  [css?.trim().replace(/;$/, ''), extra].filter(Boolean).join('; ');

/** A row gliding in over the others. */
function lifted(glide: Glide): Glide {
  return (node: Element, params: Parameters<Glide>[1]) => {
    const made = glide(node, params);
    return () => {
      const config = made();
      if (!config.duration) return config;
      return { ...config, css: (t: number, u: number) => withCss(config.css?.(t, u), LIFTED) };
    };
  };
}

/**
 * A row gliding out, closing its gap as it goes, so the rows below slide up rather than jump
 * once it has gone.
 */
function closingGap(glide: Glide): Glide {
  return (node: Element, params: Parameters<Glide>[1]) => {
    const height = (node as HTMLElement).offsetHeight;
    const made = glide(node, params);
    return () => {
      const config = made();
      if (!config.duration) return config;
      return {
        ...config,
        css: (t: number, u: number) =>
          withCss(config.css?.(t, u), `height: ${t * height}px; overflow: hidden; ${LIFTED}`),
      };
    };
  };
}

export const doneGlides = { out: closingGap(sendDone), in: lifted(receiveDone) };
export const undoneGlides = { out: closingGap(sendUndone), in: lifted(receiveUndone) };
