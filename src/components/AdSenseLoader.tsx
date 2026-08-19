import { useEffect } from 'react';
import { ADS_ENABLED, ADSENSE_CLIENT_ID } from '../lib/ads/adsenseEnv';

const SCRIPT_MARKER_ATTR = 'data-adsbygoogle-loader';

/** Injects Google's adsbygoogle.js once, only when ad env vars are configured. Mount this exactly
 *  once near the app root — AdRail instances assume the script is already loading and just push
 *  their own slot. No-op entirely when ADS_ENABLED is false (see adsenseEnv.ts). */
export function AdSenseLoader() {
  useEffect(() => {
    if (!ADS_ENABLED) return;
    if (document.querySelector(`script[${SCRIPT_MARKER_ATTR}]`)) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
    script.crossOrigin = 'anonymous';
    script.setAttribute(SCRIPT_MARKER_ATTR, 'true');
    document.head.appendChild(script);
  }, []);

  return null;
}
