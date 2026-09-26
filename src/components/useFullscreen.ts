import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Fullscreen state for one element, using the standard Fullscreen API directly (no vendor prefixes,
 * no iOS fallback — iPhone isn't a target for this). `isFullscreen` follows the document's own
 * `fullscreenchange` event rather than being set by `toggle`, so it stays correct when the user leaves
 * with Esc or the browser's own controls, not just via our button.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement !== null && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [ref]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      // A refused request (no user gesture, blocked by policy) just leaves the page as it was.
      ref.current?.requestFullscreen().catch(() => {});
    }
  }, [ref]);

  return { isFullscreen, toggle };
}
