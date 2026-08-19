/** Google AdSense publisher/slot IDs from the build environment. Both undefined in local dev and
 *  CI unless explicitly set — intentional, not a misconfiguration: it's what lets the app run and
 *  look exactly as it does today (no ad boxes, no layout change) until the user has actually been
 *  approved for AdSense and supplies real IDs. See DEPLOYMENT.md. */
export const ADSENSE_CLIENT_ID = import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined;
export const ADSENSE_SIDE_RAIL_SLOT = import.meta.env.VITE_ADSENSE_SIDE_RAIL_SLOT as string | undefined;

export const ADS_ENABLED = Boolean(ADSENSE_CLIENT_ID && ADSENSE_SIDE_RAIL_SLOT);
