import { LANDING_ACQUISITIONS, LANDING_EVENTS, type LandingAcquisition, type LandingAudience, type LandingEvent, type LandingEventPayload, type LandingPlacement } from './landingEvents';

const STORAGE_KEY = 'videoq.landing.student-v1';
const VISIT_TTL = 30 * 60_000;
type Visit = { audience: LandingAudience; acquisition: LandingAcquisition; seen: LandingEvent[]; updated: number };

export function getLandingAudience(search = window.location.search): LandingAudience {
  const value = new URLSearchParams(search).get('audience');
  return value === 'school' || value === 'training' ? value : 'student';
}

export function getLandingAcquisition(search = window.location.search): LandingAcquisition {
  const params = new URLSearchParams(search);
  if (params.get('utm_source') !== 'x') return 'unattributed';
  if (params.get('utm_medium') === 'paid_social'
    && params.get('utm_campaign') === 'student_demo_test'
    && params.get('utm_content') === 'demo15_search') return 'x_paid_demo15_search';
  if (params.get('utm_medium') === 'organic_social'
    && params.get('utm_campaign') === 'launch'
    && ['intro', 'howto', 'usecase'].includes(params.get('utm_content') ?? '')) return 'x_organic_launch';
  return 'unattributed';
}

function enabled() {
  const privacy = navigator as Navigator & { globalPrivacyControl?: boolean };
  return import.meta.env.PROD && window.location.hostname === 'videoq.jp'
    && navigator.doNotTrack !== '1' && privacy.globalPrivacyControl !== true;
}

function readVisit(): Visit | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const data = JSON.parse(raw) as Partial<Visit>;
  if (!data || !Array.isArray(data.seen) || !data.seen.every(item => LANDING_EVENTS.includes(item))
    || typeof data.updated !== 'number' || Date.now() - data.updated > VISIT_TTL
    || !['general', 'school', 'training', 'student'].includes(data.audience ?? '')) return null;
  const acquisition = LANDING_ACQUISITIONS.find(source => source === data.acquisition) ?? 'unattributed';
  return { audience: data.audience!, acquisition, seen: data.seen, updated: data.updated };
}

export function startLandingVisit() {
  if (!enabled()) return;
  try {
    if (!readVisit()) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        audience: getLandingAudience(), acquisition: getLandingAcquisition(), seen: [], updated: Date.now(),
      }));
    }
    trackLandingEvent('landing_view');
  } catch { /* Storage may be blocked; the product remains usable. */ }
}

export function trackLandingEvent(event: LandingEvent, placement: LandingPlacement = 'none') {
  if (!enabled()) return;
  try {
    const visit = readVisit();
    if (!visit || visit.seen.includes(event)) return;
    const payload: LandingEventPayload = {
      event, placement, audience: visit.audience, acquisition: visit.acquisition,
      locale: /^\/en(?:\/|$)/.test(window.location.pathname) ? 'en' : 'ja',
    };
    // Once per stage per tab visit, including React StrictMode and repeated clicks.
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...visit, seen: [...visit.seen, event], updated: Date.now() }));
    void fetch('/__events/landing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer',
    }).catch(() => { /* Best-effort measurement must never interrupt navigation. */ });
  } catch { /* No analytics failure may affect signup, playback, or chat. */ }
}
