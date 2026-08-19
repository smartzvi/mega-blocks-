import { useEffect, useRef } from 'react';
import { ADS_ENABLED, ADSENSE_CLIENT_ID, ADSENSE_SIDE_RAIL_SLOT } from '../lib/ads/adsenseEnv';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** One vertical "skyscraper" ad slot for the page margin. Renders nothing until real AdSense IDs
 *  are configured (see adsenseEnv.ts) — until then this is exactly the empty space that's there
 *  today. Hidden below the lg breakpoint: there's no room for side rails on the mobile layout. */
export function AdRail({ side }: { side: 'left' | 'right' }) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!ADS_ENABLED || pushedRef.current) return;
    pushedRef.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense not finished loading yet or blocked by the browser — nothing actionable to do here.
    }
  }, []);

  if (!ADS_ENABLED) return null;

  return (
    <div className="hidden w-[160px] shrink-0 lg:block" aria-label={`${side} advertisement`}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={ADSENSE_SIDE_RAIL_SLOT}
        data-ad-format="vertical"
        data-full-width-responsive="false"
      />
    </div>
  );
}
