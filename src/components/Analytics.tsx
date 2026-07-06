/**
 * Analytics loader (Req 19.4, 19.8).
 *
 * Injects the GA4 (`gtag.js`) bootstrap and/or the PostHog browser snippet, but
 * ONLY when the corresponding public env keys are present at build time. With
 * no keys set this renders `null`, so a store with analytics unconfigured ships
 * zero third-party scripts and the build still compiles.
 *
 * Scripts load with the `afterInteractive` strategy so they never block the
 * initial render or Core Web Vitals; failures to load are inert because
 * `trackEvent` (see `@/lib/analytics`) no-ops whenever a provider global is
 * absent (Req 19.8).
 *
 * The referenced origins (googletagmanager.com, google-analytics.com,
 * *.posthog.com) are already allowlisted in the CSP (see
 * `server/security/headers.ts`).
 */

import Script from 'next/script';

const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID?.trim() ?? '';
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? '';
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ?? 'https://us.i.posthog.com';

function Ga4Scripts({ id }: { id: string }) {
  return (
    <>
      <Script
        id="ga4-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`}
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${id}');`}
      </Script>
    </>
  );
}

function PostHogScript({ apiKey, host }: { apiKey: string; host: string }) {
  return (
    <Script id="posthog-init" strategy="afterInteractive">
      {`!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('${apiKey}',{api_host:'${host}'});`}
    </Script>
  );
}

/**
 * Render whatever analytics bootstraps are configured. Returns `null` when no
 * provider keys are set so nothing is injected (Req 19.8, graceful degradation).
 */
export function Analytics() {
  const hasGa4 = GA4_ID.length > 0;
  const hasPostHog = POSTHOG_KEY.length > 0;

  if (!hasGa4 && !hasPostHog) return null;

  return (
    <>
      {hasGa4 && <Ga4Scripts id={GA4_ID} />}
      {hasPostHog && <PostHogScript apiKey={POSTHOG_KEY} host={POSTHOG_HOST} />}
    </>
  );
}
