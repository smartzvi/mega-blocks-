/**
 * Double-tap detection for the Space key / jump button (which toggles creative flight). Pure: given
 * the time of the previous tap (or null) and this tap's time, says whether this one completes a
 * double-tap and what to remember next. A double-tap is consumed — a third quick tap starts a new
 * pair instead of counting as another double — so it can't flicker the mode on and off.
 */
export const DOUBLE_TAP_WINDOW_MS = 300;

export function detectDoubleTap(previousTap: number | null, now: number, windowMs = DOUBLE_TAP_WINDOW_MS): { isDouble: boolean; next: number | null } {
  if (previousTap !== null && now - previousTap <= windowMs) return { isDouble: true, next: null };
  return { isDouble: false, next: now };
}
